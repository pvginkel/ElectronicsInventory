# Code Review: Pick List Shortfall Handling

## 1) Summary & Decision

**Readiness**

The implementation is well-structured and follows established project patterns. The shortfall handling feature is correctly implemented across all three layers (schema, service, API), with comprehensive test coverage covering all plan scenarios. The code adheres to the layered architecture, uses proper Pydantic schemas with enum validation, and integrates cleanly with the existing reservation system. All 77 tests pass, mypy reports no issues, and ruff finds no violations.

**Decision**

`GO` — The implementation fulfills all plan requirements, maintains backward compatibility, and includes thorough test coverage. No blockers or major issues were identified.

---

## 2) Conformance to Plan (with evidence)

**Plan alignment**

- `plan.md Section 3: ShortfallActionSchema` -> `app/schemas/pick_list.py:14-28` — Correctly implements `ShortfallAction` enum with `REJECT`, `LIMIT`, `OMIT` values and `ShortfallActionSchema` wrapper class matching the plan specification.

- `plan.md Section 3: KitPickListCreateSchema update` -> `app/schemas/pick_list.py:39-48` — Adds optional `shortfall_handling` field as `dict[str, ShortfallActionSchema] | None` with proper default and description.

- `plan.md Section 5: Three-phase algorithm` -> `app/services/kit_pick_list_service.py:100-211` — Implements the specified three-phase approach:
  - Phase 1: Collect shortfall info and determine actions (lines 100-145)
  - Phase 2: Check rejection conditions (lines 147-160)
  - Phase 3: Perform allocation (lines 162-211)

- `plan.md Section 4: API endpoint` -> `app/api/pick_lists.py:46-57` — API correctly extracts `shortfall_handling` from schema, converts to simple string dict, and passes to service.

- `plan.md Section 8: Error cases` -> `app/services/kit_pick_list_service.py:148-160` — Both rejection conditions implemented:
  - Parts with reject action raise `InvalidOperationException` with part list (lines 148-153)
  - All parts omitted raises distinct error (lines 155-160)

- `plan.md Section 13: Test scenarios` -> `tests/services/test_kit_pick_list_service.py:1104-1428` and `tests/api/test_pick_lists_api.py:563-773` — All specified test scenarios are covered.

**Gaps / deviations**

- None identified. The implementation faithfully follows the plan.

---

## 3) Correctness — Findings (ranked)

No Blocker or Major issues were identified. The implementation is correct.

**Minor findings:**

- Title: `Minor — Unused variable parts_to_omit`
- Evidence: `app/services/kit_pick_list_service.py:103,131` — `parts_to_omit` list is populated but never used for any purpose.
- Impact: Dead code; no functional impact.
- Fix: Remove the variable if not needed, or use it for logging/metrics if desired.
- Confidence: High

---

## 4) Over-Engineering & Refactoring Opportunities

- Hotspot: `content_allocation_info` tuple structure
- Evidence: `app/services/kit_pick_list_service.py:104-106` — The tuple type `tuple[KitContent, int, int, list[PartLocation], dict[int, int], int]` with 6 elements is unwieldy and requires unpacking with positional indices.
- Suggested refactor: Consider using a dataclass or named tuple to improve readability:
  ```python
  @dataclass
  class ContentAllocation:
      content: KitContent
      required_total: int
      usable_quantity: int
      part_locations: list[PartLocation]
      available_by_location: dict[int, int]
      reserved_total: int
  ```
- Payoff: Improves maintainability and makes the unpacking in Phase 3 (lines 165-172) more self-documenting.

---

## 5) Style & Consistency

- Pattern: Action lookup simplification
- Evidence: `app/services/kit_pick_list_service.py:95-98`
  ```python
  action_lookup: dict[str, str] = {}
  if shortfall_handling:
      action_lookup = shortfall_handling
  ```
- Impact: Minor verbosity; idiomatic Python would use `action_lookup = shortfall_handling or {}`.
- Recommendation: Simplify to single-line assignment for consistency with project style.

- Pattern: Consistent error message format
- Evidence: `app/services/kit_pick_list_service.py:152` — New error message "insufficient stock for parts with reject handling: {part_list}" differs from previous format "insufficient stock to allocate {N} units of {part_key} after honoring kit reservations".
- Impact: Test assertion in `tests/services/test_kit_pick_list_service.py:260-262` was updated to match new format; this is acceptable per plan.
- Recommendation: None; the change is intentional and properly tested.

