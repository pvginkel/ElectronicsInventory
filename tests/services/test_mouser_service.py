"""Tests for MouserService."""

from unittest.mock import Mock

import pytest
import requests

from app.config import Settings
from app.services.download_cache_service import DownloadCacheService
from app.services.mouser_service import MouserService


@pytest.fixture
def test_settings():
    """Create test settings with Mouser API key."""
    return Settings(
        DATABASE_URL="sqlite:///:memory:",
        MOUSER_SEARCH_API_KEY="test-mouser-api-key-12345"
    )


@pytest.fixture
def test_settings_no_key():
    """Create test settings without Mouser API key."""
    return Settings(
        DATABASE_URL="sqlite:///:memory:",
        MOUSER_SEARCH_API_KEY=""
    )


@pytest.fixture
def mock_download_cache_service():
    """Create mock DownloadCacheService."""
    service = Mock(spec=DownloadCacheService)
    return service


@pytest.fixture
def mock_metrics_service():
    """Create mock MetricsService."""
    from app.services.metrics_service import MetricsServiceProtocol
    mock = Mock(spec=MetricsServiceProtocol)
    # Mock the counter and histogram attributes
    mock.mouser_api_requests_total = Mock()
    mock.mouser_api_requests_total.labels.return_value.inc = Mock()
    mock.mouser_api_duration_seconds = Mock()
    mock.mouser_api_duration_seconds.labels.return_value.observe = Mock()
    return mock


@pytest.fixture
def mouser_service(test_settings, mock_download_cache_service, mock_metrics_service):
    """Create MouserService instance."""
    return MouserService(
        config=test_settings,
        download_cache_service=mock_download_cache_service,
        metrics_service=mock_metrics_service
    )


@pytest.fixture
def mouser_service_no_key(test_settings_no_key, mock_download_cache_service, mock_metrics_service):
    """Create MouserService instance without API key."""
    return MouserService(
        config=test_settings_no_key,
        download_cache_service=mock_download_cache_service,
        metrics_service=mock_metrics_service
    )


@pytest.fixture
def sample_mouser_response():
    """Sample Mouser API response."""
    return {
        "Errors": [],
        "SearchResults": {
            "NumberOfResult": 2,
            "Parts": [
                {
                    "ManufacturerPartNumber": "OMRON-G5Q-1A4",
                    "Manufacturer": "Omron Electronics",
                    "Description": "5V SPST relay",
                    "ProductDetailUrl": "https://www.mouser.com/ProductDetail/653-G5Q-1A4",
                    "DataSheetUrl": "https://www.mouser.com/datasheet/G5Q.pdf",
                    "Category": "Relays",
                    "LeadTime": "10 Weeks",
                    "LifecycleStatus": "Active",
                    "Min": "1",
                    "Mult": "1",
                    # These fields should be filtered out
                    "MouserPartNumber": "653-G5Q-1A4",
                    "ProductAttributes": [{"Name": "Color", "Value": "Red"}],
                    "PriceBreaks": [{"Quantity": 1, "Price": "1.50"}],
                    "ProductCompliance": [{"Type": "RoHS"}],
                    "ImagePath": "https://example.com/image.jpg"
                },
                {
                    "ManufacturerPartNumber": "OMRON-G5Q-1A4-E",
                    "Manufacturer": "Omron Electronics",
                    "Description": "5V SPST relay without suppression",
                    "ProductDetailUrl": "https://www.mouser.com/ProductDetail/653-G5Q-1A4-E",
                    "DataSheetUrl": "https://www.mouser.com/datasheet/G5Q.pdf",
                    "Category": "Relays",
                    "LeadTime": "12 Weeks",
                    "LifecycleStatus": "Active",
                    "Min": "1",
                    "Mult": "1"
                }
            ]
        }
    }


