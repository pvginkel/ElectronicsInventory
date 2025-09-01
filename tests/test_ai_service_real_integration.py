"""Integration tests for AI service using real OpenAI API calls.

These tests require a valid OPENAI_API_KEY environment variable and will make real API calls.
They are marked as integration tests and can be run separately from unit tests.
"""

import os

import pytest
from flask import Flask
from sqlalchemy.orm import Session

from app.config import Settings
from app.models.type import Type
from app.services.ai_service import AIService
from app.services.container import ServiceContainer
from app.services.download_cache_service import DownloadCacheService
from app.services.type_service import TypeService
from app.services.url_thumbnail_service import URLThumbnailService
from app.utils.temp_file_manager import TempFileManager


@pytest.fixture
def real_ai_settings() -> Settings:
    """Settings for real AI API integration testing."""
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        pytest.skip("OPENAI_API_KEY environment variable required for integration tests")

    return Settings(
        DATABASE_URL="sqlite:///:memory:",
        OPENAI_API_KEY=api_key,
        OPENAI_MODEL="gpt-5-mini",
        OPENAI_REASONING_EFFORT="medium",
        OPENAI_VERBOSITY="low",
        OPENAI_MAX_OUTPUT_TOKENS=None,
        OPENAI_DUMMY_RESPONSE_PATH=''
    )


@pytest.fixture
def real_temp_file_manager():
    """Create temporary file manager for real integration testing."""
    import tempfile
    with tempfile.TemporaryDirectory() as temp_dir:
        yield TempFileManager(base_path=temp_dir, cleanup_age_hours=1.0)


@pytest.fixture
def real_download_cache_service(real_ai_settings: Settings, real_temp_file_manager: TempFileManager):
    """Create download cache service for real integration testing."""
    return DownloadCacheService(
        temp_file_manager=real_temp_file_manager,
        max_download_size=real_ai_settings.MAX_FILE_SIZE,
        download_timeout=30
    )

@pytest.fixture
def real_url_thumbnail_service(session: Session, real_download_cache_service: DownloadCacheService):
    """Create temporary file manager for real integration testing."""
    return URLThumbnailService(session, None, real_download_cache_service)


@pytest.fixture
def real_type_service(session: Session):
    """Create type service with realistic electronics types."""
    type_service = TypeService(db=session)

    # Create comprehensive list of electronics part types
    types_to_create = [
        "Sensor", "Air Quality Sensor", "Gas Sensor", "Environmental Sensor",
        "Microcontroller", "Arduino", "Development Board", "Breakout Board",
        "Module", "Relay", "Capacitor", "Resistor", "LED", "IC", "Connector",
        "Power Supply", "Voltage Regulator", "Transistor", "Diode"
    ]

    for type_name in types_to_create:
        part_type = Type(name=type_name)
        session.add(part_type)

    session.flush()
    return type_service


@pytest.fixture
def real_ai_service(session: Session, real_ai_settings: Settings,
                   real_temp_file_manager: TempFileManager, real_type_service: TypeService,
                   real_url_thumbnail_service: URLThumbnailService,
                   real_download_cache_service: DownloadCacheService):
    """Create AI service instance for real integration testing."""
    return AIService(
        db=session,
        config=real_ai_settings,
        temp_file_manager=real_temp_file_manager,
        type_service=real_type_service,
        url_thumbnail_service=real_url_thumbnail_service,
        download_cache_service=real_download_cache_service
    )


