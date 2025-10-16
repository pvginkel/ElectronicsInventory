# Feature: Kits overview & archiving controls

Deliver the global kits index so users can find, inspect, and change lifecycle state on kits while staying within the single source of truth for inventory planning.

## Use cases

- List kits to the user
  - Features:
    - Render kits as tiles/cards showing name, description snippet, last updated time, and badges for open shopping or pick lists.
    - Switch between Active and Archived sets with tab navigation while preserving search state.
    - Filter the visible kits by name or description text with debounced search input.
  - Required database schema:
    - `kits` table: `id` PK; `name` text not null; `description` text null; `build_target` integer not null default 1; `status` text not null with check constraint limiting values to `active` or `archived`; `created_at` timestamptz not null; `updated_at` timestamptz not null. Enum handling stays in application code and natural keys are avoided.
    - `kit_summary_view` (read-only view) that joins `kits`, `kit_contents`, `shopping_lists`, and `kit_pick_lists` to compute open shopping/pick list counts for badge flags.
  - Required API endpoints:
    - `GET /kits?status=active|archived&query=` — Returns pageless list of kits for the requested status, filtered by case-insensitive `query` across `name` and `description`, including summary badge flags.
- Manage kit lifecycle
  - Features:
    - Provide Archive/Unarchive buttons on each kit card with optimistic UI and undo toast.
    - Prevent editing of archived kits by marking them read-only and surfacing state on the overview.
    - Offer a New Kit CTA that opens the kit creation form routed to the detail screen.
  - Required database schema:
    - `kits` table fields above; add `archived_at` timestamptz null to audit transitions; retain surrogate `id` keys and `status` as constrained text for compatibility with migrations.
  - Required API endpoints:
    - `POST /kits` — Creates a kit; body `{name, description?, build_target}`; returns the persisted kit record.
    - `POST /kits/{id}:archive` — Sets `status` to `archived`, stamps `archived_at`, returns updated kit.
    - `POST /kits/{id}:unarchive` — Clears `archived_at`, sets `status` to `active`, returns updated kit.

# Feature: Kit detail & BOM management

Expose a rich kit detail workspace where planners maintain the bill of materials, inspect availability math, and keep the kit metadata current.

## Use cases

- View kit summary and computed availability
  - Features:
    - Display editable name, description, and build target while kit is active; disable fields when archived.
    - Show computed columns Required, Total, In stock, Reserved, Shortfall for each kit content row.
    - Provide client-side filtering across part name, SKU, and row note within the grid.
  - Required database schema:
    - `kit_contents` table: `id` PK; `kit_id` FK -> `kits.id`; `part_id` FK -> `parts.id`; `required_per_unit` integer not null; `note` text null; `created_at` timestamptz not null; `updated_at` timestamptz not null; unique `(kit_id, part_id)`.
    - `kit_line_computed_view` (backend view/service) returning per-line `in_stock` (sum of part locations), `reserved` (see reserved feature), `total_required`, and `shortfall`.
  - Required API endpoints:
    - `GET /kits/{id}` — Returns kit metadata, array of kit content rows with computed fields, and linked list/pick summaries.
- Maintain bill of materials
  - Features:
    - Enable inline add/edit/delete rows with validation for integer quantities and duplicate part protection.
    - Persist per-row note field and surface validation errors inline.
    - Reflect optimistic updates in the UI grid and re-fetch computed columns on success.
  - Required database schema:
    - `kit_contents` table as above, including optimistic locking column `version` bigint for concurrency control and maintaining surrogate key relationships (`kit_id`, `part_id`).
  - Required API endpoints:
    - `POST /kits/{id}/contents` — Adds a line; body `{part_id, required_per_unit, note?}`; returns created row with computed fields.
    - `PATCH /kits/{id}/contents/{lineId}` — Updates quantity or note; body `{required_per_unit?, note?}`; returns updated row with recomputed metrics.
    - `DELETE /kits/{id}/contents/{lineId}` — Removes a row; returns success flag or updated kit summary.

# Feature: Shopping list flow & linking

Allow planners to generate or extend purchasing lists from a kit, while keeping bidirectional traceability between kits and shopping lists.

## Use cases

- Create or append shopping lists from a kit
  - Features:
    - Present dialog with Order-for-N control defaulting to kit build target and Honor-reserved toggle defaulting to OFF.
    - Calculate Needed quantity per line based on selected units and reserved mode, zero-clamping negatives.
    - Support creating a new Concept shopping list or appending to an existing Concept list, merging quantities when lines already exist.
    - Append `[From Kit <name>]: <BOM note>` to line notes when merging, preserving prior notes.
  - Required database schema:
    - `shopping_lists` table (existing): ensure `state` text column with check constraint allowing `concept`, `ready`, `ordered`, `received`, `done`; enums remain in application code only.
    - `shopping_list_lines` table (existing): add `source_metadata` jsonb for note provenance if not present; keep surrogate `id` PK for joins.
    - `kit_shopping_list_links` table: `id` PK; `kit_id` FK -> `kits.id`; `shopping_list_id` FK -> `shopping_lists.id`; `snapshot_kit_updated_at` timestamptz not null; `created_at` timestamptz not null; unique `(kit_id, shopping_list_id)`.
  - Required API endpoints:
    - `POST /kits/{id}:create-shopping-list` — Body `{units, honor_reserved, shopping_list_id?}`; creates a new list when `shopping_list_id` absent or appends when present; returns list detail, per-line quantities, and link snapshot.
    - `GET /shopping-lists?state=concept` — Supplies selection list for append dialog with paging/filtering.
