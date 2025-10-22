# Shopping List Linking Plan

### 0) Research Log & Findings
- Reviewed kit detail header to see how shopping-list badges render and confirm there is no unlink affordance yet (`src/components/kits/kit-detail-header.tsx:165`).
- Checked the shared `ShoppingListLinkChip` to understand current styling and props we must extend for hover actions (`src/components/shopping-lists/shopping-list-link-chip.tsx:37`).
- Inspected the shopping-list detail header slots and noted the absence of reciprocal kit chips or supplementary content hooks (`src/components/shopping-lists/detail-header-slots.tsx:151`).
- Verified generated React Query hooks for kit ↔ shopping list APIs we need to call (`src/lib/api/generated/hooks.ts:996`, `src/lib/api/generated/hooks.ts:1012`, `src/lib/api/generated/hooks.ts:738`, `src/lib/api/generated/hooks.ts:1968`).
- Confirmed `useConfirm` pattern and `ConfirmDialog` pairing to reuse for unlink confirmations (`src/hooks/use-confirm.ts:16`, `src/components/ui/dialog.tsx:193`).
- Surveyed existing kit/shopping list page objects to map required locator updates for Playwright coverage (`tests/support/page-objects/kits-page.ts:7`, `tests/support/page-objects/shopping-lists-page.ts:1`).
- Revisited canonical docs for architecture stack and testing instrumentation expectations to ensure plan alignment (`docs/contribute/architecture/application_overview.md:7`, `docs/contribute/testing/index.md:5`, `docs/contribute/testing/playwright_developer_guide.md:82`).

### 1) Intent & Scope
**User intent**

Deliver the “Shopping list flow & linking” slice so planners can create or append concept lists from a kit, keep chips minimal (no stale UI yet), align chip visuals across kit/list detail, present a simplified dialog with an honor-reserved slider, and support unlink with confirmation.

**Prompt quotes**

"There really shouldn't be a way to refresh the link or something like that, or surface any information about whether the link is stale."  
"The chip for the link from shopping list to kit needs to have the same UI as the existing link chips."  
"The dialog that's used to create the shopping list shouldn't show the lines."  
"I want the unlinking capability to be added to the chips... When clicked, the link is removed."  
"Can you change the wording on adding an undo button and just add a confirmation dialog instead?"  
"I would like the honor reserved control to be a slider control, not just a checkbox."

**In scope**

- Build a streamlined kit-to-shopping-list dialog (Order-for-N default, honor-reserved slider, new/append list paths, no line preview).
- Surface kit ⇄ shopping list chips with shared styling, hover-revealed unlink icon, confirmation dialog, and post-mutation refresh.
- Extend shopping-list detail header to show originating kits using the same chip component.
- Wire up TanStack Query hooks, instrumentation, toasts, and cache updates for create/append and unlink flows.
- Author Playwright coverage for dialog happy paths, append path, and unlink confirmation from both kit and shopping list contexts.

**Out of scope**

- Exposing staleness state, refresh controls, or badge variants tied to `is_stale`.
- Backend schema or API changes beyond client-side contract usage.
- Pick-list workflow adjustments (out of current feature).

**Assumptions / constraints**

- Generated hooks (`usePostKitsShoppingListsByKitId`, etc.) remain accurate; backend already enforces concept-only append.
- Slider interaction can reuse existing UI primitives (likely `SegmentedTabs`) without introducing a new design system dependency.
- Tests will run against real backend per policy; factories can seed kit contents and concept lists as needed.

### 2) Affected Areas & File Map
- Area: `src/components/kits/kit-detail.tsx`  
  Why: Manage new dialog state, invoke mutations, extend link instrumentation.  
  Evidence: `src/components/kits/kit-detail.tsx:50`.
- Area: `src/components/kits/kit-detail-header.tsx`  
  Why: Replace simple chip rendering with hover actions + unlink icon, add CTA to open dialog.  
  Evidence: `src/components/kits/kit-detail-header.tsx:165`.
