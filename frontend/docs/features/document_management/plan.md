# Document Management Web UI Integration Plan

## Brief Description

Integrate comprehensive document management functionality into the React frontend to support the backend document management system. This includes implementing file upload capabilities for images and PDFs, URL attachment management with thumbnail preview, and a complete document viewer interface. Any attachment (image, PDF, or URL) can be designated as the part's cover image. The UI will provide intuitive workflows for managing multiple attachments per part while maintaining the existing part management patterns.

## Files to Create

### UI Components (`src/components/`)

#### Document Management Components (`src/components/documents/`)
- `DocumentGrid.tsx` - Grid display of all attachments
- `DocumentCard.tsx` - Individual document card with thumbnail, title, and hover overlay with cover/delete icons
- `DocumentViewer.tsx` - Modal viewer for displaying full-size images (PDFs open in browser's native viewer)
- `AddDocumentModal.tsx` - Modal with URL field, name field, preview area, drag-and-drop support, and camera button
- `DocumentPreview.tsx` - Component for previewing documents/images within the modal
- `CameraCapture.tsx` - Camera interface component for capturing photos

#### Enhanced UI Components (`src/components/ui/`)
- `HoverActions.tsx` - Overlay component that appears on hover with action icons
- `DropZone.tsx` - Drag-and-drop zone with visual feedback for the modal
- `Thumbnail.tsx` - Reusable thumbnail component with loading states, fallbacks, and srcset support for responsive images (uses local PDF icon for PDFs)
- `ProgressBar.tsx` - Upload progress indicator component
- `MediaViewer.tsx` - Image viewer with zoom and navigation (images only)
- `IconButton.tsx` - Small icon-only button component for hover actions
- `Modal.tsx` - Base modal component if not already existing

### Custom Hooks (`src/hooks/`)
- `use-document-upload.ts` - Hook for managing file uploads with progress tracking
- `use-part-documents.ts` - Hook for fetching and managing part attachments
- `use-cover-image.ts` - Hook for managing part cover image operations
- `use-document-viewer.ts` - Hook for managing document viewer state and navigation
- `use-url-preview.ts` - Hook for URL metadata extraction and title fetching
- `use-camera-detection.ts` - Hook for detecting camera availability on device
- `use-add-document-modal.ts` - Hook for managing modal state and document processing

### Utilities (`src/lib/utils/`)
- `file-validation.ts` - File type, size validation and MIME type checking
- `image-processing.ts` - Client-side image utilities (preview generation, etc.)
- `document-formatting.ts` - Document metadata formatting and display utilities
- `thumbnail-urls.ts` - Functions for generating thumbnail URLs from backend with srcset support for multiple resolutions
- `url-metadata.ts` - Functions for extracting title tags from URLs
- `filename-extraction.ts` - Utilities for extracting filenames from URLs and file objects

## Files to Modify

### Existing Components

#### `src/components/parts/part-form.tsx`
- No changes needed - keep part creation workflow simple and lightweight
- Documents are managed separately after part creation

#### `src/components/parts/part-details.tsx`
- Display cover attachment (if set) prominently in part information card
- Add documents section showing attachment grid with cover indicator
- Integrate document management actions including "Set as Cover"
- Add document viewer modal integration

#### `src/components/parts/part-list.tsx`
- Add thumbnail display to part list items
- Update part card layout to include cover image

### API Integration

#### `src/hooks/use-parts.ts`
- Add cover attachment management functions
- Extend part data to include attachment information
- Add functions for updating which attachment is the cover

### Generated API Types (Already Available)
- `src/lib/api/generated/hooks.ts` - Document management hooks are now available
- `src/lib/api/generated/types.ts` - Document attachment types are generated
- `src/lib/api/generated/client.ts` - Updated client with document endpoints

**Available Document Hooks:**
- `useGetPartsAttachmentsByPartKey` - List part attachments
- `usePostPartsAttachmentsByPartKey` - Create new attachment
- `useGetPartsAttachmentsByPartKeyAndAttachmentId` - Get attachment details
- `usePutPartsAttachmentsByPartKeyAndAttachmentId` - Update attachment metadata
- `useDeletePartsAttachmentsByPartKeyAndAttachmentId` - Delete attachment
- `useGetPartsAttachmentsDownloadByPartKeyAndAttachmentId` - Download attachment
- `useGetPartsAttachmentsThumbnailByPartKeyAndAttachmentId` - Get thumbnail
- `useGetPartsCoverByPartKey` - Get cover attachment
- `usePutPartsCoverByPartKey` - Set cover attachment
- `useDeletePartsCoverByPartKey` - Remove cover attachment
- `useGetPartsCoverThumbnailByPartKey` - Get cover thumbnail

## Implementation Phases

### Phase 1: Core Document Infrastructure
1. **Base UI Components**
   - Create `FileInput.tsx` with validation and styling
   - Implement `DropZone.tsx` with drag-and-drop functionality
   - Build `Thumbnail.tsx` component with loading states
   - Add `ProgressBar.tsx` for upload feedback

2. **Document Upload Hook**
   - Implement `use-document-upload.ts` with progress tracking
   - Add file validation utilities in `file-validation.ts`
   - Create thumbnail URL utilities in `thumbnail-urls.ts`

3. **API Integration Implementation**
   - Use existing generated document API hooks
   - Implement custom hooks wrapping the generated hooks
   - Add proper error handling and data transformation

### Phase 2: Cover Attachment Integration
1. **Cover Attachment Components**
   - Build `CoverImageSelector.tsx` for selecting any attachment as cover
   - Create `use-cover-image.ts` hook for cover attachment management
   - Add cover attachment display to part information card

2. **Display Integration**
   - Keep `part-form.tsx` unchanged - no document handling in creation
   - Update part editing form to only handle basic part metadata
   - Document management is separate from part form workflows

3. **List and Detail Views**
   - Update `part-list.tsx` to show cover attachment thumbnails
   - Modify `part-details.tsx` to display cover attachment prominently
   - Add cover attachment selector to part details

### Phase 3: Document Management System
1. **Document Components**
   - Implement `DocumentUpload.tsx` with multi-file support
   - Create `DocumentGrid.tsx` for attachment display
   - Build `DocumentCard.tsx` with metadata and actions
   - Add `DocumentActions.tsx` menu component

2. **Document Management Hook**
   - Implement `use-part-documents.ts` for CRUD operations
   - Add document metadata formatting utilities
   - Create attachment state management

3. **Integration with Part Details**
   - Add documents section to `part-details.tsx` with single "Add Document" button
   - Integrate `AddDocumentModal` with part details view
   - Add hover overlay interactions for cover/delete actions on document cards

### Phase 4: URL Attachments & Advanced Features
1. **URL Attachment System**
   - Create `UrlAttachmentForm.tsx` with URL validation
   - Implement `use-url-preview.ts` for metadata extraction
   - Add URL attachment display and management

2. **Document Viewer**
   - Build `DocumentViewer.tsx` modal for file viewing
   - Create `MediaViewer.tsx` for image viewing with zoom
   - Add `use-document-viewer.ts` hook for navigation
   - PDFs open directly in browser's native PDF viewer via download/view link


## API Integration Details

### Expected Backend Endpoints
Based on backend plan, the UI will integrate with:

#### Cover Attachment Management
- `PUT /api/parts/{part_key}/cover` - Set any attachment as cover
- `DELETE /api/parts/{part_key}/cover` - Remove cover designation
- `GET /api/parts/{part_key}/cover/thumbnail?size={size}` - Get cover thumbnail

#### Document Operations
- `POST /api/parts/{part_key}/attachments` - Upload new attachment
- `GET /api/parts/{part_key}/attachments` - List all attachments
- `GET /api/parts/{part_key}/attachments/{attachment_id}/thumbnail?size={size}` - Get thumbnail
- `GET /api/parts/{part_key}/attachments/{attachment_id}/download` - Download file
- `PUT /api/parts/{part_key}/attachments/{attachment_id}` - Update metadata
- `DELETE /api/parts/{part_key}/attachments/{attachment_id}` - Delete attachment

### API Hook Patterns
Following existing patterns in `use-parts.ts`:

```typescript
// Document management hooks
export function usePartDocuments(partId: string) {
  const query = useGetPartsAttachmentsByPartKey(
    { path: { part_key: partId } },
    { enabled: !!partId }
  );

  return {
    ...query,
    documents: query.data || [],
  };
}

export function useUploadDocument() {
  return usePostPartsAttachmentsByPartKey();
}

export function useSetCoverAttachment() {
  return usePutPartsCoverByPartKey();
}

export function useDeleteDocument() {
  return useDeletePartsAttachmentsByPartKeyAndAttachmentId();
}
```

## User Experience Workflows

### Adding Documents to Existing Part
1. User creates new part using existing lightweight form (no document handling)
2. User navigates to part details page after creation
3. User clicks "Add Document" to open modal
4. User adds document via URL, file drag/drop, or camera capture
5. Modal handles all document types (images, PDFs, URLs) in unified interface
6. User can designate any attachment as the cover after upload
7. Real-time upload progress and validation feedback

### Managing Existing Part Documents
1. User views part details page
2. Cover attachment (if set) displayed prominently in part info card
3. Documents section shows grid with single "Add Document" button at the top
4. Each document card shows thumbnail and title
5. Hover over document card reveals overlay with two small icon buttons: "Make Cover" and "Delete"
6. Click document (outside hover area) to view in modal viewer
7. "Add Document" button opens comprehensive document addition modal

### Document Viewing Experience
1. Click any document:
   - **Images**: Open in full-screen modal viewer with zoom and pan
   - **PDFs**: Open directly in browser's native PDF viewer in new tab
2. Image viewer includes keyboard navigation between images
3. Image viewer has metadata overlay with edit options
4. Quick actions available in image viewer: download, close, set as cover, delete
5. PDF actions available via right-click or browser PDF viewer controls

### Add Document Modal Workflow
1. User clicks "Add Document" button in part details
2. Modal opens with three sections: URL field, Name field, and Preview area
3. Modal shows "Drag and drop files here" message in preview area
4. User can:
   - **Paste/enter URL**: Name auto-fills with page title, preview shows full-size image from URL
   - **Drag/drop file**: Name auto-fills with filename, URL stays empty, preview shows actual file content
   - **Click "Use Camera"**: Opens camera capture, name gets timestamp, URL empty
5. User can edit the name field regardless of auto-fill
6. Preview area shows the actual image/document content (full-size for images, PDF icon for PDFs)
7. User clicks "Add" to upload/save the document

### Camera Integration
- "Use Camera" button only visible on devices with camera capability
- Opens native camera interface or WebRTC camera stream
- Captured image auto-fills preview and generates timestamp-based name
- Works on mobile devices and laptops with cameras

## Responsive Design Considerations

### Mobile-First Approach
- Document grid adapts to single column on mobile
- Touch-friendly file upload areas
- Swipe gestures for document navigation
- Responsive thumbnail sizes using srcset for optimal mobile bandwidth
- High-DPI thumbnail support for Retina displays

### Tablet Optimization
- Two-column document grid layout
- Enhanced drag-and-drop target areas
- Larger touch targets for document actions

### Desktop Features
- Multi-column document grids
- Keyboard shortcuts for power users
- Batch document selection and operations
- Advanced file management features

## Performance Optimizations

### Image Loading Strategy
- Lazy load thumbnails as user scrolls
- Progressive image loading for large attachments
- Thumbnail size optimization based on device using srcset
- Multiple thumbnail resolutions (150px, 300px, 500px) for different screen densities
- Client-side image caching for repeated views
- Automatic high-DPI support via srcset and sizes attributes

### Upload Optimization
- Chunked upload for large files
- Concurrent uploads with queue management
- Upload retry logic for failed transfers
- Background upload with user notification

### Data Fetching
- React Query caching for document metadata
- Optimistic updates for document operations
- Background refresh of attachment lists
- Intelligent cache invalidation

## Error Handling Strategy

### Upload Error Management
- Network error recovery with retry options
- File validation errors with clear messaging
- Progress indication during retry attempts
- Graceful fallback for unsupported file types

### Display Error Handling
- Thumbnail loading failure fallbacks
- Document viewer error states
- URL attachment preview failures

## Accessibility Requirements

### Screen Reader Support
- Proper ARIA labels for all document actions
- Alt text for thumbnails and images
- Keyboard navigation for document grid
- Focus management in modal viewers

### Keyboard Navigation
- Tab order through document interface
- Enter/Space activation for document actions
- Escape key to close viewers and modals
- Arrow keys for document navigation


## Testing Strategy

### Component Testing
- File upload component validation
- Document grid rendering with various data
- Modal viewer functionality
- Cover image selection logic

### Integration Testing
- End-to-end document upload workflow
- Document management operations
- API integration with mock backend
- Error handling scenarios


## Dependencies to Add

### File Handling
- Add file upload libraries if needed (currently using native HTML5 file API)
- Consider image manipulation libraries for client-side processing

### File Handling
- PDF viewing relies on browser's native PDF viewer (no additional libraries needed)
- PDF thumbnails use local PDF icon asset (`src/assets/pdf-icon.svg`) since backend returns generic PDF icon
- Downloaded PDF icon stored locally to avoid external dependencies

### Image Processing
- Client-side image utilities for preview generation
- Image optimization libraries for upload preparation

## Configuration

### File Upload Limits
- Match backend limits in client validation
- Configurable file size limits
- Supported file type configurations
- Upload chunk size settings

### UI Configuration
- Thumbnail size options matching backend
- Grid layout responsive breakpoints
- Modal viewer settings
- Animation and transition preferences

## Migration Considerations

### Parts Without Documents
- Handle parts with no attachments gracefully (this is the default state)
- Provide clear "add document" call-to-action in part details
- Maintain existing part display when no cover attachment
- Keep part creation workflow unchanged and lightweight

### Data Migration
- No client-side data migration required
- Backend handles existing part data
- Progressive enhancement of UI features

This plan provides a comprehensive integration of document management into the Web UI, following the existing patterns and architecture while adding robust document handling capabilities that align with the backend implementation.