# CAS Migration - Frontend Technical Plan

## 0) Research Log & Findings

**Searched Areas:**
- `src/lib/utils/thumbnail-urls.ts` - Contains obsolete URL construction functions
- `src/components/documents/cover-image-display.tsx` - Uses `useCoverAttachment` hook and constructs thumbnail URLs
- `src/components/ui/thumbnail.tsx` - Constructs thumbnail URLs and has PDF fallback logic
- `src/lib/utils/document-transformers.ts` - Transforms API documents to UI models using URL construction
- `src/hooks/use-cover-image.ts` - Fetches cover attachment from removed endpoint
- `src/hooks/use-part-documents.ts` - Maps API attachments to UI documents
- Components passing `hasCoverAttachment`: `part-card.tsx`, `part-details.tsx`, `ai-duplicate-card.tsx`, `part-location-card.tsx`, `cover-image-selector.tsx`, `part-document-grid.tsx`
- Existing Playwright specs: `part-documents.spec.ts`, `cover-presence.spec.ts`

**Key Findings:**
- Backend has migrated to CAS (Content-Addressable Storage) where URLs are provided by the API instead of being constructed client-side
- Multiple endpoints have been removed: cover thumbnail, attachment download, attachment thumbnail, cover details
- Schema changes: `PartWithTotalSchema` now has `cover_url` instead of `has_cover_attachment`; `PartAttachmentResponseSchema` now has `attachment_url` and `preview_url` instead of `s3_key` and `has_preview`
- PDF preview handling moves to server-side - server provides `preview_url` for PDFs
- URL parameters must be appended carefully (check for existing `?`)
- `pdfIconSvg` is still needed in `document-tile.tsx` (fallback when no preview) and `add-document-modal.tsx` (client-side preview during upload)

## 1) Intent & Scope

**User intent**

Adapt the frontend to the backend's Content-Addressable Storage (CAS) migration by consuming CAS URLs provided directly by the API instead of constructing URLs to removed endpoints. This eliminates client-side URL construction and simplifies thumbnail/preview handling.

**Prompt quotes**

"The backend has migrated to a Content-Addressable Storage (CAS) system for all blob storage. This requires frontend changes to use the new URL structure provided by the API instead of constructing URLs to now-removed endpoints."

"**Removed Endpoints**: `GET /api/parts/<key>/cover/thumbnail`, `GET /api/parts/<key>/attachments/<id>/download`, `GET /api/parts/<key>/attachments/<id>/thumbnail`, `GET /api/parts/{part_key}/cover` (cover details endpoint)"

"**Schema Changes**: `PartWithTotalSchema` removed `has_cover_attachment: boolean`, added `cover_url: string | null`; `PartAttachmentResponseSchema` removed `s3_key` and `has_preview`, added `attachment_url` and `preview_url`"

**In scope**

- Regenerate API types from updated backend schema
- Remove obsolete URL construction functions from `thumbnail-urls.ts`
- Add new utility functions to append query parameters to CAS URLs
- Update `CoverImageDisplay` to accept `coverUrl` prop and use base URL with query params
- Update `Thumbnail` component to accept `previewUrl` prop and remove PDF/image branching
- Update `document-transformers.ts` to use `preview_url` and `attachment_url` from API
- Simplify/remove `useCoverAttachment` hook (cover endpoint no longer exists)
- Update `usePartDocuments` hook to map new schema fields
- Update all components passing `hasCoverAttachment` to pass `coverUrl` instead
- Remove `pdfIconSvg` from `thumbnail.tsx` and `cover-image-display.tsx` (keep in `document-tile.tsx` and `add-document-modal.tsx`)
- Update Playwright tests to verify new URL structure

**Out of scope**

- Backend CAS implementation (already complete)
- Changes to upload/mutation logic (covered by backend API)
- Migration of existing S3 blobs to CAS (backend responsibility)
- Performance optimization of CAS URL caching

**Assumptions / constraints**

- Backend schema changes are already deployed and API regeneration will produce correct types
- All existing cover images and attachments will have `cover_url`/`preview_url`/`attachment_url` populated by backend
- CAS URLs support `?thumbnail=<size>` and `&disposition=attachment` query parameters
- Server provides preview URLs for all previewable content types (including PDFs)
- No breaking changes to mutation endpoints (upload, delete, set cover)
- Existing `data-testid` attributes remain stable for Playwright tests

## 2) Affected Areas & File Map

