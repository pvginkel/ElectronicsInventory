### 0) Research Log & Findings
- Confirmed epic requirements around reservation math, validations, and the debug endpoint in docs/epics/kits_feature_breakdown.md:166-195.
- Inspected KitReservationService to see it only returns aggregated totals per part and lacks per-kit usage helpers or caching (app/services/kit_reservation_service.py:21-70).
- Reviewed KitService.get_kit_detail for how it computes reserved/available/shortfall per KitContent (app/services/kit_service.py:111-190).
- Analyzed KitShoppingListService shortage calculation and concept/archived guards which currently rely on the reservation service totals (app/services/kit_shopping_list_service.py:185-305).
- Surveyed kit API endpoints and tests that expect reserved fields and enforce archived/read-only behavior (app/api/kits.py:52-299; tests/api/test_kits_api.py:320-358).
- Verified existing database constraints guaranteeing positive integers and uniqueness, noting the missing archived timestamp guard (app/models/kit.py:33-64; app/models/kit_content.py:32-64; app/models/kit_pick_list.py:32-62; app/models/kit_shopping_list_link.py:23-60).

### 1) Intent & Scope
**User intent**

Deliver backend support that centralizes reserved quantity math and validation so every kit workflow reads consistent availability data while surfacing tooling observability.

**Prompt quotes**

"Centralize validation, reservation math, and invariants so every surface reflects accurate availability without duplicating logic."
"Ensure integer-only inputs (`required_per_unit`, `build_target`, `order_units`, `requested_units`) and reject non-positive values."

**In scope**

- Extend `KitReservationService` with shared helpers, caching, and per-kit usage listings consumed by kit detail, shopping list, and tooling.
- Tighten kit, pick-list, and shopping-list flows to rely on the shared helpers and emit descriptive validation errors for duplicates and invalid integers.
- Add database-level guards so archived kits always carry an `archived_at` timestamp and keep schema/models in sync.
- Implement `GET /parts/<string:part_key>/kit-reservations` plus accompanying schemas and tests for debug visibility.

**Out of scope**

- Frontend UI changes (icons, tooltips, navigation).
- Introducing new storage layers (materialized views, Redis) for reservation caching.

**Assumptions / constraints**

Dependency injector continues to hand out request-scoped service instances for caching; existing data either already has `archived_at` for archived kits or can be backfilled during migration; Prometheus metrics remain the primary observability surface; system stays single-user with no additional auth gating.

### 2) Affected Areas & File Map
- Area: app/services/kit_reservation_service.py
- Why: Expand reservation queries with per-kit usage helpers and scoped caching so downstream services stop duplicating math.
- Evidence: app/services/kit_reservation_service.py:21-70

- Area: app/services/kit_service.py
- Why: Swap manual reservation math for the shared helpers and refine validation/duplicate handling when mutating kit contents.
- Evidence: app/services/kit_service.py:111-256

- Area: app/services/kit_shopping_list_service.py
- Why: Reuse the enhanced reservation APIs when computing shortages and ensure archived/concept guards surface consistent errors.
- Evidence: app/services/kit_shopping_list_service.py:185-305

- Area: app/services/kit_pick_list_service.py
- Why: Align requested-unit validation and reservation-aware allocations with the central helpers to satisfy integer-only rules.
- Evidence: app/services/kit_pick_list_service.py:24-279

- Area: app/models/kit.py
- Why: Add the archived timestamp check constraint and document the invariant alongside existing uniqueness/positive checks.
- Evidence: app/models/kit.py:33-64

- Area: alembic/versions/0xx_add_kit_archived_timestamp_constraint.py (new)
- Why: Apply the new `status != 'archived' OR archived_at IS NOT NULL` constraint and backfill archived rows.
- Evidence: docs/epics/kits_feature_breakdown.md:191-193

- Area: app/api/kits.py
- Why: Ensure kit detail and mutation endpoints rely on the updated services and keep error translation consistent.
- Evidence: app/api/kits.py:52-299

