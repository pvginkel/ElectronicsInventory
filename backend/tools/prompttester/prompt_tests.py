import logging
import os
import traceback
from unittest.mock import Mock

from app.schemas.duplicate_search import (
    DuplicateSearchRequest,
)
from app.services.download_cache_service import DownloadCacheService
from app.services.mouser_service import MouserService
from app.utils.ai.ai_runner import AIRunner
from app.utils.ai.claude.claude_runner import ClaudeRunner
from app.utils.ai.datasheet_extraction import ExtractSpecsFromDatasheetFunction
from app.utils.ai.duplicate_search import DuplicateSearchFunction
from app.utils.ai.mouser_search import (
    SearchMouserByKeywordFunction,
    SearchMouserByPartNumberFunction,
)
from app.utils.ai.openai.openai_runner import OpenAIRunner
from tools.prompttester.url_classifier import URLClassifierFunctionImpl
from tools.prompttester.utils import (
    AIType,
    ProgressImpl,
    RunParameters,
    get_datasheet_extraction_service,
    get_duplicate_search_service,
    get_part_analysis_prompt,
    get_temp_file_manager,
    log_interceptor,
    slugify,
)

logger = logging.getLogger(__name__)

def run_full_tests(queries: list[str], models: list[tuple[AIType, str, list[str] | None]], runs: int = 1):
    # Initialize runners only if API keys are available
    openai_runner: AIRunner | None = OpenAIRunner(os.getenv("OPENAI_API_KEY")) if os.getenv("OPENAI_API_KEY") else None  # type: ignore
    claude_runner: AIRunner | None = ClaudeRunner(os.getenv("CLAUDE_API_KEY")) if os.getenv("CLAUDE_API_KEY") else None  # type: ignore

    output_path = os.path.join(os.path.dirname(__file__), "output")
    os.makedirs(output_path, exist_ok=True)

    mouser_api_key = os.getenv("MOUSER_API_KEY", None)
    if not mouser_api_key:
        raise RuntimeError("MOUSER_API_KEY environment variable not set")

    config_mock = Mock()
    config_mock.MOUSER_SEARCH_API_KEY = mouser_api_key

    temp_file_manager = get_temp_file_manager()
    download_cache_service = DownloadCacheService(temp_file_manager)
    mouser_service = MouserService(config_mock, download_cache_service, Mock()) # type: ignore

    search_mouser_by_part_number = SearchMouserByPartNumberFunction(mouser_service)
    search_mouser_by_keyword = SearchMouserByKeywordFunction(mouser_service)

    progress_handle = ProgressImpl()
    url_classifier = URLClassifierFunctionImpl(str(temp_file_manager.base_path))

    for query in queries:
        for ai_type, model, reasoning_efforts in models:
            # Select runner based on AI type
            runner = openai_runner if ai_type == AIType.OPENAI else claude_runner
            if runner is None:
                logger.error(f"No runner available for {ai_type.value} - API key missing")
                continue

            datasheet_extraction_service = get_datasheet_extraction_service(model, runner)
            datasheet_extraction = ExtractSpecsFromDatasheetFunction(datasheet_extraction_service)

            efforts_to_test = reasoning_efforts if reasoning_efforts else [None]  # type: ignore[list-item]
            for reasoning_effort in efforts_to_test:
                for run in range(0, runs):
                    query_key = slugify(query)
                    filename_prefix = f"{ai_type.value}_{query_key}_{model}"
                    if reasoning_effort:
                        filename_prefix += f"_{reasoning_effort}"
                    filename_prefix += f"_{run + 1}"

                    try:
                        duplicate_search_model = "gpt-5-mini" if ai_type == AIType.OPENAI else "claude-sonnet-4-5"
                        duplicate_search = DuplicateSearchFunction(get_duplicate_search_service(runner, duplicate_search_model))  # type: ignore

                        logger.info(f"Run: query {query}, query_key {query_key}, model {model}, reasoning_effort {reasoning_effort}")

                        run_parameters = RunParameters(
                            runner=runner,
                            model=model,
                            reasoning_effort=reasoning_effort,
                            output_path=output_path,
                            filename_prefix=filename_prefix,
                            url_classifier=url_classifier,
                            duplicate_search=duplicate_search,
                            search_mouser_by_keyword=search_mouser_by_keyword,
                            search_mouser_by_part_number=search_mouser_by_part_number,
                            datasheet_extraction=datasheet_extraction,
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
    get_part_analysis_prompt(query, run_parameters)

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

def run_duplicate_search_tests(
    queries: list[tuple[str, list[tuple[str, str]]]],
    models: list[tuple[AIType, str]],
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
    openai_runner: AIRunner | None = OpenAIRunner(os.getenv("OPENAI_API_KEY")) if os.getenv("OPENAI_API_KEY") else None  # type: ignore
    claude_runner: AIRunner | None = ClaudeRunner(os.getenv("CLAUDE_API_KEY")) if os.getenv("CLAUDE_API_KEY") else None  # type: ignore

    # Run tests for each query/model/reasoning/run combination
    for query, expected_matches in queries:
        # Generate query key from the query string (sanitize for filename)
        query_key = query.lower().replace(" ", "-").replace("/", "-")[:30]

        for ai_type, model in models:
            for run in range(runs):
                filename_prefix = f"dup_{query_key}_{ai_type.value}_{model}"
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

                    runner = openai_runner if ai_type == AIType.OPENAI else claude_runner
                    if not runner:
                        logger.error(f"No runner available for {ai_type.value} - API key missing")
                        continue

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

                    response = search_service.search_duplicates(DuplicateSearchRequest(search=query))

                    # Save response JSON
                    with open(json_filename, "w", encoding="utf-8") as f:
                        f.write(response.model_dump_json(indent=4))

                    # Save result comparison to file
                    with open(
                        os.path.join(output_path, f"{filename_prefix}_result.txt"),
                        "w",
                        encoding="utf-8"
                    ) as f:
                        # Expected matches
                        f.write("Expected matches:\n")
                        if expected_matches:
                            for part_key, confidence in expected_matches:
                                f.write(f"  - {part_key} ({confidence} confidence)\n")
                        else:
                            f.write("  (none)\n")

                        # Actual matches
                        f.write("\nActual matches:\n")
                        actual_matches = response.matches
                        if actual_matches:
                            for match in actual_matches:
                                f.write(f"  - {match.part_key} ({match.confidence} confidence)\n")
                        else:
                            f.write("  (none)\n")

                        # Differences
                        expected_keys = {pk for pk, _ in expected_matches}
                        actual_keys = {m.part_key for m in actual_matches}

                        missing = expected_keys - actual_keys
                        unexpected = actual_keys - expected_keys

                        if missing or unexpected:
                            f.write("\nDifferences:\n")
                            if missing:
                                f.write(f"  Missing (expected but not found): {', '.join(sorted(missing))}\n")
                            if unexpected:
                                f.write(f"  Unexpected (found but not expected): {', '.join(sorted(unexpected))}\n")
                        else:
                            f.write("\nDifferences:\n")
                            f.write("  (none - all expected matches found)\n")

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


def run_datasheet_spec_tests(
    queries: list[tuple[str, str]],
    models: list[tuple[AIType, str]],
    runs: int = 1
):
    """Run datasheet spec extraction tests.

    Args:
        queries: List of (analysis_query, datasheet_url) tuples
        models: Model configurations (AI type and model name)
        runs: Number of runs per query/model combination
    """

    # Create output directory
    output_path = os.path.join(os.path.dirname(__file__), "output")
    os.makedirs(output_path, exist_ok=True)

    # Initialize AI runner with stub metrics service
    openai_runner: AIRunner | None = OpenAIRunner(os.getenv("OPENAI_API_KEY")) if os.getenv("OPENAI_API_KEY") else None  # type: ignore
    claude_runner: AIRunner | None = ClaudeRunner(os.getenv("CLAUDE_API_KEY")) if os.getenv("CLAUDE_API_KEY") else None  # type: ignore

    progress_handle = ProgressImpl()

    # Run tests for each query/model/reasoning/run combination
    for query, datasheet_url in queries:
        # Generate query key from the query string (sanitize for filename)
        query_key = query.lower().replace(" ", "-").replace("/", "-")[:30]

        for ai_type, model in models:
            for run in range(runs):
                filename_prefix = f"specs_{query_key}_{ai_type.value}_{model}"
                filename_prefix += f"_{run + 1}"

                try:
                    logger.info(f"Datasheet spec test: query '{query}', model {model}")
                    # Check if output already exists (idempotency)
                    json_filename = os.path.join(output_path, f"{filename_prefix}.json")
                    if os.path.exists(json_filename):
                        logger.info(f"Skipping test (output exists): {filename_prefix}")
                        continue

                    # Clear log buffer for this test run
                    log_interceptor.clear()

                    runner = openai_runner if ai_type == AIType.OPENAI else claude_runner
                    if not runner:
                        logger.error(f"No runner available for {ai_type.value} - API key missing")
                        continue

                    service = get_datasheet_extraction_service(model, runner)

                    # Save prompt to file
                    with open(
                        os.path.join(output_path, f"{filename_prefix}_prompt.txt"),
                        "w",
                        encoding="utf-8"
                    ) as f:
                        f.write("System prompt:\n\n")
                        f.write(service.build_prompt(query))
                        f.write("\n\n")
                        f.write("User prompt:\n\n")
                        f.write(query)

                    response = service.extract_specs(query, datasheet_url, progress_handle)

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
