### 0) Research Log & Findings
- Reviewed feature requirements in `docs/epics/kits_feature_breakdown.md:227-246` outlining the kit-detail action, modal behavior, and instrumentation expectations for pick list creation.
- Inspected `src/components/kits/kit-detail.tsx:28-168` to understand how the detail screen wires header slots, instrumentation scopes (`kits.detail`, `kits.detail.contents`, `kits.detail.links`), and dialog state.
- Examined `src/components/kits/kit-detail-header.tsx:52-208` where header actions are rendered and currently only expose the metadata edit affordance while tracking archived state.
- Looked at `src/types/kits.ts:200-233` confirming `KitDetail` already includes `pickLists: KitPickListSummary[]` derived from the backend.
- Verified generated API hooks in `src/lib/api/generated/hooks.ts:959-1005` for `useGetKitsPickListsByKitId` and `usePostKitsPickListsByKitId`.
- Studied existing deterministic coverage in `tests/e2e/kits/kit-detail.spec.ts:437-548` and supporting page objects in `tests/support/page-objects/kits-page.ts:17-136` to extend Playwright flows and selectors.
- Revisited architecture guidance in `docs/contribute/architecture/application_overview.md:5-46` and instrumentation policy in `docs/contribute/testing/playwright_developer_guide.md:80-138` to align with canonical patterns.

### 1) Intent & Scope

**User intent**

Enable planners to spawn pick lists directly from the kit detail screen, mirroring the documented “Create pick list” entrypoint with proper loading feedback, validation, and refreshed summaries.

**Prompt quotes**

"Surface a `Create pick list` action in the kit header (mirrors `Order Stock`) that opens a modal prompting for **Requested units**."  
"After a successful create, close the modal, push a success toast, and refresh kit-level pick list summaries so the new entry appears without a full page reload." (`docs/epics/kits_feature_breakdown.md:235-238`)

**In scope**

- Add a header action that opens a pick list creation dialog on active kits.
- Implement the modal form (requested units input, validation, submission) backed by `POST /kits/{kit_id}/pick-lists`.
- Wire instrumentation (`useListLoadingInstrumentation`, `trackForm*`), toast feedback, and cache refresh so summaries update optimistically.
- Extend Playwright coverage and page objects to exercise the new flow deterministically.

**Out of scope**

- Building the downstream pick list workspace or execution flows (covered by separate features).
- Modifying backend contracts beyond consuming existing schemas.
- Revisiting shopping list linkage or Order Stock actions.

**Assumptions / constraints**

Kit detail already exposes pick list summaries in `KitDetail` payloads; refreshing `useKitDetail` suffices to surface the new entry. Archived kits remain read-only, so creation controls must be gated. The backend enforces business rules and returns validation errors that can be surfaced inline. Requested units must start empty so planners explicitly enter the quantity each time.

### 2) Affected Areas & File Map

- Area: `src/components/kits/kit-detail.tsx`  
  Why: Manage dialog state, trigger mutations, handle toasts/invalidation, and pass new callbacks into header slots.  
  Evidence: `src/components/kits/kit-detail.tsx:28-168` — orchestrates header slots, instrumentation, and dialog rendering.

- Area: `src/components/kits/kit-detail-header.tsx`  
  Why: Extend actions rendering to include the “Create pick list” button alongside existing edit controls, respecting archived state.  
  Evidence: `src/components/kits/kit-detail-header.tsx:123-208` — sorts links and currently renders only metadata edit actions.

- Area: `src/components/kits/kit-pick-list-create-dialog.tsx` (new)  
  Why: Encapsulate the modal UI, form state, validation, instrumentation, and submission pipeline for pick list creation.  
  Evidence: `docs/epics/kits_feature_breakdown.md:233-238` — requires a modal that posts requested units and feeds instrumentation.

- Area: `src/hooks/use-kit-detail.ts`  
  Why: Reuse `buildKitDetailQueryKey` and potentially expose helpers to refetch/refresh after creation.  
  Evidence: `src/hooks/use-kit-detail.ts:21-116` — defines query key and exposes refetch hooks.

- Area: `tests/support/page-objects/kits-page.ts`  
  Why: Add locators/helpers for the new action button and modal controls to keep specs readable.  
  Evidence: `tests/support/page-objects/kits-page.ts:17-135` — centralizes existing kit detail selectors.

