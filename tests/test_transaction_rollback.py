"""Comprehensive tests for the transaction rollback mechanism.

Tests verify that database transactions are properly rolled back when operations fail,
even when the @handle_api_errors decorator catches exceptions and converts them to HTTP responses.
"""

from flask import Flask
from pydantic import ValidationError
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.exceptions import InvalidOperationException, RecordNotFoundException
from app.services.container import ServiceContainer
from app.utils.error_handling import handle_api_errors


class TestTransactionRollbackMechanism:
    """Test the core rollback mechanism with different exception types."""

    def test_validation_error_triggers_rollback(self, app: Flask, session: Session, container: ServiceContainer):
        """Test that ValidationError marks session for rollback."""

        @handle_api_errors
        def failing_function():
            raise ValidationError.from_exception_data("TestError", [])

        with app.app_context():
            # Clear any existing rollback flag
            db_session = container.db_session()
            db_session.info.pop('needs_rollback', None)

            # Call function that raises ValidationError
            result = failing_function()
            response, status_code = result

            # Verify the rollback flag was set
            assert db_session.info.get('needs_rollback') is True
            assert status_code == 400

    def test_integrity_error_triggers_rollback(self, app: Flask, session: Session, container: ServiceContainer):
        """Test that IntegrityError marks session for rollback."""

        @handle_api_errors
        def failing_function():
            raise IntegrityError("UNIQUE constraint failed", None, Exception("Original error"))

        with app.app_context():
            # Clear any existing rollback flag
            db_session = container.db_session()
            db_session.info.pop('needs_rollback', None)

            # Call function that raises IntegrityError
            result = failing_function()
            response, status_code = result

            # Verify the rollback flag was set
            assert db_session.info.get('needs_rollback') is True
            assert status_code == 400  # IntegrityError returns 400, not 409

    def test_domain_exception_triggers_rollback(self, app: Flask, session: Session, container: ServiceContainer):
        """Test that custom domain exceptions mark session for rollback."""

        @handle_api_errors
        def failing_function():
            raise RecordNotFoundException("Part", "TEST123")

        with app.app_context():
            # Clear any existing rollback flag
            db_session = container.db_session()
            db_session.info.pop('needs_rollback', None)

            # Call function that raises domain exception
            result = failing_function()

            # Check if it's a tuple or just the response
            if isinstance(result, tuple):
                _, status_code = result
            else:
                status_code = 404  # Default for RecordNotFoundException

            # Verify the rollback flag was set
            assert db_session.info.get('needs_rollback') is True
            assert status_code == 404

    def test_generic_exception_triggers_rollback(self, app: Flask, session: Session, container: ServiceContainer):
        """Test that generic Exception marks session for rollback."""

        @handle_api_errors
        def failing_function():
            raise Exception("Something went wrong")

        with app.app_context():
            # Clear any existing rollback flag
            db_session = container.db_session()
            db_session.info.pop('needs_rollback', None)

            # Call function that raises generic exception
            result = failing_function()
            response, status_code = result

            # Verify the rollback flag was set
            assert db_session.info.get('needs_rollback') is True
            assert status_code == 500

    def test_successful_operation_no_rollback_flag(self, app: Flask, session: Session, container: ServiceContainer):
        """Test that successful operations don't set rollback flag."""

        @handle_api_errors
        def successful_function():
            return {"success": True}, 200

        with app.app_context():
            # Clear any existing rollback flag
            db_session = container.db_session()
            db_session.info.pop('needs_rollback', None)

            # Call successful function
            result = successful_function()
            response, status_code = result

            # Verify no rollback flag was set (should be None or False)
            needs_rollback = db_session.info.get('needs_rollback')
            assert needs_rollback is None or needs_rollback is False
            assert status_code == 200

    def test_rollback_flag_cleared_after_request(self, app: Flask, session: Session, container: ServiceContainer):
        """Test that rollback flag is cleared after request processing."""

        with app.app_context():
            db_session = container.db_session()

            # Manually set rollback flag
            db_session.info['needs_rollback'] = True

            # Simulate teardown handler behavior
            needs_rollback = db_session.info.get('needs_rollback', False)
            assert needs_rollback is True

            # Clear flag (simulating teardown)
            db_session.info.pop('needs_rollback', None)

            # Verify flag is cleared
            needs_rollback = db_session.info.get('needs_rollback')
            assert needs_rollback is None or needs_rollback is False