class TestMouserServicePartNumberSearch:
    """Tests for search_by_part_number."""

    def test_search_by_part_number_success(
        self, mouser_service, mock_download_cache_service, sample_mouser_response
    ):
        """Should return filtered parts on successful API call."""
        mock_download_cache_service.post_cached_json.return_value = sample_mouser_response

        result = mouser_service.search_by_part_number("OMRON-G5Q-1A4")

        # Verify API call - apikey is in URL query param, no headers
        assert mock_download_cache_service.post_cached_json.called
        call_args = mock_download_cache_service.post_cached_json.call_args
        assert "apikey=test-mouser-api-key-12345" in call_args.kwargs['url']
        assert call_args.kwargs['url'].startswith("https://api.mouser.com/api/v1/search/partnumber")
        assert 'headers' not in call_args.kwargs  # API key is in URL, not headers

        # Verify result
        assert result.error is None
        assert result.total_results == 2
        assert len(result.parts) == 2

        # Verify first part
        part = result.parts[0]
        assert part.ManufacturerPartNumber == "OMRON-G5Q-1A4"
        assert part.Manufacturer == "Omron Electronics"
        assert part.Description == "5V SPST relay"

    def test_search_by_part_number_filters_excluded_fields(
        self, mouser_service, mock_download_cache_service, sample_mouser_response
    ):
        """Should filter out pricing and compliance fields."""
        mock_download_cache_service.post_cached_json.return_value = sample_mouser_response

        result = mouser_service.search_by_part_number("OMRON-G5Q-1A4")

        # Verify excluded fields are not in result
        part_dict = result.parts[0].model_dump()
        assert "MouserPartNumber" not in part_dict
        assert "ProductAttributes" not in part_dict
        assert "PriceBreaks" not in part_dict
        assert "ProductCompliance" not in part_dict
        assert "ImagePath" not in part_dict

    def test_search_by_part_number_request_body(
        self, mouser_service, mock_download_cache_service, sample_mouser_response
    ):
        """Should send correct request body."""
        mock_download_cache_service.post_cached_json.return_value = sample_mouser_response

        mouser_service.search_by_part_number("ABC123")

        call_args = mock_download_cache_service.post_cached_json.call_args
        json_body = call_args.kwargs['json_body']
        assert json_body == {
            "SearchByPartRequest": {
                "mouserPartNumber": "ABC123",
                "partSearchOptions": ""
            }
        }

    def test_search_by_part_number_no_api_key(self, mouser_service_no_key):
        """Should return error when API key not configured."""
        result = mouser_service_no_key.search_by_part_number("ABC123")

        assert result.error is not None
        assert "not configured" in result.error
        assert len(result.parts) == 0

    def test_search_by_part_number_api_error(
        self, mouser_service, mock_download_cache_service
    ):
        """Should return error response on API failure."""
        mock_download_cache_service.post_cached_json.side_effect = requests.RequestException("Network error")

        result = mouser_service.search_by_part_number("ABC123")

        assert result.error is not None
        assert "Network error" in result.error

    def test_search_by_part_number_mouser_api_errors(
        self, mouser_service, mock_download_cache_service
    ):
        """Should return error when Mouser API returns errors."""
        error_response = {
            "Errors": [
                {"Message": "Invalid API key"},
                {"Message": "Rate limit exceeded"}
            ],
            "SearchResults": {"NumberOfResult": 0, "Parts": []}
        }
        mock_download_cache_service.post_cached_json.return_value = error_response

        result = mouser_service.search_by_part_number("ABC123")

        assert result.error is not None
        assert "Invalid API key" in result.error
        assert "Rate limit exceeded" in result.error

    def test_search_by_part_number_empty_results(
        self, mouser_service, mock_download_cache_service
    ):
        """Should return empty parts list when no results found."""
        empty_response = {
            "Errors": [],
            "SearchResults": {"NumberOfResult": 0, "Parts": []}
        }
        mock_download_cache_service.post_cached_json.return_value = empty_response

        result = mouser_service.search_by_part_number("NONEXISTENT")

        assert result.error is None
        assert result.total_results == 0
        assert len(result.parts) == 0


class TestMouserServiceKeywordSearch:
    """Tests for search_by_keyword."""

    def test_search_by_keyword_success(
        self, mouser_service, mock_download_cache_service, sample_mouser_response
    ):
        """Should return filtered parts on successful keyword search."""
        mock_download_cache_service.post_cached_json.return_value = sample_mouser_response

        result = mouser_service.search_by_keyword("relay 5V")

        # Verify API call - apikey is in URL query param, no headers
        assert mock_download_cache_service.post_cached_json.called
        call_args = mock_download_cache_service.post_cached_json.call_args
        assert "apikey=test-mouser-api-key-12345" in call_args.kwargs['url']
        assert call_args.kwargs['url'].startswith("https://api.mouser.com/api/v1/search/keyword")

        # Verify request body
        json_body = call_args.kwargs['json_body']
        assert json_body['SearchByKeywordRequest']['keyword'] == "relay 5V"
        assert json_body['SearchByKeywordRequest']['records'] == 10
        assert json_body['SearchByKeywordRequest']['startingRecord'] == 0

        # Verify result
        assert result.error is None
        assert len(result.parts) == 2

    def test_search_by_keyword_with_pagination(
        self, mouser_service, mock_download_cache_service, sample_mouser_response
    ):
        """Should support pagination parameters."""
        mock_download_cache_service.post_cached_json.return_value = sample_mouser_response

        mouser_service.search_by_keyword(
            "relay 5V",
            record_count=20,
            starting_record=10
        )

        # Verify request body includes pagination
        call_args = mock_download_cache_service.post_cached_json.call_args
        json_body = call_args.kwargs['json_body']
        assert json_body['SearchByKeywordRequest']['records'] == 20
        assert json_body['SearchByKeywordRequest']['startingRecord'] == 10

    def test_search_by_keyword_no_api_key(self, mouser_service_no_key):
        """Should return error when API key not configured."""
        result = mouser_service_no_key.search_by_keyword("relay")

        assert result.error is not None
        assert "not configured" in result.error

    def test_search_by_keyword_api_error(
        self, mouser_service, mock_download_cache_service
    ):
        """Should return error response on API failure."""
        mock_download_cache_service.post_cached_json.side_effect = requests.RequestException("Timeout")

        result = mouser_service.search_by_keyword("relay")

        assert result.error is not None
        assert "Timeout" in result.error


class TestMouserServiceMetrics:
    """Tests for metrics recording."""

    def test_metrics_recorded_on_success(
        self, mouser_service, mock_download_cache_service, mock_metrics_service, sample_mouser_response
    ):
        """Should record success metrics after API call."""
        mock_download_cache_service.post_cached_json.return_value = sample_mouser_response

        mouser_service.search_by_part_number("ABC123")

        # Verify counter was incremented
        mock_metrics_service.mouser_api_requests_total.labels.assert_called_with(
            endpoint="partnumber",
            status="success"
        )

    def test_metrics_recorded_on_error(
        self, mouser_service, mock_download_cache_service, mock_metrics_service
    ):
        """Should record error metrics on API failure."""
        mock_download_cache_service.post_cached_json.side_effect = requests.RequestException("Error")

        mouser_service.search_by_part_number("ABC123")

        # Verify counter was incremented with error status
        mock_metrics_service.mouser_api_requests_total.labels.assert_called_with(
            endpoint="partnumber",
            status="error"
        )
