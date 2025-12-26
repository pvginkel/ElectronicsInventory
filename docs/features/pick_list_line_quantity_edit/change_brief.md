# Change Brief: Pick List Line Quantity Edit

## Problem

When a pick list is created, the `quantity_to_pick` for each line is calculated as `required_per_unit × requested_units` from the kit contents. This value is fixed and cannot be modified.

In practice, users need flexibility to adjust quantities after creation. For example:
- A kit defines 12 PhotoMOS relays as required, but for a specific build variant only 2 are needed
- Users shouldn't be forced to pick expensive components they won't use
- Partial builds or variants require different quantities than the kit template defines

## Required Changes

1. **Add an API endpoint to update the quantity on a pick list line**
   - Use `PATCH /pick-lists/<pick_list_id>/lines/<line_id>` (consistent with existing PATCH usage in kits.py)
   - Accept a `quantity_to_pick` field in the request body
   - Return the updated pick list detail

2. **Validation rules**
   - Quantity must be >= 0 (0 is allowed to skip picking a part without deleting the line)
   - No upper bound on quantity
   - Line must be in `OPEN` status (cannot edit already-picked lines)
   - Pick list must be in `OPEN` status

3. **Side effects**
   - Update the line's `quantity_to_pick` field
   - Update the pick list's `updated_at` timestamp

## Out of Scope

- Deleting lines (use quantity 0 to skip instead)
- Editing other line fields (location, part, etc.)
- Recalculating or rebalancing allocations across locations
