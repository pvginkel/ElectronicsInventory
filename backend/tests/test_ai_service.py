"""Tests for AI service."""

import tempfile
from collections.abc import Generator
from unittest.mock import Mock, patch

import pytest
from sqlalchemy.orm import Session

from app.config import Settings
from app.models.part_attachment import AttachmentType
from app.models.type import Type
from app.schemas.ai_part_analysis import DocumentSuggestionSchema
from app.services.ai_service import AIService, PartAnalysisSuggestion
from app.services.document_service import DocumentService
from app.services.download_cache_service import DownloadCacheService
from app.services.type_service import TypeService
from app.utils.temp_file_manager import TempFileManager


@pytest.fixture
def ai_test_settings() -> Settings:
    """Settings for AI service testing."""
    return Settings(
        DATABASE_URL="sqlite:///:memory:",
        OPENAI_API_KEY="test-api-key",
        OPENAI_MODEL="gpt-5-mini",
        OPENAI_REASONING_EFFORT="low",
        OPENAI_VERBOSITY="medium",
        OPENAI_MAX_OUTPUT_TOKENS=None,
        OPENAI_DUMMY_RESPONSE_PATH=None,  # Override .env file setting for tests
    )


@pytest.fixture
def temp_file_manager() -> Generator[TempFileManager, None, None]:
    """Create temporary file manager for testing."""
    with tempfile.TemporaryDirectory() as temp_dir:
        yield TempFileManager(base_path=temp_dir, cleanup_age_hours=1.0)


@pytest.fixture
def mock_type_service(session: Session) -> TypeService:
    """Create mock type service with sample types."""
    type_service = TypeService(db=session)

    # Create sample types
    relay_type = Type(name="Relay")
    micro_type = Type(name="Microcontroller")
    session.add_all([relay_type, micro_type])
    session.flush()

    return type_service


@pytest.fixture
def mock_download_cache_service() -> DownloadCacheService:
    """Create mock download cache service."""
    return Mock(spec=DownloadCacheService)


@pytest.fixture
def mock_document_service() -> DocumentService:
    """Create mock document service."""
    return Mock(spec=DocumentService)


@pytest.fixture
def mock_metrics_service(session: Session):
    """Create mock metrics service."""
    from app.services.metrics_service import MetricsService
    return MetricsService(db=session)


@pytest.fixture
def ai_service(session: Session, ai_test_settings: Settings,
               temp_file_manager: TempFileManager, mock_type_service: TypeService,
               mock_download_cache_service: DownloadCacheService,
               mock_document_service: DocumentService, mock_metrics_service):
    """Create AI service instance for testing."""
    return AIService(
        db=session,
        config=ai_test_settings,
        temp_file_manager=temp_file_manager,
        type_service=mock_type_service,
        download_cache_service=mock_download_cache_service,
        document_service=mock_document_service,
        metrics_service=mock_metrics_service
    )


def create_mock_ai_response(**kwargs):
    """Helper to create a properly structured mock AI response."""
    # Set default values that match PartAnalysisSuggestion schema
    defaults = {
        'product_name': None,
        'product_family': None,
        'product_category': None,
        'manufacturer': None,
        'manufacturer_part_number': None,
        'package_type': None,
        'mounting_type': None,
        'part_pin_count': None,
        'part_pin_pitch': None,
        'voltage_rating': None,
        'input_voltage': None,
        'output_voltage': None,
        'physical_dimensions': None,
        'tags': [],
        'product_page_urls': [],
        'datasheet_urls': [],
        'pinout_urls': []
    }

    # Update with provided values
    defaults.update(kwargs)

    # Create PartAnalysisSuggestion instance
    return PartAnalysisSuggestion(**defaults)


