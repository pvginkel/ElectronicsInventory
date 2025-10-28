# Code Review — Shopping List Improvements

## 1) Summary & Decision

**Readiness**

The implementation delivers bidirectional kit unlinking and icon standardization as specified, with comprehensive Playwright coverage and proper instrumentation. However, one **Blocker** issue prevents the loading spinner from displaying on kit chips during unlink operations, which undermines user feedback and could allow concurrent unlink attempts. The skeleton padding fix is properly implemented, and chip layout collapse works correctly using absolute positioning. Test coverage is thorough and follows established patterns.

**Decision**

`NO-GO` — **Blocker** at `src/components/shopping-lists/detail-header-slots.tsx:260-277` and `src/routes/shopping-lists/$listId.tsx:613-621`: `unlinkingLinkId` state is not threaded from route to header slots hook to KitLinkChip components, preventing loading spinner from displaying on the correct chip. Fix requires adding `unlinkingLinkId?: number | null` prop to `ConceptHeaderProps` and passing `unlinkLoading={unlinkingLinkId === kitLink.linkId}` to each `KitLinkChip` (lines 261-275). Once this is patched, the feature will be ready to ship.

---

## 2) Conformance to Plan (with evidence)

**Plan alignment**

- **Unlink functionality added to KitLinkChip** ↔ `src/components/kits/kit-link-chip.tsx:20-26,48-54,60-64,103-122` — New props `onUnlink`, `unlinkDisabled`, `unlinkLoading`, `unlinkTestId`, `unlinkTooltip`, `unlinkLabel` added; unlink button rendered with absolute positioning and opacity transitions matching ShoppingListLinkChip pattern.

- **Unlink handler wired in shopping list detail route** ↔ `src/routes/shopping-lists/$listId.tsx:128-129,529-604,783-793` — Route owns `linkToUnlink` and `unlinkingLinkId` state, `unlinkMutation` hook, confirmation dialog, instrumentation via `emitUnlinkFlowEvent`, and handlers `handleUnlinkRequest`, `handleConfirmUnlink`, `handleUnlinkDialogChange`. Instrumentation scope `shoppingLists.detail.kitUnlinkFlow` emits `open`/`submit`/`success`/`error` phases as specified.

- **Hook returns kitsQuery for explicit refetch** ↔ `src/components/shopping-lists/detail-header-slots.tsx:36-40,117-120,188,212` — Return signature extended from `{ slots, overlays }` to `{ slots, overlays, kitsQuery }`. Route destructures `kitsQuery` at line 613 and calls `void kitsQuery.refetch()` after successful unlink (lines 576, 582) matching kit-detail pattern.

- **Skeleton padding fix for initial load** ↔ `src/components/shopping-lists/detail-header-slots.tsx:180-185` — `linkChips` slot added to early return when `list === null`, rendering skeleton kit chips wrapper matching structure at lines 253-257. Ensures consistent `space-y-6` spacing in content body during shopping list query loading.

- **Chip layout collapse via absolute positioning** ↔ `src/components/kits/kit-link-chip.tsx:69-70,108-112` and `src/components/shopping-lists/shopping-list-link-chip.tsx:89-90,129-131` — Container uses `relative` positioning; unlink button uses `absolute right-2 top-1/2 -translate-y-1/2` with `opacity-0` transitioning to `opacity-100` on group-hover. Container adds `hover:pr-9 focus-within:pr-9 [@media(pointer:coarse)]:pr-9` to expand padding only when button visible, preventing reserved space for hidden button.

- **Icon standardization to CircuitBoard** ↔ `src/components/kits/kit-link-chip.tsx:3,89`, `src/components/layout/sidebar.tsx:2,21`, `src/components/shopping-lists/detail-header-slots.tsx:3,267` — All kit icons replaced with `CircuitBoard` from lucide-react. Sidebar navigation (line 21), kit link chip default icon (line 89), shopping list kit chips (line 267) now consistent.

- **Playwright specs extended** ↔ `tests/e2e/shopping-lists/shopping-lists-detail.spec.ts:366-309` — New test describe block `Kit Chip Unlink Flow` with 4 scenarios: hover/unlink interaction with instrumentation (lines 367-469), cancel dialog (lines 471-525), completed lists hide unlink buttons (lines 527-575), sequential unlink of multiple kits (lines 577-308). Tests wait on `waitForUiState` for unlink flow events and assert chip removal via `await expect(kitChip).toHaveCount(0)`.

**Gaps / deviations**

