import json
import logging
import os
import traceback
from typing import Type

from dotenv import load_dotenv
from jinja2 import Environment
from pydantic import BaseModel

from data import PRODUCT_CATEGORIES
from ai_runner import AIRunner
import current_model
from tools.prompttester.url_classifier_service import URLClassifierService

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

logger = logging.getLogger(__name__)

def render_template(prompt_template: str) -> str:
    context = {
        "categories": PRODUCT_CATEGORIES
    }

    with open(os.path.join(os.path.dirname(__file__), prompt_template)) as f:
        template_str = f.read()

    env_inline = Environment()
    template_inline = env_inline.from_string(template_str)

    return template_inline.render(**context)

def run_tests(prompt_template: str, response_model: Type[BaseModel], queries: list[tuple[str, str]], models: dict[str, list[str] | None], runs: int = 1):
    tmp_path = os.path.join(os.path.dirname(__file__), "tmp")
    os.makedirs(tmp_path, exist_ok=True)

    runner = AIRunner(response_model, URLClassifierService(tmp_path))
    prompt = render_template(prompt_template)

    output_path = os.path.join(os.path.dirname(__file__), "output")
    os.makedirs(output_path, exist_ok=True)

    with open(os.path.join(output_path, "prompt.md"), "w") as f:
        f.write(prompt)
    
    with open(os.path.join(output_path, "schema.json"), "w") as f:
        json.dump(response_model.model_json_schema(), f, indent=4, ensure_ascii=False)

    for query, query_key in queries:
        for model, reasoning_efforts in models.items():
            for reasoning_effort in reasoning_efforts if reasoning_efforts else [None]:
                for run in range(0, runs):
                    filename = f"{query_key}_{model}"
                    if reasoning_effort:
                        filename += f"_{reasoning_effort}"
                    if runs > 1:
                        filename += f"_{run + 1}"

                    if os.path.exists(os.path.join(output_path, f"{filename}.json")):
                        logger.info(f"Skipping {filename}")
                        continue
                    
                    try:
                        logger.info(f"Run: query {query}, query_key {query_key}, model {model}, reasoning_effort {reasoning_effort}")

                        streaming = True
                        result = runner.run(streaming, model, "medium", reasoning_effort, prompt, query)

                        with open(os.path.join(output_path, f"{filename}.json"), "w", encoding="utf-8") as f:
                            json.dump(json.loads(result.output_text), f, indent=4, ensure_ascii=False)                    
                        
                        with open(os.path.join(output_path, f"{filename}.txt"), "w", encoding="utf-8") as f:
                            f.write(f"Elapsed time: {result.elapsed_time}\n")
                            f.write(f"Input tokens: {result.input_tokens}\n")
                            f.write(f"Input tokens cached: {result.cached_input_tokens}\n")
                            f.write(f"Output tokens: {result.output_tokens}\n")
                            f.write(f"Output reasoning tokens: {result.reasoning_tokens}\n")
                            if result.cost:
                                f.write(f"Cost: ${result.cost:.3f}")
                    except Exception as e:
                        logger.error("Run failed {e}", e)

                        with open(os.path.join(output_path, f"{filename}.err"), "w", encoding="utf-8") as f:
                            f.write(f"Exception type: {type(e).__name__}\n")
                            f.write(f"Message: {str(e)}\n\n")
                            f.write("Stack trace:\n")
                            f.write("".join(traceback.format_exception(type(e), e, e.__traceback__)))


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
        # "o3": reasoning_efforts,
        # "o4-mini",: reasoning_efforts,
    }
    queries = [
        ("HLK PM24", "hlk-pm24"),
        ("ESP32-S3FN8", "esp32-s3fn8"),
        ("Arduino Nano Every", "arduino-nano-every"),
        ("DFRobot Gravity SGP40", "dfrobot-gravity-sgp40"),
    ]

    run_tests(
        "current_prompt.md",
        current_model.PartAnalysisSuggestion,
        queries,
        models,
        3
    )

if __name__ == "__main__":
    main()
