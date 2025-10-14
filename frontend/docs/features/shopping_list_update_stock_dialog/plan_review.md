# Plan Review — Shopping List Update Stock Dialog

## 1) Summary & Decision
The plan captures the overall reshape of the Update Stock dialog and keeps instrumentation in view, but two conflicting selector strategies and stale validation copy would ship regressions, and Playwright hooks for the new table are underspecified. **Decision: GO-WITH-CONDITIONS** — resolve selector/test-id alignment and copy accuracy before implementation.

## 2) Conformance & Fit (with evidence)
- **Conformance to refs**
  - `docs/commands/plan_feature.md` — Pass: the plan names affected files and lays out ordered implementation steps and Playwright coverage `"## Relevant Files & Functions" (docs/features/shopping_list_update_stock_dialog/plan.md:6-9)` and `"## Implementation Steps" (docs/features/shopping_list_update_stock_dialog/plan.md:11-37)`, matching the template requirement to scope work without writing code.
  - `docs/product_brief.md` — Pass: the brief expects receiving stock to convert shopping list lines into inventory (`"When it arrives, convert to inventory: the app suggests locations..." (docs/product_brief.md:69-75)`), and the plan routes the submission through the existing dialog payload `"Ensure `onSubmit` receives `receiveQuantity = totalReceive` and the filtered allocations array" (docs/features/shopping_list_update_stock_dialog/plan.md:31-32)`, keeping the workflow consistent with the product intent.
  - `AGENTS.md` — Pass: the guidance stresses extending existing instrumentation and keeping tests backend-driven (`"Treat instrumentation as part of the UI contract..." (AGENTS.md:35-41)`), and the plan explicitly updates `useFormInstrumentation` snapshots (docs/features/shopping_list_update_stock_dialog/plan.md:17-18) and reiterates backend-driven Playwright scenarios (docs/features/shopping_list_update_stock_dialog/plan.md:39-42).
- **Fit with codebase**
  - The plan targets the current dialog component and helpers (`"reshape `UpdateStockDialog`..." (docs/features/shopping_list_update_stock_dialog/plan.md:7-8)`), aligning with `src/components/shopping-lists/ready/update-stock-dialog.tsx`.
  - It keeps using generated hooks and instrumentation already present in the module (`"Update `useFormInstrumentation` snapshots..." (docs/features/shopping_list_update_stock_dialog/plan.md:17-18)`), matching the existing patterns in `src/components/shopping-lists/ready/update-stock-dialog.tsx:207-236`.
  - Test updates are scoped to the Playwright page object that currently drives the dialog (`"Update `ShoppingListsPage` helpers..." (docs/features/shopping_list_update_stock_dialog/plan.md:35-37)`), consistent with `tests/support/page-objects/shopping-lists-page.ts:338-379`.

## 3) Open Questions & Ambiguities
- Quantity column behaviour for new rows: the epic states `"Quantity is the current quantity... Quantity must be empty (not zero)" (docs/epics/shopping_list_outstanding_work.md:88-96)`, but the plan proposes `"optional numeric input or muted placeholder for Quantity" (docs/features/shopping_list_update_stock_dialog/plan.md:27)`. Clarifying whether new rows should leave Quantity blank (read-only) or accept input will determine both validation rules and rendering.
- Instrumentation expectation: the coverage mentions verifying `useListLoadingInstrumentation` metadata (`"verify `useListLoadingInstrumentation` metadata emits when boxes are fetched" (docs/features/shopping_list_update_stock_dialog/plan.md:41)`), but the plan does not specify the exact event/fields tests should await. Confirming the expected event name and payload guards Playwright from relying on implicit behaviour.

## 4) Deterministic Playwright Coverage (new/changed behavior only)
- **Unified receive on existing locations** (docs/features/shopping_list_update_stock_dialog/plan.md:39-41)  
  Scenarios: Given a ready line with existing locations, When the user fills the row-level Receive cell and submits, Then the backend `testData.shoppingLists.getDetail` reflects the received quantity and mismatch flow still waits for `ShoppingListLineReceive` events.  
  Instrumentation: `ShoppingListLineReceive` form events (docs/features/shopping_list_update_stock_dialog/plan.md:40).  
  Backend hooks: Rely on real backend validation via `testData.shoppingLists.getDetail` (docs/features/shopping_list_update_stock_dialog/plan.md:40).
- **Receive into mixed existing + new locations** (docs/features/shopping_list_update_stock_dialog/plan.md:41)  
  Scenarios: Given an existing location and a newly added row, When Receive values are entered in both, Then the summed quantity matches backend state.  
  Instrumentation: `ShoppingListLineReceive` plus `useListLoadingInstrumentation` metadata (docs/features/shopping_list_update_stock_dialog/plan.md:41).  
  Backend hooks: Real backend assertions via `testData.shoppingLists.getDetail` (docs/features/shopping_list_update_stock_dialog/plan.md:41). **Major gap:** selectors for Box/Location inputs are unspecified (see Issue [C]); without them the scenario cannot interact deterministically.
