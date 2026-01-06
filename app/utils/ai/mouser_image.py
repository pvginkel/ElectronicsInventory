"""AI function for extracting high-quality images from Mouser product pages."""

import json
import logging
from typing import cast

from bs4 import BeautifulSoup
from pydantic import BaseModel

from app.schemas.mouser import GetMouserImageRequest, GetMouserImageResponse
from app.services.base_task import ProgressHandle
from app.services.download_cache_service import DownloadCacheService
from app.utils.ai.ai_runner import AIFunction

logger = logging.getLogger(__name__)


class GetMouserImageFromProductDetailUrlFunction(AIFunction):
    """AI function that extracts high-quality product images from Mouser product pages.

    This function downloads a Mouser product page, parses the HTML to find ld+json
    metadata, and extracts the ImageObject contentUrl field containing the high-quality
    product image URL.
    """

    def __init__(self, download_cache_service: DownloadCacheService):
        """Initialize the Mouser image extraction function.

        Args:
            download_cache_service: Service for downloading and caching web pages
        """
        self.download_cache_service = download_cache_service

    def get_name(self) -> str:
        return "get_mouser_image"

    def get_description(self) -> str:
        return (
            "Extract a high-quality product image URL from a Mouser product detail page. "
            "Provide the full Mouser product page URL and this function will download the "
            "page and extract the image URL from the structured metadata. Returns the image "
            "URL or an error if extraction fails. Use this to get clean product images from "
            "Mouser pages."
        )

    def get_model(self) -> type[BaseModel]:
        return GetMouserImageRequest

    def execute(
        self, request: BaseModel, progress_handle: ProgressHandle
    ) -> BaseModel:
        """Extract image URL from Mouser product page.

        Args:
            request: GetMouserImageRequest with product_url
            progress_handle: Progress handle for reporting

        Returns:
            GetMouserImageResponse with image_url or error
        """
        progress_handle.send_progress_text("Extracting image from Mouser page")

        image_request = cast(GetMouserImageRequest, request)
        product_url = image_request.product_url

        try:
            logger.info(f"Downloading Mouser product page: {product_url}")

            # Download HTML content (cached)
            download_result = self.download_cache_service.get_cached_content(product_url)
            html_content = download_result.content.decode('utf-8', errors='ignore')

            # Parse HTML
            soup = BeautifulSoup(html_content, 'html.parser')

            # Find all ld+json script tags
            ld_json_scripts = soup.find_all('script', type='application/ld+json')

            if not ld_json_scripts:
                logger.warning(f"No ld+json scripts found on page: {product_url}")
                return GetMouserImageResponse(
                    error="No ld+json metadata found on page"
                )

            # Iterate through each ld+json script to find ImageObject
            for script in ld_json_scripts:
                try:
                    # Parse JSON content
                    json_data = json.loads(script.string)

                    # Check if this is an ImageObject
                    if isinstance(json_data, dict) and json_data.get("@type") == "ImageObject":
                        content_url = json_data.get("contentUrl")
                        if content_url:
                            logger.info(f"Found ImageObject contentUrl: {content_url}")
                            return GetMouserImageResponse(image_url=content_url)
                        else:
                            logger.warning("ImageObject found but missing contentUrl field")

                except json.JSONDecodeError as e:
                    # Skip malformed JSON and continue to next script
                    logger.debug(f"Skipping malformed ld+json script: {e}")
                    continue
                except Exception as e:
                    logger.warning(f"Error parsing ld+json script: {e}")
                    continue

            # No ImageObject found after checking all scripts
            logger.warning(f"No ImageObject found in ld+json on page: {product_url}")
            return GetMouserImageResponse(
                error="ld+json ImageObject not found on page"
            )

        except Exception as e:
            error_msg = f"Failed to extract image from Mouser page: {str(e)}"
            logger.error(error_msg, exc_info=True)
            return GetMouserImageResponse(error=error_msg)
