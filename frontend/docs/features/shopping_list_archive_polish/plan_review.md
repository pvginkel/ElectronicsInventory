## 1) Summary & Decision
The plan covers the right surface area (overview partitioning, hide-done filtering, mark-done flows, Playwright work), but the instrumentation strategy and filtered-metric handling are under-specified enough to threaten determinism and UI correctness. I’d ship once those risks are resolved.  
**Decision:** GO-WITH-CONDITIONS — tighten instrumentation scope and filtered totals before implementation.

## 2) Conformance & Fit (with evidence)
- **docs/commands/plan_feature.md — PASS**  
  > docs/features/shopping_list_archive_polish/plan.md:24 – “### Phase 5 — Lists Overview v2 (archive & counters)” (step-by-step implementation).  
  > docs/features/shopping_list_archive_polish/plan.md:74 – “## Playwright Coverage” (explicit scenarios).
- **docs/product_brief.md — PASS**  
  > docs/features/shopping_list_archive_polish/plan.md:4 – “preserving the ‘Done lines are excluded by default in Active views’ rule from `docs/epics/shopping_list_brief.md`.”
- **AGENTS.md — PASS**  
  > docs/features/shopping_list_archive_polish/plan.md:3 – “Keep this file light and point contributors to the canonical documentation.” (plan calls out canonical docs by path.)

- **Fit with codebase**  
  > docs/features/shopping_list_archive_polish/plan.md:6 – “`src/components/shopping-lists/overview-list.tsx` – partition overview data …” (leans on existing overview component).  
  > docs/features/shopping_list_archive_polish/plan.md:14 – “`src/routes/shopping-lists/$listId.tsx` – add ‘Hide Done’ state …” (matches current route structure in `src/routes/shopping-lists/$listId.tsx:1-200`).  
  > docs/features/shopping_list_archive_polish/plan.md:43 – “Refactor `ready-toolbar.tsx` …” (extends `src/components/shopping-lists/ready/ready-toolbar.tsx:1-36`).

## 3) Open Questions & Ambiguities
- How should seller-group header totals behave when hide-done is on? If we filter rows but keep `group.totals.*` unchanged (`src/components/shopping-lists/ready/seller-group-card.tsx:149-159`), counts no longer reflect the visible data. Clarify whether totals should recalc or the header should explain the difference.
- What is the intended lifecycle for the new `ui_state` scopes? Plan calls for both `useUiStateInstrumentation` and manual `beginUiState`/`endUiState` (docs/features/shopping_list_archive_polish/plan.md:29,71), but the toggles have no loading phase today. Define whether we emit custom events manually instead of the hook.
- When auto-unhiding done lines for duplicate highlights (docs/features/shopping_list_archive_polish/plan.md:40), should the router search (the persisted filter) update? Auto-flipping `hideDone` risks confusing history/state unless we document a short-lived override mechanism.

## 4) Deterministic Playwright Coverage (new/changed behavior only)
- **Overview “Show Done” toggle**  
  - **Scenarios:** Given active+done lists, When toggle closed → open, Then done section renders and instrumentation reports collapsed→expanded.  
  - **Instrumentation:** Needs stable `data-testid` for the toggle and deterministic `ui_state` scope (`shoppingLists.overview.filters`). Plan doesn’t spell out how `begin/end` will fire; mark **Major** until clarified.  
  - **Backend hooks:** Existing lists factory + new `markDone` helper (docs/features/shopping_list_archive_polish/plan.md:96-97).
- **Overview mark-done CTA**  
  - **Scenarios:** Given concept list, When confirm mark done, Then card moves to Done section and counts update.  
  - **Instrumentation:** `shoppingliststatus_markdone` via `useFormInstrumentation` (docs/features/shopping_list_archive_polish/plan.md:35,72).  
  - **Backend hooks:** `testData.shoppingLists.markDone(listId)` (docs/features/shopping_list_archive_polish/plan.md:96-97).
- **Concept hide-done toggle**  
  - **Scenarios:** Given a list with done+active lines, When toggle off/on, Then rows/duplicate banner visibility toggles accordingly.  
  - **Instrumentation:** `shoppingLists.detail.hideDone` scope (docs/features/shopping_list_archive_polish/plan.md:41,80-82). Need explicit event sequencing; currently ambiguous (**Major**).  
  - **Backend hooks:** `createDoneLine` helper (docs/features/shopping_list_archive_polish/plan.md:97).
- **Ready hide-done toggle**  
  - **Scenarios:** Given seller groups with done lines, When toggle on, Then done rows/groups collapse and counts remain accurate.  
  - **Instrumentation:** Expect `shoppingLists.detail.hideDone` plus existing `shoppingLists.list` metadata (docs/features/shopping_list_archive_polish/plan.md:41,85-86). Clarify totals recalculation (**Major** because mismatch breaks assertions).  
  - **Backend hooks:** Same `createDoneLine` plus status transitions.
