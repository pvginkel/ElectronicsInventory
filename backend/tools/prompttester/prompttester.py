import json
import logging
import os
import re
import threading
import time
import traceback
from dataclasses import dataclass
from typing import Any, cast

from dotenv import load_dotenv
from jinja2 import Environment
from pydantic import BaseModel

from app.schemas.duplicate_search import (
    DuplicateMatchLLMResponse,
    DuplicateSearchRequest,
    DuplicateSearchResponse,
)
from app.services.ai_model import PartAnalysisSuggestion
from app.services.base_task import ProgressHandle
from app.utils.ai.ai_runner import AIFunction, AIRequest, AIRunner
from app.utils.ai.duplicate_search import DuplicateSearchFunction
from app.utils.file_parsers import get_types_from_setup
from tools.prompttester.model import (
    AllUrlsSchema,
    BasicInformationSchema,
    PartDetailsSchema,
    UrlsSchema,
)
from tools.prompttester.url_classifier import URLClassifierFunctionImpl

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

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

logger = logging.getLogger(__name__)
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
        self.value = value

        logger.info(f"Progress: {int(value * 100)}% - {text}")


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

        # Load and cache prompt template
        prompt_path = os.path.join(os.path.dirname(__file__), "prompt_duplicate_search.md")
        with open(prompt_path) as f:
            template_str = f.read()
        env = Environment()

        # Build prompt with mock inventory
        prompt_template = env.from_string(template_str)

        parts_json = json.dumps(mock_inventory, indent=2)
        self.system_prompt = prompt_template.render(parts_json=parts_json)

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

    env_inline = Environment()
    template_inline = env_inline.from_string(template_str)

    return template_inline.render(**(context or {}))

def get_duplicate_search_service(runner: AIRunner, model: str) -> MockDuplicateSearchService:
    # Load mock inventory for duplicate search
    mock_inventory = get_mock_inventory()

    # Create mock duplicate search service with real AI calls
    return MockDuplicateSearchService(runner, mock_inventory, model)

def run_full_tests(queries: list[str], models: dict[str, list[str] | None], runs: int = 1):
    tmp_path = os.path.join(os.path.dirname(__file__), "tmp")
    os.makedirs(tmp_path, exist_ok=True)

    runner = AIRunner(os.getenv("OPENAI_API_KEY")) # type: ignore

    output_path = os.path.join(os.path.dirname(__file__), "output")
    os.makedirs(output_path, exist_ok=True)

    duplicate_search = DuplicateSearchFunction(get_duplicate_search_service(runner, "gpt-5-mini")) # type: ignore

    progress_handle = ProgressImpl()
    url_classifier = URLClassifierFunctionImpl(tmp_path)

    for query in queries:
        for model, reasoning_efforts in models.items():
            efforts_to_test = reasoning_efforts if reasoning_efforts else [None]  # type: ignore[list-item]
            for reasoning_effort in efforts_to_test:
                for run in range(0, runs):
                    query_key = slugify(query)
                    filename_prefix = f"{query_key}_{model}"
                    if reasoning_effort:
                        filename_prefix += f"_{reasoning_effort}"
                    filename_prefix += f"_{run + 1}"

                    try:
                        logger.info(f"Run: query {query}, query_key {query_key}, model {model}, reasoning_effort {reasoning_effort}")

                        run_parameters = RunParameters(
                            runner=runner,
                            model=model,
                            reasoning_effort=reasoning_effort,
                            output_path=output_path,
                            filename_prefix=filename_prefix,
                            url_classifier=url_classifier,
                            duplicate_search=duplicate_search,
                            progress_handle=progress_handle
                        )

                        single_run(query, run_parameters)
                    except Exception as e:
                        logger.error("Run failed {e}", e)

                        with open(os.path.join(output_path, f"{filename_prefix}.err"), "w", encoding="utf-8") as f:
                            f.write(f"Exception type: {type(e).__name__}\n")
                            f.write(f"Message: {str(e)}\n\n")
                            f.write("Stack trace:\n")
                            f.write("".join(traceback.format_exception(type(e), e, e.__traceback__)))

