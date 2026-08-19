# AI Part Cleanup - Frontend Technical Plan

## 0) Research Log & Findings

**Discovery work performed:**

1. **Examined existing AI analysis feature** (`src/components/parts/ai-part-dialog.tsx`, `src/hooks/use-ai-part-analysis.ts`):
   - Dialog follows multi-step pattern: input → progress → review/duplicates
   - Uses `useSSETask` hook for SSE-based task lifecycle management
   - Progress step shows loading state, handles errors, allows retry/cancel
   - Review step presents form-like interface with type/seller creation flows

2. **Analyzed SSE task infrastructure** (`src/hooks/use-sse-task.ts`, `tests/support/helpers/ai-analysis-mock.ts`):
   - `useSSETask` provides `subscribeToTask`, progress/result/error state management
   - Test mocking follows SSE mocker pattern with task events (`task_started`, `progress_update`, `task_completed`)
   - Instrumentation emits test events for deterministic Playwright assertions

3. **Reviewed part detail page** (`src/components/parts/part-details.tsx`):
   - Dropdown menu at lines 300-315 contains "Order Stock" and "Duplicate Part" actions
   - Uses shadcn DropdownMenu component with DropdownMenuItem children
   - Actions positioned in header alongside "Edit Part" and "Delete Part" buttons

4. **Identified update pattern**:
   - Generated API client does not expose a `usePatchPartsByPartKey` hook (checked `/work/frontend/src/lib/api/generated/hooks.ts`)
   - Backend uses PATCH endpoint at `/api/parts/{part_key}` (confirmed via OpenAPI spec search)
   - Need to use raw `fetch` or extend generated client for part updates

5. **Confirmed AI utilities** (`src/lib/utils/ai-parts.ts`):
   - `transformAIPartAnalysisResult` maps snake_case API to camelCase frontend models
   - `transformToCreateSchema` converts camelCase back to snake_case for API submission
   - Similar transformation pattern will be needed for cleanup results and update payloads

6. **Testing infrastructure** (`tests/support/helpers/ai-analysis-mock.ts`, `tests/e2e/parts/ai-parts-duplicates.spec.ts`):
   - `createAiAnalysisMock` session provides SSE event emission helpers
   - Mock intercepts `/api/ai-parts/analyze` POST and SSE stream at `/tests/ai-stream/{taskId}`
   - Playwright specs use factories for data setup and assert via test events

**Key conflicts resolved:**

- **Cleanup vs. analysis result shape**: Backend returns `CleanedPartDataSchema` (complete part data with changed fields), not partial analysis. Transformation logic must extract changed fields for diff view.
- **No input step requirement**: Unlike AI analysis, cleanup starts immediately on dialog open. Progress step becomes the initial view.
- **Update mechanism**: No generated PATCH hook exists; will use manual `fetch` with proper error handling and cache invalidation.
- **Sparkle icon**: Confirmed gradient colors `from-[#0afecf] to-[#16bbd4]` already used in `ai_assisted` button variant (src/components/ui/button.tsx:44). Will render sparkle SVG inline with gradient class.

---

## 1) Intent & Scope

**User intent**

Add a "Cleanup Part" AI feature to the part detail page that analyzes an existing part's data, suggests improvements, and allows selective application of changes via a merge-style interface.

**Prompt quotes**

- "Add a 'Cleanup Part' option to the dropdown menu on the part detail page"
- "Dialog opens directly to progress page (no input step) - process starts immediately"
- "Show merge/apply changes screen as a table with columns: checkbox, field, old value, arrow (→), new value"
- "Only show rows for fields that have modified values"
- "All checkboxes checked by default"
- "Apply Changes button only enabled if at least one checkbox is checked"
- "If no changes returned, show message 'No improvements found. Your part data is already clean!' with 'Close' button"
- "Testing follows same SSE mocking pattern as AI analysis tests"

**In scope**

- Add "Cleanup Part" menu item to part detail dropdown with sparkle icon and gradient styling
- Create AI part cleanup dialog with progress-first flow (no input step)
- Build merge/apply changes table showing only modified fields with checkboxes, color-coded old/new values, and arrow separator
- Handle type/seller creation inline (same pattern as AI analysis review step)
- Implement selective field updates via PATCH endpoint with manual fetch
- Create `useAIPartCleanup` hook following `useAIPartAnalysis` pattern
- Add SSE mocking infrastructure (`ai-cleanup-mock.ts`) matching analysis mock pattern
- Write Playwright specs covering success, no changes, errors, and selective application

**Out of scope**

- Batch cleanup of multiple parts (single-part operation only)
- Backend implementation of cleanup endpoint (already exists)
- Undo/revert functionality for applied changes (standard edit flow suffices)
- Comparison with historical versions (diff is against current state only)
- Generated API client updates for PATCH endpoint (use manual fetch)

**Assumptions / constraints**

- Backend `/api/ai-parts/cleanup` endpoint is implemented per backend change brief
- SSE task event infrastructure (`useSseContext`, `useSSETask`) supports cleanup task events
- Part update PATCH endpoint at `/api/parts/{part_key}` accepts partial field updates
- Type and seller creation dialogs from AI analysis are reusable
- Cleanup results always include complete part data; frontend extracts changes via comparison
- No new attachment/document handling in cleanup flow (attachments excluded from cleanup scope per backend brief)

---

## 1a) User Requirements Checklist

**User Requirements Checklist**

