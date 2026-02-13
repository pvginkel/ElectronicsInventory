"""Pytest configuration and fixtures.

Infrastructure fixtures (app, client, session, OIDC, SSE) are defined in
conftest_infrastructure.py. This file re-exports them and adds app-specific
domain fixtures.
"""

# Import all infrastructure fixtures
from tests.conftest_infrastructure import *  # noqa: F401, F403

# Import domain fixtures to make them available to all tests
from tests.domain_fixtures import (  # noqa: F401
    large_image_file,
    make_attachment_set,
    make_attachment_set_flask,
    mock_html_content,
    mock_url_metadata,
    sample_image_file,
    sample_part,
    sample_pdf_bytes,
    sample_pdf_file,
    temp_thumbnail_dir,
)