- **Validation UX** (docs/features/shopping_list_update_stock_dialog/plan.md:42)  
  Scenarios: Given the dialog with all Receive cells blank, When submit is attempted, Then the summary error appears; When the Receive cell is filled, Then Save enables.  
  Instrumentation: Deterministic test IDs on Receive cells (docs/features/shopping_list_update_stock_dialog/plan.md:28,42).  
  Backend hooks: None (pure client validation).

## 5) Adversarial Sweep (must find ≥3 credible issues)
- **[A] Major — Conflicting row test IDs break determinism**  
  **Evidence:** `"preserve the random `id` tokens for instrumentation-friendly test IDs" (docs/features/shopping_list_update_stock_dialog/plan.md:14)` vs. `"Introduce deterministic `data-testid`s such as `shopping-lists.ready.update-stock.row.${index}.receive`" (docs/features/shopping_list_update_stock_dialog/plan.md:28)` and `"fill `shopping-lists.ready.update-stock.row.${index}.receive`" (docs/features/shopping_list_update_stock_dialog/plan.md:35-36)`.  
  **Why it matters:** Index-based IDs will shift when rows are inserted or removed, defeating the stated goal of stable instrumentation and producing flaky Playwright selectors.  
  **Fix suggestion:** Commit to ID-based selectors (`row.${allocationId}.receive`) and update the Playwright helper accordingly.  
  **Confidence:** High.
- **[B] Major — Validation copy still references removed field**  
  **Evidence:** `"reuse the summary message pattern to highlight mismatches" (docs/features/shopping_list_update_stock_dialog/plan.md:22)` while the existing pattern emits `"Allocate ${difference} more to match Receive now"` (src/components/shopping-lists/ready/update-stock-dialog.tsx:158-166).  
  **Why it matters:** Shipping the old copy after removing the `Receive now` control leaves users with an error message that references a non-existent field, blocking clarity on why submission failed.  
  **Fix suggestion:** Plan to rewrite the summary message (and associated tests) to refer to the new Receive column or total instead of `Receive now`.  
  **Confidence:** High.
- **[C] Major — Missing Box/Location selectors for Playwright**  
  **Evidence:** The plan only defines Receive selectors `"Introduce deterministic `data-testid`s ... .receive" (docs/features/shopping_list_update_stock_dialog/plan.md:28)` and test helpers are expected to edit box/location (`"expose helpers for editing new rows (box/location/receive)" (docs/features/shopping_list_update_stock_dialog/plan.md:35-36)`), yet the current page object relies on dedicated `.box` / `.location` test IDs (tests/support/page-objects/shopping-lists-page.ts:357-366).  
  **Why it matters:** Without specified selectors for Box/Location cells, Playwright cannot interact with the new rows, leaving scenario 2 un-implementable and threatening the `testing/no-route-mocks` guard.  
  **Fix suggestion:** Extend the plan to define stable `data-testid`s for Box and Location inputs (ideally mirroring the ID-based approach recommended in [A]).  
  **Confidence:** High.

## 6) Derived-Value & Persistence Invariants
| Derived value | Source dataset (filtered/unfiltered) | Write/cleanup it triggers | Guard conditions | Invariant that must hold | Evidence (file:lines) |
| ------------- | ------------------------------------ | ------------------------- | ---------------- | ------------------------ | --------------------- |
| `totalReceive` | `form.values.allocations` filtered to rows with positive `receive` | Sent as `receiveQuantity` to `onSubmit`/instrumentation | Require `allocationValidation.isValid` and `totalReceive > 0` before submit | Sum of positive Receive inputs equals payload `receiveQuantity` | docs/features/shopping_list_update_stock_dialog/plan.md:17-23,31-32 |
| `filteredAllocations` | `form.values.allocations` filtered to positive `receive` rows | Payload emitted via `allocationToPayload` | Row-level validation enforces positive integers | No zero/blank rows reach backend; each payload row maps to either existing or new location | docs/features/shopping_list_update_stock_dialog/plan.md:20-23,31 |
| Seeded existing drafts | `line.partLocations` (unfiltered) | Seeds form on open and resets after submit/close | Existing rows marked `type: 'existing'` (read-only) | Dialog always mirrors latest backend locations after reopen | docs/features/shopping_list_update_stock_dialog/plan.md:13-15,33 |

## 7) Risks & Mitigations (top 3)
- Row selector instability (Issue [A]): Align on allocation-ID-based `data-testid`s before coding to keep instrumentation deterministic.
- Stale validation messaging (Issue [B]): Update the plan to replace `Receive now` references so UX copy matches the new controls.
- Incomplete Playwright hooks (Issue [C]): Specify Box/Location selectors and ensure the page object updates can target them.

## 8) Confidence
Medium — review is grounded in plan + repo context, but ambiguous Quantity expectations and unspecified instrumentation payloads leave room for interpretation until clarified.
