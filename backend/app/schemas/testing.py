"""Pydantic schemas for testing API endpoints."""

from pydantic import BaseModel


class TestResetResponseSchema(BaseModel):
    """Response schema for database reset endpoint."""
    message: str


class TestHealthResponseSchema(BaseModel):
    """Response schema for test health endpoint."""
    status: str
    environment: str
    message: str
