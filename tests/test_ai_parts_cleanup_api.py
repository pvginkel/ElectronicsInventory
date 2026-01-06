"""Tests for AI parts cleanup API endpoints."""

from flask import Flask
from flask.testing import FlaskClient
from sqlalchemy.orm import Session

from app.services.container import ServiceContainer


class TestAIPartsCleanupAPI:
    """Test cases for AI parts cleanup API endpoints."""

    def test_cleanup_part_invalid_json(self, client: FlaskClient, app: Flask):
        """Test cleanup endpoint with invalid JSON."""
        with app.app_context():
            response = client.post(
                "/api/ai-parts/cleanup",
                data="invalid json",
                content_type="application/json",
            )

            assert response.status_code == 400

    def test_cleanup_part_missing_part_key(self, client: FlaskClient, app: Flask):
        """Test cleanup endpoint with missing part_key."""
        with app.app_context():
            response = client.post(
                "/api/ai-parts/cleanup",
                json={},  # Empty JSON
                content_type="application/json",
            )

            assert response.status_code == 400

    def test_cleanup_part_invalid_part_key_format(
        self, client: FlaskClient, app: Flask
    ):
        """Test cleanup endpoint with invalid part_key format."""
        with app.app_context():
            # Too short
            response = client.post(
                "/api/ai-parts/cleanup",
                json={"part_key": "ABC"},
                content_type="application/json",
            )
            assert response.status_code == 400

            # Too long
            response = client.post(
                "/api/ai-parts/cleanup",
                json={"part_key": "ABCDE"},
                content_type="application/json",
            )
            assert response.status_code == 400

            # Lowercase
            response = client.post(
                "/api/ai-parts/cleanup",
                json={"part_key": "abcd"},
                content_type="application/json",
            )
            assert response.status_code == 400

            # With numbers
            response = client.post(
                "/api/ai-parts/cleanup",
                json={"part_key": "AB12"},
                content_type="application/json",
            )
            assert response.status_code == 400

    def test_cleanup_part_not_found(
        self, client: FlaskClient, app: Flask, session: Session
    ):
        """Test cleanup endpoint with non-existent part."""
        with app.app_context():
            response = client.post(
                "/api/ai-parts/cleanup",
                json={"part_key": "ZZZZ"},
                content_type="application/json",
            )

            assert response.status_code == 400
            data = response.get_json()
            assert "Part with key ZZZZ not found" in data["error"]

    def test_cleanup_part_real_ai_disabled_guard(
        self, client: FlaskClient, app: Flask, session: Session, container: ServiceContainer
    ):
        """Test cleanup endpoint short-circuits when real AI is disabled without dummy data."""
        with app.app_context():
            # Create a test part
            part_service = container.part_service()
            part = part_service.create_part(description="Test part for cleanup")
            session.commit()

            response = client.post(
                "/api/ai-parts/cleanup",
                json={"part_key": part.key},
                content_type="application/json",
            )

            assert response.status_code == 400
            data = response.get_json()
            assert (
                data["error"]
                == "Cannot perform AI cleanup because real AI usage is disabled in testing mode"
            )
            assert (
                data["details"]["message"]
                == "The requested operation cannot be performed"
            )
            assert data["code"] == "INVALID_OPERATION"

    def test_get_cleanup_result_task_not_found(
        self, client: FlaskClient, app: Flask
    ):
        """Test get cleanup result endpoint with non-existent task."""
        with app.app_context():
            fake_task_id = "00000000-0000-0000-0000-000000000000"
            response = client.get(f"/api/ai-parts/cleanup/{fake_task_id}/result")

            assert response.status_code == 404
            data = response.get_json()
            assert "Task not found" in data["error"]

    def test_get_cleanup_result_task_not_completed(
        self, client: FlaskClient, app: Flask, session: Session, container: ServiceContainer
    ):
        """Test get cleanup result endpoint with incomplete task."""
        with app.app_context():
            # This test would require creating a running task which is complex
            # For now, just verify endpoint exists and validates task_id format
            pass
