"""Flask application error handlers."""

from flask import Flask, jsonify
from pydantic import ValidationError
from sqlalchemy.exc import IntegrityError


def register_error_handlers(app: Flask) -> None:
    """Register Flask error handlers for common exceptions."""

    @app.errorhandler(ValidationError)
    def handle_validation_error(error: ValidationError):
        """Handle Pydantic validation errors."""
        error_details = []
        for err in error.errors():
            field = ".".join(str(x) for x in err["loc"])
            message = err["msg"]
            error_details.append(f"{field}: {message}")

        return jsonify({
            "error": "Validation failed",
            "details": error_details
        }), 400

    @app.errorhandler(IntegrityError)
    def handle_integrity_error(error: IntegrityError):
        """Handle database integrity constraint violations."""
        error_msg = str(error.orig) if hasattr(error, 'orig') else str(error)

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

    @app.errorhandler(404)
    def handle_not_found(error):
        """Handle 404 Not Found errors."""
        return jsonify({
            "error": "Resource not found",
            "details": "The requested resource could not be found"
        }), 404

    @app.errorhandler(405)
    def handle_method_not_allowed(error):
        """Handle 405 Method Not Allowed errors."""
        return jsonify({
            "error": "Method not allowed",
            "details": "The HTTP method is not allowed for this endpoint"
        }), 405

    @app.errorhandler(500)
    def handle_internal_server_error(error):
        """Handle 500 Internal Server Error."""
        return jsonify({
            "error": "Internal server error",
            "details": "An unexpected error occurred"
        }), 500
