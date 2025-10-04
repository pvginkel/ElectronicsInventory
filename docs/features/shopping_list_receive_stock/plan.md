# Shopping List Receive & Update Stock Phase 4 Plan

## Brief Description

Implement **Phase 4 — Receive & update stock (line by line)** from `docs/epics/shopping_list_phases.md`, enabling the “Update Stock” flow for Ordered shopping list lines. This phase must ensure **“Update Stock only allowed when Line Status = Ordered”**, accumulate the **“Receive now (int ≥ 1)”** quantity into part inventory via location allocations, persist timestamped stock movements, and let users **“Mark line as Done … with a mismatch reason/flag.”** The Update Stock CTA stays hidden for non-Ordered lines, and lines marked Done must disappear from default Active views while remaining accessible on the list.

## Files to Create or Modify

### Backend
- `app/models/shopping_list_line.py`
  - Add persistence for completion metadata (`completed_at`, `completion_mismatch`, `completion_note`) to capture the “mark line as Done … with a mismatch reason/flag” requirement.
  - Expose helper properties such as `can_receive` (true iff status is `ORDERED`) so the API can hide Update Stock for other states, and `has_quantity_mismatch` comparing `ordered` vs `received`.
- `alembic/versions/015_shopping_list_receive_phase.py` *(new)*
  - Migration adding the new columns plus indexes supporting `received` lookups and the updated status guards.
  - Ensure existing rows default `completion_mismatch` to `false`, `completion_note` to `NULL`, and backfill `completed_at` for legacy Done lines if present.
- `app/schemas/shopping_list_line.py`
  - Add request models:
    - `ShoppingListLineReceiveSchema` describing `receive_qty` and `allocations` (each with `box_no`, `loc_no`, `qty`).
    - `ShoppingListLineCompleteSchema` for explicit finish-without-receive calls, including optional `mismatch_reason` (required when `received != ordered`).
  - Extend response schema with `can_receive`, `completion_mismatch`, `completion_note`, `completed_at`, and an embedded list of part locations (`PartLocationInlineSchema` with `id`, `box_no`, `loc_no`, `qty`).
- `app/schemas/shopping_list.py`
  - Bubble new fields (`can_receive`, completion metadata) through list/detail payloads so UI conditions remain consistent.
- `app/services/shopping_list_line_service.py`
  - Inject `InventoryService` (and `PartService` if needed for key lookups) to orchestrate stock changes.
  - Implement `receive_line_stock(line_id, receive_qty, allocations)`:
    - Guard `line.status == ShoppingListLineStatus.ORDERED` per spec.
    - Validate `receive_qty >= 1`, allocations present, each `qty >= 1`, and sum equals `receive_qty`.
    - For each allocation call `inventory_service.add_stock(part.key, box_no, loc_no, qty)` to update quantities and emit `QuantityHistory` records.
    - Increment `line.received` and refresh related aggregates; flush and return hydrated line.
    - Touch the parent shopping list so list-level timestamps and aggregations reflect the change.
  - Add `complete_line(line_id, mismatch_reason=None)` handling:
    - Allow completion only from `ORDERED` status (“Line can be Marked Done …”).
    - Require `mismatch_reason` when `line.received != line.ordered`, set `completion_mismatch` flag, store note, write `completed_at`, set status `DONE`.
    - Block any later edits (ensure existing `update_line` keeps raising for status DONE and extend to forbid seller overrides, etc.).
    - Touch the parent shopping list so Done transitions update Ready view metadata.
  - Update `_get_line` loads to include `Part.part_locations` and nested `Location` for inline payloads.
  - Emit new metrics (e.g., call `metrics_service.record_shopping_list_line_receipts(count, total_qty)`).
- `app/services/metrics_service.py`
  - Define counters/histograms for receiving (e.g., `shopping_list_lines_received_total`, `shopping_list_receive_quantity_total`, optional `shopping_list_receive_duration_seconds`).
  - Provide `record_shopping_list_line_receipt(lines:int, total_qty:int)` helper invoked by the service.
- `app/services/container.py`
  - Wire `inventory_service` (and any additional dependencies) into `shopping_list_line_service` provider, keeping factory order consistent.
