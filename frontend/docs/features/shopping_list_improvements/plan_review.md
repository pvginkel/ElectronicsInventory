# Shopping List Improvements – Plan Review

## 1) Summary & Decision

**Readiness**

The plan is well-structured and demonstrates strong alignment with existing patterns (mirrors the kit detail unlink flow comprehensively). Research is thorough with specific line references to both the pattern to replicate (ShoppingListLinkChip, kit-detail.tsx unlink flow) and the integration points (detail-header-slots.tsx, shopping list route). The 16-section breakdown covers data models, API contracts, state invariants, error handling, and instrumentation. Initial review surfaced three implementation ambiguities (skeleton padding scope, refetch coordination, handler ownership), which have been resolved through codebase research: (1) skeleton padding fix targets the `shoppingList === null` loading state (detail-header-slots.tsx:149-180 early return lacks linkChips slot), (2) explicit refetch required matching kit-detail.tsx:387 pattern, (3) route component owns all unlink state/mutation/dialog matching kit-detail.tsx:276-408 pattern. Plan requires updates to document these resolutions, but no architectural blockers remain.

**Decision**

`GO` — Plan is implementable after incorporating research findings. Core pattern is proven (kit detail unlink at kit-detail.tsx:370-408), API hooks exist (useKitShoppingListUnlinkMutation), and all three ambiguities have definitive resolutions. Plan update required to: (1) clarify skeleton fix adds linkChips slot to detail-header-slots.tsx:149-180 early return, (2) document explicit `void kitsQuery.refetch()` call in unlink success handler, (3) specify route component owns all unlink state with `onUnlinkKit` callback passed to hook. See "Questions Resolved" section (3) for specific changes needed.

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `docs/contribute/architecture/application_overview.md` — **Pass** — `plan.md:7-14,102-117` quotes generated hooks (useKitShoppingListUnlinkMutation), camelCase mapping pattern (mapShoppingListKitLink), and TanStack Query cache invalidation, all conforming to "Custom hooks wrap generated API clients and map snake_case payloads to camelCase models" (application_overview.md:32-33).

- `docs/contribute/testing/playwright_developer_guide.md` — **Pass** — `plan.md:350-371` documents test scenarios with Given/When/Then structure, instrumentation hooks (waitForUiState, testId selectors), and API-first data setup expectations. Spec coverage deferred to implementation slice 4 (plan.md:404-407) aligns with "Ship instrumentation changes and matching Playwright coverage in the same slice" (AGENTS.md:43-44).

- `docs/product_brief.md` — **Pass** — `plan.md:70-74` (kits/shopping lists workflow) and plan.md:23-31 (bidirectional unlinking intent) align with product brief section 11 workflow 7: "Projects (kits) … One click: add shortages to the shopping list" (product_brief.md:149-154). Unlink supports reverse direction of that workflow.

- `AGENTS.md` — **Pass** — Plan treats instrumentation as part of UI contract (plan.md:255-283 documents all test events), follows "Update instrumentation first when adding flows so the tests can consume the events" (AGENTS.md:46), and uses existing abstractions (useKitShoppingListUnlinkMutation) rather than introducing new ones (AGENTS.md:36).

**Fit with codebase**

- `src/components/kits/kit-link-chip.tsx` — `plan.md:62-64` — Component currently has no unlink functionality (kit-link-chip.tsx:9-19 shows props list without onUnlink/unlinkDisabled/unlinkLoading). Plan correctly identifies this as the extension point and references ShoppingListLinkChip (shopping-list-link-chip.tsx:39-43) as the pattern to mirror. Extension is additive (no breaking changes to existing usages).

- `src/components/shopping-lists/detail-header-slots.tsx` — `plan.md:66-68` — Plan states kit chips need unlink handler wired here. However, detail-header-slots.tsx:250-266 renders KitLinkChip components within the linkChips slot without passing unlink props. The handler must either (a) be added to useShoppingListDetailHeaderSlots hook and passed to each chip, or (b) received as a prop from the parent route component. Plan does not clarify ownership boundary—this is a **Major** ambiguity (see Finding 3 below).

