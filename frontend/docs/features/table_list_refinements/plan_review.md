# List Refinements – Plan Review

## 1) Summary & Decision

**Readiness**

The plan demonstrates solid research into the existing kits implementation and correctly identifies the core pattern to replicate. The technical approach of extracting debounced search into a reusable component is sound, and the plan's comprehensiveness in documenting state flows, instrumentation contracts, and edge cases is commendable. However, the proposed architecture introduces a fundamental shift in navigation ownership that conflicts with the current route-component separation pattern. The kits implementation has the *route* own the `handleSearchChange` callback (routes/kits/index.tsx:49-67), whereas the plan proposes the *component* call `navigate()` directly (plan.md:251, 308). This creates architectural ambiguity around who controls navigation, how `preserveSearchParams` integrates with route validateSearch schemas, and—critically—how parent components access `debouncedSearch` for instrumentation when it becomes internal state of the search component. Three blocker-severity gaps prevent immediate implementation: (1) navigation ownership is undefined, (2) instrumentation contract placement is unspecified, and (3) parent components cannot compute derived state like `searchActive` without accessing `debouncedSearch`.

**Decision**

`GO-WITH-CONDITIONS` — The plan requires architectural clarification before Slice 1 can proceed. Specifically: resolve whether routes or components own navigation callbacks, specify where `useListLoadingInstrumentation` lives and how it accesses `debouncedSearch`, define the `preserveSearchParams` contract with concrete examples for kits/shopping-lists, and document the Playwright test strategy for 300ms debounce timing. Once these are addressed, the proven kits pattern and comprehensive edge-case analysis provide a solid foundation for implementation.

---

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `docs/contribute/architecture/application_overview.md` — **Pass** — plan.md:3-11, plan.md:85-87 — Plan correctly identifies domain-driven folder structure (`src/components/common/`) for the new reusable component and uses existing `useDebouncedValue` hook from `src/lib/utils/debounce.ts` (plan.md:8).

- `docs/contribute/testing/playwright_developer_guide.md` — **Fail** — plan.md:534-576 — Plan lists test scenarios but does not specify deterministic wait strategy for 300ms debounce. Playwright guide requires "Deterministic waits – Assertions rely on UI visibility, network promises, or test-event signals—never fixed sleeps" (playwright_developer_guide.md:18). Plan says page object methods "may need timing adjustments" (plan.md:154-157) but provides no concrete implementation (e.g., wait for `list_loading` event after debounce, use Playwright clock manipulation, or wait for URL parameter change).

- `docs/contribute/testing/playwright_developer_guide.md` — **Pass** — plan.md:359-363 — Plan correctly preserves `useListLoadingInstrumentation` contract and includes `searchTerm` in metadata (plan.md:77-101 references kits implementation).

- `docs/contribute/architecture/test_instrumentation.md` — **Pass** — plan.md:77-101, plan.md:419-431 — Plan documents that instrumentation emits `list_loading` events with `scope`, `phase`, `metadata.searchTerm`, and `metadata.filtered` fields, matching the taxonomy in test_instrumentation.md:23.

- `docs/product_brief.md` — **Pass** — plan.md:84-87 — Product brief describes "One simple search box" (product_brief.md:85-87) for finding parts/boxes/etc. Plan applies debounced search uniformly across all list views, consistent with the product vision of fast, focused search.

- `AGENTS.md` — **Fail** — plan.md:131-159 — AGENTS.md:44-46 states "Ship instrumentation changes and matching Playwright coverage in the same slice; a UI feature is incomplete without automated verification." Plan defers test updates to separate slices (plan.md:591-621) rather than bundling instrumentation + tests atomically. Slice 1 (plan.md:581-588) only runs existing kits tests but doesn't add new debounce-specific coverage until later slices.

**Fit with codebase**

- `src/routes/kits/index.tsx` — plan.md:48-67, plan.md:112-113 — **Alignment issue**: Plan claims routes will "pass only searchTerm prop" (plan.md:34, 112) and remove `handleSearchChange` callback (plan.md:112-113). However, current kits route owns navigation logic in `handleSearchChange` (routes/kits/index.tsx:49-67), which preserves the `status` parameter via `search: (prev) => ({ ...prev, search: nextSearch })`. Plan proposes component calls `navigate()` directly (plan.md:251, 308), breaking route ownership of navigation. This conflicts with TanStack Router pattern where routes own state transitions and components receive callbacks.

