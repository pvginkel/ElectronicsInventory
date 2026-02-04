# Pick List Shortfall Handling — Technical Plan

## 0) Research Log & Findings

### Areas Researched

1. **Pick list creation flow** (`app/services/kit_pick_list_service.py:39-172`)
   - The `create_pick_list` method iterates through kit contents, calculates available stock for each part (accounting for reservations), and raises `InvalidOperationException` when shortfall is detected.
   - The shortfall check happens at lines 102-109 (reservation-adjusted) and 142-146 (allocation loop).

2. **Request/Response schemas** (`app/schemas/pick_list.py:13-21`)
   - `KitPickListCreateSchema` currently only accepts `requested_units: int`.
   - Response schemas are well-established and do not need modification.

3. **API endpoint** (`app/api/pick_lists.py:27-53`)
   - `POST /api/kits/<kit_id>/pick-lists` validates with `KitPickListCreateSchema` and delegates to `kit_pick_list_service.create_pick_list()`.

4. **Part model** (`app/models/part.py:37`)
   - Part key is stored as `CHAR(4)` in the `key` column, matching the brief's description.

5. **Kit content model** (`app/models/kit_content.py`)
   - Links kit to part via `part_id`, and exposes `part.key` via `part_key` property.

6. **Existing test patterns** (`tests/services/test_kit_pick_list_service.py`, `tests/api/test_pick_lists_api.py`)
   - Tests use helper functions to create kits, parts, locations, and part locations.
   - Fixtures provide `session`, `make_attachment_set`, and service instances via dependency injection.

### Conflicts and Resolutions

- **Conflict**: The current implementation raises exceptions immediately upon detecting shortfall, making it difficult to continue processing other parts. **Resolution**: Restructure the allocation loop to collect shortfall information first, then apply handling strategies before deciding whether to reject or proceed.

- **Conflict**: Part keys are 4-character strings but kit contents are keyed by internal `part_id`. **Resolution**: The `shortfall_handling` map will use part keys (strings), and the service will look up the corresponding `KitContent` by matching `content.part.key`.

---

## 1) Intent & Scope

**User intent**

Allow frontend to specify per-part handling strategies when creating pick lists for kits with insufficient stock, rather than failing the entire request when any part has shortfall.

**Prompt quotes**

"Add the ability to specify how to handle shortfall when creating pick lists for kits"
"shortfall_handling map is keyed by part ID (the 4-character string identifier)"
"Support reject action - fails pick list creation if part has shortfall (default behavior)"
"Support limit action - limits quantity to what is available"
"Support omit action - completely omits part from pick list"

**In scope**

- Add optional `shortfall_handling` field to `KitPickListCreateSchema`
- Implement `reject`, `limit`, and `omit` actions in `KitPickListService.create_pick_list()`
- Reject request (409) if all parts would be omitted (zero lines would result)
- Allow creating pick list if all parts are limited to zero quantity (empty but valid)
- Update API to pass shortfall handling to service
- Add comprehensive service and API tests

**Out of scope**

- Modifying response schemas (the response shape remains unchanged)
- Database schema changes (no new tables or columns)
- Frontend implementation
- Metrics for shortfall handling outcomes (can be added later if needed)

**Assumptions / constraints**

- The frontend already knows shortfall status via kit detail response and will prompt user before submitting
- Reservation behavior is unchanged - available quantity still excludes reservations from other active kits
- Parts not specified in `shortfall_handling` default to `reject` behavior

---

## 1a) User Requirements Checklist

**User Requirements Checklist**

- [ ] Add optional `shortfall_handling` field to pick list creation request schema
- [ ] `shortfall_handling` is a map keyed by part ID (4-character string) with action object
- [ ] Support `reject` action - fails pick list creation if part has shortfall (default behavior)
- [ ] Support `limit` action - limits quantity to what is available in stock
- [ ] Support `omit` action - completely omits part from pick list (no KitPickListLine rows)
- [ ] Parts not specified in `shortfall_handling` default to `reject` behavior
- [ ] Reject request (409) if all parts would be omitted (zero lines would result)
- [ ] Allow creating pick list if all parts are limited to zero quantity (empty but valid pick list)

---

## 2) Affected Areas & File Map