- Area: `src/components/shopping-lists/shopping-list-link-chip.tsx`  
  Why: Generalize chip styling to host icons, hover states, and unlink triggers shared by kit/list views.  
  Evidence: `src/components/shopping-lists/shopping-list-link-chip.tsx:37`.
- Area: `src/components/kits/pick-list-link-chip.tsx`  
  Why: Ensure chip API consistency (potential shared hover behavior) and avoid regressions.  
  Evidence: `src/components/kits/pick-list-link-chip.tsx:19`.
- Area: `src/components/shopping-lists/detail-header-slots.tsx`  
  Why: Inject kit chips into supplementary/header row and allow loading/empty states.  
  Evidence: `src/components/shopping-lists/detail-header-slots.tsx:151`.
- Area: `src/routes/shopping-lists/$listId.tsx`  
  Why: Fetch linked kits, manage confirm dialog for unlink, and feed header slots.  
  Evidence: `src/routes/shopping-lists/$listId.tsx:529`.
- Area: `src/hooks/use-shopping-lists.ts`  
  Why: Provide derived helpers or selectors for kit link queries and expose instrumentation metadata.  
  Evidence: `src/hooks/use-shopping-lists.ts:624`.
- Area: `src/hooks/use-kit-memberships.ts`  
  Why: Trigger membership invalidation after link/unlink to keep overview indicators accurate.  
  Evidence: `src/hooks/use-kit-memberships.ts:288`.
- Area: `src/lib/api/generated/hooks.ts`  
  Why: Confirm usage of existing generated hooks; may add typed wrappers if needed.  
  Evidence: `src/lib/api/generated/hooks.ts:996`, `src/lib/api/generated/hooks.ts:1012`, `src/lib/api/generated/hooks.ts:738`, `src/lib/api/generated/hooks.ts:1968`.
- Area: `src/components/ui/segmented-tabs.tsx`  
  Why: Reuse/adapt segmented control for honor-reserved slider behavior.  
  Evidence: `src/components/ui/segmented-tabs.tsx:41`.
- Area: `src/components/shopping-lists/list-create-dialog.tsx`  
  Why: Reference form + instrumentation patterns for new kit dialog implementation.  
  Evidence: `src/components/shopping-lists/list-create-dialog.tsx:23`.
- Area: `src/types/kits.ts`  
  Why: Ensure mapped link model stays consistent (ignore `isStale` in UI but keep for domain).  
  Evidence: `src/types/kits.ts:168`.
- Area: `tests/support/page-objects/kits-page.ts`  
  Why: Add selectors/actions for dialog, slider, and unlink icon interactions.  
  Evidence: `tests/support/page-objects/kits-page.ts:26`.
- Area: `tests/support/page-objects/shopping-lists-page.ts`  
  Why: Surface kit chip locators and unlink confirmation entry points.  
  Evidence: `tests/support/page-objects/shopping-lists-page.ts:34`.
- Area: `tests/e2e/kits/kit-detail.spec.ts`  
  Why: Extend coverage for linking dialog and unlink flows on kit detail.  
  Evidence: `tests/e2e/kits/kit-detail.spec.ts:20`.
- Area: `tests/e2e/shopping-lists` (new spec or extend existing)  
  Why: Verify reciprocal chips and unlink from shopping-list detail.  
  Evidence: `tests/e2e/shopping-lists` directory structure.

### 3) Data Model / Contracts
- Entity / contract: `KitShoppingListRequestSchema.b98797e` payload  
  Shape: `{ units: number | null; honor_reserved: boolean; shopping_list_id: number | null; new_list_name: string | null; new_list_description: string | null; note_prefix: string | null }`  
  Mapping: UI form state `orderForUnits`, `honorReserved`, selected list or new list fields → snake_case payload via adapter.  
  Evidence: `src/lib/api/generated/types.ts:4536`.
