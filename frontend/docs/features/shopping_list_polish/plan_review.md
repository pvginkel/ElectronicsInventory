**Summary & Decision**
Plan now aligns with the Phase 7 polish brief, reuses existing instrumentation, and spells out deterministic coverage tied to backend factories. Decision: GO — implementation can proceed without further plan edits.

**Conformance & Fit (with evidence)**
- **docs/commands/plan_feature.md** Pass — Requirement to cite UI guidance (docs/commands/plan_feature.md:13) is met via the new `docs/contribute/ui/data_display.md` reference (docs/features/shopping_list_polish/plan.md:6-14) and Step 2’s explicit call-out (docs/features/shopping_list_polish/plan.md:31-34).
- **docs/product_brief.md** Pass — Emphasis on shopping list lifecycle and receiving stock (docs/product_brief.md:17,64-68) is reflected in Steps 3-4 keeping mark-done flows instrumented (docs/features/shopping_list_polish/plan.md:36-42).
- **AGENTS.md** Pass — Guidance to treat instrumentation as UI contract (AGENTS.md:36-45) is satisfied by the instrumentation verification step (docs/features/shopping_list_polish/plan.md:40-42).
- **docs/contribute/index.md** Pass — “Instrument first… extend Playwright specs in the same change” (docs/contribute/index.md:20-23) surfaces through the paired instrumentation audit and coverage section (docs/features/shopping_list_polish/plan.md:40-55).
- **docs/contribute/ui/data_display.md** Pass — The doc’s badge/tooltip conventions and instrumentation reminders (docs/contribute/ui/data_display.md:6-25) are referenced in Step 2 to keep polish work on-pattern (docs/features/shopping_list_polish/plan.md:31-34).
- **docs/contribute/architecture/application_overview.md** Pass — Reuse of existing helpers under `src/lib/test/*` (docs/contribute/architecture/application_overview.md:42-64) is reinforced by Step 4 auditing `useListLoadingInstrumentation` rather than inventing alternatives (docs/features/shopping_list_polish/plan.md:40-42).
- **docs/contribute/testing/index.md** Pass — Mandatory instrumentation/test coupling (docs/contribute/testing/index.md:5-15) is honored through the coverage scenarios that lean on list + form events (docs/features/shopping_list_polish/plan.md:45-55).
- **docs/contribute/testing/playwright_developer_guide.md** Pass — “Confirm the UI flow emits required instrumentation before writing a spec” (docs/contribute/testing/playwright_developer_guide.md:10-11) maps to Step 4’s audit and the coverage waits (docs/features/shopping_list_polish/plan.md:40-55).
- **docs/contribute/testing/factories_and_fixtures.md** Pass — Plan relies on existing factories (`testData.shoppingLists.createWithLines`, `markReady`, `markDone`) instead of re-creating helpers (docs/contribute/testing/factories_and_fixtures.md:27-29; tests/api/index.ts:84-95; docs/features/shopping_list_polish/plan.md:45-56).
- **docs/contribute/testing/ci_and_execution.md** Pass — Deterministic, headless-friendly execution (docs/contribute/testing/ci_and_execution.md:24-33) is preserved by basing waits on instrumentation rather than DOM polls (docs/features/shopping_list_polish/plan.md:36-55).
- **Fit with codebase** — Sorting changes extend existing comparators in `useSortedShoppingListLines` (src/hooks/use-shopping-lists.ts:452-478 referenced via docs/features/shopping_list_polish/plan.md:27-29). Instrumentation audit targets data already emitted through `getReadyMetadata` (src/hooks/use-shopping-lists.ts:667-678) and `shoppingLists.overview` events (src/components/shopping-lists/overview-list.tsx:66-107), ensuring compatibility.

**Open Questions & Ambiguities**
- None — prior ambiguities on tooltips, instrumentation, and memoization were resolved by deferring to existing helpers.

**Deterministic Playwright Coverage (new/changed behavior only)**
- **Deterministic sorting**
  - **Scenarios:** Seed concept and ready lists with case-colliding descriptions/seller names; verify ordering after polishing.
  - **Instrumentation:** Wait on `shoppingLists.list` ready events and confirm `metadata.sortKey`/`metadata.groupTotals` (docs/features/shopping_list_polish/plan.md:45-47; src/hooks/use-shopping-lists.ts:667-678).
  - **Backend hooks:** Use `testData.shoppingLists.createWithLines` plus `markReady` (tests/api/index.ts:84-93).
