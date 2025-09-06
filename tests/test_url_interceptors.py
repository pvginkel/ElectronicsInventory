"""Tests for URL interceptor system."""

from unittest.mock import Mock

from app.services.download_cache_service import DownloadResult
from app.services.url_transformers import LCSCInterceptor, URLInterceptorRegistry


class TestURLInterceptorRegistry:
    """Test URLInterceptorRegistry functionality."""

    def test_empty_registry_passes_through(self):
        """Test that empty registry passes through to base function."""
        registry = URLInterceptorRegistry()
        base_func = Mock(return_value=DownloadResult(b"content", "text/html"))

        chain = registry.build_chain(base_func)
        result = chain("http://example.com")

        assert result.content == b"content"
        assert result.content_type == "text/html"
        base_func.assert_called_once_with("http://example.com")

    def test_single_interceptor_registration(self):
        """Test registering and applying a single interceptor."""
        registry = URLInterceptorRegistry()

        # Mock interceptor
        interceptor = Mock()
        interceptor.intercept.return_value = DownloadResult(b"transformed", "application/pdf")

        registry.register(interceptor)
        base_func = Mock(return_value=DownloadResult(b"original", "text/html"))

        chain = registry.build_chain(base_func)
        result = chain("http://example.com")

        assert result.content == b"transformed"
        assert result.content_type == "application/pdf"
        interceptor.intercept.assert_called_once()

    def test_multiple_interceptors_chain(self):
        """Test that multiple interceptors are chained correctly."""
        registry = URLInterceptorRegistry()

        # First interceptor
        interceptor1 = Mock()
        interceptor1.intercept.side_effect = lambda url, next_func: next_func(url + "?modified1")

        # Second interceptor
        interceptor2 = Mock()
        interceptor2.intercept.side_effect = lambda url, next_func: next_func(url + "?modified2")

        registry.register(interceptor1)
        registry.register(interceptor2)

        base_func = Mock(return_value=DownloadResult(b"content", "text/html"))

        chain = registry.build_chain(base_func)
        chain("http://example.com")

        # First interceptor should be called first (registration order)
        base_func.assert_called_once_with("http://example.com?modified1?modified2")

    def test_interceptor_error_fallback(self):
        """Test that interceptor errors fall back to next function."""
        registry = URLInterceptorRegistry()

        # Failing interceptor
        interceptor = Mock()
        interceptor.intercept.side_effect = Exception("Interceptor failed")

        registry.register(interceptor)
        base_func = Mock(return_value=DownloadResult(b"fallback", "text/html"))

        chain = registry.build_chain(base_func)
        result = chain("http://example.com")

        # Should fall back to base function
        assert result.content == b"fallback"
        assert result.content_type == "text/html"
        base_func.assert_called_once_with("http://example.com")