- `src/routes/shopping-lists/$listId.tsx` — `plan.md:70-72` — linkChips slot is rendered at line 574 (conceptContent) and line 592 (readyContent), both within content divs with space-y-6 classes. Plan correctly identifies this as the rendering location. However, plan.md:170-177 claims skeleton padding fix requires rendering skeleton kit chips in content body "when loading," but detail-header-slots.tsx:244-248 already returns skeleton divs in the linkChips slot when kitsQuery.isLoading. This suggests either (a) the plan misunderstands the existing skeleton behavior, or (b) the issue is that when shoppingList itself is null (initial page load), the linkChips slot is undefined and no skeleton renders—plan.md:168-169 hints at this ("If linkChips slot is undefined (list not loaded)…") but doesn't make the distinction explicit. This is a **Major** scope ambiguity (see Finding 1 below).

- `src/hooks/use-kit-shopping-list-links.ts` — `plan.md:119-132` — Plan relies on cache invalidation triggering automatic refetch of shopping list kits query. Code at lines 23-38 shows invalidateKitShoppingListCaches invalidates the correct query keys (shoppingListKitsQueryKey at line 19). However, kit detail explicitly calls `void query.refetch()` after unlink success (kit-detail.tsx:387), suggesting TanStack Query may not refetch automatically. Plan.md:159 states "cache invalidation triggers shopping list kits query refetch" but doesn't document whether this is automatic or requires manual refetch. This is a **Major** implementation detail gap (see Finding 2 below).

## 3) Questions Resolved (via codebase research)

**Question 1: Skeleton padding fix scope**

**Research findings:** Examined `detail-header-slots.tsx:149-180` (early return when `list === null`) and confirmed the linkChips slot is **undefined** in this state. The existing skeleton at lines 244-248 only renders when `list` is loaded AND `kitsQuery.isLoading`. The bug confirmed by `outstanding_changes.md:46` ("skeleton page doesn't have the same padding as the final frame") occurs during **initial shopping list query loading** (before `list` is available), not during kitsQuery loading.

**Resolution:** Skeleton fix adds linkChips slot skeleton to the early return at `detail-header-slots.tsx:149-180`. This is NOT redundant—it handles a different loading state (shoppingList query pending) than the existing skeleton (kitsQuery loading after list loads). Update plan.md:170-177 to clarify: "When shoppingList is null (initial page load), linkChips slot is undefined. Fix: Add linkChips skeleton to early return at detail-header-slots.tsx:149-180 matching the structure at lines 244-248."

**Plan changes required:** Update plan.md section 5 (Algorithms & UI Flows) lines 163-177 to specify "shoppingList === null" loading state. Update slice 3 (plan.md:397-402) to specify "Add linkChips slot to detail-header-slots.tsx early return (lines 149-180)."

---

**Question 2: Explicit refetch requirement**

**Research findings:** Examined refetch patterns across codebase:
- `kit-detail.tsx:387` — Explicit `void query.refetch()` after unlink success
- `kit-detail.tsx:393` — Also refetches on 404 case
- `part-details.tsx:312,316` — Pattern of `invalidateQueries()` followed by `void query.refetch()`

This codebase **consistently uses explicit refetch** after cache invalidation. Invalidation alone is not sufficient for immediate UI update.

**Resolution:** Shopping list unlink must add explicit `void kitsQuery.refetch()` call in the success handler, matching kit-detail.tsx:387 pattern. Route component needs access to kitsQuery from the useShoppingListDetailHeaderSlots hook (either by having hook expose it, or by route calling useGetShoppingListsKitsByListId directly alongside the hook).

**Plan changes required:** Update plan.md:150 step 7 to add "7a. After cache invalidation, explicit kitsQuery.refetch() called to reload kit links immediately." Update plan.md:159,183,207-209 to clarify "cache invalidation marks query stale; explicit refetch call required for immediate UI update (matches kit-detail.tsx:387 pattern)." Update slice 2 (plan.md:391-395) implementation notes to include "Call void kitsQuery.refetch() in .then() block after success toast."

---

**Question 3: Handler ownership boundaries**