- Manage shopping list linkage chips
  - Features:
    - Show chips on kit detail summarizing linked lists with state badge, stale warning when kit updated after snapshot, and unlink affordance.
    - Show chips on shopping list detail indicating every originating kit.
    - Allow unlinking with confirmation without altering list contents.
  - Required database schema:
    - `kit_shopping_list_links` table fields above; add `is_stale` computed column/view comparing `snapshot_kit_updated_at` vs `kits.updated_at`; chips rely on text-based states and surrogate keys.
  - Required API endpoints:
    - `GET /kits/{id}/shopping-lists` — Returns linked list metadata, states, and stale flag for chip rendering.
    - `GET /shopping-lists/{id}/kits` — Returns kits linked to a shopping list for reciprocal chips.
    - `POST /shopping-lists/{listId}:unlink-kit` — Body `{kit_id}`; deletes link row and returns updated chip collections.

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
  - Required database schema:
    - `kit_pick_lists` table: `id` PK; `kit_id` FK -> `kits.id`; `requested_units` integer not null; `completed` boolean default false; `created_at` timestamptz not null; `updated_at` timestamptz not null.
    - `kit_pick_list_lines` table: `id` PK; `pick_list_id` FK -> `kit_pick_lists.id`; `kit_content_id` FK -> `kit_contents.id`; `location_id` FK -> `locations.id`; `planned_quantity` integer not null; `picked_quantity` integer not null default 0; `is_locked` boolean not null default false; `created_at` timestamptz not null; `updated_at` timestamptz not null; unique `(pick_list_id, location_id, kit_content_id)`.
  - Required API endpoints:
    - `POST /kits/{id}/pick-lists` — Body `{requested_units}`; creates pick list with generated line items and auto allocations; returns full pick list payload.
    - `GET /pick-lists/{id}` — Returns pick list header, lines with on-hand quantities, and lock states.
    - `PATCH /pick-lists/{id}` — Body `{lines: [{line_id, picked_quantity, checked}]}`; deducts inventory for checked lines, locks them, and returns updated list plus side effects.
- Complete pick lists and adjust build target
  - Features:
    - Offer completion action at any time; prompt user to optionally reduce kit build target by the requested units (clamped at zero).
    - Disallow deleting pick lists once any deduction has occurred; otherwise allow delete to clean up drafts.
    - Update kit detail chips to show completed vs open pick lists.
  - Required database schema:
    - `kit_pick_lists` table above with `first_deduction_at` timestamptz null for guarding deletion; all foreign references remain surrogate keys.
    - `kits` table uses `build_target` field, updated when completion decrements quantity.
  - Required API endpoints:
    - `POST /pick-lists/{id}:complete` — Body `{decrease_build_target: boolean}`; marks list completed, optionally reduces kit `build_target`, and returns refreshed kit summary.
    - `DELETE /pick-lists/{id}` — Allowed only when no deductions; deletes pick list and cascades lines.
    - `GET /kits/{id}/pick-lists` — Returns linked pick lists with completion state for chip rendering.

# Feature: Data integrity & reserved math

Centralize validation, reservation math, and invariants so every surface reflects accurate availability without duplicating logic.

## Use cases

- Compute reserved quantities for kits
  - Features:
    - Calculate reserved quantity per part by summing `required_per_unit * build_target` for all other active kits that share the part.
    - Exclude archived kits and ignore pick lists entirely from reservation totals.
    - Provide the computed totals to kit detail, shopping list dialog, and other consumers via shared query/service.
  - Required database schema:
    - `kit_reservations_view` (materialized or runtime view): columns `part_id`, `reserved_quantity`, `source_kit_ids` aggregated array, computed from `kits` (status='active') join `kit_contents`; all joins use surrogate integer keys.
    - `parts` table (existing) with enforced invariant that when total stock reaches zero, related location rows are deleted; track via trigger.
  - Required API endpoints:
    - `GET /kits/{id}` and `GET /kits` — Must hydrate each kit content row with `reserved` sourced from reservation service.
    - `GET /parts/{id}/reservation-summary` — Optional endpoint to debug reserved totals per part for admin tooling.
- Enforce validation rules across kit operations
  - Features:
    - Ensure integer-only inputs (`required_per_unit`, `build_target`, `order_units`, pick quantities) and reject non-positive values.
    - Block duplicate parts within a kit with descriptive error messaging.
    - Restrict shopping list append flow to Concept lists and enforce archived-kit read-only rule across APIs.
  - Required database schema:
    - Database constraints: check constraints on `kit_contents.required_per_unit > 0`; check on `kits.build_target > 0`.
    - Unique index `(kit_id, part_id)` on `kit_contents`; foreign key constraints to `shopping_lists` with `state='concept'` enforced via trigger or application logic.
  - Required API endpoints:
    - Validation applies to existing endpoints (`POST /kits`, kit content mutations, shopping list creation, pick list updates`); responses standardized with error codes for UI handling.
    - `POST /kits/{id}:validate` — Optional dry-run endpoint to preflight kit updates before bulk saves (used by advanced flows or tests).

# Feature: Part detail cross-navigation

Surface kit usage context on the part detail page so planners can trace where a part is consumed and jump to the relevant kits.

## Use cases

- Show kits that use a part and enable navigation
  - Features:
    - Add a "Used in Kits" icon alongside existing part detail affordances, showing tooltip with active kits using the part.
    - Provide click-through navigation from tooltip entries to the corresponding kit detail route.
    - Hide the icon when no active kits reference the part.
  - Required database schema:
    - `kit_part_usage_view`: columns `part_id`, `kit_id`, `kit_name`, `kit_status`, `kit_updated_at`; sourced from `kit_contents` join `kits`; references rely on surrogate keys.
  - Required API endpoints:
    - `GET /parts/{id}/kits` — Returns active kits consuming the part with fields for display (name, status, last updated, route slug).
    - Existing part detail endpoint extended to include boolean `used_in_kits` flag for icon toggling.