- Area: app/api/parts.py
- Why: Add the `GET /parts/<string:part_key>/kit-reservations` debug route and wire dependency-injected services.
- Evidence: app/api/parts.py:1-120

- Area: app/schemas/kit.py
- Why: Extend schemas with reservation payloads and computed fields surfaced by the shared service.
- Evidence: app/schemas/kit.py:312-455

- Area: app/schemas/kit_reservations.py (new)
- Why: House Pydantic models for per-part reservation listings returned by the debug endpoint.
- Evidence: docs/epics/kits_feature_breakdown.md:181-184

- Area: tests/services/test_kit_reservation_service.py
- Why: Cover new helper methods, exclusion logic, and error cases for reservation lookups.
- Evidence: tests/services/test_kit_reservation_service.py:11-54

- Area: tests/services/test_kit_service.py
- Why: Verify kit detail now uses shared helpers and that integer/duplicate validations raise the expected exceptions.
- Evidence: tests/services/test_kit_service.py:45-212

- Area: tests/services/test_kit_shopping_list_service.py
- Why: Assert shortage calculations honor the shared reservations and concept-only enforcement.
- Evidence: tests/services/test_kit_shopping_list_service.py:35-199

- Area: tests/services/test_kit_pick_list_service.py
- Why: Ensure requested-unit validation and allocation paths remain correct under the centralized math.
- Evidence: tests/services/test_kit_pick_list_service.py:138-208

- Area: tests/api/test_kits_api.py
- Why: Update kit detail expectations for reserved figures and archived protections driven by the service changes.
- Evidence: tests/api/test_kits_api.py:320-378

- Area: tests/test_parts_api.py
- Why: Add coverage for the new kit-reservation debug endpoint and its error handling using part keys.
- Evidence: tests/test_parts_api.py:1-160
 
- Area: tests/test_database_constraints.py
- Why: Assert archived kits must include `archived_at` once the new check constraint is applied.
- Evidence: tests/test_database_constraints.py:1-200

- Area: tests/services/conftest.py and kit fixtures
- Why: Update archived kit fixtures to assign `archived_at` so they pass the new constraint consistently.
- Evidence: tests/services/test_kit_shopping_list_service.py:173-191

- Area: app/data/test_data/kits.json
- Why: Ensure fixed dataset keeps `archived_at` populated for archived kits and add validation for missing timestamps.
- Evidence: app/data/test_data/kits.json

### 3) Data Model / Contracts
- Entity / contract: kits.status archival guard
- Shape: SQL check `status != 'archived' OR archived_at IS NOT NULL`; backfill sets `archived_at = now()` for existing archived rows.
- Refactor strategy: Update `Kit` model and generate Alembic migration; no API change because `archived_at` already optional but now guaranteed when status is archived.
- Evidence: docs/epics/kits_feature_breakdown.md:191-193; app/models/kit.py:33-64

- Entity / contract: Kit reservation aggregates
- Shape:
  ```json
  {
    "part_id": 42,
    "total_reserved": 7,
    "by_kit": [
      {"kit_id": 3, "kit_name": "Synth", "build_target": 2, "reserved_quantity": 4, "updated_at": "2024-05-01T12:00:00Z"}
    ]
  }
  ```
- Refactor strategy: Keep existing per-part total shape for callers that only read integers, but consolidate computation into a single service that can return both totals and per-kit breakdown without duplicating queries.
- Evidence: docs/epics/kits_feature_breakdown.md:172-180; app/services/kit_service.py:111-156

- Entity / contract: GET /parts/<string:part_key>/kit-reservations response
- Shape:
  ```json
  {
    "part_key": "ABCD",
    "active_reservations": [
      {"kit_id": 3, "kit_name": "Synth", "status": "active", "reserved_quantity": 4, "build_target": 2, "required_per_unit": 2, "updated_at": "2024-05-01T12:00:00Z"}
    ],
    "total_reserved": 4
  }
  ```
- Refactor strategy: New schema dedicated to the debug endpoint that accepts the existing part key identifier and uses `PartService.get_part` to load the model; no back-compat expectations because the route is new.
- Evidence: docs/epics/kits_feature_breakdown.md:181-184

