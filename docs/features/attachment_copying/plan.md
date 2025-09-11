# Attachment Copying for Part Duplication - Technical Plan

## Brief Description

Add functionality to copy individual attachments (images, PDFs, URLs) from one part to another to support a frontend duplicate part feature. This allows users to selectively copy specific documentation from existing parts without having to re-upload files or re-enter URLs.

## Files to Create or Modify

### Services Layer
- **`app/services/document_service.py`** - Add `copy_attachment_to_part()` method
  - Main logic for copying a single attachment from source part to target part
  - Handle S3 file copying for images and PDFs
  - Preserve attachment metadata (title, type, etc.)
  - Optionally set copied image as cover attachment

### API Layer  
- **`app/api/documents.py`** - Add new endpoint for attachment copying
  - POST endpoint: `/api/documents/copy-attachment`
  - Accept attachment ID, target part key, and optional set-as-cover flag
  - Validate attachment exists and target part exists before copying
  - Return created attachment information

### Schema Layer
- **`app/schemas/copy_attachment.py`** (new file) - Request/response schemas
  - `CopyAttachmentRequestSchema` with attachment_id, target_part_key, and set_as_cover
  - `CopyAttachmentResponseSchema` with created attachment details

### Testing
- **`tests/test_document_service.py`** - Add comprehensive service tests
  - Test copying individual attachment types (image, PDF, URL)  
  - Test S3 file copying behavior
  - Test cover attachment setting with set_as_cover flag
  - Test error cases (nonexistent attachment/part, S3 failures)
- **`tests/test_document_api.py`** - Add API endpoint tests
  - Test successful individual attachment copying
  - Test validation errors (invalid attachment ID, part key)
  - Test HTTP status codes and response format

## Step-by-Step Implementation Algorithm

### 1. DocumentService.copy_attachment_to_part() Method

**Input Parameters:**
- `attachment_id: int` - ID of specific attachment to copy
- `target_part_key: str` - Key of part to copy attachment to
- `set_as_cover: bool = False` - Whether to set copied attachment as cover image

**Algorithm:**
1. Validate source attachment exists using existing `get_attachment()`
2. Validate target part exists (raise RecordNotFoundException if not)
3. Create new PartAttachment record with same metadata but target part_id:
   - Copy title, attachment_type, content_type, file_size, filename, url
   - Handle attachment type-specific copying:
     - **URL attachments**: Copy URL and title directly (no S3 operations needed)
     - **Image/PDF attachments**: Copy S3 file to new key for target part
4. Handle cover attachment logic:
   - If `set_as_cover=True`, set copied attachment as target part's cover
   - Otherwise leave target part cover unchanged
5. Return created PartAttachment object

### 2. S3 File Copying Logic

For attachments with S3 content (images and PDFs):
1. Generate new S3 key using `s3_service.generate_s3_key(target_part.id, original_filename)`
2. Use S3 copy operation to duplicate file content:
   - Source: existing attachment's s3_key
   - Destination: new generated key
   - Preserve original content_type and metadata
3. Create new PartAttachment record with new s3_key

### 3. API Endpoint Implementation

**Endpoint:** `POST /api/documents/copy-attachment`

**Request Flow:**
1. Validate request schema (attachment_id and target_part_key required, set_as_cover optional)
2. Call `document_service.copy_attachment_to_part()`
3. Convert returned PartAttachment object to response schema
4. Return 200 with created attachment information

**Error Handling:**
- 404 if source attachment or target part not found
- 400 if request validation fails
- 500 for S3 or other service errors

### 4. Cover Attachment Management

**Logic for setting cover attachment on target part:**
1. If `set_as_cover=True`:
   - Set target part's cover_attachment_id to the newly copied attachment's ID
   - Any attachment type (image, PDF, URL) can be set as cover
2. If `set_as_cover=False`:
   - Leave target part cover unchanged

## Key Design Decisions

### S3 File Duplication Strategy
- Use S3 copy operations rather than download/re-upload for efficiency
- Generate new S3 keys for target part to maintain proper organization
- Preserve all original file metadata (content_type, size, etc.)

### Transaction Handling  
- Perform all operations within single database transaction
- On S3 copy failure, rollback database changes to maintain consistency
- Use existing error handling patterns from DocumentService

### Cover Attachment Logic
- Use explicit `set_as_cover` flag for user control
- Any attachment type (image, PDF, URL) can be set as cover
- Follow existing cover assignment patterns from set_part_cover_attachment

### API Design
- Single endpoint to copy individual attachments with user control
- Include optional set_as_cover parameter for cover image management
- Return detailed information about the single created attachment
- Follow existing API patterns for validation and error responses

## Integration Points

- **Frontend**: Will call this API when user selectively copies attachments during part duplication
- **PartService**: Can integrate with part duplication workflow to copy chosen attachments
- **S3Service**: Leverage existing file operations and key generation with copy operations
- **ImageService**: Thumbnail generation will work automatically for copied images
- **Metrics**: Copied attachments will appear in existing attachment metrics