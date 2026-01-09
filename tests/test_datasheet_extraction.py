"""Tests for datasheet spec extraction service and function."""

from unittest.mock import ANY, patch

import pytest
from flask import Flask

from app.models.attachment import AttachmentType
from app.schemas.datasheet_extraction import (
    ExtractSpecsFromDatasheetRequest,
    ExtractSpecsFromDatasheetResponse,
)
from app.schemas.upload_document import DocumentContentSchema, UploadDocumentSchema
from app.services.ai_model import PartAnalysisSpecDetails
from app.services.container import ServiceContainer
from app.utils.ai.ai_runner import AIResponse


class StubProgressHandle:
    """Stub progress handle for testing."""
    def send_progress_text(self, text: str) -> None:
        pass
    def send_progress_value(self, value: float) -> None:
        pass
    def send_progress(self, text: str, value: float) -> None:
        pass


class TestDatasheetExtractionService:
    """Test datasheet extraction service."""

    def test_extract_specs_success(self, app: Flask, container: ServiceContainer):
        """Test successful spec extraction from valid PDF."""
        service = container.datasheet_extraction_service()

        # Skip test if AI runner is None (real AI not enabled)
        if service.ai_runner is None:
            pytest.skip("Real AI not enabled in test environment")

        # Mock document service to return valid PDF
        pdf_content = b"%PDF-1.4\n%Mock PDF content"
        upload_doc = UploadDocumentSchema(
            title="SSD1306 Datasheet",
            content=DocumentContentSchema(
                content=pdf_content,
                content_type="application/pdf"
            ),
            detected_type=AttachmentType.PDF,
            preview_image=None
        )

        with patch.object(service.document_service, 'process_upload_url', return_value=upload_doc):
            # Mock AI runner to return successful extraction
            mock_specs = PartAnalysisSpecDetails(
                product_name="OLED display controller (SSD1306)",
                product_family="SSD1306",
                product_category="Display - OLED",
                manufacturer="Solomon Systech",
                manufacturer_part_number="SSD1306",
                package_type="COG",
                mounting_type=None,
                part_pin_count=68,
                part_pin_pitch=None,
                voltage_rating=None,
                input_voltage="3.3V",
                output_voltage=None,
                physical_dimensions=None,
                tags=["display", "oled", "controller"],
            )

            mock_ai_response = AIResponse(
                response=ExtractSpecsFromDatasheetResponse(
                    specs=mock_specs,
                    error=None
                ),
                output_text="Extracted specs from datasheet",
                elapsed_time=2.5,
                input_tokens=1500,
                cached_input_tokens=0,
                output_tokens=400,
                reasoning_tokens=0,
                cost=0.02
            )

            with patch.object(service.ai_runner, 'run', return_value=mock_ai_response):
                response = service.extract_specs(
                    analysis_query="0.96 inch OLED display module SSD1306",
                    datasheet_url="https://cdn-shop.adafruit.com/datasheets/SSD1306.pdf"
                )

                assert isinstance(response, ExtractSpecsFromDatasheetResponse)
                assert response.specs is not None
                assert response.error is None
                assert response.specs.manufacturer == "Solomon Systech"
                assert response.specs.manufacturer_part_number == "SSD1306"

    def test_extract_specs_validation_failure(self, app: Flask, container: ServiceContainer):
        """Test when datasheet doesn't match analysis query."""
        service = container.datasheet_extraction_service()

        # Skip test if AI runner is None (real AI not enabled)
        if service.ai_runner is None:
            pytest.skip("Real AI not enabled in test environment")

        # Mock document service to return valid PDF
        pdf_content = b"%PDF-1.4\n%Mock PDF content"
        upload_doc = UploadDocumentSchema(
            title="SSD1305 Datasheet",
            content=DocumentContentSchema(
                content=pdf_content,
                content_type="application/pdf"
            ),
            detected_type=AttachmentType.PDF,
            preview_image=None
        )

        with patch.object(service.document_service, 'process_upload_url', return_value=upload_doc):
            # Mock AI runner to return validation error
            mock_ai_response = AIResponse(
                response=ExtractSpecsFromDatasheetResponse(
                    specs=None,
                    error="Datasheet is for SSD1305, not SSD1306 as requested"
                ),
                output_text="Validation failed",
                elapsed_time=1.2,
                input_tokens=1500,
                cached_input_tokens=0,
                output_tokens=50,
                reasoning_tokens=0,
                cost=0.01
            )

            with patch.object(service.ai_runner, 'run', return_value=mock_ai_response):
                response = service.extract_specs(
                    analysis_query="0.96 inch OLED display module SSD1306",
                    datasheet_url="https://cdn-shop.adafruit.com/datasheets/SSD1305.pdf"
                )

                assert isinstance(response, ExtractSpecsFromDatasheetResponse)
                assert response.specs is None
                assert response.error is not None
                assert "SSD1305" in response.error
                assert "SSD1306" in response.error

    def test_extract_specs_download_failure(self, app: Flask, container: ServiceContainer):
        """Test handling of PDF download failure."""
        service = container.datasheet_extraction_service()

        # Mock document service to raise exception
        with patch.object(service.document_service, 'process_upload_url', side_effect=Exception("404 Not Found")):
            response = service.extract_specs(
                analysis_query="0.96 inch OLED display module SSD1306",
                datasheet_url="https://example.com/nonexistent.pdf",
                progress_handle=StubProgressHandle()
            )

            assert isinstance(response, ExtractSpecsFromDatasheetResponse)
            assert response.specs is None
            assert response.error is not None
            assert "Failed to download datasheet" in response.error

    def test_extract_specs_non_pdf_url(self, app: Flask, container: ServiceContainer):
        """Test handling when URL is not a PDF."""
        service = container.datasheet_extraction_service()

        # Mock document service to return HTML content
        html_content = b"<html><body>Not a PDF</body></html>"
        upload_doc = UploadDocumentSchema(
            title="Product Page",
            content=DocumentContentSchema(
                content=html_content,
                content_type="text/html"
            ),
            detected_type=AttachmentType.URL,
            preview_image=None
        )

        with patch.object(service.document_service, 'process_upload_url', return_value=upload_doc):
            response = service.extract_specs(
                analysis_query="0.96 inch OLED display module SSD1306",
                datasheet_url="https://example.com/product.html",
                progress_handle=StubProgressHandle()
            )

            assert isinstance(response, ExtractSpecsFromDatasheetResponse)
            assert response.specs is None
            assert response.error is not None
            assert "not a valid PDF datasheet" in response.error

    def test_extract_specs_ai_extraction_failure(self, app: Flask, container: ServiceContainer):
        """Test handling when AI extraction fails."""
        service = container.datasheet_extraction_service()

        # Skip test if AI runner is None (real AI not enabled)
        if service.ai_runner is None:
            pytest.skip("Real AI not enabled in test environment")

        # Mock document service to return valid PDF
        pdf_content = b"%PDF-1.4\n%Mock PDF content"
        upload_doc = UploadDocumentSchema(
            title="Datasheet",
            content=DocumentContentSchema(
                content=pdf_content,
                content_type="application/pdf"
            ),
            detected_type=AttachmentType.PDF,
            preview_image=None
        )

        with patch.object(service.document_service, 'process_upload_url', return_value=upload_doc):
            # Mock AI runner to raise exception
            with patch.object(service.ai_runner, 'run', side_effect=Exception("OpenAI API timeout")):
                response = service.extract_specs(
                    analysis_query="0.96 inch OLED display module SSD1306",
                    datasheet_url="https://cdn-shop.adafruit.com/datasheets/SSD1306.pdf"
                )

                assert isinstance(response, ExtractSpecsFromDatasheetResponse)
                assert response.specs is None
                assert response.error is not None
                assert "AI extraction failed" in response.error

    def test_extract_specs_temp_file_write_failure(self, app: Flask, container: ServiceContainer):
        """Test handling when temp file write fails."""
        service = container.datasheet_extraction_service()

        # Mock document service to return valid PDF
        pdf_content = b"%PDF-1.4\n%Mock PDF content"
        upload_doc = UploadDocumentSchema(
            title="Datasheet",
            content=DocumentContentSchema(
                content=pdf_content,
                content_type="application/pdf"
            ),
            detected_type=AttachmentType.PDF,
            preview_image=None
        )

        with patch.object(service.document_service, 'process_upload_url', return_value=upload_doc):
            # Mock tempfile.mkstemp to raise OSError (disk full)
            with patch('tempfile.mkstemp', side_effect=OSError("Disk quota exceeded")):
                response = service.extract_specs(
                    analysis_query="0.96 inch OLED display module SSD1306",
                    datasheet_url="https://cdn-shop.adafruit.com/datasheets/SSD1306.pdf",
                    progress_handle=StubProgressHandle()
                )

                assert isinstance(response, ExtractSpecsFromDatasheetResponse)
                assert response.specs is None
                assert response.error is not None
                assert "Failed to write temporary file" in response.error

    def test_extract_specs_no_ai_runner(self, app: Flask, container: ServiceContainer):
        """Test graceful handling when AI runner is None."""
        service = container.datasheet_extraction_service()

        # Mock document service to return valid PDF
        pdf_content = b"%PDF-1.4\n%Mock PDF content"
        upload_doc = UploadDocumentSchema(
            title="Datasheet",
            content=DocumentContentSchema(
                content=pdf_content,
                content_type="application/pdf"
            ),
            detected_type=AttachmentType.PDF,
            preview_image=None
        )

        # Temporarily set ai_runner to None
        original_runner = service.ai_runner
        service.ai_runner = None

        try:
            with patch.object(service.document_service, 'process_upload_url', return_value=upload_doc):
                response = service.extract_specs(
                    analysis_query="Test query",
                    datasheet_url="https://example.com/test.pdf",
                    progress_handle=StubProgressHandle()
                )

                assert isinstance(response, ExtractSpecsFromDatasheetResponse)
                assert response.specs is None
                assert response.error is not None
                assert "AI runner not available" in response.error
        finally:
            service.ai_runner = original_runner