### 4) API / Integration Surface
- Surface: GET /kits/<int:kit_id>
- Inputs: Path `kit_id`.
- Outputs: `KitDetailResponseSchema` with per-content `reserved`, `available`, `shortfall`, and badge fields fed by shared helpers.
- Errors: `404` when kit missing; `400/409` bubbled via `@handle_api_errors` for downstream validation failures.
- Evidence: app/api/kits.py:105-186; app/services/kit_service.py:111-190

- Surface: POST /kits/<int:kit_id>/contents
- Inputs: JSON `{part_id, required_per_unit, note?}` via `KitContentCreateSchema` (ge=1).
- Outputs: `KitContentDetailSchema` hydrated via refreshed detail payload so reserved math is current.
- Errors: `400` for non-positive integers, `404` if kit/part missing, `409` on duplicate parts.
- Evidence: app/api/kits.py:154-187; app/services/kit_service.py:204-255

- Surface: POST /kits/<int:kit_id>/shopping-lists
- Inputs: `KitShoppingListRequestSchema` fields (`units`, `honor_reserved`, list identifiers, note prefix).
- Outputs: `KitShoppingListLinkResponseSchema` summarizing link, updated list, total needed quantities.
- Errors: `409` when archived kit or non-concept list, `400` on invalid units or missing target list definition, `404` for missing kit/list.
- Evidence: app/api/kits.py:217-295; app/services/kit_shopping_list_service.py:185-305

- Surface: GET /parts/<string:part_key>/kit-reservations
- Inputs: Path `part_key`.
- Outputs: Reservation summary with `active_reservations` list (empty when the part has no active kits) and `total_reserved`.
- Errors: `404` when the part does not exist; `400` for malformed ids handled during request parsing.
- Evidence: docs/epics/kits_feature_breakdown.md:181-184; app/api/parts.py:1-120

### 5) Algorithms & State Machines
- Flow: Aggregate reserved totals for part sets
- Steps:
  1. Accept part ids plus optional `exclude_kit_id`.
  2. Run a grouped `select` joining `KitContent`→`Kit`, filtering `Kit.status == ACTIVE` and excluding the provided kit.
  3. Coalesce the sum of `required_per_unit * build_target` per part id and hydrate totals cache.
  4. Return per-part integers and (when requested) build a list of contributing kits.
- States / transitions: None (pure function).
- Hotspots: Query scales with number of relevant kit contents; ensure `IN` list stays reasonably small per request. Cache results within the service instance keyed by `(tuple(sorted(part_ids)), exclude_kit_id)` so different exclusion contexts do not collide.
- Evidence: app/services/kit_reservation_service.py:34-55

- Flow: Compute shopping list shortages with honor-reserved support
- Steps:
  1. Load active kit with contents and skip archived kits.
  2. Resolve target shopping list (existing concept list vs create new) and reject invalid states.
  3. Fetch reservation totals and in-stock quantities, adjust available counts when `honor_reserved` is true.
  4. Build `_NeededEntry` items for positive shortages, merge them into the list, and upsert the link metadata.
- States / transitions: Kit must stay in ACTIVE state throughout; list status must remain CONCEPT.
- Hotspots: Multiple service calls share the same session; avoid redundant queries by reusing cached reservation results.
- Evidence: app/services/kit_shopping_list_service.py:185-246

- Flow: Serve part reservation debug payload
- Steps:
  1. Validate part key via `PartService.get_part` and load part metadata (id, key, description).
  2. Use new reservation helper to list active kits consuming the part, excluding archived kits and optionally grouping by kit.
  3. Summarize totals and return structured schema data for tooling keyed by part key.
- States / transitions: None (read-only HTTP).
- Hotspots: Exposing potentially large lists—consider pagination or soft caps if usage grows.
- Evidence: docs/epics/kits_feature_breakdown.md:181-184; app/services/kit_reservation_service.py:21-70