**Research findings:** Examined kit detail pattern at `kit-detail.tsx:276-408`:
- **Route component owns:** `linkToUnlink` state (line 118), `unlinkingLinkId` state (line 119), `unlinkMutation` hook (line 120), `handleUnlinkRequest` function (lines 276-285), `handleConfirmUnlink` function (lines 370-408), confirmation dialog (lines 494-505), all instrumentation (`emitUnlinkFlowEvent` lines 246-267, 375, 385, 391, 398)
- **Header slots receives:** `onUnlinkShoppingList` callback prop = `handleUnlinkRequest` (line 338)
- **Header slots passes down:** Callback to each chip's `onUnlink` prop

This is the established pattern. Shopping list should match exactly.

**Resolution:** Shopping list route component ($listId.tsx) owns all unlink state, mutation, dialog, and instrumentation. Route passes `onUnlinkKit: (link: ShoppingListKitLink) => void` callback to useShoppingListDetailHeaderSlots. Hook accepts this as optional prop and threads it down to each KitLinkChip as `onUnlink={() => onUnlinkKit?.(kitLink)}`. Hook does NOT manage any unlink state or emit any unlink events.

**Plan changes required:** Update plan.md:66-68 to clarify "Shopping list detail header slots receives onUnlinkKit callback from route and threads it to KitLinkChip components. Hook does not own unlink state." Update plan.md:70-72 to clarify "Route component owns linkToUnlink, unlinkingLinkId, unlinkMutation, handleUnlinkRequest, handleConfirmUnlink, confirmation dialog, and all instrumentation emission." Update slice 2 (plan.md:391-395) to specify exact ownership: "Route: all unlink state/mutation/dialog/instrumentation. Hook: accepts onUnlinkKit prop, passes to chips."

## 4) Deterministic Playwright Coverage (new/changed behavior only)

- **Behavior:** Kit chip unlink button interaction from shopping list detail page
- **Scenarios:**
  - **Given** shopping list detail page loaded with 2 kit links (status 'concept'), **When** user hovers over first kit chip, **Then** unlink button fades in (`tests/e2e/shopping-lists/shopping-lists-detail.spec.ts`)
  - **Given** unlink button visible, **When** user clicks unlink button, **Then** ui_state event scope 'shoppingLists.detail.kitUnlinkFlow' phase 'open' emitted with targetKitId and listId metadata (`plan.md:260-262`)
  - **Given** confirmation dialog open, **When** user clicks cancel, **Then** dialog closes and no mutation fires (`plan.md:357`)
  - **Given** confirmation dialog open, **When** user clicks confirm, **Then** ui_state event phase 'submit' emitted, DELETE /kit-shopping-list-links/{linkId} called, ui_state phase 'success' emitted, kit chip removed after refetch (`plan.md:358-360`)
  - **Given** DELETE mutation returns 404, **When** response received, **Then** ui_state phase 'success' with noop:true emitted, warning toast shows "That kit link was already removed…", kit chip removed after refetch (`plan.md:360`)
  - **Given** shopping list status is 'done', **When** page renders, **Then** kit chips render without unlink buttons (`plan.md:362`)
  - **Given** unlinking kit A in progress, **When** user clicks unlink on kit B, **Then** second click ignored (no dialog opens) (`plan.md:363`)
- **Instrumentation:**
  - `waitForListLoading(page, 'shoppingLists.detail.kits', 'ready')` before interacting with kit chips (`plan.md:292,366`)
  - `waitForUiState(page, 'shoppingLists.detail.kitUnlinkFlow', 'success')` before asserting chip removed (`plan.md:367`)
  - `data-testid="shopping-lists.concept.body.kits.{kitId}.unlink"` to locate unlink buttons (`plan.md:280,368`)
  - `data-testid="shopping-lists.detail.kit-unlink.dialog"` to locate confirmation dialog (`plan.md:369`)
- **Backend hooks:** Factories in `tests/api/factories/` must support creating kit-shopping-list links via the link endpoint (POST /kits/{kit_id}/shopping-lists or equivalent seeding path). Tests will use `testData.shoppingLists.create()` and `testData.kits.create()` followed by link creation to seed 2-kit scenario, then navigate to shopping list detail. Unlink DELETE /kit-shopping-list-links/{link_id} is real backend call (no mocking per playwright_developer_guide.md:15-16).
- **Gaps:** Plan.md:370 states "None — unlink flow mirrors existing kit detail unlink pattern which has full Playwright coverage," but does not reference the specific kit detail spec file or test name. Should explicitly cite `tests/e2e/kits/kit-detail.spec.ts` (assuming it exists) as the reference pattern to copy. Without this, implementer may miss subtle assertions (e.g., unlinkingLinkId state clearing in .finally() block per plan.md:214).
- **Evidence:** `plan.md:350-371`, `playwright_developer_guide.md:91-103` (create data first pattern), `plan.md:275-283` (instrumentation testId and scope documentation).

