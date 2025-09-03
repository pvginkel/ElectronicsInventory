# Plan: Add Function Calling Support to AI Service

## Overview
Port the function calling implementation from the prompttester to the main AI service, enabling the AI to classify URLs during part analysis. The URL classification functionality will be implemented as internal methods within the AI service, keeping the classification logic as an implementation detail.

## Files to Modify

### 1. `app/services/ai_service.py`
- Simplify the streaming code to use `ParsedResponse` directly from `ResponseCompletedEvent.response`
- Add function calling support with a `classify_urls` function
- Implement a loop to handle function call responses
- Add internal URL classification schemas as nested classes
- Add private `_classify_urls()` method that uses `URLThumbnailService.extract_metadata()` internally

## Implementation Details

### Step 1: Update AI Service with Internal Classification
Add to `app/services/ai_service.py`:
1. **Internal Schemas**: Create nested Pydantic model classes within AIService:
   - `ClassifyUrlsRequest`: Input schema for URL classification
   - `ClassifyUrlsEntry`: Schema for each URL's classification result  
   - `ClassifyUrlsResponse`: Response schema with list of classified URLs

2. **Private Classification Method**: Add `_classify_urls()` method that:
   - Accepts a `ClassifyUrlsRequest` with list of URLs
   - For each URL, calls `self.url_thumbnail_service.extract_metadata()` to determine content type
   - Maps `URLContentType` enum values to classification strings (pdf/image/webpage/invalid)
   - Returns `ClassifyUrlsResponse` with classification results

### Step 2: Update AI Service Streaming
1. Simplify streaming code to use `event.response` directly from `ResponseCompletedEvent`
2. Add function tool definition for `classify_urls`
3. Implement function calling loop:
   - After initial AI response, check for function calls
   - If `classify_urls` is called, invoke internal `self._classify_urls()`
   - Append function result to input_content
   - Continue streaming with updated context
4. Extract parsed response and output text from the final `ParsedResponse`

### Step 3: Update Tests
- Update `test_ai_service.py` to mock the new function calling flow
- Add tests for URL classification function calls using internal AI service method
- Ensure existing tests continue to pass

## Algorithm

1. **Initial API Call**: Stream response with web_search and classify_urls tools
2. **Process Events**: Handle streaming events, update progress
3. **Check Function Calls**: On `ResponseCompletedEvent`, check `response.output` for function calls
4. **Execute Functions**: If `classify_urls` requested:
   - Parse arguments as internal `ClassifyUrlsRequest`
   - Call internal `self._classify_urls()`
   - Format response as JSON
5. **Continue Conversation**: Add function result to input_content and stream again
6. **Extract Final Response**: Get parsed model and output text from final response

## Key Differences from Prompttester
- URL classification schemas and logic are internal to AI service (not exposed publicly)
- Use existing `URLThumbnailService.extract_metadata()` internally for content type detection
- No caching layer needed (download cache already handles this)
- Maintain compatibility with existing AI service interface
- Keep function calling as an AI service implementation detail