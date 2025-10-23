# Feature Plan — Shopping List Flow & Linking

### 0) Research Log & Findings
- src/components/kits/kit-detail.tsx:28-355 — kit detail screen already drives list/loading instrumentation and overlays, clarifying where the shopping-list CTA and dialog state need to live.
- src/components/kits/kit-detail-header.tsx:165-233 — header metadata currently renders passive shopping list chips and a lone edit action, so navigation and unlink affordances must extend this block.
- src/components/shopping-lists/shopping-list-selector.tsx:1-272 — the selector fetches concept lists with instrumentation and inline create support we can adapt for append flows inside the kit dialog.
- src/types/kits.ts:162-354 — domain mappers expose `KitShoppingListLink` fields (status, requestedUnits, timestamps) that the UI must surface and compare against kit metadata.
- src/lib/api/generated/hooks.ts:738-1027 — generated hooks exist for deleting and posting kit shopping list links but invalidate the entire cache, signalling the need for scoped query updates.
- openapi-cache/openapi.json:4414-4494 & 12520-12564 — KitShoppingList request/response schemas define `units`, `honor_reserved`, `note_prefix`, and response link payloads that drive form fields and optimistic updates.
- docs/contribute/testing/playwright_developer_guide.md:70-120 — Playwright coverage must rely on `waitForListLoading`/`waitForUiState` instrumentation, guiding the telemetry additions for this flow.
- tests/e2e/kits/kit-detail.spec.ts:120-337 — existing detail spec asserts instrumentation metadata and header chips, providing the baseline we will extend with shopping list linking scenarios.
- src/components/shopping-lists/detail-header-slots.tsx:151-205 — shopping list detail header currently shows totals badges only, confirming the gap for kit-origin chips.

### 1) Intent & Scope (1–3 short paragraphs)

**User intent**

Enable kit owners to push BOM shortfalls into shopping lists directly from kit detail while keeping chips navigable and unlinkable without surfacing drift status.

**Prompt quotes**

"Shopping list flow & linking"

**In scope**

- Add a kit detail CTA + dialog that validates requested units, honor-reserved toggles, list targeting, and previews impact before calling the kit shopping-list endpoint using the existing selector control.
- Enhance kit detail chips with navigation and unlink actions while respecting archived-kit read-only rules.
- Render linked kit chips on shopping list detail using the same component variant as kit detail.
- Emit instrumentation/test IDs so Playwright can deterministically cover order and unlink flows per contributor testing guidelines.

**Out of scope**

- Backend schema or API changes (assume the documented endpoints and merge behaviour are available).
- Pick list workflows, kit metadata editing, or broader shopping list management beyond attribution chips.
- Global kit search/filter changes or non-UI automation around linking.

**Assumptions / constraints**

Kit detail TanStack Query remains the source of truth; backend enforces concept-only append rules and merges duplicate lines; build targets stay ≥1; test mode instrumentation is available; flows must operate against the real backend per testing policy; note prefix stays fixed to `[From Kit <kit name>]` and is not user-editable; the existing shopping list selector continues to provide its inline create affordance without bespoke handling in this feature.

### 2) Affected Areas & File Map (with repository evidence)

- Area: src/components/kits/kit-detail.tsx
- Why: Mount the shopping-list CTA, manage dialog state, hook into mutations, and extend instrumentation without regressing existing flows.
- Evidence: src/components/kits/kit-detail.tsx:28-170 — current layout and instrumentation provide the extension points for new controls.

- Area: src/components/kits/kit-detail-header.tsx
- Why: Display shopping list chips with consistent styling and unlink affordance while keeping navigation intact.
- Evidence: src/components/kits/kit-detail-header.tsx:165-233 — chips render passively beside the edit button today.

- Area: src/components/kits/kit-shopping-list-dialog.tsx (new)
- Why: Encapsulate the order-stock form, validation, and instrumentation instead of bloating KitDetail with form logic.
- Evidence: src/components/kits/kit-detail.tsx:180-235 — current component would otherwise absorb complex dialog UI; factoring keeps responsibilities clear.

