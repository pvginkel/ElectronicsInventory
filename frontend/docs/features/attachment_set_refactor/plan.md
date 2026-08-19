# Attachment Set Refactor - Implementation Plan

## 0) Research Log & Findings

**Discovery Work:**
- Examined existing part attachment implementation in `src/components/parts/part-document-grid.tsx`, `src/components/documents/`, and related hooks
- Reviewed current hooks `use-part-documents.ts` (lines 1-50) and `use-cover-image.ts` (lines 1-15) which import now-deleted generated hooks
- Analyzed kit components (`kit-detail.tsx`, `kit-card.tsx`) to understand where attachment support needs to be added
- Checked generated API client hooks for new attachment-set endpoints (`useGetAttachmentSetsAttachmentsBySetId`, `usePostAttachmentSetsAttachmentsBySetId`, etc.)
- Found that `AddDocumentModal` (lines 14-302) is tightly coupled to `partId` parameter
- Discovered `useDocumentUpload` (lines 1-198) hardcodes part-specific endpoints and query invalidation
- Confirmed parts now have `cover_url` field in schema (line 184 in part-details.tsx shows `part.cover_url` usage)
- Identified that kit cards (`kit-card.tsx`) do not currently display cover images, unlike part cards (`part-card.tsx` lines 64-72)

**Relevant Components:**
- Document management: `document-grid-base.tsx`, `document-tile.tsx`, `media-viewer-base.tsx`, `add-document-modal.tsx`, `cover-image-selector.tsx`
- Part-specific: `part-document-grid.tsx`, `use-part-documents.ts`, `use-cover-image.ts`, `use-add-document-modal.ts`
- Kit components: `kit-detail.tsx` (lines 1-742), `kit-card.tsx` (lines 1-258)
- Upload infrastructure: `use-document-upload.ts` (lines 1-198)

**Key Conflicts Resolved:**
- **Part convenience endpoints status:** The backend part convenience endpoints (`/api/parts/{part_key}/attachments`, `/api/parts/{part_key}/cover`) remain stable wrappers as documented in the backend change brief. However, the **frontend generated hooks** (`useGetPartsAttachmentsByPartKey`, `usePutPartsCoverByPartKey`, `useDeletePartsCoverByPartKey`) no longer exist in the generated API client - grep confirms they are absent from `src/lib/api/generated/hooks.ts`. The frontend is broken because it imports deleted hooks, not because the endpoints were removed.
- Decision: Continue using part convenience endpoints via direct fetch (as `use-document-upload.ts` already does), use generated hooks for attachment-set endpoints for kits (new feature)
- Query invalidation strategy: Invalidate both attachment-set queries and parent entity queries to refresh `cover_url` (prefer simplicity per brief)

**Query Key Structure Verification:**
- Kit list queries use `['getKits', createKitsQueryParams(status, searchTerm)]` (`use-kits.ts:25`)
- Kit detail queries use `['getKitsByKitId', { path: { kit_id: kitId } }]` (`use-kit-detail.ts:30`)
- TanStack Query's `invalidateQueries({ queryKey: ['getKits'] })` matches ALL queries starting with `['getKits']` regardless of additional params (prefix matching behavior)
- Existing code at `use-kit-create.ts:41` already uses `invalidateQueries({ queryKey: ['getKits'] })` to invalidate all kit list queries
- **Conclusion:** Broad invalidation with `['getKits']` will correctly invalidate all status-filtered kit list views

**Test Infrastructure Analysis:**
- Existing page object: `DocumentGridPage` in `tests/support/page-objects/document-grid-page.ts`
- Page object is already used via `partsDocuments` fixture (`tests/support/fixtures.ts:77,283`)
- Test IDs use static format: `parts.documents.grid`, `parts.documents.modal`, etc.
- Page object methods accept optional `partKey` for API response waiting (e.g., `createLinkDocument`, `deleteDocument`, `setAsCover`)
- Test factory: `AttachmentTestFactory` in `tests/api/factories/attachment-factory.ts` - has methods for parts only, uses part convenience endpoints

## 1) Intent & Scope

**User intent**

Refactor frontend attachment management to align with the new backend attachment-set abstraction, enabling attachment support for kits while maintaining existing part attachment functionality. The backend has centralized attachment storage into reusable "attachment sets" that can be linked from multiple entity types.

**Prompt quotes**

"Refactor the frontend attachment management to use the new attachment-set API abstraction"
"Create reusable attachment management components that work against attachment sets"
"Add attachment management section at the bottom of the kit detail page (similar to parts)"
"Display cover image on kit cards (similar to part cards)"
"Do not add cover image display to the kit detail page header"
"Attachment management should be disabled when a kit is archived"
"Prefer simplicity over complexity for query invalidation"

**In scope**

- Refactor hooks to use new API endpoints (part convenience endpoints for parts, attachment-set endpoints for kits)
- Create generic attachment management hooks that accept `attachmentSetId` instead of entity-specific identifiers
- Update part attachment components to obtain `attachmentSetId` from part entity and delegate to generic components
- Add attachment management UI to kit detail page (grid, upload modal, media viewer)
- Display cover images on kit list cards
- Disable attachment editing when kit is archived
- Update query invalidation to refresh both attachment-set queries and parent entity queries for `cover_url`
- Update or create Playwright tests for both part and kit attachment workflows

**Out of scope**

- Cover image display on kit detail page header (explicitly excluded per brief)
- Changes to attachment preview/proxy endpoints (unchanged)
- Changes to copy-attachment functionality (unchanged)
- Migration of part attachments to use attachment-set endpoints directly (parts continue using convenience endpoints)

**Assumptions / constraints**

