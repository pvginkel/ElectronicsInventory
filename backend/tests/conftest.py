"""Pytest configuration and fixtures.

Infrastructure fixtures (app, client, session, OIDC) are defined in
conftest_infrastructure.py. This file re-exports them and adds app-specific
domain fixtures plus SSE integration fixtures.
"""

import socket
import threading
import time
from collections.abc import Callable, Generator
from typing import Any
from unittest.mock import patch

import pytest

from app import create_app
from app.app_config import AppSettings
from app.config import Settings

# Import all infrastructure fixtures
from tests.conftest_infrastructure import *  # noqa: F403
from tests.conftest_infrastructure import (
    RunDatabases,
    _clear_prometheus_registry,
    _dispose_app,
)

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


# ---------------------------------------------------------------------------
# SSE Integration Test Fixtures
# ---------------------------------------------------------------------------


def _find_free_port() -> int:
    """Find a free port on localhost."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("", 0))
        s.listen(1)
        port = s.getsockname()[1]
    return port


@pytest.fixture(scope="session")
def sse_server(
    run_databases: RunDatabases, test_settings: Settings, test_app_settings: AppSettings
) -> Generator[tuple[str, Any]]:
    """Start a real Flask development server for SSE integration tests.

    It serves from its own threads and commits for real, so it runs on a
    database of its own, cloned from the run's template. Tests that use it
    point the API's wiring at its app (see the template's mother suite,
    ``tests/integration/conftest.py``): wiring is per module, and the session
    app takes it back at the start of every test.

    Returns tuple of (base_url, app) where base_url is like http://localhost:5001.
    """
    import requests

    port = _find_free_port()
    database_url = run_databases.clone("sse")

    settings = test_settings.model_copy(
        update={"database_url": database_url, "flask_env": "testing"}
    )

    # A full app, background services included: clear the registry first so
    # its metrics don't collide with the session app's.
    _clear_prometheus_registry()
    app = create_app(settings, app_settings=test_app_settings)

    # Mock frontend version service to avoid external frontend dependency
    version_data = {"version": "test-1.0.0", "environment": "test", "git_commit": "abc123"}
    version_mock = patch.object(
        app.container.frontend_version_service(),
        "_fetch_frontend_version",
        return_value=version_data,
    )
    version_mock.start()

    # Start Flask development server in background thread
    def run_server() -> None:
        """Run Flask development server."""
        try:
            app.run(host="127.0.0.1", port=port, threaded=True, use_reloader=False)
        except Exception as e:
            import logging
            logging.getLogger(__name__).debug(f"Server thread stopped: {e}")

    server_thread = threading.Thread(target=run_server, daemon=True)
    server_thread.start()

    # Give server time to start and bind to the port
    time.sleep(1.5)

    base_url = f"http://127.0.0.1:{port}"

    # Wait for server to be ready (poll health endpoint)
    max_attempts = 20
    for _ in range(max_attempts):
        try:
            resp = requests.get(f"{base_url}/health/healthz", timeout=1.0)
            if resp.status_code == 200:
                break
        except requests.RequestException:
            pass
        time.sleep(0.5)
    else:
        pytest.fail(f"SSE test server did not become ready after {max_attempts} attempts")

    try:
        yield (base_url, app)
    finally:
        version_mock.stop()
        _dispose_app(app)
        run_databases.drop(database_url)


@pytest.fixture
def background_task_runner() -> Generator[Callable[[Callable[[], Any]], Any]]:
    """Provide a helper to run background tasks concurrently with SSE tests.

    Returns a function that takes a callable and runs it in a background thread.
    The thread is joined automatically during teardown.
    """
    threads: list[threading.Thread] = []

    def run_in_background(func: Callable[[], Any]) -> threading.Thread:
        """Run function in background thread."""
        thread = threading.Thread(target=func, daemon=False)
        threads.append(thread)
        thread.start()
        return thread

    yield run_in_background

    # Cleanup: join all background threads
    for thread in threads:
        thread.join(timeout=5.0)


@pytest.fixture
def sse_client_factory(sse_server: tuple[str, Any]):
    """Factory for creating SSE client instances for testing."""
    from tests.integration.sse_client_helper import SSEClient

    server_url, _ = sse_server

    def create_client(endpoint: str, strict: bool = True) -> SSEClient:
        url = f"{server_url}{endpoint}"
        return SSEClient(url, strict=strict)

    return create_client


@pytest.fixture(scope="session")
def sse_gateway_server(sse_server: tuple[str, Any]) -> Generator[str]:
    """Start SSE Gateway subprocess for integration tests.

    Returns the base URL for the gateway (e.g., http://localhost:3001).
    """
    from tests.integration.sse_gateway_helper import SSEGatewayProcess

    server_url, app = sse_server

    gateway_port = _find_free_port()
    callback_url = f"{server_url}/api/sse/callback?secret=test-secret"

    gateway = SSEGatewayProcess(
        callback_url=callback_url,
        port=gateway_port,
        startup_timeout=10.0,
        health_check_interval=0.5,
        shutdown_timeout=5.0,
    )

    try:
        gateway.start()
        gateway_url = gateway.get_base_url()

        # Update Flask app's SSEConnectionManager with gateway URL
        sse_connection_manager = app.container.sse_connection_manager()
        sse_connection_manager.gateway_url = gateway_url

        yield gateway_url
    finally:
        gateway.print_logs()
        gateway.stop()
