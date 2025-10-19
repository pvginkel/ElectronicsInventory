This document contains the feature breakdown of the work described in `docs/epics/kits_brief.md`. It's meant to accompany that document.

# Feature: Kits overview & archiving controls

Deliver the global kits index so users can find, inspect, and change lifecycle state on kits while staying within the single source of truth for inventory planning.

## Use cases

- List kits to the user
  - Features:
    - Render kits as tiles/cards showing name, description snippet, last updated time, and badges for open shopping or pick lists.
    - Switch between Active and Archived sets with tab navigation while preserving search state.
    - Filter the visible kits by name or description text with debounced search input.
  - Database / data model:
    - Introduce `Kit` SQLAlchemy model mapped to a new `kits` table with columns: `id` PK (autoincrement), `name` `String(255)` not null, `description` `Text` nullable, `build_target` `Integer` not null default `1`, `status` `KitStatus` enum (`active`, `archived`) stored via `SQLEnum(..., native_enum=False)` with server default `active`, `archived_at` `DateTime` nullable, `created_at`/`updated_at` timestamps using `func.now()`.
    - Add `CheckConstraint("build_target >= 1", name="ck_kits_build_target_positive")` and indexes on `status`, `(status, updated_at DESC)`, and `func.lower(name)` to support fast filtering. Description filtering uses `ILIKE` in queries without an extra index initially.
    - Define relationships: `Kit.contents` (to `KitContent`, cascade `all, delete-orphan`), `Kit.shopping_list_links` (to `KitShoppingListLink`, cascade `all, delete-orphan`), and `Kit.pick_lists` (to `KitPickList`, cascade `all, delete-orphan`).
    - Badge counts are computed in `KitService.list_kits` with SQLAlchemy aggregations that left join `KitShoppingListLink`/`ShoppingList` (filtering to `status in {concept, ready}`) and `KitPickList` (filtering to `status != completed`). No database view is created; the service layer handles all aggregation to follow existing patterns.
  - API surface:
    - `GET /kits`
      - Query params: `status` (defaults to `active`, validated against `KitStatus`), `query` (optional substring match against `name` and `description`).
      - Response: list of `KitSummarySchema` objects containing `id`, `name`, `description`, `status`, `build_target`, `archived_at`, `updated_at`, `shopping_list_badge_count`, `pick_list_badge_count`.
      - Implemented in new blueprint `app/api/kits.py` delegating to `KitService.list_kits`.

- Manage kit lifecycle
  - Features:
    - Provide Archive/Unarchive buttons on each kit card with optimistic UI and undo toast.
    - Prevent editing of archived kits by marking them read-only and surfacing state on the overview.
    - Offer a New Kit CTA that opens the kit creation form routed to the detail screen.
  - Database / data model:
    - Reuse `kits` columns above; `archived_at` remains null for active kits and captures the transition timestamp when archived.
    - `KitService` is responsible for bumping `Kit.updated_at` whenever metadata or contents mutate to keep overview ordering fresh.
  - API surface:
    - `POST /kits`
      - Body: `KitCreateSchema` (`name`, optional `description`, optional `build_target` defaulting to `1`).
      - Returns `KitResponseSchema` (metadata only; contents list empty).
    - `PATCH /kits/<int:kit_id>`
      - Body: `KitUpdateSchema` permitting `name`, `description`, `build_target`.
      - Guarded by service to disallow edits when `status` is `archived`.
    - `POST /kits/<int:kit_id>/archive`
      - Body: none.
      - Sets status to `archived`, stamps `archived_at`, returns updated `KitResponseSchema`.
    - `POST /kits/<int:kit_id>/unarchive`
      - Clears `archived_at`, sets status to `active`, returns updated response.
    - Service layer raises `InvalidOperationException` if the kit is already in the requested state or if archiving would violate business rules; errors surface through the existing `@handle_api_errors` decorator.

# Feature: Kit detail & BOM management

Expose a rich kit detail workspace where planners maintain the bill of materials, inspect availability math, and keep the kit metadata current.

## Use cases

