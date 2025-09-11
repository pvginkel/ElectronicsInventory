# Duplicate Part Function - Technical Plan

## Prerequisites

Before implementing this feature, the following must be completed:

1. **API Client Generation**: Run `pnpm generate:api` to generate the required `usePostPartsCopyAttachment` hook from the implemented backend API endpoint.
2. **Backend API Verification**: Ensure the `POST /api/parts/copy-attachment` endpoint is fully implemented and tested on the backend.

## Brief Description

Implement a duplicate part functionality that allows users to create a new part with all fields pre-filled from an existing part. Next to the Edit Part and Delete Part buttons, add a "..." button (vertical dots) that opens a menu with a "Duplicate Part" function. This opens the part editor in creation mode with all fields filled in and attachments copied over. The document grid must be added to support in-memory documents during duplication, similar to AI analysis workflow. This functionality is only for duplicating parts, not for creating new or updating existing parts.

## Files to Create or Modify

### Files to Create
- `/src/components/icons/MoreVerticalIcon.tsx` - Three vertical dots icon component
- `/src/hooks/use-duplicate-part.ts` - Custom hook to handle part duplication logic
- `/src/components/parts/duplicate-document-grid.tsx` - Document grid component for duplication mode
- `/src/lib/utils/document-transformers.ts` - Utility functions for transforming API documents to DocumentItem format

### Backend API (Implemented)
- **Endpoint**: `POST /api/parts/copy-attachment`  
- **Hook**: `usePostPartsCopyAttachment`
- **Purpose**: Server-side individual attachment copying without file transfer
- **Benefits**: Much faster, simpler frontend code, no progress UI needed

### Files to Modify

#### `/src/components/parts/part-details.tsx`
- **Location**: Lines 152-164 (button section)
- **Changes**: Add three-dot menu button with dropdown containing "Duplicate Part" option
- **Functions**: Add `handleDuplicatePart` function to navigate to new part form with duplicate parameters

#### `/src/components/parts/part-form.tsx`
- **Interface**: Modify `PartFormProps` to include `duplicateFromPartId?: string`
- **State**: Add state for managing in-memory documents during duplication
- **Effects**: Add useEffect to populate form when `duplicateFromPartId` is provided
- **UI**: Conditionally render `DuplicateDocumentGrid` component only in duplicate mode
- **Submission**: Update form submission to handle document uploads for duplicated parts

#### `/src/components/parts/part-document-grid.tsx`
- **Refactor**: Extract document transformation logic to shared utility function
- **Current State**: Transformation logic is currently inline (lines 28-50) within the component's useMemo hook
- **Complexity**: This involves extracting type determination, preview URL generation, and DocumentItem mapping logic
- **Process**: Multi-step refactoring to move inline transformation to `/src/lib/utils/document-transformers.ts`
- **No other changes**: Keep existing functionality intact after refactoring

#### `/src/routes/parts/new.tsx`
- **Route**: Accept optional search params for duplicate mode (`?duplicate=<partId>`)
- **Search Param Parsing**: Use TanStack Router's `useSearch()` hook to extract duplicate parameter
- **Parameter Validation**: Validate that duplicate parameter is a valid part ID string
- **Component**: Handle `duplicateFromPartId` parameter and pass to `PartForm`
- **Title**: Show "Duplicate Part from <PART_ID>" when in duplicate mode

## Step-by-Step Implementation Algorithm

### Document Duplication Algorithm
1. **Fetch source part documents** using existing `usePartDocuments` hook from `/src/hooks/use-part-documents.ts`
2. **Transform documents using shared utility**: Use extracted `transformApiDocumentsToDocumentItems` function from `/src/lib/utils/document-transformers.ts`
3. **Store in local state**: Keep transformed `DocumentItem[]` in component state for in-memory manipulation
4. **Handle local operations**:
   - **Delete**: Remove from local documents array
   - **Cover toggle**: Update local cover state (track cover document ID)
   - **View**: Open documents in media viewer (same as existing grids)
5. **Submit with part creation**: Copy documents to new part using `usePostPartsCopyAttachment` API for each document

### Form Population Algorithm
1. **Fetch source part data** using `useGetPartsByPartKey` hook
2. **Transform API response** to form data format:
   - Convert snake_case API fields to camelCase form fields
   - Handle null/undefined values appropriately
   - Convert numeric fields to strings where needed (pinCount, etc.)
3. **Populate all form fields** with transformed data
4. **Set form mode** to creation (not editing) but with pre-filled data

