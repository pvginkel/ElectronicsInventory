"""Development server entry point."""

from app import create_app
from app.config import get_settings

if __name__ == "__main__":
    settings = get_settings()
    app = create_app(settings)

    # Enable debug mode for development and testing environments
    debug_mode = settings.FLASK_ENV in ("development", "testing")

    app.run(host="0.0.0.0", port=5000, debug=debug_mode)
