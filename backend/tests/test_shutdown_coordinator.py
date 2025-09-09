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

    @patch('sys.exit')
    def test_register_shutdown_notification(self, mock_exit):
        """Test registering shutdown notification callbacks."""
        coordinator = ShutdownCoordinator(graceful_shutdown_timeout=600)
        coordinator._shutting_down = False  # Reset state
        coordinator._shutdown_notifications = []  # Clear previous registrations

        callback1 = MagicMock()
        callback2 = MagicMock()

        coordinator.register_lifetime_notification(callback1)
        coordinator.register_lifetime_notification(callback2)

        # Trigger shutdown
        coordinator.handle_sigterm(signal.SIGTERM, None)

        # Both callbacks should be called
        callback1.assert_called_once()
        callback2.assert_called_once()
        # Should exit since no server shutdown registered
        mock_exit.assert_called_once_with(0)

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

    @patch('sys.exit')
    def test_is_shutting_down(self, mock_exit):
        """Test shutdown state checking."""
        coordinator = ShutdownCoordinator(graceful_shutdown_timeout=600)
        coordinator._shutting_down = False  # Reset state

        assert not coordinator.is_shutting_down()

        coordinator.handle_sigterm(signal.SIGTERM, None)

        assert coordinator.is_shutting_down()
        # Should exit since no server shutdown registered
        mock_exit.assert_called_once_with(0)

    @patch('sys.exit')
    def test_handle_sigterm_called_once(self, mock_exit):
        """Test that handle_sigterm only processes once."""
        coordinator = ShutdownCoordinator(graceful_shutdown_timeout=600)
        coordinator._shutting_down = False  # Reset state
        coordinator._shutdown_notifications = []  # Clear previous registrations

        callback = MagicMock()
        coordinator.register_lifetime_notification(callback)

        # Call handle_sigterm twice
        coordinator.handle_sigterm(signal.SIGTERM, None)
        coordinator.handle_sigterm(signal.SIGTERM, None)

        # Callback should only be called once
        callback.assert_called_once()
        # Should exit since no server shutdown registered
        mock_exit.assert_called_once_with(0)

    def test_handle_sigterm_with_waiters_all_ready(self):
        """Test handle_sigterm when all waiters are ready."""
        coordinator = ShutdownCoordinator(graceful_shutdown_timeout=600)
        coordinator._shutting_down = False  # Reset state
        coordinator._shutdown_waiters = {}  # Clear previous registrations

        waiter1 = MagicMock(return_value=True)
        waiter2 = MagicMock(return_value=True)
        server_shutdown = MagicMock()

        coordinator.register_shutdown_waiter("Service1", waiter1)
        coordinator.register_shutdown_waiter("Service2", waiter2)
        coordinator.register_server_shutdown(server_shutdown)

        # Trigger shutdown
        coordinator.handle_sigterm(signal.SIGTERM, None)

        # Waiters should be called
        waiter1.assert_called_once()
        waiter2.assert_called_once()
        # Server shutdown should be called
        server_shutdown.assert_called_once()

    @patch('sys.exit')
    def test_handle_sigterm_with_timeout(self, mock_exit):
        """Test handle_sigterm when timeout is exceeded."""
        coordinator = ShutdownCoordinator(graceful_shutdown_timeout=0.1)
        coordinator._shutting_down = False  # Reset state
        coordinator._shutdown_waiters = {}  # Clear previous registrations

        # Waiter that returns False (not ready)
        waiter = MagicMock(return_value=False)
        server_shutdown = MagicMock()
        
        coordinator.register_shutdown_waiter("SlowService", waiter)
        coordinator.register_server_shutdown(server_shutdown)

        # Trigger shutdown
        coordinator.handle_sigterm(signal.SIGTERM, None)

        # Server should still be shutdown even with timeout
        server_shutdown.assert_called_once()

    def test_register_server_shutdown(self):
        """Test registering server shutdown callback."""
        coordinator = ShutdownCoordinator(graceful_shutdown_timeout=600)
        coordinator._shutting_down = False  # Reset state
        
        server_shutdown = MagicMock()
        coordinator.register_server_shutdown(server_shutdown)

        # Trigger shutdown
        coordinator.handle_sigterm(signal.SIGTERM, None)

        # Server shutdown should be called
        server_shutdown.assert_called_once()

    @patch('sys.exit')  
    def test_notification_exception_handling(self, mock_exit):
        """Test that exceptions in notifications don't break shutdown."""
        coordinator = ShutdownCoordinator(graceful_shutdown_timeout=600)
        coordinator._shutting_down = False  # Reset state
        coordinator._shutdown_notifications = []  # Clear previous registrations

        # Callback that raises exception
        bad_callback = MagicMock(side_effect=Exception("Test error"))
        good_callback = MagicMock()

        coordinator.register_lifetime_notification(bad_callback)
        coordinator.register_lifetime_notification(good_callback)

        # Should not raise exception
        coordinator.handle_sigterm(signal.SIGTERM, None)

        # Good callback should still be called
        good_callback.assert_called_once()
        # Should exit since no server shutdown registered
        mock_exit.assert_called_once_with(0)

    def test_waiter_exception_handling(self):
        """Test that exceptions in waiters are handled."""
        coordinator = ShutdownCoordinator(graceful_shutdown_timeout=600)
        coordinator._shutting_down = False  # Reset state
        coordinator._shutdown_waiters = {}  # Clear previous registrations

        # Waiter that raises exception
        bad_waiter = MagicMock(side_effect=Exception("Test error"))
        good_waiter = MagicMock(return_value=True)
        server_shutdown = MagicMock()

        coordinator.register_shutdown_waiter("BadService", bad_waiter)
        coordinator.register_shutdown_waiter("GoodService", good_waiter)
        coordinator.register_server_shutdown(server_shutdown)

        # Trigger shutdown
        coordinator.handle_sigterm(signal.SIGTERM, None)

        # Server should still be shutdown even with exception
        server_shutdown.assert_called_once()


