"""Development server entry point."""

import logging
import os
import signal
import sys

from paste.translogger import TransLogger  # type: ignore[import-untyped]
from waitress import serve

from app import create_app
from app.config import get_settings


def main():
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    settings = get_settings()
    app = create_app(settings)

    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", 5000))

    # Enable debug mode for development and testing environments
    debug_mode = settings.FLASK_ENV in ("development", "testing")

    if debug_mode:
        app.logger.info("Running in debug mode")

        app.run(host=host, port=port, debug=True)
    else:
        # Production: Use Waitress WSGI server
        wsgi = TransLogger(app, setup_console_handler=False)

        # Register signal handlers for graceful shutdown
        shutdown_coordinator = app.container.shutdown_coordinator()
        signal.signal(signal.SIGTERM, shutdown_coordinator.handle_sigterm)
        signal.signal(signal.SIGINT, shutdown_coordinator.handle_sigterm)

        wsgi.logger.info("Using Waitress WSGI server for production")
        wsgi.logger.info("Registered SIGTERM and SIGINT handlers for graceful shutdown")

        try:
            # Configure Waitress with proper shutdown timeout
            serve(
                wsgi,
                host=host,
                port=port,
                threads=20,
                cleanup_interval=10,
                channel_timeout=settings.GRACEFUL_SHUTDOWN_TIMEOUT
            )
        except KeyboardInterrupt:
            wsgi.logger.info("Received keyboard interrupt, initiating shutdown")

        # Perform graceful shutdown
        wsgi.logger.info("Waiting for graceful shutdown...")
        shutdown_coordinator.wait_for_shutdown(timeout=settings.GRACEFUL_SHUTDOWN_TIMEOUT)

        # Final cleanup
        task_service = app.container.task_service()
        task_service.shutdown()

        wsgi.logger.info("Graceful shutdown complete")
        sys.exit(0)

if __name__ == "__main__":
    main()
