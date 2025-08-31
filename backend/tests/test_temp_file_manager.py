"""Tests for temporary file manager."""

import tempfile
import time
from pathlib import Path
from unittest.mock import patch

import pytest

from app.utils.temp_file_manager import TempFileManager


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