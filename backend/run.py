"""Development server entry point."""

import logging
import os
import signal
import threading

from paste.translogger import TransLogger  # type: ignore[import-untyped]
from waitress import serve

from app import create_app
from app.config import get_settings
from app.utils.graceful_shutdown import GracefulShutdownManager


def main():
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    settings = get_settings()
    app = create_app(settings)
    
    # Initialize graceful shutdown manager and register signal handler
    shutdown_manager = GracefulShutdownManager()
    signal.signal(signal.SIGTERM, shutdown_manager.handle_sigterm)
    signal.signal(signal.SIGINT, shutdown_manager.handle_sigterm)

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

        wsgi.logger.info("Using Waitress WSGI server for production")
        
        # Start server in a background thread for graceful shutdown handling
        server_thread = threading.Thread(
            target=serve, 
            args=(wsgi,), 
            kwargs={'host': host, 'port': port, 'threads': 20},
            daemon=True
        )
        server_thread.start()
        
        # Wait for shutdown signal
        shutdown_manager.wait_for_shutdown()
        
        # Graceful shutdown sequence
        app.logger.info("Starting graceful shutdown sequence...")
        try:
            # Get task service from app container and shutdown gracefully
            task_service = app.container.task_service()
            task_service.shutdown(timeout=settings.GRACEFUL_SHUTDOWN_TIMEOUT)
            app.logger.info("Task service shutdown completed")
        except Exception as e:
            app.logger.error(f"Error during task service shutdown: {e}")
        
        app.logger.info("Graceful shutdown sequence completed")

if __name__ == "__main__":
    main()
