# Fix Preview URL Handling in AI Analysis Results

## Brief Description

The backend now returns relative URLs for preview images and documents in AI analysis results (via proxy endpoints), but the frontend needs to ensure these URLs are correctly prefixed with the API base URL for them to work properly.

## Current Implementation Analysis

### URL Prefixing Already Exists
The `src/lib/utils/ai-document-adapter.ts` file already implements URL prefixing correctly:
- Has a `getFullUrl` helper function (lines 80-86) that prefixes relative URLs starting with "/" with the API base URL
- Applies this to both `preview?.image_url` (line 97) and `preview?.original_url` (line 98)
- The URLs should be correctly prefixed when transformed

### Current URL Flow
1. AI analysis returns `DocumentSuggestionSchema` with `preview` containing:
   - `image_url`: Relative URL to backend proxy endpoint for preview image
   - `original_url`: Relative URL to backend proxy endpoint for original document
2. `transformAIDocumentToGridFormat` transforms these to:
   - `previewImageUrl`: Prefixed full URL for preview image
   - `originalUrl`: Prefixed full URL for original document
3. These are passed through `AIDocumentGrid` → `DocumentGrid` → `DocumentCard` and `MediaViewer`

## Files and Functions to Modify

### 1. `src/lib/utils/ai-document-adapter.ts`
- **Function**: `transformAIDocumentToGridFormat` (lines 72-102)
- **Current**: Already prefixes URLs correctly
- **Change**: No changes needed - verify it's working correctly

### 2. `src/components/documents/document-card.tsx`
- **Lines**: 133-139 (preview image display)
- **Current**: Uses `document.previewImageUrl` directly in `<img>` tag
- **Verify**: Check that the URL is already prefixed when it arrives here
- **Potential Issue**: If the URL is not prefixed, trace back through component chain

### 3. `src/components/documents/media-viewer.tsx`
- **Lines**: 114-119 (download handling for AI documents)
- **Lines**: 149 (setting fileUrl for display)
- **Current**: Uses `document.originalUrl` for AI documents
- **Verify**: Check that the URL is already prefixed when it arrives here

### 4. `src/components/parts/ai-document-grid.tsx`
- **Function**: Entire component (lines 1-51)
- **Current**: Transforms AI documents and passes to DocumentGrid
- **Verify**: Check that transformed documents retain prefixed URLs

## Implementation Steps

### Step 1: Debug URL Flow
1. Add console logging in `transformAIDocumentToGridFormat` to verify URLs are being prefixed
2. Add console logging in `AIDocumentGrid` to verify transformed documents have prefixed URLs
3. Add console logging in `DocumentCard` to verify received URLs are prefixed

### Step 2: Fix Any URL Prefixing Issues
1. If URLs are not being prefixed in `ai-document-adapter.ts`:
   - Debug the `getFullUrl` function
   - Ensure `getApiBaseUrl()` returns the correct base URL
2. If URLs are lost in component chain:
   - Find where the URLs are being overwritten or lost
   - Fix the data passing between components

### Step 3: Ensure Media Viewer Works
1. Verify that `originalUrl` is prefixed for AI documents
2. Test that images display correctly in the media viewer
3. Test that PDFs display correctly in the media viewer
4. Test that downloads work with the prefixed URLs

### Step 4: Test End-to-End
1. Create a new part using AI analysis with an image
2. Verify the preview image displays in the review step
3. Verify clicking the document opens it in the media viewer
4. Verify downloading the document works correctly

## Algorithm Details

### URL Prefixing Algorithm (Already Implemented)
```typescript
const getFullUrl = (url: string | null | undefined): string | null => {
  if (!url) return null;
  if (url.startsWith('/')) {
    return `${baseUrl}${url}`;  // Prefix relative URLs
  }
  return url;  // Return absolute URLs as-is
};
```

### Expected URL Transformation
- Backend returns: `/api/proxy/preview/abc123.jpg`
- Frontend transforms to: `http://localhost:5000/api/proxy/preview/abc123.jpg` (in development)
- Or in production: `/api/proxy/preview/abc123.jpg` (same origin)

## Notes

The implementation already appears to handle URL prefixing correctly in the adapter layer. The main task is to verify that the prefixed URLs are being passed through the component chain correctly and are not being lost or overwritten anywhere.

If the URLs are already being prefixed correctly, the issue may be elsewhere (e.g., CORS, authentication, or backend proxy configuration).