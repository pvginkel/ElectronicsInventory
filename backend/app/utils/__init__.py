"""Utility modules for the Electronics Inventory application."""

from flask_log_request_id import current_request_id


def get_current_correlation_id() -> str | None:
    """Get correlation ID from current request context if available."""
    try:
        return current_request_id()
    except (RuntimeError, ImportError):
        # No request context available or Flask compatibility issue
        return None
