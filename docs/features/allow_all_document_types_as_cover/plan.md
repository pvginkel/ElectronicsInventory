# Remove Restriction - All Document Types as Cover Image

## Brief Description

Remove the current restriction that only allows image documents to be set as the cover image of a part. Allow any attachment type (image, PDF, URL) to be used as a cover, with appropriate visual representations: actual thumbnails for images, PDF icon for PDFs, and link icon for URLs without preview images. The system will automatically return the appropriate icon paths when generating thumbnails for non-image cover attachments.

## Files and Functions to Create/Modify

### Backend Changes

#### 1. `app/services/document_service.py`
- **Function**: `set_part_cover_attachment()`
  - Remove the validation that checks `if not attachment.is_image`
  - Remove the exception raising for `"only images can be set as cover attachments"`
  - Keep all other validations (attachment exists, belongs to part, etc.)

- **Function**: `get_attachment_thumbnail()`
  - Add support for URL attachments without stored thumbnails
  - Return `app/assets/link-icon.svg` for URL attachments that don't have a stored thumbnail
  - Modify logic to handle URL attachment types that don't have `s3_key` but need visual representation

#### 2. `app/services/image_service.py`
- **New Function**: `get_link_icon_data() -> tuple[bytes, str]`
  - Similar to existing `get_pdf_icon_data()` method
  - Read and return the content of `app/assets/link-icon.svg`
  - Return tuple of (svg_bytes, 'image/svg+xml')

#### 3. `app/services/document_service.py` - Additional Logic
- **Function**: `get_attachment_thumbnail()`
  - For URL attachments: check if `s3_key` exists (has downloaded thumbnail)
  - If `s3_key` exists: use existing logic to return thumbnail
  - If no `s3_key`: call `image_service.get_link_icon_data()` and return link icon
  - For PDF attachments: continue using existing PDF icon logic
  - For image attachments: continue using existing image thumbnail logic

### Testing Updates

#### 4. `tests/test_document_service.py`
- **Update Test**: `test_set_part_cover_attachment_not_image()`
  - Change test to expect success instead of exception
  - Verify that PDF attachments can now be set as cover
  - Add new test for URL attachments as cover

- **New Test**: `test_set_part_cover_attachment_url()`
  - Test setting URL attachment as cover
  - Verify the cover is set successfully

- **New Test**: `test_get_attachment_thumbnail_url_no_s3_key()`
  - Test thumbnail generation for URL attachments without stored thumbnails
  - Verify link icon is returned

- **Update Test**: `test_get_attachment_thumbnail_pdf()`
  - Ensure PDF thumbnail logic remains unchanged

#### 5. `tests/test_image_service.py`
- **New Test**: `test_get_link_icon_data()`
  - Test the new `get_link_icon_data()` method
  - Verify SVG content and content type are returned correctly

### Frontend Compatibility

#### 6. Frontend Updates (Note: Frontend changes may be needed)
The current frontend in `components/documents/cover-image-selector.tsx` already shows all document types in the cover selector, but it may have visual indicators that assume only images can be covers. The frontend should continue to work as:

- The cover selector already displays all attachment types
- The thumbnail component already handles different attachment types via the `Thumbnail` component
- The API endpoints remain the same, just with relaxed restrictions

## Step-by-Step Implementation Algorithm

### Phase 1: Backend Service Updates
1. **Update `ImageService.get_link_icon_data()`**
   - Read `app/assets/link-icon.svg` file
   - Return bytes and content type similar to PDF icon method

2. **Update `DocumentService.get_attachment_thumbnail()`**
   - Add conditional logic for URL attachments
   - If URL attachment has no `s3_key`, return link icon
   - Maintain existing logic for images and PDFs

3. **Update `DocumentService.set_part_cover_attachment()`**  
   - Remove the `if not attachment.is_image` validation
   - Remove the corresponding exception throw
   - Keep all other validation logic intact

### Phase 2: Test Updates
1. **Update Existing Tests**
   - Change `test_set_part_cover_attachment_not_image()` to expect success
   - Verify PDF can be set as cover successfully

2. **Add New Tests**
   - Test URL attachment as cover  
   - Test thumbnail generation for URLs without stored images
   - Test link icon data retrieval

### Phase 3: Integration Testing
1. **Manual Testing**
   - Create parts with different attachment types
   - Set PDF as cover and verify PDF icon shows
   - Set URL as cover and verify link icon shows for URLs without thumbnails
   - Set URL as cover for URLs with thumbnails and verify thumbnail shows
   - Ensure existing image cover functionality unchanged

## Implementation Notes

- The change is backwards compatible - existing image covers continue to work
- URL attachments that have successfully downloaded and stored thumbnails will continue to show those thumbnails
- URL attachments without stored thumbnails (due to download failures or direct URLs to non-image content) will show the link icon
- PDF attachments will show the PDF icon as covers
- The frontend cover selector already supports all attachment types, so minimal frontend changes expected
- All existing API endpoints remain unchanged in signature, only validation logic changes