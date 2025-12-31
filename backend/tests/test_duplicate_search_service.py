"""Tests for DuplicateSearchService."""

from unittest.mock import Mock

import pytest
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.config import Settings
from app.models.attachment_set import AttachmentSet
from app.models.part import Part
from app.models.type import Type
from app.schemas.duplicate_search import (
    DuplicateMatchEntry,
    DuplicateMatchLLMResponse,
    DuplicateSearchRequest,
)
from app.services.duplicate_search_service import DuplicateSearchService
from app.services.part_service import PartService
from app.utils.ai.ai_runner import AIResponse, AIRunner
from tests.testing_utils import StubMetricsService


class AttachmentSetStub:
    """Minimal stub for AttachmentSetService that creates real attachment sets."""

    def __init__(self, db):
        self.db = db

    def create_attachment_set(self) -> AttachmentSet:
        attachment_set = AttachmentSet()
        self.db.add(attachment_set)
        self.db.flush()
        return attachment_set


@pytest.fixture
def test_settings() -> Settings:
    """Settings for duplicate search testing."""
    return Settings(
        DATABASE_URL="sqlite:///:memory:",
        OPENAI_API_KEY="test-api-key",
        OPENAI_MODEL="gpt-5-mini",
        OPENAI_REASONING_EFFORT="low",
        OPENAI_VERBOSITY="medium",
        OPENAI_MAX_OUTPUT_TOKENS=None,
    )


@pytest.fixture
def mock_metrics_service():
    """Create stub metrics service."""
    return StubMetricsService()


@pytest.fixture
def sample_parts(session: Session, make_attachment_set) -> list[Part]:
    """Create sample parts for testing."""

    # Create a type
    relay_type = Type(name="Relay")
    session.add(relay_type)
    session.flush()

    # Create attachment sets for each part
    attachment_set1 = make_attachment_set()
    attachment_set2 = make_attachment_set()
    attachment_set3 = make_attachment_set()

    parts = [
        Part(
            key="ABCD",
            manufacturer_code="OMRON G5Q-1A4",
            type_id=relay_type.id,
            description="5V SPST relay with coil suppression",
            tags=["5v", "spst", "relay"],
            manufacturer="OMRON",
            package="THT",
            series="G5Q",
            voltage_rating="5V",
            pin_count=5,
            attachment_set_id=attachment_set1.id,
        ),
        Part(
            key="XYZW",
            manufacturer_code="OMRON G5Q-1A4-E",
            type_id=relay_type.id,
            description="5V SPST relay without coil suppression",
            tags=["5v", "spst", "relay"],
            manufacturer="OMRON",
            package="THT",
            series="G5Q",
            voltage_rating="5V",
            pin_count=5,
            attachment_set_id=attachment_set2.id,
        ),
        Part(
            key="EFGH",
            manufacturer_code="NEC EA2-5V",
            type_id=relay_type.id,
            description="5V DPDT relay",
            tags=["5v", "dpdt", "relay"],
            manufacturer="NEC",
            package="THT",
            voltage_rating="5V",
            pin_count=8,
            attachment_set_id=attachment_set3.id,
        ),
    ]

    session.add_all(parts)
    session.flush()
    return parts


