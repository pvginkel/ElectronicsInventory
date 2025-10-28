# Pick List Delete Endpoint — Plan Review

## 1) Summary & Decision

**Readiness**

The plan is thorough, well-researched, and follows established patterns consistently. The research log (section 0) demonstrates comprehensive investigation of cascade relationships, existing delete patterns, and metrics handling. The plan correctly identifies that SQLAlchemy cascade relationships are already configured and will handle line deletion automatically. The decision to preserve QuantityHistory records (via SET NULL FK) maintains audit trails appropriately. The plan explicitly addresses the critical UX consideration that deletion does NOT undo inventory deductions, recommending frontend warnings for users. Test coverage is comprehensive with clear scenarios for both service and API layers. The plan follows CLAUDE.md guidelines for service architecture, error handling, and testing requirements.

**Decision**

`GO` — The plan is implementation-ready with correct cascade handling, appropriate transaction scope, comprehensive test coverage, and explicit documentation of user-facing behavior. All cascade relationships are verified in the codebase, the pattern matches other delete endpoints (kit, shopping_list, part, box, type, seller), and the research demonstrates thorough understanding of the domain.

---

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `CLAUDE.md` — Pass — `plan.md:102-104` — "Service method `KitPickListService.delete_pick_list(pick_list_id: int) -> None`" follows BaseService pattern with proper error handling via RecordNotFoundException
- `CLAUDE.md` — Pass — `plan.md:140-148` — API surface follows blueprint pattern with `@handle_api_errors`, `@inject`, HTTP 204 on success, HTTP 404 with ErrorResponseSchema
- `CLAUDE.md` — Pass — `plan.md:243-252` — No metrics for deletions is consistent with all other delete endpoints (shopping_list, part, box, type, seller, kit) as documented
- `CLAUDE.md` — Pass — `plan.md:282-306` — Test plan includes comprehensive service tests and API tests matching the "Definition of Done" requirements
- `product_brief.md` — Pass — Implicit fit — Pick lists are part of the projects/kits feature. Deletion is a reasonable administrative operation not explicitly covered but consistent with the product's focus on practical workflow management

**Fit with codebase**

- `app/services/kit_pick_list_service.py` — `plan.md:102-104` — Service class exists with create, get, list, pick, undo methods. No delete method currently exists, leaving clean space for implementation
- `app/api/pick_lists.py` — `plan.md:108-111` — Blueprint exists with CREATE, GET, LIST, PICK, UNDO endpoints. No DELETE route, confirming gap
- `app/models/kit_pick_list.py:70-76` — `plan.md:16,130-132` — Cascade relationship `cascade="all, delete-orphan"` verified in codebase
- `app/models/kit_pick_list_line.py:60-61` — `plan.md:19,130` — FK `ondelete="CASCADE"` on pick_list_id verified
- `app/models/kit_pick_list_line.py:83-86` — `plan.md:21,131` — FK `ondelete="SET NULL"` on inventory_change_id verified
- `app/services/kit_service.py:518-526` — `plan.md:44,173` — Kit delete pattern `db.get()`, `db.delete()`, `db.flush()` matches proposed implementation
- `app/services/shopping_list_service.py:95-104` — `plan.md:46` — Shopping list delete manually deletes lines first, then parent. Pick list plan relies on cascade instead, which is valid given explicit cascade configuration

---

## 3) Open Questions & Ambiguities

No blocking open questions remain. The plan explicitly addresses all design decisions:

- Section 15 lists all risks with mitigations and states "Open Questions: None. All design decisions have been resolved."
- Status restriction decision: Pick lists can be deleted in any status (OPEN or COMPLETED) — explicitly stated in plan.md:36, 346
- Inventory reversal decision: Deletion does NOT automatically undo inventory — explicitly stated in plan.md:82-86, 234-238, 348
- Metrics decision: No metrics will be recorded — explicitly stated and justified in plan.md:9, 243-252, 350
- QuantityHistory preservation: Explicit design choice to maintain audit trail — plan.md:38-41, 331-333, 349

---

