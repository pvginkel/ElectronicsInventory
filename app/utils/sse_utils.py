"""Shared SSE utility functions for both tasks and version endpoints."""

import json

from flask import Response

SSE_HEARTBEAT_INTERVAL = 5  # Will be overridden by config


def format_sse_event(event: str, data: dict | str) -> str:
    """Format event name and data into SSE format.

    Args:
        event: The event name
        data: The event data (dict will be JSON-encoded)

    Returns:
        Formatted SSE event string
    """
    if isinstance(data, dict):
        data = json.dumps(data)
    return f"event: {event}\ndata: {data}\n\n"


def create_sse_response(generator) -> Response:
    """Create Response with standard SSE headers.

    Args:
        generator: Generator function that yields SSE-formatted strings

    Returns:
        Flask Response configured for SSE streaming
    """
    return Response(
        generator,
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Cache-Control"
        }
    )