- **Behavior:** Kit chips skeleton rendering during shopping list detail initial load
- **Scenarios:**
  - **Given** navigating to shopping list detail page, **When** kitsQuery is loading, **Then** kit chips skeleton renders in content body with same wrapper classes as loaded kit chips (`plan.md:375`)
  - **Given** kit chips skeleton rendered, **When** kitsQuery completes, **Then** actual kit chips render with no perceived padding shift (`plan.md:376`)
- **Instrumentation:**
  - `waitForListLoading(page, 'shoppingLists.list', 'ready')` to assert loading state complete (`plan.md:378`)
  - Capture screenshot during loading state to verify skeleton padding matches loaded state padding (`plan.md:379`)
- **Backend hooks:** No specific backend coordination needed; tests can throttle network in Playwright to extend loading state duration for visual verification.
- **Gaps:** Plan.md:380 acknowledges "Padding verification may require visual regression testing; can be verified manually during implementation." This is acceptable for a layout fix, but the spec should still assert skeleton presence (via testId) during loading phase to catch regressions. Plan does not propose a testId for the skeleton wrapper (detail-header-slots.tsx:244-248 lacks testId on skeleton divs). **Minor** — add `data-testid="shopping-lists.detail.kits.skeleton"` to skeleton wrapper in slice 3.
- **Evidence:** `plan.md:373-381`, `detail-header-slots.tsx:244-248` (existing skeleton code).

## 5) Adversarial Sweep (findings resolved via research)

**RESOLVED — Skeleton padding fix scope (was Major ambiguity)**

**Original finding:** Plan.md:170-177 conflated two loading states—kitsQuery.isLoading (covered by existing skeleton at detail-header-slots.tsx:244-248) and shoppingList=null (not covered). The actual bug was unclear.

**Research resolution:** Confirmed via code inspection of `detail-header-slots.tsx:149-180` that when `list === null` (initial shopping list query loading), the early return provides skeletons for breadcrumbs, title, description, and metadataRow, but **linkChips slot is undefined**. The existing skeleton at lines 244-248 only renders when list is loaded AND kitsQuery.isLoading. The bug in `outstanding_changes.md:46` references the shoppingList=null state, not the kitsQuery state.

**Definitive fix:** Add linkChips slot skeleton to the early return at `detail-header-slots.tsx:149-180`, matching the structure at lines 244-248. This handles the missing skeleton during initial page load (before shopping list query completes). No redundancy exists—the two skeletons serve different loading phases.

**Plan updates required:** Update plan.md:170-177 to specify "When shoppingList is null (initial page load), linkChips slot is undefined. Fix: Add linkChips: <skeleton wrapper> to early return at detail-header-slots.tsx:149-180." Update slice 3 (plan.md:397-402) to specify target location: "detail-header-slots.tsx early return, lines 149-180, add linkChips slot."

---

**RESOLVED — Cache refetch pattern (was Major implementation gap)**

**Original finding:** Plan.md:159 claimed automatic refetch after cache invalidation, but kit-detail.tsx:387 explicitly calls `void query.refetch()`, suggesting automatic refetch is not reliable. Plan didn't document whether refetch is automatic or manual.

**Research resolution:** Examined refetch patterns across codebase:
- `kit-detail.tsx:387,393` — Explicit `void query.refetch()` after both success and 404
- `part-details.tsx:312,316` — `invalidateQueries()` followed by `void query.refetch()`

**Established pattern:** This codebase **consistently uses explicit refetch** after cache invalidation. Invalidation alone does not trigger immediate UI update.

**Definitive fix:** Add explicit `void kitsQuery.refetch()` call in shopping list unlink success handler, matching kit-detail.tsx:387 pattern. Route component must have access to kitsQuery (either from hook return value or by calling useGetShoppingListsKitsByListId directly).

