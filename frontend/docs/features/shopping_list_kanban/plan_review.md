# Plan Review -- Shopping List Kanban Redesign

## 1) Summary & Decision

**Readiness**
The plan is thorough, well-researched, and demonstrates strong alignment with the backend implementation contract. The rework has successfully addressed the three issues from the prior review: keyboard support references have been removed (section 15, line 1014 explicitly states "Do not register KeyboardSensor"), the `@dnd-kit/sortable` dependency has been eliminated (section 12, line 795), and the status migration file map is now comprehensive with 10 additional affected files enumerated in section 2, lines 224-265. All backend contract points are correctly reflected throughout the plan -- seller group CRUD uses the correct PUT-based status transitions, `ordered` is properly handled as a field on PUT line, sequential PUTs for assign-remaining are acknowledged, and all 409 error conditions are documented. The plan is implementation-ready with one condition.

**Decision**
`GO-WITH-CONDITIONS` -- Three issues found in the adversarial sweep require small plan amendments before implementation begins. The most significant is the missing `conceptListIds` rename in the status migration file map, which would leave dead code paths. The others are a minor `@dnd-kit/react` consideration and a missing file in the status migration map.

---

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `docs/commands/plan_feature.md` -- Pass -- The plan follows all 16 required sections with proper templates. Section 1a includes the user requirements checklist. Evidence is quoted with file:line references throughout.
- `docs/product_brief.md` -- Pass -- `plan.md:36-48` correctly frames the shopping list feature within the product brief's scope (section 6: "Shopping list"). The Kanban redesign is a UI-layer change to the existing shopping list feature, not a new product capability.
- `docs/contribute/architecture/application_overview.md` -- Pass -- `plan.md:167-168` follows the custom hook convention (`src/hooks/use-*.ts`). Snake-to-camel mapping is documented in section 3. Generated API hooks are used as the integration surface (section 4).
- `docs/contribute/testing/playwright_developer_guide.md` -- Pass -- `plan.md:812-919` documents deterministic test scenarios with proper instrumentation (test events, `data-testid`, `waitForListLoading`, `waitForUiState`). Factory updates are specified in `plan.md:220-222`. The plan correctly avoids route interception.
- `CLAUDE.md` (instrumentation coupling) -- Pass -- `plan.md:680-742` defines instrumentation signals for every new flow. Section 14 (Slice 9) couples test factory updates and Playwright specs with the route integration slice.
- Backend implementation doc -- Pass -- All 10 sections of the backend implementation doc are reflected. Seller group CRUD via PUT status (`plan.md:449,461`), no bulk assign-remaining (`plan.md:470-480`), `ordered` on PUT line (`plan.md:340`), 409 on seller change when ORDERED (`plan.md:342`), no auto-clear of ordered (`plan.md:26,418`), mutation responses return resource not list (`plan.md:27`), reopen blocked when received > 0 (`plan.md:28,460-461`), delete blocked when ordered (`plan.md:29,513`).

**Fit with codebase**

- `useShoppingListDetail` / `mapShoppingListDetail` -- `plan.md:188-190` -- Correctly identifies all fields to remove (`sellerOrderNotes`, `canReturnToConcept`) and mapper updates needed. Verified against `src/hooks/use-shopping-lists.ts:410-440`.
- `mapConceptLine` -- `plan.md:188-189` -- Correctly identifies missing `sellerLink` field. Verified that `src/hooks/use-shopping-lists.ts:178-209` omits `seller_link` while OpenAPI at line 8931 includes it.
- `mapSeller` / `ShoppingListSellerSummary` -- `plan.md:188-189` -- Correctly identifies missing `logoUrl`. Verified `src/hooks/use-shopping-lists.ts:147-156` omits `logo_url` while OpenAPI at line 8737 includes it.
- `mapSellerGroup` -- `plan.md:188-189` -- Correctly identifies that `group.order_note?.note` at `src/hooks/use-shopping-lists.ts:244` must change to `group.note` (direct field on the seller group schema per OpenAPI line 9019-9023). Also correctly adds `status` and `completed` fields.
- `DEFAULT_SELECTOR_STATUSES` -- `plan.md:189` -- Correctly identifies `src/hooks/use-shopping-lists.ts:623` needs `['active']` instead of `['concept']`.
- `toLineUpdatePayload` -- `plan.md:189` -- Correctly identifies `src/hooks/use-shopping-lists.ts:833-839` needs `ordered` field added.
- `ShoppingListMembershipSummary` -- `plan.md:234-236` -- Correctly identifies `conceptCount` and `readyCount` at `src/types/shopping-lists.ts:174-175` should be removed since `activeCount` already exists at line 173.
- Existing `CoverImageDisplay`, `UpdateStockDialog`, `ConceptLineForm` -- `plan.md:81-83,795` -- Correct reuse of existing components.

