import logging
import re
import time
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
from prometheus_client import Counter, Histogram

from app.services.base_task import ProgressHandle, SubProgressHandle
from app.utils.ai.ai_runner import (
    AIFunction,
    AIRequest,
    AIResponse,
    AIRunner,
    NoProgressHandle,
)
from app.utils.ai.cost_calculation import calculate_cost

logger = logging.getLogger(__name__)

# AI analysis metrics
AI_ANALYSIS_REQUESTS_TOTAL = Counter(
    "ai_analysis_requests_total",
    "Total AI analysis requests",
    ["status", "model", "verbosity", "reasoning_effort"],
)
AI_ANALYSIS_DURATION_SECONDS = Histogram(
    "ai_analysis_duration_seconds",
    "AI analysis request duration",
    ["model", "verbosity", "reasoning_effort"],
)
AI_ANALYSIS_TOKENS_TOTAL = Counter(
    "ai_analysis_tokens_total",
    "Total tokens used",
    ["type", "model", "verbosity", "reasoning_effort"],
)
AI_ANALYSIS_COST_DOLLARS_TOTAL = Counter(
    "ai_analysis_cost_dollars_total",
    "Total cost of AI analysis in dollars",
    ["model", "verbosity", "reasoning_effort"],
)


_WRITING_RESPONSE_PROGRESS_START = 0.9
_PROGRESS_STEP = 0.25


