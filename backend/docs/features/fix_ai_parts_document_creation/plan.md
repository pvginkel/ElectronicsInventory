# Fix AI Parts Document Creation Bug

## Brief Description

The documents are not being created in the ai-parts/create endpoint due to a bug where the code attempts to access `doc.description` on a `DocumentSuggestionSchema` object, but this field does not exist in the schema. This prevents document attachments from being properly created when using AI-suggested documents.

## Files and Functions to Modify

### `app/api/ai_parts.py`
- **Function**: `create_part_from_ai_analysis()` (lines 145-159)
- **Issue**: Line 150 accesses `doc.description` which doesn't exist in `DocumentSuggestionSchema`
- **Fix**: Change to use `doc.preview.title` when available, otherwise extract filename from URL, otherwise fallback to `doc.document_type`
- **Remove**: Try/catch block (lines 146-159) that silently swallows exceptions

### `app/schemas/ai_part_analysis.py`
- **Class**: `DocumentSuggestionSchema` (lines 9-30)
- **Current fields**: `url`, `document_type`, `is_cover_image`, `preview`
- **Missing field**: No `description` field exists
- **Option 1**: Fix code to use existing fields
- **Option 2**: Add optional `description` field for custom document titles

### `tests/test_ai_parts_api.py`
- **Class**: `TestAIPartsAPI`
- **Missing test**: No test exists for document creation in the create endpoint
- **Add**: `test_create_part_with_documents()` method
- **Add**: `test_create_part_with_documents_and_cover_image()` method

## Step-by-Step Algorithm

### Document Title Resolution
1. Check if `doc.preview` exists and has a `title`
2. If yes, use `doc.preview.title` as the document title
3. If no, extract filename from the URL path (e.g., "datasheet.pdf" from "https://example.com/docs/datasheet.pdf")
4. If filename extraction fails or returns empty, use `f"AI suggested {doc.document_type}"` as final fallback
5. Pass resolved title to `document_service.create_url_attachment()`

### Document Attachment Process
1. Iterate through `data.documents` from the AI analysis request
2. For each document:
   - Resolve title using algorithm above
   - Call `document_service.create_url_attachment()` with part key, title, and URL
   - Check if `is_cover_image` is true
   - Store first cover attachment candidate for later processing
3. After all documents processed, set cover attachment if one was found

**Note**: Remove the existing try/catch block that silently swallows exceptions. Follow "fail fast" philosophy - if document attachment fails, the entire operation should fail and inform the user.

### Cover Attachment Setting
1. If a cover attachment candidate exists (from `is_cover_image` flag)
2. Call `document_service.set_part_cover_attachment()` with part key and attachment ID
3. If no explicit cover attachment was set, the first successfully created attachment automatically becomes the cover (handled by document service)

## Testing Requirements

### Test Cases to Add
1. **Basic document creation**: Test with documents containing `document_type` only
2. **Preview title usage**: Test with documents having `preview.title`
3. **Filename extraction**: Test with URLs containing clear filenames (e.g., "https://example.com/datasheet.pdf")
4. **Filename extraction edge cases**: Test with URLs with query parameters, fragments, or no file extension
5. **Cover attachment setting**: Test with `is_cover_image=true` document (any document type can be cover)
6. **Automatic cover fallback**: Test that first attachment becomes cover when no `is_cover_image=true` is set
7. **Error handling**: Test with invalid URLs (should fail the entire request with proper error message)
8. **Mixed scenarios**: Test with combination of valid/invalid documents and cover images

### Mock Requirements
- Mock `document_service.create_url_attachment()` to verify calls
- Mock `document_service.set_part_cover_attachment()` for cover image tests
- Return mock `PartAttachment` objects with appropriate attributes

## Implementation Phases

### Phase 1: Fix Core Bug
- Fix the `doc.description` access error in `create_part_from_ai_analysis()`
- Use existing schema fields to generate appropriate document titles

### Phase 2: Add Comprehensive Tests
- Add test cases covering all document creation scenarios
- Verify document attachment and cover image functionality

### Phase 3: Optional Schema Enhancement
- Consider adding `description` field to `DocumentSuggestionSchema` for future flexibility
- Update AI analysis service to populate this field when available