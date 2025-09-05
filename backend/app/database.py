"""Database connection and session management."""

import re
from pathlib import Path

from sqlalchemy import MetaData, inspect, text
from sqlalchemy.engine import Engine

from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from app.config import get_settings
from app.extensions import db
from app.services.setup_service import SetupService


def get_engine() -> Engine:
    """Get SQLAlchemy engine from current Flask app."""
    return db.engine


def init_db() -> None:
    """Initialize database tables.

    Only creates tables if they don't exist. Safe to call multiple times.
    """
    # Import all models to ensure they're registered with SQLAlchemy
    import app.models  # noqa: F401

    # Create all tables (only if they don't exist)
    db.create_all()


def check_db_connection() -> bool:
    """Check if database connection is working."""
    try:
        # Use Flask-SQLAlchemy's session for the health check
        result = db.session.execute(text("SELECT 1"))
        return result.scalar() == 1
    except Exception:
        return False


def _get_alembic_config() -> Config:
    """Get Alembic configuration with database URL from Flask settings."""
    # Assume alembic.ini is in the project root (parent of app/)
    alembic_cfg_path = Path(__file__).parent.parent / "alembic.ini"

    config = Config(str(alembic_cfg_path))

    # Override database URL with current Flask configuration
    settings = get_settings()
    # Convert Flask-SQLAlchemy URL to raw SQLAlchemy URL (remove +psycopg suffix)
    db_url = settings.DATABASE_URL.replace("+psycopg", "")
    config.set_main_option("sqlalchemy.url", db_url)

    return config


def get_current_revision() -> str | None:
    """Get current database revision from Alembic version table."""
    try:
        config = _get_alembic_config()

        # Use Alembic's command to get current revision
        with db.engine.connect() as connection:
            config.attributes["connection"] = connection

            # Check if alembic_version table exists
            inspector = inspect(db.engine)
            if "alembic_version" not in inspector.get_table_names():
                return None

            # Get current revision from version table
            result = connection.execute(text("SELECT version_num FROM alembic_version"))
            row = result.fetchone()
            return row[0] if row else None

    except Exception:
        return None


def get_pending_migrations() -> list[str]:
    """Get list of pending migration revisions."""
    try:
        config = _get_alembic_config()

        with db.engine.connect() as connection:
            config.attributes["connection"] = connection
            script = ScriptDirectory.from_config(config)

            current_rev = get_current_revision()
            head_rev = script.get_current_head()

            if not head_rev:
                return []

            if not current_rev:
                # No migrations applied yet, return all from base to head
                revisions = []
                for rev in script.walk_revisions(base="base", head=head_rev):
                    if rev.revision != head_rev:  # Don't include head twice
                        revisions.append(rev.revision)
                revisions.reverse()  # Want chronological order
                revisions.append(head_rev)
                return revisions

            if current_rev == head_rev:
                return []  # Up to date

            # Get pending revisions between current and head
            revisions = []
            for rev in script.walk_revisions(base=current_rev, head=head_rev):
                if rev.revision != current_rev:  # Don't include current
                    revisions.append(rev.revision)

            revisions.reverse()  # Want chronological order
            return revisions

    except Exception:
        return []


def drop_all_tables() -> None:
    """Drop all tables including Alembic version table."""
    # Use reflection to get all table names
    metadata = MetaData()
    metadata.reflect(bind=db.engine)

    # Drop all tables
    metadata.drop_all(bind=db.engine)

    # Clear SQLAlchemy metadata cache
    db.metadata.clear()


def _get_migration_info(script_dir: ScriptDirectory, revision: str) -> tuple[str, str]:
    """Extract migration info from revision file."""
    try:
        rev_obj = script_dir.get_revision(revision)
        if not rev_obj or not rev_obj.path:
            return revision, "Unknown migration"

        # Read the migration file to get description from docstring
        migration_file = Path(rev_obj.path)
        if not migration_file.exists():
            return revision, "Migration file not found"

        content = migration_file.read_text()

        # Extract description from docstring (first line after triple quotes)
        docstring_match = re.search(r'"""([^"]+)"""', content)
        if docstring_match:
            description = docstring_match.group(1).strip()
            return revision[:7], description  # Short revision + description

        # Fallback: extract from filename slug
        filename = migration_file.name
        slug_match = re.search(r"_([^.]+)\.py$", filename)
        if slug_match:
            slug = slug_match.group(1).replace("_", " ").title()
            return revision[:7], slug

        return revision[:7], "Migration"

    except Exception:
        return revision[:7], "Migration"


def sync_master_data_from_setup() -> None:
    """Sync master data (types) from setup file to database."""
    try:
        # Use Flask-SQLAlchemy's session for consistency
        with db.session() as session:
            setup_service = SetupService(session)
            added_count = setup_service.sync_types_from_setup()

            if added_count > 0:
                print(f"📦 Added {added_count} new types from setup file")
                session.commit()
            else:
                print("📦 Types already up to date")

    except Exception as e:
        print(f"⚠️  Failed to sync types from setup file: {e}")
        # Don't raise - types sync failure shouldn't block migrations


def upgrade_database(recreate: bool = False) -> list[tuple[str, str]]:
    """Upgrade database with progress reporting.

    Args:
        recreate: If True, drop all tables first

    Returns:
        List of (revision, description) tuples for applied migrations
    """
    config = _get_alembic_config()
    applied_migrations: list[tuple[str, str]] = []

    with db.engine.connect() as connection:
        config.attributes["connection"] = connection
        script = ScriptDirectory.from_config(config)

        if recreate:
            print("🗑️  Dropping all tables...")
            drop_all_tables()
            print("✅ All tables dropped")

        # Get list of migrations to apply
        pending = get_pending_migrations()

        if not pending:
            return applied_migrations

        # Apply migrations one by one with progress reporting
        for revision in pending:
            rev_short, description = _get_migration_info(script, revision)
            print(f"⚡ Applying schema {rev_short} - {description}")

            try:
                # Apply single migration
                command.upgrade(config, revision)
                applied_migrations.append((rev_short, description))

            except Exception as e:
                print(f"❌ Failed to apply migration {rev_short}: {e}")
                raise

        return applied_migrations
