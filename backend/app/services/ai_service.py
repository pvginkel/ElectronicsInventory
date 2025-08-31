"""AI service for part analysis using OpenAI."""

import base64
import json
import logging
from pathlib import Path
from typing import TYPE_CHECKING
from urllib.parse import urlparse

import requests
from openai import OpenAI

from app.config import Settings
from app.schemas.ai_part_analysis import AIPartAnalysisResultSchema, DocumentSuggestionSchema
from app.services.base import BaseService
from app.utils.temp_file_manager import TempFileManager

if TYPE_CHECKING:
    from app.services.type_service import TypeService

logger = logging.getLogger(__name__)


class AIService(BaseService):
    """Service for AI-powered part analysis using OpenAI."""

    def __init__(self, db, config: Settings, temp_file_manager: TempFileManager, type_service: 'TypeService'):
        super().__init__(db)
        self.config = config
        self.temp_file_manager = temp_file_manager
        self.type_service = type_service

        # Initialize OpenAI client
        if not config.OPENAI_API_KEY:
            raise ValueError("OPENAI_API_KEY configuration is required for AI features")

        self.client = OpenAI(api_key=config.OPENAI_API_KEY)

    def analyze_part(self, text_input: str | None = None, image_data: bytes | None = None,
                     image_mime_type: str | None = None) -> AIPartAnalysisResultSchema:
        """
        Analyze part information from text and/or image using OpenAI.

        Args:
            text_input: Optional text description of the part
            image_data: Optional image bytes
            image_mime_type: MIME type of the image if provided

        Returns:
            AIPartAnalysisResultSchema with analysis results

        Raises:
            ValueError: If neither text nor image is provided
            Exception: If OpenAI API call fails
        """
        if not text_input and not image_data:
            raise ValueError("Either text_input or image_data must be provided")

        # Get existing type names for context
        existing_types = self.type_service.get_all_types()
        type_names = [t.name for t in existing_types]

        # Create JSON schema for structured output
        schema = self._create_analysis_schema()

        # Build messages for OpenAI
        messages = self._build_openai_messages(text_input, image_data, image_mime_type, type_names)

        try:
            # Call OpenAI with structured output
            response = self.client.chat.completions.create(
                model=self.config.OPENAI_MODEL,
                messages=messages,
                response_format={
                    "type": "json_schema",
                    "json_schema": {
                        "name": "part_analysis",
                        "schema": schema,
                        "strict": True
                    }
                },
                max_completion_tokens=self.config.OPENAI_MAX_OUTPUT_TOKENS,
                temperature=self.config.OPENAI_TEMPERATURE,
                reasoning={
                    "effort": self.config.OPENAI_REASONING_EFFORT
                }
            )

            # Parse the structured response
            content = response.choices[0].message.content
            if not content:
                raise Exception("Empty response from OpenAI")

            ai_response = json.loads(content)

            # Create temporary directory for document downloads
            temp_dir = self.temp_file_manager.create_temp_directory()

            # Download documents if URLs provided
            documents = []
            for doc_data in ai_response.get("documents", []):
                try:
                    document_dict = self._download_document(doc_data, temp_dir)
                    if document_dict:
                        # Convert to schema object
                        document_schema = DocumentSuggestionSchema(**document_dict)
                        documents.append(document_schema)
                except Exception as e:
                    logger.warning(f"Failed to download document {doc_data.get('url', 'unknown')}: {e}")

            # Download suggested image if URL provided
            suggested_image_url = None
            if ai_response.get("suggested_image_url"):
                try:
                    suggested_image_url = self._download_suggested_image(
                        ai_response["suggested_image_url"], temp_dir
                    )
                except Exception as e:
                    logger.warning(f"Failed to download suggested image: {e}")

            # Determine if type is existing or new
            suggested_type = ai_response.get("type")
            type_is_existing = False
            existing_type_id = None

            if suggested_type:
                for type_obj in existing_types:
                    if type_obj.name.lower() == suggested_type.lower():
                        type_is_existing = True
                        existing_type_id = type_obj.id
                        break

            # Build result schema
            result = AIPartAnalysisResultSchema(
                manufacturer_code=ai_response.get("manufacturer_code"),
                type=suggested_type,
                description=ai_response.get("description"),
                tags=ai_response.get("tags", []),
                seller=ai_response.get("seller"),
                seller_link=ai_response.get("seller_link"),
                package=ai_response.get("package"),
                pin_count=ai_response.get("pin_count"),
                voltage_rating=ai_response.get("voltage_rating"),
                mounting_type=ai_response.get("mounting_type"),
                series=ai_response.get("series"),
                dimensions=ai_response.get("dimensions"),
                documents=documents,
                suggested_image_url=suggested_image_url,
                confidence_score=ai_response.get("confidence_score", 0.8),
                type_is_existing=type_is_existing,
                existing_type_id=existing_type_id
            )

            return result

        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse OpenAI response as JSON: {e}")
            raise Exception("Invalid response format from AI service") from e
        except Exception as e:
            logger.error(f"OpenAI API call failed: {e}")
            raise Exception(f"AI analysis failed: {str(e)}") from e

    def _create_analysis_schema(self) -> dict:
        """Create JSON schema for OpenAI structured output."""
        return {
            "type": "object",
            "properties": {
                "manufacturer_code": {"type": ["string", "null"]},
                "type": {"type": ["string", "null"]},
                "description": {"type": ["string", "null"]},
                "tags": {"type": "array", "items": {"type": "string"}},
                "seller": {"type": ["string", "null"]},
                "seller_link": {"type": ["string", "null"]},
                "package": {"type": ["string", "null"]},
                "pin_count": {"type": ["integer", "null"]},
                "voltage_rating": {"type": ["string", "null"]},
                "mounting_type": {"type": ["string", "null"], "enum": [
                    "Through-hole", "Surface Mount", "Breadboard Compatible",
                    "DIN Rail", "Panel Mount", "PCB Mount", None
                ]},
                "series": {"type": ["string", "null"]},
                "dimensions": {"type": ["string", "null"]},
                "documents": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "filename": {"type": "string"},
                            "url": {"type": "string"},
                            "document_type": {"type": "string", "enum": [
                                "datasheet", "manual", "schematic", "application_note", "reference_design"
                            ]},
                            "description": {"type": ["string", "null"]}
                        },
                        "required": ["filename", "url", "document_type"],
                        "additionalProperties": False
                    }
                },
                "suggested_image_url": {"type": ["string", "null"]},
                "confidence_score": {"type": "number", "minimum": 0.0, "maximum": 1.0}
            },
            "required": [],
            "additionalProperties": False
        }

    def _build_openai_messages(self, text_input: str | None, image_data: bytes | None,
                              image_mime_type: str | None, type_names: list[str]) -> list[dict]:
        """Build messages for OpenAI API call."""

        system_prompt = f"""You are an expert electronics component analyzer. Analyze the provided text and/or image to identify and extract detailed information about an electronics part.

Available part types in the system: {', '.join(type_names)}

Choose an existing type that fits best, or suggest a new type name following similar patterns.

Provide structured information about:
- Manufacturer part number/code
- Component type/category
- Detailed technical description
- Relevant tags for search and categorization
- Seller information and product page if identifiable
- Technical specifications (package, pins, voltage, mounting, series, dimensions)
- Document URLs (datasheets, manuals, schematics) - HTTPS only, prefer manufacturer domains
- High-quality product image URL if different from input

Focus on accuracy and technical precision. If uncertain about specific details, omit them rather than guessing.

For mounting_type, use standard terms: "Through-hole", "Surface Mount", "Breadboard Compatible", "DIN Rail", "Panel Mount", or "PCB Mount".

Provide confidence score (0.0-1.0) based on how certain you are about the analysis."""

        messages = [{"role": "system", "content": system_prompt}]

        # Build user message content
        content_parts = []

        if text_input:
            content_parts.append({
                "type": "text",
                "text": f"Text description: {text_input}"
            })

        if image_data and image_mime_type:
            # Convert image to base64
            base64_image = base64.b64encode(image_data).decode('utf-8')
            data_url = f"data:{image_mime_type};base64,{base64_image}"

            content_parts.append({
                "type": "image_url",
                "image_url": {"url": data_url}
            })

        if not content_parts:
            content_parts.append({
                "type": "text",
                "text": "Please analyze the provided information."
            })

        messages.append({
            "role": "user",
            "content": content_parts
        })

        return messages

    def _download_document(self, doc_data: dict, temp_dir: Path) -> dict | None:
        """Download a document from AI-provided URL."""
        url = doc_data.get("url", "")
        filename = doc_data.get("filename", "document.pdf")
        document_type = doc_data.get("document_type", "datasheet")
        description = doc_data.get("description")

        # Security checks
        if not url.startswith("https://"):
            logger.warning(f"Skipping non-HTTPS URL: {url}")
            return None

        parsed_url = urlparse(url)
        if not parsed_url.netloc:
            logger.warning(f"Invalid URL: {url}")
            return None

        try:
            # HEAD request first to check content type and size
            head_response = requests.head(url, timeout=10, allow_redirects=True)
            head_response.raise_for_status()

            content_type = head_response.headers.get("content-type", "").lower()
            content_length = head_response.headers.get("content-length")

            # Check content type
            allowed_types = ["application/pdf", "image/jpeg", "image/png", "image/webp"]
            if not any(allowed_type in content_type for allowed_type in allowed_types):
                logger.warning(f"Unsupported content type {content_type} for URL: {url}")
                return None

            # Check file size (max 50MB)
            if content_length and int(content_length) > 50 * 1024 * 1024:
                logger.warning(f"File too large ({content_length} bytes) for URL: {url}")
                return None

            # Download the file
            response = requests.get(url, timeout=30, stream=True)
            response.raise_for_status()

            # Save to temporary directory
            safe_filename = self._sanitize_filename(filename)
            file_path = temp_dir / safe_filename

            with open(file_path, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)

            # Generate temporary URL
            self.temp_file_manager.get_temp_file_url(temp_dir, safe_filename)

            return {
                "filename": safe_filename,
                "temp_path": str(file_path),
                "original_url": url,
                "document_type": document_type,
                "description": description
            }

        except Exception as e:
            logger.warning(f"Failed to download document from {url}: {e}")
            return None

    def _download_suggested_image(self, image_url: str, temp_dir: Path) -> str | None:
        """Download AI-suggested part image."""
        if not image_url.startswith("https://"):
            logger.warning(f"Skipping non-HTTPS image URL: {image_url}")
            return None

        try:
            response = requests.get(image_url, timeout=15, stream=True)
            response.raise_for_status()

            # Verify it's an image
            content_type = response.headers.get("content-type", "").lower()
            if not content_type.startswith("image/"):
                logger.warning(f"URL does not serve an image: {image_url}")
                return None

            # Determine file extension
            if "jpeg" in content_type or "jpg" in content_type:
                ext = "jpg"
            elif "png" in content_type:
                ext = "png"
            elif "webp" in content_type:
                ext = "webp"
            else:
                ext = "jpg"  # Default

            filename = f"part_image.{ext}"
            file_path = temp_dir / filename

            # Download and save
            with open(file_path, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)

            # Generate temporary URL
            return self.temp_file_manager.get_temp_file_url(temp_dir, filename)

        except Exception as e:
            logger.warning(f"Failed to download suggested image from {image_url}: {e}")
            return None

    def _sanitize_filename(self, filename: str) -> str:
        """Sanitize filename for safe storage."""
        import re

        # Remove path components
        filename = filename.split('/')[-1].split('\\')[-1]

        # Remove or replace unsafe characters
        filename = re.sub(r'[<>:"/\\|?*]', '_', filename)

        # Limit length
        if len(filename) > 100:
            name, ext = filename.rsplit('.', 1) if '.' in filename else (filename, '')
            filename = name[:90] + ('.' + ext if ext else '')

        return filename or "document.pdf"