- Area: `app/schemas/pick_list.py` — `KitPickListCreateSchema`
- Why: Add `shortfall_handling` optional field with nested action schema
- Evidence: `app/schemas/pick_list.py:13-21` — current schema only has `requested_units`

- Area: `app/services/kit_pick_list_service.py` — `create_pick_list()`
- Why: Implement shortfall handling logic with `reject`, `limit`, and `omit` actions
- Evidence: `app/services/kit_pick_list_service.py:39-172` — allocation loop with shortfall check at lines 102-109

- Area: `app/api/pick_lists.py` — `create_pick_list()`
- Why: Extract and pass `shortfall_handling` from request payload to service
- Evidence: `app/api/pick_lists.py:44-48` — currently only passes `requested_units`

- Area: `tests/services/test_kit_pick_list_service.py`
- Why: Add test cases for all shortfall handling scenarios
- Evidence: `tests/services/test_kit_pick_list_service.py:214-236` — existing shortfall test `test_create_pick_list_requires_sufficient_stock`

- Area: `tests/api/test_pick_lists_api.py`
- Why: Add API-level tests for shortfall handling request/response
- Evidence: `tests/api/test_pick_lists_api.py:79-94` — existing insufficient stock API test

---

## 3) Data Model / Contracts

- Entity / contract: `ShortfallActionSchema` (new nested schema)
- Shape:
  ```json
  {
    "action": "reject" | "limit" | "omit"
  }
  ```
- Refactor strategy: New schema, no backwards compatibility needed
- Evidence: `app/schemas/pick_list.py:13-21` — schemas use Pydantic with `Field()` pattern

- Entity / contract: `KitPickListCreateSchema` (updated)
- Shape:
  ```json
  {
    "requested_units": 2,
    "shortfall_handling": {
      "ABCD": { "action": "limit" },
      "DEFG": { "action": "omit" }
    }
  }
  ```
- Refactor strategy: `shortfall_handling` is optional with `default=None`; existing requests without it continue to work with implicit `reject` default
- Evidence: `app/schemas/pick_list.py:13-21` — schema pattern

- Entity / contract: Service method signature change
- Shape: `create_pick_list(kit_id: int, requested_units: int, shortfall_handling: dict[str, ShortfallAction] | None = None)`
- Refactor strategy: Optional parameter with default `None` preserves existing callers
- Evidence: `app/services/kit_pick_list_service.py:39` — current signature

---

## 4) API / Integration Surface

- Surface: `POST /api/kits/<kit_id>/pick-lists`
- Inputs: JSON body with `requested_units` (required), `shortfall_handling` (optional map of part_key to action object)
- Outputs: `KitPickListDetailSchema` (unchanged) with HTTP 201, or error response
- Errors:
  - 400: Validation errors (invalid action value, malformed part key)
  - 404: Kit not found
  - 409: Insufficient stock for parts with `reject` action, or all parts would be omitted
- Evidence: `app/api/pick_lists.py:27-53` — current endpoint definition

---

## 5) Algorithms & State Machines

- Flow: Pick list creation with shortfall handling
- Steps:
  1. Validate `requested_units >= 1` and fetch active kit with contents
  2. Load part locations and calculate reservations (existing logic)
  3. **NEW**: For each kit content, calculate `required_total` and `usable_quantity`
  4. **NEW**: If `usable_quantity < required_total` (shortfall detected):
     - Look up part key in `shortfall_handling` map
     - If not found or action is `reject`: collect part for rejection
     - If action is `limit`: adjust `required_total` to `usable_quantity`
     - If action is `omit`: skip this content entirely (no lines created)
  5. **NEW**: After processing all contents:
     - If any parts collected for rejection: raise `InvalidOperationException` with part keys
     - If all parts were omitted (zero lines would be created): raise `InvalidOperationException`
  6. Create `KitPickList` record
  7. Create `KitPickListLine` records for non-omitted parts with adjusted quantities
  8. Flush and record metrics
  9. Return pick list
- States / transitions: None (single-pass algorithm)
- Hotspots: The allocation loop iterates over kit contents and part locations; complexity is O(contents * locations) which is bounded by practical kit sizes
- Evidence: `app/services/kit_pick_list_service.py:39-172` — current allocation logic