- Area: src/components/shopping-lists/shopping-list-link-chip.tsx
- Why: Support configurable layout for use on both kit detail and shopping list detail (name, status badge, optional unlink button).
- Evidence: src/components/shopping-lists/shopping-list-link-chip.tsx:1-48 — chip currently renders only name/status badges.

- Area: src/components/shopping-lists/detail-header-slots.tsx
- Why: Surface linked kit chips in shopping list detail using the shared component layout.
- Evidence: src/components/shopping-lists/detail-header-slots.tsx:151-205 — header metadata row currently shows totals badges without kit attribution.

- Area: src/components/shopping-lists/shopping-list-selector.tsx
- Why: Reuse concept-list search (including existing inline create affordance) and expose instrumentation hooks tailored to the kit dialog.
- Evidence: src/components/shopping-lists/shopping-list-selector.tsx:51-270 — selector already handles statuses, instrumentation, and inline create prompting.

- Area: src/hooks/use-shopping-lists.ts
- Why: Provide helper to fetch/invalidate concept list options and surface kit-specific metadata after a push.
- Evidence: src/hooks/use-shopping-lists.ts:646-702 — `useShoppingListOptions` drives concept list fetching and will back the dialog.

- Area: src/hooks/use-kit-memberships.ts
- Why: Refresh shopping list membership summaries on kit overview cards when a link is created or removed.
- Evidence: src/hooks/use-kit-memberships.ts:61-303 — hook maps API responses into badge summaries used by overview indicators.

- Area: src/lib/api/generated/hooks.ts
- Why: Wrap `usePostKitsShoppingListsByKitId` and `useDeleteKitShoppingListLinksByLinkId` with scoped cache invalidation helpers instead of global `invalidateQueries`.
- Evidence: src/lib/api/generated/hooks.ts:738-1027 — generated hooks exist but call `queryClient.invalidateQueries()` globally.

- Area: src/types/kits.ts
- Why: Provide mapping utilities for kit shopping list links and expose computed preview data for the dialog.
- Evidence: src/types/kits.ts:162-354 — shopping list link mapping already exposes status, timestamps, and counts we must reuse.

- Area: src/types/shopping-lists.ts
- Why: Introduce a `ShoppingListKitLink` model mapped from API chips for list detail attribution.
- Evidence: src/types/shopping-lists.ts:1-200 — shopping list types currently omit kit attribution models.

- Area: tests/e2e/kits/kit-detail.spec.ts
- Why: Extend Playwright coverage to order/unlink flows and assert instrumentation metadata changes.
- Evidence: tests/e2e/kits/kit-detail.spec.ts:120-337 — existing spec validates kit detail instrumentation and badges.

- Area: tests/e2e/shopping-lists/shopping-lists-detail.spec.ts
- Why: Assert kit attribution chips render on shopping list detail after linking.
- Evidence: tests/e2e/shopping-lists/shopping-lists-detail.spec.ts:1-220 — detail tests cover header metadata and will be extended.

- Area: tests/support/page-objects/kits-page.ts
- Why: Add locators for the shopping list CTA, dialog fields, and chips/unlink triggers.
- Evidence: tests/support/page-objects/kits-page.ts:1-200 — page object currently lacks selectors for shopping list actions.

- Area: tests/support/page-objects/shopping-lists-page.ts
- Why: Provide selectors for kit attribution chips on list detail.
- Evidence: tests/support/page-objects/shopping-lists-page.ts:1-200 — existing page object covers detail header but not kit chips.

- Area: tests/api/factories/kit-factory.ts
- Why: Seed kits with contents and push flows programmatically to validate backend state in tests.
- Evidence: tests/api/factories/kit-factory.ts:20-170 — factory manages kit creation and content seeding for Playwright setup.

### 3) Data Model / Contracts

- Entity / contract: KitShoppingListRequest
- Shape: `{ units?: number; honor_reserved?: boolean; shopping_list_id?: number; note_prefix?: string | null }`
- Mapping: Dialog collects camelCase fields then maps to snake_case body for `POST /api/kits/{kit_id}/shopping-lists`, always sending `shopping_list_id`, `units`, `honor_reserved`, and the fixed note prefix; creation fields stay omitted.
- Evidence: openapi-cache/openapi.json:4414-4494 — request schema enumerates allowed properties and defaults.

