### 0) Research Log & Findings

- Confirmed `KitDetail` already emits list/UI instrumentation but has no entry point for linking; header currently renders `ShoppingListLinkChip` badges or a placeholder message (`This kit is not linked...`) without actions, and chips only surface status text (`src/components/kits/kit-detail.tsx:27`, `src/components/kits/kit-detail-header.tsx:155`).
- `ShoppingListLinkChip` links to `/shopping-lists/$listId` with static badge styling and no stale or tooltip handling, providing the hook where we can extend labels and unlink affordances (`src/components/shopping-lists/shopping-list-link-chip.tsx:37`).
- Pattern-matched dialog + instrumentation behavior from `AddToShoppingListDialog` (part detail flow) which combines list fetching, create/append branching, and `useFormInstrumentation` telemetry; `useShoppingListsOverview` already exposes Concept lists and readiness metadata (`src/components/shopping-lists/part/add-to-shopping-list-dialog.tsx:57`, `src/hooks/use-shopping-lists.ts:622`).
- `KitDetail` instrumentation metadata currently aggregates shopping/pick counts but omits stale or honor-reserved signals, indicating where to extend scope payloads (`src/components/kits/kit-detail.tsx:74`, `src/components/kits/kit-detail.tsx:294`).
- Shopping list detail shell renders header slots via `useShoppingListDetailHeaderSlots`, leaving `supplementary`/metadata regions free for kit chips, but no kit linkage UI exists yet (`src/routes/shopping-lists/$listId.tsx:612`, `src/components/shopping-lists/detail-header-slots.tsx:151`).
- Playwright coverage for kits asserts `kits.detail.links` instrumentation and chip navigation, providing scaffolding for new dialog + unlink verification; shopping list specs already wait on `waitTestEvent` helpers, so additions should reuse those hooks (`tests/e2e/kits/kit-detail.spec.ts:239`, `tests/support/helpers.ts:29`).
- Architecture and testing docs emphasize generated hooks, camelCase adapters, and deterministic instrumentation for Playwright, reinforcing the need to extend existing abstractions (`docs/contribute/architecture/application_overview.md:3`, `docs/contribute/testing/playwright_developer_guide.md:10`, `docs/contribute/testing/index.md:5`).

### 1) Intent & Scope (1–3 short paragraphs)

**User intent**

Design UI work so planners can launch shopping lists from kits and maintain bidirectional linkage visibility between kits and shopping lists.

**Prompt quotes**

"Allow planners to generate or extend purchasing lists from a kit" · "Show chips on kit detail summarizing linked lists with state badge, stale warning when kit updated after snapshot, and unlink affordance" (`docs/epics/kits_feature_breakdown.md:173`, `docs/epics/kits_feature_breakdown.md:198`).

**In scope**

- Kit detail actions, dialogs, and instrumentation that create/append shopping lists and surface linkage metadata.
- Shopping list detail UI showing originating kits with navigation/unlinking, plus supporting hooks and tests.
- Deterministic Playwright coverage and page-object updates tied to the new flows.

**Out of scope**

- Backend schema or API implementation (assumed delivered per epic).
- Non-shopping-list kit flows (pick lists, metadata editing) unless directly impacted by linkage changes.
- Broader shopping list workflows beyond linking (ordering, receiving) unless needed for instrumentation parity.

**Assumptions / constraints**

Backend endpoints (`POST /kits/{kit_id}/shopping-lists`, `GET /kits/{kit_id}/shopping-lists`, `GET /shopping-lists/{list_id}/kits`, `DELETE /kit-shopping-list-links/{link_id}`) and status-filtered list queries exist as described in the epic (`docs/epics/kits_feature_breakdown.md:189`). Existing generated hooks will be regenerated to reflect new schemas, and archived kits should not permit new linkage actions per current UI gating. Honor-reserved must default to enabled (`true`) every time the dialog opens and is not persisted per user or kit.

### 2) Affected Areas & File Map (with repository evidence)

- Area: `src/components/kits/kit-detail.tsx`
  - Why: Add dialog state, trigger actions, mutation orchestration, and enriched instrumentation for linkage metadata.
  - Evidence: `src/components/kits/kit-detail.tsx:27`
- Area: `src/components/kits/kit-detail-header.tsx`
  - Why: Insert new actions (Create/Link), display stale indicators, and wire unlink controls in chip rendering.
  - Evidence: `src/components/kits/kit-detail-header.tsx:155`
