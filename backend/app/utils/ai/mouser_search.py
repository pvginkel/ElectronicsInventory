"""AI functions for Mouser part search capabilities."""

import logging
from typing import cast

from pydantic import BaseModel

from app.schemas.mouser import (
    MouserSearchByKeywordRequest,
    MouserSearchByPartNumberRequest,
    MouserSearchResponse,
)
from app.services.base_task import ProgressHandle
from app.services.mouser_service import MouserService
from app.utils.ai.ai_runner import AIFunction

logger = logging.getLogger(__name__)


class SearchMouserByPartNumberFunction(AIFunction):
    """AI function that enables the LLM to search Mouser by part number.

    This function is called by the main AI analysis LLM when it wants to search
    Mouser's catalog for a specific part number (either Mouser PN or manufacturer PN).
    """

    def __init__(self, mouser_service: MouserService):
        """Initialize the Mouser part number search function.

        Args:
            mouser_service: Service that performs the actual Mouser API calls
        """
        self.mouser_service = mouser_service

    def get_name(self) -> str:
        return "search_mouser_by_part_number"

    def get_description(self) -> str:
        return (
            "Search Mouser Electronics catalog by part number. Provide either a Mouser "
            "part number or manufacturer part number. Returns detailed part information "
            "including manufacturer, description, datasheet URL, product page URL, "
            "category, lifecycle status, and minimum order quantities. Use this when "
            "you have an exact part number to look up."
        )

    def get_model(self) -> type[BaseModel]:
        return MouserSearchByPartNumberRequest

    def execute(
        self, request: BaseModel, progress_handle: ProgressHandle
    ) -> BaseModel:
        """Execute Mouser part number search via the service.

        Args:
            request: MouserSearchByPartNumberRequest with part number
            progress_handle: Progress handle for reporting

        Returns:
            MouserSearchResponse with list of parts (or error)
        """
        progress_handle.send_progress_text("Searching Mouser by part number")

        search_request = cast(MouserSearchByPartNumberRequest, request)

        try:
            logger.info(f"Executing Mouser part number search: {search_request.part_number}")
            response = self.mouser_service.search_by_part_number(
                search_request.part_number
            )
            logger.info(
                f"Mouser part number search returned {len(response.parts)} parts"
            )
            return response
        except Exception as e:
            # Log error and return error in response for graceful degradation
            logger.error(f"Mouser part number search function failed: {e}", exc_info=True)
            return MouserSearchResponse(error=f"Search failed: {str(e)}")


class SearchMouserByKeywordFunction(AIFunction):
    """AI function that enables the LLM to search Mouser by keyword.

    This function is called by the main AI analysis LLM when it wants to search
    Mouser's catalog by keyword (e.g., component type, description, specifications).
    """

    def __init__(self, mouser_service: MouserService):
        """Initialize the Mouser keyword search function.

        Args:
            mouser_service: Service that performs the actual Mouser API calls
        """
        self.mouser_service = mouser_service

    def get_name(self) -> str:
        return "search_mouser_by_keyword"

    def get_description(self) -> str:
        return (
            "Search Mouser Electronics catalog by keyword. Provide search terms "
            "describing the component (e.g., 'relay 5V DPDT', 'MOSFET N-channel TO-220'). "
            "Returns up to 10 matching parts with manufacturer, description, datasheet "
            "URL, product page URL, category, and other details. Use this when you need "
            "to find parts matching a description rather than an exact part number."
        )

    def get_model(self) -> type[BaseModel]:
        return MouserSearchByKeywordRequest

    def execute(
        self, request: BaseModel, progress_handle: ProgressHandle
    ) -> BaseModel:
        """Execute Mouser keyword search via the service.

        Args:
            request: MouserSearchByKeywordRequest with keyword and optional pagination
            progress_handle: Progress handle for reporting

        Returns:
            MouserSearchResponse with list of parts (or error)
        """
        progress_handle.send_progress_text("Searching Mouser by keyword")

        search_request = cast(MouserSearchByKeywordRequest, request)

        try:
            logger.info(f"Executing Mouser keyword search: {search_request.keyword}")
            response = self.mouser_service.search_by_keyword(
                keyword=search_request.keyword,
                record_count=50,
                starting_record=0
            )
            logger.info(
                f"Mouser keyword search returned {len(response.parts)} parts"
            )
            return response
        except Exception as e:
            # Log error and return error in response for graceful degradation
            logger.error(f"Mouser keyword search function failed: {e}", exc_info=True)
            return MouserSearchResponse(error=f"Search failed: {str(e)}")