class TestDuplicateSearchService:
    """Test cases for DuplicateSearchService."""

    def test_search_duplicates_exact_match(
        self, session: Session, test_settings: Settings, sample_parts: list[Part], mock_metrics_service
    ):
        """Test duplicate search with exact MPN match."""
        attachment_set_service = AttachmentSetStub(db=session)
        part_service = PartService(db=session, attachment_set_service=attachment_set_service)

        # Create mock AI runner that returns high-confidence match
        mock_runner = Mock(spec=AIRunner)
        mock_response = Mock(spec=AIResponse)
        mock_response.response = DuplicateMatchLLMResponse(
            matches=[
                DuplicateMatchEntry(
                    part_key="ABCD",
                    confidence="high",
                    reasoning="Exact manufacturer part number match"
                )
            ]
        )
        mock_runner.run.return_value = mock_response

        service = DuplicateSearchService(
            config=test_settings,
            part_service=part_service,
            ai_runner=mock_runner,
            metrics_service=mock_metrics_service,
        )

        request = DuplicateSearchRequest(search="OMRON G5Q-1A4 5V SPST relay")
        response = service.search_duplicates(request)

        assert len(response.matches) == 1
        assert response.matches[0].part_key == "ABCD"
        assert response.matches[0].confidence == "high"
        assert mock_runner.run.called

    def test_search_duplicates_multiple_matches(
        self, session: Session, test_settings: Settings, sample_parts: list[Part], mock_metrics_service
    ):
        """Test duplicate search returning multiple matches with mixed confidence."""
        attachment_set_service = AttachmentSetStub(db=session)
        part_service = PartService(db=session, attachment_set_service=attachment_set_service)

        # Mock runner returns both high and medium confidence matches
        mock_runner = Mock(spec=AIRunner)
        mock_response = Mock(spec=AIResponse)
        mock_response.response = DuplicateMatchLLMResponse(
            matches=[
                DuplicateMatchEntry(
                    part_key="ABCD",
                    confidence="high",
                    reasoning="Exact MPN match"
                ),
                DuplicateMatchEntry(
                    part_key="XYZW",
                    confidence="medium",
                    reasoning="Same series and specs, variant part number"
                )
            ]
        )
        mock_runner.run.return_value = mock_response

        service = DuplicateSearchService(
            config=test_settings,
            part_service=part_service,
            ai_runner=mock_runner,
            metrics_service=mock_metrics_service,
        )

        request = DuplicateSearchRequest(search="OMRON G5Q-1A4")
        response = service.search_duplicates(request)

        assert len(response.matches) == 2
        assert any(m.confidence == "high" for m in response.matches)
        assert any(m.confidence == "medium" for m in response.matches)

    def test_search_duplicates_no_matches(
        self, session: Session, test_settings: Settings, sample_parts: list[Part], mock_metrics_service
    ):
        """Test duplicate search with no matches found."""
        attachment_set_service = AttachmentSetStub(db=session)
        part_service = PartService(db=session, attachment_set_service=attachment_set_service)

        mock_runner = Mock(spec=AIRunner)
        mock_response = Mock(spec=AIResponse)
        mock_response.response = DuplicateMatchLLMResponse(matches=[])
        mock_runner.run.return_value = mock_response

        service = DuplicateSearchService(
            config=test_settings,
            part_service=part_service,
            ai_runner=mock_runner,
            metrics_service=mock_metrics_service,
        )

        request = DuplicateSearchRequest(search="ESP32-S3-WROOM-1 WiFi module")
        response = service.search_duplicates(request)

        assert len(response.matches) == 0

    def test_search_duplicates_empty_inventory(
        self, session: Session, test_settings: Settings, mock_metrics_service
    ):
        """Test duplicate search with empty inventory."""
        attachment_set_service = AttachmentSetStub(db=session)
        part_service = PartService(db=session, attachment_set_service=attachment_set_service)

        # No AI runner needed - should return early
        service = DuplicateSearchService(
            config=test_settings,
            part_service=part_service,
            ai_runner=None,
            metrics_service=mock_metrics_service,
        )

        request = DuplicateSearchRequest(search="Some part")
        response = service.search_duplicates(request)

        assert len(response.matches) == 0

    def test_search_duplicates_llm_validation_error(
        self, session: Session, test_settings: Settings, sample_parts: list[Part], mock_metrics_service
    ):
        """Test graceful handling of LLM returning invalid response schema."""
        attachment_set_service = AttachmentSetStub(db=session)
        part_service = PartService(db=session, attachment_set_service=attachment_set_service)

        # Mock runner returns invalid response that fails Pydantic validation
        mock_runner = Mock(spec=AIRunner)
        mock_runner.run.side_effect = ValidationError.from_exception_data(
            "test", [{"type": "missing", "loc": ("matches",), "input": {}}]
        )

        service = DuplicateSearchService(
            config=test_settings,
            part_service=part_service,
            ai_runner=mock_runner,
            metrics_service=mock_metrics_service,
        )

        request = DuplicateSearchRequest(search="Some part")
        response = service.search_duplicates(request)

        # Should return empty matches on error (graceful degradation)
        assert len(response.matches) == 0

    def test_search_duplicates_llm_network_error(
        self, session: Session, test_settings: Settings, sample_parts: list[Part], mock_metrics_service
    ):
        """Test graceful handling of network/API errors."""
        attachment_set_service = AttachmentSetStub(db=session)
        part_service = PartService(db=session, attachment_set_service=attachment_set_service)

        mock_runner = Mock(spec=AIRunner)
        mock_runner.run.side_effect = Exception("Network error")

        service = DuplicateSearchService(
            config=test_settings,
            part_service=part_service,
            ai_runner=mock_runner,
            metrics_service=mock_metrics_service,
        )

        request = DuplicateSearchRequest(search="Some part")
        response = service.search_duplicates(request)

        # Should return empty matches on error (graceful degradation)
        assert len(response.matches) == 0

    def test_build_prompt_with_parts(
        self, session: Session, test_settings: Settings, sample_parts: list[Part], mock_metrics_service
    ):
        """Test that prompt includes parts inventory as JSON."""
        attachment_set_service = AttachmentSetStub(db=session)
        part_service = PartService(db=session, attachment_set_service=attachment_set_service)

        service = DuplicateSearchService(
            config=test_settings,
            part_service=part_service,
            ai_runner=None,
            metrics_service=mock_metrics_service,
        )

        parts_data = part_service.get_all_parts_for_search()
        prompt = service._build_prompt(parts_data)

        # Verify prompt contains JSON representation of parts
        assert "ABCD" in prompt
        assert "OMRON G5Q-1A4" in prompt
        assert "Relay" in prompt
        # Verify it's valid JSON embedded in the prompt
        assert '"key"' in prompt
        assert '"manufacturer_code"' in prompt

    def test_search_duplicates_with_generic_description(
        self, session: Session, test_settings: Settings, sample_parts: list[Part], mock_metrics_service
    ):
        """Test duplicate search with generic description (should find no high-confidence matches)."""
        attachment_set_service = AttachmentSetStub(db=session)
        part_service = PartService(db=session, attachment_set_service=attachment_set_service)

        mock_runner = Mock(spec=AIRunner)
        mock_response = Mock(spec=AIResponse)
        # LLM returns medium confidence only for generic searches
        mock_response.response = DuplicateMatchLLMResponse(
            matches=[
                DuplicateMatchEntry(
                    part_key="ABCD",
                    confidence="medium",
                    reasoning="Generic relay description matches type but lacks specific details"
                )
            ]
        )
        mock_runner.run.return_value = mock_response

        service = DuplicateSearchService(
            config=test_settings,
            part_service=part_service,
            ai_runner=mock_runner,
            metrics_service=mock_metrics_service,
        )

        request = DuplicateSearchRequest(search="5V relay")
        response = service.search_duplicates(request)

        assert len(response.matches) == 1
        assert response.matches[0].confidence == "medium"