- [ ] Add "Cleanup Part" option to the dropdown menu on the part detail page
- [ ] Add sparkle icon to the right of the menu item text with gradient colors `from-[#0afecf] to-[#16bbd4]`
- [ ] Dialog opens directly to progress page (no input step) - process starts immediately
- [ ] Show merge/apply changes screen as a table with columns: checkbox, field, old value, arrow (→), new value
- [ ] Only show rows for fields that have modified values
- [ ] Old value text displayed in red color
- [ ] New value text displayed in green color
- [ ] All checkboxes checked by default
- [ ] When checkbox is unchecked, both old and new value text turns gray
- [ ] Tags displayed as comma-separated values in a single row
- [ ] Arrow (→) displayed between old and new value columns for ALL rows
- [ ] "Apply Changes" button only enabled if at least one checkbox is checked
- [ ] "Cancel" button closes dialog without applying changes
- [ ] On Apply: Update part with selected changes, show success toast, close dialog
- [ ] If no changes returned, show message "No improvements found. Your part data is already clean!" with "Close" button
- [ ] For non-existing type/seller: show "Create Type"/"Create Seller" button inline; after creation, replace with normal checkbox row
- [ ] Error handling shown on progress screen (same pattern as AI analysis)
- [ ] Testing follows same SSE mocking pattern as AI analysis tests

---

## 2) Affected Areas & File Map

**Component: part-details.tsx**

- **Area**: `src/components/parts/part-details.tsx`
- **Why**: Add "Cleanup Part" menu item to dropdown (lines 300-315), wire dialog state, pass partId
- **Evidence**: Lines 300-315 show `DropdownMenu` with items for "Order Stock" and "Duplicate Part"

**Component: ai-part-cleanup-dialog.tsx (NEW)**

- **Area**: `src/components/parts/ai-part-cleanup-dialog.tsx`
- **Why**: Root dialog component managing cleanup flow (progress → merge or no-changes)
- **Evidence**: Pattern from `src/components/parts/ai-part-dialog.tsx:20-204` (multi-step dialog with SSE hook integration)

**Component: ai-part-cleanup-progress-step.tsx (NEW)**

- **Area**: `src/components/parts/ai-part-cleanup-progress-step.tsx`
- **Why**: Progress view matching AI analysis pattern, shown immediately on dialog open
- **Evidence**: Reuse existing `AIPartProgressStep` (`src/components/parts/ai-part-progress-step.tsx`) or create specialized variant

**Component: ai-part-cleanup-merge-step.tsx (NEW)**

- **Area**: `src/components/parts/ai-part-cleanup-merge-step.tsx`
- **Why**: Merge/apply changes table with checkbox, field name, old value (red), arrow, new value (green)
- **Evidence**: Similar structure to `AIPartReviewStep` (`src/components/parts/ai-part-review-step.tsx:53-100`) but table-based instead of form-based

**Component: ai-part-cleanup-no-changes-step.tsx (NEW)**

- **Area**: `src/components/parts/ai-part-cleanup-no-changes-step.tsx`
- **Why**: Dedicated step showing "No improvements found" message with Close button
- **Evidence**: Simple message view, pattern from duplicates-only step (`src/components/parts/ai-duplicates-only-step.tsx`)

**Hook: use-ai-part-cleanup.ts (NEW)**

- **Area**: `src/hooks/use-ai-part-cleanup.ts`
- **Why**: Encapsulates cleanup request, SSE subscription, result transformation
- **Evidence**: Pattern from `src/hooks/use-ai-part-analysis.ts:25-149` (POST to `/api/ai-parts/analyze`, subscribe via `useSSETask`)

**Utility: ai-parts.ts**

- **Area**: `src/lib/utils/ai-parts.ts`
- **Why**: Add transformation functions for cleanup result (snake_case → camelCase), update payload (camelCase → snake_case), and `normalizeFieldValue()` helper for comparison (coerces empty string/undefined to null)
- **Evidence**: Lines 40-97 show `transformAIPartAnalysisResult`; lines 99-142 show `transformToCreateSchema`

**Type definitions: ai-parts.ts**

- **Area**: `src/types/ai-parts.ts`
- **Why**: Define `TransformedCleanupResult`, `CleanupFieldChange`, and related types
- **Evidence**: Existing types for analysis (`TransformedAIPartAnalysisResult`, `DuplicatePartEntry`)

**Icon component: SparkleIcon (NEW or inline)**

- **Area**: `src/components/icons/SparkleIcon.tsx` or inline SVG in menu item
- **Why**: Sparkle SVG with gradient styling for menu item
- **Implementation note**: Tailwind gradient utilities (`from-*`, `to-*`) apply to backgrounds, not SVG fills. To achieve gradient on the SVG path, either:
  1. Define `<linearGradient id="sparkle-gradient">` inside SVG `<defs>` and use `fill="url(#sparkle-gradient)"`
  2. Or wrap icon in container with `bg-gradient-to-r from-[#0afecf] to-[#16bbd4]` and use CSS `background-clip: text` with transparent SVG
- **Evidence**: Gradient colors from change brief; SVG gradient technique required for path fill

**Test helper: ai-cleanup-mock.ts (NEW)**

- **Area**: `tests/support/helpers/ai-cleanup-mock.ts`
- **Why**: SSE mock session for cleanup task events
- **Evidence**: Pattern from `tests/support/helpers/ai-analysis-mock.ts:154-287` (`createAiAnalysisMock` session with `emitStarted`, `emitProgress`, `emitCompleted`)