---

## 6) Derived State & Invariants

- Derived value: `effective_required_quantity` (per kit content)
  - Source: `required_total = content.required_per_unit * requested_units`, filtered by shortfall handling action
  - Writes / cleanup: Determines `quantity_to_pick` on `KitPickListLine` rows
  - Guards: Shortfall handling action lookup with `reject` as default
  - Invariant: `effective_required_quantity <= usable_quantity` after handling applied
  - Evidence: `app/services/kit_pick_list_service.py:85` — `required_total` calculation

- Derived value: `parts_to_reject` (collected during iteration)
  - Source: Parts where `usable_quantity < required_total` and action is `reject` (or unspecified)
  - Writes / cleanup: If non-empty, triggers rejection with no database writes
  - Guards: Checked after full iteration to provide complete error message
  - Invariant: Either empty (proceed) or causes transaction abort
  - Evidence: `app/services/kit_pick_list_service.py:103-109` — current rejection logic

- Derived value: `has_any_lines` (boolean after iteration)
  - Source: Count of kit contents that were not omitted
  - Writes / cleanup: If false (all omitted), triggers rejection with no database writes
  - Guards: Explicit check after iteration completes
  - Invariant: At least one line must exist for pick list creation to succeed
  - Evidence: `app/services/kit_pick_list_service.py:148-166` — pick list and line creation

---

## 7) Consistency, Transactions & Concurrency

- Transaction scope: Single database transaction wrapping pick list and all line creation (existing pattern)
- Atomic requirements: All lines are created atomically with the pick list; if any step fails, the entire operation rolls back
- Retry / idempotency: No built-in idempotency; duplicate requests create separate pick lists (existing behavior)
- Ordering / concurrency controls: No changes; reservation checks use current snapshot of open pick list lines
- Evidence: `app/services/kit_pick_list_service.py:148-166` — `flush()` calls maintain atomicity within Flask request transaction

---

## 8) Errors & Edge Cases

- Failure: Part with shortfall and `reject` action (explicit or default)
- Surface: `KitPickListService.create_pick_list()`
- Handling: Raise `InvalidOperationException` with message listing affected part keys; HTTP 409
- Guardrails: Default action is `reject` for unlisted parts
- Evidence: `app/services/kit_pick_list_service.py:103-109` — existing rejection pattern

- Failure: All parts omitted (zero lines would result)
- Surface: `KitPickListService.create_pick_list()`
- Handling: Raise `InvalidOperationException` with message "all parts would be omitted"; HTTP 409
- Guardrails: Check `len(planned_lines) == 0` after iteration
- Evidence: `app/services/kit_pick_list_service.py:48-52` — similar pattern for empty kit contents

- Failure: Invalid action value in request
- Surface: Pydantic schema validation
- Handling: HTTP 400 with validation error details
- Guardrails: Enum validation in `ShortfallActionSchema`
- Evidence: `app/schemas/pick_list.py` — existing schema patterns

- Failure: Part key in `shortfall_handling` not found in kit contents
- Surface: Service layer
- Handling: Silently ignore (no error); only affects behavior of parts actually in the kit
- Guardrails: Lookup by key returns `None`, falls back to default behavior
- Evidence: Design decision to be permissive

---

## 9) Observability / Telemetry

No new metrics are required for this change. The existing `record_pick_list_created()` metric already captures `line_count`, which will reflect any reductions from `limit` or `omit` actions.

If detailed tracking of shortfall handling outcomes is desired later, a new counter could be added:

- Signal: `pick_list_shortfall_handling_total`
- Type: Counter
- Trigger: Each time a shortfall handling action is applied during creation
- Labels / fields: `action` (reject, limit, omit), `kit_id`
- Consumer: Dashboard for monitoring shortfall frequency
- Evidence: `app/services/metrics_service.py:780-790` — existing pick list metrics pattern

---

## 10) Background Work & Shutdown

No background workers or shutdown hooks are affected. Pick list creation is a synchronous request/response operation.

---

## 11) Security & Permissions

Not applicable. This change does not introduce new authentication, authorization, or data exposure concerns. The endpoint remains accessible to all users (single-user app).

---

## 12) UX / UI Impact

