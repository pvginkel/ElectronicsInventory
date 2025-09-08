"""Tests for graceful shutdown functionality."""

import signal
import threading
import time
from unittest.mock import Mock, patch

import pytest

from app.utils.graceful_shutdown import GracefulShutdownManager


class TestGracefulShutdownManager:
    """Test graceful shutdown manager functionality."""

    def test_singleton_behavior(self):
        """Test that GracefulShutdownManager is a singleton."""
        manager1 = GracefulShutdownManager()
        manager2 = GracefulShutdownManager()
        
        assert manager1 is manager2
        
    def test_initial_state(self):
        """Test initial draining state is False."""
        manager = GracefulShutdownManager()
        assert not manager.is_draining()
        
    def test_set_draining_state(self):
        """Test setting draining state."""
        manager = GracefulShutdownManager()
        
        # Set to draining
        manager.set_draining(True)
        assert manager.is_draining()
        
        # Set back to normal
        manager.set_draining(False)
        assert not manager.is_draining()
        
    def test_handle_sigterm(self):
        """Test SIGTERM signal handler sets draining state."""
        manager = GracefulShutdownManager()
        manager.set_draining(False)  # Ensure clean state
        
        # Simulate SIGTERM signal
        manager.handle_sigterm(signal.SIGTERM, None)
        
        assert manager.is_draining()
        
    def test_wait_for_shutdown_with_timeout(self):
        """Test wait_for_shutdown with timeout."""
        manager = GracefulShutdownManager()
        manager.set_draining(False)  # Ensure clean state
        
        # Test timeout (should return False)
        start_time = time.time()
        result = manager.wait_for_shutdown(timeout=0.1)
        elapsed = time.time() - start_time
        
        assert not result  # Timeout occurred
        assert elapsed >= 0.1
        
    def test_wait_for_shutdown_signal_received(self):
        """Test wait_for_shutdown when signal is received."""
        manager = GracefulShutdownManager()
        manager.set_draining(False)  # Ensure clean state
        
        # Set draining in a background thread after a short delay
        def set_draining_later():
            time.sleep(0.1)
            manager.set_draining(True)
            
        thread = threading.Thread(target=set_draining_later)
        thread.start()
        
        # Wait for shutdown - should return True when draining is set
        start_time = time.time()
        result = manager.wait_for_shutdown(timeout=1.0)
        elapsed = time.time() - start_time
        
        thread.join()
        
        assert result  # Signal was received
        assert elapsed < 1.0  # Completed before timeout
        assert elapsed >= 0.1  # Waited at least until signal
        
    def test_wait_for_shutdown_no_timeout(self):
        """Test wait_for_shutdown without timeout in background thread."""
        manager = GracefulShutdownManager()
        manager.set_draining(False)  # Ensure clean state
        
        # Track when wait_for_shutdown completes
        wait_completed = threading.Event()
        wait_result = [None]
        
        def wait_in_background():
            wait_result[0] = manager.wait_for_shutdown()  # No timeout
            wait_completed.set()
            
        thread = threading.Thread(target=wait_in_background)
        thread.start()
        
        # Give thread time to start waiting
        time.sleep(0.1)
        assert not wait_completed.is_set()
        
        # Set draining state
        manager.set_draining(True)
        
        # Wait for background thread to complete
        wait_completed.wait(timeout=1.0)
        thread.join(timeout=1.0)
        
        assert wait_completed.is_set()
        assert wait_result[0] is True
        
    def test_concurrent_access(self):
        """Test concurrent access to draining state."""
        manager = GracefulShutdownManager()
        manager.set_draining(False)  # Ensure clean state
        
        results = []
        
        def toggle_draining():
            for i in range(100):
                manager.set_draining(i % 2 == 0)
                results.append(manager.is_draining())
                
        # Run multiple threads concurrently
        threads = []
        for _ in range(5):
            thread = threading.Thread(target=toggle_draining)
            threads.append(thread)
            thread.start()
            
        for thread in threads:
            thread.join()
            
        # All operations should have completed without errors
        assert len(results) == 500  # 5 threads * 100 operations each
        
    def test_signal_handler_thread_safety(self):
        """Test signal handler works with concurrent access."""
        manager = GracefulShutdownManager()
        manager.set_draining(False)  # Ensure clean state
        
        # Start background thread that toggles draining state
        stop_toggle = threading.Event()
        
        def toggle_continuously():
            while not stop_toggle.is_set():
                manager.set_draining(not manager.is_draining())
                time.sleep(0.001)
                
        toggle_thread = threading.Thread(target=toggle_continuously)
        toggle_thread.start()
        
        # Call signal handler multiple times
        for _ in range(10):
            manager.handle_sigterm(signal.SIGTERM, None)
            time.sleep(0.01)
            
        # Stop the toggle thread and wait for it to complete
        stop_toggle.set()
        toggle_thread.join()
        
        # Call signal handler one more time after toggle thread stops
        manager.handle_sigterm(signal.SIGTERM, None)
        
        # After signal handler, state should be draining
        assert manager.is_draining()