- Backend API has been updated and generated client is current
- Test factories have been updated to use new part convenience endpoints
- Parts and kits both have `attachment_set_id` and `cover_url` in their response schemas
- `KitSummarySchemaList` includes `cover_url` for list view
- Archived kits should not allow attachment mutations (consistent with other kit editing restrictions)
- Query invalidation prefers simplicity: invalidate broad query keys rather than optimizing for minimal refetches

## 2) Affected Areas & File Map

### Hooks (new/modified)

- **Area:** `src/hooks/use-attachment-set-documents.ts` (new)
- **Why:** Generic hook to fetch attachments for any attachment set, replacing entity-specific logic
- **Evidence:** Current `use-part-documents.ts:10-13` uses `useGetPartsAttachmentsByPartKey` which no longer exists

- **Area:** `src/hooks/use-attachment-set-upload.ts` (new)
- **Why:** Generic hook to upload attachments to an attachment set
- **Evidence:** Current `use-document-upload.ts:95-148` hardcodes `/api/parts/${partId}/attachments` endpoint

- **Area:** `src/hooks/use-attachment-set-cover.ts` (new)
- **Why:** Generic hook to set/remove cover attachment for any attachment set
- **Evidence:** Current `use-cover-image.ts:1-15` imports deleted hooks `usePutPartsCoverByPartKey`, `useDeletePartsCoverByPartKey`

- **Area:** `src/hooks/use-part-documents.ts` (modify)
- **Why:** Refactor to use generic attachment-set hooks with part's `attachmentSetId`
- **Evidence:** File imports deleted generated hooks (lines 3-7)

- **Area:** `src/hooks/use-cover-image.ts` (modify)
- **Why:** Refactor to use generic attachment-set cover hooks
- **Evidence:** File imports deleted generated hooks (lines 2-4)

- **Area:** `src/hooks/use-document-upload.ts` (modify)
- **Why:** Refactor to support both part convenience endpoints and attachment-set endpoints
- **Evidence:** Hardcoded part endpoint at line 95, query invalidation at lines 143-148

- **Area:** `src/hooks/use-add-document-modal.ts` (modify)
- **Why:** Generalize to accept `attachmentSetId` or continue accepting `partId` for backward compatibility
- **Evidence:** Currently accepts only `partId` parameter (line 14)

### Components (modified)

- **Area:** `src/components/parts/part-document-grid.tsx`
- **Why:** Extract part's `attachmentSetId` from part entity and pass to generic components
- **Evidence:** Lines 16-19 accept `partId` prop, should obtain `attachmentSetId` from part query

- **Area:** `src/components/documents/add-document-modal.tsx`
- **Why:** Generalize to accept `attachmentSetId` parameter alongside/instead of `partId`
- **Evidence:** Lines 14-26 show props interface with `partId` only

- **Area:** `src/components/documents/cover-image-selector.tsx`
- **Why:** Generalize to work with `attachmentSetId` instead of `partId`
- **Evidence:** Lines 9-14 show props with `partId`, lines 19-21 use part-specific hooks

### Components (new)

- **Area:** `src/components/kits/kit-attachment-section.tsx` (new)
- **Why:** Attachment management UI for kit detail page (grid + upload + viewer)
- **Evidence:** No current attachment UI in `kit-detail.tsx` (lines 1-742)

### Kit Components (modified)

- **Area:** `src/components/kits/kit-detail.tsx`
- **Why:** Add attachment section at bottom of detail page when kit is loaded
- **Evidence:** Lines 568-607 show `KitDetailLoaded` component body; add attachment section after BOM card

- **Area:** `src/components/kits/kit-card.tsx`
- **Why:** Display cover image using `CoverImageDisplay` component (similar to part cards)
- **Evidence:** Lines 34-110 show card layout without cover image; compare to `part-card.tsx:64-72`

### Types (modified)

- **Area:** `src/types/kits.ts`
- **Why:** Add `attachmentSetId` and `coverUrl` fields to `KitSummary` and `KitDetail` types
- **Evidence:** Lines 15-26 show `KitSummary` interface, lines 292-306 show `KitDetail` interface, neither include attachment fields

### Tests (new/modified)

- **Area:** `tests/playwright/parts/part-attachments.spec.ts` (new or modified)
- **Why:** Test part attachment workflows with refactored implementation
- **Evidence:** No existing document/attachment specs found in playwright directory

- **Area:** `tests/playwright/kits/kit-attachments.spec.ts` (new)
- **Why:** Test kit attachment workflows (upload, cover, delete, archived restriction)
- **Evidence:** New feature requiring new test coverage

## 3) Data Model / Contracts

### Attachment Set Response

- **Entity:** Attachment list from attachment set
- **Shape:**
  ```typescript
  {
    id: number;
    attachment_set_id: number;
    attachment_type: 'file' | 'url';
    title: string;
    url: string | null;
    filename: string | null;
    content_type: string | null;
    file_size: number | null;
    preview_url: string | null;
    attachment_url: string | null;
    created_at: string;
    updated_at: string;
  }
  ```
- **Mapping:** Map to existing `DocumentItem` interface used by grid components (convert snake_case fields, transform attachment_type to document type)
- **Evidence:** `use-part-documents.ts:18-30` shows current mapping logic, `types/documents.ts:6-14` shows `DocumentItem` interface

### Part Entity Update

- **Entity:** Part detail response
- **Shape:** Now includes `attachment_set_id: number` and `cover_url: string | null`
- **Mapping:** Extract `attachment_set_id` from part and pass to attachment hooks
- **Evidence:** `part-details.tsx:184` references `part.cover_url`, backend change brief confirms `attachment_set_id` field

### Kit Entity Update

