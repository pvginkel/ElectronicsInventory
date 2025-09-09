"""Tests for graceful shutdown coordinator."""

import signal
import threading
import time
from unittest.mock import MagicMock, patch

from app.utils.shutdown_coordinator import (
    NoopShutdownCoordinator,
    ShutdownCoordinator,
)


class TestShutdownCoordinator:
    """Test shutdown coordinator functionality."""

    def test_register_shutdown_notification(self):
        """Test registering shutdown notification callbacks."""
        coordinator = ShutdownCoordinator(graceful_shutdown_timeout=600)
        coordinator._shutting_down = False  # Reset state
        coordinator._shutdown_notifications = []  # Clear previous registrations

        callback1 = MagicMock()
        callback2 = MagicMock()

        coordinator.register_shutdown_notification(callback1)
        coordinator.register_shutdown_notification(callback2)

        # Trigger shutdown
        coordinator.handle_sigterm(signal.SIGTERM, None)

        # Both callbacks should be called
        callback1.assert_called_once()
        callback2.assert_called_once()

    def test_register_shutdown_waiter(self):
        """Test registering shutdown waiter handlers."""
        coordinator = ShutdownCoordinator(graceful_shutdown_timeout=600)
        coordinator._shutdown_waiters = {}  # Clear previous registrations

        waiter1 = MagicMock(return_value=True)
        waiter2 = MagicMock(return_value=True)

        coordinator.register_shutdown_waiter("Service1", waiter1)
        coordinator.register_shutdown_waiter("Service2", waiter2)

        assert "Service1" in coordinator._shutdown_waiters
        assert "Service2" in coordinator._shutdown_waiters

    def test_is_shutting_down(self):
        """Test shutdown state checking."""
        coordinator = ShutdownCoordinator(graceful_shutdown_timeout=600)
        coordinator._shutting_down = False  # Reset state

        assert not coordinator.is_shutting_down()

        coordinator.handle_sigterm(signal.SIGTERM, None)

        assert coordinator.is_shutting_down()

    def test_handle_sigterm_called_once(self):
        """Test that handle_sigterm only processes once."""
        coordinator = ShutdownCoordinator(graceful_shutdown_timeout=600)
        coordinator._shutting_down = False  # Reset state
        coordinator._shutdown_notifications = []  # Clear previous registrations

        callback = MagicMock()
        coordinator.register_shutdown_notification(callback)

        # Call handle_sigterm twice
        coordinator.handle_sigterm(signal.SIGTERM, None)
        coordinator.handle_sigterm(signal.SIGTERM, None)

        # Callback should only be called once
        callback.assert_called_once()

    def test_wait_for_shutdown_all_ready(self):
        """Test wait_for_shutdown when all services are ready."""
        coordinator = ShutdownCoordinator(graceful_shutdown_timeout=600)
        coordinator._shutting_down = True
        coordinator._shutdown_waiters = {}  # Clear previous registrations

        waiter1 = MagicMock(return_value=True)
        waiter2 = MagicMock(return_value=True)

        coordinator.register_shutdown_waiter("Service1", waiter1)
        coordinator.register_shutdown_waiter("Service2", waiter2)

        result = coordinator.wait_for_shutdown(timeout=10)

        assert result is True
        waiter1.assert_called_once()
        waiter2.assert_called_once()

    @patch('os._exit')
    def test_wait_for_shutdown_timeout(self, mock_exit):
        """Test wait_for_shutdown when timeout is exceeded."""
        coordinator = ShutdownCoordinator(graceful_shutdown_timeout=600)
        coordinator._shutting_down = True
        coordinator._shutdown_waiters = {}  # Clear previous registrations

        # Waiter that returns False (not ready)
        waiter = MagicMock(return_value=False)
        coordinator.register_shutdown_waiter("SlowService", waiter)

        coordinator.wait_for_shutdown(timeout=0.1)

        # Should force exit
        mock_exit.assert_called_once_with(1)

    def test_wait_for_shutdown_not_initiated(self):
        """Test wait_for_shutdown when shutdown not initiated."""
        coordinator = ShutdownCoordinator(graceful_shutdown_timeout=600)
        coordinator._shutting_down = False  # Not shutting down

        result = coordinator.wait_for_shutdown(timeout=1)

        assert result is True  # Should return immediately

    def test_notification_exception_handling(self):
        """Test that exceptions in notifications don't break shutdown."""
        coordinator = ShutdownCoordinator(graceful_shutdown_timeout=600)
        coordinator._shutting_down = False  # Reset state
        coordinator._shutdown_notifications = []  # Clear previous registrations

        # Callback that raises exception
        bad_callback = MagicMock(side_effect=Exception("Test error"))
        good_callback = MagicMock()

        coordinator.register_shutdown_notification(bad_callback)
        coordinator.register_shutdown_notification(good_callback)

        # Should not raise exception
        coordinator.handle_sigterm(signal.SIGTERM, None)

        # Good callback should still be called
        good_callback.assert_called_once()

    def test_waiter_exception_handling(self):
        """Test that exceptions in waiters are handled."""
        coordinator = ShutdownCoordinator(graceful_shutdown_timeout=600)
        coordinator._shutting_down = True
        coordinator._shutdown_waiters = {}  # Clear previous registrations

        # Waiter that raises exception
        bad_waiter = MagicMock(side_effect=Exception("Test error"))
        good_waiter = MagicMock(return_value=True)

        coordinator.register_shutdown_waiter("BadService", bad_waiter)
        coordinator.register_shutdown_waiter("GoodService", good_waiter)

        with patch('os._exit') as mock_exit:
            coordinator.wait_for_shutdown(timeout=1)

            # Should force exit due to exception
            mock_exit.assert_called_once_with(1)