- Entity / contract: KitShoppingListLink (kit detail)
- Shape: `{ id: number; shoppingListId: number; name: string; status: ShoppingListStatus; requestedUnits: number; honorReserved: boolean; snapshotKitUpdatedAt: string; updatedAt: string }`
- Mapping: Generated payload (snake_case) is already mapped in `mapKitShoppingListLink`; we retain timestamps for telemetry but do not surface drift indicators in the UI.
- Evidence: src/types/kits.ts:224-354 — mapper converts API payloads into camelCase fields and exposes link metadata.

- Entity / contract: ShoppingListKitLink (shopping list detail)
- Shape: `{ linkId: number; kitId: number; kitName: string; kitStatus: KitStatus; requestedUnits: number; honorReserved: boolean; snapshotKitUpdatedAt: string; createdAt: string; updatedAt: string }`
- Mapping: Map `KitChipSchema` from `/api/shopping-lists/{list_id}/kits` into camelCase and provide display helpers for the shared chip component.
- Evidence: openapi-cache/openapi.json:1683-1770 — `KitChipSchema` describes fields required for attribution chips.

- Entity / contract: KitContentPreviewRow
- Shape: `{ contentId: number; partKey: string; requiredPerUnit: number; totalRequired: number; availableHonoringReserved: number; availableIgnoringReserved: number; neededWithHonor: number; neededWithoutHonor: number }`
- Mapping: Derived from existing `KitContentRow` plus aggregates to power dialog preview and toggles.
- Evidence: src/types/kits.ts:186-224 — kit content rows expose required, available, reserved figures needed for projections.

### 4) API / Integration Surface

- Surface: POST /api/kits/{kit_id}/shopping-lists (usePostKitsShoppingListsByKitId)
- Inputs: `{ path: { kit_id }, body: KitShoppingListRequestSchema }` capturing units, honor_reserved, existing list id, note prefix.
- Outputs: `KitShoppingListLinkResponseSchema` containing `link`, `shopping_list`, `total_needed_quantity`, and `noop`; use response link data to update detail and optionally prime shopping list caches.
- Errors: 400 for validation, 404 if kit/list missing, backend raises 409 on archived kits; map to toast + instrumentation error events.
- Evidence: src/lib/api/generated/hooks.ts:1009-1027 & openapi-cache/openapi.json:12520-12564 — defines mutation hook and endpoint contract.

- Surface: DELETE /api/kit-shopping-list-links/{link_id} (useDeleteKitShoppingListLinksByLinkId)
- Inputs: `{ path: { link_id } }` from link metadata on chip.
- Outputs: 204 No Content; on success, invalidate kit detail and kit membership caches.
- Errors: 400/404 bubble via ApiError; show toast and maintain chip state.
- Evidence: src/lib/api/generated/hooks.ts:738-753 & openapi-cache/openapi.json:11673-11715 — delete endpoint contract.

- Surface: GET /api/shopping-lists/{list_id}/kits (useGetShoppingListsKitsByListId)
- Inputs: `{ path: { list_id } }` when visiting shopping list detail.
- Outputs: `KitChipSchemaList` representing linked kits for attribution chips.
- Errors: 404 if list missing; reuse list detail error handling with toast + empty state fallback.
- Evidence: src/lib/api/generated/hooks.ts:1968-1978 & openapi-cache/openapi.json:15097-15146 — list kits endpoint.

- Surface: GET /api/kits/{kit_id} (useGetKitsByKitId)
- Inputs: existing path param; reuse after mutation via explicit refetch.
- Outputs: Kit detail with `shopping_list_links` to refresh header chips and instrumentation metadata.
- Errors: Already handled; ensure refetch occurs after successful mutation/unlink.
- Evidence: src/hooks/use-kit-detail.ts:28-118 — hook fetching kit detail for the page.

### 5) Algorithms & UI Flows (step-by-step)

