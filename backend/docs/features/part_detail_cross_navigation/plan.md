# Part Detail Cross Navigation — Backend Plan

### 0) Research Log & Findings
- Reviewed the feature breakdown for cross-navigation requirements and prescribed service/API changes `docs/epics/kits_feature_breakdown.md:197-213 — "Extend KitReservationService... GET /parts/<int:part_id>/kits ... used_in_kits"`.
- Inspected current reservation aggregation logic to understand reuse and caching patterns `app/services/kit_reservation_service.py:35-188 — "self._usage_cache... list_active_reservations_for_part"` .
- Examined part detail API behavior and schemas to see how responses are produced today `app/api/parts.py:161-197 — "get_part... PartResponseSchema.model_validate"`, `app/schemas/part.py:232-360 — "class PartResponseSchema(BaseModel)"`.
- Confirmed metrics infrastructure extension points for adding request counters `app/services/metrics_service.py:300-360 — "self.kit_detail_views_total ..."` and existing tests verifying metric increments `tests/test_metrics_service.py:264-299 — "service.record_kit_detail_view..."`.
- Reviewed existing service-level tests that exercise kit reservation calculations to mirror coverage for the new helper `tests/services/test_kit_reservation_service.py:11-102 — "test_reserved_totals... test_list_active_reservations..."`.

### 1) Intent & Scope
**User intent**

Expose kit usage directly on part detail so planners can trace consumption and navigate to kits without leaving context.

**Prompt quotes**

"Surface kit usage context on the part detail page so planners can trace where a part is consumed and jump to the relevant kits." / "Extend `KitReservationService` with a `list_kits_for_part` helper..." / "`GET /parts/<int:part_id>/kits` returns `PartKitUsageSchema` objects" `docs/epics/kits_feature_breakdown.md:197-213`.

**In scope**

- Add a service helper that returns active kit usage for a given part id.
- Deliver an API route exposing kit usage collection and wire part detail response to surface a `used_in_kits` flag.
- Define response schemas matching the prescribed fields for kit usage rows.
- Instrument metrics (counter) for the new usage endpoint and cover all additions with unit/API tests.

**Out of scope**

- Frontend tooltip/icon implementation and navigation behavior.
- Non-active kit visibility or archival workflows beyond filtering to active kits.
- Broader reservation caching invalidation or schema migrations (no DB changes required).

**Assumptions / constraints**

Assume kit names may still be non-unique (navigation will rely on ids). Assume part detail consumers can obtain `part_id` or we will expose it alongside `used_in_kits`. Continue reusing ORM joins without introducing SQL views per spec.

### 2) Affected Areas & File Map
- Area: app/services/kit_reservation_service.py
  - Why: Add `list_kits_for_part` helper and share logic with existing reservation cache for consistent filtering.
  - Evidence: app/services/kit_reservation_service.py:35-188 — `"self._usage_cache... list_active_reservations_for_part"` shows current aggregation entry point we will extend.
- Area: app/api/parts.py
  - Why: Introduce new `/parts/<int:part_id>/kits` route and augment `get_part` to populate `used_in_kits`.
  - Evidence: app/api/parts.py:161-197 — `"def get_part(...)"` demonstrates current schema serialization without kit usage.
- Area: app/schemas/part.py
  - Why: Extend `PartResponseSchema` with `used_in_kits` (and optionally expose `id` for caller parity).
  - Evidence: app/schemas/part.py:232-360 — `"class PartResponseSchema(BaseModel)"` lists existing response fields.
- Area: app/schemas/part_kits.py (new)
  - Why: Define `PartKitUsageSchema` matching the feature spec for kit usage entries.
  - Evidence: docs/epics/kits_feature_breakdown.md:212-213 — `"PartKitUsageSchema objects (kit_id, kit_name, status, updated_at, reserved_quantity, build_target)"`.
- Area: app/services/metrics_service.py
  - Why: Register a counter helper for part kit usage lookups and expose a public recording method.
  - Evidence: app/services/metrics_service.py:300-360 — `"Counter(... kit_detail_views_total)"` shows pattern for request counters.
- Area: tests/services/test_kit_reservation_service.py
  - Why: Add coverage for `list_kits_for_part` success and filtering behavior.
  - Evidence: tests/services/test_kit_reservation_service.py:11-102 — `"test_list_active_reservations_returns_metadata"` indicates existing structure to extend.
- Area: tests/api/test_parts_api.py (new)
  - Why: Verify new `/parts/<int:part_id>/kits` response contract and `used_in_kits` flag on part detail route.
  - Evidence: app/api/parts.py:161-197 — `"get_part"` and upcoming endpoint require API-level assertions.
- Area: tests/test_metrics_service.py
  - Why: Assert new metric counter increments when invoked.
  - Evidence: tests/test_metrics_service.py:264-299 — `"service.record_kit_detail_view..."` pattern for similar metrics tests.

