"""Pytest configuration and fixtures."""

import socket
import sqlite3
import threading
import time
from collections.abc import Callable, Generator
from typing import Any

import pytest
from flask import Flask
from prometheus_client import REGISTRY
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app import create_app
from app.config import Settings
from app.database import upgrade_database
from app.exceptions import InvalidOperationException
from app.services.container import ServiceContainer


@pytest.fixture(autouse=True)
def clear_prometheus_registry():
    """Clear Prometheus registry before and after each test to ensure isolation.

    This is necessary for tests that create multiple Flask app instances or services
    that register Prometheus metrics, as metrics cannot be registered twice in the
    same registry. Clearing before AND after each test ensures proper isolation.
    """
    # Clear collectors before test
    collectors = list(REGISTRY._collector_to_names.keys())
    for collector in collectors:
        try:
            REGISTRY.unregister(collector)
        except (KeyError, ValueError):
            # Collector may have already been unregistered or not exist
            pass
    yield
    # Clean up after test
    collectors = list(REGISTRY._collector_to_names.keys())
    for collector in collectors:
        try:
            REGISTRY.unregister(collector)
        except (KeyError, ValueError):
            pass


def _build_test_settings() -> Settings:
    """Construct base Settings object for tests."""
    return Settings(
        DATABASE_URL="sqlite:///:memory:",
        SECRET_KEY="test-secret-key",
        DEBUG=True,
        FLASK_ENV="testing",
        DISABLE_REAL_AI_ANALYSIS=True,
        OPENAI_DUMMY_RESPONSE_PATH=None,
        CORS_ORIGINS=["http://localhost:3000"],
        # Document service configuration
        ALLOWED_IMAGE_TYPES=["image/jpeg", "image/png"],
        ALLOWED_FILE_TYPES=["application/pdf"],
        MAX_IMAGE_SIZE=10 * 1024 * 1024,  # 10MB
        MAX_FILE_SIZE=100 * 1024 * 1024,  # 100MB
        SSE_HEARTBEAT_INTERVAL=1,
    )

@pytest.fixture
def test_settings() -> Settings:
    """Create test settings with in-memory database."""
    return _build_test_settings()


def _assert_s3_available(app: Flask) -> None:
    """Ensure S3 storage is reachable for tests."""
    try:
        app.container.s3_service().ensure_bucket_exists()
    except InvalidOperationException as exc:  # pragma: no cover - environment guard
        pytest.fail(
            "S3 storage is not available for tests: "
            f"{exc.message}. Ensure S3_ENDPOINT_URL, credentials, and bucket access are configured."
        )
    except Exception as exc:  # pragma: no cover - environment guard
        pytest.fail(
            "Unexpected error while verifying S3 availability for tests: "
            f"{exc}"
        )


@pytest.fixture(scope="session")
def template_connection() -> Generator[sqlite3.Connection, None, None]:
    """Create a template SQLite database once and apply migrations."""
    conn = sqlite3.connect(":memory:", check_same_thread=False)

    settings = _build_test_settings().model_copy()
    settings.DATABASE_URL = "sqlite://"
    settings.set_engine_options_override({
        "poolclass": StaticPool,
        "creator": lambda: conn,
    })

    template_app = create_app(settings)
    with template_app.app_context():
        upgrade_database(recreate=True)
        _assert_s3_available(template_app)

    # Note: Prometheus registry cleanup is handled by the autouse
    # clear_prometheus_registry fixture, no need to do it here

    yield conn

    conn.close()


@pytest.fixture
def app(test_settings: Settings, template_connection: sqlite3.Connection) -> Generator[Flask, None, None]:
    """Create Flask app for testing using a fresh copy of the template database."""
    clone_conn = sqlite3.connect(":memory:", check_same_thread=False)
    template_connection.backup(clone_conn)

    settings = test_settings.model_copy()
    settings.DATABASE_URL = "sqlite://"
    settings.set_engine_options_override({
        "poolclass": StaticPool,
        "creator": lambda: clone_conn,
    })

    app = create_app(settings)

    try:
        yield app
    finally:
        with app.app_context():
            from app.extensions import db as flask_db

            flask_db.session.remove()

        clone_conn.close()


@pytest.fixture
def session(container: ServiceContainer) -> Generator[Session, None, None]:
    """Create a new database session for a test."""

    session = container.db_session()

    exc = None
    try:
        yield session
    except Exception as e:
        exc = e

    if exc:
        session.rollback()
    else:
        session.commit()
    session.close()

    container.db_session.reset()


@pytest.fixture
def client(app: Flask):
    """Create test client."""
    return app.test_client()


@pytest.fixture
def runner(app: Flask):
    """Create test CLI runner."""
    return app.test_cli_runner()


@pytest.fixture
def container(app: Flask):
    """Access to the DI container for testing with session provided."""
    container = app.container

    with app.app_context():
        # Ensure SessionLocal is initialized for tests
        from sqlalchemy.orm import sessionmaker

        from app.extensions import db as flask_db

        SessionLocal = sessionmaker(
            bind=flask_db.engine, autoflush=True, expire_on_commit=False
        )

        # Note: Flask-SQLAlchemy doesn't easily support configuring autoflush
        # For constraint tests that use db.session directly, manual flush() is needed
        # before accessing auto-generated IDs

    container.session_maker.override(SessionLocal)

    return container


