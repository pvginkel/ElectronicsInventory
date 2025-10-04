# Shopping List Ready View Phase 2 – Code Review

## Findings
- **Medium – Seller override cannot be cleared back to default/ungrouped**
  - `app/services/shopping_list_line_service.py:83-114`
  - `ShoppingListLineService.update_line` only updates when `seller_id` is not `None`, so a payload with `{"seller_id": null}` is treated as "no change". Once a line has a seller override there is no way to revert to the part's default seller (or to the ungrouped bucket) through the API, which blocks the Ready view requirement for regrouping lines. Please detect whether the field was provided separately from the value (e.g., check `'seller_id' in updates`) and allow setting the column back to `NULL`.
- **Medium – Ordering endpoints can downgrade DONE lines back to ORDERED**
  - `app/services/shopping_list_line_service.py:152-189`, `app/services/shopping_list_line_service.py:221-282`
  - Both `set_line_ordered` and `set_group_ordered` always force the status to `ORDERED`, even if a line is already `DONE`. That lets a Phase 4 line be pulled back into ordering accidentally (group order will touch every matching line). We should reject attempts to order lines with `status == DONE` instead of silently flipping them back.

## Notes
- The rest of the implementation aligns with the plan and the accompanying test coverage looks solid.