class OpenAIRunner(AIRunner):
    def __init__(self, api_key: str):
        def on_request(request: Any) -> None:
            logger.info(f"Sending request to URL {request.method} {request.url}")
            logger.info(f"Body {request.content}")

        self.http_client = httpx.Client(
            event_hooks={
                # "request": [on_request],
            }
        )
        self.client = OpenAI(api_key=api_key, http_client=self.http_client)

    def run(self, request: AIRequest, function_tools: list[AIFunction], progress_handle: ProgressHandle | None = None, streaming: bool = False) -> AIResponse:
        # It's unclear how long the AI job is going to take. This means that it's difficult
        # to property report progress. Instead, we use the following algorithm:
        #
        # - The main phase goes from 0% to 90%. In this phase we do the following:
        #   - The thinking time of the process (so a single _call_openai_api call)
        #     steps 10% of the remaining percentage.
        #   - A function call steps 10% of the remaining percentage.
        # - Writing response takes from 90% to 100%.

        if not progress_handle:
            progress_handle = NoProgressHandle()

        # Track uploaded file IDs for cleanup
        uploaded_file_ids: list[str] = []

        try:
            # Upload attachments to OpenAI if present
            if request.attachments:
                for attachment_path in request.attachments:
                    logger.info(f"Uploading attachment to OpenAI: {attachment_path}")
                    with open(attachment_path, 'rb') as f:
                        file_obj = self.client.files.create(
                            file=f,
                            purpose="user_data"
                        )
                    uploaded_file_ids.append(file_obj.id)
                    logger.info(f"Uploaded file with ID: {file_obj.id}")

            # Build input and instructions for Responses API (includes uploaded files)
            input_content: list[Any] = self._build_responses_api_input(request, uploaded_file_ids)

            start = time.perf_counter()

            input_tokens = 0
            cached_input_tokens = 0
            output_tokens = 0
            reasoning_tokens = 0
            web_search_count = 0

            progress_offset = 0.0

            def get_progress_step() -> float:
                # This calculates the actual progress step based on the "step" amount of
                # the "remaining progress window". See the algorithm description above.
                nonlocal progress_offset
                return (_WRITING_RESPONSE_PROGRESS_START - progress_offset) * _PROGRESS_STEP

            def step_progress(text: str | None = None) -> None:
                # This steps the progress by the "step" amount of the "remaining progress
                # window". See the algorithm description above. Assuming step is 0.1, it
                # doesn't step the progress 10%. Instead, it moves the progress 10% closer
                # to the maximum progress.
                nonlocal progress_offset
                progress_offset += get_progress_step()
                if text:
                    progress_handle.send_progress(text, progress_offset)
                else:
                    progress_handle.send_progress_value(progress_offset)

            while True:
                logger.info("Starting OpenAI call")

                response = self._call_openai_api(streaming, request, function_tools, input_content, progress_handle)

                step_progress()

                input_content += response.output

                if response.usage:
                    logger.info(f"Input tokens {response.usage.input_tokens}, cached {response.usage.input_tokens_details.cached_tokens}, output {response.usage.output_tokens}, reasoning {response.usage.output_tokens_details.reasoning_tokens}")

                    input_tokens += response.usage.input_tokens
                    cached_input_tokens += response.usage.input_tokens_details.cached_tokens
                    output_tokens += response.usage.output_tokens
                    reasoning_tokens += response.usage.output_tokens_details.reasoning_tokens

                # Count web searches in this response
                web_search_count += self._count_web_searches(response)

                # Prepare progress handle for function call handling (10% of remaining)
                function_call_progress_handle = SubProgressHandle(progress_handle, progress_offset, progress_offset + get_progress_step())

                if not self._handle_function_call(response, function_tools, input_content, function_call_progress_handle):
                    break

                step_progress("Continuing analysis")

            elapsed_time = int(time.perf_counter() - start)

            cost = calculate_cost(request.model, input_tokens, cached_input_tokens, output_tokens, reasoning_tokens, web_search_count)

            cost_str = f"{cost:.3f}" if cost is not None else "unknown"
            if web_search_count > 0:
                logger.info(f"OpenAI response status: {response.status}, duration {elapsed_time}, incomplete details: {response.incomplete_details}, cost {cost_str}, web searches {web_search_count}")
            else:
                logger.info(f"OpenAI response status: {response.status}, duration {elapsed_time}, incomplete details: {response.incomplete_details}, cost {cost_str}")
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

        finally:
            # Cleanup: delete temporary files and OpenAI files
            # Best-effort cleanup - log errors but don't raise
            if request.attachments:
                from pathlib import Path
                for attachment_path in request.attachments:
                    try:
                        Path(attachment_path).unlink(missing_ok=True)
                        logger.debug(f"Deleted temporary file: {attachment_path}")
                    except Exception as e:
                        logger.warning(f"Failed to delete temporary file {attachment_path}: {e}")

            for file_id in uploaded_file_ids:
                try:
                    self.client.files.delete(file_id)
                    logger.debug(f"Deleted OpenAI file: {file_id}")
                except Exception as e:
                    logger.warning(f"Failed to delete OpenAI file {file_id}: {e}")

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
                    search_count = self._count_web_searches(response)
                    cost = calculate_cost(request.model, input_tokens, cached_input_tokens, output_tokens, reasoning_tokens, search_count)

                    labels = {
                        "model": request.model,
                        "verbosity": request.verbosity,
                        "reasoning_effort": request.reasoning_effort or "none",
                    }
                    AI_ANALYSIS_REQUESTS_TOTAL.labels(status="success", **labels).inc()
                    AI_ANALYSIS_DURATION_SECONDS.labels(**labels).observe(duration)
                    AI_ANALYSIS_TOKENS_TOTAL.labels(type="input", **labels).inc(input_tokens)
                    AI_ANALYSIS_TOKENS_TOTAL.labels(type="output", **labels).inc(output_tokens)
                    AI_ANALYSIS_TOKENS_TOTAL.labels(type="reasoning", **labels).inc(reasoning_tokens)
                    AI_ANALYSIS_TOKENS_TOTAL.labels(type="cached_input", **labels).inc(cached_input_tokens)
                    AI_ANALYSIS_COST_DOLLARS_TOTAL.labels(**labels).inc(cost or 0.0)

                return response

            except APIError as e:
                # Record failed API call metrics
                duration = time.perf_counter() - start
                labels = {
                    "model": request.model,
                    "verbosity": request.verbosity,
                    "reasoning_effort": request.reasoning_effort or "none",
                }
                AI_ANALYSIS_REQUESTS_TOTAL.labels(status="error", **labels).inc()
                AI_ANALYSIS_DURATION_SECONDS.labels(**labels).observe(duration)

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
                *[self._get_function_tool(ft) for ft in function_tools],
            ],
        }

        if reasoning_payload is not None:
            parse_kwargs["reasoning"] = reasoning_payload

        return self.client.responses.parse(**parse_kwargs)

    def _get_function_tool(self, function_tool: AIFunction) -> FunctionToolParam:
        return {
            "type": "function",
            "name": function_tool.get_name(),
            "strict": True,
            "description": function_tool.get_description(),
            "parameters": function_tool.get_model().model_json_schema()
        }

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
                *[self._get_function_tool(ft) for ft in function_tools],
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
                                progress_handle.send_progress_text(f"Searched for {event.item.action.query}")
                if isinstance(event, ResponseContentPartAddedEvent):
                    progress_handle.send_progress("Writing response", _WRITING_RESPONSE_PROGRESS_START)
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

    def _build_responses_api_input(self, request: AIRequest, uploaded_file_ids: list[str] | None = None) -> list[Any]:
        """Build instructions and input for OpenAI Responses API.

        Args:
            request: AI request with prompts and configuration
            uploaded_file_ids: Optional list of OpenAI file IDs to include in user message

        Returns:
            Formatted input for OpenAI Responses API
        """
        # Build user message content with text prompt
        user_content: list[Any] = [
            { "type": "input_text", "text": request.user_prompt }
        ]

        # Add uploaded files to user message if present
        if uploaded_file_ids:
            for file_id in uploaded_file_ids:
                user_content.append({
                    "type": "input_file",
                    "file_id": file_id
                })

        return [
            {
                "role": "developer",
                "content": [
                    { "type": "input_text", "text": request.system_prompt }
                ]
            },
            {
                "role": "user",
                "content": user_content
            }
        ]

    def _count_web_searches(self, response: ParsedResponse[Any]) -> int:
        """Count the number of web searches performed during AI analysis."""
        search_count = 0
        for item in response.output:
            if isinstance(item, ResponseFunctionWebSearch):
                search_count += 1
        return search_count
