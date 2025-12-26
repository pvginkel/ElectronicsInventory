# Plan Execution Report: Pick List Line Quantity Edit

## Status

**DONE** - The plan was implemented successfully with all requirements met and all issues resolved.

## Summary

Implemented the ability to edit the `quantity_to_pick` field on pick list lines via a new PATCH endpoint. This enables users to adjust quantities for partial builds or build variants that differ from the kit's default template quantities.

Key deliverables:
- Database migration to relax constraint from `>= 1` to `>= 0`
- New PATCH endpoint at `/pick-lists/<pick_list_id>/lines/<line_id>`
- New service method `update_line_quantity()` with proper validation
- Enhanced `pick_line()` and `undo_line()` to handle zero-quantity lines
- Comprehensive test coverage (20 new tests)
- Metrics instrumentation for quantity updates

## Code Review Summary

| Severity | Count | Status |
|----------|-------|--------|
| BLOCKER  | 1     | Resolved |
| MAJOR    | 0     | N/A |
| MINOR    | 0     | N/A |

**Blocker Resolved**: The `undo_line()` method would fail for zero-quantity picked lines because it checked for `inventory_change_id` before handling the zero-quantity case. Fixed by adding an early return for zero-quantity lines that resets status without attempting inventory operations.

## Verification Results

### Linting (ruff)
```
poetry run ruff check .
# No output - all checks passed
```

### Type Checking (mypy)
```
poetry run mypy .
Success: no issues found in 236 source files
```

### Test Suite (pytest)
```
poetry run pytest
1122 passed, 1 skipped, 30 deselected in 128.81s
```

All tests pass, including:
- 51 tests in pick list service and API test files
- 20 new tests added for quantity update functionality
- Updated constraint test to verify >= 0 behavior

## Files Created

1. `alembic/versions/019_relax_pick_list_line_quantity_constraint.py` - Database migration

## Files Modified

1. `app/models/kit_pick_list_line.py` - Updated constraint to >= 0
2. `app/schemas/pick_list.py` - Added `PickListLineQuantityUpdateSchema`
3. `app/services/kit_pick_list_service.py` - Added `update_line_quantity()`, enhanced `pick_line()` and `undo_line()` for zero-quantity handling
4. `app/services/metrics_service.py` - Added `record_pick_list_line_quantity_updated()` method
5. `app/api/pick_lists.py` - Added PATCH endpoint
6. `tests/services/test_kit_pick_list_service.py` - Added 11 new service tests
7. `tests/api/test_pick_lists_api.py` - Added 9 new API tests
8. `tests/test_database_constraints.py` - Updated constraint test for >= 0 behavior

## Outstanding Work & Suggested Improvements

No outstanding work required.

**Deployment Note**: The database migration (`019_relax_pick_list_line_quantity_constraint.py`) must be applied before deploying the new API endpoint. Run `poetry run python -m app.cli upgrade-db` before starting the updated application.

**UX Consideration**: Zero-quantity lines remain in `OPEN` status until explicitly picked. Users must call the `/pick` endpoint on zero-quantity lines to mark them as completed, which allows the pick list to transition to `COMPLETED` status. This is intentional behavior documented in the plan.