class TestExtractSpecsFromDatasheetFunction:
    """Test datasheet spec extraction AIFunction."""

    def test_get_name(self, app: Flask, container: ServiceContainer):
        """Test function returns correct name."""
        function = container.datasheet_extraction_function()
        assert function.get_name() == "extract_specs_from_datasheet"

    def test_get_description(self, app: Flask, container: ServiceContainer):
        """Test function returns description."""
        function = container.datasheet_extraction_function()
        description = function.get_description()
        assert "PDF datasheet" in description
        assert "technical specifications" in description

    def test_get_model(self, app: Flask, container: ServiceContainer):
        """Test function returns correct request model."""
        function = container.datasheet_extraction_function()
        assert function.get_model() == ExtractSpecsFromDatasheetRequest

    def test_execute_delegates_to_service(self, app: Flask, container: ServiceContainer):
        """Test function.execute delegates to service.extract_specs."""
        function = container.datasheet_extraction_function()

        # Mock the service method
        expected_response = ExtractSpecsFromDatasheetResponse(
            specs=None,
            error="Test error"
        )

        with patch.object(
            function.datasheet_extraction_service,
            'extract_specs',
            return_value=expected_response
        ) as mock_extract:
            request = ExtractSpecsFromDatasheetRequest(
                analysis_query="Test analysis query",
                datasheet_url="https://example.com/test.pdf"
            )

            response = function.execute(request, StubProgressHandle())

            # Verify service was called with correct arguments
            mock_extract.assert_called_once_with(
                analysis_query="Test analysis query",
                datasheet_url="https://example.com/test.pdf",
                progress_handle=ANY
            )

            # Verify response is passed through
            assert response == expected_response