- Flow: Order stock to an existing concept list
  1. User clicks “Order Stock” on kit detail; dialog opens prefilled with kit build target units, honor reserved enabled, and a read-only note prefix `[From Kit <name>]`.
  2. `ShoppingListSelector` loads available concept lists (retaining its native inline create affordance); user selects an existing list or creates one inline, with validation ensuring a selection exists before submit.
  3. Dialog computes per-line needed quantities using kit contents and honor toggle; preview summary updates as units change to reflect the target list.
  4. On submit, call `POST /api/kits/{kit_id}/shopping-lists` with `{ shopping_list_id, units, honor_reserved, note_prefix }`, always supplying the fixed prefix captured at open.
  5. Response `noop` flag toggles UI message when no quantities changed; otherwise toast summarises `total_needed_quantity`. On success, close dialog, refetch kit detail + membership summaries, emit success toast, and keep navigation anchored to the selected list chip.
- States / transitions: Selector loading vs ready instrumentation, disable submit while fetching options or mutation pending.
- Hotspots: Need to debounce search text to avoid repeated queries; rely on selector’s existing behaviour (including inline create) without bespoke handling.
- Evidence: src/components/shopping-lists/shopping-list-selector.tsx:51-270 — instrumentation and inline create capabilities; openapi-cache/openapi.json:4414-4494 — request supports list id inputs.

- Flow: Unlink shopping list chip from kit detail
  1. User clicks unlink icon on a shopping list chip; a confirmation dialog appears describing that only the link is removed.
  2. If the user confirms, trigger `DELETE /api/kit-shopping-list-links/{link_id}` and disable chip + dialog actions while pending.
  3. On success, close the confirmation, refetch kit detail and membership summary; toast confirms unlink with list name.
  4. Instrument UI state event for unlink to unblock Playwright waiters.
- States / transitions: Confirmation dialog open/closed, chip state (idle/pending/removed), kit header instrumentation re-emits ready metadata after refetch.
- Hotspots: Avoid removing chip prematurely; rely on pessimistic update until server success; guard against repeated submits from the dialog.
- Evidence: src/components/kits/kit-detail-header.tsx:165-233 — chips render area; src/lib/api/generated/hooks.ts:738-753 — delete hook.

- Flow: Shopping list detail linked kit chips
  1. After navigating to a shopping list, fetch linked kits via `useGetShoppingListsKitsByListId`.
  2. Map results into chips using the shared component (kit name + status badge, optional unlink affordance when permitted); clicking chip navigates back to kit detail.
  3. If kit status archived, display subdued style while keeping navigation available; unlink remains kit-side only.
- States / transitions: Query loading vs ready instrumentation; chips render once link payload available.
- Hotspots: Ensure additional query doesn’t block existing list detail fetch; load in parallel with skeleton.
- Evidence: src/components/shopping-lists/detail-header-slots.tsx:151-205 — metadata row ready for extra chips; src/lib/api/generated/hooks.ts:1968-1978 — list kits query.

### 6) Derived State & Invariants

- Derived value: requestedUnitsInput
  - Source: Kit build target (`kit.buildTarget`) and user input field in dialog.
  - Writes / cleanup: Updates preview rows and mutation payload; resets to build target when dialog closes.
  - Guards: Clamp to integers ≥1; disable submit when invalid.
  - Invariant: Requested units must always be positive and reflect current input when mutation fires.
  - Evidence: src/components/kits/kit-detail.tsx:188-200 — kit contents helper already detects archived state and will gate the CTA.

- Derived value: neededQuantityPerLine
  - Source: Kit content row totals (`totalRequired`, `available`, `reserved`) plus honor reserved toggle.
  - Writes / cleanup: Drives preview table and summary chips; no persistence beyond dialog scope.
  - Guards: Recompute via memoization keyed by kit contents version + requestedUnits + honorReserved; ensure zero floor via `Math.max`.
  - Invariant: Needed quantity cannot drop below zero and must reflect same values passed to backend.
  - Evidence: src/types/kits.ts:186-224 — content rows expose required, available, reserved figures.

- Derived value: canLinkToList
  - Source: Kit `status`, `kitContents.contentCount`, and mutation pending state.
  - Writes / cleanup: Disables CTA and submit button; displays tooltip when archived.
  - Guards: Respect archived kits and empty BOMs; disable even before mutation starts.
  - Invariant: Users must not submit linking flow when kit is archived or has zero contents.
  - Evidence: src/components/kits/kit-detail.tsx:188-200 — archived kits already gate part editing.

