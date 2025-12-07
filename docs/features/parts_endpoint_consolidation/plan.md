# Parts Endpoint Consolidation — Technical Plan

## 0) Research Log & Findings

### Discovery Summary

Examined the current parts API implementation across multiple layers:
- API endpoints in `app/api/parts.py` (lines 111-170, 191-213, 272-316)
- Service layer in `app/services/inventory_service.py` (lines 293-353)
- Kit reservation service in `app/services/kit_reservation_service.py` (lines 61-75)
- Shopping list service in `app/services/shopping_list_service.py` (lines 257-305)
- Document service for cover attachment handling in `app/services/document_service.py` (lines 588-605)
- Health check implementation in `app/api/health.py` (lines 22-62)
- Database migration checking in `app/database.py` (lines 86-99)
- Frontend usage patterns in `/work/frontend/src/hooks/` and `/work/frontend/src/components/parts/`

### Key Findings

**Current N+1 patterns identified:**
1. `/api/parts/{part_key}/kits` called 791 times (one per part) - fetches kit memberships individually
2. `/api/parts/shopping-list-memberships/query` exists as bulk endpoint but requires separate POST call
3. Cover attachment URLs require accessing the relationship `part.cover_attachment` then constructing URLs
4. `/api/parts/with-locations` is separate from `/api/parts` - duplicates most logic

**Health check issues:**
- `check_db_connection()` makes 1 query (line 40 in `app/database.py`)
- `get_pending_migrations()` makes 3 queries: checking alembic_version table existence, reading current revision, computing pending migrations (lines 86-99)
- Health check called ~300 times in 3 minutes = ~100/minute

**Existing bulk patterns:**
- Shopping list membership query already supports bulk lookups via POST `/api/parts/shopping-list-memberships/query` (lines 272-316 in `app/api/parts.py`)
- Kit reservation service has `get_reservations_by_part_ids()` for bulk lookups (lines 41-59 in `app/services/kit_reservation_service.py`)

**Architecture patterns:**
- Services use dependency injection via `ServiceContainer`
- API layer delegates to services with `@inject` decorator
- Responses use Pydantic schemas with `from_attributes=True` for ORM integration
- Inventory service already has methods for parts with/without locations

### Areas of Special Interest

**Cover URL computation:**
- Part model has `cover_attachment_id` (line 51-53 in `app/models/part.py`)
- Cover attachment relationship is selectin loaded (lines 103-108)
- Document service has `get_part_cover_attachment()` but requires DB query per part
- Need to compute `/api/attachments/{id}` and `/api/attachments/{id}/thumbnail` URLs without additional queries

**Kit membership caching:**
- `KitReservationService` has internal `_usage_cache` (line 39 in `app/services/kit_reservation_service.py`)
- Cache populated lazily via `_ensure_usage_cache()` (lines 119-179)
- Single query fetches all kit reservations for multiple parts

**Shopping list bulk query:**
- Existing endpoint at `/api/parts/shopping-list-memberships/query` (lines 272-316)
- Uses `shopping_list_service.list_part_memberships_bulk()` (lines 257-305 in `app/services/shopping_list_service.py`)
- Already optimized with single query for multiple parts

### Conflicts and Resolutions

**Conflict: Include parameter vs separate endpoints**
- Frontend currently uses `/api/parts/with-locations` which is a complete separate endpoint
- Resolution: Use `include` query parameter to consolidate, making location data optional

**Conflict: POST vs GET for bulk queries**
- Shopping list memberships use POST for bulk query (list of part keys in body)
- Resolution: Keep GET for main endpoint, compute optional includes from part IDs in result set

**Conflict: Response schema compatibility**
- `PartWithTotalSchema` vs `PartWithTotalAndLocationsSchema` are separate schemas
- Resolution: Extend base schema conditionally based on include parameter, maintain backward compatibility

---

## 1) Intent & Scope

**User intent**

Eliminate N+1 query patterns in the parts list API by consolidating optional data (locations, kit memberships, shopping list memberships, cover URLs) into a single endpoint with selective inclusion via query parameters. Reduce health check database overhead by caching migration status or reducing query count.

**Prompt quotes**

"The frontend makes separate API calls for each part's kit membership, cover image, and shopping list membership, creating a cascade of requests that slows the application significantly during concurrent operations."

"Reduce per-part API calls from 3-4 to 0 for list views"

"Reduce health check DB queries from 4 to 2"

**In scope**

