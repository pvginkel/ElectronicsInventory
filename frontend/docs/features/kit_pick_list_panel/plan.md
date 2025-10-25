# Kit Pick List Panel – Technical Plan

### 0) Research Log & Findings

- Reviewed kit detail container to confirm current instrumentation scopes and modal wiring (`src/components/kits/kit-detail.tsx:37-213`, `src/components/kits/kit-detail.tsx:458-540`).
- Inspected header badge row that renders shopping list and pick list chips plus empty copy (`src/components/kits/kit-detail-header.tsx:220-269`).
- Checked pick list detail header for the reciprocal `KitLinkChip` navigation chip (`src/components/pick-lists/pick-list-detail.tsx:195-205`).
- Examined chip implementations slated for removal to understand routing helpers (`src/components/kits/pick-list-link-chip.tsx:1-62`, `src/components/kits/kit-link-chip.tsx:1-64`).
- Surveyed kit overview card indicators to ensure icon treatment already distinguishes pick list activity (`src/components/kits/kit-card.tsx:65-140`).
- Traced Playwright coverage that currently assumes chips and relies on `kits.detail.links` instrumentation (`tests/e2e/kits/kit-detail.spec.ts:100-205`, `tests/e2e/pick-lists/pick-list-detail.spec.ts:250-320`, `tests/support/page-objects/kits-page.ts:34-133`).
- Re-read `docs/epics/kits_brief.md` for the kit/pick list relationship fundamentals and `docs/contribute/testing/playwright_developer_guide.md:9-10` on instrumentation expectations.

### 1) Intent & Scope

**User intent**

Position pick lists as a kit-scoped workflow by replacing the cross-entity chips with an inline “continue your work” panel that highlights open tasks, tucks completed history behind a collapse, and steers clear of the BOM table visual style.

**Prompt quotes**

"I at least want the chip links gone. They don't make sense."  
"If the chips are gone, we need a replacement."  
"I however don't want it to look like a normal table like what's on the kit detail view already."

**In scope**

- Remove the pick list link chips from the kit header and replace them with a card-style panel that surfaces open pick lists and a collapsed completed section.
- Move the pick list creation CTA into the panel as a “+ Add Pick List” button (mirroring the BOM table pattern) and retire the header action.
- Drop the reciprocal kit link chip from pick list detail while keeping breadcrumb navigation intact.
- Update instrumentation, copy, and tests to align with the new layout and ensure Playwright waits target the new panel.
- Add any supporting UI components, styles, and test selectors needed for the panel design, including refreshed header empty-state messaging.

**Out of scope**

- Changing backend contracts for pick lists or introducing a new completed pick list route.
- Reworking kit overview cards beyond verifying existing pick list indicators still make sense.
- Altering shopping list link behavior or chip styles.

**Assumptions / constraints**

Existing `KitDetail` payloads expose all pick list summary fields required for the panel; no additional API calls are necessary. The kit detail view remains the canonical surface for pick list creation, now driven exclusively by the panel button. Detached completed history beyond the inline collapse is not required in this slice, and archived kits continue to surface the same pick list summaries (links remain active). 

### 2) Affected Areas & File Map (with repository evidence)

- Area: `src/components/kits/kit-detail.tsx`
  - Why: Mounts the body content, manages instrumentation, and controls the pick list creation dialog; will render the new panel and adjust metadata emission.
  - Evidence: src/components/kits/kit-detail.tsx:37-213,458-540
- Area: `src/components/kits/kit-detail-header.tsx`
  - Why: Currently renders shopping and pick list chips plus empty-state copy; needs to drop pick list chips, revise `hasLinkedWork` handling, refresh empty messaging, and remove the header “Create Pick List” action.
  - Evidence: src/components/kits/kit-detail-header.tsx:220-269
- Area: `src/components/kits/pick-list-link-chip.tsx`
  - Why: Becomes unused once chips are removed; either delete or repurpose its routing helper.
  - Evidence: src/components/kits/pick-list-link-chip.tsx:1-62
- Area: `src/components/kits/kit-link-chip.tsx`
  - Why: Only feeds pick list detail; remove alongside chip removal or convert portions into panel utilities.
  - Evidence: src/components/kits/kit-link-chip.tsx:1-64
- Area: `src/components/pick-lists/pick-list-detail.tsx`
  - Why: Must stop rendering the kit chip while preserving breadcrumb navigation back to the kit.
  - Evidence: src/components/pick-lists/pick-list-detail.tsx:195-205
