### 1) Summary & Decision
Plan captures the Phase 5 surface areas, but instrumentation sequencing and deterministic test setup have critical gaps that will block execution until clarified. **Decision:** `GO-WITH-CONDITIONS` (resolve filters instrumentation timing, define seller-group fixture strategy, and lock URL toggle persistence).

### 2) Conformance & Fit (with evidence)
- **Conformance to refs**
  - `docs/commands/plan_feature.md` — **Pass**: plan supplies brief/context, file list, algorithm steps, and enumerated tests (`“## Brief Description”`, `“## Relevant Files & Functions”`, `“## Playwright Coverage”`; plan.md:3,15,59).
  - `docs/product_brief.md` — **Pass**: mirrors requirement for Active/Done split and Mark Done action (`“split the shopping list overview into Active/Done sections”`; plan.md:31 aligns with product_brief.md:136).
  - `AGENTS.md` — **Fail**: instrumentation mandate is unmet because filters scope only fires inside the toggle handler (`“Wrap the toggle handler…beginUiState…endUiState”`; plan.md:35) which conflicts with the doc’s directive to provide deterministic waits for new UI states (AGENTS.md:44).
- **Fit with codebase**
  - Leans on existing hooks/components (`useShoppingListsOverview`, `useListDeleteConfirm`, `ReadyToolbar`; plan.md:16-24) which match current files (e.g., `src/components/shopping-lists/overview-list.tsx`, `src/components/shopping-lists/list-delete-confirm.tsx`, `src/components/shopping-lists/ready/ready-toolbar.tsx`).

### 3) Open Questions & Ambiguities
- How will `showDoneSection` synchronize with the router on initial load/back nav? Plan stores local state and writes `showDone=true|false` (plan.md:33) but never states how URL state hydrates the toggle, putting `docs/contribute/ui/data_display.md`’s shareable-filter rule (line 8) at risk.
- What backend/TestData change enables the “filtered dataset” ready-view scenario? Step 4 expects to “request a filtered dataset” (plan.md:71) yet no API capability or factory contract is named, so we cannot confirm feasibility.
- Which toast copy should tests assert? Coverage step says to “Assert toast copy (‘Marked shopping list…’)” (plan.md:63) but implementation steps never define the toast producer or message, so expectations could drift.

### 4) Deterministic Playwright Coverage (new/changed behavior only)
1. **Archive list from overview**  
   - **Scenarios:** Given a Concept list, When the user clicks `Mark Done` and confirms, Then the card moves to Done and URL gains `showDone=true` (plan.md:61-63).  
   - **Instrumentation:** Needs `shoppingLists.overview` list-loading metadata plus `shoppingLists.overview.filters` UI-state. Major gap: plan.md:35 only emits filters scope inside the toggle, so the pre-toggle wait described in plan.md:62 has nothing to observe.  
   - **Backend hooks:** Uses existing `ShoppingListTestFactory` create/update helpers (plan.md:25-26) plus new mark-done helper.
2. **Mark list done from Ready view**  
   - **Scenarios:** Given a Ready list, When toolbar `Mark Done` is confirmed, Then status flips to done and overview counters refresh (plan.md:65-68).  
   - **Instrumentation:** Relies on `shoppingliststatus_markdone` form events (plan.md:41,67); ensure confirm hook exposes `isOpen` so `useFormInstrumentation` can emit open/submit/success.  
   - **Backend hooks:** Extend factory with status mutation helper (plan.md:26) and ensure tests reuse it after prepares.
3. **Seller group totals reflect visible lines** — **Major**  
   - **Scenarios:** Given filtered seller data, When the UI hides a subset, Then totals show visible counts and caption indicates diff (plan.md:71-72).  
   - **Instrumentation:** Requires `shoppingLists.list` metadata reporting `groupTotals`/`filteredDiff` (plan.md:51-52).  
   - **Backend hooks:** Undefined: “request a filtered dataset” (plan.md:71) lacks an API/fixture path and conflicts with the real-backend rule (AGENTS.md:45). Must specify whether backend gains filter flags or how factories seed divergence.

### 5) Adversarial Sweep (must find ≥3 credible issues or declare why none exist)
- **[A1] Major — Filters instrumentation never fires before the spec wait**  
  **Evidence:** “Wrap the toggle handler…beginUiState…endUiState” (plan.md:35); spec step waits “before toggling” (plan.md:62).  
  **Why it matters:** Playwright will hang because no `shoppingLists.overview.filters` event is emitted prior to the wait.  
  **Fix suggestion:** Emit the filters scope from a `useEffect` tied to `{activeCount, doneCount, showDoneSection}` so the collapsed state fires after query settles and again on toggle.  
  **Confidence:** High.
- **[A2] Major — Seller totals test assumes nonexistent backend filter**  
  **Evidence:** “Derive `visibleTotals`…” (plan.md:48) but verification demands “request a filtered dataset…exclude done lines” (plan.md:71); AGENTS.md:45 forbids synthetic mocks.  
  **Why it matters:** Without an API that returns divergent totals, scenario 3 cannot run deterministically.  
  **Fix suggestion:** Either document the backend change (endpoint or factory operation) needed to return filtered groups, or constrain the plan to data manipulations achievable today (e.g., update factories to create lines whose backend totals already differ).  
  **Confidence:** High.
- **[A3] Major — URL persistence flow incomplete**  
  **Evidence:** “Default…toggle (`showDoneSection`)…persist the state via…`showDone=true|false`” (plan.md:33) lacks any read-path; `docs/contribute/ui/data_display.md` requires filters mirror router params (line 8).  
  **Why it matters:** Bookmarked URLs with `showDone=true` would reopen collapsed because local state never hydrates from search, breaking shareable filters.  
  **Fix suggestion:** Define how `routes/shopping-lists/index.tsx` parses `showDone` and passes it into `ShoppingListsOverview`, plus how the component syncs state on param changes.  
  **Confidence:** Medium.

### 6) Derived-Value & Persistence Invariants
| Derived value | Source dataset (filtered/unfiltered) | Write/cleanup it triggers | Guard conditions | Invariant that must hold | Evidence |
| ------------- | ------------------------------------ | ------------------------- | ---------------- | ------------------------ | -------- |
| `activeLists` | `filteredLists` (search-filtered) | Drives Active section render & metadata | Only lists with `status !== 'done'` | `activeCount + doneCount === filteredLists.length` | plan.md:34 |
| `showDoneState` | Local toggle + router search | Updates `showDone=true|false` param | Toggle events & initial mount | URL param must mirror toggle so links stay sharable | plan.md:33 |
| `visibleTotals` | `group.lines` (current view) | Feeds header badges & instrumentation payload | Always recomputed after data refresh | `visibleTotals` should equal backend totals unless caption renders diff | plan.md:48 |

### 7) Risks & Mitigations (top 3)
- Filters instrumentation deadlock (`[A1]`): emit UI-state events on mount/toggle before specs rely on them.
- Seller totals scenario infeasible (`[A2]`): document backend/factory contract or narrow scope so tests stay real-backend compliant.
- URL toggle persistence unclear (`[A3]`): specify bidirectional sync between route search and component state.

### 8) Confidence
Medium — plan touches the right files, but unresolved instrumentation and backend-alignment questions leave notable uncertainty.
