# Code Review: List Refinements Implementation

**Reviewed commit:** `2582c65920a93378e6538817e5c7268e22cc2462` — Implemented list refinements.

**Reviewed against plan:** `docs/features/table_list_refinements/plan.md`

---

## 1) Summary & Decision

**Readiness**

The implementation successfully centralizes debounced search across all five list views (kits, parts, boxes, sellers, shopping lists) via a new `DebouncedSearchInput` component. The core architecture matches the plan: local state for immediate UI feedback, 300ms debounce via `useDebouncedValue`, and URL-based navigation. Code quality is high—TypeScript strict mode passes, instrumentation correctly uses URL `searchTerm` (not `debouncedSearch`), and the clear button bypasses debounce as specified. However, the implementation is incomplete: no test scenarios were added despite the plan requiring new Playwright specs for all four newly debounced lists, and page object search methods lack the `waitForListLoading` calls that the plan explicitly documents. These omissions create a high risk of test flakiness and leave the feature unverified.

**Decision**

`GO-WITH-CONDITIONS` — Core logic is sound and refactors are clean, but test coverage gaps and page object timing issues must be resolved before merge. Conditions: (1) add Playwright scenarios for debounced search in parts, boxes, sellers, and shopping lists per plan section 14; (2) update all page object `search()` methods to call `waitForListLoading` after filling input; (3) consider wrapping `preserveSearchParams` in `useCallback` to reduce unnecessary effect runs (minor optimization).

---

## 2) Conformance to Plan (with evidence)

**Plan alignment**

- **Slice 1 (kits refactor)** ↔ `src/components/kits/kit-overview-list.tsx:1-267`, `src/components/common/debounced-search-input.tsx:1-111`, `src/routes/kits/index.tsx:1-97`
  - Removed local search state (lines 38-39 deleted from old kit-overview-list)
  - Removed useEffects for URL sync and debounce navigation (lines 41-50 deleted)
  - Removed handlers (lines 103-110 deleted)
  - Uses `searchTerm` from URL for queries and instrumentation (lines 34, 51, 69) ✓
  - Route simplified: removed `handleSearchChange` and `onSearchChange` prop (kits/index.tsx lines 48-67, 106 deleted) ✓

- **Slice 2-5 (parts, boxes, sellers, shopping lists)** ↔ `src/components/parts/part-list.tsx:1-271`, `src/components/boxes/box-list.tsx:1-255`, `src/components/sellers/seller-list.tsx:1-335`, `src/components/shopping-lists/overview-list.tsx:1-411`
  - All four components removed `navigate` import and search handlers
  - All replaced search UI with `<DebouncedSearchInput>` component
  - Parts: lines 92-109 deleted, new component at lines 211-218 ✓
  - Boxes: lines 115-133 deleted, new component at lines 141-149 ✓
  - Sellers: lines 117-135 deleted, new component at lines 185-193 ✓
  - Shopping lists: lines 184-196 deleted, new component at lines 241-248; added useEffect to emit filter event on searchTerm change (lines 57-73) ✓

- **Page object updates** ↔ `tests/support/page-objects/{kits,parts,boxes,sellers,shopping-lists}-page.ts`
  - All updated search input selectors from `.search` to `.search.input` ✓
  - Boxes clearSearch updated to use `input.clear()` + `blur()` (boxes-page.ts:42-46) ✓
  - Parts selector updated (parts-page.ts:27) ✓
  - Sellers selector updated (sellers-page.ts:21) ✓
  - Shopping lists selector updated (shopping-lists-page.ts:34) ✓

**Gaps / deviations**

- **Slice 2-5 test scenarios** — Plan section 14 requires adding test scenarios for debounced search: "Add test scenario: fill search → wait for list_loading ready → assert URL and results" for parts, boxes, sellers, shopping lists.
  - **What's missing**: Zero test spec files modified (`git diff HEAD~1 HEAD -- tests/e2e/` shows no changes). No scenarios added to `tests/e2e/parts/part-list.spec.ts`, `tests/e2e/boxes/boxes-list.spec.ts`, `tests/e2e/sellers/sellers-list.spec.ts`, `tests/e2e/shopping-lists/shopping-lists.spec.ts`.