- **Area**: `src/lib/utils/thumbnail-urls.ts`
  - **Why**: Remove obsolete URL construction functions; add query parameter utilities
  - **Evidence**: Lines 13-57 contain `getThumbnailUrl`, `getCoverThumbnailUrl`, `getDownloadUrl`, `getViewUrl`, `generateSrcSet`, `generateCoverSrcSet` which construct URLs to removed endpoints
  - **New utilities to add**:
    - `appendThumbnailParam(baseUrl: string | null, size: number): string | null` — Check if `baseUrl` contains `?`; append `?thumbnail=<size>` or `&thumbnail=<size>` accordingly. Return `null` if `baseUrl` is `null`.
    - `generateSrcSetFromUrl(baseUrl: string | null): string` — Map over `THUMBNAIL_SIZES` entries, call `appendThumbnailParam` for each size, build `<url> <size>w` strings joined by `, `. Return empty string if `baseUrl` is `null`.
    - `appendDispositionParam(baseUrl: string | null, disposition: 'inline' | 'attachment'): string | null` — Similar pattern for download URLs.

- **Area**: `src/components/documents/cover-image-display.tsx`
  - **Why**: Replace `useCoverAttachment` + `hasCoverAttachment` with `coverUrl` prop; use base URL with query params for thumbnails
  - **Evidence**: Line 2 imports `useCoverAttachment`; line 3 imports `getCoverThumbnailUrl, generateCoverSrcSet`; line 10 accepts `hasCoverAttachment?` prop; line 23 calls `useCoverAttachment(partId, hasCoverAttachment)`; lines 62-74 have PDF-specific handling to remove
  - **Retain `showPlaceholder` prop**: Existing behavior preserved (default `false`, returns `null` if `coverUrl` is null and `showPlaceholder=false`). No change to call sites that rely on this behavior.

- **Area**: `src/components/ui/thumbnail.tsx`
  - **Why**: Accept `previewUrl` prop instead of `partKey`/`attachmentId`; remove PDF/image branching (server provides preview for all)
  - **Evidence**: Lines 6-7 accept `partKey, attachmentId` props; line 2 imports `getThumbnailUrl, generateSrcSet`; lines 49-58 contain PDF/hasImage branching logic to remove; line 4 imports `pdfIconSvg` to remove

- **Area**: `src/lib/utils/document-transformers.ts`
  - **Why**: Use `attachment.preview_url` and `attachment.attachment_url` instead of constructing URLs
  - **Evidence**: Line 1 imports `getThumbnailUrl, getViewUrl`; lines 40-44 call `getThumbnailUrl(partId, doc.id, 'medium')` to construct preview URLs; line 52 calls `getViewUrl(partId, doc.id)` for asset URLs

- **Area**: `src/hooks/use-cover-image.ts`
  - **Why**: **Simplify** (not remove) - remove `useCoverAttachment` query hook but **retain** `useSetCoverAttachment` and `useRemoveCoverAttachment` mutation exports
  - **Evidence**: Lines 1-5 import and lines 7-21 define `useCoverAttachment` which calls `useGetPartsCoverByPartKey` from removed endpoint; lines 23-29 define mutation hooks which remain valid
  - **Decision**: The file stays but `useCoverAttachment` export is removed. Components needing cover state will derive it from `part.cover_url` or `part.cover_attachment_id`. Mutation hooks continue to work unchanged.

- **Area**: `src/hooks/use-part-documents.ts`
  - **Why**: Map `preview_url` and `attachment_url` to document model instead of `has_preview` and constructed URLs
  - **Evidence**: Line 27 maps `has_preview: attachment.has_preview` which is removed from schema; needs to map `preview_url` and `attachment_url` instead

- **Area**: `src/components/parts/part-card.tsx`
  - **Why**: Pass `coverUrl` instead of `hasCoverAttachment` to `CoverImageDisplay`
  - **Evidence**: Line 63 passes `hasCoverAttachment={part.has_cover_attachment}`; needs to pass `coverUrl={part.cover_url ?? null}`

- **Area**: `src/components/parts/part-details.tsx`
  - **Why**: Pass `coverUrl` instead of `hasCoverAttachment` to `CoverImageDisplay`
  - **Evidence**: Line 253 derives `hasCoverAttachment = Boolean(part?.cover_attachment)`; line 679 passes `hasCoverAttachment={hasCoverAttachment}`; needs to use `cover_url` from part