- Area: `src/components/shopping-lists/shopping-list-link-chip.tsx`
  - Why: Refactor chip into a composable wrapper that keeps the primary link tap target while exposing a discrete action affordance (e.g., trailing icon button or menu) for unlink and stale tooltips.
  - Evidence: `src/components/shopping-lists/shopping-list-link-chip.tsx:37`
- Area: `src/components/shopping-lists/detail-header-slots.tsx`
  - Why: Surface originating kits on shopping list detail using supplementary/header metadata slots.
  - Evidence: `src/components/shopping-lists/detail-header-slots.tsx:151`
- Area: `src/hooks/use-kit-detail.ts`
  - Why: Expose helper adapters (badge counts, metadata builders) to include new linkage stats and coordinate refetch after mutations.
  - Evidence: `src/hooks/use-kit-detail.ts:33`
- Area: `src/hooks/use-shopping-lists.ts`
  - Why: Reuse/extend overview and mutation helpers for concept list selection and note merging logic.
  - Evidence: `src/hooks/use-shopping-lists.ts:622`
- Area: `src/hooks/use-kit-memberships.ts`
  - Why: Ensure overview badges reflect new link records and stale flags for kit cards.
  - Evidence: `src/hooks/use-kit-memberships.ts:93`
- Area: `src/types/kits.ts`
  - Why: Confirm/adapt `KitShoppingListLink` mapping to include honorReserved, requestedUnits, and stale timestamps for UI display.
  - Evidence: `src/types/kits.ts:162`
- Area: `src/lib/test/form-instrumentation.ts`
  - Why: Leverage existing `trackForm*` hooks for new dialog submissions to keep test taxonomy consistent.
  - Evidence: `src/lib/test/form-instrumentation.ts:22`
- Area: `src/components/layout/detail-screen-layout.tsx`
  - Why: Fit new actions/supplementary blocks within existing layout expectations.
  - Evidence: `src/components/layout/detail-screen-layout.tsx:31`
- Area: `tests/support/page-objects/kits-page.ts`
  - Why: Expose locators and helpers for dialog actions, chips, and unlink flows.
  - Evidence: `tests/support/page-objects/kits-page.ts:41`
- Area: `tests/e2e/kits/kit-detail.spec.ts`
  - Why: Add scenarios covering dialog submission, instrumentation, chip behavior, and unlinking.
  - Evidence: `tests/e2e/kits/kit-detail.spec.ts:239`
- Area: `tests/support/page-objects/shopping-lists-page.ts`
  - Why: Provide selectors and waits for kit linkage chips on shopping list detail.
  - Evidence: `tests/support/page-objects/shopping-lists-page.ts:7`
- Area: `tests/e2e/shopping-lists/shopping-lists-detail.spec.ts`
  - Why: Extend coverage to assert kit chips, navigation, and unlink instrumentation from the list side.
  - Evidence: `tests/e2e/shopping-lists/shopping-lists-detail.spec.ts:6`
- Area: `docs/epics/kits_feature_breakdown.md`
  - Why: Canonical requirements for dialog behavior, linkage chips, and unlink endpoint coordination.
  - Evidence: `docs/epics/kits_feature_breakdown.md:173`

### 3) Data Model / Contracts

- Entity / contract: `KitShoppingListLink`
  - Shape: `{ id, shoppingListId, name, status, isStale, honorReserved, requestedUnits, snapshotKitUpdatedAt, createdAt, updatedAt }`
  - Mapping: Generated schema → camelCase fields already mapped in `mapKitShoppingListLink`; extend downstream consumers to read `isStale`, `honorReserved`, and `requestedUnits`.
  - Evidence: `src/types/kits.ts:162`
- Entity / contract: Kit shopping list mutation payload
  - Shape: `POST /kits/{kit_id}/shopping-lists` body `{ units: number, honor_reserved: boolean, shopping_list_id?: number, note_prefix?: string }`
  - Mapping: Dialog collects `requestedUnits` (default = kit build target) and passes toggled honor-reserved flag; note prefix becomes `[From Kit <name>]: <BOM note>` when merging.
  - Evidence: `docs/epics/kits_feature_breakdown.md:189`
- Entity / contract: Concept list lookup query
  - Shape: `GET /shopping-lists?status=concept` returning list summaries (`id`, `name`, `status`) reused from overview models.
  - Mapping: Reuse `useShoppingListsOverview` but gate on `status` filter once exposed; adapt to provide quick search/select options in dialog.
  - Evidence: `docs/epics/kits_feature_breakdown.md:195`