- **Entity:** Kit summary and detail responses
- **Shape:** Backend returns `attachment_set_id: number` and `cover_url: string | null`
- **Mapping:** Add fields to `KitSummary` and `KitDetail` TypeScript interfaces:
  ```typescript
  // In src/types/kits.ts, add to KitSummary interface:
  attachmentSetId: number;
  coverUrl: string | null;

  // In mapping function (use-kits.ts or similar):
  attachmentSetId: apiKit.attachment_set_id,
  coverUrl: apiKit.cover_url ?? null,
  ```
- **Evidence:** Backend change brief states "Parts and kits now expose: attachment_set_id, cover_url"; existing pattern in `use-kits.ts:33-45` maps snake_case to camelCase

### TanStack Query Cache Keys

- **Entity:** Attachment set queries
- **Shape:**
  ```typescript
  ['getAttachmentSetsAttachmentsBySetId', { path: { set_id: number } }]
  ['getAttachmentSetsCoverBySetId', { path: { set_id: number } }]
  ```
- **Mapping:** Generic hooks will use these keys for attachment set queries
- **Evidence:** Generated hooks file shows these query key patterns

## 4) API / Integration Surface

### Fetch Attachments (Generic)

- **Surface:** `GET /api/attachment-sets/{set_id}/attachments` via `useGetAttachmentSetsAttachmentsBySetId`
- **Inputs:** `{ path: { set_id: number } }`
- **Outputs:** Array of attachment schemas, cached in TanStack Query
- **Errors:** API errors surface through query error state, toast notifications via global handler
- **Evidence:** Generated hooks file line 395-400

### Upload Attachment (Parts - Convenience Endpoint)

- **Surface:** `POST /api/parts/{part_key}/attachments` via direct fetch in `useDocumentUpload`
- **Inputs:** FormData with file or JSON with URL + title
- **Outputs:** Created attachment record, invalidates attachment and cover queries
- **Errors:** Validation errors shown via toast, upload state tracked in hook
- **Evidence:** `use-document-upload.ts:95-148`

### Upload Attachment (Kits - Attachment Set Endpoint)

- **Surface:** `POST /api/attachment-sets/{set_id}/attachments` via `usePostAttachmentSetsAttachmentsBySetId`
- **Inputs:** FormData with file or JSON with URL + title via mutation variables
- **Outputs:** Created attachment record, invalidates attachment-set and kit queries
- **Errors:** Mutation errors surface through `onError` callback, toast notifications
- **Evidence:** Generated hooks file line 411-427

### Set Cover Attachment (Generic)

- **Surface:** `PUT /api/attachment-sets/{set_id}/cover` via `usePutAttachmentSetsCoverBySetId`
- **Inputs:** `{ path: { set_id: number }, body: { attachment_id: number } }`
- **Outputs:** Cover schema response, invalidates attachment-set, part, and kit queries
- **Errors:** Mutation errors shown via toast
- **Evidence:** Generated hooks file line 520-535

### Remove Cover Attachment (Generic)

- **Surface:** `DELETE /api/attachment-sets/{set_id}/cover` via `useDeleteAttachmentSetsCoverBySetId`
- **Inputs:** `{ path: { set_id: number } }`
- **Outputs:** Cover schema response with null values, invalidates queries
- **Errors:** Mutation errors shown via toast
- **Evidence:** Generated hooks file line 490-508

### Delete Attachment (Generic)

- **Surface:** `DELETE /api/attachment-sets/{set_id}/attachments/{attachment_id}` via `useDeleteAttachmentSetsAttachmentsBySetIdAndAttachmentId`
- **Inputs:** `{ path: { set_id: number, attachment_id: number } }`
- **Outputs:** Void, invalidates attachment-set and parent entity queries
- **Errors:** Mutation errors shown via toast
- **Evidence:** Generated hooks file line 432-447

### Query Invalidation Strategy

After any attachment mutation:
1. Invalidate attachment-set queries: `['getAttachmentSetsAttachmentsBySetId']`, `['getAttachmentSetsCoverBySetId']`
2. Invalidate parent entity queries to refresh `cover_url`:
   - For parts: `['getPartsByPartKey']`
   - For kits: `['getKitsByKitId']`, `['getKits']` (for list view)
3. Prefer broad invalidation keys over specific path parameters (simplicity over optimization)

## 5) Algorithms & UI Flows

### Part Attachment Upload Flow

- **Flow:** User uploads attachment on part detail page
- **Steps:**
  1. User clicks "Add Document" button, opens `AddDocumentModal`
  2. User selects file or enters URL, provides title
  3. Modal calls `useDocumentUpload.uploadDocument({ partId, file, url, name })`
  4. Hook sends POST to `/api/parts/{partId}/attachments` (convenience endpoint)
  5. Backend delegates to part's attachment set
  6. On success, invalidate `['getPartsAttachmentsByPartKey']` and `['getPartsByPartKey']`
  7. Modal closes, grid refetches and displays new attachment
- **States/Transitions:** Modal open/closed, upload in-progress/complete/error, grid loading/ready
- **Hotspots:** File upload progress tracking, query invalidation timing, error recovery
- **Evidence:** `use-document-upload.ts:37-191`, `add-document-modal.tsx:77-86`

### Kit Attachment Upload Flow

- **Flow:** User uploads attachment on kit detail page
- **Steps:**
  1. User clicks "Add Document" button in kit attachment section (disabled if archived)
  2. `AddDocumentModal` opens with `attachmentSetId={kit.attachmentSetId}`
  3. User selects file/URL, provides title
  4. Modal calls `useAttachmentSetUpload.uploadAttachment({ attachmentSetId, file, url, name })`
  5. Hook uses `usePostAttachmentSetsAttachmentsBySetId` mutation
  6. On success, invalidate `['getAttachmentSetsAttachmentsBySetId']`, `['getKitsByKitId']`, `['getKits']`
  7. Modal closes, kit attachment grid refetches and displays new attachment