**Test spec: ai-part-cleanup.spec.ts (NEW)**

- **Area**: `tests/e2e/parts/ai-part-cleanup.spec.ts`
- **Why**: E2E scenarios for cleanup success, no changes, errors, selective application
- **Evidence**: Pattern from `tests/e2e/parts/ai-parts-duplicates.spec.ts` (uses mock session, asserts test events)

**Page object: PartsPage or PartDetailPage extension**

- **Area**: `tests/e2e/parts/PartsPage.ts` (if exists) or inline helpers
- **Why**: Actions for opening cleanup dialog, interacting with merge table
- **Evidence**: Page object pattern from `tests/e2e/types/TypesPage.ts` (goto, actions, locators)

---

## 3) Data Model / Contracts

**Entity: CleanedPartDataSchema (backend → frontend)**

- **Shape**:
  ```typescript
  {
    key: string;
    description: string | null;
    manufacturer_code: string | null;
    manufacturer: string | null;
    product_page: string | null;
    seller_link: string | null;
    dimensions: string | null;
    package: string | null;
    pin_count: number | null;
    pin_pitch: string | null;
    mounting_type: string | null;
    series: string | null;
    voltage_rating: string | null;
    input_voltage: string | null;
    output_voltage: string | null;
    type: string | null;  // type name
    type_is_existing: boolean;
    existing_type_id: number | null;
    seller: string | null;  // seller name
    seller_is_existing: boolean;
    existing_seller_id: number | null;
    tags: string[];
  }
  ```
- **Mapping**: Transform to camelCase via `transformCleanupResult`:
  ```typescript
  {
    key, description, manufacturerCode, manufacturer, productPage,
    sellerLink, dimensions, package, pinCount, pinPitch, mountingType,
    series, voltageRating, inputVoltage, outputVoltage,
    type, typeIsExisting, existingTypeId,
    seller, sellerIsExisting, existingSellerId,
    tags
  }
  ```
- **Evidence**: Backend schema per `docs/features/ai_part_cleanup/change_brief.md:18-21`

**Entity: CleanupFieldChange (derived from comparison)**

- **Shape**:
  ```typescript
  {
    fieldName: string;         // e.g., 'description', 'manufacturer'
    fieldLabel: string;        // e.g., 'Description', 'Manufacturer'
    oldValue: string | null;   // current part value
    newValue: string | null;   // cleaned part value
    isChecked: boolean;        // default true
  }
  ```
- **Mapping**: Computed by comparing current part data with cleaned result; only fields with `oldValue !== newValue` included
- **Evidence**: Requirement "Only show rows for fields that have modified values"

**Entity: PartUpdatePayload (frontend → backend PATCH)**

- **Shape**:
  ```typescript
  {
    description?: string | null;
    manufacturer_code?: string | null;
    manufacturer?: string | null;
    type_id?: number | null;
    tags?: string[];
    dimensions?: string | null;
    voltage_rating?: string | null;
    mounting_type?: string | null;
    package?: string | null;
    pin_count?: number | null;
    pin_pitch?: string | null;
    series?: string | null;
    input_voltage?: string | null;
    output_voltage?: string | null;
    product_page?: string | null;
    seller_id?: number | null;
    seller_link?: string | null;
  }
  ```
- **Mapping**: Build from selected changes (checked rows only), converting camelCase to snake_case
- **Evidence**: Backend PATCH endpoint accepts partial updates; pattern from `transformToCreateSchema` in `src/lib/utils/ai-parts.ts:102-142`

**Entity: TransformedCleanupResult**

- **Shape**:
  ```typescript
  {
    cleanedPart: {
      key: string;
      description: string | null;
      manufacturerCode: string | null;
      manufacturer: string | null;
      productPage: string | null;
      sellerLink: string | null;
      dimensions: string | null;
      package: string | null;
      pinCount: number | null;
      pinPitch: string | null;
      mountingType: string | null;
      series: string | null;
      voltageRating: string | null;
      inputVoltage: string | null;
      outputVoltage: string | null;
      type: string | null;
      typeIsExisting: boolean;
      existingTypeId: number | null;
      seller: string | null;
      sellerIsExisting: boolean;
      existingSellerId: number | null;
      tags: string[];
    };
  }
  ```
- **Mapping**: Top-level wrapper around cleaned part data
- **Evidence**: Backend task result schema wraps `cleaned_part`

---

## 4) API / Integration Surface

**Surface: POST /api/ai-parts/cleanup**

- **Inputs**: `{ part_key: string }` (JSON body)
- **Outputs**: `{ task_id: string, stream_url: string }`
- **Errors**: 404 if part not found, 500 on task creation failure; surface via toast + error state
- **Evidence**: Backend brief `docs/features/ai_part_cleanup/change_brief.md:64`

**Surface: SSE task event stream (unified)**

- **Inputs**: Subscribe to `task_id` via `useSSETask`
- **Outputs**:
  - `task_started`: `{ task_id, timestamp }`
  - `progress_update`: `{ text, value }`
  - `task_completed`: `{ success: true, analysis: { cleaned_part: CleanedPartDataSchema }, error_message: null }`
  - `task_completed` (failure): `{ success: false, analysis: null, error_message: string }`
- **Errors**: SSE connection errors, task failures routed via `onError` callback
- **Evidence**: `src/hooks/use-sse-task.ts:59-243` (`useSSETask` hook lifecycle)

