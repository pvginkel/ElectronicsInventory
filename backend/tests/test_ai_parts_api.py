"""Tests for AI parts API endpoints."""

import json
from io import BytesIO

from flask import Flask
from flask.testing import FlaskClient
from sqlalchemy.orm import Session

from app.models.type import Type
from app.services.container import ServiceContainer


class TestAIPartsAPI:
    """Test cases for AI parts API endpoints."""

    def test_analyze_part_no_multipart_content_type(self, client: FlaskClient, app: Flask):
        """Test analyze endpoint with incorrect content type."""
        with app.app_context():
            response = client.post(
                '/api/ai-parts/analyze',
                json={'text': 'Arduino Uno'},
                headers={'Content-Type': 'application/json'}
            )
            
            assert response.status_code == 400
            data = response.get_json()
            assert 'Content-Type must be multipart/form-data' in data['error']

    def test_analyze_part_no_input(self, client: FlaskClient, app: Flask):
        """Test analyze endpoint with no text or image input."""
        with app.app_context():
            response = client.post(
                '/api/ai-parts/analyze',
                data={},  # Empty form data
                content_type='multipart/form-data'
            )
            
            assert response.status_code == 400
            data = response.get_json()
            assert 'At least one of text or image input must be provided' in data['error']

    def test_analyze_part_unsupported_image_type(self, client: FlaskClient, app: Flask):
        """Test analyze endpoint with unsupported image type."""
        with app.app_context():
            fake_file = BytesIO(b"fake_file_data")
            
            response = client.post(
                '/api/ai-parts/analyze',
                data={
                    'image': (fake_file, 'test.bmp', 'image/bmp')
                },
                content_type='multipart/form-data'
            )
            
            assert response.status_code == 400
            data = response.get_json()
            assert 'Unsupported image type' in data['error']
            assert 'image/bmp' in data['error']

    def test_analyze_part_empty_image_file(self, client: FlaskClient, app: Flask):
        """Test analyze endpoint with empty image file."""
        with app.app_context():
            empty_file = BytesIO(b"")
            
            response = client.post(
                '/api/ai-parts/analyze',
                data={
                    'image': (empty_file, '', 'image/jpeg')  # Empty filename
                },
                content_type='multipart/form-data'
            )
            
            assert response.status_code == 400
            data = response.get_json()
            assert 'At least one of text or image input must be provided' in data['error']

    def test_create_part_invalid_json(self, client: FlaskClient, app: Flask):
        """Test create part endpoint with invalid JSON."""
        with app.app_context():
            response = client.post(
                '/api/ai-parts/create',
                data='invalid json',
                content_type='application/json'
            )
            
            assert response.status_code == 400

    def test_create_part_missing_description(self, client: FlaskClient, app: Flask):
        """Test create part endpoint with missing required description."""
        with app.app_context():
            request_data = {
                "manufacturer_code": "TEST123",
                # Missing required description
                "tags": ["test"]
            }
            
            response = client.post(
                '/api/ai-parts/create',
                json=request_data,
                content_type='application/json'
            )
            
            assert response.status_code == 400

    def test_serve_temp_file_not_found(self, client: FlaskClient, app: Flask):
        """Test serving non-existent temporary file."""
        with app.app_context():
            response = client.get('/api/ai-parts/temp/nonexistent/file.pdf')
            
            assert response.status_code == 404
            data = response.get_json()
            assert 'File not found or expired' in data['error']

    def test_api_endpoints_exist(self, client: FlaskClient, app: Flask):
        """Test that all AI parts endpoints are registered and accessible."""
        with app.app_context():
            # Test that endpoints exist (will fail due to missing services, but won't 404)
            response = client.post('/api/ai-parts/analyze')
            assert response.status_code != 404  # Should be 400 or 500, not 404
            
            response = client.post('/api/ai-parts/create')
            assert response.status_code != 404  # Should be 400 or 500, not 404
            
            # The temp file endpoint should return 404 for non-existent files (which is correct)
            response = client.get('/api/ai-parts/temp/test/file.pdf')
            assert response.status_code == 404  # Correct behavior - file not found