- Area: `tests/e2e/kits/kit-detail.spec.ts`  
  Why: Add deterministic Playwright coverage for the creation flow, instrumentation waits, and summary refresh assertions.  
  Evidence: `tests/e2e/kits/kit-detail.spec.ts:437-548` — current linkage tests validate chip rendering/navigation.

### 3) Data Model / Contracts

- Entity / contract: `KitPickListCreateSchema` request  
  Shape: `{ requested_units: number }` — integer count of kit units to allocate.  
  Mapping: UI gathers a positive integer, casts to number before invoking the mutation.  
  Evidence: `src/lib/api/generated/hooks.ts:975-1005` — mutation signature for `usePostKitsPickListsByKitId`.

- Entity / contract: `KitPickListSummary` in `KitDetail`  
  Shape: `{ id, status, requestedUnits, totalQuantityToPick, remainingQuantity, createdAt, completedAt }`.  
  Mapping: Already mapped from snake_case to camelCase in `mapKitPickList`.  
  Evidence: `src/types/kits.ts:200-233` — domain model for pick list summaries.

- Entity / contract: List loading instrumentation metadata  
  Shape: `{ kitId: number; requestedUnits: number; pickListId?: number; status?: string }` to emit during loading/success phases.  
  Mapping: Modal will provide metadata derived from kit detail and mutation response for deterministic waits.  
  Evidence: `src/lib/test/query-instrumentation.ts:50-92` — expects structured metadata via `useListLoadingInstrumentation`.

### 4) API / Integration Surface

- Surface: `POST /api/kits/{kit_id}/pick-lists` (`usePostKitsPickListsByKitId`)  
  Inputs: `{ path: { kit_id }, body: { requested_units } }` sourced from modal form.  
  Outputs: Returns `KitPickListDetailSchema` (lines, status) — use response ID for instrumentation metadata and ensure toast messaging references kit name.  
  Errors: `ApiError` surfaced for validation (400) or conflicts; inline error mapping plus toast fallback.  
  Evidence: `src/lib/api/generated/hooks.ts:975-1005`.

- Surface: `GET /api/kits/{kit_id}` (`useKitDetail`)  
  Inputs: Query keyed by `buildKitDetailQueryKey(kitId)`; refetch after mutation.  
  Outputs: Includes updated `pickLists` and badge counts.  
  Errors: Existing error state handled by `KitDetail` card; creation flow should refetch only on success to avoid clobbering pending UI.  
  Evidence: `src/hooks/use-kit-detail.ts:21-110`.

- Surface: `GET /api/kits/{kit_id}/pick-lists` (`useGetKitsPickListsByKitId`)  
  Inputs: Optional secondary query for other surfaces; invalidate to keep membership widgets consistent if they mount concurrently.  
  Outputs: Summary list for kit-level badges.  
  Errors: Default React Query retry applies; no modal coupling needed.  
  Evidence: `src/lib/api/generated/hooks.ts:959-974`.

### 5) Algorithms & UI Flows

- Flow: Click “Create pick list”  
  Steps:  
  1. User clicks header action; dialog opens with an empty requested units input requiring manual entry.  
  2. On submit, validate input (>0 integer), emit form submit + list loading (`kits.detail.pickLists.create`, phase `loading`).  
  3. Invoke mutation; disable inputs while pending.  
  4. On success, emit success instrumentation, close dialog, show toast (`Created pick list #id for <kit>`), trigger refetch of `useKitDetail`/pick list summaries.  
  5. Refresh renders new chip; header instrumentation (`kits.detail.links`) fires with updated counts.  
  States / transitions: dialog `open` ↔ `closed`, form `idle` → `submitting` → `success|error`, mutation state drives instrumentation.  
  Hotspots: Avoid double-submit by gating on `mutation.isPending`; ensure refetch happens after dialog closes to prevent stale chips.  
  Evidence: `src/components/kits/kit-detail.tsx:28-168`, `docs/epics/kits_feature_breakdown.md:233-238`.

### 6) Derived State & Invariants

- Derived value: `isArchivedActionDisabled`  
  - Source: `kit.status` from detail payload.  
  - Writes / cleanup: Disables the action button and hides dialog open handler when archived.  
  - Guards: Button rendered but disabled with tooltip; ensures mutation never fires for archived kits.  
  - Invariant: Archived kits must not expose creation flows.  
  - Evidence: `src/components/kits/kit-detail-header.tsx:119-207`.

