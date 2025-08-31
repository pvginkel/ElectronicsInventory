"""Tests for AI service."""

import tempfile
from pathlib import Path
from unittest.mock import Mock, patch

import pytest
from sqlalchemy.orm import Session

from app.config import Settings
from app.models.type import Type
from app.schemas.ai_part_analysis import (
    DocumentSuggestionSchema,
)
from app.services.ai_service import AIService, PartAnalysisSuggestion, PdfLink
from app.services.type_service import TypeService
from app.services.url_thumbnail_service import URLThumbnailService
from app.utils.temp_file_manager import TempFileManager


@pytest.fixture
def ai_test_settings() -> Settings:
    """Settings for AI service testing."""
    return Settings(
        DATABASE_URL="sqlite:///:memory:",
        OPENAI_API_KEY="test-api-key",
        OPENAI_MODEL="gpt-5-mini",
        OPENAI_REASONING_EFFORT="medium",
        OPENAI_VERBOSITY="medium",
        OPENAI_MAX_OUTPUT_TOKENS=None,
    )


@pytest.fixture
def temp_file_manager():
    """Create temporary file manager for testing."""
    with tempfile.TemporaryDirectory() as temp_dir:
        yield TempFileManager(base_path=temp_dir, cleanup_age_hours=1.0)


@pytest.fixture
def mock_type_service(session: Session):
    """Create mock type service with sample types."""
    type_service = TypeService(db=session)

    # Create sample types
    relay_type = Type(name="Relay")
    micro_type = Type(name="Microcontroller")
    session.add_all([relay_type, micro_type])
    session.flush()

    return type_service


@pytest.fixture
def mock_url_thumbnail_service(session: Session, temp_file_manager: TempFileManager):
    """Create mock URL thumbnail service."""
    from unittest.mock import Mock

    from app.services.download_cache_service import DownloadCacheService

    # Create mock download cache service
    mock_download_cache = Mock(spec=DownloadCacheService)

    return URLThumbnailService(session, None, mock_download_cache)


@pytest.fixture
def mock_download_cache_service():
    """Create mock download cache service."""
    from unittest.mock import Mock

    from app.services.download_cache_service import DownloadCacheService

    return Mock(spec=DownloadCacheService)


@pytest.fixture
def ai_service(session: Session, ai_test_settings: Settings,
               temp_file_manager: TempFileManager, mock_type_service: TypeService,
               mock_url_thumbnail_service: URLThumbnailService, mock_download_cache_service):
    """Create AI service instance for testing."""
    from app.services.download_cache_service import DownloadCacheService
    DownloadCacheService(temp_file_manager)
    return AIService(
        db=session,
        config=ai_test_settings,
        temp_file_manager=temp_file_manager,
        type_service=mock_type_service,
        url_thumbnail_service=mock_url_thumbnail_service,
        download_cache_service=mock_download_cache_service
    )


def create_mock_ai_response(**kwargs):
    """Helper to create a properly structured mock AI response."""
    # Set default values that match PartAnalysisSuggestion schema
    defaults = {
        'manufacturer_code': None,
        'type': None,
        'description': None,
        'tags': [],
        'manufacturer': None,
        'package': None,
        'pin_count': None,
        'voltage_rating': None,
        'mounting_type': None,
        'series': None,
        'dimensions': None,
        'product_page': None,
        'product_image': None,
        'links': [],
        'pdf_documents': []
    }

    # Update with provided values
    defaults.update(kwargs)

    # Create PartAnalysisSuggestion instance
    return PartAnalysisSuggestion(**defaults)


