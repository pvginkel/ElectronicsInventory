import logging
import os
import threading
import traceback
from dataclasses import dataclass
from typing import Any, cast

from dotenv import load_dotenv
from jinja2 import Environment
from pydantic import BaseModel

from app.services.base_task import ProgressHandle
from app.utils.ai.ai_runner import AIFunction, AIRequest, AIRunner
from app.utils.file_parsers import get_types_from_setup
from tools.prompttester.model import (
    AllUrlsSchema,
    BasicInformationSchema,
    PartDetailsSchema,
    PartFullSchema,
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


@dataclass
class RunParameters:
    runner: AIRunner
    model: str
    reasoning_effort: str | None
    output_path: str
    filename_prefix: str
    url_classifier: AIFunction
    progress_handle: ProgressImpl


def render_template(prompt_template: str, context: dict[str, Any] | None = None) -> str:
    with open(os.path.join(os.path.dirname(__file__), prompt_template)) as f:
        template_str = f.read()

    env_inline = Environment()
    template_inline = env_inline.from_string(template_str)

    return template_inline.render(**(context or {}))

def run_tests(queries: list[tuple[str, str]], models: dict[str, list[str] | None], runs: int = 1):
    tmp_path = os.path.join(os.path.dirname(__file__), "tmp")
    os.makedirs(tmp_path, exist_ok=True)

    runner = AIRunner(os.getenv("OPENAI_API_KEY")) # type: ignore

    output_path = os.path.join(os.path.dirname(__file__), "output")
    os.makedirs(output_path, exist_ok=True)

    progress_handle = ProgressImpl()
    url_classifier = URLClassifierFunctionImpl(tmp_path)

    for query, query_key in queries:
        for model, reasoning_efforts in models.items():
            for reasoning_effort in reasoning_efforts if reasoning_efforts else [None]:
                for run in range(0, runs):
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

def get_full_schema(query: str, run_parameters: RunParameters) -> PartFullSchema:
    system_prompt = render_template("prompt_full_schema.md", {
        "categories": get_types_from_setup()
    })
    user_prompt = query

    response = call_ai(
        system_prompt,
        user_prompt,
        run_parameters,
        [run_parameters.url_classifier],
        PartFullSchema,
        f"{run_parameters.filename_prefix}_full-schema"
    )

    return cast(PartFullSchema, response)

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

def main():
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
        # "gpt-5-nano": reasoning_efforts,
        # "o3": reasoning_efforts,
        # "o4-mini",: reasoning_efforts,
    }
    queries = [
        # ("HLK PM24", "hlk-pm24"),
        # ("ESP32-S3FN8", "esp32-s3fn8"),
        # ("Arduino Nano Every", "arduino-nano-every"),
        # ("DFRobot Gravity SGP40", "dfrobot-gravity-sgp40"),
        ("generic tht resistor 1/4w 1% 10k", "generic-resistor-10k"),
    ]

    run_tests(
        queries,
        models,
        1
    )

if __name__ == "__main__":
    main()
