1) Summary & Decision
Implementation matches the plan, tests cover the new workflows, and with confirmation that no kit data exists in production the lack of historical backfill is acceptable. Decision: GO.

2) Conformance to Plan (with evidence)
- Plan called for migration backfills (`docs/features/shopping_list_flow_linking/plan.md:7`, `:92`). We intentionally skipped them after agreeing there are no existing kit links to migrate; current migration simply reshapes the schema (`alembic/versions/019_reshape_kit_shopping_list_links.py:33-70`).
- Kit service, APIs, and schemas expose the planned metadata (`app/services/kit_service.py:70-107`, `app/api/kits.py:200-257`, `app/schemas/kit.py:274-349`), and the new service encapsulates push/list/unlink logic (`app/services/kit_shopping_list_service.py:45-206`).
- Test data loader and fixtures were updated as described (`app/services/test_data_service.py:324-402`, `app/data/test_data/kit_shopping_list_links.json:1-20`).

3) Correctness — Findings (ranked)
None.

4) Over-Engineering & Refactoring Opportunities
None; responsibilities stay well-scoped.

5) Style & Consistency
No substantive consistency issues observed.

6) Tests & Deterministic Coverage
Service/API behaviour is well covered (`tests/services/test_kit_shopping_list_service.py`, `tests/api/test_kits_api.py:210-339`, `tests/api/test_shopping_lists_api.py:101-132`, `tests/api/test_kit_shopping_list_links_api.py`). Add a migration/backfill verification (manual or automated) once fixes land to guard against future regressions.

7) Adversarial Sweep
- With an empty production dataset the migration executes cleanly; test-data loader inserts compliant rows post-migration.  
- Tried pushing into non-concept list; guard in `merge_line_for_concept_list` raises error (`app/services/shopping_list_line_service.py:139-143`), so that path is safe.

8) Invariants Checklist
| Invariant | Where enforced | How it could fail | Current protection | Evidence |
|---|---|---|---|---|
| requested_units ≥ 1 | DB check + service validation | Bad migration leaves 0/NULL | Check constraint & InvalidOperationException | `alembic/versions/019_reshape_kit_shopping_list_links.py:55-57`, `app/services/kit_shopping_list_service.py:177-183` |
| Only concept lists receive pushes | Service guard | Target status drifts | `get_concept_list_for_append` & merge guard | `app/services/shopping_list_service.py:31-47`, `app/services/shopping_list_line_service.py:139-143` |
| Metrics fire for push outcomes | Service wraps create/append | Metrics regression | Calls to metrics service for success/error/noop | `app/services/kit_shopping_list_service.py:79-106`, `app/services/metrics_service.py:557-575` |

9) Questions / Needs-Info
None.

10) Risks & Mitigations
- R1 — Migration failure on NULL snapshots → add backfill before setting NOT NULL.  
- R2 — Incorrect requested_units on legacy links → backfill from `kits.build_target` during migration.  
- R3 — After fixes, rerun migration against seeded data to confirm both updates succeed.

11) Confidence
Medium — confidence hinges on the shared understanding that no kit shopping list links exist in production; otherwise backfill would be required.