**Plan updates required:** Update plan.md:150 step 7 to add "7a. After success toast and cache invalidation, explicit kitsQuery.refetch() called." Update plan.md:159,183,207-209 to clarify "cache invalidation marks query stale; explicit refetch call required per codebase pattern (kit-detail.tsx:387)." Update slice 2 (plan.md:391-395) to include "Call void kitsQuery.refetch() in .then() block."

---

**RESOLVED — Handler ownership boundaries (was Major architectural ambiguity)**

**Original finding:** Plan.md:66-68 suggested header slots wire unlink handler, but plan.md:70-72 suggested route manage dialog/mutation. Split ownership creates testing complexity and unclear boundaries.

**Research resolution:** Examined kit detail pattern at `kit-detail.tsx:276-408`:
- **Route owns:** All state (linkToUnlink line 118, unlinkingLinkId line 119), unlinkMutation (line 120), handleUnlinkRequest (lines 276-285), handleConfirmUnlink (lines 370-408), confirmation dialog (lines 494-505), all instrumentation (lines 246-267, 375, 385, 391, 398)
- **Header slots receives:** `onUnlinkShoppingList` callback prop (line 338)
- **Header slots passes down:** Callback to each chip

This is the proven pattern. Shopping list must match exactly.

**Definitive fix:** Shopping list route component ($listId.tsx) owns all unlink state, mutation, dialog, and instrumentation. Route passes `onUnlinkKit?: (link: ShoppingListKitLink) => void` callback to useShoppingListDetailHeaderSlots hook. Hook accepts this prop (add to ConceptHeaderProps interface) and threads it down to each KitLinkChip as `onUnlink={() => onUnlinkKit?.(kitLink)}`. Hook does NOT emit instrumentation or manage dialog state.

**Plan updates required:** Update plan.md:66-68 to "Header slots hook receives onUnlinkKit callback from route and threads it to KitLinkChip components." Update plan.md:70-72 to "Route owns linkToUnlink, unlinkingLinkId, unlinkMutation, handleUnlinkRequest, handleConfirmUnlink, confirmation dialog, and all instrumentation." Update slice 2 (plan.md:391-395) to specify: "Route: declare all unlink state/mutation/dialog. Hook: add onUnlinkKit prop to ConceptHeaderProps, pass to chips."

---

**Minor — Instrumentation scope naming inconsistency with kit detail pattern**

**Evidence:** `plan.md:47,257` defines instrumentation scope as `'shoppingLists.detail.kitUnlinkFlow'` for the unlink flow from shopping list perspective. However, `kit-detail.tsx:47` defines the reverse flow scope as `'kits.detail.shoppingListFlow'` (not `'kits.detail.shoppingListUnlinkFlow'`). The kit detail scope name is more concise and parallel construction would suggest shopping list scope should be `'shoppingLists.detail.kitFlow'` or `'shoppingLists.detail.kitLinkFlow'` to match.

**Why it matters:** Tests that assert on both sides of the link (kit unlinking list, list unlinking kit) benefit from symmetric scope naming. The kit detail scope uses "shoppingListFlow" (without "unlink" in scope name, with action='unlink' in metadata per kit-detail.tsx:258). Plan uses "kitUnlinkFlow" (with "unlink" in scope name). This asymmetry complicates test helpers that need to wait on either side's unlink events. Changing to 'shoppingLists.detail.kitLinkFlow' (matching kit's "shoppingListFlow" pattern) improves discoverability.

**Fix suggestion:** Rename scope from `'shoppingLists.detail.kitUnlinkFlow'` to `'shoppingLists.detail.kitLinkFlow'` in plan.md:47,217,257. Retain `action: 'unlink'` in metadata (plan.md:266) to match kit detail pattern. Update test scenarios (plan.md:355-367) to reference the new scope name. Document the parallel naming in plan.md:216-221.

**Confidence:** Medium — Naming is subjective, but consistency with existing pattern improves maintainability.

---

**Minor — Confirmation dialog testId pattern deviates from kit detail**

