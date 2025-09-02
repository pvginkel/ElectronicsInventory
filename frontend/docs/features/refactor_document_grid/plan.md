# Document Grid and Media Viewer Refactoring Plan

## Brief Description

Refactor the document grid and media viewer components to be agnostic to their usage context. Currently, these components are tightly coupled with part-specific logic and have been adapted for AI analysis results through a complex adapter pattern. This refactoring will create clean, reusable components with their own type definitions, allowing the part details screen and AI analysis result page to adapt their data models independently.

## Technical Requirements

### New Type Definitions

Create unified type definitions for the document grid and media viewer that are independent of part or AI context:

```typescript
interface DocumentItem {
  id: string;
  title: string;
  type: 'image' | 'pdf' | 'website';
  previewImageUrl: string | null;
  assetUrl: string;
  isCover: boolean;
}

interface DocumentGridProps {
  documents: DocumentItem[];
  onTileClick: (document: DocumentItem) => void;
  onToggleCover: (documentId: string) => void;
  onDelete: (documentId: string) => Promise<boolean>;
  showCoverToggle?: boolean;
}

interface MediaViewerProps {
  documents: DocumentItem[];
  currentDocumentId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onNavigate?: (documentId: string) => void;
}
```

## Files to Modify

### Core Components (Create New)
- `src/components/documents/document-grid-base.tsx` - New agnostic document grid
- `src/components/documents/document-tile.tsx` - New individual tile component
- `src/components/documents/media-viewer-base.tsx` - New agnostic media viewer
- `src/types/documents.ts` - New type definitions

### Integration Wrappers (Create New)
- `src/components/parts/part-document-grid.tsx` - Wrapper for part details screen
- `src/components/parts/ai-document-grid-wrapper.tsx` - Wrapper for AI analysis results

### Files to Update
- `src/components/parts/part-details.tsx` - Use new part document grid wrapper
- `src/components/parts/ai-part-review-step.tsx` - Use new AI document grid wrapper
- `src/hooks/use-document-viewer.ts` - Update to work with new types

### Files to Remove
- `src/components/documents/document-grid.tsx` - Replace with new base component
- `src/components/documents/document-card.tsx` - Replace with document-tile.tsx
- `src/components/documents/document-viewer.tsx` - Replace with wrapper logic
- `src/components/documents/media-viewer.tsx` - Replace with new base component
- `src/components/parts/ai-document-grid.tsx` - Replace with wrapper
- `src/lib/utils/ai-document-adapter.ts` - Move transformation to wrapper

## Implementation Steps

### Phase 1: Create Base Components

1. **Define new type system** (`src/types/documents.ts`)
   - Create `DocumentItem` interface with required fields
   - Create props interfaces for grid and viewer components
   - Define callback types for user interactions

2. **Build document tile component** (`src/components/documents/document-tile.tsx`)
   - Display preview image or type-specific placeholder
   - Show title and document type
   - Implement favorite/cover toggle button
   - Implement delete button with confirmation callback
   - Handle click events for opening media viewer or external links

3. **Build document grid base** (`src/components/documents/document-grid-base.tsx`)
   - Render grid of document tiles
   - Handle empty state display
   - Pass through event handlers to tiles
   - Remove file size display references

4. **Build media viewer base** (`src/components/documents/media-viewer-base.tsx`)
   - Display images and PDFs in modal
   - Handle navigation between documents
   - Implement zoom controls for images
   - Handle download functionality
   - Remove part-specific logic

### Phase 2: Create Integration Wrappers

1. **Part document grid wrapper** (`src/components/parts/part-document-grid.tsx`)
   - Transform part attachments to `DocumentItem` format
   - Handle API calls for cover toggle using `useSetCoverAttachment`
   - Handle API calls for delete using `useDeleteDocument`
   - Manage confirmation dialogs with custom text
   - Open media viewer for images/PDFs, new tab for websites

2. **AI document grid wrapper** (`src/components/parts/ai-document-grid-wrapper.tsx`)
   - Transform AI document suggestions to `DocumentItem` format
   - Map delete callbacks to array index operations
   - Map cover toggle to update document array state
   - Handle preview URLs with proper base URL prefixing
   - Manage temporary state before part creation

### Phase 3: Update Existing Integrations

1. **Update part details screen**
   - Replace `DocumentGrid` import with `PartDocumentGrid`
   - Remove document transformation logic
   - Pass part ID and refetch callback to wrapper

2. **Update AI part review step**
   - Replace `AIDocumentGrid` import with `AIDocumentGridWrapper`
   - Pass document array and update callbacks to wrapper
   - Remove adapter utility usage

3. **Update document viewer hook**
   - Modify to work with `DocumentItem` type
   - Remove part-specific assumptions
   - Make reusable for any document collection

### Phase 4: Cleanup

1. **Remove old components**
   - Delete replaced document grid and card components
   - Delete old media viewer component
   - Delete document viewer wrapper component

2. **Remove adapter utilities**
   - Move any needed transformation logic to wrappers
   - Delete AI document adapter file

## Algorithm Details

### Document Click Handling
1. Check document type (image, pdf, or website)
2. For images/PDFs: Open media viewer with document
3. For websites: Open URL in new tab using `window.open`

### Cover Image Toggle
1. Wrapper receives toggle request with document ID
2. Part wrapper: Call API to update cover attachment
3. AI wrapper: Update local state array, marking selected as cover
4. Update UI to reflect new cover status

### Delete Confirmation
1. Wrapper receives delete request with document ID
2. Wrapper shows confirmation dialog with custom text
3. On confirm: Part wrapper calls API, AI wrapper updates array
4. On cancel: No action taken
5. Update grid to reflect changes

### Media Viewer Navigation
1. Track current document by ID
2. Calculate next/previous based on document array order
3. Update current document on navigation
4. Close viewer on escape or close button click