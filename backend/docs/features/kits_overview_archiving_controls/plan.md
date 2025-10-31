# Kits overview & archiving controls – backend plan

Implement the backend for “Kits overview & archiving controls” from `docs/epics/kits_feature_breakdown.md`, enabling the global kits index, status switching between Active and Archived, debounced text filtering, and archive/unarchive lifecycle controls.

## Target files
- `alembic/versions/017_create_kits_tables.py` – introduce `kits`, `kit_shopping_list_links`, and `kit_pick_lists` tables plus supporting indexes and constraints.
- `app/models/kit.py` / `app/models/kit_shopping_list_link.py` / `app/models/kit_pick_list.py` – SQLAlchemy models with relationships to existing shopping list tables; update `app/models/__init__.py` to export them.
- `app/services/kit_service.py` – business logic for listing, creating, updating, archiving, badge aggregation, and metrics recording; update `app/services/container.py` to provide the service and inject metrics.
- `app/services/metrics_service.py` – register counters/gauges for kit lifecycle activity.
- `app/schemas/kit.py` – Pydantic schemas (`KitCreateSchema`, `KitUpdateSchema`, `KitSummarySchema`, `KitResponseSchema`, enum mirroring `KitStatus`); add exports in `app/schemas/__init__.py`.
- `app/api/kits.py` – Flask blueprint implementing `GET /kits`, `POST /kits`, `PATCH /kits/<kit_id>`, `POST /kits/<kit_id>/archive`, and `POST /kits/<kit_id>/unarchive`; update `app/api/__init__.py` and application wiring in `app/__init__.py`.
- `app/services/test_data_service.py` and new fixtures under `app/data/test_data/` (e.g., `kits.json`, `kit_shopping_list_links.json`, `kit_pick_lists.json`) – seed realistic kits plus relationships for badge counts.
- Test suite additions: `tests/services/test_kit_service.py`, `tests/api/test_kits_api.py`, updates to dataset-dependent tests (e.g., `tests/test_database_constraints.py`, `tests/test_database_upgrade.py`) to cover new tables and constraints.
- Documentation touchpoints if needed (e.g., OpenAPI via Spectree) happen implicitly through schema definitions; verify `docs/product_brief.md` references remain accurate.

## Implementation plan

### Phase 1 – Database schema & models
1. Define `KitStatus` enum (`active`, `archived`) backed by `SQLEnum(..., native_enum=False)` and `CheckConstraint("build_target >= 1", name="ck_kits_build_target_positive")`. Fields: `id`, `name` (unique across kits), `description`, `build_target`, `status`, `archived_at`, `created_at`, `updated_at`. Add indexes on `status`, `(status, updated_at DESC)`, and a functional index on `func.lower(name)` for search. Enforce `UniqueConstraint("name", name="uq_kits_name")` so kit names become globally unique per the outstanding epic question.
2. Create `kit_shopping_list_links` with FKs to `kits.id` and `shopping_lists.id`, storing `created_at`/`updated_at`, badge-oriented snapshots: `linked_status` (enum), `snapshot_kit_updated_at` (timestamp), and `is_stale` (boolean) to support chip rendering (docs/epics/kits_feature_breakdown.md). Add cascade delete from kits and ensure FK relationships align with existing shopping list tables.
3. Create `kit_pick_lists` table with FK to `kits.id` and lifecycle/audit columns required by the epic: `requested_units` (>=1), `status` enum (`draft`, `in_progress`, `completed`), `first_deduction_at`, `completed_at`, `decreased_build_target_by` (>=0), `created_at`, `updated_at`. Include the documented check constraints (`requested_units >= 1`, `decreased_build_target_by >= 0`) and prepare for future pick-list line linkage via cascade.
4. Wire SQLAlchemy models to the new tables with `lazy="selectin"` relationships, cascade settings (`all, delete-orphan`), and inverse relationships placeholders for future kit detail work. Update `app/models/__init__.py` and Alembic autogeneration imports.
5. Update Alembic migration ordering (revision ID, down revision). Ensure `upgrade()` creates tables and indexes, while `downgrade()` drops them in reverse dependency order.

### Phase 2 – Service layer
1. Implement `KitService(BaseService)` with constructor accepting `Session` and optional injected collaborators (future-proof for metrics). Public methods:
   - `list_kits(status: KitStatus, query: str | None, limit: int | None)` – returns ORM rows plus computed badge counts.
   - `create_kit(...)`, `update_kit(kit_id, ...)`, `archive_kit(kit_id)`, `unarchive_kit(kit_id)`.
2. **List algorithm**:
   1. Build base `select(Kit)` filtered by `Kit.status == status`.
   2. If `query` present, normalise via `term = f"%{query.strip().lower()}%"` and apply `func.lower(Kit.name).like(term)` together with `Kit.description.ilike(term)` to keep search case-insensitive.
   3. Join `kit_shopping_list_links` → `ShoppingList` with `outerjoin`, filter list statuses to `{concept, ready}`, aggregate via `func.count()` for `shopping_list_badge_count`.
   4. Left join `kit_pick_lists` filtered to `KitPickList.status != 'completed'` and aggregate to `pick_list_badge_count`.
   5. Group by `Kit.id`, order by `Kit.updated_at.desc()`, apply optional limit (for pagination readiness), and execute via `self.db.execute(...).all()`.
