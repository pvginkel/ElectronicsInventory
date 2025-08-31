"""Tests for AI part analysis task."""

from unittest.mock import Mock, patch

import pytest

from app.schemas.ai_part_analysis import (
    AIPartAnalysisResultSchema, 
    AIPartAnalysisTaskResultSchema,
    AIPartAnalysisTaskCancelledResultSchema
)
from app.services.ai_part_analysis_task import AIPartAnalysisTask


@pytest.fixture
def mock_ai_service():
    """Create mock AI service for testing."""
    return Mock()


@pytest.fixture
def mock_progress_handle():
    """Create mock progress handle for testing."""
    progress_handle = Mock()
    progress_handle.send_progress = Mock()
    return progress_handle


class TestAIPartAnalysisTask:
    """Test cases for AIPartAnalysisTask."""

    def test_execute_no_input(self, mock_ai_service, mock_progress_handle):
        """Test task execution with no text or image input."""
        task = AIPartAnalysisTask(mock_ai_service)
        
        result = task.execute(mock_progress_handle)
        
        assert isinstance(result, AIPartAnalysisTaskResultSchema)
        assert result.success is False
        assert "Either text input or image must be provided" in result.error_message

    def test_execute_text_only_success(self, mock_ai_service, mock_progress_handle):
        """Test successful task execution with text input only."""
        # Mock AI service response
        mock_analysis_result = AIPartAnalysisResultSchema(
            manufacturer_code="TEST123",
            type="Relay",
            description="Test relay",
            tags=["relay", "12V"],
            type_is_existing=True,
            existing_type_id=1,
            documents=[],
            suggested_image_url=None
        )
        mock_ai_service.analyze_part.return_value = mock_analysis_result
        
        task = AIPartAnalysisTask(mock_ai_service)
        
        result = task.execute(
            mock_progress_handle,
            text_input="Test relay 12V"
        )
        
        # Verify successful result
        assert isinstance(result, AIPartAnalysisTaskResultSchema)
        assert result.success is True
        assert result.analysis is not None
        assert result.analysis.manufacturer_code == "TEST123"
        assert result.error_message is None
        
        # Verify AI service was called correctly
        mock_ai_service.analyze_part.assert_called_once_with(
            text_input="Test relay 12V",
            image_data=None,
            image_mime_type=None
        )
        
        # Verify progress updates were sent
        assert mock_progress_handle.send_progress.call_count >= 3
        
        # Check specific progress messages
        progress_calls = [call.args for call in mock_progress_handle.send_progress.call_args_list]
        assert any("Initializing AI analysis" in call[0] for call in progress_calls)
        assert any("AI analyzing part" in call[0] for call in progress_calls)
        assert any("Analysis complete" in call[0] for call in progress_calls)

    def test_execute_with_image_success(self, mock_ai_service, mock_progress_handle):
        """Test successful task execution with image input."""
        # Mock AI service response
        mock_analysis_result = AIPartAnalysisResultSchema(
            manufacturer_code="IMG123",
            type="Microcontroller",
            description="Arduino board",
            tags=["microcontroller", "arduino"],
            type_is_existing=True,
            existing_type_id=2,
            documents=[{
                "filename": "datasheet.pdf",
                "temp_path": "/tmp/path/datasheet.pdf",
                "original_url": "https://example.com/datasheet.pdf",
                "document_type": "datasheet",
                "description": "Complete datasheet"
            }],
            suggested_image_url="/tmp/path/image.jpg"
        )
        mock_ai_service.analyze_part.return_value = mock_analysis_result
        
        task = AIPartAnalysisTask(mock_ai_service)
        
        result = task.execute(
            mock_progress_handle,
            text_input="Arduino board",
            image_data=b"fake_image_data",
            image_mime_type="image/jpeg"
        )
        
        # Verify successful result
        assert isinstance(result, AIPartAnalysisTaskResultSchema)
        assert result.success is True
        assert result.analysis is not None
        assert len(result.analysis.documents) == 1
        
        # Verify AI service was called with all parameters
        mock_ai_service.analyze_part.assert_called_once_with(
            text_input="Arduino board",
            image_data=b"fake_image_data",
            image_mime_type="image/jpeg"
        )

    def test_execute_ai_service_error(self, mock_ai_service, mock_progress_handle):
        """Test task execution when AI service raises an error."""
        # Mock AI service to raise an exception
        mock_ai_service.analyze_part.side_effect = Exception("OpenAI API error")
        
        task = AIPartAnalysisTask(mock_ai_service)
        
        result = task.execute(
            mock_progress_handle,
            text_input="Test input"
        )
        
        # Verify error result
        assert isinstance(result, AIPartAnalysisTaskResultSchema)
        assert result.success is False
        assert "AI analysis failed: OpenAI API error" in result.error_message
        assert result.analysis is None

    def test_execute_task_cancelled_early(self, mock_ai_service, mock_progress_handle):
        """Test task execution when cancelled before AI analysis."""
        task = AIPartAnalysisTask(mock_ai_service)
        
        # Cancel the task before execution
        task.cancel()
        
        result = task.execute(
            mock_progress_handle,
            text_input="Test input"
        )
        
        # Verify cancellation result
        assert isinstance(result, AIPartAnalysisTaskCancelledResultSchema)
        assert result.cancelled is True
        
        # AI service should not have been called
        mock_ai_service.analyze_part.assert_not_called()

    def test_execute_task_cancelled_during_analysis(self, mock_ai_service, mock_progress_handle):
        """Test task cancellation detection during execution."""
        def mock_analyze_part(*args, **kwargs):
            # Simulate cancellation during analysis
            return AIPartAnalysisResultSchema(
                manufacturer_code="CANCELLED",
                type="Test",
                description="Test part",
                type_is_existing=False
            )
        
        mock_ai_service.analyze_part.side_effect = mock_analyze_part
        
        task = AIPartAnalysisTask(mock_ai_service)
        
        # Start execution and cancel during it
        def cancel_during_execution(text, value):
            if "AI analyzing" in text:
                task.cancel()
        
        mock_progress_handle.send_progress.side_effect = cancel_during_execution
        
        result = task.execute(
            mock_progress_handle,
            text_input="Test input"
        )
        
        # Should detect cancellation and return cancelled result
        assert isinstance(result, AIPartAnalysisTaskCancelledResultSchema)
        assert result.cancelled is True

    def test_execute_unexpected_error(self, mock_ai_service, mock_progress_handle):
        """Test handling of unexpected errors during execution."""
        # Mock progress handle to raise an exception
        mock_progress_handle.send_progress.side_effect = Exception("Unexpected error")
        
        task = AIPartAnalysisTask(mock_ai_service)
        
        result = task.execute(
            mock_progress_handle,
            text_input="Test input"
        )
        
        # Should handle unexpected error gracefully
        assert isinstance(result, AIPartAnalysisTaskResultSchema)
        assert result.success is False
        assert "Unexpected error" in result.error_message

    def test_execute_progress_reporting_sequence(self, mock_ai_service, mock_progress_handle):
        """Test that progress is reported in the correct sequence and ranges."""
        # Mock AI service response
        mock_analysis_result = AIPartAnalysisResultSchema(
            manufacturer_code="PROG123",
            type="Sensor",
            description="Test sensor",
            type_is_existing=False,
            documents=[]
        )
        mock_ai_service.analyze_part.return_value = mock_analysis_result
        
        task = AIPartAnalysisTask(mock_ai_service)
        
        result = task.execute(
            mock_progress_handle,
            text_input="Test sensor"
        )
        
        # Verify successful execution
        assert result.success is True
        
        # Extract all progress calls
        progress_calls = mock_progress_handle.send_progress.call_args_list
        
        # Verify minimum number of progress updates
        assert len(progress_calls) >= 4
        
        # Check progress value sequence
        progress_values = [call.args[1] for call in progress_calls]
        
        # Values should be in ascending order (generally)
        assert progress_values[0] == 0.0  # Start
        assert progress_values[-1] == 1.0  # End
        
        # Check that we have the expected progress phases
        progress_messages = [call.args[0] for call in progress_calls]
        
        # Should have initialization phase
        assert any("Initializing" in msg for msg in progress_messages)
        
        # Should have AI analysis phase
        assert any("AI analyzing" in msg for msg in progress_messages)
        
        # Should have processing phase
        assert any("Processing" in msg for msg in progress_messages)
        
        # Should have finalization phase
        assert any("Finalizing" in msg for msg in progress_messages)
        
        # Should end with completion
        assert any("complete" in msg.lower() for msg in progress_messages)

    def test_execute_documents_logging(self, mock_ai_service, mock_progress_handle):
        """Test logging when documents are successfully downloaded."""
        # Mock AI service response with documents
        mock_analysis_result = AIPartAnalysisResultSchema(
            manufacturer_code="DOC123",
            type="Component",
            description="Component with docs",
            type_is_existing=False,
            documents=[
                {
                    "filename": "datasheet1.pdf",
                    "temp_path": "/tmp/path1/datasheet1.pdf",
                    "original_url": "https://example.com/datasheet1.pdf",
                    "document_type": "datasheet",
                    "description": None
                },
                {
                    "filename": "manual.pdf",
                    "temp_path": "/tmp/path2/manual.pdf",
                    "original_url": "https://example.com/manual.pdf",
                    "document_type": "manual",
                    "description": "User manual"
                }
            ]
        )
        mock_ai_service.analyze_part.return_value = mock_analysis_result
        
        task = AIPartAnalysisTask(mock_ai_service)
        
        with patch('app.services.ai_part_analysis_task.logger') as mock_logger:
            result = task.execute(
                mock_progress_handle,
                text_input="Component with documentation"
            )
            
            # Verify successful execution
            assert result.success is True
            assert len(result.analysis.documents) == 2
            
            # Check that document download was logged
            info_calls = [call.args[0] for call in mock_logger.info.call_args_list]
            assert any("Successfully downloaded 2 documents" in msg for msg in info_calls)
            
            # Check that analysis completion was logged
            assert any("AI analysis completed" in msg for msg in info_calls)

    def test_task_inheritance(self, mock_ai_service):
        """Test that AIPartAnalysisTask properly inherits from BaseTask."""
        task = AIPartAnalysisTask(mock_ai_service)
        
        # Should have inherited cancellation functionality
        assert hasattr(task, 'cancel')
        assert hasattr(task, 'is_cancelled')
        assert callable(task.cancel)
        
        # Should start not cancelled
        assert not task.is_cancelled
        
        # Should be cancellable
        task.cancel()
        assert task.is_cancelled