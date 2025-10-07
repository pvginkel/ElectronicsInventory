"""Pydantic schemas for testing API endpoints."""

from pydantic import BaseModel, ConfigDict, Field


class TestResetResponseSchema(BaseModel):
    """Response schema for database reset endpoint."""

    status: str = Field(..., description="Reset operation status", examples=["complete"])
    mode: str = Field(..., description="Environment mode", examples=["testing"])
    seeded: bool = Field(..., description="Whether test data was loaded", examples=[True])
    migrations_applied: int = Field(
        ...,
        description="Number of database migrations applied",
        examples=[5]
    )


class LogEventSchema(BaseModel):
    """Schema for log events in SSE stream."""

    timestamp: str = Field(..., description="ISO timestamp", examples=["2024-01-15T10:30:45.123Z"])
    level: str = Field(..., description="Log level", examples=["ERROR"])
    logger: str = Field(..., description="Logger name", examples=["app.services.type_service"])
    message: str = Field(..., description="Log message", examples=["Failed to delete type"])
    correlation_id: str | None = Field(None, description="Request correlation ID", examples=["abc-123"])
    extra: dict | None = Field(None, description="Additional log data")


class TestErrorResponseSchema(BaseModel):
    """Schema for testing API error responses."""

    error: str = Field(..., description="Error message", examples=["Database reset already in progress"])
    status: str = Field(..., description="Operation status", examples=["busy"])


class ContentImageQuerySchema(BaseModel):
    """Query parameters for deterministic testing image content."""

    text: str = Field(
        ...,
        description="Text to render on the generated PNG image",
        examples=["Playwright Test Image"]
    )


class ContentHtmlQuerySchema(BaseModel):
    """Query parameters for deterministic HTML content fixtures."""

    title: str = Field(
        ...,
        description="Title to embed in the rendered HTML fixture",
        examples=["Playwright Fixture Page"]
    )


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
