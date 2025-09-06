"""Base classes for URL interceptors."""

from abc import ABC, abstractmethod
from collections.abc import Callable
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.services.download_cache_service import DownloadResult


class URLInterceptor(ABC):
    """Abstract base class for URL interceptors."""

    @abstractmethod
    def intercept(self, url: str, next: Callable[[str], "DownloadResult"]) -> "DownloadResult":
        """
        Intercept URL download processing.

        Args:
            url: URL to process
            next: Next function in the chain (ultimately get_cached_content)

        Returns:
            DownloadResult with potentially transformed content
        """
        pass
