"""Duplicate search service for AI-powered duplicate detection."""

import json
import logging
import os
import time
from typing import Any

from jinja2 import Environment
from prometheus_client import Counter, Gauge, Histogram
from pydantic import ValidationError

from app.config import Settings
from app.schemas.duplicate_search import (
    DuplicateMatchLLMResponse,
    DuplicateSearchRequest,
    DuplicateSearchResponse,
)
from app.services.part_service import PartService
from app.utils.ai.ai_runner import AIRequest, AIRunner

# Duplicate search metrics
AI_DUPLICATE_SEARCH_REQUESTS_TOTAL = Counter(
    "ai_duplicate_search_requests_total",
    "Total duplicate search requests by outcome",
    ["outcome"],
)
AI_DUPLICATE_SEARCH_DURATION_SECONDS = Histogram(
    "ai_duplicate_search_duration_seconds",
    "Duplicate search request duration in seconds",
)
AI_DUPLICATE_SEARCH_MATCHES_FOUND = Histogram(
    "ai_duplicate_search_matches_found",
    "Number of duplicate matches found per search",
    ["confidence"],
)
AI_DUPLICATE_SEARCH_PARTS_DUMP_SIZE = Gauge(
    "ai_duplicate_search_parts_dump_size",
    "Number of parts in the inventory dump for duplicate search",
)

logger = logging.getLogger(__name__)


class DuplicateSearchService:
    """Service for finding duplicate parts using LLM-based similarity matching.

    This service orchestrates a second LLM call to compare a component description
    against the full inventory and identify potential duplicates.
    """

    def __init__(
        self,
        config: Settings,
        part_service: PartService,
        ai_runner: AIRunner | None,
    ):
        """Initialize the duplicate search service.

        Args:
            config: Application settings
            part_service: Service for accessing parts inventory
            ai_runner: AI runner for LLM calls (None if AI disabled)
        """
        self.config = config
        self.part_service = part_service
        self.ai_runner = ai_runner

        # Cache the prompt template to avoid repeated file I/O
        prompt_path = os.path.join(
            os.path.dirname(__file__), "prompts", "duplicate_search.md"
        )
        with open(prompt_path) as f:
            template_str = f.read()
        env = Environment()
        self._prompt_template = env.from_string(template_str)

    def search_duplicates(self, request: DuplicateSearchRequest) -> DuplicateSearchResponse:
        """Search for duplicate parts using LLM-based matching.

        Args:
            request: Search request with component description

        Returns:
            Response with list of potential duplicate matches (medium or high confidence)

        Raises:
            Exception: If LLM call fails or response parsing fails
        """
        start_time = time.perf_counter()

        try:
            # Get all parts for search
            parts_data = self.part_service.get_all_parts_for_search()

            # Record inventory size for monitoring
            AI_DUPLICATE_SEARCH_PARTS_DUMP_SIZE.set(len(parts_data))

            # If inventory is empty, return no matches immediately
            if not parts_data:
                logger.info("Duplicate search: inventory is empty, returning no matches")
                duration = time.perf_counter() - start_time
                logger.info(f"Duplicate search completed in {duration:.3f}s - outcome: empty, matches: 0, parts: 0")

                # Record metrics for empty outcome
                AI_DUPLICATE_SEARCH_REQUESTS_TOTAL.labels(outcome="empty").inc()
                AI_DUPLICATE_SEARCH_DURATION_SECONDS.observe(duration)

                return DuplicateSearchResponse(matches=[])

            # Build prompt with parts inventory
            system_prompt = self._build_prompt(parts_data)

            # Call LLM with structured output
            if not self.ai_runner:
                raise Exception("AI runner not available")

            ai_request = AIRequest(
                system_prompt=system_prompt,
                user_prompt=request.search,
                model=self.config.openai_model,
                verbosity=self.config.openai_verbosity,
                reasoning_effort=self.config.openai_reasoning_effort,
                reasoning_summary="auto",
                response_model=DuplicateMatchLLMResponse,
            )

            response = self.ai_runner.run(ai_request, [])
            llm_response = response.response

            # Convert LLM response to DuplicateSearchResponse
            if isinstance(llm_response, DuplicateMatchLLMResponse):
                matches = llm_response.matches
            else:
                # Fallback if response type is unexpected
                logger.warning(f"Unexpected LLM response type: {type(llm_response)}")
                matches = []

            # Count high-confidence matches for logging
            high_confidence_count = sum(1 for m in matches if m.confidence == "high")
            medium_confidence_count = len(matches) - high_confidence_count

            duration = time.perf_counter() - start_time
            logger.info(
                f"Duplicate search completed in {duration:.3f}s - outcome: success, matches: {len(matches)} "
                f"(high: {high_confidence_count}), parts: {len(parts_data)}"
            )

            # Record success metrics
            AI_DUPLICATE_SEARCH_REQUESTS_TOTAL.labels(outcome="success").inc()
            AI_DUPLICATE_SEARCH_DURATION_SECONDS.observe(duration)
            AI_DUPLICATE_SEARCH_MATCHES_FOUND.labels(confidence="total").observe(len(matches))
            if high_confidence_count > 0:
                AI_DUPLICATE_SEARCH_MATCHES_FOUND.labels(confidence="high").observe(
                    high_confidence_count
                )
            if medium_confidence_count > 0:
                AI_DUPLICATE_SEARCH_MATCHES_FOUND.labels(confidence="medium").observe(
                    medium_confidence_count
                )

            return DuplicateSearchResponse(matches=matches)

        except ValidationError as e:
            # LLM returned invalid schema
            duration = time.perf_counter() - start_time
            logger.error(f"Failed to parse LLM response for duplicate search after {duration:.3f}s: {e}")

            # Record validation error metrics
            AI_DUPLICATE_SEARCH_REQUESTS_TOTAL.labels(outcome="validation_error").inc()
            AI_DUPLICATE_SEARCH_DURATION_SECONDS.observe(duration)

            # Return empty matches to allow graceful degradation
            return DuplicateSearchResponse(matches=[])

        except Exception as e:
            # Any other error (network, API, etc.)
            duration = time.perf_counter() - start_time
            logger.error(f"Duplicate search failed after {duration:.3f}s: {e}", exc_info=True)

            # Record error metrics
            AI_DUPLICATE_SEARCH_REQUESTS_TOTAL.labels(outcome="error").inc()
            AI_DUPLICATE_SEARCH_DURATION_SECONDS.observe(duration)

            # Return empty matches to allow graceful degradation
            return DuplicateSearchResponse(matches=[])

    def _build_prompt(self, parts_data: list[dict[str, Any]]) -> str:
        """Build the system prompt with inventory data.

        Args:
            parts_data: List of part dictionaries from get_all_parts_for_search()

        Returns:
            Rendered prompt string with inventory JSON embedded
        """
        # Convert parts data to formatted JSON
        parts_json = json.dumps(parts_data, indent=2)

        context = {"parts_json": parts_json}

        # Use cached template
        return self._prompt_template.render(**context)
