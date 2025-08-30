from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class TaskStatus(str, Enum):
    """Task execution status."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class TaskEventType(str, Enum):
    """Types of task events sent via SSE."""
    TASK_STARTED = "task_started"
    PROGRESS_UPDATE = "progress_update"
    TASK_COMPLETED = "task_completed"
    TASK_FAILED = "task_failed"


class TaskProgressUpdate(BaseModel):
    """Progress update data."""
    text: str | None = Field(None, description="Progress description text")
    value: float | None = Field(None, ge=0.0, le=1.0, description="Progress value from 0.0 to 1.0")


class TaskEvent(BaseModel):
    """Task event sent via SSE stream."""
    event_type: TaskEventType = Field(description="Type of task event")
    task_id: str = Field(description="Unique task identifier")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="Event timestamp")
    data: dict[str, Any] | None = Field(None, description="Event-specific data")


class TaskInfo(BaseModel):
    """In-memory task metadata."""
    task_id: str = Field(description="Unique task identifier")
    status: TaskStatus = Field(description="Current task status")
    start_time: datetime = Field(description="Task start timestamp")
    end_time: datetime | None = Field(None, description="Task completion timestamp")
    result: dict[str, Any] | None = Field(None, description="Task result data")
    error: str | None = Field(None, description="Error message if task failed")


class TaskStartResponse(BaseModel):
    """Response when starting a new task."""
    task_id: str = Field(description="Unique task identifier")
    stream_url: str = Field(description="SSE stream URL for monitoring progress")
    status: TaskStatus = Field(description="Initial task status")
