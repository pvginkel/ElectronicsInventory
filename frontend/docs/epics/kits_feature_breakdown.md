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

# Feature: Kit detail workspace (read-only)

Deliver the routed kit detail screen and availability math without any mutating flows so we can ship a narrow slice in a single session.

## Use cases

- View kit summary and computed availability
  - Features:
    - Introduce TanStack Router route `/kits/$kitId` rendering a detail layout with header and main content similar to `PartDetails`.
    - Place the status badge immediately to the right of the kit title to mirror the shopping list detail header.
    - Display name, description, lifecycle badge, build target as a chip styled like the shopping list `Total #` badge, and existing shopping/pick counts. The “Edit kit” button is rendered disabled (tooltip explains archived gating will arrive later).
    - Render the BOM “Part” column with the shared `PartInlineSummary` link component (also used in shopping list tables); reuse this component for pick list lines when that workspace ships to keep part affordances consistent.
    - Defer shopping list and pick list linkage chips to their dedicated feature; the header simply omits them for now.
    - Render a read-only BOM table showing Required, Total, In stock, Reserved, Available, and Shortfall columns sourced from backend aggregates.
  - Database / data model:
    - Create `KitContent` model mapped to `kit_contents`: `id` PK, `kit_id` FK (`kits.id`, `ondelete="CASCADE"`), `part_id` FK (`parts.id`, `ondelete="CASCADE"`), `required_per_unit` integer not null, `note` text nullable, `version` bigint not null default `1`, timestamps.
    - Add `UniqueConstraint("kit_id", "part_id", name="uq_kit_contents_kit_part")`, `CheckConstraint("required_per_unit >= 1", name="ck_kit_contents_required_positive")`, and indexes on `(kit_id, part_id)` plus `(kit_id, updated_at)`. Configure SQLAlchemy optimistic locking via `__mapper_args__["version_id_col"] = KitContent.version`.
    - Extend `KitService.get_kit_detail` to compute `total_required = required_per_unit * kit.build_target`, `reserved` via `KitReservationService` (excluding the current kit), `available = max(in_stock - reserved, 0)`, and `shortfall = max(total_required - available, 0)`. Existing shopping/pick list joins remain intact; linkage chips stay deferred to their own feature.
  - API surface:
    - `GET /kits/<int:kit_id>` returns `KitDetailResponseSchema` with kit metadata, `contents` (per-row detail schema with part summary + aggregates), `shopping_list_links`, and `pick_lists`. Missing kits raise `RecordNotFoundException`; archived kits return the same payload but the UI treats them as read-only.
- Observability & testing:
  - Instrument `useListLoadingInstrumentation` scopes:
    - `kits.detail` for the main query lifecycle (metadata: `kitId`, `status`, `contentCount`).
    - `kits.detail.contents` for derived availability state (metadata: `kitId`, `available`, `shortfallCount`, `total`).
  - Extend the kits Playwright page object with detail locators (title, status badge placement, build target chip, table rows) and add a spec that navigates from an overview card, waits on instrumentation, and verifies computed columns (no mutations yet).

## Dependencies & sequencing

- Relies on the kits overview navigation affordance (card click / CTA) to link into the detail route.
- Scaffolds instrumentation, layout, and query cache wiring that later mutation slices will reuse.
- Kit linkage chips continue to live in their dedicated feature; the header either hides them or shows a placeholder until that slice is delivered.

# Feature: Kit BOM inline editing

Layer inline add/edit/delete flows on top of the read-only workspace with optimistic updates, conflict handling, and matching instrumentation.

## Use cases

- Maintain bill of materials
  - Features:
    - Add an “Add part” button and inline row editor that uses the existing part selector plus integer quantity input; disable options for already-selected parts.
    - Allow editing quantity and note inline for existing rows, piping optimistic updates through React Query cache and refetching availability after success.
    - Provide delete affordance with confirmation dialog; remove rows optimistically and reconcile once the backend responds.
    - Catch 409 conflicts (version mismatch), refetch the detail payload, reopen the edited row with latest data, and guide the user to retry.
    - Respect archived kits by disabling the add/edit/delete affordances and surfacing gating copy alongside the header action.
  - Database / data model:
    - Reuse `KitContent` table; each mutation increments `version` and updates `Kit.updated_at` so availability calculations stay fresh. Cascading FKs ensure dependent reservations or pick list lines clean up correctly.
  - API surface:
    - `POST /kits/<int:kit_id>/contents` accepts `KitContentCreateSchema` (`part_id`, `required_per_unit`, optional `note`) and returns `KitContentDetailSchema`.
    - `PATCH /kits/<int:kit_id>/contents/<int:content_id>` accepts `KitContentUpdateSchema` (`required_per_unit?`, `note?`, required `version`) and returns the updated row; service raises 409 with latest payload when versions diverge.
    - `DELETE /kits/<int:kit_id>/contents/<int:content_id>` responds with 204 after removing the row.
- Observability & testing:
  - `useFormInstrumentation` IDs `KitContent:create`, `KitContent:update`, `KitContent:delete` (metadata includes `kitId`, `contentId?`, `partKey`, `phase`), with success deferred until the `kits.detail.contents` refetch completes.
  - Continue emitting `kits.detail` / `kits.detail.contents` scopes; ensure optimistic phases do not emit “ready” until refetch completes and overlay state clears.
  - Playwright spec add-ons cover create, edit (including forced conflict via factory helper), and delete, waiting on instrumentation events and asserting real backend state.

## Dependencies & sequencing

- Depends on the read-only slice (route, layout, instrumentation scaffolding).
- Requires part selector hooks/factories; tests need helpers to seed kits with parts.
- Metadata editing slice (below) will reuse the same mutation utilities for cache invalidation.