def single_run(query: str, run_parameters: RunParameters) -> None:
    get_full_schema(query, run_parameters)

    # basic_information = get_basic_information(query, run_parameters)

    # tasks = [
    #     partial(get_part_details, basic_information, run_parameters),
    #     partial(get_document_urls, basic_information, run_parameters, "product pages", '"webpage"'),
    #     partial(get_document_urls, basic_information, run_parameters, "datasheets", '"pdf" (preferred) or "webpage"'),
    #     partial(get_document_urls, basic_information, run_parameters, "pinouts", '"pdf" or "image"'),
    #     partial(get_all_urls, basic_information, run_parameters),
    #     partial(get_full_schema, query, run_parameters)
    # ]

    # # Tune max_workers to your environment / rate limits
    # with ThreadPoolExecutor(max_workers=len(tasks)) as executor:
    #     futures = [executor.submit(t) for t in tasks]
    #     for f in as_completed(futures):
    #         # propagate exceptions early (or handle/log here)
    #         f.result()

def get_full_schema(query: str, run_parameters: RunParameters) -> PartAnalysisSuggestion:
    system_prompt = render_template("prompt_full_schema.md", {
        "categories": get_types_from_setup()
    })
    user_prompt = query

    response = call_ai(
        system_prompt,
        user_prompt,
        run_parameters,
        [run_parameters.url_classifier, run_parameters.duplicate_search],
        PartAnalysisSuggestion,
        f"{run_parameters.filename_prefix}_full-schema"
    )

    return cast(PartAnalysisSuggestion, response)

def get_basic_information(query: str, run_parameters: RunParameters) -> BasicInformationSchema:
    system_prompt = render_template("prompt_basic_information.md")
    user_prompt = query

    response = call_ai(
        system_prompt,
        user_prompt,
        run_parameters,
        [],
        BasicInformationSchema,
        f"{run_parameters.filename_prefix}_basic-information"
    )

    return cast(BasicInformationSchema, response)

def get_part_details(basic_information: BasicInformationSchema, run_parameters: RunParameters) -> PartDetailsSchema:
    system_prompt = render_template("prompt_part_details.md", {
        "categories": get_types_from_setup()
    })

    user_prompt = f"""Product Name: {basic_information.product_name}
Manufacturer: {basic_information.manufacturer}
MPN: {basic_information.mpn}"""

    response = call_ai(
        system_prompt,
        user_prompt,
        run_parameters,
        [],
        PartDetailsSchema,
        f"{run_parameters.filename_prefix}_part-details"
    )

    return cast(PartDetailsSchema, response)

def get_document_urls(basic_information: BasicInformationSchema, run_parameters: RunParameters, document_type: str, url_types: str) -> UrlsSchema:
    system_prompt = render_template("prompt_urls.md", {
        "document_type": document_type,
        "url_types": url_types
    })

    user_prompt = f"""Product Name: {basic_information.product_name}
Manufacturer: {basic_information.manufacturer}
MPN: {basic_information.mpn}"""

    response = call_ai(
        system_prompt,
        user_prompt,
        run_parameters,
        [run_parameters.url_classifier],
        UrlsSchema,
        f"{run_parameters.filename_prefix}_{document_type.replace(' ', '-')}-urls"
    )

    return cast(UrlsSchema, response)

def get_all_urls(basic_information: BasicInformationSchema, run_parameters: RunParameters) -> AllUrlsSchema:
    system_prompt = render_template("prompt_all_urls.md")

    user_prompt = f"""Product Name: {basic_information.product_name}
Manufacturer: {basic_information.manufacturer}
MPN: {basic_information.mpn}"""

    response = call_ai(
        system_prompt,
        user_prompt,
        run_parameters,
        [run_parameters.url_classifier],
        AllUrlsSchema,
        f"{run_parameters.filename_prefix}_all-urls"
    )

    return cast(AllUrlsSchema, response)

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