- Entity / contract: Reciprocal kit chips
  - Shape: `GET /shopping-lists/{list_id}/kits` → `{ kitId, kitName, status, requestedUnits, honorReserved, isStale }[]`
  - Mapping: Add adapter (new hook) to map snake_case schema into UI chip model for shopping list detail header and reuse counts for instrumentation/tooltips.
  - Evidence: `docs/epics/kits_feature_breakdown.md:205`
- Entity / contract: Unlink mutation
  - Shape: `DELETE /kit-shopping-list-links/{link_id}` (204)
  - Mapping: Chip unlink button issues delete, then invalidates kit detail + shopping list detail queries.
  - Evidence: `docs/epics/kits_feature_breakdown.md:207`

### 4) API / Integration Surface

- Surface: `POST /kits/{kit_id}/shopping-lists`
  - Inputs: `{ units, honor_reserved, shopping_list_id?, note_prefix? }` derived from dialog selections.
  - Outputs: Updated link metadata plus full shopping list response (used to refresh caches, badge counts).
  - Errors: Validation (units < 1, target list not concept) surfaced via toast + field error.
  - Evidence: `docs/epics/kits_feature_breakdown.md:189`
- Surface: `GET /kits/{kit_id}/shopping-lists`
  - Inputs: `{ kit_id }` from detail view.
  - Outputs: Chip summaries including `is_stale`, enabling badges/tooltips.
  - Errors: Query failure triggers inline error banner with retry.
  - Evidence: `docs/epics/kits_feature_breakdown.md:205`
- Surface: `GET /shopping-lists?status=concept`
  - Inputs: Query filter `status=concept`.
  - Outputs: Slim list options for dialog dropdown (id/name/status).
  - Errors: Fallback to message inside dialog with retry action.
  - Evidence: `docs/epics/kits_feature_breakdown.md:195`
- Surface: `GET /shopping-lists/{list_id}/kits`
  - Inputs: `{ list_id }` from shopping list detail.
  - Outputs: Linked kit chips with stale indicator.
  - Errors: Header displays warning message and logs instrumentation when unavailable.
  - Evidence: `docs/epics/kits_feature_breakdown.md:205`
- Surface: `DELETE /kit-shopping-list-links/{link_id}`
  - Inputs: `link_id` from chip metadata.
  - Outputs: 204 confirmed removal; UI invalidates caches for both entities.
  - Errors: Conflict/permission errors route through `ApiError` toast and instrumentation.
  - Evidence: `docs/epics/kits_feature_breakdown.md:207`

### 5) Algorithms & UI Flows (step-by-step)

- Flow: Launch kit shopping list dialog
  1. User opens `KitDetail`; header renders actions with `useKitDetail` data (`src/components/kits/kit-detail.tsx:27`).
  2. Clicking “Create shopping list” sets dialog state; dialog mounts, pre-populates units with `detail.buildTarget`, and initializes honor-reserved toggle to ON (resets to ON on each open).
  3. Dialog fetches concept lists (prefetch or in-dialog query) and populates select; toggling existing/new updates form controls while leaving honor-reserved default unchanged unless the user switches it.
  4. Honor-reserved toggle flips calculation strategy (affects note prefix preparation); since the default is ON, users intentionally disable it per submission when needed.
  - States / transitions: `isDialogOpen`, `requestedUnits`, `honorReserved`, `selectionMode`.
  - Hotspots: Avoid rerendering BOM table; lazy-load concept list query when dialog opens.
  - Evidence: `src/components/kits/kit-detail-header.tsx:155`, `src/components/shopping-lists/part/add-to-shopping-list-dialog.tsx:57`

- Flow: Submit kit shopping list mutation
  1. On submit, compute per-line needed: `needed = max(0, requiredPerUnit × units − reservedAdjustments)` using kit contents.
  2. Build payload with selected list or create-new branch (calls backend to create concept list first if needed).
  3. Invoke `usePostKitsShoppingListsByKitId`; on success, invalidate kit detail + membership queries and close dialog.
  4. Instrument `trackFormSubmit/success/error` and emit toast summarizing action.
  - States / transitions: Mutation pending state, toast queue, instrumentation phase.
  - Hotspots: Ensure zero-clamp to prevent negative needed values per epic requirement; guard repeated submits.
  - Evidence: `src/components/kits/kit-detail.tsx:74`, `src/lib/test/form-instrumentation.ts:22`

