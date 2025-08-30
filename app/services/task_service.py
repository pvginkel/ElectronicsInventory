import uuid
import threading
import traceback
from typing import Dict, Any, Optional, List, Callable
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor
from queue import Queue, Empty
import time
import logging

from app.services.base_task import BaseTask, ProgressHandle
from app.schemas.task_schema import (
    TaskInfo, TaskStatus, TaskStartResponse, TaskEvent, 
    TaskEventType, TaskProgressUpdate
)

logger = logging.getLogger(__name__)


class TaskProgressHandle:
    """Implementation of ProgressHandle for sending updates via SSE."""
    
    def __init__(self, task_id: str, event_queue: Queue):
        self.task_id = task_id
        self.event_queue = event_queue
    
    def send_progress_text(self, text: str) -> None:
        """Send a text progress update to connected clients."""
        self._send_progress_event(TaskProgressUpdate(text=text))
    
    def send_progress_value(self, value: float) -> None:
        """Send a progress value update (0.0 to 1.0) to connected clients."""
        self._send_progress_event(TaskProgressUpdate(value=value))
    
    def send_progress(self, text: str, value: float) -> None:
        """Send both text and progress value update to connected clients."""
        self._send_progress_event(TaskProgressUpdate(text=text, value=value))
    
    def _send_progress_event(self, progress: TaskProgressUpdate) -> None:
        """Send progress update event to the SSE queue."""
        event = TaskEvent(
            event_type=TaskEventType.PROGRESS_UPDATE,
            task_id=self.task_id,
            data=progress.model_dump()
        )
        try:
            self.event_queue.put_nowait(event)
        except Exception as e:
            # If queue is full or closed, log warning and ignore
            logger.warning(f"Failed to send progress event for task {self.task_id}: {e}")
            pass


class TaskService:
    """Service for managing background tasks with SSE progress updates."""
    
    def __init__(self, max_workers: int = 4, task_timeout: int = 300, cleanup_interval: int = 600):
        """Initialize TaskService with configurable parameters.
        
        Args:
            max_workers: Maximum number of concurrent tasks
            task_timeout: Task execution timeout in seconds
            cleanup_interval: How often to clean up completed tasks in seconds
        """
        self.max_workers = max_workers
        self.task_timeout = task_timeout
        self.cleanup_interval = cleanup_interval  # 10 minutes in seconds
        self._tasks: Dict[str, TaskInfo] = {}
        self._task_instances: Dict[str, BaseTask] = {}
        self._event_queues: Dict[str, Queue] = {}
        self._executor = ThreadPoolExecutor(max_workers=max_workers)
        self._lock = threading.RLock()
        self._shutdown_event = threading.Event()
        
        # Start cleanup thread
        self._cleanup_thread = threading.Thread(target=self._cleanup_worker, daemon=True)
        self._cleanup_thread.start()
        
        logger.info(f"TaskService initialized: max_workers={max_workers}, timeout={task_timeout}s, cleanup_interval={cleanup_interval}s")
    
    def start_task(self, task: BaseTask, **kwargs) -> TaskStartResponse:
        """
        Start a background task and return task info with SSE stream URL.
        
        Args:
            task: Instance of BaseTask to execute
            **kwargs: Task-specific parameters
            
        Returns:
            TaskStartResponse with task ID and SSE stream URL
        """
        task_id = str(uuid.uuid4())
        
        with self._lock:
            # Create task info
            task_info = TaskInfo(
                task_id=task_id,
                status=TaskStatus.PENDING,
                start_time=datetime.utcnow()
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
            stream_url=f"/api/tasks/{task_id}/stream",
            status=TaskStatus.PENDING
        )
    
    def get_task_status(self, task_id: str) -> Optional[TaskInfo]:
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
            task_info.end_time = datetime.utcnow()
            
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
    
    def get_task_events(self, task_id: str, timeout: float = 30.0) -> List[TaskEvent]:
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
        start_time = time.time()
        
        while time.time() - start_time < timeout:
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
    
    def _execute_task(self, task_id: str, task: BaseTask, kwargs: Dict[str, Any]) -> None:
        """Execute a task in a background thread."""
        event_queue = self._event_queues.get(task_id)
        if not event_queue:
            return
        
        try:
            # Update status to running
            with self._lock:
                task_info = self._tasks.get(task_id)
                if task_info:
                    task_info.status = TaskStatus.RUNNING
            
            # Send task started event
            start_event = TaskEvent(
                event_type=TaskEventType.TASK_STARTED,
                task_id=task_id
            )
            event_queue.put_nowait(start_event)
            
            # Create progress handle
            progress_handle = TaskProgressHandle(task_id, event_queue)
            
            # Execute the task
            result = task.execute(progress_handle, **kwargs)
            
            # Task completed successfully - but check if it wasn't cancelled first
            with self._lock:
                task_info = self._tasks.get(task_id)
                if task_info and task_info.status != TaskStatus.CANCELLED:
                    task_info.status = TaskStatus.COMPLETED
                    task_info.end_time = datetime.utcnow()
                    # Convert BaseModel to dict for storage
                    task_info.result = result.model_dump() if result else None
                    
                    # Send completion event
                    completion_event = TaskEvent(
                        event_type=TaskEventType.TASK_COMPLETED,
                        task_id=task_id,
                        data=result.model_dump() if result else None
                    )
                    event_queue.put_nowait(completion_event)
                    
                    logger.info(f"Task {task_id} completed successfully")
            
        except Exception as e:
            # Task failed
            error_msg = str(e)
            error_trace = traceback.format_exc()
            
            logger.error(f"Task {task_id} failed: {error_msg}")
            logger.debug(f"Task {task_id} error traceback: {error_trace}")
            
            with self._lock:
                task_info = self._tasks.get(task_id)
                if task_info:
                    task_info.status = TaskStatus.FAILED
                    task_info.end_time = datetime.utcnow()
                    task_info.error = error_msg
            
            # Send failure event
            failure_event = TaskEvent(
                event_type=TaskEventType.TASK_FAILED,
                task_id=task_id,
                data={
                    "error": error_msg,
                    "traceback": error_trace
                }
            )
            event_queue.put_nowait(failure_event)
    
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
        current_time = datetime.utcnow()
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