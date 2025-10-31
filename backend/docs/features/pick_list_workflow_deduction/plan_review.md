# 1) Summary & Decision
The plan maps out models, services, and APIs for the pick list workflow, but several core schema and dependency details conflict with the epic and platform layering rules, so execution would stall without clarification and corrections.  
**Decision:** GO-WITH-CONDITIONS — must fix schema gaps (`picked_at`, unique constraint) and resolve the proposed Kit↔pick-list service cycle before implementation is safe.

# 2) Conformance & Fit (with evidence)
- **Product brief scope — Pass.** The plan targets the kit build flow: “Provide the backend for ‘Pick list workflow & deduction’ … auto-allocates stock per location” (docs/features/pick_list_workflow_deduction/plan.md:3-3), aligning with the brief’s kit build support (docs/product_brief.md:70-76).
- **Feature planning checklist — Pass.** It supplies target files and algorithms per the template (docs/features/pick_list_workflow_deduction/plan.md:5-45) in line with the planning mandate (docs/commands/plan_feature.md:13-17).
- **Agent responsibilities / backend layering — Fail.** Wiring `kit_pick_list_service` with `KitService` on both sides breaches the clear layering rule (AGENTS.md:27-61) because the plan has the new service call `KitService.get_active_kit_for_flow` (docs/features/pick_list_workflow_deduction/plan.md:26-26) while also having `KitService` “reuse [the] new service” (docs/features/pick_list_workflow_deduction/plan.md:11-11).

**Fit with codebase.** Touch points reference existing modules (`KitService`, `InventoryService`, Alembic revisions) and new assets (`app/api/pick_lists.py`, `KitPickListLine`). However, the cyclic service dependency outlined above conflicts with current container patterns, and schema specs omit required columns/constraints (docs/features/pick_list_workflow_deduction/plan.md:6-15 vs. docs/epics/kits_feature_breakdown.md:139-145).

# 3) Open Questions & Ambiguities
- Undo stock helper scope: How will the new “restore quantities” helper coordinate with existing `cleanup_zero_quantities` to avoid double inserts or stale relationships when re-inserting rows (docs/features/pick_list_workflow_deduction/plan.md:38-39)? Clarification affects inventory integrity.
- Metrics semantics: The plan adds counters/histograms for creation, pick, undo (docs/features/pick_list_workflow_deduction/plan.md:13-13), but how will label sets distinguish success vs. conflict paths? Observability choices determine alert usefulness.
- Partial kit recalculations: When `KitService` “reuses” the pick list service for badge counts (docs/features/pick_list_workflow_deduction/plan.md:11-11), which methods become shared, and how do we avoid the planned circular dependency?

# 4) Deterministic Backend Coverage (new/changed behavior only)
- **POST /kits/<kit_id>/pick-lists** (docs/features/pick_list_workflow_deduction/plan.md:17-17)  
  - **Scenarios:** Planned service & API tests (`tests/services/test_kit_pick_list_service.py`, `tests/api/test_pick_lists_api.py`) cover allocation success/insufficient stock (docs/features/pick_list_workflow_deduction/plan.md:21-21,44-44).  
  - **Instrumentation:** Metrics counters/histograms include creation (docs/features/pick_list_workflow_deduction/plan.md:13-13).  
  - **Persistence hooks:** Alembic migration rebuilds schema (docs/features/pick_list_workflow_deduction/plan.md:6-6) and new test data files (docs/features/pick_list_workflow_deduction/plan.md:20-20).
- **GET /pick-lists/<pick_list_id>** (docs/features/pick_list_workflow_deduction/plan.md:17-17)  
  - **Scenarios:** Covered via new API tests (docs/features/pick_list_workflow_deduction/plan.md:21-21).  
  - **Instrumentation:** **Major — missing.** No logging/metrics called out for detail fetch; none of the planned metrics touch reads.  
  - **Persistence hooks:** Relies on new models/migration (docs/features/pick_list_workflow_deduction/plan.md:6-15).
- **POST /pick-lists/<id>/lines/<line_id>/pick** (docs/features/pick_list_workflow_deduction/plan.md:17,32-35)  
  - **Scenarios:** Service/API tests promised for pick flow (docs/features/pick_list_workflow_deduction/plan.md:21-21,44-44).  
  - **Instrumentation:** Metrics record line picks and completion durations (docs/features/pick_list_workflow_deduction/plan.md:13-13,35-35).  
  - **Persistence hooks:** Uses new columns (`inventory_change_id`, status) from migration (docs/features/pick_list_workflow_deduction/plan.md:6-9,34-35).
- **POST /pick-lists/<id>/lines/<line_id>/undo** (docs/features/pick_list_workflow_deduction/plan.md:17,37-40)  
  - **Scenarios:** Undo cases included in service/API tests (docs/features/pick_list_workflow_deduction/plan.md:21-21,44-44).  
  - **Instrumentation:** Metrics for undo outcomes/durations noted (docs/features/pick_list_workflow_deduction/plan.md:13-13,38-39).  
  - **Persistence hooks:** Depends on `inventory_change_id` column and new inventory helper (docs/features/pick_list_workflow_deduction/plan.md:6-12,37-40).