- **Missing loading state propagation** — Plan section 2 (Affected Areas, Shopping list detail header slots) states "Hook does not own unlink state or emit instrumentation" and "thread it down to KitLinkChip components." Route sets `unlinkingLinkId` (line 565, 594) but never passes it to `useShoppingListDetailHeaderSlots` hook. Hook does not receive `unlinkingLinkId` prop and cannot pass `unlinkLoading={unlinkingLinkId === kitLink.linkId}` to chips. **Result:** No loading spinner shows on chip during mutation, violating plan section 5 step 5 "unlinking state set (button shows spinner)."

- **No out-of-scope expansion** — Implementation correctly omits undo functionality, bulk unlink, and shopping list chip changes in kit detail view per plan section 1 (Out of scope).

---

## 3) Correctness — Findings (ranked)

- **Blocker — Loading spinner never displays on kit chip during unlink**
  - Evidence: `src/routes/shopping-lists/$listId.tsx:129,565,594` — `unlinkingLinkId` state declared, set, and cleared. `src/routes/shopping-lists/$listId.tsx:613-621` — `unlinkingLinkId` not passed to `useShoppingListDetailHeaderSlots`. `src/components/shopping-lists/detail-header-slots.tsx:57-65,261-275` — Hook does not accept `unlinkingLinkId` prop; KitLinkChip components receive `onUnlink` callback but no `unlinkLoading` prop.
  - Impact: Users see no visual feedback during mutation (spinner missing), button remains fully interactive, and concurrent clicks could bypass the `unlinkingLinkId !== null` guard if React hasn't re-rendered yet. Tests verify instrumentation events but do not assert spinner visibility (CSS `opacity` changes).
  - Fix:
    1. Add `unlinkingLinkId?: number | null` to `ConceptHeaderProps` interface (`src/components/shopping-lists/concept-header.tsx:11`).
    2. Thread prop from route: `onUnlinkKit: detailIsCompleted ? undefined : handleUnlinkRequest, unlinkingLinkId` (line 620).
    3. In hook, destructure `unlinkingLinkId` from props (line 64) and pass to chips: `unlinkLoading={unlinkingLinkId === kitLink.linkId}` (line 274).
  - Confidence: **High** — Clear omission; pattern established in plan section 5 step 5 and plan section 6 derived state invariant "drives loading spinner on specific chip."

- **Major — Unlink dialog missing disabled state for submit button during mutation**
  - Evidence: `src/routes/shopping-lists/$listId.tsx:783-793` — ConfirmDialog renders with `onConfirm={handleConfirmUnlink}` but no `disabled` or `loading` prop on confirm button. Dialog component may allow double-submit if user clicks confirm twice rapidly before mutation completes.
  - Impact: If `handleConfirmUnlink` fires twice before first mutation settles, second call would hit `if (!shoppingList || !linkToUnlink) return` early exit (lines 560-562) because `linkToUnlink` cleared in `.finally()` (line 595). However, first mutation's `.finally()` block could race with second invocation's early checks, potentially allowing duplicate DELETE requests.
  - Fix: Pass `disabled={unlinkMutation.isPending}` to ConfirmDialog or check mutation state at top of `handleConfirmUnlink`: `if (unlinkMutation.isPending) return`.
  - Confidence: **Medium** — Double-click scenario is mitigated by early returns and React's synchronous setState, but explicit guard is clearer and matches kit-detail pattern which passes `isDeleting` state to dialog.

- **Major — Missing test coverage for 404 noop handling**
  - Evidence: `tests/e2e/shopping-lists/shopping-lists-detail.spec.ts:367-469` — Main unlink test verifies 200 success case and asserts `noop: false` in success event (line 455). No test exercises 404 response path (plan section 8, lines 237-241).
  - Impact: Plan section 5 step 8 specifies "On 404 → unlink flow phase 'success' event with noop:true, warning toast, refetch triggered." No automated coverage verifies warning toast text, `noop:true` metadata, or refetch behavior when link already deleted.
  - Fix: Add test case `kit chip unlink handles 404 gracefully when link already removed` that mocks backend state (link deleted between page load and unlink attempt) or uses factory to delete link before UI unlink. Assert warning toast `/already removed.*refreshing/i` and success event with `noop: true`.
  - Confidence: **High** — Explicitly called out in plan section 13 deterministic test plan (line 387).

