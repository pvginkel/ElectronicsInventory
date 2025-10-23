### 0) Research Log & Findings
- Captured order stock dialog, linkage chip, and unlink requirements from docs/epics/kits_feature_breakdown.md:186-225 and reconciled toggle defaults with the original brief in docs/epics/kits_brief.md:65-88.
- Revisited architecture and instrumentation expectations to stay within existing React/TanStack patterns and test-mode hooks in docs/contribute/architecture/application_overview.md:1-34, docs/contribute/architecture/test_instrumentation.md:1-77, docs/contribute/testing/playwright_developer_guide.md:80-138, and docs/contribute/testing/index.md:5-16.
- Inspected current kit detail layout, header actions, and instrumentation to understand integration points at src/components/kits/kit-detail.tsx:28-169 and src/components/kits/kit-detail-header.tsx:119-209.
- Reviewed shopping list header composition and route usage to plan chip rendering on the opposite side via src/components/shopping-lists/detail-header-slots.tsx:1-200 and src/routes/shopping-lists/$listId.tsx:529-626.
- Audited generated API hooks and chip schemas for kit/list linkage endpoints at src/lib/api/generated/hooks.ts:720-1034, src/lib/api/generated/hooks.ts:1968-1980, src/lib/api/generated/types.ts:2568-2634, and src/lib/api/generated/types.ts:3863-3960.
- Examined domain types, selector utilities, and the existing shopping list chip implementation (src/types/kits.ts:320-346; src/components/shopping-lists/shopping-list-link-chip.tsx:1-64; src/hooks/use-shopping-lists.ts:646-702) to identify extension points.
- Identified current Playwright coverage, page objects, and factory helpers that need updates for deterministic tests in tests/e2e/kits/kit-detail.spec.ts:1-200, tests/e2e/shopping-lists/shopping-lists-detail.spec.ts:1-160, tests/support/page-objects/kits-page.ts:1-200, tests/support/page-objects/shopping-lists-page.ts:1-200, tests/api/factories/kit-factory.ts:1-200, and tests/api/factories/shopping-list-factory.ts:1-200.

### 1) Intent & Scope (1–3 short paragraphs)

**User intent**

Enable kit owners to push shortages into shopping lists through a guided “Order Stock” dialog while keeping kits and shopping lists cross-linked, visible, and unlinkable from either detail screen with deterministic instrumentation.

**Prompt quotes**

"Present dialog with Order-for-N control defaulting to kit build target and an Honor-reserved toggle rendered as a pill-style slider defaulting to ON."  
"Support creating a new Concept shopping list or appending to an existing Concept list, merging quantities when lines already exist once the shared Order Stock modal enabler lands."  
"Allow unlinking with a Lucide “unlink” icon anchored on each chip; the icon remains hidden until the chip is hovered or focused, then opens a confirmation dialog, and confirmed removals delete the association while leaving list contents untouched."

**In scope**

- Add an `Order Stock` action on kit detail that opens a modal collecting units, honor-reserved preference, and target concept list while previewing net shortages.
- Extend kit detail shopping list chips to surface requested units / honor-reserved metadata, expose an unlink affordance, and refresh instrumentation after mutations.
- Render originating kit chips inside shopping list detail, showing kit status/units, and support unlinking from that surface with shared confirmation handling.
- Update React Query hooks, domain types, and Playwright coverage (including factories/page objects) so the flow is deterministic and exercises the documented APIs.

**Out of scope**

- Pick list creation or execution flows described in the adjacent feature slice.
- Backend schema or API adjustments beyond the documented endpoints.
- Staleness warning UI for `snapshot_kit_updated_at` (explicitly deferred in this feature).

**Assumptions / constraints**

Honor-reserved default is confirmed ON per the latest breakdown and product guidance; tests and preview math must assert that default (docs/epics/kits_brief.md:65-75; docs/epics/kits_feature_breakdown.md:194-205). The kit detail payload already carries `shoppingListLinks`, so the modal can reuse loaded contents and avoid extra fetches until submission; shopping list options continue to filter to concept lists via the existing selector (src/hooks/use-shopping-lists.ts:646-702). Archived kits remain read-only, so both the button and unlink affordance must guard against that state (docs/epics/kits_brief.md:154-158).