- **Page object search method wait logic** — Plan section 13 explicitly documents:
  ```typescript
  async search(term: string) {
    await this.page.getByTestId('parts.list.search').fill(term);
    await waitForListLoading(this.page, 'parts.list', 'ready');
  }
  ```
  - **What's missing**: All page object `search()` methods fill input but do NOT call `waitForListLoading`:
    - `tests/support/page-objects/kits-page.ts:242-244` — fills input, no wait
    - `tests/support/page-objects/parts-page.ts:76-78` — fills input, no wait
    - `tests/support/page-objects/boxes-page.ts:38-40` — fills input, no wait
    - `tests/support/page-objects/sellers-page.ts:38-40` — fills input, no wait
  - **Impact**: Tests that call `search()` then immediately assert results will race against the 300ms debounce + query refetch, causing flakiness.

- **Plan deviation**: Kits `clearSearch` method (kits-page.ts:246-251) uses `isVisible()` check + `click({ force: true })`, while boxes/sellers use `input.clear()` + `blur()`. Kits approach is more defensive but inconsistent. Consider aligning all to the clearer pattern.

---

## 3) Correctness — Findings (ranked)

- **Blocker — Missing test coverage for debounced search**
  - Evidence: Plan section 14 (Slices 2-5) requires adding Playwright scenarios to verify debounced search for parts, boxes, sellers, and shopping lists. `git diff HEAD~1 HEAD -- tests/e2e/` shows no test spec files modified. No scenarios added to `tests/e2e/parts/part-list.spec.ts`, `tests/e2e/boxes/boxes-list.spec.ts`, `tests/e2e/sellers/sellers-list.spec.ts`, `tests/e2e/shopping-lists/shopping-lists.spec.ts`.
  - Impact: Debounced search behavior is unverified for four of five lists. Regressions (e.g., debounce not working, URL not updating, clear button broken) will not be caught by CI. Feature is incomplete per project definition of done (Playwright specs must accompany UI changes).
  - Fix: Add test scenarios per plan section 14:
    ```typescript
    test('search filters list with debounce', async ({ page }) => {
      const partsPage = new PartsPage(page);
      await partsPage.gotoList();
      await partsPage.searchInput.fill('resistor');
      await partsPage.waitForListState('ready');
      await expect(page).toHaveURL(/search=resistor/);
      await partsPage.expectNoResults(); // or assert filtered results
    });
    ```
    Repeat for boxes, sellers, shopping lists with appropriate assertions on filtered results and instrumentation metadata.
  - Confidence: High — this is explicitly required by the plan and missing entirely.

- **Major — Page object search methods don't wait for debounce completion**
  - Evidence:
    - Plan section 13 documents pattern: `await waitForListLoading(this.page, 'parts.list', 'ready');` after filling search input
    - All page object `search()` methods only fill input without waiting:
      - `tests/support/page-objects/kits-page.ts:242-244`
      - `tests/support/page-objects/parts-page.ts:76-78`
      - `tests/support/page-objects/boxes-page.ts:38-40`
      - `tests/support/page-objects/sellers-page.ts:38-40`
  - Impact: Tests that call `partsPage.search('LED')` then immediately assert results will race against 300ms debounce + query refetch. Assertions on URL (`expect(page).toHaveURL(/search=LED/)`) or filtered results will flake, especially on slow CI runners. This affects existing tests that use search page object methods.
  - Fix: Update all page object `search()` methods to wait for list loading:
    ```typescript
    async search(term: string): Promise<void> {
      await this.searchInput.fill(term);
      await waitForListLoading(this.page, 'parts.list', 'ready');
    }
    ```
    Apply to kits, parts, boxes, sellers page objects. Shopping lists page object doesn't expose a `search()` helper, so tests must manually wait.
  - Confidence: High — plan explicitly documents this pattern, and debounce timing will cause races without waits.

