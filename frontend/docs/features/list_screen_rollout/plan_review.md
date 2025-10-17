### 1) Summary & Decision
Plan covers the right surfaces and references the shared template, but it omits critical guardrails for the global padding context and filtered-count semantics, so it is not ready to hand off as-is.  
Decision: GO-WITH-CONDITIONS — resolve the high-severity gaps called out below (padding reset, filtered badge logic, page-level test ids).

### 2) Conformance & Fit (with evidence)
- **Conformance to refs**
  - `docs/commands/plan_feature.md`: **Pass** — plan lists touched files, sequenced steps, phases, and Playwright scope.  
    > docs/features/list_screen_rollout/plan.md:5-83 — Includes Relevant Files, Implementation Steps, Data & Algorithms, Playwright Coverage, Phases, Blocking Issues.
  - `docs/product_brief.md`: **Pass** — rollout keeps existing CRUD flows and search semantics; no scope conflicts surfaced.
  - `AGENTS.md`: **Pass** — plan reuses published abstractions (`ListScreenLayout`, `useListLoadingInstrumentation`) and points contributors back to canonical docs.  
    > docs/features/list_screen_rollout/plan.md:22-39 — Explicitly cites template and data-display docs, preserves instrumentation scopes.
- **Fit with codebase**
  - Plan assumes `ListScreenLayout`, `ListScreenCounts`, and `useAppShellContentPadding` from current codebase.  
    > docs/features/list_screen_rollout/plan.md:29-57 — Describes composing layout slots, reusing existing hooks, and updating route padding.
  - Playwright integration aligns with existing page objects and helpers.  
    > docs/features/list_screen_rollout/plan.md:55-75 — Calls out updating page objects and waiting on `useListLoadingInstrumentation` scopes.

### 3) Open Questions & Ambiguities
- Parts breadcrumbs are described as “if any—likely ‘Parts’.” Why it matters: adding a breadcrumb that does not exist today could change routing and copy; clarification dictates whether to introduce a new crumb or leave the slot empty.  
  > docs/features/list_screen_rollout/plan.md:50
- Instrumentation shape for `parts.list` is slated to add `visibleCount`, `totalCount`, `filteredCount`; we need confirmation on retaining existing `counts`/`queries` fields to avoid breaking consumers that parse them (e.g., diagnostics tooling). Answer determines whether to extend or replace the metadata contract.  
  > docs/features/list_screen_rollout/plan.md:53,68
- Should each route continue exposing page-level `data-testid` hooks (`*.page`, `*.page.header`) alongside the new `ListScreenLayout` test ids? Tests depend on them today; clarification guides how we wire `rootTestId`/`headerTestId`.  
  > docs/features/list_screen_rollout/plan.md:29-39; tests/support/page-objects/boxes-page.ts:16-22

### 4) Deterministic Playwright Coverage (new/changed behavior only)
- **Boxes sticky header + counts**  
  - Scenarios: Given seeded boxes exist, When the list overflows and we scroll, Then the header stays visible and summary text updates after search.  
  - Instrumentation: `waitForListLoading(page, 'boxes.list', …)` plus metadata surfaced by updated `useListLoadingInstrumentation`.  
  - Backend hooks: reuse `testData.boxes` factories; no new routes needed.
- **Sellers sticky header + counts**  
  - Scenarios: Given seeded sellers, When filtering and invoking dialogs, Then header/actions remain accessible and summary reflects filter.  
  - Instrumentation: `sellers.list` scope via `useListLoadingInstrumentation`; tests capture events via `testEvents`.  
  - Backend hooks: existing seller factories.
- **Types sticky header + modal actions**  
  - Scenarios: Given seeded types, When scrolling and toggling modals, Then header stays pinned and counts adjust deterministically.  
  - Instrumentation: `types.list` scope held via instrumentation helper.  
  - Backend hooks: existing type factories.
- **Parts sticky header + dual actions**  
  - Scenarios: Given seeded parts, When scrolling and triggering Add Part / Add with AI, Then header remains visible and summary + instrumentation reflect search filters.  
  - Instrumentation: combined `parts.list` scope (parts + types queries) with new count metadata.  
  - Backend hooks: existing part + type factories; no new mocks.

