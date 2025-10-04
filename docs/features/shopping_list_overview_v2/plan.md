# Shopping List Overview V2 Phase 5 Plan

## Brief Description

Implement the backend scope for **Phase 5 — “Lists Overview v2 (archive & counters)”** from `docs/epics/shopping_list_phases.md`, delivering the ability to **“Mark list as done (final status)”** while keeping completed lists out of default listings, and exposing the **“Aggregate counts per list: number of lines by status (New/Ordered/Done) and last-updated timestamp.”** The plan assumes prior shopping list phases are in place per `docs/epics/shopping_list_brief.md`.

## Files to Create or Modify

### Services
- `app/services/shopping_list_service.py`
  - Ensure list queries surface the new overview requirements by ordering results primarily by `updated_at` (newest first) so the “last updated” metric drives the overview card ordering.
  - Tighten `set_list_status` behaviour for the "final status" rule: forbid any attempt to reopen a list once status is `ShoppingListStatus.DONE`, and make sure transitions log a precise `InvalidOperationException` message the UI can display.
  - Extend `_touch_list` usage so all mutations (including line CRUD) refresh `updated_at`, guaranteeing the timestamp exposed to the overview truly tracks recent work.
  - Block metadata edits and seller note updates once a list reaches `DONE`, while keeping `delete_list` behaviour unchanged so completed lists can still be removed deliberately.
  - Keep `_attach_line_counts` the single path attaching the "New / Ordered / Done" counters so both detail and list payloads stay consistent; add small helper documentation/comments if needed for clarity.
- `app/services/shopping_list_line_service.py`
  - Guard every mutating path (`add_line`, `update_line`, `delete_line`, bulk/group order helpers) against `ShoppingList.status == ShoppingListStatus.DONE` to honour “final status”.
  - Call `_touch_list` whenever a line is inserted, updated, deleted, or otherwise changed so that parent `ShoppingList.updated_at` reflects the activity powering the overview timestamp.
  - Confirm duplicate-prevention and mismatch notes still function once additional guards are added; update error messages if Done status forbids work.

### Schemas
- `app/schemas/shopping_list.py`
  - Verify `ShoppingListListSchema` exposes both `line_counts` and a `last_updated` alias; adjust documentation strings/examples to emphasize the counters and timestamp for the overview cards.

### API Layer
- `app/api/shopping_lists.py`
  - Keep `GET /shopping-lists` defaulting to hide Done lists; document the `include_done` query parameter in the Spectree schema so the frontend can request archived lists for the “Done (hidden by default)” section.
  - Ensure `PUT /shopping-lists/<id>/status` returns a 409 with the refined error payload when attempting to reopen a Done list.

### Tests
- `tests/services/test_shopping_list_service.py`
  - Add coverage that verifying a list marked Done cannot transition back to Concept/Ready and that the service raises the expected exception message.
  - Confirm list ordering in `list_lists` respects `updated_at` by mutating multiple lists and asserting the returned order and timestamps.
- `tests/services/test_shopping_list_line_service.py`
  - Add cases proving all line mutations (add/update/delete, order transitions, receipts) touch the parent list timestamp, and that actions against Done lists raise `InvalidOperationException`.
- `tests/api/test_shopping_lists_api.py`
  - Validate default list responses exclude Done lists, but `include_done=true` returns them with accurate `line_counts` and `last_updated` fields.
  - Assert status update attempts on Done lists return HTTP 409 with the refined error message.
- `tests/api/test_shopping_list_lines_api.py`
  - Ensure attempting to modify lines on Done lists yields HTTP 409 and does not change payloads.

### Migrations & Data Fixtures
- No schema changes expected; confirm existing `ShoppingList.updated_at` column suffices once all `_touch_list` calls are in place.
- Update `app/data/test_data/shopping_lists.json` (and related fixtures) to include at least one Done list so overview counters and filtering can be exercised by integration tests and sample data.

## Algorithms

### Overview Counter Aggregation
1. Collect shopping list IDs returned by `list_lists`.
2. Execute a batched SQL aggregation using `CASE` expressions to sum counts where `ShoppingListLine.status` equals `new`, `ordered`, or `done`.
3. Populate a `dict` keyed by list ID with the three counts; default to zeros for lists without lines.
4. Attach the result via `_attach_line_counts`, caching it on the model instance as `line_counts = {"new": X, "ordered": Y, "done": Z}`.
5. Derive `has_ordered_lines` and `total` counts directly from that structure for schema consumption.

### Updated-At Propagation
1. Continue using the existing `_get_list_for_update` helpers around mutations without introducing new locking primitives, maintaining behavioural parity with the current services.
2. After the line-level change, call `_touch_list(shopping_list)` to set `updated_at = datetime.utcnow()`.
3. Flush the session so both the list timestamp and line changes persist before returning a hydrated DTO.
4. In tests, compare timestamps (e.g., using `freezegun` or manual `datetime.utcnow` increment) to ensure propagation occurs exactly once per mutation.

## Testing Requirements

- Service-layer tests must cover the Done status guardrails, aggregation accuracy, timestamp ordering, and duplicate prevention regression.
- API tests must assert response payloads include `line_counts` and `last_updated` values aligned with service logic, with correct filtering of Done lists.
- Test data fixtures must allow simulation of both Active (Concept/Ready) and Done lists with mixed line statuses so counters and timestamps can be validated end-to-end.