- **Ready toolbar mark-done CTA**  
  - **Scenarios:** Given ready list, When mark done, Then detail view reflects done status and overview counters update on return.  
  - **Instrumentation:** `shoppingliststatus_markdone` + `shoppingLists.detail.hideDone` (docs/features/shopping_list_archive_polish/plan.md:45,88-91). Ensure hide-done metadata flips to false automatically.  
  - **Backend hooks:** Mutation helper plus existing factories.
- **Polish assertions (chips/tooltips)**  
  - **Scenarios:** Given lines/groups, When rendering, Then status/seller chips expose deterministic `data-testid`s (docs/features/shopping_list_archive_polish/plan.md:93-95).  
  - **Instrumentation:** None beyond existing selectors.  
  - **Backend hooks:** standard line creation helpers.

## 5) Adversarial Sweep (must find ≥3 issues)
- **[A1] Major — Ambiguous `ui_state` instrumentation plan**  
  **Evidence:** docs/features/shopping_list_archive_polish/plan.md:29 – “drive `useUiStateInstrumentation('shoppingLists.overview.filters', { ... })` …”; docs/features/shopping_list_archive_polish/plan.md:71 – “trigger `beginUiState` just before updating the toggle state and `endUiState` immediately after …”.  
  **Why it matters:** `useUiStateInstrumentation` already calls `begin/end` when `isLoading` toggles (`docs/contribute/architecture/test_instrumentation.md:30-77`). Mixing manual `begin/end` with the hook will either emit duplicate events or never emit if no loading flag flips—`waitForUiState` would hang.  
  **Fix suggestion:** Decide on one pattern: either wrap toggles in a dedicated helper that manually emits `ui_state`, or extend the hook with a synthetic `isLoading` flag; document the exact sequence in the plan.  
  **Confidence:** High.

- **[A2] Major — Seller group totals ignore hide-done filtering**  
  **Evidence:** docs/features/shopping_list_archive_polish/plan.md:40 – “`const visibleGroups = groups.map({...line: filter...})` …”; src/components/shopping-lists/ready/seller-group-card.tsx:149-159 – header renders `group.totals.*`.  
  **Why it matters:** When a group only has hidden “done” rows, the header will still report their quantities even though the table is empty, violating the “summary reflects filtered vs total” guidance (`docs/contribute/ui/data_display.md:7-9`) and confusing users/tests.  
  **Fix suggestion:** Add plan steps to recalculate/display filtered totals (or surface both filtered/total) whenever hide-done is active, and spell out the instrumentation metadata that matches.  
  **Confidence:** High.

- **[A3] Major — Auto-forcing `hideDone=false` conflicts with persisted filters**  
  **Evidence:** docs/features/shopping_list_archive_polish/plan.md:27 (persist toggle via search params), docs/features/shopping_list_archive_polish/plan.md:40 – “temporarily force `hideDone` to `false` so ‘View existing line’ still works”.  
  **Why it matters:** Router search represents user-selected filters (`docs/contribute/ui/data_display.md:8`). Flipping it automatically to reveal duplicates alters deep-linkable state and instrumentation metadata, creating surprise history entries and potentially breaking deterministic tests.  
  **Fix suggestion:** Define an explicit override strategy: either surface a “Show done for duplicates” affordance without mutating URL, or persist the user preference separately and emit a dedicated instrumentation event. Document which metadata changes.  
  **Confidence:** Medium.

## 6) Derived-Value & Persistence Invariants
| Derived value | Source dataset (filtered/unfiltered) | Write/cleanup it triggers | Guard conditions | Invariant that must hold | Evidence (file:lines) |
| ------------- | ------------------------------------ | ------------------------- | ---------------- | ------------------------ | --------------------- |
| `activeCount`, `doneCount` | `filteredLists` (filtered) | Overview summary text + instrumentation metadata | Search term + `showDoneSection` toggle | Visible card counts match instrumentation totals | docs/features/shopping_list_archive_polish/plan.md:26-29 |
| `showDoneState` persisted in search | Toggle state (filtered) | Router search param + `ui_state` metadata | User activates overview disclosure | URL/search reflects only explicit user choices (no implicit flips) | docs/features/shopping_list_archive_polish/plan.md:27,29 |
| `visibleGroups` / `visibleGroupCount` | `groups` (filtered copy) | Ready view rendering + instrumentation payload | `hideDone` toggle | Filtered view must also update group summaries to avoid stale totals | docs/features/shopping_list_archive_polish/plan.md:37-41 |

## 7) Risks & Mitigations (top 3)
- `ui_state` ambiguity will stall Playwright waits; lock down whether toggles emit manual or hook-driven events before coding (see [A1]).  
- Seller-group totals mismatch filtered rows; plan should specify recalculation or UX messaging so tests/users see consistent numbers (see [A2]).  
- Duplicate highlight override could mutate deep-link state unexpectedly; clarify URL vs. temporary visibility strategy and instrumentation impact (see [A3]).

## 8) Confidence
Medium — current codebase context is clear, but the plan leaves the critical instrumentation and filtered-summary details unresolved, so execution risk remains until clarified.