- Derived value: `requestedUnitsInput`  
  - Source: Local form state initializes to empty string on each open; planner enters numeric value manually.  
  - Writes / cleanup: Reset to empty on open/close; cast to number only on submit.  
  - Guards: Validation enforces `> 0` integer before enabling submit.  
  - Invariant: No default quantity is ever submitted implicitly.  
  - Evidence: Resets mirror the existing `useFormState` pattern in `src/components/kits/kit-metadata-dialog.tsx:247-260`.

- Derived value: `canSubmitCreate`  
  - Source: Local form validity && `!mutation.isPending`.  
  - Writes / cleanup: Controls submit button state and instrumentation to prevent duplicate requests.  
  - Guards: Validation errors from `useFormState` plus mutation pending lock.  
  - Invariant: Only one in-flight creation per kit detail at a time.  
  - Evidence: `src/components/kits/kit-metadata-dialog.tsx:239-244` (existing form instrumentation + submission gating pattern).

### 7) State Consistency & Async Coordination

- Source of truth: `useKitDetail` query cache (`buildKitDetailQueryKey`) holds latest pick list summaries.  
- Coordination: Dialog mutation invalidates/refetches detail query and optional `useGetKitsPickListsByKitId`; modal state resets on success to avoid stale inputs.  
- Async safeguards: Cancel pending refetch before mutate if dialog closes; rely on mutation isPending to block repeated submissions.  
- Instrumentation: Emit `useListLoadingInstrumentation` events scoped to `kits.detail.pickLists.create` plus `trackForm*` for form phases so tests await readiness.  
- Evidence: `src/components/kits/kit-detail.tsx:50-80`, `src/hooks/use-kit-detail.ts:21-110`, `src/components/kits/kit-metadata-dialog.tsx:239-260`.

### 8) Errors & Edge Cases

- Failure: Requested units empty, zero, or non-integer.  
  Surface: Pick list creation dialog.  
  Handling: Inline error message, submit disabled until corrected.  
  Guardrails: Validation via `useFormState`, numeric input with `min=1`.  
  Evidence: Pattern in `src/components/kits/kit-metadata-dialog.tsx:220-259` for form resets/validation.

- Failure: Backend returns validation error (400) for requested units (e.g., exceeds limits).  
  Surface: Dialog submission handler.  
  Handling: Map error message to form error, keep dialog open, emit `trackFormError`.  
  Guardrails: Parse `ApiError` payload; instrumentation ensures replayable diagnostics.  
  Evidence: `docs/epics/kits_feature_breakdown.md:236-238`, `src/components/kits/kit-metadata-dialog.tsx:220-227`.

- Failure: Network/server error (5xx).  
  Surface: Dialog submission.  
  Handling: Show destructive toast via `showException`, keep input values, allow retry.  
  Guardrails: Mutation error path emits `trackFormError`; button re-enabled after failure.  
  Evidence: `src/components/kits/kit-metadata-dialog.tsx:220-227`, `docs/contribute/testing/playwright_developer_guide.md:120-138` (console error policy).

### 9) Observability / Instrumentation

- Signal: `kits.detail.pickLists.create`  
  Type: `list_loading` test event.  
  Trigger: Modal opens submit (loading) and completes (ready/error).  
  Labels / fields: `{ kitId, requestedUnits, pickListId? }`.  
  Consumer: `waitForListLoading` in Playwright specs.  
  Evidence: `src/lib/test/query-instrumentation.ts:50-92`, `docs/contribute/testing/playwright_developer_guide.md:80-138`.

- Signal: `KitPickList:create` form events  
  Type: `form` instrumentation via `trackForm*`.  
  Trigger: Dialog open, submit, success/error.  
  Labels / fields: Snapshot with `{ kitId, requestedUnits }`.  
  Consumer: `waitTestEvent` helper for validation assertions.  
  Evidence: `src/hooks/use-form-instrumentation.ts:14-90`.

- Signal: `data-testid` affordances (`kits.detail.actions.create-pick-list`, dialog inputs/buttons)  
  Type: DOM selectors for Playwright.  
  Trigger: Rendered with button/modal.  
  Labels / fields: Unique IDs matching `KitsPage` locators.  
  Consumer: `tests/support/page-objects/kits-page.ts`.  
  Evidence: `tests/support/page-objects/kits-page.ts:21-136`.

