1) Summary & Decision
The plan threads migration, services, APIs, and tests for kit↔shopping list linking, but several execution blockers remain (duplicate migration DDL, stale seed loader, and incomplete service test coverage). **Decision: GO-WITH-CONDITIONS** — resolve the highlighted blockers before implementation.

2) Conformance & Fit (with evidence)
- **Product brief scope — Pass**: The plan targets “Allow planners to generate or extend purchasing lists from a kit…” and reciprocal chips (docs/features/shopping_list_flow_linking/plan.md:3-19), matching the brief’s linkage between kits and shopping lists (docs/product_brief.md:66-75).
- **Plan template compliance — Pass**: It presents a description, impacted files, algorithms, and phased delivery (docs/features/shopping_list_flow_linking/plan.md:1-111) exactly as required by the planning checklist (docs/commands/plan_feature.md:5-17).
- **Agent test mandate — Fail**: New service methods (`list_links_for_kit`, `list_kits_for_shopping_list`, `unlink`) are listed (docs/features/shopping_list_flow_linking/plan.md:16-19), yet the test plan covers only computation/merge flows (docs/features/shopping_list_flow_linking/plan.md:40-42), violating the “test all public methods” rule (AGENTS.md:120-134).
- **Layering rules — Pass**: Business logic lives in services and APIs delegate (`app/services/kit_shopping_list_service.py`, `app/api/kits.py`, `app/api/shopping_lists.py`) per docs/features/shopping_list_flow_linking/plan.md:15-38, consistent with the layered architecture guidance (AGENTS.md:27-38).
- **Fit with codebase**: Target files such as `app/services/kit_service.py`, `app/services/container.py`, `app/schemas/kit.py`, and Alembic revisions (docs/features/shopping_list_flow_linking/plan.md:7-33) map directly onto the existing modules in `app/services/kit_service.py` and `app/services/container.py`, so the plan aligns with current structure.

3) Open Questions & Ambiguities
- Backfill defaults — Recommendation: set `requested_units` to each link’s current `kit.build_target` (bounded to ≥1) and `honor_reserved` to `false` during migration (docs/features/shopping_list_flow_linking/plan.md:88-89), so historic links reflect the same defaults the new flow uses. This keeps badge math consistent while giving future pushes room to overwrite with explicit values if the UI passes different units.
- Zero-shortage runs — Decision: if every BOM line clamps to zero, respond without creating a list or link and return a payload (e.g., `{ "status": "no-op", ... }`) indicating no changes were made (docs/features/shopping_list_flow_linking/plan.md:63,95). That matches the intent to avoid empty shopping lists yet gives the UI a deterministic result.
- Metrics shape — Recommendation: add `kit_shopping_list_push_total` (`Counter`) labeled by `outcome={"success","no_op","error"}` plus `honor_reserved` (`"on"/"off"`), a `Histogram` for push duration (`kit_shopping_list_push_seconds` mirroring existing duration buckets), and `kit_shopping_list_unlink_total` (`Counter` with `outcome`). This keeps labels low-cardinality and aligns with MetricsService patterns (docs/features/shopping_list_flow_linking/plan.md:25,98; app/services/metrics_service.py:1-220).

4) Deterministic Backend Coverage (new/changed behavior only)
- **POST /kits/<kit_id>/shopping-lists**  
  - Scenarios: Service + API tests promised for create vs append, honor-reserved math, archived/concept guards (docs/features/shopping_list_flow_linking/plan.md:40-45).  
  - Instrumentation: Counters/histograms via MetricsService for pushes (docs/features/shopping_list_flow_linking/plan.md:25,98).  
  - Persistence hooks: Alembic reshape, link upsert, dataset refresh (docs/features/shopping_list_flow_linking/plan.md:7,73,88-91).
- **GET /kits/<kit_id>/shopping-lists**  
  - Scenarios: API tests cover chip retrieval and stale flagging (docs/features/shopping_list_flow_linking/plan.md:44).  
  - Instrumentation: Not specified; consider whether existing kit detail metrics suffice for this listing.  
  - Persistence hooks: Relies on new ORM fields added in migration (docs/features/shopping_list_flow_linking/plan.md:7-13,27-30).
- **GET /shopping-lists/<int:list_id>/kits**  
  - Scenarios: API suite extends to reciprocal chips (docs/features/shopping_list_flow_linking/plan.md:45).  
  - Instrumentation: None noted; acceptable if baseline HTTP metrics are deemed enough for read-only exposure.  
  - Persistence hooks: Uses the reshaped link table with snapshot timestamps (docs/features/shopping_list_flow_linking/plan.md:7-13,73-76).
- **DELETE /kit-shopping-list-links/<int:link_id>**  
  - Scenarios: API tests for edge cases plus service guard (docs/features/shopping_list_flow_linking/plan.md:19,46).  
  - Instrumentation: Unlink counter planned (docs/features/shopping_list_flow_linking/plan.md:25,80,98).  
  - Persistence hooks: Cascade delete via relationship and FK (docs/features/shopping_list_flow_linking/plan.md:10,77-78).
