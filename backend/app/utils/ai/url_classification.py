from abc import abstractmethod
from typing import cast

from pydantic import BaseModel, ConfigDict, Field

from app.services.base_task import ProgressHandle
from app.utils.ai.ai_runner import AIFunction


class ClassifyUrlsRequest(BaseModel):
    # """Request schema for URL classification function."""
    model_config = ConfigDict(extra="forbid", json_schema_extra={"additionalProperties": False})
    urls: list[str] = Field(...)


class ClassifyUrlsEntry(BaseModel):
    # """Schema for each URL's classification result."""
    model_config = ConfigDict(extra="forbid")
    url: str
    classification: str


class ClassifyUrlsResponse(BaseModel):
    """Response schema with list of classified URLs."""
    model_config = ConfigDict(extra="forbid")
    urls: list[ClassifyUrlsEntry] = Field(...)


class URLClassifierFunction(AIFunction):
    def get_name(self) -> str:
        return "classify_urls"

    def get_description(self) -> str:
        return "Classify the URLs as PDF, image, webpage or invalid."

    def get_model(self) -> type[BaseModel]:
        return ClassifyUrlsRequest

    def execute(self, request: BaseModel, progress_handle: ProgressHandle) -> BaseModel:
        return self.classify_url(cast(ClassifyUrlsRequest, request), progress_handle)

    @abstractmethod
    def classify_url(self, request: ClassifyUrlsRequest, progress_handle: ProgressHandle) -> ClassifyUrlsResponse:
        pass
