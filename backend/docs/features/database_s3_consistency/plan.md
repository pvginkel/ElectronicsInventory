# Database-S3 Consistency Invariants

## Overview
We need to guarantee that part attachments stay consistent between the SQL database and S3: attachment rows should only persist when the corresponding object exists in storage, and S3 deletions must never race ahead of a successful database commit. The current Flask app relies on a per-request transaction commit in `app/__init__.py`, so the service layer has to stage S3 work carefully while respecting the teardown-based transaction lifecycle.

## Current Behavior (April 2024 codebase)
- `app/services/document_service.py::_create_attachment` streams file content to S3 **before** the `PartAttachment` row is added/flushed. If the subsequent flush or later logic fails, the S3 object is orphaned.
- Both `create_file_attachment()` and `create_url_attachment()` delegate to `_create_attachment`, so the same ordering bug applies to all attachment types (uploaded files, URL thumbnails, HTML preview images).
- `DocumentService.delete_attachment()` deletes the S3 object first and suppresses `InvalidOperationException`, then deletes the database row. If the database transaction later rolls back, the row reappears without the backing file, and operators never see the S3 error.
- When anything outside the database raises, we currently rely on exceptions propagating so the teardown hook rolls back; there is no explicit `needs_rollback` flagging when we decide to keep the exception but continue execution. We accept that this can leave orphaned S3 blobs because the database remaining authoritative is the higher priority.
- No plan currently documents the desired invariants in `CLAUDE.md`, so new contributors have no reference for the sequencing requirements.

## Files and Functions to Modify
### Modified Files
- `app/services/document_service.py`
  - Introduce a module logger.
  - Rework `_create_attachment` to defer S3 uploads until after the row has been added and flushed, letting any upload failure bubble up so the caller’s transaction manager can roll back.
  - Ensure `create_file_attachment()` and `create_url_attachment()` forward any additional data that `_create_attachment` needs (e.g., original filename) without duplicating S3 handling.
  - Update `delete_attachment()` to capture metadata, perform database mutations (including cover image reassignment and thumbnail cleanup), flush, then attempt S3 deletion with logging instead of `pass`.
- `app/services/image_service.py`
  - No functional changes expected, but confirm thumbnail cleanup calls still operate correctly when invoked before the explicit commit. Adjust if the API needs to return a boolean or raise for missing thumbnails.
- `app/utils/error_handling.py`
  - Confirm helpers that translate exceptions to HTTP responses continue to flag the scoped session for rollback so API requests rely on the existing teardown behavior (no new service-level flags).
- `CLAUDE.md`
  - Document the two invariants and the safe patterns for create/update/delete so future work follows the same ordering.
- Tests
  - `tests/test_document_service.py`: extend unit tests to cover upload failures triggering rollback flags and to assert S3 deletion happens after the database commit path.
  - `tests/test_document_api.py` and/or `tests/test_document_integration.py`: add integration coverage that exercises the Flask request lifecycle to ensure teardown rolls back on upload errors and that failed S3 deletions surface in logs while keeping the database consistent.

## Implementation Phases
### Phase 1 – Attachment Creation Ordering
1. Refactor `_create_attachment`:
   - Validate inputs as today, but collect `file_bytes`, content metadata, and the intended S3 key before writing anything to S3.
   - Create the `PartAttachment` instance with the generated `s3_key`, add it to the session, and call `self.db.flush()` so constraints (including cover image updates) run before any external side effects.
   - Attempt the S3 upload inside a `try` block. Let any failure bubble up as `InvalidOperationException`; rely on the caller’s transaction management (e.g., Flask teardown via `handle_api_errors`) to decide whether to roll back. Log context so operators can diagnose the failure, but don’t manipulate the session flags directly.
   - On success, return the attachment as before. Cover image assignment should continue to happen through the existing flush logic.
2. Ensure both `create_file_attachment()` and `create_url_attachment()` pass the right arguments (filename, preview image content, etc.) to the refactored `_create_attachment` without duplicating S3 logic.

### Phase 2 – Safe Deletions
1. In `delete_attachment()` gather the attachment, its `s3_key`, and cover-image status before mutating the database.
2. Remove the attachment row, recompute the cover image if required, clean up thumbnails, and call `self.db.flush()` to persist those changes.
3. Flush the session so subsequent logic (cover reassignment, constraints) runs, then let the caller’s transaction boundary perform the commit/rollback.
4. After the flush, attempt S3 deletion in a `try/except`, logging failures with context but not raising so callers can proceed. Do not swallow the exception silently; include the attachment id/key in the log to aid cleanup scripts.

### Phase 3 – Transaction Safety Hooks
1. Audit existing exception-handling paths in `DocumentService` that might intercept S3 errors. Ensure they propagate upstream rather than swallowing failures locally.
2. Avoid introducing service-level helpers to mutate session state; rely on the caller to own the transaction lifecycle per the project guidelines.

### Phase 4 – Testing & Documentation
1. Update unit tests to stub `s3_service.upload_file`/`delete_file` and verify:
   - Upload failures leave no `PartAttachment` in the database once the caller rolls back and keep the part cover unset.
   - Successful attachment creation keeps the existing API contract.
   - Delete failures still remove the DB row and issue a log warning.
2. Add integration tests that run through the Flask client to confirm request teardown commits/rolls back appropriately when S3 operations succeed or fail.
3. Extend `CLAUDE.md` with a new "S3 Storage Consistency" section summarizing the invariants, ordering rules, and testing expectations.

## Algorithms / Ordering Guarantees
### Safe Upload Algorithm
1. Validate request payload (size, MIME type, attachment type).
2. Generate the S3 key using part metadata.
3. Add the `PartAttachment` row (with the target `s3_key`) and flush.
4. Attempt the S3 upload; on failure, let the exception propagate so the transaction owner can roll back.
5. Let request teardown (or the ambient caller) commit when the response succeeds; the DB record only persists if the upload did.

### Safe Delete Algorithm
1. Read the attachment row and cache `s3_key` + derived data.
2. Delete the row, reassign cover image, and flush.
3. Allow the transaction owner to commit; do not call `commit()` directly in the service.
4. Attempt the S3 delete, logging any failure.

## Testing Strategy
- **Unit tests**: Patch the S3 service to force success/failure branches and assert DB state, session flags, and log messages.
- **Integration tests**: Use the Flask test client with mocked S3 service to verify teardown commits/rolls back as expected across HTTP endpoints.
- **Regression tests**: Ensure existing document API/service tests still pass, especially cover-image and thumbnail handling.

## Documentation
- Update `CLAUDE.md` with the invariants and practical examples (create/update/delete) so future work follows the same sequencing.
- Mention the new tests or scenarios in any developer onboarding docs if applicable.
