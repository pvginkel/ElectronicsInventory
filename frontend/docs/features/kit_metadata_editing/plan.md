### 0) Research Log & Findings
- Confirmed metadata dialog requirements, archived gating, and instrumentation expectations in `docs/epics/kits_feature_breakdown.md:114-125`.
- Identified current disabled edit affordance and header composition in `src/components/kits/kit-detail-header.tsx:112` and `src/components/kits/kit-detail-header.tsx:213`, which become insertion points for status-aware controls.
- `KitDetail` already centralizes query instrumentation and detail rendering, so modal state and refetch handling belong there (`src/components/kits/kit-detail.tsx:27`).
- `useKitDetail` maps `GET /kits/{kit_id}` responses into camelCase structures and exposes instrumentation metadata we can reuse post-mutation (`src/hooks/use-kit-detail.ts:12`).
- `KitArchiveControls` demonstrates optimistic mutations, toast flow, and form instrumentation patterns to mirror for metadata updates (`src/components/kits/kit-archive-controls.tsx:33`).
- Shopping list edit dialog shows the `Dialog` + `useFormState` approach for validation and inline copy limits to adapt for kit metadata (`src/components/shopping-lists/detail-header-slots.tsx:243`).
- Existing Playwright spec asserts the disabled edit button and uses page-object handles we must evolve for modal interaction (`tests/e2e/kits/kit-detail.spec.ts:176`, `tests/support/page-objects/kits-page.ts:62`).
- Architecture and Playwright guides reiterate generated hook usage, instrumentation-first development, and real-backend testing expectations (`docs/contribute/architecture/application_overview.md:1`, `docs/contribute/testing/playwright_developer_guide.md:1`, `docs/contribute/architecture/test_instrumentation.md:12`).

### 1) Intent & Scope (1–3 short paragraphs)

**User intent**

Let planners edit active-kit metadata directly from the detail header while archived kits stay read-only, keeping detail and overview views synchronized and instrumented for deterministic testing.

**Prompt quotes**

"Enable the “Edit Kit” button for active kits to open a modal dialog (name, description, build target) with validation mirroring other forms."  
"Disable the control for archived kits and surface tooltip copy explaining read-only state; ensure BOM action buttons respect the same gating."  
"Instrument modal with `useFormInstrumentation` form ID `KitDetail:metadata` (metadata: `kitId`, `buildTarget`), including validation events."

**In scope**

- Replace the disabled edit action with status-aware controls and propagate a read-only flag to downstream BOM interactions.
- Implement a metadata modal that loads existing values, validates input, emits instrumentation, and calls `PATCH /api/kits/{kit_id}` with optimistic cache updates.
- Invalidate overview queries and refresh detail instrumentation after successful edits so badge counts and aggregates stay current.
- Extend Playwright coverage and page objects to exercise success, validation failure, and archived gating flows.

**Out of scope**

- Kit BOM inline editing or contents mutations (separate feature).
- Backend schema changes beyond consuming the existing `KitUpdateSchema`.
- Shopping/pick list instrumentation changes or linkage UI updates.

**Assumptions / constraints**

Backend already rejects archived edits and returns updated metadata with authoritative casing; no maximum build target constraint needs enforcement client-side; future BOM slice will reuse the read-only flag; submit behavior should mirror existing edit dialogs (allow submit even if values remain unchanged).

### 2) Affected Areas & File Map (with repository evidence)

- Area: `src/components/kits/kit-detail.tsx`
- Why: Owns detail view state and instrumentation; will manage modal visibility, pass edit handlers, and trigger refetch logic.
- Evidence: `src/components/kits/kit-detail.tsx:27`

- Area: `src/components/kits/kit-detail-header.tsx`
- Why: Currently renders the disabled edit button; needs to expose callbacks and tooltip text based on kit status.
- Evidence: `src/components/kits/kit-detail-header.tsx:213`

- Area: `src/components/kits/kit-bom-table.tsx`
- Why: Must accept a read-only flag so inline BOM actions follow archived gating once enabled.
- Evidence: `src/components/kits/kit-bom-table.tsx:15`

- Area: `src/hooks/use-kit-detail.ts`
- Why: Provides mapped detail data and instrumentation metadata; should expose helpers for writing optimistic updates and refetch coordination.
- Evidence: `src/hooks/use-kit-detail.ts:12`

