# URL Preview Feature Plan

## Brief Description

Implement URL preview functionality to support the frontend document upload dialog. This feature provides a lightweight endpoint that, given a URL, returns the document title and a backend endpoint URL for the preview image without creating an attachment. This allows users to see what they're adding before confirming the document creation.

## Files to Create

### Schemas
- `app/schemas/url_preview.py` - URL preview request/response schemas

## Files to Modify

### API Endpoints
- `app/api/documents.py` - Add `attachment_preview` endpoint to existing documents blueprint

## API Endpoint Design

### URL Preview Endpoint
- `POST /api/parts/attachment-preview` - Get URL preview (title and backend image endpoint)
  - Request body: `{"url": "https://example.com"}`
  - Response: `{"title": "Page Title", "image_url": "/api/parts/attachment-preview/image?url=https%3A//example.com", "original_url": "https://example.com"}`

### URL Preview Image Endpoint  
- `GET /api/parts/attachment-preview/image?url=<encoded_url>` - Get preview image for URL
  - Query parameter: `url` (URL-encoded original URL)
  - Returns: Image data with appropriate Content-Type header

## Core Algorithm

### URL Preview Processing
1. **Input Validation**
   - Validate URL format and accessibility using existing `URLThumbnailService.validate_url()`
   - Return error for invalid URLs

2. **Metadata Extraction**
   - Use existing `URLThumbnailService.extract_thumbnail_url()` method to get page metadata
   - Extract page title from existing metadata structure
   - Generate backend image endpoint URL for preview image
   - No file storage - metadata extraction only

3. **Response Format**
   - Return structured JSON with title, backend image_url, and original_url
   - Handle missing metadata gracefully (return null for unavailable fields)

### URL Preview Image Processing
1. **URL Parameter Processing**
   - Extract and decode URL from query parameter
   - Validate URL using existing `URLThumbnailService.validate_url()`

2. **Image Retrieval**
   - Use existing `URLThumbnailService.extract_thumbnail_url()` to get thumbnail URL
   - Use existing `URLThumbnailService._download_image()` method to fetch image data
   - Return image data directly with appropriate Content-Type header

3. **Error Handling**
   - Return 400 for invalid URLs
   - Return 404 for URLs with no extractable images
   - Return 500 for processing errors

## Implementation Approach

### Leveraging Existing Infrastructure
- Reuse `URLThumbnailService.extract_thumbnail_url()` for URL processing and metadata extraction
- Reuse `URLThumbnailService._download_image()` for image retrieval in preview image endpoint
- No S3 storage operations - temporary image processing only
- Use existing URL validation and safety limits
- Follow existing error handling patterns

### API Design
- Add two endpoints to existing documents blueprint:
  1. `attachment_preview` - POST endpoint for metadata extraction
  2. `attachment_preview_image` - GET endpoint for image serving
- Uses existing dependency injection patterns with `@inject` decorator
- Follows existing error handling with `@handle_api_errors`
- No additional API module wiring needed since it's added to existing documents blueprint

## Schema Design

### Request Schema
```python
class UrlPreviewRequestSchema(BaseModel):
    url: str = Field(..., description="URL to preview")
```

### Response Schema
```python
class UrlPreviewResponseSchema(BaseModel):
    title: str | None = Field(None, description="Page title")
    image_url: str | None = Field(None, description="Backend endpoint URL for preview image")
    original_url: str = Field(..., description="Original URL")
```

## Security Considerations

### URL Safety
- Use existing URL validation in `URLThumbnailService.validate_url()`
- Leverage existing request timeouts and size limits
- Maintain existing safety restrictions for external requests
- Follow existing patterns for handling redirects and malicious URLs

### No Storage Impact  
- Preview metadata endpoint performs no file operations
- Preview image endpoint performs temporary image processing only (no S3 or disk storage)
- No database operations beyond dependency injection
- Purely read-only metadata extraction and temporary image serving

## Error Handling

### HTTP Status Codes
- 200: Successful preview extraction
- 400: Invalid URL format or request data
- 422: URL not accessible or extraction failed
- 500: Server error during processing

### Error Response Format
- Follow existing `ErrorResponseSchema` pattern
- Use existing `@handle_api_errors` decorator
- Map `InvalidOperationException` to appropriate HTTP status

## Testing Requirements

### Unit Tests
- Test URL preview metadata extraction with valid URLs
- Test preview image endpoint with various image sources (og:image, twitter:image, favicon)
- Test error handling for invalid URLs in both endpoints
- Test error handling for inaccessible URLs
- Test response format validation for preview metadata
- Test image data serving with proper Content-Type headers
- Test URL encoding/decoding for image endpoint query parameters

### Integration Tests  
- Test preview metadata API endpoint with real URLs
- Test preview image API endpoint with real URLs
- Test error responses and status codes for both endpoints
- Test schema validation for requests and responses
- Test end-to-end flow: metadata extraction -> image URL generation -> image serving