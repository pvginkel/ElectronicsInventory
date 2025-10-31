### 1) Summary & Decision
The implementation hits most structural goals from the plan—new schema, service layer, schemas, APIs, metrics, and tests are all present—but two correctness gaps block readiness: pick-list creation ignores existing open allocations, and `updated_at` never advances when lines change. Decision: **GO-WITH-CONDITIONS** (fix both majors).

### 2) Conformance to Plan (with evidence)
- Migration rebuilds tables and adds line tracking as requested (`alembic/versions/020_pick_list_workflow.py:1`).
- ORM models and relationships for lists/lines match the target layout (`app/models/kit_pick_list.py:20`, `app/models/kit_pick_list_line.py:1`), with schema exports wired (`app/models/__init__.py:7`).
- Service + API stack aligns with the specified endpoints (`app/services/kit_pick_list_service.py:37`, `app/api/pick_lists.py:17`; schemas at `app/schemas/pick_list.py:18`; DI wiring in `app/services/container.py:49` and `app/__init__.py:60`).
- Metrics additions cover creation, pick, undo, and queries (`app/services/metrics_service.py:240`).
- Test data and loader pick up persisted lines (`app/services/test_data_service.py:403`, `app/data/test_data/kit_pick_list_lines.json:1`); new service/API tests land as planned (`tests/services/test_kit_pick_list_service.py:1`, `tests/api/test_pick_lists_api.py:1`).
- **Gap:** The plan’s goal to “enforce availability” for persisted allocations (docs/features/pick_list_workflow_deduction/plan.md:3) is unmet because allocation ignores stock already promised on other open pick lists (see Finding [PL-1]).

### 3) Correctness — Findings (ranked)
- **[PL-1] Major — Open pick lists double-count inventory**  
  **Evidence:** `app/services/kit_pick_list_service.py:62` builds availability purely from live `PartLocation.qty`; the allocation loop (`app/services/kit_pick_list_service.py:70`) never subtracts quantities already reserved on other `KitPickListLine` records.  
  **Why it matters:** Creating two pick lists back-to-back against scarce stock will succeed twice, producing identical lines from the same location even though only one unit exists. That violates the plan’s “enforces availability” promise (docs/features/pick_list_workflow_deduction/plan.md:3) and leads to guaranteed shortages when operators execute the workflows.  
  **Fix suggestion:** When loading availability, subtract the sum of `quantity_to_pick` for non-completed lines grouped by `(kit_content_id, location_id)` (or by part/location) before evaluating `remaining`; reject creation if the adjusted supply is insufficient. Add regression tests covering two sequential creations.  
  **Confidence:** High.

- **[PL-2] Major — `KitPickList.updated_at` never reflects line activity**  
  **Evidence:** In `pick_line`, only the final-line path touches the parent (`app/services/kit_pick_list_service.py:200`); intermediate picks leave the row untouched, so `updated_at` exposed in the summary schema (`app/schemas/pick_list.py:125`) stays at creation time. The same happens for undo unless the list status flips.  
  **Why it matters:** Clients consume `updated_at` to sort or display “last changed” badges; today it will lie whenever progress is made without finishing the list, obscuring active work and stale ordering.  
  **Fix suggestion:** Explicitly bump `pick_list.updated_at = datetime.now(UTC)` (or use `func.now()` via `values`) on every pick/undo mutation and add coverage asserting the timestamp changes even when the status remains `open`.  
  **Confidence:** High.

### 4) Over-Engineering & Refactoring Opportunities
None spotted—the service and schema layers stay close to the plan without extra abstraction.

### 5) Style & Consistency
Generally consistent with existing patterns (selectin loading, dependency injection, Pydantic schemas). No stylistic blockers beyond the correctness issues.

### 6) Tests & Deterministic Coverage (new/changed behavior only)
- Positive flows for create/pick/undo/list/detail are well covered (`tests/services/test_kit_pick_list_service.py:46`, `tests/api/test_pick_lists_api.py:17`).  
- Missing coverage: creating a second pick list against already allocated stock should now fail—add a service-level test reproducing the over-allocation scenario. Likewise, add a pick/undo test asserting `updated_at` advances so regressions surface.  
- Dataset loaders lack assertions around reserved-capacity math, so once the allocator is fixed, add fixture validations (or unit tests) to keep it honest.

### 7) Adversarial Sweep
1. Sequential pick-list creation against the same single-quantity location → reproduces over-allocation (Finding [PL-1]).  
2. Pick a single line on a multi-line list → `updated_at` remains at creation time (Finding [PL-2]).  
3. Attempted to create a pick list for an archived kit; guard at `app/services/kit_pick_list_service.py:262` raised as expected, so lifecycle protection holds.

### 8) Invariants Checklist (table)
| Invariant | Where enforced | How it could fail | Current protection | Evidence |
|---|---|---|---|---|
| Open pick lists must not over-reserve the same part/location | Expected in allocator | Create two pick lists before picking | None (allocator only looks at `PartLocation.qty`) | app/services/kit_pick_list_service.py:62 |
| Pick list `updated_at` tracks latest line activity | `pick_line` / `undo_line` should update parent | Pick/undo without status change keeps timestamp stale | Not updated today (only final completion flips status) | app/services/kit_pick_list_service.py:200 |
| Pick list lines require positive quantities | DB constraint and tests | Invalid JSON/test data | Constraint + regression test | app/models/kit_pick_list_line.py:41, tests/test_database_constraints.py:518 |

### 9) Questions / Needs-Info
None.

### 10) Risks & Mitigations (top 3)
- R1 — Over-allocation causes guaranteed shortages when multiple pick lists target identical inventory. Mitigation: adjust allocator to subtract open reservations and add regression tests.  
- R2 — Stale `updated_at` misleads UI ordering and operators monitoring progress. Mitigation: update the timestamp on every pick/undo and cover with tests.  
- R3 — Future maintenance might reintroduce allocation drift; add dataset fixtures or service tests once the allocator is corrected to flag regressions early.

### 11) Confidence
Medium — large surface reviewed and tests cover many paths, but the highlighted majors show latent bugs in critical workflows.