- Area: `src/hooks/use-kits.ts`
- Why: Supplies `buildKitsQueryKey`; mutation logic will reuse it for targeted invalidation.
- Evidence: `src/hooks/use-kits.ts:24`

- Area: `src/components/kits/kit-archive-controls.tsx`
- Why: Reference pattern for optimistic mutations, toast usage, and form instrumentation to emulate for metadata updates.
- Evidence: `src/components/kits/kit-archive-controls.tsx:33`

- Area: `src/components/kits/kit-metadata-dialog.tsx` (new)
- Why: Encapsulate dialog UI, validation, instrumentation wiring, and submit lifecycle for metadata edits.
- Evidence: `docs/epics/kits_feature_breakdown.md:114`

- Area: `src/hooks/use-kit-metadata-update.ts` (new)
- Why: Wrap `usePatchKitsByKitId` with optimistic cache writes, error recovery, and invalidation strategy.
- Evidence: `docs/epics/kits_feature_breakdown.md:119`

- Area: `tests/support/page-objects/kits-page.ts`
- Why: Add modal locators/actions and archived gating expectations for Playwright specs.
- Evidence: `tests/support/page-objects/kits-page.ts:62`

- Area: `tests/support/page-objects/kit-metadata-dialog.ts` (new)
- Why: Provide reusable helpers for dialog inputs, submit, and wait logic in specs.
- Evidence: `docs/contribute/testing/playwright_developer_guide.md:85`

- Area: `tests/e2e/kits/kit-detail.spec.ts`
- Why: Add scenarios for metadata update success, validation failure, and archived gating.
- Evidence: `tests/e2e/kits/kit-detail.spec.ts:176`

### 3) Data Model / Contracts

- Entity / contract: KitMetadataFormFields
- Shape: `{ name: string; description: string; buildTarget: string }` (form state) → `{ name: string; description: string | null; build_target: number }`.
- Mapping: Initialize from `KitDetail` data, trim strings, convert build target to integer, and submit the full payload (matching existing edit dialogs).
- Evidence: `src/types/kits.ts:191`

- Entity / contract: KitUpdate payload / response
- Shape: Request uses `KitUpdateSchema` fields; response is `KitResponseSchema` (snake_case).
- Mapping: Mutation hook converts response back into camelCase via `mapKitDetail` / `mapKitSummary` before updating caches.
- Evidence: `docs/epics/kits_feature_breakdown.md:121`, `src/lib/api/generated/hooks.ts:854`

- Entity / contract: React Query caches
- Shape: Detail query key `['getKitsByKitId', { path: { kit_id } }]`; overview keys `['getKits', ...]`.
- Mapping: Optimistic update writes to both detail (camelCase) and overview summaries, restored on error.
- Evidence: `src/hooks/use-kit-detail.ts:33`, `src/hooks/use-kits.ts:24`

### 4) API / Integration Surface

- Surface: PATCH /api/kits/{kit_id} (`usePatchKitsByKitId`)
- Inputs: `{ path: { kit_id }, body }` derived from validated form diff.
- Outputs: Updated kit metadata (summary). Mutations should update cached detail/overview entries and invalidate stale queries.
- Errors: Emit toast via `showException`, fire `trackFormError`, and revert optimistic state.
- Evidence: `docs/epics/kits_feature_breakdown.md:118`, `src/lib/api/generated/hooks.ts:854`

- Surface: GET /api/kits/{kit_id} (`useGetKitsByKitId`)
- Inputs: `{ path: { kit_id } }` seeded from route.
- Outputs: Detail response; refetched post-mutation to refresh aggregates/instrumentation.
- Errors: Existing error card remains unchanged.
- Evidence: `src/components/kits/kit-detail.tsx:27`

### 5) Algorithms & UI Flows (step-by-step)

- Flow: Active kit metadata edit
  1. User clicks `Edit Kit`; `KitDetail` sets modal open state and snapshots current metadata.
  2. Dialog renders with form values from `KitDetail`, tracks open event via `useFormInstrumentation`, and validates on blur.
  3. Submit emits `trackFormSubmit`, converts form data to payload (even if values remain unchanged), applies optimistic cache update, and triggers mutation.
  4. On success, write server response into caches, emit `trackFormSuccess`, close modal, show success toast, and invalidate overview queries.
  5. On error, restore snapshot, emit `trackFormError`, surface toast, and keep modal open for correction.