- Flow: Manage kit linkage chips
  1. After refetch, header chips render sorted by status; stale links show warning badge/tooltip.
  2. Chip actions surface via a trailing icon button (within the chip container but outside the anchor) that opens a confirmation dialog; this keeps navigation and destructive controls separated for accessibility.
  3. On unlink, call delete endpoint, invalidate kit + list queries, update instrumentation metadata counts, and restore focus to the originating trigger.
  - States / transitions: `isStale`, `honorReserved`, unlink confirmation, `activeActionChipId` (tracks focus restore target).
  - Hotspots: Keep keyboard navigation on chips (link wrappers) while ensuring the action button is reachable and announces confirmation context.
  - Evidence: `src/components/kits/kit-detail-header.tsx:155`, `src/components/shopping-lists/shopping-list-link-chip.tsx:37`

- Flow: Shopping list detail linkage visibility
  1. `ShoppingListDetail` fetches kit linkage list (`GET /shopping-lists/{list_id}/kits`) and renders chips in header supplementary region.
  2. Chips navigate back to kit detail, emitting `route` instrumentation; unlink from list side mirrored via DELETE.
  3. UI updates concept toolbar counts if unlink affects active list.
  - States / transitions: `kitChipQuery.status`, header overlays for dialogs, toast responses.
  - Hotspots: Keep detail header pinned while chips overflow; ensure instrumentation on ready/error for Playwright waits.
  - Evidence: `src/routes/shopping-lists/$listId.tsx:612`, `tests/e2e/shopping-lists/shopping-lists-detail.spec.ts:6`

### 6) Derived State & Invariants

- Derived value: `requestedUnits`
  - Source: Dialog state seeded from `detail.buildTarget` (`KitDetail` query).
  - Writes / cleanup: Used to compute payload units; resets when dialog closes (honor-reserved reverts to ON on reopen).
  - Guards: Must remain ≥1; clamp invalid input before submit.
  - Invariant: Dialog never submits units <1 to satisfy backend validation.
  - Evidence: `src/components/kits/kit-detail.tsx:27`

- Derived value: `neededQuantityByContent`
  - Source: Kit contents (`detail.contents`) plus `requestedUnits` and `honorReserved` toggle.
  - Writes / cleanup: Packed into mutation payload per line, appended note prefix when merging; re-evaluated from default-on state each open.
  - Guards: Zero-clamp negatives per epic requirement; skip lines already fully satisfied.
  - Invariant: No negative or fractional quantities reach backend.
  - Evidence: `docs/epics/kits_feature_breakdown.md:180`

- Derived value: `linkageInstrumentationMetadata`
  - Source: `detail.shoppingListLinks` and `detail.pickLists` arrays.
  - Writes / cleanup: Fed to `useUiStateInstrumentation('kits.detail.links', ...)`.
  - Guards: Should reflect updated counts post-mutation/unlink before emitting ready event.
  - Invariant: Counts align with rendered chips to keep Playwright waits deterministic.
  - Evidence: `src/components/kits/kit-detail.tsx:294`

- Derived value: `conceptListOptions`
  - Source: `useShoppingListsOverview` filtered by `status === 'concept'`.
  - Writes / cleanup: Drives select dropdown; resets when dialog closes.
  - Guards: Filter only concept; degrade gracefully if filter query fails.
  - Invariant: Non-concept lists never appear in selection.
  - Evidence: `src/hooks/use-shopping-lists.ts:622`

### 7) State Consistency & Async Coordination

- Source of truth: TanStack Query caches for kit detail (`useGetKitsByKitId`), shopping list detail, and list membership summaries.
- Coordination: Mutation success invalidates `['getKitsByKitId', kitId]`, related membership queries, and, for list-side visibility, `['getShoppingListsByListId', listId]`; unlink mirrors the same invalidations (kit detail, shopping list detail, overview) plus clears `['getShoppingListsOverview']` to refresh concept counts.
- Async safeguards: Guard dialog submit while mutation pending; handle concurrent unlink vs append by awaiting invalidation before re-render.
- Instrumentation: `useUiStateInstrumentation('kits.detail.links', ...)` extended to include stale counts; dialog uses `useFormInstrumentation` for submit/success/error phases powering Playwright waits.
- Evidence: `src/hooks/use-kit-detail.ts:33`, `src/lib/test/ui-state.ts:74`

### 8) Errors & Edge Cases