- Area: `src/components/kits/kit-pick-list-panel.tsx` (new)
  - Why: Encapsulate the card-style panel with open/completed sections, CTA buttons, and collapsed history.
  - Evidence: new component implementing panel layout and toggle behavior.
- Area: `src/types/kits.ts`
  - Why: Provide helper(s) for deriving friendly pick list display data if needed, and ensure `KitPickListSummary` mapping stays aligned.
  - Evidence: src/types/kits.ts:293-335
- Area: `tests/support/page-objects/kits-page.ts`
  - Why: Replace chip locators with panel selectors and expose helpers for open/completed list assertions plus the panel’s “+ Add Pick List” button.
  - Evidence: tests/support/page-objects/kits-page.ts:34-133,210-233
- Area: `tests/support/page-objects/pick-lists-page.ts`
  - Why: Remove chip-based helpers and switch navigation assertions to breadcrumb selectors now that the kit chip disappears.
  - Evidence: tests/support/page-objects/pick-lists-page.ts:18-46
- Area: `tests/e2e/kits/kit-detail.spec.ts`
  - Why: Update expectations for link chips, add scenarios covering the new panel and instrumentation.
  - Evidence: tests/e2e/kits/kit-detail.spec.ts:100-205,400-520
- Area: `tests/e2e/pick-lists/pick-list-detail.spec.ts`
  - Why: Remove chip-based navigation assertions and validate breadcrumbs still preserve kit context.
  - Evidence: tests/e2e/pick-lists/pick-list-detail.spec.ts:250-320

### 3) Data Model / Contracts

- Entity / contract: `KitDetail.pickLists`
  - Shape: `{ id, kitId, status: 'open' | 'completed', requestedUnits, openLineCount, completedLineCount, totalQuantityToPick, pickedQuantity, remainingQuantity, createdAt, updatedAt, completedAt }`
  - Mapping: `mapKitPickLists` already normalizes snake_case to camelCase summaries.
  - Evidence: src/types/kits.ts:308-335
- Entity / contract: Pick list detail search params
  - Shape: `buildPickListDetailSearch({ kitId?, status?, search? })` filters/normalizes query parameters for navigation.
  - Mapping: Used today by chips and reusable for panel CTA links.
  - Evidence: src/types/pick-lists.ts:263-281
- Entity / contract: Kit detail instrumentation metadata
  - Shape: `buildLinkReadyMetadata` aggregates shopping and pick list counts; will need trimming to shopping-only and complementing with new panel metadata.
  - Mapping: Derived directly from `KitDetail`.
  - Evidence: src/components/kits/kit-detail.tsx:458-540

### 4) API / Integration Surface

- Surface: `GET /kits/{kit_id}` via `useGetKitsByKitId`
  - Inputs: `{ path: { kit_id } }` provided by route param normalization.
  - Outputs: Kit detail payload including `pick_lists` summary array used to build panel state.
  - Errors: Existing `KitDetailErrorState` handles failures with retry and navigation options.
  - Evidence: src/hooks/use-kit-detail.ts:11-82, src/components/kits/kit-detail.tsx:129-200
- Surface: `POST /kits/{kit_id}/pick-lists` via `usePostKitsPickListsByKitId`
  - Inputs: `{ requested_units }` captured by the create dialog triggered from the panel’s “+ Add Pick List” button.
  - Outputs: Pick list detail snapshot; existing handler refetches kit detail.
  - Errors: Inline validation + toasts already covered in the dialog.
  - Evidence: src/components/kits/kit-pick-list-create-dialog.tsx:35-209
- Surface: `Link to /pick-lists/$pickListId`
  - Inputs: `params.pickListId`, optional search containing kit context via `buildPickListDetailSearch`.
  - Outputs: Navigation into pick list detail while preserving overview search filters.
  - Errors: Router handles missing IDs; pick list detail shows error card on fetch failure.
  - Evidence: src/components/pick-lists/pick-list-detail.tsx:152-210, src/routes/pick-lists/$pickListId.tsx:4-37

### 5) Algorithms & UI Flows (step-by-step)

