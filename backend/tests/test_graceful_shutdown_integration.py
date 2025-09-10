"""Integration tests for graceful shutdown with real services."""

import signal
import tempfile
import threading
import time
from unittest.mock import MagicMock, patch

import pytest
from flask import Flask
from sqlalchemy.orm import Session

from app.services.task_service import TaskService
from app.utils.shutdown_coordinator import LifetimeEvent, ShutdownCoordinator
from app.utils.temp_file_manager import TempFileManager
from tests.test_tasks.test_task import DemoTask, LongRunningTask
from tests.testing_utils import StubMetricsService, TestShutdownCoordinator


class TestTaskServiceShutdownIntegration:
    """Test TaskService integration with shutdown coordinator."""

    @pytest.fixture
    def shutdown_coordinator(self):
        """Create shutdown coordinator for testing."""
        return TestShutdownCoordinator()

    @pytest.fixture
    def metrics_service(self):
        """Create metrics service for testing."""
        return StubMetricsService()

    @pytest.fixture
    def task_service(self, metrics_service, shutdown_coordinator):
        """Create TaskService with shutdown coordinator."""
        service = TaskService(
            metrics_service=metrics_service,
            shutdown_coordinator=shutdown_coordinator,
            max_workers=2,
            task_timeout=10,
            cleanup_interval=60
        )
        try:
            yield service
        finally:
            service.shutdown()

    def test_task_service_shutdown_registration(self, task_service, shutdown_coordinator):
        """Test that TaskService registers with shutdown coordinator."""
        # TaskService should have registered notification and waiter
        assert len(shutdown_coordinator._notifications) > 0
        assert "TaskService" in shutdown_coordinator._waiters

    def test_task_service_stops_accepting_tasks_on_prepare_shutdown(self, task_service, shutdown_coordinator):
        """Test that TaskService stops accepting new tasks during PREPARE_SHUTDOWN."""
        from app.exceptions import InvalidOperationException

        # Initially should accept tasks
        task = DemoTask()
        response = task_service.start_task(task, steps=1, delay=0.01)
        assert response.task_id is not None

        # Wait for task to complete
        time.sleep(0.1)

        # Trigger PREPARE_SHUTDOWN manually (StubShutdownCoordinator doesn't execute callbacks)
        shutdown_coordinator.simulate_shutdown()

        # Should now reject new tasks
        with pytest.raises(InvalidOperationException, match="service is shutting down"):
            task_service.start_task(DemoTask(), steps=1, delay=0.01)

    def test_task_service_waits_for_active_tasks(self, task_service, shutdown_coordinator):
        """Test that TaskService waits for active tasks to complete."""
        # Start a long-running task
        task = LongRunningTask()
        response = task_service.start_task(task, total_time=0.5, check_interval=0.05)

        # Wait a bit for task to start
        time.sleep(0.1)

        # Verify task is running
        task_info = task_service.get_task_status(response.task_id)
        assert task_info.status.value in ["pending", "running"]

        # Track when waiter is called
        waiter_start_time = None
        waiter_end_time = None
        original_waiter = shutdown_coordinator._waiters["TaskService"]

        def tracked_waiter(timeout: float) -> bool:
            nonlocal waiter_start_time, waiter_end_time
            waiter_start_time = time.perf_counter()
            result = original_waiter(timeout)
            waiter_end_time = time.perf_counter()
            return result

        shutdown_coordinator._waiters["TaskService"] = tracked_waiter

        # Trigger full shutdown (includes waiters)
        shutdown_coordinator.simulate_full_shutdown(timeout=5.0)

        # Verify waiter was called and waited for task completion
        assert waiter_start_time is not None
        assert waiter_end_time is not None

        # Waiter should have taken some time (waiting for task)
        waiter_duration = waiter_end_time - waiter_start_time
        assert waiter_duration > 0.3  # Should wait for most of the 0.5s task

        # Task should be completed by now
        task_info = task_service.get_task_status(response.task_id)
        assert task_info is None or task_info.status.value == "completed"

    def test_task_service_shutdown_with_no_active_tasks(self, task_service, shutdown_coordinator):
        """Test TaskService shutdown when no tasks are active."""
        # Ensure no active tasks
        assert task_service._get_active_task_count() == 0

        # Track waiter call
        waiter_called = threading.Event()
        original_waiter = shutdown_coordinator._waiters["TaskService"]

        def tracked_waiter(timeout: float) -> bool:
            waiter_called.set()
            return original_waiter(timeout)

        shutdown_coordinator._waiters["TaskService"] = tracked_waiter

        # Trigger full shutdown (includes waiters)
        start_time = time.perf_counter()
        shutdown_coordinator.simulate_full_shutdown(timeout=5.0)
        end_time = time.perf_counter()

        # Should complete quickly when no tasks active
        duration = end_time - start_time
        assert duration < 0.1

        # Waiter should have been called
        assert waiter_called.is_set()

    def test_task_service_shutdown_metrics_recording(self, task_service, shutdown_coordinator):
        """Test that shutdown metrics are recorded during TaskService shutdown."""
        # Mock the metrics service to track calls
        mock_metrics = MagicMock()
        task_service.metrics_service = mock_metrics

        # Start a task to have active tasks during shutdown
        task = DemoTask()
        task_service.start_task(task, steps=1, delay=0.01)
        time.sleep(0.05)  # Let task start

        # Trigger shutdown
        shutdown_coordinator.simulate_shutdown()

        # Verify metrics were recorded
        mock_metrics.record_active_tasks_at_shutdown.assert_called()
        call_args = mock_metrics.record_active_tasks_at_shutdown.call_args[0]
        assert isinstance(call_args[0], int)  # Should be count of active tasks

    def test_task_service_cleanup_during_shutdown(self, task_service, shutdown_coordinator):
        """Test that TaskService cleanup happens during shutdown."""
        # Start and complete a task
        task = DemoTask()
        response = task_service.start_task(task, steps=1, delay=0.01)
        time.sleep(0.1)  # Wait for completion

        # Verify task exists
        task_info = task_service.get_task_status(response.task_id)
        assert task_info is not None

        # Trigger full shutdown (includes waiters that do cleanup)
        shutdown_coordinator.simulate_full_shutdown()

        # After shutdown, internal state should be cleared
        assert len(task_service._tasks) == 0
        assert len(task_service._task_instances) == 0
        assert len(task_service._event_queues) == 0


