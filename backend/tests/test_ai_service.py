"""Tests for AI service."""

import base64
import json
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, Mock, patch

import pytest
from flask import Flask
from sqlalchemy.orm import Session

from app.config import Settings
from app.exceptions import RecordNotFoundException
from app.models.type import Type
from app.services.ai_service import AIService
from app.services.container import ServiceContainer
from app.services.type_service import TypeService
from app.utils.temp_file_manager import TempFileManager


@pytest.fixture
def ai_test_settings() -> Settings:
    """Settings for AI service testing."""
    return Settings(
        DATABASE_URL="sqlite:///:memory:",
        OPENAI_API_KEY="test-api-key",
        OPENAI_MODEL="gpt-5-mini",
        OPENAI_REASONING_EFFORT="medium",
        OPENAI_VERBOSITY="medium",
        OPENAI_MAX_OUTPUT_TOKENS=None,
    )


@pytest.fixture
def temp_file_manager():
    """Create temporary file manager for testing."""
    with tempfile.TemporaryDirectory() as temp_dir:
        yield TempFileManager(base_path=temp_dir, cleanup_age_hours=1.0)


@pytest.fixture
def mock_type_service(session: Session):
    """Create mock type service with sample types."""
    type_service = TypeService(db=session)
    
    # Create sample types
    relay_type = Type(name="Relay")
    micro_type = Type(name="Microcontroller")
    session.add_all([relay_type, micro_type])
    session.flush()
    
    return type_service


@pytest.fixture
def ai_service(session: Session, ai_test_settings: Settings, 
               temp_file_manager: TempFileManager, mock_type_service: TypeService):
    """Create AI service instance for testing."""
    return AIService(
        db=session,
        config=ai_test_settings,
        temp_file_manager=temp_file_manager,
        type_service=mock_type_service
    )


