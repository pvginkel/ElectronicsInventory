# Kit Delete Endpoint — Plan Review

## 1) Summary & Decision

**Readiness**

The plan is comprehensive, well-researched, and follows established patterns in the codebase. It correctly identifies the cascade relationships, service/API layering, error handling, and test requirements. The research log demonstrates thorough investigation of existing patterns and explicit decisions about metrics and business constraints. Post-review code research confirms all critical assumptions: multi-level cascade configuration is correct (Kit → KitPickList → KitPickListLine), and reservations are computed values that require no cleanup. The only remaining improvement is to add explicit assertion guidance to test scenarios.

**Decision**

`GO` — The plan is implementation-ready. All critical assumptions have been verified through code research. The multi-level cascade configuration is correct, reservations are computed (not stored), and the design follows established codebase patterns. The minor issue regarding test assertion detail is a documentation enhancement that doesn't block implementation.

---

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `docs/commands/plan_feature.md` — Pass — plan.md:1-306 — All required sections present with proper template usage, evidence citations, and technical detail.
- `CLAUDE.md` (layering) — Pass — plan.md:76-85 — Correctly separates service logic (KitService.delete_kit) from API layer (DELETE endpoint), no HTTP in service, no business logic in API.
- `CLAUDE.md` (testing requirements) — Pass — plan.md:243-265 — Comprehensive service and API test coverage planned with Given/When/Then scenarios.
- `CLAUDE.md` (error handling) — Pass — plan.md:188-203 — Uses RecordNotFoundException pattern consistent with existing service methods (kit_service.py:524-529).
- `CLAUDE.md` (transaction management) — Pass — plan.md:180-185 — Relies on Flask-SQLAlchemy automatic commit/rollback, uses db.flush() to execute deletion within transaction.
- `docs/product_brief.md` — Pass — plan.md:229-231 — Acknowledges single-user context, no authentication needed.

**Fit with codebase**

- `app/services/kit_service.py` — plan.md:76-78 — Assumes BaseService pattern with self.db session; matches existing archive/unarchive methods in same service.
- `app/api/kits.py` — plan.md:82-84 — Blueprint already exists with archive/unarchive routes; DELETE endpoint follows established pattern at kits.py:416-453.
- Cascade relationships — plan.md:14-19, 103-109 — Kit model cascade configuration verified for direct children (contents, pick_lists, shopping_list_links); evidence provided for ondelete="CASCADE" on foreign keys.
- Metrics pattern — plan.md:27, 208-215 — Explicit decision to omit metrics matches all other delete operations (shopping_list, part, box, type, seller); consistent with existing codebase philosophy.
- Dependency injection — plan.md:132 — Assumes kit_service already wired in ServiceContainer; reasonable since archive/unarchive endpoints already use it.

---

## 3) Open Questions & Ambiguities

No open questions remain. Both ambiguities identified during initial review have been resolved through code research:

**RESOLVED: Multi-level cascade configuration**
- Evidence: app/models/kit_pick_list_line.py:59-62 — `pick_list_id: Mapped[int] = mapped_column(ForeignKey("kit_pick_lists.id", ondelete="CASCADE"), nullable=False)`
- Conclusion: The multi-level cascade (Kit → KitPickList → KitPickListLine) is correctly configured. Deleting a kit will cascade through pick lists to pick list lines automatically.

**RESOLVED: Reservation persistence**
- Evidence: app/services/kit_reservation_service.py:1 — "Service for calculating reserved kit quantities for parts"; lines 130-153 compute reservations on-the-fly from Kit and KitContent tables via query join; KitReservationUsage is a dataclass (lines 20-31), not a database model; no reservation table exists in app/models/
- Conclusion: Reservations are computed values, not stored records. Deleting a kit removes it from the source tables (Kit, KitContent), so reservation queries automatically exclude the deleted kit. No orphaned reservation data is possible.

---

## 4) Deterministic Backend Coverage (new/changed behavior only)

