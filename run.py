"""Development server entry point."""

import logging
import os

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

    # Get and initialize the shutdown coordinator
    shutdown_coordinator = app.container.shutdown_coordinator()
    shutdown_coordinator.initialize()

    # Enable debug mode for development and testing environments
    debug_mode = settings.FLASK_ENV in ("development", "testing")

    if debug_mode:
        app.logger.info("Running in debug mode")

        app.run(host=host, port=port, debug=True)
    else:
        # Production: Use Waitress WSGI server
        wsgi = TransLogger(app, setup_console_handler=False)

        wsgi.logger.info("Using Waitress WSGI server for production")
        serve(wsgi, host=host, port=port, threads=20)

if __name__ == "__main__":
    main()