## 4) Deterministic Backend Coverage (new/changed behavior only)

- Behavior: `KitPickListService.delete_pick_list(pick_list_id: int)`
- Scenarios:
  - Given an OPEN pick list exists with no picked lines, When delete_pick_list is called, Then pick list and all lines are removed from database (`tests/services/test_kit_pick_list_service.py::test_delete_pick_list_open`)
  - Given a COMPLETED pick list exists with all lines picked, When delete_pick_list is called, Then pick list and all lines are removed but QuantityHistory records remain (`tests/services/test_kit_pick_list_service.py::test_delete_pick_list_completed`)
  - Given a pick list exists with mixed OPEN and COMPLETED lines, When delete_pick_list is called, Then pick list and all lines are removed (`tests/services/test_kit_pick_list_service.py::test_delete_pick_list_mixed`)
  - Given pick_list_id does not exist, When delete_pick_list is called, Then RecordNotFoundException is raised (`tests/services/test_kit_pick_list_service.py::test_delete_pick_list_not_found`)
  - Given a pick list is deleted, When listing pick lists for the parent kit, Then deleted pick list does not appear in results (`tests/services/test_kit_pick_list_service.py::test_list_after_delete`)
  - Given a pick list is deleted, When querying kit badge counts, Then badge count decreases appropriately (`tests/services/test_kit_pick_list_service.py::test_badge_count_after_delete`)
- Instrumentation: No metrics for deletions (consistent pattern per plan.md:243-252). Pick list lifecycle operations (create, pick, undo) record metrics but delete does not.
- Persistence hooks: No migration needed (no schema changes). Test data in `app/data/test_data/` requires no updates (deletion is ephemeral operation). DI wiring already exists for kit_pick_list_service in ServiceContainer.
- Gaps: None. Coverage matches other delete endpoints.
- Evidence: plan.md:282-306

---

- Behavior: `DELETE /api/pick-lists/<pick_list_id>`
- Scenarios:
  - Given a pick list exists, When DELETE /api/pick-lists/<pick_list_id> is called, Then HTTP 204 is returned and pick list is deleted (`tests/api/test_pick_lists_api.py::test_delete_pick_list_success`)
  - Given pick_list_id does not exist, When DELETE /api/pick-lists/<pick_list_id> is called, Then HTTP 404 is returned with error message (`tests/api/test_pick_lists_api.py::test_delete_pick_list_not_found`)
  - Given a pick list with lines exists, When DELETE is called, Then HTTP 204 is returned and all records (pick list and lines) are removed (`tests/api/test_pick_lists_api.py::test_delete_pick_list_with_lines`)
  - Given a pick list is deleted, When GET /api/pick-lists/<pick_list_id> is called, Then HTTP 404 is returned (`tests/api/test_pick_lists_api.py::test_get_after_delete`)
- Instrumentation: Standard Flask request logging. No custom metrics.
- Persistence hooks: Endpoint wired via pick_lists_bp blueprint (implicit in plan.md:108-111). ServiceContainer already provides kit_pick_list_service.
- Gaps: None. HTTP status codes and error handling match established patterns.
- Evidence: plan.md:297-306

---

## 5) Adversarial Sweep (must find ≥3 credible issues or declare why none exist)

**Minor — Transaction commit handling not explicit in algorithm**
**Evidence:** `plan.md:155-167, 207-212` — Algorithm describes `db.delete(pick_list)` and `db.flush()` but doesn't explicitly mention that Flask-SQLAlchemy automatically commits the transaction on successful API response or rolls back on exception.
**Why it matters:** While the pattern is correct (matching kit_service.py:518-526), the algorithm doesn't explicitly state the commit/rollback mechanism. A developer unfamiliar with Flask-SQLAlchemy might assume manual commit is needed.
**Fix suggestion:** In section 5, after step 11 ("API handler returns (\"\", 204) on success"), add step: "12. Flask-SQLAlchemy commits transaction automatically on successful response (or rolls back if exception raised)." In section 7, after "API layer commits on success or rolls back on exception," add evidence reference to Flask-SQLAlchemy documentation or CLAUDE.md.
**Confidence:** High — This is a documentation clarity issue, not a correctness problem. The implementation pattern is sound.