- **Area**: `src/components/parts/ai-duplicate-card.tsx`
  - **Why**: Pass `coverUrl` instead of `hasCoverAttachment` to `CoverImageDisplay`
  - **Evidence**: Line 82 passes `hasCoverAttachment={false}`; line 124 passes `hasCoverAttachment={!!part.cover_attachment}`; needs to use `cover_url` from part

- **Area**: `src/components/boxes/part-location-card.tsx`
  - **Why**: Pass `coverUrl` instead of `hasCoverAttachment` to `CoverImageDisplay`
  - **Evidence**: Line 28 passes `hasCoverAttachment={part.has_cover_attachment}`; needs to pass `coverUrl={part.cover_url ?? null}`

- **Area**: `src/components/documents/cover-image-selector.tsx`
  - **Why**: Update to work with simplified `useCoverAttachment` or remove dependency
  - **Evidence**: Line 6 imports `useCoverAttachment`; line 12 accepts `hasCoverAttachment?` prop; line 19 calls `useCoverAttachment(partId, hasCoverAttachment)` for current cover state

- **Area**: `src/components/parts/part-document-grid.tsx`
  - **Why**: Pass `coverUrl` instead of `hasCoverAttachment` and update cover attachment logic
  - **Evidence**: Line 4 imports `useCoverAttachment`; line 12 accepts `hasCoverAttachment?` prop; line 25 calls `useCoverAttachment(partId, hasCoverAttachment)` to get cover state

- **Area**: `src/hooks/use-duplicate-part.ts`
  - **Why**: Update to use `cover_url` from part instead of fetching cover attachment
  - **Evidence**: Line 4 imports `useCoverAttachment`; line 13 derives `hasCoverAttachment = Boolean(partQuery.data.cover_attachment)`; line 14 calls `useCoverAttachment(partId, hasCoverAttachment)`

- **Area**: `tests/e2e/parts/part-documents.spec.ts`
  - **Why**: Update expectations to verify CAS URLs instead of old endpoint URLs
  - **Evidence**: Lines 56-59 expect thumbnail URL pattern `/api/parts/${part.key}/attachments/${attachmentId}/thumbnail` which is removed

- **Area**: `tests/e2e/specific/cover-presence.spec.ts`
  - **Why**: Update to verify `cover_url` presence instead of `has_cover_attachment` flag
  - **Evidence**: Lines 30-31 poll for `has_cover_attachment` flag; line 43 listens for cover endpoint requests which is removed

## 3) Data Model / Contracts

- **Entity**: `PartWithTotalSchema` (generated type)
  - **Shape**:
    - **Removed**: `has_cover_attachment: boolean`
    - **Added**: `cover_url: string | null` - Base CAS URL for cover image
  - **Mapping**: Direct pass-through; components will use `cover_url` directly instead of conditional fetch based on `has_cover_attachment`
  - **Evidence**: `docs/features/cas_migration/change_brief.md:18-19`

- **Entity**: `PartAttachmentResponseSchema` (generated type)
  - **Shape**:
    - **Removed**: `s3_key: string | null`, `has_preview: boolean`
    - **Added**: `attachment_url: string | null` - Base CAS URL for attachment, `preview_url: string | null` - Base CAS URL for thumbnail/preview
  - **Mapping**: `usePartDocuments` will map `preview_url` to `previewImageUrl` and `attachment_url` to `assetUrl` in document model
  - **Evidence**: `docs/features/cas_migration/change_brief.md:23-26`

- **Entity**: `DocumentItem` (UI model in `src/types/documents.ts`)
  - **Shape**: No schema change, but data source changes
    - `previewImageUrl: string | null` - Now sourced from `preview_url` API field instead of constructed URL
    - `assetUrl: string` - Now sourced from `attachment_url` API field (or `url` for website type)
  - **Mapping**: `transformApiDocumentsToDocumentItems` will use API-provided URLs instead of constructing them
  - **Evidence**: `src/lib/utils/document-transformers.ts:40-52`

- **Entity**: CAS URL query parameters (runtime string manipulation)
  - **Shape**:
    - `?thumbnail=<size>` or `&thumbnail=<size>` - Request thumbnail at specific size
    - `&disposition=attachment` - Force download instead of inline display
  - **Mapping**: New utility functions will check if URL contains `?` and append with `?` or `&` accordingly
  - **Evidence**: `docs/features/cas_migration/change_brief.md:99-105`

## 4) API / Integration Surface