- Add `include` query parameter to `GET /api/parts` supporting: `locations`, `kits`, `shopping_lists`, `cover`
- Remove `GET /api/parts/with-locations` endpoint (replaced by `include=locations`)
- Add `cover_url` and `cover_thumbnail_url` fields to part response schemas when cover attachment exists
- Extend `InventoryService.get_all_parts_with_totals()` to support optional bulk loading of kit/shopping list data
- Create new service methods for bulk kit and shopping list membership loading
- Optimize health check to reduce database queries from 4 to 1-2
- Update API tests for consolidated endpoint
- Update service tests for new bulk methods

**Out of scope**

- Removing individual endpoints (`/api/parts/{key}/kits`, `/api/parts/{key}/shopping-list-memberships`) - kept for detail views
- Changing pagination limits or offset behavior
- Modifying database schema or migrations
- Caching strategies beyond health check optimization
- Frontend refactoring (documented separately)

**Assumptions / constraints**

- Frontend will migrate to use `include` parameter instead of separate endpoints
- Existing individual part endpoints remain for detail page compatibility
- Response schemas can be extended without breaking existing consumers
- Health check frequency (~100/minute) justifies caching approach
- Migration status doesn't change during runtime (safe to cache briefly)

---

## 2) Affected Areas & File Map

**API Layer**

- Area: `app/api/parts.py` - Main parts list endpoint
- Why: Add include parameter handling, compute cover URLs, remove with-locations endpoint
- Evidence: `app/api/parts.py:111-133` - Current list_parts endpoint without optional data

- Area: `app/api/parts.py` - Parts with locations endpoint (removal)
- Why: Deprecated by include=locations parameter
- Evidence: `app/api/parts.py:136-170` - list_parts_with_locations duplicates list_parts logic

- Area: `app/api/health.py` - Readiness check endpoint
- Why: Optimize database queries from 4 to 1-2
- Evidence: `app/api/health.py:36-54` - check_db_connection() and get_pending_migrations() called sequentially

**Service Layer**

- Area: `app/services/inventory_service.py` - get_all_parts_with_totals method
- Why: Extend to optionally bulk-load kit and shopping list memberships
- Evidence: `app/services/inventory_service.py:293-323` - Current implementation fetches only parts and totals

- Area: `app/services/kit_reservation_service.py` - Bulk kit lookup
- Why: Expose existing get_reservations_by_part_ids for API layer
- Evidence: `app/services/kit_reservation_service.py:41-59` - Already supports bulk lookups with caching

- Area: `app/services/shopping_list_service.py` - Bulk shopping list lookup
- Why: Reuse list_part_memberships_bulk for include parameter
- Evidence: `app/services/shopping_list_service.py:257-305` - Existing bulk method for multiple parts

**Schema Layer**

- Area: `app/schemas/part.py` - PartWithTotalSchema and PartWithTotalAndLocationsSchema
- Why: Add optional fields for kits, shopping lists, cover URLs
- Evidence: `app/schemas/part.py:395-529` - Current schemas lack kit/shopping list/cover URL fields

- Area: `app/schemas/part_kits.py` - Kit membership schema (if exists)
- Why: Reuse for nested kit data in part response
- Evidence: `app/api/parts.py:23` - Import of PartKitUsageSchema

**Database Layer**

- Area: `app/database.py` - get_pending_migrations function
- Why: Optimize to reduce query count, potentially add caching
- Evidence: `app/database.py:86-99` - Makes 3 separate queries for migration status

**Container/DI Layer**

- Area: `app/services/container.py` - Service wiring
- Why: Inject kit_reservation_service and shopping_list_service into InventoryService for bulk loading
- Evidence: `app/services/container.py:114-119` - Current InventoryService factory only receives `part_service` and `metrics_service`

**Required container update:**
```python
inventory_service = providers.Factory(
    InventoryService,
    db=db_session,
    part_service=part_service,
    metrics_service=metrics_service,
    kit_reservation_service=kit_reservation_service,  # NEW
    shopping_list_service=shopping_list_service,      # NEW
)
```

- Area: `app/services/inventory_service.py` - Constructor signature
- Why: Accept new injected dependencies for bulk loading
- Evidence: `app/services/inventory_service.py:26-35` - Current `__init__` needs additional parameters

**Test Layer**

- Area: `tests/test_api/test_parts.py` - Parts API tests
- Why: Add tests for include parameter, remove with-locations tests, verify cover URLs
- Evidence: Need to add comprehensive coverage for new query parameters

- Area: `tests/test_services/test_inventory_service.py` - Inventory service tests
- Why: Test new bulk loading methods for kits and shopping lists
- Evidence: Need to verify bulk operations with various include combinations