- **Minor — Instrumentation dependency array missing kitsQuery**
  - Evidence: `src/routes/shopping-lists/$listId.tsx:598` — `handleConfirmUnlink` callback has `// eslint-disable-next-line react-hooks/exhaustive-deps` comment but dependency array omits `kitsQuery` (line 598). Callback captures `kitsQuery` for refetch calls (lines 576, 582).
  - Impact: If `kitsQuery` object identity changes (unlikely with TanStack Query stable references), callback could refetch a stale query instance. Suppressed lint rule hides this oversight.
  - Fix: Add `kitsQuery` to dependency array or destructure `kitsQuery.refetch` and depend on that function reference. Re-enable lint rule.
  - Confidence: **Low** — TanStack Query memoizes query objects; practical risk minimal. Still violates React hooks rules-of-hooks.

---

## 4) Over-Engineering & Refactoring Opportunities

- **Hotspot:** Unlink flow instrumentation helper (`emitUnlinkFlowEvent`) defined inline in route component
  - Evidence: `src/routes/shopping-lists/$listId.tsx:529-546` — Helper function defined as `useCallback` wrapping `emitUiState` call with repeated metadata construction.
  - Suggested refactor: Extract to shared helper `createUnlinkFlowEventEmitter(scope, listId)` in `src/lib/test/event-emitter.ts` returning `(phase, link, overrides?) => void`. Would match existing `trackForm*` patterns in instrumentation library.
  - Payoff: Reduces route component size by ~15 lines; helper reusable if kit detail view adds similar unlink-from-kit-side instrumentation enhancements. Low-priority refactor; current inline approach acceptable for single usage.

- **Hotspot:** `CircuitBoard` icon import duplicated across 3 files
  - Evidence: `src/components/kits/kit-link-chip.tsx:3`, `src/components/layout/sidebar.tsx:2`, `src/components/shopping-lists/detail-header-slots.tsx:3` — Same icon imported separately in each module.
  - Suggested refactor: No action needed. Icon imports are lightweight; centralizing icon constants would create unnecessary coupling. Current approach aligns with component-level imports in React ecosystem.
  - Payoff: None; would add indirection without meaningful DRY benefit.

---

## 5) Style & Consistency

- **Pattern:** Chip unlink button layout uses absolute positioning instead of flexbox margin
  - Evidence: `src/components/kits/kit-link-chip.tsx:69-70,108-112` — Container has `relative` class; button has `absolute right-2 top-1/2 -translate-y-1/2`. Container adds `hover:pr-9` to expand on hover.
  - Impact: Matches plan section 14 slice 5 architectural decision to use absolute positioning. Consistent with updated `ShoppingListLinkChip` at `src/components/shopping-lists/shopping-list-link-chip.tsx:89-90,129-131`. Both chips now collapse properly when unlink button hidden.
  - Recommendation: Accepted pattern for this feature; maintain consistency across both chip components.

- **Pattern:** Unlink confirmation dialog uses inline ConfirmDialog instantiation
  - Evidence: `src/routes/shopping-lists/$listId.tsx:783-793` — Dialog rendered conditionally `{linkToUnlink ? <ConfirmDialog ... /> : null}` alongside existing dialogs.
  - Impact: Consistent with kit detail unlink dialog pattern at `src/components/kits/kit-detail.tsx:494-505`. Acceptable trade-off; dedicated component would be over-abstraction for single usage.
  - Recommendation: Keep inline; aligns with existing codebase dialog instantiation patterns.

- **Pattern:** Hook return signature extended with kitsQuery
  - Evidence: `src/components/shopping-lists/detail-header-slots.tsx:36-40,212` — Return type changed from `{ slots, overlays }` to `{ slots, overlays, kitsQuery }`.
  - Impact: Matches kit-detail architectural pattern where `useKitDetail` returns query object (kit-detail.tsx:62-72 per plan evidence). Allows route to call explicit refetch without duplicating query, avoiding double-fetching on mount.
  - Recommendation: Solid architectural decision; maintain this pattern for other header slots hooks if similar explicit refetch needs arise.

---

## 6) Tests & Deterministic Coverage (new/changed behavior only)

