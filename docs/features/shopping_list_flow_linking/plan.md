Brief Description
-----------------
Implement the backend for the “Shopping list flow & linking” feature from `docs/epics/kits_feature_breakdown.md`, enabling planners to “Allow planners to generate or extend purchasing lists from a kit, while keeping bidirectional traceability between kits and shopping lists.” Previous work already delivered the Kits overview and Kit detail foundations; this plan covers the remaining shopping-list-specific workflows.

Impacted Files and Functions
----------------------------
- `alembic/versions/<timestamp>_reshape_kit_shopping_list_links.py`: Alter the `kit_shopping_list_links` table to add `requested_units`, `honor_reserved`, enforce non-null `snapshot_kit_updated_at`, keep existing `created_at`/`updated_at`, and drop `linked_status`/`is_stale`. Backfill legacy rows setting `requested_units` to each link’s current `Kit.build_target` (minimum 1) and `honor_reserved` to `false`, and reuse the existing `uq_kit_shopping_list_link` and `ix_kit_shopping_list_links_shopping_list_id` definitions without recreating them.
- `app/models/kit_shopping_list_link.py`: Align the ORM model with the new columns, expose `requested_units`, `honor_reserved`, and compute `is_stale` dynamically via `kit.updated_at > snapshot_kit_updated_at`. Keep relationships cascading with `Kit.shopping_list_links` and `ShoppingList.kit_links`.
- `app/models/kit.py`: Ensure relationship metadata (cascade, ordering) supports new fields, and add helper properties (e.g., `shopping_list_badge_count`) without persisting stale snapshots.
- `app/models/shopping_list.py`: Confirm `kit_links` relationship uses `cascade="all, delete-orphan"` so unlinking removes join rows.
- `app/services/kit_service.py`: 
  - Update `list_kits` badge counts to join `ShoppingList` for live status filtering (`status in {concept, ready}`) now that `linked_status` is gone.
  - Extend `get_kit_detail` to hydrate link chips with `requested_units`, `honor_reserved`, live `shopping_list.status`, and computed `is_stale`.
  - Provide helper to enforce archived kits remain read-only when invoking the new flow.
- `app/services/kit_shopping_list_service.py` (new): Encapsulate shopping-list-specific business logic:
  - `create_or_append_list(kit_id, *, units, honor_reserved, shopping_list_id, note_prefix)` implements “Present dialog with Order-for-N control defaulting to kit build target and Honor-reserved toggle defaulting to OFF,” calculates needed quantities, creates new Concept list when `shopping_list_id` is absent, or merges onto an existing Concept list.
  - `list_links_for_kit(kit_id)` returns the chips described under “Show chips on kit detail summarizing linked lists…”.
  - `list_kits_for_shopping_list(list_id)` surfaces reciprocal kits for `/shopping-lists/<int:list_id>/kits`.
  - `unlink(link_id)` enforces the “Allow unlinking with confirmation without altering list contents.”
- `app/services/shopping_list_service.py`: 
  - Add a query method to fetch lists filtered by multiple `ShoppingListStatus` values (“Extend existing query schema to accept `status` filter (list of `ShoppingListStatus` values) so the UI can fetch only concept lists for the dialog.”).
  - Provide helper to lazily load a Concept list for append flows, raising `InvalidOperationException` if the status is not `concept`.
- `app/services/shopping_list_line_service.py`: Add merge helper that increases `needed` when a part already exists, appends the provenance note `"[From Kit <name>]: <BOM note>"` (respecting existing notes), and guards against non-Concept lists.
- `app/services/kit_reservation_service.py` & `app/services/inventory_service.py`: Ensure they expose efficient helpers used by the new flow (reserved totals, in-stock totals) so `create_or_append_list` can reuse them without duplicating queries.
- `app/services/metrics_service.py`: Introduce `kit_shopping_list_push_total` (counter labelled by `outcome` + `honor_reserved`), `kit_shopping_list_push_seconds` (histogram), and `kit_shopping_list_unlink_total` (counter labelled by `outcome`); expose helper methods `record_kit_shopping_list_push`/`record_kit_shopping_list_unlink` that KitShoppingListService can call.
- `app/services/container.py`: Register the new `kit_shopping_list_service` and wire dependencies (`inventory_service`, `kit_reservation_service`, `shopping_list_service`, `shopping_list_line_service`, `metrics_service`).
- `app/services/test_data_service.py`: Update `load_kit_shopping_list_links` to populate `requested_units`, `honor_reserved`, and `snapshot_kit_updated_at` while dropping references to `linked_status`/`is_stale`; add validation for the new fields.
- `app/schemas/kit.py`: 
  - Replace `KitShoppingListLinkSchema` to expose `shopping_list_id`, `shopping_list_name`, `status`, `requested_units`, `honor_reserved`, `snapshot_kit_updated_at`, `is_stale`, timestamps.
  - Add request/response schemas: `KitShoppingListRequestSchema`, `KitShoppingListLinkResponseSchema`, `KitShoppingListChipSchema`.