### 7) State Consistency & Async Coordination

- Source of truth: TanStack Query caches for `getKitsByKitId`, `kits.shoppingListMemberships`, `getShoppingListsByListId`, and `getShoppingListsKitsByListId`.
- Coordination: After order/unlink, explicitly invalidate/refetch all four queries and update dialog local state so header chips, overview indicators, and shopping list detail chips stay aligned.
- Async safeguards: Disable CTA while mutation pending, memoize preview calculations, and ignore stale mutation responses by checking returned `link.shopping_list_id` matches current target.
- Instrumentation: Emit `ui_state` events for dialog open/submit/success, reuse existing `kits.detail.links` instrumentation to reflect refreshed metadata, and leverage `useListLoadingInstrumentation` scopes for both the kit dialog selector and shopping list detail kits fetch.
- Evidence: src/components/kits/kit-detail.tsx:50-80 — current instrumentation scaffolding we will extend; src/hooks/use-kit-memberships.ts:288-347 — membership lookups drive indicator state.

### 8) Errors & Edge Cases

- Failure: Validation errors (units <1, no list selected, selecting non-concept list).
- Surface: kit shopping list dialog.
- Handling: Inline field errors + disable submit; track validation events for Playwright; keep dialog open.
- Guardrails: Reuse `useFormState` rules, prevent toggling to non-concept status via selector.
- Evidence: src/components/shopping-lists/list-create-dialog.tsx:64-140 — existing validation patterns for list forms.

- Failure: Backend rejects push (archived kit, conflict, API 400).
- Surface: dialog submit + toast.
- Handling: Show destructive toast, re-enable form, emit `trackFormError`, keep chips untouched.
- Guardrails: Disable CTA for archived kits; pessimistic update until mutation success.
- Evidence: src/components/kits/kit-detail.tsx:70-120 — instrumentation error handling; src/lib/api/generated/hooks.ts:1009-1027 — mutation hook fallback.

- Failure: No concept lists exist for append flow.
  - Surface: selector empty state.
  - Handling: Rely on the selector’s inline create affordance so the user can add a concept list without leaving the dialog; fall back to empty guidance only if creation fails.
  - Guardrails: Keep selector disabled until statuses load; keep submit disabled until a list is selected.
- Evidence: src/components/shopping-lists/shopping-list-selector.tsx:233-270 — empty state support.

- Failure: Unlink attempt for list already removed.
- Surface: chip unlink action.
- Handling: Toast warning based on 404, refetch detail to reconcile state.
- Guardrails: Confirm before delete; avoid optimistic removal.
- Evidence: src/lib/api/generated/hooks.ts:738-753 — delete mutation error surfaces via ApiError.

### 9) Observability / Instrumentation

- Signal: kits.detail.shoppingListFlow
- Type: ui_state event
- Trigger: Emit `open`, `submit`, `success`, `error` phases from dialog hook.
- Labels / fields: `{ kitId, action: 'order'|'unlink', targetListId, requestedUnits, honorReserved, noop }`.
- Consumer: Playwright `waitForUiState`, analytics of flow success rates.
- Evidence: src/lib/test/ui-state.ts & src/hooks/use-form-instrumentation.ts:1-112 — instrumentation helpers.

- Signal: kits.detail.links
- Type: ui_state (existing)
- Trigger: Extend ready metadata to include `shoppingLists.count` and status distribution after refetch.
- Labels / fields: `shoppingLists.count`, `statusCounts`.
- Consumer: tests/e2e/kits/kit-detail.spec.ts instrumentation assertions.
- Evidence: src/components/kits/kit-detail.tsx:70-120 & 316-355 — existing metadata builder.

- Signal: kits.detail.shoppingLists
- Type: list_loading event
- Trigger: Wrap `ShoppingListSelector` usage inside the dialog with `scope: 'kits.detail.shoppingLists'` to expose loading/ready states.
- Labels / fields: `{ optionCount, filteredCount, searchTerm }`.
- Consumer: Playwright waiters to ensure selector data ready before submit.
- Evidence: src/components/shopping-lists/shopping-list-selector.tsx:170-214 — instrumentation hook usage scoped per consumer.