# Feature: Kit metadata editing & archived gating

Ship the metadata dialog, enforce archived read-only rules, and coordinate cache updates across detail and overview.

## Use cases

- Update kit metadata (active kits only)
  - Features:
    - Enable the “Edit Kit” button for active kits to open a modal dialog (name, description, build target) with validation mirroring other forms.
    - Disable the control for archived kits and surface tooltip copy explaining read-only state; ensure BOM action buttons respect the same gating.
    - On submit, optimistically update header fields, close the modal on success, and invalidate overview queries so card badges stay in sync.
  - Database / data model:
    - Reuse `kits` table; `KitService.update` enforces `status != archived` before applying changes and bumps `updated_at`.
  - API surface:
    - `PATCH /kits/<int:kit_id>` accepts `KitUpdateSchema` (`name?`, `description?`, `build_target?`) and returns updated `KitResponseSchema`. Client invalidates `getKitsByKitId` and relevant `getKits` queries after success.
- Observability & testing:
  - Instrument modal with `useFormInstrumentation` form ID `KitDetail:metadata` (metadata: `kitId`, `buildTarget`), including validation events.
  - Playwright coverage adds scenarios for successful update, validation error, and archived gating (modal blocked, actions disabled).

## Dependencies & sequencing

- Builds on the read-only workspace and benefits from mutation utilities introduced in the BOM slice.
- Metadata changes should trigger the same refetch instrumentation (`kits.detail`, `kits.detail.contents`) so availability metrics match new build targets.

# Feature: Kit linkage chips

Highlight shopping list and pick list relationships directly on the kit detail screen so planners understand downstream commitments without leaving the workspace.

## Use cases

- Surface linkage summary chips in the kit header
  - Features:
    - Render a chip per linked shopping list with status badge (`concept`, `ready`, `done`), count tooltip, and stale warning when `snapshot_kit_updated_at < kit.updated_at`.
    - Render chips for linked pick lists with state badge (`open`, `completed`) and requested unit counts so planners gauge fulfillment progress.
    - Show loading skeletons while link data hydrates; empty state displays “No linked lists yet”.
  - Database / data model:
    - Reuse `Kit.shopping_list_links` and `Kit.pick_lists` relationships already returned by `KitService.get_kit_detail`; no new tables required.
    - Ensure the service projects `is_stale`, `requested_units`, and badge counts consumed by the UI.
  - API surface:
    - Confirm `KitDetailResponseSchema` includes chip-ready summaries (`shopping_list_links`, `pick_lists`) with the fields above; extend schema if missing.
    - No new endpoints; the frontend consumes the existing detail payload.

- Navigate from chips to downstream workspaces
  - Features:
    - Clicking a shopping list chip routes to `/shopping-lists/:shoppingListId` in the same tab while recording a `route` instrumentation event.
    - Clicking a pick list chip routes to `/pick-lists/:pickListId`; completed lists open read-only with a tooltip explaining status.
    - Maintain focus styles and keyboard accessibility—chips behave as `<Link>` elements with `data-testid="kits.detail.links.shopping.<id>"` / `.pick.<id>` selectors.
  - Database / data model:
    - No persistence changes; leverages existing relationships.
  - API surface:
    - No new endpoints; ensure router definitions accept deep-link navigation from kit context.

- Instrument visibility for deterministic tests
  - Features:
    - Emit `ui_state` scope `kits.detail.links` when linkage data loads, including counts and stale indicators for Playwright.
    - Extend page objects with helpers to wait for and interact with linkage chips, reusing deterministic selectors.
    - Add Playwright coverage asserting chip rendering, stale indicator display, and navigation flows.
  - Database / data model:
    - None.
  - API surface:
    - None.

# Feature: Shopping list flow & linking

Allow planners to generate or extend purchasing lists from a kit, while keeping bidirectional traceability between kits and shopping lists.

## Use cases

- Create or append shopping lists from a kit
  - Features:
    - Present dialog with Order-for-N control defaulting to kit build target and Honor-reserved slider defaulting to ON.
    - Calculate Needed quantity per line based on selected units and reserved mode, zero-clamping negatives.
    - Support creating a new Concept shopping list or appending to an existing Concept list, merging quantities when lines already exist.
    - Append `[From Kit <name>]: <BOM note>` to line notes when merging, preserving prior notes.
    - Keep the dialog focused on high-level controls; do not render individual kit line items inside the form.
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
    - Show chips on kit detail summarizing linked lists with the existing chip visual design, omitting any staleness UI or manual refresh control.
    - Show chips on shopping list detail indicating every originating kit using the same chip styling and content treatment as on kit detail.
    - Allow unlinking with an icon anchored on each chip and revealed on hover; clicking opens a confirmation dialog, and confirmed removals delete the association while leaving list contents untouched.
  - Database / data model:
    - The `KitShoppingListLink` table provides bidirectional lookups; the service may compute staleness from `kit.updated_at` vs. `snapshot_kit_updated_at`, but the UI does not expose or refresh against that signal yet.
  - API surface:
    - `GET /kits/<int:kit_id>/shopping-lists` returns `KitShoppingListChipSchema` objects (`shopping_list_id`, `shopping_list_name`, `status`, `requested_units`, `honor_reserved`, `snapshot_kit_updated_at`).
    - `GET /shopping-lists/<int:list_id>/kits` returns reciprocal `KitChipSchema` objects (`kit_id`, `kit_name`, `status`, `requested_units`, `honor_reserved`).
    - `DELETE /kit-shopping-list-links/<int:link_id>` removes the association (cascades through FK) after user confirmation and returns 204.

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
