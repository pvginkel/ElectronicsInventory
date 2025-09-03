import time
import os
import logging
import json

from typing import Any, Protocol, Type
from openai import OpenAI
from openai.types.responses.response_usage import ResponseUsage
from openai.types.responses.function_tool_param import FunctionToolParam
from openai.types.responses import ResponseOutputItemDoneEvent, ResponseFunctionWebSearch, ResponseCompletedEvent, ParsedResponseOutputMessage, ParsedResponseOutputText, ResponseOutputMessage,  ResponseOutputText, ResponseContentPartAddedEvent, ResponseFunctionCallArgumentsDoneEvent
from openai.types.responses.response_function_web_search import ActionSearch
from openai.types.responses.parsed_response import ParsedResponse, ParsedResponseFunctionToolCall

from pydantic import BaseModel

from url_classifier_service import ClassifyUrlsRequest, URLClassifierService

logger = logging.getLogger(__name__)


class ProgressHandle():
    """Interface for sending progress updates to connected clients."""

    def send_progress_text(self, text: str) -> None:
        """Send a text progress update to connected clients."""
        logger.info(f"Progress {text}")

    def send_progress_value(self, value: float) -> None:
        """Send a progress value update (0.0 to 1.0) to connected clients."""
        logger.info(f"Progress {int(value * 100)}%")

    def send_progress(self, text: str, value: float) -> None:
        """Send both text and progress value update to connected clients."""
        logger.info(f"Progress {text} {int(value * 100)}%")


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
    def __init__(self, model: Type[BaseModel], url_classifier: URLClassifierService):
        self.client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        self.model = model
        self.url_classifier = url_classifier

    def run(self, streaming: bool, model: str, verbosity: str, reasoning_effort: str | None, prompt: str, text_input: str) -> AIResponse:
        # Build input and instructions for Responses API
        input_content = self._build_responses_api_input(prompt, text_input)

        start = time.perf_counter()

        ai_response = None
        input_tokens = 0
        cached_input_tokens = 0
        output_tokens = 0
        reasoning_tokens = 0

        function_tool : FunctionToolParam = {
            "type": "function",
            "name": "classify_urls",
            "strict": True,
            "description": "Classify the URLs as PDF, image, webpage or invalid.",
            "parameters": {
                "type": "object",
                "properties": {
                    "urls": {
                        "type": "array",
                        "items": {
                            "type": "string"
                        }
                    }
                },
                "required": ["urls"],
                "additionalProperties": False
            }
        }

        progress_handle = ProgressHandle()

        while True:
            logger.info("Starting OpenAI call")

            again = False

            if streaming:
                response = self._call_openai_api_streamed(model, reasoning_effort, verbosity, function_tool, input_content, progress_handle)
            else:
                response = self._call_openai_api(model, reasoning_effort, verbosity, function_tool, input_content, progress_handle)

            if response.usage:
                input_tokens += response.usage.input_tokens
                cached_input_tokens += response.usage.input_tokens_details.cached_tokens
                output_tokens += response.usage.output_tokens
                reasoning_tokens += response.usage.output_tokens_details.reasoning_tokens

            input_content += response.output

            if response.usage:
                logger.info(f"Input tokens {response.usage.input_tokens}, cached {response.usage.input_tokens_details.cached_tokens}, output {response.usage.output_tokens}, reasoning {response.usage.output_tokens_details.reasoning_tokens}")

            for item in response.output:
                if item.type == "function_call":
                    if item.name == "classify_urls":
                        progress_handle.send_progress_text("Checking URLs...")

                        logger.info("Request to classify URLs call ID")

                        logger.info(f"Request JSON: {item.arguments}")

                        result = self.url_classifier.classify_urls(ClassifyUrlsRequest.model_validate_json(item.arguments))

                        result_json = result.model_dump_json()

                        logger.info(f"Result JSON: {result_json}")

                        input_content.append({
                            "type": "function_call_output",
                            "call_id": item.call_id,
                            "output": result_json
                        })

                        progress_handle.send_progress_text("Thinking...")
                        again = True
            
            if not again:
                break

        elapsed_time = int(time.perf_counter() - start)

        logger.info(f"OpenAI response status: {response.status}, duration {elapsed_time}, incomplete details: {response.incomplete_details}")
        logger.info(f"Output text: {response.output_text}")

        ai_response = response.output_parsed
        if not ai_response or not response.output_text:
            raise Exception(f"Empty response from OpenAI status {response.status}, incomplete details: {response.incomplete_details}")

        return AIResponse(
            response=ai_response,
            elapsed_time=elapsed_time,
            output_text=response.output_text,
            input_tokens=input_tokens,
            cached_input_tokens=cached_input_tokens,
            output_tokens=output_tokens,
            reasoning_tokens=reasoning_tokens,
            cost=self._calculate_cost(model, input_tokens, cached_input_tokens, output_tokens, reasoning_tokens)
        )


    def _call_openai_api(self, model: str, reasoning_effort: str | None, verbosity: str, function_tool: FunctionToolParam, input_content: list, progress_handle: ProgressHandle) -> ParsedResponse:
        # Call OpenAI Responses API with structured output
        return self.client.responses.parse(
            model=model,
            input=input_content,
            text_format=self.model,
            text={ "verbosity": verbosity }, # type: ignore
            tools=[
                { "type": "web_search" },
                function_tool
            ],
            reasoning = {
                "effort": reasoning_effort # type: ignore
            },
        )

    def _call_openai_api_streamed(self, model: str, reasoning_effort: str | None, verbosity: str, function_tool: FunctionToolParam, input_content: list, progress_handle: ProgressHandle) -> ParsedResponse:
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
            model=model,
            input=input_content,
            text_format=self.model,
            text={ "verbosity": verbosity }, # type: ignore
            tools=[
                { "type": "web_search" },
                function_tool
            ],
            # tool_choice="required",
            reasoning = {
                "effort": reasoning_effort # type: ignore
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
                    progress_handle.send_progress("Writing response...", 0.5)
                if isinstance(event, ResponseCompletedEvent):
                    return event.response

                # logger.info(event)
                # logger.info(event.model_dump_json())

        raise Exception("Did not get ResponseCompletedEvent")

    def _build_responses_api_input(self, prompt: str, text_input: str) -> list:
        """Build instructions and input for OpenAI Responses API."""

        return [
            {
                "role": "developer",
                "content": [
                    {"type": "input_text", "text": prompt}
                ]
            },
            {
                "role": "user",
                "content": [
                    {"type": "input_text", "text": text_input},
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
            case _:
                return None

        return (
            cached_input_tokens * (cached_input_pm / 1_000_000) +
            (input_tokens - cached_input_tokens) * (input_tokens_pm / 1_000_000) +
            output_tokens * (output_pm / 1_000_000)
        )