- Entity / contract: `KitShoppingListLinkResponseSchema.b98797e`  
  Shape: `{ created_new_list: boolean; link: { id, shopping_list_id, status, requested_units, honor_reserved, is_stale, ... } | null; shopping_list: { ...full detail... } | null }`  
  Mapping: Update kit detail query cache with `link`, reuse shopping list detail mapping for `shopping_list`.  
  Evidence: `src/lib/api/generated/types.ts:3943`.
- Entity / contract: `KitShoppingListChipSchemaList_a9993e3` & `KitChipSchemaList_a9993e3`  
  Shape: arrays of `{ id, shopping_list_id | kit_id, name, status, honor_reserved, requested_units, updated_at, is_stale }`  
  Mapping: Map to chip view-models ignoring `is_stale` for UI while retaining for instrumentation.  
  Evidence: `src/lib/api/generated/types.ts:3888`, `src/lib/api/generated/types.ts:4008`.
- Entity / contract: `KitShoppingListLink` (frontend type)  
  Shape: `{ id, shoppingListId, name, status, honorReserved, requestedUnits, isStale, snapshotKitUpdatedAt }`  
  Mapping: Already produced in `mapKitShoppingListLink`; confirm we read but do not surface `isStale`.  
  Evidence: `src/types/kits.ts:168`.
- Entity / contract: Honor-reserved slider state  
  Shape: Local form state `honorReservedMode: 'on' | 'off'` derived from boolean, ensures slider default `'on'`.  
  Mapping: slider selection → boolean for payload; maintain accessible labels for test instrumentation.  
  Evidence: `src/components/ui/segmented-tabs.tsx:41`.

### 4) API / Integration Surface
- Surface: `GET /api/kits/{kit_id}/shopping-lists` (`useGetKitsShoppingListsByKitId`)  
  Inputs: `{ path: { kit_id } }` from detail loader; used when refreshing chips post-mutation.  
  Outputs: chip summaries for kit detail UI; update `kits.detail.links` instrumentation when data settles.  
  Errors: Show destructive alert in header if fetch fails; allow retry.  
  Evidence: `src/lib/api/generated/hooks.ts:996`.
- Surface: `POST /api/kits/{kit_id}/shopping-lists` (`usePostKitsShoppingListsByKitId`)  
  Inputs: request payload described above; triggered by dialog submit.  
  Outputs: Response includes link metadata + refreshed shopping list; update query caches for kit detail and optionally prefetch list detail.  
  Errors: Show toast via `useToast.showException`, emit form instrumentation error event.  
  Evidence: `src/lib/api/generated/hooks.ts:1012`.
- Surface: `DELETE /api/kit-shopping-list-links/{link_id}` (`useDeleteKitShoppingListLinksByLinkId`)  
  Inputs: `{ path: { link_id } }` from chip actions; invoked after confirmation.  
  Outputs: 204; on success invalidate kit + shopping list queries and membership caches.  
  Errors: Toast + instrumentation; keep chip visible until refetch completes.  
  Evidence: `src/lib/api/generated/hooks.ts:738`.
- Surface: `GET /api/shopping-lists/{list_id}/kits` (`useGetShoppingListsKitsByListId`)  
  Inputs: `{ path: { list_id } }` when viewing shopping-list detail.  
  Outputs: kit chip list for header supplementary area.  
  Errors: Show inline banner plus instrumentation event for fail state.  
  Evidence: `src/lib/api/generated/hooks.ts:1968`.

### 5) Algorithms & UI Flows
- Flow: Kit → Create/append shopping list dialog  
  Steps:  
  1. User clicks "Create or link shopping list" action in kit header; dialog opens with units default from kit build target and honor slider pre-set to ON.  
  2. Fetch concept lists (status filter) for selection; allow "Create new list" option revealing name/description inputs.  
 3. On submit, build payload (units, honor_reserved boolean, optional existing list ID or new list fields) and rely on backend default `note_prefix`.  
  4. Call mutation; disable controls, emit form instrumentation `pending`.  
  5. On success, close dialog, toast success, refetch kit detail + shopping list chips, optionally navigate if requested.  
  States / transitions: dialog open/close, slider state, selection state, pending mutation.  
  Hotspots: ensure concept list query cancels when dialog closed; avoid re-render storms by memoizing options.  
  Evidence: `src/components/shopping-lists/list-create-dialog.tsx:52`.