---

## 3) Open Questions & Ambiguities

- Question: The plan states `conceptListIds` should be removed since `conceptCount` and `readyCount` are being removed (`plan.md:234-236`), but `conceptListIds` is used in 6 files (`src/types/shopping-lists.ts:172`, `src/types/kits.ts:98`, `src/hooks/use-kit-memberships.ts:120,127`, `src/hooks/use-part-shopping-list-memberships.ts:91,98`, `src/components/parts/part-list.tsx:132,139`) and is not mentioned in the file map.
- Why it matters: `conceptListIds` filters memberships by `listStatus === 'concept'`, which will never match after migration. If not renamed to `activeListIds` (filtering by `'active'`), this field will always be empty, silently breaking features that rely on it (e.g., "add to shopping list" pre-selection on part cards).
- Needed answer: Resolved by research. The field must be renamed to `activeListIds` and its filter changed to `listStatus === 'active'`. See Finding #1 in the Adversarial Sweep.

- Question: The plan references `@dnd-kit/core` 6.x but there is a newer `@dnd-kit/react` 0.3.2 package that explicitly lists React 19 as a peer dependency. Should the plan evaluate the newer package?
- Why it matters: `@dnd-kit/core` 6.x has a `react >= 16.8.0` peer dep (compatible) but may not leverage React 19 features. `@dnd-kit/react` 0.3.2 is pre-1.0 and explicitly targets React 18/19.
- Needed answer: Resolved by research. `@dnd-kit/core` 6.3.1 is stable, production-ready, and compatible with React 19 via its loose peer dependency. The newer `@dnd-kit/react` is pre-1.0 (0.3.2) and not yet stable. The plan's choice of `@dnd-kit/core` is the correct decision for production use. No change needed.

---

## 4) Deterministic Playwright Coverage (new/changed behavior only)

- Behavior: Kanban board rendering (columns, cards, modes)
- Scenarios:
  - Given a list with unassigned lines, When loaded, Then Unassigned column + skeleton column visible (`tests/e2e/shopping-lists/kanban-board.spec.ts`)
  - Given a list with seller columns, When loaded, Then seller columns appear with correct card counts (`tests/e2e/shopping-lists/kanban-board.spec.ts`)
  - Given a "done" list, When loaded, Then all interactions disabled (`tests/e2e/shopping-lists/kanban-board.spec.ts`)
- Instrumentation: `waitForListLoading(page, 'shoppingLists.kanban', 'ready')`, `data-testid="shopping-lists.kanban.board"`, `data-testid="shopping-lists.kanban.column.{groupKey}"`
- Backend hooks: `ShoppingListTestFactory.createSellerGroup`, `ShoppingListTestFactory.updateLine` (with `ordered`), `ShoppingListTestFactory.orderSellerGroup`
- Gaps: None.
- Evidence: `plan.md:814-823`

- Behavior: Drag and drop between columns
- Scenarios:
  - Given an unassigned card, When dragged to seller column, Then card moves and `kanban.card.move` fires (`tests/e2e/shopping-lists/kanban-drag-drop.spec.ts`)
  - Given a card with ordered > 0, When dragged off seller, Then confirmation dialog appears; confirm clears ordered (`tests/e2e/shopping-lists/kanban-drag-drop.spec.ts`)
  - Given a card dropped on background, Then no mutation fired (`tests/e2e/shopping-lists/kanban-drag-drop.spec.ts`)
  - Given an ORDERED card, Then not draggable (`tests/e2e/shopping-lists/kanban-drag-drop.spec.ts`)
- Instrumentation: `waitForUiState(page, 'kanban.card.move', 'success')`, confirmation dialog selectors
- Backend hooks: `ShoppingListTestFactory.createSellerGroup`, `ShoppingListTestFactory.orderSellerGroup`
- Gaps: Mobile long-press DnD deferred to manual QA -- justified at `plan.md:851`.
- Evidence: `plan.md:843-852`

