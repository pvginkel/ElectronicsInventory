"""Development server entry point."""

import logging
import os
import signal
import threading
import requests

from paste.translogger import TransLogger  # type: ignore[import-untyped]
from waitress import serve
from werkzeug.serving import make_server

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

    # Get the shutdown coordinator
    shutdown_coordinator = app.container.shutdown_coordinator()

    # Enable debug mode for development and testing environments
    debug_mode = settings.FLASK_ENV in ("development", "testing")

    if debug_mode:
        app.logger.info("Running in debug mode")

        # It's very complicated to do a clean shutdown like we do in
        # production. Especially reload won't work because that's
        # handled by starting a new process. We do still perform
        # a clean shutdown by calling the perform_shutdown method.

        try:
            app.run(host=host, port=port, debug=True)
        except KeyboardInterrupt:
            app.logger.info("Shutting down...")
        finally:
            shutdown_coordinator.perform_shutdown()
    else:
        # Production: Use Waitress WSGI server
        from waitress.server import create_server
        
        wsgi = TransLogger(app, setup_console_handler=False)

        # Create Waitress server instance
        server_instance = create_server(
            wsgi,
            host=host,
            port=port,
            threads=3,
            cleanup_interval=10
        )

        def prod_shutdown_callback():
            """Shutdown Waitress server."""
            try:
                server_instance.close()
                wsgi.logger.info("Waitress server shutdown initiated")
            except Exception as e:
                wsgi.logger.error(f"Error shutting down Waitress server: {e}")

        shutdown_coordinator.register_server_shutdown(prod_shutdown_callback)

        # Register signal handlers for graceful shutdown
        signal.signal(signal.SIGTERM, shutdown_coordinator.handle_sigterm)
        signal.signal(signal.SIGINT, shutdown_coordinator.handle_sigterm)

        wsgi.logger.info("Using Waitress WSGI server for production")
        wsgi.logger.info("Registered SIGTERM and SIGINT handlers for graceful shutdown")

        # Start the server
        try:
            server_instance.run()
        except OSError:
            # Calling close() on the server will raise this error.
            pass

if __name__ == "__main__":
    main()
