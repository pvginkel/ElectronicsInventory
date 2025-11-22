"""SSE client helper for parsing Server-Sent Events in tests.

This module provides a reusable SSE client for integration tests that need to validate
SSE stream behavior. The client supports both strict and lenient parsing modes.
"""

import json
import logging
from typing import Any

import requests

logger = logging.getLogger(__name__)


class SSEClient:
    """Client for parsing Server-Sent Events streams in tests.

    Supports both strict and lenient parsing modes:
    - strict=True: Raises ValueError on malformed events or JSON parse errors
    - strict=False: Logs warnings and continues on parse errors

    Example usage:
        client = SSEClient("http://localhost:5000/api/tasks/abc123/stream", strict=True)
        for event in client.connect(timeout=10):
            print(f"Event: {event['event']}, Data: {event['data']}")
    """

    def __init__(self, url: str, strict: bool = True):
        """Initialize SSE client.

        Args:
            url: The SSE endpoint URL to connect to
            strict: If True, raise exceptions on malformed events; if False, skip and log warnings
        """
        self.url = url
        self.strict = strict

    def connect(self, timeout: float = 10.0) -> Any:
        """Connect to SSE endpoint and yield parsed events.

        Args:
            timeout: Request timeout in seconds

        Yields:
            Dict with 'event' and 'data' keys for each SSE event

        Raises:
            requests.RequestException: On connection or HTTP errors
            ValueError: On malformed events (only if strict=True)
        """
        # Open streaming connection
        response = requests.get(self.url, stream=True, timeout=timeout)
        response.raise_for_status()

        # Parse SSE stream
        event_name = None
        data_lines: list[str] = []

        for line in response.iter_lines(decode_unicode=True):
            # SSE spec: lines are either field:value or blank (event terminator)
            if line == "":
                # Blank line = event boundary
                if event_name is not None and data_lines:
                    # We have a complete event
                    data_str = "\n".join(data_lines)

                    # Parse JSON data
                    try:
                        data = json.loads(data_str)
                    except json.JSONDecodeError as e:
                        if self.strict:
                            raise ValueError(f"Failed to parse SSE event data as JSON: {data_str}") from e
                        else:
                            logger.warning(f"Failed to parse SSE event data as JSON: {data_str}, error: {e}")
                            # Yield raw string in lenient mode
                            data = data_str

                    yield {"event": event_name, "data": data}

                # Reset for next event
                event_name = None
                data_lines = []

            elif line.startswith("event:"):
                # Event name field
                event_name = line[6:].strip()

            elif line.startswith("data:"):
                # Data field (can have multiple data lines)
                data_lines.append(line[5:].strip())

            elif line.startswith(":"):
                # Comment line (ignore)
                continue

            elif line.startswith("id:") or line.startswith("retry:"):
                # Optional fields we don't use (ignore)
                continue

            else:
                # Unknown field format
                if self.strict:
                    raise ValueError(f"Malformed SSE line (no field:value format): {line}")
                else:
                    logger.warning(f"Ignoring malformed SSE line: {line}")

        # Handle case where stream ends with event data but no final blank line
        if event_name is not None and data_lines:
            data_str = "\n".join(data_lines)
            try:
                data = json.loads(data_str)
            except json.JSONDecodeError as e:
                if self.strict:
                    raise ValueError(f"Failed to parse final SSE event data as JSON: {data_str}") from e
                else:
                    logger.warning(f"Failed to parse final SSE event data as JSON: {data_str}, error: {e}")
                    data = data_str

            yield {"event": event_name, "data": data}
