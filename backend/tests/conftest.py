"""Pytest configuration and fixtures.

Infrastructure fixtures (app, client, session, OIDC) are defined in
conftest_infrastructure.py. This file re-exports them and adds app-specific
domain fixtures.
"""

import pytest
from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.app_config import AppSettings
from app.models.type import Type

# Import all infrastructure fixtures
from tests.conftest_infrastructure import *  # noqa: F403

# Import domain fixtures to make them available to all tests
from tests.domain_fixtures import (  # noqa: F401
    large_image_file,
    make_attachment_set,
    mock_html_content,
    mock_url_metadata,
    sample_image_file,
    sample_part,
    sample_pdf_bytes,
    sample_pdf_file,
    sample_png_bytes,
    temp_thumbnail_dir,
)


def _ei_build_test_app_settings() -> AppSettings:
    """EI-specific test app settings."""
    return AppSettings(ai_testing_mode=True)


# ---------------------------------------------------------------------------
# Override template's test_app_settings fixture for EI-specific defaults.
# Session-scoped, as the template's: the session app and the run's template
# database are built from it.
# ---------------------------------------------------------------------------


@pytest.fixture(scope="session")
def test_app_settings() -> AppSettings:
    """Override infrastructure fixture to include EI-specific settings."""
    return _ei_build_test_app_settings()


@pytest.fixture
def without_seeded_types(session: Session) -> None:
    """Start the test with no types.

    The run's template database is built as ``cli upgrade-db`` builds
    production's, so ``post_migration_hook`` has seeded the types in
    ``app/data/setup/types.txt``. A test that creates types of those names,
    or counts the catalogue, requests this: it deletes them in the test's
    transaction, which the teardown rolls back.
    """
    session.execute(delete(Type))
