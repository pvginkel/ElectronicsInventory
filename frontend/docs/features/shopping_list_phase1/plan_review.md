### 1) Summary & Decision
The plan captures the Phase 1 scope, but it drops required overview summary instrumentation, leaves Completed lists without a delete path, and assumes delete flows emit instrumentation they don't currently surface.  
**Decision:** GO-WITH-CONDITIONS — resolve the blocking gaps before implementation.

### 2) Conformance & Fit (with evidence)
**Conformance to refs**
- `docs/commands/plan_feature.md`: **pass** — the plan enumerates Playwright coverage per requirement (“Call out the Playwright coverage…” `docs/commands/plan_feature.md:12-13`; scenarios listed under `docs/features/shopping_list_phase1/plan.md:55-60`).
- `docs/product_brief.md`: **pass** — adjustments keep the shopping list workflow intact (“A simple list of parts you want to acquire.” `docs/product_brief.md:64-68`; “Confirm instrumentation … still render correctly” `docs/features/shopping_list_phase1/plan.md:38-41`).
- `AGENTS.md`: **pass** — instrumentation remains front and centre (“Ship instrumentation changes and matching Playwright coverage in the same slice” `AGENTS.md:44-46`; “Update instrumentation metadata … emit beginUiState/endUiState” `docs/features/shopping_list_phase1/plan.md:28`).

**Fit with codebase**
- The plan targets the real modules already driving the experience (`docs/features/shopping_list_phase1/plan.md:24-33`) and reuses existing hooks like `useListDeleteConfirm`.  
- Risk: replacing the summary bar with tabs (`docs/features/shopping_list_phase1/plan.md:25-30`) conflicts with the documented requirement to keep a `*.list.summary` element (`docs/contribute/ui/data_display.md:9`).  
- Risk: delete affordances move into the detail route only for Concept/Ready (`docs/features/shopping_list_phase1/plan.md:34-35`), yet the overview currently supplies Delete for every status (`src/components/shopping-lists/overview-card.tsx:173-184`).

### 3) Open Questions & Ambiguities
- Should Completed-state detail views also expose the new delete affordance so users can remove archived lists without reopening the overview? (Impacts flows after removing the card-level Delete button.)
- When renaming instrumentation metadata to `{ completedCount, activeTab }`, do downstream consumers (tests, analytics) still need the legacy `doneCount` key?

### 4) Deterministic Playwright Coverage (new/changed behavior only)
- **Overview tab persistence**  
  - Scenarios: ✅ (`docs/features/shopping_list_phase1/plan.md:55-56`).  
  - Instrumentation: ✅ — plan calls for `shoppingLists.overview.filters` with `activeTab`.  
  - Backend hooks: ✅ — relies on existing seeded data helpers.
- **Clickable cards & navigation**  
  - Scenarios: ✅ (`docs/features/shopping_list_phase1/plan.md:57`).  
  - Instrumentation: ✅ — references `shoppingLists.list`.  
  - Backend hooks: ✅ — existing list seeds.
- **Delete from detail** — **Major gap**  
  - Scenarios: ✅ (`docs/features/shopping_list_phase1/plan.md:58`).  
  - Instrumentation: ⚠️ plan expects “confirm dialog instrumentation (`ShoppingListStatus:markDone`…)” which does not exist for delete (`src/components/shopping-lists/list-delete-confirm.tsx:20-61`).  
  - Backend hooks: ✅.
- **Part detail chip styling**  
  - Scenarios: ✅ (`docs/features/shopping_list_phase1/plan.md:59`).  
  - Instrumentation: ✅ — uses existing membership hooks.  
  - Backend hooks: ✅.
- **Storage card navigation**  
  - Scenarios: ✅ (`docs/features/shopping_list_phase1/plan.md:60`).  
  - Instrumentation: ✅ — leans on `boxes.list`.  
  - Backend hooks: ✅.

