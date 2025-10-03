# Shopping List Ready View Phase 2 Plan

## Brief Description

Implement Phase 2 of `docs/epics/shopping_list_phases.md`, delivering the **“Ready” view (seller-centric planning)** for shopping lists. This adds Concept ⇄ Ready workflow transitions, per-seller ordering coordination, line-level ordering controls, and editable order notes grouped by seller while keeping “Update Stock” hidden until a line is Ordered.

## Files to Create or Modify

### Backend
- **app/models/shopping_list.py**: Add relationship hooks to new seller note model and ensure eager loading for lines pulls `Part.seller` for grouping logic.
- **app/models/shopping_list_line.py**: Confirm status enum continues to support `ordered`; add helper properties (e.g., `effective_seller_id`) via SQLAlchemy `column_property` if needed for grouping and status checks.
- **app/models/shopping_list_seller_note.py** *(new)*: Persist “Per-seller Order Note storage at list+seller grouping level.” Columns: `id`, `shopping_list_id` FK, `seller_id` FK (non-null; ungrouped lines do not store notes), `note` (Text), timestamps, uniqueness on `(shopping_list_id, seller_id)`. Include relationship back to `ShoppingList`.
- **app/models/__init__.py**: Export new model.
- **alembic/versions/014_add_shopping_list_ready_phase.py** *(new)*: Create `shopping_list_seller_notes` table, add optional `ordered`/`received` defaults tweaks if needed, and ensure existing Shopping List tables gain any new indexes used by Ready view queries (e.g., `(shopping_list_id, seller_id)` on lines).
- **app/schemas/shopping_list.py**: Extend `ShoppingListResponseSchema` and `ShoppingListListSchema` with seller-note payloads exposed as a list of objects (each carrying `seller_id` and note) and expose computed `has_ordered_lines` flag for toolbar logic “Back to Concept available only when no lines are Ordered.”
- **app/schemas/shopping_list_line.py**: Add request models for ordering actions: `ShoppingListLineOrderSchema` (ordered quantity, optional comment) and `ShoppingListLineStatusUpdateSchema` for `"allow **New → Ordered** and back to **New**"`. Enhance response schema with `effective_seller` (seller override or part seller) and `is_orderable` / `is_revertible` computed fields to drive UI chips.
- **app/schemas/shopping_list_seller_note.py** *(new)*: Define `ShoppingListSellerOrderNoteSchema` (note text plus seller metadata) and update schema package `__init__` if present.
- **app/services/shopping_list_service.py**: 
  - Extend existing `set_list_status` workflow to cover Concept ⇄ Ready rules explicitly and add helper `get_seller_order_notes(list_id)` for API payloads.
  - Add helper `group_lines_by_seller(list_id)` returning grouped structures used by API (seller groups keyed by raw `seller_id`, plus a dedicated `ungrouped` bucket).
  - Persist order notes via `upsert_seller_note(list_id, seller_id, note)` and tie into `updated_at` refresh.
  - Ensure `get_list`/`list_lists` eager load seller notes and attach to response objects.
- **app/services/shopping_list_line_service.py**: 
  - Allow `update_line` to change seller override even when Ready (still block when `status == DONE`).
  - Add `set_line_ordered(line_id, ordered_qty)` applying “Operations to set **Ordered** quantity and mark line/group **Ordered**,” enforcing `ordered_qty >= received`, bumping status to `ORDERED`, and updating timestamps.
  - Add `set_line_new(line_id)` resetting ordered quantity to 0 and status `NEW` so “Line status transitions: allow **New → Ordered** and back to **New**.”
  - Provide `set_group_ordered(list_id, seller_id, ordered_map)` where `seller_id` may be `None` for the ungrouped bucket, marking every line in the group as ordered (prefill = Needed) while validating lines belong to the specified grouping.
- **app/services/metrics_service.py** (optional hook): add counters such as `shopping_list_lines_marked_ordered_total` and GAUGE for ready lists if required for observability; expose update methods consumed by ordering operations.
- **app/services/container.py**: Ensure dependency wiring exposes updated `shopping_list_service` and `shopping_list_line_service` methods (no new service class required).
- **app/api/shopping_lists.py**: 
  - Extend status endpoint to support specific transitions and return enriched payload with grouped data and seller notes.
  - Add new routes for seller order notes, e.g., `PUT /shopping-lists/<int:list_id>/seller-groups/<int:seller_id>/order-note` (only for seller-backed groups) returning updated seller note.