**Surface: PATCH /api/parts/{part_key}**

- **Inputs**: Partial `PartUpdatePayload` (snake_case fields selected by user)
- **Outputs**: Updated part response (full part object)
- **Errors**: 404 if part not found, 409 on conflict, 422 on validation error; surface via toast
- **Evidence**: Backend PATCH endpoint confirmed via OpenAPI spec search; manual `fetch` required (no generated hook)

**Cache invalidation:**

- **After PATCH success**: Invalidate `useGetPartsByPartKey` query for the updated part
- **After type/seller creation**: Invalidate respective list queries (`useGetTypes`, `useGetSellers`)
- **Evidence**: Pattern from `src/hooks/use-ai-part-analysis.ts:91-94` (mutation with `onSuccess` invalidation)

---

## 5) Algorithms & UI Flows

**Flow: Cleanup initiation (menu item click)**

- **Steps**:
  1. User clicks "Cleanup Part" in dropdown menu
  2. `handleCleanupPart` callback sets `showCleanupDialog = true`
  3. Dialog opens, immediately shows progress step (no input step)
  4. `useEffect` detects dialog open, calls `startCleanup(partId)`
  5. `useAIPartCleanup` hook POSTs to `/api/ai-parts/cleanup` with `{ part_key: partId }`
  6. On 200 response, extracts `task_id` and subscribes via `useSSETask`
  7. Progress step renders, listens for SSE events
- **States / transitions**: closed → progress (loading)
- **Hotspots**: Immediate cleanup start on dialog open requires `useEffect` coordination; avoid double-triggering via ref guard
- **Evidence**: `src/components/parts/ai-part-dialog.tsx:57-65` (reset on open/close), `src/hooks/use-ai-part-analysis.ts:70-130` (analyze flow)

**Flow: Progress updates**

- **Steps**:
  1. SSE emits `task_started` → show "Starting cleanup..." or equivalent
  2. SSE emits `progress_update` events → update progress bar, display `text` field
  3. On error (connection drop, `task_failed`), show error UI with Retry/Cancel buttons
  4. On `task_completed` with `success: true`, route to merge step or no-changes step
  5. On `task_completed` with `success: false`, show error message with Retry/Cancel
- **States / transitions**: progress (loading) → progress (error) | merge | no-changes
- **Hotspots**: Distinguishing "no changes" from "error" requires inspecting cleaned part fields vs. current part
- **Evidence**: `src/hooks/use-sse-task.ts:122-217` (SSE event handling), `src/components/parts/ai-part-progress-step.tsx` (progress UI)

**Flow: Merge/apply changes**

- **Steps**:
  1. Compare current part data with cleaned part data field-by-field **after normalizing null and empty string to null** (e.g., `normalizeFieldValue(old) !== normalizeFieldValue(new)` where `normalizeFieldValue = (v) => v === '' || v === undefined ? null : v`)
  2. Build `CleanupFieldChange[]` array for fields where normalized values differ
  3. If array empty, route to no-changes step; otherwise render merge table
  4. Each row: checkbox (default checked), field label, old value (red), arrow (→), new value (green)
  5. Handle type/seller creation: if `typeIsExisting === false`, show "Create Type" button inline; on success, replace with checkbox row
  6. User toggles checkboxes; unchecked rows turn both old/new values gray
  7. "Apply Changes" enabled only if `changes.some(c => c.isChecked)`
  8. On Apply: build partial update payload from checked changes, PATCH to `/api/parts/{part_key}`
  9. On success: invalidate part query, show success toast, close dialog
  10. On error: show error toast (via automatic error handling), keep dialog open
- **States / transitions**: merge (idle) → merge (creating type/seller) → merge (applying) → closed
- **Hotspots**: Type/seller creation requires async state updates (creating → created); track createdTypeId/createdSellerId in component state
- **Evidence**: `src/components/parts/ai-part-review-step.tsx:82-113` (type/seller creation flow)

**Flow: No changes detected**

- **Steps**:
  1. After `task_completed`, compare cleaned part with current part
  2. If all fields identical (no changes), set step = 'no-changes'
  3. Render message: "No improvements found. Your part data is already clean!"
  4. Show "Close" button that calls `onClose`
- **States / transitions**: no-changes → closed
- **Hotspots**: None (simple message + button)
- **Evidence**: Requirement "If no changes returned, show message..."

---

## 6) Derived State & Invariants

**Derived value: cleanupChanges**

- **Source**: Computed from `currentPart` (from `useGetPartsByPartKey`) and `cleanedPart` (from `useAIPartCleanup` result)
- **Writes / cleanup**: Drives merge table row rendering; changes to checkbox state update local `fieldChanges` state array
- **Guards**: Only compute if both `currentPart` and `cleanedPart` are non-null; field comparison uses `normalizeFieldValue()` helper that coerces empty strings and undefined to null before comparison
- **Invariant**: `cleanupChanges` array must only contain fields where `normalizeFieldValue(oldValue) !== normalizeFieldValue(newValue)`; empty array triggers no-changes step
- **Evidence**: Requirement "Only show rows for fields that have modified values"

**Derived value: applyEnabled**

- **Source**: `fieldChanges.some(change => change.isChecked)`
- **Writes / cleanup**: Controls "Apply Changes" button `disabled` attribute
- **Guards**: At least one checkbox must be checked to enable Apply
- **Invariant**: Button must never be enabled when all checkboxes unchecked
- **Evidence**: Requirement "Apply Changes button only enabled if at least one checkbox is checked"

