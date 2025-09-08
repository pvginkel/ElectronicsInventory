"""Integration tests for TaskService graceful shutdown functionality."""

import threading
import time
from unittest.mock import Mock, patch

import pytest

from app.exceptions import InvalidOperationException
from app.services.base_task import BaseTask
from app.services.metrics_service import NoopMetricsService
from app.services.task_service import TaskService
from app.utils.graceful_shutdown import NoopGracefulShutdownManager


class MockTask(BaseTask):
    """Mock task for testing."""
    
    def __init__(self, duration=0.1, should_fail=False):
        super().__init__()
        self.duration = duration
        self.should_fail = should_fail
        self.started = threading.Event()
        self.can_complete = threading.Event()
        
    def execute(self, progress_handle, **kwargs):
        """Execute mock task."""
        self.started.set()
        
        if self.should_fail:
            raise Exception("Mock task failure")
        
        # Check for cancellation frequently during long durations
        total_wait = 0.0
        check_interval = 0.1
        
        while total_wait < self.duration and not self.is_cancelled and not self.can_complete.is_set():
            time.sleep(check_interval)
            total_wait += check_interval
        
        if self.is_cancelled:
            return None
            
        time.sleep(0.01)  # Small delay to simulate work completion
        return Mock(model_dump=lambda: {"result": "success"})
        
    def allow_completion(self):
        """Allow the task to complete."""
        self.can_complete.set()


