"""Comprehensive tests for the Flask error handler and session teardown mechanism.

These tests verify that:
1. Flask's @app.errorhandler registry correctly converts exceptions to HTTP responses
   with the rich JSON envelope (correlationId, code).
2. Flask passes the original exception to teardown_request even after an error handler
   returns a response, so the session is rolled back automatically.
3. Successful requests result in session commit.
4. All exception types produce the expected HTTP status codes and response shapes.
"""

import json

import pytest
from flask import Flask
from flask.testing import FlaskClient
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.services.container import ServiceContainer

# ---------------------------------------------------------------------------
# Helpers: create a test blueprint with endpoints that raise each exception
# ---------------------------------------------------------------------------

def _register_error_trigger_routes(app: Flask) -> None:
    """Register test routes that deliberately raise each exception type.

    This simulates what real API endpoints do: raise an exception and let
    Flask's error handler registry convert it to an HTTP response.
    """
    from flask import Blueprint

    from app.exceptions import (
        AuthenticationException,
        AuthorizationException,
        BusinessLogicException,
        CapacityExceededException,
        DependencyException,
        InsufficientQuantityException,
        InvalidOperationException,
        RecordNotFoundException,
        ResourceConflictException,
        RouteNotAvailableException,
        ValidationException,
    )

    trigger_bp = Blueprint("error_triggers", __name__, url_prefix="/test-errors")

    @trigger_bp.route("/record-not-found")
    def trigger_record_not_found():
        raise RecordNotFoundException("Part", "XXXX")

    @trigger_bp.route("/validation-exception")
    def trigger_validation_exception():
        raise ValidationException("Field X is invalid")

    @trigger_bp.route("/authentication-exception")
    def trigger_authentication_exception():
        raise AuthenticationException("Token expired")

    @trigger_bp.route("/authorization-exception")
    def trigger_authorization_exception():
        raise AuthorizationException("Insufficient permissions")

    @trigger_bp.route("/dependency-exception")
    def trigger_dependency_exception():
        raise DependencyException("Type", 1, "it has 5 parts")

    @trigger_bp.route("/resource-conflict")
    def trigger_resource_conflict():
        raise ResourceConflictException("Seller", "ACME")

    @trigger_bp.route("/insufficient-quantity")
    def trigger_insufficient_quantity():
        raise InsufficientQuantityException(10, 3, "Box 1 Loc 2")

    @trigger_bp.route("/capacity-exceeded")
    def trigger_capacity_exceeded():
        raise CapacityExceededException("Box", 7)

    @trigger_bp.route("/invalid-operation")
    def trigger_invalid_operation():
        raise InvalidOperationException("delete part", "it has stock")

    @trigger_bp.route("/route-not-available")
    def trigger_route_not_available():
        raise RouteNotAvailableException()

    @trigger_bp.route("/business-logic-generic")
    def trigger_business_logic_generic():
        raise BusinessLogicException("Something failed", "CUSTOM_CODE")

    @trigger_bp.route("/generic-exception")
    def trigger_generic_exception():
        raise RuntimeError("Unexpected kaboom")

    @trigger_bp.route("/bad-request", methods=["POST"])
    def trigger_bad_request():
        """Trigger BadRequest by forcing JSON parse on a non-JSON body."""
        from flask import request

        # force=True makes Flask attempt JSON parsing regardless of content
        # type; a non-JSON body will raise BadRequest.
        request.get_json(force=True)
        return {"ok": True}

    @trigger_bp.route("/pydantic-validation-error")
    def trigger_pydantic_validation_error():
        """Raise a Pydantic ValidationError directly."""
        from pydantic import BaseModel, Field

        class _StrictModel(BaseModel):
            name: str = Field(..., min_length=1)
            age: int = Field(..., gt=0)

        # Passing invalid data triggers ValidationError
        _StrictModel.model_validate({"name": "", "age": -1})
        return {"ok": True}

    @trigger_bp.route("/integrity-error-duplicate")
    def trigger_integrity_error_duplicate():
        """Raise an IntegrityError that looks like a duplicate key violation."""
        from sqlalchemy.exc import IntegrityError

        raise IntegrityError(
            "INSERT INTO types ...",
            params={},
            orig=Exception("duplicate key value violates unique constraint"),
        )

    @trigger_bp.route("/integrity-error-foreign-key")
    def trigger_integrity_error_foreign_key():
        """Raise an IntegrityError that looks like a foreign key violation."""
        from sqlalchemy.exc import IntegrityError

        raise IntegrityError(
            "INSERT INTO parts ...",
            params={},
            orig=Exception("FOREIGN KEY constraint failed"),
        )

    @trigger_bp.route("/success")
    def trigger_success():
        return {"ok": True}

    app.register_blueprint(trigger_bp)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def error_client(app: Flask) -> FlaskClient:
    """Flask test client with error-trigger routes registered."""
    _register_error_trigger_routes(app)
    return app.test_client()