- View kit summary and computed availability
  - Features:
    - Display editable name, description, and build target while kit is active; disable fields when archived.
    - Show computed columns Required, Total, In stock, Reserved, Shortfall for each kit content row.
    - Provide client-side filtering across part name, SKU, and row note within the grid.
  - Database / data model:
    - Create `KitContent` model mapped to `kit_contents` table with columns: `id` PK, `kit_id` FK (`kits.id`, `ondelete="CASCADE"`), `part_id` FK (`parts.id`, `ondelete="CASCADE"`), `required_per_unit` `Integer` not null, `note` `Text` nullable, `version` `BigInteger` not null default `1`, `created_at`/`updated_at` timestamps.
    - Add `UniqueConstraint("kit_id", "part_id", name="uq_kit_contents_kit_part")`, `CheckConstraint("required_per_unit >= 1", name="ck_kit_contents_required_positive")`, and indexes on `kit_id` and `part_id`. Configure SQLAlchemy optimistic locking via `__mapper_args__["version_id_col"] = KitContent.version`.
    - `KitService.get_kit_detail` composes SQLAlchemy selects to derive per-line aggregates: `total_required = required_per_unit * kit.build_target`, `in_stock` from `InventoryService.calculate_total_quantity`, `reserved` from `KitReservationService.get_reserved_quantity(part_id, exclude_kit_id)`, `available = max(in_stock - reserved, 0)`, and `shortfall = max(total_required - available, 0)`.
    - Linked shopping list and pick list chips are hydrated through relationships defined in later sections.
  - API surface:
    - `GET /kits/<int:kit_id>`
      - Returns `KitDetailResponseSchema` with metadata (`id`, `name`, `description`, `build_target`, `status`, timestamps), `contents` array (`KitContentDetailSchema` with part summary, `required_per_unit`, `note`, `version`, computed aggregates), `shopping_list_links`, and `pick_lists`.
      - Raises `RecordNotFoundException` when kit missing or inaccessible.

- Maintain bill of materials
  - Features:
    - Enable inline add/edit/delete rows with validation for integer quantities and duplicate part protection.
    - Persist per-row note field and surface validation errors inline.
    - Reflect optimistic updates in the UI grid and re-fetch computed columns on success.
  - Database / data model:
    - `KitContent.version` powers optimistic concurrency; each mutation increments the version and resets `Kit.updated_at`.
  - API surface:
    - `POST /kits/<int:kit_id>/contents`
      - Body: `KitContentCreateSchema` (`part_id`, `required_per_unit`, optional `note`).
      - Returns full `KitContentDetailSchema`.
      - Validates kit is active, part exists, and `(kit_id, part_id)` remains unique.
    - `PATCH /kits/<int:kit_id>/contents/<int:content_id>`
      - Body: `KitContentUpdateSchema` (`required_per_unit?`, `note?`, required `version`).
      - Returns updated detail schema; version conflicts raise 409.
    - `DELETE /kits/<int:kit_id>/contents/<int:content_id>`
      - Removes the row, returns 204, and service cascades timestamp refresh.

# Feature: Shopping list flow & linking

Allow planners to generate or extend purchasing lists from a kit, while keeping bidirectional traceability between kits and shopping lists.

## Use cases

- Create or append shopping lists from a kit
  - Features:
    - Present dialog with Order-for-N control defaulting to kit build target and Honor-reserved toggle defaulting to OFF.
    - Calculate Needed quantity per line based on selected units and reserved mode, zero-clamping negatives.
    - Support creating a new Concept shopping list or appending to an existing Concept list, merging quantities when lines already exist.
    - Append `[From Kit <name>]: <BOM note>` to line notes when merging, preserving prior notes.
  - Database / data model:
    - Reuse existing `ShoppingList` and `ShoppingListLine` models (status enum values `concept`, `ready`, `done`). Service enforces that kit pushes target lists in `concept` state.
    - `ShoppingListLine.note` stores provenance text; no JSON metadata column is required.
    - Add `KitShoppingListLink` model mapped to `kit_shopping_list_links` with columns: `id` PK, `kit_id` FK (`kits.id`, `ondelete="CASCADE"`), `shopping_list_id` FK (`shopping_lists.id`, `ondelete="CASCADE"`), `requested_units` integer not null, `honor_reserved` boolean not null default `false`, `snapshot_kit_updated_at` timestamp not null, `created_at` timestamp not null, `updated_at` timestamp not null.
    - Apply `UniqueConstraint("kit_id", "shopping_list_id", name="uq_kit_shopping_list_links_pair")` and index on `shopping_list_id` for reverse lookups.
  - API surface:
    - `POST /kits/<int:kit_id>/shopping-lists`
      - Body: `KitShoppingListRequestSchema` with `units` (positive int), `honor_reserved` (bool), optional `shopping_list_id`, optional `note_prefix`.
      - Creates a new `ShoppingList` when `shopping_list_id` omitted; otherwise appends to the existing concept list.
      - Response: `KitShoppingListLinkResponseSchema` containing link metadata plus refreshed `ShoppingListResponseSchema`.
      - Service merges line quantities, updates notes, and ensures idempotency when appending.
    - `GET /shopping-lists`
      - Extend existing query schema to accept `status` filter (list of `ShoppingListStatus` values) so the UI can fetch only concept lists for the dialog.