- Failure: Kit linkage mutation returns validation error (e.g., non-concept target).
  - Surface: Dialog submit button (displays inline error + toast).
  - Handling: Catch `ApiError`, call `trackFormError`, keep dialog open with field error.
  - Guardrails: Disable submit while pending; enforce concept filter pre-submit.
  - Evidence: `src/components/shopping-lists/part/add-to-shopping-list-dialog.tsx:139`

- Failure: Fetching linkage chips fails.
  - Surface: Header chip area shows inline error with retry CTA.
  - Handling: `useListLoadingInstrumentation` emits error metadata; user can retry query.
  - Guardrails: Keep placeholder text so header height consistent.
  - Evidence: `src/components/kits/kit-detail.tsx:97`

- Failure: Unlink DELETE fails (network/409).
  - Surface: Chip action triggers toast + re-enable button.
  - Handling: `trackFormError` instrumentation, restore chip to prevent disappearance.
  - Guardrails: Disable button while pending; revert optimistic removal.
  - Evidence: `src/lib/test/form-instrumentation.ts:72`

- Edge case: Archived kits should not allow new links.
  - Surface: Action button disabled with tooltip like existing edit action.
  - Handling: Check `detail.status === 'archived'` before showing actions.
  - Guardrails: Provide tooltip similar to edit gating.
  - Evidence: `src/components/kits/kit-detail.tsx:175`

### 9) Observability / Instrumentation

- Signal: `kits.detail.links`
  - Type: `ui_state` event.
  - Trigger: After linkage queries settle; metadata extended with `staleCount`, `honorReservedCount`.
  - Labels / fields: `{ kitId, hasLinkedWork, shoppingLists: { count, stale }, pickLists: {...} }`.
  - Consumer: `waitTestEvent` in `kit-detail.spec.ts`.
  - Evidence: `src/components/kits/kit-detail.tsx:74`

- Signal: `KitShoppingList:create`
  - Type: `form` instrumentation (`trackFormSubmit/success/error`).
  - Trigger: Dialog open/submit via `useFormInstrumentation`.
  - Labels / fields: `{ kitId, mode: 'create'|'append', units, honorReserved, targetListId }`.
  - Consumer: Playwright asserts submit/success order in new spec.
  - Evidence: `src/lib/test/form-instrumentation.ts:22`

- Signal: `KitShoppingList:unlink`
  - Type: `form` instrumentation (`trackFormSubmit/success/error`).
  - Trigger: Unlink action button confirms deletion and wraps the delete mutation lifecycle.
  - Labels / fields: `{ kitId, shoppingListId, linkId, trigger: 'kit'|'shoppingList' }` to distinguish entry point.
  - Consumer: New Playwright scenarios wait for submit/success before asserting chip disappearance.
  - Evidence: `src/lib/test/form-instrumentation.ts:22`, `tests/support/page-objects/kits-page.ts:167`

- Signal: `shoppingLists.detail.links`
  - Type: `ui_state`.
  - Trigger: Shopping list detail kit chips query readiness.
  - Labels / fields: `{ listId, linkCount, staleCount }`.
  - Consumer: New Playwright waits in shopping list detail spec.
  - Evidence: `tests/support/helpers.ts:49`

### 10) Lifecycle & Background Work

- Hook / effect: `useKitDetail` query
  - Trigger cadence: On route param change or invalidation.
  - Responsibilities: Fetch kit detail, map to camelCase, supply contents for dialog calculations.
  - Cleanup: React Query handles cache; no manual teardown.
  - Evidence: `src/hooks/use-kit-detail.ts:35`

- Hook / effect: Dialog concept list fetch
  - Trigger cadence: On dialog open (optional lazy fetch).
  - Responsibilities: Load concept lists once, keep cached for reuse.
  - Cleanup: None; rely on query cache TTL.
  - Evidence: `src/hooks/use-shopping-lists.ts:622`

- Hook / effect: Shopping list detail linkage query
  - Trigger cadence: On listId change or invalidation after unlink.
  - Responsibilities: Hydrate kit chips; emit `ui_state` instrumentation.
  - Cleanup: Automatic via query cache.
  - Evidence: `src/routes/shopping-lists/$listId.tsx:612`

### 11) Security & Permissions (if applicable)

- Concern: Prevent linking from archived kits.
  - Touchpoints: Kit detail actions.
  - Mitigation: Disable dialog trigger when `detail.status === 'archived'` and reflect in tooltip copy.
  - Residual risk: Backend should enforce same constraint; UI guard avoids user confusion.
  - Evidence: `src/components/kits/kit-detail.tsx:175`

