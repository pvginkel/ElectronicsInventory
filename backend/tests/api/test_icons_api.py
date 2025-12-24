"""Tests for static icons API endpoints."""

from flask import Flask
from flask.testing import FlaskClient


class TestIconsApi:
    """Tests for /api/icons endpoints."""

    def test_get_pdf_icon(self, client: FlaskClient, app: Flask) -> None:
        """Test fetching PDF icon."""
        with app.app_context():
            response = client.get('/api/icons/pdf')

        assert response.status_code == 200
        assert 'image/svg+xml' in response.content_type
        assert b'<svg' in response.data
        assert response.headers.get('Cache-Control') == 'public, max-age=31536000, immutable'

    def test_get_pdf_icon_with_version(self, client: FlaskClient, app: Flask) -> None:
        """Test fetching PDF icon with version param (ignored by server)."""
        with app.app_context():
            response = client.get('/api/icons/pdf?version=abc123')

        assert response.status_code == 200
        assert 'image/svg+xml' in response.content_type
        assert response.headers.get('Cache-Control') == 'public, max-age=31536000, immutable'

    def test_get_link_icon(self, client: FlaskClient, app: Flask) -> None:
        """Test fetching link icon."""
        with app.app_context():
            response = client.get('/api/icons/link')

        assert response.status_code == 200
        assert 'image/svg+xml' in response.content_type
        assert b'<svg' in response.data
        assert response.headers.get('Cache-Control') == 'public, max-age=31536000, immutable'

    def test_get_link_icon_with_version(self, client: FlaskClient, app: Flask) -> None:
        """Test fetching link icon with version param (ignored by server)."""
        with app.app_context():
            response = client.get('/api/icons/link?version=xyz789')

        assert response.status_code == 200
        assert 'image/svg+xml' in response.content_type
        assert response.headers.get('Cache-Control') == 'public, max-age=31536000, immutable'