- **Surface:** Kit chip unlink flow from shopping list detail page
  - Scenarios:
    - **Given** shopping list with 2 kit links, **When** user hovers kit chip, **Then** unlink button opacity changes from 0 to 1 (tested via `await expect(unlinkButton).toHaveCSS('opacity', '1')` at line 416).
    - **Given** unlink button visible, **When** user clicks, **Then** `ui_state` event phase 'open' emitted with `targetKitId` and `listId` (tested lines 418-432).
    - **Given** confirmation dialog open, **When** user cancels, **Then** dialog closes, kit chip remains, no mutation fires (tested lines 518-524).
    - **Given** user confirms unlink, **When** DELETE succeeds, **Then** `ui_state` events 'submit'/'success' emitted, success toast shows, chip removed via refetch (tested lines 444-463).
    - **Given** completed list, **When** page renders, **Then** unlink buttons not rendered (tested lines 568-574).
    - **Given** two kit chips, **When** user unlinks both sequentially, **Then** both removed independently (tested lines 641-307).
  - Hooks: Tests use `waitForUiState(page, 'shoppingLists.detail.kitUnlinkFlow', phase)` to wait on instrumentation events before assertions. Tests use `waitForListLoading(page, 'shoppingLists.detail.kits', 'ready')` before interacting with chips. Test IDs follow established pattern `shopping-lists.concept.body.kits.{kitId}.unlink`.
  - Gaps:
    - **Missing:** 404 noop case (warning toast, `noop:true` metadata) — see Blocker finding.
    - **Missing:** Error case (500 response, error toast, chip remains visible) — plan line 388 specifies this scenario.
    - **Missing:** Loading spinner visibility assertion (tests verify instrumentation but not UI state `unlinkLoading` passed to chip) — blocked by Blocker finding.
    - **Missing:** Concurrent unlink attempt rejection (click second chip while first unlink in flight) — plan line 390 specifies guard behavior.
    - **Missing:** Archived kit chip unlink allowed (plan line 391) — no test exercises archived kit status.
  - Evidence: `tests/e2e/shopping-lists/shopping-lists-detail.spec.ts:366-309` — 4 test cases added; plan section 13 specifies 10 scenarios (lines 380-391).

- **Surface:** Skeleton loading state padding consistency
  - Scenarios:
    - **Given** navigating to list detail, **When** `shoppingList === null` (initial query), **Then** linkChips skeleton renders in early return (lines 180-185) with same structure as kitsQuery.isLoading skeleton (lines 253-257).
    - **Given** skeleton rendered, **When** list query completes, **Then** no padding shift occurs (visual consistency).
  - Hooks: Existing `waitForListLoading` instrumentation for 'shoppingLists.list' scope covers shopping list detail query. Kit chips skeleton in early return matches content body layout via `space-y-6` spacing.
  - Gaps: No automated test verifies skeleton renders during `list === null` state. Plan section 13 lines 402-409 suggests screenshot-based verification or manual check. Acceptable gap; visual regression testing out of scope.
  - Evidence: `src/components/shopping-lists/detail-header-slots.tsx:180-185` — skeleton structure matches lines 253-257; plan section 9 lines 174-187 describes two loading phases.

---

## 7) Adversarial Sweep (must attempt ≥3 credible failures or justify none)

**Attack 1: Race condition between unlink mutation and dialog close**

- **Fault line:** User rapidly clicks confirm then ESC/cancel before mutation completes; dialog closes but mutation still in flight.
- **Evidence:** `src/routes/shopping-lists/$listId.tsx:600-604,593-596` — `handleUnlinkDialogChange` clears `linkToUnlink` when dialog closes (line 602). `handleConfirmUnlink` captures `linkToUnlink` in closure (line 563) before mutation starts. `.finally()` block clears both `unlinkingLinkId` and `linkToUnlink` (lines 594-595).
- **Attack outcome:** Code **holds up**. Captured `link` constant (line 563) prevents null reference. Mutation completes and clears state in `.finally()` even if user closes dialog early. Success toast and refetch still fire. No leaked state or stale UI.

**Attack 2: Concurrent unlink attempts on different kit chips**

- **Fault line:** User clicks unlink on Kit A, then immediately clicks unlink on Kit B while Kit A mutation pending.
- **Evidence:** `src/routes/shopping-lists/$listId.tsx:548-557` — `handleUnlinkRequest` guards with `if (detailIsCompleted || unlinkMutation.isPending || unlinkingLinkId !== null) return` (line 550). Second click rejected if `unlinkingLinkId !== null` OR `unlinkMutation.isPending`.
- **Attack outcome:** Code **holds up** with caveat. Guard prevents concurrent mutations. However, **Blocker** issue (no loading spinner) means user doesn't see visual feedback that first unlink is in progress, increasing likelihood of confused double-clicks. Guard is sound but UX is degraded.

**Attack 3: Cache invalidation race with rapid navigation away**