### 2) Affected Areas & File Map (with repository evidence)

- Area: src/components/kits/kit-detail.tsx
- Why: Manage `Order Stock` dialog state, feed preview data, trigger mutations, and emit instrumentation.
- Evidence: src/components/kits/kit-detail.tsx:28-169 — current layout renders header/content and instrumentation without modal controls.

- Area: src/components/kits/kit-detail-header.tsx
- Why: Inject the `Order Stock` action, enrich chip metadata, and host unlink affordance parity alongside Edit.
- Evidence: src/components/kits/kit-detail-header.tsx:165-207 — header currently renders shopping list chips and a single edit button.

- Area: src/components/kits/kit-order-stock-dialog.tsx (new)
- Why: Encapsulate modal UI, form state, preview math, API wiring, and form instrumentation for the order stock flow.
- Evidence: docs/epics/kits_feature_breakdown.md:192-210 — dialog fields, backend contract, and merge rules to satisfy.

- Area: src/components/shopping-lists/shopping-list-link-chip.tsx
- Why: Restructure chip markup to expose unlink buttons, display requested units / honor-reserved hints, and maintain navigation.
- Evidence: src/components/shopping-lists/shopping-list-link-chip.tsx:1-64 — current chip is a simple link without metadata or actions.

- Area: src/components/shopping-lists/kit-link-chip.tsx (new)
- Why: Provide mirrored visual + unlink affordance for kits shown on shopping list detail.
- Evidence: docs/epics/kits_feature_breakdown.md:215-225 — reciprocal chip requirements for shopping list screens.

- Area: src/components/shopping-lists/detail-header-slots.tsx
- Why: Surface kit chips (and confirmation overlays) within the header `supplementary`/`metadataRow` slots.
- Evidence: src/components/shopping-lists/detail-header-slots.tsx:1-200 — header builder currently lacks kit linkage awareness.

- Area: src/routes/shopping-lists/$listId.tsx
- Why: Fetch kit linkage data, wire unlink handlers, and pass props into the header slots with instrumentation.
- Evidence: src/routes/shopping-lists/$listId.tsx:529-626 — route composes header slots and needs to request additional data.

- Area: src/hooks/use-kit-detail.ts
- Why: Expose helper getters (e.g., aggregates) to drive order stock preview and support refetching after mutations.
- Evidence: src/hooks/use-kit-detail.ts:24-120 — current hook yields aggregates and instrumentation metadata without order-stock helpers.

- Area: src/hooks/use-kit-shopping-list-links.ts (new)
- Why: Wrap `usePostKitsShoppingListsByKitId`, `useGetKitsShoppingListsByKitId`, and `useDeleteKitShoppingListLinksByLinkId` with cache invalidation helpers.
- Evidence: src/lib/api/generated/hooks.ts:720-1034 — generated mutations/queries to orchestrate.

- Area: src/hooks/use-shopping-lists.ts
  - Why: Ensure selector instrumentation scope + status filtering align with the modal’s needs and expose helper for concept-only usage.
  - Evidence: src/hooks/use-shopping-lists.ts:646-702 — selector currently filters concept lists and emits instrumentation metadata.

- Area: src/components/shopping-lists/shopping-list-selector.tsx
  - Why: Reuse the existing selector (with embedded `ListCreateDialog`) for Concept list creation/selection and make sure the new `kits.orderStock.lists` scope plugs into its instrumentation props.
  - Evidence: src/components/shopping-lists/shopping-list-selector.tsx:51-215 — control already handles inline creation, instrumentation, and option filtering.

- Area: src/types/kits.ts
- Why: Extend/link helper functions (e.g., computed labels) for `KitShoppingListLink` to include requested units and honor-reserved flags.
- Evidence: src/types/kits.ts:320-346 — existing mapper already captures baseline fields to extend.

- Area: src/types/shopping-lists.ts
- Why: Introduce a typed representation of linked kits for shopping list detail and share display helpers.
- Evidence: src/lib/api/generated/types.ts:2568-2634 — backend schema for kit chips the UI must adapt.

