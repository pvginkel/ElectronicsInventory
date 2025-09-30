"""Utility modules for the Electronics Inventory application."""

from flask import current_app, g, request
from flask_log_request_id import current_request_id
from flask_log_request_id.ctx_fetcher import ExecutedOutsideContext
from flask_log_request_id.request_id import flask_ctx_get_request_id


def _g_request_id_fetcher() -> str | None:
    """Fallback fetcher compatible with Flask 3.x application contexts."""
    try:
        attr_name = current_app.config.get("LOG_REQUEST_ID_G_OBJECT_ATTRIBUTE", "log_request_id")
        return getattr(g, attr_name, None)
    except RuntimeError as exc:
        raise ExecutedOutsideContext() from exc


current_request_id.register_fetcher(_g_request_id_fetcher)

try:
    current_request_id.ctx_fetchers.remove(flask_ctx_get_request_id)
except ValueError:
    pass


def get_current_correlation_id() -> str | None:
    """Get correlation ID from current request context if available."""
    try:
        return current_request_id()
    except (RuntimeError, ImportError):
        # No request context available or Flask compatibility issue
        return None


def ensure_request_id_from_query(query_value: str | None) -> None:
    """Populate Flask-Log-Request-ID context using a query-provided identifier.

    This allows SSE endpoints to opt into deterministic correlation identifiers when
    clients cannot set HTTP headers (e.g., Playwright's EventSource shim).
    """
    if not query_value:
        return

    try:
        attr_name = current_app.config.get("LOG_REQUEST_ID_G_OBJECT_ATTRIBUTE", "log_request_id")
    except RuntimeError:
        # Outside an application context; nothing to do
        return

    # Only override the identifier when the client didn't provide one via headers.
    if request.headers.get("X-Request-ID") or request.headers.get("X-Correlation-ID"):
        return

    setattr(g, attr_name, query_value)
