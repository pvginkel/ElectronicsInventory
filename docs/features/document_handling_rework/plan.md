# Document Handling Rework

## Brief Description

Complete rework of document handling to fix the fundamental misunderstanding about S3 storage. The s3_key field stores actual files (images, PDFs, website preview images), not thumbnails. Thumbnails are generated dynamically from S3 content. The current implementation incorrectly treats s3_key as thumbnail storage, causing confusion in DocumentService and URLThumbnailService.

## Files and Functions to Modify

### Model Layer Changes

**app/models/part_attachment.py**
- Remove fields: `attachment_metadata`, properties `is_image`, `is_pdf`, `is_url`, `has_image`
- Keep only: `id`, `part_id`, `attachment_type`, `title`, `s3_key`, `url`, `filename`, `content_type`, `file_size`, timestamps
- Add computed property: `has_preview` that returns `True` if `content_type` starts with 'image/' (no database field)

**app/schemas/part_attachment.py**
- Remove `attachment_metadata` field from: `PartAttachmentResponseSchema`, `PartAttachmentListSchema`
- Remove `has_image` computed field from all schemas
- Add `has_preview` computed field that checks `content_type.startswith('image/')`

**app/schemas/url_metadata.py**
- Delete `ThumbnailSourceType` enum entirely
- File can be removed after migrating necessary schemas

### Service Layer Changes

**app/services/html_document_handler.py** (NEW FILE)
- Create new service to handle HTML document processing
- Functions to create:
  - `process_html_content(content: bytes, url: str) -> HtmlDocumentInfo`
  - `_extract_page_title(soup: BeautifulSoup) -> str | None`
  - `_find_preview_image(soup: BeautifulSoup, url: str, download_cache: DownloadCacheService) -> tuple[bytes, str] | None`

**app/services/document_service.py**
- Add: `process_upload_url(url: str) -> UploadDocumentSchema` - Main bottleneck for URL processing
- Modify: `create_url_attachment()` - Use process_upload_url for unified processing
- Modify: `create_file_attachment()` - Merge logic with URL path after download, use python-magic on raw bytes (ignore file.content_type)
- Simplify: `get_attachment_file_data()` - Just return S3 content, no special handling
- Modify: `get_attachment_thumbnail()` - Generate thumbnails for images, return fallback icons appropriately
- Add: `get_preview_image(url: str) -> tuple[bytes, str] | None` - Replace URLThumbnailService.get_preview_image_url
- Remove: `_attachment_has_image_from_metadata()`
- Simplify: `attachment_has_image()` - Check `content_type.startswith('image/')`
- Add image validation: Filter out 1x1 tracking pixels, reject videos/animated GIFs

**app/services/image_service.py**
- Remove: `process_uploaded_image()` - Store images verbatim without conversion

**app/services/url_thumbnail_service.py**
- DELETE ENTIRE FILE - Functionality moved to DocumentService and HtmlDocumentHandler

### Schema Additions

**app/schemas/upload_document.py** (NEW FILE)
- Create `UploadDocumentContentSchema` with fields: `content: bytes`, `content_type: str`
- Create `UploadDocumentSchema` with fields:
  - `title: str` - HTML title or detected filename
  - `content: UploadDocumentContentSchema` - Raw content from URL
  - `detected_type: str` - MIME type from magic
  - `preview_image: UploadDocumentContentSchema | None` - Preview for websites

### API Layer Changes

**app/api/documents.py**
- Modify: `attachment_preview_image()` - Use new DocumentService.get_preview_image()
- Remove references to URLThumbnailService

### Dependency Injection Updates

**app/services/container.py**
- Remove URLThumbnailService provider
- Add HtmlDocumentHandler provider
- Update DocumentService dependencies

### Test Suite Changes

**tests/test_document_service.py**
- Remove all assertions on `attachment_metadata`
- Update image upload tests to verify verbatim storage
- Test that images are stored byte-for-byte identical
- Test that JPEG images aren't re-encoded
- Test that PNG transparency is preserved
- Test that file upload content_type is ignored (python-magic used instead)
- Add tests for `process_upload_url()`
- Add tests for preview image extraction
- Test 1x1 tracking pixel filtering
- Test video/GIF rejection for preview images

**tests/test_url_thumbnail_service.py**
- DELETE ENTIRE FILE

**tests/test_html_document_handler.py** (NEW FILE)
- Test HTML parsing and title extraction
- Test preview image priority (og:image → twitter:image → favicon)
- Test Google favicon API fallback
- Test preview extraction with real-world HTML (broken meta tags, malformed HTML)
- Test 1x1 tracking pixel filtering in preview images
- Test video/GIF rejection for preview images

