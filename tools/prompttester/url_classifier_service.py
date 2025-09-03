import requests
import logging
import os
import hashlib

from pydantic import BaseModel, ConfigDict, Field

logger = logging.getLogger(__name__)


class ClassifyUrlsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    urls: list[str] = Field(...)


class ClassifyUrlsEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")
    url: str
    classification: str
    reason: str


class ClassifyUrlsResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    urls: list[ClassifyUrlsEntry] = Field(...)

class URLClassifierService:
    def __init__(self, cache_path: str):
        self.cache_path = cache_path
        os.makedirs(self.cache_path, exist_ok=True)

    def classify_urls(self, request: ClassifyUrlsRequest):
        urls: list[ClassifyUrlsEntry] = []

        for url in request.urls:
            entry = self._get_cached(url)
            if not entry:
                entry = self._classify_url(url)
                self._cache(url, entry)
            urls.append(entry)

        return ClassifyUrlsResponse(urls=urls)

    def _get_cached(self, url: str) -> ClassifyUrlsEntry | None:
        path = self._cache_cache_filename(url)

        if os.path.exists(path):
            with open(path) as f:
                return ClassifyUrlsEntry.model_validate_json(f.read())
        
        return None

    def _cache(self, url: str, entry: ClassifyUrlsEntry) -> None:
        path = self._cache_cache_filename(url)

        with open(path, 'w') as f:
            f.write(entry.model_dump_json())

    def _cache_cache_filename(self, url: str) -> str:
        filename = hashlib.sha256(url.encode('utf-8')).hexdigest()
        return os.path.join(self.cache_path, "classification-" + filename)

    def _classify_url(self, url: str) -> ClassifyUrlsEntry:
        logger.info(f"Classifying url {url}")
        try:
            response = requests.head(url, allow_redirects=True, timeout=10)

            # Raise for HTTP errors (4xx/5xx)
            response.raise_for_status()

            content_type = response.headers.get("Content-Type", "unknown")
            logger.info(f"Content-Type: {content_type}")

            if content_type.startswith("image/"):
                return ClassifyUrlsEntry(url=url, classification="image", reason=f"Content type is {content_type}")
            if content_type == "application/pdf":
                return ClassifyUrlsEntry(url=url, classification="pdf", reason=f"Content type is {content_type}")
            return ClassifyUrlsEntry(url=url, classification="webpage", reason=f"Content type is {content_type}")

        except requests.exceptions.HTTPError as e:
            # HTTP error code returned
            status_code = e.response.status_code if e.response else None
            reason = e.response.reason if e.response else None
            logger.info(f"HTTP error {status_code} reason {reason}: {e}")

            return ClassifyUrlsEntry(url=url, classification="invalid", reason=f"HTTP error is {status_code} reason {reason}")

        except requests.exceptions.RequestException as e:
            # Network error, timeout, DNS, etc.
            logger.info(f"Request failed: {e}")

            return ClassifyUrlsEntry(url=url, classification="invalid", reason=f"Unknown error of type {type(e).__name__}")