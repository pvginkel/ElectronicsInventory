# Document Management Feature Plan

## Brief Description

Implement comprehensive document management functionality for the electronics inventory system. This includes storing a single primary image per part and managing multiple attachments (URLs, images, PDFs) per part. Images require dynamic thumbnail generation with multiple resolutions. URLs require automatic thumbnail extraction from og:image/twitter:image or Google favicon fallback. All files are stored using S3-compatible storage (Ceph backend) with lazy thumbnail generation stored on disk in `/tmp/thumbnails`.

## Database Schema Changes

### Modified Tables

#### `parts` table (add new column)
- `cover_attachment_id` (integer, foreign key to part_attachments.id, nullable)

### New Tables

#### `part_attachments` table  
- `id` (primary key, auto-increment)
- `part_key` (CHAR(4), foreign key to parts.key)
- `attachment_type` (enum: 'url', 'image', 'pdf')
- `title` (string, user-provided or extracted title)
- `s3_key` (string, S3 object key - for uploaded files and URL thumbnail images)
- `url` (string, original URL - null for uploaded files)
- `filename` (string, original filename for uploads)
- `content_type` (string, MIME type)
- `file_size` (integer, bytes - null for URLs)
- `metadata` (JSON, additional metadata like dimensions, extracted info)
- `created_at` (datetime)
- `updated_at` (datetime)

### Database Migration
New migration file: `004_add_document_tables.py`

## S3 Storage Structure

### Single Bucket Configuration
- `electronics-inventory-part-attachments` - All document storage (images, PDFs, URL thumbnails)

### S3 Key Structure
- Part attachments: `parts/{part_key}/attachments/{uuid}.{ext}`
- URL cover images: `parts/{part_key}/attachments/{uuid}.jpg` (reuses same pattern)

## Files to Create

### Models
- `app/models/part_attachment.py` - Part attachments model (handles images, PDFs, and URLs)

### Services  
- `app/services/s3_service.py` - S3 storage operations
- `app/services/image_service.py` - Image processing and thumbnail generation
- `app/services/document_service.py` - Document management business logic
- `app/services/url_thumbnail_service.py` - URL thumbnail extraction

**Note**: All services inherit from `BaseService` (in `app/services/base.py`) and receive database session via constructor injection.

### Schemas
- `app/schemas/part_attachment.py` - Part attachment schemas for all document types

### API Endpoints
- `app/api/documents.py` - Document management endpoints

**Note**: API endpoints use `@inject` decorator with `Provide[ServiceContainer.<service_name>]` for dependency injection.

### Utilities
- `app/utils/image_processing.py` - Image manipulation utilities
- `app/utils/url_metadata.py` - URL metadata extraction utilities

## Files to Modify

### Models
- `app/models/part.py` - Add relationships to part_images and part_attachments

### Schemas  
- `app/schemas/part.py` - Add image and attachments fields to response schemas

### Services
- `app/services/part_service.py` - Add methods for managing part documents
- `app/services/container.py` - Add new service providers to dependency injection container

### API
- `app/api/parts.py` - Add document-related endpoints to parts blueprint

### Configuration
- `app/config.py` - Add thumbnail size configurations and processing settings

## Core Algorithms

### Thumbnail Generation Algorithm

1. **Image Processing Pipeline**
   - Accept source image from S3 or local upload  
   - Do not put restrictions on the size of thumbnails requested
   - Use lazy generation: create thumbnails only when requested
   - **Store thumbnails on disk in `THUMBNAIL_STORAGE_PATH` folder** (no S3 storage)
   - Use PIL/Pillow for image manipulation
   - Return thumbnail data directly through backend API

2. **Lazy Thumbnail Generation**
   - Check if thumbnail exists on disk at `{THUMBNAIL_STORAGE_PATH}/{attachment_id}_{size}.jpg`
   - If exists, return file path
   - If not, fetch original from S3, generate thumbnail using PIL/Pillow
   - Save generated thumbnail to disk storage path
   - Return thumbnail file path for streaming

### URL Thumbnail Extraction Algorithm