### 6) Derived State & Invariants
- Derived value: KitContent.reserved / available / shortfall
  - Source: Reservation totals from `KitReservationService` combined with inventory counts per part key.
  - Writes / cleanup: Mutated in-memory `KitContent` attributes before schema serialization; no DB writes.
  - Guards: Clamp to non-negative using `max(..., 0)` and exclude the current kit via `exclude_kit_id`.
  - Invariant: `reserved` never includes the owning kit and `available + shortfall` equals `total_required`.
  - Evidence: app/services/kit_service.py:144-156

- Derived value: Shopping list needed quantity per kit content
  - Source: `_calculate_needed_entries` multiplies `required_per_unit` by requested units minus available stock (optionally minus reservations).
  - Writes / cleanup: Drives `merge_line_for_concept_list` which creates or increments shopping list lines.
  - Guards: Skip entries when shortage is zero; enforce concept list selection before writes.
  - Invariant: Added lines always reflect strictly positive `needed` amounts.
  - Evidence: app/services/kit_shopping_list_service.py:185-227

- Derived value: KitShoppingListLink.is_stale
  - Source: Compares `kit.updated_at` against `snapshot_kit_updated_at`.
  - Writes / cleanup: Updated during `_upsert_link` when pushes occur; consumers read-only.
  - Guards: Snapshot updated in the same transaction as list merge to keep monotonic.
  - Invariant: Links for archived kits remain stale-free because archived kits cannot push shopping lists.
  - Evidence: app/models/kit_shopping_list_link.py:52-84; app/services/kit_shopping_list_service.py:229-240

### 7) Consistency, Transactions & Concurrency
- Transaction scope: Service methods operate within the SQLAlchemy session tied to the request; create/update flows flush after validations and before returning (app/services/kit_service.py:204-255; app/services/kit_shopping_list_service.py:219-236).
- Atomic requirements: Kit content insert plus kit `updated_at` must succeed together; shopping list pushes must merge lines and update link snapshot in the same session.
- Retry / idempotency: Duplicate inserts rely on DB uniqueness raising `ResourceConflictException`; shopping list merges are idempotent by part.
- Ordering / concurrency controls: Kit content updates use optimistic locking via `version`, and `_upsert_link` grabs `with_for_update` rows to serialize link updates.
- Evidence: app/services/kit_service.py:204-255; app/services/kit_shopping_list_service.py:219-236

### 8) Errors & Edge Cases
- Failure: Attempt to add a duplicate part to a kit.
- Surface: KitService.create_content via POST /kits/<id>/contents.
- Handling: `ResourceConflictException` propagated as HTTP 409 with descriptive message.
- Guardrails: Database uniqueness constraint plus pre-flush validation; tests assert message coverage.
- Evidence: app/services/kit_service.py:232-247; app/models/kit_content.py:54-64

- Failure: Non-positive or non-integer requested units.
- Surface: KitPickListService.create_pick_list and KitShoppingListService.create_or_append_list.
- Handling: `InvalidOperationException` translated to HTTP 400/409.
- Guardrails: Pydantic schema `ge=1` and explicit runtime checks before performing work.
- Evidence: app/services/kit_pick_list_service.py:24-87; app/services/kit_shopping_list_service.py:180-214; app/schemas/pick_list.py:13-25

- Failure: Mutating an archived kit or targeting a non-concept shopping list.
- Surface: KitService update/delete paths; kit shopping list pushes.
- Handling: `InvalidOperationException` with operation-specific messages.
- Guardrails: `_ensure_active_kit` and `get_concept_list_for_append` enforce status before modifications.
- Evidence: app/services/kit_service.py:195-215; app/services/kit_shopping_list_service.py:202-264; app/services/shopping_list_service.py:31-67

- Failure: Debug reservation lookup for an unknown part key.
- Surface: GET /parts/<string:part_key>/kit-reservations via PartService lookups.
- Handling: Return HTTP 404 with standard error schema.
- Guardrails: Reuse PartService getters which raise `RecordNotFoundException`.
- Evidence: app/api/parts.py:1-120; app/services/part_service.py:80-119