- Behavior: KitService.delete_kit(kit_id: int) -> None
- Scenarios:
  - Given a kit exists, When delete_kit is called with valid kit_id, Then kit is removed from database (`tests/services/test_kit_service.py::test_delete_kit_success`)
  - Given a kit exists with contents, When delete_kit is called, Then kit and all contents are removed (`tests/services/test_kit_service.py::test_delete_kit_with_contents_cascade`)
  - Given a kit exists with pick lists and lines, When delete_kit is called, Then kit, all pick lists, and all pick list lines are removed (`tests/services/test_kit_service.py::test_delete_kit_with_pick_lists_cascade`)
  - Given a kit exists with shopping list links, When delete_kit is called, Then kit and all links are removed (`tests/services/test_kit_service.py::test_delete_kit_with_shopping_list_links_cascade`)
  - Given an active kit exists, When delete_kit is called, Then kit is removed regardless of status (`tests/services/test_kit_service.py::test_delete_kit_active_status`)
  - Given an archived kit exists, When delete_kit is called, Then kit is removed regardless of status (`tests/services/test_kit_service.py::test_delete_kit_archived_status`)
  - Given kit_id does not exist, When delete_kit is called, Then RecordNotFoundException is raised (`tests/services/test_kit_service.py::test_delete_kit_not_found`)
