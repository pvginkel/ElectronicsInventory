"""CLI commands for database operations."""

import argparse
import sys
from typing import NoReturn

from flask import Flask

from app import create_app
from app.database import (
    check_db_connection,
    get_current_revision,
    get_pending_migrations,
    upgrade_database,
)


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

        if not recreate and not pending:
            print("✅ Database is up to date. No migrations to apply.")
            return

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
    else:
        print(f"❌ Unknown command: {args.command}", file=sys.stderr)
        sys.exit(1)

    sys.exit(0)


if __name__ == "__main__":
    main()