- Manage shopping list linkage chips
  - Features:
    - Show chips on kit detail summarizing linked lists with state badge, stale warning when kit updated after snapshot, and unlink affordance.
    - Show chips on shopping list detail indicating every originating kit.
    - Allow unlinking with confirmation without altering list contents.
  - Database / data model:
    - The `KitShoppingListLink` table provides bidirectional lookups; `is_stale` is computed in service by comparing `kit.updated_at` to `snapshot_kit_updated_at`.
  - API surface:
    - `GET /kits/<int:kit_id>/shopping-lists` returns `KitShoppingListChipSchema` objects (`shopping_list_id`, `shopping_list_name`, `status`, `snapshot_kit_updated_at`, `is_stale`).
    - `GET /shopping-lists/<int:list_id>/kits` returns reciprocal `KitChipSchema` objects (`kit_id`, `kit_name`, `status`, `is_stale`).
    - `DELETE /kit-shopping-list-links/<int:link_id>` removes the association (cascades through FK) and returns 204.

# Feature: Pick list workflow & deduction

Provide a persisted pick list tool that auto-allocates stock per location, enforces availability, and lets operators finish lines with a single “Picked” action.

## Use cases

- Create pick lists
  - Features:
    - Launch modal or routed form that prompts for **Requested units** (persisted on the pick list).
    - For each kit content row, compute `required_total = required_per_unit × requested_units`.
    - Gather the part’s locations sorted by ascending on-hand quantity, then by box number and location number.
    - Allocate greedily across locations, creating immutable lines with `quantity_to_pick = min(remaining_required, location_on_hand)` and decrement the remaining requirement after each line.
    - Abort creation with a validation error if any part cannot be fully satisfied (no partial pick lists are stored).
    - Render generated lines as read-only entries; there is no option to add, remove, or edit allocations manually.
  - Database / data model:
    - Add `KitPickList` model mapped to `kit_pick_lists` with columns: `id` PK, `kit_id` FK (`kits.id`, `ondelete="CASCADE"`), `requested_units` integer not null, `status` `KitPickListStatus` enum (`open`, `completed`) stored via `SQLEnum(..., native_enum=False)` with server default `open`, `completed_at` timestamp nullable, `created_at`/`updated_at` timestamps. Apply `CheckConstraint("requested_units >= 1", name="ck_kit_pick_lists_requested_positive")`.
    - Add `KitPickListLine` model mapped to `kit_pick_list_lines` with columns: `id` PK, `pick_list_id` FK (`kit_pick_lists.id`, `ondelete="CASCADE"`), `kit_content_id` FK (`kit_contents.id`, `ondelete="CASCADE"`), `location_id` FK (`locations.id`), `quantity_to_pick` integer not null, `status` `PickListLineStatus` enum (`open`, `completed`) stored via `SQLEnum(..., native_enum=False)` with server default `open`, `picked_at` timestamp nullable, optional `inventory_change_id` FK to quantity history for auditing, `created_at`/`updated_at` timestamps.
    - Enforce `CheckConstraint("quantity_to_pick > 0", name="ck_pick_list_lines_quantity_positive")` and `UniqueConstraint("pick_list_id", "kit_content_id", "location_id", name="uq_pick_list_line_allocation")`. Add index `(pick_list_id, status)` for fast open-line queries.
  - API surface:
    - `POST /kits/<int:kit_id>/pick-lists`
      - Body: `KitPickListCreateSchema` (`requested_units`).
      - Runs the allocator and returns `KitPickListDetailSchema` with immutable lines (`quantity_to_pick`, `status`, `picked_at`, location metadata).
    - `GET /pick-lists/<int:pick_list_id>`
      - Returns header data (`requested_units`, `status`, timestamps) plus read-only line objects including live on-hand snapshots for display.