- Flow: Kit detail chip unlink  
  Steps:  
 1. Hovering or focusing the chip reveals the unlink icon button anchored inside the chip.  
  2. Click icon triggers confirm dialog; on confirm call DELETE mutation.  
  3. While pending, show progress (disable icon) and keep chip visible.  
  4. On success, toast removal, invalidate kit detail, shopping list kits, and membership queries.  
  States / transitions: chip hover, confirm modal open, mutation pending, success removal.  
  Hotspots: manage focus return after dialog, ensure instrumentation logs `ui_state` event for unlink attempt/outcome.  
  Evidence: `src/components/kits/kit-detail-header.tsx:165`.
- Flow: Shopping-list detail kit chip rendering  
  Steps:  
  1. Route loads list detail + new linked kits query in parallel, gating header supplementary block on query status.  
  2. While loading, show skeleton chips; on error, show inline retry.  
  3. On success, render chip component variant pointing back to kit detail route with same hover unlink control.  
  4. Unlink from this view uses same confirm/mutation pipeline and refetches both queries.  
  States / transitions: query status, error/resolved states, confirm dialog.  
  Hotspots: avoid infinite refetch loops by scoping query keys and using stable `enabled` flags.  
  Evidence: `src/routes/shopping-lists/$listId.tsx:529`.

### 6) Derived State & Invariants
- Derived value: `effectiveNeeded = max(0, requiredPerUnit * units - (honorReserved ? availableAfterReservations : availableStock))` ensures no negative needed quantities are sent.  
  Evidence: `docs/epics/kits_feature_breakdown.md:177`.
- Derived value: `canSubmit = unitsValid && (existingListId || newListName.trim()) && !mutationPending` to guard dialog submit button.  
  Evidence: `src/components/shopping-lists/list-create-dialog.tsx:107`.
- Derived value: `showUnlinkIcon = hover && !mutationPending` to prevent duplicate DELETE calls.  
  Evidence: `src/components/ui/hover-actions.tsx:5`.
- Invariant: Slider defaults ON; toggling updates boolean payload with accessible label state.  
  Evidence: `docs/epics/kits_feature_breakdown.md:177`.

### 7) State Management & Query Strategy
- Reuse existing `useKitDetail` query for kit base data; after mutations call `queryClient.invalidateQueries` for `buildKitDetailQueryKey(kitId)` to refresh chips.  
  Evidence: `src/hooks/use-kit-detail.ts:23`.
- Introduce `useKitShoppingListLinks(kitId)` hook that wraps `useGetKitsShoppingListsByKitId` with derived loading/error metadata to keep chips updated without overfetching.  
- Instrument both `useKitShoppingListLinks` and the dialog concept-list query with `useListLoadingInstrumentation` (scopes `kits.detail.links` and `kits.detail.shoppingLists.dialog.listOptions`) so Playwright waits remain deterministic.  
- Cache concept list options under dialog-specific query key (status filter) to avoid reloading per open.  
- On shopping list detail, add `useShoppingListKitLinks(listId)` using generated GET hook with instrumentation for `ui_state` scope `shoppingLists.detail.kits`.  
- Pair the shopping list detail hook with `useListLoadingInstrumentation({ scope: 'shoppingLists.detail.kits', ... })` publishing kit counts and error metadata.  
- Mutation invalidation: after DELETE, invalidate kit detail, kit link query, shopping list kit query, and call `invalidatePartMemberships` equivalent for kit membership summary.  
  Evidence: `src/hooks/use-kit-memberships.ts:288`.