### 12) UX / UI Impact (if applicable)

- Entry point: `/kits/$kitId`
  - Change: Add “Create shopping list” primary action and enriched chips with stale badges + unlink affordance.
  - User interaction: Dialog captures units/honor reserved; chips show counts & allow removal/navigation.
  - Dependencies: Kit detail header, dialog component, API hooks.
  - Evidence: `src/components/kits/kit-detail-header.tsx:155`

- Entry point: `/shopping-lists/$listId`
  - Change: Header displays originating kit chips with stale badges/unlink buttons.
  - User interaction: Navigate to kit, unlink link from list side.
  - Dependencies: Detail header slots, new linkage hook.
  - Evidence: `src/components/shopping-lists/detail-header-slots.tsx:151`

### 13) Deterministic Test Plan (new/changed behavior only)

- Surface: Kit detail shopping list dialog
  - Scenarios:
    - Given an active kit, When user opens the dialog, Then honor-reserved toggle is ON by default; When they submit creating a new concept list, Then UI emits form submit/success, displays success toast, and chip appears with Concept badge.
    - Given an existing concept list, When user selects it and appends, Then needed quantities merge without duplicates and instrumentation reflects append mode (whether or not the user toggled honor-reserved off for that submission).
  - Instrumentation / hooks: `KitShoppingList:create` form events, `kits.detail.links` ui_state, `waitForListLoading` on overview refresh.
  - Gaps: None.
  - Evidence: `tests/e2e/kits/kit-detail.spec.ts:239`

- Surface: Kit detail unlink chip
  - Scenarios:
    - Given linked chip, When user confirms unlink, Then chip disappears after delete, `KitShoppingList:unlink` emits submit/success, and ui_state metadata decrements counts.
  - Instrumentation / hooks: `KitShoppingList:unlink` form events, `kits.detail.links` ready event, focus helpers for action button.
  - Gaps: None.
  - Evidence: `tests/support/page-objects/kits-page.ts:167`

- Surface: Shopping list detail kit chips
  - Scenarios:
    - Given linked kits, When list detail loads, Then chips render with stale badge if snapshot outdated and navigation to kit works.
    - When unlinking from list side, Then chip disappears and list instrumentation tracks ready state.
  - Instrumentation / hooks: `KitShoppingList:unlink` form events (`trigger: 'shoppingList'`), `shoppingLists.detail.links` ui_state, `waitForListLoading` for detail query.
  - Gaps: None.
  - Evidence: `tests/e2e/shopping-lists/shopping-lists-detail.spec.ts:6`

### 14) Implementation Slices (only if large)

- Slice: Hook & model groundwork
  - Goal: Wrap generated API hooks (list fetch, link mutation, unlink) with typed helpers and update models/instrumentation metadata.
  - Touches: `src/hooks/use-kit-detail.ts`, `src/hooks/use-shopping-lists.ts`, `src/types/kits.ts`.
  - Dependencies: Regenerated API client with new endpoints.

- Slice: Kit detail UI & dialog
  - Goal: Add dialog component, header actions, chip enhancements, and mutation wiring.
  - Touches: `src/components/kits/kit-detail*.tsx`, `src/components/shopping-lists/shopping-list-link-chip.tsx`.
  - Dependencies: Hook groundwork slice.

- Slice: Shopping list detail + tests
  - Goal: Render kit chips on list detail, add unlink/navigation coverage, update page objects and Playwright specs.
  - Touches: `src/components/shopping-lists/detail-*`, `tests/e2e/*`, `tests/support/page-objects/*`.
  - Dependencies: Prior slices to ensure data available.

### 15) Risks & Open Questions

- Risk: Large kits with many contents could cause dialog computations to block main thread.
  - Impact: UI lag while computing needed quantities.
  - Mitigation: Memoize per-content calculations and throttle re-computation to input changes only.

- Risk: Link/unlink races may leave UI momentarily inconsistent if invalidations overlap.
  - Impact: Chips flicker or reappear after unlink.
  - Mitigation: Await mutation promises and re-request linkage query before emitting ready instrumentation.

- Risk: Backend status filter for `GET /shopping-lists` not yet deployed.
  - Impact: Dialog may show non-concept lists.
  - Mitigation: Client-side filter as fallback, document requirement to confirm backend availability.

### 16) Confidence

<confidence_template>Confidence: Medium — backend contracts assumed complete, but dialog calculations and dual-ended unlinking introduce coordination complexity.</confidence_template>
