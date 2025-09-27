"""Pydantic schemas for testing API endpoints."""

from pydantic import BaseModel, Field


class TestResetResponseSchema(BaseModel):
    """Response schema for database reset endpoint."""

    status: str = Field(..., description="Reset operation status", example="complete")
    mode: str = Field(..., description="Environment mode", example="testing")
    seeded: bool = Field(..., description="Whether test data was loaded", example=True)
    migrations_applied: int = Field(
        ...,
        description="Number of database migrations applied",
        example=5
    )


class LogEventSchema(BaseModel):
    """Schema for log events in SSE stream."""

    timestamp: str = Field(..., description="ISO timestamp", example="2024-01-15T10:30:45.123Z")
    level: str = Field(..., description="Log level", example="ERROR")
    logger: str = Field(..., description="Logger name", example="app.services.type_service")
    message: str = Field(..., description="Log message", example="Failed to delete type")
    correlation_id: str | None = Field(None, description="Request correlation ID", example="abc-123")
    extra: dict | None = Field(None, description="Additional log data")


class TestErrorResponseSchema(BaseModel):
    """Schema for testing API error responses."""

    error: str = Field(..., description="Error message", example="Database reset already in progress")
    status: str = Field(..., description="Operation status", example="busy")


class FakeImageQuerySchema(BaseModel):
    """Query parameters for the fake image generation endpoint."""

    text: str = Field(
        ...,
        description="Text to render on the generated image",
        example="Playwright Test"
    )