- **app/api/shopping_list_lines.py**: 
  - Add endpoints `POST /shopping-list-lines/<int:line_id>/order` and `POST /shopping-list-lines/<int:line_id>/revert` for line-level ordering state changes.
  - Add `POST /shopping-lists/<int:list_id>/seller-groups/<group_ref>/order` to “Mark group as Ordered: prompts to set Ordered for each line (prefill = Needed).” `group_ref` will be the seller’s raw ID for seller-backed groups, with reserved token `ungrouped` covering lines without a seller override or default seller.
  - Ensure JSON validation uses new schemas and `@handle_api_errors` surfaces `InvalidOperationException` for guardrails (e.g., preventing duplicate ordering if Received already exceeds new Ordered).
- **app/api/__init__.py**: Register any new blueprints if we split seller-group endpoints.
- **app/utils/spectree_config.py** / OpenAPI wiring if new responses need registration.
- **tests/services/test_shopping_list_service.py**: Add cases for Concept ↔ Ready transitions, enforcing guard “back only if no line is Ordered,” verifying seller note persistence and retrieval maps.
- **tests/services/test_shopping_list_line_service.py**: Cover `set_line_ordered`, `set_line_new`, seller regrouping when overrides change, group ordering success/error paths.
- **tests/api/test_shopping_lists_api.py** & **tests/api/test_shopping_list_lines_api.py**: Add coverage for new endpoints, invalid payloads, status codes, and ready view invariants (e.g., cannot mark group ordered if list not Ready).
- **tests/test_database_constraints.py**: Assert new table constraints (unique group per list, FK cascades) and indexes behave.
- **app/services/test_data_service.py**: Load seller notes fixture and ensure Ready list lines include `ordered` / `status` variations for Phase 2 scenarios.
- **app/data/test_data/**: Update `shopping_lists.json`, `shopping_list_lines.json`, and create `shopping_list_seller_notes.json` to seed ready-state lists with seller-backed groups (notes only for groups with sellers), order quantities, and notes. Ensure sample includes lines already ordered to exercise revert guard.

### Frontend
- **src/routes/shopping-lists/index.tsx**: Ensure lists overview exposes Ready status and surfaces action to open Ready view; include “Mark ‘Ready’” entry point linking to detail route.
- **src/routes/shopping-lists/$listId.tsx** *(new)*: Detail page orchestrating Concept vs Ready states; render Ready view when list status is `ready` and include toolbar with “Back to Concept” disabled when any line `status === 'ordered'`.
- **src/components/shopping-list/ready-view.tsx** *(new)*: Implement seller-centric grouping UI with sections: header showing seller name, aggregated totals, editable Order Note textarea bound to API for seller-backed groups only, and line table with columns `Part | Needed | Ordered (editable) | Received | Note | Status chip | Update Stock`. Hide “Update Stock” action until `status === 'ordered'` per requirement.
- **src/components/shopping-list/line-actions.tsx** *(new or updated)*: Provide buttons for “Mark as Ordered (line)” that prompts user to confirm / set Ordered (prefill = Needed) and optional revert action to go back to New.
- **src/components/shopping-list/group-order-dialog.tsx** *(new)*: Dialog for “Mark group as Ordered: prompts to set Ordered for each line (prefill = Needed).” Should batch submit to group order endpoint (passing `seller_id` or `ungrouped` token) and display validation errors.
- **src/hooks/use-shopping-lists.ts** *(new)*: Wrap generated hooks for lists, lines, seller notes, and ordering mutations; provide selectors to compute `hasOrderedLines`, seller group mapping, and watchers to refetch after actions (invalidating both list and lines queries).
- **src/lib/api/generated/**: Re-run `pnpm generate:api` after backend OpenAPI updates to include new schemas and endpoints for ordering and seller notes.
- **src/components/dashboard/low-stock-alerts.tsx**: Update shopping list CTA to navigate to Concept list but respect new Ready flows (e.g., disable add-to-list when list is not in Concept if duplicates disallowed).
- **src/components/ui/** (if lacking): create reusable `StatusChip` variants for `new` vs `ordered` to match design.
- **src/routeTree.gen.ts**: Regenerate via `pnpm generate:routes` so new routes compile.
- **src/types/**: Add TypeScript helpers for seller group references (e.g., `type SellerGroupKey = number | 'ungrouped'`).
- **tests/unit/shopping-list/** *(new)*: Component tests mocking query hooks to verify grouping, order note editing, chip visibility, and seller regrouping when overrides change.
- **tests/e2e/shopping-list-ready.spec.ts** *(new)*: Playwright scenario: transition Concept → Ready, group by seller, mark line ordered with prefill = needed, mark group ordered, edit order note, and verify toolbar Back to Concept gating.

### Tooling & Documentation
- **docs/features/shopping_list_ready_view/plan.md**: (this plan) plus future status updates doc if needed.
- **docs/epics/shopping_list_phases.md**: Cross-check Phase 2 acceptance criteria after implementation; no change required now but refer during QA.
- **frontend/docs/** developer guides: Add note on regenerating API client after backend schema changes.

## Algorithms & Data Flow
- **List Status Transition Guard (`Concept → Ready → Concept`)**
  1. `set_list_status` checks current status.
  2. When moving to Ready, enforce list has ≥ 1 line and optionally precompute seller groups.
  3. For “Back to Concept available only when no lines are Ordered,” query counts via `ShoppingListLine.status` and block transition if any `status == ORDERED`.
  4. Persist status change and invalidate cached seller notes / line groups in responses.

- **Line Ordering Workflow (`New → Ordered`, `Ordered → New`)**
  1. Validate list is `READY` before marking ordered; otherwise raise `InvalidOperationException`.
  2. Accept payload with `ordered_qty`; default to `line.needed` when not provided (“prefill = Needed”).
  3. Ensure `ordered_qty >= line.received` and `ordered_qty >= 0` (CheckConstraint already enforces non-negative).
  4. Update `ordered` column, flip status to `ORDERED`, timestamp, and publish metrics.
  5. Reverting to New resets `ordered` to 0, `status` to `NEW`, but only allowed while list is READY and `received == 0` (prevent data loss); otherwise instruct user to use Phase 4 flow.

- **Seller Group Ordering (`Mark group as Ordered`)**
  1. Resolve seller group: explicit override `seller_id` or fallback to part.seller; lines without a seller land in an `ungrouped` bucket exposed via the reserved group token.
  2. Build response for dialog with each line’s default quantity = `needed`.
  3. When user submits, iterate lines within transaction, applying `set_line_ordered` for each with provided quantities.
  4. If any line already `status == ORDERED`, allow update to new qty; ensure idempotency.
  5. After success, recompute seller notes map for the list to refresh UI.

- **Order Note Persistence (`Per-seller Order Note storage at list+seller grouping level`)**
  1. Accept note updates via dedicated endpoint (seller-backed groups only); treat blank string as clearing note (delete row).
  2. Use `INSERT .. ON CONFLICT` / SQLAlchemy equivalent to upsert into `shopping_list_seller_notes` keyed by `(shopping_list_id, seller_id)` (no NULL seller IDs).
  3. Return normalized payload as a list of `{seller_id, note, updated_at}` objects for API consumers.
  4. When fetching list details, join notes so UI can show seller header note.

- **Seller Override Re-grouping**
  1. `update_line` takes optional `seller_id`; after update commit, recompute `effective_seller_id`.
  2. API responses include updated seller info; frontend hook invalidates queries so UI re-groups seller cards instantly.

## Testing Strategy

### Backend Tests
- Extend service tests to cover every new public method: list status transitions, seller note CRUD, line ordering/reverting, and group ordering success/failure (e.g., mismatched seller, list not ready, invalid quantities).
- API tests verifying HTTP contract: response schemas, validation errors for missing ordered quantity, 409/400 on guard rails, and success responses returning refreshed list payloads.
- Database tests asserting new table constraints, FK cascades when list deleted, and that ordering operations update timestamps.
- Test data service tests ensuring new fixtures load and support `load-test-data` command without regression.

### Frontend Tests
- Unit tests for Ready view components verifying:
  - Grouping by seller (override vs part default) renders correct headers and line counts.
  - Order Note edits trigger mutation and optimistic UI update.
  - “Mark as Ordered” dialog pre-fills Needed and disables submit for invalid values.
  - “Back to Concept” button disabled when any line `status === 'ordered'`.
- Playwright flow bridging Concept → Ready: create concept list (Phase 1 action), add lines, mark ready, open Ready view, mark line ordered, add order note, attempt to revert to concept while ordered lines exist (expect guard), revert line to New, then successfully revert list to concept.

### Data & Tooling Validation
- Update Alembic migration tests or smoke command to ensure `poetry run python -m app.cli load-test-data --yes-i-am-sure` populates seller notes and ordered lines.
- Document regeneration steps: `poetry run flask spectree generate` (or project equivalent) then `pnpm generate:api` so frontend client reflects new endpoints.
- Run `poetry run pytest`, `poetry run mypy`, `poetry run ruff check .`, plus frontend `pnpm check` to maintain code quality gates.