**Evidence:** `plan.md:369` proposes `data-testid="shopping-lists.detail.kit-unlink.dialog"` for the confirmation dialog. However, `kit-detail.tsx:503` uses `data-testid="kits.detail.shopping-list.unlink.dialog"` (note: "shopping-list" singular, "unlink" follows, no hyphen between domain and action). Pattern is `{domain}.detail.{target}.unlink.dialog`. Following this pattern, shopping list unlink dialog should be `data-testid="shopping-lists.detail.kit.unlink.dialog"` (singular "kit", matching the target being unlinked).

**Why it matters:** TestId naming consistency enables test helpers to follow predictable patterns. Current proposal "shopping-lists.detail.kit-unlink.dialog" uses hyphen between "kit" and "unlink" but kit detail uses dot separator. Tests that locate confirmation dialogs across features benefit from uniform structure.

**Fix suggestion:** Change testId from `"shopping-lists.detail.kit-unlink.dialog"` to `"shopping-lists.detail.kit.unlink.dialog"` in plan.md:369 and plan.md:142-153 (unlink flow steps). Update code example at plan.md:496-505 to match.

**Confidence:** Low — Minor testId formatting issue; doesn't block implementation but should be corrected for consistency.

## 6) Derived-Value & State Invariants (table)

- **Derived value:** linkedKits (array of ShoppingListKitLink)
  - **Source dataset:** Mapped from `kitsQuery.data` via `mapShoppingListKitLinks` (`detail-header-slots.tsx:120`); unfiltered query response from GET /shopping-lists/{list_id}/kits
  - **Write / cleanup triggered:** After successful unlink mutation, `invalidateKitShoppingListCaches` fires (`use-kit-shopping-list-links.ts:202,225`), invalidating `['getShoppingListsKitsByListId', { path: { list_id: listId } }]` query key. TanStack Query marks query stale. **Ambiguity:** Plan assumes automatic refetch (plan.md:159,183), but kit detail explicitly calls `query.refetch()` (kit-detail.tsx:387). If automatic refetch doesn't occur, linkedKits array won't update until user navigates away and back. **Guard required:** Explicit `kitsQuery.refetch()` call in unlink success handler to ensure immediate update (see Finding 2).
  - **Guards:** Unlink button disabled if `shoppingList.status === 'done'` (read-only constraint per plan.md:184,196-200); unlink button disabled if `unlinkingLinkId !== null` (prevents concurrent unlink operations per plan.md:184). Second guard prevents multiple chips from showing loading spinner simultaneously.
  - **Invariant:** `linkedKits.length` must equal count emitted in instrumentation metadata (`plan.md:129,185`); must equal number of rendered `KitLinkChip` components in content body. After successful unlink, `linkedKits.length` must decrease by 1 (unless 404 noop case, where backend already removed link so count may already be N-1). If `kitsQuery.refetch()` is not called, this invariant breaks (stale chip remains visible).
  - **Evidence:** `plan.md:181-186`, `detail-header-slots.tsx:115-120,129`, `use-kit-shopping-list-links.ts:28-33`.

- **Derived value:** unlinkingLinkId (number | null)
  - **Source dataset:** Set to `link.linkId` when user confirms unlink dialog and mutation starts (plan.md:189); cleared to null in `.finally()` block when mutation settles (plan.md:190,214)
  - **Write / cleanup triggered:** Drives loading spinner on specific chip via `unlinkLoading` prop passed to KitLinkChip (plan.md:35-40). Cleared in `.finally()` to ensure cleanup even if mutation throws (plan.md:214).
  - **Guards:** Guards `handleUnlinkRequest` to prevent opening dialog if another unlink is in flight: `if (unlinkMutation.isPending || unlinkingLinkId !== null) return` (plan.md:191,239). Prevents user from queueing multiple unlink operations or opening multiple confirmation dialogs.
  - **Invariant:** At most one link can be unlinking at a time (plan.md:192); `unlinkingLinkId` must match a `linkId` in current `linkedKits` array or be null (plan.md:192). After mutation settles, `unlinkingLinkId` must be null (enforced by `.finally()` block per plan.md:404-407). If `.finally()` is omitted, `unlinkingLinkId` leaks and future unlink attempts are blocked forever.
  - **Evidence:** `plan.md:188-193`, `kit-detail.tsx:119,278,376,405` (reference pattern).

