# Download Cache Service - Technical Plan

## Brief Description
Create a new `DownloadCacheService` to centralize URL downloading and caching across the application. Currently, multiple services download the same URLs repeatedly without caching, leading to redundant network requests. The temporary file manager exists but is underutilized for caching downloaded content.

## Files to be Created

### New Service
- `app/services/download_cache_service.py` - New service with `get_cached_content()` method

## Files to be Modified

### Configuration
- `app/config.py` - Add `DOWNLOAD_CACHE_BASE_PATH` and `DOWNLOAD_CACHE_CLEANUP_HOURS` settings

### Core Infrastructure  
- `app/utils/temp_file_manager.py` - Add URL caching methods: `get_cached()`, `cache()`, `_url_to_path()`
- `app/services/container.py` - Wire up new service and fix missing dependencies

### Existing Services
- `app/services/url_thumbnail_service.py` - Replace duplicate download methods with cache service calls
- `app/services/document_service.py` - Add download cache service dependency for URL attachments  
- `app/services/ai_service.py` - Use cache service for document downloads

### Tests
- `tests/test_download_cache_service.py` - New test file for cache service
- `tests/test_temp_file_manager.py` - Add tests for new caching methods

## Implementation Algorithm

### URL Caching Algorithm
1. **Cache Key Generation**: Convert URL to SHA256 hash for consistent file naming
2. **Cache Lookup**: Check if cached file exists and is within cleanup age
3. **Download on Miss**: If not cached or expired, download with timeout and size limits
4. **Store in Cache**: Save content and metadata (content-type, timestamp) to temp directory
5. **Return Content**: Provide bytes and detected content-type to caller

### Content Detection Flow
1. Download raw bytes with size limit (100MB default)
2. Use python-magic to detect actual MIME type
3. Store both declared and detected content types
4. Return detected type as authoritative

## Service Dependencies

### New Dependency Graph
```
DownloadCacheService -> TempFileManager
URLThumbnailService -> DownloadCacheService, S3Service  
DocumentService -> DownloadCacheService, S3Service, ImageService, URLThumbnailService
AIService -> DownloadCacheService, TempFileManager, TypeService, URLThumbnailService
```

### Container Wiring Changes
- Initialize TempFileManager with configurable base path
- Create DownloadCacheService factory with TempFileManager dependency
- Add DownloadCacheService to URLThumbnailService dependencies
- Fix missing URLThumbnailService dependency in AIService

## Implementation Phases

### Phase 1: Core Infrastructure
1. Add configuration settings for cache paths and cleanup timing
2. Enhance TempFileManager with URL-to-path mapping and caching methods
3. Create basic DownloadCacheService with download and cache logic

### Phase 2: Service Integration  
1. Update service container with new dependencies
2. Refactor URLThumbnailService to use cache instead of direct downloads
3. Update DocumentService to leverage cache for URL attachments

### Phase 3: AI Service Integration
1. Fix missing URLThumbnailService dependency in AIService
2. Update AIService to use DownloadCacheService for document downloads
3. Remove duplicate download code from AI workflows

### Phase 4: Testing and Validation
1. Write comprehensive tests for cache hit/miss scenarios
2. Test different content types and error conditions
3. Verify cache cleanup and concurrent access behavior
4. Performance testing to confirm cache effectiveness

## Technical Requirements

### Cache Implementation
- Use SHA256 hash of URL as cache file name for consistency
- Store metadata alongside cached content (JSON sidecar files)
- Respect configurable cleanup age (default 24 hours)
- Handle concurrent access safely
- Implement size limits and timeout handling

### Error Handling
- Network timeout handling (30 second default)
- Invalid URL format handling
- File system error handling for cache operations
- Graceful fallback when cache is unavailable

### Performance Considerations
- Lazy cache cleanup during normal operations
- Efficient cache key generation and lookup
- Memory-efficient streaming for large downloads
- Thread-safe cache access patterns