"""Service for Mouser API integration."""

import logging
import time
from typing import Any
from urllib.parse import quote_plus

import requests
from prometheus_client import Counter, Histogram

from app.config import Settings
from app.schemas.mouser import (
    MouserPartResult,
    MouserSearchResponse,
)
from app.services.download_cache_service import DownloadCacheService

logger = logging.getLogger(__name__)

# Mouser API metrics
MOUSER_API_REQUESTS_TOTAL = Counter(
    "mouser_api_requests_total",
    "Mouser API requests by endpoint and status",
    ["endpoint", "status"],
)
MOUSER_API_DURATION_SECONDS = Histogram(
    "mouser_api_duration_seconds",
    "Mouser API request duration in seconds",
    ["endpoint"],
)


class MouserService:
    """Service for interacting with Mouser Search API."""

    MOUSER_API_BASE_URL = "https://api.mouser.com/api/v1"

    def __init__(
        self,
        config: Settings,
        download_cache_service: DownloadCacheService,
    ) -> None:
        """Initialize MouserService.

        Args:
            config: Application configuration
            download_cache_service: Service for caching HTTP responses
        """
        self.download_cache_service = download_cache_service
        self.api_key = config.mouser_search_api_key

    def search_by_part_number(self, part_number: str) -> MouserSearchResponse:
        """Search Mouser catalog by part number.

        Args:
            part_number: Mouser part number or manufacturer part number

        Returns:
            MouserSearchResponse with filtered results or error
        """
        if not self.api_key:
            error_msg = "Mouser API key not configured"
            logger.error(error_msg)
            return MouserSearchResponse(error=error_msg)

        url = f"{self.MOUSER_API_BASE_URL}/search/partnumber?apikey={quote_plus(self.api_key)}"

        # Build request body according to Mouser API spec
        body = {
            "SearchByPartRequest": {
                "mouserPartNumber": part_number,
                "partSearchOptions": ""
            }
        }

        try:
            response_data = self._post_with_cache(url, body)
            return self._parse_mouser_response(response_data)

        except requests.RequestException as e:
            error_msg = f"Mouser API request failed: {str(e)}"
            logger.error(error_msg, exc_info=True)
            return MouserSearchResponse(error=error_msg)
        except Exception as e:
            error_msg = f"Unexpected error during Mouser search: {str(e)}"
            logger.error(error_msg, exc_info=True)
            return MouserSearchResponse(error=error_msg)

    def search_by_keyword(
        self,
        keyword: str,
        record_count: int = 10,
        starting_record: int = 0
    ) -> MouserSearchResponse:
        """Search Mouser catalog by keyword.

        Args:
            keyword: Search keyword
            record_count: Number of results to return (default 10)
            starting_record: Starting record for pagination (default 0)

        Returns:
            MouserSearchResponse with filtered results or error
        """
        if not self.api_key:
            error_msg = "Mouser API key not configured"
            logger.error(error_msg)
            return MouserSearchResponse(error=error_msg)

        url = f"{self.MOUSER_API_BASE_URL}/search/keyword?apikey={quote_plus(self.api_key)}"

        # Build request body according to Mouser API spec
        body = {
            "SearchByKeywordRequest": {
                "keyword": keyword,
                "records": record_count,
                "startingRecord": starting_record
            }
        }

        try:
            response_data = self._post_with_cache(url, body)
            return self._parse_mouser_response(response_data)

        except requests.RequestException as e:
            error_msg = f"Mouser API request failed: {str(e)}"
            logger.error(error_msg, exc_info=True)
            return MouserSearchResponse(error=error_msg)
        except Exception as e:
            error_msg = f"Unexpected error during Mouser search: {str(e)}"
            logger.error(error_msg, exc_info=True)
            return MouserSearchResponse(error=error_msg)

    def _record_request_metric(self, endpoint: str, status: str, duration: float) -> None:
        """Record Mouser API request metrics.

        Args:
            endpoint: Endpoint name (partnumber or keyword)
            status: Request status (success, error, cached)
            duration: Request duration in seconds
        """
        MOUSER_API_REQUESTS_TOTAL.labels(endpoint=endpoint, status=status).inc()

        # Record duration (only for actual API calls, not cache hits)
        if status != "cached" and duration > 0:
            MOUSER_API_DURATION_SECONDS.labels(endpoint=endpoint).observe(duration)

    def _post_with_cache(self, url: str, body: dict[str, Any]) -> dict[str, Any]:
        """Execute POST request with caching via DownloadCacheService.

        Args:
            url: API endpoint URL
            body: Request body dictionary

        Returns:
            Parsed JSON response

        Raises:
            requests.RequestException: On network errors
        """
        endpoint = "partnumber" if "partnumber" in url else "keyword"

        start_time = time.perf_counter()
        try:
            response_data = self.download_cache_service.post_cached_json(
                url=url,
                json_body=body,
                timeout=30,
            )
            duration = time.perf_counter() - start_time
            self._record_request_metric(endpoint, "success", duration)
            return response_data

        except requests.RequestException:
            duration = time.perf_counter() - start_time
            self._record_request_metric(endpoint, "error", duration)
            raise

    def _parse_mouser_response(self, response_data: dict[str, Any]) -> MouserSearchResponse:
        """Parse and filter Mouser API response.

        Args:
            response_data: Raw Mouser API response

        Returns:
            MouserSearchResponse with filtered parts
        """
        # Check for API-level errors
        errors = response_data.get("Errors", [])
        if errors:
            error_messages = [err.get("Message", str(err)) for err in errors]
            error_msg = "; ".join(error_messages)
            logger.warning(f"Mouser API returned errors: {error_msg}")
            return MouserSearchResponse(error=error_msg)

        # Extract search results
        search_results = response_data.get("SearchResults", {})
        total_results = search_results.get("NumberOfResult", 0)
        parts_data = search_results.get("Parts", [])

        # Filter parts using Pydantic's whitelist approach
        # Pydantic will automatically ignore fields not in MouserPartResult schema
        filtered_parts = []
        for part_data in parts_data:
            try:
                filtered_part = MouserPartResult.model_validate(part_data)
                filtered_parts.append(filtered_part)
            except Exception as e:
                logger.warning(f"Failed to parse Mouser part result: {e}")
                continue

        logger.info(
            f"Mouser search returned {len(filtered_parts)} parts "
            f"(total available: {total_results})"
        )

        return MouserSearchResponse(
            parts=filtered_parts,
            total_results=total_results
        )
