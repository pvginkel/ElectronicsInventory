"""CLI commands for database operations."""

import argparse
import sys
from typing import NoReturn

import sqlalchemy as sa
from flask import Flask

from app import create_app
from app.database import (
    check_db_connection,
    get_current_revision,
    get_pending_migrations,
    sync_master_data_from_setup,
    upgrade_database,
)
from app.extensions import db
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
from app.services.test_data_service import TestDataService


def create_parser() -> argparse.ArgumentParser:
    """Create command line argument parser."""
    parser = argparse.ArgumentParser(
        description="Electronics Inventory CLI",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )

    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # upgrade-db command
    upgrade_parser = subparsers.add_parser(
        "upgrade-db",
        help="Apply database migrations",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        description="""
Apply pending database migrations using Alembic.

Examples:
  inventory-cli upgrade-db                    Apply pending migrations
  inventory-cli upgrade-db --recreate --yes-i-am-sure  Drop all tables and recreate from migrations
        """,
    )
    upgrade_parser.add_argument(
        "--recreate",
        action="store_true",
        help="Drop all tables first, then run all migrations from scratch",
    )
    upgrade_parser.add_argument(
        "--yes-i-am-sure",
        action="store_true",
        help="Required safety flag when using --recreate",
    )

    # load-test-data command
    load_test_data_parser = subparsers.add_parser(
        "load-test-data",
        help="Recreate database and load fixed test data",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        description="""
Recreate database from scratch and load fixed test dataset.

This command:
1. Drops all tables and recreates the database schema (like upgrade-db --recreate)
2. Loads fixed test data from JSON files in app/data/test_data/
3. Creates 10 boxes with realistic electronics organization
4. Loads ~50 realistic electronics parts with proper relationships

Examples:
  inventory-cli load-test-data --yes-i-am-sure    Load complete test dataset
        """,
    )
    load_test_data_parser.add_argument(
        "--yes-i-am-sure",
        action="store_true",
        help="Required safety flag to confirm database recreation",
    )

    return parser


def handle_upgrade_db(
    app: Flask, recreate: bool = False, confirmed: bool = False
) -> None:
    """Handle upgrade-db command."""
    with app.app_context():
        # Check database connectivity
        if not check_db_connection():
            print(
                "❌ Cannot connect to database. Check your DATABASE_URL configuration.",
                file=sys.stderr,
            )
            sys.exit(1)

        # Let operator know which database is targeted
        print(f"🗄  Using database: {app.config['SQLALCHEMY_DATABASE_URI']}")

        # Safety check for recreate
        if recreate and not confirmed:
            print(
                "❌ --recreate requires --yes-i-am-sure flag for safety",
                file=sys.stderr,
            )
            print(
                "   This will DROP ALL TABLES and recreate from migrations!",
                file=sys.stderr,
            )
            sys.exit(1)

        if recreate:
            print("⚠️  WARNING: About to drop all tables and recreate from migrations!")
            print("   This will permanently delete all data in the database.")

        # Show current state
        current_rev = get_current_revision()
        pending = get_pending_migrations()

        if current_rev:
            print(f"📍 Current database revision: {current_rev}")
        else:
            print("📍 Database has no migration version (empty or new database)")

        # Phase 1: Apply schema migrations (if needed)
        if recreate or pending:
            if recreate:
                print("🔄 Recreating database from scratch...")
            elif pending:
                print(f"📦 Found {len(pending)} pending migration(s)")

            # Apply migrations
            try:
                applied = upgrade_database(recreate=recreate)
                if applied:
                    print(f"✅ Successfully applied {len(applied)} migration(s)")
                    for revision, description in applied:
                        print(f"   • {revision}: {description}")
                else:
                    print("✅ Database migration completed")
            except Exception as e:
                print(f"❌ Migration failed: {e}", file=sys.stderr)
                sys.exit(1)
        else:
            print("✅ Database is up to date. No migrations to apply.")

        # Phase 2: Sync master data unconditionally
        try:
            sync_master_data_from_setup()
        except Exception as e:
            print(f"⚠️  Warning: Failed to sync master data: {e}")
            # Continue - master data sync failure shouldn't block the command


