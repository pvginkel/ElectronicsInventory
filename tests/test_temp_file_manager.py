"""Tests for temporary file manager."""

import json
import tempfile
import time
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import patch

import pytest

from app.utils.temp_file_manager import TempFileManager, CachedContent


class TestTempFileManager:
    """Test cases for TempFileManager."""

    def test_create_temp_directory(self):
        """Test creating temporary directories."""
        with tempfile.TemporaryDirectory() as temp_base:
            manager = TempFileManager(base_path=temp_base, cleanup_age_hours=1.0)
            
            # Create a temporary directory
            temp_dir = manager.create_temp_directory()
            
            # Check that directory exists and is within base path
            assert temp_dir.exists()
            assert temp_dir.is_dir()
            assert temp_base in str(temp_dir)
            
            # Check directory name format (timestamp_uuid)
            dir_name = temp_dir.name
            assert '_' in dir_name
            parts = dir_name.split('_')
            assert len(parts) == 3  # timestamp, time, uuid
            assert len(parts[2]) == 8  # UUID suffix

    def test_get_temp_file_url(self):
        """Test generating temporary file URLs."""
        with tempfile.TemporaryDirectory() as temp_base:
            manager = TempFileManager(base_path=temp_base)
            temp_dir = manager.create_temp_directory()
            
            url = manager.get_temp_file_url(temp_dir, "test_file.pdf")
            
            # Check URL format
            assert url.startswith("/tmp/ai-analysis/")
            assert url.endswith("/test_file.pdf")

    def test_resolve_temp_url_valid(self):
        """Test resolving valid temporary URLs."""
        with tempfile.TemporaryDirectory() as temp_base:
            manager = TempFileManager(base_path=temp_base)
            temp_dir = manager.create_temp_directory()
            
            # Create a test file
            test_file = temp_dir / "test.pdf"
            test_file.write_text("test content")
            
            # Generate and resolve URL
            temp_url = manager.get_temp_file_url(temp_dir, "test.pdf")
            resolved_path = manager.resolve_temp_url(temp_url)
            
            assert resolved_path is not None
            assert resolved_path.exists()
            assert resolved_path == test_file

    def test_resolve_temp_url_invalid(self):
        """Test resolving invalid temporary URLs."""
        manager = TempFileManager()
        
        # Test invalid URL format
        assert manager.resolve_temp_url("/invalid/path") is None
        
        # Test non-existent file
        assert manager.resolve_temp_url("/tmp/ai-analysis/nonexistent/file.pdf") is None

    def test_resolve_temp_url_path_traversal(self):
        """Test security against path traversal attacks."""
        with tempfile.TemporaryDirectory() as temp_base:
            manager = TempFileManager(base_path=temp_base)
            
            # Attempt path traversal
            malicious_url = "/tmp/ai-analysis/../../../etc/passwd"
            resolved_path = manager.resolve_temp_url(malicious_url)
            
            assert resolved_path is None

    def test_cleanup_old_files(self):
        """Test cleanup of old temporary files."""
        with tempfile.TemporaryDirectory() as temp_base:
            manager = TempFileManager(base_path=temp_base, cleanup_age_hours=0.001)  # 3.6 seconds
            
            # Create some temporary directories
            temp_dir1 = manager.create_temp_directory()
            temp_dir2 = manager.create_temp_directory()
            
            # Create test files
            (temp_dir1 / "test1.pdf").write_text("content 1")
            (temp_dir2 / "test2.pdf").write_text("content 2")
            
            # Wait for files to be old enough for cleanup
            time.sleep(4)
            
            # Create a new directory that shouldn't be cleaned up
            temp_dir3 = manager.create_temp_directory()
            (temp_dir3 / "test3.pdf").write_text("content 3")
            
            # Run cleanup
            cleaned_count = manager.cleanup_old_files()
            
            # Check that old directories were cleaned up
            assert cleaned_count == 2
            assert not temp_dir1.exists()
            assert not temp_dir2.exists()
            assert temp_dir3.exists()  # New directory should remain

    def test_cleanup_thread_lifecycle(self):
        """Test starting and stopping cleanup thread."""
        with tempfile.TemporaryDirectory() as temp_base:
            manager = TempFileManager(base_path=temp_base)
            
            # Start cleanup thread
            manager.start_cleanup_thread()
            assert manager._cleanup_thread is not None
            assert manager._cleanup_thread.is_alive()
            
            # Stop cleanup thread
            manager.stop_cleanup_thread()
            
            # Give thread time to stop
            time.sleep(0.1)
            assert not manager._cleanup_thread.is_alive()


    def test_cleanup_nonexistent_base_directory(self):
        """Test cleanup when base directory is deleted after creation."""
        with tempfile.TemporaryDirectory() as temp_base:
            nested_path = str(Path(temp_base) / "ai_analysis")
            manager = TempFileManager(base_path=nested_path)
            
            # Remove the base directory to simulate it being deleted
            import shutil
            shutil.rmtree(nested_path)
            
            # Should not raise an exception
            cleaned_count = manager.cleanup_old_files()
            assert cleaned_count == 0

    def test_multiple_temp_directories_different_timestamps(self):
        """Test creating multiple temp directories with unique names."""
        with tempfile.TemporaryDirectory() as temp_base:
            manager = TempFileManager(base_path=temp_base)
            
            # Create multiple directories rapidly
            dirs = [manager.create_temp_directory() for _ in range(5)]
            
            # All should be unique
            dir_names = [d.name for d in dirs]
            assert len(set(dir_names)) == 5
            
            # All should exist
            for temp_dir in dirs:
                assert temp_dir.exists()

    def test_base_path_creation(self):
        """Test automatic creation of base path."""
        with tempfile.TemporaryDirectory() as parent_temp:
            base_path = str(Path(parent_temp) / "ai_analysis" / "nested")
            
            # Base path doesn't exist yet
            assert not Path(base_path).exists()
            
            # Creating manager should create the path
            manager = TempFileManager(base_path=base_path)
            assert Path(base_path).exists()

    @patch('app.utils.temp_file_manager.logger')
    def test_cleanup_error_handling(self, mock_logger):
        """Test error handling during cleanup."""
        with tempfile.TemporaryDirectory() as temp_base:
            manager = TempFileManager(base_path=temp_base, cleanup_age_hours=0.001)
            
            # Create a temporary directory
            temp_dir = manager.create_temp_directory()
            
            # Make it old enough for cleanup
            time.sleep(4)
            
            # Mock shutil.rmtree to raise an exception
            with patch('shutil.rmtree', side_effect=OSError("Permission denied")):
                cleaned_count = manager.cleanup_old_files()
                
                # Should handle the error gracefully
                assert cleaned_count == 0
                mock_logger.warning.assert_called()

    def test_url_to_path(self):
        """Test URL to cache path conversion."""
        with tempfile.TemporaryDirectory() as temp_base:
            manager = TempFileManager(base_path=temp_base)
            
            url1 = "https://example.com/test.pdf"
            url2 = "https://different.com/test.pdf"
            
            path1 = manager._url_to_path(url1)
            path2 = manager._url_to_path(url2)
            
            # Paths should be different for different URLs
            assert path1 != path2
            
            # Should be consistent for same URL
            assert manager._url_to_path(url1) == path1
            
            # Should be valid SHA256 hash (64 hex characters)
            assert len(path1) == 64
            assert all(c in '0123456789abcdef' for c in path1)

    def test_cache_and_get_cached(self):
        """Test caching and retrieving URL content."""
        with tempfile.TemporaryDirectory() as temp_base:
            manager = TempFileManager(base_path=temp_base, cleanup_age_hours=1.0)
            
            url = "https://example.com/test.txt"
            content = b"test content for caching"
            content_type = "text/plain"
            
            # Cache the content
            success = manager.cache(url, content, content_type)
            assert success is True
            
            # Retrieve from cache
            cached = manager.get_cached(url)
            assert cached is not None
            assert isinstance(cached, CachedContent)
            assert cached.content == content
            assert cached.content_type == content_type
            assert isinstance(cached.timestamp, datetime)

    def test_cache_and_get_different_urls(self):
        """Test that different URLs have separate cache entries."""
        with tempfile.TemporaryDirectory() as temp_base:
            manager = TempFileManager(base_path=temp_base, cleanup_age_hours=1.0)
            
            url1 = "https://example.com/file1.txt"
            url2 = "https://example.com/file2.txt"
            content1 = b"content for file 1"
            content2 = b"content for file 2"
            
            # Cache both
            manager.cache(url1, content1, "text/plain")
            manager.cache(url2, content2, "text/html")
            
            # Retrieve both
            cached1 = manager.get_cached(url1)
            cached2 = manager.get_cached(url2)
            
            assert cached1.content == content1
            assert cached1.content_type == "text/plain"
            assert cached2.content == content2
            assert cached2.content_type == "text/html"

    def test_get_cached_nonexistent(self):
        """Test retrieving from cache when content doesn't exist."""
        with tempfile.TemporaryDirectory() as temp_base:
            manager = TempFileManager(base_path=temp_base)
            
            # Should return None for non-existent URL
            cached = manager.get_cached("https://example.com/nonexistent.txt")
            assert cached is None

    def test_get_cached_expired(self):
        """Test that expired cache entries return None."""
        with tempfile.TemporaryDirectory() as temp_base:
            # Very short cleanup age for testing
            manager = TempFileManager(base_path=temp_base, cleanup_age_hours=0.001)  # ~3.6 seconds
            
            url = "https://example.com/expires.txt"
            content = b"content that will expire"
            
            # Cache the content
            manager.cache(url, content, "text/plain")
            
            # Should be available immediately
            cached = manager.get_cached(url)
            assert cached is not None
            assert cached.content == content
            
            # Wait for expiration
            time.sleep(4)
            
            # Should now return None (expired)
            cached = manager.get_cached(url)
            assert cached is None

    def test_cache_metadata_format(self):
        """Test that cache metadata is stored correctly."""
        with tempfile.TemporaryDirectory() as temp_base:
            manager = TempFileManager(base_path=temp_base)
            
            url = "https://example.com/metadata-test.pdf"
            content = b"PDF content for metadata test"
            content_type = "application/pdf"
            
            # Cache the content
            manager.cache(url, content, content_type)
            
            # Check that metadata file exists and has correct format
            cache_key = manager._url_to_path(url)
            metadata_file = manager.cache_path / f"{cache_key}.json"
            
            assert metadata_file.exists()
            
            # Load and verify metadata
            with open(metadata_file, 'r') as f:
                metadata = json.load(f)
            
            assert metadata['url'] == url
            assert metadata['content_type'] == content_type
            assert metadata['size'] == len(content)
            assert 'timestamp' in metadata
            
            # Timestamp should be parseable
            timestamp = datetime.fromisoformat(metadata['timestamp'])
            assert isinstance(timestamp, datetime)

    def test_cache_file_storage(self):
        """Test that cache files are stored correctly."""
        with tempfile.TemporaryDirectory() as temp_base:
            manager = TempFileManager(base_path=temp_base)
            
            url = "https://example.com/binary-test.bin"
            content = b"\x00\x01\x02\x03\xFF\xFE\xFD"  # Binary content
            content_type = "application/octet-stream"
            
            # Cache the content
            manager.cache(url, content, content_type)
            
            # Check that content file exists and has correct content
            cache_key = manager._url_to_path(url)
            content_file = manager.cache_path / f"{cache_key}.bin"
            
            assert content_file.exists()
            
            # Verify content is identical
            with open(content_file, 'rb') as f:
                stored_content = f.read()
            
            assert stored_content == content

    def test_cache_io_error_handling(self):
        """Test cache handling when IO operations fail."""
        with tempfile.TemporaryDirectory() as temp_base:
            manager = TempFileManager(base_path=temp_base)
            
            url = "https://example.com/io-error-test.txt"
            content = b"test content"
            
            # Make cache directory read-only to trigger IO error
            manager.cache_path.chmod(0o444)  # Read-only
            
            try:
                # Should return False on IO error
                success = manager.cache(url, content, "text/plain")
                assert success is False
                
                # Should return None when reading fails
                cached = manager.get_cached(url)
                assert cached is None
                
            finally:
                # Restore permissions for cleanup
                manager.cache_path.chmod(0o755)

    def test_get_cached_corrupt_metadata(self):
        """Test handling of corrupted metadata files."""
        with tempfile.TemporaryDirectory() as temp_base:
            manager = TempFileManager(base_path=temp_base)
            
            url = "https://example.com/corrupt-test.txt"
            cache_key = manager._url_to_path(url)
            
            # Create valid content file but corrupt metadata
            content_file = manager.cache_path / f"{cache_key}.bin"
            metadata_file = manager.cache_path / f"{cache_key}.json"
            
            with open(content_file, 'wb') as f:
                f.write(b"test content")
            
            with open(metadata_file, 'w') as f:
                f.write("invalid json {")
            
            # Should handle corrupted metadata gracefully
            cached = manager.get_cached(url)
            assert cached is None

    def test_get_cached_missing_content_file(self):
        """Test handling when content file is missing but metadata exists."""
        with tempfile.TemporaryDirectory() as temp_base:
            manager = TempFileManager(base_path=temp_base)
            
            url = "https://example.com/missing-content.txt"
            cache_key = manager._url_to_path(url)
            
            # Create metadata file but no content file
            metadata_file = manager.cache_path / f"{cache_key}.json"
            metadata = {
                'url': url,
                'content_type': 'text/plain',
                'timestamp': datetime.now().isoformat(),
                'size': 100
            }
            
            with open(metadata_file, 'w') as f:
                json.dump(metadata, f)
            
            # Should return None when content file is missing
            cached = manager.get_cached(url)
            assert cached is None

    def test_cache_directory_initialization(self):
        """Test that cache directory is created during initialization."""
        with tempfile.TemporaryDirectory() as temp_base:
            # Cache directory shouldn't exist initially
            cache_path = Path(temp_base) / "download_cache"
            assert not cache_path.exists()
            
            # Creating manager should create cache directory
            manager = TempFileManager(base_path=temp_base)
            assert manager.cache_path.exists()
            assert manager.cache_path.is_dir()
            assert str(manager.cache_path).endswith("download_cache")

    def test_cached_content_namedtuple(self):
        """Test CachedContent namedtuple structure."""
        timestamp = datetime.now()
        cached = CachedContent(
            content=b'test content',
            content_type='text/plain',
            timestamp=timestamp
        )
        
        assert cached.content == b'test content'
        assert cached.content_type == 'text/plain'
        assert cached.timestamp == timestamp
        assert len(cached) == 3