# ---------------------------------------------------------------------------
# Test: Flask error handlers produce correct HTTP status codes
# ---------------------------------------------------------------------------

class TestFlaskErrorHandlerStatusCodes:
    """Verify each exception type maps to the expected HTTP status code."""

    def test_record_not_found_returns_404(self, error_client: FlaskClient):
        resp = error_client.get("/test-errors/record-not-found")
        assert resp.status_code == 404

    def test_validation_exception_returns_400(self, error_client: FlaskClient):
        resp = error_client.get("/test-errors/validation-exception")
        assert resp.status_code == 400

    def test_authentication_exception_returns_401(self, error_client: FlaskClient):
        resp = error_client.get("/test-errors/authentication-exception")
        assert resp.status_code == 401

    def test_authorization_exception_returns_403(self, error_client: FlaskClient):
        resp = error_client.get("/test-errors/authorization-exception")
        assert resp.status_code == 403

    def test_dependency_exception_returns_409(self, error_client: FlaskClient):
        resp = error_client.get("/test-errors/dependency-exception")
        assert resp.status_code == 409

    def test_resource_conflict_returns_409(self, error_client: FlaskClient):
        resp = error_client.get("/test-errors/resource-conflict")
        assert resp.status_code == 409

    def test_insufficient_quantity_returns_409(self, error_client: FlaskClient):
        resp = error_client.get("/test-errors/insufficient-quantity")
        assert resp.status_code == 409

    def test_capacity_exceeded_returns_409(self, error_client: FlaskClient):
        resp = error_client.get("/test-errors/capacity-exceeded")
        assert resp.status_code == 409

    def test_invalid_operation_returns_409(self, error_client: FlaskClient):
        resp = error_client.get("/test-errors/invalid-operation")
        assert resp.status_code == 409

    def test_route_not_available_returns_400(self, error_client: FlaskClient):
        resp = error_client.get("/test-errors/route-not-available")
        assert resp.status_code == 400

    def test_business_logic_generic_returns_400(self, error_client: FlaskClient):
        resp = error_client.get("/test-errors/business-logic-generic")
        assert resp.status_code == 400

    def test_generic_exception_returns_500(self, error_client: FlaskClient):
        resp = error_client.get("/test-errors/generic-exception")
        assert resp.status_code == 500

    def test_werkzeug_404_returns_404(self, error_client: FlaskClient):
        resp = error_client.get("/no-such-route-at-all")
        assert resp.status_code == 404

    def test_werkzeug_405_returns_405(self, error_client: FlaskClient):
        resp = error_client.post("/test-errors/success")
        assert resp.status_code == 405

    def test_success_returns_200(self, error_client: FlaskClient):
        resp = error_client.get("/test-errors/success")
        assert resp.status_code == 200

    # -- Framework-level exception handlers --

    def test_bad_request_returns_400(self, error_client: FlaskClient):
        resp = error_client.post(
            "/test-errors/bad-request",
            data="this is not json",
            content_type="application/json",
        )
        assert resp.status_code == 400

    def test_pydantic_validation_error_returns_400(self, error_client: FlaskClient):
        resp = error_client.get("/test-errors/pydantic-validation-error")
        assert resp.status_code == 400

    def test_integrity_error_duplicate_returns_409(self, error_client: FlaskClient):
        resp = error_client.get("/test-errors/integrity-error-duplicate")
        assert resp.status_code == 409

    def test_integrity_error_foreign_key_returns_400(self, error_client: FlaskClient):
        resp = error_client.get("/test-errors/integrity-error-foreign-key")
        assert resp.status_code == 400


# ---------------------------------------------------------------------------
# Test: Rich JSON envelope shape (error, details, code, correlationId)
# ---------------------------------------------------------------------------