### 5) Adversarial Sweep (must find ≥3 issues)
- **[A] Blocker — Padding reset omitted for new routes**  
  > docs/features/list_screen_rollout/plan.md:29-45,49 — Sets `useAppShellContentPadding` to `'p-0'` for boxes, sellers, types, parts but never mentions restoring the default.  
  > src/routes/shopping-lists/index.tsx:14-28 — Current template example sets `'p-0'` on mount *and* restores `DEFAULT_APP_SHELL_CONTENT_PADDING` on unmount.  
  **Why it matters:** Without the cleanup, navigating away leaves the global app shell stuck at `'p-0'`, breaking layout spacing on every other page.  
  **Fix suggestion:** Explicitly require each route effect to call `setContentPaddingClass('p-0')` on mount and reset to `DEFAULT_APP_SHELL_CONTENT_PADDING` in the cleanup handler.  
  **Confidence:** High.
- **[B] Major — Filter badge shows even when results aren’t reduced**  
  > docs/features/list_screen_rollout/plan.md:65-68 — Sets `filtered = searchTerm ? filteredX.length : undefined` for all lists.  
  > src/components/shopping-lists/overview-list.tsx:96-132 — The existing template only surfaces `filteredCount` when the filtered list is smaller than the total.  
  **Why it matters:** With the new `ListScreenCounts`, using the raw filtered length renders a “N filtered” badge even when every record matches, contradicting the template behavior and confusing users/tests.  
  **Fix suggestion:** Update the plan to compute `filtered` only when `filteredCount < total` (mirroring the shopping list logic) so the badge appears solely when the dataset is trimmed.  
  **Confidence:** High.
- **[C] Major — Page-level test ids not preserved explicitly**  
  > docs/features/list_screen_rollout/plan.md:29-57 — Discusses re-exporting `contentTestId` but never states that `rootTestId`/`headerTestId` must map to `boxes.page`, `boxes.page.header`, etc.  
  > tests/support/page-objects/boxes-page.ts:16-22 — Playwright selectors rely on those page-level ids today.  
  **Why it matters:** Dropping or renaming the page/header ids will break existing page objects and specs that call `page.getByTestId('*.page'|'*.page.header')`.  
  **Fix suggestion:** Direct the implementation to pass the current `*.page`/`*.page.header` ids into `ListScreenLayout` props (and keep them for all load/error branches) so tests stay stable.  
  **Confidence:** Medium (gap is omission in the plan, likely overlooked during implementation).

### 6) Derived-Value & Persistence Invariants
| Derived value | Source dataset (filtered/unfiltered) | Write/cleanup it triggers | Guard conditions | Invariant that must hold | Evidence (file:lines) |
| ------------- | ------------------------------------ | ------------------------- | ---------------- | ------------------------ | --------------------- |
| `contentPaddingClass` | Global app-shell context (unfiltered) | Sets shell padding across routes | Must reset to `DEFAULT_APP_SHELL_CONTENT_PADDING` on unmount | Other routes retain default padding after leaving list screens | docs/features/list_screen_rollout/plan.md:29-45,49 |
| `filteredBoxes` | `boxes` query result (filtered) | Feeds summary copy and instrumentation metadata | Only emit filtered badge when dataset is trimmed | Summary + metadata stay consistent and avoid redundant “filtered” badges | docs/features/list_screen_rollout/plan.md:65 |
| `visibleCount`/`totalCount` for parts | Combined `parts` + `types` queries (filtered/unfiltered) | Populates instrumentation metadata consumed by tests | Should accompany existing `counts`/`queries` metadata | Instrumentation consumers can rely on both legacy and new fields | docs/features/list_screen_rollout/plan.md:53,68 |

### 7) Risks & Mitigations (top 3)
- Global padding leak if routes set `'p-0'` without cleanup (Issue A). Mitigation: document the cleanup hook per route before implementation.
- Filter badge regression causing false filtered states (Issue B). Mitigation: adopt the shopping-list guard (`filtered < total`) in the plan.
- Test fragility from missing `*.page`/`*.page.header` ids (Issue C). Mitigation: mandate wiring `rootTestId`/`headerTestId` with existing ids and verify Playwright selectors post-refactor.

### 8) Confidence
Medium — Reviewed all targeted components and test utilities, but validating every instrumentation consumer would require deeper event-log analysis once the shape change is clarified.
