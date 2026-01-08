import json
import logging
import os
import re
import threading
import time
from dataclasses import dataclass
from enum import Enum
from typing import Any, cast
from unittest.mock import Mock

from jinja2 import Environment, FileSystemLoader
from pydantic import BaseModel

from app.schemas.duplicate_search import (
    DuplicateMatchLLMResponse,
    DuplicateSearchRequest,
    DuplicateSearchResponse,
)
from app.services.ai_model import PartAnalysisSuggestion
from app.services.base_task import ProgressHandle
from app.services.datasheet_extraction_service import DatasheetExtractionService
from app.services.document_service import DocumentService
from app.utils.ai.ai_runner import AIFunction, AIRequest, AIRunner
from app.utils.file_parsers import get_types_from_setup
from app.utils.temp_file_manager import TempFileManager

logger = logging.getLogger(__name__)

class AIType(Enum):
    OPENAI = "openai"

class LogInterceptor(logging.Handler):
    """
    Thread-local log interceptor.
    Each thread gets its own 'lines' list.
    """
    def __init__(self) -> None:
        super().__init__()
        self._tls = threading.local()

    def _buf(self) -> list[str]:
        # lazily create the per-thread buffer
        if not hasattr(self._tls, "lines"):
            self._tls.lines = []  # type: ignore[attr-defined]
        return self._tls.lines  # type: ignore[attr-defined]

    def emit(self, record: logging.LogRecord) -> None:
        try:
            text = self.format(record)
        except Exception:
            # formatting should never break logging
            return
        try:
            self._buf().append(text)
        except Exception:
            # never break logging on interceptor failure
            pass

    def clear(self) -> None:
        # clears only the *current thread's* buffer
        self._tls.lines = []  # type: ignore[attr-defined]

    def get_logs(self) -> list[str]:
        # returns the *current thread's* logs
        return self._buf()

log_interceptor = LogInterceptor()
log_interceptor.setLevel(logging.NOTSET)

logging.getLogger().addHandler(log_interceptor)

class ProgressImpl(ProgressHandle):
    def __init__(self) -> None:
        self.value = 0.0
        self.text = ""

    def send_progress_text(self, text: str) -> None:
        """Send a text progress update to connected clients."""

        self.send_progress(text, self.value)

    def send_progress_value(self, value: float) -> None:
        """Send a progress value update (0.0 to 1.0) to connected clients."""

        self.send_progress(self.text, value)

    def send_progress(self, text: str, value: float) -> None:
        """Send both text and progress value update to connected clients."""

        self.text = text
        if value > self.value:
            self.value = value

        logger.info(f"Progress: {int(self.value * 100)}% - {self.text}")


class MockDuplicateSearchService:
    """Mock duplicate search service for standalone prompt tester.

    Uses mock inventory data and makes real AI calls to test duplicate detection.
    """

    def __init__(self, ai_runner: AIRunner, mock_inventory: list[dict], model: str):
        """Initialize mock duplicate search service.

        Args:
            ai_runner: AIRunner instance for making LLM calls
            mock_inventory: Mock inventory data from get_mock_inventory()
            model: AI model to use for duplicate search (default: gpt-4o)
        """
        self.ai_runner = ai_runner
        self.model = model

        # Build prompt with mock inventory
        self.system_prompt = render_template("../../app/services/prompts/duplicate_search.md", {
            "parts_json": json.dumps(mock_inventory, indent=2)
        })

    def search_duplicates(self, request: DuplicateSearchRequest) -> DuplicateSearchResponse:
        """Search for duplicate parts using LLM-based matching against mock inventory.

        Args:
            request: Search request with component description

        Returns:
            Response with list of potential duplicate matches
        """
        start_time = time.perf_counter()

        try:
            # Call LLM
            ai_request = AIRequest(
                system_prompt=self.system_prompt,
                user_prompt=request.search,
                model=self.model,
                verbosity="low",
                reasoning_effort=None,
                reasoning_summary="auto",
                response_model=DuplicateMatchLLMResponse,
            )

            response = self.ai_runner.run(ai_request, [])
            llm_response = response.response

            # Convert LLM response
            if isinstance(llm_response, DuplicateMatchLLMResponse):
                matches = llm_response.matches
            else:
                logger.warning(f"Unexpected LLM response type: {type(llm_response)}")
                matches = []

            duration = time.perf_counter() - start_time
            logger.info(
                f"Mock duplicate search completed in {duration:.3f}s - "
                f"matches: {len(matches)}"
            )

            return DuplicateSearchResponse(matches=matches)

        except Exception as e:
            duration = time.perf_counter() - start_time
            logger.error(f"Mock duplicate search failed after {duration:.3f}s: {e}", exc_info=True)
            return DuplicateSearchResponse(matches=[])


