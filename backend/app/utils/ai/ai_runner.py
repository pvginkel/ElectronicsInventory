import logging
import re
import time
from abc import ABC, abstractmethod
from typing import Any

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
from app.services.metrics_service import MetricsServiceProtocol
from app.utils.ai.cost_calculation import calculate_cost

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
            "name": self.get_name(),
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

class NoProgressHandle:
    def send_progress_text(self, text: str) -> None:
        pass
    def send_progress_value(self, value: float) -> None:
        pass
    def send_progress(self, text: str, value: float) -> None:
        pass


class AIRunner:
    def __init__(self, api_key: str, metrics_service: MetricsServiceProtocol | None = None):
        def on_request(request: Any) -> None:
            logger.info(f"Sending request to URL {request.method} {request.url}")
            logger.info(f"Body {request.content}")

        self.http_client = httpx.Client(
            event_hooks={
                # "request": [on_request],
            }
        )
        self.client = OpenAI(api_key=api_key, http_client=self.http_client)
        self.metrics_service = metrics_service

    def run(self, request: AIRequest, function_tools: list[AIFunction], progress_handle: ProgressHandle | None = None, streaming: bool = False) -> AIResponse:
        if not progress_handle:
            progress_handle = NoProgressHandle()

        # Build input and instructions for Responses API
        input_content: list[Any] = self._build_responses_api_input(request)

        start = time.perf_counter()

        input_tokens = 0
        cached_input_tokens = 0
        output_tokens = 0
        reasoning_tokens = 0

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

        cost = calculate_cost(request.model, input_tokens, cached_input_tokens, output_tokens, reasoning_tokens)

        logger.info(f"OpenAI response status: {response.status}, duration {elapsed_time}, incomplete details: {response.incomplete_details}, cost {cost:.3f}")
        logger.info(f"Output text: {response.output_text}")

        parsed_response = response.output_parsed
        if parsed_response is None or not response.output_text:
            raise Exception(f"Empty response from OpenAI status {response.status}, incomplete details: {response.incomplete_details}")

        return AIResponse(
            response=parsed_response,
            elapsed_time=elapsed_time,
            output_text=response.output_text,
            input_tokens=input_tokens,
            cached_input_tokens=cached_input_tokens,
            output_tokens=output_tokens,
            reasoning_tokens=reasoning_tokens,
            cost=cost
        )

    def _handle_function_call(
        self,
        response: ParsedResponse[Any],
        function_tools: list[AIFunction],
        input_content: list[Any],
        progress_handle: ProgressHandle,
    ) -> bool:
        had_function_call = False

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
                        had_function_call = True

        return had_function_call

    def _call_openai_api(
        self,
        streaming: bool,
        request: AIRequest,
        function_tools: list[AIFunction],
        input_content: list[Any],
        progress_handle: ProgressHandle,
    ) -> ParsedResponse[Any]:
        attempt = 1

        while True:
            start = time.perf_counter()
            try:
                if streaming:
                    response = self._call_openai_api_streamed(request, function_tools, input_content, progress_handle)
                else:
                    response = self._call_openai_api_non_streamed(request, function_tools, input_content, progress_handle)

                # Record successful API call metrics
                duration = time.perf_counter() - start
                if response.usage:
                    input_tokens = response.usage.input_tokens
                    cached_input_tokens = response.usage.input_tokens_details.cached_tokens
                    output_tokens = response.usage.output_tokens
                    reasoning_tokens = response.usage.output_tokens_details.reasoning_tokens
                    cost = calculate_cost(request.model, input_tokens, cached_input_tokens, output_tokens, reasoning_tokens)

                    if self.metrics_service:
                        self.metrics_service.record_ai_analysis(
                            status="success",
                            model=request.model,
                            verbosity=request.verbosity,
                            reasoning_effort=request.reasoning_effort or "none",
                            duration=duration,
                            tokens_input=input_tokens,
                            tokens_output=output_tokens,
                            tokens_reasoning=reasoning_tokens,
                            tokens_cached_input=cached_input_tokens,
                            cost_dollars=cost or 0.0
                        )

                return response

            except APIError as e:
                # Record failed API call metrics
                duration = time.perf_counter() - start
                if self.metrics_service:
                    self.metrics_service.record_ai_analysis(
                        status="error",
                        model=request.model,
                        verbosity=request.verbosity,
                        reasoning_effort=request.reasoning_effort or "none",
                        duration=duration,
                        tokens_input=0,
                        tokens_output=0,
                        tokens_reasoning=0,
                        tokens_cached_input=0,
                        cost_dollars=0.0
                    )

                if attempt >= 3:
                    raise
                attempt += 1

                logger.warning(f"OpenAI API error on attempt {attempt}, retrying: {e}")
                time.sleep(2 ** attempt)

    def _call_openai_api_non_streamed(
        self,
        request: AIRequest,
        function_tools: list[AIFunction],
        input_content: list[Any],
        progress_handle: ProgressHandle,
    ) -> ParsedResponse[Any]:
        # Call OpenAI Responses API with structured output
        reasoning_payload: dict[str, str] | None = None
        if request.reasoning_effort is not None:
            reasoning_payload = {"effort": request.reasoning_effort}

        parse_kwargs: dict[str, Any] = {
            "model": request.model,
            "input": input_content,
            "text_format": request.response_model,
            "text": {"verbosity": request.verbosity},
            "tools": [
                {"type": "web_search"},
                *[ft.get_function_tool() for ft in function_tools],
            ],
        }

        if reasoning_payload is not None:
            parse_kwargs["reasoning"] = reasoning_payload

        return self.client.responses.parse(**parse_kwargs)

    def _call_openai_api_streamed(
        self,
        request: AIRequest,
        function_tools: list[AIFunction],
        input_content: list[Any],
        progress_handle: ProgressHandle,
    ) -> ParsedResponse[Any]:
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
        reasoning_payload_stream: dict[str, str] | None = None
        if request.reasoning_effort is not None or request.reasoning_summary is not None:
            reasoning_payload_stream = {}
            if request.reasoning_effort is not None:
                reasoning_payload_stream["effort"] = request.reasoning_effort
            if request.reasoning_summary is not None:
                reasoning_payload_stream["summary"] = request.reasoning_summary

        stream_kwargs: dict[str, Any] = {
            "model": request.model,
            "input": input_content,
            "text_format": request.response_model,
            "text": {"verbosity": request.verbosity},
            "tools": [
                {"type": "web_search"},
                *[ft.get_function_tool() for ft in function_tools],
            ],
        }

        if reasoning_payload_stream is not None:
            stream_kwargs["reasoning"] = reasoning_payload_stream

        with self.client.responses.stream(**stream_kwargs) as stream:
            logger.info("Streaming events")

            for event in stream:
                if isinstance(event, ResponseOutputItemDoneEvent):
                    if isinstance(event.item, ResponseFunctionWebSearch):
                        if isinstance(event.item.action, ActionSearch):
                            if event.item.action.query:
                                progress_handle.send_progress(f"Searched for {event.item.action.query}", 0.2)
                if isinstance(event, ResponseContentPartAddedEvent):
                    progress_handle.send_progress("Writing response", 0.7)
                if isinstance(event, ResponseReasoningSummaryTextDoneEvent):
                    logger.info(f"Reasoning summary: {event.text}")

                    match = re.match(r"^\*\*([^\n]*)\*\*\r?\n", event.text)
                    if match:
                        progress_handle.send_progress_text(match.group(1))
                if isinstance(event, ResponseCompletedEvent):
                    return event.response

                # logger.info(event)
                # logger.info(event.model_dump_json())

        raise Exception("Did not get ResponseCompletedEvent")

    def _build_responses_api_input(self, request: AIRequest) -> list[Any]:
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

    def _count_web_searches(self, response: ParsedResponse[Any]) -> int:
        """Count the number of web searches performed during AI analysis."""
        search_count = 0
        for item in response.output:
            if isinstance(item, ResponseFunctionWebSearch):
                search_count += 1
        return search_count
