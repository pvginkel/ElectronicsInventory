# Clipboard Image Paste Feature Plan

## Brief Description

Implement Ctrl+V clipboard image upload functionality in the part display screen (viewer). When users press Ctrl+V while viewing a part and have an image on their clipboard, the image should be automatically uploaded as an attachment, skipping the upload dialog entirely.

## Files and Functions to Create or Modify

### New Files to Create:
- `src/hooks/use-clipboard-paste.ts` - Custom hook for handling clipboard paste events and image extraction

### Files to Modify:
- `src/components/parts/part-details.tsx` - Integrate clipboard paste functionality into the part display screen

## Algorithm Details

### Clipboard Image Detection and Extraction:
1. Add `paste` event listener to the document when PartDetails component mounts with valid `partId`
2. On paste event, check `event.clipboardData.items` array for image types
3. Filter items to find those with `item.type.startsWith('image/')`
4. Use `item.getAsFile()` to convert DataTransferItem to File object
5. Validate the file using existing `validateFile()` function from `src/lib/utils/file-validation.ts`
6. Generate descriptive filename using timestamp: `"Clipboard Image - ${new Date().toISOString()}"`

### Upload Integration:
1. Import and use existing `useDocumentUpload` hook from `src/hooks/use-document-upload.ts`
2. Call `uploadDocument()` function with the clipboard-derived File object
3. Use existing upload progress tracking and error handling
4. Skip the `AddDocumentModal` dialog entirely - upload happens immediately
5. After successful upload, scroll the newly uploaded image into view within the document grid

### Focus and Event Management:
1. Only activate paste handling when the part details page has focus
2. Prevent paste handling when focus is inside text input fields (to allow normal text paste)
3. Clean up event listeners on component unmount
4. Handle multiple images by processing only the first valid image found

### Document Grid Auto-Scroll:
1. After successful upload, wait for document grid to refresh with new document
2. Find the newly added document tile in the DOM using the document ID
3. Use `scrollIntoView()` with smooth behavior to bring the new image into view
4. Ensure scroll behavior works within the document grid container bounds

## Implementation Phases

### Phase 1: Core Functionality
- Create `useClipboardPaste` hook with basic image extraction
- Integrate hook into `PartDetails` component for display mode
- Use existing `useDocumentUpload` for actual upload

### Phase 2: User Experience
- Add proper focus management to prevent conflicts with text input
- Implement error handling for invalid clipboard content
- Add visual feedback during upload process
- Ensure document refresh functionality works in the display mode
- Implement auto-scroll to newly uploaded image in document grid