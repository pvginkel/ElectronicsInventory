Box number generation must become safe under concurrent `BoxService.create_box` calls so the unique index on `boxes.box_no` never collides, eliminating the race uncovered during load testing.

Relevant files / functions
- `alembic/versions/<new>`: add a migration that introduces a dedicated PostgreSQL sequence (`boxes_box_no_seq`), sets `boxes.box_no` to pull from it, and backfills the sequence value from existing rows.
- `app/models/box.py` (`Box.box_no` column definition): configure SQLAlchemy to rely on the shared sequence via `server_default` so inserts always claim the next database-assigned value.
- `app/services/box_service.py` (`BoxService.create_box`): remove the `max(box_no) + 1` lookup and let the ORM/default populate `box_no` after flush.
- `tests/test_box_service.py` (and any other tests asserting explicit `box_no` values): ensure expectations still hold when the database, not Python, issues IDs; add coverage for concurrent creation if a deterministic unit test is feasible.
- `app/cli.py` (`handle_load_test_data`): reset `boxes_box_no_seq` to `MAX(box_no)` after loading fixtures so the next created box continues the sequence.

Implementation steps / algorithms
1. Migration
   - Generate a new Alembic revision.
   - In `upgrade()`, create `boxes_box_no_seq` (start at 1, owned by `boxes.box_no`).
   - Execute `SELECT setval('boxes_box_no_seq', COALESCE(MAX(box_no), 0))` (or the SQLAlchemy equivalent) so `nextval` starts from the highest existing box number.
   - Alter `boxes.box_no` to set its default to `nextval('boxes_box_no_seq')` and drop the old default if one exists.
   - In `downgrade()`, reverse the default change, drop the sequence, and leave existing `box_no` data intact.
2. Model changes
   - Import SQLAlchemy `Sequence` (or use `db.Sequence`) and attach it to `box_no` via `server_default` so new Box instances automatically pull a value when flushed.
   - Confirm metadata naming matches Alembic’s sequence name to avoid divergence.
3. Service adjustment
   - Delete the manual `max_box_no` query and instantiation logic in `create_box`.
   - Create `Box(description=..., capacity=...)`, add to the session, `flush()`, and rely on the populated `box.box_no` for location creation.
   - Leave subsequent location generation unchanged; all locations should use the already-populated `box.box_no`.
4. Testing
   - Update service tests to continue asserting deterministic numbering by starting from a clean DB (sequence is reset to 1 when empty); verify that two sequential service calls produce 1 and 2.
   - Add a targeted test using two independent SQLAlchemy sessions (or explicit transaction commits) to simulate concurrent inserts and confirm the database assigns distinct `box_no` values.
   - Run full suite (`poetry run pytest`). Consider adding type-check (`poetry run mypy`) if new imports impact typing.
5. Tooling adjustments
   - Update `handle_load_test_data` to run the same `setval` logic after fixtures are inserted, guaranteeing the next runtime `create_box` picks up at `MAX(box_no) + 1`.
   - Manually verify the CLI still reports the expected dataset summary and that a subsequent `BoxService.create_box` call in the same session gets the next sequential number.
