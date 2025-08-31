# AI-Powered Part Creation Feature

## Description

Integrate AI assistance into the part creation workflow to allow users to create parts by entering text (model numbers, descriptions) and/or taking photos. The AI will analyze the input and auto-populate all part fields, fetch documentation, and suggest appropriate metadata. Users can review and edit all suggestions before confirming the part creation.

## Files to Create

### Components
- `src/components/parts/ai-part-dialog.tsx` - Main dialog component managing the multi-step AI part creation workflow
- `src/components/parts/ai-part-input-step.tsx` - Initial step for text input and photo capture/upload
- `src/components/parts/ai-part-progress-step.tsx` - Progress display with SSE stream monitoring
- `src/components/parts/ai-part-review-step.tsx` - Review and edit AI suggestions before creation
- `src/components/parts/ai-document-preview.tsx` - Document preview cards with deletion capability
- `src/components/ui/split-button.tsx` - Split button component for "Add" / "Add & Create New"

### Hooks
- `src/hooks/use-ai-part-analysis.ts` - Manages AI analysis submission and result handling
- `src/hooks/use-sse-task.ts` - Generic SSE connection handler for task progress monitoring

### Utilities
- `src/lib/utils/ai-parts.ts` - Document deduplication and data transformation utilities

## Files to Modify

- `src/components/parts/part-list.tsx` - Add "Add With AI" button next to existing "Add Part" button
- `src/routes/parts/index.tsx` - Add state management for AI dialog and navigation handling

## Implementation Steps

### Step 1: Input Collection
1. User clicks "Add With AI" button in part list
2. Dialog opens with `ai-part-input-step` component
3. Component provides:
   - Text input field for model numbers or descriptions
   - Camera button for mobile photo capture (uses existing `CameraCapture` component)
   - File upload for desktop image selection
   - Preview of selected image
4. Submit sends multipart/form-data to `/api/ai-parts/analyze` endpoint

### Step 2: Analysis Progress
1. Receive task_id and stream_url from analyze endpoint response
2. `use-sse-task` hook connects to `/api/tasks/{task_id}/stream`
3. `ai-part-progress-step` displays:
   - Progress messages from SSE events
   - Progress percentage if provided
   - Cancel button to abort analysis
4. Parse SSE events for type: 'progress', 'result', or 'error'
5. On 'result' event, transition to review step

### Step 3: Review and Edit
1. `ai-part-review-step` receives `AIPartAnalysisResultSchema` data
2. Display all fields in editable form:
   - Description, manufacturer code, manufacturer
   - Type (with existing type selector if type_is_existing is false)
   - Tags array (using existing tags-input component)
   - Additional fields: dimensions, voltage_rating, mounting_type, package, pin_count, series
   - Product page URL, seller, seller link (seller and seller link must be provided by the user)
3. Documents section:
   - Deduplicate documents by URL
   - Display each with `ai-document-preview` component
   - Show URL preview with title and thumbnail
   - Allow deletion of unwanted documents
4. Split button at bottom:
   - Primary action: "Add" - creates part and navigates to detail
   - Dropdown option: "Add & Create New" - creates part and reopens dialog

### Step 4: Part Creation
1. On confirmation, call `/api/ai-parts/create` with:
   - All edited field values
   - Selected documents array (deduplicated)
   - Type handling based on type_is_existing flag
2. Receive created part response
3. Navigate to `/parts/{partId}` or reopen dialog based on button selection

## Algorithms

### SSE Event Parsing
```
1. Connect to stream_url via EventSource
2. For each message event:
   - Parse event.data as JSON
   - Extract type and data fields
   - Update UI based on type:
     - 'progress': Update progress bar and message
     - 'result': Store analysis result and transition
     - 'error': Display error and allow retry
3. Handle connection errors with exponential backoff
4. Clean up EventSource on component unmount
```

### Document Deduplication
```
1. Receive documents array from AI analysis
2. Create Map with URL as key
3. For each document:
   - Check if URL exists in Map
   - If not, add to Map
4. Return Map values as deduplicated array
```

### Multi-Part Form Submission
```
1. Create FormData instance
2. If text provided: append('text', textValue)
3. If image file provided: append('image', imageFile)
4. Submit FormData with proper multipart headers
5. Handle response with task_id and stream_url
```

## Data Flow

1. **Input Phase**: Text/Image → FormData → POST /api/ai-parts/analyze
2. **Processing Phase**: task_id → EventSource(/api/tasks/{task_id}/stream) → Progress Updates
3. **Review Phase**: AIPartAnalysisResultSchema → Editable Form → User Modifications
4. **Creation Phase**: AIPartCreateSchema → POST /api/ai-parts/create → PartResponseSchema
5. **Navigation Phase**: Part Key → Navigate to /parts/{partId}

## Component Hierarchy

```
PartList
├── Button: "Add Part" (existing)
├── Button: "Add With AI" (new)
└── AIPartDialog (new)
    ├── AIPartInputStep
    │   ├── Input (text)
    │   ├── CameraCapture (existing)
    │   └── FileUpload
    ├── AIPartProgressStep
    │   ├── ProgressBar
    │   └── CancelButton
    └── AIPartReviewStep
        ├── PartForm (fields)
        ├── AIDocumentPreview (multiple)
        └── SplitButton
            ├── "Add"
            └── "Add & Create New"
```