"""File parsing utilities for reading setup files."""

from pathlib import Path

from app.exceptions import InvalidOperationException


def parse_lines_from_file(file_path: Path) -> list[str]:
    """Parse lines from a file, skipping comments and empty lines.

    Args:
        file_path: Path to the file to parse

    Returns:
        List of valid content lines from the file

    Raises:
        InvalidOperationException: If file not found or read error occurs
    """
    if not file_path.exists():
        raise InvalidOperationException("parse lines from file", f"File not found: {file_path}")

    try:
        with open(file_path, encoding='utf-8') as file:
            lines = []
            for line in file:
                # Strip whitespace from both ends
                line = line.strip()

                # Skip if line is empty
                if not line:
                    continue

                # Skip if line starts with '#' (comment)
                if line.startswith('#'):
                    continue

                # Add valid lines to result list
                lines.append(line)

            return lines
    except Exception as e:
        raise InvalidOperationException("parse lines from file", f"error reading {file_path}: {str(e)}") from e


def get_setup_types_file_path() -> Path:
    """Get the path to the setup types.txt file.

    Returns:
        Path to app/data/setup/types.txt
    """
    # Get directory of the file_parsers.py module using Path(__file__)
    current_file = Path(__file__)

    # Navigate up to app directory (parent of utils)
    app_dir = current_file.parent.parent

    # Navigate to data/setup/types.txt
    return app_dir / "data" / "setup" / "types.txt"


def get_types_from_setup() -> list[str]:
    """Get the parsed list of types from types.txt.

    Returns:
        List of type names from the setup file

    Raises:
        InvalidOperationException: If file parsing fails
    """
    file_path = get_setup_types_file_path()
    return parse_lines_from_file(file_path)