---

## 6) Tests & Deterministic Coverage (new/changed behavior only)

- Surface: `KitPickListService.create_pick_list()` shortfall handling
- Scenarios:
  - Given shortfall with no handling, When creating, Then reject (`tests/services/test_kit_pick_list_service.py::TestShortfallHandling::test_shortfall_default_reject_behavior`)
  - Given shortfall with explicit reject, When creating, Then reject (`test_shortfall_explicit_reject_action`)
  - Given shortfall with limit, When creating, Then reduced quantity (`test_shortfall_limit_action_creates_reduced_pick_list`)
  - Given shortfall with omit, When creating, Then part excluded (`test_shortfall_omit_action_excludes_part_from_pick_list`)
  - Given all parts omitted, When creating, Then reject (`test_shortfall_all_parts_omitted_rejects`)
  - Given all parts limited to zero, When creating, Then empty pick list valid (`test_shortfall_all_parts_limited_to_zero_creates_empty_pick_list`)
  - Given mixed actions, When creating, Then each applies correctly (`test_shortfall_mixed_actions_multiple_parts`)
  - Given unknown part key, When creating, Then ignored (`test_shortfall_unknown_part_key_ignored`)
  - Given limit with no shortfall, When creating, Then full quantity (`test_shortfall_part_without_shortfall_uses_full_quantity`)
  - Given multiple rejects, When creating, Then all listed (`test_shortfall_multiple_parts_reject_lists_all`)
  - Given limit with reservations, When creating, Then accounts for reservations (`test_shortfall_limit_with_reservations`)
- Hooks: Uses existing `_create_part`, `_create_active_kit`, `_attach_content`, `_attach_location` helpers; `PickListMetricsStub` for metrics.
- Gaps: None. All plan scenarios are covered.
- Evidence: `tests/services/test_kit_pick_list_service.py:1104-1428`

- Surface: `POST /api/kits/<kit_id>/pick-lists` API shortfall handling
- Scenarios:
  - Given limit action, When POST, Then 201 with reduced quantity (`tests/api/test_pick_lists_api.py::TestShortfallHandlingApi::test_create_pick_list_with_limit_action`)
  - Given omit action, When POST, Then 201 with part omitted (`test_create_pick_list_with_omit_action`)
  - Given all omitted, When POST, Then 409 (`test_create_pick_list_all_parts_omitted_returns_409`)
  - Given invalid action, When POST, Then 400 (`test_create_pick_list_invalid_action_returns_400`)
  - Given handling but no shortfall, When POST, Then full quantity (`test_create_pick_list_shortfall_handling_with_no_shortfall`)
  - Given unknown part key, When POST, Then ignored (`test_create_pick_list_shortfall_handling_unknown_part_ignored`)
  - Given missing action field, When POST, Then 400 (`test_create_pick_list_shortfall_handling_missing_returns_400`)
  - Given explicit reject, When POST, Then 409 (`test_create_pick_list_with_reject_action_returns_409`)
- Hooks: Uses `_seed_kit_with_inventory` helper, `client` fixture.
- Gaps: None.
- Evidence: `tests/api/test_pick_lists_api.py:563-773`

---

## 7) Adversarial Sweep (must attempt >= 3 credible failures or justify none)

- Checks attempted:
  1. **Transactions/session usage**: Verified that `flush()` calls at lines 218, 230 maintain atomicity and that no partial state persists on rejection.
  2. **Reservation integration**: Verified that `usable_quantity` calculation at line 123 correctly subtracts `reserved_total` from other kits, and that limit action respects this (tested in `test_shortfall_limit_with_reservations`).
  3. **Empty pick list edge case**: Verified distinction between "all omitted" (rejected at line 157) vs "all limited to zero" (allowed, creating valid empty pick list).
  4. **Allocation loop invariant**: Checked that after limit action sets `required_total = usable_quantity`, the remaining allocation loop (lines 177-204) cannot fail with "insufficient stock" since `required_total <= usable_quantity` by construction.
  5. **Schema validation**: Confirmed Pydantic enum validation catches invalid action values before service is called.