class TestLCSCInterceptor:
    """Test LCSC interceptor functionality."""

    def test_non_lcsc_url_passes_through(self):
        """Test that non-LCSC URLs pass through unchanged."""
        interceptor = LCSCInterceptor()
        next_func = Mock(return_value=DownloadResult(b"content", "text/html"))

        result = interceptor.intercept("http://example.com/test.pdf", next_func)

        assert result.content == b"content"
        assert result.content_type == "text/html"
        next_func.assert_called_once_with("http://example.com/test.pdf")

    def test_non_pdf_lcsc_url_passes_through(self):
        """Test that LCSC URLs not ending in .pdf pass through unchanged."""
        interceptor = LCSCInterceptor()
        next_func = Mock(return_value=DownloadResult(b"content", "text/html"))

        result = interceptor.intercept("http://www.lcsc.com/test.html", next_func)

        assert result.content == b"content"
        assert result.content_type == "text/html"
        next_func.assert_called_once_with("http://www.lcsc.com/test.html")

    def test_already_pdf_passes_through(self):
        """Test that LCSC URLs already returning PDF pass through."""
        interceptor = LCSCInterceptor()
        next_func = Mock(return_value=DownloadResult(b"pdf content", "application/pdf"))

        result = interceptor.intercept("http://www.lcsc.com/test.pdf", next_func)

        assert result.content == b"pdf content"
        assert result.content_type == "application/pdf"
        next_func.assert_called_once_with("http://www.lcsc.com/test.pdf")

    def test_non_html_lcsc_passes_through(self):
        """Test that LCSC URLs returning non-HTML pass through."""
        interceptor = LCSCInterceptor()
        next_func = Mock(return_value=DownloadResult(b"image data", "image/jpeg"))

        result = interceptor.intercept("http://www.lcsc.com/test.pdf", next_func)

        assert result.content == b"image data"
        assert result.content_type == "image/jpeg"
        next_func.assert_called_once_with("http://www.lcsc.com/test.pdf")

    def test_html_without_iframes_passes_through(self):
        """Test that HTML without iframes passes through unchanged."""
        interceptor = LCSCInterceptor()
        html_content = b"<html><body><p>No iframes here</p></body></html>"
        next_func = Mock(return_value=DownloadResult(html_content, "text/html"))

        result = interceptor.intercept("http://www.lcsc.com/test.pdf", next_func)

        assert result.content == html_content
        assert result.content_type == "text/html"
        next_func.assert_called_once_with("http://www.lcsc.com/test.pdf")

    def test_iframe_without_pdf_passes_through(self):
        """Test that iframes not pointing to PDFs pass through."""
        interceptor = LCSCInterceptor()
        html_content = b'<html><body><iframe src="http://example.com/test.html"></iframe></body></html>'
        next_func = Mock(return_value=DownloadResult(html_content, "text/html"))

        result = interceptor.intercept("http://www.lcsc.com/test.pdf", next_func)

        assert result.content == html_content
        assert result.content_type == "text/html"

    def test_successful_pdf_extraction_from_iframe(self):
        """Test successful PDF extraction from iframe."""
        interceptor = LCSCInterceptor()

        # HTML with iframe pointing to PDF
        html_content = b'<html><body><iframe src="/real.pdf"></iframe></body></html>'

        # Mock next function behavior
        def mock_next(url):
            if url == "http://www.lcsc.com/test.pdf":
                return DownloadResult(html_content, "text/html")
            elif url == "http://www.lcsc.com/real.pdf":
                return DownloadResult(b"pdf content", "application/pdf")
            else:
                return DownloadResult(b"unknown", "text/plain")

        next_func = Mock(side_effect=mock_next)

        result = interceptor.intercept("http://www.lcsc.com/test.pdf", next_func)

        assert result.content == b"pdf content"
        assert result.content_type == "application/pdf"

        # Should have called next_func twice: once for original URL, once for iframe URL
        assert next_func.call_count == 2
        next_func.assert_any_call("http://www.lcsc.com/test.pdf")
        next_func.assert_any_call("http://www.lcsc.com/real.pdf")

    def test_multiple_iframes_first_pdf_wins(self):
        """Test that first iframe with PDF content is used."""
        interceptor = LCSCInterceptor()

        # HTML with multiple iframes
        html_content = b'''<html><body>
            <iframe src="/first.pdf"></iframe>
            <iframe src="/second.pdf"></iframe>
        </body></html>'''

        def mock_next(url):
            if url == "http://www.lcsc.com/test.pdf":
                return DownloadResult(html_content, "text/html")
            elif url == "http://www.lcsc.com/first.pdf":
                return DownloadResult(b"first pdf", "application/pdf")
            elif url == "http://www.lcsc.com/second.pdf":
                return DownloadResult(b"second pdf", "application/pdf")
            else:
                return DownloadResult(b"unknown", "text/plain")

        next_func = Mock(side_effect=mock_next)

        result = interceptor.intercept("http://www.lcsc.com/test.pdf", next_func)

        # Should return first PDF found
        assert result.content == b"first pdf"
        assert result.content_type == "application/pdf"

    def test_iframe_download_failure_continues(self):
        """Test that iframe download failures don't stop processing."""
        interceptor = LCSCInterceptor()

        html_content = b'''<html><body>
            <iframe src="/broken.pdf"></iframe>
            <iframe src="/working.pdf"></iframe>
        </body></html>'''

        def mock_next(url):
            if url == "http://www.lcsc.com/test.pdf":
                return DownloadResult(html_content, "text/html")
            elif url == "http://www.lcsc.com/broken.pdf":
                raise Exception("Download failed")
            elif url == "http://www.lcsc.com/working.pdf":
                return DownloadResult(b"working pdf", "application/pdf")
            else:
                return DownloadResult(b"unknown", "text/plain")

        next_func = Mock(side_effect=mock_next)

        result = interceptor.intercept("http://www.lcsc.com/test.pdf", next_func)

        # Should return working PDF despite broken one
        assert result.content == b"working pdf"
        assert result.content_type == "application/pdf"

    def test_malformed_html_passes_through(self):
        """Test that malformed HTML passes through safely."""
        interceptor = LCSCInterceptor()
        malformed_html = b"<html><iframe src="  # Intentionally broken
        next_func = Mock(return_value=DownloadResult(malformed_html, "text/html"))

        result = interceptor.intercept("http://www.lcsc.com/test.pdf", next_func)

        # Should pass through original content on parsing error
        assert result.content == malformed_html
        assert result.content_type == "text/html"
