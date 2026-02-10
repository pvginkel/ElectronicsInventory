"""Centralized error handling utilities."""

import functools
import logging
from collections.abc import Callable
from typing import Any

from flask import current_app, jsonify
from flask.wrappers import Response
from pydantic import ValidationError
from sqlalchemy.exc import IntegrityError
from werkzeug.exceptions import BadRequest

from app.exceptions import (
    AuthenticationException,
    AuthorizationException,
    BusinessLogicException,
    CapacityExceededException,
    DependencyException,
    InsufficientQuantityException,
    InvalidOperationException,
    RecordNotFoundException,
    ResourceConflictException,
    RouteNotAvailableException,
    ValidationException,
)
from app.utils import get_current_correlation_id

logger = logging.getLogger(__name__)


def _build_error_response(error: str, details: dict[str, Any], code: str | None = None, status_code: int = 400) -> tuple[Response, int]:
    """Build error response with correlation ID and optional error code."""
    response_data = {
        "error": error,
        "details": details
    }

    # Add error code if provided
    if code:
        response_data["code"] = code

    correlation_id = get_current_correlation_id()
    if correlation_id:
        response_data["correlationId"] = correlation_id

    return jsonify(response_data), status_code


def handle_api_errors(func: Callable[..., Any]) -> Callable[..., Response | tuple[Response | str, int]]:
    """Decorator to handle common API errors consistently.

    Handles ValidationError, IntegrityError, and generic exceptions
    with appropriate HTTP status codes and error messages.
    """
    @functools.wraps(func)
    def wrapper(*args: Any, **kwargs: Any) -> Any:
        try:
            return func(*args, **kwargs)
        except Exception as e:
            # Mark session for rollback when any exception is caught
            try:
                container = current_app.container
                db_session = container.db_session()
                db_session.info['needs_rollback'] = True
            except Exception:
                # Ignore errors in rollback marking - don't want to mask the original error
                pass

            # Log all exceptions with stack trace
            logger.error("Exception in %s: %s", func.__name__, str(e), exc_info=True)

            # Handle specific exception types
            try:
                raise
            except BadRequest:
                # JSON parsing errors from request.get_json()
                return _build_error_response(
                    "Invalid JSON",
                    {"message": "Request body must be valid JSON"},
                    status_code=400
                )
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

                return _build_error_response(
                    "Validation failed",
                    {"errors": error_details},
                    status_code=400
                )

            except AuthenticationException as e:
                # Authentication failure (missing/invalid/expired token)
                return _build_error_response(
                    e.message,
                    {"message": "Authentication is required to access this resource"},
                    code=e.error_code,
                    status_code=401
                )

            except AuthorizationException as e:
                # Authorization failure (insufficient permissions)
                return _build_error_response(
                    e.message,
                    {"message": "You do not have permission to access this resource"},
                    code=e.error_code,
                    status_code=403
                )

            except ValidationException as e:
                # Request validation failure (malformed input, invalid redirect, etc.)
                return _build_error_response(
                    e.message,
                    {"message": "The request contains invalid data"},
                    code=e.error_code,
                    status_code=400
                )

            except RecordNotFoundException as e:
                # Custom domain exception for not found resources
                return _build_error_response(
                    e.message,
                    {"message": "The requested resource could not be found"},
                    code=e.error_code,
                    status_code=404
                )

            except DependencyException as e:
                # Custom domain exception for dependency conflicts
                return _build_error_response(
                    e.message,
                    {"message": "The resource cannot be deleted due to dependencies"},
                    code=e.error_code,
                    status_code=409
                )

            except ResourceConflictException as e:
                # Custom domain exception for resource conflicts
                return _build_error_response(
                    e.message,
                    {"message": "A resource with those details already exists"},
                    code=e.error_code,
                    status_code=409
                )

            except InsufficientQuantityException as e:
                # Custom domain exception for insufficient quantities
                return _build_error_response(
                    e.message,
                    {"message": "The requested quantity is not available"},
                    code=e.error_code,
                    status_code=409
                )

            except CapacityExceededException as e:
                # Custom domain exception for capacity limits
                return _build_error_response(
                    e.message,
                    {"message": "The operation would exceed storage capacity"},
                    code=e.error_code,
                    status_code=409
                )

            except InvalidOperationException as e:
                # Custom domain exception for invalid operations
                return _build_error_response(
                    e.message,
                    {"message": "The requested operation cannot be performed"},
                    code=e.error_code,
                    status_code=409
                )

            except RouteNotAvailableException as e:
                # Custom domain exception for route access control
                return _build_error_response(
                    e.message,
                    {"message": "Testing endpoints require FLASK_ENV=testing"},
                    code=e.error_code,
                    status_code=400
                )

            except BusinessLogicException as e:
                # Generic business logic exception (fallback for custom exceptions)
                return _build_error_response(
                    e.message,
                    {"message": "A business logic operation failed"},
                    code=e.error_code,
                    status_code=400
                )

            except IntegrityError as e:
                # Database constraint violations
                error_msg = str(e.orig) if hasattr(e, 'orig') else str(e)

                # Map common constraint violations to user-friendly messages
                if "UNIQUE constraint failed" in error_msg or "duplicate key" in error_msg.lower():
                    return _build_error_response(
                        "Resource already exists",
                        {"message": "A record with these values already exists"},
                        status_code=409
                    )
                elif "FOREIGN KEY constraint failed" in error_msg or "foreign key" in error_msg.lower():
                    return _build_error_response(
                        "Invalid reference",
                        {"message": "Referenced resource does not exist"},
                        status_code=400
                    )
                elif "NOT NULL constraint failed" in error_msg or "null value" in error_msg.lower():
                    return _build_error_response(
                        "Missing required field",
                        {"message": "Required field cannot be empty"},
                        status_code=400
                    )
                else:
                    return _build_error_response(
                        "Database constraint violation",
                        {"message": "The operation violates a database constraint"},
                        status_code=400
                    )

            except Exception as e:
                # Generic error handler
                return _build_error_response(
                    "Internal server error",
                    {"message": str(e)},
                    status_code=500
                )

    return wrapper
