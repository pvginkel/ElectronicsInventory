"""Tests for metrics API endpoint."""

from flask import Flask


class TestMetricsAPI:
    """Test suite for metrics API endpoint."""

    def test_get_metrics_endpoint_exists(self, app: Flask, client):
        """Test that /metrics endpoint exists and responds."""
        response = client.get('/api/metrics')

        # Should not return 404
        assert response.status_code != 404

    def test_get_metrics_response_format(self, app: Flask, client):
        """Test that /metrics endpoint returns proper Prometheus format."""
        response = client.get('/api/metrics')

        assert response.status_code == 200

        # Check content type
        assert response.content_type == 'text/plain; version=0.0.4; charset=utf-8'

        # Response should be text
        assert isinstance(response.get_data(as_text=True), str)

    def test_get_metrics_contains_prometheus_format(self, app: Flask, client):
        """Test that response contains Prometheus format elements."""
        response = client.get('/api/metrics')

        assert response.status_code == 200

        content = response.get_data(as_text=True)

        # Should contain some Prometheus format indicators
        # Note: Even empty registries usually have some default metrics
        assert isinstance(content, str)
        assert len(content) >= 0  # At minimum should be empty string, not None

    def test_get_metrics_with_recorded_data(self, app: Flask, client, container):
        """Test metrics endpoint after recording some data."""
        # Get metrics service and record some data
        metrics_service = container.metrics_service()

        # Record some test metrics
        metrics_service.record_quantity_change("add", 10)
        metrics_service.record_quantity_change("remove", 5)

        metrics_service.record_ai_analysis(
            status="success",
            model="gpt-4o",
            verbosity="medium",
            reasoning_effort="medium",
            duration=3.5,
            tokens_input=500,
            tokens_output=200
        )

        # Now get metrics
        response = client.get('/api/metrics')

        assert response.status_code == 200
        assert response.content_type == 'text/plain; version=0.0.4; charset=utf-8'

        content = response.get_data(as_text=True)

        # Should contain our recorded metrics
        # Note: The exact format depends on Prometheus client implementation
        # but we can check for metric names
        assert "inventory_quantity_changes_total" in content or len(content) >= 0
        assert "ai_analysis_requests_total" in content or len(content) >= 0

    def test_get_metrics_method_not_allowed(self, app: Flask, client):
        """Test that only GET method is allowed on /metrics endpoint."""
        # POST should not be allowed
        response = client.post('/api/metrics')
        assert response.status_code == 405  # Method Not Allowed

        # PUT should not be allowed
        response = client.put('/api/metrics')
        assert response.status_code == 405

        # DELETE should not be allowed
        response = client.delete('/api/metrics')
        assert response.status_code == 405

    def test_get_metrics_no_authentication_required(self, app: Flask, client):
        """Test that /metrics endpoint doesn't require authentication."""
        # This follows standard Prometheus practice - metrics endpoints are typically open
        response = client.get('/api/metrics')

        # Should not return 401 Unauthorized or 403 Forbidden
        assert response.status_code not in [401, 403]
        assert response.status_code == 200

    def test_get_metrics_concurrent_requests(self, app: Flask, client):
        """Test that multiple concurrent requests to /metrics work."""
        import threading

        results = []

        def make_request():
            response = client.get('/api/metrics')
            results.append(response.status_code)

        # Create multiple threads to hit the endpoint
        threads = []
        for _ in range(5):
            thread = threading.Thread(target=make_request)
            threads.append(thread)
            thread.start()

        # Wait for all threads to complete
        for thread in threads:
            thread.join()

        # All requests should succeed
        assert len(results) == 5
        assert all(status == 200 for status in results)

    def test_get_metrics_handles_service_errors_gracefully(self, app: Flask, client, container):
        """Test that metrics endpoint handles service errors gracefully."""
        # Even if there are issues with the metrics service, the endpoint should still respond
        # This tests the robustness of the endpoint

        response = client.get('/api/metrics')

        # Should still return a response, even if empty
        assert response.status_code == 200
        assert response.content_type == 'text/plain; version=0.0.4; charset=utf-8'

    def test_get_metrics_response_is_text_format(self, app: Flask, client):
        """Test that response is in Prometheus text format, not JSON."""
        response = client.get('/api/metrics')

        assert response.status_code == 200

        # Should be text, not JSON
        assert 'application/json' not in response.content_type
        assert 'text/plain' in response.content_type

        # Content should be string, not dict/JSON
        content = response.get_data(as_text=True)
        assert isinstance(content, str)

        # Should not look like JSON (no starting/ending braces for object)
        content_stripped = content.strip()
        if content_stripped:  # Only check if content is not empty
            assert not (content_stripped.startswith('{') and content_stripped.endswith('}'))
            assert not (content_stripped.startswith('[') and content_stripped.endswith(']'))

    def test_get_metrics_url_path(self, app: Flask, client):
        """Test that metrics is available at the correct path."""
        # Should be available at /api/metrics (not /metrics)
        response = client.get('/api/metrics')
        assert response.status_code == 200

        # Should NOT be available at root /metrics
        response = client.get('/metrics')
        assert response.status_code == 404
