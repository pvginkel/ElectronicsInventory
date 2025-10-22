### 1) Summary & Decision
**Readiness**
Core schema and service updates are outlined, but dependent service coverage, database regression tests, and fixed data updates are missing, so confidence in downstream behaviour is low.

**Decision**
`GO-WITH-CONDITIONS` — Missing coverage for reservation/shopping-list services and lack of test-data + DB-constraint validation (docs/features/build_target_min_zero/plan.md:46-52,136-162) keep risk high.

### 2) Conformance & Fit
<plan_conformance_fit_template>
**Conformance to refs**
- Electronics Inventory Backend Guidelines — Fail — docs/features/build_target_min_zero/plan.md:136-152 — Test plan marks “Gaps: None” yet omits service-level coverage for reservations and shopping-list flows.
- docs/commands/review_plan.md (persistence hooks) — Fail — docs/features/build_target_min_zero/plan.md:154-162 — Implementation slices skip the fixed test dataset update mandated for schema changes.
- docs/commands/review_plan.md (DB validation) — Fail — docs/features/build_target_min_zero/plan.md:32-38,136-152 — No commitment to add/adjust database constraint tests for the relaxed check.

**Fit with codebase**
- `KitReservationService` — docs/features/build_target_min_zero/plan.md:6 — assumes the cache “tolerates zero” without scheduling regression tests against `tests/services/test_kit_reservation_service.py`.
- `KitShoppingListService` — docs/features/build_target_min_zero/plan.md:5,137-152 — risk is acknowledged but no coverage ensures the defaulted units path behaves as expected after the constraint change.
</plan_conformance_fit_template>

### 3) Open Questions & Ambiguities
<open_question_template>
- Question: Which seed kit (or new entry) in `app/data/test_data/kits.json` should represent the zero build-target case?
- Why it matters: Without a fixed-data example, integration tests and manual QA won’t exercise the new minimum.
- Needed answer: Identify or add a kit in the dataset to cover the zero edge case and document the choice.
</open_question_template>

### 4) Deterministic Backend Coverage (new/changed behavior only)
<plan_coverage_template>
- Behavior: KitService create/update build target guards
  - Scenarios:
    - Given payload `build_target=0`, When `create_kit`, Then persists + metrics (`tests/services/test_kit_service.py::...` to be added).
    - Given kit with `build_target=1`, When PATCH `{build_target: 0}`, Then response shows zero.
  - Instrumentation: `metrics_service.record_kit_created()` already invoked.
  - Persistence hooks: Alembic constraint change + ORM metadata update.
  - Gaps: None if planned tests land.
  - Evidence: docs/features/build_target_min_zero/plan.md:137-149.
- Behavior: KitReservationService reservation aggregation
  - Scenarios:
    - Given kit `build_target=0`, When aggregating reservations, Then totals return 0 and include the kit in listings.
    - Given updated kit moving between 0 and positive, When fetching reservations, Then cache reflects latest value.
  - Instrumentation: None beyond existing logging.
  - Persistence hooks: Live query; no additional hooks.
  - Gaps: Major — no new tests planned despite behaviour change.
  - Evidence: docs/features/build_target_min_zero/plan.md:6,137-149.
- Behavior: KitShoppingListService push workflow (defaulted units)
  - Scenarios:
    - Given kit `build_target=0` with omitted `units`, When pushing, Then service responds per design (currently expected to raise) and metrics are recorded.
    - Given explicit positive `units`, When pushing, Then link succeeds and requested units persist.
  - Instrumentation: `record_kit_shopping_list_push`.
  - Persistence hooks: Link row writes `requested_units`.
  - Gaps: Major — plan has no tests for zero-target edge cases.
  - Evidence: docs/features/build_target_min_zero/plan.md:5,137-152.
- Behavior: Database check constraint for `kits.build_target`
  - Scenarios:
    - Given direct insert with `build_target=-1`, When committing, Then DB raises constraint error.
    - Given direct insert with `build_target=0`, When committing, Then success.
  - Instrumentation: None.
  - Persistence hooks: Alembic migration.
  - Gaps: Major — no database-level test coverage is planned.
  - Evidence: docs/features/build_target_min_zero/plan.md:32-38,137-152.
</plan_coverage_template>

