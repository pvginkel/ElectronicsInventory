import logging
import re
import time
from abc import ABC, abstractmethod
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from app.services.metrics_service import MetricsService

import httpx
from openai import APIError, OpenAI
from openai.types.responses import (
    ResponseCompletedEvent,
    ResponseContentPartAddedEvent,
    ResponseFunctionWebSearch,
    ResponseOutputItemDoneEvent,
    ResponseReasoningSummaryTextDoneEvent,
)
from openai.types.responses.function_tool_param import FunctionToolParam
from openai.types.responses.parsed_response import ParsedResponse
from openai.types.responses.response_function_web_search import ActionSearch
from pydantic import BaseModel

from app.services.base_task import ProgressHandle

logger = logging.getLogger(__name__)


class AIFunction(ABC):
    @abstractmethod
    def get_name(self) -> str:
        pass

    @abstractmethod
    def get_description(self) -> str:
        pass

    @abstractmethod
    def get_model(self) -> type[BaseModel]:
        pass

    @abstractmethod
    def execute(self, request: BaseModel, progress_handle: ProgressHandle) -> BaseModel:
        pass

    def get_function_tool(self) -> FunctionToolParam:
        return {
            "type": "function",
            "name": "classify_urls",
            "strict": True,
            "description": self.get_description(),
            "parameters": self.get_model().model_json_schema()
        }


class AIRequest(BaseModel):
    # Input parameters
    system_prompt: str
    user_prompt: str

    # Model parameters
    model: str
    verbosity: str
    reasoning_effort: str | None = None
    reasoning_summary: str | None = None

    # Function calling response model
    response_model: type[BaseModel]


class AIResponse(BaseModel):
    response: BaseModel
    output_text: str
    elapsed_time: float
    input_tokens: int
    cached_input_tokens: int
    output_tokens: int
    reasoning_tokens: int
    cost: float | None