class TestAIService:
    """Test cases for AIService."""

    def test_init_without_api_key(self, session: Session, temp_file_manager: TempFileManager,
                                  mock_type_service: TypeService,
                                  mock_download_cache_service: DownloadCacheService,
                                  mock_document_service: DocumentService, mock_metrics_service):
        """Test AI service initialization without API key."""
        settings = Settings(DATABASE_URL="sqlite:///:memory:", OPENAI_API_KEY="")
        with pytest.raises(ValueError, match="OPENAI_API_KEY configuration is required"):
            AIService(
                db=session,
                config=settings,
                temp_file_manager=temp_file_manager,
                type_service=mock_type_service,
                download_cache_service=mock_download_cache_service,
                document_service=mock_document_service,
                metrics_service=mock_metrics_service
            )

    def test_analyze_part_no_input(self, ai_service: AIService):
        """Test analyze_part with no text or image input."""
        from unittest.mock import Mock
        mock_progress = Mock()
        with pytest.raises(NotImplementedError, match="Image input is not yet implemented; user_prompt is required"):
            ai_service.analyze_part(None, None, None, mock_progress)

    @patch('app.utils.ai.ai_runner.AIRunner.run')
    def test_analyze_part_text_only_success(self, mock_run, ai_service: AIService):
        """Test successful AI analysis with text input only."""
        # Create structured mock response - using correct PartAnalysisSuggestion fields
        from app.utils.ai.ai_runner import AIResponse
        mock_ai_response = create_mock_ai_response(
            manufacturer_part_number="TEST123",
            product_category="Relay",
            product_name="Test relay component",
            tags=["relay", "12V"]
        )
        mock_run.return_value = AIResponse(
            response=mock_ai_response,
            output_text="Mock response",
            elapsed_time=1.0,
            input_tokens=100,
            cached_input_tokens=0,
            output_tokens=50,
            reasoning_tokens=0,
            cost=None
        )

        # Perform analysis
        mock_progress = Mock()
        result = ai_service.analyze_part("Test relay 12V", None, None, mock_progress)

        # Verify result - these are fields from AIPartAnalysisResultSchema
        assert result.manufacturer_code == "TEST123"
        assert result.type == "Relay"  # This should be matched to existing type
        assert result.description == "Test relay component"
        assert result.tags == ["relay", "12V"]
        assert result.type_is_existing is True
        assert result.existing_type_id is not None

        # Verify the runner was called once
        mock_run.assert_called_once()

    @pytest.mark.skip(reason="Image support not implemented yet in AI service")
    def test_analyze_part_with_image(self, ai_service: AIService):
        """Test AI analysis with image input - currently not supported."""
        # Create test image data
        image_data = b"fake_image_data"
        mock_progress = Mock()

        # Should raise exception since images aren't supported yet
        with pytest.raises(Exception, match="Image data currently not supported"):
            ai_service.analyze_part("Arduino board", image_data, "image/jpeg", mock_progress)

    @patch('app.utils.ai.ai_runner.AIRunner.run')
    def test_analyze_part_new_type_suggestion(self, mock_run, ai_service: AIService):
        """Test AI analysis suggesting a new type not in the system."""
        # Create structured mock response - using correct PartAnalysisSuggestion fields
        from app.utils.ai.ai_runner import AIResponse
        mock_ai_response = create_mock_ai_response(
            product_category="Power Supply",  # Not in existing types
            product_name="Switching power supply",
            tags=["power", "supply", "switching"]
        )
        mock_run.return_value = AIResponse(
            response=mock_ai_response,
            output_text="Mock response",
            elapsed_time=1.0,
            input_tokens=100,
            cached_input_tokens=0,
            output_tokens=50,
            reasoning_tokens=0,
            cost=None
        )

        mock_progress = Mock()
        result = ai_service.analyze_part("12V power supply", None, None, mock_progress)

        # Verify result - this type should not match existing types
        assert result.type == "Power Supply"
        assert result.type_is_existing is False
        assert result.existing_type_id is None
        assert result.description == "Switching power supply"

        # Verify the runner was called once
        mock_run.assert_called_once()

    @patch('app.utils.ai.ai_runner.AIRunner.run')
    def test_analyze_part_with_document_download(self, mock_run, ai_service: AIService):
        """Test AI analysis with document download."""
        # Create structured mock response with document URLs
        from app.utils.ai.ai_runner import AIResponse
        mock_ai_response = create_mock_ai_response(
            manufacturer_part_number="DOC123",
            product_category="Relay",
            product_name="Relay with datasheet",
            tags=["relay", "documentation"],
            datasheet_urls=["https://example.com/datasheet.pdf"]
        )
        mock_run.return_value = AIResponse(
            response=mock_ai_response,
            output_text="Mock response",
            elapsed_time=1.0,
            input_tokens=100,
            cached_input_tokens=0,
            output_tokens=50,
            reasoning_tokens=0,
            cost=None
        )

        # Mock the _document_from_link method to avoid complex URL processing
        with patch.object(ai_service, '_document_from_link') as mock_doc_from_link:
            mock_doc_from_link.return_value = DocumentSuggestionSchema(
                url="https://example.com/datasheet.pdf",
                document_type="datasheet"
            )

            mock_progress = Mock()
            result = ai_service.analyze_part("Test relay with docs", None, None, mock_progress)

            # Verify result includes documents
            assert result.manufacturer_code == "DOC123"
            assert result.type == "Relay"
            assert result.description == "Relay with datasheet"
            assert len(result.documents) == 1  # Only datasheet URL should be processed
            assert result.documents[0].url == "https://example.com/datasheet.pdf"
            assert result.documents[0].document_type == "datasheet"

            # Verify the runner was called once and _document_from_link was called
            mock_run.assert_called_once()
            # Should be called once for datasheet URL
            assert mock_doc_from_link.call_count == 1

    @patch('app.utils.ai.ai_runner.AIRunner.run')
    def test_analyze_part_openai_api_error(self, mock_run, ai_service: AIService):
        """Test handling of OpenAI API errors."""
        # Mock the OpenAI API call to raise an exception
        from openai import OpenAIError
        mock_run.side_effect = OpenAIError("API Error")

        with pytest.raises(OpenAIError, match="API Error"):
            mock_progress = Mock()
            ai_service.analyze_part("Test component", None, None, mock_progress)

        # Verify the runner was called
        mock_run.assert_called_once()

    @patch('app.utils.ai.ai_runner.AIRunner.run')
    def test_analyze_part_invalid_json_response(self, mock_run, ai_service: AIService):
        """Test handling of invalid JSON response from OpenAI."""
        # Mock the OpenAI API call to raise an exception simulating empty/invalid response
        mock_run.side_effect = Exception("Empty response from OpenAI status incomplete, incomplete details: parsing error")

        with pytest.raises(Exception, match="Empty response from OpenAI"):
            mock_progress = Mock()
            ai_service.analyze_part("Test component", None, None, mock_progress)

        # Verify the runner was called
        mock_run.assert_called_once()

    def test_download_document_unsupported_content_type(self, ai_service: AIService):
        """Test handling of unsupported content types."""
        from app.schemas.upload_document import (
            DocumentContentSchema,
            UploadDocumentSchema,
        )

        # Mock document service to return a processed upload document
        mock_upload_doc = UploadDocumentSchema(
            title="HTML Page",
            content=DocumentContentSchema(
                content=b"<html><title>HTML Page</title></html>",
                content_type="text/html"
            ),
            detected_type=AttachmentType.URL,
            preview_image=None
        )

        with patch.object(ai_service.document_service, 'process_upload_url') as mock_process:
            mock_process.return_value = mock_upload_doc

            result = ai_service._document_from_link("https://example.com/not-a-doc.html", "datasheet")

            # Should still return a document
            assert result is not None
            assert result.url == "https://example.com/not-a-doc.html"
            assert result.document_type == "datasheet"
            assert result.preview is not None
            assert result.preview.title == "HTML Page"  # Should extract title from HTML

    def test_sanitize_filename_edge_cases(self, ai_service: AIService):
        """Test filename sanitization with edge cases."""
        # Test with various problematic characters
        test_cases = [
            ("normal_file.pdf", "normal_file.pdf"),
            ("file with spaces.pdf", "file with spaces.pdf"),  # Spaces are not replaced by _sanitize_filename
            ("file/with\\bad:chars.pdf", "bad_chars.pdf"),  # Path is removed, then chars replaced
            ("../../../etc/passwd", "passwd"),  # Path is removed
            ("file<>|?*.pdf", "file_____.pdf"),  # Each special char replaced with _
            ("", "document.pdf"),
            ("...", "..."),
            ("a" * 300, "a" * 100)  # Test length limit
        ]

        for input_name, expected in test_cases:
            result = ai_service._sanitize_filename(input_name)
            if expected == "a" * 100:
                assert len(result) <= 100
                assert result.startswith("a")
            else:
                assert result == expected

    def test_classify_urls_internal_method(self, ai_service: AIService):
        """Test the internal URL classifier function."""
        from unittest.mock import Mock

        from app.schemas.upload_document import (
            DocumentContentSchema,
            UploadDocumentSchema,
        )
        from app.utils.ai.url_classification import ClassifyUrlsRequest

        # Mock document service to return different processed documents
        mock_documents = [
            # PDF document
            UploadDocumentSchema(
                title="PDF Document",
                content=DocumentContentSchema(
                    content=b"%PDF-1.4 fake pdf content",
                    content_type="application/pdf"
                ),
                detected_type=AttachmentType.PDF,
                preview_image=None
            ),
            # Image document
            UploadDocumentSchema(
                title="Image File",
                content=DocumentContentSchema(
                    content=b"\x89PNG\r\n\x1a\n fake image",
                    content_type="image/png"
                ),
                detected_type=AttachmentType.IMAGE,
                preview_image=None
            ),
            # HTML webpage
            UploadDocumentSchema(
                title="Product Page",
                content=DocumentContentSchema(
                    content=b"<html><title>Product</title></html>",
                    content_type="text/html"
                ),
                detected_type=AttachmentType.URL,
                preview_image=None
            )
        ]

        with patch.object(ai_service.document_service, 'process_upload_url') as mock_process:
            mock_process.side_effect = mock_documents

            # Test with multiple URLs
            request = ClassifyUrlsRequest(urls=[
                "https://example.com/datasheet.pdf",
                "https://example.com/image.jpg",
                "https://example.com/product.html"
            ])

            mock_progress = Mock()
            result = ai_service.url_classifier_function.classify_url(request, mock_progress)

            # Verify classification results
            assert len(result.urls) == 3
            assert result.urls[0].classification == "pdf"
            assert result.urls[0].url == "https://example.com/datasheet.pdf"
            assert result.urls[1].classification == "image"
            assert result.urls[1].url == "https://example.com/image.jpg"
            assert result.urls[2].classification == "webpage"
            assert result.urls[2].url == "https://example.com/product.html"

    def test_classify_urls_with_error(self, ai_service: AIService):
        """Test URL classifier function with URL extraction errors."""
        from unittest.mock import Mock

        from app.utils.ai.url_classification import ClassifyUrlsRequest

        # Mock download_cache_service to raise an exception
        with patch.object(ai_service.download_cache_service, 'get_cached_content') as mock_get:
            mock_get.side_effect = Exception("Network error")

            request = ClassifyUrlsRequest(urls=["https://invalid.url"])
            mock_progress = Mock()
            result = ai_service.url_classifier_function.classify_url(request, mock_progress)

            # Should return invalid classification for error case
            assert len(result.urls) == 1
            assert result.urls[0].classification == "invalid"
            assert result.urls[0].url == "https://invalid.url"

    def test_classify_urls_with_http_error(self, ai_service: AIService):
        """Test URL classifier function with HTTP status code errors."""
        from unittest.mock import Mock

        from app.utils.ai.url_classification import ClassifyUrlsRequest

        # Mock download_cache_service to return None (failed download)
        with patch.object(ai_service.download_cache_service, 'get_cached_content') as mock_get:
            mock_get.return_value = None  # Failed to download

            request = ClassifyUrlsRequest(urls=["https://example.com/missing"])
            mock_progress = Mock()
            result = ai_service.url_classifier_function.classify_url(request, mock_progress)

            # Should return invalid classification with HTTP status information
            assert len(result.urls) == 1
            assert result.urls[0].classification == "invalid"
            assert result.urls[0].url == "https://example.com/missing"

    @patch('app.utils.ai.ai_runner.AIRunner.run')
    def test_function_calling_flow_via_analyze_part(self, mock_run, ai_service: AIService):
        """Test that analyze_part can still work with the new function calling implementation."""
        # Mock the entire OpenAI API call to return a structured response
        from app.utils.ai.ai_runner import AIResponse
        mock_ai_response = create_mock_ai_response(
            manufacturer_part_number="FUNC123",
            product_category="Relay",
            product_name="Function call test relay"
        )
        mock_run.return_value = AIResponse(
            response=mock_ai_response,
            output_text="Mock response",
            elapsed_time=1.0,
            input_tokens=100,
            cached_input_tokens=0,
            output_tokens=50,
            reasoning_tokens=0,
            cost=None
        )

        # Test the function calling flow
        mock_progress = Mock()
        result = ai_service.analyze_part("Test relay with datasheet URL", None, None, mock_progress)

        # Verify the runner was called
        mock_run.assert_called_once()

        # Verify final result
        assert result.manufacturer_code == "FUNC123"
        assert result.type == "Relay"
        assert result.description == "Function call test relay"