class TestNoopShutdownCoordinator:
    """Test no-op shutdown coordinator for testing."""

    def test_noop_register_notification(self):
        """Test that no-op coordinator accepts notifications."""
        coordinator = NoopShutdownCoordinator()
        callback = MagicMock()

        # Should not raise exception
        coordinator.register_shutdown_notification(callback)

    def test_noop_register_waiter(self):
        """Test that no-op coordinator accepts waiters."""
        coordinator = NoopShutdownCoordinator()
        waiter = MagicMock()

        # Should not raise exception
        coordinator.register_shutdown_waiter("Service", waiter)

    def test_noop_is_shutting_down(self):
        """Test no-op coordinator shutdown state."""
        coordinator = NoopShutdownCoordinator()

        assert not coordinator.is_shutting_down()

        coordinator.handle_sigterm(signal.SIGTERM, None)

        assert coordinator.is_shutting_down()

    def test_noop_wait_for_shutdown(self):
        """Test no-op coordinator wait returns immediately."""
        coordinator = NoopShutdownCoordinator()

        start_time = time.perf_counter()
        result = coordinator.wait_for_shutdown(timeout=10)
        duration = time.perf_counter() - start_time

        assert result is True
        assert duration < 0.1  # Should return immediately


class TestShutdownIntegration:
    """Test shutdown coordination with multiple services."""

    def test_coordinated_shutdown(self):
        """Test coordinated shutdown with multiple services."""
        coordinator = ShutdownCoordinator(graceful_shutdown_timeout=600)
        coordinator._shutting_down = False  # Reset state
        coordinator._shutdown_notifications = []  # Clear previous registrations
        coordinator._shutdown_waiters = {}  # Clear previous registrations

        # Track callback order
        call_order = []

        # Notification callbacks
        def notify1():
            call_order.append("notify1")

        def notify2():
            call_order.append("notify2")

        # Waiter handlers
        def waiter1(timeout):
            call_order.append("waiter1")
            return True

        def waiter2(timeout):
            call_order.append("waiter2")
            return True

        # Register callbacks
        coordinator.register_shutdown_notification(notify1)
        coordinator.register_shutdown_notification(notify2)
        coordinator.register_shutdown_waiter("Service1", waiter1)
        coordinator.register_shutdown_waiter("Service2", waiter2)

        # Initiate shutdown
        coordinator.handle_sigterm(signal.SIGTERM, None)

        # Notifications should be called immediately
        assert "notify1" in call_order
        assert "notify2" in call_order

        # Wait for shutdown
        result = coordinator.wait_for_shutdown(timeout=1)

        assert result is True

        # Waiters should be called after notifications
        assert "waiter1" in call_order
        assert "waiter2" in call_order

        # Notifications should come before waiters
        notify_indices = [i for i, x in enumerate(call_order) if x.startswith("notify")]
        waiter_indices = [i for i, x in enumerate(call_order) if x.startswith("waiter")]

        assert max(notify_indices) < min(waiter_indices)

    def test_concurrent_shutdown_handling(self):
        """Test shutdown with concurrent service operations."""
        coordinator = ShutdownCoordinator(graceful_shutdown_timeout=600)
        coordinator._shutting_down = False  # Reset state
        coordinator._shutdown_notifications = []  # Clear previous registrations
        coordinator._shutdown_waiters = {}  # Clear previous registrations

        # Simulate a service with active work
        work_complete = threading.Event()

        def service_notification():
            # Stop accepting new work
            pass

        def service_waiter(timeout):
            # Wait for work to complete
            return work_complete.wait(timeout=timeout)

        coordinator.register_shutdown_notification(service_notification)
        coordinator.register_shutdown_waiter("BusyService", service_waiter)

        # Start shutdown in background thread
        def shutdown_thread():
            coordinator.handle_sigterm(signal.SIGTERM, None)
            return coordinator.wait_for_shutdown(timeout=2)

        shutdown_result = []
        thread = threading.Thread(target=lambda: shutdown_result.append(shutdown_thread()))
        thread.start()

        # Simulate work completing after a delay
        time.sleep(0.5)
        work_complete.set()

        # Wait for shutdown to complete
        thread.join(timeout=3)

        assert shutdown_result[0] is True
