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
@click.option(
    "--yes-i-am-sure",
    is_flag=True,
    help="Confirm that you want to initialize/recreate the database (THIS WILL DELETE ALL DATA)"
)
@with_appcontext
def init_database(yes_i_am_sure: bool) -> None:
    """Initialize database tables from scratch.

    ⚠️  WARNING: This command will DROP and recreate all tables, deleting all data!
    
    For upgrading an existing database, use 'upgrade-database' instead.
    Only use this command for:
    - Setting up a fresh database for the first time
    - Completely resetting a development database
    
    Requires --yes-i-am-sure flag to prevent accidental data loss.
    """
    if not yes_i_am_sure:
        click.echo("⚠️  ERROR: This command will DELETE ALL DATA in your database!", err=True)
        click.echo("")
        click.echo("To initialize a fresh database (destroying all existing data):")
        click.echo("  flask init-database --yes-i-am-sure")
        click.echo("")
        click.echo("To upgrade an existing database with new schema changes:")
        click.echo("  flask upgrade-database")
        click.echo("")
        sys.exit(1)
    
    try:
        click.echo("⚠️  Initializing database (this will delete all existing data)...")
        
        # Drop all tables first to ensure clean slate
        from app.extensions import db
        db.drop_all()
        click.echo("✓ Dropped all existing tables")
        
        # Use Alembic to create tables (not SQLAlchemy create_all)
        from alembic import command
        from alembic.config import Config
        import os
        
        alembic_cfg = Config(os.path.join(os.path.dirname(os.path.dirname(__file__)), "alembic.ini"))
        command.upgrade(alembic_cfg, "head")
        click.echo("✓ Database tables created via migrations")

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
def upgrade_database() -> None:
    """Upgrade database schema using Alembic migrations.
    
    This is the safe way to update your database schema without losing data.
    Use this command when:
    - You want to apply new schema changes/migrations
    - You're upgrading to a new version of the application
    - You need to update an existing database
    """
    try:
        click.echo("Upgrading database schema...")
        
        # Import alembic and run upgrade
        from alembic import command
        from alembic.config import Config
        import os
        
        # Get alembic config
        alembic_cfg = Config(os.path.join(os.path.dirname(os.path.dirname(__file__)), "alembic.ini"))
        
        # Run upgrade to head
        command.upgrade(alembic_cfg, "head")
        click.echo("✓ Database schema upgraded successfully")
        
        # Verify the database is working
        if check_db_connection():
            click.echo("✓ Database connection verified")
        else:
            click.echo("⚠ Warning: Database connection check failed", err=True)
            
    except Exception as e:
        click.echo(f"✗ Database upgrade failed: {e}", err=True)
        click.echo("💡 If this is a fresh database, use 'flask init-database --yes-i-am-sure' instead")
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