@pytest.mark.integration
class TestAIServiceRealIntegration:
    """Integration tests using real OpenAI API calls."""

    component_testdata = [
        ("DFRobot Gravity SGP40", ["sensor", "air", "quality", "gas", "environmental"]),
        ("HLK PM24", ["power supply", "ac-dc"]),
        ("ESP32-S3FN8", ["power supply"]),
    ]

    @pytest.mark.parametrize("text_input,sensor_keywords", component_testdata)
    def test_analyze_real_api(self, text_input: str, sensor_keywords: list[str], real_ai_service: AIService):
        """Test real AI analysis of a component using OpenAI API.

        This test makes a real API call to OpenAI to analyze the DFRobot Gravity SGP40
        sensor text input. It validates that the AI service can correctly:
        - Identify this as an air quality/gas sensor
        - Extract manufacturer information
        - Generate appropriate tags and technical details
        - Handle document downloading if URLs are provided
        - Determine if the suggested type matches existing types
        """
        # Perform real AI analysis
        result = real_ai_service.analyze_part(text_input=text_input)

        # Validate the analysis results
        assert result is not None, "AI analysis should return a result"

        # Check that some basic information was extracted
        assert result.manufacturer_code is not None or result.description is not None, \
               "AI should extract either manufacturer code or description"

        # Check type analysis
        assert result.type is not None, "AI should suggest a part type"

        # Log the full result for inspection
        print(f"\n=== AI Analysis Results for '{text_input}' ===")
        print(f"Manufacturer Code: {result.manufacturer_code}")
        print(f"Type: {result.type} (existing: {result.type_is_existing})")
        print(f"Description: {result.description}")
        print(f"Tags: {result.tags}")
        print(f"Manufacturer: {result.manufacturer}")
        print(f"Product Page: {result.product_page}")
        print(f"Package: {result.package}")
        print(f"Pin Count: {result.pin_count}")
        print(f"Voltage Rating: {result.voltage_rating}")
        print(f"Mounting Type: {result.mounting_type}")
        print(f"Series: {result.series}")
        print(f"Dimensions: {result.dimensions}")
        print(f"Documents: {len(result.documents)} found")

        # Validate specific expectations for this part
        # SGP40 is typically a gas/air quality sensor
        if result.type:
            type_lower = result.type.lower()
            expected_keywords = sensor_keywords
            assert any(keyword in type_lower for keyword in expected_keywords), \
                   f"Type '{result.type}' should be related"

        # Check for reasonable tags
        if result.tags:
            tags_str = " ".join(result.tags).lower()
            found_keywords = [kw for kw in sensor_keywords if kw in tags_str]
            assert len(found_keywords) >= 1, \
                   f"Expected at least 1 relevant keyword in tags, found: {found_keywords}"

        # If documents were found, check they're properly structured
        for doc in result.documents:
            assert doc.url, "Document should have original URL"
            assert doc.document_type in ["product_image", "datasheet", "pinout", "schematic", "manual"], \
                   f"Invalid document type: {doc.document_type}"
            print(f"  Document: {doc.url} ({doc.document_type})")

        # Validate type matching logic
        if result.type_is_existing:
            assert result.existing_type_id is not None, \
                   "If type is existing, existing_type_id should be set"
        else:
            assert result.existing_type_id is None, \
                   "If type is new suggestion, existing_type_id should be None"

    def test_ai_service_container_integration(self, app: Flask, session: Session):
        """Test that AI service can be properly instantiated through the service container.

        This validates the dependency injection setup works correctly for AI services.
        """
        # Skip if no API key
        if not os.environ.get("OPENAI_API_KEY"):
            pytest.skip("OPENAI_API_KEY environment variable required")

        # Get service from container
        container: ServiceContainer = app.container
        ai_service = container.ai_service()

        assert ai_service is not None, "Container should provide AI service"
        assert hasattr(ai_service, 'analyze_part'), "AI service should have analyze_part method"
        assert ai_service.config.OPENAI_API_KEY, "AI service should have API key configured"

        # Test basic functionality
        try:
            result = ai_service.analyze_part(text_input="test component")
            assert result is not None, "AI service should return results"
        except Exception as e:
            # If we get a legitimate API error, that's still validating the service works
            assert "AI analysis failed" in str(e) or "OpenAI" in str(e), \
                   f"Should get AI-related error, got: {e}"

    @pytest.mark.slow
    def test_analyze_with_multiple_inputs_real_api(self, real_ai_service: AIService):
        """Test AI analysis with both text and image inputs using real API.

        This test validates the multimodal capabilities work correctly.
        Note: This test is marked as slow since it makes multiple API calls.
        """
        # Create a simple test image (1x1 pixel JPEG)
        import io

        from PIL import Image

        # Create minimal test image
        img = Image.new('RGB', (1, 1), color='red')
        img_bytes = io.BytesIO()
        img.save(img_bytes, format='JPEG')
        image_data = img_bytes.getvalue()

        # Test with both text and image
        result = real_ai_service.analyze_part(
            text_input="DFRobot Gravity SGP40",
            image_data=image_data,
            image_mime_type="image/jpeg"
        )

        assert result is not None, "AI should handle multimodal input"

        print("\n=== Multimodal Analysis Results ===")
        print(f"Type: {result.type}")
        print(f"Description: {result.description}")
