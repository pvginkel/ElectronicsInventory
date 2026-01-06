"""Tests for AI part cleanup task."""

from unittest.mock import Mock

import pytest

from app.exceptions import InvalidOperationException, RecordNotFoundException
from app.schemas.ai_part_cleanup import (
    AIPartCleanupTaskCancelledResultSchema,
    AIPartCleanupTaskResultSchema,
    CleanedPartDataSchema,
)
from app.services.ai_part_cleanup_task import AIPartCleanupTask


@pytest.fixture
def mock_ai_service():
    """Create mock AI service for testing."""
    return Mock()


@pytest.fixture
def mock_container(mock_ai_service):
    """Create mock service container for testing."""
    container = Mock()
    container.ai_service.return_value = mock_ai_service
    return container


@pytest.fixture
def mock_progress_handle():
    """Create mock progress handle for testing."""
    progress_handle = Mock()
    progress_handle.send_progress_text = Mock()
    progress_handle.send_progress_value = Mock()
    progress_handle.send_progress = Mock()
    return progress_handle


class TestAIPartCleanupTask:
    """Test cases for AIPartCleanupTask."""

    def test_execute_no_part_key(self, mock_container, mock_progress_handle):
        """Test task execution with no part key input."""
        task = AIPartCleanupTask(mock_container)

        result = task.execute(mock_progress_handle)

        assert isinstance(result, AIPartCleanupTaskResultSchema)
        assert result.success is False
        assert "Part key is required" in result.error_message

    def test_execute_success(
        self, mock_container, mock_ai_service, mock_progress_handle
    ):
        """Test successful task execution with part cleanup."""
        # Mock AI service response
        mock_cleaned_part = CleanedPartDataSchema(
            key="ABCD",
            manufacturer_code="STM32F103C8T6",
            type="Microcontroller",
            description="32-bit ARM Cortex-M3 microcontroller",
            manufacturer="STMicroelectronics",
            tags=["arm", "cortex-m3", "32-bit"],
            package="LQFP-48",
            pin_count=48,
            pin_pitch="0.5mm",
            voltage_rating="3.3V",
            input_voltage="2.0-3.6V",
            output_voltage=None,
            mounting_type="Surface-Mount",
            series="STM32F1",
            dimensions="7x7mm",
            product_page="https://www.st.com/stm32f103.html",
            seller=None,
            seller_link=None,
        )
        mock_ai_service.cleanup_part.return_value = mock_cleaned_part

        task = AIPartCleanupTask(mock_container)

        result = task.execute(mock_progress_handle, part_key="ABCD")

        # Verify successful result
        assert isinstance(result, AIPartCleanupTaskResultSchema)
        assert result.success is True
        assert result.cleaned_part is not None
        assert result.cleaned_part.key == "ABCD"
        assert result.cleaned_part.manufacturer_code == "STM32F103C8T6"
        assert result.error_message is None

        # Verify AI service was called correctly
        mock_ai_service.cleanup_part.assert_called_once_with(
            part_key="ABCD", progress_handle=mock_progress_handle
        )

        # Verify progress updates were sent
        assert mock_progress_handle.send_progress.call_count >= 2

        # Check specific progress messages
        progress_calls = [
            call.args[0] for call in mock_progress_handle.send_progress.call_args_list
        ]
        assert any("Initializing cleanup" in msg for msg in progress_calls)
        assert any("AI cleaning" in msg for msg in progress_calls)

    def test_execute_part_not_found(
        self, mock_container, mock_ai_service, mock_progress_handle
    ):
        """Test task execution when part doesn't exist."""
        # Mock AI service to raise RecordNotFoundException
        mock_ai_service.cleanup_part.side_effect = RecordNotFoundException(
            "Part", "ZZZZ"
        )

        task = AIPartCleanupTask(mock_container)

        result = task.execute(mock_progress_handle, part_key="ZZZZ")

        # Verify error result
        assert isinstance(result, AIPartCleanupTaskResultSchema)
        assert result.success is False
        assert "Part ZZZZ was not found" in result.error_message
        assert result.cleaned_part is None

    def test_execute_ai_service_error(
        self, mock_container, mock_ai_service, mock_progress_handle
    ):
        """Test task execution when AI service raises an error."""
        # Mock AI service to raise an exception
        mock_ai_service.cleanup_part.side_effect = Exception("OpenAI API error")

        task = AIPartCleanupTask(mock_container)

        result = task.execute(mock_progress_handle, part_key="ABCD")

        # Verify error result
        assert isinstance(result, AIPartCleanupTaskResultSchema)
        assert result.success is False
        assert "AI cleanup failed: OpenAI API error" in result.error_message
        assert result.cleaned_part is None

    def test_execute_invalid_operation_error(
        self, mock_container, mock_ai_service, mock_progress_handle
    ):
        """Test task execution when AI is disabled."""
        # Mock AI service to raise InvalidOperationException
        mock_ai_service.cleanup_part.side_effect = InvalidOperationException(
            "perform AI cleanup",
            "real AI usage is disabled in testing mode",
        )

        task = AIPartCleanupTask(mock_container)

        result = task.execute(mock_progress_handle, part_key="ABCD")

        # Verify error result
        assert isinstance(result, AIPartCleanupTaskResultSchema)
        assert result.success is False
        assert "Cannot perform AI cleanup" in result.error_message

    def test_execute_task_cancelled_early(
        self, mock_container, mock_ai_service, mock_progress_handle
    ):
        """Test task execution when cancelled before AI cleanup."""
        task = AIPartCleanupTask(mock_container)

        # Cancel the task before execution
        task.cancel()

        result = task.execute(mock_progress_handle, part_key="ABCD")

        # Verify cancellation result
        assert isinstance(result, AIPartCleanupTaskCancelledResultSchema)
        assert result.cancelled is True

        # AI service should not have been called
        mock_ai_service.cleanup_part.assert_not_called()

    def test_execute_task_cancelled_during_cleanup(
        self, mock_container, mock_ai_service, mock_progress_handle
    ):
        """Test task cancellation detection during execution."""

        def mock_cleanup_part(*args, **kwargs):
            # Simulate cancellation during cleanup
            return CleanedPartDataSchema(
                key="ABCD",
                manufacturer_code="CANCELLED",
                type="Test",
                description="Test part",
                manufacturer=None,
                tags=[],
                package=None,
                pin_count=None,
                pin_pitch=None,
                voltage_rating=None,
                input_voltage=None,
                output_voltage=None,
                mounting_type=None,
                series=None,
                dimensions=None,
                product_page=None,
                seller=None,
                seller_link=None,
            )

        mock_ai_service.cleanup_part.side_effect = mock_cleanup_part

        task = AIPartCleanupTask(mock_container)

        # Start execution and cancel during it
        def cancel_during_execution(text, value):
            if "AI cleaning" in text:
                task.cancel()

        mock_progress_handle.send_progress.side_effect = cancel_during_execution

        result = task.execute(mock_progress_handle, part_key="ABCD")

        # Should detect cancellation and return cancelled result
        assert isinstance(result, AIPartCleanupTaskCancelledResultSchema)
        assert result.cancelled is True

    def test_execute_unexpected_error(
        self, mock_container, mock_ai_service, mock_progress_handle
    ):
        """Test handling of unexpected errors during execution."""
        # Mock progress handle to raise an exception
        mock_progress_handle.send_progress.side_effect = Exception("Unexpected error")

        task = AIPartCleanupTask(mock_container)

        result = task.execute(mock_progress_handle, part_key="ABCD")

        # Should handle unexpected error gracefully
        assert isinstance(result, AIPartCleanupTaskResultSchema)
        assert result.success is False
        assert "Unexpected error" in result.error_message

    def test_execute_progress_reporting_sequence(
        self, mock_container, mock_ai_service, mock_progress_handle
    ):
        """Test that progress is reported in the correct sequence and ranges."""
        # Mock AI service response
        mock_cleaned_part = CleanedPartDataSchema(
            key="ABCD",
            manufacturer_code="TEST123",
            type="Sensor",
            description="Test sensor",
            manufacturer="TestMfg",
            tags=["sensor"],
            package=None,
            pin_count=None,
            pin_pitch=None,
            voltage_rating=None,
            input_voltage=None,
            output_voltage=None,
            mounting_type=None,
            series=None,
            dimensions=None,
            product_page=None,
            seller=None,
            seller_link=None,
        )
        mock_ai_service.cleanup_part.return_value = mock_cleaned_part

        task = AIPartCleanupTask(mock_container)

        result = task.execute(mock_progress_handle, part_key="ABCD")

        # Verify successful execution
        assert result.success is True

        # Extract all progress calls
        progress_calls = mock_progress_handle.send_progress.call_args_list

        # Verify minimum number of progress updates
        assert len(progress_calls) >= 2

        # Check that we have the expected progress phases from text calls
        progress_messages = [call.args[0] for call in progress_calls]

        # Should have initialization phase
        assert any("Initializing" in msg for msg in progress_messages)

        # Should have AI cleanup phase
        assert any("AI cleaning" in msg for msg in progress_messages)

        # Check progress value calls
        if progress_calls:
            # Check progress value sequence
            progress_values = [call.args[1] for call in progress_calls]

            # Values should be in ascending order and within valid range
            for value in progress_values:
                assert 0.0 <= value <= 1.0

            # Should end with completion
            assert any(
                "complete" in msg.lower() or "ready" in msg.lower()
                for msg in progress_messages
            )

    def test_task_inheritance(self, mock_container):
        """Test that AIPartCleanupTask properly inherits from BaseSessionTask."""
        task = AIPartCleanupTask(mock_container)

        # Should have inherited cancellation functionality
        assert hasattr(task, "cancel")
        assert hasattr(task, "is_cancelled")
        assert callable(task.cancel)

        # Should start not cancelled
        assert not task.is_cancelled

        # Should be cancellable
        task.cancel()
        assert task.is_cancelled
