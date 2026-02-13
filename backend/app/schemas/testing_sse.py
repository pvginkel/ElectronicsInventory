"""Pydantic schemas for testing SSE and deployment endpoints."""

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class TestErrorResponseSchema(BaseModel):
    """Schema for testing API error responses."""

    error: str = Field(..., description="Error message", examples=["No SSE connection found"])
    status: str = Field(..., description="Operation status", examples=["not_found"])


class DeploymentTriggerRequestSchema(BaseModel):
    """Request schema for triggering version deployment events in testing mode."""

    request_id: str = Field(
        ...,
        description="Correlation identifier associated with an SSE subscriber",
        examples=["playwright-run-1234"]
    )
    version: str = Field(
        ...,
        description="Frontend version string to broadcast",
        examples=["2024.03.15+abc123"]
    )
    changelog: str | None = Field(
        default=None,
        description="Optional banner text accompanying the deployment notification",
        examples=["New filters, improved performance, and bug fixes."]
    )


class DeploymentTriggerResponseSchema(BaseModel):
    """Response schema for deployment trigger acknowledgements."""

    request_id: str = Field(..., alias="requestId", description="Echoed correlation identifier")
    delivered: bool = Field(
        ...,
        description="Whether the event was delivered immediately to an active subscriber",
        examples=[True]
    )
    status: str = Field(
        ...,
        description="Delivery status message",
        examples=["delivered"]
    )

    model_config = ConfigDict(populate_by_name=True)


class TaskEventRequestSchema(BaseModel):
    """Request schema for sending fake task events in testing mode."""

    request_id: str = Field(
        ...,
        description="Request ID of the SSE connection to send the event to",
        examples=["playwright-run-1234"]
    )
    task_id: str = Field(
        ...,
        description="Task identifier for the event",
        examples=["task-xyz-456"]
    )
    event_type: Literal["task_started", "progress_update", "task_completed", "task_failed"] = Field(
        ...,
        description="Type of task event to send",
        examples=["progress_update"]
    )
    data: dict[str, Any] | None = Field(
        default=None,
        description="Optional event-specific data payload",
        examples=[{"text": "Processing...", "value": 0.5}]
    )


class TaskEventResponseSchema(BaseModel):
    """Response schema for task event send acknowledgement."""

    request_id: str = Field(..., alias="requestId", description="Echoed request ID")
    task_id: str = Field(..., alias="taskId", description="Echoed task ID")
    event_type: str = Field(..., alias="eventType", description="Echoed event type")
    delivered: bool = Field(
        ...,
        description="Whether the event was delivered successfully",
        examples=[True]
    )

    model_config = ConfigDict(populate_by_name=True)