- **Derived value:** canUnlinkKits (boolean)
  - **Source dataset:** Computed as `shoppingList.status !== 'done'` when rendering kit chips (plan.md:196); read from `shoppingList` detail query result
  - **Write / cleanup triggered:** No writes; read-only guard for unlink button disabled state. Value changes only when `shoppingList.status` changes (via mark done / return to concept mutations in shopping list lifecycle).
  - **Guards:** Prevents unlink button from being clickable when list is completed (plan.md:198); kit status (active/archived) does NOT affect this guard (plan.md:198,424-426). Unlink button should not render at all when `canUnlinkKits` is false (onUnlink prop not passed to KitLinkChip per plan.md:245).
  - **Invariant:** If list status is 'done', no kit chip unlink buttons should be interactive (plan.md:199); if list status is 'concept' or 'ready', all kit chips (regardless of kit status) should have interactive unlink buttons (plan.md:199). If implementation conditionally renders onUnlink prop based on `canUnlinkKits`, this invariant holds. If implementation always passes onUnlink but relies on button disabled state, a developer could accidentally enable button for completed lists.
  - **Evidence:** `plan.md:195-200`, `$listId.tsx:517` (isCompleted check pattern), `plan.md:424-426` (confirmed decision on kit status).

## 7) Risks & Mitigations (definitive, post-research)

- **Risk:** Skeleton padding fix could target wrong loading state if plan ambiguity persists (shoppingList=null vs kitsQuery.isLoading).
- **Mitigation (RESOLVED):** Research confirmed the bug is `shoppingList === null` state (detail-header-slots.tsx:149-180 early return lacks linkChips slot). Fix: Add linkChips slot to early return at lines 149-180, matching structure at lines 244-248. No redundancy with existing skeleton (which handles kitsQuery.isLoading after list loads). Update plan.md:170-177 and slice 3 (plan.md:397-402) to specify target location and loading state.
- **Evidence:** `detail-header-slots.tsx:149-180` (missing linkChips), `outstanding_changes.md:46` (padding bug description), research findings section 3.

- **Risk:** Unlinked kit chip remains visible if explicit refetch is omitted, breaking user expectation that chip disappears immediately.
- **Mitigation (RESOLVED):** Research confirmed codebase pattern requires explicit refetch (kit-detail.tsx:387, part-details.tsx:312). Fix: Add `void kitsQuery.refetch()` call in unlink success handler. Route must access kitsQuery (either from hook return or by calling useGetShoppingListsKitsByListId directly). Update plan.md:150 step 7, plan.md:159/183/207-209, and slice 2 (plan.md:391-395) to document explicit refetch requirement.
- **Evidence:** `kit-detail.tsx:387,393` (explicit refetch pattern), `part-details.tsx:312,316` (same pattern), research findings section 3.

- **Risk:** Split ownership between route and hook creates testing complexity, state synchronization bugs, and unclear boundaries.
- **Mitigation (RESOLVED):** Research confirmed kit detail pattern: route owns all unlink state/mutation/dialog/instrumentation (kit-detail.tsx:276-408). Fix: Shopping list route owns linkToUnlink, unlinkingLinkId, unlinkMutation, handlers, dialog, instrumentation. Route passes `onUnlinkKit?: (link) => void` to hook. Hook threads callback to chips, does NOT manage state or emit events. Update plan.md:66-68, 70-72, and slice 2 (plan.md:391-395) to document ownership boundaries.
- **Evidence:** `kit-detail.tsx:276-408` (route ownership), `kit-detail.tsx:338` (callback pattern), research findings section 3.

## 8) Confidence

**Confidence: High** — Plan demonstrates strong research and pattern alignment. All three Major ambiguities resolved through codebase research with definitive answers: (1) skeleton fix targets shoppingList=null early return at detail-header-slots.tsx:149-180, (2) explicit `void kitsQuery.refetch()` required matching kit-detail.tsx:387 pattern, (3) route owns all unlink state/mutation/dialog matching kit-detail.tsx:276-408. Core pattern is proven, API hooks exist (useKitShoppingListUnlinkMutation), instrumentation taxonomy documented. Plan requires updates to incorporate research findings (see section 3 "Questions Resolved" for specific changes), but implementation path is now clear and risk-free. No architectural blockers remain.
