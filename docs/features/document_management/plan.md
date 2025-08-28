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
- `part_id4` (CHAR(4), foreign key to parts.id4)
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
- Part attachments: `parts/{part_id4}/attachments/{uuid}.{ext}`
- URL cover images: `parts/{part_id4}/attachments/{uuid}.jpg` (reuses same pattern)

## Files to Create

### Models
- `app/models/part_attachment.py` - Part attachments model (handles images, PDFs, and URLs)

### Services  
- `app/services/s3_service.py` - S3 storage operations
- `app/services/image_service.py` - Image processing and thumbnail generation
- `app/services/document_service.py` - Document management business logic
- `app/services/url_thumbnail_service.py` - URL thumbnail extraction

### Schemas
- `app/schemas/part_attachment.py` - Part attachment schemas for all document types

### API Endpoints
- `app/api/documents.py` - Document management endpoints

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
   - **Store thumbnails on disk in `/tmp/thumbnails` folder** (no S3 storage)
   - Use PIL/Pillow for image manipulation
   - Return thumbnail data directly through backend API

2. **Lazy Thumbnail Generation**
   ```python
   def get_thumbnail(attachment_id: int, size: int) -> str:
       # Check if thumbnail exists on disk
       thumbnail_path = f"/tmp/thumbnails/{attachment_id}_{size}.jpg"
       if os.path.exists(thumbnail_path):
           return thumbnail_path
           
       # Generate thumbnail from source
       attachment = get_attachment(attachment_id)
       original_image = s3_service.get_object(attachment.s3_key)
       thumbnail_data = image_service.create_thumbnail(original_image, size)
       
       # Save to disk
       os.makedirs("/tmp/thumbnails", exist_ok=True)
       with open(thumbnail_path, 'wb') as f:
           f.write(thumbnail_data)
       return thumbnail_path
   ```

### URL Thumbnail Extraction Algorithm

1. **Metadata Extraction Pipeline**
   ```python
   def extract_url_thumbnail(url: str) -> str:
       # Fetch page content
       response = requests.get(url)
       soup = BeautifulSoup(response.content)
       
       # Try og:image first
       og_image = soup.find("meta", property="og:image")
       if og_image:
           return og_image["content"]
           
       # Try twitter:image
       twitter_image = soup.find("meta", name="twitter:image")
       if twitter_image:
           return twitter_image["content"]
           
       # Fallback to Google favicon
       domain = urlparse(url).netloc
       return f"https://www.google.com/s2/favicons?domain={domain}&sz=64"
   ```

2. **URL Thumbnail Storage**
   - Download extracted thumbnail URL
   - Store as full-size image in S3 using same s3_key pattern
   - Generate thumbnails using same lazy algorithm (disk storage in `/tmp/thumbnails`)
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
- `PUT /api/parts/{part_id4}/cover` - Set cover attachment ID (body: {"attachment_id": 123})
- `DELETE /api/parts/{part_id4}/cover` - Remove cover image (set to null)
- `GET /api/parts/{part_id4}/cover` - Get cover image details
- `GET /api/parts/{part_id4}/cover/thumbnail?size=150` - Get cover thumbnail via backend

### Part Attachments Endpoints (All document types)  
- `POST /api/parts/{part_id4}/attachments` - Add attachment (file upload or URL)
- `GET /api/parts/{part_id4}/attachments` - List all attachments
- `GET /api/parts/{part_id4}/attachments/{attachment_id}` - Get attachment details
- `GET /api/parts/{part_id4}/attachments/{attachment_id}/download` - Download/stream file via backend
- `GET /api/parts/{part_id4}/attachments/{attachment_id}/thumbnail?size=150` - Get thumbnail via backend  
- `PUT /api/parts/{part_id4}/attachments/{attachment_id}` - Update attachment metadata
- `DELETE /api/parts/{part_id4}/attachments/{attachment_id}` - Delete attachment

### Backend File Serving
All file access routes through backend - no direct S3 access for frontend:
- Backend streams S3 content to client
- Backend generates and serves thumbnails from `/tmp/thumbnails` disk storage
- Backend handles file uploads to S3
- Backend manages URL thumbnail extraction and storage

## Implementation Phases

### Phase 1: Core Infrastructure
1. Create database models and migration (add cover_attachment_id to parts, create part_attachments)
2. Implement S3Service with basic operations (single bucket)
3. Create basic ImageService with disk-based thumbnail generation (`/tmp/thumbnails`)
4. Add PartAttachment model and service

### Phase 2: File Upload & Management
1. Add file upload endpoints with backend file serving
2. Implement lazy thumbnail generation (disk storage in `/tmp/thumbnails`)
3. Add PDF handling with generic icons
4. Add cover image management (set/get/delete cover attachment)

### Phase 3: URL Processing
1. Implement URL metadata extraction
2. Add URL thumbnail generation using og:image/twitter:image/favicon fallback
3. Store URL thumbnails in S3 using same s3_key pattern
4. Add URL attachment functionality

### Phase 4: Integration & API
1. Update Part schemas to include cover attachment and attachments list
2. Create comprehensive DocumentService
3. Complete all API endpoints with backend streaming
4. Update existing part endpoints to return document data

## Dependencies to Add

- `Pillow` - Image processing for thumbnails
- `beautifulsoup4` - HTML parsing for URL metadata extraction
- `requests` - HTTP client for URL content fetching
- `python-magic` - File type detection

## Configuration Requirements

### Updated S3 Configuration (complete rewrite of config.py S3 section)
```python
# S3/Ceph Storage Configuration
S3_ENDPOINT_URL: str = Field(
    default="http://localhost:9000", 
    description="Ceph RGW S3-compatible endpoint URL"
)
S3_ACCESS_KEY_ID: str = Field(
    default="admin", 
    description="S3 access key for Ceph storage"
)  
S3_SECRET_ACCESS_KEY: str = Field(
    default="password", 
    description="S3 secret key for Ceph storage"
)
S3_BUCKET_NAME: str = Field(
    default="electronics-inventory-part-attachments",
    description="Single S3 bucket for all document storage"
)
S3_REGION: str = Field(
    default="us-east-1", 
    description="S3 region (required by boto3)"
)
S3_USE_SSL: bool = Field(
    default=False,
    description="Use SSL for S3 connections (false for local Ceph)"
)

# Document processing settings
MAX_IMAGE_SIZE: int = Field(default=10 * 1024 * 1024)  # 10MB
MAX_FILE_SIZE: int = Field(default=100 * 1024 * 1024)   # 100MB  
ALLOWED_IMAGE_TYPES: list[str] = Field(default=["image/jpeg", "image/png", "image/webp", "image/svg+xml"])
ALLOWED_FILE_TYPES: list[str] = Field(default=["application/pdf"]) # Implicitly includes ALLOWED_IMAGE_TYPES
THUMBNAIL_STORAGE_PATH: str = Field(default="/tmp/thumbnails", description="Disk path for thumbnail storage")
```

## Testing Requirements

### Service Tests
- S3Service: upload, download, delete, existence checks
- ImageService: thumbnail generation at various sizes
- DocumentService: CRUD operations for images and attachments
- URLThumbnailService: metadata extraction, fallback handling

### API Tests  
- File upload validation (size limits, type restrictions)
- Thumbnail generation and caching
- URL attachment processing
- Error handling for invalid files/URLs
- Concurrent access to thumbnail generation

### Integration Tests
- End-to-end document workflows
- S3 storage integration
- Image processing pipeline
- URL processing with real websites

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