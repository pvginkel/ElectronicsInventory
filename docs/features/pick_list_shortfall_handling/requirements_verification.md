# Pick List Shortfall Handling — Requirements Verification Report

## Verification Results: All 8 Requirements PASS

### 1. Add optional `shortfall_handling` field to pick list creation request schema
**Status**: PASS

**Evidence**:
- `app/schemas/pick_list.py:39-48` - Field defined as `shortfall_handling: dict[str, ShortfallActionSchema] | None = Field(default=None, ...)`
- Field is properly optional with descriptive documentation

### 2. `shortfall_handling` is a map keyed by part ID (4-character string) with action object
**Status**: PASS

**Evidence**:
- `app/schemas/pick_list.py:22-29` - `ShortfallActionSchema` defined with `action: ShortfallAction` field
- `app/schemas/pick_list.py:39-48` - Map structure: `dict[str, ShortfallActionSchema]`
- Keys are part keys (e.g., "ABCD"), values are action objects

### 3. Support `reject` action - fails pick list creation if part has shortfall (default behavior)
**Status**: PASS

**Evidence**:
- `app/schemas/pick_list.py:14-20` - `ShortfallAction.REJECT` enum value
- `app/services/kit_pick_list_service.py:126-130` - Collects parts for rejection
- `app/services/kit_pick_list_service.py:144-153` - Raises `InvalidOperationException` with rejected part keys
- Tests: `tests/services/test_kit_pick_list_service.py:1109-1152`

### 4. Support `limit` action - limits quantity to what is available in stock
**Status**: PASS

**Evidence**:
- `app/schemas/pick_list.py:17` - `ShortfallAction.LIMIT` enum value
- `app/services/kit_pick_list_service.py:133-135` - Reduces `required_total` to `usable_quantity`
- Tests: `tests/services/test_kit_pick_list_service.py:1153-1180` and `tests/api/test_pick_lists_api.py:568-592`
- Also handles reservations correctly: `tests/services/test_kit_pick_list_service.py:1380-1429`

### 5. Support `omit` action - completely omits part from pick list (no KitPickListLine rows)
**Status**: PASS

**Evidence**:
- `app/schemas/pick_list.py:18` - `ShortfallAction.OMIT` enum value
- `app/services/kit_pick_list_service.py:130-132` - Uses `continue` to skip allocation entirely
- Tests: `tests/services/test_kit_pick_list_service.py:1181-1214` and `tests/api/test_pick_lists_api.py:593-643`

### 6. Parts not specified in `shortfall_handling` default to `reject` behavior
**Status**: PASS

**Evidence**:
- `app/services/kit_pick_list_service.py:95-99` - Builds `action_lookup` from shortfall_handling
- `app/services/kit_pick_list_service.py:127` - `action = action_lookup.get(part_key, "reject")`
- Tests: `tests/services/test_kit_pick_list_service.py:1109-1128` (default reject)
- Tests: `tests/services/test_kit_pick_list_service.py:1277-1319` (parts without shortfall use full quantity)

### 7. Reject request (409) if all parts would be omitted (zero lines would result)
**Status**: PASS

**Evidence**:
- `app/services/kit_pick_list_service.py:155-160` - Explicit check for `all_parts_omitted` flag
- Error message: "all parts would be omitted; cannot create empty pick list"
- Tests: `tests/services/test_kit_pick_list_service.py:1215-1241`
- Tests: `tests/api/test_pick_lists_api.py:644-665`

### 8. Allow creating pick list if all parts are limited to zero quantity (empty but valid pick list)
**Status**: PASS

**Evidence**:
- `app/services/kit_pick_list_service.py:212-236` - Creates pick list even with zero lines when not all omitted
- Distinguishes omit action (invalid empty) from limit-to-zero (valid empty)
- Tests: `tests/services/test_kit_pick_list_service.py:1242-1276`

## Test Coverage Summary

- **Service tests**: 11 shortfall-specific test cases in `TestShortfallHandling` class
- **API tests**: 9 shortfall-specific test cases in `TestShortfallHandlingApi` class
- Total: 20+ tests covering all actions, edge cases, mixed scenarios, and error conditions

## Conclusion

All 8 requirements have been **fully implemented** with comprehensive test coverage.