- **Surface**: Cover attachment endpoint (REMOVED)
  - **Inputs**: `GET /api/parts/{part_key}/cover` (no longer exists)
  - **Outputs**: N/A - endpoint removed
  - **Errors**: N/A - hook will be removed/simplified
  - **Evidence**: `src/hooks/use-cover-image.ts:1-21` calls `useGetPartsCoverByPartKey` which targets removed endpoint

- **Surface**: Part detail endpoint (UNCHANGED)
  - **Inputs**: `GET /api/parts/{part_key}`
  - **Outputs**: Now includes `cover_url: string | null` instead of `has_cover_attachment: boolean`
  - **Errors**: Existing error handling remains; no changes needed
  - **Evidence**: Components currently use `part.has_cover_attachment` or `part.cover_attachment`; will switch to `part.cover_url`

- **Surface**: Attachments list endpoint (UNCHANGED path, schema changed)
  - **Inputs**: `GET /api/parts/{part_key}/attachments`
  - **Outputs**: Each attachment now has `attachment_url` and `preview_url` instead of `s3_key` and `has_preview`
  - **Errors**: Existing error handling remains; no changes needed
  - **Evidence**: `src/hooks/use-part-documents.ts:10-29` consumes this endpoint

- **Surface**: Set cover mutation (UNCHANGED)
  - **Inputs**: `PUT /api/parts/{part_key}/cover` with `{ attachment_id: number }`
  - **Outputs**: Backend returns updated cover state; frontend invalidates part query cache
  - **Errors**: Existing error handling remains; no changes needed
  - **Evidence**: `src/hooks/use-cover-image.ts:23-25` and usage in `part-document-grid.tsx:41-50`

- **Surface**: Remove cover mutation (UNCHANGED)
  - **Inputs**: `DELETE /api/parts/{part_key}/cover`
  - **Outputs**: Backend clears cover; frontend invalidates part query cache
  - **Errors**: Existing error handling remains; no changes needed
  - **Evidence**: `src/hooks/use-cover-image.ts:27-29`

- **Surface**: CAS content delivery (NEW - server-provided URLs)
  - **Inputs**: URLs from `cover_url`, `attachment_url`, `preview_url` with optional `?thumbnail=<size>` or `&disposition=attachment`
  - **Outputs**: Blob content served by CAS system
  - **Errors**: Standard image loading errors; existing `onError` handlers in components will catch failed loads
  - **Evidence**: `src/components/documents/cover-image-display.tsx:86` has existing `onError` handler

## 5) Algorithms & UI Flows

- **Flow**: Display cover image on part card/detail
  - **Steps**:
    1. Component receives `part` object from TanStack Query
    2. Extract `cover_url` from part (null if no cover)
    3. If `cover_url` is null, render placeholder (existing behavior)
    4. If `cover_url` is present, append `?thumbnail=<size>` to construct full thumbnail URL
    5. Pass URL to `<img>` element with `srcSet` for responsive sizing
    6. On error, fall back to placeholder
  - **States / transitions**: `isLoading` → `cover_url === null` (placeholder) or `cover_url !== null` (render image) → `imageError` (fallback placeholder)
  - **Hotspots**: URL parameter appending must check for existing `?` to avoid malformed URLs
  - **Evidence**: `src/components/documents/cover-image-display.tsx:77-90`

- **Flow**: Display attachment thumbnail in document grid
  - **Steps**:
    1. `usePartDocuments` fetches attachments from API
    2. Hook maps `preview_url` to `previewImageUrl` in document model
    3. If `preview_url` is null, document tile shows fallback icon
    4. If `preview_url` is present, append `?thumbnail=<size>` and render in `<img>`
    5. Server handles preview generation for all types (images, PDFs, etc.)
  - **States / transitions**: `attachmentsLoading` → `preview_url === null` (fallback icon) or `preview_url !== null` (render thumbnail)
  - **Hotspots**: Remove client-side PDF vs image logic; trust server to provide preview_url or not
  - **Evidence**: `src/components/ui/thumbnail.tsx:49-78` currently branches on `isPdf` and `hasImage`

- **Flow**: Download or view attachment
  - **Steps**:
    1. User clicks document tile
    2. For websites: open `url` in new tab (unchanged)
    3. For files: use `attachment_url` from document model
    4. For download: append `&disposition=attachment` to force download
    5. For inline view: use base `attachment_url` (or append `&disposition=inline`)
  - **States / transitions**: Click → determine document type → construct appropriate URL → navigate or download
  - **Hotspots**: Check if URL already has query params before appending `&disposition=...`
  - **Evidence**: `src/lib/utils/document-transformers.ts:52` currently constructs view URL