def handle_load_test_data(app: Flask, confirmed: bool = False) -> None:
    """Handle load-test-data command."""
    with app.app_context():
        # Check database connectivity
        if not check_db_connection():
            print(
                "❌ Cannot connect to database. Check your DATABASE_URL configuration.",
                file=sys.stderr,
            )
            sys.exit(1)

        # Let operator know which database is targeted
        print(f"🗄  Using database: {app.config['SQLALCHEMY_DATABASE_URI']}")

        # Safety check for confirmation
        if not confirmed:
            print(
                "❌ --yes-i-am-sure flag is required for safety",
                file=sys.stderr,
            )
            print(
                "   This will DROP ALL TABLES and recreate with test data!",
                file=sys.stderr,
            )
            sys.exit(1)

        print("⚠️  WARNING: About to drop all tables and load test data!")
        print("   This will permanently delete all existing data in the database.")

        try:
            # First recreate the database using existing logic
            print("🔄 Recreating database from scratch...")
            applied = upgrade_database(recreate=True)
            if applied:
                print(f"✅ Database recreated with {len(applied)} migration(s)")
            else:
                print("✅ Database recreated successfully")

            # Sync master data after database recreation
            try:
                sync_master_data_from_setup()
            except Exception as e:
                print(f"❌ Failed to sync master data: {e}", file=sys.stderr)
                sys.exit(1)

            # Load test data
            print("📦 Loading fixed test dataset...")
            with db.session() as session:
                test_data_service = TestDataService(session)
                test_data_service.load_full_dataset()

                # Keep the box number sequence aligned with loaded fixtures when supported
                bind = session.get_bind() if hasattr(session, "get_bind") else None
                if bind is None:
                    bind = getattr(session, "bind", None)

                if bind is not None and bind.dialect.name.startswith("postgres"):
                    session.execute(
                        sa.text(
                            "SELECT setval('boxes_box_no_seq', COALESCE(MAX(box_no), 1), CASE WHEN MAX(box_no) IS NULL THEN false ELSE true END) FROM boxes"
                        )
                    )
                print("✅ Test data loaded successfully")

                # Show summary of loaded data
                type_count = session.query(Type).count()
                part_count = session.query(Part).count()
                seller_count = session.query(Seller).count()
                box_count = session.query(Box).count()
                location_slot_count = session.query(Location).count()
                part_location_count = session.query(PartLocation).count()
                quantity_history_count = session.query(QuantityHistory).count()
                shopping_list_count = session.query(ShoppingList).count()
                shopping_list_line_count = session.query(ShoppingListLine).count()
                shopping_list_note_count = session.query(
                    ShoppingListSellerNote
                ).count()
                kit_count = session.query(Kit).count()
                kit_content_count = session.query(KitContent).count()
                kit_link_count = session.query(KitShoppingListLink).count()
                kit_pick_list_count = session.query(KitPickList).count()
                kit_pick_list_line_count = session.query(
                    KitPickListLine
                ).count()

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

        except Exception as e:
            print(f"❌ Failed to load test data: {e}", file=sys.stderr)
            sys.exit(1)


def main() -> NoReturn:
    """Main CLI entry point."""
    parser = create_parser()
    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    # Create Flask app for database operations
    app = create_app()

    if args.command == "upgrade-db":
        handle_upgrade_db(
            app=app,
            recreate=args.recreate,
            confirmed=args.yes_i_am_sure,
        )
    elif args.command == "load-test-data":
        handle_load_test_data(
            app=app,
            confirmed=args.yes_i_am_sure,
        )
    else:
        print(f"❌ Unknown command: {args.command}", file=sys.stderr)
        sys.exit(1)

    sys.exit(0)


if __name__ == "__main__":
    main()
