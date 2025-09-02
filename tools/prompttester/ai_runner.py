import time
import os
import logging
from typing import Type

from openai import OpenAI
from pydantic import BaseModel

logger = logging.getLogger(__name__)


class AIResponse(BaseModel):
    response: BaseModel
    output_text: str
    elapsed_time: float
    input_tokens: int
    output_tokens: int


class AIRunner:
    def __init__(self, model: Type[BaseModel]):
        self.client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        self.model = model

    def run(self, model: str, verbosity: str, reasoning_effort: str | None, prompt: str, text_input: str) -> AIResponse:
        # Build input and instructions for Responses API
        input_content = self._build_responses_api_input(prompt, text_input)

        logger.info("Starting OpenAI call")

        start = time.perf_counter()
        ai_response = None

        # Call OpenAI Responses API with structured output
        response = self.client.responses.parse(
            model=model,
            input=input_content,
            text_format=self.model,
            text={ "verbosity": verbosity }, # type: ignore
            tools=[
                { "type": "web_search" },
            ],
            reasoning = {
                "effort": reasoning_effort # type: ignore
            },
        )

        elapsed_time = int(time.perf_counter() - start)

        logger.info(f"OpenAI response status: {response.status}, duration {elapsed_time}, incomplete details: {response.incomplete_details}")
        # logger.info(f"Output text: {response.output_text}")

        ai_response = response.output_parsed
        if not ai_response or not response.output_text:
            raise Exception(f"Empty response from OpenAI status {response.status}, incomplete details: {response.incomplete_details}")

        return AIResponse(
            response=ai_response,
            elapsed_time=elapsed_time,
            output_text=response.output_text,
            input_tokens=response.usage.input_tokens,
            output_tokens=response.usage.output_tokens
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