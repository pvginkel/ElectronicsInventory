### 0) Research Log & Findings
- Compared the existing bulk membership workflow for parts to understand desired parity. `app/api/parts.py:259` exposes `POST /shopping-list-memberships/query`, delegating to service helpers and schemas in `app/schemas/part_shopping_list.py:134` and `app/services/shopping_list_service.py:257`, confirming input validation expectations and grouping behaviour.
- Reviewed current kit-facing endpoints to see the limited payloads we expose today. `app/api/kits.py:249` only returns `KitShoppingListChipSchema` objects, while `app/api/pick_lists.py:51` lists pick lists per kit without any bulk access.
- Inspected service layers to spot N+1 risks. `app/services/kit_shopping_list_service.py:108` fetches links one kit at a time and hydrates metadata, and `app/services/kit_pick_list_service.py:206` does the same for pick lists; neither support multi-kit lookup.
- Verified schemas already in play so the new responses can reuse or extend them. Shopping-list link data lives in `app/schemas/kit.py:275`, and pick-list summaries with derived counters are defined in `app/schemas/pick_list.py:98`.
- Checked how kit detail wiring currently loads relationships for a single kit. `app/services/kit_service.py:111` sorts the links and pick lists after eager loading, which we can mirror for bulk results without recalculating availability math.

### 1) Intent & Scope
**User intent**

Expose richer kit ➜ shopping list and kit ➜ pick list membership details via dedicated APIs modelled after the existing part membership bulk query, including support for the `include_done` flag that surfaces archived memberships.

**Prompt quotes**

"We need to make more information available on the links from kit to shopping lists and pick lists" … "same api as that was implemented through docs/features/shopping_list_membership_bulk_query/plan.md" … "schema for the pick list membership can be based on the schema for the shopping list membership (PartShoppingListMembershipSchema)."

**In scope**
- Add bulk query endpoints for kits that return enriched shopping list link data and pick list summaries, respecting the `include_done` flag semantics.
- Introduce request/response schemas mirroring the part membership query patterns, including validation.
- Extend kit services to fetch memberships for multiple kit IDs efficiently and hydrate payloads.
- Update automated tests covering new services, schemas, and API routes.

**Out of scope**
- Frontend/UI updates consuming the new data.
- Changes to existing single-kit endpoints or badge-count calculations.
- Database schema or migration work.

**Assumptions / constraints**
- Callers will supply kit IDs (ints); we will preserve request order and enforce a hard cap (e.g., 100 kits per call) similar to part queries.
- `include_done` mirrors the part membership API: when true, include `ShoppingListStatus.DONE` links and `KitPickListStatus.COMPLETED` pick lists; otherwise omit them.
- `KitShoppingListLinkSchema` and `KitPickListSummarySchema` remain the canonical response shapes; we only wrap them for grouping.

### 2) Affected Areas & File Map
- Area: app/api/kits.py
  - Why: Add `POST /kits/shopping-list-memberships/query` and `POST /kits/pick-list-memberships/query` routes wired through dependency injection.
  - Evidence: app/api/kits.py:249 shows current shopping-list list route and injection pattern we will mirror.
- Area: app/services/kit_service.py
  - Why: Provide a helper to resolve and validate multiple kit IDs while preserving input order (similar to part key lookup).
  - Evidence: app/services/kit_service.py:111 currently only loads one kit at a time, leaving bulk resolution missing.
- Area: app/services/kit_shopping_list_service.py
  - Why: Implement a bulk retrieval method that returns all links for a set of kit IDs without issuing per-kit queries.
  - Evidence: app/services/kit_shopping_list_service.py:108 handles only single-kit lookups today.
- Area: app/services/kit_pick_list_service.py
  - Why: Add a bulk pick list loader with appropriate eager loading and ordering.
  - Evidence: app/services/kit_pick_list_service.py:206 limits us to one kit per call.
- Area: tests/services/test_kit_service.py
  - Why: Cover the new bulk kit resolver helper (order preservation, unknown IDs, limit enforcement).
  - Evidence: tests/services/test_kit_service.py:85 currently exercises single-kit lookups only.
