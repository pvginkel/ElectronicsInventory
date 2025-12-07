# Parts Endpoint Consolidation — Plan Review

## 1) Summary & Decision

**Readiness**

The plan demonstrates thorough research and proposes a sensible consolidation strategy for the parts list endpoint. The core approach—using an include parameter to aggregate optional data (locations, kits, shopping lists, cover URLs)—aligns well with established bulk query patterns already present in the codebase. However, several critical gaps exist around service layer dependency injection wiring, response schema backward compatibility, and health check optimization correctness that must be resolved before implementation can proceed safely.

**Decision**

GO-WITH-CONDITIONS — The plan requires clarification on service dependency wiring, explicit schema evolution strategy, and health check query optimization before implementation. The core design is sound, but implementation details need tightening to avoid runtime injection failures and API contract breaks.

---

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `CLAUDE.md` (Code Organization Patterns) — Pass — `plan.md:550-607` — Service and API test coverage follows required patterns with Given/When/Then scenarios, fixtures identified, and comprehensive edge case testing.
- `CLAUDE.md` (API Layer Pattern) — Pass — `plan.md:119-133` — API endpoint delegates to service layer with `@inject` decorator and `@handle_api_errors`, validates with Pydantic schemas.
- `CLAUDE.md` (Service Layer Pattern) — Fail — `plan.md:133-147` — Plan does not specify how `InventoryService` will receive injected `kit_reservation_service` and `shopping_list_service`; current `ServiceContainer` (lines 114-119 in `app/services/container.py`) shows `InventoryService` only receives `part_service` and `metrics_service`.
- `CLAUDE.md` (Dependency Injection) — Fail — `plan.md:164-167` — Plan mentions "verify current wiring supports needed dependencies" as TODO without resolution; this is a blocker for service layer implementation.
- `docs/product_brief.md` — Pass — `plan.md:74-88` — Scope aligns with single-user app model, focuses on performance optimization without changing core inventory functionality.

**Fit with codebase**

- `app/services/inventory_service.py` — `plan.md:133-147` — Assumes `InventoryService` can call `kit_reservation_service.get_reservations_by_part_ids()` and `shopping_list_service.list_part_memberships_bulk()`, but current service constructor (lines 114-119 in `container.py`) does not inject these dependencies. Plan must specify either adding dependencies to constructor or accessing them via container reference.
- `app/schemas/part.py` — `plan.md:149-156` — Plan proposes "extending" `PartWithTotalSchema` with optional fields but doesn't clarify if this means subclassing or conditional field population. The existing `PartWithTotalAndLocationsSchema` (lines 519-529) uses inheritance; plan needs to specify whether new fields are added to base schema (breaks backward compatibility) or a new response schema is introduced.
- `app/database.py` — `plan.md:159-162` — Optimization from 4 queries to "1-2" is vague; the health check currently makes: 1) `check_db_connection()` (1 query), 2) `get_current_revision()` (2 queries: table existence check + SELECT), 3) `get_pending_migrations()` calls `get_current_revision()` again. The combined query approach in section 5 claims single query but doesn't account for ScriptDirectory overhead.

---

## 3) Open Questions & Ambiguities

- Question: How will `InventoryService` access `kit_reservation_service` and `shopping_list_service` when they are not injected via constructor?
- Why it matters: Implementation will fail at runtime with attribute errors if dependencies aren't wired; this blocks slice 3 (service layer bulk methods).
- Needed answer: Either update `ServiceContainer` to inject both services into `InventoryService.__init__()`, or specify that `InventoryService` receives the container itself and resolves dependencies on-demand via `self.container.kit_reservation_service()`.

- Question: Are cover URLs (`cover_url`, `cover_thumbnail_url`) added to the base `PartWithTotalSchema` or to a new response schema variant?
- Why it matters: Adding fields to base schema breaks backward compatibility for clients not using `include=cover`; existing tests expect fixed schema shape.
- Needed answer: Clarify whether response schema varies based on include parameter (dynamic schema selection) or optional fields are always present but null when not requested.

