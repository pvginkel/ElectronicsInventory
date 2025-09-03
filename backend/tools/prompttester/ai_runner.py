import time
import os
import logging
import json

from typing import Type
from openai import OpenAI
from openai.types.responses.response_usage import ResponseUsage
from openai.types.responses.function_tool_param import FunctionToolParam
from pydantic import BaseModel

from tools.prompttester.url_classifier_service import ClassifyUrlsRequest, URLClassifierService

logger = logging.getLogger(__name__)


class AIResponse(BaseModel):
    response: BaseModel
    output_text: str
    elapsed_time: float
    usage: ResponseUsage | None


class AIRunner:
    def __init__(self, model: Type[BaseModel], url_classifier: URLClassifierService):
        self.client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        self.model = model
        self.url_classifier = url_classifier

    def run(self, model: str, verbosity: str, reasoning_effort: str | None, prompt: str, text_input: str) -> AIResponse:
        # Build input and instructions for Responses API
        input_content = self._build_responses_api_input(prompt, text_input)

        start = time.perf_counter()
        ai_response = None

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

        while True:
            logger.info("Starting OpenAI call")

            again = False

            # Call OpenAI Responses API with structured output
            response = self.client.responses.parse(
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

            input_content += response.output

            logger.info(f"Input tokens {response.usage.input_tokens}, cached {response.usage.input_tokens_details.cached_tokens}, output {response.usage.output_tokens}, reasoning {response.usage.output_tokens_details.reasoning_tokens}")

            for item in response.output:
                if item.type == "function_call":
                    if item.name == "classify_urls":
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
            usage=response.usage
        )

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