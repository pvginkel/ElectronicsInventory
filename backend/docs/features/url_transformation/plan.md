# URL Transformation for Document Downloads

## Description

Add intelligent URL transformation logic to `DocumentService.process_upload_url` using an interceptor pattern to handle special cases where the actual document content differs from what's initially served. The primary use case is handling LCSC.com URLs that end in `.pdf` but serve HTML pages containing iframes with the actual PDF document. The interceptor approach allows each interceptor to call the next in the chain, inspect and potentially modify the result.

## Files to Create

### `app/services/url_transformers/base.py`
- **URLInterceptor** (abstract base class)
  - `intercept(url: str, next: Callable[[str], DownloadResult]) -> DownloadResult` - Intercepts URL download, calls next, and optionally transforms result

### `app/services/url_transformers/lcsc_interceptor.py`
- **LCSCInterceptor** (extends URLInterceptor)
  - Implements LCSC-specific iframe extraction logic

### `app/services/url_transformers/registry.py`
- **URLInterceptorRegistry** (manages interceptor chain)
  - `register(interceptor: URLInterceptor)` - Adds interceptor to chain
  - `build_chain(base_downloader: Callable[[str], DownloadResult]) -> Callable[[str], DownloadResult]` - Builds interceptor chain

### `app/services/url_transformers/__init__.py`
- Exports public API components

## Files to Modify

### `app/services/document_service.py`
- **DocumentService.__init__**: Add `url_interceptor_registry: URLInterceptorRegistry` parameter
- **DocumentService.process_upload_url**: Replace `get_cached_content` call with interceptor chain call

### `app/services/container.py`
- Add `url_interceptor_registry` as Singleton provider
- Register LCSC interceptor during initialization
- Update `document_service` factory to include registry dependency

### `app/models/part_attachment.py`
- Verify `url` field stores original URL (no changes needed based on current implementation)

## Algorithm Details

### LCSC Interceptor Algorithm

1. **Intercept Method**
   - Call `next(url)` to get the initial `DownloadResult` 
   - Check if URL domain is `www.lcsc.com` and path ends with `.pdf`
   - If not LCSC PDF URL, return the original `DownloadResult` unchanged
   - If content_type is already `application/pdf`, return original result
   - If content_type is `text/html`:
     - Parse HTML content using BeautifulSoup
     - Find all `<iframe>` elements in the document
     - For each iframe:
       - Extract `src` attribute
       - Check if src ends with `.pdf`
       - Resolve relative URLs to absolute using base URL
       - Call `next(iframe_url)` to download the iframe content
       - If result has content_type `application/pdf`, return that `DownloadResult`
   - Return original result if no valid PDF found in iframes

### Interceptor Chain Algorithm

1. Registry builds chain by wrapping each interceptor around the next
2. Chain starts with actual `download_cache_service.get_cached_content` method
3. Each interceptor can:
   - Call `next(url)` with same or different URL
   - Inspect the returned `DownloadResult`
   - Return modified or original `DownloadResult`
4. Final result flows back through the chain

### Integration in DocumentService

1. In `process_upload_url` method, replace line 70:
   ```python
   # OLD:
   download_result = self.download_cache_service.get_cached_content(url)
   
   # NEW:
   chain = self.url_interceptor_registry.build_chain(self.download_cache_service.get_cached_content)
   download_result = chain(url)
   ```
2. Rest of `process_upload_url` logic remains unchanged

## Test Requirements

### Unit Tests

- **test_lcsc_transformer.py**
  - Test URL matching (lcsc.com with .pdf extension)
  - Test HTML parsing with single iframe
  - Test HTML parsing with multiple iframes
  - Test handling of non-PDF iframe sources
  - Test handling when no iframes present
  - Test handling of malformed HTML

- **test_url_transformer_registry.py**
  - Test transformer registration
  - Test transformation application order
  - Test handling when no transformers match
  - Test handling when transformer returns None

### Integration Tests

- **test_document_service.py** (updates)
  - Test LCSC URL processing end-to-end
  - Test that original URL is preserved in attachment
  - Test fallback to normal processing when no transformation applies
  - Test with multiple registered transformers

## Implementation Notes

- The original URL must always be stored in the `PartAttachment.url` field
- Transformers should be stateless and thread-safe
- Download failures in transformers should return None (not raise exceptions)
- The registry should maintain transformers in a deterministic order
- Consider adding logging for debugging transformation attempts