- States / transitions: Modal open/closed; form valid/invalid; mutation idle/pending/success/error; cache stale/fresh.
- Hotspots: Guard against double submit, ensure optimistic data uses camelCase, avoid stale instrumentation metadata.
- Evidence: `src/components/kits/kit-detail.tsx:27`, `src/components/kits/kit-archive-controls.tsx:111`

- Flow: Archived gating enforcement
  1. Derive `isEditable = detail.status === 'active'`.
  2. Header renders enabled button when editable; otherwise keep tooltip/disabled state.
  3. Pass read-only flag to BOM controls for future inline actions.
- States / transitions: Status updates after archive/unarchive flows; gating recomputes from latest detail.
- Hotspots: Avoid opening modal for archived kits even if local state lags; ensure tooltip copy reflects archival reason.
- Evidence: `docs/epics/kits_feature_breakdown.md:117`, `src/components/kits/kit-detail-header.tsx:213`

- Flow: Cache refresh and instrumentation
  1. After mutation success, invalidate relevant queries and trigger detail refetch.
  2. Existing `useListLoadingInstrumentation` hooks emit ready events with updated metadata once refetch resolves.
  3. Modal close resets form state to latest detail to avoid stale diffs on reopen.
- States / transitions: Query statuses pending→success; instrumentation phases loading→ready.
- Hotspots: Avoid infinite invalidation loops; ensure instrumentation metadata uses refetched payload, not optimistic snapshot.
- Evidence: `docs/epics/kits_feature_breakdown.md:129`, `src/components/kits/kit-detail.tsx:49`

### 6) Derived State & Invariants

- `isEditable = detail?.status === 'active'` controls modal availability and BOM edit affordances.
- `initialFormValues = { name, description: detail?.description ?? '', buildTarget: String(detail?.buildTarget ?? 1) }` keeps modal inputs in sync with latest data.
- `submitDisabled = !isValid || isSubmitting` aligns with existing edit dialogs that allow no-op submits while blocking invalid or in-flight attempts.

### 7) Error Handling & Loading States

- Client-side validation surfaces inline messages via `FormError`, emits `trackFormValidationError`, and blocks submit.
- Mutation failure restores cached detail snapshot, keeps modal open, and shows `showException` toast.
- Disable submit button and show spinner while mutation pending; close modal only after success callback.
- Detail fetch error path remains unchanged, preserving existing card fallback.

### 8) Instrumentation & Telemetry

- Signal: `KitDetail:metadata` form events
  - Type: `form` instrumentation.
  - Trigger: Modal open/submit/success/error/validation via `useFormInstrumentation`.
  - Labels / fields: `{ kitId, buildTarget, nameChanged, buildTargetChanged }` snapshot for deterministic assertions.
  - Consumer: Playwright waits using `waitTestEvent('form', ...)`.
  - Evidence: `docs/epics/kits_feature_breakdown.md:124`

- Signal: `kits.detail` / `kits.detail.contents` list loading
  - Type: `list_loading`.
  - Trigger: Existing hooks in `KitDetail` after refetch; ensure mutation success triggers `query.refetch()`.
  - Evidence: `src/components/kits/kit-detail.tsx:49`

- Signal: Toast events
  - Type: `toast`.
  - Trigger: Success toast on update, exception toast on error using shared toast context.
  - Evidence: `src/components/kits/kit-archive-controls.tsx:62`

### 9) Accessibility & UX

- Radix `Dialog` maintains focus trap and Escape handling; set `aria-label="Edit Kit metadata"` for clarity.
- Tooltip for archived kits remains accessible via focus; ensure button uses `aria-disabled`.
- Inputs use associated labels and `aria-invalid` when errors present; add helper text for build target constraints.
- Maintain `data-testid` conventions (`kits.detail.metadata.dialog`, `kits.detail.metadata.field.name`, etc.) to align tests.

### 10) Lifecycle & Background Work

- Use `useEffect` to reset form values whenever `KitDetail` changes to avoid stale dirtiness.
- Mutation hook should clean up optimistic snapshot in `onSettled`.
- No timers or subscriptions introduced; rely on React Query revalidation.

