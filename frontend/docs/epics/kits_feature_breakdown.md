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

Provide a persisted pick list tool that guides stock pulls per location, enforces inventory limits, and adjusts build plans when work is completed.

## Use cases

- Create and update pick lists
  - Features:
    - Launch modal or routed form to create pick list with requested units, generating line items per kit part per location sorted by box then location number.
    - Provide a location dropdown on each line so planners can reassign the pull to a different location before saving.
    - Auto-fill pick quantities greedily from the first location downward while showing all locations for manual adjustments.
    - Validate picked quantity against location on-hand (blocking) and show warning when total exceeds planned quantity for the part.
    - Allow saving multiple times; each save deducts only checked lines and locks them from further edits.
    - Reuse the shared stock-change code path from part detail so deductions keep quantity history and location updates consistent.
  - Database / data model:
    - Add `KitPickList` model mapped to `kit_pick_lists` with columns: `id` PK, `kit_id` FK (`kits.id`, `ondelete="CASCADE"`), `requested_units` integer not null, `status` `KitPickListStatus` enum (`draft`, `in_progress`, `completed`) stored via `SQLEnum(..., native_enum=False)` with server default `draft`, `first_deduction_at` timestamp nullable, `completed_at` timestamp nullable, `decreased_build_target_by` integer not null default `0`, `created_at`/`updated_at` timestamps. Apply `CheckConstraint("requested_units >= 1", name="ck_kit_pick_lists_requested_positive")`.
    - Add `KitPickListLine` model mapped to `kit_pick_list_lines` with columns: `id` PK, `pick_list_id` FK (`kit_pick_lists.id`, `ondelete="CASCADE"`), `kit_content_id` FK (`kit_contents.id`, `ondelete="CASCADE"`), `location_id` FK (`locations.id`), `planned_quantity` integer not null, `picked_quantity` integer not null default `0`, `is_locked` boolean not null default `false`, `created_at`/`updated_at` timestamps.
    - Enforce `CheckConstraint("planned_quantity >= 0", name="ck_pick_list_lines_planned_non_negative")`, `CheckConstraint("picked_quantity >= 0", name="ck_pick_list_lines_picked_non_negative")`, and `UniqueConstraint("pick_list_id", "kit_content_id", "location_id", name="uq_pick_list_line_allocation")`. Index `(pick_list_id, is_locked)` for quick filtering.
  - API surface:
    - `POST /kits/<int:kit_id>/pick-lists`
      - Body: `KitPickListCreateSchema` (`requested_units`, optional `honor_reserved` for allocation hints).
      - Generates lines from current `KitContent` + `PartLocation` data and returns `KitPickListDetailSchema`.
    - `GET /pick-lists/<int:pick_list_id>`
      - Returns header info plus lines with current on-hand quantities and lock flags.
    - `PATCH /pick-lists/<int:pick_list_id>`
      - Body: `KitPickListUpdateSchema` containing `lines` array with `line_id`, optional `picked_quantity`, optional `location_id`, and `mark_ready` flag to trigger deduction.
      - Service validates quantities, uses `InventoryService.remove_stock` per deduction, stamps `first_deduction_at` when first successful, updates status to `in_progress`, and locks fully deducted lines.

- Complete pick lists and adjust build target
  - Features:
    - Offer completion action at any time; prompt user to optionally reduce kit build target by the requested units (clamped at zero).
    - Disallow deleting pick lists once any deduction has occurred; otherwise allow delete to clean up drafts.
    - Update kit detail chips to show completed vs open pick lists.
  - Database / data model:
    - `KitPickList.status` transitions to `completed`, stamps `completed_at`, and retains `decreased_build_target_by` for auditing.
    - `KitService` handles optional `build_target` decrements while enforcing the `build_target >= 1` check constraint.
  - API surface:
    - `POST /pick-lists/<int:pick_list_id>/complete`
      - Body: `KitPickListCompleteSchema` (`decrease_build_target`: bool, optional `decrement_override`).
      - Marks list completed, optionally decreases kit `build_target`, and returns refreshed `KitDetailResponseSchema`.
    - `DELETE /pick-lists/<int:pick_list_id>`
      - Allowed only when `first_deduction_at` is null; returns 204.
    - `GET /kits/<int:kit_id>/pick-lists`
      - Returns `KitPickListSummarySchema` objects (status, requested_units, created_at, completed_at, is_locked).

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
    - Ensure integer-only inputs (`required_per_unit`, `build_target`, `order_units`, pick quantities) and reject non-positive values.
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
    - Extend `KitReservationService` with a `list_kits_for_part` helper that joins `KitContent` with `Kit`, filtered to `Kit.status == KitStatus.ACTIVE`, and returns structured usage details.
    - No dedicated SQL view is required; reuse the existing ORM models.
  - API surface:
    - `GET /parts/<int:part_id>/kits` returns `PartKitUsageSchema` objects (`kit_id`, `kit_name`, `status`, `updated_at`, `reserved_quantity`, `build_target`).
    - Extend existing `GET /parts/<part_key>` response schema with boolean `used_in_kits` derived from whether the above query returns results.

## Outstanding Questions

- Should kit names be globally unique to simplify search and linking, or can duplicates exist while relying on surrogate IDs?
- Is persisting `honor_reserved` and `requested_units` on `KitShoppingListLink` sufficient, or do we need additional auditing for how quantities were derived?
- How should optimistic locking conflicts for kit contents be surfaced to users (toast vs inline), and is an API affordance needed to return the latest row alongside the error?
- Are additional pick list statuses (`cancelled`, `failed`) needed beyond `draft`/`in_progress`/`completed`?
