# Shopping List Kanban -- Plan Review

## 1) Summary & Decision

**Readiness**

The plan is thorough, well-researched, and closely aligned with both the backend implementation decisions document and the frontend requirements. It correctly identifies the full scope of changes needed: status simplification, seller group persistence, new CRUD endpoints, endpoint removal, and test data updates. The file map is exhaustive (28 areas listed with evidence). The data model, state machines, error handling, and test plan are all well-specified and match the codebase patterns. Three issues identified in the first review pass have been addressed: the file map now includes the three previously-missing test files, the DELETE seller group algorithm now protects DONE lines from reset, and a new algorithm flow describes how seller groups are built from persisted data after `_build_seller_groups` removal.

**Decision**

`GO` -- The plan is implementation-ready. All identified issues have been resolved. The file map is complete, the algorithms are specified, and the test plan covers the new behaviors including edge cases. A competent developer can implement from this plan without guessing.

---

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `docs/commands/plan_feature.md` -- Pass -- All 16 required sections are present and populated with evidence-backed entries.
- `docs/product_brief.md` -- Pass -- `plan.md:29-68` -- The shopping list changes align with the product brief's shopping list concept (sections 5-6). Status simplification is a UI-driven refinement, not a product scope change.
- `CLAUDE.md` (Architecture) -- Pass -- `plan.md:126-133` -- The plan correctly places business logic in the service layer, schemas in the schema layer, and thin endpoints in the API layer.
- `CLAUDE.md` (BFF pattern) -- Pass -- `plan.md:66` -- "The BFF pattern means breaking API changes are shipped in lockstep with the frontend." Old endpoints are removed entirely; no deprecation markers.
- `CLAUDE.md` (No tombstones) -- Pass -- `plan.md:106-108, 150-152` -- The plan explicitly deletes `shopping_list_seller_note.py` model and schema files.
- `CLAUDE.md` (Metrics) -- Pass -- `plan.md:558-573` -- New metrics follow the decentralized module-level pattern with Counter and labels.
- `CLAUDE.md` (Enums as text) -- Pass -- `plan.md:64, 267-269` -- The new `ShoppingListSellerStatus` enum uses `native_enum=False`.
- `CLAUDE.md` (Test data) -- Pass -- `plan.md:190-200` -- Test data updates are planned for all affected JSON files.
- `backend_implementation.md` -- Pass -- All 10 sections of the design decisions document are addressed. The DELETE seller group section has been updated to protect DONE lines from reset, matching the plan.

**Fit with codebase**

- `app/services/shopping_list_service.py` -- `plan.md:126-128` -- The plan correctly identifies all removal targets and their replacements. The new "Build Seller Groups from Persisted Data" algorithm at `plan.md:452-461` provides the replacement for `_build_seller_groups` and `_attach_ready_payload`.
- `app/services/shopping_list_line_service.py` -- `plan.md:130-132` -- The plan correctly identifies the three service methods to remove and the behavioral additions to `update_line`.
- `app/services/container.py` -- `plan.md:158-160` -- No DI container changes needed; constructor signatures remain stable. Verified at `container.py:149-153`.
- `tests/test_parts_api.py` -- `plan.md:234-236` -- Now included in the file map with evidence of 7 `READY` references.
- `tests/api/test_parts_api.py` -- `plan.md:238-240` -- Now included with evidence of 2 `CONCEPT` references.
- `tests/api/test_kits_api.py` -- `plan.md:242-244` -- Now included with evidence of 7 `CONCEPT`/`READY` references.

---

## 3) Open Questions & Ambiguities

No blocking open questions remain. The three issues from the first review pass (missing test files, DONE-line protection, seller group construction algorithm) have all been resolved in the updated plan. The plan's section 15 correctly states "No open questions remain."

---

## 4) Deterministic Backend Coverage (new/changed behavior only)

