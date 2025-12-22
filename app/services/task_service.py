import logging
import threading
import time
import traceback
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from queue import Empty, Queue
from typing import Any

from app.exceptions import InvalidOperationException
from app.schemas.sse_gateway_schema import (
    SSEGatewayConnectCallback,
    SSEGatewayDisconnectCallback,
)
from app.schemas.task_schema import (
    TaskEvent,
    TaskEventType,
    TaskInfo,
    TaskProgressUpdate,
    TaskStartResponse,
    TaskStatus,
)
from app.services.base_task import BaseTask
from app.services.connection_manager import ConnectionManager
from app.services.metrics_service import MetricsServiceProtocol
from app.utils.shutdown_coordinator import LifetimeEvent, ShutdownCoordinatorProtocol

logger = logging.getLogger(__name__)


class TaskProgressHandle:
    """Implementation of ProgressHandle for sending updates via SSE."""

    def __init__(self, task_id: str, event_queue: Queue[TaskEvent], connection_manager: ConnectionManager):
        self.task_id = task_id
        self.event_queue = event_queue
        self.connection_manager = connection_manager
        self.progress = 0.0
        self.progress_text = ""

    def send_progress_text(self, text: str) -> None:
        """Send a text progress update to connected clients."""
        self.send_progress(text, self.progress)

    def send_progress_value(self, value: float) -> None:
        """Send a progress value update (0.0 to 1.0) to connected clients."""
        self.send_progress(self.progress_text, value)

    def send_progress(self, text: str, value: float) -> None:
        """Send both text and progress value update to connected clients."""
        self.progress_text = text
        if value > self.progress:
            self.progress = value

        self._send_progress_event(TaskProgressUpdate(text=text, value=value))

    def _send_progress_event(self, progress: TaskProgressUpdate) -> None:
        """Send progress update event via gateway or queue."""
        event = TaskEvent(
            event_type=TaskEventType.PROGRESS_UPDATE,
            task_id=self.task_id,
            data=progress.model_dump()
        )
        try:
            # Try to send via gateway first; ConnectionManager handles missing connections gracefully
            identifier = f"task:{self.task_id}"
            # Use mode='json' to serialize datetime to ISO format string
            success = self.connection_manager.send_event(
                identifier,
                event.model_dump(mode='json'),
                event_name="task_event",
                close=False
            )
            if not success:
                # No connection yet, queue the event
                self.event_queue.put_nowait(event)
        except Exception as e:
            # If sending fails, log warning and ignore
            logger.warning(f"Failed to send progress event for task {self.task_id}: {e}")
            pass