### 8) UI Components & Layout
- Create `KitShoppingListDialog` component co-located under `src/components/kits/` that composes existing `Dialog`, `Form`, `SegmentedTabs`, and list selector.  
- Extend `ShoppingListLinkChip` props to accept optional `onUnlink` and `loading` flags and to render Lucide `X` icon button when hovered or focused so keyboard/touch users can access the action; ensure hit area remains inside chip.  
- Ensure shopping-list header supplementary line remains responsive; chip row should wrap and align with existing badges.  
- Add CTA button (e.g., `Create shopping list`) to kit header actions area with icon (ShoppingCart + Plus).  
- Update `DetailScreenLayout` usage if supplementary slot needed for kit chips on shopping list detail.  
- Confirm slider semantics accessible: use `aria-pressed` or `role="tablist"` from `SegmentedTabs`.  
  Evidence: `src/components/ui/segmented-tabs.tsx:41`.

### 9) Telemetry & Instrumentation
- Update `buildLinkReadyMetadata` to include `requestedUnitTotals` and unaffected `isStale` counts but exclude UI surfacing; keep `kits.detail.links` scope intact.  
  Evidence: `src/components/kits/kit-detail.tsx:321`.
- Generate stable form ids (e.g., `generateFormId('KitShoppingListDialog', mode)`) and emit `trackFormOpen/Submit/Success/Error` plus validation events when the dialog opens, submits, or fails.  
  Evidence: `docs/contribute/testing/error_handling_and_validation.md:7-45`.
- Add new `useUiStateInstrumentation` scope `kits.detail.shoppingLists.dialog` capturing open/submit/success/error phases.  
- Wrap the dialog’s concept-list query in `useListLoadingInstrumentation({ scope: 'kits.detail.shoppingLists.dialog.listOptions', ... })` so tests can await list-option readiness.  
- Emit toast instrumentation using existing `useToast` helper for success/error.  
- For shopping-list detail kit links, add `useUiStateInstrumentation('shoppingLists.detail.kits', ...)` around new query.  
- Pair the shopping-list detail hook with `useListLoadingInstrumentation({ scope: 'shoppingLists.detail.kits', ... })` publishing `{ listId, kitCount }`.  
- Ensure Playwright waits leverage existing helpers per guide (`docs/contribute/testing/playwright_developer_guide.md:85`).  

### 10) Lifecycle & Background Work
- Hook: Kit dialog fetch for concept lists should suspend while dialog closed; leverage `enabled` flag tied to open state.  
- Hook: After successful POST, optionally prefetch `useGetShoppingListsByListId` with returned list ID to minimize navigation latency.  
- Hook: On unlink success, schedule concurrent refetch for affected queries and cancel pending stale ones to avoid flicker.  
- Cleanup: Reset dialog form state on close; clear `hover` state by unmounting icon overlay.  
  Evidence: `src/components/shopping-lists/list-create-dialog.tsx:138`.

### 11) Security & Permissions
- Concern: Only active kits should expose dialog (archived kits stay read-only).  
- Touchpoints: Gate CTA in kit header via existing `isArchived` check and disable unlink for archived contexts.  
- Mitigation: Reuse `kit.status` guard already present in header actions.  
- Residual risk: Backend still enforces permissions; frontend guard prevents accidental prompts.  
  Evidence: `src/components/kits/kit-detail-header.tsx:195`.

### 12) UX / UI Impact
- Entry point: Kit detail header actions  
  Change: Add button to open simplified shopping list dialog with slider + list selector.  
  User interaction: One-click access to plan purchasing with minimal fields.  
  Dependencies: `DetailScreenLayout` actions slot, new dialog component.  
  Evidence: `src/components/kits/kit-detail-header.tsx:194`.
- Entry point: Kit/shopping list link chips  
  Change: Hover reveals unlink icon; confirmation dialog appears before removal.  
  User interaction: Consistent chips across modules, minimal UI clutter until hover.  
  Dependencies: Updated chip component, `ConfirmDialog`.  
  Evidence: `src/components/shopping-lists/shopping-list-link-chip.tsx:37`.