- Behavior: Inline field editing
- Scenarios:
  - Given an unassigned card, When clicking "needed" and typing, Then value saves on Enter (`tests/e2e/shopping-lists/kanban-board.spec.ts`)
  - Given a seller ordering card, When editing ordered field, Then value persists (`tests/e2e/shopping-lists/kanban-board.spec.ts`)
  - Given an editing field, When pressing Escape, Then value reverts (`tests/e2e/shopping-lists/kanban-board.spec.ts`)
  - Given a receiving-mode card, Then fields are read-only (`tests/e2e/shopping-lists/kanban-board.spec.ts`)
- Instrumentation: `waitTestEvent(page, 'form', evt => evt.formId === 'KanbanCard:needed' && evt.phase === 'success')`
- Backend hooks: Standard line factory
- Gaps: None.
- Evidence: `plan.md:855-865`

- Behavior: Seller column lifecycle (complete/reopen)
- Scenarios:
  - Given all lines have ordered > 0, When clicking Complete, Then column enters receiving mode (`tests/e2e/shopping-lists/kanban-board.spec.ts`)
  - Given one line has ordered == 0, Then Complete button is disabled (`tests/e2e/shopping-lists/kanban-board.spec.ts`)
  - Given an ordered column with no received items, When clicking Reopen, Then column returns to ordering mode (`tests/e2e/shopping-lists/kanban-board.spec.ts`)
  - Given an ordered column with received items, Then Reopen is disabled (`tests/e2e/shopping-lists/kanban-board.spec.ts`)
- Instrumentation: `waitForUiState(page, 'kanban.column.complete', 'success')`
- Backend hooks: `ShoppingListTestFactory.createSellerGroup`, `ShoppingListTestFactory.orderSellerGroup`, `ShoppingListTestFactory.updateLine`
- Gaps: None.
- Evidence: `plan.md:867-878`

- Behavior: Skeleton column (add seller)
- Scenarios:
  - Given no seller columns, When selecting a seller from skeleton, Then new column appears (`tests/e2e/shopping-lists/kanban-board.spec.ts`)
  - Given existing seller columns, When opening skeleton dropdown, Then existing sellers are excluded (`tests/e2e/shopping-lists/kanban-board.spec.ts`)
- Instrumentation: `waitForUiState(page, 'kanban.column.create', 'success')`
- Backend hooks: Seller factory for creating sellers
- Gaps: None.
- Evidence: `plan.md:880-888`

- Behavior: Column actions (assign remaining, remove seller)
- Scenarios:
  - Given unassigned cards and a seller column, When "Assign remaining", Then cards move to seller column (`tests/e2e/shopping-lists/kanban-board.spec.ts`)
  - Given an active seller column, When "Remove seller" confirmed, Then column disappears, cards return to Unassigned (`tests/e2e/shopping-lists/kanban-board.spec.ts`)
  - Given an ordered seller column, Then "Remove seller" is disabled (`tests/e2e/shopping-lists/kanban-board.spec.ts`)
- Instrumentation: `waitForUiState(page, 'kanban.assignRemaining', 'success')`
- Backend hooks: `ShoppingListTestFactory.createSellerGroup`, `ShoppingListTestFactory.orderSellerGroup`
- Gaps: None.
- Evidence: `plan.md:890-899`

---

## 5) Adversarial Sweep (must find >=3 credible issues or declare why none exist)