class TaskService:
    """Service for managing background tasks with SSE progress updates."""

    def __init__(
        self,
        metrics_service: MetricsServiceProtocol,
        shutdown_coordinator: ShutdownCoordinatorProtocol,
        connection_manager: ConnectionManager,
        max_workers: int = 4,
        task_timeout: int = 300,
        cleanup_interval: int = 600
    ):
        """Initialize TaskService with configurable parameters.

        Args:
            metrics_service: Instance of MetricsService for recording metrics
            shutdown_coordinator: Coordinator for graceful shutdown
            connection_manager: ConnectionManager for SSE Gateway integration
            max_workers: Maximum number of concurrent tasks
            task_timeout: Task execution timeout in seconds
            cleanup_interval: How often to clean up completed tasks in seconds
        """
        self.max_workers = max_workers
        self.task_timeout = task_timeout
        self.cleanup_interval = cleanup_interval  # 10 minutes in seconds
        self.metrics_service = metrics_service
        self.shutdown_coordinator = shutdown_coordinator
        self.connection_manager = connection_manager
        self._tasks: dict[str, TaskInfo] = {}
        self._task_instances: dict[str, BaseTask] = {}
        self._event_queues: dict[str, Queue[TaskEvent]] = {}
        self._executor = ThreadPoolExecutor(max_workers=max_workers)
        self._lock = threading.RLock()
        self._shutdown_event = threading.Event()
        self._shutting_down = False
        self._tasks_complete_event = threading.Event()

        # Register with shutdown coordinator
        self.shutdown_coordinator.register_lifetime_notification(self._on_lifetime_event)
        self.shutdown_coordinator.register_shutdown_waiter("TaskService", self._wait_for_tasks_completion)

        # Start cleanup thread
        self._cleanup_thread = threading.Thread(target=self._cleanup_worker, daemon=True)
        self._cleanup_thread.start()

        logger.info(f"TaskService initialized: max_workers={max_workers}, timeout={task_timeout}s, cleanup_interval={cleanup_interval}s")

    def start_task(self, task: BaseTask, **kwargs: Any) -> TaskStartResponse:
        """
        Start a background task and return task info with SSE stream URL.

        Args:
            task: Instance of BaseTask to execute
            **kwargs: Task-specific parameters

        Returns:
            TaskStartResponse with task ID and SSE stream URL

        Raises:
            InvalidOperationException: If service is shutting down
        """
        # Check if shutting down
        if self._shutting_down:
            raise InvalidOperationException("start task", "service is shutting down")

        task_id = str(uuid.uuid4())

        with self._lock:
            # Create task info
            task_info = TaskInfo(
                task_id=task_id,
                status=TaskStatus.PENDING,
                start_time=datetime.now(UTC),
                end_time=None,
                result=None,
                error=None,
            )

            # Store task metadata
            self._tasks[task_id] = task_info
            self._task_instances[task_id] = task
            self._event_queues[task_id] = Queue()

            # Submit task to thread pool
            self._executor.submit(self._execute_task, task_id, task, kwargs)

        logger.info(f"Started task {task_id} of type {type(task).__name__}")

        return TaskStartResponse(
            task_id=task_id,
            stream_url=f"/api/sse/tasks?task_id={task_id}",
            status=TaskStatus.PENDING
        )

    def on_connect(self, callback: SSEGatewayConnectCallback, task_id: str) -> None:
        """Handle SSE Gateway connect callback for task streams.

        Args:
            callback: Connect callback from SSE Gateway
            task_id: Task ID extracted from callback URL
        """
        t0 = time.perf_counter()
        identifier = f"task:{task_id}"
        token = callback.token
        url = callback.request.url

        logger.info(f"[TIMING] task on_connect START: task_id={task_id}, token={token}")

        # Register connection with ConnectionManager
        t1 = time.perf_counter()
        self.connection_manager.on_connect(identifier, token, url)
        logger.info(f"[TIMING] task on_connect: connection_manager.on_connect took {(time.perf_counter() - t1) * 1000:.1f}ms")

        # Check if task exists
        with self._lock:
            task_exists = task_id in self._tasks

        if not task_exists:
            # Task not found - send error event and close
            t2 = time.perf_counter()
            self.connection_manager.send_event(
                identifier,
                {"error": "Task not found", "task_id": task_id},
                event_name="error",
                close=False
            )
            logger.info(f"[TIMING] task on_connect: send_event (error) took {(time.perf_counter() - t2) * 1000:.1f}ms")
            # Send connection_close event with close=True
            t3 = time.perf_counter()
            self.connection_manager.send_event(
                identifier,
                {"reason": "task_not_found"},
                event_name="connection_close",
                close=True
            )
            logger.info(f"[TIMING] task on_connect: send_event (close) took {(time.perf_counter() - t3) * 1000:.1f}ms")
            logger.info(f"[TIMING] task on_connect END (not found): total={(time.perf_counter() - t0) * 1000:.1f}ms")
            return

        # Send any queued events for this task
        event_queue = self._event_queues.get(task_id)
        if event_queue:
            # Drain queued events and send via ConnectionManager
            events_sent = 0
            t4 = time.perf_counter()
            try:
                while True:
                    event = event_queue.get_nowait()
                    self._send_event_to_gateway(identifier, event)
                    events_sent += 1
            except Empty:
                pass
            logger.info(f"[TIMING] task on_connect: sent {events_sent} queued events in {(time.perf_counter() - t4) * 1000:.1f}ms")

        logger.info(f"[TIMING] task on_connect END: total={(time.perf_counter() - t0) * 1000:.1f}ms")

    def on_disconnect(self, callback: SSEGatewayDisconnectCallback) -> None:
        """Handle SSE Gateway disconnect callback for task streams.

        Args:
            callback: Disconnect callback from SSE Gateway
        """
        token = callback.token
        reason = callback.reason

        logger.debug(f"Task stream disconnected: token={token}, reason={reason}")

        # Notify ConnectionManager
        self.connection_manager.on_disconnect(token)

    def _send_event_to_gateway(self, identifier: str, event: TaskEvent) -> None:
        """Send a task event via ConnectionManager to SSE Gateway.

        Args:
            identifier: Service identifier (task:xyz)
            event: Task event to send
        """
        # Check if this is a terminal event
        is_terminal = event.event_type in [TaskEventType.TASK_COMPLETED, TaskEventType.TASK_FAILED]

        # Send event via ConnectionManager (don't close yet if terminal)
        # Use mode='json' to serialize datetime to ISO format string
        success = self.connection_manager.send_event(
            identifier,
            event.model_dump(mode='json'),
            event_name="task_event",
            close=False
        )

        if not success:
            logger.warning(f"Failed to send event for {identifier}: {event.event_type}")

        # If terminal event, send connection_close event and close the stream
        if is_terminal:
            # Determine close reason
            reason = "task_completed" if event.event_type == TaskEventType.TASK_COMPLETED else "task_failed"

            # Send connection_close event with close=True
            self.connection_manager.send_event(
                identifier,
                {"reason": reason},
                event_name="connection_close",
                close=True
            )

    def get_task_status(self, task_id: str) -> TaskInfo | None:
        """Get current status of a task."""
        with self._lock:
            return self._tasks.get(task_id)

    def cancel_task(self, task_id: str) -> bool:
        """
        Cancel a running task.

        Returns:
            True if task was found and cancellation was requested, False otherwise
        """
        with self._lock:
            task_instance = self._task_instances.get(task_id)
            task_info = self._tasks.get(task_id)

            if not task_instance or not task_info:
                return False

            if task_info.status in [TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED]:
                return False

            # Request cancellation
            task_instance.cancel()
            task_info.status = TaskStatus.CANCELLED
            task_info.end_time = datetime.now(UTC)

            logger.info(f"Cancelled task {task_id}")
            return True

    def remove_completed_task(self, task_id: str) -> bool:
        """Remove a completed task from registry."""
        with self._lock:
            task_info = self._tasks.get(task_id)
            if not task_info or task_info.status not in [
                TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED
            ]:
                return False

            # Clean up task data
            self._tasks.pop(task_id, None)
            self._task_instances.pop(task_id, None)
            event_queue = self._event_queues.pop(task_id, None)
            if event_queue:
                # Clear any remaining events
                try:
                    while True:
                        event_queue.get_nowait()
                except Empty:
                    pass

            logger.debug(f"Removed completed task {task_id}")
            return True

    def get_task_events(self, task_id: str, timeout: float = 30.0) -> list[TaskEvent]:
        """
        Get events for a task (blocking call for SSE).

        Args:
            task_id: Task identifier
            timeout: Maximum time to wait for events

        Returns:
            List of task events
        """
        event_queue = self._event_queues.get(task_id)
        if not event_queue:
            return []

        events = []
        start_time = time.perf_counter()

        while time.perf_counter() - start_time < timeout:
            try:
                event = event_queue.get(timeout=1.0)
                events.append(event)

                # If task completed/failed, return immediately
                if event.event_type in [TaskEventType.TASK_COMPLETED, TaskEventType.TASK_FAILED]:
                    break

            except Empty:
                # Check if task is still active
                with self._lock:
                    task_info = self._tasks.get(task_id)
                    if not task_info or task_info.status in [
                        TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED
                    ]:
                        break
                continue

        return events

    def _execute_task(self, task_id: str, task: BaseTask, kwargs: dict[str, Any]) -> None:
        """Execute a task in a background thread."""
        event_queue = self._event_queues.get(task_id)
        if not event_queue:
            return

        # Track timing from the start
        start_time = time.perf_counter()

        try:
            # Update status to running
            with self._lock:
                task_info = self._tasks.get(task_id)
                if task_info:
                    task_info.status = TaskStatus.RUNNING

            # Send task started event
            start_event = TaskEvent(
                event_type=TaskEventType.TASK_STARTED,
                task_id=task_id,
                data=None,
            )
            # Try to send via gateway, otherwise queue
            identifier = f"task:{task_id}"
            if self.connection_manager.has_connection(identifier):
                self._send_event_to_gateway(identifier, start_event)
            else:
                event_queue.put_nowait(start_event)

            # Create progress handle
            progress_handle = TaskProgressHandle(task_id, event_queue, self.connection_manager)

            # Execute the task
            result = task.execute(progress_handle, **kwargs)
            duration = time.perf_counter() - start_time

            # Task completed successfully - but check if it wasn't cancelled first
            with self._lock:
                task_info = self._tasks.get(task_id)
                if task_info and task_info.status != TaskStatus.CANCELLED:
                    task_info.status = TaskStatus.COMPLETED
                    task_info.end_time = datetime.now(UTC)
                    # Convert BaseModel to dict for storage
                    task_info.result = result.model_dump() if result else None

                    # Record task execution metrics
                    task_type = type(task).__name__
                    self.metrics_service.record_task_execution(task_type, duration, "success")

                    # Send completion event
                    completion_event = TaskEvent(
                        event_type=TaskEventType.TASK_COMPLETED,
                        task_id=task_id,
                        data=result.model_dump() if result else None
                    )
                    # Send via gateway if connected, otherwise queue
                    if self.connection_manager.has_connection(identifier):
                        self._send_event_to_gateway(identifier, completion_event)
                    else:
                        event_queue.put_nowait(completion_event)

                    logger.info(f"Task {task_id} completed successfully")

                    # Check if this was the last task during shutdown
                    self._check_tasks_complete()

        except Exception as e:
            # Task failed
            error_msg = str(e)
            error_trace = traceback.format_exc()

            logger.error(f"Task {task_id} failed: {error_msg}")
            logger.debug(f"Task {task_id} error traceback: {error_trace}")

            # Calculate duration for failed tasks
            duration = time.perf_counter() - start_time

            with self._lock:
                task_info = self._tasks.get(task_id)
                if task_info:
                    task_info.status = TaskStatus.FAILED
                    task_info.end_time = datetime.now(UTC)
                    task_info.error = error_msg

                    # Record task execution metrics for failed tasks
                    task_type = type(task).__name__
                    self.metrics_service.record_task_execution(task_type, duration, "error")

            # Send failure event
            failure_event = TaskEvent(
                event_type=TaskEventType.TASK_FAILED,
                task_id=task_id,
                data={
                    "error": error_msg,
                    "traceback": error_trace
                }
            )
            # Send via gateway if connected, otherwise queue
            identifier = f"task:{task_id}"
            if self.connection_manager.has_connection(identifier):
                self._send_event_to_gateway(identifier, failure_event)
            else:
                event_queue.put_nowait(failure_event)

            # Check if this was the last task during shutdown
            self._check_tasks_complete()

    def _cleanup_worker(self) -> None:
        """Background worker that periodically cleans up completed tasks."""
        while not self._shutdown_event.is_set():
            try:
                # Wait for cleanup interval or shutdown signal
                if self._shutdown_event.wait(timeout=self.cleanup_interval):
                    break

                # Perform cleanup
                self._cleanup_completed_tasks()

            except Exception as e:
                # Log error but continue cleanup loop
                logger.error(f"Error during task cleanup: {e}", exc_info=True)

    def _cleanup_completed_tasks(self) -> None:
        """Remove completed tasks older than cleanup_interval."""
        current_time = datetime.now(UTC)
        tasks_to_remove = []

        with self._lock:
            for task_id, task_info in self._tasks.items():
                # Only clean up completed, failed, or cancelled tasks
                if task_info.status in [TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED]:
                    if task_info.end_time:
                        # Calculate time since completion
                        time_since_completion = (current_time - task_info.end_time).total_seconds()
                        if time_since_completion >= self.cleanup_interval:
                            tasks_to_remove.append(task_id)

        # Remove old tasks
        if tasks_to_remove:
            logger.debug(f"Cleaning up {len(tasks_to_remove)} completed tasks")

        for task_id in tasks_to_remove:
            self.remove_completed_task(task_id)

    def shutdown(self) -> None:
        """Shutdown the task service and cleanup resources."""
        logger.info("Shutting down TaskService...")

        # Signal cleanup thread to stop
        self._shutdown_event.set()
        if self._cleanup_thread.is_alive():
            self._cleanup_thread.join(timeout=5.0)

        self._executor.shutdown(wait=True)

        with self._lock:
            active_tasks = sum(1 for t in self._tasks.values()
                             if t.status in [TaskStatus.PENDING, TaskStatus.RUNNING])
            if active_tasks > 0:
                logger.warning(f"Shutting down with {active_tasks} active tasks")

            # Clear all event queues
            for queue in self._event_queues.values():
                try:
                    while True:
                        queue.get_nowait()
                except Empty:
                    pass

            self._tasks.clear()
            self._task_instances.clear()
            self._event_queues.clear()

        logger.info("TaskService shutdown complete")

    def _on_lifetime_event(self, event: LifetimeEvent) -> None:
        """Callback when shutdown is initiated."""
        match event:
            case LifetimeEvent.PREPARE_SHUTDOWN:
                with self._lock:
                    self._shutting_down = True
                    active_count = self._get_active_task_count()
                    logger.info(f"TaskService shutdown initiated with {active_count} active tasks")

                    # Record active tasks at shutdown in metrics
                    self.metrics_service.record_active_tasks_at_shutdown(active_count)

            case LifetimeEvent.SHUTDOWN:
                self.shutdown()

    def _wait_for_tasks_completion(self, timeout: float) -> bool:
        """Wait for all tasks to complete within timeout.

        Args:
            timeout: Maximum seconds to wait

        Returns:
            True if all tasks completed, False if timeout
        """
        with self._lock:
            active_count = self._get_active_task_count()

            if active_count == 0:
                logger.info("No active tasks to wait for")
                return True

            logger.info(f"Waiting for {active_count} active tasks to complete (timeout: {timeout:.1f}s)")

        # Wait for tasks to complete
        completed = self._tasks_complete_event.wait(timeout=timeout)

        if completed:
            logger.info("All tasks completed gracefully")
        else:
            with self._lock:
                remaining = self._get_active_task_count()
                logger.warning(f"Timeout waiting for tasks, {remaining} tasks still active")

        return completed

    def _get_active_task_count(self) -> int:
        """Get count of active (pending or running) tasks.

        Returns:
            Number of active tasks
        """
        return sum(
            1 for task in self._tasks.values()
            if task.status in [TaskStatus.PENDING, TaskStatus.RUNNING]
        )

    def _check_tasks_complete(self) -> None:
        """Check if all tasks are complete during shutdown."""
        if self._shutting_down:
            with self._lock:
                if self._get_active_task_count() == 0:
                    logger.info("All tasks completed during shutdown")
                    self._tasks_complete_event.set()
