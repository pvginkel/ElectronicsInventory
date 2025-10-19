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

- Add a service helper that returns active kit usage for a given part key.
- Deliver an API route exposing kit usage collection and wire part detail response to surface a `used_in_kits` flag.
- Define response schemas matching the prescribed fields for kit usage rows.
- Instrument metrics (counter) for the new usage endpoint and cover all additions with unit/API tests.

**Out of scope**

- Frontend tooltip/icon implementation and navigation behavior.
- Non-active kit visibility or archival workflows beyond filtering to active kits.
- Broader reservation caching invalidation or schema migrations (no DB changes required).

**Assumptions / constraints**

Assume kit names may still be non-unique (navigation will rely on kit ids). Assume part detail consumers already possess the part key; we will keep responses key-based. Continue reusing ORM joins without introducing SQL views per spec.

### 2) Affected Areas & File Map
- Area: app/services/kit_reservation_service.py
  - Why: Add `list_kits_for_part` helper and share logic with existing reservation cache for consistent filtering.
  - Evidence: app/services/kit_reservation_service.py:35-188 — `"self._usage_cache... list_active_reservations_for_part"` shows current aggregation entry point we will extend.
- Area: app/api/parts.py
  - Why: Introduce new `/parts/<string:part_key>/kits` route and augment `get_part` to populate `used_in_kits`.
  - Evidence: app/api/parts.py:161-197 — `"def get_part(...)"` demonstrates current schema serialization without kit usage.
- Area: app/schemas/part.py
  - Why: Extend `PartResponseSchema` with `used_in_kits` while keeping key-based identification.
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
  - Why: Verify new `/parts/<string:part_key>/kits` response contract and `used_in_kits` flag on part detail route.
  - Evidence: app/api/parts.py:161-197 — `"get_part"` and upcoming endpoint require API-level assertions.
- Area: tests/test_metrics_service.py
  - Why: Assert new metric counter increments when invoked.
  - Evidence: tests/test_metrics_service.py:264-299 — `"service.record_kit_detail_view..."` pattern for similar metrics tests.

### 3) Data Model / Contracts
- Entity / contract: PartResponseSchema
  - Shape:
    ```json
    {
      "key": "BZQP",
      "used_in_kits": true
    }
    ```
  - Refactor strategy: Add boolean `used_in_kits` with default `False`; set attribute before validation so existing endpoints remain compatible.
  - Evidence: app/schemas/part.py:232-360 — current fields omit kit usage.
- Entity / contract: PartKitUsageSchema
  - Shape:
    ```json
    {
      "kit_id": 42,
      "kit_name": "Synth Voice Starter",
      "status": "active",
      "reserved_quantity": 8,
      "required_per_unit": 4,
      "build_target": 2,
      "updated_at": "2024-05-01T12:00:00Z"
    }
    ```
  - Refactor strategy: New schema pulling directly from ORM rows without modifying database tables; leverage `ConfigDict(from_attributes=True)` and reuse existing columns for `required_per_unit`.
  - Evidence: docs/epics/kits_feature_breakdown.md:209-213 — spec enumerates fields for the helper and endpoint; app/models/kit_content.py:34-78 exposes `required_per_unit`.

### 4) API / Integration Surface
- Surface: GET /parts/<string:part_key>
  - Inputs: Path key (existing).
  - Outputs: Part detail payload extended with `used_in_kits`.
  - Errors: 404 via existing `RecordNotFoundException`.
  - Evidence: app/api/parts.py:161-168 — `"part = part_service.get_part(part_key)"`.
- Surface: GET /parts/<string:part_key>/kits
  - Inputs: Path part key, no body.
  - Outputs: JSON list of `PartKitUsageSchema` records sorted deterministically.
  - Errors: 404 if part key invalid; empty list when no active kits.
  - Evidence: docs/epics/kits_feature_breakdown.md:212-213 — required endpoint contract.