- **Fault line:** User unlinks kit, navigation triggers before refetch completes; stale kit chips may persist in background or flash on return.
- **Evidence:** `src/routes/shopping-lists/$listId.tsx:576,582` — `void kitsQuery.refetch()` called after success. Refetch is async but component may unmount before completion. `src/hooks/use-kit-shopping-list-links.ts:23-39` (plan evidence) — `invalidateKitShoppingListCaches` marks queries stale; TanStack Query aborts in-flight requests on unmount.
- **Attack outcome:** Code **holds up**. TanStack Query's abort controller cancels in-flight refetch on unmount (plan section 10 line 312). Cache invalidation ensures next visit to list detail fetches fresh data. Explicit refetch is best-effort for immediate UI update; acceptable that it doesn't block navigation.

**Attack 4: Multiple linkIds map to same kitId (duplicate links)**

- **Fault line:** Backend allows multiple links between same kit and shopping list (unlikely but not explicitly forbidden); UI may show duplicate kit chips with same `kitId` but different `linkId`.
- **Evidence:** `src/components/shopping-lists/detail-header-slots.tsx:260-277` — `linkedKits.map((kitLink) => <KitLinkChip key={kitLink.linkId} ... />)` (line 262). Key uses `linkId` not `kitId`. Test ID uses `kitId`: `testId={shopping-lists.concept.body.kits.${kitLink.kitId}}` (line 272).
- **Attack outcome:** Code **fails** testability if duplicate links exist. React keys are unique (`linkId`) so rendering is safe, but test IDs collide if `kitId` duplicated. Plan section 6 invariant "linkedKits.length must equal count emitted in instrumentation metadata" assumes 1:1 kit-to-link mapping. **Mitigation:** Backend likely enforces unique kit-list pairs (foreign key constraint). If duplicate links possible, test IDs should use `linkId` not `kitId`: `testId={shopping-lists.concept.body.kits.${kitLink.linkId}}`. **Severity:** **Minor** — only affects tests if backend allows duplicates.

---

## 8) Invariants Checklist (table)

- **Invariant:** `linkedKits.length` equals kit chip count rendered in content body
  - **Where enforced:** `src/components/shopping-lists/detail-header-slots.tsx:122,259-278` — `linkedKits` derived from `kitsQuery.data` via `mapShoppingListKitLinks` (line 122). Chips rendered via `linkedKits.map()` (line 260). Instrumentation metadata `kitLinkCount: linkedKits.length` (line 131) matches UI.
  - **Failure mode:** If `mapShoppingListKitLinks` filters out links (e.g., ignores certain statuses), instrumentation count would exceed rendered count.
  - **Protection:** `mapShoppingListKitLinks` performs unfiltered mapping (plan section 6 line 192 "unfiltered query response"). No conditional rendering inside map.
  - **Evidence:** Current implementation upholds invariant; no gaps detected.

- **Invariant:** At most one unlink operation in flight at a time
  - **Where enforced:** `src/routes/shopping-lists/$listId.tsx:550` — Guard `if (unlinkMutation.isPending || unlinkingLinkId !== null) return` rejects new unlink requests while mutation pending.
  - **Failure mode:** If guard omitted or broken, concurrent DELETE requests could race, both succeeding and double-refetching, wasting bandwidth.
  - **Protection:** Explicit boolean check before setting `linkToUnlink`. Mutation library (TanStack Query) also prevents concurrent calls to same mutation key.
  - **Evidence:** Guard correctly implemented; Blocker issue (missing spinner) undermines user-facing enforcement but backend remains safe.

- **Invariant:** Completed shopping lists never render unlink buttons
  - **Where enforced:** `src/routes/shopping-lists/$listId.tsx:620` — `onUnlinkKit: detailIsCompleted ? undefined : handleUnlinkRequest`. When prop is `undefined`, `src/components/shopping-lists/detail-header-slots.tsx:273` renders `onUnlink={onUnlinkKit ? () => onUnlinkKit(kitLink) : undefined}`, which is `undefined`. `src/components/kits/kit-link-chip.tsx:103` conditional `{onUnlink ? <Button .../> : null}` skips button render.
  - **Failure mode:** If `detailIsCompleted` check omitted in route, completed lists would show unlink buttons, allowing users to unlink kits from archived lists (likely backend 403 but confusing UX).
  - **Protection:** Guard at route level before passing callback; prop is type-safe optional `onUnlink?: () => void`.
  - **Evidence:** Plan section 8 lines 256-259 specifies this constraint. Test coverage at lines 527-575 verifies button not rendered in completed state.

