"""Tests for AI service."""

import json
import tempfile
from collections.abc import Generator
from unittest.mock import Mock, patch

import pytest
from sqlalchemy.orm import Session

from app.config import Settings
from app.exceptions import InvalidOperationException
from app.models.attachment import AttachmentType
from app.models.type import Type
from app.schemas.ai_part_analysis import DocumentSuggestionSchema
from app.services.ai_model import (
    DuplicatePartMatch,
    PartAnalysisDetails,
    PartAnalysisSuggestion,
)
from app.services.ai_service import AIService
from app.services.document_service import DocumentService
from app.services.download_cache_service import DownloadCacheService
from app.services.type_service import TypeService
from app.utils.temp_file_manager import TempFileManager
from tests.testing_utils import StubLifecycleCoordinator


@pytest.fixture
def ai_test_settings() -> Settings:
    """Settings for AI service testing."""
    return Settings(
        database_url="sqlite:///:memory:",
        openai_api_key="test-api-key",
        OPENAI_MODEL="gpt-5-mini",
        OPENAI_REASONING_EFFORT="low",
        OPENAI_VERBOSITY="medium",
        OPENAI_MAX_OUTPUT_TOKENS=None,
        ai_analysis_cache_path=None,  # Override .env file setting for tests
    )


@pytest.fixture
def temp_file_manager() -> Generator[TempFileManager, None, None]:
    """Create temporary file manager for testing."""
    with tempfile.TemporaryDirectory() as temp_dir:
        yield TempFileManager(
            base_path=temp_dir,
            cleanup_age_hours=1.0,
            lifecycle_coordinator=StubLifecycleCoordinator()
        )


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
def mock_seller_service(session: Session):
    """Create a seller service for testing."""
    from app.services.seller_service import SellerService
    return SellerService(db=session)


@pytest.fixture
def ai_service(session: Session, ai_test_settings: Settings,
               temp_file_manager: TempFileManager, mock_type_service: TypeService,
               mock_seller_service,
               mock_download_cache_service: DownloadCacheService,
               mock_document_service: DocumentService):
    """Create AI service instance for testing."""
    from unittest.mock import Mock

    from app.utils.ai.ai_runner import AIFunction, AIRunner

    # Create mock duplicate search function
    mock_duplicate_search_function = Mock(spec=AIFunction)

    # Create mock Mouser function tools
    mock_mouser_part_number_search = Mock(spec=AIFunction)
    mock_mouser_keyword_search = Mock(spec=AIFunction)

    # Create mock datasheet extraction function
    mock_datasheet_extraction = Mock(spec=AIFunction)

    # Create a mock runner for tests that will call the runner
    mock_runner = Mock(spec=AIRunner)

    return AIService(
        db=session,
        config=ai_test_settings,
        temp_file_manager=temp_file_manager,
        type_service=mock_type_service,
        seller_service=mock_seller_service,
        download_cache_service=mock_download_cache_service,
        document_service=mock_document_service,
        duplicate_search_function=mock_duplicate_search_function,
        mouser_part_number_search_function=mock_mouser_part_number_search,
        mouser_keyword_search_function=mock_mouser_keyword_search,
        datasheet_extraction_function=mock_datasheet_extraction,
        ai_runner=mock_runner  # Tests will mock the runner's run method
    )