**Derived value: updatePayload**

- **Source**: Filtered `fieldChanges` (only checked rows), converted to snake_case PATCH payload
- **Writes / cleanup**: Sent as request body to `/api/parts/{part_key}` PATCH endpoint
- **Guards**: Type/seller fields require special handling: if type/seller was created, use new ID; if existing, use cleaned value
- **Invariant**: Payload must only include fields with checked changes; type_id/seller_id must be resolved before PATCH
- **Evidence**: `src/lib/utils/ai-parts.ts:102-142` (snake_case conversion pattern)

**Derived value: createdTypeId / createdSellerId**

- **Source**: Type/seller creation mutation success callbacks
- **Writes / cleanup**: Update local state, replace "Create Type/Seller" button with checkbox row
- **Guards**: Creation only allowed if `typeIsExisting === false` or `sellerIsExisting === false`
- **Invariant**: After creation, field change for type/seller must use created ID in update payload
- **Evidence**: `src/components/parts/ai-part-review-step.tsx:96-113` (creation mutation callbacks)

---

## 7) State Consistency & Async Coordination

**Source of truth: TanStack Query cache**

- **Coordination**: Part data from `useGetPartsByPartKey` provides baseline for comparison; cleanup result from `useAIPartCleanup` provides cleaned data
- **Async safeguards**: Cleanup hook aborts SSE subscription on unmount via `useEffect` cleanup; dialog close cancels in-flight cleanup task
- **Instrumentation**: `useSSETask` emits test events for `task_subscription`, `task_started`, `progress_update`, `task_completed`; `handleApplyChanges` should emit form events (`form:submit`, `form:success`)
- **Evidence**: `src/hooks/use-sse-task.ts:76-233` (cleanup on unmount), `src/lib/test/query-instrumentation.ts` (form instrumentation pattern)

**Concurrency handling:**

- **Multiple cleanup requests**: `useAIPartCleanup` should guard against double-submission via `isCleaningUp` state (similar to `isAnalyzing` in analysis hook)
- **Dialog close during progress**: `unsubscribe()` called on dialog close; SSE listener removed
- **Type/seller creation during apply**: Disable "Apply Changes" button while type/seller creation in progress; re-enable after creation success
- **Evidence**: `src/hooks/use-ai-part-analysis.ts:70-80` (guard against re-submission)

**Cache invalidation strategy:**

- **On PATCH success**: `queryClient.invalidateQueries({ queryKey: ['parts', partId] })`
- **On type/seller creation**: Invalidate `['types']` or `['sellers']` list queries
- **Evidence**: Standard TanStack Query invalidation pattern

---

## 8) Errors & Edge Cases

**Failure: Cleanup request fails (404, 500)**

- **Surface**: Progress step
- **Handling**: Show error message from API response, display "Retry" and "Cancel" buttons
- **Guardrails**: `useAIPartCleanup` hook's `onError` callback sets error state; progress step renders error UI
- **Evidence**: `src/components/parts/ai-part-progress-step.tsx` (error prop rendering)

**Failure: SSE connection drops**

- **Surface**: Progress step
- **Handling**: `useSSETask` detects connection failure, routes to `onError` callback; show error message with Retry
- **Guardrails**: SSE context handles reconnection; hook exposes error state
- **Evidence**: `src/hooks/use-sse-task.ts:198-217` (task_failed handling)

**Failure: Task completes with error_message**

- **Surface**: Progress step
- **Handling**: Display `error_message` from `task_completed` event, show Retry/Cancel buttons
- **Guardrails**: `onResult` callback in `useAIPartCleanup` checks `success` field; route to error state if false
- **Evidence**: `src/hooks/use-ai-part-analysis.ts:36-60` (hard/soft failure differentiation)

**Failure: PATCH request fails (409, 422, 500)**

- **Surface**: Merge step (toast notification)
- **Handling**: Automatic toast error via global error handler; keep dialog open for user to retry or cancel
- **Guardrails**: Catch PATCH error in `handleApplyChanges`, emit component error event
- **Evidence**: Global error handling per `docs/contribute/architecture/application_overview.md:34-39`

**Edge case: No changes found**

- **Surface**: No-changes step
- **Handling**: Show message "No improvements found. Your part data is already clean!" with "Close" button
- **Guardrails**: After `task_completed`, compare cleaned part with current part; if identical, set step = 'no-changes'
- **Evidence**: Requirement "If no changes returned, show message..."

**Edge case: Type/seller does not exist**

- **Surface**: Merge step (inline creation button)
- **Handling**: Render "Create Type" or "Create Seller" button next to field; on creation success, update state with new ID
- **Guardrails**: Disable "Apply Changes" while creation in progress; replace button with checkbox row after success
- **Evidence**: `src/components/parts/ai-part-review-step.tsx:96-113` (type/seller creation flow)

**Edge case: User unchecks all checkboxes**

- **Surface**: Merge step
- **Handling**: "Apply Changes" button becomes disabled; user must check at least one to proceed
- **Guardrails**: `applyEnabled` derived state computed from checkbox states
- **Evidence**: Requirement "Apply Changes button only enabled if at least one checkbox is checked"

**Edge case: Dialog closed after type/seller creation but before apply**