class TestFlaskErrorHandlerResponseEnvelope:
    """Verify that error responses carry the rich JSON envelope."""

    def test_business_exception_has_code_field(self, error_client: FlaskClient):
        resp = error_client.get("/test-errors/record-not-found")
        data = json.loads(resp.data)
        assert "error" in data
        assert "details" in data
        assert data["code"] == "RECORD_NOT_FOUND"

    def test_business_exception_has_message_in_details(self, error_client: FlaskClient):
        resp = error_client.get("/test-errors/record-not-found")
        data = json.loads(resp.data)
        assert "message" in data["details"]

    def test_generic_exception_has_no_code(self, error_client: FlaskClient):
        resp = error_client.get("/test-errors/generic-exception")
        data = json.loads(resp.data)
        assert "error" in data
        assert "details" in data
        assert "code" not in data

    def test_werkzeug_404_has_envelope(self, error_client: FlaskClient):
        resp = error_client.get("/no-such-route-at-all")
        data = json.loads(resp.data)
        assert data["error"] == "Resource not found"
        assert "details" in data

    def test_werkzeug_405_has_envelope(self, error_client: FlaskClient):
        resp = error_client.post("/test-errors/success")
        data = json.loads(resp.data)
        assert data["error"] == "Method not allowed"
        assert "details" in data

    def test_validation_exception_envelope(self, error_client: FlaskClient):
        resp = error_client.get("/test-errors/validation-exception")
        data = json.loads(resp.data)
        assert data["code"] == "VALIDATION_FAILED"
        assert "Field X is invalid" in data["error"]

    def test_invalid_operation_envelope(self, error_client: FlaskClient):
        resp = error_client.get("/test-errors/invalid-operation")
        data = json.loads(resp.data)
        assert data["code"] == "INVALID_OPERATION"
        assert "details" in data

    def test_authentication_exception_envelope(self, error_client: FlaskClient):
        resp = error_client.get("/test-errors/authentication-exception")
        data = json.loads(resp.data)
        assert data["code"] == "AUTHENTICATION_REQUIRED"

    def test_authorization_exception_envelope(self, error_client: FlaskClient):
        resp = error_client.get("/test-errors/authorization-exception")
        data = json.loads(resp.data)
        assert data["code"] == "AUTHORIZATION_FAILED"

    # -- Framework-level exception envelopes --

    def test_bad_request_envelope(self, error_client: FlaskClient):
        resp = error_client.post(
            "/test-errors/bad-request",
            data="this is not json",
            content_type="application/json",
        )
        data = json.loads(resp.data)
        assert data["error"] == "Invalid JSON"
        assert "details" in data
        assert "code" not in data

    def test_pydantic_validation_error_envelope(self, error_client: FlaskClient):
        resp = error_client.get("/test-errors/pydantic-validation-error")
        data = json.loads(resp.data)
        assert data["error"] == "Validation failed"
        assert "errors" in data["details"]
        assert isinstance(data["details"]["errors"], list)
        assert len(data["details"]["errors"]) > 0
        # Each error entry should have field and message keys
        for err in data["details"]["errors"]:
            assert "field" in err
            assert "message" in err
        assert "code" not in data

    def test_integrity_error_duplicate_envelope(self, error_client: FlaskClient):
        resp = error_client.get("/test-errors/integrity-error-duplicate")
        data = json.loads(resp.data)
        assert data["error"] == "Resource already exists"
        assert "details" in data
        assert "code" not in data

    def test_integrity_error_foreign_key_envelope(self, error_client: FlaskClient):
        resp = error_client.get("/test-errors/integrity-error-foreign-key")
        data = json.loads(resp.data)
        assert data["error"] == "Invalid reference"
        assert "details" in data
        assert "code" not in data


# ---------------------------------------------------------------------------
# Test: Session teardown rollback mechanism
# ---------------------------------------------------------------------------