class TestNoopShutdownCoordinator:
    """Test no-op shutdown coordinator for testing."""

    def test_noop_register_notification(self):
        """Test that no-op coordinator accepts notifications."""
        coordinator = NoopShutdownCoordinator()
        callback = MagicMock()

        # Should not raise exception
        coordinator.register_lifetime_notification(callback)

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

    def test_noop_register_server_shutdown(self):
        """Test no-op coordinator accepts server shutdown callback."""
        coordinator = NoopShutdownCoordinator()
        server_shutdown = MagicMock()

        # Should not raise exception
        coordinator.register_server_shutdown(server_shutdown)
        
        # Server shutdown should not be called in noop
        coordinator.handle_sigterm(signal.SIGTERM, None)
        server_shutdown.assert_not_called()


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
        coordinator.register_lifetime_notification(notify1)
        coordinator.register_lifetime_notification(notify2)
        coordinator.register_shutdown_waiter("Service1", waiter1)
        coordinator.register_shutdown_waiter("Service2", waiter2)

        # Register server shutdown
        server_shutdown = MagicMock()
        coordinator.register_server_shutdown(server_shutdown)

        # Initiate shutdown
        coordinator.handle_sigterm(signal.SIGTERM, None)

        # All callbacks should have been called
        assert "notify1" in call_order
        assert "notify2" in call_order
        assert "waiter1" in call_order
        assert "waiter2" in call_order
        
        # Server shutdown should be called
        server_shutdown.assert_called_once()

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

        coordinator.register_lifetime_notification(service_notification)
        coordinator.register_shutdown_waiter("BusyService", service_waiter)

        # Register server shutdown
        server_shutdown_called = threading.Event()
        def server_shutdown():
            server_shutdown_called.set()
        
        coordinator.register_server_shutdown(server_shutdown)

        # Start shutdown in background thread
        def shutdown_thread():
            coordinator.handle_sigterm(signal.SIGTERM, None)

        thread = threading.Thread(target=shutdown_thread)
        thread.start()

        # Simulate work completing after a delay
        time.sleep(0.5)
        work_complete.set()

        # Wait for shutdown to complete
        thread.join(timeout=3)

        # Server shutdown should have been called
        assert server_shutdown_called.wait(timeout=1)