- **Major — Shopping lists filter instrumentation may emit stale metadata**
  - Evidence: `src/components/shopping-lists/overview-list.tsx:57-73` adds useEffect to emit `beginUiState('shoppingLists.overview.filters')` when `searchTerm` changes. However, `filtersMetadata` (used by the completion effect at lines 195-198) includes computed values like `activeLists.length`, `completedLists.length` derived from `filteredLists`, which itself depends on `searchTerm` (lines 86-97).
  - Impact: If `searchTerm` changes but `filteredLists` hasn't recomputed yet (same render cycle), the filter effect at line 71 calls `beginUiState` immediately, but the completion effect at line 197 may use stale `filtersMetadata` if it runs before `filteredLists` updates. This could emit incorrect `filteredCount` to test instrumentation, causing Playwright assertions to fail or pass incorrectly.
  - Fix: Ensure `filtersMetadata` is current when `endUiState` is called. Consider deferring `beginUiState` until after `filteredLists` recomputes, or verify that `useMemo` for `filteredLists` runs before the filter effect (it should, but React doesn't guarantee memo evaluation order). Alternatively, include `filteredLists` or `filteredCount` in the filter effect dependencies to ensure it only fires after filtering recomputes.
  - Confidence: Medium — This is a subtle React timing issue. Existing tests may already cover this scenario and pass, suggesting the memo evaluation order is deterministic in practice. Worth manual testing or extending instrumentation tests to verify metadata correctness.

---

## 4) Over-Engineering & Refactoring Opportunities

- **Hotspot: Inline `preserveSearchParams` function in kits usage**
  - Evidence: `src/components/kits/kit-overview-list.tsx:137-139`
    ```typescript
    preserveSearchParams={(current) => ({
      status: current.status as KitStatus,
    })}
    ```
    Inline function is recreated on every render, triggering useEffect dependency change (`src/components/common/debounced-search-input.tsx:65` includes `preserveSearchParams` in deps).
  - Suggested refactor: Wrap in `useCallback` in `src/routes/kits/index.tsx`:
    ```typescript
    const preserveSearchParams = useCallback((current: Record<string, unknown>) => ({
      status: current.status as KitStatus,
    }), []);
    ```
    Pass stable reference to `<DebouncedSearchInput>`.
  - Payoff: Eliminates unnecessary effect re-runs (effect still has guard, so no correctness issue, but cleaner). Minor performance gain.

- **Hotspot: `currentSearch` dependency in DebouncedSearchInput**
  - Evidence: `src/components/common/debounced-search-input.tsx:40,65` — `useSearch({ strict: false })` returns `currentSearch`, included in navigation effect dependencies. If TanStack Router's `useSearch` returns new object reference on every render (common pattern), effect runs every render even when search params unchanged.
  - Suggested refactor: Investigate if `useSearch` returns stable reference when params unchanged. If not, consider alternative: exclude `currentSearch` from deps and call `useSearch()` inside effect, or use deep comparison via custom hook. However, this may be acceptable as-is since guard prevents redundant navigation.
  - Payoff: Reduce effect executions (currently runs + returns early every render). Low priority; no functional impact.

- **Hotspot: Page object `clearSearch` inconsistency**
  - Evidence:
    - Kits: `tests/support/page-objects/kits-page.ts:246-251` — checks `isVisible()`, uses `click({ force: true })`
    - Boxes/Sellers: `tests/support/page-objects/boxes-page.ts:42-46`, `sellers-page.ts:42-46` — calls `input.clear()` + `blur()`
    - Parts: `tests/support/page-objects/parts-page.ts:80-82` — fills with empty string
  - Suggested refactor: Align all to simpler pattern (click clear button if visible, else fill empty):
    ```typescript
    async clearSearch(): Promise<void> {
      if (await this.searchClear.isVisible()) {
        await this.searchClear.click();
      } else {
        await this.searchInput.fill('');
      }
      await waitForListLoading(this.page, 'parts.list', 'ready');
    }
    ```
  - Payoff: Consistency, easier maintenance. Include wait to avoid same race condition as `search()` method.

---

## 5) Style & Consistency

- **Pattern: Inconsistent search clear implementation across page objects**
  - Evidence: Kits uses visibility check + `click({ force: true })`, boxes/sellers use `input.clear()` + `blur()`, parts uses `fill('')`. All achieve same end result but confuse future maintainers.
  - Impact: Developers copying patterns may pick inconsistent approach; harder to audit test reliability.
  - Recommendation: Document canonical pattern in `docs/contribute/testing/playwright_developer_guide.md` under page object helpers, e.g., "To clear search: click clear button if visible, else fill with empty string. Always wait for list_loading ready after."

- **Pattern: Missing wait calls in page object search methods**
  - Evidence: All page objects `search()` methods lack `waitForListLoading` (see Major finding above).
  - Impact: Latent test flakiness; violates plan's documented pattern (section 13).
  - Recommendation: Add wait calls as documented in plan; enforce via code review checklist for future list components.

---

## 6) Tests & Deterministic Coverage (new/changed behavior only)

**Surface: Debounced search input behavior**

**Scenarios (per plan section 13):**

- **Kits**: Already has search persistence test (`tests/e2e/kits/kits-overview.spec.ts:140-159`). Verify it still passes after refactor (likely does, since kits had debounce before). ✓ (assumed; plan says "run existing tests")

- **Parts, Boxes, Sellers, Shopping Lists**: MISSING scenarios
  - Expected: "Given user visits list overview, When user types search term and waits for query completion, Then URL updates with search param, list filters, instrumentation emits ready event with searchTerm in metadata"
  - Expected: "Given user types search, When user clicks clear button, Then URL updates immediately (no debounce), list shows all results"
  - Expected: "Given user searches and navigates back, Then search input reflects URL state"

**Hooks:**
- `data-testid="{prefix}.search"` (container) ✓
- `data-testid="{prefix}.search.input"` (input field) ✓
- `data-testid="{prefix}.search.clear"` (clear button) ✓
- `waitForListLoading(page, scope, 'ready')` with metadata assertions on `searchTerm` and `filtered` fields ✓

**Gaps:**

- **Missing scenarios**: Zero test specs added for parts, boxes, sellers, shopping lists debounced search. Plan section 14 (Slices 2-5) requires adding scenarios to `tests/e2e/{parts,boxes,sellers,shopping-lists}/*.spec.ts`. This is the primary coverage gap.

- **Page object waits**: Search methods don't wait for list loading, so even if tests are added, they will flake without page object fixes (see Major finding above).

**Evidence:**
- Plan: `docs/features/table_list_refinements/plan.md:147-161` (test updates required)
- Existing kits test: `tests/e2e/kits/kits-overview.spec.ts:140-159`
- Page object search methods: `tests/support/page-objects/*-page.ts` (no waits)

---

## 7) Adversarial Sweep (must attempt ≥3 credible failures or justify none)

**Attempt 1: Race between clear button and pending debounce timer**

- Attack: User types "new value" (starts 300ms timer), immediately clicks clear before timer fires. Does stale `debouncedSearch="new value"` overwrite the cleared state?
- Code path: `src/components/common/debounced-search-input.tsx:71-85` (clear handler) vs `src/lib/utils/debounce.ts:10-17` (debounce hook)
- Evidence: Debounce hook cleanup function (`return () => clearTimeout(handle);`) clears timeout when `searchInput` changes. When user types "new", timeout starts. When user clicks clear, `setSearchInput('')` triggers, changing `searchInput` value, which re-runs the debounce effect, clearing the old timeout. So `debouncedSearch` never updates to "new". ✓ Safe.
- Why code held up: `useDebouncedValue` cleanup guards against stale timer firing after input changes.

**Attempt 2: Infinite loop from `currentSearch` object reference changing every render**

- Attack: If `useSearch()` returns new object on every render, `currentSearch` dep in `debounced-search-input.tsx:65` causes effect to run infinitely, each time calling `navigate()`.
- Code path: `src/components/common/debounced-search-input.tsx:40,48-65`
- Evidence: Effect guard at line 50: `if (debouncedSearch === searchTerm) return;` prevents navigation when debounced value matches URL. Even if `currentSearch` triggers effect re-run, guard ensures we only navigate when `debouncedSearch` differs from `searchTerm`. ✓ Safe (inefficient but not broken).
- Why code held up: Guard compares debounced input to URL state; if they match, navigation is skipped regardless of how many times effect runs.

**Attempt 3: Stale `searchTerm` in instrumentation during debounce period**

- Attack: User types "LED" but URL hasn't updated yet (300ms pending). Instrumentation emits `list_loading` ready event with metadata. Does it include `searchTerm="LED"` or old/null value?
- Code path: `src/components/kits/kit-overview-list.tsx:59-83` (instrumentation)
- Evidence: Instrumentation uses `searchTerm` prop (from URL), not `searchInput` (local state) or `debouncedSearch` (debounced state). Line 69: `searchTerm: searchActive ? searchTerm : null` where `searchActive = searchTerm.trim().length > 0` (line 51). During debounce period, `searchTerm` (URL) hasn't updated, so instrumentation correctly reports no active search. Once debounce completes and URL updates, instrumentation includes the search term. ✓ Safe (matches plan's explicit design decision in section 9, lines 533-540).
- Why code held up: Components use URL state (`searchTerm`) for instrumentation, not intermediate local/debounced state, ensuring Playwright waits for actual navigation completion.

