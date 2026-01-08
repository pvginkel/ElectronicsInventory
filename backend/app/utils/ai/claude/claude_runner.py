"""Claude AI Runner implementation using Anthropic's Messages API."""

import json
import logging
import time
from typing import Any, cast

from anthropic import Anthropic, APIError
from anthropic.types import Message, TextBlock, ToolUseBlock
from pydantic import BaseModel

from app.services.base_task import ProgressHandle
from app.services.metrics_service import MetricsServiceProtocol
from app.utils.ai.ai_runner import (
    AIFunction,
    AIRequest,
    AIResponse,
    AIRunner,
    NoProgressHandle,
)
from app.utils.ai.cost_calculation import calculate_cost

logger = logging.getLogger(__name__)

# Maximum iterations to prevent infinite tool-calling loops
MAX_ITERATIONS = 10

# Maximum tokens for Claude API response
MAX_TOKENS = 4096

# Tool name for structured output (single-tool pattern)
STRUCTURED_OUTPUT_TOOL_NAME = "structured_response"


class ClaudeRunner(AIRunner):
    """AI Runner implementation using Anthropic's Claude API.

    This implementation uses the Messages API with tool calling for structured output
    and function execution. The single-tool pattern is used for structured responses:
    a tool with the desired response schema is added to force Claude to return
    structured data.
    """

    def __init__(
        self, api_key: str, metrics_service: MetricsServiceProtocol | None = None
    ):
        """Initialize Claude runner with API key and optional metrics service.

        Args:
            api_key: Anthropic API key
            metrics_service: Optional metrics service for tracking API calls
        """
        self.client = Anthropic(api_key=api_key)
        self.metrics_service = metrics_service

    def run(
        self,
        request: AIRequest,
        function_tools: list[AIFunction],
        progress_handle: ProgressHandle | None = None,
        streaming: bool = False,
    ) -> AIResponse:
        """Execute AI request using Claude's Messages API.

        Args:
            request: AI request with prompts and model settings
            function_tools: List of functions available for Claude to call
            progress_handle: Optional handle for progress updates
            streaming: Whether to use streaming mode

        Returns:
            AIResponse with parsed output and token usage

        Raises:
            APIError: If Claude API calls fail after retries
            Exception: If response is empty or malformed
        """
        if not progress_handle:
            progress_handle = NoProgressHandle()

        # Build messages array for Claude
        messages: list[dict[str, Any]] = self._build_messages(request)

        # Build tools array: structured output tool + function tools
        tools: list[dict[str, Any]] = self._build_tools(
            request.response_model, function_tools
        )

        start = time.perf_counter()

        # Token accumulation across multiple API calls
        input_tokens = 0
        cached_input_tokens = 0
        output_tokens = 0
        reasoning_tokens = 0  # Claude doesn't separate reasoning, but track for compatibility

        # Track structured response extraction
        structured_response_extracted: BaseModel | None = None
        iteration = 0

        # Tool-calling loop
        while iteration < MAX_ITERATIONS:
            iteration += 1

            if iteration == 5:
                logger.warning(
                    f"Claude tool-calling loop reached iteration {iteration}"
                )
            if iteration == MAX_ITERATIONS:
                logger.error(
                    f"Claude tool-calling loop exceeded max iterations ({MAX_ITERATIONS})"
                )

            logger.info(f"Starting Claude API call (iteration {iteration})")

            # Call Claude API (with retry logic)
            message = self._call_claude_api(
                streaming, request, tools, messages, progress_handle
            )

            # Accumulate token usage
            if message.usage:
                input_tokens += message.usage.input_tokens
                output_tokens += message.usage.output_tokens

                # Claude's cache_read_input_tokens indicates cache hits
                cache_read = getattr(message.usage, "cache_read_input_tokens", None)
                if cache_read is not None:
                    cached_input_tokens += cache_read
                if hasattr(message.usage, "cache_creation_input_tokens"):
                    # Cache creation tokens count as regular input tokens (already included)
                    pass

                logger.info(
                    f"Tokens: input={message.usage.input_tokens}, "
                    f"cached={getattr(message.usage, 'cache_read_input_tokens', 0)}, "
                    f"output={message.usage.output_tokens}"
                )

            # Check for structured_response tool call in content
            for block in message.content:
                if isinstance(block, ToolUseBlock):
                    if block.name == STRUCTURED_OUTPUT_TOOL_NAME:
                        # Extract structured response
                        try:
                            structured_response_extracted = (
                                request.response_model.model_validate(block.input)
                            )
                            logger.info(
                                "Extracted structured response from Claude"
                            )
                        except Exception as e:
                            logger.error(
                                f"Failed to validate structured response: {e}"
                            )
                            raise Exception(
                                f"Invalid structured response from Claude: {e}"
                            ) from e

            # Check stop reason and process tool calls
            if message.stop_reason == "tool_use":
                # Extract tool calls and execute functions
                had_function_call = self._handle_tool_calls(
                    message, function_tools, messages, progress_handle
                )

                # If we have structured response and no more function calls, exit loop
                if structured_response_extracted and not had_function_call:
                    break

                # Continue loop for next API call
                continue

            elif message.stop_reason in ("end_turn", "max_tokens"):
                # Normal completion - exit loop
                break

            else:
                logger.warning(
                    f"Unexpected stop reason from Claude: {message.stop_reason}"
                )
                break

        elapsed_time = int(time.perf_counter() - start)

        # Check if we got a structured response
        if not structured_response_extracted:
            raise Exception(
                f"Empty response from Claude after {iteration} iterations. "
                f"Stop reason: {message.stop_reason}"
            )

        # Extract output text from message
        output_text = self._extract_output_text(message)

        # Calculate cost (Claude doesn't have web search)
        cost = calculate_cost(
            request.model, input_tokens, cached_input_tokens, output_tokens, reasoning_tokens, 0
        )

        cost_str = f"{cost:.4f}" if cost is not None else "0.0000"
        logger.info(
            f"Claude response complete: duration={elapsed_time}s, "
            f"iterations={iteration}, cost=${cost_str}"
        )
        logger.info(f"Output text preview: {output_text[:200]}...")

        return AIResponse(
            response=structured_response_extracted,
            elapsed_time=elapsed_time,
            output_text=output_text,
            input_tokens=input_tokens,
            cached_input_tokens=cached_input_tokens,
            output_tokens=output_tokens,
            reasoning_tokens=reasoning_tokens,
            cost=cost,
        )

    def _build_messages(self, request: AIRequest) -> list[dict[str, Any]]:
        """Build messages array for Claude API.

        Args:
            request: AI request with prompts

        Returns:
            List of message dicts for Claude API
        """
        # Claude uses a single system parameter and alternating user/assistant messages
        # We'll put system prompt as system parameter and user prompt as first user message
        return [{"role": "user", "content": request.user_prompt}]

    def _build_tools(
        self, response_model: type[BaseModel], function_tools: list[AIFunction]
    ) -> list[dict[str, Any]]:
        """Build tools array for Claude API.

        Uses the single-tool pattern for structured output: the response_model schema
        is wrapped as a tool that Claude must call to return the structured response.

        Args:
            response_model: Pydantic model for structured response
            function_tools: List of function tools available for Claude

        Returns:
            List of tool definitions for Claude API
        """
        tools: list[dict[str, Any]] = []

        # Add structured output tool (single-tool pattern)
        tools.append(
            {
                "name": STRUCTURED_OUTPUT_TOOL_NAME,
                "description": "Return the structured analysis result",
                "input_schema": response_model.model_json_schema(),
            }
        )

        # Add function tools
        for func_tool in function_tools:
            tools.append(
                {
                    "name": func_tool.get_name(),
                    "description": func_tool.get_description(),
                    "input_schema": func_tool.get_model().model_json_schema(),
                }
            )

        return tools

    def _call_claude_api(
        self,
        streaming: bool,
        request: AIRequest,
        tools: list[dict[str, Any]],
        messages: list[dict[str, Any]],
        progress_handle: ProgressHandle,
    ) -> Message:
        """Call Claude API with retry logic.

        Args:
            streaming: Whether to use streaming mode
            request: AI request with model settings
            tools: Tool definitions for Claude
            messages: Message history
            progress_handle: Handle for progress updates

        Returns:
            Message response from Claude

        Raises:
            APIError: If all retry attempts fail
        """
        attempt = 1

        while True:
            start = time.perf_counter()
            try:
                if streaming:
                    message = self._call_claude_api_streamed(
                        request, tools, messages, progress_handle
                    )
                else:
                    message = self._call_claude_api_non_streamed(
                        request, tools, messages, progress_handle
                    )

                # Record successful API call metrics
                duration = time.perf_counter() - start
                if message.usage and self.metrics_service:
                    input_tokens = message.usage.input_tokens
                    cached_input_attr = getattr(
                        message.usage, "cache_read_input_tokens", None
                    )
                    cached_input = cached_input_attr if cached_input_attr is not None else 0
                    output_tokens = message.usage.output_tokens
                    cost = calculate_cost(
                        request.model,
                        input_tokens,
                        cached_input,
                        output_tokens,
                        0,  # reasoning_tokens (Claude doesn't separate)
                        0,  # web_search_count (Claude doesn't have web search)
                    )

                    # Log warning if reasoning_effort was provided (Claude doesn't support it)
                    if request.reasoning_effort:
                        logger.warning(
                            f"reasoning_effort parameter ({request.reasoning_effort}) "
                            "is not supported by Claude and will be ignored"
                        )

                    self.metrics_service.record_ai_analysis(
                        status="success",
                        model=request.model,
                        verbosity=request.verbosity,
                        reasoning_effort=request.reasoning_effort or "none",
                        duration=duration,
                        tokens_input=input_tokens,
                        tokens_output=output_tokens,
                        tokens_reasoning=0,  # Claude doesn't separate reasoning
                        tokens_cached_input=cached_input,
                        cost_dollars=cost or 0.0,
                    )

                return message

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
                        cost_dollars=0.0,
                    )

                if attempt >= 3:
                    raise

                attempt += 1
                logger.warning(f"Claude API error on attempt {attempt}, retrying: {e}")
                time.sleep(2**attempt)

    def _call_claude_api_non_streamed(
        self,
        request: AIRequest,
        tools: list[dict[str, Any]],
        messages: list[dict[str, Any]],
        progress_handle: ProgressHandle,
    ) -> Message:
        """Call Claude API in non-streaming mode.

        Args:
            request: AI request with model and system prompt
            tools: Tool definitions
            messages: Message history
            progress_handle: Handle for progress updates

        Returns:
            Complete Message from Claude
        """
        return self.client.messages.create(
            model=request.model,
            max_tokens=MAX_TOKENS,
            system=request.system_prompt,
            messages=cast(Any, messages),
            tools=cast(Any, tools),
        )

    def _call_claude_api_streamed(
        self,
        request: AIRequest,
        tools: list[dict[str, Any]],
        messages: list[dict[str, Any]],
        progress_handle: ProgressHandle,
    ) -> Message:
        """Call Claude API in streaming mode with progress updates.

        Args:
            request: AI request with model and system prompt
            tools: Tool definitions
            messages: Message history
            progress_handle: Handle for progress updates

        Returns:
            Complete Message from Claude after streaming completes
        """
        # Track accumulated tool inputs during streaming
        current_tool_use: dict[str, Any] | None = None
        accumulated_tool_input: str = ""

        with self.client.messages.stream(
            model=request.model,
            max_tokens=MAX_TOKENS,
            system=request.system_prompt,
            messages=cast(Any, messages),
            tools=cast(Any, tools),
        ) as stream:
            logger.info("Streaming Claude response")

            for event in stream:
                # Handle different streaming event types
                if event.type == "content_block_start":
                    # New content block starting
                    block = event.content_block
                    if isinstance(block, ToolUseBlock):
                        current_tool_use = {
                            "id": block.id,
                            "name": block.name,
                            "input": "",
                        }
                        accumulated_tool_input = ""

                        # Send progress update based on tool name (defensive try-except)
                        try:
                            if block.name == "url_classifier":
                                progress_handle.send_progress("Classifying URLs", 0.3)
                            elif block.name == "duplicate_search":
                                progress_handle.send_progress(
                                    "Searching for duplicates", 0.4
                                )
                            elif block.name == STRUCTURED_OUTPUT_TOOL_NAME:
                                progress_handle.send_progress("Generating response", 0.7)
                        except Exception as e:
                            logger.warning(f"Progress update failed: {e}")

                elif event.type == "content_block_delta":
                    # Content delta (text or tool input)
                    delta = event.delta
                    if hasattr(delta, "type"):
                        if delta.type == "input_json_delta":
                            # Accumulate tool input JSON
                            if hasattr(delta, "partial_json"):
                                accumulated_tool_input += delta.partial_json
                        elif delta.type == "text_delta":
                            # Text content being generated
                            if hasattr(delta, "text"):
                                try:
                                    progress_handle.send_progress("Writing response", 0.7)
                                except Exception as e:
                                    logger.warning(f"Progress update failed: {e}")

                elif event.type == "content_block_stop":
                    # Content block complete
                    if current_tool_use:
                        # Finalize tool input
                        current_tool_use["input"] = accumulated_tool_input
                        current_tool_use = None
                        accumulated_tool_input = ""

                elif event.type == "message_stop":
                    # Message complete
                    pass

            # Get final message from stream
            return stream.get_final_message()

    def _handle_tool_calls(
        self,
        message: Message,
        function_tools: list[AIFunction],
        messages: list[dict[str, Any]],
        progress_handle: ProgressHandle,
    ) -> bool:
        """Handle tool calls from Claude's response.

        Args:
            message: Message with tool_use blocks
            function_tools: Available function tools
            messages: Message history to append results
            progress_handle: Handle for progress updates

        Returns:
            True if any function tools were called (excluding structured_response)
        """
        had_function_call = False
        tool_results: list[dict[str, Any]] = []

        for block in message.content:
            if isinstance(block, ToolUseBlock):
                # Skip structured_response tool (it's not a function call)
                if block.name == STRUCTURED_OUTPUT_TOOL_NAME:
                    continue

                # Find matching function tool
                for func_tool in function_tools:
                    if func_tool.get_name() == block.name:
                        logger.info(
                            f"Executing function tool: {block.name} (id={block.id})"
                        )
                        logger.info(f"Tool input: {json.dumps(block.input)[:200]}...")

                        try:
                            # Execute function with validated input
                            request_model = func_tool.get_model().model_validate(
                                block.input
                            )
                            result = func_tool.execute(request_model, progress_handle)

                            # Convert result to JSON
                            result_json = result.model_dump_json()
                            logger.info(f"Tool result: {result_json[:200]}...")

                            # Add successful tool result
                            tool_results.append(
                                {
                                    "type": "tool_result",
                                    "tool_use_id": block.id,
                                    "content": result_json,
                                }
                            )

                            progress_handle.send_progress_text("Continuing analysis")
                            had_function_call = True

                        except Exception as e:
                            # Handle tool execution failure
                            logger.error(
                                f"Function tool {block.name} execution failed: {e}",
                                exc_info=True,
                            )

                            # Return error as tool result
                            tool_results.append(
                                {
                                    "type": "tool_result",
                                    "tool_use_id": block.id,
                                    "is_error": True,
                                    "content": f"Error executing tool: {str(e)}",
                                }
                            )

                        break

        # Append assistant message with tool uses
        messages.append({"role": "assistant", "content": message.content})

        # Append user message with tool results
        if tool_results:
            messages.append({"role": "user", "content": tool_results})

        return had_function_call

    def _extract_output_text(self, message: Message) -> str:
        """Extract text output from Claude's message.

        Args:
            message: Message from Claude

        Returns:
            Concatenated text content
        """
        text_parts: list[str] = []

        for block in message.content:
            if isinstance(block, TextBlock):
                text_parts.append(block.text)
            elif isinstance(block, ToolUseBlock):
                # Include tool names in output text
                text_parts.append(f"[Tool: {block.name}]")

        return " ".join(text_parts) if text_parts else "(no text output)"