- **Flow**: Set cover attachment
  - **Steps**:
    1. User selects attachment in cover selector modal
    2. Call `PUT /api/parts/{part_key}/cover` with attachment ID
    3. Backend updates cover reference and returns success
    4. Frontend invalidates part query cache
    5. Part refetches with new `cover_url` field populated
    6. Cover image component re-renders with new URL
  - **States / transitions**: Selection → mutation pending → mutation success → cache invalidation → refetch → updated UI
  - **Hotspots**: Ensure cache invalidation triggers cover image refresh; no need to separately fetch cover endpoint
  - **Evidence**: `src/components/parts/part-document-grid.tsx:41-50`

## 6) Derived State & Invariants

- **Derived value**: Thumbnail URL with size parameter
  - **Source**: Base `cover_url` or `preview_url` from API response
  - **Writes / cleanup**: Appended query parameter; no state mutation
  - **Guards**: Must check if URL already contains `?` before appending `?thumbnail=<size>` (use `&thumbnail=<size>` if `?` exists)
  - **Invariant**: URL must be valid; malformed URLs cause image load failure
  - **Evidence**: New utility function in `thumbnail-urls.ts`

- **Derived value**: Document preview availability
  - **Source**: `preview_url !== null` from attachment response
  - **Writes / cleanup**: Maps to `previewImageUrl` in `DocumentItem` model
  - **Guards**: If `preview_url` is null, show fallback icon
  - **Invariant**: Server decides preview availability; client never guesses based on content type
  - **Evidence**: `src/hooks/use-part-documents.ts:27` currently uses `has_preview` boolean

- **Derived value**: Current cover attachment ID
  - **Source**: `cover_attachment.id` or `cover_attachment_id` from part response
  - **Writes / cleanup**: Used to highlight current cover in selector modal
  - **Guards**: May be null if part has no cover
  - **Invariant**: If `cover_url` is non-null, `cover_attachment_id` must be set (backend responsibility)
  - **Evidence**: `src/components/documents/cover-image-selector.tsx:48` uses `coverAttachment?.id`

- **Derived value**: Download URL with disposition
  - **Source**: Base `attachment_url` from API
  - **Writes / cleanup**: Appended `&disposition=attachment` parameter
  - **Guards**: Check for existing query params; ensure valid URL
  - **Invariant**: Disposition parameter controls browser download vs inline display
  - **Evidence**: New utility function to replace `getDownloadUrl`

## 7) State Consistency & Async Coordination

- **Source of truth**: TanStack Query cache for parts and attachments
  - **Coordination**: Part detail query provides `cover_url`; no separate cover endpoint query needed
  - **Async safeguards**: Existing query abort controllers remain; no new async coordination required
  - **Instrumentation**: Existing `useListLoadingInstrumentation` in `part-details.tsx` will continue to emit events; metadata should reflect `cover_url` presence instead of `has_cover_attachment`
  - **Evidence**: `src/components/parts/part-details.tsx:174-197`

- **Source of truth**: Part detail response for cover state
  - **Coordination**: Mutations (set/remove cover) invalidate part query cache; refetch provides updated `cover_url`
  - **Async safeguards**: Mutation success triggers cache invalidation; UI updates automatically via query refetch
  - **Instrumentation**: Toast notifications on mutation success/failure (existing pattern)
  - **Evidence**: Set/remove cover mutations use standard TanStack Query mutation pattern

- **Source of truth**: Attachment list response for document previews
  - **Coordination**: `usePartDocuments` transforms attachment schema to UI document model; components consume transformed model
  - **Async safeguards**: Standard query lifecycle; no special coordination needed
  - **Instrumentation**: No specific instrumentation for attachment list; relies on standard query state
  - **Evidence**: `src/hooks/use-part-documents.ts:15-29`

## 8) Errors & Edge Cases

- **Failure**: CAS URL returns 404 or fails to load
  - **Surface**: `CoverImageDisplay`, `Thumbnail`, `DocumentTile` image elements
  - **Handling**: Existing `onError` handlers show placeholder or fallback icon
  - **Guardrails**: Ensure fallback UI is clear (e.g., "Image unavailable" placeholder)
  - **Evidence**: `src/components/documents/cover-image-display.tsx:86` has `onError={() => setImageError(true)}`

