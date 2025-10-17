**Summary & Decision**
The plan captures schema, service, API, and test work for kit detail, but it leaves key runtime risks unresolved (transaction rollback, per-row quantity queries, and missing metrics coverage). **Decision: GO-WITH-CONDITIONS** — address rollback handling, collapse the N+1 inventory lookup, and commit to metrics instrumentation before implementation.

**Conformance & Fit**
- **Product brief scope — Pass**: Detail flow mirrors the epic’s availability math and CRUD endpoints (“`get_kit_detail` computes required/available/shortfall and hydrates related chips” docs/features/kit_detail_bom_management/plan.md:46-51; cf. “`KitService.get_kit_detail` composes aggregates…`GET /kits/<int:kit_id>` returns detail schema” docs/epics/kits_feature_breakdown.md:60-66,76-84).
- **Plan template compliance — Pass**: Targets and phased steps match the planning checklist (“## Target files … Tests: extend … add …” docs/features/kit_detail_bom_management/plan.md:5-15; aligns with docs/commands/plan_feature.md:1-24).
- **Agent responsibilities/tests — Pass**: Test matrix covers services, APIs, migrations, and dataset loaders (“Service tests … API tests … Seed loader tests …” docs/features/kit_detail_bom_management/plan.md:95-103) per AGENTS.md expectations around comprehensive coverage AGENTS.md:120-154.
- **Layering rules — Pass**: Business logic stays in services while APIs delegate (“Inject both `inventory_service` and `kit_reservation_service` into `kit_service`… add routes in `app/api/kits.py`” docs/features/kit_detail_bom_management/plan.md:42-63,82-92), matching the layered architecture rules in AGENTS.md:18-52.
- **Fit with codebase**: Plan hooks the new work into existing modules such as `KitService`, `ServiceContainer`, and schema files (docs/features/kit_detail_bom_management/plan.md:42-55,70-87), aligning with current implementations in app/services/kit_service.py and app/services/container.py.

**Open Questions & Ambiguities**
- `KitContentDetailSchema` should mirror shopping list line projections by reusing `PartListSchema` (app/schemas/shopping_list_line.py:143-170; app/schemas/part.py:365-382) while keeping an explicit `part_id`; plan must call this out so implementation loads `KitContent.part` via `selectinload` and surfaces `key`, `manufacturer_code`, `description`, and computed `total_quantity`—no additional part fields needed unless the UI requests them later.
- The plan calls `_record_detail_metric()` “if metrics need to track detail views” (docs/features/kit_detail_bom_management/plan.md:66); do we expect mandatory metrics for detail fetches and BOM mutations, or can we defer?
- Detail response bundles shopping list and pick list chips now (docs/features/kit_detail_bom_management/plan.md:71-76); should these blocks be populated in this milestone or stubbed until their respective epics land?

**Deterministic Backend Coverage**
- `GET /kits/<kit_id>` detail — Scenarios: planned in `tests/api/test_kits_api.py` with computed field verification (docs/features/kit_detail_bom_management/plan.md:98-101); Instrumentation: none defined (**Major**); Persistence: read-only access via eager loads (docs/features/kit_detail_bom_management/plan.md:46-51).
- Kit content `POST` / `PATCH` / `DELETE` — Scenarios: service and API tests listed for happy paths, duplicates, optimistic locking, and archived guards (docs/features/kit_detail_bom_management/plan.md:95-103); Instrumentation: no counters or timers (**Major**); Persistence hooks: `_touch_kit` and flush coverage noted (docs/features/kit_detail_bom_management/plan.md:52-63) but rollback handling missing (see A1).
- `KitReservationService.get_reserved_totals_for_parts` — Scenarios: dedicated service tests promised (docs/features/kit_detail_bom_management/plan.md:95-99); Instrumentation: none (**Major**); Persistence: read-only aggregate query (docs/features/kit_detail_bom_management/plan.md:37-40).
- Test data loader `load_kit_contents` — Scenarios: regression via `tests/test_test_data_service.py` (docs/features/kit_detail_bom_management/plan.md:102-103); Instrumentation: N/A; Persistence: ordering guarded so dependent fixtures exist (docs/features/kit_detail_bom_management/plan.md:13-14,94-100).

**Adversarial Sweep**
- [A1] Major — Missing session rollback on duplicate kit content  
  **Evidence:** “rely on unique constraint by flushing and catch `IntegrityError`, raising `ResourceConflictException`” docs/features/kit_detail_bom_management/plan.md:52-55 lacks rollback; contrast with existing pattern resetting the session before raising (app/services/kit_service.py:110-117).  
  **Why it matters:** Without `self.db.rollback()`, the session stays in error state, so subsequent writes in the same request will raise `PendingRollbackError`.  
  **Fix suggestion:** Do what `ShoppingListService.create_list` already does—wrap the flush, call `self.db.rollback()` in the `IntegrityError` handler, then raise the conflict (app/services/shopping_list_service.py:30-38).  
  **Confidence:** High.
- [A2] Major — Kit detail availability triggers N+1 inventory queries  
  **Evidence:** “Calculate in-stock totals … calling `inventory_service.calculate_total_quantity(key)` (cache results in dict…)” docs/features/kit_detail_bom_management/plan.md:49; each call runs its own query (app/services/inventory_service.py:280-288).  
  **Why it matters:** A kit with dozens of parts will execute one query per distinct part key, leading to latency spikes and DB load.  
  **Fix suggestion:** Plan a batched query (e.g., join/group once across all part IDs) or extend InventoryService with a bulk API.  
  **Confidence:** High.
- [A3] Major — No metrics plan for kit detail or BOM mutations  
  **Evidence:** Metrics mention is only optional (“`_record_detail_metric()` if metrics need to track detail views (optional…)” docs/features/kit_detail_bom_management/plan.md:63-66) despite guidance to wire new features into Prometheus (AGENTS.md:256-270).  
  **Why it matters:** Without counters/timers for detail fetches and mutations we lose observability into critical kit workflows, violating the metrics integration standard.  
  **Fix suggestion:** Commit to concrete MetricsService updates (e.g., counters for detail views and content changes) and call them in the new service methods.  
  **Confidence:** Medium.

**Derived-Value & Persistence Invariants**
none; plan’s derived quantities (`total_required`, `available`, `shortfall`) are computed solely for response serialization and never drive writes or cleanup (docs/features/kit_detail_bom_management/plan.md:47-51), so no persistence invariants arise.

**Risks & Mitigations**
- Transaction handling risk: add explicit rollbacks on BOM mutation errors before coding (docs/features/kit_detail_bom_management/plan.md:52-55; app/services/kit_service.py:110-117).
- Performance risk: replace per-part stock lookups with a single aggregate to keep kit detail latency bounded (docs/features/kit_detail_bom_management/plan.md:49; app/services/inventory_service.py:280-288).
- Observability gap: specify MetricsService counters/timers for detail requests and BOM changes to satisfy monitoring guidance (docs/features/kit_detail_bom_management/plan.md:63-66; AGENTS.md:256-270).

**Confidence**
Medium — reviewed plan against current service code and guidelines, but outstanding clarifications (metrics scope, response shape) plus unresolved performance work leave uncertainty until those fixes are incorporated.
