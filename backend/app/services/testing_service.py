"""Testing service for test operations like database reset."""

import logging
from typing import Any

from app.database import drop_all_tables, sync_master_data_from_setup, upgrade_database
from app.services.base import BaseService
from app.services.test_data_service import TestDataService
from app.utils.reset_lock import ResetLock

logger = logging.getLogger(__name__)


class TestingService(BaseService):
    """Service for testing operations like database reset."""

    def __init__(self, db: Any, reset_lock: ResetLock):
        """Initialize service with database session and reset lock.

        Args:
            db: SQLAlchemy database session
            reset_lock: Reset lock for concurrency control
        """
        super().__init__(db)
        self.reset_lock = reset_lock

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
            sync_master_data_from_setup()

            # Step 4: Load test data if requested
            if seed:
                logger.info("Loading test dataset")
                test_data_service = TestDataService(self.db)
                test_data_service.load_full_dataset()
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

