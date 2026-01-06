"""Tests for Mouser AI function tools."""

from unittest.mock import Mock

import pytest

from app.schemas.mouser import (
    ExtractSpecsRequest,
    ExtractSpecsResponse,
    GetMouserImageRequest,
    GetMouserImageResponse,
    MouserSearchByKeywordRequest,
    MouserSearchByPartNumberRequest,
    MouserSearchResponse,
)
from app.services.base_task import ProgressHandle
from app.services.download_cache_service import DownloadCacheService, DownloadResult
from app.services.mouser_service import MouserService
from app.utils.ai.ai_runner import AIResponse, AIRunner
from app.utils.ai.extract_specs import ExtractPartSpecsFromURLFunction
from app.utils.ai.mouser_image import GetMouserImageFromProductDetailUrlFunction
from app.utils.ai.mouser_search import (
    SearchMouserByKeywordFunction,
    SearchMouserByPartNumberFunction,
)


@pytest.fixture
def mock_progress_handle():
    """Create mock progress handle."""
    return Mock(spec=ProgressHandle)


@pytest.fixture
def mock_mouser_service():
    """Create mock MouserService."""
    return Mock(spec=MouserService)


@pytest.fixture
def mock_download_cache_service():
    """Create mock DownloadCacheService."""
    return Mock(spec=DownloadCacheService)


@pytest.fixture
def mock_ai_runner():
    """Create mock AIRunner."""
    return Mock(spec=AIRunner)


class TestSearchMouserByPartNumberFunction:
    """Tests for SearchMouserByPartNumberFunction."""

    def test_get_name(self, mock_mouser_service):
        """Should return correct function name."""
        func = SearchMouserByPartNumberFunction(mock_mouser_service)
        assert func.get_name() == "search_mouser_by_part_number"

    def test_get_model(self, mock_mouser_service):
        """Should return correct request model."""
        func = SearchMouserByPartNumberFunction(mock_mouser_service)
        assert func.get_model() == MouserSearchByPartNumberRequest

    def test_execute_success(self, mock_mouser_service, mock_progress_handle):
        """Should execute search and return results."""
        # Setup mock service response
        mock_response = MouserSearchResponse(
            parts=[],
            total_results=0
        )
        mock_mouser_service.search_by_part_number.return_value = mock_response

        # Create function and execute
        func = SearchMouserByPartNumberFunction(mock_mouser_service)
        request = MouserSearchByPartNumberRequest(part_number="ABC123")
        result = func.execute(request, mock_progress_handle)

        # Verify service was called correctly
        mock_mouser_service.search_by_part_number.assert_called_once_with("ABC123")

        # Verify result
        assert isinstance(result, MouserSearchResponse)
        assert result.error is None

    def test_execute_with_service_error(
        self, mock_mouser_service, mock_progress_handle
    ):
        """Should catch service exceptions and return error response."""
        # Setup mock to raise exception
        mock_mouser_service.search_by_part_number.side_effect = Exception(
            "Network timeout"
        )

        # Create function and execute
        func = SearchMouserByPartNumberFunction(mock_mouser_service)
        request = MouserSearchByPartNumberRequest(part_number="ABC123")
        result = func.execute(request, mock_progress_handle)

        # Should return error response instead of raising
        assert isinstance(result, MouserSearchResponse)
        assert result.error is not None
        assert "Network timeout" in result.error


