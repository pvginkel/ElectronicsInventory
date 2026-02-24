# Shopping List Kanban — Requirements Verification

All **22 requirements** from the User Requirements Checklist verified as **PASS**.

## Checklist Verification

| # | Requirement | Status | Evidence |
|---|-------------|--------|----------|
| 1 | Replace shopping list status enum `concept \| ready \| done` with `active \| done` | PASS | `app/models/shopping_list.py` — `ShoppingListStatus` enum has `ACTIVE` and `DONE` only |
| 2 | Migrate existing `concept` and `ready` lists to `active` (Alembic migration) | PASS | `alembic/versions/023_shopping_list_kanban.py` — `UPDATE shopping_lists SET status='active' WHERE status IN ('concept','ready')` |
| 3 | `active → done` is the only status transition; no preconditions enforced | PASS | `app/services/shopping_list_service.py` — `set_list_status` only allows ACTIVE→DONE, no preconditions |
| 4 | Refactor `shopping_list_seller_notes` table into `shopping_list_sellers` | PASS | `app/models/shopping_list_seller.py` — new model with `seller_id`, `note`, `status`, timestamps |
| 5 | Seller group POST: create empty seller group; 409 if already exists | PASS | `app/services/shopping_list_service.py:create_seller_group`, `tests/services/test_shopping_list_service.py::TestSellerGroupService::test_create_seller_group_duplicate_raises_conflict` |
| 6 | Seller group GET: return `ShoppingListSellerGroupSchema` | PASS | `app/api/shopping_lists.py:get_seller_group`, `tests/api/test_shopping_lists_api.py` |
| 7 | Seller group PUT: update note/status; ordering transitions lines; reopening reverts | PASS | `app/services/shopping_list_service.py:update_seller_group`, `order_seller_group`, `reopen_seller_group` |
| 8 | Seller group PUT ordering precondition: all lines must have `ordered > 0` | PASS | `tests/services/test_shopping_list_service.py::test_order_seller_group_requires_ordered_qty_on_all_lines` |
| 9 | Seller group PUT reopen precondition: no line may have `received > 0` | PASS | `tests/services/test_shopping_list_service.py::test_reopen_seller_group_blocked_if_received` |
| 10 | Seller group DELETE: blocked if ordered; moves lines to unassigned; skips DONE lines | PASS | `tests/services/test_shopping_list_service.py::test_delete_seller_group_blocks_ordered`, `test_delete_seller_group_preserves_done_lines` |
| 11 | Remove `POST /shopping-list-lines/{line_id}/order` | PASS | Endpoint removed from `app/api/shopping_list_lines.py` |
| 12 | Remove `POST /shopping-list-lines/{line_id}/revert` | PASS | Endpoint removed from `app/api/shopping_list_lines.py` |
| 13 | Remove `POST /shopping-lists/{list_id}/seller-groups/{group_ref}/order` | PASS | Endpoint removed from `app/api/shopping_list_lines.py` |
| 14 | Remove `PUT /shopping-lists/{list_id}/seller-groups/{seller_id}/order-note` | PASS | Endpoint removed from `app/api/shopping_lists.py` |
| 15 | Add `ordered` field to line PUT; only settable when NEW | PASS | `app/services/shopping_list_line_service.py:update_line`, `tests/services/test_shopping_list_line_service.py` |
| 16 | Block `seller_id` change on ORDERED lines | PASS | `app/services/shopping_list_line_service.py:update_line` raises `InvalidOperationException` |
| 17 | Ungrouped lines cannot reach ORDERED or be received | PASS | `app/models/shopping_list_line.py:can_receive` checks `seller_id is not None` |
| 18 | Mutation endpoints return the mutated resource, not full shopping list | PASS | All seller group endpoints return `ShoppingListSellerGroupSchema` |
| 19 | Update `ShoppingListSellerGroupSchema` to include status field | PASS | `app/schemas/shopping_list.py` — schema has `status` field |
| 20 | Migrate existing seller notes into new table | PASS | Migration 023 copies data with `INSERT INTO shopping_list_sellers ... SELECT FROM shopping_list_seller_notes` |
| 21 | Update test data files | PASS | `app/data/test_data/shopping_list_sellers.json` replaces old file, `shopping_lists.json` updated |
| 22 | Comprehensive service and API tests | PASS | 18 service tests for seller groups, 9 API tests, plus updated line tests |
