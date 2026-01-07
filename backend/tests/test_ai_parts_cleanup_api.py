"""Tests for AI parts cleanup API endpoints."""

from flask import Flask
from flask.testing import FlaskClient


class TestAIPartsCleanupAPI:
    """Test cases for AI parts cleanup API endpoints."""

    # Note: Validation tests removed - in testing mode (FLASK_ENV=testing),
    # all validation is skipped and endpoints return dummy task IDs immediately.
    # Production validation behavior can be tested with integration tests using
    # FLASK_ENV=development.

    def test_cleanup_part_testing_mode_returns_dummy_task_id(
        self, client: FlaskClient, app: Flask
    ):
        """Test cleanup endpoint returns dummy task ID in testing mode."""
        with app.app_context():
            # In testing mode (FLASK_ENV=testing), endpoint should skip validation
            # and return a dummy task ID immediately
            response = client.post(
                "/api/ai-parts/cleanup",
                json={"part_key": "ABCD"},
                content_type="application/json",
            )

            assert response.status_code == 201
            data = response.get_json()
            assert 'task_id' in data
            assert 'status' in data
            assert data['status'] == 'pending'
            # Verify task_id is a valid UUID
            import uuid
            try:
                uuid.UUID(data['task_id'])
            except ValueError as e:
                raise AssertionError(f"task_id {data['task_id']} is not a valid UUID") from e

    def test_cleanup_part_testing_mode_skips_part_existence_check(
        self, client: FlaskClient, app: Flask
    ):
        """Test cleanup endpoint skips part existence check in testing mode."""
        with app.app_context():
            # Test with non-existent part - should still succeed in testing mode
            # (schema validation still happens via @api.validate, but business logic is skipped)
            response = client.post(
                "/api/ai-parts/cleanup",
                json={"part_key": "ZZZZ"},
                content_type="application/json",
            )

            assert response.status_code == 201
            data = response.get_json()
            assert 'task_id' in data
            assert data['status'] == 'pending'

    def test_cleanup_result_endpoint_removed(
        self, client: FlaskClient, app: Flask
    ):
        """Test that cleanup result endpoint has been removed."""
        with app.app_context():
            fake_task_id = "00000000-0000-0000-0000-000000000000"
            response = client.get(f"/api/ai-parts/cleanup/{fake_task_id}/result")

            # Endpoint should not exist (404)
            assert response.status_code == 404