- Evidence:
  - `app/services/kit_pick_list_service.py:126-135` — Shortfall check only modifies `required_total` when action is `limit`, ensuring post-condition `required_total <= usable_quantity`.
  - `app/services/kit_pick_list_service.py:206-210` — The final allocation check at line 206-210 is defensive; with correct shortfall handling, `remaining` should always be 0 after allocation for limited parts.
  - `tests/services/test_kit_pick_list_service.py:1215-1239` — Test `test_shortfall_all_parts_limited_to_zero_creates_empty_pick_list` exercises the reservation scenario where usable quantity becomes zero.

- Why code held up: The three-phase approach cleanly separates shortfall detection (Phase 1) from rejection (Phase 2) from allocation (Phase 3), preventing partial state corruption. The `continue` statement at line 132 for omit action correctly skips adding to `content_allocation_info`, ensuring omitted parts have no lines.

---

## 8) Invariants Checklist (stacked entries)

- Invariant: Parts with reject action (explicit or default) must fail pick list creation when shortfall exists
  - Where enforced: `app/services/kit_pick_list_service.py:128-129,148-153`
  - Failure mode: Shortfall detected but not added to `parts_to_reject` list
  - Protection: Default action is "reject" at line 127 `action_lookup.get(part_key, "reject")`
  - Evidence: Tests `test_shortfall_default_reject_behavior` and `test_shortfall_explicit_reject_action`

- Invariant: Parts with limit action must have `required_total <= usable_quantity` after adjustment
  - Where enforced: `app/services/kit_pick_list_service.py:133-135`
  - Failure mode: Allocation loop fails with "insufficient stock" despite limit
  - Protection: Line 135 directly assigns `required_total = usable_quantity`, establishing the invariant
  - Evidence: Defensive check at line 206-210 would catch violations; test `test_shortfall_limit_action_creates_reduced_pick_list` validates happy path

- Invariant: Pick list cannot be created with zero lines when all parts are omitted
  - Where enforced: `app/services/kit_pick_list_service.py:156-160`
  - Failure mode: Empty `content_allocation_info` list passes to Phase 3, creating orphan KitPickList with no lines
  - Protection: Explicit check `if not content_allocation_info:` before creating pick list
  - Evidence: Test `test_shortfall_all_parts_omitted_rejects` validates this invariant

- Invariant: Existing reservation calculation must remain unchanged for backward compatibility
  - Where enforced: `app/services/kit_pick_list_service.py:76-86,122-123`
  - Failure mode: Reservation logic modified, breaking existing tests
  - Protection: Reservation loading unchanged; all 77 existing tests pass
  - Evidence: `tests/services/test_kit_pick_list_service.py::TestKitPickListService::test_create_pick_list_blocks_other_kit_reservations` passes

---

## 9) Questions / Needs-Info

None. The implementation is complete and all edge cases are addressed per the plan.

---

## 10) Risks & Mitigations (top 3)

- Risk: Parts with limit action reduced to zero still create a line entry (vs omit which creates none)
- Mitigation: This is intended behavior per plan requirement "allow creating pick list if all parts are limited to zero quantity". Test `test_shortfall_all_parts_limited_to_zero_creates_empty_pick_list` confirms the pick list is created with zero lines. If this is undesired, consider adding a check to skip zero-quantity allocations.
- Evidence: `app/services/kit_pick_list_service.py:135` sets `required_total = usable_quantity` (could be 0), and line 196 `if allocation <= 0: continue` already prevents zero-quantity lines from being added.

- Risk: Large shortfall_handling maps with many keys could slow request validation
- Mitigation: Pydantic validation is efficient; the map is bounded by number of parts in kit (typically < 50). No action needed unless performance issues are observed.
- Evidence: Schema at `app/schemas/pick_list.py:39-48` uses standard dict type without size limits.

- Risk: Error message "insufficient stock for parts with reject handling" may not include all context for debugging
- Mitigation: The error includes the part key list. For additional context, users can check kit detail response which shows stock coverage. Consider adding quantities to error message in future if needed.
- Evidence: `app/services/kit_pick_list_service.py:149-152`

---

## 11) Confidence

Confidence: High — The implementation is complete, well-tested (19 new tests, 77 total passing), follows established patterns, and addresses all plan requirements. Code quality checks (mypy, ruff) pass without issues.
