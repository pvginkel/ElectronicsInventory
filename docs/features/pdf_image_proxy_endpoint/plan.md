# PDF and Image Proxy Endpoint for AI Analysis

## Brief Description

Add a proxy endpoint that retrieves PDF and image content from external URLs to avoid CORS and iframe blocking issues when displaying AI-suggested documents in the frontend. The proxy will handle PDF documents and images returned by the AI analysis, allowing them to be displayed in iframes without cross-origin restrictions. This includes refactoring the URLThumbnailService to return structured Pydantic models for better type safety.

## Files and Functions to Create/Modify

### Phase 1: Refactor URLThumbnailService to use Pydantic models

#### 1. `app/schemas/url_metadata.py` (NEW)
- **Create enum**: `ThumbnailSourceType`
  ```python
  class ThumbnailSourceType(str, Enum):
      PREVIEW_IMAGE = "preview_image"  # og:image or twitter:image
      FAVICON = "favicon"
      DIRECT_IMAGE = "direct_image"
      PDF = "pdf"
      OTHER = "other"
  ```

- **Create enum**: `URLContentType`
  ```python
  class URLContentType(str, Enum):
      WEBPAGE = "webpage"
      IMAGE = "image"
      PDF = "pdf"
      OTHER = "other"  # For unknown MIME types
  ```

- **Create schema**: `URLMetadataSchema`
  - Fields:
    - `title: str | None` - Page/file title
    - `page_title: str | None` - Deprecated, kept for backward compatibility
    - `description: str | None` - Meta description
    - `og_image: str | None` - Open Graph image URL
    - `favicon: str | None` - Favicon URL
    - `thumbnail_source: ThumbnailSourceType` - Source of thumbnail
    - `original_url: str` - Original URL requested
    - `content_type: URLContentType` - Content type enum
    - `mime_type: str | None` - Actual MIME type for OTHER content_type
    - `thumbnail_url: str | None` - URL for thumbnail image
  - Add computed property `is_pdf` that returns `self.content_type == URLContentType.PDF`
  - Add computed property `is_image` that returns `self.content_type == URLContentType.IMAGE`

#### 2. `app/services/url_thumbnail_service.py`
- **Modify function**: `extract_metadata()` 
  - Change return type from `dict` to `URLMetadataSchema`
  - Update all internal process methods to return `URLMetadataSchema`:
    - `_process_html_content()` - set content_type to `URLContentType.WEBPAGE`
    - `_process_image_content()` - set content_type to `URLContentType.IMAGE`
    - `_process_pdf_content()` - set content_type to `URLContentType.PDF`
    - `_process_other_content()` - set content_type to `URLContentType.OTHER` and populate mime_type
  - Update thumbnail_source to use `ThumbnailSourceType` enum values
    - When finding og:image or twitter:image, use `ThumbnailSourceType.PREVIEW_IMAGE`
- **Modify function**: `extract_thumbnail_url()`
  - Update to return `tuple[str, URLMetadataSchema]`
- **Modify function**: `download_and_store_thumbnail()`
  - Update to work with `URLMetadataSchema`
  - Return metadata as dict for backward compatibility (use `.model_dump()`)

#### 3. `app/api/documents.py`
- **Modify function**: `attachment_preview()`
  - Update to work with `URLMetadataSchema` instead of dict
  - Access fields via dot notation: `metadata.title`, `metadata.og_image`, etc.
  - Check for images using: `if metadata.og_image or metadata.favicon:`

#### 4. `app/services/ai_service.py`
- **Modify function**: `_document_from_link()`
  - Update to work with `URLMetadataSchema` instead of dict
  - Access fields via dot notation
  - Check for content type using: `metadata.content_type`

#### 5. Update tests
- `tests/test_url_thumbnail_service.py` - Update all tests to work with `URLMetadataSchema`
- `tests/test_document_api.py` - Update mock returns to use `URLMetadataSchema`
- `tests/test_ai_service.py` - Update mock returns to use `URLMetadataSchema`

### Phase 2: Implement Proxy Endpoint

#### 1. `app/api/documents.py`
- **Add new endpoint**: `GET /parts/attachment-proxy/content`
  - Function: `attachment_proxy_content()`
  - Query parameter: `url` (the external URL to proxy)
  - Returns the actual file content with appropriate headers
  - Reuses existing download and caching infrastructure

#### 2. `app/services/ai_service.py`
- **Modify function**: `_document_from_link()`
  - After getting metadata, check if it's a PDF or image:
    ```python
    if metadata.is_pdf or metadata.is_image:
        encoded_url = quote(url, safe='')
        preview.original_url = f"/api/parts/attachment-proxy/content?url={encoded_url}"
    ```
  - For images, continue setting `preview.image_url` to existing image proxy endpoint
  - Keep the document suggestion's `url` field as the original URL

#### 3. `app/schemas/ai_part_analysis.py`
- **No changes needed**: Schema already supports the required fields

## Step-by-Step Algorithm

### Phase 1: URLMetadataSchema Refactoring
1. Create new Pydantic models with enums for type safety
2. Update `URLThumbnailService` methods to construct and return `URLMetadataSchema` objects
3. Update all consumers to use the new schema with dot notation
4. Ensure backward compatibility where needed (e.g., `download_and_store_thumbnail`)

### Phase 2: Proxy Endpoint Implementation
1. **Content Type Detection in AI Service**
   - When `_document_from_link()` is called with a URL
   - Call `url_thumbnail_service.extract_metadata()` to get metadata
   - Check `metadata.is_pdf` or `metadata.is_image`
   - If true, set `preview.original_url` to proxy endpoint URL
   - Keep `document.url` as the original URL

2. **Proxy Endpoint Implementation**
   - Receive GET request with `url` query parameter
   - Validate the URL using `url_thumbnail_service.validate_url()`
   - Use `download_cache_service.get_cached_content()` to fetch content
   - Return the content with:
     - Appropriate `Content-Type` header from detected type
     - `Content-Disposition: inline` to allow iframe display
     - No CORS restrictions (served from same origin)

3. **Frontend Usage** (no changes needed)
   - Frontend receives AI analysis results with document suggestions
   - For displaying in iframe: Use `preview.original_url` (proxy URL for PDFs/images)
   - For saving the document: Use `document.url` (actual source URL)

## Implementation Notes

- The refactoring to Pydantic models provides:
  - Type safety and better IDE support
  - Clear enum values instead of magic strings
  - Computed properties for easy content type checking
- The proxy endpoint leverages existing `DownloadCacheService` for:
  - Content caching (15-minute cache)
  - Content type detection using python-magic
  - Size limits and timeout handling
- Security: URL validation prevents SSRF attacks
- The frontend doesn't need changes as it already uses preview URLs for display
- Original URLs are preserved in the document suggestion for proper attribution