- Area: app/schemas/kit.py
  - Why: Define query request/response wrappers for shopping-list membership results tied to kits.
  - Evidence: app/schemas/kit.py:275 already houses link schemas we will reuse.
- Area: app/schemas/pick_list.py
  - Why: Introduce a pick-list membership schema (based on `PartShoppingListMembershipSchema`) plus query response wrappers.
  - Evidence: app/schemas/pick_list.py:98 contains the summary schema we can extend.
- Area: tests/services/test_kit_shopping_list_service.py
  - Why: Add unit tests validating the new bulk membership helper (order preservation, empty sets, missing kits).
  - Evidence: Existing coverage at tests/services/test_kit_shopping_list_service.py:239 only exercises single-kit listing.
- Area: tests/services/test_kit_pick_list_service.py
  - Why: Ensure new bulk pick list retrieval is covered across open/completed combinations.
  - Evidence: tests/services/test_kit_pick_list_service.py:145 currently lacks bulk scenarios.
- Area: tests/api/test_kits_api.py
  - Why: Add integration coverage for the new bulk shopping list membership endpoint.
  - Evidence: tests/api/test_kits_api.py:101 focuses on other kit routes.
- Area: tests/api/test_pick_lists_api.py (or new API test module)
  - Why: Cover the pick-list membership bulk endpoint end-to-end.
  - Evidence: tests/api/test_pick_lists_api.py:174 only tests existing CRUD endpoints.

### 3) Data Model / Contracts
- Entity / contract: KitShoppingListMembershipQueryRequestSchema
  - Shape: `{"kit_ids": list[int] (1..100, unique), "include_done": bool | None (default false)}`.
  - Refactor strategy: New schema added alongside existing kit schemas; validation mirrors part query behaviour, so no backwards compatibility concerns.
  - Evidence: app/schemas/kit.py:275 indicates where related schemas live for reuse.
- Entity / contract: KitShoppingListMembershipQueryResponseSchema
  - Shape:
    ```json
    {
      "memberships": [
        {
          "kit_id": 17,
          "shopping_list_links": [KitShoppingListLinkSchema...]
        }
      ]
    }
    ```
  - Refactor strategy: Wraps existing link schema, ensuring we can expand per-kit metadata later without breaking inner structure.
  - Evidence: app/schemas/kit.py:323 for `KitShoppingListLinkSchema` usage.
- Entity / contract: KitPickListMembershipSchema + query wrappers
  - Shape:
    ```json
    {
      "pick_list_id": 42,
      "status": "open",
      "requested_units": 3,
      "created_at": "...",
      "updated_at": "...",
      "completed_at": "...",
      "line_count": 5,
      "open_line_count": 2,
      "completed_line_count": 3,
      "total_quantity_to_pick": 20,
      "picked_quantity": 12,
      "remaining_quantity": 8
    }
    }
    ```
    and a response shaped like the shopping-list wrapper but under `pick_lists`, with request schema also carrying `include_done`.
  - Refactor strategy: Extend `KitPickListSummarySchema` (app/schemas/pick_list.py:98) to align field names while encapsulating it in a grouped response; no existing contract changes.
  - Evidence: app/schemas/pick_list.py:98 demonstrates the baseline fields to inherit.

### 4) API / Integration Surface
- Surface: POST /api/kits/shopping-list-memberships/query
  - Inputs: JSON body validated by `KitShoppingListMembershipQueryRequestSchema` (ordered `kit_ids`, optional `include_done`).
  - Outputs: 200 with `KitShoppingListMembershipQueryResponseSchema` preserving request order; 400 on validation failures; 404 if any kit ID is unknown. When `include_done` is false, omit `ShoppingListStatus.DONE`; when true, include them.
  - Errors: Leverage `RecordNotFoundException` mapping through `@handle_api_errors`; validation errors surface as `ErrorResponseSchema`.
  - Evidence: app/api/parts.py:259 shows the analogue we will follow.
