"""Centralized error handling utilities."""

import functools
from collections.abc import Callable
from typing import Any

from flask import jsonify
from flask.wrappers import Response
from pydantic import ValidationError
from sqlalchemy.exc import IntegrityError


def handle_api_errors(func: Callable[..., Any]) -> Callable[..., Response | tuple[Response | str, int]]:
    """Decorator to handle common API errors consistently.

    Handles ValidationError, IntegrityError, and generic exceptions
    with appropriate HTTP status codes and error messages.
    """
    @functools.wraps(func)
    def wrapper(*args: Any, **kwargs: Any) -> Any:
        try:
            return func(*args, **kwargs)
        except ValidationError as e:
            # Pydantic validation errors
            error_details = []
            for error in e.errors():
                field = ".".join(str(x) for x in error["loc"])
                message = error["msg"]
                error_details.append(f"{field}: {message}")

            return jsonify({
                "error": "Validation failed",
                "details": error_details
            }), 400

        except IntegrityError as e:
            # Database constraint violations
            error_msg = str(e.orig) if hasattr(e, 'orig') else str(e)

            # Map common constraint violations to user-friendly messages
            if "UNIQUE constraint failed" in error_msg or "duplicate key" in error_msg.lower():
                return jsonify({
                    "error": "Resource already exists",
                    "details": "A record with these values already exists"
                }), 409
            elif "FOREIGN KEY constraint failed" in error_msg or "foreign key" in error_msg.lower():
                return jsonify({
                    "error": "Invalid reference",
                    "details": "Referenced resource does not exist"
                }), 400
            elif "NOT NULL constraint failed" in error_msg or "null value" in error_msg.lower():
                return jsonify({
                    "error": "Missing required field",
                    "details": "Required field cannot be empty"
                }), 400
            else:
                return jsonify({
                    "error": "Database constraint violation",
                    "details": "The operation violates a database constraint"
                }), 400

        except Exception as e:
            # Generic error handler
            return jsonify({
                "error": "Internal server error",
                "details": str(e)
            }), 500

    return wrapper