### 9) Observability / Telemetry
- Signal: kit_detail_view_total
- Type: counter
- Trigger: Incremented whenever `KitService.get_kit_detail` completes, validating reserved calculations on the hot path.
- Labels / fields: `kit_id`.
- Consumer: Prometheus → existing inventory dashboards.
- Evidence: app/services/kit_service.py:193-215

- Signal: kit_shopping_list_push_duration_seconds
- Type: histogram
- Trigger: Recorded around shopping list pushes with outcome labels capturing success/noop/error and honor_reserved flag.
- Labels / fields: `outcome`, `honor_reserved`.
- Consumer: Prometheus metrics scraped via `/metrics`.
- Evidence: app/services/kit_shopping_list_service.py:187-214

### 10) Background Work & Shutdown
- Worker / job: None (request-scoped services only)
- Trigger cadence: n/a
- Responsibilities: Reservation helpers execute synchronously inside HTTP request handlers; no background threads introduced.
- Shutdown handling: Existing container wiring already manages service lifetimes.
- Evidence: app/services/container.py:102-143

### 11) Security & Permissions
- Concern: Data exposure for debug reservation endpoint
- Touchpoints: GET /parts/<string:part_key>/kit-reservations on the public API blueprint.
- Mitigation: Reuse `@handle_api_errors` and standard schemas so only existing kit metadata is returned; no sensitive inventory values beyond what kit detail already exposes.
- Residual risk: Single-user deployment means endpoint remains unauthenticated by design; document tooling intent.
- Evidence: docs/epics/kits_feature_breakdown.md:181-184; app/api/parts.py:1-120

### 12) UX / UI Impact
- Entry point: None (backend-only planning step)
- Change: No immediate UI adjustments; frontend work for icons/tooltips covered by separate feature slice.
- User interaction: n/a
- Dependencies: Future frontend implementation will consume the new API contract.
- Evidence: docs/epics/kits_feature_breakdown.md:183-214

### 13) Deterministic Test Plan
- Surface: KitReservationService
- Scenarios:
  - Given multiple active kits share a part, When requesting totals with `exclude_kit_id`, Then the current kit’s demand is omitted.
  - Given a part with no active kits, When requesting totals, Then the service returns zero but produces an empty per-kit list.
  - Given archived kits with `archived_at` set, When aggregating, Then archived rows are ignored.
- Fixtures / hooks: SQLAlchemy session with seeded kits/contents; optional helper to fabricate kit reservations.
- Gaps: None.
- Evidence: tests/services/test_kit_reservation_service.py:11-54

- Surface: KitService.get_kit_detail
- Scenarios:
  - Given reservation totals from other kits, When retrieving kit detail, Then `reserved`, `available`, and `shortfall` reflect the shared helper output.
  - Given duplicate part addition attempts, When create_content is invoked twice, Then the second call raises `ResourceConflictException`.
  - Given archived kits, When update/delete endpoints are invoked, Then `InvalidOperationException` surfaces.
- Fixtures / hooks: Inventory and reservation stubs injected via existing fixtures; SQLAlchemy session seeding parts/kits.
- Gaps: None.
- Evidence: tests/services/test_kit_service.py:45-212; tests/api/test_kits_api.py:320-378

- Surface: KitShoppingListService.create_or_append_list
- Scenarios:
  - Given honor_reserved=True, When reservations exceed inventory, Then shortages respect the adjusted available quantity.
  - Given zero shortage, When pushing to shopping list, Then result is marked `noop`.
  - Given non-concept list id, When pushing, Then `InvalidOperationException` is raised.
- Fixtures / hooks: Container-provided service to leverage dependency injection; monkeypatch inventory/reservation stubs for deterministic counts.
- Gaps: None.
- Evidence: tests/services/test_kit_shopping_list_service.py:35-199

- Surface: KitPickListService.create_pick_list
- Scenarios:
  - Given requested_units < 1, When creating a pick list, Then the service raises `InvalidOperationException`.
  - Given insufficient stock after reservations, When allocating, Then the service raises with descriptive stock error.
  - Given valid stock, When allocating, Then all lines reflect the required totals without double counting.
