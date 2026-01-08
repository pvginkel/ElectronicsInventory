"""AI part cleanup background task."""

import logging
from typing import Any

from sqlalchemy.orm import Session

from app.schemas.ai_part_cleanup import (
    AIPartCleanupTaskCancelledResultSchema,
    AIPartCleanupTaskResultSchema,
)
from app.services.base_task import BaseSessionTask, ProgressHandle, SubProgressHandle
from app.services.container import ServiceContainer

logger = logging.getLogger(__name__)


class AIPartCleanupTask(BaseSessionTask):
    """Background task for AI-powered part data cleanup."""

    def __init__(self, container: ServiceContainer):
        super().__init__(container)

    def execute_session(
        self, session: Session, progress_handle: ProgressHandle, **kwargs: Any
    ) -> AIPartCleanupTaskResultSchema | AIPartCleanupTaskCancelledResultSchema:
        """
        Execute AI part cleanup with progress reporting.

        Args:
            session: Database session
            progress_handle: Interface for sending progress updates
            **kwargs: Task parameters including:
                - part_key: 4-character part key to clean up

        Returns:
            AIPartCleanupTaskResultSchema or AIPartCleanupTaskCancelledResultSchema
        """
        try:
            # Extract parameters
            part_key: str | None = kwargs.get("part_key")

            if not part_key:
                return AIPartCleanupTaskResultSchema(
                    success=False, error_message="Part key is required"
                )

            # Phase 1: Initialize and validate (0-5%)
            progress_handle.send_progress_text("Initializing cleanup analysis")

            if self.is_cancelled:
                return AIPartCleanupTaskCancelledResultSchema()

            # Log cleanup start
            logger.info(f"AI cleanup started for part {part_key}")

            # Phase 2: AI Cleanup (5-80%)
            progress_handle.send_progress("AI cleaning part data", 0.05)

            try:
                ai_service = self.container.ai_service()

                cleanup_progress_handle = SubProgressHandle(progress_handle, 0.05, 0.8)

                cleaned_part = ai_service.cleanup_part(
                    part_key=part_key,
                    progress_handle=cleanup_progress_handle
                )
            except Exception as e:
                logger.error(f"AI cleanup failed for part {part_key}: {e}")
                return AIPartCleanupTaskResultSchema(
                    success=False, error_message=f"AI cleanup failed: {str(e)}"
                )

            if self.is_cancelled:
                return AIPartCleanupTaskCancelledResultSchema()

            # Phase 3: Processing cleanup suggestions (80-95%)
            progress_handle.send_progress("Processing cleanup suggestions", 0.8)

            # Log fields that changed (for audit trail)
            logger.info(f"AI cleanup completed for part {part_key}")

            if self.is_cancelled:
                return AIPartCleanupTaskCancelledResultSchema()

            # Phase 4: Finalization (95-100%)
            progress_handle.send_progress("Cleanup complete", 0.95)

            progress_handle.send_progress("Cleanup analysis ready", 1.0)

            return AIPartCleanupTaskResultSchema(
                success=True, cleaned_part=cleaned_part
            )

        except Exception as e:
            logger.error(f"Unexpected error in AI cleanup task: {e}")
            return AIPartCleanupTaskResultSchema(
                success=False, error_message=f"Unexpected error: {str(e)}"
            )
