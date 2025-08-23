"""
Spectree configuration with Pydantic v2 compatibility.
"""
from flask import Flask
from spectree import SpecTree

# Global Spectree instance that can be imported by API modules
# This will be initialized by configure_spectree() before any imports of the API modules
api: SpecTree = None  # type: ignore


def configure_spectree(app: Flask) -> SpecTree:
    """
    Configure Spectree with proper Pydantic v2 integration and custom settings.

    Returns:
        SpecTree: Configured Spectree instance
    """
    global api

    # Create Spectree instance with Flask backend
    api = SpecTree(
        backend_name="flask",
        app=app,
        title="Electronics Inventory API",
        version="1.0.0",
        description="Hobby electronics parts inventory management system",
        path="docs",  # OpenAPI docs available at /docs
        validation_error_status=400,
    )

    return api


def _custom_validation_error_handler(error, request):
    """
    Custom validation error handler to maintain consistency with existing error format.

    Args:
        error: Validation error from Spectree
        request: Flask request object

    Returns:
        tuple: (dict, int) - Formatted error response and status code
    """
    # Extract error details from Spectree validation error
    error_details = []

    if hasattr(error, 'errors') and callable(error.errors):
        # Pydantic ValidationError
        for err in error.errors():
            field = ".".join(str(x) for x in err.get("loc", []))
            message = err.get("msg", "Validation error")
            error_details.append(f"{field}: {message}" if field else message)
    elif hasattr(error, 'errors') and error.errors:
        # List of errors
        for err in error.errors:
            if hasattr(err, 'get'):
                # Pydantic v2 error format
                field = ".".join(str(loc) for loc in err.get('loc', []))
                message = err.get('msg', 'Validation error')
                error_details.append(f"{field}: {message}" if field else message)
            else:
                # Fallback for other error formats
                error_details.append(str(err))
    else:
        # Fallback - use string representation
        error_details.append(str(error))

    # Format consistent with existing error handling
    return {
        "error": "Validation failed",
        "details": error_details
    }, 400