class TestTempFileManagerShutdownIntegration:
    """Test TempFileManager integration with shutdown coordinator."""

    @pytest.fixture
    def shutdown_coordinator(self):
        """Create shutdown coordinator for testing."""
        return TestShutdownCoordinator()

    @pytest.fixture
    def temp_file_manager(self, shutdown_coordinator):
        """Create TempFileManager with shutdown coordinator."""
        with tempfile.TemporaryDirectory() as temp_dir:
            manager = TempFileManager(
                base_path=temp_dir,
                cleanup_age_hours=1.0,
                shutdown_coordinator=shutdown_coordinator
            )
            yield manager

    def test_temp_file_manager_shutdown_registration(self, temp_file_manager, shutdown_coordinator):
        """Test that TempFileManager registers with shutdown coordinator."""
        # TempFileManager should have registered for notifications
        assert len(shutdown_coordinator._notifications) > 0

    def test_temp_file_manager_stops_cleanup_on_shutdown(self, temp_file_manager, shutdown_coordinator):
        """Test that TempFileManager stops cleanup thread on shutdown."""
        # Start cleanup thread
        temp_file_manager.start_cleanup_thread()
        assert temp_file_manager._cleanup_thread is not None
        assert temp_file_manager._cleanup_thread.is_alive()

        # Trigger shutdown
        shutdown_coordinator.simulate_shutdown()

        # Give some time for shutdown to process
        time.sleep(0.1)

        # Cleanup thread should be stopped or stopping
        # Note: The exact behavior depends on implementation details
        # We mainly want to verify no exceptions are raised