- Flow: Render pick list panel on kit detail
  1. On successful `useKitDetail` resolution, derive `openPickLists` and `completedPickLists` arrays from `detail.pickLists`.
  2. Render a `Card`-like container with a header (`Pick Lists`), inline “+ Add Pick List” button (matching the BOM card affordance), and instrumentation fire-once when visible; remove the legacy header CTA.
  3. Within the card, map open pick lists to vertically stacked tiles (resume CTA + key metrics). Show empty state messaging if none.
  4. If completed lists exist, render a collapsed disclosure row (`Completed • N`) that toggles visibility of the completed tile stack.
  5. Propagate `kit.status` to disable only the creation button when the kit is archived while keeping existing pick list tiles navigable.
  - States / transitions: Panel visibility tied to query status; collapse state stored in local React state.
  - Hotspots: Keep derived arrays memoized to avoid recomputation on every render.
  - Evidence: src/components/kits/kit-detail.tsx:129-213 (existing ready branch), src/types/kits.ts:308-335

- Flow: Resume pick list from panel
  1. When the user activates a tile or its `Continue picking` button (always enabled, even for archived kits), build a route link via `Link` or `Button asChild`.
  2. Pass `buildPickListDetailSearch({ kitId: detail.id, status: overviewStatus, search: overviewSearch })` to preserve context.
  3. Emit a UI-state instrumentation event noting the pick list ID and action before navigation, enabling deterministic Playwright waits.
  4. Router handles navigation; no extra state mutation required.
  - States / transitions: No local state change beyond optional focus management.
  - Hotspots: Ensure instrumentation runs once per click to avoid duplicate events.
  - Evidence: src/components/pick-lists/pick-list-detail.tsx:152-205 (current navigation pattern), src/types/pick-lists.ts:263-281

- Flow: Toggle completed pick lists section
  1. Guard render behind `completedPickLists.length > 0`.
  2. Default collapse state to `false` (collapsed); clicking the header toggles `isCompletedExpanded`.
  3. When expanded, render completed tiles with subdued styling; include timestamp/status but no CTA.
  4. Emit instrumentation on expand/collapse capturing total count for Playwright waits.
  - States / transitions: Local boolean state; tie `aria-expanded` to state for accessibility.
  - Hotspots: Ensure toggling doesn’t trigger refetch; rely solely on local state.
  - Evidence: new component logic referencing `KitPickListSummary.completedAt`

### 6) Derived State & Invariants

- Derived value: `openPickLists`
  - Source: `detail.pickLists.filter((item) => item.status === 'open')` from `KitDetail`.
  - Writes / cleanup: Drives rendering of resume tiles; no cache writes.
  - Guards: Requires `detail` to be defined; defaults to empty array when kit not loaded.
  - Invariant: All entries must report `openLineCount > 0` or `remainingQuantity > 0` to justify “continue” CTA, and tiles remain clickable even when the kit is archived.
  - Evidence: src/types/kits.ts:308-335

- Derived value: `completedPickLists`
  - Source: `detail.pickLists.filter((item) => item.status === 'completed')`.
  - Writes / cleanup: Populates collapse content; no external mutations.
  - Guards: Only render collapse trigger when length > 0.
  - Invariant: Completed entries must have `completedAt !== null` to show completion timestamp; fallback gracefully if missing.
  - Evidence: src/types/kits.ts:308-335

- Derived value: `canCreatePickList`
  - Source: `detail.status === 'active'`.
  - Writes / cleanup: Enables/disables the panel’s “+ Add Pick List” button; reuses existing gating while the header CTA is removed.
  - Guards: When false, annotate button with archived tooltip or disable; do not affect resume links.
  - Invariant: Archived kits never surface creation affordances but continue to show navigation into existing pick lists.
  - Evidence: src/components/kits/kit-detail.tsx:150-176

- Derived value: `pickListPanelMetadata`
  - Source: `detail.id`, open/completed lengths, last updated timestamps.
  - Writes / cleanup: Fed into `useUiStateInstrumentation` for `'kits.detail.pickLists.panel'`.
  - Guards: Emit only once detail is loaded.
  - Invariant: Metadata matches rendered counts for deterministic waits.
  - Evidence: src/components/kits/kit-detail.tsx:458-540 (pattern to follow)

### 7) State Consistency & Async Coordination

- Source of truth: `useGetKitsByKitId` query underpins kit detail, including pick lists (`src/hooks/use-kit-detail.ts:11-82`).
- Coordination: Derived `open`/`completed` arrays computed via `useMemo` inside the panel to stay in lockstep with query data.
- Async safeguards: Continue relying on React Query status for loading/empty/error handling; panel renders skeleton/empty states based on `isPending` handled upstream.
- Instrumentation: Replace current `'kits.detail.links'` metadata with shopping-list-only counts and add `'kits.detail.pickLists.panel'` + `'kits.detail.pickLists.toggle'` scopes so Playwright waits remain deterministic.
- Evidence: src/components/kits/kit-detail.tsx:95-176,458-540

