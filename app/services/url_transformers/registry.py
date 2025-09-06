"""Registry for managing URL interceptors."""

import logging
from collections.abc import Callable
from typing import TYPE_CHECKING

from .base import URLInterceptor

if TYPE_CHECKING:
    from app.services.download_cache_service import DownloadResult

logger = logging.getLogger(__name__)


class URLInterceptorRegistry:
    """Registry that manages URL interceptors and builds interceptor chains."""

    def __init__(self):
        """Initialize empty registry."""
        self._interceptors: list[URLInterceptor] = []

    def register(self, interceptor: URLInterceptor) -> None:
        """
        Register an interceptor.

        Args:
            interceptor: Interceptor instance to register
        """
        self._interceptors.append(interceptor)
        logger.debug(f"Registered interceptor: {interceptor.__class__.__name__}")

    def build_chain(self, base_downloader: Callable[[str], "DownloadResult"]) -> Callable[[str], "DownloadResult"]:
        """
        Build interceptor chain around base downloader.

        Args:
            base_downloader: Base function to wrap (typically get_cached_content)

        Returns:
            Function that applies all interceptors in chain
        """
        # Build chain from right to left (last interceptor wraps base_downloader)
        current = base_downloader

        for interceptor in reversed(self._interceptors):
            # Create closure to capture current interceptor and next function
            def make_wrapper(interceptor_instance: URLInterceptor, next_func: Callable[[str], "DownloadResult"]) -> Callable[[str], "DownloadResult"]:
                def wrapper(url: str) -> "DownloadResult":
                    try:
                        logger.debug(f"Applying interceptor {interceptor_instance.__class__.__name__} to URL: {url}")
                        return interceptor_instance.intercept(url, next_func)
                    except Exception as e:
                        logger.warning(f"Interceptor {interceptor_instance.__class__.__name__} failed for URL {url}: {e}")
                        # Fall back to next function on error
                        return next_func(url)
                return wrapper

            current = make_wrapper(interceptor, current)

        return current