- Area: tests/e2e/kits/kit-detail.spec.ts
- Why: Add scenarios covering modal submission (create/append), chip metadata, and unlinking with instrumentation waits.
- Evidence: tests/e2e/kits/kit-detail.spec.ts:1-200 — current coverage stops at read-only detail assertions.

- Area: tests/e2e/shopping-lists/shopping-lists-detail.spec.ts
- Why: Exercise kit chip rendering on shopping list detail, unlink flow, and instrumentation expectations.
- Evidence: tests/e2e/shopping-lists/shopping-lists-detail.spec.ts:1-160 — existing tests focus on badges and seller workflows.

- Area: tests/support/page-objects/kits-page.ts
- Why: Add selectors for the new button, dialog, chip metadata, and unlink control to keep specs readable.
- Evidence: tests/support/page-objects/kits-page.ts:1-200 — page object currently lacks references to new UI.

- Area: tests/support/page-objects/shopping-lists-page.ts
- Why: Provide helpers for kit chips and unlink actions within shopping list detail.
- Evidence: tests/support/page-objects/shopping-lists-page.ts:1-200 — present methods stop at concept/ready toolbars.

- Area: tests/api/factories/kit-factory.ts
- Why: Add helpers to push kit contents into shopping lists via API for deterministic setup.
- Evidence: tests/api/factories/kit-factory.ts:1-200 — factory already handles content add/update and can expand to linking.

- Area: tests/api/factories/shopping-list-factory.ts
- Why: Supply utilities to fetch kits linked to a list and assert notes/quantities after merges.
- Evidence: tests/api/factories/shopping-list-factory.ts:1-200 — factory currently covers concept/ready transitions without kit linkage helpers.

### 3) Data Model / Contracts

- Entity / contract: `KitShoppingListLink`
  - Shape: `{ id: number; shoppingListId: number; name: string; status: ShoppingListStatus; requestedUnits: number; honorReserved: boolean; snapshotKitUpdatedAt: string; createdAt: string; updatedAt: string }`
  - Mapping: Reuse `mapKitShoppingListLink` to camelCase generated schema fields and extend with helper getters for labels (`requestedUnits`, honor badges).
  - Evidence: src/types/kits.ts:332-344 — existing mapper surfaces the required fields from the detail response.

- Entity / contract: `ShoppingListKitLink`
  - Shape: `{ id: number; kitId: number; kitName: string; kitStatus: 'active' | 'archived'; requestedUnits: number; honorReserved: boolean; isStale: boolean; snapshotKitUpdatedAt: string; createdAt: string; updatedAt: string }`
  - Mapping: New adapter in `src/types/shopping-lists.ts` converts `KitChipSchema` into a UI-friendly model with derived badges.
  - Evidence: src/lib/api/generated/types.ts:2568-2634 — backend schema enumerating kit chip fields.

- Entity / contract: `OrderStockFormState`
  - Shape: `{ mode: 'create' | 'append'; units: number; honorReserved: boolean; targetListId?: number; notePrefix?: string }`
  - Mapping: Local form state normalises numeric input, uses `mode` to gate selector vs create, and maps to `KitShoppingListRequestSchema` payload while snapshotting values for instrumentation. Creation reuses `ShoppingListSelector`, which wraps `ListCreateDialog`; once a Concept list is created/selected the selector supplies the existing list ID to the form, so no inline `new_list_*` fields are passed from the dialog.
  - Evidence: docs/epics/kits_feature_breakdown.md:192-210; docs/epics/kits_brief.md:65-75; src/components/shopping-lists/shopping-list-selector.tsx:51-190 — dialog fields, honor-reserved logic, selector-driven creation, and merge prefix expectations.

### 4) API / Integration Surface

- Surface: `POST /api/kits/{kit_id}/shopping-lists` (`usePostKitsShoppingListsByKitId`)
  - Inputs: `{ path: { kit_id }, body: { units, honor_reserved, shopping_list_id? } }` derived from modal state.
  - Outputs: `KitShoppingListLinkResponseSchema` with `link` metadata plus updated shopping list payload to refresh caches.
  - Errors: Validation (400) for invalid units/list, conflict when list status not concept; surface via toast + form instrumentation.
  - Evidence: src/lib/api/generated/hooks.ts:1008-1034.