**Attempt 4: User navigates away before debounce completes**

- Attack: User types search, immediately clicks link to different page. Does pending timeout fire and cause navigation after unmount?
- Code path: `src/lib/utils/debounce.ts:15-17` (cleanup), `src/components/common/debounced-search-input.tsx:48-65` (navigation effect)
- Evidence: Debounce hook cleanup clears timeout on unmount. When component unmounts, `useEffect` cleanup in `useDebouncedValue` runs, calling `clearTimeout(handle)`. Pending timer is canceled; `debouncedSearch` never updates, so navigation effect never fires. ✓ Safe.
- Why code held up: React's useEffect cleanup pattern ensures timers are canceled on unmount.

**Attempt 5: Concurrent navigation from tab switch + debounced search**

- Attack: User types search term in kits "active" tab, immediately switches to "archived" tab before debounce completes. Do two concurrent navigations conflict?
- Code path: `src/routes/kits/index.tsx:35-47` (handleStatusChange), `src/components/common/debounced-search-input.tsx:48-65` (debounce navigation)
- Evidence:
  1. User types "synth" → `searchInput="synth"`, debounce timer starts
  2. User clicks "archived" tab → `handleStatusChange('archived')` calls `navigate({ search: (prev) => ({ status: 'archived', ...(prev.search ? { search: prev.search } : {}) }) })`
  3. Tab navigation fires immediately, updates URL to `?status=archived&search=<old value if any>`
  4. Component re-renders with new `status` and `searchTerm` (from URL)
  5. After 300ms, `debouncedSearch="synth"`, effect runs
  6. Effect calls `navigate({ to: '/kits', search: { status: <current>, search: 'synth' } })` using `preserveSearchParams` to grab current status (now "archived")
  7. URL updates to `?status=archived&search=synth` ✓
