### 1) Summary & Decision
Implementation cleanly partitions the overview, reuses shared mark-done confirmation flows, and threads deterministic instrumentation through both UI and tests. Playwright specs cover the ready/overview archive paths, so I’m comfortable with the rollout. Decision: GO — the change-set meets the plan without correctness or coverage gaps.

### 2) Conformance to Plan (with evidence)
- Overview partition, counts, and filter instrumentation from the plan (`docs/features/shopping_list_archive/plan.md:31-36`) land exactly in `src/components/shopping-lists/overview-list.tsx:64-107` (“`activeLists`/`doneLists` plus filter metadata + begin/end UI state”).
- The shared archive confirm hook and card CTA from plan step 2 (`docs/features/shopping_list_archive/plan.md:38-41`) map to `src/components/shopping-lists/list-delete-confirm.tsx:76-142` (“`useListArchiveConfirm` wrapping `useUpdateShoppingListStatusMutation` with instrumentation”) and `src/components/shopping-lists/overview-card.tsx:151-160` (“Mark Done button only for non-done lists”).
- Ready toolbar and detail flow requirements (`docs/features/shopping_list_archive/plan.md:43-47`) are reflected in `src/routes/shopping-lists/$listId.tsx:447-525` (“detail route wires `confirmReadyArchive` and hides CTA once done”) and the toolbar layout in `src/components/shopping-lists/ready/ready-toolbar.tsx:23-58`.
- Seller-group totals and instrumentation expansion from step 4 (`docs/features/shopping_list_archive/plan.md:49-55`) correspond to `src/components/shopping-lists/ready/seller-group-card.tsx:29-187` (“visible totals computed from rendered lines, caption when filtered”) and `src/hooks/use-shopping-lists.ts:520-678` (“`summarizeSellerGroupVisibility` plus `groupTotals` metadata”).
- Playwright coverage commitments (`docs/features/shopping_list_archive/plan.md:57-75`) are covered by `tests/e2e/shopping-lists/shopping-lists.spec.ts:30-199` and supporting harness updates in `tests/support/page-objects/shopping-lists-page.ts:42-177`.

### 3) Correctness — Findings (ranked)
- None.

### 4) Over-Engineering & Refactoring Opportunities
- None.

### 5) Style & Consistency
- Patterns match existing list management screens; no inconsistencies worth calling out.

### 6) Tests & Deterministic Coverage (new/changed behavior only)
- Mark-done from ready view (no ordered lines) waits on form and list instrumentation before asserting state and toasts (`tests/e2e/shopping-lists/shopping-lists.spec.ts:30-86`).
- Mark-done with ordered lines keeps rows visible and validates `groupTotals` metadata parity (`tests/e2e/shopping-lists/shopping-lists.spec.ts:88-167`).
- Overview archive flow verifies filter UI-state transitions and URL stability (`tests/e2e/shopping-lists/shopping-lists.spec.ts:169-199`) with page-object helpers for the toggle (`tests/support/page-objects/shopping-lists-page.ts:42-94`).
- Factories expose `markDone` so specs can seed deterministic backend states (`tests/api/factories/shopping-list-factory.ts:154-163`).
No additional gaps spotted; scenarios map directly onto the new behaviors.

### 7) Adversarial Sweep (must attempt ≥3 credible failures or justify none)
- Tried to find stale overview metadata when archiving while data is refetching; the effect in `src/components/shopping-lists/overview-list.tsx:93-107` guards on `isFetching` so `endUiState` only fires after the refreshed counts land, preventing a race.
- Looked for discrepancies between seller-group headers and instrumentation; `src/hooks/use-shopping-lists.ts:520-678` feeds `visibleTotals` into both the UI and metadata, and the spec assertions at `tests/e2e/shopping-lists/shopping-lists.spec.ts:66-75` confirm equality.
- Checked for lingering instrumentation when the mark-done dialog is cancelled or errors: `src/components/shopping-lists/list-delete-confirm.tsx:97-127` clears `pendingListRef` and emits `trackError`, so no stuck `isPending` state remains.

### 8) Invariants Checklist (table)
| Invariant | Where enforced | How it could fail | Current protection | Evidence (file:lines) |
|---|---|---|---|---|
| Overview filter metadata matches rendered counts | `overview-list` recomputes counts from filtered arrays | Ending UI state before refetch completes would emit stale counts | `isFetching` guard holds `endUiState` until fresh data | `src/components/shopping-lists/overview-list.tsx:64-107` |
| Ready instrumentation reports visible seller totals | Detail hook derives `groupTotals` from `summarizeSellerGroupVisibility` | If the hook stopped reducing `group.lines`, headers/tests would diverge | Shared `buildSellerGroupInstrumentation` feeds both UI + metadata | `src/hooks/use-shopping-lists.ts:520-678` |
| Mark Done CTA only exposed while status < done | UI checks status before rendering CTA | A regression could offer archival on already-done lists | Button gated by status checks in both card and toolbar | `src/components/shopping-lists/overview-card.tsx:151-160`, `src/routes/shopping-lists/$listId.tsx:459-525` |

### 9) Questions / Needs-Info
- None.

### 10) Risks & Mitigations (top 3)
- R1 — Overview relies on query invalidation to refresh counts; a backend that stops returning the updated status promptly would leave stale counts. Mitigation: monitor instrumentation deltas and add optimistic cache updates if latency regresses (`src/components/shopping-lists/overview-list.tsx:142-148`).
- R2 — Seller totals assume `group.lines` stays in sync with the rendered rows; future filtering logic must continue to prune `group.lines` rather than only altering the DOM. Mitigation: keep `summarizeSellerGroupVisibility` as the single computation point (`src/components/shopping-lists/ready/seller-group-card.tsx:42-187`).
- R3 — Form instrumentation depends on `generateFormId('ShoppingListStatus','markDone')`; identifier drift across contexts would break analytics/tests. Mitigation: centralize future mark-status flows through `useListArchiveConfirm` (`src/components/shopping-lists/list-delete-confirm.tsx:82-123`).

### 11) Confidence
High — Reviewed the full diff, traced instrumentation, and the Playwright specs exercise the critical ready/overview flows end-to-end.
