"""Tests for TaskService."""

import time
from datetime import UTC

import pytest

from app.schemas.task_schema import TaskEventType, TaskStatus
from app.services.task_service import TaskProgressHandle, TaskService
from tests.test_tasks.test_task import DemoTask, FailingTask, LongRunningTask


class TestTaskService:
    """Test TaskService functionality."""

    @pytest.fixture
    def mock_metrics_service(self):
        """Create mock metrics service."""
        from app.services.metrics_service import NoopMetricsService
        return NoopMetricsService()

    @pytest.fixture
    def task_service(self, mock_metrics_service):
        """Create TaskService instance for testing."""
        service = TaskService(mock_metrics_service, max_workers=2, task_timeout=10)
        yield service
        service.shutdown()

    def test_start_task(self, task_service):
        """Test starting a basic task."""
        task = DemoTask()

        response = task_service.start_task(
            task,
            message="test task",
            steps=2,
            delay=0.01
        )

        assert response.task_id is not None
        assert response.stream_url == f"/api/tasks/{response.task_id}/stream"
        assert response.status == TaskStatus.PENDING

        # Wait for task completion
        time.sleep(0.2)

        # Check task status
        task_info = task_service.get_task_status(response.task_id)
        assert task_info is not None
        assert task_info.status == TaskStatus.COMPLETED
        assert task_info.result["status"] == "success"

    def test_get_task_status_nonexistent(self, task_service):
        """Test getting status of nonexistent task."""
        task_info = task_service.get_task_status("nonexistent-task-id")
        assert task_info is None

    def test_task_execution_with_failure(self, task_service):
        """Test task execution that fails."""
        task = FailingTask()

        response = task_service.start_task(
            task,
            error_message="Test failure",
            delay=0.01
        )

        # Wait for task to fail
        time.sleep(0.2)

        task_info = task_service.get_task_status(response.task_id)
        assert task_info is not None
        assert task_info.status == TaskStatus.FAILED
        assert "Test failure" in task_info.error

    def test_cancel_task(self, task_service):
        """Test task cancellation."""
        task = LongRunningTask()

        response = task_service.start_task(
            task,
            total_time=5.0,
            check_interval=0.02
        )

        # Wait a bit for task to start, then cancel
        time.sleep(0.2)
        success = task_service.cancel_task(response.task_id)
        assert success is True

        # Wait for cancellation to take effect
        time.sleep(0.5)

        task_info = task_service.get_task_status(response.task_id)
        assert task_info is not None
        assert task_info.status == TaskStatus.CANCELLED

    def test_cancel_nonexistent_task(self, task_service):
        """Test cancelling nonexistent task."""
        success = task_service.cancel_task("nonexistent-task-id")
        assert success is False

    def test_cancel_completed_task(self, task_service):
        """Test cancelling already completed task."""
        task = DemoTask()

        response = task_service.start_task(
            task,
            steps=1,
            delay=0.01
        )

        # Wait for completion
        time.sleep(0.2)

        # Try to cancel completed task
        success = task_service.cancel_task(response.task_id)
        assert success is False

    def test_remove_completed_task(self, task_service):
        """Test removing completed task from registry."""
        task = DemoTask()

        response = task_service.start_task(
            task,
            steps=1,
            delay=0.01
        )

        # Wait for completion
        time.sleep(0.2)

        # Verify task exists
        task_info = task_service.get_task_status(response.task_id)
        assert task_info is not None
        assert task_info.status == TaskStatus.COMPLETED

        # Remove task
        success = task_service.remove_completed_task(response.task_id)
        assert success is True

        # Verify task is gone
        task_info = task_service.get_task_status(response.task_id)
        assert task_info is None

    def test_remove_running_task(self, task_service):
        """Test that running tasks cannot be removed."""
        task = LongRunningTask()

        response = task_service.start_task(
            task,
            total_time=1.0,
            check_interval=0.05
        )

        # Try to remove running task
        success = task_service.remove_completed_task(response.task_id)
        assert success is False

        # Cancel to cleanup
        task_service.cancel_task(response.task_id)

    def test_get_task_events(self, task_service):
        """Test getting task events for SSE streaming."""
        task = DemoTask()

        response = task_service.start_task(
            task,
            message="event test",
            steps=2,
            delay=0.05
        )

        # Get events with timeout
        events = task_service.get_task_events(response.task_id, timeout=1.0)

        # Should have received several events
        assert len(events) > 0

        # Check event types
        event_types = [event.event_type for event in events]
        assert TaskEventType.TASK_STARTED in event_types
        assert TaskEventType.PROGRESS_UPDATE in event_types
        assert TaskEventType.TASK_COMPLETED in event_types

        # Check completion event data
        completion_events = [e for e in events if e.event_type == TaskEventType.TASK_COMPLETED]
        assert len(completion_events) == 1
        assert completion_events[0].data["status"] == "success"

    def test_get_events_nonexistent_task(self, task_service):
        """Test getting events for nonexistent task."""
        events = task_service.get_task_events("nonexistent-task-id", timeout=0.1)
        assert events == []

    def test_concurrent_tasks(self, task_service):
        """Test running multiple concurrent tasks."""
        tasks = []
        responses = []

        # Start multiple tasks
        for i in range(3):
            task = DemoTask()
            response = task_service.start_task(
                task,
                message=f"task {i}",
                steps=2,
                delay=0.02
            )
            tasks.append(task)
            responses.append(response)

        # Wait for all to complete
        time.sleep(0.3)

        # Check all completed successfully
        for response in responses:
            task_info = task_service.get_task_status(response.task_id)
            assert task_info is not None
            assert task_info.status == TaskStatus.COMPLETED

    def test_task_service_shutdown(self):
        """Test TaskService shutdown and cleanup."""
        from app.services.metrics_service import NoopMetricsService
        metrics_service = NoopMetricsService()
        service = TaskService(metrics_service, max_workers=1)

        # Start a task
        task = DemoTask()
        service.start_task(task, steps=1, delay=0.01)

        # Shutdown service
        service.shutdown()

        # Verify cleanup (internal state should be cleared)
        assert len(service._tasks) == 0
        assert len(service._task_instances) == 0
        assert len(service._event_queues) == 0

    def test_automatic_cleanup_of_completed_tasks(self, task_service):
        """Test that completed tasks are automatically cleaned up."""
        # Create service with short cleanup interval for testing
        from app.services.metrics_service import NoopMetricsService
        metrics_service = NoopMetricsService()
        service = TaskService(metrics_service, max_workers=1, cleanup_interval=1)

        try:
            # Start and complete a task
            task = DemoTask()
            response = service.start_task(task, steps=1, delay=0.01)

            # Wait for task completion
            time.sleep(0.2)

            # Verify task exists
            task_info = service.get_task_status(response.task_id)
            assert task_info is not None
            assert task_info.status == TaskStatus.COMPLETED

            # Wait for automatic cleanup (cleanup runs every 1 second, task needs to be 1 second old)
            # We need to wait long enough for: task to be 1 second old + cleanup to run
            time.sleep(2.5)

            # Verify task was cleaned up
            task_info = service.get_task_status(response.task_id)
            assert task_info is None

        finally:
            service.shutdown()

    def test_manual_cleanup_completed_tasks(self, task_service):
        """Test manual cleanup of completed tasks."""
        import datetime
        from unittest.mock import patch

        # Complete a task
        task = DemoTask()
        response = task_service.start_task(task, steps=1, delay=0.01)
        time.sleep(0.2)

        # Verify task exists
        task_info = task_service.get_task_status(response.task_id)
        assert task_info is not None
        assert task_info.status == TaskStatus.COMPLETED

        # Mock current time to simulate task is old
        with patch('app.services.task_service.datetime') as mock_datetime:
            # Set current time to be cleanup_interval + 1 seconds after task completion
            future_time = task_info.end_time + datetime.timedelta(seconds=task_service.cleanup_interval + 1)
            mock_datetime.now.return_value = future_time

            # Run manual cleanup
            task_service._cleanup_completed_tasks()

            # Verify task was cleaned up
            task_info = task_service.get_task_status(response.task_id)
            assert task_info is None

    def test_cleanup_only_removes_old_completed_tasks(self, task_service):
        """Test that cleanup only removes old completed tasks, not recent ones."""
        from datetime import datetime, timedelta

        # Complete two tasks
        task1 = DemoTask()
        task2 = DemoTask()

        response1 = task_service.start_task(task1, steps=1, delay=0.01)
        time.sleep(0.2)  # Wait for task1 to complete
        response2 = task_service.start_task(task2, steps=1, delay=0.01)
        time.sleep(0.2)  # Wait for task2 to complete

        # Both tasks should be completed
        task1_info = task_service.get_task_status(response1.task_id)
        task2_info = task_service.get_task_status(response2.task_id)
        assert task1_info.status == TaskStatus.COMPLETED
        assert task2_info.status == TaskStatus.COMPLETED

        # Manually modify task1's end_time to be old
        with task_service._lock:
            old_time = datetime.now(UTC) - timedelta(seconds=task_service.cleanup_interval + 1)
            task_service._tasks[response1.task_id].end_time = old_time

        # Run manual cleanup
        task_service._cleanup_completed_tasks()

        # Task1 should be cleaned up, task2 should remain
        assert task_service.get_task_status(response1.task_id) is None
        assert task_service.get_task_status(response2.task_id) is not None

    def test_cleanup_does_not_remove_running_tasks(self, task_service):
        """Test that cleanup does not remove running tasks."""
        import datetime
        from unittest.mock import patch

        # Start a long running task
        task = LongRunningTask()
        response = task_service.start_task(task, total_time=1.0, check_interval=0.05)

        # Wait a bit for task to start
        time.sleep(0.1)

        # Mock time far in future
        with patch('app.services.task_service.datetime') as mock_datetime:
            future_time = datetime.datetime.now(datetime.UTC) + datetime.timedelta(hours=1)
            mock_datetime.now.return_value = future_time

            # Run cleanup
            task_service._cleanup_completed_tasks()

            # Running task should still exist
            task_info = task_service.get_task_status(response.task_id)
            assert task_info is not None
            assert task_info.status == TaskStatus.RUNNING

        # Cancel task to clean up
        task_service.cancel_task(response.task_id)


