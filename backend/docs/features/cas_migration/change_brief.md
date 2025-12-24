# CAS Migration - Change Brief

## Summary

Migrate the S3 storage system from UUID-based keys to a Content-Addressable Storage (CAS) system using SHA-256 hashes. This eliminates cache revalidation round-trips by enabling `Cache-Control: immutable` on all blob responses.

## Current State

- S3 keys: `parts/{part_id}/attachments/{uuid}.{ext}`
- Multiple endpoints serve blobs: cover thumbnails, attachment downloads, attachment thumbnails
- Frontend constructs URLs to these endpoints
- ETag-based caching requires server round-trips for validation

## Target State

### New S3 Key Format
```
cas/<sha256-hex>
```

### Single CAS Endpoint
```
GET /api/cas/<hash>?content_type=<mime>&disposition=<inline|attachment>&filename=<name>&thumbnail=<size>
```

- **Stateless**: No database access. All information is in the URL.
- **Immutable**: Returns `Cache-Control: public, max-age=31536000, immutable`
- **Validation**: Returns 400 Bad Request if both `content_type` and `thumbnail` are provided (thumbnails are always JPEG)

### Database Changes
- `part_attachments.s3_key` column now stores `cas/<hash>` format
- No schema migration needed - just data migration

### Response Schema Changes
- Remove `s3_key` from API responses (security)
- Replace `has_cover_attachment: bool` with `cover_url: str | null` (full CAS URL)
- Add pre-built CAS URLs to attachment responses

### Endpoints to Remove
- `GET /api/parts/<key>/cover` (metadata only - keep? TBD during planning)
- `GET /api/parts/<key>/cover/thumbnail`
- `GET /api/parts/<key>/attachments/<id>/download`
- `GET /api/parts/<key>/attachments/<id>/thumbnail`

### Migration
1. On startup, migrate attachments one-by-one:
   - Find first attachment where `s3_key` not like `cas/%`
   - Download from S3, compute SHA-256, upload to `cas/<hash>`
   - Update DB record, commit
   - Repeat until none left
2. After migration, if `CAS_MIGRATION_DELETE_OLD_OBJECTS=true`:
   - Delete all S3 objects not starting with `cas/`

### Thumbnail Handling
- Generated on-demand, cached locally as `{hash}_{size}.jpg`
- Source content is immutable, so thumbnails are effectively immutable
- `?thumbnail=<size>` triggers generation; content_type param forbidden with thumbnail

### Upload Flow Changes
- Compute SHA-256 of uploaded bytes
- Store at `cas/<hash>` (skip upload if already exists - deduplication)
- Store metadata in DB with new s3_key format

## Out of Scope
- S3 object deletion (no GC)
- Frontend implementation (document required changes only)
