# Kit detail & BOM management – backend plan

Implement the backend for “Kit detail & BOM management” from `docs/epics/kits_feature_breakdown.md`, enabling the kit detail workspace, bill-of-materials CRUD, optimistic locking, and availability math (Required / Total / In stock / Reserved / Shortfall).

## Target files
- `alembic/versions/018_create_kit_contents.py` – create the `kit_contents` table with FK constraints, indexes on `kit_id`/`part_id`, `CheckConstraint("required_per_unit >= 1")`, unique `(kit_id, part_id)`, and `version` column configured for SQLAlchemy optimistic locking.
- `app/models/kit_content.py` – new `KitContent` ORM model (relationships to `Kit` and `Part`, `version_id_col`, cascade rules); update `app/models/kit.py` (`contents` relationship, helper properties), `app/models/part.py` (reverse relationship), and `app/models/__init__.py`.
- `app/services/kit_reservation_service.py` – new service exposing `get_reserved_totals_for_parts(part_ids: Sequence[int], exclude_kit_id: int | None = None)`; register provider in `app/services/container.py`.
- `app/services/kit_service.py` – inject `InventoryService` and `KitReservationService`; add `get_kit_detail`, `create_content`, `update_content`, `delete_content`, and internal helpers for availability math, duplication detection, and status guards; ensure `_touch_kit` updates after BOM mutations.
- `app/schemas/kit.py` – extend with `KitContentCreateSchema`, `KitContentUpdateSchema`, `KitContentDetailSchema`, `KitDetailResponseSchema`, plus chip schemas for `KitShoppingListLink`/`KitPickList`; update `app/schemas/__init__.py`.
- `app/api/kits.py` – add `GET /kits/<kit_id>`, `POST /kits/<kit_id>/contents`, `PATCH /kits/<kit_id>/contents/<content_id>`, `DELETE /kits/<kit_id>/contents/<content_id>`; map business exceptions via `@handle_api_errors`.
- `app/services/inventory_service.py` – add bulk quantity lookup helper so kit detail avoids per-part queries.
- `app/services/container.py` – wire new service dependencies (`kit_service` factory needs `inventory_service` and `kit_reservation_service`; register `kit_reservation_service` provider).
- `app/services/test_data_service.py` – load BOM seed data via new `load_kit_contents` method; ensure fixture ordering so kits and parts exist first.
- `app/services/metrics_service.py` – add counters/histograms for kit detail views and BOM mutations that `KitService` will invoke.
- `app/data/test_data/kit_contents.json` (new) plus tweaks to `kits.json` if additional metadata required to exercise scenarios.
- Tests: extend `tests/services/test_kit_service.py`, `tests/api/test_kits_api.py`, `tests/test_database_constraints.py`, `tests/test_database_upgrade.py`, `tests/test_test_data_service.py`, and add `tests/services/test_kit_reservation_service.py` to cover reserved math.

## Implementation plan

### Phase 1 – Database schema & ORM layer
1. Author migration `018_create_kit_contents.py`:
   - Table columns: `id` PK, `kit_id` FK → `kits.id` (`ondelete="CASCADE"`), `part_id` FK → `parts.id` (`ondelete="CASCADE"`), `required_per_unit` INT NOT NULL, `note` TEXT NULL, `version` BIGINT NOT NULL DEFAULT 1, `created_at` / `updated_at` timestamps (`server_default=func.now()`, `onupdate=func.now()`).
   - Constraints/indexes: `CheckConstraint("required_per_unit >= 1", name="ck_kit_contents_required_positive")`, `UniqueConstraint("kit_id", "part_id", name="uq_kit_contents_kit_part")`, indexes on `kit_id` and `part_id` for lookups.
   - Downgrade drops indexes before table.
2. Implement `KitContent` model:
   - Map to `kit_contents`; configure `__mapper_args__ = {"version_id_col": version}` for optimistic locking.
   - Relationships: `kit = relationship("Kit", back_populates="contents", lazy="selectin")`, `part = relationship("Part", back_populates="kit_contents", lazy="selectin")`.
   - `__repr__` for debugging, optional property helpers (e.g., `required_total(build_target)` if useful for service).
3. Update `Kit` model:
   - Add `contents: Mapped[list["KitContent"]] = relationship(... cascade="all, delete-orphan", lazy="selectin")`.
   - Ensure `Kit.__all__` exports include `KitContent`.
   - Add lightweight helper like `has_contents` if required by service (optional).