- Question: What happens to the existing `/api/parts/{part_key}/kits` endpoint used on detail pages?
- Why it matters: Plan states these endpoints remain for "detail views" but doesn't specify if they continue using existing service methods or migrate to bulk methods.
- Needed answer: Confirm individual part endpoints retain current implementation or migrate to call bulk methods with single part ID.

- Question: Should the deprecated `/api/parts/with-locations` endpoint return 410 Gone instead of 404 Not Found to signal intentional removal?
- Why it matters: HTTP semantics—404 suggests the resource never existed or was mistyped; 410 explicitly signals deprecation.
- Needed answer: Choose appropriate status code for deprecated endpoint removal or retain endpoint with deprecation warning header before removal.

---

## 4) Deterministic Backend Coverage (new/changed behavior only)

- Behavior: `InventoryService.get_all_parts_with_totals()` with include flags
- Scenarios:
  - Given 3 parts in different kits, When called with `include_kits=True`, Then kits array populated for each part with active kit reservations (`tests/test_services/test_inventory_service.py::test_get_parts_with_kits`)
  - Given 5 parts with shopping list memberships in done and active lists, When called with `include_shopping_lists=True`, Then only non-done memberships returned (`tests/test_services/test_inventory_service.py::test_get_parts_with_shopping_lists`)
  - Given 2 parts with cover attachments and 1 without, When called with `include_cover=True`, Then cover URLs populated for parts with attachments, null for others (`tests/test_services/test_inventory_service.py::test_get_parts_with_cover_urls`)
  - Given empty parts result, When called with all includes enabled, Then returns empty list without querying kit/shopping services (`tests/test_services/test_inventory_service.py::test_get_parts_empty_with_includes`)
- Instrumentation: `parts_list_include_parameter_usage` counter, `parts_bulk_query_duration_seconds` histogram for kit/shopping queries
- Persistence hooks: None (read-only operations); no migrations, test data, or S3 changes required
- Gaps: No test scenario for parts page that exceeds kit/shopping list cache warmup (e.g., 200 parts requested, cache holds 100); need to verify pagination doesn't break caching assumptions
- Evidence: `plan.md:539-548` (service test scenarios), `plan.md:456-490` (metrics instrumentation)

- Behavior: GET /api/parts with include parameter
- Scenarios:
  - Given `include=locations,kits`, When called, Then response includes both locations and kits arrays in single request (`tests/test_api/test_parts.py::test_list_parts_include_multiple`)
  - Given `include=invalid,cover`, When called, Then returns 400 with message listing valid include values (`tests/test_api/test_parts.py::test_list_parts_invalid_include`)
  - Given no include parameter, When called, Then response schema matches current PartWithTotalSchema without optional fields (`tests/test_api/test_parts.py::test_list_parts_no_include_backwards_compatible`)
  - Given `include=cover` and part has `cover_attachment_id=None`, When called, Then cover_url and cover_thumbnail_url are null or omitted (`tests/test_api/test_parts.py::test_list_parts_include_cover_null_attachment`)
- Instrumentation: `parts_list_include_parameter_usage` counter incremented per request with labels for each include flag
- Persistence hooks: None required
- Gaps: Missing test for include parameter with type_id filter (e.g., `type_id=5&include=kits`) to verify filters compose correctly; missing test for maximum include parameter length (DoS via long comma-separated string)
- Evidence: `plan.md:552-563` (API test scenarios), `plan.md:456-468` (metrics)