- **States/Transitions:** Archived check on button, modal open/closed, upload pending/success/error
- **Hotspots:** Archived kit check, attachment-set ID extraction, multi-query invalidation
- **Evidence:** New implementation, follows part pattern

### Cover Image Toggle Flow

- **Flow:** User sets/removes cover image from document grid
- **Steps:**
  1. User clicks "Set as Cover" action on document tile
  2. For parts: Hook calls `usePutPartsCoverByPartKey` (via part convenience endpoint wrapper)
  3. For kits: Hook calls `usePutAttachmentSetsCoverBySetId` with kit's `attachmentSetId`
  4. On success, invalidate attachment-set cover query and parent entity query
  5. Grid refetches, tile displays "Cover" badge, card cover image updates
  6. For removal: DELETE instead of PUT, removes cover badge and card image
- **States/Transitions:** Mutation pending/success/error, optimistic UI update possible but not required
- **Hotspots:** Cover URL propagation to list cards, query cache synchronization
- **Evidence:** `cover-image-selector.tsx:23-46`, `use-cover-image.ts:9-15`

### Archived Kit Restriction Flow

- **Flow:** Prevent attachment mutations when kit is archived
- **Steps:**
  1. Kit detail page checks `kit.status === 'archived'`
  2. "Add Document" button is disabled with `aria-disabled="true"` and tooltip
  3. Document tile actions (delete, set cover) are disabled
  4. User sees visual feedback explaining restriction
- **States/Transitions:** Button disabled state, tooltip visibility
- **Hotspots:** Consistent with other archived kit restrictions (BOM editing)
- **Evidence:** `kit-detail.tsx:562-566` shows similar pattern for BOM add button

## 6) Derived State & Invariants

### Cover Attachment State