### 5) Algorithms & State Machines
- Flow: list kits consuming a part
  - Steps:
    1. Accept part key, resolve to `Part`, and optionally short-circuit cache hits.
    2. Issue select joining `KitContent`→`Kit` filtered to `Kit.status == KitStatus.ACTIVE`, reusing existing projection for reserved quantity and exposing `required_per_unit`.
    3. Map rows into dataclass / schema-ready objects sorted by kit name then id.
  - States / transitions: None beyond cached vs fresh query.
  - Hotspots: Query should leverage current indexes; reuse `_usage_cache` to avoid duplicate work for consecutive calls.
  - Evidence: app/services/kit_reservation_service.py:108-168 — `_ensure_usage_cache` already builds the necessary join.
- Flow: serve /parts/<string:part_key>/kits endpoint
  - Steps:
    1. Resolve `Part` by key using `PartService`.
    2. Call new `list_kits_for_part` helper for active usage.
    3. Emit metric counter with `has_results` label and return schema-dumped list.
  - States / transitions: Single HTTP transaction; no background state.
  - Hotspots: None beyond service call; response size proportional to active kits.
  - Evidence: app/api/parts.py:171-197 — existing pattern for kit reservation payloads to mirror.

### 6) Derived State & Invariants
- Derived value: reserved_quantity
  - Source: Multiply `required_per_unit` by `Kit.build_target` inside `_ensure_usage_cache` join.
  - Writes / cleanup: Stored only in `_usage_cache` entries; refreshed after `reset_usage_cache`.
  - Guards: Mutation flows touching kit contents must call `reset_usage_cache` to avoid stale totals.
  - Invariant: Reserved totals reflect only active kits at the time of cache rebuild.
  - Evidence: app/services/kit_reservation_service.py:108-188.
- Derived value: used_in_kits
  - Source: Boolean computed from `len(kit_usage) > 0` after filtering active kits.
  - Writes / cleanup: Transient attribute injected prior to Pydantic serialization; no persistence.
  - Guards: Filter inactive kits in `_ensure_usage_cache` query so flag never accounts for archived kits.
  - Invariant: Flag true iff at least one active kit usage record exists.
  - Evidence: app/services/kit_reservation_service.py:108-168; app/api/parts.py:161-197.
- Derived value: kit_usage_list_sorted
  - Source: SQL query orders by kit name then id before caching.
  - Writes / cleanup: Cached list exposed through API and reused until invalidation.
  - Guards: Re-run sort/order during cache rebuild; ensure rename flows trigger cache reset.
  - Invariant: Response ordering remains deterministic for identical datasets.
  - Evidence: app/services/kit_reservation_service.py:138-188.

### 7) Consistency, Transactions & Concurrency
- Transaction scope: Reads occur within the request-scoped session provided by `BaseService`, and the API endpoint completes within the same Flask request (app/services/base_service.py:15-38).
- Atomic requirements: No writes happen on the happy path; the only mutable state is `_usage_cache`, which must be reset in the same request that mutates kit contents (app/services/kit_reservation_service.py:170-188).
- Retry / idempotency: Endpoint is GET; repeated calls return cached data unless invalidated. No explicit retry tokens required.
- Ordering / concurrency controls: `_usage_cache` is a simple in-memory dict accessed per-process. If concurrent requests rebuild it, latest rebuild wins but remains consistent because joins are deterministic. Document requirement to call `reset_usage_cache` within locked mutation flows if races appear.
- Evidence: app/services/kit_reservation_service.py:35-188; app/services/container.py:24-60.

### 8) Errors & Edge Cases
- Failure: Part key not found
  - Surface: `GET /parts/<string:part_key>` and `GET /parts/<string:part_key>/kits`
  - Handling: `PartService` raises `RecordNotFoundException`; `@handle_api_errors` maps to 404.
  - Guardrails: Lookup via `PartService.get_part` ensures consistent exception (app/services/part_service.py:82-120).
  - Evidence: app/api/parts.py:161-219.
- Failure: No active kits for a part
  - Surface: `GET /parts/<string:part_key>/kits`
  - Handling: Return 200 with empty list; metrics label `has_results="false"`.
  - Guardrails: Service filters by status and returns empty list when nothing matches.
  - Evidence: app/services/kit_reservation_service.py:108-188.
