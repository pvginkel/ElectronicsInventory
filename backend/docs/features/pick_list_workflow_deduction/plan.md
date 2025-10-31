# Pick list workflow & deduction – backend plan

Provide the backend for “Pick list workflow & deduction” from `docs/epics/kits_feature_breakdown.md`, delivering the persisted pick list tool that auto-allocates stock per location, enforces availability, and lets operators finish lines with a single “Picked” action while keeping deduction history for undo.

## Target files
- `alembic/versions/020_pick_list_workflow.py` – rebuild `kit_pick_lists` with the final columns (`requested_units`, `status` enum `open`/`completed`, `completed_at`, timestamps) and create `kit_pick_list_lines` (`quantity_to_pick`, `inventory_change_id` FK, `picked_at`, timestamps, statuses, FK to `kit_contents`/`locations`, unique constraint on `(pick_list_id, kit_content_id, location_id)`, index on `(pick_list_id, status)`). No backfill required; migration can freely drop and recreate structures because the feature has not shipped yet.
- `app/models/kit_pick_list.py` – adjust `KitPickListStatus` values to `open`/`completed`, drop unused fields from the initial draft schema, add relationship to new `KitPickListLine` model, expose helper properties used by schemas.
- `app/models/kit_pick_list_line.py` (new) – define line ORM with FKs to pick list, kit content, and location; include `PickListLineStatus` enum (`open`, `completed`), `quantity_to_pick` check constraint, `picked_at` column, `inventory_change_id` relationship to `QuantityHistory`, uniqueness/index definitions; ensure cascade delete on parent pick list.
- `app/models/kit_content.py` & `app/models/__init__.py` – add relationship hook for `pick_list_lines` to support joins and export new model/enums.
- `app/services/kit_pick_list_service.py` (new) – business logic for allocator, pick, and undo workflows; expose `create_pick_list`, `get_pick_list_detail`, `list_pick_lists_for_kit`, `pick_line`, and `undo_line`; perform kit activation checks via direct SQLAlchemy queries to avoid service cycles.
- `app/services/kit_service.py` – update badge counts to respect new status values (`status != completed`), surface summary payloads for kit detail, and delegate creation/lookup guards without depending on the pick list service.
- `app/services/inventory_service.py` – have `remove_stock` return the persisted `QuantityHistory` row (for `inventory_change_id` capture) and ensure `add_stock` can be reused for undo so reopening lines simply re-adds quantities.
- `app/services/metrics_service.py` – add counters/histograms for pick list creation, line picks, undo durations/outcomes, and request counters for pick list detail/list endpoints.
- `app/services/container.py` – register `kit_pick_list_service` factory, wire dependencies (session, `InventoryService`, `KitService`, `MetricsService`), and expose provider for API wiring.
- `app/schemas/pick_list.py` (new) – request/response Pydantic models: `KitPickListCreateSchema`, `KitPickListDetailSchema`, `KitPickListLineSchema`, `KitPickListSummarySchema`, with `is_archived_ui` computed field mirroring epic language (`status == completed`).
- `app/schemas/kit.py` – update `KitPickListSchema` to match new fields and computed flag, add imports for the new enums used in detail responses.
- `app/api/pick_lists.py` (new) – blueprint with Spectree validation for `POST /kits/<int:kit_id>/pick-lists`, `GET /pick-lists/<int:pick_list_id>`, `POST /pick-lists/<int:pick_list_id>/lines/<int:line_id>/pick`, `POST /pick-lists/<int:pick_list_id>/lines/<int:line_id>/undo`, and `GET /kits/<int:kit_id>/pick-lists`.
- `app/api/kits.py` – delegate pick list summary retrieval to the new service and ensure badge counts stay in sync with `status != completed`.
- `app/api/__init__.py` & `app/__init__.py` – register the new blueprint and wire dependency injector modules.
- `app/services/test_data_service.py`, `app/data/test_data/kit_pick_lists.json`, `app/data/test_data/kit_pick_list_lines.json` (new) – load persisted lines that reflect greedy allocation results, ensure status values align with new enums, and update fixtures for tests.
- Tests: add `tests/services/test_kit_pick_list_service.py`, `tests/api/test_pick_lists_api.py`, extend `tests/services/test_kit_service.py`, `tests/api/test_kits_api.py`, `tests/test_database_constraints.py`, dataset-driven fixtures, and metrics stubs to cover the new workflow and schema constraints.

## Algorithm details

### Pick list creation (auto-allocation)
1. Load the active kit via direct `select()` on `Kit` (with a status guard) to ensure it is not archived; eager load contents and parts for allocation without depending on `KitService`.
2. Compute `required_total = required_per_unit × requested_units` for each kit content row, capturing the totals alongside part keys for later summary.
3. Fetch all `PartLocation` rows for the involved parts ordered by ascending `qty`, then `box_no`, then `loc_no`.
4. Greedily allocate: for each location, set `quantity_to_pick = min(remaining_required, location.qty)`; append immutable `KitPickListLine` entities referencing the chosen location and decrement the remaining requirement.
5. Abort creation with `InvalidOperationException` (HTTP 409) if any part cannot be fully satisfied—“no partial pick lists are stored” per the epic; otherwise flush the pick list and lines, leaving them read-only.

### Line pick operation
1. Fetch the target line with `select_for_update`, including parent pick list and location metadata; ensure `status == open`.
2. Call `InventoryService.remove_stock` with the stored location and `quantity_to_pick`; persist the returned `QuantityHistory.id` into `inventory_change_id` and stamp `picked_at`.
3. Set line status to `completed`; when all sibling lines are completed, mark the pick list `status = completed`, set `completed_at`, and emit metrics for completion.

### Undo operation
1. Load the completed line and ensure `inventory_change_id` is present; if already open, treat as idempotent success.
2. Restore stock by invoking `InventoryService.add_stock` with the original part/location/quantity to reapply inventory and record the compensating `QuantityHistory` entry.
3. Clear `inventory_change_id`, reset `picked_at`, flip line status back to `open`, and revert the parent pick list to `status = open` with `completed_at = None`.

## Implementation phases
- **Phase 1 – Persistence & fixtures**: Ship the Alembic migration, ORM models, constraint tests, and updated test data loader/files to ensure schema integrity before business logic lands.
- **Phase 2 – Services & metrics**: Implement `KitPickListService`, inventory helpers, metric hooks, container wiring, and unit tests covering allocation success/insufficient stock, pick, undo, and badge recalculation.
- **Phase 3 – API & integration**: Add the pick list blueprint, Spectree schemas, kit API adjustments, register the wiring, and complete endpoint/fixture tests so REST flows match the epic (`POST /kits/<kit_id>/pick-lists`, `POST /pick-lists/<id>/lines/<line_id>/pick`, `POST /pick-lists/<id>/lines/<line_id>/undo`, `GET /kits/<int:kit_id>/pick-lists`, `GET /pick-lists/<int:pick_list_id>`).