def run_duplicate_search_tests(
    queries: list[tuple[str, list[tuple[str, str]]]],
    models: list[str],
    runs: int = 1
):
    """Run duplicate search tests against mock inventory.

    Args:
        queries: List of (query_string, expected_matches) tuples where expected_matches
                is a list of (part_key, confidence_level) tuples
        models: Model configurations (defaults to gpt-5-mini with medium reasoning)
        runs: Number of runs per query/model combination
    """

    # Create output directory
    output_path = os.path.join(os.path.dirname(__file__), "output")
    os.makedirs(output_path, exist_ok=True)

    # Initialize AI runner with stub metrics service
    runner = AIRunner(os.getenv("OPENAI_API_KEY")) # type: ignore

    # Run tests for each query/model/reasoning/run combination
    for query, expected_matches in queries:
        # Generate query key from the query string (sanitize for filename)
        query_key = query.lower().replace(" ", "-").replace("/", "-")[:30]

        for model in models:
            for run in range(runs):
                filename_prefix = f"dup_{query_key}_{model}"
                filename_prefix += f"_{run + 1}"

                try:
                    logger.info(f"Duplicate search test: query '{query}', model {model}")

                    # Check if output already exists (idempotency)
                    json_filename = os.path.join(output_path, f"{filename_prefix}.json")
                    if os.path.exists(json_filename):
                        logger.info(f"Skipping test (output exists): {filename_prefix}")
                        continue

                    # Clear log buffer for this test run
                    log_interceptor.clear()

                    search_service = get_duplicate_search_service(runner, model)

                    # Save prompt to file
                    with open(
                        os.path.join(output_path, f"{filename_prefix}_prompt.txt"),
                        "w",
                        encoding="utf-8"
                    ) as f:
                        f.write("System prompt:\n\n")
                        f.write(search_service.system_prompt)
                        f.write("\n\n")
                        f.write("User prompt:\n\n")
                        f.write(query)
                        f.write("\n\n")
                        f.write("Expected matches:\n")
                        for part_key, confidence in expected_matches:
                            f.write(f"  - {part_key} ({confidence} confidence)\n")

                    response = search_service.search_duplicates(DuplicateSearchRequest(search=query))

                    # Save response JSON
                    with open(json_filename, "w", encoding="utf-8") as f:
                        f.write(response.model_dump_json(indent=4))

                    # Save captured logs
                    with open(
                        os.path.join(output_path, f"{filename_prefix}.log"),
                        "w",
                        encoding="utf-8"
                    ) as f:
                        f.write("\n".join(log_interceptor.get_logs()))

                    logger.info(f"Test completed: {filename_prefix}")

                except Exception as e:
                    logger.error(f"Test failed: {filename_prefix}", exc_info=True)

                    # Save error details
                    with open(
                        os.path.join(output_path, f"{filename_prefix}.err"),
                        "w",
                        encoding="utf-8"
                    ) as f:
                        f.write(f"Exception type: {type(e).__name__}\n")
                        f.write(f"Message: {str(e)}\n\n")
                        f.write("Stack trace:\n")
                        f.write("".join(traceback.format_exception(type(e), e, e.__traceback__)))

def full_tests():
    reasoning_efforts : list[str] = [
        # "low",
        "medium",
        # "high",
    ]

    models : dict[str, list[str] | None] = {
        # "gpt-4.1": None,
        # "gpt-4.1-mini": None,
        # "gpt-4o": None,
        # "gpt-4o-mini": None,
        # "gpt-5": reasoning_efforts,
        "gpt-5-mini": reasoning_efforts,
        "gpt-5.1": reasoning_efforts,
        "gpt-5.1-codex": reasoning_efforts,
        "gpt-5.1-codex-mini": reasoning_efforts,
        # "gpt-5-nano": reasoning_efforts,
        # "o3": reasoning_efforts,
        # "o4-mini",: reasoning_efforts,
    }
    queries = [
        "HLK PM24",
        # "relay 12V SPDT 5A",
        # "SN74HC595N",
        # "ESP32-S3FN8",
        # "Arduino Nano Every",
        # "DFRobot Gravity SGP40",
        "generic tht resistor 1/4w 1% 10k",
        # "banana"
    ]

    run_full_tests(
        queries,
        models,
        1
    )

def duplicate_search_tests():
    queries = [
        ("Part number SN74HC595N", [
            ("ABCD", "high"), # 8-bit shift register with output latches; exact MPN match
        ]),
        ("10k resistor", [
            ("CDEF", "medium"), # 10kΩ carbon film resistor 1/4W THT
            ("IJMN", "medium")  # 10kΩ SMD resistor 0805 package
        ]),
        ("10k SMD resistor", [
            ("IJMN", "high") # 10kΩ SMD resistor 0805 package - specific match
        ]),
        ("ESP32 WiFi module", [
            ("IJKL", "high") # ESP32-WROOM-32 WiFi & Bluetooth module
        ]),
        ("Generic THT diode", []) # No specific match expected (too generic)
    ]

    run_duplicate_search_tests(queries, ["gpt-5-mini"])

def main():
    full_tests()
    # duplicate_search_tests()

if __name__ == "__main__":
    main()