class TestSearchMouserByKeywordFunction:
    """Tests for SearchMouserByKeywordFunction."""

    def test_get_name(self, mock_mouser_service):
        """Should return correct function name."""
        func = SearchMouserByKeywordFunction(mock_mouser_service)
        assert func.get_name() == "search_mouser_by_keyword"

    def test_get_model(self, mock_mouser_service):
        """Should return correct request model."""
        func = SearchMouserByKeywordFunction(mock_mouser_service)
        assert func.get_model() == MouserSearchByKeywordRequest

    def test_execute_success(self, mock_mouser_service, mock_progress_handle):
        """Should execute keyword search with all parameters."""
        # Setup mock service response
        mock_response = MouserSearchResponse(
            parts=[],
            total_results=0
        )
        mock_mouser_service.search_by_keyword.return_value = mock_response

        # Create function and execute with pagination
        func = SearchMouserByKeywordFunction(mock_mouser_service)
        request = MouserSearchByKeywordRequest(
            keyword="relay 5V",
            record_count=20,
            starting_record=10
        )
        result = func.execute(request, mock_progress_handle)

        # Verify service was called with all parameters
        mock_mouser_service.search_by_keyword.assert_called_once_with(
            keyword="relay 5V",
            record_count=20,
            starting_record=10
        )

        # Verify result
        assert isinstance(result, MouserSearchResponse)

    def test_execute_with_defaults(self, mock_mouser_service, mock_progress_handle):
        """Should use default pagination values."""
        mock_response = MouserSearchResponse(parts=[], total_results=0)
        mock_mouser_service.search_by_keyword.return_value = mock_response

        func = SearchMouserByKeywordFunction(mock_mouser_service)
        request = MouserSearchByKeywordRequest(keyword="relay")
        _result = func.execute(request, mock_progress_handle)

        # Verify defaults were used
        mock_mouser_service.search_by_keyword.assert_called_once_with(
            keyword="relay",
            record_count=10,  # Default
            starting_record=0  # Default
        )


class TestGetMouserImageFromProductDetailUrlFunction:
    """Tests for GetMouserImageFromProductDetailUrlFunction."""

    def test_get_name(self, mock_download_cache_service):
        """Should return correct function name."""
        func = GetMouserImageFromProductDetailUrlFunction(mock_download_cache_service)
        assert func.get_name() == "get_mouser_image"

    def test_get_model(self, mock_download_cache_service):
        """Should return correct request model."""
        func = GetMouserImageFromProductDetailUrlFunction(mock_download_cache_service)
        assert func.get_model() == GetMouserImageRequest

    def test_execute_success_finds_image(
        self, mock_download_cache_service, mock_progress_handle
    ):
        """Should extract image URL from ld+json metadata."""
        # Create HTML with ld+json ImageObject
        html_content = """
        <html>
        <head>
            <script type="application/ld+json">
            {
                "@context": "https://schema.org",
                "@type": "Product",
                "name": "Test Product"
            }
            </script>
            <script type="application/ld+json">
            {
                "@context": "https://schema.org",
                "@type": "ImageObject",
                "contentUrl": "https://example.com/product-image.jpg"
            }
            </script>
        </head>
        </html>
        """

        # Setup mock download
        mock_download_cache_service.get_cached_content.return_value = DownloadResult(
            content=html_content.encode('utf-8'),
            content_type="text/html"
        )

        # Execute
        func = GetMouserImageFromProductDetailUrlFunction(mock_download_cache_service)
        request = GetMouserImageRequest(
            product_url="https://www.mouser.com/ProductDetail/123"
        )
        result = func.execute(request, mock_progress_handle)

        # Verify result
        assert isinstance(result, GetMouserImageResponse)
        assert result.image_url == "https://example.com/product-image.jpg"
        assert result.error is None

    def test_execute_no_ld_json_scripts(
        self, mock_download_cache_service, mock_progress_handle
    ):
        """Should return error when no ld+json scripts found."""
        html_content = "<html><body>No metadata here</body></html>"

        mock_download_cache_service.get_cached_content.return_value = DownloadResult(
            content=html_content.encode('utf-8'),
            content_type="text/html"
        )

        func = GetMouserImageFromProductDetailUrlFunction(mock_download_cache_service)
        request = GetMouserImageRequest(
            product_url="https://www.mouser.com/ProductDetail/123"
        )
        result = func.execute(request, mock_progress_handle)

        # Should return error
        assert result.image_url is None
        assert result.error is not None
        assert "No ld+json metadata" in result.error

    def test_execute_no_image_object(
        self, mock_download_cache_service, mock_progress_handle
    ):
        """Should return error when ld+json exists but no ImageObject."""
        html_content = """
        <html>
        <head>
            <script type="application/ld+json">
            {
                "@type": "Product",
                "name": "Test"
            }
            </script>
        </head>
        </html>
        """

        mock_download_cache_service.get_cached_content.return_value = DownloadResult(
            content=html_content.encode('utf-8'),
            content_type="text/html"
        )

        func = GetMouserImageFromProductDetailUrlFunction(mock_download_cache_service)
        request = GetMouserImageRequest(
            product_url="https://www.mouser.com/ProductDetail/123"
        )
        result = func.execute(request, mock_progress_handle)

        # Should return error
        assert result.image_url is None
        assert result.error is not None
        assert "ImageObject not found" in result.error

    def test_execute_malformed_json_skips_to_next(
        self, mock_download_cache_service, mock_progress_handle
    ):
        """Should skip malformed JSON and continue to next script."""
        html_content = """
        <html>
        <head>
            <script type="application/ld+json">
            { invalid json here }
            </script>
            <script type="application/ld+json">
            {
                "@type": "ImageObject",
                "contentUrl": "https://example.com/image.jpg"
            }
            </script>
        </head>
        </html>
        """

        mock_download_cache_service.get_cached_content.return_value = DownloadResult(
            content=html_content.encode('utf-8'),
            content_type="text/html"
        )

        func = GetMouserImageFromProductDetailUrlFunction(mock_download_cache_service)
        request = GetMouserImageRequest(
            product_url="https://www.mouser.com/ProductDetail/123"
        )
        result = func.execute(request, mock_progress_handle)

        # Should find image from second script
        assert result.image_url == "https://example.com/image.jpg"
        assert result.error is None

    def test_execute_image_object_missing_content_url(
        self, mock_download_cache_service, mock_progress_handle
    ):
        """Should handle ImageObject without contentUrl."""
        html_content = """
        <html>
        <head>
            <script type="application/ld+json">
            {
                "@type": "ImageObject",
                "name": "Product Image"
            }
            </script>
        </head>
        </html>
        """

        mock_download_cache_service.get_cached_content.return_value = DownloadResult(
            content=html_content.encode('utf-8'),
            content_type="text/html"
        )

        func = GetMouserImageFromProductDetailUrlFunction(mock_download_cache_service)
        request = GetMouserImageRequest(
            product_url="https://www.mouser.com/ProductDetail/123"
        )
        result = func.execute(request, mock_progress_handle)

        # Should return error (ImageObject found but no contentUrl)
        assert result.image_url is None
        assert result.error is not None

    def test_execute_download_failure(
        self, mock_download_cache_service, mock_progress_handle
    ):
        """Should handle download failures gracefully."""
        mock_download_cache_service.get_cached_content.side_effect = Exception(
            "Network timeout"
        )

        func = GetMouserImageFromProductDetailUrlFunction(mock_download_cache_service)
        request = GetMouserImageRequest(
            product_url="https://www.mouser.com/ProductDetail/123"
        )
        result = func.execute(request, mock_progress_handle)

        # Should return error instead of raising
        assert result.image_url is None
        assert result.error is not None
        assert "Network timeout" in result.error