### 11) Security & Permissions (if applicable)

- Concern: Enforcing archived read-only state across UI.
- Touchpoints: Header edit action, modal open guard, BOM controls respecting `isEditable`.
- Mitigation: Gate modal open handler, disable submit for archived kits, rely on backend guard as final enforcement.
- Residual risk: Race when kit archived mid-edit; surfaced as backend error with toast copy instructing user to refresh.
- Evidence: `docs/epics/kits_feature_breakdown.md:117`

### 12) UX / UI Impact (if applicable)

- Entry point: `/kits/$kitId` header action.
- Change: Active kits show enabled “Edit Kit” button opening modal; archived kits show tooltip-only control.
- User interaction: Modal allows editing name/description/build target; on save, toast confirms and header/overview update without navigation.
- Dependencies: Requires status-aware styling, toast messaging, and instrumentation alignment.
- Evidence: `docs/epics/kits_feature_breakdown.md:114`

### 13) Deterministic Test Plan (new/changed behavior only)

- Surface: Kit detail metadata dialog
  - Scenarios:
    - Given an active kit, When the user updates name/description/build target with valid input and submits, Then modal closes, success toast appears, detail/overview reflect new values, and `KitDetail:metadata` emits submit/success events.
    - Given the dialog with blank name or build target < 1, When submit is pressed, Then inline validation errors display, no mutation runs, and `KitDetail:metadata` emits validation events.
  - Instrumentation / hooks: `waitTestEvent('form', evt => evt.formId === 'KitDetail:metadata')`, `waitForListLoading(page, 'kits.detail', 'ready')`, toast helper assertions.
  - Gaps: Conflict (409) handling deferred until backend behavior is specified; document as follow-up.
  - Evidence: `tests/e2e/kits/kit-detail.spec.ts:176`, `docs/epics/kits_feature_breakdown.md:118`

- Surface: Archived gating
  - Scenarios:
    - Given an archived kit detail page, When the user tries to open the edit modal, Then the button stays disabled, tooltip explains read-only gating, and no modal renders.
  - Instrumentation / hooks: UI assertions via page object; ensure form events are absent.
  - Gaps: None.
  - Evidence: `docs/epics/kits_feature_breakdown.md:117`

### 14) Implementation Slices (only if large)

- Slice: Header scaffolding & gating
  - Goal: Enable edit button for active kits, propagate read-only flag, ensure modal guard.
  - Touches: `src/components/kits/kit-detail.tsx`, `src/components/kits/kit-detail-header.tsx`, `src/components/kits/kit-bom-table.tsx`.
  - Dependencies: Existing detail data and instrumentation.

- Slice: Metadata dialog & mutation hook
  - Goal: Deliver modal UI, validation, instrumentation, optimistic mutation, and cache updates.
  - Touches: new dialog component, new hook, toast messaging.
  - Dependencies: Header scaffolding to open modal.

- Slice: Playwright + helpers
  - Goal: Add dialog page object, extend kits spec for success/validation/gating.
  - Touches: `tests/support/page-objects/kits-page.ts`, new page object, `tests/e2e/kits/kit-detail.spec.ts`.
  - Dependencies: UI + instrumentation complete.

### 15) Risks & Open Questions

- Risk: Optimistic cache diverges from backend normalization (e.g., trimming whitespace).
  - Impact: Temporary UI flicker or inconsistent data.
  - Mitigation: Overwrite caches with server response in `onSuccess`.

- Risk: Users may submit unchanged data repeatedly, generating redundant backend traffic.
  - Impact: Minor extra load and instrumentation noise.
  - Mitigation: Follow existing dialog behavior while monitoring via form events; backend remains authoritative for deduplication.

- Risk: Query invalidation triggers noticeable loading flashes on overview.
  - Impact: Minor UX regression.
  - Mitigation: Update cached summary immediately and invalidate status-specific keys to minimize reload scope.

- Open questions: None — max build target enforcement is unnecessary and submit behavior follows existing edit dialog patterns.

### 16) Confidence

<confidence_template>Confidence: Medium — Reuses proven mutation/instrumentation patterns, but optimistic cache alignment and validation parity require careful coordination.</confidence_template>