### 8) Errors & Edge Cases

- Failure: Kit detail fetch error
  - Surface: `KitDetailErrorState`
  - Handling: Existing error card with retry and navigation options remains; panel should not render when detail missing.
  - Guardrails: Condition panel rendering on `detail` truthiness.
  - Evidence: src/components/kits/kit-detail.tsx:203-259

- Failure: No pick lists linked yet
  - Surface: New panel empty state
  - Handling: Show friendly message with explanation and primary CTA (disabled if kit archived).
  - Guardrails: Ensure instrumentation reflects zero counts to keep tests accurate.
  - Evidence: Panel implementation (new) informed by `KitDetailHeader` current empty copy (`src/components/kits/kit-detail-header.tsx:266-269`)

- Failure: Completed section missing `completedAt`
  - Surface: Completed tile formatting
  - Handling: Fall back to `updatedAt` or “Completed” label only; avoid runtime errors.
  - Guardrails: Defensive formatting helper inside panel.
  - Evidence: Data fields available in `KitPickListSummary` (`src/types/kits.ts:308-335`)
- Failure: Archived kit navigation
  - Surface: Panel open/completed tiles
  - Handling: Keep tiles rendered and their links active so users can review existing pick lists; only disable the “+ Add Pick List” button with a tooltip explaining archived gating.
  - Guardrails: Ensure resume links still call `buildPickListDetailSearch` with archived status so breadcrumbs stay consistent.
  - Evidence: Existing chips allow navigation regardless of kit status (`src/components/kits/pick-list-link-chip.tsx:22-61`)

### 9) Observability / Instrumentation

- Signal: `kits.detail.pickLists.panel`
  - Type: instrumentation event (`useUiStateInstrumentation`)
  - Trigger: When kit detail loads and panel data is ready.
  - Labels / fields: `{ kitId, openCount, completedCount, hasOpenWork }`
  - Consumer: `waitForUiState` helper in Playwright for deterministic waits.
  - Evidence: Pattern from `useUiStateInstrumentation` usage (`src/components/kits/kit-detail.tsx:95-176`)

- Signal: `kits.detail.pickLists.toggle`
  - Type: instrumentation event (`emitTestEvent` via helper)
  - Trigger: On completed section expand/collapse.
  - Labels / fields: `{ kitId, completedCount, expanded }`
  - Consumer: New Playwright assertions ensuring collapse control works deterministically.
  - Evidence: Existing UI-state emission pattern (`src/components/kits/kit-detail.tsx:95-176`)

- Signal: `kits.detail.links`
  - Type: instrumentation event (existing)
  - Trigger: Continue emitting but metadata trimmed to shopping list context only to avoid test drift.
  - Labels / fields: `{ kitId, shoppingLists: {...} }`
  - Consumer: Existing Playwright waits.
  - Evidence: src/components/kits/kit-detail.tsx:458-540

### 10) Lifecycle & Background Work

- Hook / effect: `useEffect` closing pick list dialog when kit becomes inactive
  - Trigger cadence: Runs on `detail` change.
  - Responsibilities: Keeps create dialog closed if kit archived; no change required but ensure panel respects same conditions.
  - Cleanup: Default React effect cleanup handles state reset.
  - Evidence: src/components/kits/kit-detail.tsx:178-187

- Hook / effect: `useGetKitsByKitId` query
  - Trigger cadence: Fetch on mount/kitId change, refetch after mutations.
  - Responsibilities: Supplies panel data and ensures stale data refreshed after pick list creation.
  - Cleanup: React Query handles cache lifecycle.
  - Evidence: src/hooks/use-kit-detail.ts:11-82

### 11) Security & Permissions (if applicable)

Not applicable — existing archived-kit gating already disables pick list creation and will also gate panel CTAs (`src/components/kits/kit-detail.tsx:150-176`).

### 12) UX / UI Impact (if applicable)

- Entry point: `/kits/$kitId`
  - Change: Replace pick list chips with a card-like panel featuring task-oriented tiles, a “+ Add Pick List” button, and collapsed history.
  - User interaction: Users immediately see outstanding pick lists with resume actions; completed history is one click away; creation now happens from the panel instead of the header.
  - Dependencies: Relies on `KitDetail` data/queries and the existing create dialog.
  - Evidence: src/components/kits/kit-detail.tsx:129-213 (render target)