- Surface: `GET /api/kits/{kit_id}/shopping-lists` (`useGetKitsShoppingListsByKitId`)
  - Inputs: `{ path: { kit_id } }` invoked to refresh chip list if we decouple from detail query.
  - Outputs: `KitShoppingListChipSchema[]` used to render chips and instrumentation metadata.
  - Errors: Query error instrumentation cascades to kit detail fallback.
  - Evidence: src/lib/api/generated/hooks.ts:992-1006.

- Surface: `GET /api/shopping-lists/{list_id}/kits` (`useGetShoppingListsKitsByListId`)
  - Inputs: `{ path: { list_id } }` triggered inside shopping list detail route.
  - Outputs: `KitChipSchema[]` mapped into `ShoppingListKitLink` models for chip rendering.
  - Errors: Propagate via toast + UI state instrumentation fallback.
  - Evidence: src/lib/api/generated/hooks.ts:1968-1980.

- Surface: `DELETE /api/kit-shopping-list-links/{link_id}` (`useDeleteKitShoppingListLinksByLinkId`)
  - Inputs: `{ path: { link_id } }` from chip unlink confirmation.
  - Outputs: `204` with no body; we optimistically remove the chip then invalidate caches.
  - Errors: Conflict when backend guards (e.g., link already removed); show toast/error instrumentation.
  - Evidence: src/lib/api/generated/hooks.ts:720-744.

### 5) Algorithms & UI Flows (step-by-step)

- Flow: Launch order stock modal from kit detail
  1. User clicks `Order Stock`; we gate on `detail.status !== 'archived'` before opening.
  2. Dialog initialises form state (`units = max(kit.buildTarget, 1)`, `honorReserved = true`) and snapshots fields for instrumentation.
 3. Concept list selector loads via `useShoppingListOptions({ statuses: ['concept'] })`; the embedded `ShoppingListSelector` handles inline Concept-list creation through its `ListCreateDialog` and returns the resulting list ID, so the form only tracks a `targetListId` once the selector resolves. Modal shows computed preview text (`totalParts`, `totalNeeded`) based on contents.
  4. Instrumentation emits `KitShoppingList:orderStock` `open` plus `kits.detail.orderStock` UI state `loading → ready` once preview resolves.
  - States / transitions: Dialog `open` boolean, `mode` toggles between create/append, React Query statuses for list options.
  - Hotspots: Avoid recomputing preview on every keystroke by memoising against `units`/`honorReserved`; ensure numeric inputs clamp to ≥1.
  - Evidence: docs/epics/kits_feature_breakdown.md:192-205; src/components/kits/kit-detail.tsx:28-169.

- Flow: Submit order stock (create or append)
  1. Form `submit` validates `units` and requires that `targetListId` be present (supplied by `ShoppingListSelector` after creating/selecting a Concept list); validation errors emit `validation_error` events and keep dialog open.
  2. On success path, call `usePostKitsShoppingListsByKitId` mutation with resolved payload, disable controls, and emit `submit` instrumentation snapshotting `units`/`mode`.
  3. Await response, close dialog, toast success (`Created new list` vs `Updated existing list`), and invalidate kit detail query plus relevant shopping list detail and `getShoppingListsKitsByListId` entries for the affected list.
  4. Recompute instrumentation metadata (`kits.detail.links` ready event includes new counts) and restore focus to the `Order Stock` button.
  - States / transitions: Mutation pending state, toast feedback, React Query cache refresh.
  - Hotspots: `KitShoppingListLinkResponse` may omit `link` on no-op merges; guard against null when updating chips.
  - Evidence: src/lib/api/generated/hooks.ts:992-1034; tests/support/page-objects/kits-page.ts:1-200.