### 5) Adversarial Sweep (must find ≥3 credible issues or declare why none exist)
<finding_template>
**Major — Missing KitReservationService regression tests**
**Evidence:** docs/features/build_target_min_zero/plan.md:6 — “reservation math multiplies by `build_target`”; docs/features/build_target_min_zero/plan.md:136-152 — test plan lists only KitService/API with “Gaps: None.”
**Why it matters:** Reservation totals depend on the relaxed constraint; without tests the cache could return stale or negative numbers after updates.
**Fix suggestion:** Add explicit reservation-service scenarios covering zero targets and transitions between zero and positive.
**Confidence:** High
</finding_template>
<finding_template>
**Major — Shopping-list service edge-case coverage missing**
**Evidence:** docs/features/build_target_min_zero/plan.md:5 — risk called out for shopping-list pushes; docs/features/build_target_min_zero/plan.md:136-152 — no tests planned despite risk.
**Why it matters:** Without tests the defaulted-units path may regress (error handling or metrics) once zero targets exist.
**Fix suggestion:** Plan for service-level tests asserting both the zero-default behaviour and explicit positive-unit success.
**Confidence:** High
</finding_template>
<finding_template>
**Major — Persistence hooks ignore test data update**
**Evidence:** docs/features/build_target_min_zero/plan.md:154-162 — implementation slices omit dataset refresh; docs/commands/review_plan.md:63 — coverage requires “migrations/test data/DI wiring.”
**Why it matters:** Fixed dataset lacks zero-target kit, so manual and integration flows won’t exercise the new minimum, weakening regression safety.
**Fix suggestion:** Include test-data update (e.g., add kit with `build_target=0`) and document validation.
**Confidence:** Medium
</finding_template>
<finding_template>
**Major — Database constraint regression test omitted**
**Evidence:** docs/features/build_target_min_zero/plan.md:32-38 — constraint change identified; docs/features/build_target_min_zero/plan.md:136-152 — test plan lacks DB constraint coverage.
**Why it matters:** Without a dedicated test, the Alembic revision could drift (or omit downgrade) without detection, undermining schema enforcement.
**Fix suggestion:** Add plan step to update `tests/test_database_constraints.py` (or equivalent) to assert zero passes and negatives fail.
**Confidence:** Medium
</finding_template>

### 6) Derived-Value & Persistence Invariants (stacked entries)
<derived_value_template>
- Derived value: Shopping-list `requested_units`
  - Source dataset: UI `units` field; defaults to `kit.build_target`.
  - Write / cleanup triggered: `_create_or_append_list` writes link + lines.
  - Guards: Service enforces `requested_units >= 1`.
  - Invariant: Zero-target kits must still exercise the guard without breaking metrics or link persistence.
  - Evidence: docs/features/build_target_min_zero/plan.md:5,137-152; app/services/kit_shopping_list_service.py:223-260.
</derived_value_template>
<derived_value_template>
- Derived value: KitReservationUsage.reserved_quantity
  - Source dataset: `(KitContent.required_per_unit * Kit.build_target)`.
  - Write / cleanup triggered: Cached in `KitReservationService._ensure_usage_cache`.
  - Guards: Filtered to active kits; no clamp to ≥0.
  - Invariant: When build target is zero, cached entries must remain consistent (0) without dropping kit rows.
  - Evidence: docs/features/build_target_min_zero/plan.md:6; app/services/kit_reservation_service.py:136-178.
</derived_value_template>
<derived_value_template>
- Derived value: Kit content total required quantities
  - Source dataset: `required_per_unit * kit.build_target` during kit detail hydration.
  - Write / cleanup triggered: Stored on kit content responses/metrics.
  - Guards: None besides new non-negative build target validation.
  - Invariant: Totals should emit 0 (not negative) when build target is zero; tests must confirm.
  - Evidence: docs/features/build_target_min_zero/plan.md:118-122; app/services/kit_service.py:182-184.
</derived_value_template>

### 7) Risks & Mitigations (top 3)
<risk_template>
- Risk: Reservation totals regress due to missing tests.
- Mitigation: Add reservation-service unit tests covering zero-target scenarios.
- Evidence: docs/features/build_target_min_zero/plan.md:6,136-152.
</risk_template>
<risk_template>
- Risk: Shopping-list push workflow behaviour drifts without zero-target coverage.
- Mitigation: Add targeted service tests for defaulted units and explicit units.
- Evidence: docs/features/build_target_min_zero/plan.md:5,137-152.
</risk_template>
<risk_template>
- Risk: Fixed test dataset lacks zero-target kits, leaving QA blind to new edge case.
- Mitigation: Update `app/data/test_data/kits.json` (or equivalent) and validate via `load-test-data`.
- Evidence: docs/features/build_target_min_zero/plan.md:154-162.
</risk_template>

### 8) Confidence
<confidence_template>Confidence: Low — Until service coverage, DB regression tests, and dataset updates are planned, downstream correctness stays uncertain.</confidence_template>
