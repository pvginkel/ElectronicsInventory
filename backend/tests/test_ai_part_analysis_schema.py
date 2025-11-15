"""Tests for AI part analysis schema validation."""

import pytest
from pydantic import ValidationError

from app.schemas.ai_part_analysis import (
    AIPartAnalysisResultSchema,
    PartAnalysisDetailsSchema,
)
from app.schemas.duplicate_search import DuplicateMatchEntry


class TestAIPartAnalysisResultSchemaValidator:
    """Test the validator logic for AIPartAnalysisResultSchema."""

    def test_validate_with_failure_reason_only(self):
        """Test that failure_reason alone is valid."""
        schema = AIPartAnalysisResultSchema(
            analysis_result=None,
            duplicate_parts=None,
            analysis_failure_reason="Please be more specific - do you need an SMD or through-hole resistor?"
        )

        assert schema.analysis_result is None
        assert schema.duplicate_parts is None
        assert schema.analysis_failure_reason == "Please be more specific - do you need an SMD or through-hole resistor?"

    def test_validate_with_all_fields_null_raises_error(self):
        """Test that all null fields raises ValueError."""
        with pytest.raises(ValidationError) as exc_info:
            AIPartAnalysisResultSchema(
                analysis_result=None,
                duplicate_parts=None,
                analysis_failure_reason=None
            )

        assert "At least one of analysis_result, duplicate_parts, or analysis_failure_reason must be populated" in str(exc_info.value)

    def test_validate_with_empty_string_failure_reason_raises_error(self):
        """Test that empty string in failure_reason is treated as invalid."""
        with pytest.raises(ValidationError) as exc_info:
            AIPartAnalysisResultSchema(
                analysis_result=None,
                duplicate_parts=None,
                analysis_failure_reason=""
            )

        assert "At least one of analysis_result, duplicate_parts, or analysis_failure_reason must be populated" in str(exc_info.value)

    def test_validate_with_whitespace_only_failure_reason_raises_error(self):
        """Test that whitespace-only string in failure_reason is treated as invalid."""
        with pytest.raises(ValidationError) as exc_info:
            AIPartAnalysisResultSchema(
                analysis_result=None,
                duplicate_parts=None,
                analysis_failure_reason="   "
            )

        assert "At least one of analysis_result, duplicate_parts, or analysis_failure_reason must be populated" in str(exc_info.value)

    def test_validate_with_analysis_result_only(self):
        """Test that analysis_result alone is valid (existing behavior)."""
        analysis_details = PartAnalysisDetailsSchema(
            manufacturer_code="TEST-123",
            type="Resistor",
            description="Test resistor"
        )

        schema = AIPartAnalysisResultSchema(
            analysis_result=analysis_details,
            duplicate_parts=None,
            analysis_failure_reason=None
        )

        assert schema.analysis_result is not None
        assert schema.duplicate_parts is None
        assert schema.analysis_failure_reason is None

    def test_validate_with_duplicate_parts_only(self):
        """Test that duplicate_parts alone is valid (existing behavior)."""
        duplicate_entry = DuplicateMatchEntry(
            part_key="ABCD",
            confidence="high",
            reasoning="Exact match"
        )

        schema = AIPartAnalysisResultSchema(
            analysis_result=None,
            duplicate_parts=[duplicate_entry],
            analysis_failure_reason=None
        )

        assert schema.analysis_result is None
        assert schema.duplicate_parts is not None
        assert len(schema.duplicate_parts) == 1
        assert schema.analysis_failure_reason is None

    def test_validate_with_analysis_and_failure_reason(self):
        """Test that analysis_result and failure_reason can coexist."""
        analysis_details = PartAnalysisDetailsSchema(
            manufacturer_code="TEST-123",
            type="Resistor",
            description="Generic resistor"
        )

        schema = AIPartAnalysisResultSchema(
            analysis_result=analysis_details,
            duplicate_parts=None,
            analysis_failure_reason="Partial info available but please specify package type"
        )

        assert schema.analysis_result is not None
        assert schema.duplicate_parts is None
        assert schema.analysis_failure_reason == "Partial info available but please specify package type"

    def test_validate_with_duplicates_and_failure_reason(self):
        """Test that duplicate_parts and failure_reason can coexist."""
        duplicate_entry = DuplicateMatchEntry(
            part_key="XYZW",
            confidence="medium",
            reasoning="Similar specs but uncertain"
        )

        schema = AIPartAnalysisResultSchema(
            analysis_result=None,
            duplicate_parts=[duplicate_entry],
            analysis_failure_reason="Matches found but may not be exact - please clarify manufacturer"
        )

        assert schema.analysis_result is None
        assert schema.duplicate_parts is not None
        assert len(schema.duplicate_parts) == 1
        assert schema.analysis_failure_reason == "Matches found but may not be exact - please clarify manufacturer"

    def test_validate_with_analysis_and_duplicates(self):
        """Test that analysis_result and duplicate_parts can coexist (existing behavior)."""
        analysis_details = PartAnalysisDetailsSchema(
            manufacturer_code="TEST-123",
            type="Relay",
            description="5V relay"
        )

        duplicate_entry = DuplicateMatchEntry(
            part_key="RLAY",
            confidence="medium",
            reasoning="Similar specs"
        )

        schema = AIPartAnalysisResultSchema(
            analysis_result=analysis_details,
            duplicate_parts=[duplicate_entry],
            analysis_failure_reason=None
        )

        assert schema.analysis_result is not None
        assert schema.duplicate_parts is not None
        assert len(schema.duplicate_parts) == 1
        assert schema.analysis_failure_reason is None

    def test_validate_with_all_three_fields_populated(self):
        """Test that all three fields can be populated simultaneously."""
        analysis_details = PartAnalysisDetailsSchema(
            manufacturer_code="TEST-123",
            type="Relay",
            description="5V relay"
        )

        duplicate_entry = DuplicateMatchEntry(
            part_key="RLAY",
            confidence="medium",
            reasoning="Similar specs"
        )

        schema = AIPartAnalysisResultSchema(
            analysis_result=analysis_details,
            duplicate_parts=[duplicate_entry],
            analysis_failure_reason="Found similar parts but please verify specifications"
        )

        assert schema.analysis_result is not None
        assert schema.duplicate_parts is not None
        assert len(schema.duplicate_parts) == 1
        assert schema.analysis_failure_reason == "Found similar parts but please verify specifications"
