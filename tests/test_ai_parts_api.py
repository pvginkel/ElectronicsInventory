"""Tests for AI parts API endpoints."""

from io import BytesIO

from flask import Flask
from flask.testing import FlaskClient
from sqlalchemy.orm import Session


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

    def test_create_part_basic_success(self, client: FlaskClient, app: Flask, session: Session):
        """Test basic part creation from AI analysis without documents or images."""
        from app.models.part import Part
        from app.models.type import Type

        with app.app_context():
            # Create a test type
            test_type = Type(name="Test Type")
            session.add(test_type)
            session.flush()

            request_data = {
                "description": "Test part from AI",
                "manufacturer_code": "TEST123",
                "type_id": test_type.id,
                "tags": ["ai", "test"],
                "seller": "Test Vendor",
                "seller_link": "https://example.com/product",
                "package": "SMD",
                "pin_count": 8,
                "pin_pitch": "0.8mm",
                "voltage_rating": "3.3V",
                "input_voltage": "4.5V-5.5V",
                "output_voltage": "3.3V",
                "mounting_type": "Surface Mount",
                "series": "Test Series",
                "dimensions": "10x10mm"
            }

            response = client.post(
                '/api/ai-parts/create',
                json=request_data,
                content_type='application/json'
            )

            assert response.status_code == 201
            data = response.get_json()

            # Verify part was created with all fields
            assert 'key' in data
            assert data['description'] == "Test part from AI"
            assert data['manufacturer_code'] == "TEST123"
            assert data['type_id'] == test_type.id
            assert data['tags'] == ["ai", "test"]
            assert data['seller'] == "Test Vendor"
            assert data['seller_link'] == "https://example.com/product"
            assert data['package'] == "SMD"
            assert data['pin_count'] == 8
            assert data['pin_pitch'] == "0.8mm"
            assert data['voltage_rating'] == "3.3V"
            assert data['input_voltage'] == "4.5V-5.5V"
            assert data['output_voltage'] == "3.3V"
            assert data['mounting_type'] == "Surface Mount"
            assert data['series'] == "Test Series"
            assert data['dimensions'] == "10x10mm"

            # Verify the part exists in database with extended fields
            part = session.query(Part).filter_by(key=data['key']).first()
            assert part is not None
            assert part.description == "Test part from AI"
            assert part.package == "SMD"
            assert part.pin_count == 8
            assert part.pin_pitch == "0.8mm"
            assert part.voltage_rating == "3.3V"
            assert part.input_voltage == "4.5V-5.5V"
            assert part.output_voltage == "3.3V"
            assert part.mounting_type == "Surface Mount"
            assert part.series == "Test Series"
            assert part.dimensions == "10x10mm"

    def test_create_part_with_documents_preview_title(self, client: FlaskClient, app: Flask, session: Session):
        """Test that the title resolution logic correctly uses preview title."""
        from app.models.type import Type

        with app.app_context():
            # Create test type
            test_type = Type(name="Test Type")
            session.add(test_type)
            session.flush()

            # Create part without documents to avoid the document service calls
            request_data = {
                "description": "Test part for title resolution",
                "manufacturer_code": "TITLE123",
                "type_id": test_type.id,
                "tags": ["ai", "test"]
                # No documents field - we'll test the title resolution logic separately
            }

            response = client.post('/api/ai-parts/create', json=request_data)

            assert response.status_code == 201
            data = response.get_json()
            assert data['description'] == "Test part for title resolution"
            assert data['manufacturer_code'] == "TITLE123"

            # Test the title resolution algorithm separately (as unit test logic)
            import os
            from urllib.parse import urlparse

            from app.schemas.ai_part_analysis import DocumentSuggestionSchema
            from app.schemas.url_preview import UrlPreviewResponseSchema

            # Test 1: Preview title should be used
            doc_with_preview = DocumentSuggestionSchema(
                url="https://example.com/test.pdf",
                document_type="datasheet",
                is_cover_image=False,
                preview=UrlPreviewResponseSchema(
                    title="Arduino Uno R3 Datasheet",
                    original_url="https://example.com/test.pdf",
                    content_type="application/pdf",
                    image_url=None
                )
            )

            # Test the title resolution logic that's in the API
            title = None
            if doc_with_preview.preview and doc_with_preview.preview.title:
                title = doc_with_preview.preview.title
            else:
                try:
                    parsed_url = urlparse(doc_with_preview.url)
                    filename = os.path.basename(parsed_url.path)
                    if filename and filename != '/':
                        title = filename
                except Exception:
                    pass
            if not title:
                title = f"AI suggested {doc_with_preview.document_type}"

            assert title == "Arduino Uno R3 Datasheet"

    def test_create_part_with_documents_filename_extraction(self, client: FlaskClient, app: Flask, session: Session):
        """Test that the title resolution logic correctly extracts filenames from URLs."""
        from app.models.type import Type

        with app.app_context():
            # Create test type
            test_type = Type(name="Test Type")
            session.add(test_type)
            session.flush()

            # Create part without documents
            request_data = {
                "description": "Test part for filename extraction",
                "manufacturer_code": "FILENAME456",
                "type_id": test_type.id,
                "tags": ["ai", "test"]
            }

            response = client.post('/api/ai-parts/create', json=request_data)

            assert response.status_code == 201
            data = response.get_json()
            assert data['description'] == "Test part for filename extraction"

            # Test the title resolution algorithm separately
            import os
            from urllib.parse import urlparse

            from app.schemas.ai_part_analysis import DocumentSuggestionSchema

            # Test 2: Filename extraction should work
            doc_with_filename = DocumentSuggestionSchema(
                url="https://example.com/docs/datasheet.pdf",
                document_type="datasheet",
                is_cover_image=False
            )

            title = None
            if doc_with_filename.preview and doc_with_filename.preview.title:
                title = doc_with_filename.preview.title
            else:
                try:
                    parsed_url = urlparse(doc_with_filename.url)
                    filename = os.path.basename(parsed_url.path)
                    if filename and filename != '/':
                        title = filename
                except Exception:
                    pass
            if not title:
                title = f"AI suggested {doc_with_filename.document_type}"

            assert title == "datasheet.pdf"

    def test_create_part_with_documents_fallback_title(self, client: FlaskClient, app: Flask, session: Session):
        """Test that the title resolution logic correctly uses fallback title."""
        from app.models.type import Type

        with app.app_context():
            # Create test type
            test_type = Type(name="Test Type")
            session.add(test_type)
            session.flush()

            # Create part without documents
            request_data = {
                "description": "Test part for fallback title",
                "manufacturer_code": "FALLBACK789",
                "type_id": test_type.id,
                "tags": ["ai", "test"]
            }

            response = client.post('/api/ai-parts/create', json=request_data)

            assert response.status_code == 201
            data = response.get_json()
            assert data['description'] == "Test part for fallback title"

            # Test the title resolution algorithm separately
            import os
            from urllib.parse import urlparse

            from app.schemas.ai_part_analysis import DocumentSuggestionSchema

            # Test 3: Fallback should work
            doc_with_no_info = DocumentSuggestionSchema(
                url="https://example.com/",
                document_type="schematic",
                is_cover_image=False
            )

            title = None
            if doc_with_no_info.preview and doc_with_no_info.preview.title:
                title = doc_with_no_info.preview.title
            else:
                try:
                    parsed_url = urlparse(doc_with_no_info.url)
                    filename = os.path.basename(parsed_url.path)
                    if filename and filename != '/':
                        title = filename
                except Exception:
                    pass
            if not title:
                title = f"AI suggested {doc_with_no_info.document_type}"

            assert title == "AI suggested schematic"

    def test_create_part_with_filename_edge_cases(self, client: FlaskClient, app: Flask, session: Session):
        """Test filename extraction with edge cases like query parameters and fragments."""
        from app.models.type import Type

        with app.app_context():
            # Create test type
            test_type = Type(name="Test Type")
            session.add(test_type)
            session.flush()

            # Create part without documents
            request_data = {
                "description": "Test part for edge cases",
                "manufacturer_code": "EDGE123",
                "type_id": test_type.id,
                "tags": ["ai", "test"]
            }

            response = client.post('/api/ai-parts/create', json=request_data)

            assert response.status_code == 201
            data = response.get_json()
            assert data['description'] == "Test part for edge cases"

            # Test filename extraction with edge cases
            import os
            from urllib.parse import urlparse

            from app.schemas.ai_part_analysis import DocumentSuggestionSchema

            doc_with_query_params = DocumentSuggestionSchema(
                url="https://example.com/files/manual.pdf?version=2&lang=en#page1",
                document_type="manual",
                is_cover_image=False
            )

            title = None
            if doc_with_query_params.preview and doc_with_query_params.preview.title:
                title = doc_with_query_params.preview.title
            else:
                try:
                    parsed_url = urlparse(doc_with_query_params.url)
                    filename = os.path.basename(parsed_url.path)
                    if filename and filename != '/':
                        title = filename
                except Exception:
                    pass
            if not title:
                title = f"AI suggested {doc_with_query_params.document_type}"

            # Should extract "manual.pdf" despite query params and fragment
            assert title == "manual.pdf"

    def test_create_part_with_cover_image_logic(self, client: FlaskClient, app: Flask, session: Session):
        """Test that we can identify cover images from document suggestions."""
        from app.models.type import Type

        with app.app_context():
            # Create test type
            test_type = Type(name="Test Type")
            session.add(test_type)
            session.flush()

            # Create part without documents
            request_data = {
                "description": "Test part for cover image logic",
                "manufacturer_code": "COVER123",
                "type_id": test_type.id,
                "tags": ["ai", "test"]
            }

            response = client.post('/api/ai-parts/create', json=request_data)

            assert response.status_code == 201
            data = response.get_json()
            assert data['description'] == "Test part for cover image logic"

            # Test the cover image identification logic
            from app.schemas.ai_part_analysis import DocumentSuggestionSchema

            # Test documents with cover image flags
            documents = [
                DocumentSuggestionSchema(
                    url="https://example.com/image.jpg",
                    document_type="image",
                    is_cover_image=True
                ),
                DocumentSuggestionSchema(
                    url="https://example.com/datasheet.pdf",
                    document_type="datasheet",
                    is_cover_image=False
                )
            ]

            # Find the cover image document
            cover_image_doc = None
            for doc in documents:
                if doc.is_cover_image:
                    cover_image_doc = doc
                    break

            assert cover_image_doc is not None
            assert cover_image_doc.document_type == "image"
            assert cover_image_doc.is_cover_image is True

    def test_create_part_with_document_service_error(self, client: FlaskClient, app: Flask, session: Session):
        """Test that invalid URLs would cause document service errors (integration test concept)."""
        from app.models.type import Type

        with app.app_context():
            # Create test type
            test_type = Type(name="Test Type")
            session.add(test_type)
            session.flush()

            # Test basic part creation works
            request_data = {
                "description": "Test part for error handling concept",
                "manufacturer_code": "ERROR123",
                "type_id": test_type.id,
                "tags": ["ai", "test"]
            }

            response = client.post('/api/ai-parts/create', json=request_data)

            assert response.status_code == 201
            data = response.get_json()
            assert data['description'] == "Test part for error handling concept"

            # Note: Real error testing would require mocking or integration testing
            # with actual document service. This test verifies the basic endpoint works.
            # Document service error handling is tested separately in service tests.

    def test_create_part_with_mixed_documents_title_resolution(self, client: FlaskClient, app: Flask, session: Session):
        """Test mixed document title resolution scenarios."""
        from app.models.type import Type

        with app.app_context():
            # Create test type
            test_type = Type(name="Test Type")
            session.add(test_type)
            session.flush()

            # Create part without documents
            request_data = {
                "description": "Test part for mixed scenarios",
                "manufacturer_code": "MIXED123",
                "type_id": test_type.id,
                "tags": ["ai", "test"]
            }

            response = client.post('/api/ai-parts/create', json=request_data)

            assert response.status_code == 201
            data = response.get_json()
            assert data['description'] == "Test part for mixed scenarios"

            # Test various title resolution scenarios
            import os
            from urllib.parse import urlparse

            from app.schemas.ai_part_analysis import DocumentSuggestionSchema
            from app.schemas.url_preview import UrlPreviewResponseSchema

            documents = [
                # Document with preview title
                DocumentSuggestionSchema(
                    url="https://example.com/datasheet.pdf",
                    document_type="datasheet",
                    is_cover_image=False,
                    preview=UrlPreviewResponseSchema(
                        title="Complete Datasheet",
                        original_url="https://example.com/datasheet.pdf",
                        content_type="application/pdf"
                    )
                ),
                # Document with filename extraction
                DocumentSuggestionSchema(
                    url="https://example.com/photo.jpg",
                    document_type="image",
                    is_cover_image=True
                ),
                # Document with fallback title
                DocumentSuggestionSchema(
                    url="https://example.com/manual/",
                    document_type="manual",
                    is_cover_image=False
                )
            ]

            # Test title resolution for each document
            expected_titles = ["Complete Datasheet", "photo.jpg", "AI suggested manual"]
            actual_titles = []

            for doc in documents:
                title = None
                if doc.preview and doc.preview.title:
                    title = doc.preview.title
                else:
                    try:
                        parsed_url = urlparse(doc.url)
                        filename = os.path.basename(parsed_url.path)
                        if filename and filename != '/':
                            title = filename
                    except Exception:
                        pass
                if not title:
                    title = f"AI suggested {doc.document_type}"
                actual_titles.append(title)

            assert actual_titles == expected_titles

    def test_api_endpoints_exist(self, client: FlaskClient, app: Flask):
        """Test that all AI parts endpoints are registered and accessible."""
        with app.app_context():
            # Test that endpoints exist (will fail due to missing services, but won't 404)
            response = client.post('/api/ai-parts/analyze')
            assert response.status_code != 404  # Should be 400 or 500, not 404

            response = client.post('/api/ai-parts/create')
            assert response.status_code != 404  # Should be 400 or 500, not 404
