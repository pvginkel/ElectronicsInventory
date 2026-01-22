"""Testing service for test operations like database reset and utilities."""

import html
import io
import logging
from pathlib import Path
from textwrap import dedent

# Import TYPE_CHECKING for forward reference
from typing import TYPE_CHECKING, Any

from PIL import Image, ImageDraw, ImageFont

from app.database import drop_all_tables, sync_master_data_from_setup, upgrade_database
from app.utils.reset_lock import ResetLock

if TYPE_CHECKING:
    from app.services.test_data_service import TestDataService

logger = logging.getLogger(__name__)


class TestingService:
    """Service for testing operations like database reset."""

    IMAGE_WIDTH = 400
    IMAGE_HEIGHT = 100
    IMAGE_BACKGROUND_COLOR = "#2478BD"
    IMAGE_TEXT_COLOR = "#000000"
    PREVIEW_IMAGE_QUERY = "Fixture+Preview"
    _PDF_ASSET_PATH = Path(__file__).resolve().parents[1] / "assets" / "fake-pdf.pdf"

    def __init__(self, db: Any, reset_lock: ResetLock, test_data_service: "TestDataService"):
        """Initialize service with database session, reset lock, and test data service.

        Args:
            db: SQLAlchemy database session
            reset_lock: Reset lock for concurrency control
            test_data_service: Service for loading test data
        """
        self.db = db
        self.reset_lock = reset_lock
        self.test_data_service = test_data_service
        self._cached_pdf_bytes: bytes | None = None

    def reset_database(self, seed: bool = False) -> dict[str, Any]:
        """
        Reset database to clean state with optional test data seeding.

        Args:
            seed: Whether to load test data after reset

        Returns:
            Status information about the reset operation

        Raises:
            RuntimeError: If reset is already in progress
        """
        # Try to acquire reset lock
        if not self.reset_lock.acquire_reset():
            raise RuntimeError("Database reset already in progress")

        try:
            logger.info("Starting database reset", extra={"seed": seed})

            # Step 1: Drop all tables
            logger.info("Dropping all database tables")
            drop_all_tables()

            # Step 2: Run all migrations from scratch
            logger.info("Running database migrations")
            applied_migrations = upgrade_database(recreate=True)

            logger.info(f"Applied {len(applied_migrations)} migrations")

            # Step 3: Sync types from setup file
            logger.info("Syncing master data from setup")
            sync_master_data_from_setup(self.db)

            # Step 4: Load test data if requested
            if seed:
                logger.info("Loading test dataset")
                self.test_data_service.load_full_dataset()
                logger.info("Test dataset loaded successfully")

            # Commit all changes
            self.db.commit()

            logger.info("Database reset completed successfully", extra={"seed": seed})

            return {
                "status": "complete",
                "mode": "testing",
                "seeded": seed,
                "migrations_applied": len(applied_migrations)
            }

        except Exception as e:
            logger.error(f"Database reset failed: {e}", extra={"seed": seed})
            # Rollback any partial changes
            self.db.rollback()
            raise
        finally:
            # Always release the lock
            self.reset_lock.release_reset()

    def is_reset_in_progress(self) -> bool:
        """Check if database reset is currently in progress."""
        return self.reset_lock.is_resetting()

    def create_fake_image(self, text: str) -> bytes:
        """Create a 400x100 PNG with centered text on a light blue background.

        Args:
            text: Text to render on the generated image.

        Returns:
            PNG image bytes containing the rendered text.
        """
        font = ImageFont.load_default()

        image = Image.new(
            "RGB",
            (self.IMAGE_WIDTH, self.IMAGE_HEIGHT),
            color=self.IMAGE_BACKGROUND_COLOR
        )

        if text:
            draw = ImageDraw.Draw(image)
            draw.text(
                (self.IMAGE_WIDTH / 2, self.IMAGE_HEIGHT / 2),
                text,
                font=font,
                fill=self.IMAGE_TEXT_COLOR,
                anchor="mm"
            )

        buffer = io.BytesIO()
        image.save(buffer, format="PNG")
        return buffer.getvalue()

    def get_pdf_fixture(self) -> bytes:
        """Return the deterministic PDF asset bundled with the application."""
        if self._cached_pdf_bytes is None:
            self._cached_pdf_bytes = self._PDF_ASSET_PATH.read_bytes()
        return self._cached_pdf_bytes

    def render_html_fixture(self, title: str, include_banner: bool = False) -> str:
        """Render deterministic HTML content for Playwright fixtures."""
        safe_title = html.escape(title)
        preview_image_path = f"/api/testing/content/image?text={self.PREVIEW_IMAGE_QUERY}"

        banner_markup = ""
        if include_banner:
            banner_markup = dedent(
                """
                <div
                  id="deployment-notification"
                  class="deployment-notification w-full bg-blue-600 text-white px-4 py-3 text-center text-sm font-medium shadow-md"
                  data-testid="deployment-notification"
                >
                  A new version of the app is available.
                  <button
                    type="button"
                    data-testid="deployment-notification-reload"
                    class="underline hover:no-underline font-semibold focus:outline-none focus:ring-2 focus:ring-blue-300 focus:ring-offset-2 focus:ring-offset-blue-600 rounded px-1"
                  >
                    Click reload to reload the app.
                  </button>
                </div>
                """
            ).strip()

        html_document = dedent(
            f"""
            <!DOCTYPE html>
            <html lang="en">
              <head>
                <meta charset="utf-8" />
                <meta http-equiv="X-UA-Compatible" content="IE=edge" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <title>{safe_title}</title>
                <meta name="description" content="Deterministic testing fixture" />
                <meta property="og:title" content="{safe_title}" />
                <meta property="og:type" content="article" />
                <meta property="og:image" content="{preview_image_path}" />
                <meta property="og:image:alt" content="Preview image for Playwright fixture" />
                <meta name="twitter:card" content="summary_large_image" />
                <meta name="twitter:title" content="{safe_title}" />
                <meta name="twitter:image" content="{preview_image_path}" />
                <link rel="icon" href="{preview_image_path}" />
                <style>
                  body {{
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    margin: 0;
                    padding: 0;
                    background: #f5f7fa;
                    color: #1f2933;
                  }}
                  main {{
                    max-width: 720px;
                    margin: 3rem auto;
                    background: #ffffff;
                    padding: 2rem;
                    border-radius: 12px;
                    box-shadow: 0 10px 25px rgba(15, 23, 42, 0.1);
                  }}
                  h1 {{
                    margin-top: 0;
                    font-size: 2rem;
                    color: #111827;
                  }}
                  p {{
                    line-height: 1.6;
                    margin-bottom: 1rem;
                  }}
                  .meta {{
                    font-size: 0.875rem;
                    color: #4b5563;
                    margin-bottom: 2rem;
                  }}
                </style>
              </head>
              <body>
                <div id="__app">
                  {banner_markup}
                  <main>
                    <h1>{safe_title}</h1>
                    <div class="meta">Fixture generated for deterministic Playwright document ingestion.</div>
                    <p>
                      This page is served by the Electronics Inventory backend testing utilities. It exposes
                      predictable content for validating document ingestion, HTML metadata extraction, and banner
                      detection flows without relying on external services.
                    </p>
                    <p>
                      The associated preview image is hosted at <code>{preview_image_path}</code> and is referenced
                      via Open Graph and Twitter metadata.
                    </p>
                  </main>
                </div>
              </body>
            </html>
            """
        ).strip()

        return html_document
