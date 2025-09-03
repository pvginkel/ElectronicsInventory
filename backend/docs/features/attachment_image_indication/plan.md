# Feature Plan: Attachment Image Association Indication

## Brief Description

Add a field to the part attachments endpoints to indicate whether an attachment has an associated image. This helps the frontend determine which attachments can display images without having to inspect the attachment type or attempt to load thumbnails.

## Problem Statement

Currently, the API provides attachment type (URL/PDF/IMAGE) but doesn't clearly indicate whether URL attachments have associated images that can be displayed as thumbnails or previews. The frontend needs to know which attachments have images available to optimize the user experience.

## Current State Analysis

### Existing Models and Logic

The current system has:

1. **PartAttachment Model** (`app/models/part_attachment.py:64-77`):
   - `is_image()` property - returns `True` if `attachment_type == AttachmentType.IMAGE`
   - `is_pdf()` property - returns `True` if `attachment_type == AttachmentType.PDF` 
   - `is_url()` property - returns `True` if `attachment_type == AttachmentType.URL`

2. **Document Service** (`app/services/document_service.py`):
   - Contains logic to determine if files are images based on content type
   - Has thumbnail generation for both image attachments and URL attachments with images
   - The `get_attachment_thumbnail()` method can generate thumbnails for URLs that have images

3. **API Endpoints** (`app/api/documents.py:148-155`):
   - `GET /parts/{part_key}/attachments` returns `PartAttachmentListSchema`
   - `GET /parts/{part_key}/attachments/{id}` returns `PartAttachmentResponseSchema`
   - Both expose the `attachment_type` field but don't indicate image availability

### The Gap

The current system can determine if a URL attachment has an image (via thumbnail service), but this information is not exposed in the API response schemas. URL attachments may or may not have images, but the frontend has no way to know without attempting to fetch a thumbnail.

## Technical Implementation Plan

### Files to Modify

1. **app/schemas/part_attachment.py**
   - Add `has_image: bool` field to `PartAttachmentListSchema` 
   - Add `has_image: bool` field to `PartAttachmentResponseSchema`

2. **app/models/part_attachment.py**
   - Add computed property `has_image` to `PartAttachment` model

3. **app/services/document_service.py** 
   - Add logic to determine if URL attachments have images
   - Extend thumbnail checking logic to set image availability flag

### Implementation Details

#### Step 1: Add Model Property

Add a `has_image` property to the `PartAttachment` model that:
- Returns `True` for `AttachmentType.IMAGE` attachments
- Returns `False` for `AttachmentType.PDF` attachments  
- For `AttachmentType.URL` attachments, checks if a thumbnail can be generated

#### Step 2: Extend Document Service

Add a method `attachment_has_image(attachment_id: int) -> bool` that:
- For IMAGE attachments: returns `True`
- For PDF attachments: returns `False` 
- For URL attachments: attempts to extract metadata and check for og_image/favicon
- Caches results to avoid repeated URL fetching

#### Step 3: Update Response Schemas

Add `has_image` field to both:
- `PartAttachmentListSchema` - for attachment listings
- `PartAttachmentResponseSchema` - for individual attachment details

The field should use a computed field pattern with proper documentation:
```python
has_image: bool = Field(
    description="Whether this attachment has an associated image for display",
    json_schema_extra={"example": True}
)
```

#### Step 4: Implementation Strategy for URL Attachments

For URL attachments, the `has_image` determination should:
1. Check if URL points directly to an image (based on URL extension or content-type)
2. For webpage URLs, attempt to extract Open Graph image or favicon
3. Cache results in the attachment metadata JSON field to avoid repeated fetching
4. Fall back to `False` if image detection fails or takes too long

### Performance Considerations

- Cache image availability in `attachment_metadata` JSONB field to avoid repeated URL fetching
- For URL attachments, populate `has_image` when the attachment is created
- Provide async refresh mechanism if image availability changes

### Database Impact

No schema changes required - use existing `attachment_metadata` JSONB field to cache image availability for URL attachments.

## API Contract Changes

### Updated Response Format

```json
{
  "id": 123,
  "attachment_type": "url",
  "title": "Product Page",
  "url": "https://example.com/product",
  "has_image": true,
  "created_at": "2024-01-15T10:30:00Z"
}
```

### Backward Compatibility

This is an additive change - existing API consumers will continue to work, new consumers can use the `has_image` field to optimize their UI.