class TestExtractPartSpecsFromURLFunction:
    """Tests for ExtractPartSpecsFromURLFunction."""

    def test_get_name(self, mock_download_cache_service, mock_ai_runner):
        """Should return correct function name."""
        func = ExtractPartSpecsFromURLFunction(
            mock_download_cache_service,
            mock_ai_runner
        )
        assert func.get_name() == "extract_specs_from_url"

    def test_get_model(self, mock_download_cache_service, mock_ai_runner):
        """Should return correct request model."""
        func = ExtractPartSpecsFromURLFunction(
            mock_download_cache_service,
            mock_ai_runner
        )
        assert func.get_model() == ExtractSpecsRequest

    def test_execute_success(
        self, mock_download_cache_service, mock_ai_runner, mock_progress_handle
    ):
        """Should extract specs using LLM."""
        # Setup mock HTML download
        html_content = """
        <html>
        <head><script>alert('test')</script></head>
        <body>
            <h1>Product Specs</h1>
            <p>Voltage: 5V</p>
            <p>Current: 1A</p>
        </body>
        </html>
        """
        mock_download_cache_service.get_cached_content.return_value = DownloadResult(
            content=html_content.encode('utf-8'),
            content_type="text/html"
        )

        # Setup mock AI response
        specs_json = {"voltage": "5V", "current": "1A"}
        mock_ai_response = Mock(spec=AIResponse)
        mock_ai_response.response = specs_json
        mock_ai_runner.run.return_value = mock_ai_response

        # Execute
        func = ExtractPartSpecsFromURLFunction(
            mock_download_cache_service,
            mock_ai_runner
        )
        request = ExtractSpecsRequest(url="https://example.com/product")
        result = func.execute(request, mock_progress_handle)

        # Verify AI was called
        assert mock_ai_runner.run.called

        # Verify result
        assert isinstance(result, ExtractSpecsResponse)
        assert result.specs == specs_json
        assert result.error is None

    def test_execute_no_ai_runner(
        self, mock_download_cache_service, mock_progress_handle
    ):
        """Should return error when AI runner not available."""
        func = ExtractPartSpecsFromURLFunction(
            mock_download_cache_service,
            None  # No AI runner
        )
        request = ExtractSpecsRequest(url="https://example.com/product")
        result = func.execute(request, mock_progress_handle)

        # Should return error
        assert result.error is not None
        assert "not available" in result.error

    def test_execute_preprocesses_html(
        self, mock_download_cache_service, mock_ai_runner, mock_progress_handle
    ):
        """Should remove script/style tags from HTML content."""
        # HTML with script and style tags
        html_content = """
        <html>
        <head>
            <script>alert('remove me')</script>
            <style>body { color: red; }</style>
        </head>
        <body>
            <p>Voltage: 5V</p>
        </body>
        </html>
        """
        mock_download_cache_service.get_cached_content.return_value = DownloadResult(
            content=html_content.encode('utf-8'),
            content_type="text/html"
        )

        mock_ai_response = Mock(spec=AIResponse)
        mock_ai_response.response = {"voltage": "5V"}
        mock_ai_runner.run.return_value = mock_ai_response

        # Execute
        func = ExtractPartSpecsFromURLFunction(
            mock_download_cache_service,
            mock_ai_runner
        )
        request = ExtractSpecsRequest(url="https://example.com/product")
        _result = func.execute(request, mock_progress_handle)

        # Verify AI was called with preprocessed content
        ai_call_args = mock_ai_runner.run.call_args
        user_prompt = ai_call_args[0][0].user_prompt

        # Script and style content should be removed
        assert "alert" not in user_prompt
        assert "color: red" not in user_prompt
        # Text content should be present
        assert "Voltage: 5V" in user_prompt

    def test_execute_ai_returns_string(
        self, mock_download_cache_service, mock_ai_runner, mock_progress_handle
    ):
        """Should handle AI returning JSON string."""
        html_content = "<html><body>Test</body></html>"
        mock_download_cache_service.get_cached_content.return_value = DownloadResult(
            content=html_content.encode('utf-8'),
            content_type="text/html"
        )

        # AI returns JSON string instead of dict
        specs_json_str = '{"voltage": "5V"}'
        mock_ai_response = Mock(spec=AIResponse)
        mock_ai_response.response = specs_json_str
        mock_ai_runner.run.return_value = mock_ai_response

        # Execute
        func = ExtractPartSpecsFromURLFunction(
            mock_download_cache_service,
            mock_ai_runner
        )
        request = ExtractSpecsRequest(url="https://example.com/product")
        result = func.execute(request, mock_progress_handle)

        # Should parse string as JSON
        assert result.specs == {"voltage": "5V"}
        assert result.error is None

    def test_execute_ai_returns_invalid_json(
        self, mock_download_cache_service, mock_ai_runner, mock_progress_handle
    ):
        """Should return error on invalid JSON response."""
        html_content = "<html><body>Test</body></html>"
        mock_download_cache_service.get_cached_content.return_value = DownloadResult(
            content=html_content.encode('utf-8'),
            content_type="text/html"
        )

        # AI returns invalid JSON
        mock_ai_response = Mock(spec=AIResponse)
        mock_ai_response.response = "not valid json {"
        mock_ai_runner.run.return_value = mock_ai_response

        # Execute
        func = ExtractPartSpecsFromURLFunction(
            mock_download_cache_service,
            mock_ai_runner
        )
        request = ExtractSpecsRequest(url="https://example.com/product")
        result = func.execute(request, mock_progress_handle)

        # Should return error
        assert result.error is not None
        assert "parse" in result.error.lower()

    def test_execute_download_failure(
        self, mock_download_cache_service, mock_ai_runner, mock_progress_handle
    ):
        """Should handle download failures."""
        mock_download_cache_service.get_cached_content.side_effect = Exception(
            "Download failed"
        )

        func = ExtractPartSpecsFromURLFunction(
            mock_download_cache_service,
            mock_ai_runner
        )
        request = ExtractSpecsRequest(url="https://example.com/product")
        result = func.execute(request, mock_progress_handle)

        # Should return error
        assert result.error is not None
        assert "Download failed" in result.error