- Flow: Render & manage kit detail shopping list chips
  1. Map `kit.detail.shoppingListLinks` into view models with badges for `status`, `requestedUnits`, and honor reserved indicator.
  2. Each chip renders navigation plus a visually-hidden unlink button that appears on hover/focus; clicking opens confirmation dialog.
  3. Confirmation triggers delete mutation; upon success we optimistically remove the link, emit toast, refetch kit detail, and invalidate corresponding `getShoppingListsKitsByListId` cache entries to keep both headers in sync.
  4. UI state instrumentation updates `kits.detail.links` metadata and ensures empty-state text toggles when last link removed.
  - States / transitions: Chip hover/focus, confirmation dialog open, mutation pending.
  - Hotspots: Maintain accessibility by exposing keyboard focus to the unlink button and ensuring the link remains clickable.
  - Evidence: src/components/kits/kit-detail-header.tsx:165-207; docs/epics/kits_feature_breakdown.md:215-225.

- Flow: Surface kit chips on shopping list detail + unlink
  1. Shopping list route fetches kit links via `useGetShoppingListsKitsByListId`; header renders chips with kit status badges and units summary.
  2. Unlink button reuses confirmation component and delete mutation, followed by invalidating shopping list detail, `getKitsByKitId`, `getKitsShoppingListsByKitId`, and `getShoppingListsKitsByListId` queries referenced in chips.
  3. UI updates instrumentation scope `shoppingLists.detail.kits` to help tests wait for ready/error states.
  4. When no linked kits remain, header shows informative empty copy or hides the section.
  - States / transitions: Query loading/pending, confirmation dialog, mutation pending.
  - Hotspots: Keep chip layout responsive within header, especially when many kits link to the same list.
  - Evidence: src/components/shopping-lists/detail-header-slots.tsx:1-200; src/routes/shopping-lists/$listId.tsx:529-626.

### 6) Derived State & Invariants

- Derived value: `defaultOrderUnits`
  - Source: `detail.buildTarget` from `useKitDetail`.
  - Writes / cleanup: Seeds form state when dialog opens; resets when kit changes or dialog closes.
  - Guards: Clamp to minimum of 1 to satisfy integer-only constraint.
  - Invariant: Dialog never submits units < 1.
  - Evidence: docs/epics/kits_brief.md:65-75; src/hooks/use-kit-detail.ts:24-120.

- Derived value: `orderPreviewTotals`
  - Source: Reduce `detail.contents` into `{ partCount, totalNeeded, totalZeroed }` using formula `max(0, (requiredPerUnit * units) - available)`; `available` switches between `row.available` vs `row.inStock` based on honor toggle.
  - Writes / cleanup: Displayed in modal summary and instrumentation metadata.
  - Guards: Memoise against `[units, honorReserved, contents]`; skip computation when contents empty.
  - Invariant: Preview never shows negative or fractional totals.
  - Evidence: docs/epics/kits_brief.md:72-75; src/types/kits.ts:320-346.

- Derived value: `sortedShoppingLinks`
  - Source: `kit.detail.shoppingListLinks` sorted by status/name.
  - Writes / cleanup: Feeds chip rendering order and instrumentation metadata.
  - Guards: Maintain stable order after optimistic updates to prevent flicker.
  - Invariant: Concept links appear before ready/done to prioritize actionable chips.
  - Evidence: src/components/kits/kit-detail-header.tsx:165-188.

- Derived value: `canOrderStock`
  - Source: `detail.status` and availability of `detail.contents`.
  - Writes / cleanup: Disables button when archived or no contents.
  - Guards: Re-evaluate on query refetch or mutation success.
  - Invariant: Archived kits cannot open the dialog.
  - Evidence: docs/epics/kits_brief.md:154-158; src/components/kits/kit-detail.tsx:82-141.

### 7) State Consistency & Async Coordination

- Source of truth: React Query caches for `getKitsByKitId`, `getKitsShoppingListsByKitId`, `getShoppingListsByListId`, and `getShoppingListsKitsByListId`.
- Coordination: Order stock mutation invalidates kit detail + overview caches; when response includes `shopping_list`, explicitly update that list’s detail cache and invalidate `getShoppingListsKitsByListId({ list_id })` to keep both headers in sync.
- Async safeguards: Track mutation pending state to disable controls; cancel inflight selector fetches when dialog closes; ensure unlink confirmation restores focus to chip group.
- Instrumentation: Extend `kits.detail.links` metadata with counts/ids post-refresh and add `kits.detail.orderStock` UI state scope; shopping list side emits paired `shoppingLists.detail.kits` `list_loading` + `ui_state` events for Playwright waits.
- Evidence: src/hooks/use-kit-detail.ts:24-120; src/lib/api/generated/hooks.ts:720-1034; src/routes/shopping-lists/$listId.tsx:529-626.

