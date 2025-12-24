# Frontend Changes Required for CAS Migration

## Overview

The backend has migrated to a Content-Addressable Storage (CAS) system for all blob storage. This change simplifies URL handling and enables indefinite browser caching.

## Breaking Changes

### Removed Endpoints

The following endpoints have been **removed** and will return 404:

```
GET /api/parts/<key>/cover/thumbnail
GET /api/parts/<key>/attachments/<id>/download
GET /api/parts/<key>/attachments/<id>/thumbnail
```

### Schema Changes

**PartWithTotalSchema (list and detail responses):**
- **Removed**: `has_cover_attachment: boolean`
- **Added**: `cover_url: string | null` - Base CAS URL for cover image (add `?thumbnail=<size>` for thumbnails)

**PartAttachmentResponseSchema / PartAttachmentListSchema:**
- **Removed**: `s3_key: string | null` (no longer exposed)
- **Added**: `attachment_url: string | null` - Base CAS URL with content_type and filename pre-baked

## Migration Guide

### 1. Stop Constructing URLs

The file `src/lib/utils/thumbnail-urls.ts` contains URL construction functions that are now **obsolete**:

```typescript
// OLD - these functions construct URLs to removed endpoints
getThumbnailUrl(partKey, attachmentId, size)     // -> REMOVED ENDPOINT
getCoverThumbnailUrl(partKey, size)              // -> REMOVED ENDPOINT
getDownloadUrl(partKey, attachmentId)            // -> REMOVED ENDPOINT
getViewUrl(partKey, attachmentId)                // -> REMOVED ENDPOINT
generateSrcSet(partKey, attachmentId)            // -> REMOVED ENDPOINT
generateCoverSrcSet(partKey)                     // -> REMOVED ENDPOINT
```

### 2. Use URLs from API Responses

**For cover images:**
```typescript
// OLD
const coverUrl = part.has_cover_attachment
  ? getCoverThumbnailUrl(part.key)
  : null;

// NEW - URL is provided directly, add thumbnail param for size
const coverUrl = part.cover_url
  ? `${part.cover_url}?thumbnail=150`
  : null;
```

**For attachment thumbnails:**
```typescript
// OLD
const thumbnailUrl = getThumbnailUrl(part.key, attachment.id);

// NEW - URL is provided, add thumbnail param for images
const thumbnailUrl = attachment.attachment_url
  ? `${attachment.attachment_url}&thumbnail=150`
  : null;
```

**For downloads:**
```typescript
// OLD
const downloadUrl = getDownloadUrl(part.key, attachment.id);

// NEW - URL is provided, add disposition param for downloads
const downloadUrl = attachment.attachment_url
  ? `${attachment.attachment_url}&disposition=attachment`
  : null;
```

**For inline viewing:**
```typescript
// NEW - just use the attachment_url directly (inline is the default)
const viewUrl = attachment.attachment_url;
```

### 3. Handle Different Thumbnail Sizes

The `attachment_url` and `cover_url` are base URLs. Add `?thumbnail=<size>` or `&thumbnail=<size>` for thumbnails:

```typescript
function getThumbnailWithSize(baseUrl: string | null, size: number): string | null {
  if (!baseUrl) return null;

  // Check if URL already has query params
  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${separator}thumbnail=${size}`;
}

// Usage for cover images (no existing query params)
const smallCover = getThumbnailWithSize(part.cover_url, 150);
const largeCover = getThumbnailWithSize(part.cover_url, 500);

// Usage for attachments (has content_type param already)
const smallThumb = getThumbnailWithSize(attachment.attachment_url, 150);
const largeThumb = getThumbnailWithSize(attachment.attachment_url, 500);
```

### 4. Update srcSet Generation

For responsive images, construct srcSet from the base URL:

```typescript
function generateSrcSetFromUrl(baseUrl: string | null): string {
  if (!baseUrl) return '';

  const sizes = [150, 300, 500];
  const separator = baseUrl.includes('?') ? '&' : '?';

  return sizes
    .map(size => `${baseUrl}${separator}thumbnail=${size} ${size}w`)
    .join(', ');
}

// For cover images
const coverSrcSet = generateSrcSetFromUrl(part.cover_url);

// For attachment thumbnails
const attachmentSrcSet = generateSrcSetFromUrl(attachment.attachment_url);
```

### 5. Caching Benefits

The new CAS URLs include `Cache-Control: public, max-age=31536000, immutable` headers. This means:

- **No revalidation needed** - browser serves from cache without network requests
- **Indefinite caching** - same content always has same URL
- **CDN-friendly** - can be cached at edge

No frontend changes needed to benefit from this - just use the URLs as provided.

## New URL Format

CAS URLs follow this pattern:
```
/api/cas/<sha256-hash>?content_type=<mime>&filename=<name>&disposition=<inline|attachment>&thumbnail=<size>
```

Examples:
```
# Base URL from cover_url (no query params)
/api/cas/a1b2c3d4e5f6...

# Get cover thumbnail (add thumbnail param)
/api/cas/a1b2c3d4e5f6...?thumbnail=300

# Base URL from attachment_url (has content_type)
/api/cas/d4e5f6g7h8i9...?content_type=application%2Fpdf&filename=datasheet.pdf

# Download as attachment (add disposition)
/api/cas/d4e5f6g7h8i9...?content_type=application%2Fpdf&filename=datasheet.pdf&disposition=attachment

# Get image thumbnail (add thumbnail)
/api/cas/g7h8i9j0k1l2...?content_type=image%2Fjpeg&thumbnail=300
```

## URL Parameter Reference

| Parameter | Description | Values |
|-----------|-------------|--------|
| `content_type` | MIME type for Content-Type header (optional, defaults to `application/octet-stream`) | e.g., `image/jpeg`, `application/pdf` |
| `filename` | Suggested filename for downloads | Any valid filename |
| `disposition` | Content-Disposition header | `inline` (default) or `attachment` |
| `thumbnail` | Generate thumbnail at size (mutually exclusive with `content_type`) | Integer (e.g., `150`, `300`, `500`) |

## Checklist

- [ ] Remove or update `src/lib/utils/thumbnail-urls.ts`
- [ ] Update part list/detail views to use `cover_url` with `?thumbnail=<size>` instead of `has_cover_attachment`
- [ ] Update attachment displays to use `attachment_url` with appropriate params
- [ ] Update any code that checks `has_cover_attachment` boolean
- [ ] Remove any hardcoded references to old endpoints
- [ ] Test image loading in part lists, detail views, and attachment galleries