- Entry point: Shopping list detail header  
  Change: Supplementary row lists originating kits with same chip UI.  
  User interaction: Immediate traceability from list back to kits.  
  Dependencies: Header slots, new query.  
  Evidence: `src/components/shopping-lists/detail-header-slots.tsx:151`.

### 13) Deterministic Test Plan
- Surface: Kit detail shopping list workflow  
  Scenarios:  
  - Given a kit with contents, When user opens dialog and creates new concept list with honor slider ON, Then list appears as chip and mutation toast fires.  
  - Given existing concept list, When user selects append path with slider OFF and submits, Then needed quantities merge (verify via API) and chip count increments without stale indicator.  
  - Given a linked list, When user hovers chip, confirms unlink, Then chip disappears after refetch and toast confirms removal.  
  Instrumentation / hooks: Wait on `waitForUiState(page, 'kits.detail.links', 'ready')`, `waitTestEvent` for dialog scope, toaster helper for success.  
  Gaps: None.  
  Evidence: `tests/e2e/kits/kit-detail.spec.ts:20`.
- Surface: Shopping list detail kit chips  
  Scenarios:  
  - Given a list linked from a kit, When visiting list detail, Then kit chips render with same style and link to kit detail.  
  - When unlinking from list header, Then confirm dialog appears, chip removed, and kit detail reflects new state.  
  Instrumentation / hooks: Wait for `shoppingLists.detail.kits` ui_state ready, assert backend state via factories.  
  Gaps: None.  
  Evidence: `tests/support/page-objects/shopping-lists-page.ts:34`.

### 14) Implementation Slices
- Slice: Dialog + mutation plumbing  
  Goal: Implement kit dialog UI, slider, list selector, mutation submission, and instrumentation.  
  Touches: Kit detail component, new dialog component, API hook usage.  
  Dependencies: Basic chip component unchanged.  
- Slice: Chip rework + unlink confirm  
  Goal: Update chip component for shared hover icon, wire confirm + DELETE, adjust header rendering for kit detail and list detail.  
  Touches: Chip component, kit header, shopping-list header, confirm wiring.  
  Dependencies: Dialog slice for create ensures chips have data.  
- Slice: Playwright coverage & page objects  
  Goal: Extend page objects and specs to cover create/append/unlink flows in kit and shopping list contexts.  
  Touches: Page objects, new/updated specs, test data factories.  
  Dependencies: UI slices complete and stable instrumentation.

### 15) Risks & Open Questions
- Risk: Honor-reserved math misaligned with backend leading to unexpected needed quantities.  
  Impact: Incorrect shopping list quantities, possible regressions.  
  Mitigation: Mirror backend logic using existing content totals, add assertion in tests comparing line quantities post-append.
- Risk: Chip hover unlink may conflict with navigation click causing accidental route triggers.  
  Impact: Users navigated away instead of unlink; tests flake.  
  Mitigation: Stop propagation in icon button, add Playwright regression check.
- Risk: Query invalidation storms causing redundant refetches and UI flicker.  
  Impact: Performance issues on detail page.  
  Mitigation: Scope invalidations to explicit keys (`buildKitDetailQueryKey`, `['getShoppingListsKitsByListId', ...]`) and avoid global `invalidateQueries()`.
- Open question: Should dialog allow editing note prefix or rely on backend default?  
  Why it matters: Determines form fields and payload.  
  Owner / follow-up: Confirm with product/back-end owner; default to optional text input hidden behind “Advanced” toggle if required later. (For now assume optional simple text box as doc mentions.)

### 16) Confidence
Confidence: Medium — Code tocuhes several high-traffic surfaces (kit detail, shopping list detail, page objects) but relies on well-documented hooks and patterns; remaining uncertainty is limited to aligning form fields with backend expectations.