### 3) Data Model / Contracts
- Entity / contract: PartResponseSchema
  - Shape:
    ```json
    {
      "id": 123,
      "key": "BZQP",
      "used_in_kits": true
    }
    ```
  - Refactor strategy: Add optional `id` (if absent today) and boolean `used_in_kits` with default `False`; set attribute before validation so existing endpoints remain compatible.
  - Evidence: app/schemas/part.py:232-360 — current fields omit kit usage and id exposure.
- Entity / contract: PartKitUsageSchema
  - Shape:
    ```json
    {
      "kit_id": 42,
      "kit_name": "Synth Voice Starter",
      "status": "active",
      "reserved_quantity": 8,
      "build_target": 2,
      "updated_at": "2024-05-01T12:00:00Z"
    }
    ```
  - Refactor strategy: New schema pulling directly from ORM rows without modifying database tables; leverage `ConfigDict(from_attributes=True)` for ORM integration.
  - Evidence: docs/epics/kits_feature_breakdown.md:209-213 — spec enumerates fields for the helper and endpoint.

### 4) API / Integration Surface
- Surface: GET /parts/<string:part_key>
  - Inputs: Path key (existing).
  - Outputs: Part detail payload extended with `id` (if added) and `used_in_kits`.
  - Errors: 404 via existing `RecordNotFoundException`.
  - Evidence: app/api/parts.py:161-168 — `"part = part_service.get_part(part_key)"`.
- Surface: GET /parts/<int:part_id>/kits
  - Inputs: Path part id, no body.
  - Outputs: JSON list of `PartKitUsageSchema` records sorted deterministically.
  - Errors: 404 if part id invalid; empty list when no active kits.
  - Evidence: docs/epics/kits_feature_breakdown.md:212-213 — required endpoint contract.

### 5) Algorithms & State Machines
- Flow: list kits consuming a part
  - Steps:
    1. Accept part id, normalize to int, and optionally short-circuit cache hits.
    2. Issue select joining `KitContent`→`Kit` filtered to `Kit.status == KitStatus.ACTIVE`, reusing existing projection for reserved quantity.
    3. Map rows into dataclass / schema-ready objects sorted by kit name then id.
  - States / transitions: None beyond cached vs fresh query.
  - Hotspots: Query should leverage current indexes; reuse `_usage_cache` to avoid duplicate work for consecutive calls.
  - Evidence: app/services/kit_reservation_service.py:108-168 — `_ensure_usage_cache` already builds the necessary join.
- Flow: serve /parts/<id>/kits endpoint
  - Steps:
    1. Resolve `Part` by id (or map from key) using `PartService`.
    2. Call new `list_kits_for_part` helper for active usage.
    3. Emit metric counter with `has_results` label and return schema-dumped list.
  - States / transitions: Single HTTP transaction; no background state.
  - Hotspots: None beyond service call; response size proportional to active kits.
  - Evidence: app/api/parts.py:171-197 — existing pattern for kit reservation payloads to mirror.

### 6) Derived State & Invariants
- Derived value: reserved_quantity
  - Source: Multiply `required_per_unit` by `Kit.build_target` within the join `app/services/kit_reservation_service.py:121-163`.
  - Writes / cleanup: Stored only in response objects; cache invalidated when `_usage_cache` drop logic introduced.
- Derived value: used_in_kits
  - Source: Boolean flag set from `len(kit_usage) > 0` before schema serialization.
  - Writes / cleanup: Attribute attached to `Part` instance for serialization only; no persistence.
- Derived value: kit_usage_list_sorted
  - Source: Service returns list ordered by kit name then id ensuring deterministic tooltip order.
  - Writes / cleanup: Endpoint returns the sorted list; caching preserves ordering until invalidated/reloaded.

### 7) Validation & Error Handling
- Validate part id/key exists before querying usage; reuse `RecordNotFoundException` from `PartService` for consistent 404 handling `app/services/part_service.py:84-110`.
- Guard against non-integer ids by relying on Flask route converter (`<int:part_id>`) and type-casting inside service.
- Ensure metrics recording is wrapped in try/except consistent with existing patterns to avoid surfacing Prometheus errors to clients `app/services/metrics_service.py:560-603`.

### 8) Performance & Scaling
- Leverage `_usage_cache` for repeated part lookups; extend cache invalidation entry point if necessary but avoid redundant DB hits during single request `app/services/kit_reservation_service.py:108-168`.
- Query adds only an equality filter on `KitContent.part_id` and `Kit.status`, both indexed through foreign keys/status index `app/models/kit_content.py:24-67`, `app/models/kit.py:34-87`.
- Sorting by kit name/id happens in SQL ensuring stable ordering without Python resorting.

### 9) Observability
- Signal: part_kit_usage_requests_total
  - Type: counter
  - Trigger: Increment when `/parts/<part_id>/kits` endpoint completes; label `has_results` to distinguish empty vs populated payload.
  - Labels / fields: `has_results` ("true"/"false").
  - Consumer: Prometheus dashboards tracking discovery of kit usages.
  - Evidence: app/services/metrics_service.py:300-360 — existing counter patterns to extend.

