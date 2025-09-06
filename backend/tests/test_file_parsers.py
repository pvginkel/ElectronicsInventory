"""Tests for file parsing utilities."""

import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest

from app.exceptions import InvalidOperationException
from app.utils.file_parsers import (
    get_setup_types_file_path,
    get_types_from_setup,
    parse_lines_from_file,
)


class TestParseFileLinesFromFile:
    """Test the parse_lines_from_file function."""

    def test_parse_lines_from_file_basic(self):
        """Test parsing a basic file with valid content lines."""
        with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
            f.write("line1\nline2\nline3\n")
            temp_path = Path(f.name)

        try:
            result = parse_lines_from_file(temp_path)
            assert result == ["line1", "line2", "line3"]
        finally:
            temp_path.unlink()

    def test_parse_lines_from_file_with_comments_and_empty_lines(self):
        """Test parsing file with comments and empty lines."""
        with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
            f.write("# This is a comment\n")
            f.write("\n")  # Empty line
            f.write("line1\n")
            f.write("  \n")  # Whitespace-only line
            f.write("# Another comment\n")
            f.write("line2\n")
            f.write("line3\n")
            f.write("   # Comment with leading whitespace\n")
            temp_path = Path(f.name)

        try:
            result = parse_lines_from_file(temp_path)
            assert result == ["line1", "line2", "line3"]
        finally:
            temp_path.unlink()

    def test_parse_lines_from_file_strips_whitespace(self):
        """Test that whitespace is stripped from lines."""
        with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
            f.write("  line1  \n")
            f.write("\tline2\t\n")
            f.write("   line3   \n")
            temp_path = Path(f.name)

        try:
            result = parse_lines_from_file(temp_path)
            assert result == ["line1", "line2", "line3"]
        finally:
            temp_path.unlink()

    def test_parse_lines_from_file_empty_file(self):
        """Test parsing an empty file."""
        with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
            temp_path = Path(f.name)

        try:
            result = parse_lines_from_file(temp_path)
            assert result == []
        finally:
            temp_path.unlink()

    def test_parse_lines_from_file_only_comments_and_empty_lines(self):
        """Test parsing a file with only comments and empty lines."""
        with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
            f.write("# Comment 1\n")
            f.write("\n")
            f.write("  # Comment 2\n")
            f.write("   \n")
            f.write("# Comment 3\n")
            temp_path = Path(f.name)

        try:
            result = parse_lines_from_file(temp_path)
            assert result == []
        finally:
            temp_path.unlink()

    def test_parse_lines_from_file_missing_file(self):
        """Test error handling when file doesn't exist."""
        non_existent_path = Path("/path/that/does/not/exist.txt")

        with pytest.raises(InvalidOperationException) as exc_info:
            parse_lines_from_file(non_existent_path)

        assert "parse lines from file" in str(exc_info.value)
        assert "File not found" in str(exc_info.value)

    def test_parse_lines_from_file_read_error(self):
        """Test error handling when file read fails."""
        with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
            f.write("test content\n")
            temp_path = Path(f.name)

        try:
            # Mock the open function to raise an exception
            with patch('builtins.open', side_effect=PermissionError("Permission denied")):
                with pytest.raises(InvalidOperationException) as exc_info:
                    parse_lines_from_file(temp_path)

                assert "parse lines from file" in str(exc_info.value)
                assert "error reading" in str(exc_info.value)
                assert "Permission denied" in str(exc_info.value)
        finally:
            temp_path.unlink()


class TestGetSetupTypesFilePath:
    """Test the get_setup_types_file_path function."""

    def test_get_setup_types_file_path_returns_correct_path(self):
        """Test that the function returns the correct path structure."""
        result = get_setup_types_file_path()

        # The path should end with app/data/setup/types.txt
        assert result.name == "types.txt"
        assert result.parent.name == "setup"
        assert result.parent.parent.name == "data"
        assert result.parent.parent.parent.name == "app"

    def test_get_setup_types_file_path_is_path_object(self):
        """Test that the function returns a Path object."""
        result = get_setup_types_file_path()
        assert isinstance(result, Path)


class TestGetTypesFromSetup:
    """Test the get_types_from_setup function."""

    @patch('app.utils.file_parsers.get_setup_types_file_path')
    @patch('app.utils.file_parsers.parse_lines_from_file')
    def test_get_types_from_setup_success(self, mock_parse_lines, mock_get_path):
        """Test successful types retrieval from setup file."""
        mock_path = Path("/mock/path/types.txt")
        mock_get_path.return_value = mock_path
        mock_parse_lines.return_value = ["Type1", "Type2", "Type3"]

        result = get_types_from_setup()

        mock_get_path.assert_called_once()
        mock_parse_lines.assert_called_once_with(mock_path)
        assert result == ["Type1", "Type2", "Type3"]

    @patch('app.utils.file_parsers.get_setup_types_file_path')
    @patch('app.utils.file_parsers.parse_lines_from_file')
    def test_get_types_from_setup_propagates_exceptions(self, mock_parse_lines, mock_get_path):
        """Test that exceptions from parse_lines_from_file are propagated."""
        mock_path = Path("/mock/path/types.txt")
        mock_get_path.return_value = mock_path
        mock_parse_lines.side_effect = InvalidOperationException("test", "file error")

        with pytest.raises(InvalidOperationException) as exc_info:
            get_types_from_setup()

        assert "file error" in str(exc_info.value)


class TestIntegration:
    """Integration tests using the actual types.txt file."""

    def test_get_types_from_setup_with_actual_file(self):
        """Test loading types from the actual setup file."""
        # This test verifies the integration works with the real file
        result = get_types_from_setup()

        # Should have a reasonable number of types
        assert len(result) > 50

        # Should contain some expected types
        assert "Resistor" in result
        assert "Capacitor" in result
        assert "Microcontroller" in result

        # Should not contain any empty strings or comments
        assert all(line.strip() for line in result)
        assert all(not line.startswith('#') for line in result)

    def test_parse_lines_from_file_with_actual_types_file(self):
        """Test parsing the actual types.txt file."""
        types_path = get_setup_types_file_path()

        # Should be able to parse the file without errors
        result = parse_lines_from_file(types_path)

        # Should have content
        assert len(result) > 0

        # All lines should be non-empty and not comments
        assert all(line.strip() for line in result)
        assert all(not line.startswith('#') for line in result)
