"""Shared testing utilities for shutdown coordinator stubs."""

import logging
from collections.abc import Callable

from app.utils.shutdown_coordinator import LifetimeEvent, ShutdownCoordinatorProtocol


class StubShutdownCoordinator(ShutdownCoordinatorProtocol):
    """Basic shutdown coordinator stub for testing.

    This stub only stores registrations and maintains state - it never
    executes callbacks or waiters. Use this for unit tests that just
    need dependency injection without shutdown behavior testing.
    """

    def __init__(self):
        self._shutting_down = False
        self._notifications: list[Callable[[LifetimeEvent], None]] = []
        self._waiters: dict[str, Callable[[float], bool]] = {}

    def initialize(self) -> None:
        """Initialize (noop)."""
        pass

    def register_lifetime_notification(self, callback: Callable[[LifetimeEvent], None]) -> None:
        """Store notification callback."""
        self._notifications.append(callback)

    def register_shutdown_waiter(self, name: str, handler: Callable[[float], bool]) -> None:
        """Store shutdown waiter."""
        self._waiters[name] = handler

    def is_shutting_down(self) -> bool:
        """Return current shutdown state."""
        return self._shutting_down

    def shutdown(self) -> None:
        """Implements the shutdown process."""
        pass


class TestShutdownCoordinator(StubShutdownCoordinator):
    """Enhanced shutdown coordinator stub with controllable execution.

    This extends the basic stub with methods to simulate shutdown behavior
    for integration testing. Use this when you need to test actual shutdown
    sequences and callback execution.
    """

    """This is not a test class."""
    __test__ = False

    def simulate_shutdown(self) -> None:
        """Simulate shutdown - sets state AND executes PREPARE_SHUTDOWN callbacks."""
        self._shutting_down = True
        # Execute notification callbacks for PREPARE_SHUTDOWN phase
        for callback in self._notifications:
            try:
                callback(LifetimeEvent.PREPARE_SHUTDOWN)
            except Exception as e:
                logging.getLogger(__name__).error(f"Error in test shutdown callback: {e}")

    def simulate_full_shutdown(self, timeout: float = 30.0) -> None:
        """Simulate full shutdown including waiter execution and SHUTDOWN callbacks.

        Args:
            timeout: Timeout to pass to waiters (default 30 seconds)
        """
        self.simulate_shutdown()  # PREPARE_SHUTDOWN phase

        # Execute waiters
        for name, waiter in self._waiters.items():
            try:
                waiter(timeout)
            except Exception as e:
                logging.getLogger(__name__).error(f"Error in test waiter {name}: {e}")

        # Execute shutdown complete callbacks
        for callback in self._notifications:
            try:
                callback(LifetimeEvent.SHUTDOWN)
            except Exception as e:
                logging.getLogger(__name__).error(f"Error in test shutdown complete callback: {e}")