@dataclass
class RunParameters:
    runner: AIRunner
    model: str
    reasoning_effort: str | None
    output_path: str
    filename_prefix: str
    url_classifier: AIFunction
    duplicate_search: AIFunction
    search_mouser_by_keyword: AIFunction
    search_mouser_by_part_number: AIFunction
    datasheet_extraction: AIFunction
    progress_handle: ProgressImpl


def slugify(name: str) -> str:
    # Lowercase
    s = name.lower()
    # Replace any non-alphanumeric with hyphens
    s = re.sub(r'[^a-z0-9]+', '-', s)
    # Collapse multiple hyphens
    s = re.sub(r'-+', '-', s)
    # Strip leading/trailing hyphens
    s = s.strip('-')
    return s

def render_template(prompt_template: str, context: dict[str, Any] | None = None) -> str:
    with open(os.path.join(os.path.dirname(__file__), prompt_template)) as f:
        template_str = f.read()

    prompt_dir = os.path.dirname(prompt_template)
    env_inline = Environment(loader=FileSystemLoader(prompt_dir))
    template_inline = env_inline.from_string(template_str)

    return template_inline.render(**(context or {}))

def get_mock_inventory() -> list[dict]:
    """Load mock inventory dataset from test data for duplicate search testing.

    Loads from app/data/test_data/parts.json and transforms to match
    PartService.get_all_parts_for_search() output structure exactly.
    Reference: /work/backend/app/services/part_service.py:172-185
    """
    # Load parts from test data JSON
    test_data_path = os.path.join(
        os.path.dirname(__file__), "..", "..", "app", "data", "test_data", "parts.json"
    )
    with open(test_data_path, encoding="utf-8") as f:
        parts_data = json.load(f)

    # Transform to match get_all_parts_for_search() structure
    # Keep only fields: key, manufacturer_code, type_name, description, tags,
    # manufacturer, package, series, voltage_rating, pin_count, pin_pitch
    inventory = []
    for part in parts_data:
        inventory.append({
            "key": part["key"],
            "manufacturer_code": part.get("manufacturer_code"),
            "type_name": part.get("type"),  # Rename "type" -> "type_name"
            "description": part.get("description"),
            "tags": part.get("tags", []),
            "manufacturer": part.get("manufacturer"),
            "package": part.get("package"),
            "series": part.get("series"),
            "voltage_rating": part.get("voltage_rating"),
            "pin_count": part.get("pin_count"),
            "pin_pitch": part.get("pin_pitch"),
        })

    return inventory

def get_duplicate_search_service(runner: AIRunner, model: str) -> MockDuplicateSearchService:
    # Load mock inventory for duplicate search
    mock_inventory = get_mock_inventory()

    # Create mock duplicate search service with real AI calls
    return MockDuplicateSearchService(runner, mock_inventory, model)

def get_part_analysis_prompt(query: str, run_parameters: RunParameters) -> PartAnalysisSuggestion:
    system_prompt = render_template("../../app/services/prompts/part_analysis.md", {
        "categories": get_types_from_setup(),
        "mouser_api_available": True
    })
    user_prompt = query

    response = call_ai(
        system_prompt,
        user_prompt,
        run_parameters,
        [
            run_parameters.url_classifier,
            run_parameters.duplicate_search,
            run_parameters.search_mouser_by_keyword,
            run_parameters.search_mouser_by_part_number,
            run_parameters.datasheet_extraction
        ],
        PartAnalysisSuggestion,
        f"analysis_{run_parameters.filename_prefix}"
    )

    return cast(PartAnalysisSuggestion, response)