- `src/components/parts/part-list.tsx` — plan.md:92-105 — **Confirmed**: Plan correctly identifies that parts list updates URL on every keystroke (part-list.tsx:92-105 calls `navigate()` immediately in `handleSearchChange`), supporting the need for debounce.

- `src/lib/test/query-instrumentation.ts` — plan.md:77-101, plan.md:359-363 — **Alignment issue**: Plan claims instrumentation contract is preserved, but if `debouncedSearch` becomes internal state of `DebouncedSearchInput`, parent list components cannot access it to compute `searchActive = debouncedSearch.trim().length > 0` (plan.md:315-320). Current kits implementation has `debouncedSearch` in component scope (kit-overview-list.tsx:39), allowing `useListLoadingInstrumentation` to reference it (kit-overview-list.tsx:87). Plan does not specify how parent components access `debouncedSearch` when it's encapsulated in the search input component.

- `src/lib/utils/debounce.ts` — plan.md:8, plan.md:473-476 — **Pass**: Plan correctly references `useDebouncedValue` hook and documents cleanup behavior (debounce.ts:15-17 clears timeout on unmount/value change).

---

## 3) Open Questions & Ambiguities

- **Question**: Who owns navigation in the new architecture: routes or the `DebouncedSearchInput` component?
- **Why it matters**: Current kits route defines `handleSearchChange` callback (routes/kits/index.tsx:49-67) that the component calls. Plan says component will "directly call navigate()" (plan.md:251, 308), requiring the component to import `useNavigate` from TanStack Router. If components own navigation, they become tightly coupled to routing; if routes own it, the `preserveSearchParams` callback (plan.md:179-180) becomes unnecessary because routes already handle search preservation logic.
- **Needed answer**: Explicit decision on whether the component receives an `onSearchChange(term: string)` callback (current pattern) or calls `navigate()` internally (plan's proposal). Document trade-offs for each approach and choose one consistently.

---

- **Question**: How does `preserveSearchParams` interact with route `validateSearch` schemas?
- **Why it matters**: Plan proposes `preserveSearchParams?: (currentSearch: Record<string, unknown>) => Record<string, unknown>` (plan.md:179-180) but doesn't show a concrete implementation for kits (which must preserve `status: KitStatus`) or shopping lists (where `search` is required with default `''`, plan.md:208). The callback receives `Record<string, unknown>` but kits route has a typed schema `KitsSearchState` (routes/kits/index.tsx:8-11). TypeScript won't enforce the correct shape.
- **Needed answer**: Provide concrete examples of `preserveSearchParams` for kits and shopping lists. Specify how the component accesses `currentSearch` (does it call `useSearch()` internally?) and how to maintain type safety with route validateSearch schemas.

---

- **Question**: Where does `useListLoadingInstrumentation` live in the new architecture, and how does it access `debouncedSearch`?
- **Why it matters**: Plan section 6 (plan.md:306-335) documents that `searchActive` is derived from `debouncedSearch.trim().length > 0` and passed to instrumentation (plan.md:87). Current kits implementation has `debouncedSearch` in component scope (kit-overview-list.tsx:39), allowing instrumentation to reference it (kit-overview-list.tsx:77-101). If `DebouncedSearchInput` encapsulates `debouncedSearch` as internal state, parent components can only see `searchTerm` from the URL. During the debounce period (user typed but 300ms hasn't elapsed), `searchInput = "foo"`, `debouncedSearch = ""`, `searchTerm (URL) = ""`. Parent cannot compute `searchActive` correctly.
- **Needed answer**: Either (1) expose `debouncedSearch` via a prop/callback from `DebouncedSearchInput`, (2) move instrumentation into the search component (but it doesn't have access to query state), or (3) accept that instrumentation uses `searchTerm` from URL instead of `debouncedSearch` (but this breaks the contract documented in plan.md:87, 361-362).

---

- **Question**: What is the deterministic Playwright test strategy for waiting on debounced search?
- **Why it matters**: Plan says page object search methods "may need timing adjustments" (plan.md:154-157) but doesn't specify how. Playwright guide forbids fixed waits (playwright_developer_guide.md:18, 156-158). Options: (1) wait for `list_loading` `ready` event after typing, (2) wait for URL parameter change, (3) use Playwright's `clock.install()` to control time, or (4) expose debounce state via test-mode data attribute. Plan doesn't choose one.
- **Needed answer**: Specify the recommended pattern. If using `waitForListLoading`, document that tests must wait for the event *after* debounce completes (not immediately after typing). Update plan.md section 13 with concrete Playwright code snippets.

---

## 4) Deterministic Playwright Coverage (new/changed behavior only)

- **Behavior**: Debounced search input on parts, boxes, sellers, shopping lists (kits already has it)
- **Scenarios**:
  - Given user visits parts list, When user types "capacitor" and waits 300ms, Then URL updates with `?search=capacitor`, list filters to matching results, `list_loading` ready event includes `searchTerm: "capacitor"` (`tests/e2e/parts/part-list.spec.ts` — not yet specified in plan)
  - Given user is typing "resistor", When user types additional characters within 300ms, Then URL does not update until 300ms after last keystroke (plan.md:544-545 — test location not specified)
  - Given user has searched "LED", When user clicks clear button, Then URL updates immediately (no debounce delay), `list_loading` ready event includes `searchTerm: null` (plan.md:547-550 — test location not specified)
  - Given user searches "relay", When user clicks browser back, Then search input reflects previous URL state (plan.md:551-554 — test location not specified)
- **Instrumentation**: `data-testid="{list-prefix}.search-container"`, `data-testid="{list-prefix}.search.input"`, `data-testid="{list-prefix}.search.clear"`, `waitForListLoading(page, 'parts.list', 'ready')` with metadata assertions on `searchTerm` field (plan.md:564-567)
- **Backend hooks**: None required (search is client-side filtering or standard backend query parameter; no special test hooks needed)
- **Gaps**: Plan does not specify how Playwright waits for 300ms debounce to complete. Missing deterministic wait strategy (e.g., "wait for URL parameter change" or "wait for `list_loading` event emitted after debounce"). Missing concrete test file names and line numbers for new specs (plan.md:595-620 says "add or update tests" but doesn't define acceptance criteria for each list).
- **Evidence**: plan.md:534-576 (test scenarios), plan.md:131-159 (test file list), playwright_developer_guide.md:129-154 (instrumentation assertions)

---

- **Behavior**: Kits debounced search (refactored to use new component)
- **Scenarios**:
  - Given kits list has existing search test, When refactor is complete, Then `tests/e2e/kits/kits-overview.spec.ts:140-159` passes without modification (plan.md:587)
- **Instrumentation**: Existing `data-testid="kits.overview.search"`, `data-testid="kits.overview.search.input"`, `data-testid="kits.overview.search.clear"` (kit-overview-list.tsx:159-180)
- **Backend hooks**: None required
- **Gaps**: Plan assumes kits tests pass after refactor, but if component navigation architecture changes (component calls `navigate()` instead of `onSearchChange` callback), tests might break. Plan doesn't specify regression testing strategy for Slice 1.
- **Evidence**: plan.md:574-575 (existing kits test), plan.md:581-588 (Slice 1 validation)

---

## 5) Adversarial Sweep

**Major — Component Navigation Ownership Conflicts with Route Pattern**

**Evidence:** plan.md:251, 308, 170 — Plan proposes component will "calls `navigate({ to, search, replace: true })`" and receive `routePath: string` prop. However, routes/kits/index.tsx:49-67 shows kits route owns `handleSearchChange` callback that component calls: `onSearchChange(debouncedSearch)` (kit-overview-list.tsx:49). Plan says "routes will pass only searchTerm prop" (plan.md:34, 112-113), removing the callback.

**Why it matters:** This breaks established architecture where routes own navigation logic and components receive callbacks. If component imports `useNavigate` and calls it directly, the component becomes tightly coupled to TanStack Router (reducing reusability) and must implement search parameter preservation logic that should live in the route. The `preserveSearchParams` callback (plan.md:179-180) is a workaround for this architectural mismatch. Current pattern (callback-based) is cleaner: route defines preservation strategy, component calls callback with new search term.

**Fix suggestion:** Keep the callback pattern. Component prop signature: `onSearchChange: (search: string) => void` (remove `routePath` and `preserveSearchParams` props). Routes continue to own `handleSearchChange` logic. Component remains decoupled from routing. Update plan.md:164-181 to reflect callback-based API and update plan.md:251, 308 to show component calling `onSearchChange(debouncedSearch)` instead of `navigate()`.

**Confidence:** High — Current kits implementation proves callback pattern works; plan's navigation ownership shift introduces complexity without clear benefit.

---

**Blocker — Instrumentation Cannot Access debouncedSearch in Proposed Architecture**

**Evidence:** plan.md:315-320, 87, 360-363 — Plan documents `searchActive = debouncedSearch.trim().length > 0` is derived value passed to `useListLoadingInstrumentation` (plan.md:87: `searchTerm: searchActive ? debouncedSearch : null`). Current kits implementation has `debouncedSearch` in component scope (kit-overview-list.tsx:39, 77-101). Plan proposes extracting search logic into `DebouncedSearchInput` component (plan.md:85-87), making `debouncedSearch` internal state.

**Why it matters:** Parent list components need `debouncedSearch` to compute derived state (`searchActive`, `filtered` count). Plan.md:322-327 documents `filteredCount` is "Only set if `filteredLists.length < allLists.length`". During debounce period, `searchInput` has changed but `debouncedSearch` and `searchTerm (URL)` have not. Parent component sees `searchTerm = ""` from URL, computes `searchActive = false`, and instrumentation metadata omits `filtered` field—breaking test contract. Invariant in plan.md:312 requires "`debouncedSearch` must eventually converge with `searchTerm`", but between keystrokes they diverge and parent cannot observe intermediate state.

**Fix suggestion:** Either (1) expose `debouncedSearch` via render prop or callback (`onDebouncedSearchChange?: (debouncedSearch: string) => void`) so parent can compute derived state, or (2) keep search state in parent component (list component owns `searchInput`, `debouncedSearch`, `useEffect` for URL sync) and extract only the *UI* (Input + clear button) into a presentational component that receives `value`, `onChange`, `onClear` props. Option 2 preserves current architecture and avoids state accessibility issues.

**Confidence:** High — Derived state invariants in plan.md section 6 require parent components to access `debouncedSearch`; encapsulation breaks this contract.

---

**Major — Clear Button Race Condition with Debounce Timer**

**Evidence:** plan.md:272-287, debounce.ts:10-17, kit-overview-list.tsx:107-110 — Plan says clear button sets `searchInput = ''` and "calls `navigate()` immediately" (plan.md:276), bypassing debounce. Current kits implementation: `setSearchInput('')` + `onSearchChange('')` (kit-overview-list.tsx:107-110). `useDebouncedValue` has pending timeout from previous input.

**Why it matters:** When user types "resistor" (triggers debounce timer) then immediately clicks clear:
1. Timer from "resistor" is still pending (300ms hasn't elapsed)
2. Clear button calls `setSearchInput('')` (plan.md:275) — triggers *new* debounce timer for empty string
3. Clear button calls `navigate()` immediately (plan.md:276) — URL becomes `?search=` or no param
4. Original "resistor" debounce timer fires — `debouncedSearch` updates to "resistor"
5. `useEffect` for debounced navigation (plan.md:251) sees `debouncedSearch = "resistor"` and navigates again, overwriting the clear

**Fix suggestion:** Immediate navigation in clear handler prevents the issue IF the clear handler updates both `searchInput` and URL before the old debounce timer fires. However, plan.md:275-276 says "Component sets `searchInput` to `''` immediately" then "calls navigate()". If there's any async gap, race occurs. Recommend: clear handler should call `onSearchChange('')` (callback-based pattern) OR if keeping direct navigation, add a ref to track whether clear was clicked and guard the debounce useEffect: `if (clearClickedRef.current) return;`.

**Confidence:** Medium — Current kits implementation uses callback pattern (kit-overview-list.tsx:107-110) which avoids the race because route's `handleSearchChange` is synchronous. Plan's direct-navigation approach might introduce race if not careful.

---

**Major — preserveSearchParams Callback Lacks Type Safety and Concrete Examples**

**Evidence:** plan.md:179-180 — `preserveSearchParams?: (currentSearch: Record<string, unknown>) => Record<string, unknown>`. Plan.md:179: "kits needs to preserve 'status' param". routes/kits/index.tsx:8-11 defines typed `KitsSearchState` schema. plan.md:208: shopping lists have `search` as required with default `''`.

**Why it matters:**
1. How does component get `currentSearch`? Must it import `useSearch()` from TanStack Router, coupling it to routing again?
2. Kits route has typed schema `KitsSearchState` (routes/kits/index.tsx:8-11), but callback receives `Record<string, unknown>`. TypeScript won't enforce preservation of `status: KitStatus`.
3. Shopping lists require `search` with default `''` (plan.md:208). Does `preserveSearchParams` need to recreate this default logic? That duplicates route's validateSearch.
4. No concrete example provided. Plan.md:179-180 describes the prop but plan.md:186 says "Derived from kits implementation" without showing actual implementation.

**Fix suggestion:** If keeping component navigation, provide concrete examples:
```typescript
// Kits usage
<DebouncedSearchInput
  searchTerm={search}
  routePath="/kits"
  preserveSearchParams={(current) => ({ status: current.status as KitStatus })}
/>

// Shopping lists usage
<DebouncedSearchInput
  searchTerm={search}
  routePath="/shopping-lists"
  preserveSearchParams={(current) => ({ /* what goes here? */ })}
/>
```
Better: use callback pattern (`onSearchChange`) and let routes handle preservation, eliminating this prop entirely.

**Confidence:** High — Lack of concrete examples indicates design gap; callback pattern avoids this complexity.

---

**Major — Playwright Test Strategy for Debounce Timing is Underspecified**

**Evidence:** plan.md:154-157 — "Page object search methods may need timing adjustments for debounce". plan.md:627-634 — Risk mentions "Tests that fill search inputs may fail if they assert too quickly" but mitigation is vague: "update page object search methods to wait for list loading events". plan.md:564-567 lists `waitForListLoading` but doesn't specify *when* to call it.

**Why it matters:** Current page objects (e.g., kits-page.ts:242-244 mentioned in plan.md:155) assume instant navigation. With debounce, tests must wait 300ms or use deterministic signals. Playwright guide forbids `waitForTimeout` (playwright_developer_guide.md:156-158). Options:
1. Wait for URL parameter change: `await page.waitForURL(/search=resistor/)`
2. Wait for `list_loading` event after typing: `await waitForListLoading(page, 'parts.list', 'ready')` (but event fires after debounce + query, adding latency)
3. Use Playwright clock manipulation: `await page.clock.install(); await page.clock.runFor(300)` (requires test-mode cooperation)
4. Expose debounce state via data attribute: `data-debounce-pending="true"` (additional instrumentation)

Plan chooses none of these explicitly.

**Fix suggestion:** Add section to plan: "Playwright debounce wait strategy: After typing in search input, tests must wait for URL parameter change (`page.waitForURL`) OR wait for `list_loading` ready event (which fires after debounce + query completion). Update all page object search methods to call `await waitForListLoading(page, scope, 'ready')` after filling input. Document that 300ms debounce is acceptable latency for deterministic tests (no need for clock manipulation)." Update plan.md:154-157 and plan.md:627-634 with this detail.

**Confidence:** High — Tests will fail without explicit wait strategy; plan must document approach.

---

**Minor — Component Props Require TanStack Router Imports, Reducing Reusability**

**Evidence:** plan.md:170 — `routePath: string`, plan.md:251 — component calls `navigate()`. To call `navigate()`, component must import `useNavigate` from `@tanstack/react-router`.

**Why it matters:** Plan claims component is "reusable" and "portable across all list views" (plan.md:34, 56). Importing router hooks couples component to TanStack Router, reducing portability. If project ever migrates to different routing library, component must be rewritten. Callback pattern (`onSearchChange`) decouples component from routing implementation.

**Fix suggestion:** Use callback pattern. Component prop: `onSearchChange: (search: string) => void`. Component implementation: `useEffect(() => { if (debouncedSearch === searchTerm) return; onSearchChange(debouncedSearch); }, [debouncedSearch, onSearchChange, searchTerm])`. Component never imports `useNavigate`. Routes handle navigation. Update plan.md:85-87, 164-181 to reflect callback-based API.

**Confidence:** Medium — While coupling to TanStack Router is acceptable for this codebase (application_overview.md:8 documents it as core stack), callback pattern is cleaner separation of concerns.

---

**Major — Slice 1 Validation Assumes No Breaking Changes, but Architecture Shift Might Break Tests**

**Evidence:** plan.md:581-588 — Slice 1 goal: "Validate architecture by refactoring kits list (which already has debounce) to use new component" and "Run existing kits Playwright tests to verify no regressions". plan.md:112-113 — "Update `src/routes/kits/index.tsx` to remove handleSearchChange callback".

**Why it matters:** If Slice 1 removes `handleSearchChange` callback (routes/kits/index.tsx:49-67) and has component call `navigate()` directly, this is a breaking architectural change. Existing kits tests (tests/e2e/kits/kits-overview.spec.ts:140-159) rely on current behavior. If component navigation introduces timing differences (e.g., debounce useEffect fires at different point in React lifecycle), tests might fail intermittently. Plan assumes "no regressions" but provides no mitigation if tests break.

**Fix suggestion:** Slice 1 should (1) create new component with callback-based API (preserving current pattern), (2) refactor kits to use it (no route changes needed), (3) verify all kits tests pass, (4) confirm TypeScript, lint, and build pass. If using direct-navigation approach, add explicit regression testing step: run kits tests 10 times locally to catch timing issues before proceeding to Slice 2.

**Confidence:** Medium — Tests might pass with direct-navigation approach, but risk is non-zero; callback pattern eliminates risk.

---

## 6) Derived-Value & State Invariants (table)

- **Derived value**: `debouncedSearch`
  - **Source dataset**: Local `searchInput` state (unfiltered user input), delayed by 300ms via `useDebouncedValue`
  - **Write / cleanup triggered**: Triggers URL navigation via `navigate()` call in useEffect (plan.md:251); cleanup handled by `useDebouncedValue` clearing timeout on unmount (debounce.ts:15-17)
  - **Guards**: `useEffect` compares `debouncedSearch === searchTerm` to avoid redundant navigation (plan.md:46-47, 311)
  - **Invariant**: `debouncedSearch` must eventually converge with `searchTerm` prop (URL state) after debounce period completes, ensuring URL reflects intended search state. During debounce period, `debouncedSearch` may lag behind `searchInput` by up to 300ms.
  - **Evidence**: plan.md:306-313, kit-overview-list.tsx:39, 46-50

- **Derived value**: `searchActive`
  - **Source dataset**: `debouncedSearch.trim().length > 0` (boolean derived from debounced search state)
  - **Write / cleanup triggered**: Passed to `useListLoadingInstrumentation` metadata (plan.md:87: `searchTerm: searchActive ? debouncedSearch : null`); determines whether `filtered` count appears in instrumentation
  - **Guards**: None (pure derived boolean)
  - **Invariant**: Must accurately reflect whether a search filter is applied so Playwright tests can assert on filtered state. If parent component cannot access `debouncedSearch` (because it's encapsulated in `DebouncedSearchInput` component), this invariant breaks—parent will compute `searchActive` from URL `searchTerm` instead, which lags during debounce period.
  - **Evidence**: plan.md:315-320, kit-overview-list.tsx:69, 86-87

> **Flag Major**: `searchActive` uses `debouncedSearch` (filtered by debounce logic) to drive instrumentation metadata writes (`list_loading` events) without guards. If `DebouncedSearchInput` component encapsulates `debouncedSearch`, parent cannot compute `searchActive` correctly during debounce period. This violates the invariant that instrumentation metadata must reflect current search state for deterministic tests. Requires either (1) exposing `debouncedSearch` from component or (2) accepting that instrumentation uses URL `searchTerm` (breaking documented contract in plan.md:87, 361-362).

- **Derived value**: `filteredCount` (in parent list components)
  - **Source dataset**: Filtered list length when `searchActive` is true (e.g., `filteredParts.length` in parts list, computed from `parts.filter(...)` using `searchTerm`)
  - **Write / cleanup triggered**: Displayed in `<ListScreenCounts>` (plan.md:324); included in `useListLoadingInstrumentation` metadata as `filtered: <count>` (plan.md:86, 325-326)
  - **Guards**: Only set if `filteredLists.length < allLists.length` (plan.md:325); instrumentation uses conditional spread: `...(searchActive ? { filtered: activeKits.length } : {})` (kit-overview-list.tsx:86)
  - **Invariant**: When `searchActive`, instrumentation metadata must include `filtered: <count>` for Playwright assertions. List filtering logic uses `searchTerm` from URL (part-list.tsx:112-127: `useMemo(() => { if (!searchTerm.trim()) return parts; ... }, [parts, searchTerm, typeMap])`), not `debouncedSearch`, so this invariant holds as long as parent components use URL `searchTerm` for filtering.
  - **Evidence**: plan.md:322-327, kit-overview-list.tsx:154, part-list.tsx:111-127

- **Derived value**: `searchInput` (synced from URL)
  - **Source dataset**: `searchTerm` prop from route (URL query parameter)
  - **Write / cleanup triggered**: `setSearchInput(searchTerm)` in useEffect when `searchTerm` prop changes (plan.md:41-43, 330-334)
  - **Guards**: `useEffect` dependency on `searchTerm` ensures sync only fires when URL changes (browser back/forward, direct navigation)
  - **Invariant**: After browser navigation (back/forward), `searchInput` must match URL to prevent user seeing stale input value. This ensures input displays value from URL history, maintaining consistency between displayed state and addressable state.
  - **Evidence**: plan.md:329-334, kit-overview-list.tsx:41-43

---

## 7) Risks & Mitigations (top 3)

- **Risk**: Parent list components cannot access `debouncedSearch` to compute `searchActive` for instrumentation if new component encapsulates it as internal state. This breaks Playwright test contract that expects `list_loading` events to include `searchTerm: debouncedSearch` (plan.md:87, 361-362).
- **Mitigation**: Resolve architectural decision: either (1) expose `debouncedSearch` via callback prop (`onDebouncedSearchChange?: (debouncedValue: string) => void`) so parent can track it, (2) keep search state in parent component and extract only presentational UI into reusable component, or (3) accept that instrumentation uses URL `searchTerm` instead (document this change in plan and verify Playwright tests tolerate debounce lag). Clarify in plan.md section 3 (Data Model / Contracts) and update section 9 (Observability / Instrumentation) with chosen approach.
- **Evidence**: plan.md:315-320, 360-363, kit-overview-list.tsx:77-101

---

- **Risk**: Direct component navigation (`component calls navigate()`) conflicts with route ownership pattern and introduces `preserveSearchParams` callback complexity without type safety. Kits route must preserve `status: KitStatus` parameter; shopping lists have required `search` with default `''`. No concrete examples provided for how to implement callback correctly.
- **Mitigation**: Switch to callback pattern: component receives `onSearchChange: (search: string) => void` prop, routes continue to own `handleSearchChange` logic that preserves other search parameters. This eliminates `preserveSearchParams` prop, maintains separation of concerns, and preserves type safety via route's validateSearch schema. Update plan.md sections 3 (Data Model), 4 (API / Integration Surface), and 5 (Algorithms & UI Flows) to reflect callback-based API.
- **Evidence**: plan.md:170, 179-180, routes/kits/index.tsx:49-67

---

- **Risk**: Playwright test timing regressions due to 300ms debounce. Page object methods assume instant navigation (plan.md:154-157); tests may assert before debounce completes, causing flaky failures. Plan acknowledges risk (plan.md:627-629) but mitigation is vague ("update page object search methods").
- **Mitigation**: Document explicit wait strategy: tests must call `await page.waitForURL(/search=.../)` after typing OR `await waitForListLoading(page, scope, 'ready')` to wait for query completion. Update page object search methods (kits-page.ts:242-244, parts-page.ts, etc.) to include deterministic waits. Add note to plan.md section 13 (Deterministic Test Plan) with code examples. Consider exposing debounce state via `data-debounce-pending="true"` attribute if URL/event waits prove insufficient.
- **Evidence**: plan.md:154-157, 627-634, playwright_developer_guide.md:156-158

---

## 8) Confidence

**Confidence: Medium** — The plan demonstrates thorough research (kits implementation analysis is accurate), comprehensive state flow documentation, and awareness of edge cases (browser back/forward, clear button, instrumentation). However, three architectural ambiguities prevent high confidence: (1) navigation ownership (route callbacks vs. component `navigate()`) is unresolved and conflicts with current pattern, (2) instrumentation contract (how parent accesses `debouncedSearch`) is underspecified, and (3) Playwright test strategy for debounce timing lacks concrete implementation. Once these are clarified, the proven kits pattern and detailed edge-case coverage provide a solid implementation foundation.