- Signal: shoppingLists.detail.kits
- Type: list_loading event
- Trigger: Instrument the `useGetShoppingListsKitsByListId` query in shopping list detail header slots so loading/ready/aborted phases fire whenever linked kits fetch.
- Labels / fields: `{ kitLinkCount, statusCounts }`.
- Consumer: `waitForListLoading(page, 'shoppingLists.detail.kits', 'ready')` in attribution specs.
- Evidence: src/components/shopping-lists/detail-header-slots.tsx:151-205 — target location for hook; src/lib/test/query-instrumentation.ts:132-210 — helper contract.

- Signal: Form instrumentation (`trackForm*`)
- Type: form instrumentation events
- Trigger: `useFormInstrumentation` inside dialog collects snapshots before submit/success/error.
- Labels / fields: `formId`, `requestedUnits`, `honorReserved`, `target`.
- Consumer: Playwright `waitForUiState` (form) + analytics.
- Evidence: src/hooks/use-form-instrumentation.ts:26-114 — helper wiring.

### 10) Lifecycle & Background Work

- Hook / effect: useEffect resetting dialog defaults
- Trigger cadence: On dialog open or when kit detail refreshes.
- Responsibilities: Sync requested units and honor reserved toggle to current kit build target and scenario.
- Cleanup: Reset form state when dialog closes.
- Evidence: src/components/kits/kit-detail.tsx:82-104 — similar patterns for metadata dialog state.

- Hook / effect: useMutation onSuccess handlers
- Trigger cadence: After order/unlink mutation resolves.
- Responsibilities: Invalidate/refetch kit detail, kit memberships, target shopping list detail, and emit instrumentation events.
- Cleanup: Rely on React Query cache GC; ensure no ongoing toasts once unmounted.
- Evidence: src/lib/api/generated/hooks.ts:738-1027 — base mutation scaffolding to be wrapped.

- Hook / effect: useListLoadingInstrumentation for selector
- Trigger cadence: When dialog mounts and selector fetches options.
- Responsibilities: Broadcast loading/ready/aborted events for Playwright waits.
- Cleanup: Automatic via hook on unmount; ensure `enabled` toggles align with dialog open state.
- Evidence: src/components/shopping-lists/shopping-list-selector.tsx:204-214 — instrumentation usage.

### 11) Security & Permissions

- Concern: Prevent linking from archived kits or when user lacks edit ability.
- Touchpoints: Kit detail CTA, dialog submit handler, backend API (returns 400/403).
- Mitigation: Disable CTA when `kit.status === 'archived'`, guard submit, rely on backend exception to surface toast.
- Residual risk: Race condition if kit archived between dialog open and submit; handled by backend error and toast.
- Evidence: src/components/kits/kit-detail.tsx:188-200 — archived check; openapi-cache/openapi.json:12520-12574 — endpoint returns errors for invalid operations.

### 12) UX / UI Impact

- Entry point: `/kits/$kitId`
- Change: Add “Order Stock” action and dialog with preview table, selectors, and success toasts; update link chips with an inline unlink action while keeping navigation.
- User interaction: Users can create or append lists without leaving kit detail and unlink in-place when necessary.
- Dependencies: Kit detail hooks, shopping list selector, KitShoppingList API.
- Evidence: src/components/kits/kit-detail.tsx:28-170 & src/components/kits/kit-detail-header.tsx:165-205 — current UI scaffolding.

- Entry point: `/shopping-lists/$listId`
- Change: Show linked kit chips (name + status badge) under header metadata via the shared component; clicking navigates to kit detail.
- User interaction: Provides context and quick navigation to kits sourcing the list.
- Dependencies: shopping list detail header slots, GET /shopping-lists/{list_id}/kits.
- Evidence: src/components/shopping-lists/detail-header-slots.tsx:151-205 — current metadata layout.

### 13) Deterministic Test Plan (new/changed behavior only)

