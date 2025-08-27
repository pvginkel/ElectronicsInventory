"""Development server entry point."""

import logging
import os

from paste.translogger import TransLogger
from waitress import serve

from app import create_app
from app.config import get_settings


def main():
    settings = get_settings()
    app = create_app(settings)

    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", 5000))

    # Enable debug mode for development and testing environments
    debug_mode = settings.FLASK_ENV in ("development", "testing")

    if debug_mode:
        app.run(host=host, port=port, debug=True)
    else:
        # Production: Use Waitress WSGI server
        logging.basicConfig(level=logging.INFO)

        wsgi = TransLogger(app, setup_console_handler=False)

        wsgi.logger.info("Using Waitress WSGI server for production")
        serve(wsgi, host=host, port=port, threads=20)

if __name__ == "__main__":
    main()