- Why code held up: `preserveSearchParams` callback captures current URL state (including new tab) when debounce navigation fires, so search term is added without losing tab selection.

---

## 8) Invariants Checklist (table)

- **Invariant**: `searchInput` (local state) must sync with `searchTerm` (URL prop) on browser back/forward navigation
  - Where enforced: `src/components/common/debounced-search-input.tsx:42-45` — useEffect watching `searchTerm`
  - Failure mode: User navigates back to previous search; input shows stale value instead of URL state
  - Protection: Effect calls `setSearchInput(searchTerm)` whenever `searchTerm` changes (from route navigation)
  - Evidence: Plan section 5, lines 396-408 documents this pattern from kits implementation

- **Invariant**: Debounced navigation must not fire if `debouncedSearch` matches current `searchTerm` (URL)
  - Where enforced: `src/components/common/debounced-search-input.tsx:49-52` — guard in navigation effect
  - Failure mode: Effect runs on every render (due to `currentSearch`/`preserveSearchParams` deps), causing infinite navigation loop or history pollution
  - Protection: `if (debouncedSearch === searchTerm) return;` skips navigation when values match
  - Evidence: Plan section 5, lines 451-463 describes guard; lines 48-65 show implementation

- **Invariant**: Clear button must bypass debounce and navigate immediately
  - Where enforced: `src/components/common/debounced-search-input.tsx:71-85` — `handleClear` directly calls `navigate()` instead of updating `searchInput` only
  - Failure mode: User clicks clear but must wait 300ms for debounce timer; feels laggy
  - Protection: Clear handler sets `searchInput=''` AND calls `navigate()` synchronously, bypassing debounce logic
  - Evidence: Plan section 5, lines 376-394 documents clear flow; line 79 shows immediate navigation

- **Invariant**: Instrumentation must use URL `searchTerm`, not local `searchInput` or `debouncedSearch`
  - Where enforced: All list components pass `searchTerm` prop (from URL) to instrumentation metadata, e.g., `src/components/kits/kit-overview-list.tsx:69`
  - Failure mode: Playwright waits for `list_loading` ready event but metadata shows `searchTerm` for a search that's still pending (debounce not completed); test assertions on URL or filtered count mismatch
  - Protection: Components derive `searchActive` from `searchTerm`, include `searchTerm` in metadata only after URL updates
  - Evidence: Plan section 9, lines 533-540 explicitly states "IMPORTANT: Instrumentation now uses URL searchTerm instead of debouncedSearch"