### 5) Adversarial Sweep
- **[A1] Major — Overview loses required summary contract**  
  **Evidence:** “Replace the ‘Active lists…’ banner … with a tab row … drop the subtitle paragraph” (`docs/features/shopping_list_phase1/plan.md:25-30`) conflicts with “Always provide a summary element (`data-testid="*.list.summary"`)” (`docs/contribute/ui/data_display.md:9`).  
  **Why it matters:** Removing the summary breaks the documented UI/testing contract and instrumentation consumers that rely on the summary element.  
  **Fix suggestion:** Keep a `shopping-lists.overview.summary` row (even if visually minimal) and update its copy to mirror the tab counts.  
  **Confidence:** High.

- **[A2] Major — Completed lists lose delete path**  
  **Evidence:** The plan removes the card-level Delete button (`docs/features/shopping_list_phase1/plan.md:30`) and only reintroduces delete in Concept/Ready detail views (`docs/features/shopping_list_phase1/plan.md:34-35`), whereas the current card supplies delete for every status (`src/components/shopping-lists/overview-card.tsx:173-184`).  
  **Why it matters:** Completed lists would become undeletable once cards lose their Delete button, blocking cleanup of archived lists.  
  **Fix suggestion:** Extend the new detail affordance to Completed state (or retain a delete control in the Completed tab).  
  **Confidence:** High.

- **[A3] Major — Planned delete instrumentation contradicts reality**  
  **Evidence:** Coverage step expects “confirm dialog instrumentation (`ShoppingListStatus:markDone`…)” for delete (`docs/features/shopping_list_phase1/plan.md:58`), yet `useListDeleteConfirm` has no instrumentation hooks (`src/components/shopping-lists/list-delete-confirm.tsx:20-61`).  
  **Why it matters:** Playwright cannot wait on nonexistent events, so the scenario would fall back to brittle timing.  
  **Fix suggestion:** Add form instrumentation to `useListDeleteConfirm` (e.g., `ShoppingList:delete`) and update the coverage step to reference it.  
  **Confidence:** High.

### 6) Derived-Value & Persistence Invariants
| Derived value | Source dataset (filtered/unfiltered) | Write/cleanup it triggers | Guard conditions | Invariant that must hold | Evidence (file:lines) |
| ------------- | ------------------------------------ | ------------------------- | ---------------- | ------------------------ | --------------------- |
| `filteredLists` | `lists` from `useShoppingListsOverview` (unfiltered) filtered by search | Drives tab collections + instrumentation payloads | Search term normalised | `filteredLists.length <= lists.length` | `src/components/shopping-lists/overview-list.tsx:47-66` |
| `activeTab` (persisted) | Local storage key `shoppingLists.overview.tab` | `localStorage.setItem` writes per tab switch | Only access `window.localStorage` in browser | Value ∈ {`'active'`, `'completed'`} | `docs/features/shopping_list_phase1/plan.md:26` |
| `activeCount`, `completedCount` | Aggregated from `filteredLists` (filtered) | Emitted via `useListLoadingInstrumentation` and `endUiState` | Wait for query load + tab selection | Counts match rendered card totals | `docs/features/shopping_list_phase1/plan.md:28`, `tests/e2e/shopping-lists/shopping-lists.spec.ts:84-187` |

### 7) Risks & Mitigations (top 3)
- Losing the mandated overview summary element breaks UI/test contracts — retain `shopping-lists.overview.summary` while introducing tabs (`docs/features/shopping_list_phase1/plan.md:25-30`, `docs/contribute/ui/data_display.md:9`).
- Completed lists become undeletable without a detail affordance — extend the new delete control to Completed state (`docs/features/shopping_list_phase1/plan.md:30,34-35`, `src/components/shopping-lists/overview-card.tsx:173-184`).
- Delete scenario lacks deterministic instrumentation — instrument `useListDeleteConfirm` and align coverage expectations (`docs/features/shopping_list_phase1/plan.md:58`, `src/components/shopping-lists/list-delete-confirm.tsx:20-61`).

### 8) Confidence
Medium — review covers the referenced files and docs, but implementation specifics around the new tab layout and instrumentation remain to be detailed.