- Surface: POST /api/kits/pick-list-memberships/query
  - Inputs: JSON body validated by the pick-list query schema (ordered `kit_ids`, optional `include_done`).
  - Outputs: 200 with grouped pick-list memberships; same error semantics as above. When `include_done` is false, return only non-archived (`KitPickListStatus.OPEN`) lists; when true, include completed/archived lists.
  - Errors: Same as shopping-list endpoint.
  - Evidence: app/api/pick_lists.py:51 identifies the blueprint and DI context to extend.

### 5) Algorithms & State Machines
- Flow: Bulk kit shopping-list membership lookup
  - Steps:
    1. Validate and normalise `kit_ids` (and `include_done`), then resolve them via a new `KitService.get_kit_ids_or_404` helper that preserves order.
    2. Issue one `select(KitShoppingListLink)` query constrained to the requested IDs with `selectinload` of the shopping list and kit relationships.
    3. Apply status filtering: when `include_done` is false, exclude links whose shopping list status is DONE.
    4. Hydrate denormalised attributes via `_hydrate_link_metadata` for each row.
    5. Group links by `kit_id` into an ordered dict keyed by the original ID list, defaulting to empty lists when no membership exists.
  - States / transitions: None beyond grouping.
  - Hotspots: Query size grows with kit count; capped input list mitigates load and `selectinload` prevents N+1 cascade.
  - Evidence: app/services/kit_shopping_list_service.py:108 and :400 show current single-kit path and hydration logic.
- Flow: Bulk kit pick-list membership lookup
  - Steps:
    1. Resolve kit IDs (and desired `include_done` flag) as above to ensure consistent error handling.
    2. Execute one query against `KitPickList` with `selectinload` of `lines` so computed counters remain accurate.
    3. Apply status filtering: default to `KitPickListStatus.OPEN`, and include `KitPickListStatus.COMPLETED` when `include_done` is true.
    4. Sort pick lists by `(created_at DESC, id DESC)` to match existing per-kit ordering.
    5. Group lists per kit ID, ensuring empty arrays for kits without pick lists.
  - States / transitions: No explicit state machine; grouping ensures deterministic output.
  - Hotspots: Loading lines for many pick lists; mitigate by enforcing kit limit and reusing loaded instances.
  - Evidence: app/services/kit_pick_list_service.py:206 demonstrates current ordering and loading requirements.

### 6) Derived State & Invariants
- Derived value: `KitShoppingListLink.is_stale`
  - Source: Compares `snapshot_kit_updated_at` to the hydrated kit’s `updated_at` via `_hydrate_link_metadata`.
  - Writes / cleanup: No direct writes, but stale flags drive badge freshness in responses.
  - Guards: Bulk loader must call `_hydrate_link_metadata` for each link after `selectinload`ing `kit` and `shopping_list`.
  - Invariant: Bulk responses must match single-kit detail stale-state semantics.
  - Evidence: app/models/kit_shopping_list_link.py:48,82-89; app/services/kit_shopping_list_service.py:118-145,400-415
- Derived value: Pick-list aggregate counters
  - Source: `KitPickList` computed properties (`line_count`, `total_quantity_to_pick`, etc.) aggregate eager-loaded `lines`.
  - Writes / cleanup: Returned counters feed UI badges; no persistence, but incorrect loads misreport outstanding work.
  - Guards: Bulk pick-list query must `selectinload(KitPickList.lines)` to avoid lazy-load gaps.
  - Invariant: Aggregates in bulk payload equal those from `KitPickListService.list_pick_lists_for_kit`.
  - Evidence: app/models/kit_pick_list.py:98-128; app/services/kit_pick_list_service.py:208-224
- Derived value: Response ordering
  - Source: Caller-provided `kit_ids` determines output grouping; memberships are slotted in that exact sequence.
  - Writes / cleanup: None, but order preservation prevents misaligned UI badges.
  - Guards: Maintain an ordered map keyed by the original `kit_ids` list before serialising.
  - Invariant: For index `i`, `response.memberships[i].kit_id == request.kit_ids[i]`.
  - Evidence: app/api/parts.py:259-295 (order-preserving bulk pattern to mirror); docs/features/shopping_list_membership_bulk_query/plan.md:127-152

