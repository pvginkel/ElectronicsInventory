# Fix Cover Image Selection from AI Analysis

## Brief Description

When creating a part from AI analysis results, the cover image selection is not working correctly. The user reports that despite the correct image being marked as `is_cover_image: true` in the JSON sent to the server, that image is not being set as the cover image. The issue is caused by a premature database commit in the `set_part_cover_attachment` method that disrupts the transaction flow.

## Files and Functions to Modify

### 1. `app/services/document_service.py`
- **Function: `set_part_cover_attachment()`** (line 489-514)
  - Change `self.db.commit()` to `self.db.flush()` at line 512
  - Remove `self.db.refresh(part)` at line 514 (unnecessary after flush)

### 2. `tests/test_ai_parts_api.py`
- **Add new test function: `test_create_part_with_cover_image_selection()`**
  - Test creating a part from AI analysis with multiple document attachments
  - Verify that when `is_cover_image: true` is set on a specific image, that image becomes the cover

## Technical Details

### Root Cause Analysis

1. **Current behavior in `app/api/ai_parts.py`** (lines 148-176):
   - Iterates through documents from AI analysis
   - Creates attachments via `document_service.create_url_attachment()`
   - Tracks which attachment should be the cover image based on `is_cover_image` flag
   - Calls `document_service.set_part_cover_attachment()` after all attachments are created

2. **Issue in `app/services/document_service.py`**:
   - The `_create_attachment()` method (lines 299-302) automatically sets the first image as cover if no cover exists
   - The `set_part_cover_attachment()` method (line 512) uses `self.db.commit()` instead of `self.db.flush()`
   - This premature commit causes transaction isolation issues when called within the larger part creation transaction

3. **Why this breaks**:
   - The commit in `set_part_cover_attachment()` finalizes the transaction prematurely
   - This can cause SQLAlchemy session state issues when multiple operations are performed in sequence
   - The refresh operation after commit may not properly update the part object in the current session context

### Algorithm Flow

1. Part creation from AI analysis initiates a database transaction
2. Multiple document attachments are created sequentially
3. First image attachment auto-sets itself as cover (via `_create_attachment`)
4. When the designated cover image is processed, `set_part_cover_attachment()` is called
5. The premature commit disrupts the transaction, preventing the cover update from taking effect properly

### Fix Implementation

The fix is straightforward - replace `commit()` with `flush()` to maintain transaction consistency:
- `flush()` sends changes to the database within the current transaction
- The transaction remains open for additional operations
- The final commit happens at the API endpoint level after all operations complete

## Testing Strategy

### New Test Case
Create a test that:
1. Sends AI part creation request with 3 image documents
2. Marks the second image as `is_cover_image: true`
3. Verifies the created part has the second image as its cover attachment
4. Confirms other images are attached but not set as cover

### Regression Testing
Run existing test suites to ensure no functionality breaks:
- `tests/test_document_service.py` - Validates document attachment behavior
- `tests/test_ai_parts_api.py` - Validates AI part creation flow