- **Invariant**: Debounce timer must be cleared on component unmount to prevent navigation after unmount
  - Where enforced: `src/lib/utils/debounce.ts:15-17` — useEffect cleanup function calls `clearTimeout(handle)`
  - Failure mode: User types search, navigates away; 300ms later, debounce timer fires, updating `debouncedSearch` in unmounted component, potentially triggering navigation in wrong context or React warning
  - Protection: React useEffect cleanup runs on unmount, clearing timeout
  - Evidence: Plan section 8, lines 481-486 documents cleanup; standard React pattern

---

## 9) Questions / Needs-Info

- **Question**: Are existing Playwright tests (kits, parts, boxes, sellers, shopping lists) passing after this change?
  - Why it matters: Kits already had debounce and search tests. If tests fail after refactor, indicates regression (e.g., selector changes broke assertions, wait logic insufficient). Other lists had immediate search; their tests may now flake without page object updates.
  - Desired answer: Confirmation that `pnpm playwright test tests/e2e/kits/kits-overview.spec.ts` passes (ideally run 5-10 times to catch flakes per plan section 14). Also confirm existing tests for parts/boxes/sellers/shopping lists pass or were updated to account for debounce.

- **Question**: Does TanStack Router's `useSearch()` return stable object reference when search params unchanged?
  - Why it matters: If `useSearch()` returns new object on every render, `currentSearch` dependency in `debounced-search-input.tsx:65` causes effect to run every render. Guard protects correctness, but impacts performance (unnecessary re-runs).
  - Desired answer: Profiler trace or TanStack Router docs confirming `useSearch` memoizes return value when params unchanged, or acknowledgment that extra effect runs are acceptable tradeoff for simpler code.

- **Question**: Should `preserveSearchParams` be wrapped in `useCallback` in kits route?
  - Why it matters: Inline function at `kit-overview-list.tsx:137-139` changes reference on every render, triggering effect re-run in DebouncedSearchInput. Guard prevents incorrect behavior, but cleaner to stabilize.
  - Desired answer: Decision to either (1) add `useCallback` wrapper in route components that use `preserveSearchParams`, or (2) accept current implementation as "good enough" since guard mitigates.

---

## 10) Risks & Mitigations (top 3)

- **Risk**: Test flakiness due to missing waits in page object search methods
  - Mitigation: Update all page object `search()` methods to call `await waitForListLoading(this.page, '<scope>', 'ready')` after filling input. Update `clearSearch()` methods similarly. Re-run full Playwright suite 3-5 times to verify stability.
  - Evidence: Major finding above; plan section 13 documents required pattern (`plan.md:680-710`)

- **Risk**: Unverified debounced search behavior for parts, boxes, sellers, shopping lists
  - Mitigation: Add Playwright scenarios per plan section 14 (Slices 2-5) before merging. Minimum: one scenario per list testing "type search → wait for ready → assert URL + filtered results" and "click clear → assert immediate URL update". Run new tests 5-10 times to catch timing issues.
  - Evidence: Blocker finding above; plan `plan.md:756-795` (Slices 2-5 require test updates)

- **Risk**: Shopping lists filter instrumentation timing issue (searchTerm changes before filteredLists recomputes)
  - Mitigation: Manual test: navigate to shopping lists overview, type search term, inspect `list_loading` ready event metadata via browser console (`window.__testEvents`). Verify `filteredCount` matches visible results. If mismatch, add `filteredCount` to filter effect dependencies (line 73) or defer `beginUiState` until after useMemo runs.
  - Evidence: Major finding above; `shopping-lists/overview-list.tsx:57-73,195-198`

---

## 11) Confidence

Confidence: **Medium** — Core refactor is well-executed: centralized component eliminates duplication, instrumentation correctly uses URL state, debounce logic includes proper cleanup and guards. However, missing test coverage (zero scenarios added for four lists) and page object timing gaps leave behavior unverified. The implementation likely works (TypeScript/lint pass, architecture matches proven kits pattern), but without Playwright verification and page object fixes, there's risk of latent flakiness or edge-case bugs surfacing post-merge. Confidence will upgrade to High once test scenarios are added and page object search methods include `waitForListLoading` calls.