- Execute pick lists
  - Features:
    - Display each line with a single **“Picked”** button and no quantity or location inputs.
    - On click, call shared inventory deduction (`InventoryService.remove_stock`) for `quantity_to_pick`, mark the line `status = completed`, set `picked_at`, and remove the location from the part when quantity reaches zero (existing behavior).
    - Completed lines keep an **“Undo”** button. Undo reverses the inventory change, resets the line to `open`, clears `picked_at`, and returns the pick list to the open state when applicable.
    - Once the final line is marked picked (all lines completed), set pick list `status = completed`, stamp `completed_at`, and display the list in the UI’s archived grouping. Undo on any line removes the list from the archived grouping by setting status back to `open`.
  - Database / data model:
    - Persist `inventory_change_id` per line when a pick occurs to support undo operations; clearing it on undo ensures idempotency.
    - Maintain audit timestamps (`completed_at`, `picked_at`) for historical reporting and to drive UI state.
  - API surface:
    - `POST /pick-lists/<int:pick_list_id>/lines/<int:line_id>/pick`
      - No body; triggers the deduction and line completion. Returns updated `KitPickListDetailSchema`.
    - `POST /pick-lists/<int:pick_list_id>/lines/<int:line_id>/undo`
      - No body; reverses the deduction and reopens the line. Returns updated detail schema.
    - `GET /kits/<int:kit_id>/pick-lists`
      - Returns `KitPickListSummarySchema` objects with `status`, `requested_units`, `created_at`, `completed_at`, and derived `is_archived_ui` flag (`status == completed`).

# Feature: Data integrity & reserved math

Centralize validation, reservation math, and invariants so every surface reflects accurate availability without duplicating logic.

## Use cases

- Compute reserved quantities for kits
  - Features:
    - Calculate reserved quantity per part by summing `required_per_unit * build_target` for all other active kits that share the part.
    - Exclude archived kits and ignore pick lists entirely from reservation totals.
    - Provide the computed totals to kit detail, shopping list dialog, and other consumers via shared query/service.
  - Database / data model:
    - Implement `KitReservationService` that executes a reusable SQLAlchemy select with `func.sum` grouped by `part_id`, joining `Kit` and `KitContent` with `Kit.status == KitStatus.ACTIVE`.
    - Cache per-request results using dependency-injector scope if necessary; no database view or materialized view is required.
    - Expose helpers to fetch reservations for a specific kit (excluding its own demand), bulk-fetch reservations for a list of part IDs, and return active kit usage listings for a given part so downstream consumers reuse the same logic.
  - API surface:
    - `GET /kits` and `GET /kits/<int:kit_id>` call into `KitReservationService` so each kit content row includes a `reserved` field.
    - `GET /parts/<int:part_id>/kit-reservations` (debug endpoint) returns active kits consuming the part with reserved quantities for tooling.

- Enforce validation rules across kit operations
  - Features:
    - Ensure integer-only inputs (`required_per_unit`, `build_target`, `order_units`, `requested_units`) and reject non-positive values.
    - Block duplicate parts within a kit with descriptive error messaging.
    - Restrict shopping list append flow to Concept lists and enforce archived-kit read-only rule across APIs.
  - Database / data model:
    - Constraints already specified above (`ck_kits_build_target_positive`, `ck_kit_contents_required_positive`, uniqueness rules, pick list quantity checks).
    - Consider additional `CheckConstraint("status != 'archived' OR archived_at IS NOT NULL", name="ck_kits_archived_requires_timestamp")` for safety.
  - API surface:
    - All endpoints leverage existing exceptions (`InvalidOperationException`, `RecordNotFoundException`, `ConflictException`); `@handle_api_errors` standardizes responses.
    - No separate validation endpoint is required; callers rely on standard 400/409 errors.

# Feature: Part detail cross-navigation

Surface kit usage context on the part detail page so planners can trace where a part is consumed and jump to the relevant kits.

## Use cases

- Show kits that use a part and enable navigation
  - Features:
    - Add a "Used in Kits" icon alongside existing part detail affordances, showing tooltip with active kits using the part.
    - Provide click-through navigation from tooltip entries to the corresponding kit detail route.
    - Hide the icon when no active kits reference the part.
  - Database / data model:
    - Extend `KitReservationService` with a `list_kits_for_part` helper that joins `KitContent` with `Kit`, filtered to `Kit.status == KitStatus.ACTIVE`, and returns structured usage details (including `required_per_unit`).
    - No dedicated SQL view is required; reuse the existing ORM models.
  - API surface:
    - `GET /parts/<string:part_key>/kits` returns `PartKitUsageSchema` objects (`kit_id`, `kit_name`, `status`, `required_per_unit`, `updated_at`, `reserved_quantity`, `build_target`).
    - Extend existing `GET /parts/<part_key>` response schema with boolean `used_in_kits` derived from whether the above query returns results.

## Outstanding Questions

- Should kit names be globally unique to simplify search and linking, or can duplicates exist while relying on surrogate IDs?
- Is persisting `honor_reserved` and `requested_units` on `KitShoppingListLink` sufficient, or do we need additional auditing for how quantities were derived?
- How should optimistic locking conflicts for kit contents be surfaced to users (toast vs inline), and is an API affordance needed to return the latest row alongside the error?
- Are pick list statuses `open` and `completed` sufficient, or do we need extra states for cancel/failed flows?