- **Surface**: Merge step (dialog close event)
- **Handling**: Orphaned type/seller records remain in backend (acceptable; backend may implement cleanup policy separately). On dialog reopen, fresh cleanup task is started; backend deduplication ensures type name collision is handled.
- **Guardrails**: Show confirmation dialog if attempting to close after type/seller creation but before apply: "You created a type/seller that won't be applied to this part. Close anyway?" This follows the form dirty state pattern and reduces user confusion.
- **Evidence**: UX consistency with form dirty state pattern; prevents accidental loss of user work

**Edge case: Part deleted while cleanup in progress**

- **Surface**: Merge step or PATCH request
- **Handling**: PATCH returns 404; show error toast, close dialog (part no longer exists)
- **Guardrails**: Global error handler surfaces 404 as toast; user returns to parts list
- **Evidence**: Standard error handling pattern

---

## 9) Observability / Instrumentation

**Signal: cleanup_dialog_opened**

- **Type**: Test event (`ui_state`)
- **Trigger**: Dialog `open` prop changes to `true` in `part-details.tsx`
- **Labels / fields**: `{ partId: string, phase: 'open' }`
- **Consumer**: Playwright wait helper `waitForUiState(page, 'parts.cleanup.dialog', 'open')`
- **Evidence**: Pattern from `src/lib/test/event-emitter.ts` (test event emission)

**Signal: cleanup_task_subscription**

- **Type**: Test event (`sse`)
- **Trigger**: `useSSETask` subscribes to cleanup task ID
- **Labels / fields**: `{ taskId: string, phase: 'open' }`
- **Consumer**: Playwright assertion for SSE subscription start
- **Evidence**: `src/hooks/use-sse-task.ts:97-106` (subscription test event)

**Signal: cleanup_progress_update**

- **Type**: Test event (`sse`)
- **Trigger**: SSE `progress_update` event received
- **Labels / fields**: `{ taskId: string, message: string, percentage?: number, phase: 'message' }`
- **Consumer**: Playwright assertion for progress visibility
- **Evidence**: `src/hooks/use-sse-task.ts:138-156` (progress test event)

**Signal: cleanup_task_completed**

- **Type**: Test event (`sse`)
- **Trigger**: SSE `task_completed` event received with `success: true`
- **Labels / fields**: `{ taskId: string, success: boolean, phase: 'message' }`
- **Consumer**: Playwright wait for merge step transition
- **Evidence**: `src/hooks/use-sse-task.ts:159-174` (completion test event)

**Signal: cleanup_apply_submit**

- **Type**: Test event (`form`)
- **Trigger**: "Apply Changes" button clicked, PATCH request initiated
- **Labels / fields**: `{ formId: 'ai-part-cleanup-apply', phase: 'submit', changesCount: number }`
- **Consumer**: Playwright assertion for apply action start
- **Evidence**: Pattern from `src/lib/test/form-instrumentation.ts` (form submission events)

**Signal: cleanup_apply_success**

- **Type**: Test event (`form`)
- **Trigger**: PATCH request succeeds, part updated
- **Labels / fields**: `{ formId: 'ai-part-cleanup-apply', phase: 'success', partKey: string }`
- **Consumer**: Playwright assertion for apply success, dialog close
- **Evidence**: Pattern from `src/lib/test/form-instrumentation.ts` (form success events)

**Signal: cleanup_query_invalidated**

- **Type**: Test event (`query`)
- **Trigger**: After successful PATCH when `queryClient.invalidateQueries` is called for the part
- **Labels / fields**: `{ queryKey: ['parts', partKey], phase: 'invalidated' }`
- **Consumer**: Playwright assertion via `waitTestEvent(page, 'query', evt => evt.queryKey.includes(partKey))` to verify cache refresh before asserting updated part data in UI
- **Evidence**: Cache invalidation verification required for deterministic testing of data flow

**Signal: data-testid attributes**

- **Type**: DOM attribute
- **Trigger**: Render merge table, progress step, no-changes step
- **Labels / fields**:
  - `data-testid="parts.cleanup.dialog"`
  - `data-testid="parts.cleanup.progress"`
  - `data-testid="parts.cleanup.merge.table"`
  - `data-testid="parts.cleanup.merge.row"`
  - `data-testid="parts.cleanup.merge.checkbox"`
  - `data-testid="parts.cleanup.no-changes"`
  - `data-testid="parts.cleanup.apply-button"`
- **Consumer**: Playwright selectors for UI interaction
- **Evidence**: Selector convention from `docs/contribute/testing/selector_patterns.md`

---

## 10) Lifecycle & Background Work

**Hook / effect: Dialog open effect (cleanup dialog)**

- **Trigger cadence**: On mount when `open === true`
- **Responsibilities**: Start cleanup task immediately; subscribe to SSE; set initial step to 'progress'
- **Cleanup**: On unmount or `open` changes to `false`, unsubscribe from SSE task
- **Evidence**: `src/components/parts/ai-part-dialog.tsx:56-65` (reset state on open/close)

**Hook / effect: SSE subscription cleanup (useSSETask)**

- **Trigger cadence**: On unmount or `unsubscribe()` call
- **Responsibilities**: Remove task event listener, reset subscription state
- **Cleanup**: `unsubscribeListenerRef.current()` called in cleanup function
- **Evidence**: `src/hooks/use-sse-task.ts:229-233` (cleanup on unmount)

**Hook / effect: Query invalidation (after PATCH)**

