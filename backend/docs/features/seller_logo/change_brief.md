# Change Brief: Seller Logo

## Problem

Sellers currently have no visual identity in the app. Adding a logo to each seller improves recognition when browsing parts, shopping lists, and seller link lists.

## Changes Required

### 1. Seller Model Update

Add a `logo_s3_key: str | None` column to the `sellers` table. Add a `logo_url` property that uses `build_cas_url()` to generate a CAS URL for the frontend — same pattern as `Part.cover_url` and `Attachment.attachment_url`.

### 2. Alembic Migration

Add nullable `logo_s3_key VARCHAR(500)` column to the `sellers` table.

### 3. API Endpoints

- `PUT /sellers/<id>/logo` — Upload a logo image (multipart file upload). Validates the file is an image using python-magic, generates a CAS key, updates `logo_s3_key` on the seller, flushes DB first, then uploads to S3 if the CAS key doesn't already exist (dedup). Follows the project's "persist before S3" pattern.
- `DELETE /sellers/<id>/logo` — Sets `logo_s3_key = None` and flushes. No S3 deletion — CAS blobs are never deleted because they may be shared via deduplication. This matches the established patterns in `DocumentService` and `AttachmentSetService`.

### 4. Schema Updates

Add `logo_url: str | None` to `SellerResponseSchema` and `SellerListSchema` so the frontend receives the logo URL in all seller responses.

### 5. Service Layer

Add `s3_service` dependency to `SellerService`. Implement `set_logo()` and `delete_logo()` methods directly on `SellerService` — no separate service needed for two operations on the seller entity.

### 6. Tests

Comprehensive service and API tests for upload, delete, validation, and response schema changes.