class AIRunner:
    def __init__(self, api_key: str, metrics_service: "MetricsService | None" = None):
        def on_request(request):
            logger.info(f"Sending request to URL {request.method} {request.url}")
            logger.info(f"Body {request.content}")

        self.http_client = httpx.Client(
            event_hooks={
                # "request": [on_request],
            }
        )
        self.client = OpenAI(api_key=api_key, http_client=self.http_client)
        self.metrics_service = metrics_service

    def run(self, request: AIRequest, function_tools: list[AIFunction], progress_handle: ProgressHandle, streaming: bool) -> AIResponse:
        # Build input and instructions for Responses API
        input_content = self._build_responses_api_input(request)

        start = time.perf_counter()

        input_tokens = 0
        cached_input_tokens = 0
        output_tokens = 0
        reasoning_tokens = 0

        try:
            while True:
                logger.info("Starting OpenAI call")

                response = self._call_openai_api(streaming, request, function_tools, input_content, progress_handle)

                input_content += response.output

                if response.usage:
                    logger.info(f"Input tokens {response.usage.input_tokens}, cached {response.usage.input_tokens_details.cached_tokens}, output {response.usage.output_tokens}, reasoning {response.usage.output_tokens_details.reasoning_tokens}")

                    input_tokens += response.usage.input_tokens
                    cached_input_tokens += response.usage.input_tokens_details.cached_tokens
                    output_tokens += response.usage.output_tokens
                    reasoning_tokens += response.usage.output_tokens_details.reasoning_tokens

                if not self._handle_function_call(response, function_tools, input_content, progress_handle):
                    break

            elapsed_time = int(time.perf_counter() - start)

            logger.info(f"OpenAI response status: {response.status}, duration {elapsed_time}, incomplete details: {response.incomplete_details}")
            logger.info(f"Output text: {response.output_text}")

            if not response.output_parsed or not response.output_text:
                raise Exception(f"Empty response from OpenAI status {response.status}, incomplete details: {response.incomplete_details}")

            cost = self._calculate_cost(request.model, input_tokens, cached_input_tokens, output_tokens, reasoning_tokens)

            # Record comprehensive AI analysis metrics for success
            if self.metrics_service:
                function_calls = [tool.get_name() for tool in function_tools]
                web_searches = self._count_web_searches(response)

                self.metrics_service.record_ai_analysis(
                    status="success",
                    model=request.model,
                    verbosity=request.verbosity,
                    reasoning_effort=request.reasoning_effort,
                    duration=elapsed_time,
                    tokens_input=input_tokens,
                    tokens_output=output_tokens,
                    tokens_reasoning=reasoning_tokens,
                    tokens_cached_input=cached_input_tokens,
                    cost_dollars=cost or 0.0,
                    function_calls=function_calls if function_calls else [],
                    web_searches=web_searches
                )

            return AIResponse(
                response=response.output_parsed, # type: ignore
                elapsed_time=elapsed_time,
                output_text=response.output_text,
                input_tokens=input_tokens,
                cached_input_tokens=cached_input_tokens,
                output_tokens=output_tokens,
                reasoning_tokens=reasoning_tokens,
                cost=cost
            )

        except Exception:
            # Record comprehensive AI analysis metrics for failure
            elapsed_time = int(time.perf_counter() - start)
            cost = self._calculate_cost(request.model, input_tokens, cached_input_tokens, output_tokens, reasoning_tokens)

            if self.metrics_service:
                function_calls = [tool.get_name() for tool in function_tools]

                self.metrics_service.record_ai_analysis(
                    status="error",
                    model=request.model,
                    verbosity=request.verbosity,
                    reasoning_effort=request.reasoning_effort,
                    duration=elapsed_time,
                    tokens_input=input_tokens,
                    tokens_output=output_tokens,
                    tokens_reasoning=reasoning_tokens,
                    tokens_cached_input=cached_input_tokens,
                    cost_dollars=cost or 0.0,
                    function_calls=function_calls if function_calls else [],
                    web_searches=0  # No response to count from
                )

            # Re-raise the exception
            raise

    def _handle_function_call(self, response: ParsedResponse, function_tools: list[AIFunction], input_content: Any, progress_handle: ProgressHandle) -> bool:
        for item in response.output:
            if item.type == "function_call":
                for function in function_tools:
                    if item.name == function.get_name():
                        logger.info(f"Request to {item.name} call ID {item.call_id}")
                        logger.info(f"Request JSON: {item.arguments}")

                        result = function.execute(
                            function.get_model().model_validate_json(item.arguments),
                            progress_handle
                        )

                        result_json = result.model_dump_json()

                        logger.info(f"Result JSON: {result_json}")

                        input_content.append({
                            "type": "function_call_output",
                            "call_id": item.call_id,
                            "output": result_json
                        })

                        progress_handle.send_progress_text("Continuing analysis")
                        return True

        return False

    def _call_openai_api(self, streaming: bool, request: AIRequest, function_tools: list[AIFunction], input_content: Any, progress_handle: ProgressHandle) -> ParsedResponse:
        attempt = 1

        while True:
            try:
                if streaming:
                    return self._call_openai_api_streamed(request, function_tools, input_content, progress_handle)
                else:
                    return self._call_openai_api_non_streamed(request, function_tools, input_content, progress_handle)

            except APIError as e:
                if attempt >= 3:
                    raise
                attempt += 1

                logger.warning(f"OpenAI API error on attempt {attempt}, retrying: {e}")
                time.sleep(2 ** attempt)

    def _call_openai_api_non_streamed(self, request: AIRequest, function_tools: list[AIFunction], input_content: Any, progress_handle: ProgressHandle) -> ParsedResponse:
        # Call OpenAI Responses API with structured output
        return self.client.responses.parse(
            model=request.model,
            input=input_content, # type: ignore
            text_format=request.response_model,
            text={ "verbosity": request.verbosity }, # type: ignore
            tools=[
                { "type": "web_search" },
                *[ft.get_function_tool() for ft in function_tools]
            ],
            reasoning = {
                "effort": request.reasoning_effort # type: ignore
            },
        )

    def _call_openai_api_streamed(self, request: AIRequest, function_tools: list[AIFunction], input_content: Any, progress_handle: ProgressHandle) -> ParsedResponse:
        """Call OpenAI Responses API and handle streaming response.

        Args:
            input_content: Formatted input for OpenAI API
            prompt: Generated prompt string
            progress_handle: Interface for sending progress updates

        Returns:
            PartAnalysisSuggestion: Parsed response from OpenAI

        Raises:
            Exception: If API call fails or response is invalid
        """

        # Call OpenAI Responses API with structured output
        with self.client.responses.stream(
            model=request.model,
            input=input_content,
            text_format=request.response_model,
            text={ "verbosity": request.verbosity }, # type: ignore
            tools=[
                { "type": "web_search" },
                *[ft.get_function_tool() for ft in function_tools]
            ],
            # tool_choice="required",
            reasoning = {
                "effort": request.reasoning_effort, # type: ignore
                "summary": request.reasoning_summary
            },
        ) as stream:
            logger.info("Streaming events")

            for event in stream:
                if isinstance(event, ResponseOutputItemDoneEvent):
                    if isinstance(event.item, ResponseFunctionWebSearch):
                        if isinstance(event.item.action, ActionSearch):
                            if event.item.action.query:
                                progress_handle.send_progress(f"Searched for {event.item.action.query}", 0.2)
                if isinstance(event, ResponseContentPartAddedEvent):
                    progress_handle.send_progress("Writing response", 0.5)
                if isinstance(event, ResponseReasoningSummaryTextDoneEvent):
                    logger.info(f"Reasoning summary: {event.text}")

                    match = re.match(r"^\*\*([^\n]*)\*\*\r?\n", event.text)
                    if match:
                        progress_handle.send_progress(match.group(1), 0.2)
                if isinstance(event, ResponseCompletedEvent):
                    return event.response

                # logger.info(event)
                # logger.info(event.model_dump_json())

        raise Exception("Did not get ResponseCompletedEvent")

    def _build_responses_api_input(self, request: AIRequest) -> Any:
        """Build instructions and input for OpenAI Responses API."""

        return [
            {
                "role": "developer",
                "content": [
                    { "type": "input_text", "text": request.system_prompt }
                ]
            },
            {
                "role": "user",
                "content": [
                    { "type": "input_text", "text": request.user_prompt },
                    # Add an image later, e.g. {"type": "image_url", "image_url": {"url": "https://..."}}
                ]
            }
        ]

    def _calculate_cost(self, model: str, input_tokens: int, cached_input_tokens: int, output_tokens: int, reasoning_tokens: int) -> float | None:
        match model:
            case "gpt-5":
                input_tokens_pm = 1.25
                cached_input_pm = 0.125
                output_pm = 10
            case "gpt-5-mini":
                input_tokens_pm = 0.25
                cached_input_pm = 0.025
                output_pm = 2
            case "gpt-5-nano":
                input_tokens_pm = 0.05
                cached_input_pm = 0.005
                output_pm = 0.4
            case "gpt-4.1":
                input_tokens_pm = 3
                cached_input_pm = 0.75
                output_pm = 12
            case "gpt-4.1-mini":
                input_tokens_pm = 0.8
                cached_input_pm = 0.2
                output_pm = 3.2
            case _:
                return None

        return (
            cached_input_tokens * (cached_input_pm / 1_000_000) +
            (input_tokens - cached_input_tokens) * (input_tokens_pm / 1_000_000) +
            output_tokens * (output_pm / 1_000_000)
        )

    def _count_web_searches(self, response: ParsedResponse) -> int:
        """Count the number of web searches performed during AI analysis."""
        search_count = 0
        for item in response.output:
            if item.type == "web_search":
                search_count += 1
        return search_count
