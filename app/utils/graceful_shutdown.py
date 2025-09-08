import logging
import threading

logger = logging.getLogger(__name__)


class GracefulShutdownManager:
    """Singleton manager for graceful shutdown handling."""

    _instance: 'GracefulShutdownManager | None' = None
    _lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if not getattr(self, '_initialized', False):
            self._draining = False
            self._draining_lock = threading.RLock()
            self._shutdown_events: list[threading.Event] = []
            self._initialized = True
            logger.debug("GracefulShutdownManager initialized")

    def set_draining(self, draining: bool) -> None:
        """Set the draining state."""
        with self._draining_lock:
            if self._draining != draining:
                self._draining = draining
                logger.info(f"Draining state changed to: {draining}")
                if draining:
                    # Set all registered shutdown events
                    for event in self._shutdown_events:
                        event.set()

    def is_draining(self) -> bool:
        """Check if the application is draining."""
        with self._draining_lock:
            return self._draining

    def handle_sigterm(self, signum: int, frame) -> None:
        """SIGTERM signal handler."""
        logger.info(f"Received signal {signum}, initiating graceful shutdown")
        # Force draining state to True regardless of current state
        with self._draining_lock:
            self._draining = True
            # Set all registered shutdown events
            for event in self._shutdown_events:
                event.set()

    def wait_for_shutdown(self, timeout: float | None = None) -> bool:
        """
        Block until safe to shutdown or timeout is reached.

        Args:
            timeout: Maximum time to wait in seconds. If None, waits indefinitely.

        Returns:
            True if shutdown was signaled, False if timeout occurred
        """
        # Create a new event for this wait call
        wait_event = threading.Event()

        with self._draining_lock:
            # If already draining, return immediately
            if self._draining:
                return True
            # Otherwise, register this event to be triggered when draining starts
            self._shutdown_events.append(wait_event)

        try:
            if timeout is None:
                wait_event.wait()
                return True
            else:
                return wait_event.wait(timeout=timeout)
        finally:
            # Clean up the event from the list
            with self._draining_lock:
                if wait_event in self._shutdown_events:
                    self._shutdown_events.remove(wait_event)

