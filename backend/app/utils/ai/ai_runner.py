import logging
from abc import ABC, abstractmethod

from pydantic import BaseModel

from app.services.base_task import ProgressHandle

logger = logging.getLogger(__name__)


class AIFunction(ABC):
    @abstractmethod
    def get_name(self) -> str:
        pass

    @abstractmethod
    def get_description(self) -> str:
        pass

    @abstractmethod
    def get_model(self) -> type[BaseModel]:
        pass

    @abstractmethod
    def execute(self, request: BaseModel, progress_handle: ProgressHandle) -> BaseModel:
        pass


class AIRequest(BaseModel):
    # Input parameters
    system_prompt: str
    user_prompt: str

    # Model parameters
    model: str
    verbosity: str
    reasoning_effort: str | None = None
    reasoning_summary: str | None = None

    # Function calling response model
    response_model: type[BaseModel]

    # File attachments (list of file paths to upload)
    attachments: list[str] | None = None


class AIResponse(BaseModel):
    response: BaseModel
    output_text: str
    elapsed_time: float
    input_tokens: int
    cached_input_tokens: int
    output_tokens: int
    reasoning_tokens: int
    cost: float | None

class NoProgressHandle:
    def send_progress_text(self, text: str) -> None:
        pass
    def send_progress_value(self, value: float) -> None:
        pass
    def send_progress(self, text: str, value: float) -> None:
        pass


class AIRunner(ABC):
    @abstractmethod
    def run(self, request: AIRequest, function_tools: list[AIFunction], progress_handle: ProgressHandle | None = None, streaming: bool = False) -> AIResponse:
        pass
