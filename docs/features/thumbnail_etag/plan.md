Brief description:
- Implement ETag support for the thumbnail delivery endpoints so clients can rely on conditional requests; the ETag value must be a hash of the `s3_key` of the thumbnail.

Relevant files and functions:
- `app/services/document_service.py:get_attachment_thumbnail` — continue to provide thumbnail path and content type, and now also surface the ETag hash derived from either `attachment.s3_key` (for S3-backed images) or the SVG icon payload (for PDF/URL fallbacks).
- `app/api/documents.py:get_attachment_thumbnail` — add conditional GET handling (read `If-None-Match`, short-circuit with 304, set `ETag` header) when streaming attachment thumbnails.
- `app/api/documents.py:get_part_cover_thumbnail` — mirror the same ETag logic for cover thumbnails.
- `tests/test_document_service.py:TestDocumentService` — verify the service returns the hash when an image thumbnail is backed by S3 and omits it for SVG fallback scenarios.
- `tests/test_document_api.py` — extend API coverage to assert the `ETag` header on 200 responses and confirm a 304 response when `If-None-Match` matches the computed hash.

Implementation steps:
1. Calculate the ETag in `DocumentService.get_attachment_thumbnail` by hashing the canonical payload: use `hashlib.sha256(attachment.s3_key.encode("utf-8")).hexdigest()` for S3-backed image thumbnails, and hash the SVG bytes returned by the image service for PDF/URL icon fallbacks. Return the hash alongside `(thumbnail_path, content_type)` so callers always receive a value when a thumbnail response is available; the method should continue to raise for unsupported attachment types exactly as it does today.
2. Update `get_attachment_thumbnail` in `app/api/documents.py` to unpack `(thumbnail_path, content_type, etag)` (or equivalent structure), wrap the hash in quotes for strong ETags (`f'"{hash_value}"'`), compare it to `request.headers.get("If-None-Match")`, respond with `("", 304, {"ETag": quoted_hash})` on a match, and otherwise add the same `ETag` header to the 200 response that streams the JPEG file or inline SVG.
3. Apply identical conditional logic to `get_part_cover_thumbnail` so part cover thumbnails share the ETag behavior; ensure the `ETag` header is included for both streamed JPEGs and inline SVG content.
4. Augment service tests to assert the correct hash is produced for image thumbnails and for SVG fallbacks; expand API tests to check for the quoted strong `ETag` header on success and to exercise the 304 code path (also verifying the empty body) for both the attachment thumbnail route and the cover thumbnail route.