- Fixtures / hooks: InventoryService stub with seeded locations; metrics stub.
- Gaps: None.
- Evidence: tests/services/test_kit_pick_list_service.py:138-208

- Surface: GET /parts/<string:part_key>/kit-reservations
- Scenarios:
  - Given a part with active kits, When requesting the endpoint by key, Then it returns the list of kits and total reserved quantity.
  - Given a part with no kits, When requesting by key, Then it returns HTTP 200 with empty `active_reservations` and zero `total_reserved`.
  - Given an invalid part key, When requesting, Then it returns HTTP 404 using the standard error schema.
- Fixtures / hooks: Flask test client; service container to seed parts/kits; dataset reusing kit reservation helper.
- Gaps: None.
- Evidence: docs/epics/kits_feature_breakdown.md:181-184; tests/test_parts_api.py:1-160

- Surface: Database constraint for archived kits
- Scenarios:
  - Given a kit marked archived without `archived_at`, When flushing, Then the database raises the check constraint (`tests/test_database_constraints.py::test_archived_kits_require_timestamp`).
  - Given an archived kit with `archived_at`, When flushing, Then the constraint passes and migrations succeed.
- Fixtures / hooks: Alembic migration upgrade tests and SQLAlchemy session in constraint tests.
- Gaps: None.
- Evidence: docs/features/data_integrity_reserved_math/plan.md:326-330; tests/test_database_constraints.py:1-200

### 14) Implementation Slices
- Slice: Schema guard & migration
- Goal: Enforce `archived_at` presence for archived kits and keep ORM/migration in sync.
- Touches: app/models/kit.py, alembic/versions/0xx_add_kit_archived_timestamp_constraint.py, tests/test_database_constraints.py, tests/services/conftest.py (and any archived kit fixtures), app/data/test_data/kits.json, load-test-data validation.
- Dependencies: None; run before service logic to catch integrity issues early.

- Slice: Reservation service consolidation
- Goal: Provide shared helpers with caching/per-kit listings and wire kit/shopping list services to them.
- Touches: app/services/kit_reservation_service.py, app/services/kit_service.py, app/services/kit_shopping_list_service.py, app/services/kit_pick_list_service.py.
- Dependencies: Runs after schema guard so constraints are enforced; precedes API work.

- Slice: API contracts & tests
- Goal: Add the debug endpoint, update schemas, and refresh service/API tests to assert new behavior.
- Touches: app/api/parts.py, app/api/kits.py, app/schemas/kit.py, app/schemas/kit_reservations.py, tests/services/, tests/api/, tests/test_parts_api.py.
- Dependencies: Requires consolidated service methods to avoid duplicated logic.

### 15) Risks & Open Questions
- Risk: Existing archived kits without `archived_at` will violate the new constraint.
- Impact: Migration failure blocking deploy.
- Mitigation: Backfill `archived_at` with current timestamps during the migration before adding the check.

- Risk: Reservation aggregation could slow down when many kits share the same part.
- Impact: Higher latency on kit detail and shopping list pushes.
- Mitigation: Add appropriate indexes (kit_id, part_id) if needed and keep helper cached per request.

- Risk: Scoped caching in `KitReservationService` might leak across requests if wiring changes.
- Impact: Stale reserved totals shown across users.
- Mitigation: Keep caching instance-level only and add tests ensuring fresh totals after session rollback.

- Question: Should the debug reservation endpoint be hidden behind a feature flag or limited to testing mode?
- Why it matters: Determines whether we need routing guards to avoid exposing internal data in production.
- Owner / follow-up: Confirm with product owner (refer to docs/epics/kits_feature_breakdown.md:181-184).

- Question: Do we need pagination or limits on the debug response when dozens of kits reference the same part?
- Why it matters: Large payloads could affect tooling performance.
- Owner / follow-up: Evaluate typical kit counts from test data; adjust schema if necessary.

### 16) Confidence
Confidence: Medium — core services already centralize most logic, but adding the migration and new endpoint requires careful validation and backfill.