- **Invariant:** `unlinkingLinkId` matches a `linkId` in `linkedKits` array or is `null`
  - **Where enforced:** `src/routes/shopping-lists/$listId.tsx:553,565,594-595` — `setLinkToUnlink(link)` (line 553) captures link object, then `setUnlinkingLinkId(link.linkId)` (line 565) uses `linkId` from that object. Cleared together in `.finally()` (lines 594-595).
  - **Failure mode:** If `linkId` typo'd or chips re-render with new `linkedKits` array during mutation, `unlinkingLinkId` could reference deleted link, spinner would show on wrong chip (if Blocker fixed).
  - **Protection:** `linkId` captured from immutable closure at mutation start. Refetch after mutation reloads `linkedKits` only after state cleared.
  - **Evidence:** No detected gap; closure semantics prevent stale reference. **However**, Blocker issue means this invariant is currently untested in UI.

---

## 9) Questions / Needs-Info

- **Question:** Should archived kits be unlinkable from shopping lists, or should backend enforce kit status constraint?
  - **Why it matters:** Plan section 1 line 58 states "Kit status (active/archived) does NOT prevent unlink — backend enforces any kit-specific permissions; frontend renders unlink button for all kit statuses." Test coverage missing for archived kit scenario (plan line 391). Need backend confirmation that archived kits can be unlinked or if 403 expected.
  - **Desired answer:** Backend team confirms DELETE /kit-shopping-list-links/{link_id} accepts archived kit links OR specifies frontend should hide unlink button when `kitLink.kitStatus === 'archived'` (requires plan amendment).

- **Question:** Is the overview-list skeleton height change intentional or accidental?
  - **Why it matters:** `src/components/shopping-lists/overview-list.tsx:265` changed skeleton height from `h-40` to `h-28` and added `px-6 py-6` padding. Not mentioned in plan (plan only addresses detail page skeleton padding). Possible side-effect of unrelated work or intentional tuning.
  - **Desired answer:** Confirm whether overview skeleton height change is in scope for this commit or should be reverted.

---

## 10) Risks & Mitigations (top 3)

- **Risk:** Loading spinner never displays during unlink operation, users may double-click and encounter confusing "already unlinking" silent rejection
  - **Mitigation:** Fix **Blocker** issue by threading `unlinkingLinkId` prop through hook to chips. Add Playwright assertion `await expect(unlinkButton).toHaveAttribute('aria-disabled', 'true')` or check loading spinner visibility during mutation.
  - **Evidence:** `src/routes/shopping-lists/$listId.tsx:129,565,594,613-621` and `src/components/shopping-lists/detail-header-slots.tsx:261-275` — state exists but not propagated.

- **Risk:** Missing test coverage for 404 and error cases leaves edge-case handling unverified; users may encounter untested warning/error toasts
  - **Mitigation:** Add 2 test cases: (1) 404 noop response verifies warning toast and `noop:true` metadata, (2) 500 error response verifies error toast and chip remains visible. Backend factory supports link deletion via `KitTestFactory.unlinkShoppingList` or direct DELETE call before frontend unlink attempt.
  - **Evidence:** Plan section 8 lines 237-247 and section 13 lines 387-388 specify these scenarios; `tests/e2e/shopping-lists/shopping-lists-detail.spec.ts:367-469` covers only happy path.

- **Risk:** Chip layout collapse animation may feel jarring on slower devices or browsers with reduced-motion settings
  - **Mitigation:** Existing code already includes `@media(prefers-reduced-motion:reduce):transition-none` at `src/components/kits/kit-link-chip.tsx:111` and `src/components/shopping-lists/shopping-list-link-chip.tsx:131`. Manual testing on touch devices and reduced-motion mode recommended before shipping. Absolute positioning avoids layout reflow (better than width transitions).
  - **Evidence:** Plan section 14 slice 5 architectural decision specifies `@media(prefers-reduced-motion:reduce)` support. Implementation correct; risk is UX perception rather than technical failure.

---

## 11) Confidence

**Confidence:** High — Pattern mirrors proven kit-detail unlink implementation; test coverage is comprehensive for happy path; instrumentation follows established taxonomy. **Blocker** issue is straightforward to fix (3-line prop addition). Once loading state propagated, feature is production-ready with only minor test gaps remaining (404/error cases, archived kit scenario). Skeleton padding fix is isolated and correct. Icon standardization is complete and consistent.

