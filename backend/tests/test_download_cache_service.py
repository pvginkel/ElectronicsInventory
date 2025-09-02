"""Tests for the download cache service."""

import tempfile
from pathlib import Path
from unittest.mock import Mock, patch

import pytest
import requests

from app.services.download_cache_service import DownloadCacheService, DownloadResult
from app.utils.temp_file_manager import TempFileManager


class TestDownloadCacheService:
    """Test cases for DownloadCacheService."""

    @pytest.fixture
    def temp_dir(self):
        """Create a temporary directory for testing."""
        with tempfile.TemporaryDirectory() as tmpdir:
            yield Path(tmpdir)

    @pytest.fixture
    def temp_file_manager(self, temp_dir):
        """Create a TempFileManager instance for testing."""
        return TempFileManager(base_path=str(temp_dir), cleanup_age_hours=1.0)

    @pytest.fixture
    def download_service(self, temp_file_manager):
        """Create a DownloadCacheService instance for testing."""
        return DownloadCacheService(
            temp_file_manager=temp_file_manager,
            max_download_size=1024 * 1024,  # 1MB for testing
            download_timeout=10
        )

    def test_init(self, temp_file_manager):
        """Test service initialization."""
        service = DownloadCacheService(
            temp_file_manager=temp_file_manager,
            max_download_size=5 * 1024 * 1024,
            download_timeout=30
        )

        assert service.temp_file_manager == temp_file_manager
        assert service.max_download_size == 5 * 1024 * 1024
        assert service.download_timeout == 30

    @patch('requests.get')
    @patch('requests.head')
    @patch('magic.from_buffer')
    def test_get_cached_content_cache_miss(self, mock_magic, mock_head, mock_get, download_service):
        """Test get_cached_content when content is not cached."""
        # Mock head response for URL validation
        mock_head_response = Mock()
        mock_head_response.status_code = 200
        mock_head.return_value = mock_head_response

        # Mock get response
        mock_get_response = Mock()
        mock_get_response.status_code = 200
        mock_get_response.headers = {'content-length': '100'}
        mock_get_response.iter_content.return_value = [b'test content']
        mock_get_response.raise_for_status.return_value = None
        mock_get.return_value = mock_get_response

        # Mock magic detection
        mock_magic.return_value = 'text/plain'

        url = 'https://example.com/test.txt'
        result = download_service.get_cached_content(url)

        # Verify result
        assert isinstance(result, DownloadResult)
        assert result.content == b'test content'
        assert result.content_type == 'text/plain'

        # Verify request was made
        mock_get.assert_called_once()
        call_args = mock_get.call_args
        assert call_args[0][0] == url
        assert call_args[1]['stream'] is True
        assert call_args[1]['timeout'] == 10

    def test_get_cached_content_cache_hit(self, download_service, temp_file_manager):
        """Test get_cached_content when content is already cached."""
        url = 'https://example.com/test.txt'
        cached_content = b'cached test content'
        content_type = 'text/plain'

        # Manually cache content
        temp_file_manager.cache(url, cached_content, content_type)

        # Get cached content
        result = download_service.get_cached_content(url)

        # Verify result
        assert isinstance(result, DownloadResult)
        assert result.content == cached_content
        assert result.content_type == content_type

    @patch('requests.get')
    def test_download_invalid_url(self, mock_requests, download_service):
        """Test download with invalid URL."""
        # Test empty URL
        with pytest.raises(ValueError, match="Invalid URL"):
            download_service.get_cached_content("")

        # Test invalid scheme
        with pytest.raises(ValueError, match="Invalid URL"):
            download_service.get_cached_content("ftp://example.com/test.txt")

    @patch('requests.get')
    @patch('requests.head')
    def test_download_network_error(self, mock_head, mock_get, download_service):
        """Test download with network error."""
        # Mock head response for URL validation
        mock_head_response = Mock()
        mock_head_response.status_code = 200
        mock_head.return_value = mock_head_response
        
        mock_get.side_effect = requests.RequestException("Network error")

        with pytest.raises(requests.RequestException):
            download_service.get_cached_content("https://example.com/test.txt")

    @patch('requests.get')
    @patch('requests.head')
    def test_download_content_too_large_header(self, mock_head, mock_get, download_service):
        """Test download when content-length header indicates oversized content."""
        # Mock head response for URL validation
        mock_head_response = Mock()
        mock_head_response.status_code = 200
        mock_head.return_value = mock_head_response
        
        mock_get_response = Mock()
        mock_get_response.headers = {'content-length': str(2 * 1024 * 1024)}  # 2MB, over 1MB limit
        mock_get.return_value = mock_get_response

        with pytest.raises(ValueError, match="Content too large"):
            download_service.get_cached_content("https://example.com/test.txt")

    @patch('requests.get')
    @patch('requests.head')
    def test_download_content_too_large_streaming(self, mock_head, mock_get, download_service):
        """Test download when actual content exceeds size limit during streaming."""
        # Mock head response for URL validation
        mock_head_response = Mock()
        mock_head_response.status_code = 200
        mock_head.return_value = mock_head_response
        
        mock_get_response = Mock()
        mock_get_response.status_code = 200
        mock_get_response.headers = {}  # No content-length header
        mock_get_response.raise_for_status.return_value = None
        # Return chunks that exceed the 1MB limit
        large_chunk = b'x' * (1024 * 1024 + 1)  # 1MB + 1 byte
        mock_get_response.iter_content.return_value = [large_chunk]
        mock_get.return_value = mock_get_response

        with pytest.raises(ValueError, match="Content too large"):
            download_service.get_cached_content("https://example.com/test.txt")

    @patch('requests.get')
    @patch('requests.head')
    @patch('magic.from_buffer')
    def test_download_success_with_chunked_content(self, mock_magic, mock_head, mock_get, download_service):
        """Test successful download with chunked content."""
        # Mock head response for URL validation
        mock_head_response = Mock()
        mock_head_response.status_code = 200
        mock_head.return_value = mock_head_response
        
        mock_get_response = Mock()
        mock_get_response.status_code = 200
        mock_get_response.headers = {}
        mock_get_response.raise_for_status.return_value = None
        # Return content in multiple chunks
        mock_get_response.iter_content.return_value = [b'chunk1', b'chunk2', b'chunk3']
        mock_get.return_value = mock_get_response

        mock_magic.return_value = 'application/octet-stream'

        result = download_service.get_cached_content("https://example.com/test.bin")

        assert result.content == b'chunk1chunk2chunk3'
        assert result.content_type == 'application/octet-stream'

    @patch('requests.get')
    @patch('requests.head')
    def test_download_http_error(self, mock_head, mock_get, download_service):
        """Test download with HTTP error response."""
        # Mock head response for URL validation
        mock_head_response = Mock()
        mock_head_response.status_code = 200
        mock_head.return_value = mock_head_response
        
        mock_get_response = Mock()
        mock_get_response.raise_for_status.side_effect = requests.HTTPError("404 Not Found")
        mock_get.return_value = mock_get_response

        with pytest.raises(requests.HTTPError):
            download_service.get_cached_content("https://example.com/notfound.txt")

    @patch('requests.get')
    @patch('requests.head')
    @patch('magic.from_buffer')
    def test_caching_behavior(self, mock_magic, mock_head, mock_get, download_service, temp_file_manager):
        """Test that content is properly cached after download."""
        # Mock head response for URL validation
        mock_head_response = Mock()
        mock_head_response.status_code = 200
        mock_head.return_value = mock_head_response
        
        mock_get_response = Mock()
        mock_get_response.status_code = 200
        mock_get_response.headers = {}
        mock_get_response.raise_for_status.return_value = None
        mock_get_response.iter_content.return_value = [b'test content for caching']
        mock_get.return_value = mock_get_response

        mock_magic.return_value = 'text/plain'

        url = 'https://example.com/cache-test.txt'

        # First call - should download and cache
        result1 = download_service.get_cached_content(url)
        assert result1.content == b'test content for caching'

        # Verify content was cached
        cached = temp_file_manager.get_cached(url)
        assert cached is not None
        assert cached.content == b'test content for caching'
        assert cached.content_type == 'text/plain'

        # Second call - should use cache (reset mock to verify no new request)
        mock_get.reset_mock()
        result2 = download_service.get_cached_content(url)
        assert result2.content == b'test content for caching'
        assert result2.content_type == 'text/plain'

        # Verify no new request was made
        mock_get.assert_not_called()

    @patch('requests.get')
    @patch('requests.head')
    def test_download_unexpected_error(self, mock_head, mock_get, download_service):
        """Test download with unexpected error."""
        # Mock head response for URL validation
        mock_head_response = Mock()
        mock_head_response.status_code = 200
        mock_head.return_value = mock_head_response
        
        mock_get.side_effect = Exception("Unexpected error")

        with pytest.raises(ValueError, match="Download failed"):
            download_service.get_cached_content("https://example.com/test.txt")

    def test_download_result_namedtuple(self):
        """Test DownloadResult namedtuple structure."""
        result = DownloadResult(content=b'test', content_type='text/plain')

        assert result.content == b'test'
        assert result.content_type == 'text/plain'
        assert len(result) == 2

    @patch('requests.get')
    @patch('requests.head')
    @patch('magic.from_buffer')
    def test_content_type_detection(self, mock_magic, mock_head, mock_get, download_service):
        """Test that content type is properly detected using python-magic."""
        # Mock head response for URL validation
        mock_head_response = Mock()
        mock_head_response.status_code = 200
        mock_head.return_value = mock_head_response
        
        mock_get_response = Mock()
        mock_get_response.status_code = 200
        mock_get_response.headers = {'content-type': 'text/html'}  # Server reports HTML
        mock_get_response.raise_for_status.return_value = None
        mock_get_response.iter_content.return_value = [b'{"key": "value"}']  # But content is JSON
        mock_get.return_value = mock_get_response

        # Magic should detect it as JSON
        mock_magic.return_value = 'application/json'

        result = download_service.get_cached_content("https://example.com/data.json")

        # Should use detected type from magic, not server header
        assert result.content_type == 'application/json'
        mock_magic.assert_called_once_with(b'{"key": "value"}', mime=True)

    @patch('requests.get')
    @patch('requests.head')
    @patch('magic.from_buffer')
    def test_cache_failure_doesnt_prevent_download(self, mock_magic, mock_head, mock_get, download_service):
        """Test that cache storage failure doesn't prevent successful download."""
        # Mock head response for URL validation
        mock_head_response = Mock()
        mock_head_response.status_code = 200
        mock_head.return_value = mock_head_response
        
        mock_get_response = Mock()
        mock_get_response.status_code = 200
        mock_get_response.headers = {}
        mock_get_response.raise_for_status.return_value = None
        mock_get_response.iter_content.return_value = [b'test content']
        mock_get.return_value = mock_get_response

        mock_magic.return_value = 'text/plain'

        # Mock cache to fail
        with patch.object(download_service.temp_file_manager, 'cache', return_value=False):
            result = download_service.get_cached_content("https://example.com/test.txt")

            # Download should still succeed even if caching failed
            assert result.content == b'test content'

    @patch('requests.head')
    def test_validate_url_valid(self, mock_head, download_service):
        """Test URL validation with valid URL."""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_head.return_value = mock_response

        result = download_service.validate_url("https://example.com/test.html")

        assert result is True
        mock_head.assert_called_once()

    @patch('requests.head')
    def test_validate_url_invalid_status(self, mock_head, download_service):
        """Test URL validation with invalid status code."""
        mock_response = Mock()
        mock_response.status_code = 404
        mock_head.return_value = mock_response

        result = download_service.validate_url("https://example.com/notfound.html")

        assert result is False

    def test_validate_url_invalid_format(self, download_service):
        """Test URL validation with invalid URL format."""
        result = download_service.validate_url("not-a-url")
        assert result is False

        result = download_service.validate_url("ftp://example.com/test")
        assert result is False

    @patch('requests.head')
    def test_validate_url_network_error(self, mock_head, download_service):
        """Test URL validation with network error."""
        mock_head.side_effect = requests.exceptions.RequestException("Network error")

        result = download_service.validate_url("https://example.com/test.html")

        assert result is False

    def test_service_configuration(self, temp_file_manager):
        """Test service with different configuration parameters."""
        service = DownloadCacheService(
            temp_file_manager=temp_file_manager,
            max_download_size=500 * 1024,  # 500KB
            download_timeout=5
        )

        assert service.max_download_size == 500 * 1024
        assert service.download_timeout == 5
