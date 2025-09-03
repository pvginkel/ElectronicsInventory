# Database-S3 Consistency Invariants

## Overview

Ensure consistency between database records and S3 storage by implementing two key invariants:
1. **Create/Update**: Only complete a transaction if S3 storage has succeeded
2. **Delete**: Only delete S3 objects after the database transaction has been successfully committed

## Current Issues

### Create/Update Operations
- S3 uploads occur before database record creation in `DocumentService.create_file_attachment()` (line 150)
- S3 uploads occur before database record creation in `URLThumbnailService.download_and_store_thumbnail()` (line 460)
- If database operations fail after S3 upload, orphaned files remain in storage

### Delete Operations
- S3 deletions happen before database deletion in `DocumentService.delete_attachment()` (line 311)
- S3 deletion failures are silently suppressed with `pass` statement (line 313)
- Database records are removed even when S3 cleanup fails

### Transaction Management
- Flask uses transaction-per-request pattern with commit in `teardown_request` (`app/__init__.py` line 74-75)
- Services use `db.flush()` throughout but rely on request teardown for final commit
- Most operations work correctly within transaction scope, just need reordering

## Files and Functions to Modify

### Modified Files

#### `app/services/document_service.py`
- `create_file_attachment()` - Reorder operations to upload after flush
- `create_url_attachment()` - Keep as-is (already correct if URL service is fixed)
- `delete_attachment()` - Add explicit commit before S3 deletion

#### `app/services/url_thumbnail_service.py`
- `download_and_store_thumbnail()` - Return metadata without S3 upload, let caller handle upload after flush

#### `CLAUDE.md`
- Add section documenting S3-database consistency patterns

### New Files
- `tests/test_transaction_consistency.py` - Integration tests for consistency

## Implementation Steps

### Phase 1: Fix Create/Update Operations

1. **Update `DocumentService.create_file_attachment()`**:
   - Keep all validation and processing as-is
   - Create database record and call `db.flush()` to get ID
   - Move S3 upload to AFTER the flush (currently line 150 should move after line 165)
   - If S3 upload fails, exception bubbles up and triggers automatic rollback
   - No need to store record without s3_key first - do it all in one go

2. **Update `URLThumbnailService.download_and_store_thumbnail()`**:
   - Split into two methods: one for downloading/preparing data, one for S3 upload
   - Return the prepared data without uploading to S3
   - Let `DocumentService.create_url_attachment()` handle S3 upload after flush
   - This ensures S3 upload is within transaction scope

### Phase 2: Fix Delete Operations

1. **Update `DocumentService.delete_attachment()`**:
   - Delete database record first
   - Call `self.db.commit()` explicitly to ensure deletion is committed
   - Only then attempt S3 deletion
   - Keep the try/except for S3 deletion - log failures but don't error (record is already gone)

```python
# Simplified approach:
def delete_attachment(self, attachment_id: int):
    attachment = self.get_attachment(attachment_id)
    s3_key = attachment.s3_key
    
    # Delete from database and commit
    self.db.delete(attachment)
    self.db.commit()
    
    # Now safe to delete from S3
    if s3_key:
        try:
            self.s3_service.delete_file(s3_key)
        except Exception as e:
            # Log error but don't fail - record is committed as deleted
            logger.warning(f"Failed to delete S3 file {s3_key}: {e}")
```

### Phase 3: Testing

1. **Create `tests/test_transaction_consistency.py`**:
   - Test that S3 upload failure prevents database record creation
   - Test that database deletion completes even if S3 deletion fails
   - Mock S3 service to simulate failures
   - Verify no orphaned database records or S3 files in success cases

2. **Update existing tests**:
   - Ensure tests still pass with reordered operations
   - Add test cases for the new failure scenarios

### Phase 4: Documentation

1. **Update `CLAUDE.md`**:
   - Add "S3 Storage Consistency" section
   - Document the two invariants clearly
   - Provide examples of correct patterns
   - Warn against common pitfalls

## Algorithms

### Safe S3 Upload Pattern (Create/Update)
1. Validate all input data
2. Prepare/process file data (resize images, etc.)
3. Generate S3 key using database ID (may need to flush first)
4. Create database record with all fields
5. Call `db.flush()` to get ID and trigger constraints
6. Upload to S3 using the generated key
7. If S3 fails, exception triggers automatic rollback via teardown_request
8. If successful, teardown_request commits the transaction

### Safe S3 Delete Pattern
1. Retrieve record and S3 key
2. Delete database record
3. Explicitly commit the transaction with `self.db.commit()`
4. Attempt S3 deletion (after commit succeeds)
5. Log but don't fail if S3 deletion fails

## Why This Approach Works

- **No post-commit hooks needed**: Explicit commit for deletes is simpler
- **Transaction safety for creates**: S3 upload within transaction scope means automatic rollback on failure
- **Consistency guarantee**: Database is source of truth; S3 orphans are acceptable (can be cleaned up), but database inconsistency is not
- **Minimal code changes**: Just reordering operations and one explicit commit

## Implementation Order

1. **First**: Fix create operations (just reordering, low risk)
2. **Second**: Fix delete operations (add explicit commit)
3. **Third**: Add comprehensive tests
4. **Fourth**: Update documentation