- Failure: Metrics counter increment fails
  - Surface: `/parts/<string:part_key>/kits`
  - Handling: Wrap increment in try/except (pattern established in MetricsService) so response still succeeds.
  - Guardrails: MetricsService already isolates Prometheus errors (app/services/metrics_service.py:300-360, 560-603).
  - Evidence: app/services/metrics_service.py:300-603.
- Failure: Cache not reset after kit mutation
  - Surface: Service may return stale `used_in_kits`
  - Handling: Mutation flows must invoke `reset_usage_cache`; add test asserting cache refresh.
  - Guardrails: Implementation slice includes work to wire cache reset hooks.
  - Evidence: app/services/kit_reservation_service.py:170-188.

### 9) Observability
- Signal: part_kit_usage_requests_total
  - Type: counter
  - Trigger: Increment when `/parts/<string:part_key>/kits` endpoint completes; label `has_results` to distinguish empty vs populated payload.
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
  - User interaction: When boolean is true, UI can fetch `/parts/<string:part_key>/kits` to populate cross-navigation links.
  - Dependencies: Frontend continues using part keys; ensure responses highlight key plus `used_in_kits`.
  - Evidence: docs/epics/kits_feature_breakdown.md:205-213 — tooltip/icon behavior.

### 13) Deterministic Test Plan
- Surface: KitReservationService.list_kits_for_part
  - Scenarios:
    - Given a part with active and archived kits, When listing usage, Then only active kits appear with correct reserved totals.
    - Given a part without kits, When listing usage, Then an empty list returns.
  - Fixtures / hooks: Use `session` fixture to seed parts, kits, kit contents.
  - Gaps: None.
  - Evidence: tests/services/test_kit_reservation_service.py:57-102 — template for service tests.
- Surface: GET /parts/<string:part_key>/kits
  - Scenarios:
    - Given an existing part with active kits, When requesting usage, Then response matches schema (including `required_per_unit`) and counter increments.
    - Given an existing part without kits, When requesting usage, Then HTTP 200 with empty list and metric label `false`.
    - Given an unknown part key, When requesting, Then HTTP 404.
  - Fixtures / hooks: `client`, `container` fixtures; use service container to seed data.
  - Gaps: None.
  - Evidence: app/api/parts.py:161-197 — current API conventions to mirror.
- Surface: GET /parts/<string:part_key>
  - Scenarios:
    - Given a part with kit usage, When fetching detail, Then `used_in_kits` is true.
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
  - Goal: Expose `/parts/<string:part_key>/kits`, populate `used_in_kits`, and record metrics.
  - Touches: app/api/parts.py, app/services/metrics_service.py.
  - Dependencies: Slice 1.
- Slice: Test coverage
  - Goal: Ensure deterministic tests for service, API, and metrics additions.
  - Touches: tests/services/test_kit_reservation_service.py, tests/api/test_parts_api.py, tests/test_metrics_service.py.
  - Dependencies: Slices 1-2.

### 15) Risks & Open Questions
- Risk: Reservation cache invalidation might serve stale `used_in_kits` data until cache cleared.
  - Impact: Users could see outdated tooltip until process flushes cache.
  - Mitigation: Wire existing `reset_usage_cache` into every kit mutation path and cover with tests.
- Risk: Part key lookups rely on consistent casing and normalization.
  - Impact: Mismatched keys would cause false 404s.
  - Mitigation: Reuse canonical key normalization utilities before querying.
- Risk: Metric proliferation without dashboard updates.
  - Impact: Counter unused, noise.
  - Mitigation: Coordinate with ops to add panel or document usage.
- Question: Are additional per-kit annotations (e.g., notes, due dates) required alongside `required_per_unit`?
  - Why it matters: Missing context could limit tooltip usefulness.
  - Owner / follow-up: Confirm with product/UX stakeholders before build.
- Question: Do we need cache invalidation hooks when kit contents mutate?
  - Why it matters: Without invalidation, tooltip could lag after kit edits.
  - Owner / follow-up: Evaluate when implementing future kit mutation flows; consider hooking into existing services.

### 16) Confidence
Confidence: Medium — Existing reservation logic can be reused, with remaining uncertainty focused on cache invalidation coverage and kit metadata completeness.
