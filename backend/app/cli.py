"""CLI commands for database operations."""

import sys
from typing import NoReturn

import click
from flask.cli import with_appcontext

from app import create_app
from app.database import check_db_connection, init_db


@click.group()
def cli() -> None:
    """Electronics Inventory CLI commands."""
    pass


@cli.command()
@with_appcontext
def init_database() -> None:
    """Initialize database tables.

    Creates all tables defined in the models. Safe to run multiple times.
    """
    try:
        click.echo("Initializing database...")
        init_db()
        click.echo("✓ Database tables created successfully")

        # Verify the initialization worked
        if check_db_connection():
            click.echo("✓ Database connection verified")
        else:
            click.echo("⚠ Warning: Database connection check failed", err=True)

    except Exception as e:
        click.echo(f"✗ Database initialization failed: {e}", err=True)
        sys.exit(1)


@cli.command()
@with_appcontext
def check_database() -> None:
    """Check database connection and readiness."""
    try:
        if check_db_connection():
            click.echo("✓ Database is ready")
        else:
            click.echo("✗ Database connection failed", err=True)
            sys.exit(1)
    except Exception as e:
        click.echo(f"✗ Database check failed: {e}", err=True)
        sys.exit(1)


def main() -> NoReturn:
    """Main CLI entry point for standalone usage."""
    app = create_app()
    with app.app_context():
        cli()
    sys.exit(0)


if __name__ == "__main__":
    main()