**Major -- Missing `conceptListIds` rename in status migration file map**
**Evidence:** `plan.md:224-265` (status simplification file map) and `src/types/shopping-lists.ts:172`, `src/types/kits.ts:98`, `src/hooks/use-kit-memberships.ts:120-127`, `src/hooks/use-part-shopping-list-memberships.ts:91-98`, `src/components/parts/part-list.tsx:129-139`
**Why it matters:** The plan enumerates `conceptCount`/`readyCount` removal from `ShoppingListMembershipSummary` (`plan.md:234-236`) but does not address `conceptListIds` (a `number[]` field on the same interface at `src/types/shopping-lists.ts:172`). This field is computed by filtering memberships where `listStatus === 'concept'` in three separate locations (`use-kit-memberships.ts:120`, `use-part-shopping-list-memberships.ts:91`, `part-list.tsx:132`). After migration, `'concept'` never matches, so `conceptListIds` is always empty. The field is also defined on `KitShoppingListMembershipSummary` in `src/types/kits.ts:98`. Without renaming this to `activeListIds` (filtering by `'active'`), any downstream consumer relying on it will silently break.
**Fix suggestion:** Add the following entries to the status migration file map (section 2, lines 224-265):
1. `src/types/shopping-lists.ts` -- Rename `conceptListIds` to `activeListIds` in `ShoppingListMembershipSummary`.
2. `src/types/kits.ts` -- Rename `conceptListIds` to `activeListIds` in `KitShoppingListMembershipSummary`.
3. `src/hooks/use-kit-memberships.ts:120` -- Change `conceptMemberships` filter from `'concept'` to `'active'` and rename the resulting field.
4. `src/hooks/use-part-shopping-list-memberships.ts:91` -- Same rename.
5. `src/components/parts/part-list.tsx:129-139` -- Same rename. Note that the local variable `conceptMemberships` at line 129 and `readyMemberships` at line 130 should be collapsed into `activeMemberships` (already computed at line 125-127), and `conceptListIds` at line 132 renamed.
Also add a Grep search for all consumers of `conceptListIds` across the codebase to ensure no references are missed.
**Confidence:** High

**Minor -- `part-list.tsx` membership computation is duplicated from hook logic and also needs migration**
**Evidence:** `src/components/parts/part-list.tsx:125-144` duplicates the membership summary computation that exists in `src/hooks/use-part-shopping-list-memberships.ts:83-103`. The plan lists `part-list.tsx` in the file map (`plan.md:238-240`) for the `concept`/`ready` filter changes but does not call out that this file has its own independent membership computation with the same `conceptMemberships`/`readyMemberships`/`conceptListIds`/`conceptCount`/`readyCount` pattern.
**Why it matters:** A developer implementing Slice 1 from the file map might update the filter comparisons (`'concept'` -> `'active'`) in `part-list.tsx:129-130` but miss renaming the local `conceptListIds` and `conceptCount` variables since they are local to the function and not referenced by the file map entry. The explicit "lines 129-130" evidence in `plan.md:239` could lead to a narrow fix that misses lines 131-143.
**Fix suggestion:** Expand the `part-list.tsx` file map entry (`plan.md:238-240`) to note that lines 125-144 contain a full membership summary computation that mirrors `use-part-shopping-list-memberships.ts` and all local variables must be migrated (not just the filter conditions at lines 129-130).
**Confidence:** High

**Minor -- Missing `kits/kit-card.tsx` status badge completeness in file map evidence**
**Evidence:** `plan.md:246-248` references `src/components/kits/kit-card.tsx:187-196` for status badge updates. Verified at `src/components/kits/kit-card.tsx:187-198`: the component checks `membership.status === 'ready'` (line 187), `membership.status === 'done'` (line 189), and `membership.status === 'concept'` (line 194). The file map mentions this file but does not note that it references the `KitShoppingListMembership.status` field (which derives from list status), not `ShoppingListStatus` directly. After migration, `'concept'` and `'ready'` will never match, so the badge rendering logic will fall through to incorrect defaults.
**Why it matters:** The badge rendering uses a ternary chain where `'concept'` maps to `'Concept'` label with `'inactive'` color, `'ready'` maps to `'Ready'` with `'active'` color, and `'done'` maps to `'Completed'` with `'success'` color. After migration, `'active'` lists would hit the else branch (currently handling `'concept'`), getting `'inactive'` color and `'Concept'` label. This is incorrect -- `'active'` should get the `'active'` color badge. However, this is already acknowledged in the file map so the developer should catch it during implementation.
**Fix suggestion:** No plan change needed; the file map entry is sufficient to flag the file. The developer should replace the ternary chain with a proper status-to-badge mapping that handles `'active'` and `'done'`.
**Confidence:** Medium

---

## 6) Derived-Value & State Invariants (table)

- Derived value: `columnMode`
  - Source dataset: `group.status` field from server response (unfiltered -- directly from query cache).
  - Write / cleanup triggered: No persistent writes. Drives card rendering variant selection (unassigned/ordering/receiving).
  - Guards: Null check for ungrouped bucket (`group.sellerId == null`). No feature flags.
  - Invariant: Column mode must always reflect `group.status` from the latest query cache entry; it must never be stored in local state or survive a page refresh independently.
  - Evidence: `plan.md:548-553`