4. Update `Part` model:
   - Introduce `kit_contents` relationship for reverse navigation (`cascade="all, delete-orphan"` is not desired on Part side; use `lazy="selectin"`).
5. Update Alembic imports (`app/models/__init__.py`) to include `KitContent`.

### Phase 2 – Services & business logic
1. Create `KitReservationService`:
   - Accept `Session` in constructor (`BaseService` or simple service depending on write needs; read-only so plain class).
   - Implement `get_reserved_totals_for_parts(part_ids, exclude_kit_id=None)` using `select(func.sum(KitContent.required_per_unit * Kit.build_target))` joined across `Kit` (filter `Kit.status == KitStatus.ACTIVE`) and `KitContent`, optionally excluding the current kit, returning a dict keyed by `part_id`.
   - Add helper `get_reserved_quantity(part_id, exclude_kit_id)` by delegating to plural method for convenience.
2. Update `ServiceContainer`:
   - Register `kit_reservation_service = providers.Factory(KitReservationService, db=db_session)`.
   - Inject both `inventory_service` and `kit_reservation_service` into `kit_service` factory (order matters but no circular dependencies).
3. Extend `InventoryService`:
   - Add bulk helper `get_total_quantities_by_part_keys(part_keys: Sequence[str]) -> dict[str, int]` that executes a single grouped query over `PartLocation` to prevent N+1 lookups when resolving kit availability; leverage `select(func.coalesce(func.sum(...)))` grouped by `Part.key`.
4. Extend `KitService`:
   - Accept new dependencies; adjust tests accordingly.
   - `get_kit_detail(kit_id: int) -> Kit`:
     1. Fetch kit with contents, shopping list links, pick lists, and associated `Part` objects via `selectinload`; raise `RecordNotFoundException` when missing.
     2. Gather part IDs → fetch reserved quantities via `kit_reservation_service.get_reserved_totals_for_parts(part_ids, exclude_kit_id=kit_id)`.
     3. Calculate in-stock totals by passing the collected part keys into `inventory_service.get_total_quantities_by_part_keys` for a batched lookup; map the returned dict back to each content row.
      4. For each content row compute: `total_required = required_per_unit * kit.build_target`, `available = max(in_stock - reserved, 0)`, `shortfall = max(total_required - available, 0)`; attach values (e.g., set attributes on content or return structured DTO) for schema serialization.
     5. Ensure kit metadata fields (`shopping_list_links`, `pick_lists`) come back sorted/stable for UI.
     6. Record a detail-view metric via `metrics_service.record_kit_detail_view(kit_id)` (new MetricsService helper) so Prometheus tracks kit detail usage.
   - `create_content(kit_id, part_id, required_per_unit, note=None) -> KitContent`:
     - Guard archived kits; load kit and part (use `db.get` / `select` with `with_for_update` optional).
     - Validate `required_per_unit >= 1`; rely on unique constraint by flushing and catch `IntegrityError`, raising `ResourceConflictException("kit content", f"kit {kit_id} already includes part {part_id}")`.
     - On duplicate or FK failures, call `self.db.rollback()` before raising (mirror `ShoppingListService.create_list` pattern) so the session stays usable.
     - Increment kit timestamp via `_touch_kit`, flush to populate version, and return the new row.
     - Emit `metrics_service.record_kit_content_created(kit_id, part_id, required_per_unit)` to track BOM edits.
   - `update_content(kit_id, content_id, version, required_per_unit=None, note=None) -> KitContent`:
     - Verify kit active, fetch content filtered by both ids; enforce that at least one field changes.
     - When `required_per_unit` provided, validate ≥1.
     - Apply version into the ORM object before mutation so SQLAlchemy’s version check fires; on `StaleDataError`, raise `ResourceConflictException("kit content", "the row was updated by another request")`.
     - Wrap flush in try/except to rollback on `IntegrityError` before re-raising the conflict, matching the create path.
     - Touch kit and flush.
     - Emit `metrics_service.record_kit_content_updated(kit_id, part_id)` along with a histogram of update duration if warranted.
   - `delete_content(kit_id, content_id)`:
     - Guard archived kits; ensure content exists under kit; delete row, touch kit, flush.
     - Rollback on `IntegrityError` before surfacing errors.
     - Emit `metrics_service.record_kit_content_deleted(kit_id, part_id)`.
   - Ensure internal helpers:
     - `_ensure_active_kit(kit)` to centralize archived guard.
     - `_load_content_for_update(kit_id, content_id)` returning ORM row for modifications.
     - Metric helper methods can wrap common `metrics_service` calls so detail/CRUD methods stay concise.