1. **Metadata Extraction Pipeline**
   - Fetch page content using requests library with timeout and size limits
   - Parse HTML content with BeautifulSoup
   - Extract og:image meta tag first (property="og:image")
   - If not found, try twitter:image meta tag (name="twitter:image") 
   - If neither found, fallback to Google favicon service using domain extraction
   - Return the extracted or fallback image URL

2. **URL Thumbnail Storage**
   - Download extracted thumbnail URL
   - Store as full-size image in S3 using same s3_key pattern
   - Generate thumbnails using same lazy algorithm (disk storage in `THUMBNAIL_STORAGE_PATH`)
   - URL attachments use s3_key to store the downloaded thumbnail image

### PDF Handling Algorithm

1. **PDF Storage**
   - Store PDF files directly in S3 without processing
   - Use generic PDF icon for thumbnails
   - Extract metadata (page count, file size) and store in metadata JSON

2. **PDF Thumbnail Generation**
   - Return this image as a PDF thumbnail: https://upload.wikimedia.org/wikipedia/commons/8/87/PDF_file_icon.svg?download.
     This is an SVG. Return it as is, with the correct media type.

## API Endpoints Design

### Part Cover Image Management
- `PUT /api/parts/{part_key}/cover` - Set cover attachment ID (body: {"attachment_id": 123})
- `DELETE /api/parts/{part_key}/cover` - Remove cover image (set to null)
- `GET /api/parts/{part_key}/cover` - Get cover image details
- `GET /api/parts/{part_key}/cover/thumbnail?size=150` - Get cover thumbnail via backend

### Part Attachments Endpoints (All document types)  
- `POST /api/parts/{part_key}/attachments` - Add attachment (file upload or URL)
- `GET /api/parts/{part_key}/attachments` - List all attachments
- `GET /api/parts/{part_key}/attachments/{attachment_id}` - Get attachment details
- `GET /api/parts/{part_key}/attachments/{attachment_id}/download` - Download/stream file via backend
- `GET /api/parts/{part_key}/attachments/{attachment_id}/thumbnail?size=150` - Get thumbnail via backend  
- `PUT /api/parts/{part_key}/attachments/{attachment_id}` - Update attachment metadata
- `DELETE /api/parts/{part_key}/attachments/{attachment_id}` - Delete attachment

### Backend File Serving
All file access routes through backend - no direct S3 access for frontend:
- Backend streams S3 content to client
- Backend generates and serves thumbnails from `/tmp/thumbnails` disk storage
- Backend handles file uploads to S3
- Backend manages URL thumbnail extraction and storage

## Implementation Phases

### Phase 1: Core Infrastructure
1. Create database models and migration (add cover_attachment_id to parts, create part_attachments)
2. Implement S3Service with basic operations (single bucket) - inherits from `BaseService`
3. Create basic ImageService with disk-based thumbnail generation (`THUMBNAIL_STORAGE_PATH`) - inherits from `BaseService`
4. Add PartAttachment model and DocumentService - inherits from `BaseService`
5. Update ServiceContainer to include new service providers with proper dependency chains

### Phase 2: File Upload & Management
1. Add file upload endpoints with backend file serving
2. Implement lazy thumbnail generation (disk storage in `THUMBNAIL_STORAGE_PATH`)
3. Add PDF handling with generic icons
4. Add cover image management (set/get/delete cover attachment)

### Phase 3: URL Processing
1. Implement URLThumbnailService with URL metadata extraction - inherits from `BaseService`
2. Add URL thumbnail generation using og:image/twitter:image/favicon fallback
3. Store URL thumbnails in S3 using same s3_key pattern
4. Add URL attachment functionality
5. Update ServiceContainer to include URLThumbnailService provider

### Phase 4: Integration & API
1. Update Part schemas to include cover attachment and attachments list
2. Complete all API endpoints with backend streaming using `@inject` decorator
3. Update existing part endpoints to return document data
4. Wire new API modules in application factory for dependency injection

## Dependency Injection Updates

### ServiceContainer Configuration
Add to `app/services/container.py`:
- Import new services: S3Service, ImageService, DocumentService, URLThumbnailService
- Add Factory providers for each service with db_session dependency
- Configure DocumentService with dependencies on S3Service, ImageService, and URLThumbnailService

