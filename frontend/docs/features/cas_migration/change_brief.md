# CAS Migration - Frontend Changes

## Overview

The backend has migrated to a Content-Addressable Storage (CAS) system for all blob storage. This requires frontend changes to use the new URL structure provided by the API instead of constructing URLs to now-removed endpoints.

## Breaking Backend Changes

### Removed Endpoints
- `GET /api/parts/<key>/cover/thumbnail`
- `GET /api/parts/<key>/attachments/<id>/download`
- `GET /api/parts/<key>/attachments/<id>/thumbnail`
- `GET /api/parts/{part_key}/cover` (cover details endpoint)

### Schema Changes

**PartWithTotalSchema:**
- **Removed**: `has_cover_attachment: boolean`
- **Added**: `cover_url: string | null` - Base CAS URL for cover image

**PartAttachmentResponseSchema:**
- **Removed**: `s3_key: string | null`
- **Removed**: `has_preview: boolean`
- **Added**: `attachment_url: string | null` - Base CAS URL for the attachment
- **Added**: `preview_url: string | null` - Base CAS URL for thumbnail/preview image

## Required Frontend Changes

### 1. Update `src/lib/utils/thumbnail-urls.ts`

Remove obsolete URL construction functions:
- `getThumbnailUrl()` - constructs URL to removed endpoint
- `getCoverThumbnailUrl()` - constructs URL to removed endpoint
- `getDownloadUrl()` - constructs URL to removed endpoint
- `getViewUrl()` - constructs URL to removed endpoint
- `generateSrcSet()` - constructs URLs to removed endpoint
- `generateCoverSrcSet()` - constructs URLs to removed endpoint

Keep:
- `THUMBNAIL_SIZES` constant
- `getSizesAttribute()` function

Add new utility functions to append query parameters to base URLs:
- Must check if URL already contains `?` and use `&` accordingly
- Function to add `thumbnail=<size>` parameter
- Function to generate srcSet from base URL

### 2. Update `src/components/documents/cover-image-display.tsx`

- Remove dependency on `useCoverAttachment` hook (cover endpoint is gone)
- Accept `coverUrl: string | null` prop instead of `hasCoverAttachment` and `partId`
- Use `coverUrl` directly with `?thumbnail=<size>` for thumbnails
- Remove PDF-specific handling (server provides `preview_url` for PDFs)
- Keep error handling but show generic placeholder instead of PDF icon on error

### 3. Update `src/components/ui/thumbnail.tsx`

- Change props from `partKey`/`attachmentId` to accept `previewUrl: string | null`
- Remove the `isPdf || !shouldShowImage` branch entirely (lines 49-58)
- Server provides `preview_url` for all previewable content
- If `previewUrl` is null, component should not render or show placeholder

### 4. Update `src/lib/utils/document-transformers.ts`

- Use `attachment.preview_url` instead of constructing thumbnail URLs
- Use `attachment.attachment_url` for download/view URLs
- Remove imports from `thumbnail-urls.ts`

### 5. Update `src/hooks/use-cover-image.ts`

- Remove or significantly simplify `useCoverAttachment` hook
- The cover endpoint no longer exists; `cover_url` comes from part response

### 6. Update `src/hooks/use-part-documents.ts`

- Map `preview_url` to document model instead of `has_preview`
- Map `attachment_url` for asset URLs

### 7. Update all components using `hasCoverAttachment` prop

Components that pass `hasCoverAttachment`:
- `src/components/parts/part-card.tsx`
- `src/components/parts/part-details.tsx`
- `src/components/parts/ai-duplicate-card.tsx`
- `src/components/boxes/part-location-card.tsx`
- `src/components/documents/cover-image-selector.tsx`
- `src/components/parts/part-document-grid.tsx`

These should be updated to pass `coverUrl` instead.

### 8. Keep `pdfIconSvg` in specific files

- **Keep** in `document-tile.tsx` - fallback when `previewImageUrl` is null
- **Keep** in `add-document-modal.tsx` - client-side preview during upload
- **Remove** from `thumbnail.tsx` - no longer needed
- **Remove** from `cover-image-display.tsx` - no longer needed

## URL Parameter Reference

When adding parameters to CAS URLs:
- Check if URL contains `?` already
- Use `?thumbnail=<size>` or `&thumbnail=<size>` for thumbnails
- Use `&disposition=attachment` for downloads
- Inline viewing uses the base `attachment_url` directly

## Testing Considerations

- Verify cover images display in part lists and detail views
- Verify attachment thumbnails in document grids
- Verify PDF attachments show server-provided preview
- Verify URL attachments show OG image when available
- Verify download functionality works with new URLs
- Verify error states show appropriate placeholders