- **Trigger cadence**: On `mutateAsync` success in `handleApplyChanges`
- **Responsibilities**: Invalidate `useGetPartsByPartKey` query for updated part
- **Cleanup**: None (one-time invalidation)
- **Evidence**: Standard TanStack Query pattern

---

## 11) Security & Permissions (if applicable)

**Concern**: Not applicable

- No role-based access control for cleanup feature
- Backend handles authorization per existing part access rules
- Frontend assumes user has permission to view/edit part (already enforced at part detail page level)

---

## 12) UX / UI Impact

**Entry point: Part detail page dropdown menu**

- **Change**: Add "Cleanup Part" menu item with sparkle icon (gradient colors `from-[#0afecf] to-[#16bbd4]`)
- **User interaction**: Click opens cleanup dialog directly to progress step
- **Dependencies**: `partId` from route params, dropdown menu component
- **Evidence**: `src/components/parts/part-details.tsx:300-315` (dropdown menu)

**Entry point: Cleanup dialog (progress step)**

- **Change**: Immediate progress display on open, no input step
- **User interaction**: Watch progress bar, cancel if needed, or wait for completion
- **Dependencies**: `useAIPartCleanup` hook SSE subscription
- **Evidence**: Requirement "Dialog opens directly to progress page (no input step)"

**Entry point: Merge/apply changes step**

- **Change**: Table with columns: checkbox, field label, old value (red), arrow (→), new value (green)
- **User interaction**: Toggle checkboxes to select changes, create type/seller if needed, click "Apply Changes"
- **Dependencies**: Current part data, cleaned part data, type/seller creation dialogs
- **Evidence**: Requirement "Show merge/apply changes screen as a table..."

**Entry point: No-changes step**

- **Change**: Message "No improvements found. Your part data is already clean!" with "Close" button
- **User interaction**: Click "Close" to dismiss dialog
- **Dependencies**: None (simple message view)
- **Evidence**: Requirement "If no changes returned, show message..."

---

## 13) Deterministic Test Plan

**Surface: Part detail page menu**

- **Scenarios**:
  - **Given** part detail page is open, **When** user clicks dropdown menu, **Then** "Cleanup Part" item is visible with sparkle icon
  - **Given** dropdown menu is open, **When** user clicks "Cleanup Part", **Then** cleanup dialog opens to progress step
- **Instrumentation / hooks**: `data-testid="parts.detail.actions.menu"`, `data-testid="parts.detail.actions.cleanup"`, `waitForUiState(page, 'parts.cleanup.dialog', 'open')`
- **Gaps**: None
- **Evidence**: `tests/e2e/parts/ai-parts-duplicates.spec.ts` (menu interaction pattern)

**Surface: Cleanup dialog (progress step)**

- **Scenarios**:
  - **Given** dialog opened, **When** cleanup task starts, **Then** progress bar shows "Starting cleanup..."
  - **Given** progress running, **When** SSE emits progress updates, **Then** progress text updates
  - **Given** cleanup completes successfully, **When** changes detected, **Then** merge step renders
  - **Given** cleanup completes successfully, **When** no changes detected, **Then** no-changes step renders
  - **Given** cleanup fails, **When** error occurs, **Then** error message shows with Retry/Cancel buttons
- **Instrumentation / hooks**: `waitTestEvent(page, 'sse', evt => evt.event === 'task_started')`, `waitTestEvent(page, 'sse', evt => evt.event === 'progress_update')`, `waitTestEvent(page, 'sse', evt => evt.event === 'task_completed')`
- **Gaps**: None
- **Evidence**: `tests/e2e/parts/ai-parts-duplicates.spec.ts` (SSE progress assertions)

**Surface: Merge/apply changes step**

- **Scenarios**:
  - **Given** cleanup completed with changes, **When** merge step renders, **Then** table shows only changed fields with old (red) and new (green) values
  - **Given** merge table rendered, **When** user unchecks a checkbox, **Then** both old and new values turn gray
  - **Given** all checkboxes unchecked, **When** user checks "Apply Changes" button, **Then** button is disabled
  - **Given** at least one checkbox checked, **When** user clicks "Apply Changes", **Then** PATCH request sent with selected changes
  - **Given** PATCH succeeds, **When** response received, **Then** success toast shown, dialog closes, part query invalidated
  - **Given** type does not exist, **When** "Create Type" button clicked, **Then** type creation dialog opens
  - **Given** type created, **When** creation succeeds, **Then** "Create Type" button replaced with checkbox row
- **Instrumentation / hooks**: `data-testid="parts.cleanup.merge.table"`, `data-testid="parts.cleanup.merge.row"`, `data-testid="parts.cleanup.merge.checkbox"`, `waitTestEvent(page, 'form', evt => evt.formId === 'ai-part-cleanup-apply' && evt.phase === 'submit')`, `waitTestEvent(page, 'form', evt => evt.phase === 'success')`, `waitTestEvent(page, 'query', evt => evt.queryKey.includes(partKey) && evt.phase === 'invalidated')` for cache verification
- **Gaps**: None
- **Evidence**: `tests/e2e/parts/ai-parts-duplicates.spec.ts` (table interaction, type creation flow)

**Surface: No-changes step**

- **Scenarios**:
  - **Given** cleanup completed with no changes, **When** no-changes step renders, **Then** message "No improvements found. Your part data is already clean!" displayed
  - **Given** no-changes step rendered, **When** user clicks "Close", **Then** dialog closes
- **Instrumentation / hooks**: `data-testid="parts.cleanup.no-changes"`, `page.getByRole('button', { name: /close/i })`
- **Gaps**: None
- **Evidence**: Simple message assertion

