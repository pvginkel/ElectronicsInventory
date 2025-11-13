"""Duplicate search schemas for AI-powered duplicate detection."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class DuplicateSearchRequest(BaseModel):
    """Request schema for duplicate search function (free-form search string)."""

    model_config = ConfigDict(extra="forbid", json_schema_extra={"additionalProperties": False})

    search: str = Field(
        description="Component description with technical details extracted by LLM (MPN, manufacturer, package, voltage, pins, etc.)",
        json_schema_extra={"example": "OMRON G5Q-1A4 5V SPST relay, THT package, 5 pins"}
    )


class DuplicateMatchEntry(BaseModel):
    """Schema for a single duplicate match result."""

    model_config = ConfigDict(extra="forbid")

    part_key: str = Field(
        description="4-character key of the potentially duplicate part",
        json_schema_extra={"example": "ABCD"}
    )
    confidence: Literal["high", "medium"] = Field(
        description="Confidence level of the match (high or medium only)",
        json_schema_extra={"example": "high"}
    )
    reasoning: str = Field(
        description="Explanation of why this part matches",
        json_schema_extra={"example": "Exact manufacturer part number match with same manufacturer"}
    )


class DuplicateSearchResponse(BaseModel):
    """Response schema for duplicate search function."""

    model_config = ConfigDict(extra="forbid")

    matches: list[DuplicateMatchEntry] = Field(
        default=[],
        description="List of potential duplicate parts (medium or high confidence only)"
    )


class DuplicateMatchLLMResponse(BaseModel):
    """Internal schema for LLM structured output during duplicate matching.

    This is used by the second LLM chain to return duplicate matches.
    """

    model_config = ConfigDict(extra="forbid")

    matches: list[DuplicateMatchEntry] = Field(
        default=[],
        description="List of potential duplicate parts (medium or high confidence only, low confidence filtered out)"
    )