### 7) Consistency, Transactions & Concurrency
- Transaction scope: Use the request-scoped SQLAlchemy session injected via `BaseService`; all kit resolution and membership queries run within the same session per request.
- Atomic requirements: Resolve all kit IDs before issuing membership lookups so a missing kit aborts the call without returning partial data.
- Retry / idempotency: Operations are read-only; clients may safely retry on transient failures without side effects.
- Ordering / concurrency controls: Preserve the caller’s `kit_ids` order when assembling results; no additional locking is required because we read committed snapshots.
- Evidence: app/services/base.py:7-17; app/api/parts.py:259-295; app/services/kit_service.py:111-128

### 8) Errors & Edge Cases
- Failure: Payload validation fails (empty list, duplicates, >100 IDs, non-integers).
  - Surface: `POST /api/kits/*-memberships/query`
  - Handling: Spectree validation raises 400 with `ErrorResponseSchema`.
  - Guardrails: Enforce min/max constraints and uniqueness in the Pydantic request schemas.
  - Evidence: app/api/parts.py:259-275 (existing validation pattern); app/schemas/part_shopping_list.py:134-182
- Failure: Unknown kit ID supplied.
  - Surface: Bulk services resolving kit IDs.
  - Handling: Raise `RecordNotFoundException`, returning HTTP 404 via `@handle_api_errors`.
  - Guardrails: `kit_service.get_kit_detail` already raises 404-style errors, and the new resolver mirrors that behaviour.
  - Evidence: app/services/kit_service.py:111-128; app/api/kits.py:249-267
- Failure: Stale metadata due to missing eager loading.
  - Surface: Bulk shopping-list and pick-list services.
  - Handling: Guard by applying `selectinload` for dependent relationships before hydration.
  - Guardrails: Unit tests assert counters/hydration, and service code enforces eager-loading options.
  - Evidence: app/services/kit_shopping_list_service.py:118-145; app/services/kit_pick_list_service.py:208-224

### 9) Observability / Telemetry
- Signal: `record_pick_list_list_request`
  - Type: Counter
  - Trigger: Invoke once per kit represented in the bulk pick-list result so existing dashboards continue to track per-kit reads.
  - Labels / fields: `kit_id`, `result_count`
  - Consumer: Prometheus metrics scraped via `/metrics`
  - Evidence: app/services/kit_pick_list_service.py:208-226; app/services/metrics_service.py:693-706
- Signal: `kit_bulk_membership_query` debug log
  - Type: Structured log
  - Trigger: Emit once per API call summarising request size and include_done flag; keep payload-free to avoid noise.
  - Labels / fields: `kit_count`, `include_done`
  - Consumer: Application logs for operational troubleshooting; metrics kept lightweight per stakeholder guidance.
  - Evidence: docs/features/kit_membership_bulk_query/plan.md:28-31 (limit + include_done assumptions)

### 10) Background Work & Shutdown
- No background jobs or long-running workers are introduced; existing shutdown coordination remains unaffected.

### 11) Security & Permissions
- Endpoints stay within authenticated API scope already governed by the kits blueprint; no changes to authn/authz or rate limiting are needed.

### 12) UX / UI Impact
- Frontend can replace per-kit fetches with the new bulk endpoints to decorate kit listings with up-to-date badge detail, reducing chattiness. No backend-rendered templates change.

### 13) Deterministic Test Plan
- Surface: KitService.resolve_kits_for_bulk (new helper)
  - Scenarios:
    - Given valid kit IDs in a specific order, When resolving, Then results preserve order and attach DB identities.
    - Given duplicate or non-existent IDs, When resolving, Then `RecordNotFoundException` is raised before membership queries.
    - Given more than the configured limit, When resolving, Then validation blocks the call.
  - Fixtures / hooks: Reuse `create_kit` factory and session fixture in `tests/services/test_kit_service.py`.
  - Gaps: None.