**tests/test_document_integration.py** (NEW FILE)
- Integration tests using mocked DownloadCacheService.get_cached_content
- Test complete URL attachment flow:
  - HTML page with og:image → download page → extract image URL → download image → store in S3
  - Direct image URL → download → detect type → store in S3
  - PDF URL → download → detect type → store in S3
  - Website without preview images → store only URL, leave s3_key empty
  - Generic file type (e.g., .zip, .exe) → store only URL, leave s3_key empty
- Test content type detection chain:
  - Mock various content combinations (wrong HTTP headers, actual content)
  - Verify python-magic detection overrides HTTP headers
- Test error scenarios:
  - Preview image returns 404
  - Preview image is actually HTML (redirect page)
  - Preview image is 1x1 pixel
  - Timeout during preview download
- Test real-world HTML patterns:
  - Mock responses from popular sites (GitHub, YouTube, news sites)
  - Broken HTML with unclosed tags
  - HTML with multiple og:image tags
  - Relative URLs in meta tags

## Algorithm Details

### URL Processing Algorithm (DocumentService.process_upload_url)

1. **Download content**
   - Use DownloadCacheService.get_cached_content(url)
   - Get raw bytes
   - Use python-magic to detect actual content type from bytes (ignore HTTP headers)

2. **Determine content handling based on detected MIME type**
   - Use python-magic on raw bytes for reliable detection
   - If `text/html`: Process as HTML document
   - If `image/*`: Store raw image data in S3
   - If `application/pdf`: Store raw PDF data in S3
   - Otherwise: Process as generic file (only store URL, no S3 content - same as HTML without preview)

3. **HTML document processing**
   - Parse HTML with BeautifulSoup
   - Extract page title from `<title>` tag
   - Find preview image in priority order:
     - Try og:image meta tag - download and validate (filter out 1x1 tracking pixels)
     - Try twitter:image meta tag - download and validate (filter out 1x1 tracking pixels)
     - Try link rel="icon" - download and validate (filter out 1x1 tracking pixels)
     - Use Google favicon API only if returns valid image (not 404)
     - Skip videos and animated GIFs - only accept static images
   - Return first successfully downloaded valid image

4. **Determine S3 storage content**
   - For direct images/PDFs: Store raw downloaded content in S3
   - For HTML websites: Store preview image if found, otherwise leave s3_key empty
   - For other content types (non-HTML, non-image, non-PDF): Leave s3_key empty, only store URL
   - Content type in attachment record must match S3 content (or be empty if no S3 storage)

5. **Return UploadDocumentSchema**
   - title: Page title for HTML, detected filename for all other types, or "upload.<extension>" as fallback
   - content: Raw content and content type
   - detected_type: MIME type from magic
   - preview_image: Image data for websites (what goes in S3), None for non-HTML/non-image/non-PDF types

### Thumbnail Generation Algorithm (DocumentService.get_attachment_thumbnail)

1. **Check if content_type starts with 'image/'**
   - If yes and s3_key exists: Generate/retrieve thumbnail from S3 content
   - If yes but no s3_key: Should not happen (error case)
   - If no and attachment_type is PDF: Return PDF icon SVG
   - If no and attachment_type is URL: Return link icon SVG

2. **Thumbnail generation for images**
   - Download from S3 if not cached locally
   - Use PIL to resize maintaining aspect ratio
   - Cache locally in filesystem
   - Return path to cached thumbnail

### Preview Image Algorithm (DocumentService.get_preview_image)

1. **Process URL to determine content**
   - Use process_upload_url to get metadata
   - Check if preview_image is available

2. **Return appropriate image data**
   - If preview_image exists: Return image content and type
   - If direct image: Return the image itself
   - Otherwise: Return None

## Implementation Phases

### Phase 1: Test-Driven Development Setup
1. Write failing tests for new behavior in test_document_service.py
2. Create test_html_document_handler.py with comprehensive tests
3. Create test_document_integration.py with mocked DownloadCacheService
4. Update existing tests to remove attachment_metadata assertions
5. Set up mock fixtures for common HTML patterns and file types

### Phase 2: Core Service Implementation
1. Create HtmlDocumentHandler service
2. Implement DocumentService.process_upload_url method
3. Remove URLThumbnailService
4. Update DocumentService methods to use new flow

### Phase 3: Model and Schema Updates
1. Remove attachment_metadata from PartAttachment model
2. Update all schemas to remove metadata fields
3. Create new UploadDocumentSchema

### Phase 4: Integration and Cleanup
1. Update API endpoints
2. Fix dependency injection
3. Remove obsolete code and imports
4. Create database migration to drop attachment_metadata column

### Phase 5: Verification
1. Run full test suite
2. Manual testing of file uploads (verify content_type detection from bytes)
3. Manual testing of URL uploads
4. Verify thumbnail generation
5. Verify preview functionality
6. Test 1x1 pixel and video/GIF filtering