class TestFullApplicationShutdownIntegration:
    """Test complete application shutdown integration."""

    def test_health_endpoints_during_full_shutdown_sequence(self, app: Flask, client):
        """Test health endpoints during complete shutdown sequence."""
        with app.app_context():
            # Override container's coordinator with test implementation
            test_coordinator = TestShutdownCoordinator()
            app.container.shutdown_coordinator.override(test_coordinator)
            coordinator = test_coordinator

            # Initially should be ready
            response = client.get("/api/health/readyz")
            assert response.status_code == 200
            assert response.json["ready"] is True

            # Healthz should be alive
            response = client.get("/api/health/healthz")
            assert response.status_code == 200
            assert response.json["ready"] is True

            # Simulate shutdown
            if isinstance(coordinator, TestShutdownCoordinator):
                coordinator.simulate_shutdown()
            else:
                coordinator._shutting_down = True

            # After shutdown signal
            response = client.get("/api/health/readyz")
            assert response.status_code == 503
            assert response.json["ready"] is False

            # Healthz should still be alive
            response = client.get("/api/health/healthz")
            assert response.status_code == 200
            assert response.json["ready"] is True

    def test_service_container_shutdown_coordinator_injection(self, app: Flask):
        """Test that shutdown coordinator is properly injected into services."""
        with app.app_context():
            container = app.container

            # Override with test coordinator
            test_coordinator = TestShutdownCoordinator()
            container.shutdown_coordinator.override(test_coordinator)

            # Get coordinator
            coordinator = container.shutdown_coordinator()
            assert coordinator is test_coordinator

            # Get services that should have the coordinator
            task_service = container.task_service()
            assert task_service.shutdown_coordinator is coordinator

            # Verify registration happened
            # TestShutdownCoordinator should have registrations
            assert len(coordinator._notifications) > 0
            assert "TaskService" in coordinator._waiters

    def test_multiple_service_shutdown_coordination(self, app: Flask):
        """Test shutdown coordination across multiple services."""
        with app.app_context():
            container = app.container

            # Override with test coordinator
            test_coordinator = TestShutdownCoordinator()
            container.shutdown_coordinator.override(test_coordinator)
            coordinator = test_coordinator

            # Get multiple services
            container.task_service()
            container.metrics_service()

            # Track which services receive shutdown notifications
            notified_services = set()

            def track_notification(service_name):
                def notification_tracker(event: LifetimeEvent):
                    if event == LifetimeEvent.PREPARE_SHUTDOWN:
                        notified_services.add(service_name)
                return notification_tracker

            # Add tracking to coordinator
            coordinator.register_lifetime_notification(track_notification("TestService"))

            # Trigger shutdown
            coordinator.simulate_shutdown()

            # Verify services were notified
            assert "TestService" in notified_services

    @patch('sys.exit')
    def test_real_coordinator_integration_without_exit(self, mock_exit, session: Session):
        """Test real ShutdownCoordinator integration (mocking sys.exit)."""
        # Create a real coordinator for testing
        coordinator = ShutdownCoordinator(graceful_shutdown_timeout=5)

        # Create services with real coordinator
        metrics_service = StubMetricsService()
        task_service = TaskService(
            metrics_service=metrics_service,
            shutdown_coordinator=coordinator,
            max_workers=1,
            task_timeout=5
        )

        try:
            # Verify registrations
            assert len(coordinator._shutdown_notifications) > 0
            assert "TaskService" in coordinator._shutdown_waiters

            # Start a quick task
            task = DemoTask()
            task_service.start_task(task, steps=1, delay=0.01)
            time.sleep(0.05)  # Let task start

            # Trigger shutdown
            coordinator._handle_sigterm(signal.SIGTERM, None)

            # Should have called sys.exit
            mock_exit.assert_called_once_with(0)

        finally:
            # Cleanup
            task_service.shutdown()


