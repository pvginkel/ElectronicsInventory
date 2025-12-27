# Implementation Plan: Pick List PDF Support

## Overview

Add a PDF viewing capability to the pick list detail screen, allowing users to view and download a generated PDF of the pick list. The PDF is served by the backend at `GET /api/pick-lists/{id}/pdf`.

## Design Decisions

1. **Reuse MediaViewerBase**: Rather than creating a new component, reuse the existing `MediaViewerBase` component which already handles PDF viewing with iframe rendering, download, keyboard navigation, dark background, and performance optimizations.

2. **Integration Point**: Add a "View PDF" button to the pick list detail page's actions area, next to the existing "Delete Pick List" button.

3. **URL Construction**: The PDF endpoint is not yet in the generated API client. Construct the URL directly as `/api/pick-lists/{id}/pdf` with a TODO to migrate once the backend adds the endpoint to the OpenAPI schema.

## Implementation Steps

### Step 1: Add PDF Button and MediaViewerBase Integration to Pick List Detail

**File**: `src/components/pick-lists/pick-list-detail.tsx`

Modifications:
1. Import `MediaViewerBase` from `@/components/documents/media-viewer-base`
2. Add state to track PDF viewer open/closed: `const [isPdfViewerOpen, setIsPdfViewerOpen] = useState(false)`
3. Construct a single-element documents array for the PDF:
   ```typescript
   const pdfDocument = detail ? {
     id: 'pick-list-pdf',
     type: 'pdf' as const,
     title: `Pick List ${detail.id}`,
     // TODO: Replace with generated API hook once backend adds /pdf endpoint to OpenAPI schema
     assetUrl: `/api/pick-lists/${detail.id}/pdf`,
     previewImageUrl: null,
     isCover: false,
   } : null;
   ```
4. Add a "View PDF" button to the `actions` section with test ID `pick-lists.detail.actions.view-pdf`
5. Render `MediaViewerBase` with:
   - `isOpen={isPdfViewerOpen}`
   - `onClose={() => setIsPdfViewerOpen(false)}`
   - `documents={pdfDocument ? [pdfDocument] : []}`
   - `currentDocumentId="pick-list-pdf"`
   - `onNavigate={undefined}` (single document, no navigation needed)

### Step 2: Add Playwright Test Coverage

**File**: `tests/e2e/pick-lists/pick-list-detail.spec.ts`

Add test scenarios for PDF viewing:

1. **Test: View PDF button opens PDF viewer**
   - Given: A pick list exists
   - When: User clicks the "View PDF" button
   - Then: The media viewer dialog opens with the PDF displayed

2. **Test: PDF viewer closes on Escape key**
   - Given: The PDF viewer is open
   - When: User presses Escape key
   - Then: The viewer closes and returns to the pick list detail

3. **Test: PDF viewer closes on close button click**
   - Given: The PDF viewer is open
   - When: User clicks the close button
   - Then: The viewer closes

**File**: `tests/e2e/pick-lists/PickListsPage.ts`

Extend the page object with:
- `viewPdfButton()` locator for `pick-lists.detail.actions.view-pdf`
- Methods to interact with the PDF viewer via `MediaViewerBase` selectors

## File Changes Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `src/components/pick-lists/pick-list-detail.tsx` | Modified | Add View PDF button and MediaViewerBase integration |
| `tests/e2e/pick-lists/pick-list-detail.spec.ts` | Modified | Add PDF viewer test scenarios |
| `tests/e2e/pick-lists/PickListsPage.ts` | Modified | Add PDF viewer page object methods |

## API Client Migration Plan

**Current State**: The `GET /api/pick-lists/{id}/pdf` endpoint is not in the OpenAPI schema.

**Temporary Approach**: Construct the URL directly as `/api/pick-lists/${detail.id}/pdf` with a TODO comment.

**Future Migration**:
1. Backend adds the PDF endpoint to the OpenAPI schema
2. Frontend runs `pnpm generate:api` to regenerate the client
3. Replace manual URL construction with the generated hook
4. Remove the TODO comment

## Risks & Mitigations

1. **Risk**: PDF endpoint not in generated API client
   - **Mitigation**: Use direct URL construction with TODO comment. Coordinate with backend to add to schema.

2. **Risk**: PDF generation fails on backend
   - **Mitigation**: The browser's PDF viewer handles errors gracefully; MediaViewerBase shows the iframe which will display browser error if PDF fails to load.

## Rollback Strategy

If issues are discovered:
1. Remove the "View PDF" button and state from `pick-list-detail.tsx`
2. Remove the `MediaViewerBase` usage
3. Revert test file changes

The changes are additive and do not modify existing functionality.
