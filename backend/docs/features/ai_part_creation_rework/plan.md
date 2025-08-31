# Rework AI Part Creation - Technical Plan

## Overview
Simplify the AI part creation flow by using `AIPartAnalysisResultSchema` directly instead of having separate schemas (`AIPartAnalysisTaskResultSchema` and `AIPartCreateSchema`). The client will receive the AI analysis results and can make modifications before creating the part.

## Files to Modify

### 1. `/app/api/ai_parts.py`
- **Function**: `create_part_from_ai_analysis()`
- **Changes**: 
  - Complete implementation (currently empty)
  - Change input schema from `AIPartCreateSchema` to `AIPartAnalysisResultSchema`
  - Handle part creation and document attachments

### 2. `/app/schemas/ai_part_analysis.py`
- **Changes**:
  - Remove `AIPartAnalysisTaskResultSchema` (lines 125-143)
  - Remove `AIPartCreateSchema` (lines 162-249)
  - Keep `AIPartAnalysisResultSchema` and `DocumentSuggestionSchema`

### 3. `/tests/test_ai_parts_api.py`
- **Changes**: Add comprehensive tests for the new implementation

## Implementation Details

### Step 1: Update API Endpoint Schema
Change the `/api/ai-parts/create` endpoint to accept `AIPartAnalysisResultSchema`:

```python
@ai_parts_bp.route("/create", methods=["POST"])
@api.validate(
    json=AIPartAnalysisResultSchema,  # Changed from AIPartCreateSchema
    resp=SpectreeResponse(HTTP_201=PartResponseSchema, HTTP_400=ErrorResponseSchema)
)
```

### Step 2: Implement create_part_from_ai_analysis

The function will:

1. **Parse input data**
   - Validate the `AIPartAnalysisResultSchema` from request JSON
   
2. **Create the part**
   ```python
   part = part_service.create_part(
       description=data.description,
       manufacturer_code=data.manufacturer_code,
       type_id=data.existing_type_id if data.type_is_existing else None,
       tags=data.tags,
       seller=data.seller,
       seller_link=data.seller_link,
       package=data.package,
       pin_count=data.pin_count,
       voltage_rating=data.voltage_rating,
       mounting_type=data.mounting_type,
       series=data.series,
       dimensions=data.dimensions
   )
   ```

3. **Handle document attachments**
   For each document in `data.documents`:
   - Check if it's a cached/temporary URL
   - Retrieve content using `download_cache_service.get_cached_content()`
   - Create attachment using `document_service.create_file_attachment()`
   - Track first image attachment for potential cover image

4. **Set cover image**
   - If an image attachment was created, set it as the cover image
   - Use `document_service.set_part_cover_attachment()`

5. **Return response**
   - Convert part to `PartResponseSchema`
   - Return with 201 status

### Step 3: Schema Cleanup

Remove unnecessary schemas from `/app/schemas/ai_part_analysis.py`:
- `AIPartAnalysisTaskResultSchema` - No longer needed as task returns `AIPartAnalysisResultSchema` directly
- `AIPartCreateSchema` - Replaced by using `AIPartAnalysisResultSchema` directly

### Step 4: Update AI Task

The `AIPartAnalysisTask` should return `AIPartAnalysisResultSchema` directly instead of wrapping it in `AIPartAnalysisTaskResultSchema`.

### Step 5: Test Implementation

Create comprehensive tests in `/tests/test_ai_parts_api.py`:

1. **test_create_part_from_ai_analysis_full_data**
   - Test with all fields populated
   - Verify part creation with all attributes
   - Verify document attachments are created
   - Verify cover image is set

2. **test_create_part_from_ai_analysis_minimal_data**
   - Test with only required fields
   - Verify part is created successfully

3. **test_create_part_with_documents**
   - Test document attachment creation
   - Verify URLs are properly cached and retrieved
   - Verify attachments are linked to part

4. **test_create_part_with_new_type**
   - Test when `type_is_existing` is false
   - Verify part created without type_id

5. **test_create_part_with_existing_type**
   - Test when `type_is_existing` is true
   - Verify `existing_type_id` is used

6. **test_create_part_invalid_data**
   - Test validation errors
   - Missing required fields
   - Invalid data types

## Benefits

1. **Simpler API**: One schema for AI results that flows through the system
2. **Client flexibility**: Client can modify AI suggestions before creating part
3. **Cleaner code**: Remove intermediate schemas and transformations
4. **Better separation**: AI analysis and part creation are clearly separated
5. **Consistent data flow**: Same schema from AI analysis through to part creation

## Data Flow

```
AI Analysis → AIPartAnalysisResultSchema → Client (can modify) → 
→ POST /api/ai-parts/create → Part Creation → PartResponseSchema
```

This eliminates the need for intermediate transformation schemas and makes the flow more direct and maintainable.