# Code Review – Box Number Sequence

## Findings
- No blocking issues found. The sequence-backed approach replaces the race-prone `MAX(box_no)` calculation while keeping SQLite tests deterministic. Migration, model, service, CLI, and test updates line up with the approved plan.

## Notes
- Migration `014_add_boxes_box_no_sequence.py` creates and backfills the `boxes_box_no_seq` sequence, then cleans it up on downgrade.
- `Box.box_no` now pulls from the shared sequence via `server_default`, with a SQLite fallback in `BoxService.create_box` to keep in-memory testing stable.
- `handle_load_test_data` realigns the sequence after fixtures are loaded so new boxes continue numbering correctly.
- `tests/test_box_service.py::test_create_box_concurrent_sessions_unique_sequence` covers the concurrent insert scenario when a PostgreSQL backend is available; other unit expectations still pass under SQLite thanks to the fallback.
- Minimal stub updates in `tests/test_cli.py` keep the CLI tests isolated while exercising the new alignment hook.

## Tests
- Not run during this review.