3. `create_kit` – instantiate `Kit`, apply defaults (`build_target`=1, `status=KitStatus.ACTIVE`), flush to obtain ID, and return instance.
4. `update_kit` – fetch kit; if archived, raise `InvalidOperationException("update kit", "kit is archived")`. Apply field updates, ensure `build_target >= 1`, touch `updated_at` by using `func.now()`.
5. `archive_kit` – verify not already archived; set `status=KitStatus.ARCHIVED`, `archived_at=func.now()`, update `updated_at`, return kit.
6. `unarchive_kit` – ensure currently archived, clear `archived_at`, set status active, bump `updated_at`.
7. Raise `RecordNotFoundException("Kit", kit_id)` when queries miss; rely on existing session rollback flagging if needed.
8. Register service in `ServiceContainer` as `kit_service = providers.Factory(KitService, db=db_session, metrics_service=metrics_service)`, wiring `MetricsService` into kit operations so lifecycle calls can increment counters/gauges (e.g., `kits_created_total`, `kits_archived_total`, `kits_unarchived_total`).

### Phase 3 – API layer
1. Create `app/schemas/kit.py` with:
   - `KitStatusSchema` Enum (matching DB enum values).
   - `KitCreateSchema` / `KitUpdateSchema` using `Field()` for metadata (description, example values).
   - `KitSummarySchema` (for collection responses) with badge counts and timestamps (`model_config = ConfigDict(from_attributes=True)`); include optional `@computed_field` if deriving `is_archived`.
   - `KitResponseSchema` for create/update/archive responses (full metadata, badges default to zero since details absent).
2. Implement `kits_bp = Blueprint("kits", __name__, url_prefix="/kits")`; decorate endpoints with `@api.validate` and `@handle_api_errors`.
3. Endpoint logic:
   - `GET /kits`: parse query params via schema (maybe `KitFilterQuerySchema`), call `kit_service.list_kits`, map ORM results to summary schema (including aggregated counts).
   - `POST /kits`: validate payload, delegate to `create_kit`, return serialized response with 201.
   - `PATCH /kits/<kit_id>`: apply update schema, reject empty payload (raise `InvalidOperationException`), enforce archived guard.
   - `POST /kits/<kit_id>/archive` & `/unarchive`: no body; delegate, return updated response.
4. Emit metrics from endpoints where necessary (e.g., report search requests to Prometheus via `metrics_service.observe_list_kits`), ensuring instrumentation flows through the service layer.
5. Update `app/api/__init__.py` to import/register `kits_bp`, and extend container wiring list in `app/__init__.py` so dependency injector can supply `kit_service`.

### Phase 4 – Data loading & fixtures
1. Extend `TestDataService.load_full_dataset` to insert kits immediately after shopping lists are created (ensuring FK targets exist) but before shopping list lines/pick lists reuse those IDs. Sequence: load kits JSON → map kit IDs, then load shopping list links → load pick lists. Update helper methods to reuse existing session flush pattern so `load_shopping_list_lines` continues to run afterwards.
2. Design test JSON files:
   - `kits.json` with active/archived mixes, varied `build_target`, optional descriptions.
   - `kit_shopping_list_links.json` referencing shopping list names and kit identifiers, including lists in statuses `concept`, `ready`, and `done` to test badge filtering.
   - `kit_pick_lists.json` containing entries in completed and non-completed states to validate badges.
3. Update CLI or service constants if necessary so `load-test-data` imports the new fixtures without manual wiring.

### Phase 5 – Testing
1. Service tests (`tests/services/test_kit_service.py`):
   - `list_kits` filters by status and `query`.
   - Badge aggregation respects shopping list and pick list status rules (only `{concept, ready}` and non-completed).
   - `create_kit` default handling, `RecordNotFoundException` for missing updates, guard against `build_target < 1`.
   - Duplicate name attempts raise `InvalidOperationException`, covering the database unique constraint.
   - `archive_kit` / `unarchive_kit` transitions, including idempotency errors (`InvalidOperationException`).
2. API tests (`tests/api/test_kits_api.py`):
   - JSON contract for all endpoints (status codes, response payload structure).
   - Validation failures (invalid status param, negative build target, editing archived kit).
   - Ensure `GET /kits` preserves query param echo and default status=`active`.
3. Update integration tests:
   - `tests/test_database_upgrade.py` to assert new tables exist post-migration.
   - `tests/test_database_constraints.py` for `ck_kits_build_target_positive` and relationship cascades.
   - `tests/test_cli.py` to verify `load-test-data` loads kits without errors.
4. Metrics tests: extend existing `MetricsService` test harness or add focused unit tests ensuring kit counters change when service methods run (can be integrated into service tests via fixture injection).
5. Add OpenAPI regression coverage by running `Spectree` validation via existing patterns (implicitly exercised in API tests).

### Phase 6 – Runtime wiring & validation
1. Ensure `ServiceContainer` wiring is hooked into API module and metrics/logging flows (no background threads required here).
2. Update application bootstrap (`app/__init__.py`) to include `app.api.kits` in `wire_modules`. Confirm blueprint registration surfaces routes under `/api/kits`.
3. Register the kit metrics gauges/counters inside `app/services/metrics_service.py` and verify they appear in the `/metrics` endpoint.
4. Run `poetry run alembic upgrade head`, `poetry run mypy .`, `poetry run ruff check .`, and `poetry run pytest` locally to validate the implementation once code changes are made.