4. Confirm `_touch_kit` updates run for all content mutations so overview ordering stays fresh.

### Phase 3 – API & schema layer
1. Schema updates in `app/schemas/kit.py`:
   - Define `KitContentCreateSchema` (`part_id` int, `required_per_unit` int ≥1, optional `note` with example text).
   - Define `KitContentUpdateSchema` (optional `required_per_unit` / `note`, mandatory `version` BigInt ≥1).
   - Define `KitContentDetailSchema` with `model_config = ConfigDict(from_attributes=True)` including nested `part: PartListSchema` plus explicit `part_id` for easy comparisons; computed fields: `total_required`, `in_stock`, `reserved`, `available`, `shortfall`, leveraging the same projection used by shopping list lines.
   - Define lightweight schemas for linked resources:
     - `KitShoppingListLinkSchema` (id, `shopping_list_id`, name, status, `snapshot_kit_updated_at`, `is_stale`).
     - `KitPickListSchema` (id, status, `requested_units`, `first_deduction_at`, `completed_at`, `decreased_build_target_by`).
   - Create `KitDetailResponseSchema` bundling kit metadata plus arrays for `contents`, `shopping_list_links`, `pick_lists`; include `model_config = ConfigDict(from_attributes=True)` and computed `is_archived`.
   - Update `__all__` exports.
2. API routes in `app/api/kits.py`:
   - Add `@kits_bp.route("/<int:kit_id>", methods=["GET"])` returning `KitDetailResponseSchema`; call `kit_service.get_kit_detail`.
   - `POST /kits/<int:kit_id>/contents`: validate body with `KitContentCreateSchema`, call `create_content`, re-fetch computed detail for the new row, return 201 with `KitContentDetailSchema`.
   - `PATCH /kits/<int:kit_id>/contents/<int:content_id>`: validate with `KitContentUpdateSchema`, call `update_content`, return updated detail schema.
   - `DELETE /kits/<int:kit_id>/contents/<int:content_id>`: perform removal, return 204.
   - Ensure each endpoint invokes `_ensure_badge_attributes` (or extend helper) before schema conversion if badge counts are absent.
   - Extend Spectree responses to include 400/404/409 error schemas where appropriate.
3. Wire dependency injection: no new blueprint, but ensure additional Spectree schemas imported so OpenAPI stays current.

### Phase 4 – Seed data & automated tests
1. Test data:
   - Create `app/data/test_data/kit_contents.json` with diverse entries (multiple kits, duplicate part attempt, varying `required_per_unit`, one archived kit for read-only coverage).
   - Update `TestDataService` to load file after kits and before pick lists/shopping list links; validate part references exist; handle errors similar to existing loaders.
   - Adjust `kits.json` as needed (e.g., set `build_target` values that expose computed totals).
2. Database verification:
   - Extend `tests/test_database_constraints.py` to assert `required_per_unit >= 1` and uniqueness (`kit_id`, `part_id`).
   - Update `tests/test_database_upgrade.py` to confirm new table appears and downgrade cleans it up.
3. Metrics instrumentation:
   - Add Prometheus counters/histograms in `MetricsService` (e.g., `kit_detail_views_total`, `kit_content_mutations_total`, `kit_content_update_duration_seconds`) and expose lightweight recording helpers for `KitService`.
   - Extend metrics tests to verify registration and recording behavior.
4. Service tests (`tests/services/test_kit_service.py`):
   - Cover `get_kit_detail` availability math (varying in-stock/reserved combos, archived kit behavior).
   - Validate `create_content` enforces duplication rules and touch timestamps.
   - Validate `update_content` handles optimistic locking (`version` mismatch raises `ResourceConflictException`) and archived guard.
   - Validate `delete_content` removes rows and updates kit timestamp.
   - Assert metrics callbacks fire for detail view and CRUD operations by using a stub `MetricsService`.
5. Reservation service tests (`tests/services/test_kit_reservation_service.py`):
   - Ensure reserved totals omit archived kits and optionally exclude current kit.
6. API tests (`tests/api/test_kits_api.py`):
   - `GET /api/kits/<id>` returns detail payload with computed fields and chip arrays.
   - POST/PATCH/DELETE content endpoints respect status codes, validation, error cases (duplicate part → 409, archived kit → 409, version mismatch → 409).
7. Seed loader tests (`tests/test_test_data_service.py`):
   - Confirm kit contents load and relationships are established.
8. Run regression on existing tests to ensure legacy overview behavior remains intact.