class TestTaskProgressHandle:
    """Test TaskProgressHandle implementation."""

    def test_progress_handle_creation(self):
        """Test TaskProgressHandle creation and basic functionality."""
        from queue import Queue

        queue = Queue()
        handle = TaskProgressHandle("test-task-id", queue)

        # Send different types of progress updates
        handle.send_progress_text("Text update")
        handle.send_progress_value(0.5)
        handle.send_progress("Combined update", 0.75)

        # Check that events were queued
        events = []
        while not queue.empty():
            events.append(queue.get_nowait())

        assert len(events) == 3

        # Check event content
        text_event = events[0]
        assert text_event.event_type == TaskEventType.PROGRESS_UPDATE
        assert text_event.task_id == "test-task-id"
        assert text_event.data["text"] == "Text update"
        assert text_event.data["value"] == 0.0  # Uses initial progress value

        value_event = events[1]
        assert value_event.data["text"] == "Text update"  # Retains previous text
        assert value_event.data["value"] == 0.5

        combined_event = events[2]
        assert combined_event.data["text"] == "Combined update"
        assert combined_event.data["value"] == 0.75

    def test_progress_handle_full_queue(self):
        """Test progress handle behavior with full queue."""
        from queue import Queue

        # Create small queue that can fill up
        queue = Queue(maxsize=1)
        handle = TaskProgressHandle("test-task-id", queue)

        # Fill the queue
        handle.send_progress_text("First message")

        # This should not raise an exception even if queue is full
        handle.send_progress_text("Second message")  # Should be silently ignored

        # Verify only first message is in queue
        assert queue.qsize() == 1
        event = queue.get_nowait()
        assert event.data["text"] == "First message"