- `app/api/shopping_list_lines.py`
  - Add `POST /shopping-list-lines/<int:line_id>/receive` endpoint, validating with `ShoppingListLineReceiveSchema` and returning `ShoppingListLineResponseSchema`.
  - Add `POST /shopping-list-lines/<int:line_id>/complete` endpoint using `ShoppingListLineCompleteSchema` for explicit completion without intake.
  - Ensure responses include refreshed line payloads with new fields and that non-Ordered lines trigger 409 errors mirroring service exceptions.
- `app/api/__init__.py`
  - Register any new blueprint routes (reuse existing blueprint but ensure wiring to new endpoints for OpenAPI generation).
- `app/services/inventory_service.py`
  - Expose a small helper (e.g., `add_stock_to_location(part_id, box_no, loc_no, qty)`) if needed to avoid repeated Part lookups, or document reuse of `add_stock` with part keys.
  - Ensure quantity history entries remain timestamped for the “Persist a stock movement record (timestamped) for history” requirement.
- `app/models/__init__.py`
  - Export any new helper dataclasses/schemas if required by updated imports.

### Frontend
- `openapi-cache/openapi.json` & generated client (`src/lib/api/generated/*`)
  - Refresh after backend schema changes so client exposes new `receive` and `complete` operations plus updated models.
- `src/lib/api/client.ts` (only if regenerated types require additional exports).
- Shopping list routes (assuming Phase 1-3 scaffolding lives under `src/routes/shopping-lists/`):
  - Update detail route (e.g., `src/routes/shopping-lists/$listId.tsx`) to fetch new fields (`can_receive`, `completion_mismatch`, `partLocations`) and to surface ordered-line collections for the modal’s “Save & next.”
  - Ensure Ready view hides Update Stock buttons when `line.can_receive === false`.
- New Update Stock modal component (e.g., `src/components/shopping-lists/update-stock-modal.tsx`):
  - Render part/seller summary (`Part` name, default/override seller) and show “Needed / Ordered / Received”.
  - Provide form controls for **“Quantity to receive now”** and dynamic allocation rows supporting both existing locations (pre-populated from `partLocations`) and a selector for new locations (box/loc, with validation against duplicates).
  - Buttons: `Save`, `Save & next` (propagates callback to parent to advance to next Ordered line), and `Mark Done`. If `received !== ordered` upon completion, display confirmation collecting mismatch reason before invoking the dedicated `POST /shopping-list-lines/{id}/complete` endpoint with that note.
  - Hook into TanStack Query mutations calling the new `receive`/`complete` endpoints and invalidate relevant queries (list detail, part summary panels).
- Ready view seller groups (e.g., `src/components/shopping-lists/ready-view.tsx` or equivalent from Phase 2):
  - Pass down handler to open Update Stock modal for each ordered line, ensure CTA hidden until `line.status === 'ordered'`.
  - Reflect updated `received` totals immediately after mutation using query cache update helpers, and apply client-side filtering so Done lines drop out of the default Active view.
- Part detail screen (Phase 3) adjustments (e.g., `src/routes/parts/$partKey.tsx`):
  - Where active list badges appear, update to include new completion status so UI can indicate when a line is Done but still listed.
- UI utilities:
  - Location picker (new helper under `src/components/inventory/location-selector.tsx`) to reuse across Update Stock flows.
  - Toast/notice utilities to report success (e.g., “Received 5 units into Box 7 / Loc 3”).

### Documentation & Tooling
- `docs/ops/openapi.md` or equivalent (if any) noting the new endpoints and the expectation to regenerate clients.
- `docs/features/shopping_list_receive_stock/plan.md` (this file) to be committed with plan details.

### Tests
- `tests/services/test_shopping_list_line_service.py`
  - Add cases covering:
    - Successful receipt allocating to multiple locations and incrementing `QuantityHistory` entries.
    - Guard that receiving on `status != ORDERED` raises `InvalidOperationException`.
    - Completion with equality vs mismatch paths (ensuring mismatch reason stored and flag toggled, editing blocked afterward).
    - Attempts to complete without reason when totals differ should raise and leave line unchanged.