- **Status/seller chip polish**
  - **Scenarios:** Assert new badges/tooltips appear with deterministic `data-testid`s across concept/ready views (docs/features/shopping_list_polish/plan.md:48-50).
  - **Instrumentation:** Rely on existing `shoppingLists.list` ready events to gate assertions (src/routes/shopping-lists/$listId.tsx:140-150).
  - **Backend hooks:** Same factories as above for consistent data (tests/api/index.ts:84-93).
- **Overview counters & toggle**
  - **Scenarios:** Toggle “Show Done lists” and confirm counts/captions update (docs/features/shopping_list_polish/plan.md:51-53).
  - **Instrumentation:** `shoppingLists.overview` metadata + `shoppingLists.overview.filters` UI-state events (src/components/shopping-lists/overview-list.tsx:66-107).
  - **Backend hooks:** Create active/done lists with factories (tests/api/index.ts:84-95).
- **Mark Done & Delete confirmations**
  - **Scenarios:** Cover both destructive dialogs, waiting on `shoppingliststatus_markdone` submit/success and checking toast copy (docs/features/shopping_list_polish/plan.md:54-55).
  - **Instrumentation:** Existing `useFormInstrumentation` + toast events (src/components/shopping-lists/mark-ready-footer.tsx:15-35).
  - **Backend hooks:** `testData.shoppingLists.markDone` to reflect backend state (tests/api/index.ts:84-95).

**Adversarial Sweep (must find ≥3 credible issues or declare why none exist)**
No credible issues remain. Checked invariants: (1) Sorting plan still uses existing selectors without mutating shared state (docs/features/shopping_list_polish/plan.md:27-29; src/hooks/use-shopping-lists.ts:452-478). (2) Instrumentation auditing keeps payload schemas unchanged, matching current emitters (docs/features/shopping_list_polish/plan.md:40-42; src/hooks/use-shopping-lists.ts:667-678; src/components/shopping-lists/overview-list.tsx:66-107). (3) Playwright scenarios all tie to sanctioned factories and test-event waits (docs/features/shopping_list_polish/plan.md:45-55; tests/api/index.ts:84-95). Together these prove the plan maintains contract fidelity without introducing regressions.

**Derived-Value & Persistence Invariants**
| Derived value | Source dataset (filtered/unfiltered) | Write/cleanup it triggers | Guard conditions | Invariant that must hold | Evidence |
| ------------- | ------------------------------------ | ------------------------- | ---------------- | ------------------------ | --------------------- |
| `groupTotals` | Seller groups (unfiltered) | Reported via `shoppingLists.list` ready metadata | Emitted through `useListLoadingInstrumentation` in test mode | Totals must match backend payloads to keep Playwright waits deterministic | docs/features/shopping_list_polish/plan.md:40-47; src/hooks/use-shopping-lists.ts:667-678; src/lib/test/query-instrumentation.ts:146-178 |
| `filteredDiff` | Difference between backend totals and visible lines (filtered) | Same metadata payload | Test mode only; no persistence writes | Calculated diff remains observational (no writes) to avoid corrupting backend state | docs/features/shopping_list_polish/plan.md:40-47; src/hooks/use-shopping-lists.ts:663-678; src/lib/test/query-instrumentation.ts:146-178 |
| `filtersMetadata` | Overview filtered lists (filtered) | `shoppingLists.overview` ready/aborted metadata and `ui_state` events | Guarded by existing `beginUiState/endUiState` | Counts must match rendered sections prior to Playwright assertions | docs/features/shopping_list_polish/plan.md:51-53; src/components/shopping-lists/overview-list.tsx:66-107; src/lib/test/ui-state.ts:9-36 |

**Risks & Mitigations (top 3)**
- Sorting change must preserve stable grouping; cover `Intl.Collator` ordering with the new spec (docs/features/shopping_list_polish/plan.md:27-47).
- Badge/tooltip polish could break selectors; page-object helpers and deterministic `data-testid`s mitigate the risk (docs/features/shopping_list_polish/plan.md:31-50).
- Destructive dialog polish depends on existing instrumentation; auditing and test waits ensure toast/form events remain observable (docs/features/shopping_list_polish/plan.md:36-55; src/components/shopping-lists/mark-ready-footer.tsx:15-35).

**Confidence**
High — Plan addresses prior gaps, leans on proven instrumentation, and the coverage section squarely targets regression risks.