- Surface: KitShoppingListService.list_links_for_kits_bulk
  - Scenarios:
    - Given multiple kits with links, When retrieving bulk memberships, Then each list preserves kit order and link ordering.
    - Given kits without links, When querying, Then response includes empty arrays.
    - Given an unknown kit ID, When querying, Then the helper raises `RecordNotFoundException`.
    - Given `include_done=False`, When querying, Then DONE status links are excluded; with `include_done=True`, DONE links appear.
  - Fixtures / hooks: Use existing `_create_kit_with_content` helper in service tests.
  - Gaps: None.
- Surface: KitPickListService.list_pick_lists_for_kits_bulk
  - Scenarios:
    - Given kits with mixed open/completed pick lists, When querying, Then results include accurate counters and ordering.
    - Given kits without pick lists, When querying, Then response arrays are empty.
    - Given `include_done=False`, When querying, Then completed/archived pick lists are omitted; with `include_done=True`, they appear.
  - Fixtures / hooks: Reuse pick list service helpers to seed inventory.
  - Gaps: None.
- Surface: POST /api/kits/shopping-list-memberships/query
  - Scenarios:
    - Given two kits and links, When querying, Then response mirrors request order and serialises link metadata.
    - Given duplicate IDs or >100 IDs, When querying, Then API returns 400.
    - Given an unknown kit ID, When querying, Then API returns 404.
    - Given a kit with DONE-linked list, When querying with `include_done=False`, Then it is absent; with `include_done=True`, it returns.
  - Fixtures / hooks: Use API seeding helpers already present in `tests/api/test_kits_api.py`.
  - Gaps: None.
- Surface: POST /api/kits/pick-list-memberships/query
  - Scenarios:
    - Given kits with open/completed pick lists, When querying, Then each kit entry returns correct counters.
    - Given kits without pick lists, When querying, Then API returns empty lists.
    - Given invalid payloads, When querying, Then API emits 400/404 as appropriate.
    - Given a kit with completed pick lists, When querying with `include_done=False`, Then they are omitted; with `include_done=True`, they appear.
  - Fixtures / hooks: Adapt `_seed_kit_with_inventory` from pick list API tests.
  - Gaps: None.

### 14) Implementation Slices
- Slice: Schema & validation groundwork
  - Goal: Define request/response wrappers and pick-list membership schema.
  - Touches: `app/schemas/kit.py`, `app/schemas/pick_list.py`.
- Slice: Service bulk helpers
  - Goal: Add kit ID resolver and bulk membership queries with grouping.
  - Touches: `app/services/kit_service.py`, `app/services/kit_shopping_list_service.py`, `app/services/kit_pick_list_service.py`.
- Slice: API endpoints
  - Goal: Expose new routes, wire DI, and return grouped payloads.
  - Touches: `app/api/kits.py`, documentation updates via Spectree wiring.
- Slice: Tests
  - Goal: Cover services and endpoints with deterministic fixtures.
  - Touches: `tests/services/test_kit_shopping_list_service.py`, `tests/services/test_kit_pick_list_service.py`, `tests/api/test_kits_api.py`, `tests/api/test_pick_lists_api.py`.

### 15) Risks & Open Questions
- Risk: Loading pick-list lines for many kits could be heavy if large datasets are queried at once. Impact: Increased memory/time. Mitigation: Enforce strict kit list limit and consider future pagination if needed.
- Risk: Divergence between new API ordering and existing badge counters might confuse the UI. Impact: Inconsistent displays. Mitigation: Document ordering guarantees and add tests ensuring parity with single-kit detail order.
- Risk: Metrics expectations (per-kit counters) may need adjustment. Impact: Monitoring gaps for bulk usage. Mitigation: Review metrics usage during implementation and add instrumentation if required.
- Open question: Do callers need filters (e.g., exclude completed pick lists)? Why it matters: Influences schema design; defaulting to all statuses may require client-side filtering. Owner / follow-up: Confirm with product/UI stakeholders when implementing.

### 16) Confidence
Confidence: Medium — Requirements align with established patterns, but confirming filtering expectations and potential metric adjustments requires attention during implementation.