- `tests/api/test_shopping_list_lines_api.py`
  - End-to-end tests for `POST /shopping-list-lines/{id}/receive` (valid allocation, invalid sum, non-existent location) and `POST /shopping-list-lines/{id}/complete` (mismatch reason enforcement, status transitions).
- Database migration tests (if suite includes) verifying new columns default correctly for existing rows.
- Frontend unit tests (React Testing Library) for `update-stock-modal` covering validation, mismatch confirmation, and “Save & next” callback.
- Frontend integration/e2e (Playwright) scenario walking through Ready view → Update Stock → Mark Done, ensuring UI hides Update Stock for non-Ordered lines and updates Received totals.

## Algorithms & Data Flow

### Receive Stock Workflow
1. **Pre-checks**: Load line by ID; verify `line.status == ordered` (**“Guard: Update Stock only allowed when Line Status = Ordered”**). Fetch parent list to ensure list itself is not Done.
2. **Request validation**: Ensure `receive_qty ≥ 1` and allocations array is non-empty. For each allocation, confirm `qty ≥ 1`, deduplicate by `(box_no, loc_no)`, and confirm sum equals `receive_qty`. Reject if any location lacks an existing `Location` row.
3. **Part lookup**: Resolve the associated `Part` (key + seller) and eager-load `part_locations` to prepare response payload.
4. **Inventory updates**: For each allocation invoke `inventory_service.add_stock(part.key, box_no, loc_no, qty)` which increments or creates `PartLocation` rows and emits `QuantityHistory` records with timestamps, satisfying “update the Part’s stock … and persist a stock movement record (timestamped).”
5. **Line mutation**: Add `receive_qty` to `line.received`, touch `line.updated_at`, recompute `line.is_revertible`/`can_receive`, and call `_touch_list` so the parent list reflects the change in `updated_at` and aggregates.
6. **Response**: Flush the session, refresh the line with updated `part` and `part_locations`, and return it to the caller.
7. **Metrics**: Record intake metrics via `metrics_service.record_shopping_list_line_receipt(lines=1, total_qty=receive_qty)`.

### Mark Line Done Without Receiving
1. Validate `line.status == ordered`; the completion endpoint does not accept inventory allocations.
2. Compare `line.received` vs `line.ordered`; enforce mismatch reason if unequal, set mismatch flag & note.
3. Update status to DONE, set `completed_at`, prevent further edits, and update list timestamps on both the line and its parent shopping list.
4. Respond with refreshed line payload indicating `can_receive = false` so UI removes Update Stock button.

### Frontend Interaction Flow
1. Ready view renders ordered lines with Update Stock CTA only when `line.can_receive` is true.
2. Clicking CTA opens modal pre-filled with current `ordered`/`received` values and existing part locations (converted to interactive rows). New locations chosen via location selector.
3. Submitting “Save” triggers `receive` mutation; on success, query cache updates `received` totals and modal closes (or advances for “Save & next”).
4. Selecting “Mark Done” triggers confirmation when `received !== ordered`; collects mismatch note before calling the `complete` endpoint, then refreshes list and applies client-side filtering so the line disappears from the default Active view.
5. Toast notifications inform the user of success or validation issues; Playwright coverage verifies multi-step shipments (`Needed / Ordered / Received` at a glance).

## Implementation Phases

1. **Persistence & Domain (Backend)**: Add migration, model fields, and schema updates; adjust services to load location data and expose new computed properties.
2. **Service Logic & API**: Implement `receive_line_stock` and `complete_line`, introduce endpoints, wire metrics, and update dependency injection.
3. **Frontend UI & Client Regeneration**: Regenerate OpenAPI client, build Update Stock modal, integrate into Ready view, and handle mismatch confirmations & navigation between ordered lines.
4. **Testing & Hardening**: Expand Python service/API tests, add React unit tests, update Playwright scenarios, and document manual verification (e.g., partial shipments + Done mismatch flow). Ensure lint/type checks and full test suites pass across backend (`poetry run pytest`) and frontend (`pnpm test`, `pnpm lint`).
