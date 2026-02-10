"""API blueprints for Electronics Inventory."""

import logging

from dependency_injector.wiring import Provide, inject
from flask import Blueprint, Response, request

from app.config import Settings
from app.services.auth_service import AuthService
from app.services.container import ServiceContainer
from app.services.oidc_client_service import OidcClientService
from app.utils.auth import (
    authenticate_request,
    get_cookie_secure,
    get_token_expiry_seconds,
)

logger = logging.getLogger(__name__)

# Create main API blueprint
api_bp = Blueprint("api", __name__, url_prefix="/api")


@api_bp.before_request
@inject
def before_request_authentication(
    auth_service: AuthService = Provide[ServiceContainer.auth_service],
    oidc_client_service: OidcClientService = Provide[ServiceContainer.oidc_client_service],
    config: Settings = Provide[ServiceContainer.config],
) -> None | tuple[dict[str, str], int]:
    """Authenticate all requests to /api endpoints before processing.

    This hook runs before every request to endpoints under the /api blueprint.
    It checks if authentication is required and validates the JWT token.
    If the access token is expired but a refresh token is available, it will
    attempt to refresh the tokens automatically.

    Authentication is skipped if:
    - OIDC_ENABLED is False
    - The endpoint is marked with @public decorator

    Returns:
        None if authentication succeeds or is skipped
        Error response tuple if authentication fails
    """
    from flask import current_app

    from app.exceptions import AuthenticationException, AuthorizationException

    # Get the actual view function from Flask's view_functions
    endpoint = request.endpoint
    actual_func = current_app.view_functions.get(endpoint) if endpoint else None

    # Skip authentication for public endpoints (check first to avoid unnecessary work)
    if actual_func and getattr(actual_func, "is_public", False):
        logger.debug("Public endpoint - skipping authentication")
        return None

    # Skip authentication if OIDC is disabled
    if not config.oidc_enabled:
        logger.debug("OIDC disabled - skipping authentication")
        return None

    # Authenticate the request (may trigger token refresh)
    logger.debug("Authenticating request to %s %s", request.method, request.path)
    try:
        authenticate_request(auth_service, config, oidc_client_service, actual_func)
        return None
    except AuthenticationException as e:
        logger.warning("Authentication failed: %s", str(e))
        return {"error": str(e)}, 401
    except AuthorizationException as e:
        logger.warning("Authorization failed: %s", str(e))
        return {"error": str(e)}, 403


def _clear_auth_cookies(response: Response, config: Settings, cookie_secure: bool) -> None:
    """Clear all auth cookies on the response."""
    for name in (config.oidc_cookie_name, config.oidc_refresh_cookie_name, "id_token"):
        response.set_cookie(
            name,
            "",
            httponly=True,
            secure=cookie_secure,
            samesite=config.oidc_cookie_samesite,
            max_age=0,
        )


@api_bp.after_request
@inject
def after_request_set_cookies(
    response: Response,
    config: Settings = Provide[ServiceContainer.config],
) -> Response:
    """Set refreshed auth cookies on response if tokens were refreshed.

    This hook runs after every request to endpoints under the /api blueprint.
    If tokens were refreshed during authentication, it sets the new cookies
    on the response.

    Args:
        response: The Flask response object

    Returns:
        The response with updated cookies if needed
    """
    from flask import g

    # Check if we need to clear cookies (refresh failed)
    if getattr(g, "clear_auth_cookies", False):
        _clear_auth_cookies(response, config, get_cookie_secure(config))
        return response

    # Check if we have pending tokens from a refresh
    pending = getattr(g, "pending_token_refresh", None)
    if pending:
        cookie_secure = get_cookie_secure(config)

        # Validate refresh token exp before setting any cookies
        refresh_max_age: int | None = None
        if pending.refresh_token:
            refresh_max_age = get_token_expiry_seconds(pending.refresh_token)
            if refresh_max_age is None:
                logger.error("Refreshed token missing 'exp' claim — clearing auth cookies")
                _clear_auth_cookies(response, config, cookie_secure)
                return response

        # Set new access token cookie
        response.set_cookie(
            config.oidc_cookie_name,
            pending.access_token,
            httponly=True,
            secure=cookie_secure,
            samesite=config.oidc_cookie_samesite,
            max_age=pending.access_token_expires_in,
        )

        # Set new refresh token cookie (if provided and validated above)
        if pending.refresh_token and refresh_max_age is not None:
            response.set_cookie(
                config.oidc_refresh_cookie_name,
                pending.refresh_token,
                httponly=True,
                secure=cookie_secure,
                samesite=config.oidc_cookie_samesite,
                max_age=refresh_max_age,
            )

        logger.debug("Set refreshed auth cookies on response")

    return response


# Import and register all resource blueprints
# Note: Imports are done after api_bp creation to avoid circular imports
# Note: health_bp and metrics_bp are registered directly on the Flask app
# (not under /api) since they are for internal cluster use only
from app.api.ai_parts import ai_parts_bp  # noqa: E402
from app.api.attachment_sets import attachment_sets_bp  # noqa: E402
from app.api.auth import auth_bp  # noqa: E402
from app.api.boxes import boxes_bp  # noqa: E402
from app.api.dashboard import dashboard_bp  # noqa: E402
from app.api.documents import documents_bp  # noqa: E402
from app.api.inventory import inventory_bp  # noqa: E402
from app.api.kit_shopping_list_links import kit_shopping_list_links_bp  # noqa: E402
from app.api.kits import kits_bp  # noqa: E402
from app.api.locations import locations_bp  # noqa: E402
from app.api.parts import parts_bp  # noqa: E402
from app.api.pick_lists import pick_lists_bp  # noqa: E402
from app.api.sellers import sellers_bp  # noqa: E402
from app.api.shopping_list_lines import shopping_list_lines_bp  # noqa: E402
from app.api.shopping_lists import shopping_lists_bp  # noqa: E402
from app.api.tasks import tasks_bp  # noqa: E402
from app.api.types import types_bp  # noqa: E402
from app.api.utils import utils_bp  # noqa: E402

api_bp.register_blueprint(ai_parts_bp)  # type: ignore[attr-defined]
api_bp.register_blueprint(attachment_sets_bp)  # type: ignore[attr-defined]
api_bp.register_blueprint(auth_bp)  # type: ignore[attr-defined]
api_bp.register_blueprint(boxes_bp)  # type: ignore[attr-defined]
api_bp.register_blueprint(dashboard_bp)  # type: ignore[attr-defined]
api_bp.register_blueprint(documents_bp)  # type: ignore[attr-defined]
api_bp.register_blueprint(inventory_bp)  # type: ignore[attr-defined]
api_bp.register_blueprint(kits_bp)  # type: ignore[attr-defined]
api_bp.register_blueprint(kit_shopping_list_links_bp)  # type: ignore[attr-defined]
api_bp.register_blueprint(locations_bp)  # type: ignore[attr-defined]
api_bp.register_blueprint(pick_lists_bp)  # type: ignore[attr-defined]
api_bp.register_blueprint(parts_bp)  # type: ignore[attr-defined]
api_bp.register_blueprint(sellers_bp)  # type: ignore[attr-defined]
api_bp.register_blueprint(shopping_lists_bp)  # type: ignore[attr-defined]
api_bp.register_blueprint(shopping_list_lines_bp)  # type: ignore[attr-defined]
api_bp.register_blueprint(tasks_bp)  # type: ignore[attr-defined]
api_bp.register_blueprint(types_bp)  # type: ignore[attr-defined]
api_bp.register_blueprint(utils_bp)  # type: ignore[attr-defined]