- Behavior: Seller group CRUD (ShoppingListService)
- Scenarios:
  - Given active list + valid seller, When POST seller group, Then 201 with new group (`tests/services/test_shopping_list_service.py`)
  - Given duplicate seller group, When POST, Then 409 (`tests/services/test_shopping_list_service.py`)
  - Given seller group with all lines `ordered > 0`, When PUT status ordered, Then all lines ORDERED (`tests/services/test_shopping_list_service.py`)
  - Given seller group with line `ordered == 0`, When PUT status ordered, Then 409 (`tests/services/test_shopping_list_service.py`)
  - Given ordered group with no received, When PUT status active, Then lines revert (`tests/services/test_shopping_list_service.py`)
  - Given ordered group with received > 0, When PUT status active, Then 409 (`tests/services/test_shopping_list_service.py`)
  - Given active group with lines, When DELETE, Then non-DONE lines become ungrouped, DONE lines preserved, group row deleted (`tests/services/test_shopping_list_service.py`)
  - Given active group with mix of NEW and DONE lines, When DELETE, Then only NEW lines are reset (`tests/services/test_shopping_list_service.py`)
  - Given ordered group, When DELETE, Then 409 (`tests/services/test_shopping_list_service.py`)
  - Given done list, When POST seller group, Then 409 (`tests/services/test_shopping_list_service.py`)
- Instrumentation: `SHOPPING_LIST_SELLER_GROUP_OPERATIONS_TOTAL` counter with `operation` label.
- Persistence hooks: Alembic migration 023; test data file `shopping_list_sellers.json`.
- Gaps: None.
- Evidence: `plan.md:603-618`.

- Behavior: Line PUT with `ordered` field (ShoppingListLineService)
- Scenarios:
  - Given NEW line, When PUT ordered=5, Then line.ordered=5 (`tests/services/test_shopping_list_line_service.py`)
  - Given ORDERED line, When PUT ordered=10, Then 409 (`tests/services/test_shopping_list_line_service.py`)
  - Given DONE line, When PUT ordered=5, Then 409 (`tests/services/test_shopping_list_line_service.py`)
  - Given NEW line, When PUT ordered=0, Then no change (`tests/services/test_shopping_list_line_service.py`)
- Instrumentation: Existing `SHOPPING_LIST_LINES_MARKED_ORDERED_TOTAL` with label change to `seller_group`.
- Persistence hooks: No migration needed; `ordered` column already exists.
- Gaps: None.
- Evidence: `plan.md:630-638`.

- Behavior: Status simplification (active/done)
- Scenarios:
  - Given new list, When created, Then status is `active` (`tests/services/test_shopping_list_service.py`)
  - Given active list, When set done, Then status is `done` (`tests/services/test_shopping_list_service.py`)
  - Given done list, When set active, Then 409 (`tests/services/test_shopping_list_service.py`)
- Instrumentation: No new metrics.
- Persistence hooks: Migration 023 updates `concept`/`ready` to `active`; test data `shopping_lists.json` updated.
- Gaps: None.
- Evidence: `plan.md:620-628`.

- Behavior: `can_receive` property update (seller_id is not None guard)
- Scenarios:
  - Given ORDERED line with seller_id=null, When checking `can_receive`, Then returns False (`tests/services/test_shopping_list_line_service.py`)
- Instrumentation: N/A.
- Persistence hooks: N/A.
- Gaps: None.
- Evidence: `plan.md:650-656`.

- Behavior: Seller Group API endpoints
- Scenarios: POST, GET, PUT (note + status), DELETE, removed endpoints return 404/405. Well-covered at `plan.md:658-669`.
- Instrumentation: Counter via service layer.
- Persistence hooks: DI wiring unchanged.
- Gaps: None.
- Evidence: `plan.md:658-669`.

---

## 5) Adversarial Sweep