- **GET /kits/<kit_id>/pick-lists** (docs/features/pick_list_workflow_deduction/plan.md:17-18)  
  - **Scenarios:** Plan extends kit API tests for summary payloads (docs/features/pick_list_workflow_deduction/plan.md:21-21,44-45).  
  - **Instrumentation:** **Major — missing.** No metrics/logs described for listing view.  
  - **Persistence hooks:** Reuses updated schemas & services (docs/features/pick_list_workflow_deduction/plan.md:11-16).

# 5) Adversarial Sweep (must find ≥3 credible issues or declare why none exist)
- **[A1] Major — Missing `picked_at` schema column**  
  **Evidence:** Migration spec omits it: “create `kit_pick_list_lines` (`quantity_to_pick`, `inventory_change_id` FK, timestamps, statuses…)” (docs/features/pick_list_workflow_deduction/plan.md:6-6) while the epic requires `picked_at` (docs/epics/kits_feature_breakdown.md:140-146) and the algorithm needs to “stamp `picked_at`” (docs/features/pick_list_workflow_deduction/plan.md:34-35).  
  **Why it matters:** Without a persisted `picked_at`, completion timestamps can’t be stored, breaking undo requirements and UI archived grouping.  
  **Fix suggestion:** Explicitly add `picked_at TIMESTAMP` to the migration/model/schema bullets and ensure tests cover it.  
  **Confidence:** High.
- **[A2] Major — Planned Kit ↔ pick-list service cycle**  
  **Evidence:** Pick-list service depends on KitService (“Load the active kit via `KitService.get_active_kit_for_flow`” docs/features/pick_list_workflow_deduction/plan.md:26-26; container wiring includes `KitService` dependency docs/features/pick_list_workflow_deduction/plan.md:14-14) while KitService is told to “reuse [the] new service” (docs/features/pick_list_workflow_deduction/plan.md:11-11).  
  **Why it matters:** The dependency injector cannot construct mutually dependent factories, leading to runtime failures and violating layering guidance (AGENTS.md:27-61).  
  **Fix suggestion:** Keep KitService independent—either let the pick-list service perform its own kit fetch/query or have KitService orchestrate pick-list operations instead of calling back into the new service.  
  **Confidence:** High.
- **[A3] Major — Missing unique constraint/index for line allocations**  
  **Evidence:** Plan only promises a quantity check and cascade for `KitPickListLine` (docs/features/pick_list_workflow_deduction/plan.md:8-8), omitting the required `UniqueConstraint("pick_list_id", "kit_content_id", "location_id")` and `(pick_list_id, status)` index mandated in the epic (docs/epics/kits_feature_breakdown.md:140-146).  
  **Why it matters:** Duplicate allocations to the same location could slip into the table, breaking greedy invariants and leading to conflicting deductions.  
  **Fix suggestion:** Update migration/model bullet to include the uniqueness constraint and status index so the implementation follows the epic.  
  **Confidence:** Medium.

# 6) Derived-Value & Persistence Invariants (table)
| Derived value | Source dataset (filtered/unfiltered) | Write/cleanup it triggers | Guard conditions | Invariant that must hold | Evidence (file:lines) |
| ------------- | ------------------------------------ | ------------------------- | ---------------- | ------------------------ | --------------------- |
| `quantity_to_pick` per line | Filtered `PartLocation` rows ordered by qty (`remaining_required`, per part) | Inserts immutable `KitPickListLine` rows | Only when full requirement satisfied; abort otherwise | Sum of `quantity_to_pick` across lines equals each part’s required total | docs/features/pick_list_workflow_deduction/plan.md:27-30 |
| `inventory_change_id` linkage | `InventoryService.remove_stock` result (`QuantityHistory.id`) | Updates `kit_pick_list_lines.inventory_change_id`, sets status `completed` | Line `status == open` and removal succeeds | Completed lines always carry a valid history id for undo | docs/features/pick_list_workflow_deduction/plan.md:34-35 |
| `completed_at` timestamp | Derived from all sibling line statuses | Updates `kit_pick_lists.status` & `completed_at` | Triggered only when every line is completed | Pick lists marked `completed` must have `completed_at` set; reopening clears it | docs/features/pick_list_workflow_deduction/plan.md:35-40 |

# 7) Risks & Mitigations (top 3)
- Missing `picked_at` column will block UI archived state; update migration/model plan to include it (A1).
- Planned service cycle will deadlock dependency injection; restructure ownership so only one service depends on the other (A2).
- Absent uniqueness/index on line allocations risks duplicate deductions; add constraints per epic (A3).

# 8) Confidence
Medium — Familiar with the kit/inventory services, but unresolved schema omissions and the service-cycle risk introduce implementation uncertainty pending plan fixes.
