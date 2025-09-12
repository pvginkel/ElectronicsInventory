"""Service for version-related infrastructure operations."""

import requests

from app.config import Settings
from app.utils.shutdown_coordinator import ShutdownCoordinatorProtocol


class VersionService:
    """Service for managing version-related operations."""

    def __init__(self, settings: Settings, shutdown_coordinator: ShutdownCoordinatorProtocol):
        """Initialize version service.

        Args:
            settings: Application settings
            shutdown_coordinator: Shutdown coordinator for cleanup
        """
        self.settings = settings
        self.shutdown_coordinator = shutdown_coordinator

    def fetch_frontend_version(self) -> str:
        """Fetch version.json from frontend service.

        Returns:
            Raw JSON content as string

        Raises:
            requests.RequestException: If version fetch fails
        """
        url = self.settings.FRONTEND_VERSION_URL
        response = requests.get(url, timeout=5)
        response.raise_for_status()
        return response.text