- Entry point: `/pick-lists/$pickListId`
  - Change: Remove kit link chip while keeping breadcrumb link back to kit.
  - User interaction: Navigation back relies on breadcrumb trail instead of chip.
  - Dependencies: Breadcrumb construction already uses kit metadata.
  - Evidence: src/components/pick-lists/pick-list-detail.tsx:152-205

### 13) Deterministic Test Plan (new/changed behavior only)

- Surface: Kit detail pick list panel
  - Scenarios:
    - Given a kit with no pick lists, When the detail loads, Then the panel shows an empty state and the “+ Add Pick List” button is present (disabled for archived kits).
    - Given a kit with open pick lists, When the panel renders, Then each tile shows resume button, requested units, and outstanding counts, and the instrumentation event fires.
    - Given completed pick lists exist, When the user toggles the completed section, Then tiles become visible/hidden and toggle instrumentation reflects the expanded state.
    - Given the header renders, When the page loads, Then the legacy header “Create Pick List” action does not exist.
  - Instrumentation / hooks: Wait on `waitForUiState(page, 'kits.detail.pickLists.panel', 'ready')`; use new `data-testid` values like `kits.detail.pick-lists.panel`, `kits.detail.pick-lists.add`, `kits.detail.pick-lists.open`, `kits.detail.pick-lists.completed.toggle`, and assert `kits.detail.links` metadata only reports shopping lists.
  - Gaps: None planned.
  - Evidence: tests/e2e/kits/kit-detail.spec.ts:437-520 (existing chip assertions to replace)

- Surface: Pick list detail navigation
  - Scenarios:
    - Given navigation from kit detail, When the user resumes a pick list, Then the detail breadcrumb still links back to the originating kit and no chip renders.
    - Given an archived kit, When the user resumes a pick list from the panel, Then navigation succeeds and breadcrumbs still render (chip remains absent).
    - Given direct deep link with search params, When the page loads, Then breadcrumbs respect preserved status/search parameters.
  - Instrumentation / hooks: Existing list loading waits; assert absence of `pick-lists.detail.kit-chip` and rely on breadcrumb selector from the updated page object.
  - Gaps: None.
  - Evidence: tests/e2e/pick-lists/pick-list-detail.spec.ts:250-330

### 14) Implementation Slices (only if large)

- Slice: Header cleanup & instrumentation update
  - Goal: Remove pick list chips, adjust empty copy, retire the header “Create Pick List” action, and keep shopping list instrumentation intact.
  - Touches: `src/components/kits/kit-detail-header.tsx`, `src/components/kits/kit-detail.tsx`, chip component deletions.
  - Dependencies: None.

- Slice: Pick list panel component & wiring
  - Goal: Introduce panel UI, derive state, wire instrumentation, expose the “+ Add Pick List” button, and hook up routing.
  - Touches: `src/components/kits/kit-pick-list-panel.tsx`, `src/components/kits/kit-detail.tsx`, potential helpers in `src/types/kits.ts`.
  - Dependencies: Header cleanup to avoid duplicate pick list representations.

- Slice: Playwright & page object updates
  - Goal: Align tests and selectors with new UI/telemetry, including pick list detail assertions.
  - Touches: `tests/support/page-objects/kits-page.ts`, `tests/support/page-objects/pick-lists-page.ts`, `tests/e2e/kits/kit-detail.spec.ts`, `tests/e2e/pick-lists/pick-list-detail.spec.ts`.
  - Dependencies: Panel selectors and instrumentation must exist.

### 15) Risks & Open Questions

- Risk: Large numbers of completed pick lists could make the expanded section unwieldy.
  - Impact: Scroll-heavy UI might frustrate operators.
  - Mitigation: Apply max-height with internal scroll or limit initial render count with “Show more” pattern if telemetry indicates volume issues later.

- Risk: Removing chips may break unverified navigation flows or bookmarks that relied on chip selectors.
  - Impact: Playwright failures or user confusion.
  - Mitigation: Ensure breadcrumbs retain navigation utility and update tests accordingly.

- Open question: Should the completed collapse remember its last state per kit?
  - Why it matters: Persisting expansion might improve UX for frequent auditors.
  - Owner / follow-up: Product/UX alignment after first iteration; defaulting to collapsed for launch.

### 16) Confidence

Confidence: Medium — UI/layout refactors touch multiple tests and instrumentation scopes, but data contracts remain unchanged.