### 8) Errors & Edge Cases

- Failure: Units input < 1 or non-integer
  - Surface: Kit order stock dialog
  - Handling: Inline validation message, `trackValidationError` emission, prevent submission.
  - Guardrails: Clamp parsed value ≥1; disable submit when invalid.
  - Evidence: docs/epics/kits_brief.md:154-155; src/components/kits/kit-metadata-dialog.tsx:112-188 (pattern for inline validation).

- Failure: Append mode without selecting a concept list
  - Surface: Kit order stock dialog
  - Handling: Show error near selector, emit validation event, keep dialog open.
  - Guardrails: Require `targetListId` when `mode === 'append'`; disable submit otherwise.
  - Evidence: docs/epics/kits_feature_breakdown.md:196-212; src/hooks/use-shopping-lists.ts:646-702 (selector instrumentation).

- Failure: Mutation conflict (e.g., archived kit, non-concept list, backend guard)
  - Surface: Order stock submit / unlink confirmation
  - Handling: Catch API error, emit toast + `trackFormError`, keep dialog open or restore chip state.
  - Guardrails: Optimistically revert local updates on error; log metadata for debugging.
  - Evidence: src/lib/api/generated/hooks.ts:720-1034; src/components/kits/kit-metadata-dialog.tsx:165-238.

- Failure: Delete link after it already vanished
  - Surface: Unlink confirmation (kit or shopping list)
  - Handling: Detect 404/409, show warning toast, refetch queries to sync UI.
  - Guardrails: Use mutation `onError` to invalidate caches; keep chip hidden after failure recovery.
  - Evidence: docs/epics/kits_feature_breakdown.md:219-225; tests/support/page-objects/kits-page.ts:1-200.

### 9) Observability / Instrumentation

- Signal: `kits.detail.orderStock`
  - Type: `ui_state`
  - Trigger: `loading` when dialog opens, `ready` once preview + selector settle, `error` on mutation failure relayed through list loading scope.
  - Labels / fields: `{ kitId, units, honorReserved, mode }`
  - Consumer: Playwright helper to await modal readiness before filling inputs.
  - Evidence: src/components/kits/kit-detail.tsx:50-80; docs/contribute/architecture/test_instrumentation.md:1-77.

- Signal: `KitShoppingList:orderStock`
  - Type: `form` events via `useFormInstrumentation`
  - Trigger: `open`, `submit`, `success`, `error`, `validation_error`
  - Labels / fields: Snapshot of `{ units, honorReserved, mode, targetListId? }`
  - Consumer: waitTestEvent in e2e to confirm submission/validation sequences.
  - Evidence: docs/contribute/testing/playwright_developer_guide.md:80-138; src/components/kits/kit-metadata-dialog.tsx:92-210 (pattern).

- Signal: `kits.orderStock.lists`
  - Type: `list_loading`
  - Trigger: Concept list selector fetch and filter cycle.
  - Labels / fields: `{ optionCount, filteredCount, searchTerm }`
  - Consumer: Playwright wait to ensure selector options hydrate before selection.
  - Evidence: src/hooks/use-shopping-lists.ts:646-702.

- Signal: `shoppingLists.detail.kits`
  - Type: `ui_state` paired with `list_loading`
  - Trigger: Shopping list detail kit links query transitions instrumented via `useListLoadingInstrumentation({ scope: 'shoppingLists.detail.kits', ... })`.
  - Labels / fields: `{ listId, kitCount }`
  - Consumer: E2E spec to wait for chips before assertions/unlink using both `waitForListLoading(page, 'shoppingLists.detail.kits', 'ready')` and `waitForUiState`.
  - Evidence: src/routes/shopping-lists/$listId.tsx:529-626; docs/contribute/testing/index.md:5-16; docs/contribute/testing/playwright_developer_guide.md:80-138.

### 10) Lifecycle & Background Work