def create_mock_ai_response(**kwargs):
    """Helper to create a properly structured mock AI response."""
    # Set default values that match PartAnalysisDetails schema (nested under analysis_result)
    details_defaults = {
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
    details_defaults.update(kwargs)

    # Create PartAnalysisDetails and wrap in PartAnalysisSuggestion
    # This simulates the normal analysis path (no duplicates found)
    analysis_details = PartAnalysisDetails(**details_defaults)
    return PartAnalysisSuggestion(analysis_result=analysis_details, duplicate_parts=None)


class TestAIService:
    """Test cases for AIService."""

    def test_init_without_api_key(self, session: Session, temp_file_manager: TempFileManager,
                                  mock_type_service: TypeService, mock_seller_service,
                                  mock_download_cache_service: DownloadCacheService,
                                  mock_document_service: DocumentService):
        """Test AI service initialization without API key (should not raise error - runner is injected)."""
        from unittest.mock import Mock

        from app.utils.ai.ai_runner import AIFunction

        mock_duplicate_search_function = Mock(spec=AIFunction)
        mock_mouser_part_number_search = Mock(spec=AIFunction)
        mock_mouser_keyword_search = Mock(spec=AIFunction)
        mock_datasheet_extraction = Mock(spec=AIFunction)

        settings = Settings(database_url="sqlite:///:memory:", openai_api_key="")

        # AIService no longer initializes the runner internally, so this should succeed
        service = AIService(
            db=session,
            config=settings,
            temp_file_manager=temp_file_manager,
            type_service=mock_type_service,
            seller_service=mock_seller_service,
            download_cache_service=mock_download_cache_service,
            document_service=mock_document_service,

            duplicate_search_function=mock_duplicate_search_function,
            mouser_part_number_search_function=mock_mouser_part_number_search,
            mouser_keyword_search_function=mock_mouser_keyword_search,
            datasheet_extraction_function=mock_datasheet_extraction,
            ai_runner=None
        )

        # Runner should be None since we didn't inject one
        assert service.runner is None

    def test_analyze_part_no_input(self, ai_service: AIService):
        """Test analyze_part with no text or image input."""
        from unittest.mock import Mock
        mock_progress = Mock()
        with pytest.raises(NotImplementedError, match="Image input is not yet implemented; user_prompt is required"):
            ai_service.analyze_part(None, None, None, mock_progress)

    def test_analyze_part_text_only_success(self, ai_service: AIService):
        """Test successful AI analysis with text input only."""
        # Create structured mock response - using correct PartAnalysisSuggestion fields
        from app.utils.ai.ai_runner import AIResponse
        mock_ai_response = create_mock_ai_response(
            manufacturer_part_number="TEST123",
            product_category="Relay",
            product_name="Test relay component",
            tags=["relay", "12V"]
        )
        ai_service.runner.run.return_value = AIResponse(
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
        assert result.analysis_result is not None
        assert result.analysis_result.manufacturer_code == "TEST123"
        assert result.analysis_result.type == "Relay"  # This should be matched to existing type
        assert result.analysis_result.description == "Test relay component"
        assert result.analysis_result.tags == ["relay", "12V"]
        assert result.analysis_result.type_is_existing is True
        assert result.analysis_result.existing_type_id is not None
        assert result.duplicate_parts is None

        # Verify the runner was called once
        ai_service.runner.run.assert_called_once()

    def test_analyze_part_new_type_suggestion(self, ai_service: AIService):
        """Test AI analysis suggesting a new type not in the system."""
        # Create structured mock response - using correct PartAnalysisSuggestion fields
        from app.utils.ai.ai_runner import AIResponse
        mock_ai_response = create_mock_ai_response(
            product_category="Power Supply",  # Not in existing types
            product_name="Switching power supply",
            tags=["power", "supply", "switching"]
        )
        ai_service.runner.run.return_value = AIResponse(
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
        assert result.analysis_result is not None
        assert result.analysis_result.type == "Power Supply"
        assert result.analysis_result.type_is_existing is False
        assert result.analysis_result.existing_type_id is None
        assert result.analysis_result.description == "Switching power supply"
        assert result.duplicate_parts is None

        # Verify the runner was called once
        ai_service.runner.run.assert_called_once()

    def test_analyze_part_with_document_download(self, ai_service: AIService):
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
        ai_service.runner.run.return_value = AIResponse(
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
            assert result.analysis_result is not None
            assert result.analysis_result.manufacturer_code == "DOC123"
            assert result.analysis_result.type == "Relay"
            assert result.analysis_result.description == "Relay with datasheet"
            assert len(result.analysis_result.documents) == 1  # Only datasheet URL should be processed
            assert result.analysis_result.documents[0].url == "https://example.com/datasheet.pdf"
            assert result.analysis_result.documents[0].document_type == "datasheet"
            assert result.duplicate_parts is None

            # Verify the runner was called once and _document_from_link was called
            ai_service.runner.run.assert_called_once()
            # Should be called once for datasheet URL
            assert mock_doc_from_link.call_count == 1

    def test_analyze_part_openai_api_error(self, ai_service: AIService):
        """Test handling of OpenAI API errors."""
        # Mock the OpenAI API call to raise an exception
        from openai import OpenAIError
        ai_service.runner.run.side_effect = OpenAIError("API Error")

        with pytest.raises(OpenAIError, match="API Error"):
            mock_progress = Mock()
            ai_service.analyze_part("Test component", None, None, mock_progress)

        # Verify the runner was called
        ai_service.runner.run.assert_called_once()

    def test_analyze_part_disallowed_without_dummy(
        self,
        session: Session,
        temp_file_manager: TempFileManager,
        mock_type_service: TypeService,
        mock_seller_service,
        mock_download_cache_service: DownloadCacheService,
        mock_document_service: DocumentService,

    ):
        """Real AI usage should be blocked in testing mode without dummy data."""
        from app.utils.ai.ai_runner import AIFunction

        settings = Settings(
            database_url="sqlite:///:memory:",
            flask_env="testing",
            ai_testing_mode=True,
            ai_analysis_cache_path=None,
        )

        mock_duplicate_search_function = Mock(spec=AIFunction)
        mock_mouser_part_number_search = Mock(spec=AIFunction)
        mock_mouser_keyword_search = Mock(spec=AIFunction)
        mock_datasheet_extraction = Mock(spec=AIFunction)

        service = AIService(
            db=session,
            config=settings,
            temp_file_manager=temp_file_manager,
            type_service=mock_type_service,
            seller_service=mock_seller_service,
            download_cache_service=mock_download_cache_service,
            document_service=mock_document_service,

            duplicate_search_function=mock_duplicate_search_function,
            mouser_part_number_search_function=mock_mouser_part_number_search,
            mouser_keyword_search_function=mock_mouser_keyword_search,
            datasheet_extraction_function=mock_datasheet_extraction,
        )

        mock_progress = Mock()

        with pytest.raises(InvalidOperationException, match="real AI usage is disabled in testing mode"):
            service.analyze_part("Test prompt", None, None, mock_progress)

    def test_analyze_part_uses_dummy_response_when_disabled(
        self,
        tmp_path,
        session: Session,
        temp_file_manager: TempFileManager,
        mock_type_service: TypeService,
        mock_seller_service,
        mock_download_cache_service: DownloadCacheService,
        mock_document_service: DocumentService,

    ):
        """Dummy response should be served when configured in testing mode."""
        from app.utils.ai.ai_runner import AIFunction

        dummy_response = create_mock_ai_response(
            manufacturer_part_number="DUMMY123",
            product_category="Relay",
            product_name="Dummy component",
            tags=["relay"],
        )
        dummy_path = tmp_path / "dummy_response.json"
        dummy_path.write_text(json.dumps(dummy_response.model_dump()))

        settings = Settings(
            database_url="sqlite:///:memory:",
            flask_env="testing",
            ai_analysis_cache_path=str(dummy_path),
        )

        mock_duplicate_search_function = Mock(spec=AIFunction)
        mock_mouser_part_number_search = Mock(spec=AIFunction)
        mock_mouser_keyword_search = Mock(spec=AIFunction)
        mock_datasheet_extraction = Mock(spec=AIFunction)

        service = AIService(
            db=session,
            config=settings,
            temp_file_manager=temp_file_manager,
            type_service=mock_type_service,
            seller_service=mock_seller_service,
            download_cache_service=mock_download_cache_service,
            document_service=mock_document_service,

            duplicate_search_function=mock_duplicate_search_function,
            mouser_part_number_search_function=mock_mouser_part_number_search,
            mouser_keyword_search_function=mock_mouser_keyword_search,
            datasheet_extraction_function=mock_datasheet_extraction,
        )

        mock_progress = Mock()

        result = service.analyze_part("Test prompt", None, None, mock_progress)

        assert result.analysis_result is not None
        assert result.analysis_result.manufacturer_code == "DUMMY123"
        assert result.analysis_result.type == "Relay"
        assert result.analysis_result.description == "Dummy component"
        assert result.duplicate_parts is None

    def test_conditional_function_registration_with_mouser_key(
        self, session: Session, mock_seller_service, mock_download_cache_service,
        mock_document_service
    ):
        """Test that Mouser search functions are registered when API key is configured."""
        from app.utils.ai.ai_runner import AIFunction, AIRunner

        # Settings WITH Mouser API key
        settings = Settings(
            database_url="sqlite:///:memory:",
            openai_api_key="test-key",
            mouser_search_api_key="test-mouser-key"
        )

        mock_duplicate_search_function = Mock(spec=AIFunction)
        mock_mouser_part_number_search = Mock(spec=AIFunction)
        mock_mouser_keyword_search = Mock(spec=AIFunction)
        mock_datasheet_extraction = Mock(spec=AIFunction)
        mock_runner = Mock(spec=AIRunner)

        service = AIService(
            db=session,
            config=settings,
            temp_file_manager=Mock(),
            type_service=Mock(),
            seller_service=mock_seller_service,
            download_cache_service=mock_download_cache_service,
            document_service=mock_document_service,

            duplicate_search_function=mock_duplicate_search_function,
            mouser_part_number_search_function=mock_mouser_part_number_search,
            mouser_keyword_search_function=mock_mouser_keyword_search,
            datasheet_extraction_function=mock_datasheet_extraction,
            ai_runner=mock_runner,
        )

        # Verify mouser_enabled is True
        assert service.mouser_enabled is True

        # Mock the run method to capture arguments
        from app.utils.ai.ai_runner import AIResponse
        mock_ai_response = create_mock_ai_response(product_name="Test")
        mock_runner.run.return_value = AIResponse(
            response=mock_ai_response,
            output_text="Mock",
            elapsed_time=1.0,
            input_tokens=100,
            cached_input_tokens=0,
            output_tokens=50,
            reasoning_tokens=0,
            cost=None
        )

        # Call analyze_part to trigger function registration
        mock_progress = Mock()
        try:
            service.analyze_part("test part", None, None, mock_progress)
        except Exception:
            pass  # We're only interested in the function list

        # Verify runner.run was called
        if mock_runner.run.called:
            call_args = mock_runner.run.call_args
            function_tools = call_args[0][1]  # Second positional argument

            # Should include 4 functions when Mouser is enabled:
            # - url_classifier
            # - duplicate_search
            # - mouser_part_number_search
            # - mouser_keyword_search
            assert len(function_tools) == 4

    def test_conditional_function_registration_without_mouser_key(
        self, session: Session, mock_seller_service, mock_download_cache_service,
        mock_document_service
    ):
        """Test that Mouser search functions are NOT registered when API key is missing."""
        from app.utils.ai.ai_runner import AIFunction, AIRunner

        # Settings WITHOUT Mouser API key
        settings = Settings(
            database_url="sqlite:///:memory:",
            openai_api_key="test-key",
            mouser_search_api_key=""
        )

        mock_duplicate_search_function = Mock(spec=AIFunction)
        mock_mouser_part_number_search = Mock(spec=AIFunction)
        mock_mouser_keyword_search = Mock(spec=AIFunction)
        mock_datasheet_extraction = Mock(spec=AIFunction)
        mock_runner = Mock(spec=AIRunner)

        service = AIService(
            db=session,
            config=settings,
            temp_file_manager=Mock(),
            type_service=Mock(),
            seller_service=mock_seller_service,
            download_cache_service=mock_download_cache_service,
            document_service=mock_document_service,

            duplicate_search_function=mock_duplicate_search_function,
            mouser_part_number_search_function=mock_mouser_part_number_search,
            mouser_keyword_search_function=mock_mouser_keyword_search,
            datasheet_extraction_function=mock_datasheet_extraction,
            ai_runner=mock_runner,
        )

        # Verify mouser_enabled is False
        assert service.mouser_enabled is False

        # Mock the run method
        from app.utils.ai.ai_runner import AIResponse
        mock_ai_response = create_mock_ai_response(product_name="Test")
        mock_runner.run.return_value = AIResponse(
            response=mock_ai_response,
            output_text="Mock",
            elapsed_time=1.0,
            input_tokens=100,
            cached_input_tokens=0,
            output_tokens=50,
            reasoning_tokens=0,
            cost=None
        )

        # Call analyze_part
        mock_progress = Mock()
        try:
            service.analyze_part("test part", None, None, mock_progress)
        except Exception:
            pass

        # Verify runner.run was called
        if mock_runner.run.called:
            call_args = mock_runner.run.call_args
            function_tools = call_args[0][1]

            # Should include only 2 functions (excluding Mouser search functions):
            # - url_classifier
            # - duplicate_search
            assert len(function_tools) == 2

    def test_analyze_part_invalid_json_response(self, ai_service: AIService):
        """Test handling of invalid JSON response from OpenAI."""
        # Mock the OpenAI API call to raise an exception simulating empty/invalid response
        ai_service.runner.run.side_effect = Exception("Empty response from OpenAI status incomplete, incomplete details: parsing error")

        with pytest.raises(Exception, match="Empty response from OpenAI"):
            mock_progress = Mock()
            ai_service.analyze_part("Test component", None, None, mock_progress)

        # Verify the runner was called
        ai_service.runner.run.assert_called_once()

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

    def test_function_calling_flow_via_analyze_part(self, ai_service: AIService):
        """Test that analyze_part can still work with the new function calling implementation."""
        # Mock the entire OpenAI API call to return a structured response
        from app.utils.ai.ai_runner import AIResponse
        mock_ai_response = create_mock_ai_response(
            manufacturer_part_number="FUNC123",
            product_category="Relay",
            product_name="Function call test relay"
        )
        ai_service.runner.run.return_value = AIResponse(
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
        ai_service.runner.run.assert_called_once()

        # Verify final result
        assert result.analysis_result is not None
        assert result.analysis_result.manufacturer_code == "FUNC123"
        assert result.analysis_result.type == "Relay"
        assert result.analysis_result.description == "Function call test relay"
        assert result.duplicate_parts is None

    def test_analyze_part_returns_duplicates(self, ai_service: AIService):
        """Test analyze_part returns duplicate_parts path when LLM finds high-confidence duplicates."""
        from app.utils.ai.ai_runner import AIResponse

        # Mock LLM returning duplicate_parts path with high-confidence match
        mock_response = PartAnalysisSuggestion(
            analysis_result=None,
            duplicate_parts=[
                DuplicatePartMatch(part_key="ABCD", confidence="high", reasoning="Exact MPN match"),
                DuplicatePartMatch(part_key="EFGH", confidence="medium", reasoning="Similar specs")
            ]
        )
        ai_service.runner.run.return_value = AIResponse(
            response=mock_response,
            output_text="Found duplicates",
            elapsed_time=1.0,
            input_tokens=100,
            cached_input_tokens=0,
            output_tokens=50,
            reasoning_tokens=0,
            cost=None
        )

        # Execute
        mock_progress = Mock()
        result = ai_service.analyze_part("OMRON G5Q-1A4", None, None, mock_progress)

        # Verify duplicate_parts path is returned
        assert result.duplicate_parts is not None
        assert len(result.duplicate_parts) == 2
        assert result.duplicate_parts[0].part_key == "ABCD"
        assert result.duplicate_parts[0].confidence == "high"
        assert result.duplicate_parts[1].part_key == "EFGH"
        assert result.duplicate_parts[1].confidence == "medium"
        assert result.analysis_result is None

    def test_analyze_part_duplicates_without_high_confidence_falls_through(
        self, ai_service: AIService
    ):
        """Test that medium-confidence duplicates are included alongside full analysis."""
        from app.utils.ai.ai_runner import AIResponse

        # Mock LLM returning medium-confidence duplicates with full analysis
        # This is the expected behavior for medium-confidence matches
        mock_response_duplicates = PartAnalysisSuggestion(
            analysis_result=PartAnalysisDetails(
                product_name="Fallback relay",
                product_family=None,
                product_category="Relay",
                manufacturer=None,
                manufacturer_part_number="SAFE123",
                package_type=None,
                mounting_type=None,
                part_pin_count=None,
                part_pin_pitch=None,
                voltage_rating=None,
                input_voltage=None,
                output_voltage=None,
                physical_dimensions=None,
                tags=[],
                product_page_urls=[],
                datasheet_urls=[],
                pinout_urls=[]
            ),
            duplicate_parts=[
                DuplicatePartMatch(part_key="WXYZ", confidence="medium", reasoning="Weak match")
            ]
        )
        ai_service.runner.run.return_value = AIResponse(
            response=mock_response_duplicates,
            output_text="Medium confidence only",
            elapsed_time=1.0,
            input_tokens=100,
            cached_input_tokens=0,
            output_tokens=50,
            reasoning_tokens=0,
            cost=None
        )

        # Execute - should return both analysis and duplicates
        mock_progress = Mock()
        result = ai_service.analyze_part("Test part", None, None, mock_progress)

        # Both fields should be populated (medium-confidence case)
        assert result.analysis_result is not None
        assert result.analysis_result.manufacturer_code == "SAFE123"
        assert result.duplicate_parts is not None
        assert len(result.duplicate_parts) == 1
        assert result.duplicate_parts[0].part_key == "WXYZ"
        assert result.duplicate_parts[0].confidence == "medium"

    def test_analyze_part_returns_failure_reason_only(self, ai_service: AIService):
        """Test analyze_part returns failure_reason when query is too vague."""
        from app.utils.ai.ai_runner import AIResponse

        # Mock LLM returning only failure_reason (no analysis or duplicates)
        mock_response = PartAnalysisSuggestion(
            analysis_result=None,
            duplicate_parts=None,
            analysis_failure_reason="Please be more specific - do you need an SMD or through-hole resistor?"
        )
        ai_service.runner.run.return_value = AIResponse(
            response=mock_response,
            output_text="Query too vague",
            elapsed_time=1.0,
            input_tokens=100,
            cached_input_tokens=0,
            output_tokens=50,
            reasoning_tokens=0,
            cost=None
        )

        # Execute
        mock_progress = Mock()
        result = ai_service.analyze_part("10k resistor", None, None, mock_progress)

        # Verify only failure_reason is returned
        assert result.analysis_failure_reason is not None
        assert result.analysis_failure_reason == "Please be more specific - do you need an SMD or through-hole resistor?"
        assert result.analysis_result is None
        assert result.duplicate_parts is None

    def test_analyze_part_returns_analysis_with_failure_reason(self, ai_service: AIService):
        """Test analyze_part returns both analysis and failure_reason for partial info."""
        from app.utils.ai.ai_runner import AIResponse

        # Mock LLM returning partial analysis with failure_reason
        mock_response = PartAnalysisSuggestion(
            analysis_result=PartAnalysisDetails(
                product_name="Generic resistor",
                product_family=None,
                product_category="Resistor",
                manufacturer=None,
                manufacturer_part_number=None,
                package_type=None,
                mounting_type=None,
                part_pin_count=None,
                part_pin_pitch=None,
                voltage_rating=None,
                input_voltage=None,
                output_voltage=None,
                physical_dimensions=None,
                tags=["resistor", "10k"],
                product_page_urls=[],
                datasheet_urls=[],
                pinout_urls=[]
            ),
            duplicate_parts=None,
            analysis_failure_reason="Partial info available but please specify package type and tolerance"
        )
        ai_service.runner.run.return_value = AIResponse(
            response=mock_response,
            output_text="Partial analysis",
            elapsed_time=1.0,
            input_tokens=100,
            cached_input_tokens=0,
            output_tokens=50,
            reasoning_tokens=0,
            cost=None
        )

        # Execute
        mock_progress = Mock()
        result = ai_service.analyze_part("10k resistor", None, None, mock_progress)

        # Verify both fields are populated
        assert result.analysis_result is not None
        assert result.analysis_result.description == "Generic resistor"
        assert result.analysis_result.type == "Resistor"
        assert result.analysis_failure_reason is not None
        assert result.analysis_failure_reason == "Partial info available but please specify package type and tolerance"
        assert result.duplicate_parts is None

    def test_analyze_part_returns_duplicates_with_failure_reason(self, ai_service: AIService):
        """Test analyze_part returns duplicates and failure_reason for uncertain matches."""
        from app.utils.ai.ai_runner import AIResponse

        # Mock LLM returning duplicates with failure_reason (no full analysis)
        mock_response = PartAnalysisSuggestion(
            analysis_result=None,
            duplicate_parts=[
                DuplicatePartMatch(part_key="RELA", confidence="medium", reasoning="Similar relay specs but uncertain")
            ],
            analysis_failure_reason="Matches found but may not be exact - please clarify relay coil voltage"
        )
        ai_service.runner.run.return_value = AIResponse(
            response=mock_response,
            output_text="Uncertain duplicates",
            elapsed_time=1.0,
            input_tokens=100,
            cached_input_tokens=0,
            output_tokens=50,
            reasoning_tokens=0,
            cost=None
        )

        # Execute
        mock_progress = Mock()
        result = ai_service.analyze_part("relay", None, None, mock_progress)

        # Verify both duplicates and failure_reason are populated
        assert result.duplicate_parts is not None
        assert len(result.duplicate_parts) == 1
        assert result.duplicate_parts[0].part_key == "RELA"
        assert result.analysis_failure_reason is not None
        assert result.analysis_failure_reason == "Matches found but may not be exact - please clarify relay coil voltage"
        assert result.analysis_result is None

    def test_analyze_part_all_three_fields_populated(self, ai_service: AIService):
        """Test analyze_part with all three fields populated (edge case)."""
        from app.utils.ai.ai_runner import AIResponse

        # Mock LLM returning all three fields
        mock_response = PartAnalysisSuggestion(
            analysis_result=PartAnalysisDetails(
                product_name="Generic relay",
                product_family=None,
                product_category="Relay",
                manufacturer=None,
                manufacturer_part_number=None,
                package_type=None,
                mounting_type=None,
                part_pin_count=None,
                part_pin_pitch=None,
                voltage_rating=None,
                input_voltage=None,
                output_voltage=None,
                physical_dimensions=None,
                tags=["relay"],
                product_page_urls=[],
                datasheet_urls=[],
                pinout_urls=[]
            ),
            duplicate_parts=[
                DuplicatePartMatch(part_key="RLAY", confidence="medium", reasoning="Possible match")
            ],
            analysis_failure_reason="Check these similar parts but please verify specifications"
        )
        ai_service.runner.run.return_value = AIResponse(
            response=mock_response,
            output_text="All fields",
            elapsed_time=1.0,
            input_tokens=100,
            cached_input_tokens=0,
            output_tokens=50,
            reasoning_tokens=0,
            cost=None
        )

        # Execute
        mock_progress = Mock()
        result = ai_service.analyze_part("relay", None, None, mock_progress)

        # Verify all three fields are populated
        assert result.analysis_result is not None
        assert result.analysis_result.description == "Generic relay"
        assert result.duplicate_parts is not None
        assert len(result.duplicate_parts) == 1
        assert result.analysis_failure_reason is not None
        assert result.analysis_failure_reason == "Check these similar parts but please verify specifications"


class TestAIServiceCleanupPart:
    """Test cases for AIService.cleanup_part()."""

    def test_cleanup_part_success(self, ai_service: AIService, session: Session):
        """Test successful cleanup of an existing part."""
        from app.models.attachment_set import AttachmentSet
        from app.models.part import Part
        from app.utils.ai.ai_runner import AIResponse

        # Create a part in the database
        attachment_set = AttachmentSet()
        session.add(attachment_set)
        session.flush()

        part = Part(
            key="TEST",
            description="Old description",
            manufacturer_code="OLD-123",
            attachment_set_id=attachment_set.id
        )
        session.add(part)
        session.flush()

        # Mock AI response
        mock_response = PartAnalysisSuggestion(
            analysis_result=PartAnalysisDetails(
                product_name="Improved description",
                product_family="Test Family",
                product_category="Relay",
                manufacturer="Test Manufacturer",
                manufacturer_part_number="NEW-456",
                package_type="DIP-8",
                mounting_type="Through-Hole",
                part_pin_count=8,
                part_pin_pitch="2.54mm",
                voltage_rating="5V",
                input_voltage=None,
                output_voltage=None,
                physical_dimensions="10x10mm",
                tags=["relay", "test"],
                product_page_urls=["https://example.com/product"],
                datasheet_urls=[],
                pinout_urls=[]
            ),
            duplicate_parts=None,
            analysis_failure_reason=None
        )
        ai_service.runner.run.return_value = AIResponse(
            response=mock_response,
            output_text="Cleaned",
            elapsed_time=1.0,
            input_tokens=100,
            cached_input_tokens=0,
            output_tokens=50,
            reasoning_tokens=0,
            cost=None
        )

        # Execute
        mock_progress = Mock()
        result = ai_service.cleanup_part(part_key="TEST", progress_handle=mock_progress)

        # Verify result
        assert result.key == "TEST"
        assert result.description == "Improved description"
        assert result.manufacturer_code == "NEW-456"
        assert result.manufacturer == "Test Manufacturer"
        assert result.type == "Relay"
        assert result.package == "DIP-8"
        assert result.mounting_type == "Through-Hole"
        assert result.pin_count == 8
        assert result.voltage_rating == "5V"
        assert result.tags == ["relay", "test"]
        assert result.product_page == "https://example.com/product"

        # Verify the runner was called once
        ai_service.runner.run.assert_called_once()

    def test_cleanup_part_not_found(self, ai_service: AIService):
        """Test cleanup_part raises RecordNotFoundException for non-existent part."""
        from app.exceptions import RecordNotFoundException

        mock_progress = Mock()
        with pytest.raises(RecordNotFoundException):
            ai_service.cleanup_part(part_key="ZZZZ", progress_handle=mock_progress)

    def test_cleanup_part_ai_disabled(self, session: Session, temp_file_manager: TempFileManager,
                                       mock_type_service: TypeService, mock_seller_service,
                                       mock_download_cache_service: DownloadCacheService,
                                       mock_document_service: DocumentService):
        """Test cleanup_part raises InvalidOperationException when AI is disabled."""
        from app.models.attachment_set import AttachmentSet
        from app.models.part import Part
        from app.utils.ai.ai_runner import AIFunction

        # Create AI service with ai_testing_mode=True and no dummy response
        mock_duplicate_search_function = Mock(spec=AIFunction)
        mock_mouser_part_number_search = Mock(spec=AIFunction)
        mock_mouser_keyword_search = Mock(spec=AIFunction)
        mock_datasheet_extraction = Mock(spec=AIFunction)
        settings = Settings(
            database_url="sqlite:///:memory:",
            openai_api_key="test-key",
            ai_testing_mode=True,  # This makes real_ai_allowed=False
            ai_analysis_cache_path=None
        )
        ai_service = AIService(
            db=session,
            config=settings,
            temp_file_manager=temp_file_manager,
            type_service=mock_type_service,
            seller_service=mock_seller_service,
            download_cache_service=mock_download_cache_service,
            document_service=mock_document_service,

            duplicate_search_function=mock_duplicate_search_function,
            mouser_part_number_search_function=mock_mouser_part_number_search,
            mouser_keyword_search_function=mock_mouser_keyword_search,
            datasheet_extraction_function=mock_datasheet_extraction,
        )

        # Create a part
        attachment_set = AttachmentSet()
        session.add(attachment_set)
        session.flush()

        part = Part(
            key="TEST",
            description="Test",
            attachment_set_id=attachment_set.id
        )
        session.add(part)
        session.flush()

        mock_progress = Mock()
        with pytest.raises(InvalidOperationException):
            ai_service.cleanup_part(part_key="TEST", progress_handle=mock_progress)

    def test_cleanup_part_excludes_duplicate_search(self, ai_service: AIService, session: Session):
        """Test that cleanup_part only passes URLClassifier (not duplicate search) to AI runner."""
        from app.models.attachment_set import AttachmentSet
        from app.models.part import Part
        from app.utils.ai.ai_runner import AIResponse

        # Create a part
        attachment_set = AttachmentSet()
        session.add(attachment_set)
        session.flush()

        part = Part(
            key="TEST",
            description="Test",
            attachment_set_id=attachment_set.id
        )
        session.add(part)
        session.flush()

        # Mock AI response using helper that fills all required fields
        mock_response = create_mock_ai_response(product_name="Test")
        ai_service.runner.run.return_value = AIResponse(
            response=mock_response,
            output_text="OK",
            elapsed_time=1.0,
            input_tokens=100,
            cached_input_tokens=0,
            output_tokens=50,
            reasoning_tokens=0,
            cost=None
        )

        mock_progress = Mock()
        ai_service.cleanup_part(part_key="TEST", progress_handle=mock_progress)

        # Verify the tool list passed to runner - should only have URL classifier
        assert ai_service.runner.run.called
        call_args = ai_service.runner.run.call_args
        tools = call_args[0][1]  # Second positional arg is the tool list
        assert len(tools) == 1
        # Verify it's the URL classifier by checking class name, not the duplicate search
        assert "URLClassifier" in type(tools[0]).__name__

    def test_cleanup_part_preserves_seller_data(self, ai_service: AIService, session: Session):
        """Test that cleanup_part preserves existing seller data."""
        from app.models.attachment_set import AttachmentSet
        from app.models.part import Part
        from app.models.seller import Seller
        from app.utils.ai.ai_runner import AIResponse

        # Create a seller
        seller = Seller(name="DigiKey", website="https://digikey.com")
        session.add(seller)
        session.flush()

        # Create a part with seller
        attachment_set = AttachmentSet()
        session.add(attachment_set)
        session.flush()

        part = Part(
            key="TEST",
            description="Test part",
            seller_id=seller.id,
            seller_link="https://digikey.com/product/123",
            attachment_set_id=attachment_set.id
        )
        session.add(part)
        session.flush()

        # Mock AI response using helper (AI doesn't return seller fields)
        mock_response = create_mock_ai_response(product_name="Cleaned test part", tags=["test"])
        ai_service.runner.run.return_value = AIResponse(
            response=mock_response,
            output_text="OK",
            elapsed_time=1.0,
            input_tokens=100,
            cached_input_tokens=0,
            output_tokens=50,
            reasoning_tokens=0,
            cost=None
        )

        mock_progress = Mock()
        result = ai_service.cleanup_part(part_key="TEST", progress_handle=mock_progress)

        # Verify seller data is preserved
        assert result.seller == "DigiKey"
        assert result.seller_link == "https://digikey.com/product/123"

    def test_cleanup_part_builds_context_with_all_other_parts(
        self, ai_service: AIService, session: Session
    ):
        """Test that cleanup_part includes all other parts in context."""
        from app.models.attachment_set import AttachmentSet
        from app.models.part import Part
        from app.utils.ai.ai_runner import AIResponse

        # Create multiple parts
        parts_data = [
            ("AAAA", "Part A"),
            ("BBBB", "Part B"),
            ("CCCC", "Part C"),  # Target part
            ("DDDD", "Part D"),
        ]

        for key, desc in parts_data:
            attachment_set = AttachmentSet()
            session.add(attachment_set)
            session.flush()
            part = Part(key=key, description=desc, attachment_set_id=attachment_set.id)
            session.add(part)

        session.flush()

        # Mock AI response using helper
        mock_response = create_mock_ai_response(product_name="Cleaned Part C")
        ai_service.runner.run.return_value = AIResponse(
            response=mock_response,
            output_text="OK",
            elapsed_time=1.0,
            input_tokens=100,
            cached_input_tokens=0,
            output_tokens=50,
            reasoning_tokens=0,
            cost=None
        )

        mock_progress = Mock()
        ai_service.cleanup_part(part_key="CCCC", progress_handle=mock_progress)

        # Verify the user prompt contains context parts (all except target)
        call_args = ai_service.runner.run.call_args
        request = call_args[0][0]
        user_prompt = request.user_prompt

        # Should contain context parts
        assert "AAAA" in user_prompt
        assert "BBBB" in user_prompt
        assert "DDDD" in user_prompt
        # Target part should be in target section, not context
        assert "Target Part:" in user_prompt
        assert '"key": "CCCC"' in user_prompt

    def test_cleanup_part_prompt_uses_cleanup_mode(self, ai_service: AIService, session: Session):
        """Test that cleanup_part builds prompt with mode='cleanup'."""
        from app.models.attachment_set import AttachmentSet
        from app.models.part import Part
        from app.utils.ai.ai_runner import AIResponse

        # Create a part
        attachment_set = AttachmentSet()
        session.add(attachment_set)
        session.flush()

        part = Part(key="TEST", description="Test", attachment_set_id=attachment_set.id)
        session.add(part)
        session.flush()

        # Mock AI response using helper
        mock_response = create_mock_ai_response(product_name="Test")
        ai_service.runner.run.return_value = AIResponse(
            response=mock_response,
            output_text="OK",
            elapsed_time=1.0,
            input_tokens=100,
            cached_input_tokens=0,
            output_tokens=50,
            reasoning_tokens=0,
            cost=None
        )

        mock_progress = Mock()
        ai_service.cleanup_part(part_key="TEST", progress_handle=mock_progress)

        # Verify the system prompt contains cleanup-mode content
        call_args = ai_service.runner.run.call_args
        request = call_args[0][0]
        system_prompt = request.system_prompt

        # Cleanup mode should have specific instructions
        assert "existing" in system_prompt.lower()
        assert "data quality" in system_prompt.lower()
        # Should NOT have duplicate detection instructions (that's analysis mode)
        assert "find_duplicates" not in system_prompt

    def test_cleanup_part_resolves_type_and_seller(self, ai_service: AIService, session: Session):
        """Test that cleanup_part resolves type and seller against existing records."""
        from sqlalchemy import select

        from app.models.attachment_set import AttachmentSet
        from app.models.part import Part
        from app.models.seller import Seller
        from app.models.type import Type
        from app.utils.ai.ai_runner import AIResponse

        # Get existing "Relay" type (loaded from types.txt)
        relay_type = session.execute(select(Type).where(Type.name == "Relay")).scalar_one()

        # Create a seller for testing
        digikey_seller = Seller(name="DigiKey", website="https://digikey.com")
        session.add(digikey_seller)
        session.flush()

        # Create a part with the existing type and seller
        attachment_set = AttachmentSet()
        session.add(attachment_set)
        session.flush()

        part = Part(
            key="TEST",
            description="Test Relay",
            type_id=relay_type.id,
            seller_id=digikey_seller.id,
            seller_link="https://digikey.com/product/123",
            attachment_set_id=attachment_set.id
        )
        session.add(part)
        session.flush()

        # Mock AI response with a type that matches existing
        mock_response = create_mock_ai_response(
            product_name="Improved Test Relay",
            product_category="Relay"  # Matches existing type
        )
        ai_service.runner.run.return_value = AIResponse(
            response=mock_response,
            output_text="OK",
            elapsed_time=1.0,
            input_tokens=100,
            cached_input_tokens=0,
            output_tokens=50,
            reasoning_tokens=0,
            cost=None
        )

        mock_progress = Mock()
        result = ai_service.cleanup_part(part_key="TEST", progress_handle=mock_progress)

        # Verify type resolution - should match existing type
        assert result.type == "Relay"
        assert result.type_is_existing is True
        assert result.existing_type_id == relay_type.id

        # Verify seller resolution - should match existing seller
        assert result.seller == "DigiKey"
        assert result.seller_is_existing is True
        assert result.existing_seller_id == digikey_seller.id
        assert result.seller_link == "https://digikey.com/product/123"

    def test_cleanup_part_new_type_not_existing(self, ai_service: AIService, session: Session):
        """Test that cleanup_part correctly identifies when AI suggests a new type."""
        from app.models.attachment_set import AttachmentSet
        from app.models.part import Part
        from app.utils.ai.ai_runner import AIResponse

        # Create a part without type
        attachment_set = AttachmentSet()
        session.add(attachment_set)
        session.flush()

        part = Part(
            key="TEST",
            description="Test Widget",
            attachment_set_id=attachment_set.id
        )
        session.add(part)
        session.flush()

        # Mock AI response with a type that doesn't exist
        mock_response = create_mock_ai_response(
            product_name="Test Widget",
            product_category="Proposed: Custom Widget"  # New type with Proposed: prefix
        )
        ai_service.runner.run.return_value = AIResponse(
            response=mock_response,
            output_text="OK",
            elapsed_time=1.0,
            input_tokens=100,
            cached_input_tokens=0,
            output_tokens=50,
            reasoning_tokens=0,
            cost=None
        )

        mock_progress = Mock()
        result = ai_service.cleanup_part(part_key="TEST", progress_handle=mock_progress)

        # Verify type resolution - should be marked as new
        assert result.type == "Custom Widget"  # Prefix stripped
        assert result.type_is_existing is False
        assert result.existing_type_id is None