- Surface: Kit detail shopping list flow
  - Scenarios:
    - Given an active kit with BOM lines and concept lists available, When I order stock into a selected concept list, Then a chip appears with correct status and instrumentation emits `kits.detail.links` ready metadata including the target list id.
    - Given an active kit with no concept lists, When I create a concept list inline and submit the dialog, Then the new list is selected automatically, the link succeeds, and the chip reflects the created list metadata.
  - Instrumentation / hooks: `waitForUiState(page, 'kits.detail.shoppingListFlow', 'success')`, `waitForListLoading(page, 'kits.detail.shoppingLists', 'ready')`, chips located via `kits.detail.links.shopping.*`.
  - Gaps: None.
  - Evidence: tests/e2e/kits/kit-detail.spec.ts:120-337 — existing coverage baseline.

- Surface: Kit detail unlink action
  - Scenarios:
    - Given a kit linked to a list, When I confirm unlink, Then the chip disappears after `kits.detail.links` ready event and membership indicator on overview updates.
  - Instrumentation / hooks: `waitForUiState(page, 'kits.detail.shoppingListFlow', 'success')` for unlink, membership indicator selectors.
  - Gaps: None.
  - Evidence: tests/support/page-objects/kits-page.ts:181-219 — chip locators to extend.

- Surface: Shopping list detail attribution
  - Scenarios:
    - Given a shopping list created from a kit, When I open the list detail, Then a kit chip renders with the correct name and status badge, matching navigation to the kit detail.
  - Instrumentation / hooks: `waitForListLoading(page, 'shoppingLists.detail.kits', 'ready')`, chip selectors.
  - Gaps: None.
  - Evidence: tests/e2e/shopping-lists/shopping-lists-detail.spec.ts:1-220 — detail assertions baseline.

### 14) Implementation Slices (only if large)

- Slice: Domain plumbing & hooks
- Goal: Wrap generated mutations, introduce mapping helpers, and extend types for kit link data and dialog previews.
- Touches: src/lib/api/generated/hooks.ts, src/types/kits.ts, src/types/shopping-lists.ts, new hook utilities.
- Dependencies: None (foundational).

- Slice: Dialog UI & selector integration
- Goal: Build `kit-shopping-list-dialog`, wire CTA, validation, previews, and instrumentation.
- Touches: src/components/kits/kit-detail.tsx, src/components/kits/kit-shopping-list-dialog.tsx, src/components/shopping-lists/shopping-list-selector.tsx.
- Dependencies: Domain plumbing slice.

- Slice: Chip rendering & attribution
- Goal: Update kit detail chips with unlink affordance, add shopping list detail kit chips using the shared component, ensure navigation + tooltips.
- Touches: src/components/kits/kit-detail-header.tsx, src/components/shopping-lists/detail-header-slots.tsx, src/components/shopping-lists/shopping-list-link-chip.tsx.
- Dependencies: Dialog slice for consistent metadata.

- Slice: Playwright coverage & fixtures
- Goal: Extend factories, page objects, and specs to cover order/unlink and attribution flows.
- Touches: tests/api/factories/*.ts, tests/support/page-objects/*.ts, tests/e2e/kits/kit-detail.spec.ts, tests/e2e/shopping-lists/shopping-lists-detail.spec.ts.
- Dependencies: Previous slices to stabilise UI behaviour.

### 15) Risks & Open Questions

- Risk: Preview calculations for large kits (≈50 lines) could cause slow renders when typing units.
- Impact: Dialog feels sluggish and may drop keystrokes.
- Mitigation: Memoize derived arrays, debounce slider/text input, and collapse preview for huge kits when necessary.

- Risk: Cache invalidation gaps causing chips to display outdated list status after append.
- Impact: Users may see obsolete status badges or missing links.
- Mitigation: Targeted `queryClient.invalidateQueries` for kit detail, memberships, and shopping list detail; verify with Playwright assertions.

- Risk: Users unlink a list that still has outstanding orders, causing confusion.
- Impact: Lost attribution without warning.
- Mitigation: Add confirmation copy noting no list data is modified; rely on backend audit logs.

- Question: None — note prefix override confirmed out of scope.
  - Why it matters: Additional UI controls for prefix editing are unnecessary and excluded from implementation.
  - Owner / follow-up: Product owner confirmed; no further action required.

### 16) Confidence (one line)

Confidence: Medium — multiple surfaces (kit detail, shopping list detail, instrumentation, Playwright) intersect, but existing hooks and schemas provide clear patterns to follow.
