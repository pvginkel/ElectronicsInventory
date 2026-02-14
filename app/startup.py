"""App-specific startup hooks for Electronics Inventory.

These functions are called by the template-owned create_app() factory and by
CLI command handlers at well-defined hook points. They contain all
application-specific initialization that would differ between projects sharing
the same template.

Hook points called by create_app():
  - create_container()
  - register_blueprints()
  - register_error_handlers()

Hook points called by CLI command handlers:
  - register_cli_commands()  -- register app-specific CLI commands
  - post_migration_hook()  -- after upgrade-db migrations
  - load_test_data_hook()  -- after load-test-data database recreation
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import sqlalchemy as sa
from flask import Blueprint, Flask

if TYPE_CHECKING:
    import click

from app.database import sync_master_data_from_setup
from app.models.box import Box
from app.models.kit import Kit
from app.models.kit_content import KitContent
from app.models.kit_pick_list import KitPickList
from app.models.kit_pick_list_line import KitPickListLine
from app.models.kit_shopping_list_link import KitShoppingListLink
from app.models.location import Location
from app.models.part import Part
from app.models.part_location import PartLocation
from app.models.quantity_history import QuantityHistory
from app.models.seller import Seller
from app.models.shopping_list import ShoppingList
from app.models.shopping_list_line import ShoppingListLine
from app.models.shopping_list_seller_note import ShoppingListSellerNote
from app.models.type import Type
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
        api_bp.register_blueprint(types_bp)  # type: ignore[attr-defined]
        api_bp.register_blueprint(utils_bp)  # type: ignore[attr-defined]

    # Icons blueprint registered directly on app (not on api_bp) to preserve
    # existing /api/icons route prefix set in the blueprint itself
    from app.api.icons import icons_bp

    app.register_blueprint(icons_bp)



def register_error_handlers(app: Flask) -> None:
    """Register app-specific error handlers.

    EI has additional BusinessLogicException subclasses that need specific
    HTTP status codes beyond what the template's base handlers provide.

    Args:
        app: The Flask application instance
    """
    from app.exceptions import (
        CapacityExceededException,
        DependencyException,
        InsufficientQuantityException,
    )
    from app.utils.flask_error_handlers import (
        _mark_request_failed,
        build_error_response,
    )

    @app.errorhandler(DependencyException)
    def handle_dependency_exception(error: DependencyException):
        _mark_request_failed()
        return build_error_response(
            error.message,
            {"message": "Cannot delete resource due to dependencies"},
            code=error.error_code,
            status_code=409,
        )

    @app.errorhandler(InsufficientQuantityException)
    def handle_insufficient_quantity(error: InsufficientQuantityException):
        _mark_request_failed()
        return build_error_response(
            error.message,
            {"message": "Insufficient quantity available"},
            code=error.error_code,
            status_code=409,
        )

    @app.errorhandler(CapacityExceededException)
    def handle_capacity_exceeded(error: CapacityExceededException):
        _mark_request_failed()
        return build_error_response(
            error.message,
            {"message": "Capacity would be exceeded"},
            code=error.error_code,
            status_code=409,
        )


def register_cli_commands(cli: click.Group) -> None:
    """Register app-specific CLI commands.

    Called by main() in cli.py before invoking the CLI group.
    Currently no app-specific CLI commands exist. This hook is a
    stable extension point for future app-specific commands.

    Args:
        cli: The Click CLI group to add commands to
    """
    pass


def post_migration_hook(app: Flask) -> None:
    """Sync master data after database migrations.

    Called unconditionally by the upgrade-db CLI handler after migrations
    complete (or are skipped if already up to date). Failures are non-fatal:
    the hook catches exceptions and prints a warning so the migration itself
    is not rolled back.

    Args:
        app: The Flask application instance (with container attached)
    """
    session = app.container.session_maker()()
    try:
        sync_master_data_from_setup(session)
        session.commit()
    except Exception as e:
        print(f"⚠️  Warning: Failed to sync master data: {e}")
    finally:
        session.close()


def load_test_data_hook(app: Flask) -> None:
    """Load master data, test fixtures, and print a dataset summary.

    Called by the load-test-data CLI handler after the database has been
    recreated from scratch. Failures are fatal: exceptions propagate to the
    CLI handler which exits with code 1.

    Uses two sessions intentionally:
      - A manual session via session_maker()() for sync_master_data_from_setup
        and the summary queries.
      - An implicit session via the container's db_session ContextLocalSingleton
        for test_data_service, which needs its full DI-wired dependency chain.

    Args:
        app: The Flask application instance (with container attached)
    """
    session = app.container.session_maker()()
    try:
        # Sync master data (types) -- fatal on failure since test data depends on types
        sync_master_data_from_setup(session)
        session.commit()

        # Load test data using the container (provides S3 service for images)
        print("📦 Loading fixed test dataset...")
        test_data_service = app.container.test_data_service()
        test_data_service.load_full_dataset()

        # Keep the box number sequence aligned with loaded fixtures when supported
        bind = session.get_bind() if hasattr(session, "get_bind") else None
        if bind is None:
            bind = getattr(session, "bind", None)

        if bind is not None and bind.dialect.name.startswith("postgres"):
            session.execute(
                sa.text(
                    "SELECT setval('boxes_box_no_seq', "
                    "COALESCE(MAX(box_no), 1), "
                    "CASE WHEN MAX(box_no) IS NULL THEN false ELSE true END) "
                    "FROM boxes"
                )
            )
        print("✅ Test data loaded successfully")

        # Print dataset summary
        type_count = session.query(Type).count()
        part_count = session.query(Part).count()
        seller_count = session.query(Seller).count()
        box_count = session.query(Box).count()
        location_slot_count = session.query(Location).count()
        part_location_count = session.query(PartLocation).count()
        quantity_history_count = session.query(QuantityHistory).count()
        shopping_list_count = session.query(ShoppingList).count()
        shopping_list_line_count = session.query(ShoppingListLine).count()
        shopping_list_note_count = session.query(ShoppingListSellerNote).count()
        kit_count = session.query(Kit).count()
        kit_content_count = session.query(KitContent).count()
        kit_link_count = session.query(KitShoppingListLink).count()
        kit_pick_list_count = session.query(KitPickList).count()
        kit_pick_list_line_count = session.query(KitPickListLine).count()

        summary_sections = [
            (
                "🏷️  Catalog",
                [
                    f"{type_count} part types",
                    f"{part_count} parts",
                    f"{seller_count} sellers",
                ],
            ),
            (
                "📦 Storage",
                [
                    f"{box_count} storage boxes",
                    f"{location_slot_count} location slots",
                    f"{part_location_count} inventory placements",
                    f"{quantity_history_count} quantity history events",
                ],
            ),
            (
                "🛒 Shopping",
                [
                    (
                        f"{shopping_list_count} shopping lists "
                        f"with {shopping_list_line_count} lines"
                    ),
                    (
                        f"{shopping_list_note_count} shopping list "
                        "seller notes"
                    ),
                ],
            ),
            (
                "🧰 Kits",
                [
                    (
                        f"{kit_count} kits stocked with "
                        f"{kit_content_count} contents"
                    ),
                    (
                        f"{kit_pick_list_count} pick lists wrangled "
                        f"into {kit_pick_list_line_count} lines"
                    ),
                    (
                        f"{kit_link_count} kit to shopping list links "
                        "kept in sync"
                    ),
                ],
            ),
        ]

        print("📊 Dataset summary:")
        for section_title, entries in summary_sections:
            print(f"   {section_title}")
            for entry in entries:
                print(f"      • {entry}")

    finally:
        session.close()
