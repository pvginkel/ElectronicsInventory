"""Development server entry point."""

import logging
import os
import signal
import threading
import requests

from paste.translogger import TransLogger  # type: ignore[import-untyped]
from waitress import serve

from app import create_app
from app.config import get_settings


def shutdown_flask_dev_server(port: int):
    """Shutdown Flask development server by calling the internal endpoint."""
    try:
        # Call the internal shutdown endpoint
        response = requests.post(f"http://localhost:{port}/health/_internal/shutdown")
        if response.status_code == 200:
            logging.info("Flask development server shutdown initiated")
        else:
            logging.error(f"Failed to shutdown Flask server: {response.text}")
    except Exception as e:
        logging.error(f"Error shutting down Flask server: {e}")


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

        # Register server shutdown callback for development
        def dev_shutdown_callback():
            """Trigger Flask development server shutdown in a separate thread."""
            # Must be in separate thread to avoid blocking the signal handler
            thread = threading.Thread(target=shutdown_flask_dev_server, args=(port,))
            thread.daemon = True
            thread.start()

        shutdown_coordinator.register_server_shutdown(dev_shutdown_callback)

        # Register signal handlers for graceful shutdown
        signal.signal(signal.SIGTERM, shutdown_coordinator.handle_sigterm)
        signal.signal(signal.SIGINT, shutdown_coordinator.handle_sigterm)

        app.logger.info("Registered SIGTERM and SIGINT handlers for graceful shutdown")

        # Run Flask development server
        app.run(host=host, port=port, debug=True, use_reloader=False)
    else:
        # Production: Use Waitress WSGI server
        from waitress.server import create_server
        
        wsgi = TransLogger(app, setup_console_handler=False)

        # Create Waitress server instance
        server_instance = create_server(
            wsgi,
            host=host,
            port=port,
            threads=20,
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
        server_instance.run()

if __name__ == "__main__":
    main()
