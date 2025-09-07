# Fix Attachment Error Handling

## Description

When saving an attachment fails, no error toast is displayed to the user and the dialog closes despite the error. The root cause is that the document upload functionality uses direct `fetch()` calls instead of React Query mutations, bypassing the centralized error handling system that automatically shows toast notifications.

## Files and Functions to Modify

### 1. `/src/hooks/use-document-upload.ts`
- **Function: `useDocumentUpload()`**
  - Add `useToast()` hook import and usage
  - Modify error handling in `uploadDocument()` callback to show toast notifications
  - Import `parseApiError` utility for error message formatting
  - Ensure errors are re-thrown after displaying toast

### 2. `/src/hooks/use-add-document-modal.ts`
- **Function: `handleSubmit()`**
  - Remove the try-catch block that swallows errors
  - Remove `console.error` statement
  - Allow errors to propagate to the modal component

### 3. `/src/components/documents/add-document-modal.tsx`
- **Function: `handleSubmitWrapper()`**
  - Keep existing try-catch to prevent dialog closure on error
  - Optionally add local error state for inline error display
  - Ensure dialog remains open when errors occur

## Implementation Details

### Step 1: Integrate Toast System in Upload Hook

The `useDocumentUpload` hook currently throws errors that are caught and logged but not displayed to users. The hook needs to:

1. Import the `useToast` hook from the toast context
2. Import the `parseApiError` utility function
3. In the catch block of `uploadDocument()`:
   - Parse the error using `parseApiError()`
   - Display the parsed message using `toast.showError()`
   - Re-throw the error to maintain existing error flow

### Step 2: Fix Error Propagation in Modal Hook

The `useAddDocumentModal` hook's `handleSubmit` function currently catches and suppresses errors:

1. Remove the try-catch block entirely
2. Let errors from `uploadDocument()` propagate naturally
3. Remove the `console.error` statement

### Step 3: Maintain Dialog State on Error

The modal component's `handleSubmitWrapper` already has the correct structure but needs verification:

1. Keep the try-catch block to control dialog closure
2. Only call `handleClose()` in the try block after successful submission
3. The catch block should remain empty (error already shown via toast)
4. Dialog stays open for user to retry or cancel

## Error Flow After Implementation

1. User attempts to save attachment
2. If upload fails, `useDocumentUpload` catches the error
3. Error is parsed into user-friendly message
4. Toast notification displays the error message
5. Error is re-thrown to prevent further processing
6. Modal's `handleSubmitWrapper` catches the error
7. Dialog remains open, allowing user to retry
8. Upload progress resets to allow fresh attempt

## Testing Scenarios

- Invalid file type upload
- Network failure during upload
- Server rejection (413 Payload Too Large)
- Invalid URL format for URL attachments
- Backend validation failures