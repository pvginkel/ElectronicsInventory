import threading
from abc import ABC, abstractmethod
from typing import Protocol

from pydantic import BaseModel


class ProgressHandle(Protocol):
    """Interface for sending progress updates to connected clients."""

    def send_progress_text(self, text: str) -> None:
        """Send a text progress update to connected clients."""
        ...

    def send_progress_value(self, value: float) -> None:
        """Send a progress value update (0.0 to 1.0) to connected clients."""
        ...

    def send_progress(self, text: str, value: float) -> None:
        """Send both text and progress value update to connected clients."""
        ...


class BaseTask(ABC):
    """Abstract base class for background tasks with progress reporting capabilities."""

    def __init__(self):
        self._cancelled = threading.Event()

    @abstractmethod
    def execute(self, progress_handle: ProgressHandle, **kwargs) -> BaseModel:
        """
        Execute the task with progress reporting.

        Args:
            progress_handle: Interface for sending progress updates to clients
            **kwargs: Task-specific parameters

        Returns:
            BaseModel: Result schema object to send to client

        Raises:
            Exception: Any task-specific exceptions that should be reported as failures
        """
        pass

    def cancel(self) -> None:
        """Request cancellation of the task."""
        self._cancelled.set()

    @property
    def is_cancelled(self) -> bool:
        """Check if the task has been cancelled."""
        return self._cancelled.is_set()