- Area: `tests/test_api/test_health.py` - Health check tests
- Why: Verify optimized query count, test caching behavior
- Evidence: Need to ensure health check still validates migrations correctly

---

## 3) Data Model / Contracts

**Enhanced Part List Response (with includes)**

- Entity / contract: PartWithTotalSchema extension
- Shape:
  ```json
  {
    "key": "ABCD",
    "manufacturer_code": "OMRON G5Q-1A4",
    "description": "12V relay",
    "type_id": 5,
    "total_quantity": 150,
    "has_cover_attachment": true,
    // New optional fields based on include parameter:
    "cover_url": "/api/attachments/123",           // if include=cover
    "cover_thumbnail_url": "/api/attachments/123/thumbnail",  // if include=cover
    "locations": [                                  // if include=locations
      {"box_no": 7, "loc_no": 3, "qty": 100},
      {"box_no": 8, "loc_no": 12, "qty": 50}
    ],
    "kits": [                                       // if include=kits
      {
        "kit_id": 42,
        "kit_name": "ESP32 Dev Board",
        "status": "active",
        "build_target": 10,
        "required_per_unit": 2,
        "reserved_quantity": 20,
        "updated_at": "2024-01-15T10:30:00Z"
      }
    ],
    "shopping_lists": [                             // if include=shopping_lists
      {
        "shopping_list_id": 5,
        "shopping_list_name": "Q1 2024 Order",
        "shopping_list_status": "ready",
        "line_id": 123,
        "line_status": "new",
        "needed": 50,
        "ordered": 0,
        "received": 0,
        "note": "Urgent",
        "seller": {"id": 1, "name": "DigiKey", "website": "digikey.com"}
      }
    ]
  }
  ```