- Behavior: GET /api/health/readyz optimized query
- Scenarios:
  - Given healthy database with current migrations, When called, Then executes single combined query and returns 200 ready (`tests/test_api/test_health.py::test_readyz_optimized_query_count`)
  - Given database with pending migration, When called, Then detects mismatch between current_rev and head_rev, returns 503 migrations pending (`tests/test_api/test_health.py::test_readyz_migrations_pending_optimized`)
  - Given alembic_version table missing, When called, Then combined query returns NULL for current_rev, detects as pending migrations (`tests/test_api/test_health.py::test_readyz_missing_alembic_table`)
- Instrumentation: `health_check_duration_seconds` histogram with `status` and `query_count` labels
- Persistence hooks: None required
- Gaps: Plan claims reduction from 4 queries to 1-2, but doesn't specify which implementation path (1 query vs 2 queries) will be chosen; test scenario needs to assert exact query count
- Evidence: `plan.md:576-584` (health test scenarios), `plan.md:470-479` (metrics)

---

## 5) Adversarial Sweep

**Major — Service Dependency Injection Wiring Not Specified**

**Evidence:** `plan.md:133-147` (InventoryService changes), `plan.md:164-167` (container wiring marked TODO), `app/services/container.py:114-119` (current InventoryService factory)

**Why it matters:** The plan's step 3 algorithm (lines 319-332) requires `InventoryService` to call `self.kit_reservation_service.get_reservations_by_part_ids()` and `self.shopping_list_service.list_part_memberships_bulk()`, but these services are not injected into `InventoryService.__init__()` according to the current container definition. Implementation will fail with `AttributeError: 'InventoryService' object has no attribute 'kit_reservation_service'` when include flags are used.

**Fix suggestion:** Add to section 2 (Affected Areas): Specify that `app/services/container.py` inventory_service provider must be updated to inject `kit_reservation_service` and `shopping_list_service`:
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
And update `InventoryService.__init__()` signature to accept these dependencies.

**Confidence:** High

---

**Major — Response Schema Backward Compatibility Strategy Unclear**

**Evidence:** `plan.md:189-234` (enhanced part list response contract), `plan.md:622-628` (schema extensions slice), `app/schemas/part.py:395-497` (current PartWithTotalSchema)

**Why it matters:** The plan states "extend existing schemas with optional fields" but doesn't specify if optional fields are added directly to `PartWithTotalSchema` (making them always present in the response, just null when not requested) or if the endpoint dynamically selects different schema classes based on include parameter. Adding fields to base schema breaks backward compatibility for strict clients validating response shape; dynamic schema selection complicates Spectree validation decorator.

**Fix suggestion:** In section 3 (Data Model / Contracts), add explicit refactoring decision:
- Option A: Add `cover_url`, `cover_thumbnail_url`, `kits`, `shopping_lists` as Optional fields to `PartWithTotalSchema` with `default=None`; always present in response but null when not included. Update `@api.validate` response spec to document new optional fields.
- Option B: Create new schema `PartWithTotalEnrichedSchema(PartWithTotalSchema)` with additional fields; endpoint returns base schema when no includes, enriched schema when any include used. Requires conditional Spectree response specification.