---

**Minor — Reservation freeing side effect not prominent in algorithm**
**Evidence:** `plan.md:197-202` — Section 6 correctly identifies that "Reserved quantities reflect current OPEN lines. After deletion, lines no longer count toward reservations." However, section 5 algorithm (plan.md:155-167) doesn't mention this as an explicit step or consequence.
**Why it matters:** When an OPEN pick list is deleted, locations are freed up for new pick list allocations. This is a significant behavioral consequence that affects inventory planning. While section 6 captures the invariant, the algorithm walkthrough doesn't highlight this side effect.
**Fix suggestion:** In section 5, after step 10 ("QuantityHistory records remain in database"), add: "11. OPEN lines are removed, freeing up reserved quantities for future pick list allocation (per _load_open_line_reservations logic in kit_pick_list_service.py:451-475)."
**Confidence:** Medium — This is primarily a documentation clarity issue. The behavior is correct (cascade deletion removes lines from `_load_open_line_reservations` queries), but making it explicit would improve understanding.

---

**Minor — API blueprint registration location not explicit**
**Evidence:** `plan.md:108-111, 140-148` — Section 2 says "Add HTTP DELETE endpoint for `/api/pick-lists/<pick_list_id>` route" and section 4 defines the API surface, but neither explicitly states that the endpoint will be added to the existing `pick_lists_bp` blueprint in `app/api/pick_lists.py`.
**Why it matters:** For implementation clarity, it's helpful to explicitly state where the new route decorator goes. While this is obvious from context (app/api/pick_lists.py:19 shows `pick_lists_bp = Blueprint("pick_lists", __name__)`), being explicit reduces ambiguity.
**Fix suggestion:** In section 2, change "Area: `app/api/pick_lists.py` (pick_lists_bp blueprint)" to include evidence like "Evidence: app/api/pick_lists.py:19-136 — Blueprint `pick_lists_bp` exists with create/list/detail/pick/undo routes; add DELETE route here."
**Confidence:** Low — This is a trivial documentation nit. The implementation location is unambiguous from existing code structure.

---

- Checks attempted: Derived state corruption (badge counts, line counts, reservation totals), transaction safety (missing flush, orphaned lines), cascade failure modes, QuantityHistory orphaning vs. audit trail requirements, metrics inconsistency, test coverage gaps (missing cascade validation, missing 404 handling), status restriction business logic (should COMPLETED pick lists be undeletable?), DI wiring gaps.
- Evidence: plan.md:16-21 (cascade relationships verified in models), plan.md:177-203 (derived state invariants documented), plan.md:207-212 (transaction scope clear), plan.md:216-238 (error handling comprehensive), plan.md:243-252 (metrics pattern justified), plan.md:280-306 (test coverage thorough), app/models/kit_pick_list.py:70-76, app/models/kit_pick_list_line.py:60-61,83-86, app/services/kit_service.py:518-526.
- Why the plan holds: Cascade relationships are correctly configured in the database schema (verified in codebase). SQLAlchemy will handle orphan deletion atomically within the transaction. QuantityHistory preservation via SET NULL is by design (audit trail maintained). No status restriction is consistent with kit delete behavior (app/services/kit_service.py:518-526 has no status check). Badge counts are derived on-demand (app/services/kit_service.py:75-82), so deletion naturally updates counts on next query. Reservation totals are computed from OPEN lines only (app/services/kit_pick_list_service.py:451-475), so deletion automatically frees reservations. Test plan explicitly covers cascade behavior (plan.md:286-288) and 404 handling (plan.md:288, 300). No metrics is an established pattern across all delete endpoints (verified in type_service.py:51-63, box_service.py:124-141, seller_service.py:93-117, part_service.py:128-142).

---

## 6) Derived-Value & Persistence Invariants (stacked entries)