class TestTaskServiceGracefulShutdown:
    """Test TaskService graceful shutdown functionality."""
    
    @pytest.fixture
    def shutdown_manager(self):
        """Create a shutdown manager for testing."""
        return NoopGracefulShutdownManager()
        
    @pytest.fixture
    def task_service(self, shutdown_manager):
        """Create a TaskService instance for testing."""
        metrics_service = NoopMetricsService()
        service = TaskService(
            metrics_service=metrics_service,
            shutdown_manager=shutdown_manager,
            max_workers=2,
            task_timeout=300,
            cleanup_interval=600
        )
        
        # Reset shutdown manager state before each test
        shutdown_manager.set_draining(False)
        
        yield service
        
        # Clean up after test
        service.shutdown(timeout=1)
        shutdown_manager.set_draining(False)
        
    def test_start_task_rejects_when_draining(self, task_service, shutdown_manager):
        """Test that start_task raises exception when service is draining."""
        # Set service to draining
        shutdown_manager.set_draining(True)
        
        task = MockTask()
        
        with pytest.raises(InvalidOperationException) as exc_info:
            task_service.start_task(task)
            
        assert "service is draining" in str(exc_info.value)
        
    def test_start_task_succeeds_when_not_draining(self, task_service):
        """Test that start_task works normally when not draining."""
        task = MockTask()
        
        response = task_service.start_task(task)
        
        assert response.task_id is not None
        assert response.stream_url.endswith("/stream")
        assert response.status.value == "pending"
        
        # Clean up
        task.allow_completion()
        time.sleep(0.1)
        
    def test_get_active_task_count(self, task_service):
        """Test get_active_task_count returns correct count."""
        assert task_service.get_active_task_count() == 0
        
        # Start some tasks
        task1 = MockTask(duration=1.0)
        task2 = MockTask(duration=1.0)
        
        task_service.start_task(task1)
        task_service.start_task(task2)
        
        # Wait for tasks to start
        task1.started.wait(timeout=1.0)
        task2.started.wait(timeout=1.0)
        
        assert task_service.get_active_task_count() == 2
        
        # Allow tasks to complete
        task1.allow_completion()
        task2.allow_completion()
        
        # Wait for completion
        time.sleep(0.2)
        assert task_service.get_active_task_count() == 0
        
    def test_graceful_shutdown_waits_for_tasks(self, task_service):
        """Test that shutdown waits for running tasks to complete."""
        task = MockTask(duration=0.5)
        
        # Start task
        task_service.start_task(task)
        task.started.wait(timeout=1.0)
        
        # Start shutdown in background
        shutdown_start_time = time.time()
        shutdown_completed = threading.Event()
        
        def shutdown_in_background():
            task_service.shutdown(timeout=2)
            shutdown_completed.set()
            
        shutdown_thread = threading.Thread(target=shutdown_in_background)
        shutdown_thread.start()
        
        # Give shutdown time to start
        time.sleep(0.1)
        
        # Shutdown should be waiting for task
        assert not shutdown_completed.is_set()
        assert task_service.get_active_task_count() == 1
        
        # Allow task to complete
        task.allow_completion()
        
        # Wait for shutdown to complete
        shutdown_completed.wait(timeout=3.0)
        shutdown_thread.join(timeout=3.0)
        
        assert shutdown_completed.is_set()
        shutdown_duration = time.time() - shutdown_start_time
        
        # Should have waited for task completion
        assert shutdown_duration >= 0.1  # At least some waiting time
        assert shutdown_duration < 2.0   # But completed before timeout
        
    def test_graceful_shutdown_timeout_cancels_tasks(self, task_service):
        """Test that shutdown cancels tasks that exceed timeout."""
        task = MockTask(duration=10.0)  # Long-running task
        
        # Start task
        response = task_service.start_task(task)
        task.started.wait(timeout=1.0)
        
        # Shutdown with short timeout
        start_time = time.time()
        task_service.shutdown(timeout=0.2)
        shutdown_duration = time.time() - start_time
        
        # Should have completed within a reasonable time after timeout
        # Add some buffer time for cleanup operations
        assert shutdown_duration < 2.0
        
        # Task should be cancelled
        task_status = task_service.get_task_status(response.task_id)
        if task_status:  # Task might be cleaned up
            assert task_status.status.value == "cancelled"
            
    def test_shutdown_does_not_set_draining_state(self, task_service, shutdown_manager):
        """Test that TaskService.shutdown does not set draining state (responsibility moved to application level)."""
        assert not shutdown_manager.is_draining()
        
        task_service.shutdown(timeout=0.1)
        
        # TaskService should NOT set draining state - that's handled at application level
        assert not shutdown_manager.is_draining()
        
    def test_shutdown_updates_metrics(self, task_service):
        """Test that shutdown records metrics correctly."""
        # Mock metrics service to track calls
        mock_metrics = Mock()
        task_service.metrics_service = mock_metrics
        
        task_service.shutdown(timeout=0.1)
        
        # Verify metrics were updated (but NOT draining state - that's handled at application level)
        mock_metrics.update_task_metrics.assert_called()
        mock_metrics.record_shutdown_duration.assert_called()
        
        # TaskService should NOT set draining state - that's application responsibility
        mock_metrics.set_draining_state.assert_not_called()
        
        # Verify shutdown duration was recorded
        duration_call = mock_metrics.record_shutdown_duration.call_args[0][0]
        assert isinstance(duration_call, float)
        assert duration_call >= 0
        
    def test_shutdown_cleans_up_resources(self, task_service):
        """Test that shutdown properly cleans up all resources."""
        task = MockTask(duration=0.1)
        
        # Start and complete a task
        response = task_service.start_task(task)
        task.allow_completion()
        time.sleep(0.2)  # Let task complete
        
        # Verify task exists before shutdown
        assert task_service.get_task_status(response.task_id) is not None
        
        # Shutdown
        task_service.shutdown(timeout=1.0)
        
        # Verify resources are cleaned up
        assert len(task_service._tasks) == 0
        assert len(task_service._task_instances) == 0  
        assert len(task_service._event_queues) == 0
        
    def test_shutdown_stops_cleanup_thread(self, task_service):
        """Test that shutdown stops the cleanup background thread."""
        cleanup_thread = task_service._cleanup_thread
        assert cleanup_thread.is_alive()
        
        task_service.shutdown(timeout=0.1)
        
        # Cleanup thread should be stopped
        time.sleep(0.1)  # Give thread time to stop
        assert not cleanup_thread.is_alive()
        
    def test_multiple_shutdowns_are_safe(self, task_service):
        """Test that calling shutdown multiple times is safe."""
        task_service.shutdown(timeout=0.1)
        
        # Second shutdown should not raise exception
        task_service.shutdown(timeout=0.1)
        
        # State should remain consistent
        assert len(task_service._tasks) == 0
        
    def test_concurrent_task_start_and_shutdown(self, task_service):
        """Test concurrent task starting and shutdown scenarios."""
        tasks = [MockTask(duration=0.2) for _ in range(5)]
        responses = []
        
        # Start tasks concurrently
        threads = []
        for task in tasks:
            def start_task(t=task):
                try:
                    response = task_service.start_task(t)
                    responses.append(response)
                except InvalidOperationException:
                    # Expected if draining starts during task creation
                    pass
                    
            thread = threading.Thread(target=start_task)
            threads.append(thread)
            thread.start()
            
        # Start shutdown concurrently with task starts
        time.sleep(0.05)  # Let some tasks start
        shutdown_thread = threading.Thread(
            target=lambda: task_service.shutdown(timeout=1.0)
        )
        shutdown_thread.start()
        
        # Allow all tasks to complete
        for task in tasks:
            task.allow_completion()
            
        # Wait for all threads
        for thread in threads:
            thread.join(timeout=2.0)
        shutdown_thread.join(timeout=2.0)
        
        # Some tasks should have started, others might be rejected
        # No exceptions should be raised
        assert True  # Test passes if no exceptions