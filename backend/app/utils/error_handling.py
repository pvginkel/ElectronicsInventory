"""Centralized error handling utilities."""

import functools
from collections.abc import Callable
from typing import Any

from flask import jsonify
from flask.wrappers import Response
from pydantic import ValidationError
from sqlalchemy.exc import IntegrityError
from werkzeug.exceptions import BadRequest

from app.exceptions import (
    CapacityExceededException,
    InsufficientQuantityException,
    InvalidOperationException,
    InventoryException,
    RecordNotFoundException,
    ResourceConflictException,
)


def handle_api_errors(func: Callable[..., Any]) -> Callable[..., Response | tuple[Response | str, int]]:
    """Decorator to handle common API errors consistently.

    Handles ValidationError, IntegrityError, and generic exceptions
    with appropriate HTTP status codes and error messages.
    """
    @functools.wraps(func)
    def wrapper(*args: Any, **kwargs: Any) -> Any:
        try:
            return func(*args, **kwargs)
        except BadRequest:
            # JSON parsing errors from request.get_json()
            return jsonify({
                "error": "Invalid JSON",
                "details": {"message": "Request body must be valid JSON"}
            }), 400
        except ValidationError as e:
            # Pydantic validation errors
            error_details = []
            for error in e.errors():
                field = ".".join(str(x) for x in error["loc"])
                message = error["msg"]
                error_details.append({
                    "message": message,
                    "field": field
                })

            return jsonify({
                "error": "Validation failed",
                "details": error_details
            }), 400

        except RecordNotFoundException as e:
            # Custom domain exception for not found resources
            return jsonify({
                "error": e.message,
                "details": {"message": "The requested resource could not be found"}
            }), 404

        except ResourceConflictException as e:
            # Custom domain exception for resource conflicts
            return jsonify({
                "error": e.message,
                "details": {"message": "A resource with those details already exists"}
            }), 409

        except InsufficientQuantityException as e:
            # Custom domain exception for insufficient quantities
            return jsonify({
                "error": e.message,
                "details": {"message": "The requested quantity is not available"}
            }), 409

        except CapacityExceededException as e:
            # Custom domain exception for capacity limits
            return jsonify({
                "error": e.message,
                "details": {"message": "The operation would exceed storage capacity"}
            }), 409

        except InvalidOperationException as e:
            # Custom domain exception for invalid operations
            return jsonify({
                "error": e.message,
                "details": {"message": "The requested operation cannot be performed"}
            }), 409

        except InventoryException as e:
            # Generic inventory exception (fallback for custom exceptions)
            return jsonify({
                "error": e.message,
                "details": {"message": "An inventory operation failed"}
            }), 400

        except IntegrityError as e:
            # Database constraint violations
            error_msg = str(e.orig) if hasattr(e, 'orig') else str(e)

            # Map common constraint violations to user-friendly messages
            if "UNIQUE constraint failed" in error_msg or "duplicate key" in error_msg.lower():
                return jsonify({
                    "error": "Resource already exists",
                    "details": {"message": "A record with these values already exists"}
                }), 409
            elif "FOREIGN KEY constraint failed" in error_msg or "foreign key" in error_msg.lower():
                return jsonify({
                    "error": "Invalid reference",
                    "details": {"message": "Referenced resource does not exist"}
                }), 400
            elif "NOT NULL constraint failed" in error_msg or "null value" in error_msg.lower():
                return jsonify({
                    "error": "Missing required field",
                    "details": {"message": "Required field cannot be empty"}
                }), 400
            else:
                return jsonify({
                    "error": "Database constraint violation",
                    "details": {"message": "The operation violates a database constraint"}
                }), 400

        except Exception as e:
            # Generic error handler
            return jsonify({
                "error": "Internal server error",
                "details": {"message": str(e)}
            }), 500

    return wrapper