- Hook / effect: Dialog reset effect
  - Trigger cadence: On `open` change or `kit.id` change.
  - Responsibilities: Reset form values, validation errors, and preview snapshot so stale kit data is not reused.
  - Cleanup: Clears refs when dialog closes.
  - Evidence: src/components/kits/kit-metadata-dialog.tsx:112-162.

- Hook / effect: Preview recompute memo
  - Trigger cadence: When `units`, `honorReserved`, or `contents` change.
  - Responsibilities: Calculate summary metrics and feed instrumentation metadata.
  - Cleanup: N/A (pure memo).
  - Evidence: docs/epics/kits_brief.md:72-75; src/hooks/use-kit-detail.ts:24-120.

- Hook / effect: Post-mutation cache sync
  - Trigger cadence: `mutation.onSuccess`
  - Responsibilities: Invalidate kit detail + overview queries, conditionally update shopping list detail cache from response payload.
  - Cleanup: None beyond React Query’s GC.
  - Evidence: src/lib/api/generated/hooks.ts:720-1034; tests/api/factories/kit-factory.ts:1-200.

### 11) Security & Permissions (if applicable)

- Concern: Archived kit read-only enforcement
- Touchpoints: `Order Stock` button disable logic, unlink controls conditioned on `detail.status`.
- Mitigation: UI disables actions; backend already forbids archive interactions, and delete mutation handles 404/409 with toast.
- Residual risk: If backend status changes between fetch and click, mutation relies on server guard; UI will reflect after refetch.
- Evidence: docs/epics/kits_brief.md:154-158; src/components/kits/kit-detail-header.tsx:195-207.

### 12) UX / UI Impact (if applicable)

- Entry point: Kit detail header actions
  - Change: Add prominent `Order Stock` button alongside Edit; modal shows summary chips with units/honor reserved indicator.
  - User interaction: Users launch dialog, tweak units/honor toggle, select existing/new list, and confirm to see chips update inline.
  - Dependencies: `DetailScreenLayout` actions slot; `ShoppingListSelector`.
  - Evidence: src/components/kits/kit-detail-header.tsx:165-207; docs/epics/kits_feature_breakdown.md:192-205.

- Entry point: Shopping list detail header supplementary section
  - Change: Render linked kit chips with status badges, units summary, and hover/focus unlink icon.
  - User interaction: Hover reveals unlink button; confirmation dial ensures deliberate removal; chip count shrinks immediately.
  - Dependencies: `useShoppingListDetailHeaderSlots`, route-level query.
  - Evidence: src/components/shopping-lists/detail-header-slots.tsx:1-200; docs/epics/kits_feature_breakdown.md:215-225.

### 13) Deterministic Test Plan (new/changed behavior only)

- Surface: Kit detail order stock workflow
  - Scenarios:
    - Given an active kit with shortages, When I open `Order Stock`, Then the dialog defaults to build target, honors reservations, and shows preview totals.
    - Given the dialog open, When I create a new concept list, Then the success toast fires and a new chip appears with requested units/honor indicator.
    - Given an existing concept list, When I append ignoring reserved stock, Then the list lines reflect merged quantities and kit chip updates counts.
  - Instrumentation / hooks: Wait for `kits.detail.orderStock` ready & `KitShoppingList:orderStock` success; assert `kits.detail.links` metadata after mutation; use page object selectors.
  - Gaps: Skip exhaustive validation of backend merge notes (covered by API tests); focus on presence of prefix via targeted API assertion.
  - Evidence: tests/e2e/kits/kit-detail.spec.ts:1-200; tests/support/page-objects/kits-page.ts:1-200.

- Surface: Kit detail unlink action
  - Scenarios:
    - Given multiple linked lists, When I hover a chip and confirm unlink, Then the chip disappears, toast displays removal, and instrumentation shows decreased count.
    - Given an archived kit, When I attempt unlink, Then the action stays disabled and tooltip explains read-only state.
  - Instrumentation / hooks: Wait for `kits.detail.links` ready events; ensure delete mutation emits no unexpected errors.
  - Gaps: None.
  - Evidence: docs/epics/kits_feature_breakdown.md:215-225; src/components/kits/kit-detail-header.tsx:165-207.

