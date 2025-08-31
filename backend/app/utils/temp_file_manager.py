"""Temporary file storage management for AI analysis features."""

import logging
import threading
from datetime import datetime, timedelta
from pathlib import Path
from uuid import uuid4

logger = logging.getLogger(__name__)


class TempFileManager:
    """
    Manages temporary file storage with automatic cleanup.

    Creates timestamped directories for storing temporary files
    and runs a background cleanup thread to remove old files.
    """

    def __init__(self, base_path: str = "/tmp/electronics_inventory/ai_analysis", cleanup_age_hours: float = 2.0):
        """
        Initialize the temporary file manager.

        Args:
            base_path: Base directory for temporary file storage
            cleanup_age_hours: Age in hours after which files are cleaned up
        """
        self.base_path = Path(base_path)
        self.cleanup_age_hours = cleanup_age_hours
        self._cleanup_thread: threading.Thread | None = None
        self._shutdown_event = threading.Event()

        # Ensure base directory exists
        self.base_path.mkdir(parents=True, exist_ok=True)

    def start_cleanup_thread(self) -> None:
        """Start the background cleanup thread."""
        if self._cleanup_thread is None or not self._cleanup_thread.is_alive():
            self._cleanup_thread = threading.Thread(target=self._cleanup_loop, daemon=True)
            self._cleanup_thread.start()
            logger.info("Started temporary file cleanup thread")

    def stop_cleanup_thread(self) -> None:
        """Stop the background cleanup thread."""
        self._shutdown_event.set()
        if self._cleanup_thread and self._cleanup_thread.is_alive():
            self._cleanup_thread.join(timeout=5.0)
            logger.info("Stopped temporary file cleanup thread")

    def create_temp_directory(self) -> Path:
        """
        Create a new temporary directory with timestamp and UUID.

        Returns:
            Path to the created temporary directory

        Example:
            /tmp/electronics_inventory/ai_analysis/20240830_143022_a1b2c3d4/
        """
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        uuid_suffix = str(uuid4())[:8]
        dir_name = f"{timestamp}_{uuid_suffix}"

        temp_dir = self.base_path / dir_name
        temp_dir.mkdir(parents=True, exist_ok=True)

        logger.debug(f"Created temporary directory: {temp_dir}")
        return temp_dir

    def cleanup_old_files(self) -> int:
        """
        Clean up temporary directories older than cleanup_age_hours.

        Returns:
            Number of directories cleaned up
        """
        if not self.base_path.exists():
            return 0

        cutoff_time = datetime.now() - timedelta(hours=self.cleanup_age_hours)
        cleaned_count = 0

        try:
            for item in self.base_path.iterdir():
                if not item.is_dir():
                    continue

                # Get directory creation time
                stat_info = item.stat()
                created_time = datetime.fromtimestamp(stat_info.st_ctime)

                if created_time < cutoff_time:
                    try:
                        # Remove directory and all contents
                        import shutil
                        shutil.rmtree(item)
                        cleaned_count += 1
                        logger.debug(f"Cleaned up old temporary directory: {item}")
                    except Exception as e:
                        logger.warning(f"Failed to clean up directory {item}: {e}")

        except Exception as e:
            logger.error(f"Error during cleanup: {e}")

        if cleaned_count > 0:
            logger.info(f"Cleaned up {cleaned_count} old temporary directories")

        return cleaned_count

    def _cleanup_loop(self) -> None:
        """Background thread loop for periodic cleanup."""
        cleanup_interval = 3600  # Run every hour

        while not self._shutdown_event.wait(cleanup_interval):
            try:
                self.cleanup_old_files()
            except Exception as e:
                logger.error(f"Error in cleanup loop: {e}")

    def get_temp_file_url(self, temp_path: Path, filename: str) -> str:
        """
        Generate a temporary file URL for serving files.

        Args:
            temp_path: Path to the temporary directory
            filename: Name of the file

        Returns:
            URL path for serving the temporary file
        """
        relative_path = temp_path.relative_to(self.base_path)
        return f"/tmp/ai-analysis/{relative_path}/{filename}"

    def resolve_temp_url(self, temp_url: str) -> Path | None:
        """
        Resolve a temporary URL back to a file path.

        Args:
            temp_url: Temporary URL (e.g., "/tmp/ai-analysis/20240830_143022_a1b2c3d4/datasheet.pdf")

        Returns:
            Full file path if valid, None otherwise
        """
        if not temp_url.startswith("/tmp/ai-analysis/"):
            return None

        # Remove the URL prefix
        relative_path = temp_url[len("/tmp/ai-analysis/"):]
        full_path = self.base_path / relative_path

        # Security check - ensure path is within base directory
        try:
            full_path.resolve().relative_to(self.base_path.resolve())
        except ValueError:
            logger.warning(f"Attempted path traversal attack: {temp_url}")
            return None

        return full_path if full_path.exists() else None

