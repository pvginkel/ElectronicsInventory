# Pick List Shortfall Handling - Plan Review

## 1) Summary & Decision

**Readiness**

The plan is well-structured and demonstrates thorough research of the existing codebase. It correctly identifies the key files, understands the current allocation loop behavior, and proposes a reasonable approach to restructure the shortfall handling. The requirements from the change brief are fully captured in the User Requirements Checklist. The plan's approach of collecting shortfall information before deciding whether to reject is sound and aligns with the existing service patterns. However, there are a few implementation details that need clarification regarding the restructuring of the allocation loop and one potential edge case that warrants attention.

**Decision**

`GO-WITH-CONDITIONS` — The plan is implementable but requires clarification on how the restructured allocation loop will handle the `limit` action when distributing limited quantities across multiple locations.

---

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `CLAUDE.md` (Service Layer patterns) — Pass — `plan.md:91-109` — Plan correctly identifies service layer as the location for business logic changes
- `CLAUDE.md` (Schema Layer patterns) — Pass — `plan.md:115-143` — Plan proposes `ShortfallActionSchema` following existing Pydantic patterns with `Field()` and enums
- `CLAUDE.md` (API Layer patterns) — Pass — `plan.md:99-101` — Plan keeps API layer thin, delegating to service
- `CLAUDE.md` (Testing Requirements) — Pass — `plan.md:284-308` — Plan includes comprehensive test scenarios for both service and API levels
- `change_brief.md` — Pass — `plan.md:74-86` — All requirements from brief are captured in checklist

**Fit with codebase**

- `KitPickListService.create_pick_list()` — `plan.md:159-180` — Plan correctly describes the restructuring needed; current code at `kit_pick_list_service.py:102-146` raises immediately on shortfall which needs refactoring to two-pass approach
- `KitPickListCreateSchema` — `plan.md:125-137` — Extending existing schema with optional field is straightforward and backwards compatible
- Test fixtures — `plan.md:296` — Plan references existing helper functions (`_create_part`, `_create_active_kit`, etc.) which exist at `test_kit_pick_list_service.py:120-164`

---

## 3) Open Questions & Ambiguities

- Question: How should the `limit` action allocate partial quantities across multiple locations?
- Why it matters: The current algorithm distributes stock across locations greedily. When limiting to available quantity, should allocation still span multiple locations (picking whatever is available from each until reaching the limit), or should it follow the same greedy pattern but with a reduced target?
- Needed answer: Clarification that the `limit` action simply reduces `required_total` to `usable_quantity` and then allocation proceeds normally across locations.

- Question: Should `shortfall_handling` keys that reference non-existent part keys (not in inventory, not just not in kit) trigger validation?
- Why it matters: The plan states unknown keys are silently ignored (`plan.md:239-243`), which is permissive but may hide frontend bugs sending invalid part keys.
- Needed answer: Confirm that silent ignore is intentional for forward compatibility and simplicity.

---

## 4) Deterministic Backend Coverage (new/changed behavior only)

- Behavior: `KitPickListService.create_pick_list()` with `shortfall_handling`
- Scenarios:
  - Given a kit with one part having shortfall and no `shortfall_handling`, When creating pick list, Then raise `InvalidOperationException` (`tests/services/test_kit_pick_list_service.py::test_shortfall_handling_default_reject`)
  - Given a kit with one part having shortfall and `reject` action, When creating pick list, Then raise `InvalidOperationException` (`tests/services/test_kit_pick_list_service.py::test_shortfall_handling_explicit_reject`)
  - Given a kit with one part having shortfall and `limit` action, When creating pick list, Then create pick list with reduced quantity (`tests/services/test_kit_pick_list_service.py::test_shortfall_handling_limit_action`)
  - Given a kit with one part having shortfall and `omit` action, When creating pick list, Then create pick list without lines for that part (`tests/services/test_kit_pick_list_service.py::test_shortfall_handling_omit_action`)
  - Given all parts set to `omit` action, When creating pick list, Then raise `InvalidOperationException` (`tests/services/test_kit_pick_list_service.py::test_shortfall_handling_all_omitted`)
  - Given all parts set to `limit` resulting in zero quantity, When creating pick list, Then create empty but valid pick list (`tests/services/test_kit_pick_list_service.py::test_shortfall_handling_limit_to_zero`)
- Instrumentation: Existing `record_pick_list_created()` metric captures `line_count` which reflects shortfall handling effects; plan explicitly defers additional metrics (`plan.md:249-258`)
- Persistence hooks: No schema changes required; test data updates not needed as this is additive behavior
- Gaps: None
- Evidence: `plan.md:284-308`

- Behavior: `POST /api/kits/<kit_id>/pick-lists` with `shortfall_handling` payload
- Scenarios:
  - Given valid `shortfall_handling` with `limit`, When POST, Then 201 with reduced quantities (`tests/api/test_pick_lists_api.py::test_create_pick_list_shortfall_limit`)
  - Given valid `shortfall_handling` with `omit`, When POST, Then 201 without omitted part (`tests/api/test_pick_lists_api.py::test_create_pick_list_shortfall_omit`)
  - Given all parts omitted, When POST, Then 409 (`tests/api/test_pick_lists_api.py::test_create_pick_list_all_omitted`)
  - Given invalid action value, When POST, Then 400 (`tests/api/test_pick_lists_api.py::test_create_pick_list_invalid_action`)
- Instrumentation: Covered by existing HTTP metrics infrastructure
- Persistence hooks: No changes needed
- Gaps: None
- Evidence: `plan.md:300-308`