- **GET /shopping-lists (status filter)**  
  - Scenarios: Tests to mix `status` list with `include_done` (docs/features/shopping_list_flow_linking/plan.md:20-23,45,82-84).  
  - Instrumentation: Not mentioned; likely fine since existing list endpoint metrics remain unchanged.  
  - Persistence hooks: Query filter updates in ShoppingListService (docs/features/shopping_list_flow_linking/plan.md:20-23,81-84).

5) Adversarial Sweep (≥3 issues)
- [A1] **Major — Migration re-creates existing index/constraint**  
  **Evidence:** The plan asks to “Add indexes `ix_kit_shopping_list_links_shopping_list_id` and the unique pair constraint named `uq_kit_shopping_list_links_pair`” (docs/features/shopping_list_flow_linking/plan.md:7), but Alembic revision 017 already created `ix_kit_shopping_list_links_shopping_list_id` and `uq_kit_shopping_list_link` (alembic/versions/017_create_kits_tables.py:112-129).  
  **Why it matters:** Re-running `op.create_index`/`op.create_unique_constraint` with the same index name will raise `DuplicateTable` during migration, halting deployment.  
  **Fix suggestion:** Drop/rename the existing constraint/index before re-adding, or reuse the current names without recreating them.  
  **Confidence:** High.
- [A2] **Major — Test data loader still writes removed columns**  
  **Evidence:** Plan only reshapes JSON files (docs/features/shopping_list_flow_linking/plan.md:47-49), but `TestDataService.load_kit_shopping_list_links` still reads `linked_status`/`is_stale` and has no logic for `requested_units` / `honor_reserved` (app/services/test_data_service.py:360-385).  
  **Why it matters:** `poetry run python -m app.cli load-test-data --yes-i-am-sure` will crash or seed wrong rows after the schema change, breaking Definition of Done.  
  **Fix suggestion:** Add `app/services/test_data_service.py` (and its tests) to the plan, loading the new fields and dropping the obsolete ones.  
  **Confidence:** High.
- [A3] **Major — KitShoppingListService lacks planned tests for all public methods**  
  **Evidence:** Public methods include `list_links_for_kit`, `list_kits_for_shopping_list`, and `unlink` (docs/features/shopping_list_flow_linking/plan.md:16-19), yet the service test plan lists only computation/merge scenarios (docs/features/shopping_list_flow_linking/plan.md:40-42). AGENTS requires coverage of every public method (AGENTS.md:120-134).  
  **Why it matters:** Without direct tests, edge cases like empty chip results or unlink guards could slip through unnoticed.  
  **Fix suggestion:** Extend `tests/services/test_kit_shopping_list_service.py` to cover the listing and unlink operations (success and error paths).  
  **Confidence:** High.

6) Derived-Value & Persistence Invariants
| Derived value | Source dataset (filtered/unfiltered) | Write/cleanup it triggers | Guard conditions | Invariant that must hold | Evidence (file:lines) |
| ------------- | ------------------------------------ | ------------------------- | ---------------- | ------------------------ | --------------------- |
| `needed` per part | Kit contents + inventory + reservations (unfiltered until zero-clamp) | Creates or increments `ShoppingListLine.needed` during merge | Skip `needed == 0`; enforce concept lists (docs/features/shopping_list_flow_linking/plan.md:63-71) | `needed` stored is ≥ 0 and reflects the deficit under the chosen `honor_reserved` mode | docs/features/shopping_list_flow_linking/plan.md:54-71 |
| `requested_units` | Request `units` defaulting to kit `build_target` (filtered via schema) | Stored on `KitShoppingListLink.requested_units` | Validate positive units via schema, reuse when upserting links (docs/features/shopping_list_flow_linking/plan.md:16,73) | Link’s `requested_units` matches the units used to compute `needed` | docs/features/shopping_list_flow_linking/plan.md:16,60,73 |
| `snapshot_kit_updated_at` | Current `Kit.updated_at` timestamp (unfiltered) | Persisted on link upsert for stale detection | Only set after kit active check; refreshed on each push (docs/features/shopping_list_flow_linking/plan.md:55,73,95) | `snapshot_kit_updated_at <= kit.updated_at` so `is_stale` reflects later kit edits | docs/features/shopping_list_flow_linking/plan.md:55-75,88-89 |

7) Risks & Mitigations (top 3)
- Migration DDL collision will abort upgrades (**A1**). Mitigation: plan the constraint/index drop/rename explicitly before applying new definitions (docs/features/shopping_list_flow_linking/plan.md:7; alembic/versions/017_create_kits_tables.py:112-129).
- Seed loader/schema drift will derail `load-test-data` (**A2**). Mitigation: update `app/services/test_data_service.py` and its tests to populate `requested_units`/`honor_reserved` (app/services/test_data_service.py:360-385; docs/features/shopping_list_flow_linking/plan.md:47-49).
- Unspecified tests for list/unlink flows risk regressions (**A3**). Mitigation: add explicit service tests for `list_links_for_kit`, `list_kits_for_shopping_list`, and `unlink` before implementation (docs/features/shopping_list_flow_linking/plan.md:16-19,40-42; AGENTS.md:120-134).

8) Confidence
Medium — The plan touches all relevant layers and prior code familiarity helps, but open migration/data questions and missing test commitments introduce uncertainty until addressed.