- **Failure**: Part has `cover_url` but URL is malformed
  - **Surface**: Cover image display components
  - **Handling**: Browser will fail to load; `onError` handler shows placeholder
  - **Guardrails**: Log error to console for debugging; show generic placeholder
  - **Evidence**: Standard image error handling pattern

- **Failure**: Attachment has no `preview_url` (e.g., unsupported file type)
  - **Surface**: Document tiles, thumbnail component
  - **Handling**: Show type-appropriate fallback icon (PDF icon for PDFs, generic file icon otherwise)
  - **Guardrails**: `previewImageUrl === null` in document model triggers fallback rendering
  - **Evidence**: `src/components/documents/document-tile.tsx:119-131` shows fallback when `previewImageUrl` is null

- **Failure**: API regeneration produces unexpected schema
  - **Surface**: TypeScript compilation
  - **Handling**: Compilation errors will surface mismatched field names
  - **Guardrails**: Run `pnpm check` after API regeneration to catch type errors
  - **Evidence**: TypeScript strict mode enabled

- **Failure**: URL parameter appending creates malformed URL
  - **Surface**: Utility functions for appending query params
  - **Handling**: Test utility functions to ensure correct `?` vs `&` logic
  - **Guardrails**: Add unit tests or verify manually with various URL formats
  - **Evidence**: New utility functions in `thumbnail-urls.ts`

## 9) Observability / Instrumentation

- **Signal**: Part detail loading instrumentation metadata
  - **Type**: `ListLoading` test event
  - **Trigger**: Part detail query state changes (loading, success, error)
  - **Labels / fields**: `hasCoverAttachment: Boolean(part.cover_attachment)` should change to reflect `cover_url` presence
  - **Consumer**: Playwright tests wait on `parts.detail` scope
  - **Evidence**: `src/components/parts/part-details.tsx:184` includes `hasCoverAttachment` in metadata

- **Signal**: Cover image load success/failure
  - **Type**: Browser image load events (not custom instrumentation)
  - **Trigger**: `<img>` element `onLoad` / `onError`
  - **Labels / fields**: N/A (standard DOM events)
  - **Consumer**: Component state (loading spinner, error placeholder)
  - **Evidence**: `src/components/ui/thumbnail.tsx:31-37` handles image load events

- **Signal**: Mutation success/failure (set/remove cover)
  - **Type**: Toast notification
  - **Trigger**: Mutation completion (success or error)
  - **Labels / fields**: Success/error message
  - **Consumer**: User (visible toast), Playwright `toastHelper.waitForToastWithText`
  - **Evidence**: `src/components/parts/part-document-grid.tsx:48` calls `showException`

- **Signal**: `data-testid` attributes for cover images and thumbnails
  - **Type**: DOM attributes for Playwright selectors
  - **Trigger**: Rendered when component mounts
  - **Labels / fields**: `data-document-id`, `data-part-key`
  - **Consumer**: Playwright selectors in `part-documents.spec.ts`
  - **Evidence**: `src/components/documents/document-tile.tsx:115-116`

## 10) Lifecycle & Background Work

- **Hook / effect**: Image error state reset in `CoverImageDisplay`
  - **Trigger cadence**: When `reloadToken` changes (new image loaded or cache updated)
  - **Responsibilities**: Reset `imageError` state to attempt loading new image
  - **Cleanup**: State reset via `useEffect`; no subscriptions to clean up
  - **Evidence**: `src/components/documents/cover-image-display.tsx:37-40`

- **Hook / effect**: TanStack Query cache invalidation on cover mutation
  - **Trigger cadence**: On mutation success (set/remove cover)
  - **Responsibilities**: Invalidate part detail query to refetch with updated `cover_url`
  - **Cleanup**: Handled by TanStack Query; no manual cleanup
  - **Evidence**: Standard mutation pattern in `use-cover-image.ts:23-29`

- **Hook / effect**: Object URL cleanup in `AddDocumentModal`
  - **Trigger cadence**: When file preview is removed or modal unmounts
  - **Responsibilities**: Revoke object URL to free memory
  - **Cleanup**: `URL.revokeObjectURL(document.preview)` on file removal
  - **Evidence**: `src/components/documents/add-document-modal.tsx:173`

## 11) Security & Permissions

**Not applicable.** This change replaces URL construction logic with server-provided URLs. No new permissions, role checks, or data exposure concerns. CAS URLs are already validated and authorized by the backend.