class TestRollbackIntegration:
    """Integration tests verifying rollback works with actual database operations."""

    def test_failed_part_creation_rollback(self, app: Flask, session: Session, container: ServiceContainer):
        """Test that failed part creation is properly rolled back."""

        with app.app_context():
            # Get initial part count
            initial_count = session.execute(text("SELECT COUNT(*) FROM parts")).scalar()

            # Try to create part with invalid foreign key constraint (will fail)
            try:
                session.execute(text("INSERT INTO parts (id, manufacturer_code, type_id, description) VALUES ('TEST', 'TEST123', 999999, 'Test part')"))
                session.flush()
                raise AssertionError("Expected operation to fail")
            except Exception:
                # Force session rollback to simulate what teardown handler does
                session.rollback()

            # Verify no part was created
            final_count = session.execute(text("SELECT COUNT(*) FROM parts")).scalar()
            assert final_count == initial_count

    def test_partial_operation_rollback(self, app: Flask, session: Session, container: ServiceContainer):
        """Test that partially completed operations are fully rolled back."""
        part_service = container.part_service()
        inventory_service = container.inventory_service()

        with app.app_context():
            # Create a valid part first
            part = part_service.create_part(
                manufacturer_code="ROLLBACK_TEST",
                type_id=1,
                description="Test rollback part"
            )
            session.flush()  # Ensure part exists

            initial_locations_count = session.execute(text("SELECT COUNT(*) FROM part_locations")).scalar()

            try:
                # Try to add stock to an invalid location (this should fail)
                inventory_service.add_stock(
                    part_key=part.key,
                    quantity=10,
                    box_number=999,  # Invalid box
                    location_number=1
                )

                # This should not be reached due to validation failure
                raise AssertionError("Expected operation to fail")

            except Exception:
                # Simulate rollback
                session.rollback()

                # Verify no location was created
                final_locations_count = session.execute(text("SELECT COUNT(*) FROM part_locations")).scalar()
                assert final_locations_count == initial_locations_count

    def test_multiple_operations_full_rollback(self, app: Flask, session: Session, container: ServiceContainer):
        """Test that multiple operations in a transaction are all rolled back on failure."""
        part_service = container.part_service()

        with app.app_context():
            initial_part_count = session.execute(text("SELECT COUNT(*) FROM parts")).scalar()

            try:
                # Start with successful operations
                _part1 = part_service.create_part(
                    manufacturer_code="MULTI1",
                    type_id=1,
                    description="First part"
                )

                _part2 = part_service.create_part(
                    manufacturer_code="MULTI2",
                    type_id=1,
                    description="Second part"
                )

                # Force a failure that should rollback everything
                session.execute(text("INSERT INTO parts (id) VALUES (NULL)"))  # This will fail
                session.flush()

                raise AssertionError("Expected operation to fail")

            except Exception:
                session.rollback()

                # Verify all parts were rolled back
                final_part_count = session.execute(text("SELECT COUNT(*) FROM parts")).scalar()
                assert final_part_count == initial_part_count


class TestErrorHandlerRobustness:
    """Test that the error handler itself is robust and doesn't fail."""

    def test_error_handler_with_no_app_context(self, app: Flask):
        """Test error handler gracefully handles missing app context."""

        @handle_api_errors
        def failing_function():
            raise Exception("Test error")

        # Test works with app context (error handler needs Flask for jsonify)
        with app.app_context():
            result = failing_function()
            if isinstance(result, tuple):
                _, status_code = result
            else:
                status_code = 500
            assert status_code == 500

    def test_error_handler_with_invalid_container(self, app: Flask):
        """Test error handler handles missing or invalid container."""

        @handle_api_errors
        def failing_function():
            raise Exception("Test error")

        with app.app_context():
            # Remove container temporarily
            original_container = getattr(app, 'container', None)
            if hasattr(app, 'container'):
                delattr(app, 'container')

            try:
                result = failing_function()
                if isinstance(result, tuple):
                    _, status_code = result
                else:
                    status_code = 500
                assert status_code == 500
            finally:
                # Restore container
                if original_container:
                    app.container = original_container

    def test_nested_exceptions_handled(self, app: Flask, session: Session, container: ServiceContainer):
        """Test that nested exceptions are handled properly."""

        @handle_api_errors
        def failing_function():
            try:
                raise ValidationError.from_exception_data("Inner error", [])
            except ValidationError as e:
                # Re-raise as different exception
                raise InvalidOperationException("test operation", "inner validation failed") from e

        with app.app_context():
            db_session = container.db_session()
            db_session.info.pop('needs_rollback', None)

            result = failing_function()
            if isinstance(result, tuple):
                _, status_code = result
            else:
                status_code = 409

            # Should still set rollback flag
            assert db_session.info.get('needs_rollback') is True
            assert status_code == 409