- `app/schemas/shopping_list.py`: Extend `ShoppingListListQuerySchema` to accept an optional list of statuses (support query strings like `status=concept&status=ready` or comma-separated), and model the reciprocal chip schema (`KitChipSchema`) returned by `/shopping-lists/<id>/kits`.
- `app/api/kits.py`: 
  - Add `POST /kits/<int:kit_id>/shopping-lists` using the new request schema and service façade.
  - Add `GET /kits/<int:kit_id>/shopping-lists` to return the chip array used on kit detail.
- `app/api/shopping_lists.py`: 
  - Accept the new `status` filter for list queries (alongside `include_done` for backwards compatibility).
  - Add `GET /shopping-lists/<int:list_id>/kits` to surface linked kits via the service.
- `app/api/kit_shopping_list_links.py` (new blueprint): Handle `DELETE /kit-shopping-list-links/<int:link_id>` for unlink confirmations; register blueprint in `app/api/__init__.py`.
- `app/utils/request_parsing.py`: Add helper to parse repeated or comma-separated enum query params for statuses.
- `tests/services/test_kit_service.py`: Update badge tests to account for the live join and new schema; add coverage for `get_kit_detail` returning `requested_units`, `honor_reserved`, and `is_stale`.
- `tests/services/test_kit_shopping_list_service.py` (new): 
  - Cover “Calculate Needed quantity per line based on selected units and reserved mode, zero-clamping negatives.”
  - Verify append vs create flows, merge behavior, note concatenation, archived kit guard, Concept-only enforcement, idempotent quantity merging, zero-shortage no-op handling, list chip queries, and unlink edge cases.
- `tests/services/test_shopping_list_service.py` / `test_shopping_list_line_service.py`: Extend coverage for the new helpers (status filtering, merge logic).
- `tests/api/test_kits_api.py`: Add endpoint tests for shopping list creation/append and chip retrieval, including Honor-reserved variations and stale flagging.
- `tests/api/test_shopping_lists_api.py`: Cover new status filters, reciprocal kits endpoint, and unlink flow.
- `tests/api/test_kit_shopping_list_links_api.py` (new) or extend existing files to cover the DELETE route edge cases (unknown link, already removed, archived kit).
- `app/data/test_data/*.json`: 
  - Reshape `kit_shopping_list_links.json` to include `requested_units`, `honor_reserved`, and `snapshot_kit_updated_at`.
  - Ensure `shopping_lists.json` & `kit_contents.json` values align so sample data exercises both Honor-reserved OFF/ON scenarios and produces links for chips.
- Update associated loader tests (`tests/test_test_data_service.py`) to reflect new fixtures.
- `docs/openapi.md` or generated API docs if applicable: Update to reflect the new endpoints and schema changes (execution plan should confirm where docs are stored).

Algorithms & Data Flow
----------------------
1. **Needed quantity computation (“Calculate Needed quantity per line based on selected units and reserved mode, zero-clamping negatives.”)**  
   - Load the target kit with contents (enforce `Kit.status == active` to satisfy “Archived Kits are read-only.”).  
   - Build `part_ids`/`part_keys` arrays once.  
   - Fetch `reserved_totals = kit_reservation_service.get_reserved_totals_for_parts(part_ids, exclude_kit_id=kit_id)` to satisfy “Exclude archived kits and ignore pick lists entirely from reservation totals.”  
   - Fetch `in_stock_totals = inventory_service.get_total_quantities_by_part_keys(part_keys)` (existing helper).  
   - For each content row:
     - `base_required = required_per_unit * units` where units defaults to the kit `build_target` per “Order-for-N control defaulting to kit build target.”  
     - `available = in_stock_totals.get(part_key, 0)`; if `honor_reserved` is true (defaults to OFF), calculate `available = max(available - reserved_totals.get(part_id, 0), 0)` to implement “Honor-reserved toggle defaulting to OFF.”  
     - `needed = max(base_required - available, 0)` (“zero-clamping negatives”).  
     - Skip rows with `needed == 0`; accumulate payload describing part, quantity, and provenance note text (include BOM note when present).
2. **Create vs append logic (“Support creating a new Concept shopping list or appending to an existing Concept list, merging quantities when lines already exist.”)**  
   - When `shopping_list_id` is absent: call `ShoppingListService.create_list(...)` with generated name (front end will supply), keep status `concept`, and attach aggregated counts after lines are added.  
   - When `shopping_list_id` present: fetch list under `FOR UPDATE`, ensure `status == concept`; otherwise raise `InvalidOperationException` per “Service enforces that kit pushes target lists in concept state.”  
   - For each `needed` line:  
     - If the list already has a `ShoppingListLine` for the part, increment `line.needed += needed` and append a note segment.  
     - Otherwise create a new line with `needed`, `note`, and optional seller info.  
     - Append provenance text to the note by concatenating with `\n` when the line already has content, using the exact format `"[From Kit <kit.name>]: <BOM note or provided note_prefix>"` in line with “Append `[From Kit <name>]: <BOM note>` to line notes when merging, preserving prior notes.” (when the BOM note is empty use the supplied `note_prefix` alone).  
   - Update the parent list’s `updated_at` via `_touch_list` and flush once per transaction.  
   - When every `needed` value is zero, short-circuit without creating a list or link and return a “no changes” response payload for the API.
