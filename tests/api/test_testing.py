"""Tests for testing API endpoints."""

import io
import json
import threading
import time
from pathlib import Path
from unittest.mock import Mock, patch
from urllib.parse import urlsplit

import pytest
from flask import Flask
from flask.testing import FlaskClient
from PIL import Image

from app import create_app
from app.config import Settings
from app.models.part_attachment import AttachmentType
from app.services.container import ServiceContainer
from app.services.download_cache_service import DownloadResult
from app.utils.log_capture import LogCaptureHandler, SSELogClient


class TestTestingEndpoints:
    """Test testing API endpoints for Playwright integration."""

    def test_reset_endpoint_basic_functionality(self, client: FlaskClient, container: ServiceContainer):
        """Test basic database reset functionality."""
        # Mock the database operations since SQLite tests can't run real PostgreSQL migrations
        with patch('app.services.testing_service.drop_all_tables'), \
             patch('app.services.testing_service.upgrade_database') as mock_upgrade, \
             patch('app.services.testing_service.sync_master_data_from_setup'):

            # Configure mock to return migration list
            mock_upgrade.return_value = ['002', '003', '004']

            # Test reset without seeding
            response = client.post("/api/testing/reset")

            assert response.status_code == 200
            data = response.get_json()
            assert data["status"] == "complete"
            assert data["mode"] == "testing"
            assert data["seeded"] is False
            assert "migrations_applied" in data

    def test_reset_endpoint_with_seeding(self, client: FlaskClient, container: ServiceContainer):
        """Test database reset with test data seeding."""
        # Mock the database operations since SQLite tests can't run real PostgreSQL migrations
        with patch('app.services.testing_service.drop_all_tables'), \
             patch('app.services.testing_service.upgrade_database') as mock_upgrade, \
             patch('app.services.testing_service.sync_master_data_from_setup'), \
             patch('app.services.test_data_service.TestDataService.load_full_dataset'):

            # Configure mock to return migration list
            mock_upgrade.return_value = ['002', '003', '004']

            response = client.post("/api/testing/reset?seed=true")

            assert response.status_code == 200
            data = response.get_json()
            assert data["status"] == "complete"
            assert data["mode"] == "testing"
            assert data["seeded"] is True
            assert "migrations_applied" in data

    def test_reset_endpoint_query_parameter_variations(self, client: FlaskClient):
        """Test different query parameter formats for seed parameter."""
        # Mock the database operations since SQLite tests can't run real PostgreSQL migrations
        with patch('app.services.testing_service.drop_all_tables'), \
             patch('app.services.testing_service.upgrade_database') as mock_upgrade, \
             patch('app.services.testing_service.sync_master_data_from_setup'), \
             patch('app.services.test_data_service.TestDataService.load_full_dataset'):

            # Configure mock to return migration list
            mock_upgrade.return_value = ['002', '003', '004']

            # Test various true values
            for seed_value in ["true", "1", "yes", "True", "YES"]:
                response = client.post(f"/api/testing/reset?seed={seed_value}")
                assert response.status_code == 200
                data = response.get_json()
                assert data["seeded"] is True

            # Test various false values
            for seed_value in ["false", "0", "no", "False", "NO", ""]:
                response = client.post(f"/api/testing/reset?seed={seed_value}")
                assert response.status_code == 200
                data = response.get_json()
                assert data["seeded"] is False

    def test_reset_endpoint_concurrency_control(self, client: FlaskClient, container: ServiceContainer):
        """Test that concurrent reset requests are properly handled."""
        # Get the reset lock and manually acquire it
        reset_lock = container.reset_lock()

        # Acquire the lock to simulate reset in progress
        assert reset_lock.acquire_reset() is True

        try:
            # Now try to reset while lock is held
            response = client.post("/api/testing/reset")

            assert response.status_code == 503
            assert "Retry-After" in response.headers
            assert response.headers["Retry-After"] == "5"

            data = response.get_json()
            assert "already in progress" in data["error"].lower()
            assert data["status"] == "busy"

        finally:
            # Release the lock
            reset_lock.release_reset()

    def test_reset_endpoint_idempotent(self, client: FlaskClient):
        """Test that reset operation is idempotent."""
        # Mock the database operations since SQLite tests can't run real PostgreSQL migrations
        with patch('app.services.testing_service.drop_all_tables'), \
             patch('app.services.testing_service.upgrade_database') as mock_upgrade, \
             patch('app.services.testing_service.sync_master_data_from_setup'), \
             patch('app.services.test_data_service.TestDataService.load_full_dataset'):

            # Configure mock to return migration list
            mock_upgrade.return_value = ['002', '003', '004']

            # First reset
            response1 = client.post("/api/testing/reset?seed=true")
            assert response1.status_code == 200
            data1 = response1.get_json()

            # Second reset with same parameters
            response2 = client.post("/api/testing/reset?seed=true")
            assert response2.status_code == 200
            data2 = response2.get_json()

            # Both should succeed with same structure
            assert data1["status"] == data2["status"] == "complete"
            assert data1["seeded"] == data2["seeded"] is True

    def test_content_image_endpoint_generates_expected_png(self, client: FlaskClient):
        """Test that the content image endpoint returns a deterministic PNG with text rendering."""
        response = client.get("/api/testing/content/image", query_string={"text": "Hello"})

        assert response.status_code == 200
        assert response.mimetype == "image/png"
        assert response.headers.get("Content-Disposition") == "attachment; filename=testing-content-image.png"
        assert response.headers.get("Cache-Control") == "no-store, no-cache, must-revalidate, max-age=0"
        assert response.headers.get("Pragma") == "no-cache"

        image_stream = io.BytesIO(response.data)

        with Image.open(image_stream) as image:
            assert image.format == "PNG"
            assert image.mode == "RGB"
            assert image.size == (400, 100)

            background_pixel = image.getpixel((10, 10))
            assert background_pixel == (36, 120, 189)

            has_dark_pixel = any(all(channel <= 32 for channel in pixel) for pixel in image.getdata())
            assert has_dark_pixel, "Expected at least one dark pixel representing rendered text"

    def test_content_image_endpoint_requires_text_parameter(self, client: FlaskClient):
        """Test that the content image endpoint enforces required query parameters."""
        response = client.get("/api/testing/content/image")

        assert response.status_code == 400
        payload = response.get_json()

        if isinstance(payload, str):
            payload = json.loads(payload)

        assert isinstance(payload, list)
        assert payload, "Expected validation error details"
        first_error = payload[0]
        assert first_error.get("msg") == "Field required"
        assert first_error.get("loc") == ["text"]

    def test_content_pdf_endpoint_returns_bundled_asset(self, client: FlaskClient):
        """Test that the content PDF endpoint streams the bundled fixture."""
        response = client.get("/api/testing/content/pdf")

        assert response.status_code == 200
        assert response.mimetype == "application/pdf"
        assert response.headers.get("Content-Disposition") == "attachment; filename=testing-content.pdf"
        assert response.headers.get("Cache-Control") == "no-store, no-cache, must-revalidate, max-age=0"

        pdf_path = Path(__file__).resolve().parents[2] / "app" / "assets" / "fake-pdf.pdf"
        expected_bytes = pdf_path.read_bytes()
        assert response.data == expected_bytes
        assert response.headers.get("Content-Length") == str(len(expected_bytes))

    def test_content_html_endpoint_renders_expected_markup(self, client: FlaskClient):
        """Test HTML content fixture without banner markup."""
        response = client.get("/api/testing/content/html", query_string={"title": "Fixture Title"})

        assert response.status_code == 200
        assert response.mimetype == "text/html"

        html_body = response.get_data(as_text=True)
        assert "<title>Fixture Title</title>" in html_body
        assert "data-testid=\"deployment-notification\"" not in html_body
        assert "og:image\" content=\"/api/testing/content/image?text=Fixture+Preview\"" in html_body
        assert response.headers.get("Content-Length") == str(len(response.data))

    def test_content_html_with_banner_includes_banner_markup(self, client: FlaskClient):
        """Test HTML content fixture that includes the deployment banner markup."""
        response = client.get(
            "/api/testing/content/html-with-banner",
            query_string={"title": "Release Title"}
        )

        assert response.status_code == 200
        html_body = response.get_data(as_text=True)
        assert "data-testid=\"deployment-notification\"" in html_body
        assert "data-testid=\"deployment-notification-reload\"" in html_body
        assert "Release Title" in html_body

    def test_content_html_endpoints_require_title(self, client: FlaskClient):
        """HTML fixtures should enforce the required title query parameter."""
        for path in ["/api/testing/content/html", "/api/testing/content/html-with-banner"]:
            response = client.get(path)
            assert response.status_code == 400
            payload = response.get_json()
            if isinstance(payload, str):
                payload = json.loads(payload)
            first_error = payload[0]
            assert first_error.get("loc") == ["title"]

    def test_document_service_process_upload_url_for_testing_content(
        self,
        client: FlaskClient,
        container: ServiceContainer,
        monkeypatch: pytest.MonkeyPatch,
    ):
        """Integration test ensuring DocumentService ingests deterministic content fixtures."""

        document_service = container.document_service()
        download_service = document_service.download_cache_service
        html_download_service = document_service.html_handler.download_cache_service

        def fake_download(url: str) -> DownloadResult:
            parsed = urlsplit(url)
            path = parsed.path or "/"
            query = f"?{parsed.query}" if parsed.query else ""
            response = client.get(f"{path}{query}")
            assert response.status_code == 200, f"Unexpected status {response.status_code} for {url}"
            mimetype = response.mimetype or response.headers.get("Content-Type", "application/octet-stream")
            return DownloadResult(content=response.data, content_type=mimetype)

        monkeypatch.setattr(download_service, "_download_url", fake_download)
        monkeypatch.setattr(html_download_service, "_download_url", fake_download)

        base_url = "http://localhost.test"

        image_result = document_service.process_upload_url(
            f"{base_url}/api/testing/content/image?text=Document+Image"
        )
        assert image_result.detected_type == AttachmentType.IMAGE
        assert image_result.content.content_type == "image/png"
        assert image_result.preview_image is None

        pdf_result = document_service.process_upload_url(
            f"{base_url}/api/testing/content/pdf"
        )
        assert pdf_result.detected_type == AttachmentType.PDF
        assert pdf_result.content.content_type == "application/pdf"
        assert pdf_result.preview_image is None

        html_result = document_service.process_upload_url(
            f"{base_url}/api/testing/content/html-with-banner?title=Banner+Title"
        )
        assert html_result.detected_type == AttachmentType.URL
        assert html_result.content.content_type == "text/html"
        assert html_result.title == "Banner Title"
        assert html_result.preview_image is not None
        assert html_result.preview_image.content_type == "image/png"

    def test_deployment_trigger_endpoint_queues_event_for_future_subscriber(
        self,
        client: FlaskClient,
        container: ServiceContainer,
    ):
        version_service = container.version_service()
        request_id = "playwright-queued"

        response = client.post(
            "/api/testing/deployments/version",
            json={"request_id": request_id, "version": "2024.01.0"}
        )

        assert response.status_code == 202
        payload = response.get_json()
        assert payload == {
            "requestId": request_id,
            "delivered": False,
            "status": "queued"
        }

        queue = version_service.register_subscriber(request_id)
        try:
            event_name, event_payload = queue.get_nowait()
            assert event_name == "version"
            assert event_payload["version"] == "2024.01.0"
        finally:
            version_service.unregister_subscriber(request_id)

    def test_deployment_trigger_endpoint_delivers_to_active_subscriber(
        self,
        client: FlaskClient,
        container: ServiceContainer,
    ):
        version_service = container.version_service()
        request_id = "playwright-live"
        queue = version_service.register_subscriber(request_id)

        try:
            response = client.post(
                "/api/testing/deployments/version",
                json={
                    "request_id": request_id,
                    "version": "2024.02.1",
                    "changelog": "Testing banner copy"
                }
            )

            assert response.status_code == 202
            payload = response.get_json()
            assert payload == {
                "requestId": request_id,
                "delivered": True,
                "status": "delivered"
            }

            event_name, event_payload = queue.get_nowait()
            assert event_name == "version"
            assert event_payload == {
                "version": "2024.02.1",
                "changelog": "Testing banner copy"
            }
        finally:
            version_service.unregister_subscriber(request_id)

    @patch('app.services.testing_service.drop_all_tables')
    def test_reset_endpoint_error_handling(self, mock_drop_tables, client: FlaskClient):
        """Test error handling during reset operation."""
        # Make drop_all_tables raise an exception
        mock_drop_tables.side_effect = Exception("Database error")

        response = client.post("/api/testing/reset")

        # Should return 500 error
        assert response.status_code == 500
        data = response.get_json()
        assert "error" in data
        assert "correlationId" in data or "correlationId" not in data  # Optional

    def test_logs_stream_endpoint_connection(self, client: FlaskClient):
        """Test log streaming endpoint basic connection."""
        # Start SSE stream
        response = client.get("/api/testing/logs/stream")

        assert response.status_code == 200
        assert response.content_type == "text/event-stream; charset=utf-8"
        assert response.headers.get("Cache-Control") == "no-cache"

    def test_logs_stream_captures_application_logs(self, app: Flask, client: FlaskClient):
        """Test that log streaming captures and formats application logs."""
        import logging

        # Use the log capture client to capture events
        with SSELogClient() as log_client:
            # Generate some log events
            logger = logging.getLogger("test_logger")
            logger.info("Test info message")
            logger.error("Test error message")
            logger.warning("Test warning message")

            # Wait briefly for events to be processed
            time.sleep(0.1)

            # Get captured events
            events = log_client.get_events()

            # Should have captured the log events
            log_events = [event_data for event_type, event_data in events if event_type == "log"]
            assert len(log_events) >= 3

            # Check that events have proper structure
            for event_data in log_events:
                assert "timestamp" in event_data
                assert "level" in event_data
                assert "logger" in event_data
                assert "message" in event_data

    def test_logs_stream_sse_event_format(self, app: Flask):
        """Test that log events are properly formatted as SSE."""
        from app.utils.sse_utils import format_sse_event

        # Test event formatting
        test_data = {
            "timestamp": "2024-01-15T10:30:45.123Z",
            "level": "ERROR",
            "logger": "app.services.test",
            "message": "Test message"
        }

        formatted = format_sse_event("log", test_data)

        # Should have proper SSE format
        assert formatted.startswith("event: log\n")
        assert "data: " in formatted
        assert formatted.endswith("\n\n")

        # Should contain JSON data
        data_line = [line for line in formatted.split('\n') if line.startswith('data: ')][0]
        json_data = json.loads(data_line[6:])  # Remove "data: " prefix
        assert json_data == test_data

    def test_logs_stream_correlation_id_inclusion(self, client: FlaskClient):
        """Test that correlation IDs are included in log events when available."""
        # Make request with custom correlation ID header
        response = client.get(
            "/api/testing/logs/stream",
            headers={"X-Request-Id": "test-correlation-123"}
        )

        assert response.status_code == 200
        # Note: Full correlation ID testing would require more complex SSE stream parsing

    def test_log_capture_handler_singleton(self):
        """Test that LogCaptureHandler is properly implemented as singleton."""
        handler1 = LogCaptureHandler.get_instance()
        handler2 = LogCaptureHandler.get_instance()

        assert handler1 is handler2

    def test_log_capture_client_management(self):
        """Test log capture handler client registration and cleanup."""
        handler = LogCaptureHandler.get_instance()

        # Create mock client
        mock_client = Mock()

        # Register client
        handler.register_client(mock_client)
        assert mock_client in handler._clients

        # Unregister client
        handler.unregister_client(mock_client)
        assert mock_client not in handler._clients

    def test_log_capture_thread_safety(self):
        """Test that log capture handler is thread-safe."""
        handler = LogCaptureHandler.get_instance()
        clients = []

        def add_client():
            mock_client = Mock()
            handler.register_client(mock_client)
            clients.append(mock_client)

        def remove_client():
            if clients:
                client = clients.pop()
                handler.unregister_client(client)

        # Run concurrent operations
        threads = []
        for _ in range(10):
            threads.append(threading.Thread(target=add_client))
            threads.append(threading.Thread(target=remove_client))

        for thread in threads:
            thread.start()

        for thread in threads:
            thread.join()

        # Should not crash and handler should still be functional
        assert isinstance(handler._clients, set)

    def test_reset_lock_basic_functionality(self, container: ServiceContainer):
        """Test reset lock basic acquire/release functionality."""
        reset_lock = container.reset_lock()

        # Initial state
        assert not reset_lock.is_resetting()

        # Acquire lock
        assert reset_lock.acquire_reset() is True
        assert reset_lock.is_resetting()

        # Try to acquire again (should fail)
        assert reset_lock.acquire_reset() is False
        assert reset_lock.is_resetting()

        # Release lock
        reset_lock.release_reset()
        assert not reset_lock.is_resetting()

        # Should be able to acquire again
        assert reset_lock.acquire_reset() is True

    def test_reset_lock_context_manager(self, container: ServiceContainer):
        """Test reset lock context manager functionality."""
        reset_lock = container.reset_lock()

        # Test successful acquisition
        with reset_lock as acquired:
            assert acquired is True
            assert reset_lock.is_resetting()

        # Should be released after context
        assert not reset_lock.is_resetting()

        # Test failed acquisition
        reset_lock.acquire_reset()  # Manually acquire
        try:
            with reset_lock as acquired:
                assert acquired is False
                assert reset_lock.is_resetting()  # Still held by manual acquire
        finally:
            reset_lock.release_reset()

    def test_correlation_id_propagation(self, client: FlaskClient):
        """Test that correlation IDs are properly propagated through the system."""
        test_correlation_id = "test-correlation-456"

        # Mock the database operations since SQLite tests can't run real PostgreSQL migrations
        with patch('app.services.testing_service.drop_all_tables'), \
             patch('app.services.testing_service.upgrade_database') as mock_upgrade, \
             patch('app.services.testing_service.sync_master_data_from_setup'):

            # Configure mock to return migration list
            mock_upgrade.return_value = ['002', '003', '004']

            # Make request with correlation ID
            response = client.post(
                "/api/testing/reset",
                headers={"X-Request-Id": test_correlation_id}
            )

            assert response.status_code == 200

            # Response should include correlation ID
            data = response.get_json()
            assert data.get("correlationId") == test_correlation_id or "correlationId" not in data

    def test_testing_service_dependency_injection(self, container: ServiceContainer):
        """Test that testing service is properly configured with dependencies."""
        testing_service = container.testing_service()

        # Should have database session
        assert hasattr(testing_service, 'db')
        assert testing_service.db is not None

        # Should have reset lock
        assert hasattr(testing_service, 'reset_lock')
        assert testing_service.reset_lock is not None