### 10) Background Work & Shutdown
- No new background workers are introduced; rely on existing request lifecycle. Confirm MetricsService change remains synchronous and honors current shutdown hooks `app/services/metrics_service.py:54-125`.

### 11) Security & Permissions
- Concern: Authorization (none implemented)
  - Touchpoints: Reuse existing part endpoints guarded only by `@handle_api_errors`.
  - Mitigation: Ensure new endpoint does not expose additional sensitive data beyond kit metadata already readable via kit APIs.
  - Residual risk: Same as existing part detail; acceptable for single-user system.
  - Evidence: app/api/parts.py:161-219 — current endpoints unprotected but consistent.

### 12) UX / UI Impact
- Entry point: Part detail page (frontend)
  - Change: Backend adds `used_in_kits` boolean and usage list endpoint to drive tooltip.
  - User interaction: When boolean is true, UI can fetch `/parts/<id>/kits` to populate cross-navigation links.
  - Dependencies: Frontend must consume new fields; ensure part detail payload exposes `id` for route call.
  - Evidence: docs/epics/kits_feature_breakdown.md:205-213 — tooltip/icon behavior.

### 13) Deterministic Test Plan
- Surface: KitReservationService.list_kits_for_part
  - Scenarios:
    - Given a part with active and archived kits, When listing usage, Then only active kits appear with correct reserved totals.
    - Given a part without kits, When listing usage, Then an empty list returns.
  - Fixtures / hooks: Use `session` fixture to seed parts, kits, kit contents.
  - Gaps: None.
  - Evidence: tests/services/test_kit_reservation_service.py:57-102 — template for service tests.
- Surface: GET /parts/<int:part_id>/kits
  - Scenarios:
    - Given an existing part with active kits, When requesting usage, Then response matches schema and counter increments.
    - Given an existing part without kits, When requesting usage, Then HTTP 200 with empty list and metric label `false`.
    - Given a missing part id, When requesting, Then HTTP 404.
  - Fixtures / hooks: `client`, `container` fixtures; use service container to seed data.
  - Gaps: None.
  - Evidence: app/api/parts.py:161-197 — current API conventions to mirror.
- Surface: GET /parts/<string:part_key>
  - Scenarios:
    - Given a part with kit usage, When fetching detail, Then `used_in_kits` is true (and `id` present if added).
    - Given a part without usage, When fetching detail, Then `used_in_kits` is false.
  - Fixtures / hooks: Use same seeded data.
  - Gaps: None.
  - Evidence: app/api/parts.py:161-168 — serialization path.

### 14) Implementation Slices
- Slice: Service & schema foundations
  - Goal: Provide `list_kits_for_part` and `PartKitUsageSchema`, update `PartResponseSchema`.
  - Touches: app/services/kit_reservation_service.py, app/schemas/part_kits.py, app/schemas/part.py.
  - Dependencies: None.
- Slice: API endpoint & metrics wiring
  - Goal: Expose `/parts/<id>/kits`, populate `used_in_kits`, and record metrics.
  - Touches: app/api/parts.py, app/services/metrics_service.py.
  - Dependencies: Slice 1.
- Slice: Test coverage
  - Goal: Ensure deterministic tests for service, API, and metrics additions.
  - Touches: tests/services/test_kit_reservation_service.py, tests/api/test_parts_api.py, tests/test_metrics_service.py.
  - Dependencies: Slices 1-2.

### 15) Risks & Open Questions
- Risk: Reservation cache invalidation might serve stale `used_in_kits` data until cache cleared.
  - Impact: Users could see outdated tooltip until process flushes cache.
  - Mitigation: Expose helper to bypass cache or document need for future invalidation hook (beyond current scope).
- Risk: Part detail payload currently lacks `id`, blocking callers from hitting `<int:part_id>` endpoint.
  - Impact: Frontend cannot call new route.
  - Mitigation: Include `id` alongside `used_in_kits` or adjust endpoint to use part key.
- Risk: Metric proliferation without dashboard updates.
  - Impact: Counter unused, noise.
  - Mitigation: Coordinate with ops to add panel or document usage.
- Question: Should the `/parts/<int:part_id>/kits` endpoint optionally include `required_per_unit` as per existing reservation schema?
  - Why it matters: Frontend may need per-unit context; ensure alignment with UX expectations.
  - Owner / follow-up: Confirm with product/UX stakeholders before build.
- Question: Do we need cache invalidation hooks when kit contents mutate?
  - Why it matters: Without invalidation, tooltip could lag after kit edits.
  - Owner / follow-up: Evaluate when implementing future kit mutation flows; consider hooking into existing services.

### 16) Confidence
Confidence: Medium — Existing reservation logic can be reused, but endpoint identifier alignment (id vs key) needs confirmation.
