# Remove Image Upload from AI Part Analysis

## Description

Remove the photo/image upload functionality from the AI part analysis feature. Currently, the AI part input dialog allows users to either enter text or upload/capture an image for analysis. Since the backend image analysis has not been implemented, these UI controls should be removed to avoid user confusion. The feature will be simplified to text-only input.

## Files to Modify

### 1. src/components/parts/ai-part-input-step.tsx
- Remove state variables: `selectedImage`, `imagePreview`, `showCamera`
- Remove refs: `fileInputRef`
- Remove functions: `handleImageSelect`, `handleFileUpload`, `handleCameraCapture`, `removeImage`
- Remove imports: `CameraCapture` component, `Camera`, `Upload`, `X`, `FileImage` icons
- Modify `handleSubmit` function to remove image parameter
- Modify `onSubmit` prop interface to remove image parameter
- Remove entire image input section (lines 97-168)
- Update `canSubmit` condition to only check for text input

### 2. src/components/parts/ai-part-dialog.tsx
- Modify `handleInputSubmit` to remove image parameter from data object
- Update the call to `analyzePartFromData` to pass text-only data

### 3. src/hooks/use-ai-part-analysis.ts
- Modify `analyzePartFromData` function signature to accept only text parameter
- Remove `FormData` creation and multipart handling
- Change from multipart/form-data POST to JSON POST
- Update validation to require text input only
- Remove image-related type definitions from the data parameter

## Implementation Steps

### Step 1: Simplify AI Part Input Component
1. Remove all image-related state management
2. Remove image handling callbacks
3. Remove the camera capture modal
4. Simplify the form to only show text input field
5. Update submit validation to only check for text presence

### Step 2: Update Parent Dialog
1. Change the data type passed between input step and analysis
2. Remove image from the submission flow

### Step 3: Modify Analysis Hook
1. Convert from multipart form submission to simple JSON submission
2. Remove file upload logic
3. Simplify the API request body to only include text field

## Technical Details

The current implementation uses a multipart form to support both text and image:
- FormData object with optional 'text' and 'image' fields
- Complex state management for image preview and camera capture
- Integration with CameraCapture component

The simplified implementation will:
- Use a simple JSON POST with only a 'text' field
- Remove all image-related UI components
- Maintain the same three-step flow (input → progress → review)

Note: The CameraCapture component itself will remain intact as it's used by the document upload modal. Only its usage in the AI part analysis flow will be removed.

## Result

After implementation, the AI part analysis will:
- Accept only text input (part number or description)
- Have a cleaner, simpler UI without image upload options
- Maintain all other functionality (analysis progress, review, part creation)

The removed code can be recovered from version control if image analysis is implemented in the future.