**Surface: Error handling**

- **Scenarios**:
  - **Given** cleanup request fails (404), **When** error occurs, **Then** error message shows on progress step with Retry/Cancel
  - **Given** SSE connection drops, **When** error detected, **Then** error message shows with Retry
  - **Given** PATCH request fails (409), **When** error occurs, **Then** error toast shown, dialog remains open
- **Instrumentation / hooks**: `waitTestEvent(page, 'sse', evt => evt.phase === 'error')`, `expectConflictError(page)`
- **Gaps**: None
- **Evidence**: `tests/e2e/parts/ai-parts-duplicates.spec.ts` (error handling scenarios)

---

## 14) Implementation Slices

**Slice 1: Core cleanup hook and dialog skeleton**

- **Goal**: Establish data flow from menu click → cleanup task → SSE subscription → result
- **Touches**:
  - `src/hooks/use-ai-part-cleanup.ts` (new)
  - `src/components/parts/ai-part-cleanup-dialog.tsx` (new)
  - `src/components/parts/part-details.tsx` (add menu item, dialog state)
  - `src/lib/utils/ai-parts.ts` (transformation functions)
  - `src/types/ai-parts.ts` (type definitions)
- **Dependencies**: Backend cleanup endpoint functional; SSE unified stream available

**Slice 2: Progress step and error handling**

- **Goal**: Show progress UI, handle SSE events, route to merge/no-changes/error states
- **Touches**:
  - `src/components/parts/ai-part-cleanup-progress-step.tsx` (new or reuse existing)
  - `src/hooks/use-ai-part-cleanup.ts` (error callback logic)
- **Dependencies**: Slice 1 complete

**Slice 3: Merge/apply changes step**

- **Goal**: Render change table, handle checkbox toggles, build update payload, PATCH to backend
- **Touches**:
  - `src/components/parts/ai-part-cleanup-merge-step.tsx` (new)
  - `src/lib/utils/ai-parts.ts` (update payload transformation)
- **Dependencies**: Slice 2 complete

**Slice 4: Type/seller creation integration**

- **Goal**: Handle non-existing type/seller with inline creation buttons
- **Touches**:
  - `src/components/parts/ai-part-cleanup-merge-step.tsx` (creation button logic)
  - Reuse `TypeCreateDialog`, `SellerCreateDialog` from AI analysis
- **Dependencies**: Slice 3 complete

**Slice 5: No-changes step and instrumentation**

- **Goal**: Add no-changes view, emit test events for all flows
- **Touches**:
  - `src/components/parts/ai-part-cleanup-no-changes-step.tsx` (new)
  - `src/hooks/use-ai-part-cleanup.ts` (test event emission)
  - `src/components/parts/ai-part-cleanup-merge-step.tsx` (apply form events)
- **Dependencies**: Slice 4 complete

**Slice 6: Testing infrastructure and E2E specs**

- **Goal**: Add SSE mock helper, write Playwright scenarios for all flows
- **Touches**:
  - `tests/support/helpers/ai-cleanup-mock.ts` (new)
  - `tests/e2e/parts/ai-part-cleanup.spec.ts` (new)
- **Dependencies**: Slices 1-5 complete, instrumentation in place

---

## 15) Risks & Open Questions

**Risk: PATCH endpoint payload structure mismatch**

- **Impact**: Update request fails with 422 validation error
- **Mitigation**: Review backend PATCH schema before implementing payload transformation; test with backend early

**Risk: Field comparison logic produces false positives (empty string vs. null)**

- **Impact**: Merge table shows spurious changes (e.g., `"" !== null`)
- **Mitigation**: Normalize null/empty values before comparison; treat empty string and null as equivalent for display purposes

**Risk: SSE mock pattern diverges from real backend cleanup events**

- **Impact**: Tests pass but real cleanup fails
- **Mitigation**: Align mock event structure with backend SSE format; validate against real backend in integration testing

**Risk: Dialog state management complexity (progress → merge → apply → close)**

- **Impact**: State transitions fail, dialog stuck in intermediate state
- **Mitigation**: Use explicit step enum (`'progress' | 'merge' | 'no-changes' | 'error'`); log transitions in dev mode for debugging

**Risk: Type/seller creation flow interrupts apply action**

- **Impact**: User creates type/seller but apply fails because ID not captured
- **Mitigation**: Disable "Apply Changes" button while creation in progress; update field change state with new ID on creation success

**Resolved: Tags are diffed as a whole (not individually)**

- **Decision**: Tags displayed as comma-separated values in a single row showing old vs. new array
- **Rationale**: Simpler UX, consistent with other fields, matches user requirement "Tags displayed as comma-separated values in a single row"

**Open question: Should applied changes be undoable via "Undo" toast action?**

- **Why it matters**: User may accidentally apply unwanted changes; undo improves UX safety
- **Owner / follow-up**: Out of scope per plan; standard edit flow provides manual revert path

**Open question: Should dialog support "Create Another" flow like AI analysis?**

- **Why it matters**: User may want to clean up multiple parts sequentially
- **Owner / follow-up**: Out of scope per plan; user can close dialog and reopen for next part

---

## 16) Confidence

**Confidence: High** — Plan follows established patterns from AI analysis feature, reuses existing infrastructure (SSE, dialog components, type/seller creation), and leverages documented testing practices. Core risks identified with clear mitigations.