## 12) UX / UI Impact

- **Entry point**: Part list, part detail, part cards in boxes
  - **Change**: No visual change; cover images continue to display
  - **User interaction**: Identical - users see cover images, thumbnails, and document previews as before
  - **Dependencies**: Backend must provide valid `cover_url` and `preview_url` values
  - **Evidence**: `src/components/parts/part-card.tsx:60-68`

- **Entry point**: Document grid in part detail
  - **Change**: No visual change; thumbnails and previews display as before
  - **User interaction**: Identical - click to view, click to set as cover, click to delete
  - **Dependencies**: Backend `attachment_url` and `preview_url` fields
  - **Evidence**: `src/components/parts/part-document-grid.tsx:79-96`

- **Entry point**: PDF attachments
  - **Change**: Server now generates previews for PDFs; client no longer shows PDF icon in place of thumbnails
  - **User interaction**: PDF thumbnails display if server provides `preview_url`; otherwise fallback icon shows
  - **Dependencies**: Backend PDF preview generation
  - **Evidence**: `src/components/ui/thumbnail.tsx:49-58` (PDF branching to be removed)

- **Entry point**: Cover image selector modal
  - **Change**: Thumbnails source from `preview_url` instead of constructed URLs
  - **User interaction**: Identical - user selects attachment to set as cover
  - **Dependencies**: Simplified `useCoverAttachment` or removal of separate cover fetch
  - **Evidence**: `src/components/documents/cover-image-selector.tsx:98-105`

- **PDF icon retention rationale**:
  - **Keep in `document-tile.tsx`**: Fallback when server provides no `preview_url` (e.g., processing failure, edge case)
  - **Keep in `add-document-modal.tsx`**: Client-side preview during upload before file is sent to server
  - **Remove from `thumbnail.tsx`**: Server now provides `preview_url` for all previewable content including PDFs; component no longer branches on file type
  - **Remove from `cover-image-display.tsx`**: Same reason; server provides `preview_url` or component shows generic placeholder on error

## 13) Deterministic Test Plan

- **Surface**: Part list with cover images
  - **Scenarios**:
    - **Given** a part with a cover attachment, **When** the part list loads, **Then** the cover image should display using the CAS URL from `cover_url` field
    - **Given** a part without a cover attachment, **When** the part list loads, **Then** a placeholder should display
  - **Instrumentation / hooks**: `parts.waitForCards()`, `parts.coverImage(partKey)`, `parts.coverPlaceholder(partKey)`
  - **Gaps**: None - existing test patterns cover this
  - **Evidence**: `tests/e2e/specific/cover-presence.spec.ts:49-59`

- **Surface**: Document thumbnail display
  - **Scenarios**:
    - **Given** an attachment with `preview_url`, **When** document grid loads, **Then** thumbnail image should display with CAS URL
    - **Given** an attachment without `preview_url`, **When** document grid loads, **Then** fallback icon should display
  - **Instrumentation / hooks**: `partsDocuments.documentTileByTitle()`, `partsDocuments.previewImage(attachmentId)`
  - **Gaps**: Test currently expects old thumbnail URL pattern; update to verify CAS URL or verify image loads successfully without checking specific URL
  - **Evidence**: `tests/e2e/parts/part-documents.spec.ts:53-59`

- **Surface**: Set cover attachment workflow
  - **Scenarios**:
    - **Given** a part with documents, **When** user sets an attachment as cover, **Then** backend updates cover reference and part refetches with `cover_url` populated
  - **Instrumentation / hooks**: `partsDocuments.setAsCover()`, `testData.parts.getDetail()` to verify `cover_url` presence
  - **Gaps**: Test currently polls for `cover_attachment_id`; continue using this field (still exists in schema)
  - **Evidence**: `tests/e2e/parts/part-documents.spec.ts:66-79`

- **Surface**: Cover endpoint request tracking
  - **Scenarios**:
    - **Given** the cover endpoint is removed, **When** tests track API requests, **Then** no requests to `/api/parts/{key}/cover` should occur
  - **Instrumentation / hooks**: Response listeners for cover endpoint
  - **Gaps**: Test in `cover-presence.spec.ts` listens for cover endpoint requests; remove this assertion since endpoint no longer exists
  - **Evidence**: `tests/e2e/specific/cover-presence.spec.ts:36-59`