### 10) Lifecycle & Background Work

- Hook / effect: Modal reset effect  
  Trigger cadence: Runs whenever dialog opens or kit detail refetches.  
  Responsibilities: Reset form values to current build target, clear errors.  
  Cleanup: No persistent listeners; `useEffect` dependency ensures teardown on close.  
  Evidence: Pattern in `src/components/kits/kit-metadata-dialog.tsx:247-260`.

- Hook / effect: Mutation success handler  
  Trigger cadence: On mutation `onSuccess`.  
  Responsibilities: Close modal, fire toast, refetch detail query, invalidate pick list summary query.  
  Cleanup: None beyond awaiting `query.refetch`.  
  Evidence: `src/hooks/use-kit-detail.ts:101-110`, `src/components/kits/kit-metadata-dialog.tsx:262-317`.

### 11) Security & Permissions

- Concern: Archived kit guard.  
  Touchpoints: Header action button and modal open handler.  
  Mitigation: Disable button and skip opening dialog when `kit.status === 'archived'`.  
  Residual risk: None; backend also enforces status.  
  Evidence: `src/components/kits/kit-detail-header.tsx:119-207`.

### 12) UX / UI Impact

- Entry point: `/kits/$kitId` header actions.  
  Change: Add “Create pick list” secondary button adjacent to “Edit Kit”.  
  User interaction: Opens modal with simple numeric form, shows success toast, updates chips inline.  
  Dependencies: Relies on `DetailScreenLayout` action area and toast context.  
  Evidence: `src/components/kits/kit-detail.tsx:143-168`, `docs/epics/kits_feature_breakdown.md:233-238`.

- Entry point: Pick list creation modal.  
  Change: New dialog with requested units field, validation copy, submit/cancel actions.  
  User interaction: Numeric input starts blank; planner must enter quantity before submit; instrumentation-backed loading indicator.  
  Dependencies: `Dialog`, `Input`, `Button` components in `src/components/ui`.  
  Evidence: `docs/epics/kits_feature_breakdown.md:235-238`.

### 13) Deterministic Test Plan

- Surface: Kit detail header action  
  Scenarios:  
    - Given an active kit with no pick lists, When the user clicks “Create pick list”, manually enters a positive integer, and submits, Then the modal closes, success toast appears, and a new pick list chip renders without navigation.  
    - Given a validation failure (empty input), When submit is pressed, Then inline error displays and no API call fires.  
  Instrumentation / hooks: Wait for `waitForListLoading(page, 'kits.detail.pickLists.create', 'ready')`, assert `waitTestEvent` for `KitPickList:create` submit/success, use `data-testid` selectors for button/input.  
  Gaps: Server-side conflict handling deferred until execution slice introduces concurrency rules (backend already rejects duplicates).  
  Evidence: `tests/e2e/kits/kit-detail.spec.ts:437-548`, `docs/contribute/testing/playwright_developer_guide.md:80-138`.

### 14) Implementation Slices

- Slice: Header action & modal scaffolding  
  Goal: Render button, modal shell, form state, instrumentation wiring (no API yet).  
  Touches: `kit-detail.tsx`, `kit-detail-header.tsx`, new dialog component.  
  Dependencies: None; can stub mutation with TODO.

- Slice: API integration & tests  
  Goal: Hook up mutation, cache invalidation, toasts, Playwright spec updates.  
  Touches: Dialog submit handler, toast usage, `tests/e2e/kits/kit-detail.spec.ts`, `tests/support/page-objects/kits-page.ts`.  
  Dependencies: Modal scaffolding slice merged.

### 15) Risks & Open Questions

- Risk: Refetch timing could briefly show stale chip counts.  
  Impact: Users might not see the new pick list immediately.  
  Mitigation: Await `query.refetch()` and update local cache with response ID before closing modal.

- Risk: Validation error payload shape may differ (field vs form-level).  
  Impact: Inline messaging might be incomplete.  
  Mitigation: Inspect `ApiError` response in mutation error handler; map known keys, default to toast.

- Risk: Tests may flake if instrumentation metadata incomplete.  
  Impact: CI instability.  
  Mitigation: Ensure metadata includes kitId/requestedUnits and success event fired after cache settles.

### 16) Confidence

<confidence_template>Confidence: Medium — Existing patterns cover most needs, but ApiError payload mapping for the mutation still needs validation during implementation.</confidence_template>