Recommend Option A for simplicity and forward compatibility (clients ignoring unknown fields won't break).

**Confidence:** High

---

**Major — Health Check Optimization Query Count Ambiguity**

**Evidence:** `plan.md:335-346` (health check optimization algorithm), `plan.md:86` (prompt quote "4 to 1"), `app/database.py:64-84` (get_current_revision makes 2 queries), `app/api/health.py:37-47` (current sequential calls)

**Why it matters:** The plan claims reduction from 4 queries to 1-2, but the algorithm in step 2 (line 339) proposes a single combined query: `SELECT 1 as connected, (SELECT version_num FROM alembic_version LIMIT 1) as current_rev`. This subquery approach will fail when `alembic_version` table doesn't exist (new database), causing the entire query to error instead of returning NULL. Additionally, step 4 (line 341) requires "compare current_rev to head revision from ScriptDirectory (in-memory, no DB)" but ScriptDirectory construction still requires a database connection (line 94 in `app/database.py`), so it's not truly in-memory.

**Fix suggestion:** Clarify in section 5 (Algorithms) that optimization reduces to 2 queries:
1. Combined query: `SELECT EXISTS(SELECT 1) as connected, (SELECT version_num FROM alembic_version) as current_rev` with exception handling for missing table (returns connected=true, current_rev=NULL)
2. ScriptDirectory head lookup uses existing connection context (not additional query, but not purely in-memory)

Update section 8 to handle NULL current_rev as "no migrations applied yet" vs query failure as "database unavailable". Change prompt quote expectation from "4 to 1" to "4 to 2".

**Confidence:** High

---

**Major — Include Parameter DoS via Long String**

**Evidence:** `plan.md:304-314` (include parameter processing), `plan.md:412-418` (invalid include parameter error handling)

**Why it matters:** The validation algorithm (step 2, line 308) splits the include parameter on comma without limiting length or token count. A malicious or buggy client could send `include=` followed by thousands of comma-separated tokens, causing excessive CPU during split and validation. While single-user app reduces risk, this creates unnecessary server load during development or if app is accidentally exposed.

**Fix suggestion:** Add to section 8 (Errors & Edge Cases):
- Failure: Include parameter exceeds reasonable length (e.g., >200 characters) or contains excessive tokens (e.g., >20 commas)
- Surface: GET /api/parts parameter parsing
- Handling: Return 400 "Invalid include parameter: exceeds maximum length" before splitting
- Guardrails: Check `len(request.args.get('include', ''))` before split; reject if >200 chars or token count >10

**Confidence:** Medium

---

**Minor — Deprecated Endpoint Metrics Collection Timing**

**Evidence:** `plan.md:492-501` (deprecated endpoint access metric), `plan.md:281-287` (deprecated endpoint removal)

**Why it matters:** The plan proposes instrumenting `/api/parts/with-locations` with `deprecated_endpoint_access` counter "before removal" but doesn't specify when instrumentation is added relative to the removal slice. If instrumentation is added in slice 5 (metrics) after removal in slice 4 (API consolidation), the counter will never collect data, defeating its purpose of guiding migration timing.

**Fix suggestion:** Move deprecated endpoint instrumentation to slice 4 (API Endpoint Consolidation), add to implementation notes: "Add deprecation counter and warning header to /api/parts/with-locations response before implementing include parameter; monitor for 1-2 weeks before removal."

**Confidence:** Medium

---

**Minor — Kit Reservation Cache Invalidation Not Addressed**

**Evidence:** `plan.md:361-368` (kit membership aggregation derived value), `app/services/kit_reservation_service.py:39` (_usage_cache internal state), `plan.md:322` (step 3 calls get_reservations_by_part_ids)

**Why it matters:** The `KitReservationService._usage_cache` is instance-scoped (line 39), meaning it persists for the lifetime of the service instance. The container provides `kit_reservation_service` as a Factory (line 120-123 in `container.py`), creating new instances per request, so cache is effectively request-scoped. However, if future refactoring changes this to a Singleton for performance, cached kit reservations could become stale across requests. Plan should document cache scope assumption.

**Fix suggestion:** Add to section 6 (Derived-Value & Persistence Invariants) under "Kit Membership Aggregation":
- Guards: Cache is request-scoped because `kit_reservation_service` is Factory-provided; if changed to Singleton, cache invalidation on kit updates required

**Confidence:** Low (acceptable risk, documents assumption)

---

## 6) Derived-Value & Persistence Invariants

- Derived value: Cover URL strings (`cover_url`, `cover_thumbnail_url`)
  - Source dataset: Unfiltered `part.cover_attachment_id` foreign key from Part model
  - Write / cleanup triggered: None—read-only URL formatting: `/api/attachments/{cover_attachment_id}` and `/api/attachments/{cover_attachment_id}/thumbnail`
  - Guards: Only compute if `include_cover=True` and `part.cover_attachment_id is not None`; foreign key constraint ensures attachment exists
  - Invariant: If `cover_attachment_id` is not NULL, then corresponding Attachment record must exist in database (enforced by FK constraint on `parts.cover_attachment_id`)
  - Evidence: `plan.md:352-360`, `app/models/part.py:51-53` (FK constraint definition)

- Derived value: Kit membership arrays per part
  - Source dataset: Filtered `Kit` rows where `status == KitStatus.ACTIVE` joined with `KitContents` for `part_id`
  - Write / cleanup triggered: None—read-only aggregation from `kit_reservation_service.get_reservations_by_part_ids()`
  - Guards: Only fetch if `include_kits=True`; internal cache (`_usage_cache`) is request-scoped via Factory provider (not persisted)
  - Invariant: Returned `reserved_quantity` must equal `required_per_unit * build_target` for all active kits; archived/done kits excluded from results
  - Evidence: `plan.md:361-368`, `app/services/kit_reservation_service.py:41-59` (bulk query filters by active status)

- Derived value: Shopping list membership arrays per part
  - Source dataset: Filtered `ShoppingListLine` rows where `line.status != DONE` AND `shopping_list.status != DONE`
  - Write / cleanup triggered: None—read-only aggregation from `shopping_list_service.list_part_memberships_bulk(include_done=False)`
  - Guards: Only fetch if `include_shopping_lists=True`; default filter excludes done items
  - Invariant: All returned lines must have `line.status != DONE` AND associated `shopping_list.status != DONE`; no completed items included unless explicitly requested
  - Evidence: `plan.md:370-377`, `app/services/shopping_list_service.py:277-281` (done filter in WHERE clause)

- Derived value: Part location arrays
  - Source dataset: Unfiltered `PartLocation` rows joined on `part_id`
  - Write / cleanup triggered: None—read-only aggregation existing in `get_all_parts_with_totals_and_locations`
  - Guards: Only fetch if `include_locations=True`; no filtering applied (all locations returned)
  - Invariant: Sum of `qty` across all locations for a part must equal `total_quantity` computed in base query
  - Evidence: `plan.md:379-386`, `app/services/inventory_service.py:337-351` (location aggregation by part_id)

---

## 7) Risks & Mitigations (top 3)

- Risk: Frontend deployment coordination failure leaves orphaned API consumers
- Mitigation: Deploy backend with include parameter support first; monitor `deprecated_endpoint_access` metric for 1-2 weeks; coordinate frontend migration to use include parameter; verify zero traffic to `/with-locations` before removing endpoint in subsequent deployment
- Evidence: `plan.md:661-666` (frontend migration coordination risk), `plan.md:492-501` (metrics for deprecation tracking)

- Risk: Service dependency injection wiring not updated before slice 3 implementation
- Mitigation: Resolve open question #1 (dependency injection strategy) before starting slice 3; update `ServiceContainer` to inject `kit_reservation_service` and `shopping_list_service` into `InventoryService`; add unit test verifying injected services are accessible in `InventoryService` constructor
- Evidence: `plan.md:164-167` (container wiring TODO), adversarial finding (service dependency injection)

- Risk: Health check optimization breaks migration detection for edge cases (missing alembic_version table, mid-migration state)
- Mitigation: Implement robust exception handling around combined query; test with empty database, missing alembic_version table, and stale revision scenarios; ensure 503 "migrations pending" returned correctly for all cases
- Evidence: `plan.md:436-442` (health check during migration edge case), adversarial finding (health check query count ambiguity)

---

## 8) Confidence

Confidence: Medium — The bulk query patterns already exist and are well-tested (kit reservation service, shopping list service), giving confidence in the core approach. However, critical implementation details remain unspecified (service dependency wiring, response schema evolution, health check query correctness) that could cause runtime failures if not resolved before implementation. After resolving the three major findings and open questions, confidence would increase to High.