- Checks attempted: DELETE seller group resetting DONE lines; file map completeness for CONCEPT/READY references; seller groups response construction after `_build_seller_groups` removal; TOCTOU in seller group ordering; ungrouped line receiving with null seller_id; migration data loss on downgrade.
- Evidence: `plan.md:442-450` (DONE-line protection), `plan.md:234-244` (three additional test files), `plan.md:452-461` (seller groups construction algorithm), `plan.md:417-418` (TOCTOU prevention), `plan.md:650-656` (ungrouped guard), `plan.md:686-688` (downgrade lossy but acceptable).
- Why the plan holds: All three previously identified issues have been addressed. The DELETE algorithm now explicitly skips DONE lines (`plan.md:446`). The file map is complete with 28 areas including the three previously-missing test files. The seller groups construction is described as a named algorithm flow (`plan.md:452-461`). The TOCTOU concern is addressed by the existing transaction isolation model (`plan.md:499-501`). The ungrouped line restriction has a belt-and-suspenders test scenario. The migration downgrade is acknowledged as lossy but acceptable for a hobby project.

---

## 6) Derived-Value & Persistence Invariants

- Derived value: Seller group `completed` flag
  - Source dataset: Filtered -- all lines in the seller group where `status == DONE`.
  - Write / cleanup triggered: None; read-only derived field on the response schema.
  - Guards: Computed at query time from line statuses within the same session.
  - Invariant: `completed == True` iff every line in the group has `status == DONE`.
  - Evidence: `plan.md:467-471`.

- Derived value: Seller group `totals` (needed, ordered, received)
  - Source dataset: Unfiltered sum across all lines in the group (matched by `seller_id`).
  - Write / cleanup triggered: None; read-only aggregation.
  - Guards: Computed within the same session/transaction as the line query.
  - Invariant: Totals must reflect the current state of all lines in the group at query time.
  - Evidence: `plan.md:473-478`.

- Derived value: `can_receive` on ShoppingListLine
  - Source dataset: Line's own `status` and `seller_id` fields.
  - Write / cleanup triggered: Drives UI state for receive button visibility; no persistence.
  - Guards: `seller_id is not None` guard prevents receiving on ungrouped lines. Belt-and-suspenders since ungrouped lines cannot reach ORDERED status.
  - Invariant: `can_receive == True` only when `status == ORDERED AND seller_id is not None`.
  - Evidence: `plan.md:487-492`, `app/models/shopping_list_line.py:143-147`.

- Derived value: `line_counts` on ShoppingList
  - Source dataset: Unfiltered count of all lines by status for the list.
  - Write / cleanup triggered: Transient attribute attached to the model instance.
  - Guards: Freshly computed from database each time via `_counts_for_lists`.
  - Invariant: Counts must match the actual status distribution of lines.
  - Evidence: `plan.md:480-485`, `app/services/shopping_list_service.py:412-440`.

---

## 7) Risks & Mitigations (top 3)

- Risk: Test data has ORDERED lines with null seller_id that become invalid under new rules (`plan.md:728-731`).
- Mitigation: Fix test data in slice 5 by assigning sellers to previously-ungrouped ORDERED lines, or demoting them to NEW status. The plan already identifies the specific line (Bench Replenishment, part QRST).
- Evidence: `app/data/test_data/shopping_list_lines.json:29-37`, `plan.md:198-200`.

- Risk: Kit shopping list integration references CONCEPT status in multiple places (`plan.md:732-735`).
- Mitigation: Grep is exhaustive (22 code/test files identified). Update all CONCEPT and READY references systematically in slice 2. The plan lists `kit_shopping_list_service.py`, `kit_service.py`, and all relevant test files.
- Evidence: `plan.md:162-168`, `plan.md:218-244`.

- Risk: Migration 023 drops `shopping_list_seller_notes` table; stale references cause runtime errors (`plan.md:736-739`).
- Mitigation: Delete the old model and schema files in slice 1/3. Import errors at startup catch stale references. The plan explicitly marks both files for deletion.
- Evidence: `plan.md:106-108`, `plan.md:150-152`.

---

## 8) Confidence

Confidence: High -- The plan is comprehensive, all review findings have been addressed, the file map is complete, and the algorithms are well-specified. The plan is ready for implementation.