class TestAIService:
    """Test cases for AIService."""

    def test_init_without_api_key(self, session: Session, temp_file_manager: TempFileManager, 
                                  mock_type_service: TypeService):
        """Test AI service initialization without API key."""
        settings = Settings(DATABASE_URL="sqlite:///:memory:", OPENAI_API_KEY="")
        
        with pytest.raises(ValueError, match="OPENAI_API_KEY configuration is required"):
            AIService(
                db=session,
                config=settings,
                temp_file_manager=temp_file_manager,
                type_service=mock_type_service
            )

    def test_analyze_part_no_input(self, ai_service: AIService):
        """Test analyze_part with no text or image input."""
        with pytest.raises(ValueError, match="Either text_input or image_data must be provided"):
            ai_service.analyze_part()

    @patch('app.services.ai_service.OpenAI')
    def test_analyze_part_text_only_success(self, mock_openai_class, ai_service: AIService, 
                                          temp_file_manager: TempFileManager):
        """Test successful AI analysis with text input only."""
        # Mock OpenAI response
        mock_client = Mock()
        mock_openai_class.return_value = mock_client
        
        mock_response = Mock()
        # Simulate Responses API returning structured JSON as text
        mock_response.output_text = json.dumps({
            "manufacturer_code": "TEST123",
            "type": "Relay",
            "description": "Test relay component",
            "tags": ["relay", "12V"],
            "seller": "Test Supplier",
            "seller_link": "https://example.com/product",
            "package": "DIP-8",
            "pin_count": 8,
            "voltage_rating": "12V",
            "mounting_type": "Through-hole",
            "series": "Test Series",
            "dimensions": "10x8x5mm",
            "documents": [],
            "suggested_image_url": None
        })
        mock_client.responses.create.return_value = mock_response
        
        # Initialize the client
        ai_service.client = mock_client
        
        # Perform analysis
        result = ai_service.analyze_part(text_input="Test relay 12V")
        
        # Verify result
        assert result.manufacturer_code == "TEST123"
        assert result.type == "Relay"
        assert result.description == "Test relay component"
        assert result.tags == ["relay", "12V"]
        assert result.type_is_existing is True
        assert result.existing_type_id is not None

    @patch('app.services.ai_service.OpenAI')
    def test_analyze_part_with_image(self, mock_openai_class, ai_service: AIService):
        """Test AI analysis with image input."""
        mock_client = Mock()
        mock_openai_class.return_value = mock_client
        
        mock_response = Mock()
        mock_response.output_text = json.dumps({
            "manufacturer_code": "IMG123",
            "type": "Microcontroller",
            "description": "Arduino-like microcontroller",
            "tags": ["microcontroller", "arduino"]
        })
        mock_client.responses.create.return_value = mock_response
        
        ai_service.client = mock_client
        
        # Create test image data
        image_data = b"fake_image_data"
        
        result = ai_service.analyze_part(
            text_input="Arduino board",
            image_data=image_data,
            image_mime_type="image/jpeg"
        )
        
        # Verify OpenAI was called with image
        call_args = mock_client.responses.create.call_args
        input_arg = call_args.kwargs['input']
        assert isinstance(input_arg, list)
        # First message is system, second is user
        assert input_arg[0]['role'] == 'system'
        assert input_arg[1]['role'] == 'user'
        content_parts = input_arg[1]['content']
        assert any(part['type'] == 'text' for part in content_parts)
        assert any(part['type'] == 'input_image' for part in content_parts)

    @patch('app.services.ai_service.OpenAI')
    def test_analyze_part_new_type_suggestion(self, mock_openai_class, ai_service: AIService):
        """Test AI analysis suggesting a new type not in the system."""
        mock_client = Mock()
        mock_openai_class.return_value = mock_client
        
        mock_response = Mock()
        mock_response.output_text = json.dumps({
            "type": "Power Supply",  # Not in existing types
            "description": "Switching power supply"
        })
        mock_client.responses.create.return_value = mock_response
        
        ai_service.client = mock_client
        
        result = ai_service.analyze_part(text_input="12V power supply")
        
        assert result.type == "Power Supply"
        assert result.type_is_existing is False
        assert result.existing_type_id is None

    @patch('app.services.ai_service.OpenAI')
    @patch('app.services.ai_service.requests')
    def test_analyze_part_with_document_download(self, mock_requests, mock_openai_class, 
                                                ai_service: AIService):
        """Test AI analysis with document download."""
        # Mock OpenAI response with document URLs
        mock_client = Mock()
        mock_openai_class.return_value = mock_client
        
        mock_response = Mock()
        mock_response.output_text = json.dumps({
            "manufacturer_code": "DOC123",
            "type": "Relay",
            "description": "Relay with datasheet",
            "documents": [
                {
                    "filename": "datasheet.pdf",
                    "url": "https://example.com/datasheet.pdf",
                    "document_type": "datasheet",
                    "description": "Complete datasheet"
                }
            ]
        })
        mock_client.responses.create.return_value = mock_response
        
        # Mock document download
        mock_head_response = Mock()
        mock_head_response.headers = {
            "content-type": "application/pdf",
            "content-length": "1000"
        }
        mock_head_response.raise_for_status.return_value = None
        
        mock_get_response = Mock()
        mock_get_response.iter_content.return_value = [b"fake_pdf_content"]
        mock_get_response.raise_for_status.return_value = None
        
        mock_requests.head.return_value = mock_head_response
        mock_requests.get.return_value = mock_get_response
        
        ai_service.client = mock_client
        
        result = ai_service.analyze_part(text_input="Relay with docs")
        
        # Verify document was downloaded
        assert len(result.documents) == 1
        doc = result.documents[0]
        assert doc.filename == "datasheet.pdf"
        assert doc.url == "https://example.com/datasheet.pdf"
        assert doc.document_type == "datasheet"

    @patch('app.services.ai_service.OpenAI')
    def test_analyze_part_openai_api_error(self, mock_openai_class, ai_service: AIService):
        """Test handling of OpenAI API errors."""
        mock_client = Mock()
        mock_openai_class.return_value = mock_client
        
        # Simulate API error
        mock_client.responses.create.side_effect = Exception("API Error")
        
        ai_service.client = mock_client
        
        with pytest.raises(Exception, match="AI analysis failed: API Error"):
            ai_service.analyze_part(text_input="Test input")

    @patch('app.services.ai_service.OpenAI')
    def test_analyze_part_invalid_json_response(self, mock_openai_class, ai_service: AIService):
        """Test handling of invalid JSON in OpenAI response."""
        mock_client = Mock()
        mock_openai_class.return_value = mock_client
        
        mock_response = Mock()
        mock_response.output_text = "invalid json content"
        mock_client.responses.create.return_value = mock_response
        
        ai_service.client = mock_client
        
        with pytest.raises(Exception, match="Invalid response format from AI service"):
            ai_service.analyze_part(text_input="Test input")

    @patch('app.services.ai_service.requests')
    def test_download_document_non_https(self, mock_requests, ai_service: AIService):
        """Test document download security check for non-HTTPS URLs."""
        doc_data = {
            "url": "http://example.com/datasheet.pdf",
            "filename": "datasheet.pdf",
            "document_type": "datasheet"
        }
        
        temp_dir = ai_service.temp_file_manager.create_temp_directory()
        
        result = ai_service._download_document(doc_data, temp_dir)
        
        # Should reject non-HTTPS URL
        assert result is None
        mock_requests.head.assert_not_called()

    @patch('app.services.ai_service.requests')
    def test_download_document_unsupported_content_type(self, mock_requests, ai_service: AIService):
        """Test document download with unsupported content type."""
        doc_data = {
            "url": "https://example.com/file.txt",
            "filename": "file.txt",
            "document_type": "manual"
        }
        
        mock_head_response = Mock()
        mock_head_response.headers = {"content-type": "text/plain"}
        mock_head_response.raise_for_status.return_value = None
        mock_requests.head.return_value = mock_head_response
        
        temp_dir = ai_service.temp_file_manager.create_temp_directory()
        
        result = ai_service._download_document(doc_data, temp_dir)
        
        # Should reject unsupported content type
        assert result is None

    @patch('app.services.ai_service.requests')
    def test_download_document_file_too_large(self, mock_requests, ai_service: AIService):
        """Test document download with file too large."""
        doc_data = {
            "url": "https://example.com/large.pdf",
            "filename": "large.pdf",
            "document_type": "datasheet"
        }
        
        mock_head_response = Mock()
        mock_head_response.headers = {
            "content-type": "application/pdf",
            "content-length": str(100 * 1024 * 1024)  # 100MB - too large
        }
        mock_head_response.raise_for_status.return_value = None
        mock_requests.head.return_value = mock_head_response
        
        temp_dir = ai_service.temp_file_manager.create_temp_directory()
        
        result = ai_service._download_document(doc_data, temp_dir)
        
        # Should reject file that's too large
        assert result is None

    def test_sanitize_filename_edge_cases(self, ai_service: AIService):
        """Test filename sanitization edge cases."""
        # Test empty filename
        result = ai_service._sanitize_filename("")
        assert result == "document.pdf"
        
        # Test filename with only extension
        result = ai_service._sanitize_filename(".pdf")
        assert result == ".pdf"
        
        # Test filename without extension that's too long
        long_name = "a" * 150
        result = ai_service._sanitize_filename(long_name)
        assert len(result) <= 100

    def test_create_analysis_schema(self, ai_service: AIService):
        """Test JSON schema creation for OpenAI structured output."""
        schema = ai_service._create_analysis_schema()
        
        # Check required structure
        assert schema["type"] == "object"
        assert "properties" in schema
        assert "manufacturer_code" in schema["properties"]
        assert "type" in schema["properties"]
        assert "mounting_type" in schema["properties"]
        
        # Check enum constraints
        mounting_type_prop = schema["properties"]["mounting_type"]
        assert "enum" in mounting_type_prop
        assert "Through-hole" in mounting_type_prop["enum"]

    def test_build_responses_api_input_text_only(self, ai_service: AIService):
        """Test building Responses API input with text input only."""
        type_names = ["Relay", "Microcontroller"]
        messages = ai_service._build_responses_api_input("Arduino Uno", None, None, type_names)

        assert isinstance(messages, list)
        assert messages[0]["role"] == "system"
        # system content is a list of blocks
        assert any("Relay, Microcontroller" in block.get("text", "") for block in messages[0]["content"])

        user_message = messages[1]
        assert user_message["role"] == "user"
        assert len(user_message["content"]) == 1
        assert user_message["content"][0]["type"] == "text"

    def test_build_responses_api_input_with_image(self, ai_service: AIService):
        """Test building Responses API input with image input."""
        type_names = ["Relay"]
        image_data = b"fake_image_data"

        messages = ai_service._build_responses_api_input(
            "Arduino", image_data, "image/jpeg", type_names
        )

        user_message = messages[1]
        content_parts = user_message["content"]

        assert len(content_parts) == 2  # text + image

        # Check text part
        text_part = next(part for part in content_parts if part["type"] == "text")
        assert "Arduino" in text_part["text"]

        # Check image part is input_image with inline base64
        image_part = next(part for part in content_parts if part["type"] == "input_image")
        assert "data" in image_part["image_data"]
        assert image_part["image_data"]["mime_type"] == "image/jpeg"

    @patch('app.services.ai_service.requests')
    def test_download_suggested_image_success(self, mock_requests, ai_service: AIService):
        """Test successful suggested image download."""
        mock_response = Mock()
        mock_response.headers = {"content-type": "image/jpeg"}
        mock_response.iter_content.return_value = [b"fake_image_data"]
        mock_response.raise_for_status.return_value = None
        mock_requests.get.return_value = mock_response
        
        temp_dir = ai_service.temp_file_manager.create_temp_directory()
        
        result = ai_service._download_suggested_image("https://example.com/image.jpg", temp_dir)
        
        assert result is not None
        assert result.endswith("/part_image.jpg")

    @patch('app.services.ai_service.requests')
    def test_download_suggested_image_non_https(self, mock_requests, ai_service: AIService):
        """Test suggested image download with non-HTTPS URL."""
        temp_dir = ai_service.temp_file_manager.create_temp_directory()
        
        result = ai_service._download_suggested_image("http://example.com/image.jpg", temp_dir)
        
        assert result is None
        mock_requests.get.assert_not_called()

    @patch('app.services.ai_service.requests')
    def test_download_suggested_image_non_image_content(self, mock_requests, ai_service: AIService):
        """Test suggested image download with non-image content type."""
        mock_response = Mock()
        mock_response.headers = {"content-type": "text/html"}
        mock_response.raise_for_status.return_value = None
        mock_requests.get.return_value = mock_response
        
        temp_dir = ai_service.temp_file_manager.create_temp_directory()
        
        result = ai_service._download_suggested_image("https://example.com/page.html", temp_dir)
        
        assert result is None