### API Module Wiring
Update application factory to wire new API modules:
- Add 'app.api.documents' to container.wire() modules list

## Dependencies to Add

- `Pillow` - Image processing for thumbnails
- `beautifulsoup4` - HTML parsing for URL metadata extraction
- `requests` - HTTP client for URL content fetching
- `python-magic` - File type detection

## Configuration Requirements

### Updated S3 Configuration (complete rewrite of config.py S3 section)
Add S3/Ceph storage configuration fields:
- S3_ENDPOINT_URL: Ceph RGW S3-compatible endpoint (default: "http://localhost:9000")
- S3_ACCESS_KEY_ID: S3 access key (default: "admin")  
- S3_SECRET_ACCESS_KEY: S3 secret key (default: "password")
- S3_BUCKET_NAME: Single bucket for all documents (default: "electronics-inventory-part-attachments")
- S3_REGION: S3 region for boto3 (default: "us-east-1")
- S3_USE_SSL: SSL for S3 connections (default: False for local Ceph)

Add document processing settings:
- MAX_IMAGE_SIZE: 10MB limit for images
- MAX_FILE_SIZE: 100MB limit for files
- ALLOWED_IMAGE_TYPES: ["image/jpeg", "image/png", "image/webp", "image/svg+xml"]
- ALLOWED_FILE_TYPES: ["application/pdf"] (implicitly includes image types)
- THUMBNAIL_STORAGE_PATH: "/tmp/thumbnails" for disk thumbnail storage

## Testing Requirements

### Unit Tests

#### S3Service Tests
- Upload file to S3 bucket
- Download file from S3 bucket  
- Delete file from S3 bucket
- Check file existence in S3 bucket
- Handle S3 connection errors and timeouts
- Validate S3 key generation patterns

#### ImageService Tests
- Generate thumbnails at various sizes (50px, 150px, 300px, 500px)
- Handle different image formats (JPEG, PNG, WebP, SVG)
- Process images with various aspect ratios
- Handle corrupted or invalid image data
- Verify lazy thumbnail generation and disk caching
- Test thumbnail cleanup and storage management
- Validate thumbnail file naming and paths using `THUMBNAIL_STORAGE_PATH`

#### DocumentService Tests
- Create part attachments for all types (image, PDF, URL)
- Update attachment metadata and titles
- Delete attachments and clean up S3 storage
- Handle attachment type validation
- Test file size and type restrictions
- Validate S3 key generation for parts
- Handle concurrent attachment operations

#### URLThumbnailService Tests
- Extract og:image metadata from web pages
- Extract twitter:image metadata from web pages
- Fallback to Google favicon service
- Handle invalid URLs and connection timeouts
- Process redirects and different response codes
- Sanitize extracted metadata and URLs
- Test with various website structures

### Integration Tests

#### Real Ceph Backend Tests
**Note: Real Ceph backend will be provided for testing**

- End-to-end file upload workflow with real S3 storage
- Thumbnail generation pipeline using actual Ceph storage
- URL processing workflow with real image downloads
- Part attachment CRUD operations with persistent storage
- Cover image management with S3 integration
- File serving through backend with S3 streaming
- Concurrent file operations and race condition handling

#### API Integration Tests
- File upload endpoints with multipart form data
- Thumbnail serving with proper HTTP caching headers
- URL attachment processing with external web requests
- Error handling for S3 connectivity issues
- File download streaming with proper MIME types
- Authentication and authorization for file operations

#### Database Integration Tests
- Part attachment relationships and foreign key constraints
- Cover attachment assignment and cascade behavior
- Migration testing with existing data
- Attachment deletion and orphaned file cleanup
- Transaction handling for multi-step operations

## Security Considerations

1. **File Upload Security**
   - Validate file types using python-magic (not just extensions)
   - Scan uploaded files for malicious content
   - Implement size limits
   - Use secure temporary storage during processing

2. **URL Processing Security**  
   - Validate URLs before fetching
   - Set request timeouts and size limits
   - Handle redirects safely
   - Sanitize extracted metadata

3. **S3 Access Control**
   - Backend-only S3 access (no direct frontend access)
   - Implement proper S3 bucket policies
   - Rotate access keys regularly
   - All file serving goes through backend authentication/authorization