"""Graceful shutdown coordinator for managing service shutdowns in Kubernetes."""

import logging
import os
import threading
import time
from abc import ABC, abstractmethod
from collections.abc import Callable

logger = logging.getLogger(__name__)


class ShutdownCoordinatorProtocol(ABC):
    """Protocol for shutdown coordinator implementations."""

    @abstractmethod
    def register_shutdown_notification(self, callback: Callable[[], None]) -> None:
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
    def wait_for_shutdown(self, timeout: float | None = None) -> bool:
        """Wait for all registered handlers to report ready for shutdown.

        Args:
            timeout: Maximum seconds to wait (uses GRACEFUL_SHUTDOWN_TIMEOUT if None)

        Returns:
            True if all handlers completed within timeout, False otherwise
        """
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
        self._shutdown_notifications: list[Callable[[], None]] = []
        self._shutdown_waiters: dict[str, Callable[[float], bool]] = {}
        self._shutdown_start_time: float | None = None

        logger.info("ShutdownCoordinator initialized")

    def register_shutdown_notification(self, callback: Callable[[], None]) -> None:
        """Register a callback to be notified immediately when shutdown starts."""
        with self._shutdown_lock:
            self._shutdown_notifications.append(callback)
            logger.debug(f"Registered shutdown notification: {getattr(callback, '__name__', repr(callback))}")

    def register_shutdown_waiter(self, name: str, handler: Callable[[float], bool]) -> None:
        """Register a handler that blocks until ready for shutdown."""
        with self._shutdown_lock:
            self._shutdown_waiters[name] = handler
            logger.debug(f"Registered shutdown waiter: {name}")

    def is_shutting_down(self) -> bool:
        """Check if shutdown has been initiated."""
        with self._shutdown_lock:
            return self._shutting_down

    def handle_sigterm(self, signum: int, frame) -> None:
        """SIGTERM signal handler that initiates graceful shutdown."""
        logger.info(f"Received signal {signum}, initiating graceful shutdown")

        with self._shutdown_lock:
            if self._shutting_down:
                logger.warning("Shutdown already in progress, ignoring signal")
                return

            self._shutting_down = True
            self._shutdown_start_time = time.perf_counter()

            # Notify all registered callbacks immediately (non-blocking)
            for callback in self._shutdown_notifications:
                try:
                    callback()
                    logger.debug(f"Notified shutdown callback: {getattr(callback, '__name__', repr(callback))}")
                except Exception as e:
                    logger.error(f"Error in shutdown notification {getattr(callback, '__name__', repr(callback))}: {e}")

    def wait_for_shutdown(self, timeout: float | None = None) -> bool:
        """Wait for all registered handlers to report ready for shutdown."""
        if not self._shutting_down:
            logger.warning("wait_for_shutdown called but shutdown not initiated")
            return True

        if timeout is None:
            timeout = self._graceful_shutdown_timeout

        start_time = time.perf_counter()
        logger.info(f"Waiting for {len(self._shutdown_waiters)} services to complete (timeout: {timeout}s)")

        # Iterate through registered waiters sequentially
        all_ready = True
        for name, waiter in self._shutdown_waiters.items():
            elapsed = time.perf_counter() - start_time
            remaining = timeout - elapsed

            if remaining <= 0:
                logger.error(f"Shutdown timeout exceeded before checking {name}")
                all_ready = False
                break

            try:
                logger.info(f"Waiting for {name} to complete (remaining: {remaining:.1f}s)")
                ready = waiter(remaining)

                if ready:
                    logger.info(f"{name} is ready for shutdown")
                else:
                    logger.warning(f"{name} was not ready within timeout")
                    all_ready = False

            except Exception as e:
                logger.error(f"Error in shutdown waiter {name}: {e}")
                all_ready = False

        total_duration = time.perf_counter() - start_time

        if all_ready:
            logger.info(f"All services ready for shutdown (duration: {total_duration:.1f}s)")
        else:
            logger.error(f"Shutdown timeout exceeded after {total_duration:.1f}s, forcing shutdown")
            # Force exit if timeout exceeded
            os._exit(1)

        return all_ready


class NoopShutdownCoordinator(ShutdownCoordinatorProtocol):
    """No-op shutdown coordinator for testing."""

    def __init__(self):
        """Initialize no-op coordinator."""
        self._shutting_down = False
        logger.debug("NoopShutdownCoordinator initialized")

    def register_shutdown_notification(self, callback: Callable[[], None]) -> None:
        """No-op notification registration."""
        pass

    def register_shutdown_waiter(self, name: str, handler: Callable[[float], bool]) -> None:
        """No-op waiter registration."""
        pass

    def is_shutting_down(self) -> bool:
        """Always return False for testing."""
        return self._shutting_down

    def handle_sigterm(self, signum: int, frame) -> None:
        """No-op signal handler."""
        self._shutting_down = True

    def wait_for_shutdown(self, timeout: float | None = None) -> bool:
        """Always return True immediately for testing."""
        return True
