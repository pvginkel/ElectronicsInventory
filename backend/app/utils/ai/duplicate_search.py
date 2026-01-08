"""AI function for duplicate search capability."""

import logging
from typing import cast

from pydantic import BaseModel

from app.schemas.duplicate_search import DuplicateSearchRequest, DuplicateSearchResponse
from app.services.base_task import ProgressHandle
from app.services.duplicate_search_service import DuplicateSearchService
from app.utils.ai.ai_runner import AIFunction

logger = logging.getLogger(__name__)


class DuplicateSearchFunction(AIFunction):
    """AI function that enables the main LLM to search for duplicate parts.

    This function is called by the main AI analysis LLM when it wants to check
    if a part already exists in the inventory. The function executes a second
    LLM chain to perform similarity matching.
    """

    def __init__(self, duplicate_search_service: DuplicateSearchService):
        """Initialize the duplicate search function.

        Args:
            duplicate_search_service: Service that performs the actual duplicate search
        """
        self.duplicate_search_service = duplicate_search_service

    def get_name(self) -> str:
        return "find_duplicates"

    def get_description(self) -> str:
        return (
            "Search the inventory for parts that might be duplicates of the component "
            "being analyzed. Provide a detailed description including manufacturer part "
            "number, manufacturer name, package type, voltage, pin count, series, and "
            "any other technical specifications. Returns a list of potential duplicate "
            "parts with confidence levels (high or medium) and reasoning."
        )

    def get_model(self) -> type[BaseModel]:
        return DuplicateSearchRequest

    def execute(
        self, request: BaseModel, progress_handle: ProgressHandle
    ) -> BaseModel:
        """Execute duplicate search via the service.

        Args:
            request: DuplicateSearchRequest with component description
            progress_handle: Progress handle for reporting (not used)

        Returns:
            DuplicateSearchResponse with list of matches (or empty on error)
        """
        progress_handle.send_progress_text("Searching for duplicates")

        search_request = cast(DuplicateSearchRequest, request)

        try:
            logger.info(f"Executing duplicate search for: {search_request.search[:100]}")
            response = self.duplicate_search_service.search_duplicates(search_request)
            logger.info(f"Duplicate search returned {len(response.matches)} matches")
            return response
        except Exception as e:
            # Log error and return empty response for graceful degradation
            logger.error(f"Duplicate search function failed: {e}", exc_info=True)
            return DuplicateSearchResponse(matches=[])