### Navigation Flow
1. User clicks "..." menu → "Duplicate Part" option
2. Navigate to `/parts/new?duplicate=<partId>` 
3. Part form detects duplicate parameter and enters duplication mode
4. Form loads with all fields pre-filled and documents displayed
5. User can modify any field or document before submission
6. Form submits as new part creation followed by document re-uploads

## Document Creation Strategy (Using Copy Attachment API)

### Copy Attachment API Usage
The implemented `POST /api/parts/copy-attachment` endpoint copies individual attachments:

**Request Structure**:
- `attachment_id`: ID of source attachment to copy
- `target_part_key`: Key of destination part
- `set_as_cover`: Whether to set as cover image for destination part

**Implementation Approach**:
1. **Sequential copying**: Loop through each document in duplication list
2. **Individual API calls**: Call copy attachment API for each document
3. **Cover handling**: Set cover flag only for the document that was cover in source
4. **Error handling**: Continue copying other documents if one fails
5. **Progress indication**: Show progress UI during sequential copies with current/total counts

### Part Creation Flow (With Copy Attachment API)

1. **Create part first**: 
   - Show progress: "Creating part..."
   - Submit standard part creation form without documents
2. **Get new part ID**: Use returned part ID for document copying
3. **Copy documents sequentially**: 
   - Show initial progress: "Copying documents (0/X)..."
   - Loop through selected documents from duplication list
   - Call `usePostPartsCopyAttachment` for each document
   - Pass `attachment_id`, `target_part_key`, and `set_as_cover` flag
   - Update progress after each successful copy: "Copying documents (N/X)..."
   - Handle individual copy failures gracefully (continue with remaining)
4. **Final navigation**: Navigate to new part detail page

### Implementation in PartForm

#### State Management Changes
- Add state variables for duplicate documents array and cover document ID
- Store document IDs (as numbers) for API calls alongside display data
- Track which documents user wants to duplicate after any deletions in the grid
- Add state for copy progress tracking: `isCopying`, `copyProgress` with completed/total counts

#### Form Submission Modifications
**With Copy Attachment API**:
- Show progress: "Creating part..." and disable form
- Create part using existing form submission logic
- After part creation, set `isCopying` to true and initialize `copyProgress` to {completed: 0, total: documentCount}
- Loop through selected documents and call `usePostPartsCopyAttachment` for each
- Pass `attachment_id` (number), `target_part_key` (new part ID), and `set_as_cover` flag
- Handle cover image by setting flag only for the original cover document
- Update `copyProgress.completed` after each successful copy
- Set `isCopying` to false when all copies complete or fail

## UI Integration Details

### Dropdown Menu Implementation
- Use existing UI components: `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem`
- Position menu next to existing Edit/Delete buttons
- Include only "Duplicate Part" option initially (extensible for future menu items)

### Document Grid Integration
- **Create DuplicateDocumentGrid**: New component using same `DocumentGridBase` and `MediaViewerBase` components
- **Shared transformation logic**: Extract and reuse document transformation from `PartDocumentGrid`
- **In-memory operations**: Implement local state handlers for delete/cover operations
- **Same UI/UX**: Preserve identical viewing, thumbnail, and media viewer behavior
- **Clean separation**: No modification of existing `PartDocumentGrid` component

### Form Modifications
- Add conditional rendering for document grid section
- Update form title to indicate duplication mode
- Add progress UI during sequential document copying:
  - Show "Creating part..." during part creation
  - Show "Copying documents (N/X)..." during document copying phase
  - Disable form controls during copying process
  - Show completion message before navigation
- Maintain all existing validation rules
- Preserve existing form functionality for create/edit modes

## Code Reuse Strategy

### Shared Utilities (`/src/lib/utils/document-transformers.ts`)
Extract document transformation logic from `PartDocumentGrid`:
- Function to convert API documents to `DocumentItem[]` format
- Function to determine document type (image/pdf/website) from API data
- Function to generate thumbnail URLs for documents

### DuplicateDocumentGrid Implementation
- Import shared transformation utilities
- Manage documents array and cover ID in local component state
- Implement delete/cover handlers that update local state (not API calls)
- Use same `DocumentGridBase` and `MediaViewerBase` components for consistent UI
- Handle document persistence during form submission

### Benefits
- Clean separation from existing `PartDocumentGrid` component
- Share transformation logic without tight coupling
- Single source of truth for document transformation
- Easy to extend duplication-specific functionality