- Surface: Shopping list detail kit chips
  - Scenarios:
    - Given a shopping list linked to a kit, When I load the detail route, Then kit chips render with status badge and units summary.
    - When I unlink from the shopping list header, Then the kit chip disappears here and on kit detail after navigation.
  - Instrumentation / hooks: Wait for both `waitForListLoading(page, 'shoppingLists.detail.kits', 'ready')` and `waitForUiState(page, 'shoppingLists.detail.kits', 'ready')`; use unlink confirmation; assert `waitForListLoading` on kit detail after navigation.
  - Gaps: Not exercising ready/done shopping list permutations (covered by badge tests); ensure concept path reliable.
  - Evidence: tests/e2e/shopping-lists/shopping-lists-detail.spec.ts:1-160; tests/support/page-objects/shopping-lists-page.ts:1-200.

### 14) Implementation Slices (only if large)

- Slice: Contracts & hooks
  - Goal: Establish domain adapters and hook wrappers for kit/list link queries & mutations, plus preview utilities.
  - Touches: src/types/kits.ts, src/types/shopping-lists.ts, src/hooks/use-kit-shopping-list-links.ts (new), src/hooks/use-kit-detail.ts.
  - Dependencies: None.

- Slice: Kit detail UI & instrumentation
  - Goal: Introduce `Order Stock` button/dialog, preview math, chip metadata, and unlink confirmation on kit detail.
  - Touches: src/components/kits/kit-detail.tsx, src/components/kits/kit-detail-header.tsx, src/components/kits/kit-order-stock-dialog.tsx (new), src/components/shopping-lists/shopping-list-link-chip.tsx.
  - Dependencies: Contracts slice complete.

- Slice: Shopping list detail chips
  - Goal: Fetch/render kit chips on shopping list detail and reuse unlink workflow.
  - Touches: src/components/shopping-lists/detail-header-slots.tsx, src/components/shopping-lists/kit-link-chip.tsx (new), src/routes/shopping-lists/$listId.tsx.
  - Dependencies: Contracts slice; unlink mutation shared with previous slice.

- Slice: E2E coverage & factories
  - Goal: Seed data helpers, extend page objects, and add deterministic Playwright specs for create/append/unlink flows.
  - Touches: tests/api/factories/*.ts, tests/support/page-objects/*.ts, tests/e2e/kits/kit-detail.spec.ts, tests/e2e/shopping-lists/shopping-lists-detail.spec.ts.
  - Dependencies: UI slices stable.

### 15) Risks & Open Questions

- Risk: Preview math diverges from backend merge logic (e.g., due to rounding or reserved handling).
  - Impact: Users might see misleading totals; tests could pass while backend shortages differ.
  - Mitigation: Mirror formula from brief, add assertions comparing preview vs API response in tests.

- Risk: Over-invalidating React Query caches after mutations causing redundant network traffic.
  - Impact: Performance regression on kit detail or shopping list pages.
  - Mitigation: Target specific keys (`getKitsByKitId`, `getShoppingListsByListId`, membership summaries) and avoid `invalidateQueries()` blanket calls.

- Risk: Hover-to-reveal unlink icon might hurt keyboard accessibility.
  - Impact: Keyboard users cannot see or activate unlink.
  - Mitigation: Ensure button is focusable and visible on `:focus`, add `aria-label`/tooltip; include keyboard path in tests.

- Question: Confirm honor-reserved default should be ON despite earlier brief saying OFF.
  - Why it matters: Affects default computation, instrumentation, and tests; conflicting docs require PM/backend alignment.
  - Owner / follow-up: Raise with feature owner noted in docs/epics/kits_brief.md and update plan/test expectations accordingly.

- Question: Should we surface staleness warnings (`isStale`) now or wait for dedicated feature?
  - Why it matters: Backend already returns `is_stale`; clarifying avoids double work or missing signals.
  - Owner / follow-up: Confirm with product/QA referencing docs/epics/kits_feature_breakdown.md:215-221.

### 16) Confidence

Confidence: Medium — The plan reuses established patterns, but introducing a new bidirectional dialog plus dual-surface unlinking spans multiple components and E2E flows that could reveal integration gaps during implementation.
