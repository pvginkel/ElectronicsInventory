"""App-specific startup hooks for Electronics Inventory.

These functions are called by the template-owned create_app() factory at
well-defined hook points. They contain all application-specific initialization
that would differ between projects sharing the same template.
"""

from flask import Blueprint, Flask

from app.services.container import ServiceContainer


def create_container() -> ServiceContainer:
    """Create and configure the application's service container.

    Returns a fully constructed ServiceContainer with app-specific providers.
    URL interceptors and other app-specific wiring happen here.
    """
    container = ServiceContainer()

    # Register URL interceptors (app-specific link rewriting)
    registry = container.url_interceptor_registry()
    lcsc_interceptor = container.lcsc_interceptor()
    registry.register(lcsc_interceptor)

    return container


def register_blueprints(api_bp: Blueprint, app: Flask) -> None:
    """Register all app-specific blueprints.

    Domain resource blueprints are registered on api_bp (under /api prefix).
    Blueprints that need direct app registration (e.g., icons) are registered
    on the Flask app itself.

    Template blueprints (health, metrics, testing, SSE, CAS) are registered
    by create_app() directly and are NOT included here.

    Flask does not allow modifying a blueprint after its first registration,
    so child blueprints on api_bp are only registered once. App-level
    blueprints (icons) are registered on each new app instance.

    Args:
        api_bp: The main API blueprint (url_prefix="/api")
        app: The Flask application instance
    """
    # Child blueprints on api_bp can only be registered before api_bp's
    # first registration on an app. Guard against repeated create_app() calls
    # in test suites where api_bp is a module-level singleton.
    if not api_bp._got_registered_once:  # type: ignore[attr-defined]
        from app.api.ai_parts import ai_parts_bp
        from app.api.attachment_sets import attachment_sets_bp
        from app.api.boxes import boxes_bp
        from app.api.dashboard import dashboard_bp
        from app.api.documents import documents_bp
        from app.api.inventory import inventory_bp
        from app.api.kit_shopping_list_links import kit_shopping_list_links_bp
        from app.api.kits import kits_bp
        from app.api.locations import locations_bp
        from app.api.parts import parts_bp
        from app.api.pick_lists import pick_lists_bp
        from app.api.sellers import sellers_bp
        from app.api.shopping_list_lines import shopping_list_lines_bp
        from app.api.shopping_lists import shopping_lists_bp
        from app.api.tasks import tasks_bp
        from app.api.types import types_bp
        from app.api.utils import utils_bp

        # Domain resource blueprints on api_bp
        api_bp.register_blueprint(ai_parts_bp)  # type: ignore[attr-defined]
        api_bp.register_blueprint(attachment_sets_bp)  # type: ignore[attr-defined]
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

    # Icons blueprint registered directly on app (not on api_bp) to preserve
    # existing /api/icons route prefix set in the blueprint itself
    from app.api.icons import icons_bp

    app.register_blueprint(icons_bp)


def register_error_handlers(app: Flask) -> None:
    """Register app-specific error handlers.

    Currently no app-specific error handlers exist beyond those in
    flask_error_handlers.py (core + business). This hook exists as a
    stable extension point for future app-specific error handling.

    Args:
        app: The Flask application instance
    """
    pass