class TestAIService:
    """Test cases for AIService."""

    def test_init_without_api_key(self, session: Session, temp_file_manager: TempFileManager,
                                  mock_type_service: TypeService, mock_url_thumbnail_service: URLThumbnailService,
                                  mock_download_cache_service):
        """Test AI service initialization without API key."""
        settings = Settings(DATABASE_URL="sqlite:///:memory:", OPENAI_API_KEY="")
        with pytest.raises(ValueError, match="OPENAI_API_KEY configuration is required"):
            AIService(
                db=session,
                config=settings,
                temp_file_manager=temp_file_manager,
                type_service=mock_type_service,
                url_thumbnail_service=mock_url_thumbnail_service,
                download_cache_service=mock_download_cache_service
            )

    def test_analyze_part_no_input(self, ai_service: AIService):
        """Test analyze_part with no text or image input."""
        with pytest.raises(ValueError, match="Either text_input or image_data must be provided"):
            ai_service.analyze_part()

    @patch('app.services.ai_service.OpenAI')
    def test_analyze_part_text_only_success(self, mock_openai_class, ai_service: AIService):
        """Test successful AI analysis with text input only."""
        # Mock OpenAI client and response
        mock_client = Mock()
        mock_openai_class.return_value = mock_client

        # Create structured mock response
        mock_parsed_response = create_mock_ai_response(
            manufacturer_code="TEST123",
            type="Relay",
            description="Test relay component",
            tags=["relay", "12V"]
        )

        mock_response = Mock()
        mock_response.status = "complete"
        mock_response.output_text = "mock response"
        mock_response.incomplete_details = None
        mock_response.output_parsed = mock_parsed_response

        mock_client.responses.parse.return_value = mock_response
        ai_service.client = mock_client

        # Perform analysis
        result = ai_service.analyze_part(text_input="Test relay 12V")

        # Verify result
        assert result.manufacturer_code == "TEST123"
        assert result.type == "Relay"
        assert result.description == "Test relay component"
        assert result.tags == ["relay", "12V"]
        assert result.type_is_existing is True
        assert result.existing_type_id is not None

    @patch('app.services.ai_service.OpenAI')
    def test_analyze_part_with_image(self, mock_openai_class, ai_service: AIService):
        """Test AI analysis with image input."""
        # Mock OpenAI client and response
        mock_client = Mock()
        mock_openai_class.return_value = mock_client

        mock_parsed_response = create_mock_ai_response(
            manufacturer_code="IMG123",
            type="Microcontroller",
            description="Arduino-like microcontroller",
            tags=["microcontroller", "arduino"]
        )

        mock_response = Mock()
        mock_response.status = "complete"
        mock_response.output_text = "mock response"
        mock_response.incomplete_details = None
        mock_response.output_parsed = mock_parsed_response

        mock_client.responses.parse.return_value = mock_response
        ai_service.client = mock_client

        # Create test image data
        image_data = b"fake_image_data"

        result = ai_service.analyze_part(
            text_input="Arduino board",
            image_data=image_data,
            image_mime_type="image/jpeg"
        )

        # Verify result
        assert result.manufacturer_code == "IMG123"
        assert result.type == "Microcontroller"
        assert result.type_is_existing is True

        # Verify OpenAI was called with image
        mock_client.responses.parse.assert_called_once()
        call_args = mock_client.responses.parse.call_args
        assert 'input' in call_args.kwargs

    @patch('app.services.ai_service.OpenAI')
    def test_analyze_part_new_type_suggestion(self, mock_openai_class, ai_service: AIService):
        """Test AI analysis suggesting a new type not in the system."""
        mock_client = Mock()
        mock_openai_class.return_value = mock_client

        mock_parsed_response = create_mock_ai_response(
            type="Power Supply",  # Not in existing types
            description="Switching power supply"
        )

        mock_response = Mock()
        mock_response.status = "complete"
        mock_response.output_text = "mock response"
        mock_response.incomplete_details = None
        mock_response.output_parsed = mock_parsed_response

        mock_client.responses.parse.return_value = mock_response
        ai_service.client = mock_client

        result = ai_service.analyze_part(text_input="12V power supply")

        assert result.type == "Power Supply"
        assert result.type_is_existing is False
        assert result.existing_type_id is None

    @patch('app.services.ai_service.OpenAI')
    def test_analyze_part_with_document_download(self, mock_openai_class, ai_service: AIService):
        """Test AI analysis with document download."""
        mock_client = Mock()
        mock_openai_class.return_value = mock_client

        # Create mock link object
        mock_link = PdfLink(
            url="https://example.com/datasheet.pdf",
            link_type="datasheet",
            description="Complete datasheet"
        )

        mock_parsed_response = create_mock_ai_response(
            manufacturer_code="DOC123",
            type="Relay",
            description="Relay with datasheet",
            pdf_documents=[mock_link]
        )

        mock_response = Mock()
        mock_response.status = "complete"
        mock_response.output_text = "mock response"
        mock_response.incomplete_details = None
        mock_response.output_parsed = mock_parsed_response

        mock_client.responses.parse.return_value = mock_response
        ai_service.client = mock_client

        # Mock the _document_from_link method to avoid complex URL processing
        with patch.object(ai_service, '_document_from_link') as mock_doc_from_link:
            mock_doc_from_link.return_value = DocumentSuggestionSchema(
                url="https://example.com/datasheet.pdf",
                url_type="pdf_document",
                document_type="datasheet",
                description="Complete datasheet"
            )

            result = ai_service.analyze_part(text_input="Test relay with docs")

            # Verify result includes document
            assert result.manufacturer_code == "DOC123"
            assert result.type == "Relay"
            assert len(result.documents) == 1
            assert result.documents[0].url == "https://example.com/datasheet.pdf"

    @patch('app.services.ai_service.OpenAI')
    def test_analyze_part_openai_api_error(self, mock_openai_class, ai_service: AIService):
        """Test handling of OpenAI API errors."""
        mock_client = Mock()
        mock_openai_class.return_value = mock_client

        # Mock OpenAI API raising an exception
        from openai import OpenAIError
        mock_client.responses.parse.side_effect = OpenAIError("API Error")

        ai_service.client = mock_client

        with pytest.raises(Exception, match="API Error"):
            ai_service.analyze_part(text_input="Test component")

    @patch('app.services.ai_service.OpenAI')
    def test_analyze_part_invalid_json_response(self, mock_openai_class, ai_service: AIService):
        """Test handling of invalid JSON response from OpenAI."""
        mock_client = Mock()
        mock_openai_class.return_value = mock_client

        # Mock response with no parsed output
        mock_response = Mock()
        mock_response.status = "incomplete"
        mock_response.output_text = "incomplete response"
        mock_response.incomplete_details = "parsing error"
        mock_response.output_parsed = None

        mock_client.responses.parse.return_value = mock_response
        ai_service.client = mock_client

        with pytest.raises(Exception, match="Empty response from OpenAI"):
            ai_service.analyze_part(text_input="Test component")

    def test_download_document_non_https(self, ai_service: AIService):
        """Test that non-HTTPS URLs are rejected for document download."""
        mock_link = Mock()
        mock_link.url = "http://example.com/datasheet.pdf"
        mock_link.link_type = "datasheet"
        mock_link.description = "Test doc"

        temp_dir = Path("/tmp/test")

        # Mock URL thumbnail service to avoid actual network calls
        with patch.object(ai_service.url_thumbnail_service, 'extract_metadata') as mock_extract:
            mock_extract.side_effect = Exception("Non-HTTPS URLs not supported")

            result = ai_service._document_from_link(mock_link, temp_dir, "test")

            # Should still return a document but with no preview
            assert result.url == "http://example.com/datasheet.pdf"
            assert result.document_type == "datasheet"
            assert result.preview is None

    def test_download_document_unsupported_content_type(self, ai_service: AIService):
        """Test handling of unsupported content types."""
        mock_link = Mock()
        mock_link.url = "https://example.com/not-a-doc.html"
        mock_link.link_type = "datasheet"
        mock_link.description = "Test doc"

        temp_dir = Path("/tmp/test")

        # Mock URL thumbnail service to return HTML content type
        with patch.object(ai_service.url_thumbnail_service, 'extract_metadata') as mock_extract:
            mock_extract.return_value = {
                'title': 'HTML Page',
                'content_type': 'text/html'
            }

            result = ai_service._document_from_link(mock_link, temp_dir, "test")

            # Should still return a document
            assert result.url == "https://example.com/not-a-doc.html"
            assert result.document_type == "datasheet"

    def test_download_document_file_too_large(self, ai_service: AIService):
        """Test handling of files that are too large."""
        mock_link = Mock()
        mock_link.url = "https://example.com/huge-file.pdf"
        mock_link.link_type = "datasheet"
        mock_link.description = "Huge doc"

        temp_dir = Path("/tmp/test")

        # Mock URL thumbnail service to simulate large file
        with patch.object(ai_service.url_thumbnail_service, 'extract_metadata') as mock_extract:
            mock_extract.side_effect = Exception("File too large")

            result = ai_service._document_from_link(mock_link, temp_dir, "test")

            # Should still return a document but with no preview
            assert result.url == "https://example.com/huge-file.pdf"
            assert result.document_type == "datasheet"
            assert result.preview is None

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

    @patch('app.services.ai_service.OpenAI')
    def test_create_analysis_schema(self, mock_openai_class, ai_service: AIService):
        """Test that the analysis schema is created correctly."""
        # This is mostly testing that our mock structure works
        mock_client = Mock()
        mock_openai_class.return_value = mock_client

        mock_parsed_response = create_mock_ai_response(
            manufacturer_code="SCHEMA123",
            type="Test Component",
            description="Component for schema testing",
            tags=["test", "schema"],
            package="SMD",
            pin_count=8,
            voltage_rating="5V"
        )

        mock_response = Mock()
        mock_response.status = "complete"
        mock_response.output_text = "mock response"
        mock_response.incomplete_details = None
        mock_response.output_parsed = mock_parsed_response

        mock_client.responses.parse.return_value = mock_response
        ai_service.client = mock_client

        result = ai_service.analyze_part(text_input="Test component for schema")

        # Verify all fields are properly mapped
        assert result.manufacturer_code == "SCHEMA123"
        assert result.type == "Test Component"
        assert result.description == "Component for schema testing"
        assert result.tags == ["test", "schema"]
        assert result.package == "SMD"
        assert result.pin_count == 8
        assert result.voltage_rating == "5V"

    @patch('app.services.ai_service.OpenAI')
    def test_build_responses_api_input_text_only(self, mock_openai_class, ai_service: AIService):
        """Test building API input for text-only requests."""
        mock_client = Mock()
        mock_openai_class.return_value = mock_client

        mock_parsed_response = create_mock_ai_response(type="Test")
        mock_response = Mock()
        mock_response.status = "complete"
        mock_response.output_parsed = mock_parsed_response
        mock_client.responses.parse.return_value = mock_response
        ai_service.client = mock_client

        ai_service.analyze_part(text_input="Test component")

        # Verify the API was called with text input
        mock_client.responses.parse.assert_called_once()
        call_args = mock_client.responses.parse.call_args
        assert 'input' in call_args.kwargs

        input_content = call_args.kwargs['input']
        # For text-only input, it should be a string
        assert isinstance(input_content, str)
        assert 'Test component' in input_content

    @patch('app.services.ai_service.OpenAI')
    def test_build_responses_api_input_with_image(self, mock_openai_class, ai_service: AIService):
        """Test building API input for requests with image."""
        mock_client = Mock()
        mock_openai_class.return_value = mock_client

        mock_parsed_response = create_mock_ai_response(type="Test")
        mock_response = Mock()
        mock_response.status = "complete"
        mock_response.output_parsed = mock_parsed_response
        mock_client.responses.parse.return_value = mock_response
        ai_service.client = mock_client

        ai_service.analyze_part(
            text_input="Test component",
            image_data=b"fake_image",
            image_mime_type="image/jpeg"
        )

        # Verify the API was called with image input
        mock_client.responses.parse.assert_called_once()
        call_args = mock_client.responses.parse.call_args
        assert 'input' in call_args.kwargs

        input_content = call_args.kwargs['input']
        # For text + image, it should be a list with a user message
        assert isinstance(input_content, list)
        assert len(input_content) == 1
        user_message = input_content[0]
        assert user_message['role'] == 'user'

        # Should have multipart content with text and image
        content = user_message['content']
        assert isinstance(content, list)
        has_text = any(part.get('type') == 'text' for part in content)
        has_image = any(part.get('type') == 'image_url' for part in content)
        assert has_text and has_image



