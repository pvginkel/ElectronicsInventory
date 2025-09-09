"""Graceful shutdown coordinator for managing service shutdowns in Kubernetes."""

from enum import Enum
import logging
import os
import sys
import threading
import time
from abc import ABC, abstractmethod
from collections.abc import Callable

logger = logging.getLogger(__name__)


class LifetimeEvent(str, Enum):
    PREPARE_SHUTDOWN = "prepare-shutdown"
    SHUTDOWN = "shutdown"


class ShutdownCoordinatorProtocol(ABC):
    """Protocol for shutdown coordinator implementations."""

    @abstractmethod
    def register_lifetime_notification(self, callback: Callable[[LifetimeEvent], None]) -> None:
        """Register a callback to be notified immediately when shutdown starts.

        Args:
            callback: Function to call when shutdown is initiated
        """
        pass

    @abstractmethod
    def register_shutdown_waiter(self, name: str, handler: Callable[[float], bool]) -> None:
        """Register a handler that blocks until ready for shutdown.

        Args:
            name: Name of the service/component registering the waiter
            handler: Function that takes remaining timeout and returns True if ready
        """
        pass

    @abstractmethod
    def register_server_shutdown(self, callback: Callable[[], None]) -> None:
        """Register the server shutdown callback.

        Args:
            callback: Function to call to shutdown the server gracefully
        """
        pass

    @abstractmethod
    def is_shutting_down(self) -> bool:
        """Check if shutdown has been initiated.

        Returns:
            True if shutdown is in progress, False otherwise
        """
        pass

    @abstractmethod
    def handle_sigterm(self, signum: int, frame) -> None:
        """SIGTERM signal handler that initiates graceful shutdown.

        Args:
            signum: Signal number
            frame: Current stack frame
        """
        pass

    @abstractmethod
    def perform_shutdown(self) -> bool:
        """Implements the shutdown process."""
        pass


class ShutdownCoordinator(ShutdownCoordinatorProtocol):
    """Coordinator for graceful shutdown of services."""

    def __init__(self, graceful_shutdown_timeout: int):
        """Initialize shutdown coordinator.

        Args:
            graceful_shutdown_timeout: Maximum seconds to wait for shutdown
        """
        self._graceful_shutdown_timeout = graceful_shutdown_timeout
        self._shutting_down = False
        self._shutdown_lock = threading.RLock()
        self._shutdown_notifications: list[Callable[[LifetimeEvent], None]] = []
        self._shutdown_waiters: dict[str, Callable[[float], bool]] = {}
        self._server_shutdown_callback: Callable[[], None] | None = None

        logger.info("ShutdownCoordinator initialized")

    def register_lifetime_notification(self, callback: Callable[[LifetimeEvent], None]) -> None:
        """Register a callback to be notified immediately when shutdown starts."""
        with self._shutdown_lock:
            self._shutdown_notifications.append(callback)
            logger.debug(f"Registered shutdown notification: {getattr(callback, '__name__', repr(callback))}")

    def register_shutdown_waiter(self, name: str, handler: Callable[[float], bool]) -> None:
        """Register a handler that blocks until ready for shutdown."""
        with self._shutdown_lock:
            self._shutdown_waiters[name] = handler
            logger.debug(f"Registered shutdown waiter: {name}")

    def register_server_shutdown(self, callback: Callable[[], None]) -> None:
        """Register the server shutdown callback."""
        with self._shutdown_lock:
            self._server_shutdown_callback = callback
            logger.debug("Registered server shutdown callback")

    def is_shutting_down(self) -> bool:
        """Check if shutdown has been initiated."""
        with self._shutdown_lock:
            return self._shutting_down

    def handle_sigterm(self, signum: int, frame) -> None:
        import sys, signal, traceback, threading
        print("\n=== STACK TRACE DUMP ===")
        for thread_id, stack in sys._current_frames().items():
            print(f"\n# Thread {threading._active.get(thread_id)} (id: {thread_id})")
            traceback.print_stack(stack)
        print("=== END STACK TRACE ===\n")

        """SIGTERM signal handler that performs complete graceful shutdown."""
        logger.info(f"Received signal {signum}, initiating graceful shutdown")

        if not self.perform_shutdown():
            return

        logger.info("Shutting down server")
        if self._server_shutdown_callback:
            try:
                self._server_shutdown_callback()
            except Exception as e:
                logger.error(f"Error shutting down server: {e}")
                # Force exit if server shutdown fails
                os._exit(1)
        else:
            logger.warning("No server shutdown callback registered, exiting directly")
            sys.exit(0)

    def _raise_lifetime_event(self, event: LifetimeEvent) -> None:
        logger.info(f"Raising lifetime event {event}")

        for callback in self._shutdown_notifications:
            try:
                callback(event)
            except Exception as e:
                logger.error(f"Error in lifetime event notification {getattr(callback, '__name__', repr(callback))}: {e}")

    def perform_shutdown(self) -> bool:
        """Implements the shutdown process."""
        with self._shutdown_lock:
            if self._shutting_down:
                logger.warning("Shutdown already in progress, ignoring signal")
                return False

            self._shutting_down = True
            shutdown_start_time = time.perf_counter()

            # Notify all listeners that we're starting shutdown. Don't
            # accept new incoming request and stuff like that.
            self._raise_lifetime_event(LifetimeEvent.PREPARE_SHUTDOWN)

        # Phase 2: Wait for services to complete (blocking)
        # Release lock before waiting to avoid deadlocks
        logger.info(f"Waiting for {len(self._shutdown_waiters)} services to complete (timeout: {self._graceful_shutdown_timeout}s)")
        
        start_time = time.perf_counter()
        all_ready = True
        
        for name, waiter in self._shutdown_waiters.items():
            elapsed = time.perf_counter() - start_time
            remaining = self._graceful_shutdown_timeout - elapsed

            if remaining <= 0:
                logger.error(f"Shutdown timeout exceeded before checking {name}")
                all_ready = False
                break

            try:
                logger.info(f"Waiting for {name} to complete (remaining: {remaining:.1f}s)")
                ready = waiter(remaining)

                if not ready:
                    logger.warning(f"{name} was not ready within timeout")
                    all_ready = False

            except Exception as e:
                logger.error(f"Error in shutdown waiter {name}: {e}")
                all_ready = False

        total_duration = time.perf_counter() - shutdown_start_time

        if not all_ready:
            logger.error(f"Shutdown timeout exceeded after {total_duration:.1f}s, forcing shutdown")

        # Notify that we're actually shutting down now.
        self._raise_lifetime_event(LifetimeEvent.SHUTDOWN)

        return True


class NoopShutdownCoordinator(ShutdownCoordinatorProtocol):
    """No-op shutdown coordinator for testing."""

    def __init__(self):
        """Initialize no-op coordinator."""
        self._shutting_down = False
        logger.debug("NoopShutdownCoordinator initialized")

    def register_lifetime_notification(self, callback: Callable[[LifetimeEvent], None]) -> None:
        """No-op notification registration."""
        pass

    def register_shutdown_waiter(self, name: str, handler: Callable[[float], bool]) -> None:
        """No-op waiter registration."""
        pass

    def register_server_shutdown(self, callback: Callable[[], None]) -> None:
        """No-op server shutdown registration."""
        pass

    def is_shutting_down(self) -> bool:
        """Always return False for testing."""
        return self._shutting_down

    def handle_sigterm(self, signum: int, frame) -> None:
        """No-op signal handler."""
        self._shutting_down = True

    def perform_shutdown(self) -> bool:
        return True