def call_ai(system_prompt: str, user_prompt: str, run_parameters: RunParameters, function_tools: list[AIFunction], response_model: type[BaseModel], filename: str) -> BaseModel:
    json_filename = os.path.join(run_parameters.output_path, f"{filename}.json")

    if os.path.exists(json_filename):
        with open(json_filename, encoding="utf-8") as f:
            return response_model.model_validate_json(f.read())

    log_interceptor.clear()

    with open(os.path.join(run_parameters.output_path, f"{filename}_prompt.txt"), "w", encoding="utf-8") as f:
        f.write("System prompt:\n\n")
        f.write(system_prompt)
        f.write("\n\n")
        f.write("User prompt:\n\n")
        f.write(user_prompt)

    request = AIRequest(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        model=run_parameters.model,
        verbosity="medium",
        reasoning_effort=run_parameters.reasoning_effort,
        reasoning_summary="auto",
        response_model=response_model
    )

    response = run_parameters.runner.run(request, function_tools, run_parameters.progress_handle, True)

    with open(json_filename, "w", encoding="utf-8") as f:
        f.write(response.response.model_dump_json(indent=4))

    with open(os.path.join(run_parameters.output_path, f"{filename}.txt"), "w", encoding="utf-8") as f:
        f.write(f"Elapsed time: {response.elapsed_time}\n")
        f.write(f"Input tokens: {response.input_tokens}\n")
        f.write(f"Input tokens cached: {response.cached_input_tokens}\n")
        f.write(f"Output tokens: {response.output_tokens}\n")
        f.write(f"Output reasoning tokens: {response.reasoning_tokens}\n")
        if response.cost:
            f.write(f"Cost: ${response.cost:.3f}")

    with open(os.path.join(run_parameters.output_path, f"{filename}.log"), "w", encoding="utf-8") as f:
        f.write("\n".join(log_interceptor.get_logs()))

    return response.response


def get_temp_file_manager() -> TempFileManager:
    tmp_path = os.path.join(os.path.dirname(__file__), "tmp")
    os.makedirs(tmp_path, exist_ok=True)

    return TempFileManager(tmp_path, 1, Mock())


def get_document_service() -> DocumentService:
    """Create a DocumentService for the prompttester.

    Uses minimal dependencies - only what's needed for process_upload_url.
    """
    from app.services.document_service import DocumentService
    from app.services.download_cache_service import DownloadCacheService
    from app.services.html_document_handler import HtmlDocumentHandler
    from app.services.url_transformers import LCSCInterceptor, URLInterceptorRegistry

    # Create download cache service using temp file manager
    temp_file_manager = get_temp_file_manager()
    download_cache_service = DownloadCacheService(temp_file_manager)

    # Create URL interceptor registry with LCSC support
    url_interceptor_registry = URLInterceptorRegistry()
    url_interceptor_registry.register(LCSCInterceptor())

    # Create settings mock with required attributes for process_upload_url
    settings = Mock()
    settings.ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"]
    settings.ALLOWED_FILE_TYPES = ["application/pdf"]
    settings.MAX_IMAGE_SIZE = 10 * 1024 * 1024  # 10MB
    settings.MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB

    # Create HTML handler for webpage previews (mocked image_service since we only need PDFs)
    html_handler = HtmlDocumentHandler(
        download_cache_service=download_cache_service,
        settings=settings,
        image_service=Mock(),
    )

    # Create document service with mocked dependencies we don't need
    return DocumentService(
        db=Mock(),  # Not used for process_upload_url
        s3_service=Mock(),  # Not used for process_upload_url
        image_service=Mock(),  # Not used for process_upload_url
        html_handler=html_handler,
        download_cache_service=download_cache_service,
        settings=settings,
        url_interceptor_registry=url_interceptor_registry,
    )

def get_datasheet_extraction_service(model: str, ai_runner: AIRunner) -> DatasheetExtractionService:
    config = Mock()
    config.OPENAI_MODEL = model
    config.OPENAI_VERBOSITY = "medium"

    document_service = get_document_service()
    type_service = Mock()
    # Map type names to mock objects with .name attribute
    type_service.get_all_types.return_value = [
        Mock(name=t) for t in get_types_from_setup()
    ]
    temp_file_manager = get_temp_file_manager()

    return DatasheetExtractionService(config, document_service, type_service, ai_runner, temp_file_manager)