# Import document fixtures to make them available to all tests
from .test_document_fixtures import (  # noqa
    large_image_file,
    mock_html_content,
    mock_url_metadata,
    sample_image_file,
    sample_part,
    sample_pdf_bytes,
    sample_pdf_file,
    temp_thumbnail_dir,
)


# SSE Integration Test Fixtures


def _find_free_port() -> int:
    """Find a free port on localhost."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("", 0))
        s.listen(1)
        port = s.getsockname()[1]
    return port


@pytest.fixture(scope="session")
def sse_server(template_connection: sqlite3.Connection) -> Generator[tuple[str, Any], None, None]:
    """Start a real Flask development server for SSE integration tests.

    Returns tuple of (base_url, app) where base_url is like http://localhost:5001.
    The server runs in a background thread and is cleaned up after the session.
    """
    # Find a free port
    port = _find_free_port()

    # Create Flask app with template database clone for SSE tests
    clone_conn = sqlite3.connect(":memory:", check_same_thread=False)
    template_connection.backup(clone_conn)

    settings = _build_test_settings().model_copy()
    settings.DATABASE_URL = "sqlite://"
    settings.FLASK_ENV = "testing"  # Enable testing API endpoints
    settings.set_engine_options_override({
        "poolclass": StaticPool,
        "creator": lambda: clone_conn,
    })

    app = create_app(settings)

    # Mock version service to avoid external frontend dependency
    from unittest.mock import patch
    version_json = '{"version": "test-1.0.0", "environment": "test", "git_commit": "abc123"}'
    version_mock = patch.object(
        app.container.version_service(),
        'fetch_frontend_version',
        return_value=version_json
    )
    version_mock.start()

    # Start Flask development server in background thread
    # Note: Using Flask dev server instead of waitress for simplicity in tests
    def run_server() -> None:
        """Run Flask development server."""
        try:
            app.run(host="127.0.0.1", port=port, threaded=True, use_reloader=False)
        except Exception as e:
            # Server stopped (expected during cleanup)
            import logging
            logging.getLogger(__name__).debug(f"Server thread stopped: {e}")

    server_thread = threading.Thread(target=run_server, daemon=True)
    server_thread.start()

    # Give server time to start and bind to the port
    time.sleep(1.5)

    # Build base URL
    base_url = f"http://127.0.0.1:{port}"

    # Wait for server to be ready (poll health endpoint)
    import requests

    max_attempts = 20
    for _ in range(max_attempts):
        try:
            resp = requests.get(f"{base_url}/api/health/healthz", timeout=1.0)
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
        # Stop version service mock
        version_mock.stop()

        # Server cleanup: waitress doesn't have a graceful shutdown API when run in thread
        # The daemon thread will be terminated when the process exits
        # Clean up database connection
        with app.app_context():
            from app.extensions import db as flask_db

            flask_db.session.remove()

        clone_conn.close()


@pytest.fixture
def background_task_runner() -> Generator[Callable[[Callable[[], Any]], Any], None, None]:
    """Provide a helper to run background tasks concurrently with SSE tests.

    Returns a function that takes a callable and runs it in a background thread.
    The thread is joined automatically during teardown.

    Example:
        def test_sse_with_background_task(background_task_runner):
            def my_task():
                # Do work that generates SSE events
                pass

            background_task_runner(my_task)
            # Now connect to SSE stream and receive events
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
    """Factory for creating SSE client instances for testing.

    Returns a function that creates configured SSEClient instances with the
    SSE server base URL and strict mode enabled by default.

    Example:
        def test_sse_stream(sse_client_factory):
            client = sse_client_factory("/api/tasks/123/stream")
            for event in client.connect():
                print(event)
    """
    from tests.integration.sse_client_helper import SSEClient

    # Unpack sse_server tuple
    server_url, _ = sse_server

    def create_client(endpoint: str, strict: bool = True) -> SSEClient:
        """Create SSE client for given endpoint.

        Args:
            endpoint: API endpoint path (e.g., "/api/tasks/123/stream")
            strict: Enable strict parsing mode (default True for baseline tests)

        Returns:
            Configured SSEClient instance
        """
        url = f"{server_url}{endpoint}"
        return SSEClient(url, strict=strict)

    return create_client


@pytest.fixture(scope="session")
def sse_gateway_server(sse_server: tuple[str, Any]) -> Generator[str, None, None]:
    """Start SSE Gateway subprocess for integration tests.

    Returns the base URL for the gateway (e.g., http://localhost:3001).
    The gateway routes SSE connections and makes callbacks to the Python backend
    (sse_server) for connection lifecycle events.

    The gateway runs in a subprocess and is cleaned up after the session.
    """
    from tests.integration.sse_gateway_helper import SSEGatewayProcess

    # Unpack sse_server tuple
    server_url, app = sse_server

    # Find a free port for gateway
    gateway_port = _find_free_port()

    # Build callback URL with test secret
    callback_url = f"{server_url}/api/sse/callback?secret=test-secret"

    # Start gateway subprocess
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

        # Update Flask app's ConnectionManager with gateway URL
        connection_manager = app.container.connection_manager()
        connection_manager.gateway_url = gateway_url

        yield gateway_url
    finally:
        gateway.print_logs()  # Print logs before stopping for debugging
        gateway.stop()