- **Derived value:** `isCover` boolean on each `DocumentItem`
- **Source:** Compare `document.id` with `currentCoverAttachmentId` (from part/kit entity's `cover_url` or cover query)
- **Writes:** Setting cover updates `cover_url` on parent entity via backend, clearing cover sets it to null
- **Guards:** Cover attachment ID must reference an existing attachment in the set
- **Invariant:** At most one attachment per set can be the cover; `cover_url` on parent entity must match the cover attachment's URL
- **Evidence:** `part-document-grid.tsx:31-33`, `document-transformers` utility referenced

### Attachment Grid Refetch Trigger

- **Derived value:** Grid re-renders when attachment query or document key changes
- **Source:** TanStack Query data from `useGetAttachmentSetsAttachmentsBySetId` or part convenience hook
- **Writes:** Mutations invalidate queries, triggering refetch
- **Guards:** Query enabled only when entity ID and attachment set ID are available
- **Invariant:** Grid always reflects latest attachment set state after successful mutation
- **Evidence:** `part-document-grid.tsx:24`, `use-part-documents.ts:10-13`

### Document Upload Progress State

- **Derived value:** Upload progress percentage and uploading boolean
- **Source:** Local state in `useDocumentUpload` hook, updated during fetch lifecycle
- **Writes:** Progress updates trigger state changes that flow to modal UI
- **Guards:** Progress resets to 0 on modal open, cleaned up on success/error
- **Invariant:** `isUploading` is true only during active fetch, progress is 0-100
- **Evidence:** `use-document-upload.ts:8-13,64-140`

### Archived Kit Interaction State

- **Derived value:** Attachment mutation buttons disabled when `kit.status === 'archived'`
- **Source:** Kit detail entity status field
- **Writes:** No writes; read-only guard on UI interactions
- **Guards:** All mutation actions (add, delete, set cover) check archived status
- **Invariant:** Archived kits cannot modify attachments; UI prevents attempts
- **Evidence:** `kit-detail.tsx:562-566` shows pattern for BOM editing

## 7) State Consistency & Async Coordination

### Query Invalidation Coordination

- **Source of truth:** TanStack Query cache for attachment-set data and parent entity data
- **Coordination:** Mutation success handlers invalidate both attachment-set queries and parent entity queries to ensure `cover_url` is refreshed
- **Async safeguards:** Mutations use TanStack Query's built-in retry and error handling; queries auto-refetch on window focus
- **Instrumentation:** No new instrumentation events required for this refactor (existing list loading events cover queries)
- **Evidence:** `use-document-upload.ts:143-148` shows current invalidation pattern

### Modal State Cleanup

- **Source of truth:** Local modal state (`isOpen`, `document` state)
- **Coordination:** Modal unmounts completely when closed (see `add-document-modal.tsx:27-30`), ensuring clean slate on next open
- **Async safeguards:** Upload progress state cleaned up with timeout after success/error
- **Instrumentation:** No test instrumentation required for modal state (covered by form submission events if added)
- **Evidence:** `add-document-modal.tsx:27-30,66-71`

### Part/Kit Entity Query Coordination

- **Source of truth:** Part/kit detail query data includes `attachmentSetId` and `coverUrl`
- **Coordination:** Attachment hooks depend on entity query success to obtain `attachmentSetId`
- **Async safeguards:** Attachment queries enabled only when `attachmentSetId` is available
- **Instrumentation:** Existing `useListLoadingInstrumentation` for part/kit detail queries
- **Evidence:** `part-details.tsx:82-85` shows part query, hook will extract `attachmentSetId`

## 8) Errors & Edge Cases

### Missing Attachment Set ID

- **Failure:** Part or kit entity missing `attachmentSetId` field
- **Surface:** Attachment section of detail page
- **Handling:** Disable attachment management, show error message or hide section
- **Guardrails:** Type guards on entity data, fallback UI for missing data
- **Evidence:** Should not occur with updated backend, but defensive coding required

### Upload Validation Failure

- **Failure:** File too large, invalid file type, or invalid URL format
- **Surface:** `AddDocumentModal` during submission
- **Handling:** Show validation error inline in modal, prevent submission
- **Guardrails:** `validateFile` utility, URL validation before fetch
- **Evidence:** `use-document-upload.ts:47-60`

### Network Error During Upload

- **Failure:** Fetch fails due to network issue or server error
- **Surface:** Upload progress in modal
- **Handling:** Show error toast with retry option, reset modal state
- **Guardrails:** Try-catch around fetch, error parsing utility
- **Evidence:** `use-document-upload.ts:165-189`

### Archived Kit Mutation Attempt

- **Failure:** User attempts to modify attachments on archived kit
- **Surface:** Kit attachment section buttons
- **Handling:** Buttons disabled with tooltip explaining restriction
- **Guardrails:** `kit.status === 'archived'` check on all mutation buttons
- **Evidence:** New implementation, follows `kit-detail.tsx:562-566` pattern

### Query Invalidation Race Condition

- **Failure:** Rapid mutations cause queries to invalidate while refetch is in progress
- **Surface:** Attachment grid and parent entity UI
- **Handling:** TanStack Query's built-in deduplication handles concurrent refetches
- **Guardrails:** Use broad query key invalidation to avoid stale partial updates
- **Evidence:** Relying on framework behavior, no custom handling needed

### Cover Attachment Deleted

- **Failure:** Current cover attachment is deleted
- **Surface:** Part/kit card and detail page
- **Handling:** Backend automatically clears `cover_url` on parent entity, frontend reflects this after query refetch
- **Guardrails:** Parent entity query invalidation ensures `cover_url` is refreshed
- **Evidence:** Backend change brief confirms automatic cover clearing

## 9) Observability / Instrumentation

### Attachment Query Loading Events

- **Signal:** Existing `ListLoading` event for attachment list queries
- **Type:** Instrumentation event from `useListLoadingInstrumentation`
- **Trigger:** When attachment query status/fetchStatus changes
- **Labels:** `scope: 'parts.detail.documents'` or `'kits.detail.documents'`, status, error details
- **Consumer:** Playwright wait helpers, test assertions
- **Evidence:** Consider adding if tests need to wait for attachment list load; may not be necessary if covered by parent entity ready event

### Document Upload Form Events

- **Signal:** Form submission events for document upload (if added)
- **Type:** `trackFormSubmit`, `trackFormSuccess`, `trackFormError` instrumentation
- **Trigger:** On upload start, success, and error
- **Labels:** `formId: 'DocumentUpload'`, entity type (part/kit), attachment type (file/url)
- **Consumer:** Playwright form submission helpers
- **Evidence:** May add if tests require fine-grained upload tracking; evaluate during test authoring

### Cover Toggle Events

- **Signal:** No new events planned
- **Type:** N/A - covered by parent entity query refetch events
- **Trigger:** N/A
- **Labels:** N/A
- **Consumer:** Tests can assert on cover state after waiting for entity query ready event
- **Evidence:** Existing instrumentation sufficient

Note: Instrumentation scope will be finalized during test authoring. Prefer reusing existing instrumentation (list loading, form events) over creating new attachment-specific events.

## 10) Lifecycle & Background Work

### Upload Progress Cleanup

- **Hook/Effect:** `useDocumentUpload` internal state cleanup
- **Trigger cadence:** Timeout 2s after upload success, 5s after error
- **Responsibilities:** Remove upload progress entry from state map to prevent memory leaks
- **Cleanup:** Timeout cleared on component unmount if modal closes early
- **Evidence:** `use-document-upload.ts:150-157,180-187`

### Object URL Cleanup

- **Hook/Effect:** `useAddDocumentModal` preview URL revocation
- **Trigger cadence:** When file changes or modal closes
- **Responsibilities:** Revoke object URLs created for image previews to free memory
- **Cleanup:** Cleanup handled in effect and on document state change
- **Evidence:** `use-add-document-modal.ts:130-134`, `add-document-modal.tsx:172-173`

### Query Refetch on Window Focus

- **Hook/Effect:** TanStack Query default refetchOnWindowFocus behavior
- **Trigger cadence:** When browser tab regains focus
- **Responsibilities:** Refetch attachment-set and parent entity queries to ensure data freshness
- **Cleanup:** Automatic via TanStack Query lifecycle
- **Evidence:** Framework default behavior, no custom implementation needed

No polling or background sync required for attachment management.

## 11) Security & Permissions

### Archived Kit Mutation Prevention

- **Concern:** Prevent unauthorized modification of archived kit attachments
- **Touchpoints:** Kit attachment section buttons, mutation hooks
- **Mitigation:**
  - **UI layer (UX convenience):** Disables mutation buttons when `kit.status === 'archived'` to prevent user confusion
  - **Backend layer (security enforcement):** Backend enforces archived restriction and returns 403/409 for unauthorized mutations
- **Residual risk:** Low - UI guards can theoretically be bypassed via direct API calls or browser dev tools, but backend enforcement prevents actual data modification. UI guards are UX optimization only.
- **Evidence:** Backend change brief states restriction; UI will implement matching guards following pattern at `kit-detail.tsx:562-566`
- **Test coverage:** Include test scenario verifying backend rejection of attachment mutation on archived kit (if backend returns error, UI should show appropriate message)

Note: No other security changes required. File upload validation and authorization are handled by existing backend logic.

## 12) UX / UI Impact

### Kit Detail Page - Attachment Section

- **Entry point:** Bottom of kit detail page, after BOM card
- **Change:** Add new "Documents" card section with document grid, "Add Document" button, and media viewer
- **User interaction:** Users can upload, view, delete attachments, and set cover images (disabled when archived)
- **Dependencies:** Kit entity with `attachmentSetId`, generic attachment hooks
- **Evidence:** Part detail page has similar section (`part-details.tsx` references document grid and modal)

### Kit List Card - Cover Image

- **Entry point:** Kit overview page, each kit card
- **Change:** Display cover image using `CoverImageDisplay` component (similar to part cards)
- **User interaction:** Cover image shown alongside kit name and metadata, no interaction
- **Dependencies:** Kit summary with `coverUrl` field
- **Evidence:** `part-card.tsx:64-72` shows cover image usage, `kit-card.tsx:47-102` shows current layout without cover

### Add Document Modal - Entity Agnostic

- **Entry point:** "Add Document" button on part or kit detail page
- **Change:** Modal accepts `attachmentSetId` parameter (optionally with `entityType` for context)
- **User interaction:** User experience unchanged; modal works identically for parts and kits
- **Dependencies:** Generic upload hook that accepts `attachmentSetId`
- **Evidence:** `add-document-modal.tsx:14-26` shows current part-specific props

### Cover Image Selector - Entity Agnostic

- **Entry point:** "Select Cover" button on part or kit detail page (if feature is exposed)
- **Change:** Selector accepts `attachmentSetId` instead of `partId`
- **User interaction:** User experience unchanged; selector works identically for parts and kits
- **Dependencies:** Generic cover hooks
- **Evidence:** `cover-image-selector.tsx:9-14` shows current part-specific props

### Archived Kit Indicator

- **Entry point:** Kit attachment section "Add Document" button and document tile actions
- **Change:** Disabled state with tooltip "Archived kits cannot be edited"
- **User interaction:** Users see disabled buttons and understand restriction via tooltip
- **Dependencies:** Kit status check
- **Evidence:** `kit-detail.tsx:565-566` shows similar pattern for BOM add button

## 13) Deterministic Test Plan

### Test Factory Extensions

**Existing `AttachmentTestFactory` methods (for parts via convenience endpoints):**
- `createUrl(partKey, { title?, url?, previewText? })` - Create URL attachment
- `createBinary(partKey, { title?, filename?, contentType?, fileContents? })` - Create file attachment
- `list(partKey)` - List attachments for part
- `get(partKey, attachmentId)` - Get specific attachment
- `delete(partKey, attachmentId)` - Delete attachment
- `getCover(partKey)` - Get current cover
- `setCover(partKey, attachmentId)` - Set cover
- `clearCover(partKey)` - Remove cover

**New methods needed for kits (via attachment-set endpoints):**
```typescript
// Add to AttachmentTestFactory class:

async createUrlForKit(kitId: number, options: CreateUrlAttachmentOptions = {}): Promise<AttachmentResponse> {
  // First get kit to obtain attachment_set_id
  // Then POST to /api/attachment-sets/{set_id}/attachments
}

async createBinaryForKit(kitId: number, options: CreateBinaryAttachmentOptions = {}): Promise<AttachmentResponse> {
  // Same pattern: get kit, then use attachment-set endpoint
}

async listForKit(kitId: number): Promise<AttachmentListItem[]> {
  // GET /api/attachment-sets/{set_id}/attachments
}

async getForKit(kitId: number, attachmentId: number): Promise<AttachmentResponse> {
  // GET /api/attachment-sets/{set_id}/attachments/{attachment_id}
}

async deleteForKit(kitId: number, attachmentId: number): Promise<void> {
  // DELETE /api/attachment-sets/{set_id}/attachments/{attachment_id}
}

async getCoverForKit(kitId: number): Promise<CoverResponse> {
  // GET /api/attachment-sets/{set_id}/cover
}

async setCoverForKit(kitId: number, attachmentId: number): Promise<CoverResponse> {
  // PUT /api/attachment-sets/{set_id}/cover
}

async clearCoverForKit(kitId: number): Promise<void> {
  // DELETE /api/attachment-sets/{set_id}/cover
}

// Helper to get attachment_set_id from kit
private async getKitAttachmentSetId(kitId: number): Promise<number> {
  const { data } = await this.client.GET('/api/kits/{kit_id}', { params: { path: { kit_id: kitId } } });
  return data.attachment_set_id;
}
```

### Page Object Structure

**Existing `DocumentGridPage` (reuse for both parts and kits):**
- Location: `tests/support/page-objects/document-grid-page.ts`
- Test IDs: `parts.documents.grid`, `parts.documents.modal`, etc.
- Methods: `documentTileById()`, `createLinkDocument()`, `deleteDocument()`, `setAsCover()`, `expectCoverState()`, `waitForAttachmentCount()`

**New `KitDocumentGridPage` (extend pattern for kits):**
```typescript
// tests/support/page-objects/kit-document-grid-page.ts
export class KitDocumentGridPage extends BasePage {
  readonly gridRoot: Locator;
  readonly modal: Locator;
  // ... same structure as DocumentGridPage but with kit-specific test IDs:
  // kits.detail.documents.grid, kits.detail.documents.modal, etc.

  constructor(page: Page) {
    super(page);
    this.gridRoot = page.getByTestId('kits.detail.documents.grid');
    this.modal = page.getByTestId('kits.detail.documents.modal');
    // ...
  }

  // Methods accept kitId instead of partKey for API response waiting
  async createLinkDocument(url: string, name: string, options?: { kitId?: number }): Promise<void> { ... }
  async deleteDocument(attachmentId: number, options?: { kitId?: number }): Promise<void> { ... }
  async setAsCover(attachmentId: number, options?: { kitId?: number }): Promise<void> { ... }
}
```

**Fixture registration:**
```typescript
// tests/support/fixtures.ts - add:
kitsDocuments: KitDocumentGridPage;
// ...
kitsDocuments: async ({ page }, use) => {
  await use(new KitDocumentGridPage(page));
},
```

### Test Wait Strategy

Tests will wait for async operations using:
1. **API response waiting:** Page object methods wait for specific HTTP responses (e.g., POST to `/api/attachment-sets/{set_id}/attachments`)
2. **Backend state polling:** Use `testData.attachments.listForKit(kitId)` to poll and verify state changes
3. **Toast notifications:** Use `toastHelper.waitForToastWithText()` for user feedback confirmation
4. **Existing instrumentation:** Wait on `ListLoading` events for parent entity queries if needed

**Example test pattern (from existing part tests):**
```typescript
// Wait for API response + backend state
await kitsDocuments.createLinkDocument(url, title, { kitId: kit.id });
await expect.poll(async () => (await testData.attachments.listForKit(kit.id)).length).toBe(1);
```

### Part Attachment Workflows (Modified)

- **Surface:** Part detail page attachment section
- **Scenarios:**
  - Given part detail page loaded, When user uploads file attachment, Then attachment appears in grid and queries refetch
  - Given part detail page loaded, When user uploads URL attachment, Then attachment appears in grid with preview
  - Given part with attachments, When user sets cover image, Then cover badge appears on tile and part card shows cover
  - Given part with cover, When user removes cover, Then cover badge removed and part card shows placeholder
  - Given part with attachment, When user deletes attachment, Then attachment removed from grid
- **Instrumentation/Hooks:** `data-testid="parts.documents.grid"`, `data-testid="parts.documents.modal"`, API response waiting per page object methods
- **Gaps:** None - full coverage of refactored implementation
- **Evidence:** Existing tests at `tests/e2e/parts/part-documents.spec.ts` will verify functionality with refactored hooks

### Kit Attachment Workflows (New)

- **Surface:** Kit detail page attachment section
- **Scenarios:**
  - Given active kit detail page loaded, When user uploads file attachment, Then attachment appears in grid and kit queries refetch
  - Given active kit detail page loaded, When user uploads URL attachment, Then attachment appears in grid
  - Given kit with attachments, When user sets cover image, Then cover badge appears on tile and kit card shows cover
  - Given kit with cover, When user removes cover, Then cover badge removed and kit card shows placeholder
  - Given kit with attachment, When user deletes attachment, Then attachment removed from grid
  - Given archived kit detail page, When user views attachment section, Then "Add Document" button is disabled
  - Given archived kit with attachments, When user views document tiles, Then delete and cover actions are disabled
- **Instrumentation/Hooks:** `data-testid="kits.detail.documents.grid"`, `data-testid="kits.detail.documents.modal"`, API response waiting
- **Gaps:** None - full coverage of new kit attachment feature
- **Evidence:** New tests following existing part attachment test patterns from `tests/e2e/parts/part-documents.spec.ts`

### Kit List Cover Display (New)

- **Surface:** Kit overview page cards
- **Scenarios:**
  - Given kits with cover images, When overview page loads, Then kit cards display cover images
  - Given kit without cover, When overview page loads, Then kit card shows placeholder
- **Instrumentation/Hooks:** `data-testid="kits.overview.card"` with `data-kit-id` attribute for filtering, wait on kits list query
- **Gaps:** None - verify cover display in list view
- **Evidence:** Similar to existing part card cover tests at `tests/e2e/specific/cover-presence.spec.ts`

## 14) Implementation Slices

### Slice 1: Generic Attachment Hooks

- **Goal:** Create reusable attachment-set hooks that work for any entity type
- **Touches:**
  - `src/hooks/use-attachment-set-documents.ts` (new) - fetch attachments via attachment-set endpoint
  - `src/hooks/use-attachment-set-upload.ts` (new) - upload to attachment-set endpoint
  - `src/hooks/use-attachment-set-cover.ts` (new) - set/clear cover via attachment-set endpoint
- **Dependencies:** Generated API client hooks must be available
- **Verification:** Hooks can be unit tested with mock query client; verify query keys match expected patterns

### Slice 2: Refactor Part Attachment Implementation

- **Goal:** Update part attachment hooks and components to work with new API
- **Touches:**
  - `src/hooks/use-part-documents.ts` - refactor to fetch via generated attachment-set hooks (the part returns `attachment_set_id`)
  - `src/hooks/use-cover-image.ts` - refactor to use attachment-set cover hooks
  - `src/hooks/use-document-upload.ts` - update query invalidation to include attachment-set keys; maintain part convenience endpoint for upload
  - `src/components/parts/part-document-grid.tsx` - pass `attachmentSetId` from part to hooks
- **Dependencies:** Slice 1 complete, part entity includes `attachment_set_id` in response
- **Verification:** Existing part attachment tests at `tests/e2e/parts/part-documents.spec.ts` must pass

### Slice 3: Generalize Upload Modal

- **Goal:** Make upload modal support both part convenience endpoints and attachment-set endpoints
- **Touches:**
  - `src/hooks/use-add-document-modal.ts` - accept either `partId` OR `attachmentSetId` (mutually exclusive)
  - `src/components/documents/add-document-modal.tsx` - update props interface for backward compatibility
  - `src/components/documents/cover-image-selector.tsx` - accept `attachmentSetId` prop
- **Dependencies:** Slice 1 and 2 complete
- **Props interface design:**
  ```typescript
  interface AddDocumentModalProps {
    // For backward compatibility with parts:
    partId?: string;
    // For kits and future entities:
    attachmentSetId?: number;
    // Exactly one must be provided. Validation throws if both or neither provided.
    // When partId is provided, upload uses part convenience endpoint.
    // When attachmentSetId is provided, upload uses attachment-set endpoint.
    // ... existing props (isOpen, onClose, etc.)
  }
  ```

### Slice 4: Add Kit Attachment Support

- **Goal:** Implement attachment management for kits
- **Touches:**
  - `src/types/kits.ts` - add `attachmentSetId: number` and `coverUrl: string | null` to `KitSummary` and `KitDetail` interfaces
  - `src/hooks/use-kits.ts` - map `attachment_set_id` and `cover_url` from API to camelCase
  - `src/hooks/use-kit-detail.ts` - map `attachment_set_id` and `cover_url` from API to camelCase
  - `src/components/kits/kit-attachment-section.tsx` (new) - attachment grid, upload modal, media viewer for kits
  - `src/components/kits/kit-detail.tsx` - add attachment section at bottom of detail page, disable when archived
  - `src/components/kits/kit-card.tsx` - add cover image display using `CoverImageDisplay` component
- **Dependencies:** Slice 1, 2, and 3 complete
- **Test IDs:** `kits.detail.documents.grid`, `kits.detail.documents.modal`, `kits.detail.documents.modal.url`, etc.
- **Verification:** Manual testing of upload, delete, cover toggle, archived restriction

### Slice 5: Test Infrastructure & Playwright Tests

- **Goal:** Update test infrastructure and add/update tests for attachment workflows
- **Touches:**
  - `tests/api/factories/attachment-factory.ts` - add kit methods (`createUrlForKit`, `listForKit`, `setCoverForKit`, etc.)
  - `tests/support/page-objects/kit-document-grid-page.ts` (new) - page object for kit attachment grid
  - `tests/support/fixtures.ts` - register `kitsDocuments` fixture
  - `tests/e2e/parts/part-documents.spec.ts` - verify existing tests still pass (no changes expected)
  - `tests/e2e/kits/kit-attachments.spec.ts` (new) - new tests for kit attachment workflows
  - `tests/e2e/kits/kit-cover-presence.spec.ts` (new) - tests for kit card cover display
- **Dependencies:** All implementation slices complete
- **Verification:** `pnpm playwright test tests/e2e/parts/part-documents.spec.ts tests/e2e/kits/kit-attachments.spec.ts` passes

## 15) Risks & Open Questions

### Risks

- **Risk:** Part convenience endpoints may not exist or may have changed behavior
- **Impact:** Part attachment upload/management broken
- **Mitigation:** Backend change brief confirms endpoints remain as stable wrappers. Test factory already uses these endpoints successfully. Verify endpoints exist in openapi schema before starting; fall back to attachment-set endpoints if needed.
- **Status:** LOW RISK - verified endpoints exist and are used by test factory

- **Risk:** Query invalidation timing could cause stale UI if cover URL doesn't refresh immediately
- **Impact:** Cover image on card doesn't update until manual refresh
- **Mitigation:** Verified that `invalidateQueries({ queryKey: ['getKits'] })` matches all status-filtered kit list queries due to TanStack Query prefix matching. Existing code at `use-kit-create.ts:41` uses this pattern. Invalidate both attachment-set and parent entity queries; test thoroughly.
- **Status:** LOW RISK - query invalidation pattern verified

- **Risk:** Archived kit restriction may be inconsistent across attachment actions
- **Impact:** Users could bypass restriction on some actions
- **Mitigation:** Apply archived check to all mutation buttons (add, delete, set cover). Backend enforcement is the security layer; UI guards are UX convenience only. Add test scenario verifying backend rejection if user somehow bypasses UI.
- **Status:** MEDIUM RISK - requires careful implementation but backend provides safety net

- **Risk:** Generic hooks may introduce breaking changes to existing part attachment flows
- **Impact:** Regression in part attachment functionality
- **Mitigation:** Implement slice 2 with careful attention to existing behavior. Run existing Playwright tests at `tests/e2e/parts/part-documents.spec.ts` after each change. Use TypeScript to catch interface mismatches.
- **Status:** MEDIUM RISK - mitigated by existing test coverage

- **Risk:** Playwright tests may be difficult to write without proper instrumentation
- **Impact:** Tests may be flaky or require brittle timeouts
- **Mitigation:** Use existing patterns from part attachment tests: API response waiting in page objects, backend state polling via test factories, toast helpers. No new instrumentation events required based on existing test patterns.
- **Status:** LOW RISK - existing patterns are proven

### Open Questions (Resolved)

- **Q:** Are part convenience endpoints stable or deprecated?
- **A:** STABLE - backend change brief confirms they remain as convenience wrappers. Frontend generated hooks were removed but endpoints remain.

- **Q:** Will query invalidation refresh kit list cover images with status filters?
- **A:** YES - TanStack Query prefix matching ensures `invalidateQueries({ queryKey: ['getKits'] })` matches all filtered queries.

- **Q:** What test infrastructure is needed?
- **A:** Extend `AttachmentTestFactory` with kit methods, create `KitDocumentGridPage` page object, register `kitsDocuments` fixture.

## 16) Confidence

**Confidence:** High — The refactor follows clear patterns from existing part attachment implementation, uses well-defined backend API contracts, and breaks work into logical slices. Key risks have been researched and mitigated:
- Part convenience endpoints verified stable
- Query invalidation pattern verified working
- Test infrastructure patterns documented
- Page object and factory extensions specified

The main complexity is in generalizing hooks while maintaining backward compatibility, which is achievable with careful prop handling and TypeScript enforcement. The new kit attachment feature follows established part patterns. Query invalidation strategy is intentionally simple per the brief's guidance.

