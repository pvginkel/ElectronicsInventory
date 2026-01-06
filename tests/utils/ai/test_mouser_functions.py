"""Tests for Mouser AI function tools."""

from unittest.mock import Mock

import pytest

from app.schemas.mouser import (
    MouserSearchByKeywordRequest,
    MouserSearchByPartNumberRequest,
    MouserSearchResponse,
)
from app.services.base_task import ProgressHandle
from app.services.download_cache_service import DownloadCacheService
from app.services.mouser_service import MouserService
from app.utils.ai.ai_runner import AIRunner
from app.utils.ai.mouser_search import (
    SearchMouserByKeywordFunction,
    SearchMouserByPartNumberFunction,
)


@pytest.fixture
def mock_progress_handle():
    """Create mock progress handle."""
    return Mock(spec=ProgressHandle)


@pytest.fixture
def mock_mouser_service():
    """Create mock MouserService."""
    return Mock(spec=MouserService)


@pytest.fixture
def mock_download_cache_service():
    """Create mock DownloadCacheService."""
    return Mock(spec=DownloadCacheService)


@pytest.fixture
def mock_ai_runner():
    """Create mock AIRunner."""
    return Mock(spec=AIRunner)


class TestSearchMouserByPartNumberFunction:
    """Tests for SearchMouserByPartNumberFunction."""

    def test_get_name(self, mock_mouser_service):
        """Should return correct function name."""
        func = SearchMouserByPartNumberFunction(mock_mouser_service)
        assert func.get_name() == "search_mouser_by_part_number"

    def test_get_model(self, mock_mouser_service):
        """Should return correct request model."""
        func = SearchMouserByPartNumberFunction(mock_mouser_service)
        assert func.get_model() == MouserSearchByPartNumberRequest

    def test_execute_success(self, mock_mouser_service, mock_progress_handle):
        """Should execute search and return results."""
        # Setup mock service response
        mock_response = MouserSearchResponse(
            parts=[],
            total_results=0
        )
        mock_mouser_service.search_by_part_number.return_value = mock_response

        # Create function and execute
        func = SearchMouserByPartNumberFunction(mock_mouser_service)
        request = MouserSearchByPartNumberRequest(part_number="ABC123")
        result = func.execute(request, mock_progress_handle)

        # Verify service was called correctly
        mock_mouser_service.search_by_part_number.assert_called_once_with("ABC123")

        # Verify result
        assert isinstance(result, MouserSearchResponse)
        assert result.error is None

    def test_execute_with_service_error(
        self, mock_mouser_service, mock_progress_handle
    ):
        """Should catch service exceptions and return error response."""
        # Setup mock to raise exception
        mock_mouser_service.search_by_part_number.side_effect = Exception(
            "Network timeout"
        )

        # Create function and execute
        func = SearchMouserByPartNumberFunction(mock_mouser_service)
        request = MouserSearchByPartNumberRequest(part_number="ABC123")
        result = func.execute(request, mock_progress_handle)

        # Should return error response instead of raising
        assert isinstance(result, MouserSearchResponse)
        assert result.error is not None
        assert "Network timeout" in result.error


class TestSearchMouserByKeywordFunction:
    """Tests for SearchMouserByKeywordFunction."""

    def test_get_name(self, mock_mouser_service):
        """Should return correct function name."""
        func = SearchMouserByKeywordFunction(mock_mouser_service)
        assert func.get_name() == "search_mouser_by_keyword"

    def test_get_model(self, mock_mouser_service):
        """Should return correct request model."""
        func = SearchMouserByKeywordFunction(mock_mouser_service)
        assert func.get_model() == MouserSearchByKeywordRequest

    def test_execute_success(self, mock_mouser_service, mock_progress_handle):
        """Should execute keyword search with all parameters."""
        # Setup mock service response
        mock_response = MouserSearchResponse(
            parts=[],
            total_results=0
        )
        mock_mouser_service.search_by_keyword.return_value = mock_response

        # Create function and execute with pagination
        func = SearchMouserByKeywordFunction(mock_mouser_service)
        request = MouserSearchByKeywordRequest(
            keyword="relay 5V",
            record_count=20,
            starting_record=10
        )
        result = func.execute(request, mock_progress_handle)

        # Verify service was called with all parameters
        mock_mouser_service.search_by_keyword.assert_called_once_with(
            keyword="relay 5V",
            record_count=20,
            starting_record=10
        )

        # Verify result
        assert isinstance(result, MouserSearchResponse)

    def test_execute_with_defaults(self, mock_mouser_service, mock_progress_handle):
        """Should use default pagination values."""
        mock_response = MouserSearchResponse(parts=[], total_results=0)
        mock_mouser_service.search_by_keyword.return_value = mock_response

        func = SearchMouserByKeywordFunction(mock_mouser_service)
        request = MouserSearchByKeywordRequest(keyword="relay")
        _result = func.execute(request, mock_progress_handle)

        # Verify defaults were used
        mock_mouser_service.search_by_keyword.assert_called_once_with(
            keyword="relay",
            record_count=10,  # Default
            starting_record=0  # Default
        )