3. **Link table persistence and chip computation (“Keep bidirectional traceability between kits and shopping lists.”)**  
   - After lines are written, upsert `KitShoppingListLink` using the unique `(kit_id, shopping_list_id)` key. Store `requested_units=units`, `honor_reserved`, `snapshot_kit_updated_at=kit.updated_at`, timestamps.  
   - Recompute `is_stale` on access as `kit.updated_at > snapshot_kit_updated_at` so any kit mutations trigger the warning described in “Show chips on kit detail summarizing linked lists with state badge, stale warning when kit updated after snapshot.”  
   - Return response payload containing both link metadata and refreshed `ShoppingListResponseSchema` (the epic explicitly requires returning the list “plus refreshed `ShoppingListResponseSchema`”).  
   - For reciprocal listing, join `KitShoppingListLink` → `Kit` to build `KitChipSchema` containing `kit_id`, `kit_name`, `status`, `is_stale`, fulfilling “Show chips on shopping list detail indicating every originating kit.”
4. **Unlink flow (“Allow unlinking with confirmation without altering list contents.”)**  
   - Endpoint loads `KitShoppingListLink` row, deletes it (cascades via relationship) without mutating `ShoppingListLine` rows, and returns 204.  
   - Update `KitService.list_kits` to ensure badge counters decrement automatically because they now derive from live joins (no manual adjustments needed).  
   - Emit metrics via `metrics_service.record_kit_shopping_list_unlink`.
5. **Status-filtered shopping list search (“Extend existing query schema to accept `status` filter (list of `ShoppingListStatus` values) so the UI can fetch only concept lists for the dialog.”)**  
   - Parse multi-value query param, convert to `ShoppingListStatus` enums, and apply SQLAlchemy `where(ShoppingList.status.in_(...))`.  
   - Maintain compatibility with `include_done` flag by applying filters in combination (intersection).  
   - Tests should cover scenarios mixing both filters to confirm correct behavior.

Implementation Phases
---------------------
1. **Persistence & Models**  
   - Draft Alembic migration reshaping `kit_shopping_list_links` (add/remove columns, reuse existing indexes/constraints, backfill defaults for `requested_units`/`honor_reserved` using existing `Kit` data, update `snapshot_kit_updated_at` to `Kit.updated_at` where missing).  
   - Update SQLAlchemy models (`KitShoppingListLink`, `Kit`, `ShoppingList`) and regenerate `__repr__`/guidepost comments.  
   - Refresh fixed dataset JSON to match new schema; update `TestDataService.load_kit_shopping_list_links` and associated tests; run `poetry run python -m app.cli load-test-data --yes-i-am-sure` to verify seeding locally (document expected adjustments in commit notes).  
   - Extend model tests if present (e.g., invariants around uniqueness / cascade).
2. **Service Layer**  
   - Introduce `KitShoppingListService` with constructor injection for `InventoryService`, `KitReservationService`, `ShoppingListService`, `ShoppingListLineService`, and optional `MetricsService`.  
   - Implement computation/merge helpers described above, plus protective checks (archived kit, Concept-only lists, zero-needed lines, unique link upsert).  
   - Update `KitService` to delegate shopping-list-specific work to the new service, adjust badge queries to use live statuses, and enrich detail payloads.  
   - Enhance `ShoppingListService` and `ShoppingListLineService` with reusable helpers and ensure transaction boundaries remain consistent (use `self.db.flush()` appropriately).  
   - Add metrics emission in both create/append and unlink paths (`record_kit_shopping_list_push`, `record_kit_shopping_list_unlink`, push duration histogram).
   - Write comprehensive service tests covering success, validation errors, honor-reserved math, merge notes, and stale detection.
3. **API & Schemas**  
   - Revise Pydantic schemas (kit + shopping list) and update `Spectree` registrations.  
   - Extend `app/api/kits.py`, `app/api/shopping_lists.py`, and add `app/api/kit_shopping_list_links.py`; wire route functions with `@inject` & `@handle_api_errors`, parse query params via new helper, and return the updated response schemas.  
   - Register the new blueprint in `app/api/__init__.py` and wire the container for dependency injection in `app/__init__.py` (ensure module is listed in `container.wire`).  
   - Update OpenAPI docs if the project maintains hand-written specs.  
   - Add API tests for new endpoints, verifying HTTP status codes, response payload shapes, validation failures (bad status filters, archived kit, non-concept target, unlinking nonexistent link).
4. **Validation, Metrics, and Regression Coverage**  
   - Add metrics tests or stubs to guarantee counters increment.  
   - Update existing kit overview/detail tests and fixture builders to populate `requested_units`/`honor_reserved`.  
   - Confirm the badge counts still function via service/API tests after the query rewrite.  
   - Run and fix `poetry run ruff check .`, `poetry run mypy .`, `poetry run pytest` to honor the Definition of Done; resolve typing updates (e.g., new enums, schema conversions).  
   - Document any developer notes (if required) on how to seed concept lists for manual QA.