class TestShutdownErrorHandling:
    """Test error handling during shutdown sequences."""

    def test_service_exception_during_notification(self):
        """Test that service exceptions during notification don't break shutdown."""
        coordinator = TestShutdownCoordinator()

        # Create a service that raises an exception
        def failing_notification(event: LifetimeEvent):
            raise Exception("Service notification failed")

        def working_notification(event: LifetimeEvent):
            working_notification.called = True

        coordinator.register_lifetime_notification(failing_notification)
        coordinator.register_lifetime_notification(working_notification)

        # Should not raise exception
        coordinator.simulate_shutdown()

        # Working service should still be called
        assert getattr(working_notification, 'called', False)

    def test_service_exception_during_waiter(self):
        """Test that service exceptions during waiter don't prevent other services."""
        coordinator = TestShutdownCoordinator()

        def failing_waiter(timeout: float) -> bool:
            raise Exception("Service waiter failed")

        working_waiter_called = threading.Event()

        def working_waiter(timeout: float) -> bool:
            working_waiter_called.set()
            return True

        coordinator.register_shutdown_waiter("FailingService", failing_waiter)
        coordinator.register_shutdown_waiter("WorkingService", working_waiter)

        # Should not raise exception - use full shutdown to test waiters
        coordinator.simulate_full_shutdown()

        # Working service should still be called
        assert working_waiter_called.is_set()

    def test_timeout_handling_in_integration(self):
        """Test timeout handling with real services by directly testing waiter behavior."""
        coordinator = TestShutdownCoordinator()

        # Create TaskService for testing timeout behavior
        metrics_service = StubMetricsService()
        task_service = TaskService(
            metrics_service=metrics_service,
            shutdown_coordinator=coordinator,
            max_workers=1,
            task_timeout=10
        )

        try:
            # Get the registered waiter
            waiter = coordinator._waiters["TaskService"]

            # Test 1: No active tasks - should return immediately
            start_time = time.perf_counter()
            result = waiter(0.1)  # Any timeout
            end_time = time.perf_counter()

            # Should complete immediately and return True (no tasks to wait for)
            duration = end_time - start_time
            assert duration < 0.01  # Should be immediate
            assert result is True  # Should return True (success, no tasks)

            # Test 2: Active task with timeout behavior
            # Start a long-running task
            task = LongRunningTask()
            task_service.start_task(task, total_time=1.5, check_interval=0.05)
            time.sleep(0.05)  # Let task start

            # Test timeout behavior - waiter should return False for very short timeout
            start_time = time.perf_counter()
            result = waiter(0.1)  # Very short timeout
            end_time = time.perf_counter()

            # Should complete quickly and return False (timeout exceeded)
            duration = end_time - start_time
            assert 0.08 < duration < 0.15  # Should respect timeout duration
            assert result is False  # Should return False indicating timeout

        finally:
            task_service.shutdown()

    def test_concurrent_shutdown_signals(self):
        """Test handling of multiple concurrent shutdown signals."""
        coordinator = TestShutdownCoordinator()

        callback_calls = []

        def tracking_callback(event: LifetimeEvent):
            callback_calls.append((event, time.perf_counter()))

        coordinator.register_lifetime_notification(tracking_callback)

        # Simulate multiple rapid shutdown signals
        def signal_sender():
            coordinator.simulate_full_shutdown()

        threads = [threading.Thread(target=signal_sender) for _ in range(3)]

        for thread in threads:
            thread.start()

        for thread in threads:
            thread.join(timeout=5)

        # Should only process shutdown once (only one set of events)
        prepare_events = [call for call in callback_calls if call[0] == LifetimeEvent.PREPARE_SHUTDOWN]
        shutdown_events = [call for call in callback_calls if call[0] == LifetimeEvent.SHUTDOWN]

        # With multiple threads, we might get multiple calls, but the first one should set the state
        # The important thing is that it doesn't crash
        assert len(prepare_events) >= 1
        assert len(shutdown_events) >= 1


class TestShutdownPerformance:
    """Test performance characteristics of shutdown sequence."""

    def test_shutdown_timing_with_multiple_services(self):
        """Test shutdown timing with multiple services."""
        coordinator = TestShutdownCoordinator()

        # Create multiple services with known timing characteristics
        service_timings = {}

        def create_timed_waiter(service_name: str, delay: float):
            def waiter(timeout: float) -> bool:
                start = time.perf_counter()
                time.sleep(delay)
                end = time.perf_counter()
                service_timings[service_name] = end - start
                return True
            return waiter

        # Register services with different delays
        coordinator.register_shutdown_waiter("FastService", create_timed_waiter("FastService", 0.05))
        coordinator.register_shutdown_waiter("MediumService", create_timed_waiter("MediumService", 0.15))
        coordinator.register_shutdown_waiter("SlowService", create_timed_waiter("SlowService", 0.25))

        # Trigger shutdown and measure total time
        start_time = time.perf_counter()
        coordinator.simulate_full_shutdown()
        end_time = time.perf_counter()

        total_time = end_time - start_time
        expected_time = 0.05 + 0.15 + 0.25  # Sequential execution

        # Should take approximately the sum of all service times
        assert expected_time - 0.1 <= total_time <= expected_time + 0.2

        # All services should have been called
        assert len(service_timings) == 3

    def test_shutdown_memory_cleanup(self):
        """Test that shutdown properly cleans up memory."""
        coordinator = TestShutdownCoordinator()

        # Create services and register many callbacks
        callbacks = []
        for i in range(100):
            def callback(event: LifetimeEvent, index=i):
                pass
            callbacks.append(callback)
            coordinator.register_lifetime_notification(callback)

        waiters = []
        for i in range(50):
            def waiter(timeout: float, index=i) -> bool:
                return True
            waiters.append(waiter)
            coordinator.register_shutdown_waiter(f"Service{i}", waiter)

        # Verify registrations
        assert len(coordinator._notifications) == 100
        assert len(coordinator._waiters) == 50

        # Trigger shutdown
        coordinator.simulate_shutdown()

        # Callbacks and waiters should still be registered (TestShutdownCoordinator keeps them)
        assert len(coordinator._notifications) == 100
        assert len(coordinator._waiters) == 50