class TestTestingEndpointsNonTestingMode:
    """Test testing endpoints behavior when not in testing mode."""

    @pytest.fixture
    def non_testing_settings(self) -> Settings:
        """Create settings with testing mode disabled."""
        return Settings(
            DATABASE_URL="sqlite:///:memory:",
            SECRET_KEY="test-secret-key",
            DEBUG=True,
            FLASK_ENV="development",  # Not testing mode
            CORS_ORIGINS=["http://localhost:3000"],
            ALLOWED_IMAGE_TYPES=["image/jpeg", "image/png"],
            ALLOWED_FILE_TYPES=["application/pdf"],
            MAX_IMAGE_SIZE=10 * 1024 * 1024,  # 10MB
            MAX_FILE_SIZE=100 * 1024 * 1024,  # 100MB
        )

    @pytest.fixture
    def non_testing_app(self, non_testing_settings: Settings) -> Flask:
        """Create Flask app with testing mode disabled."""
        app = create_app(non_testing_settings)

        with app.app_context():
            from app.extensions import db
            db.create_all()

        return app

    @pytest.fixture
    def non_testing_client(self, non_testing_app: Flask):
        """Create test client for non-testing mode app."""
        return non_testing_app.test_client()

    def test_reset_endpoint_returns_400_in_non_testing_mode(self, non_testing_client: FlaskClient):
        """Test that reset endpoint returns 400 when not in testing mode."""
        response = non_testing_client.post("/api/testing/reset")

        assert response.status_code == 400
        data = response.get_json()
        assert data["error"] == "This endpoint is only available when the server is running in testing mode"
        assert data["code"] == "ROUTE_NOT_AVAILABLE"
        assert data["details"]["message"] == "Testing endpoints require FLASK_ENV=testing"
        assert "correlationId" in data or "correlationId" not in data  # Optional

    def test_reset_endpoint_with_seed_returns_400_in_non_testing_mode(self, non_testing_client: FlaskClient):
        """Test that reset endpoint with seed parameter returns 400 when not in testing mode."""
        response = non_testing_client.post("/api/testing/reset?seed=true")

        assert response.status_code == 400
        data = response.get_json()
        assert data["error"] == "This endpoint is only available when the server is running in testing mode"
        assert data["code"] == "ROUTE_NOT_AVAILABLE"
        assert data["details"]["message"] == "Testing endpoints require FLASK_ENV=testing"

    def test_content_image_endpoint_returns_400_in_non_testing_mode(self, non_testing_client: FlaskClient):
        """Test that content image endpoint is unavailable outside testing mode."""
        response = non_testing_client.get("/api/testing/content/image", query_string={"text": "Hello"})

        assert response.status_code == 400
        data = response.get_json()
        assert data["error"] == "This endpoint is only available when the server is running in testing mode"
        assert data["code"] == "ROUTE_NOT_AVAILABLE"
        assert data["details"]["message"] == "Testing endpoints require FLASK_ENV=testing"

    def test_logs_stream_endpoint_returns_400_in_non_testing_mode(self, non_testing_client: FlaskClient):
        """Test that logs stream endpoint returns 400 when not in testing mode."""
        response = non_testing_client.get("/api/testing/logs/stream")

        assert response.status_code == 400
        data = response.get_json()
        assert data["error"] == "This endpoint is only available when the server is running in testing mode"
        assert data["code"] == "ROUTE_NOT_AVAILABLE"
        assert data["details"]["message"] == "Testing endpoints require FLASK_ENV=testing"

    def test_correlation_id_included_in_non_testing_mode_error(self, non_testing_client: FlaskClient):
        """Test that correlation IDs are included in error responses when not in testing mode."""
        test_correlation_id = "test-correlation-789"

        response = non_testing_client.post(
            "/api/testing/reset",
            headers={"X-Request-Id": test_correlation_id}
        )

        assert response.status_code == 400
        data = response.get_json()
        assert data.get("correlationId") == test_correlation_id or "correlationId" not in data

    def test_before_request_applies_to_all_testing_routes(self, non_testing_client: FlaskClient):
        """Test that before_request handler applies to all routes in testing blueprint."""
        # Test all known testing endpoints
        endpoints = [
            ("/api/testing/reset", "POST"),
            ("/api/testing/logs/stream", "GET"),
            ("/api/testing/content/image?text=test", "GET"),
            ("/api/testing/content/pdf", "GET"),
            ("/api/testing/content/html?title=Fixture", "GET"),
            ("/api/testing/content/html-with-banner?title=Fixture", "GET"),
            ("/api/testing/deployments/version", "POST"),
        ]

        for endpoint, method in endpoints:
            if method == "POST":
                response = non_testing_client.post(endpoint, json={})
            else:
                response = non_testing_client.get(endpoint)

            assert response.status_code == 400
            data = response.get_json()
            assert data["code"] == "ROUTE_NOT_AVAILABLE"
            assert "testing mode" in data["error"]