- Derived value: `canCompleteColumn`
  - Source dataset: Filtered -- only lines within a specific seller group where `ordered == 0`.
  - Write / cleanup triggered: Controls button disabled state. When enabled and clicked, triggers `PUT /seller-groups/{seller_id}` with `status: "ordered"`. This is a persistent write gated by a filtered view.
  - Guards: Frontend pre-check mirrors backend 409 precondition. Button is disabled with tooltip when any line has `ordered == 0`. Backend enforces the same check as a second guard.
  - Invariant: The set of lines used for the pre-check must be identical to the set the backend evaluates. Since both use the same seller group's lines, this holds as long as the frontend reads from an up-to-date cache. Stale cache could show the button as enabled when a line was just edited by another tab, but the backend 409 catches this.
  - Evidence: `plan.md:562-567`

- Derived value: `availableSellersForSkeleton`
  - Source dataset: Filtered -- all sellers from `useSellersSearch` minus sellers that already have columns (derived from `sellerGroups` in query cache).
  - Write / cleanup triggered: Drives skeleton column dropdown options. Selecting a seller triggers `POST /seller-groups` (persistent write).
  - Guards: Backend 409 prevents duplicate seller groups even if the filtered list is stale. The plan correctly documents this at `plan.md:504,506`.
  - Invariant: A seller must not appear in both the dropdown and an existing column simultaneously. The backend 409 on duplicate creation provides the safety net.
  - Evidence: `plan.md:583-588`

- Derived value: `conceptListIds` -> `activeListIds` (post-migration)
  - Source dataset: Filtered -- memberships where `listStatus === 'active'` (was `'concept'`).
  - Write / cleanup triggered: Used for "add to shopping list" pre-selection on part cards and kit cards. Drives which lists appear in selection dialogs.
  - Guards: None currently. After migration this field will always be empty if not renamed, silently removing pre-selection functionality.
  - Invariant: Must contain IDs of all `'active'` (non-done, non-completed) lists that the part/kit is a member of.
  - Evidence: `src/types/shopping-lists.ts:172`, `src/hooks/use-part-shopping-list-memberships.ts:91`

---

## 7) Risks & Mitigations (top 3)

- Risk: `conceptListIds` field silently breaks across 6 files after status migration, causing empty pre-selection lists in "add to shopping list" dialogs for parts and kits.
- Mitigation: Add `conceptListIds` -> `activeListIds` rename to the status migration file map (Slice 1). Run a codebase-wide grep for `conceptListIds` during implementation to catch all references.
- Evidence: `src/types/shopping-lists.ts:172`, `src/hooks/use-kit-memberships.ts:120-127`, `src/hooks/use-part-shopping-list-memberships.ts:91-98`, `src/components/parts/part-list.tsx:132-139`, `src/types/kits.ts:98`

- Risk: `@dnd-kit/core` library may have subtle issues with React 19 concurrent rendering, particularly around drag overlay positioning or drop detection timing.
- Mitigation: The plan correctly proposes an early smoke test in Slice 7 (`plan.md:978`). The peer dependency (`react >= 16.8.0`) is compatible. `@dnd-kit/react` 0.3.2 exists as a React 19-specific alternative but is pre-1.0 and not recommended for production. If issues arise, `pragmatic-drag-and-drop` is a viable fallback as noted in the plan.
- Evidence: `plan.md:976-978`, npm registry (`@dnd-kit/core` 6.3.1 peer dep: `react >= 16.8.0`)

- Risk: Sequential "assign remaining" PUTs scale linearly and provide poor UX for large unassigned pools (50+ lines).
- Mitigation: Plan proposes progress indicator and single-invalidation batching (`plan.md:479`). Early termination on first failure is specified (`plan.md:477`). Backend bulk endpoint can be requested later if performance is unacceptable.
- Evidence: `plan.md:470-480`, backend implementation doc section 4

---

## 8) Confidence

Confidence: High -- The plan is comprehensive, accurately reflects the backend contract, and addresses all prior review findings. The one condition (missing `conceptListIds` rename) is a straightforward addition to the existing file map that does not change the plan's architecture or approach.