- Derived value: Pick list badge counts on kits
  - Source dataset: Unfiltered KitPickList records with status != COMPLETED (app/services/kit_service.py:75-82)
  - Write / cleanup triggered: Badge counts derived on-demand in list_kits() query. No persistent writes. Deleting pick list updates badge count on next query.
  - Guards: Badge computation filters by status, not by existence of lines. Deletion removes entire pick list row, so it naturally falls out of badge query.
  - Invariant: Badge counts always reflect existing non-completed pick lists. After deletion, count decreases by 1 if deleted pick list was OPEN.
  - Evidence: plan.md:179-185, app/services/kit_service.py:75-82

---

- Derived value: Pick list line counts and aggregates (line_count, open_line_count, completed_line_count)
  - Source dataset: Filtered view of lines relationship on KitPickList model (app/models/kit_pick_list.py:99-128)
  - Write / cleanup triggered: No persistent writes. Properties computed on-demand from lines relationship. Deletion removes pick list and cascades to lines.
  - Guards: Properties are request-scoped and computed from relationship. Cascade="all, delete-orphan" ensures lines are deleted when parent is deleted.
  - Invariant: Line counts always computed from current lines. After deletion, pick list and lines no longer exist, so properties are never accessed.
  - Evidence: plan.md:188-194, app/models/kit_pick_list.py:99-128,70-76

---

- Derived value: Reserved quantities from open pick list lines
  - Source dataset: Filtered aggregation of OPEN lines (app/services/kit_pick_list_service.py:451-475) — filters by status == OPEN
  - Write / cleanup triggered: No persistent writes. Computed during pick list creation to avoid double-allocating inventory. Deletion removes lines, freeing up reserved quantities.
  - Guards: Reservation computation runs at creation time, not deletion time. Query filters by status == OPEN and sums quantity_to_pick per location. Cascade deletion ensures OPEN lines are removed, so they no longer appear in future reservation queries.
  - Invariant: Reserved quantities reflect current OPEN lines. After deletion, lines no longer exist in database, so they no longer contribute to reservation totals in future pick list creation.
  - Evidence: plan.md:197-202, app/services/kit_pick_list_service.py:451-475, app/models/kit_pick_list_line.py:59-62

---

## 7) Risks & Mitigations (top 3)

- Risk: Users accidentally delete pick lists with completed lines expecting inventory to be restored
- Mitigation: Plan documents clearly that deletion does NOT undo inventory deductions (plan.md:82-86, 234-238, 276). Frontend should display warning when deleting pick lists with completed lines. Users should explicitly undo picked lines before deletion if they want to restore inventory. The plan explicitly recommends frontend warning in section 12.
- Evidence: plan.md:234-238, 325-327

---

- Risk: Cascade deletion fails due to misconfigured relationships, leaving orphaned line records
- Mitigation: Plan verifies cascade relationships are correct in models (plan.md:16, 130-132). Codebase inspection confirms app/models/kit_pick_list.py:70-76 has `cascade="all, delete-orphan"` and app/models/kit_pick_list_line.py:60-61 has `ondelete="CASCADE"`. Test plan includes explicit scenario to verify cascade behavior (plan.md:286).
- Evidence: plan.md:319-321, app/models/kit_pick_list.py:70-76, app/models/kit_pick_list_line.py:60-61

---

- Risk: Deleting pick list orphans QuantityHistory records with no referencing pick list lines
- Mitigation: This is by design. SET NULL on inventory_change_id preserves audit trail while allowing deletion (plan.md:38-41, 131). QuantityHistory timestamp and part/location information remain for audit purposes. The plan acknowledges this risk and accepts it as consistent with audit trail requirements. If stronger linkage is needed, it can be addressed in future iteration.
- Evidence: plan.md:331-333

---

## 8) Confidence

Confidence: High — The plan demonstrates thorough research, follows established patterns consistently, correctly identifies cascade relationships in the codebase, and includes comprehensive test coverage. The decision to preserve QuantityHistory records maintains audit trails appropriately. The explicit documentation of inventory non-reversal addresses the primary UX risk with appropriate mitigation (frontend warnings). The only findings are minor documentation clarity improvements, not correctness issues.
