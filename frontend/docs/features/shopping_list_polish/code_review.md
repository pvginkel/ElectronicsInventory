### 1) Summary & Decision
Implementation aligns with the polish goals: deterministic sorting now relies on a shared `Intl.Collator`, seller/ status chips gained consistent badge styling and tooltips, and list instrumentation exposes the metadata the tests assert against. Playwright coverage exercises the new affordances and the Mark Ready instrumentation. **Decision:** `GO` — no blocking issues observed.

### 2) Conformance to Plan (with evidence)
- `docs/features/shopping_list_polish/plan.md:27-34` calls for collator-based sorting and badge/tooling polish; the collator and seller-group fallbacks land in `src/hooks/use-shopping-lists.ts:451-540` (`const listCollator = new Intl.Collator('en', { sensitivity: 'base', numeric: true }); … return [...groups].sort(compareGroups)`), while the badge/tooltips update appears in `src/components/shopping-lists/concept-line-row.tsx:16-123` and `src/components/shopping-lists/ready/ready-line-row.tsx:35-145`.
- Column width normalisation per plan §2 arrives via `src/components/shopping-lists/table-layout.ts:1-10` and the shared usage inside `concept-table.tsx`/`seller-group-card.tsx`.
- Instrumentation tasks in plan §4 surface through `src/hooks/use-shopping-lists.ts:694-706` (`return { status, view, … sortKey, groupTotals, filteredDiff }`) and the Mark Ready form wiring in `src/components/shopping-lists/mark-ready-footer.tsx:12-64`.
- Playwright coverage bullets in plan §45-55 are mirrored by `tests/e2e/shopping-lists/shopping-lists.spec.ts:327-390` (sorting & chips), `:392-420` (Mark Ready instrumentation), and overview toggle assertions earlier in the file.

### 3) Correctness — Findings (ranked)
None.

### 4) Over-Engineering & Refactoring Opportunities
Nothing stood out—abstractions stay focused and reuse existing hooks/components as directed.

### 5) Style & Consistency
- Badge variants now match status semantics across concept/ready/overview views (`src/components/shopping-lists/concept-header.tsx:121-155`, `…/overview-card.tsx:102-144`), keeping the UI cohesive.
- Tooltip copy remains short and consistent (`title="Lines waiting to be ordered"` etc.), matching contributor guidance.

### 6) Tests & Deterministic Coverage (new/changed behavior only)
- **Sorting & chips:** `tests/e2e/shopping-lists/shopping-lists.spec.ts:327-390` seeds mixed-case data, waits on `shoppingLists.list` ready events, and confirms DOM + metadata (`metadata.sortKey`, `groupTotals`).
- **Mark Ready instrumentation:** `tests/e2e/…:392-420` waits for `ShoppingListStatus:markReady` submit/success events and validates emitted metadata + toast.
- **Overview counters/toggle & mark-done dialogs:** earlier scenarios reuse the shared helpers and check metadata (`waitForOverviewFiltersReady`) plus destructive dialog flows.
- No gaps observed; flows covered match the plan’s scenarios.

### 7) Adversarial Sweep
1. **Duplicate seller names in ready groups.** Checked `sortSellerGroupsForReadyView` fallback to `groupKey` (`src/hooks/use-shopping-lists.ts:524-529`). Ensures deterministic order even when `sellerName` collates equal; no failure path.
2. **Case-insensitive concept sorting collisions.** With `compareByDescription` falling back to `id` (`src/hooks/use-shopping-lists.ts:454-460`), equal descriptions still stay stable; no glitch found.
3. **Mark Ready instrumentation when the button is disabled.** Guard `if (!isConcept) return;` plus button `disabled` state (`mark-ready-footer.tsx:27-63`) prevents duplicate events; instrumentation only fires on valid submissions. All attempts held up.

### 8) Invariants Checklist
| Invariant | Where enforced | How it could fail | Current protection | Evidence (file:lines) |
|---|---|---|---|---|
| Concept/ready sorting stays deterministic across browsers | Shared `Intl.Collator` + ID tie-breaker | Falling back to locale-dependent `localeCompare` | `compareByDescription`/`compareByMpn` use `listCollator` then `id` | `src/hooks/use-shopping-lists.ts:452-468` |
| Ready seller groups preserve deterministic ordering with duplicate names | Groups sorted via collator + `groupKey` fallback | Equal `sellerName` without fallback could shuffle groups | `sortSellerGroupsForReadyView` final `return listCollator.compare(a.groupKey, b.groupKey);` | `src/hooks/use-shopping-lists.ts:507-539` |
| `shoppingLists.list` instrumentation exposes view metadata for tests | Metadata omits `view`/`sortKey`, breaking waits | `getReadyMetadata` emits `status`, `view`, `sortKey`, `groupTotals`, `filteredDiff` | `src/hooks/use-shopping-lists.ts:694-706` |

### 9) Questions / Needs-Info
None.

### 10) Risks & Mitigations (top 3)
- R1 — Collator locale fixed to `'en'`; if future locales need different ordering, consider moving to a configuration surface or documenting the intent (`src/hooks/use-shopping-lists.ts:452`).
- R2 — Tooltip-only explanations rely on `title` attributes; if accessibility requirements tighten, plan for richer tooltip components (`concept-header.tsx:144-155`, `ready-line-row.tsx:108-123`).
- R3 — Ready group metadata mirrors backend totals; if API shape changes, `sellerGroupInstrumentation` will need updates to keep Playwright checks aligned (`src/hooks/use-shopping-lists.ts:564-706`).

### 11) Confidence
High — read through the touched code paths and the companion Playwright specs; flows are deterministic and instrumentation remains verifiable.