- **Surface**: Part detail cover image display
  - **Scenarios**:
    - **Given** a part with `cover_url`, **When** part detail loads, **Then** cover image should render using CAS URL
    - **Given** a part without `cover_url`, **When** part detail loads, **Then** no cover image should render
  - **Instrumentation / hooks**: `parts.detail` instrumentation scope, existing cover image locators
  - **Gaps**: None - covered by existing detail page tests
  - **Evidence**: `src/components/parts/part-details.tsx:677-682`

- **Surface**: Part detail instrumentation metadata
  - **Scenarios**:
    - **Given** a part with `cover_url`, **When** part detail loads, **Then** `ListLoading` event for `parts.detail` scope should include metadata with `coverUrl` (non-null string) instead of `hasCoverAttachment` boolean
    - **Given** a part without `cover_url`, **When** part detail loads, **Then** metadata should reflect `coverUrl: null`
  - **Instrumentation / hooks**: `waitForListLoading(page, 'parts.detail', 'ready')` with metadata assertions
  - **Backend hooks**: Factories create part with/without `cover_url`
  - **Gaps**: New test case needed to verify instrumentation metadata schema change
  - **Evidence**: `src/components/parts/part-details.tsx:184` currently includes `hasCoverAttachment` in metadata

## 14) Implementation Slices

This is a moderate-sized change that should be implemented in two slices to maintain working state:

- **Slice 1**: API regeneration and utility functions
  - **Goal**: Regenerate types and create URL parameter utilities without breaking existing code
  - **Touches**:
    - Run `pnpm generate:api` to update types
    - Update `src/lib/utils/thumbnail-urls.ts` to add new utility functions (keep old functions temporarily)
  - **Dependencies**: Backend schema changes deployed

- **Slice 2**: Component and hook updates
  - **Goal**: Update all components and hooks to use new schema fields and CAS URLs
  - **Touches**:
    - Update `src/components/documents/cover-image-display.tsx` (accept `coverUrl` prop)
    - Update `src/components/ui/thumbnail.tsx` (accept `previewUrl` prop)
    - Update `src/lib/utils/document-transformers.ts` (use API URLs)
    - Simplify `src/hooks/use-cover-image.ts` (remove `useCoverAttachment`, keep mutation hooks)
    - Update `src/hooks/use-part-documents.ts` (map new fields)
    - Update all components passing `hasCoverAttachment` (7 files)
    - Remove obsolete functions from `thumbnail-urls.ts`
    - Update Playwright tests
  - **Dependencies**: Slice 1 complete; all components updated in single commit to avoid partial state
  - **Type migration strategy**: **Atomic** — Update `CoverImageDisplay` interface and all 7 call sites in the same commit. Run `pnpm check` before committing to ensure zero type errors. No deprecated transition props needed since the change is localized and can be completed atomically.

## 15) Risks & Open Questions

- **Risk**: API regeneration produces unexpected field names or types
  - **Impact**: TypeScript compilation errors; components fail to access correct fields
  - **Mitigation**: Run `pnpm generate:api` and `pnpm check` immediately; verify generated types match expected schema

- **Risk**: Existing cover images have null `cover_url` (backend migration incomplete)
  - **Impact**: Parts that previously had covers show placeholders
  - **Mitigation**: Verify backend migration is complete before deploying frontend changes; test with real data

- **Risk**: URL parameter appending logic has edge cases (e.g., URLs with fragments, existing params)
  - **Impact**: Malformed URLs cause image load failures
  - **Mitigation**: Test utility functions with various URL formats; add unit tests if necessary

- **Risk**: Playwright tests break due to URL pattern changes
  - **Impact**: Test suite fails; false negatives block deployment
  - **Mitigation**: Update tests to verify image loads successfully rather than matching specific URL patterns

- **Risk**: `pdfIconSvg` removal from wrong files breaks fallback UI
  - **Impact**: PDFs without previews show blank space instead of icon
  - **Mitigation**: Carefully preserve `pdfIconSvg` in `document-tile.tsx` and `add-document-modal.tsx`; remove only from `thumbnail.tsx` and `cover-image-display.tsx`

**Open questions**: None - all requirements are clear from the change brief and code research.

## 16) Confidence

**Confidence: High** — The change is well-scoped with clear backend schema changes documented. URL construction logic is localized to a few utility functions and components. Existing test coverage provides guardrails. The main implementation risk is ensuring all components are updated consistently in a single commit to avoid partial migration state.