- Refactor strategy: Add all new fields as `Optional` with `default=None` to `PartWithTotalSchema`. Fields are always present in response but null when not requested via include parameter. This approach:
  - Maintains backward compatibility (clients ignoring unknown fields won't break)
  - Simplifies Spectree validation (single schema for all include combinations)
  - Avoids dynamic schema selection complexity
- Evidence: `app/schemas/part.py:395-497` (PartWithTotalSchema), `app/api/parts.py:191-213` (PartKitUsageSchema pattern)

**Query Parameter Contract**

- Entity / contract: GET /api/parts query parameters
- Shape:
  ```
  GET /api/parts?limit=50&offset=0&type_id=5&include=locations,kits,shopping_lists,cover

  include: comma-separated list of optional data
    - "locations": include part_locations array
    - "kits": include kit membership array
    - "shopping_lists": include shopping list membership array
    - "cover": include cover_url and cover_thumbnail_url
  ```
- Refactor strategy: Parse include parameter, validate against allowed values, pass flags to service layer
- Evidence: `app/api/parts.py:117-119` - Current parameter parsing pattern (limit, offset, type_id)

**Health Check Response (no change)**

- Entity / contract: HealthResponse schema
- Shape: Unchanged - same response format, different implementation
- Refactor strategy: Optimize internal queries without changing external contract
- Evidence: `app/api/health.py:22-62` - Current response format maintained

---

## 4) API / Integration Surface

**Consolidated Parts List Endpoint**

- Surface: GET /api/parts?include=locations,kits,shopping_lists,cover
- Inputs:
  - `limit` (int, default 50): Page size
  - `offset` (int, default 0): Page offset
  - `type_id` (int, optional): Filter by part type
  - `include` (string, optional): Comma-separated list of optional data to include
    - Valid values: `locations`, `kits`, `shopping_lists`, `cover`
    - Invalid values return 400 with error message
- Outputs:
  - 200: Array of PartWithTotalSchema with conditional fields based on include
  - 400: Invalid include parameter value
- Errors:
  - 400 if include contains unrecognized values
  - 500 for database errors (propagated via handle_api_errors)
- Evidence: `app/api/parts.py:111-133` - Current endpoint structure

**Deprecated Endpoint (removal)**

- Surface: GET /api/parts/with-locations
- Inputs: N/A (endpoint removed)
- Outputs: 404 after removal
- Errors: Endpoint will no longer exist
- Evidence: `app/api/parts.py:136-170` - To be removed

**Optimized Health Check**

- Surface: GET /api/health/readyz
- Inputs: None (query parameters unchanged)
- Outputs:
  - 200: {"status": "ready", "ready": true, "database": {"connected": true}, "migrations": {"pending": 0}}
  - 503: {"status": "database unavailable|migrations pending|shutting down", "ready": false, ...}
- Errors: No new error modes, same contract
- Evidence: `app/api/health.py:22-62` - Response format maintained

---

## 5) Algorithms & State Machines

**Include Parameter Processing**

- Flow: Parse and validate include parameter
- Steps:
  1. Parse `include` query parameter (default empty string)
  2. **DoS protection**: If length > 200 characters, raise 400 immediately
  3. Split on comma, strip whitespace from each token
  4. **DoS protection**: If token count > 10, raise 400 immediately
  5. Validate each token against allowed set: `{"locations", "kits", "shopping_lists", "cover"}`
  6. Raise 400 if any unrecognized token found
  7. Return set of include flags: `{include_locations, include_kits, include_shopping_lists, include_cover}`
- States / transitions: None (stateless validation)
- Hotspots: Validation happens per request, minimal overhead; DoS checks prevent excessive CPU usage
- Evidence: `app/api/parts.py:117-119` - Similar parameter parsing pattern

**Bulk Parts Data Aggregation**

- Flow: Fetch parts with optional related data
- Steps:
  1. Fetch parts with total quantities (existing logic from `get_all_parts_with_totals`)
  2. Extract part IDs from result set
  3. If `include_kits`: Call `kit_reservation_service.get_reservations_by_part_ids(part_ids)` → dict[part_id, list[KitReservationUsage]]
  4. If `include_shopping_lists`: Call `shopping_list_service.list_part_memberships_bulk(part_ids)` → dict[part_id, list[ShoppingListLine]]
  5. If `include_cover`: No additional query needed, compute URLs from `part.cover_attachment_id`
  6. If `include_locations`: Already loaded in part._part_locations_data (existing pattern)
  7. Iterate parts, attach optional data from dicts using part.id as key
  8. Return enriched parts list
- States / transitions: None (single-pass aggregation)
- Hotspots:
  - Kit/shopping list bulk queries scale with number of unique part IDs (bounded by page size)
  - Cover URL computation is O(n) string formatting, negligible
- Evidence: `app/services/inventory_service.py:325-353` - Existing locations aggregation pattern

**Health Check Optimization**

- Flow: Two-query migration check (reduced from 4)
- Steps:
  1. Check shutdown coordinator status (existing, no DB)
  2. Execute DB connectivity check: `SELECT 1` - confirms database is reachable
  3. If connectivity check fails: return 503 database unavailable
  4. Execute migration check: `SELECT version_num FROM alembic_version LIMIT 1`
     - If table missing (exception): treat as "no migrations applied" → pending
     - If returns NULL: treat as "no migrations applied" → pending
     - If returns version: compare to head revision
  5. Get head revision from ScriptDirectory (uses existing connection context, not additional query to DB)
  6. If current_rev != head_rev: return 503 migrations pending with count
  7. Return 200 ready
- States / transitions: None (stateless check)
- Hotspots: 2 queries replaces 4 separate queries (50% reduction)
- Error handling:
  - Missing alembic_version table: caught via exception, returns "migrations pending"
  - NULL version_num: returns "migrations pending"
  - Connection failure: returns "database unavailable"
- Evidence: `app/database.py:36-44, 63-83, 86-99` - Current multi-query pattern

---

## 6) Derived State & Invariants

**Cover URL Derivation**

- Derived value: `cover_url` and `cover_thumbnail_url` strings
  - Source: Unfiltered `part.cover_attachment_id` from Part ORM model (line 51-53 in `app/models/part.py`)
  - Writes / cleanup: No persistence - read-only URL formatting
  - Guards: Only compute if `include_cover=True` and `cover_attachment_id is not None`
  - Invariant: If `cover_attachment_id` exists, attachment record must exist in database (enforced by foreign key constraint)
  - Evidence: `app/models/part.py:51-53` (FK constraint), `app/api/parts.py:45-78` (_convert_part_to_schema_data pattern)

**Kit Membership Aggregation**

- Derived value: Array of kit reservations per part
  - Source: Filtered active kits only (`Kit.status == KitStatus.ACTIVE`) from `kit_reservation_service.get_reservations_by_part_ids()`
  - Writes / cleanup: No persistence - read-only aggregation from kit_contents and kits tables
  - Guards: Only fetch if `include_kits=True`, cached within service instance
  - Cache scope: Request-scoped because `kit_reservation_service` is Factory-provided (new instance per request). If changed to Singleton in future, cache invalidation on kit updates would be required.
  - Invariant: Reserved quantity = `required_per_unit * build_target` for active kits only
  - Evidence: `app/services/kit_reservation_service.py:41-59, 119-153` (bulk query with active filter), `app/services/container.py:120-123` (Factory provider)

**Shopping List Membership Aggregation**

- Derived value: Array of shopping list lines per part
  - Source: Filtered non-done lines from `shopping_list_service.list_part_memberships_bulk(include_done=False)`
  - Writes / cleanup: No persistence - read-only aggregation from shopping_list_lines table
  - Guards: Only fetch if `include_shopping_lists=True`, default to `include_done=False`
  - Invariant: Only returns lines where `line.status != DONE` and `shopping_list.status != DONE`
  - Evidence: `app/services/shopping_list_service.py:257-305` (bulk query with done filter)

**Location Data Attachment**

- Derived value: Array of locations per part
  - Source: Unfiltered `part_locations` joined via `part.id`
  - Writes / cleanup: No persistence - read-only aggregation existing in `get_all_parts_with_totals_and_locations`
  - Guards: Only fetch if `include_locations=True`
  - Invariant: Sum of location quantities equals total_quantity per part
  - Evidence: `app/services/inventory_service.py:325-353` (existing locations aggregation)

---

## 7) Consistency, Transactions & Concurrency

**Transaction Scope**

- Transaction scope: Read-only queries, no transaction required beyond default session isolation
- Atomic requirements: None - all operations are SELECT queries
- Retry / idempotency: Endpoint is naturally idempotent (GET request, no writes)
- Ordering / concurrency controls: No locking needed, reads use snapshot isolation
- Evidence: `app/api/parts.py:111-133` (existing read-only pattern)

**Health Check Transaction**

- Transaction scope: Single SELECT query within default session, no explicit transaction needed
- Atomic requirements: None - read-only migration status check
- Retry / idempotency: Idempotent by nature (GET endpoint, no writes)
- Ordering / concurrency controls: No locking needed
- Evidence: `app/database.py:36-44` (existing check_db_connection pattern)

---

## 8) Errors & Edge Cases

**Invalid Include Parameter**

- Failure: User provides unrecognized include value (e.g., `include=invalid,locations`)
- Surface: GET /api/parts
- Handling: Return 400 Bad Request with error message listing valid options
- Guardrails: Validate against whitelist `{"locations", "kits", "shopping_lists", "cover"}`, reject entire request if any invalid token
- Evidence: Similar validation pattern in `app/api/parts.py:117-119` for type_id

**Include Parameter Length/DoS Protection**

- Failure: Include parameter exceeds reasonable length (e.g., thousands of comma-separated tokens)
- Surface: GET /api/parts parameter parsing
- Handling: Return 400 "Invalid include parameter: exceeds maximum length" before parsing
- Guardrails:
  - Check `len(request.args.get('include', ''))` before split
  - Reject if >200 characters
  - Reject if token count >10 after split
- Evidence: Defensive validation to prevent CPU exhaustion during parameter parsing

**Missing Cover Attachment**

- Failure: Part has `cover_attachment_id` set but attachment record deleted (orphaned FK)
- Surface: GET /api/parts?include=cover
- Handling: Foreign key constraint prevents orphaned IDs; if constraint violated, `cover_url` fields omitted or set to null
- Guardrails: Database FK constraint on `parts.cover_attachment_id`, validation in schema serialization
- Evidence: `app/models/part.py:51-53` (FK constraint with use_alter)

**Empty Parts List**

- Failure: No parts match filters (type_id, pagination beyond end)
- Surface: GET /api/parts
- Handling: Return 200 with empty array `[]`
- Guardrails: Normal behavior, no special handling needed
- Evidence: `app/api/parts.py:111-133` (returns empty list naturally)

**Health Check During Migration**

- Failure: Migration in progress, alembic_version table locked or missing
- Surface: GET /api/health/readyz
- Handling: Return 503 "database unavailable" if query fails, or 503 "migrations pending" if version mismatch detected
- Guardrails: Exception handling around combined query, fallback to unavailable status
- Evidence: `app/api/health.py:36-54` (existing error handling pattern)

**Pagination Exceeds Part Count**

- Failure: `offset` beyond total parts count
- Surface: GET /api/parts?offset=10000
- Handling: Return 200 with empty array (standard pagination behavior)
- Guardrails: SQL LIMIT/OFFSET handles gracefully
- Evidence: `app/services/inventory_service.py:310` (existing pagination)

---

## 9) Observability / Telemetry

**Parts List Include Usage**

- Signal: `parts_list_include_parameter_usage`
- Type: Counter with labels
- Trigger: Each GET /api/parts request, increment counter with labels for each include flag used
- Labels / fields:
  - `include_locations`: bool
  - `include_kits`: bool
  - `include_shopping_lists`: bool
  - `include_cover`: bool
  - `has_type_filter`: bool
- Consumer: Prometheus dashboard showing include parameter adoption, guides deprecation timeline for /with-locations
- Evidence: `app/services/metrics_service.py` (existing metrics infrastructure)

**Health Check Query Duration**

- Signal: `health_check_duration_seconds`
- Type: Histogram
- Trigger: Start/end of readyz endpoint, record total duration
- Labels / fields:
  - `status`: ready|migrations_pending|db_unavailable|shutting_down
  - `query_count`: int (track reduction from 4 to 1-2)
- Consumer: Alerts if p95 latency exceeds threshold, validates optimization impact
- Evidence: `app/api/health.py:22-62` (endpoint to instrument)

**Bulk Query Performance**

- Signal: `parts_bulk_query_duration_seconds`
- Type: Histogram
- Trigger: Start/end of each bulk include query (kits, shopping_lists)
- Labels / fields:
  - `query_type`: kits|shopping_lists|locations
  - `part_count`: int (number of parts in batch)
- Consumer: Monitor query performance as dataset grows, detect N+1 regressions
- Evidence: `app/services/kit_reservation_service.py:119-153` (bulk query to instrument)

**Deprecated Endpoint Access**

- Signal: `deprecated_endpoint_access`
- Type: Counter
- Trigger: Increment if /api/parts/with-locations accessed (before removal)
- Labels / fields:
  - `endpoint`: with-locations
  - `user_agent`: string (track frontend vs scripts)
- Consumer: Monitor usage before removal, identify clients needing migration
- Evidence: `app/api/parts.py:136-170` (endpoint to deprecate)

---

## 10) Background Work & Shutdown

No background workers, threads, or async jobs introduced by this feature. All operations are synchronous request/response cycles.

- Worker / job: None
- Trigger cadence: N/A
- Responsibilities: N/A
- Shutdown handling: N/A
- Evidence: N/A

---

## 11) Security & Permissions

No authentication or authorization changes. Endpoints remain publicly accessible within the single-user application context.

- Concern: Rate limiting on health check endpoint
- Touchpoints: GET /api/health/readyz called ~100/minute
- Mitigation: Optimize to reduce DB load (covered in main plan); rate limiting not required for single-user app
- Residual risk: Health check could be abused for DoS if exposed publicly; acceptable for private deployment
- Evidence: `app/api/health.py:22-62` (publicly accessible endpoint)

---

## 12) UX / UI Impact

Backend changes only. Frontend impact documented separately in `frontend_changes.md`.

---

## 13) Deterministic Test Plan

**Service Layer - Inventory Service**

- Surface: `InventoryService.get_all_parts_with_totals()` extended with include flags
- Scenarios:
  - Given 3 parts with varying kit memberships, When called with `include_kits=True`, Then kits array populated for parts with memberships, empty for others (`tests/test_services/test_inventory_service.py::test_get_parts_with_kits`)
  - Given 5 parts with shopping list memberships, When called with `include_shopping_lists=True`, Then shopping_lists array populated correctly (`tests/test_services/test_inventory_service.py::test_get_parts_with_shopping_lists`)
  - Given 2 parts with cover attachments, When called with `include_cover=True`, Then cover_url and cover_thumbnail_url fields present (`tests/test_services/test_inventory_service.py::test_get_parts_with_cover_urls`)
  - Given 10 parts, When called with all includes enabled, Then all optional fields populated in single call (`tests/test_services/test_inventory_service.py::test_get_parts_with_all_includes`)
  - Given 0 parts, When called with any includes, Then returns empty list without errors (`tests/test_services/test_inventory_service.py::test_get_parts_empty_with_includes`)
- Fixtures / hooks: Existing fixtures for parts, boxes, locations; add kit and shopping list fixtures
- Gaps: None
- Evidence: `app/services/inventory_service.py:293-353` (method to extend)

**API Layer - Parts Endpoint**

- Surface: GET /api/parts with include parameter
- Scenarios:
  - Given include=locations, When called, Then response includes locations array (`tests/test_api/test_parts.py::test_list_parts_include_locations`)
  - Given include=kits, When called, Then response includes kits array for parts in active kits (`tests/test_api/test_parts.py::test_list_parts_include_kits`)
  - Given include=shopping_lists, When called, Then response includes shopping_lists array (`tests/test_api/test_parts.py::test_list_parts_include_shopping_lists`)
  - Given include=cover, When called, Then response includes cover_url and cover_thumbnail_url (`tests/test_api/test_parts.py::test_list_parts_include_cover`)
  - Given include=locations,kits,shopping_lists,cover, When called, Then all optional data included (`tests/test_api/test_parts.py::test_list_parts_include_all`)
  - Given include=invalid, When called, Then returns 400 with error message (`tests/test_api/test_parts.py::test_list_parts_invalid_include`)
  - Given no include parameter, When called, Then response matches original schema without optional fields (`tests/test_api/test_parts.py::test_list_parts_no_include_backwards_compatible`)
- Fixtures / hooks: API client fixture, database fixtures for parts/kits/shopping lists
- Gaps: None
- Evidence: `app/api/parts.py:111-133` (endpoint to modify)

**API Layer - Deprecated Endpoint Removal**

- Surface: GET /api/parts/with-locations
- Scenarios:
  - Given endpoint exists, When accessed, Then returns 404 after removal (`tests/test_api/test_parts.py::test_with_locations_endpoint_removed`)
- Fixtures / hooks: API client fixture
- Gaps: None
- Evidence: `app/api/parts.py:136-170` (endpoint to remove)

**API Layer - Health Check Optimization**

- Surface: GET /api/health/readyz
- Scenarios:
  - Given healthy database with current migrations, When called, Then returns 200 ready with single DB query (`tests/test_api/test_health.py::test_readyz_optimized_query_count`)
  - Given pending migrations, When called, Then returns 503 migrations pending (`tests/test_api/test_health.py::test_readyz_migrations_pending_optimized`)
  - Given database unavailable, When called, Then returns 503 database unavailable (`tests/test_api/test_health.py::test_readyz_db_unavailable`)
  - Given shutdown in progress, When called, Then returns 503 shutting down (`tests/test_api/test_health.py::test_readyz_shutdown_optimized`)
- Fixtures / hooks: Mock database connection, migration fixtures
- Gaps: None
- Evidence: `app/api/health.py:22-62` (endpoint to optimize)

**Service Layer - Kit Reservation Bulk**

- Surface: `KitReservationService.get_reservations_by_part_ids()`
- Scenarios:
  - Given 5 part IDs with mixed kit memberships, When called, Then returns dict with correct reservations per part (`tests/test_services/test_kit_reservation_service.py::test_bulk_reservations`)
  - Given empty part ID list, When called, Then returns empty dict without errors (`tests/test_services/test_kit_reservation_service.py::test_bulk_reservations_empty`)
  - Given archived kits, When called, Then excludes archived kits from results (`tests/test_services/test_kit_reservation_service.py::test_bulk_reservations_excludes_archived`)
- Fixtures / hooks: Kit fixtures, part fixtures with reservations
- Gaps: None
- Evidence: `app/services/kit_reservation_service.py:41-59` (existing method to test)

**Service Layer - Shopping List Bulk**

- Surface: `ShoppingListService.list_part_memberships_bulk()`
- Scenarios:
  - Given 3 part IDs with shopping list memberships, When called with include_done=False, Then returns only non-done memberships (`tests/test_services/test_shopping_list_service.py::test_bulk_memberships_exclude_done`)
  - Given same parts with include_done=True, When called, Then returns all memberships (`tests/test_services/test_shopping_list_service.py::test_bulk_memberships_include_done`)
  - Given empty part ID list, When called, Then returns empty dict (`tests/test_services/test_shopping_list_service.py::test_bulk_memberships_empty`)
- Fixtures / hooks: Shopping list fixtures, line fixtures
- Gaps: None
- Evidence: `app/services/shopping_list_service.py:257-305` (existing method to test)

---

## 14) Implementation Slices

**Slice 1: Health Check Optimization**

- Goal: Reduce health check DB queries from 4 to 2-2, validate with tests
- Touches:
  - `app/database.py` - Modify `check_db_connection()` and `get_pending_migrations()` to use combined query
  - `app/api/health.py` - Update readyz to use optimized checks
  - `tests/test_api/test_health.py` - Add query count assertions
- Dependencies: None (standalone optimization)

**Slice 2: Schema Extensions for Optional Fields**

- Goal: Extend PartWithTotalSchema with optional kit/shopping list/cover fields
- Touches:
  - `app/schemas/part.py` - Add optional fields to PartWithTotalSchema and PartWithTotalAndLocationsSchema
  - `app/schemas/part_kits.py` - Ensure PartKitUsageSchema is reusable in nested context
  - `app/schemas/part_shopping_list.py` - Ensure PartShoppingListMembershipSchema is reusable
- Dependencies: None (schema-only changes)

**Slice 3: Service Layer Bulk Methods**

- Goal: Implement bulk loading for kits and shopping lists in InventoryService
- Touches:
  - `app/services/inventory_service.py` - Extend get_all_parts_with_totals to accept include flags, call bulk services
  - `tests/test_services/test_inventory_service.py` - Add tests for bulk include scenarios
  - `tests/test_services/test_kit_reservation_service.py` - Validate existing bulk method
  - `tests/test_services/test_shopping_list_service.py` - Validate existing bulk method
- Dependencies: Slice 2 (schema extensions)

**Slice 4: API Endpoint Consolidation**

- Goal: Add include parameter to GET /api/parts, deprecate /with-locations with instrumentation
- Touches:
  - `app/api/parts.py` - Add include parameter parsing, call service with flags, compute cover URLs
  - `app/api/parts.py` - Add deprecation counter and warning header to /with-locations BEFORE removal (monitor 1-2 weeks before removing)
  - `app/services/metrics_service.py` - Add `deprecated_endpoint_access` counter for /with-locations
  - `tests/test_api/test_parts.py` - Add include parameter tests, test deprecation warning
- Dependencies: Slice 3 (service layer bulk methods)

**Slice 5: Metrics, Observability, and Endpoint Removal**

- Goal: Add telemetry for include parameter usage, query performance, and remove deprecated endpoint after monitoring
- Touches:
  - `app/services/metrics_service.py` - Add metrics for include usage, bulk query duration
  - `app/api/parts.py` - Instrument include parameter usage, REMOVE /with-locations after confirming zero traffic
  - `app/api/health.py` - Instrument health check duration
  - `tests/test_api/test_parts.py` - Remove /with-locations tests, add endpoint removal test
- Dependencies: Slice 4 (endpoint changes complete), monitoring period confirming no traffic to deprecated endpoint

---

## 15) Risks & Open Questions

**Risk: Frontend migration coordination**

- Risk: Frontend continues using /api/parts/with-locations after backend removal
- Impact: Breaking change for deployed frontend
- Mitigation: Implement include parameter first, deploy backend, verify frontend migration via metrics, then remove deprecated endpoint in separate deployment
- Evidence: Requires coordination with frontend team, phased rollout

**Risk: Include parameter performance with large datasets**

- Risk: Bulk queries for kits/shopping lists slow down with thousands of parts
- Impact: Response time degradation for parts list
- Mitigation: Pagination already limits part count per query; bulk methods use indexed joins; monitor with bulk_query_duration metric
- Evidence: `app/services/kit_reservation_service.py:130-153` (uses indexed joins on part_id and kit status)

**Risk: Health check caching staleness**

- Risk: Brief caching (if implemented) could miss rapid migration state changes
- Impact: False "ready" status if migration applied between cache refresh
- Mitigation: Keep cache TTL very short (5-10s) or eliminate caching in favor of optimized query
- Evidence: Migrations are rare events; momentary staleness acceptable for health checks

**Open Question: Should cover URLs always be included?**

- Question: Cover URLs are cheap to compute (no DB query), should they be included by default vs requiring include=cover?
- Why it matters: Affects API design consistency and frontend migration effort
- Owner / follow-up: Product decision - if cover images shown in all list views, default inclusion makes sense; otherwise keep as opt-in
- Evidence: `app/models/part.py:51-53` (cover_attachment_id already loaded), URL computation is O(n) string formatting

**Open Question: Include parameter as comma-separated string vs repeated parameters?**

- Question: Use `include=locations,kits` vs `include=locations&include=kits`?
- Why it matters: Affects parsing logic and API documentation
- Owner / follow-up: Comma-separated is more compact and common in REST APIs; chosen in this plan
- Evidence: Common pattern in GraphQL-like APIs (e.g., Stripe, GitHub)

---

## 16) Confidence

Confidence: High — Health check optimization reduces queries from 4 to 2 with proper error handling. Include parameter implementation follows established patterns for bulk queries (kit/shopping list services already support this). Service dependency injection wiring is explicitly documented. Schema backward compatibility is achieved via Optional fields with default=None. DoS protection prevents parameter abuse. Main risk is frontend migration coordination, mitigated by phased rollout with deprecated endpoint instrumentation before removal. Test coverage will validate all include combinations and error cases.