---

## 5) Adversarial Sweep

**Major — Allocation Loop Restructuring May Have Subtle Bugs**

**Evidence:** `plan.md:159-180` — "For each kit content, calculate `required_total` and `usable_quantity`... If action is `limit`: adjust `required_total` to `usable_quantity`"

**Why it matters:** The current allocation loop at `kit_pick_list_service.py:84-146` is tightly coupled — it calculates availability, checks shortfall, and allocates in a single pass per content. The plan proposes restructuring this to a two-pass approach (collect shortfall info, then allocate), but the algorithm description doesn't account for the complexity of the reservation skipping logic at lines 123-129. When limiting a part's quantity, the reduced `required_total` must still correctly navigate the reservation-skipping logic to avoid under-allocating.

**Fix suggestion:** Add explicit algorithm step in plan Section 5 that clarifies: "When `limit` action reduces `required_total`, the allocation loop proceeds unchanged — the reduced target simply means fewer iterations before `remaining <= 0`."

**Confidence:** Medium — The existing allocation loop's reservation handling is intricate but should work correctly with a reduced target; however, explicit acknowledgment would prevent implementation bugs.

---

**Minor — Error Message Aggregation for Multiple Rejected Parts**

**Evidence:** `plan.md:347-349` — "Error message for multiple rejected parts may be verbose... Mitigation: Truncate message to first N parts"

**Why it matters:** The plan acknowledges this but doesn't specify the truncation strategy. The current single-part error message pattern at `kit_pick_list_service.py:103-109` would need modification to aggregate multiple part keys.

**Fix suggestion:** Specify that error messages will list all rejected part keys comma-separated (e.g., "insufficient stock for parts: ABCD, EFGH, IJKL") without truncation, keeping implementation simple.

**Confidence:** Low — This is a UX detail that doesn't affect correctness.

---

**Minor — Part Key Lookup Map Construction**

**Evidence:** `plan.md:344-346` — "Part key lookup during iteration adds complexity... Mitigation: Build lookup map once at start of method"

**Why it matters:** The plan correctly identifies this optimization but doesn't specify when/where the map is built. The `shortfall_handling` dict is keyed by part key strings, but `kit.contents` are accessed via `content.part.key`. Building a `{part_key: action}` lookup once is the right approach.

**Fix suggestion:** Add implementation detail in Section 5 Step 3: "Build `shortfall_actions: dict[str, ShortfallAction]` from `shortfall_handling` at method entry, defaulting missing keys to `reject`."

**Confidence:** Low — This is an optimization detail that doesn't affect correctness.

---

## 6) Derived-Value & Persistence Invariants

- Derived value: `effective_required_quantity` (per kit content)
  - Source dataset: `required_total = content.required_per_unit * requested_units`, filtered by `shortfall_handling` action when `usable_quantity < required_total`
  - Write / cleanup triggered: Determines `quantity_to_pick` on `KitPickListLine` rows
  - Guards: Shortfall action lookup defaults to `reject`; `limit` action caps at `usable_quantity`; `omit` action skips line creation entirely
  - Invariant: For non-omitted parts with `limit` action: `0 <= quantity_to_pick <= usable_quantity`
  - Evidence: `plan.md:186-191`

- Derived value: `parts_to_reject` (list of part keys)
  - Source dataset: Parts where `usable_quantity < required_total` AND (action is `reject` OR action unspecified)
  - Write / cleanup triggered: If non-empty, raises `InvalidOperationException` before any database writes
  - Guards: Checked after iterating all contents; transaction aborts on raise
  - Invariant: Either empty (proceed to create pick list) OR non-empty (reject entire request, no partial state)
  - Evidence: `plan.md:193-198`

- Derived value: `planned_lines` (list of allocation tuples)
  - Source dataset: Kit contents filtered by shortfall actions (excluding `omit`), with quantities adjusted by `limit` actions
  - Write / cleanup triggered: Creates `KitPickListLine` rows; if empty due to all `omit`, triggers rejection
  - Guards: Explicit check `len(planned_lines) == 0` after iteration; rejection raised before any DB writes
  - Invariant: `len(planned_lines) > 0` OR request is rejected with 409
  - Evidence: `plan.md:200-205`

---

## 7) Risks & Mitigations (top 3)

- Risk: Restructuring the allocation loop introduces subtle bugs in reservation handling when combined with `limit` action
- Mitigation: Comprehensive test coverage including scenarios with competing reservations and limited quantities; the existing `test_create_pick_list_blocks_other_kit_reservations` pattern at `test_kit_pick_list_service.py:237-260` should be extended
- Evidence: `plan.md:159-180`, `test_kit_pick_list_service.py:237-260`

- Risk: Frontend sends `shortfall_handling` for parts not experiencing shortfall, potentially confusing the flow
- Mitigation: The plan's permissive approach (ignore unknown keys, only apply actions when shortfall detected) handles this gracefully; actions for non-shortfall parts are simply unused
- Evidence: `plan.md:239-243`

- Risk: Concurrent pick list creation with conflicting shortfall handling could lead to unexpected results if stock changes between frontend check and backend creation
- Mitigation: Existing behavior — stock is recalculated at creation time. If stock has changed, the shortfall handling may apply differently than user expected, but result is still consistent with actual stock levels
- Evidence: `plan.md:213-215` — "reservation checks use current snapshot"

---

## 8) Confidence

Confidence: High — The plan demonstrates thorough understanding of the codebase, correctly identifies all affected areas, and the proposed algorithm is sound. The conditions for GO relate to implementation clarity rather than design flaws.