- Instrumentation: None per plan.md:208-215 (consistent with other delete operations)
- Persistence hooks: No schema changes, no migration needed (plan.md:103), no test data updates required (delete operation doesn't add new fields)
- Gaps: Test scenarios specify outcomes ("Then kit and all contents are removed") but don't explicitly state assertion methods. Should verify with `session.get(Kit, kit_id)` returns None and child queries return empty results.
- Evidence: plan.md:243-254

---

- Behavior: DELETE /api/kits/<int:kit_id>
- Scenarios:
  - Given a kit exists, When DELETE /api/kits/<kit_id> is called, Then HTTP 204 is returned and kit is deleted from database (`tests/api/test_kits_api.py::test_delete_kit_success`)
  - Given kit_id does not exist, When DELETE /api/kits/<kit_id> is called, Then HTTP 404 is returned with ErrorResponseSchema body (`tests/api/test_kits_api.py::test_delete_kit_not_found`)
  - Given a kit with child records, When DELETE is called, Then HTTP 204 is returned and all records are removed (`tests/api/test_kits_api.py::test_delete_kit_with_children_cascade`)
- Instrumentation: None per plan.md:208-215
- Persistence hooks: Blueprint already registered (kits_bp exists at kits.py:39-454), service already wired (used by archive/unarchive)
- Gaps: API test for cascade (third scenario) should verify cascade occurred by querying for child records after deletion, not just checking HTTP 204.
- Evidence: plan.md:258-265

---

## 5) Adversarial Sweep

**Resolved — Multi-level cascade configuration verified**
- Checks attempted: Verify KitPickList → KitPickListLine cascade configuration
- Evidence: app/models/kit_pick_list_line.py:59-62 shows `ForeignKey("kit_pick_lists.id", ondelete="CASCADE")`
- Why the plan holds: Complete cascade chain exists (Kit → KitPickList → KitPickListLine), deletion will automatically clean up all three levels

---

**Resolved — Reservation persistence verified as computed-only**
- Checks attempted: Check for stored reservation records that might orphan when kits are deleted
- Evidence: app/services/kit_reservation_service.py:1, 130-153 shows reservations computed on-the-fly from Kit/KitContent query joins; KitReservationUsage is a dataclass (lines 20-31), not a database model; no reservation table exists
- Why the plan holds: Reservations are derived values; deleting a kit removes source data, so reservation queries automatically exclude deleted kits

---

**Minor — Test scenarios lack assertion detail**
**Evidence:** plan.md:247 — "Then kit and all contents are removed" + plan.md:248 — "Then kit and all pick lists (and lines) are removed"
**Why it matters:** Test scenarios specify expected outcomes but don't detail HOW to verify those outcomes. Without explicit assertion guidance, tests might only check for "no exception raised" rather than actually querying the database to confirm records were deleted.
**Fix suggestion:** Enhance test plan scenarios to specify assertion methods, e.g., "Then kit is removed (assert session.get(Kit, kit_id) is None) and all contents are removed (assert session.query(KitContent).filter_by(kit_id=kit_id).count() == 0)."
**Confidence:** High — Tests should be deterministic and verifiable; current scenarios leave verification method ambiguous.

---

## 6) Derived-Value & Persistence Invariants

- Derived value: Kit shopping list badge counts
  - Source dataset: Unfiltered KitShoppingListLink records joined to kits query (plan.md:62-73, 152)
  - Write / cleanup triggered: None — badge counts computed on-demand in list_kits() query; deletion cascades link records before any badge query runs
  - Guards: SQLAlchemy cascade relationships (ondelete="CASCADE" at kit_shopping_list_link.py:32)
  - Invariant: Badge counts always reflect existing KitShoppingListLink records; after kit deletion, no links exist so badges become moot
  - Evidence: plan.md:151-156

---

- Derived value: Kit pick list badge counts
  - Source dataset: Filtered KitPickList records (status != COMPLETED) joined to kits query (plan.md:75-82, 160)
  - Write / cleanup triggered: None — badge counts computed on-demand; deletion cascades pick lists automatically
  - Guards: SQLAlchemy cascade relationships (ondelete="CASCADE" at kit_pick_list.py:34)
  - Invariant: Badge counts always match non-completed pick lists for existing kits; after kit deletion, no pick lists remain so badge query returns zero
  - Evidence: plan.md:159-165

---

- Derived value: Kit content availability calculations (total_required, shortfall, etc.)
  - Source dataset: Unfiltered kit.contents relationship joined with inventory and computed reservations (plan.md:169-174)
  - Write / cleanup triggered: None — availability calculated request-scoped in get_kit_detail(); deletion removes kit and cascades contents
  - Guards: No guards needed; computed values are transient; cascade handles content cleanup
  - Invariant: Availability always computed from current kit contents; after kit deletion, no contents exist so calculation becomes moot
  - Evidence: plan.md:169-174, app/services/kit_service.py:164-201

---

All three derived values are computed (not stored), so deletion does not corrupt persistent state. No filtered views drive persistent writes. Cascade relationships ensure child records are cleaned up atomically with parent kit.

---

## 7) Risks & Mitigations (top 3)

- Risk: Users accidentally delete kits they intended to archive, causing permanent data loss without undo mechanism
- Mitigation: Document that deletion is permanent (plan.md:287); frontend should implement confirmation dialog (out of scope for backend); archive workflow already exists for reversible removal
- Evidence: plan.md:285-288

---

- Risk: No audit trail for deletions makes it impossible to diagnose "where did my kit go?" issues or track deletion frequency
- Mitigation: Accepted as consistent with other delete endpoints (shopping_list, part, box, type, seller all have no metrics per plan.md:208-215); if audit trail becomes necessary, add metrics in future iteration following existing lifecycle metrics pattern
- Evidence: plan.md:291-294

---

- Risk: Test scenarios don't specify assertion methods, potentially leading to tests that pass without actually verifying deletion occurred
- Mitigation: Add explicit assertion guidance to test implementations (e.g., verify None returned from session.get(), count queries return 0 for child records)
- Evidence: plan.md:247-248 (outcomes specified but verification methods not detailed)

---

## 8) Confidence

Confidence: High — The plan is thorough, well-researched, and follows established codebase patterns. Post-review code research has verified all critical assumptions: multi-level cascade configuration is correct (app/models/kit_pick_list_line.py:60 has ondelete="CASCADE"), and reservations are computed values (app/services/kit_reservation_service.py computes them on-the-fly from Kit/KitContent queries). The core design (service method, API endpoint, cascade deletion, error handling, test coverage) is sound and implementation-ready. This is a straightforward, low-risk feature addition following proven patterns from other delete operations in the codebase.
