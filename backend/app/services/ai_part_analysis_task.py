"""AI part analysis background task."""

import logging
from typing import TYPE_CHECKING

from app.schemas.ai_part_analysis import (
    AIPartAnalysisTaskCancelledResultSchema,
    AIPartAnalysisTaskResultSchema,
)
from app.services.base_task import BaseSessionTask, ProgressHandle
from app.services.container import ServiceContainer
from sqlalchemy.orm import Session


logger = logging.getLogger(__name__)


class AIPartAnalysisTask(BaseSessionTask):
    """Background task for AI-powered part analysis."""

    def __init__(self, container: ServiceContainer):
        super().__init__(container)

    def execute_session(self, session: Session, progress_handle: ProgressHandle, **kwargs) -> AIPartAnalysisTaskResultSchema | AIPartAnalysisTaskCancelledResultSchema:
        """
        Execute AI part analysis with progress reporting.

        Args:
            progress_handle: Interface for sending progress updates
            **kwargs: Task parameters including:
                - text_input: Optional text description
                - image_data: Optional image bytes
                - image_mime_type: Optional image MIME type

        Returns:
            AIPartAnalysisTaskResultSchema or AIPartAnalysisTaskCancelledResultSchema
        """
        try:
            # Extract parameters
            text_input: str | None = kwargs.get("text_input")
            image_data: bytes | None = kwargs.get("image_data")
            image_mime_type: str | None = kwargs.get("image_mime_type")

            # Validate inputs
            if not text_input and not image_data:
                return AIPartAnalysisTaskResultSchema(
                    success=False,
                    error_message="Either text input or image must be provided"
                )

            # Phase 1: Initialize and validate (0-5%)
            progress_handle.send_progress("Initializing AI analysis...", 0.0)

            if self.is_cancelled:
                return AIPartAnalysisTaskCancelledResultSchema()

            # Phase 2: AI Analysis (5-80%)
            progress_handle.send_progress("AI analyzing part and finding resources...", 0.05)

            try:
                ai_service = self.container.ai_service()

                analysis_result = ai_service.analyze_part(
                    user_prompt=text_input,
                    image_data=image_data,
                    image_mime_type=image_mime_type,
                    progress_handle=progress_handle
                )
            except Exception as e:
                logger.error(f"AI analysis failed: {e}")
                return AIPartAnalysisTaskResultSchema(
                    success=False,
                    error_message=f"AI analysis failed: {str(e)}"
                )

            if self.is_cancelled:
                return AIPartAnalysisTaskCancelledResultSchema()

            # Phase 3: Document processing already happened in AI service (80-95%)
            progress_handle.send_progress("Processing downloaded documentation...", 0.8)

            # Check if any documents were downloaded
            doc_count = len(analysis_result.documents)
            if doc_count > 0:
                logger.info(f"Successfully downloaded {doc_count} documents")

            if self.is_cancelled:
                return AIPartAnalysisTaskCancelledResultSchema()

            # Phase 4: Finalization (95-100%)
            progress_handle.send_progress("Finalizing suggestions...", 0.95)

            # Log analysis summary
            logger.info(f"AI analysis completed - Type: {analysis_result.type}, "
                       f"Documents: {len(analysis_result.documents)}")

            progress_handle.send_progress("Analysis complete", 1.0)

            return AIPartAnalysisTaskResultSchema(
                success=True,
                analysis=analysis_result
            )

        except Exception as e:
            logger.error(f"Unexpected error in AI analysis task: {e}")
            return AIPartAnalysisTaskResultSchema(
                success=False,
                error_message=f"Unexpected error: {str(e)}"
            )