- Entry point: Pick list creation flow in kit detail view
- Change: Frontend will need to present shortfall handling options when stock is insufficient
- User interaction: User selects handling strategy (reject/limit/omit) per affected part before submitting
- Dependencies: Frontend relies on existing kit detail response which includes stock coverage information
- Evidence: Change brief states "The frontend already knows if there is shortfall (via kit detail response)"

---

## 13) Deterministic Test Plan

- Surface: `KitPickListService.create_pick_list()` — shortfall handling
- Scenarios:
  - Given a kit with one part having shortfall and no `shortfall_handling`, When creating pick list, Then raise `InvalidOperationException` (reject default)
  - Given a kit with one part having shortfall and `shortfall_handling={"PART": {"action": "reject"}}`, When creating pick list, Then raise `InvalidOperationException`
  - Given a kit with one part having shortfall and `shortfall_handling={"PART": {"action": "limit"}}`, When creating pick list, Then pick list is created with limited quantity
  - Given a kit with one part having shortfall and `shortfall_handling={"PART": {"action": "omit"}}`, When creating pick list, Then pick list is created with no lines for that part
  - Given a kit with all parts having shortfall and all set to `omit`, When creating pick list, Then raise `InvalidOperationException` (all parts omitted)
  - Given a kit with all parts having shortfall and all set to `limit` resulting in zero quantity, When creating pick list, Then pick list is created (empty but valid)
  - Given a kit with multiple parts where one has shortfall with `limit` and another has sufficient stock, When creating pick list, Then lines created for both with appropriate quantities
  - Given `shortfall_handling` with part key not in kit, When creating pick list, Then extra key is ignored
- Fixtures / hooks: Existing `_create_part`, `_create_active_kit`, `_attach_content`, `_attach_location` helpers; `PickListMetricsStub`
- Gaps: None
- Evidence: `tests/services/test_kit_pick_list_service.py:170-236` — existing test patterns

- Surface: `POST /api/kits/<kit_id>/pick-lists` — API shortfall handling
- Scenarios:
  - Given shortfall and `shortfall_handling` with `limit` action, When POST, Then 201 with reduced line quantities
  - Given shortfall and `shortfall_handling` with `omit` action, When POST, Then 201 with omitted part absent from lines
  - Given all parts omitted, When POST, Then 409 with error message
  - Given invalid action value in `shortfall_handling`, When POST, Then 400 validation error
- Fixtures / hooks: Existing `_seed_kit_with_inventory` helper, `client` fixture
- Gaps: None
- Evidence: `tests/api/test_pick_lists_api.py:63-94` — existing API test patterns

---

## 14) Implementation Slices

- Slice: Schema updates
- Goal: Define `ShortfallActionSchema` and extend `KitPickListCreateSchema`
- Touches: `app/schemas/pick_list.py`
- Dependencies: None

- Slice: Service logic
- Goal: Implement shortfall handling in `create_pick_list()` with all three actions
- Touches: `app/services/kit_pick_list_service.py`
- Dependencies: Schema changes must be complete

- Slice: API integration
- Goal: Extract `shortfall_handling` from request and pass to service
- Touches: `app/api/pick_lists.py`
- Dependencies: Service changes must be complete

- Slice: Service tests
- Goal: Add comprehensive test coverage for all shortfall handling scenarios
- Touches: `tests/services/test_kit_pick_list_service.py`
- Dependencies: Service changes must be complete

- Slice: API tests
- Goal: Add API-level tests for request validation and response verification
- Touches: `tests/api/test_pick_lists_api.py`
- Dependencies: All implementation complete

---

## 15) Risks & Open Questions

- Risk: Part key lookup during iteration adds complexity
- Impact: Minor performance overhead, potential for bugs
- Mitigation: Build lookup map once at start of method; comprehensive tests

- Risk: Error message for multiple rejected parts may be verbose
- Impact: User experience when many parts have shortfall
- Mitigation: Truncate message to first N parts with "and X more" suffix if needed

### Open Questions

None. The change brief is sufficiently detailed and all edge cases are addressed.

---

## 16) Confidence

Confidence: High — The change is well-scoped, builds on existing patterns, and all edge cases are explicitly defined in the requirements. The implementation touches a small surface area with clear test coverage expectations.