class TestSessionTeardownRollback:
    """Verify that the simplified teardown correctly rolls back on error
    and commits on success."""

    def test_exception_triggers_rollback_via_teardown(
        self, app: Flask, session: Session, container: ServiceContainer
    ):
        """When an endpoint raises an exception caught by an error handler,
        teardown_request receives exc != None and rolls back the session.
        Any writes made before the exception should be discarded."""
        from flask import Blueprint

        from app.exceptions import InvalidOperationException

        rollback_bp = Blueprint("rollback_test", __name__, url_prefix="/rollback-test")

        @rollback_bp.route("/write-then-fail", methods=["POST"])
        def write_then_fail():
            db = container.db_session()
            # Insert a row that should be rolled back
            db.execute(
                text("INSERT INTO types (name) VALUES (:name)"),
                {"name": "__rollback_sentinel__"},
            )
            db.flush()
            raise InvalidOperationException("test", "deliberate failure")

        app.register_blueprint(rollback_bp)
        client = app.test_client()

        # Count types before the failing request
        with app.app_context():
            db = container.db_session()
            before = db.execute(text("SELECT COUNT(*) FROM types")).scalar()
            container.db_session.reset()

        # Make the failing request
        resp = client.post("/rollback-test/write-then-fail")
        assert resp.status_code == 409

        # Verify the sentinel row was rolled back
        with app.app_context():
            db = container.db_session()
            after = db.execute(text("SELECT COUNT(*) FROM types")).scalar()
            sentinel = db.execute(
                text("SELECT COUNT(*) FROM types WHERE name = '__rollback_sentinel__'")
            ).scalar()
            container.db_session.reset()

        assert after == before
        assert sentinel == 0

    def test_successful_request_commits(
        self, app: Flask, session: Session, container: ServiceContainer
    ):
        """When an endpoint succeeds, teardown_request receives exc == None
        and commits the session."""
        from flask import Blueprint

        commit_bp = Blueprint("commit_test", __name__, url_prefix="/commit-test")

        @commit_bp.route("/write-and-succeed", methods=["POST"])
        def write_and_succeed():
            db = container.db_session()
            db.execute(
                text("INSERT INTO types (name) VALUES (:name)"),
                {"name": "__commit_sentinel__"},
            )
            db.flush()
            return {"ok": True}

        app.register_blueprint(commit_bp)
        client = app.test_client()

        # Make the successful request
        resp = client.post("/commit-test/write-and-succeed")
        assert resp.status_code == 200

        # Verify the sentinel row was committed
        with app.app_context():
            db = container.db_session()
            sentinel = db.execute(
                text("SELECT COUNT(*) FROM types WHERE name = '__commit_sentinel__'")
            ).scalar()
            container.db_session.reset()

        assert sentinel == 1

    def test_record_not_found_rolls_back_prior_writes(
        self, app: Flask, session: Session, container: ServiceContainer
    ):
        """RecordNotFoundException also triggers rollback via teardown."""
        from flask import Blueprint

        from app.exceptions import RecordNotFoundException

        rnf_bp = Blueprint("rnf_test", __name__, url_prefix="/rnf-test")

        @rnf_bp.route("/write-then-not-found", methods=["POST"])
        def write_then_not_found():
            db = container.db_session()
            db.execute(
                text("INSERT INTO types (name) VALUES (:name)"),
                {"name": "__rnf_sentinel__"},
            )
            db.flush()
            raise RecordNotFoundException("Part", "ZZZZ")

        app.register_blueprint(rnf_bp)
        client = app.test_client()

        resp = client.post("/rnf-test/write-then-not-found")
        assert resp.status_code == 404

        with app.app_context():
            db = container.db_session()
            sentinel = db.execute(
                text("SELECT COUNT(*) FROM types WHERE name = '__rnf_sentinel__'")
            ).scalar()
            container.db_session.reset()

        assert sentinel == 0


# ---------------------------------------------------------------------------
# Test: Integration - database rollback with actual services
# ---------------------------------------------------------------------------

class TestRollbackIntegration:
    """Integration tests verifying rollback works with actual database operations."""

    def test_failed_part_creation_rollback(
        self, app: Flask, session: Session, container: ServiceContainer
    ):
        """Test that failed part creation is properly rolled back."""
        with app.app_context():
            initial_count = session.execute(text("SELECT COUNT(*) FROM parts")).scalar()

            try:
                session.execute(
                    text(
                        "INSERT INTO parts (id, manufacturer_code, type_id, description) "
                        "VALUES ('TEST', 'TEST123', 999999, 'Test part')"
                    )
                )
                session.flush()
                raise AssertionError("Expected operation to fail")
            except Exception:
                session.rollback()

            final_count = session.execute(text("SELECT COUNT(*) FROM parts")).scalar()
            assert final_count == initial_count

    def test_partial_operation_rollback(
        self, app: Flask, session: Session, container: ServiceContainer
    ):
        """Test that partially completed operations are fully rolled back."""
        part_service = container.part_service()
        inventory_service = container.inventory_service()

        with app.app_context():
            part = part_service.create_part(
                manufacturer_code="ROLLBACK_TEST",
                type_id=1,
                description="Test rollback part",
            )
            session.flush()

            initial_locations_count = session.execute(
                text("SELECT COUNT(*) FROM part_locations")
            ).scalar()

            try:
                inventory_service.add_stock(
                    part_key=part.key,
                    quantity=10,
                    box_number=999,
                    location_number=1,
                )
                raise AssertionError("Expected operation to fail")
            except Exception:
                session.rollback()

                final_locations_count = session.execute(
                    text("SELECT COUNT(*) FROM part_locations")
                ).scalar()
                assert final_locations_count == initial_locations_count

    def test_multiple_operations_full_rollback(
        self, app: Flask, session: Session, container: ServiceContainer
    ):
        """Test that multiple operations in a transaction are all rolled back on failure."""
        part_service = container.part_service()

        with app.app_context():
            initial_part_count = session.execute(text("SELECT COUNT(*) FROM parts")).scalar()

            try:
                _part1 = part_service.create_part(
                    manufacturer_code="MULTI1",
                    type_id=1,
                    description="First part",
                )
                _part2 = part_service.create_part(
                    manufacturer_code="MULTI2",
                    type_id=1,
                    description="Second part",
                )

                session.execute(text("INSERT INTO parts (id) VALUES (NULL)"))
                session.flush()
                raise AssertionError("Expected operation to fail")
            except Exception:
                session.rollback()

                final_part_count = session.execute(text("SELECT COUNT(*) FROM parts")).scalar()
                assert final_part_count == initial_part_count
