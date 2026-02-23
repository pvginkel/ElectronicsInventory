# Seller Links Refactor -- Code Review

## 1) Summary & Decision

**Readiness**

The implementation is a thorough refactoring from single-seller-per-part to a many-to-many `part_sellers` link table. All core deliverables are present: new model, migration, service, schemas, API endpoints, removal of seller fields from Part and AI pipelines, shopping list simplification, test data updates, and comprehensive test suites for the new code. The change spans 36 modified files and 7 new files, covering model, service, schema, API, migration, test data, and tests. Code quality is high throughout, following established project patterns for layering, DI wiring, error handling, and testing. Two plan deviations are noted: (1) shopping list `seller_link` URL resolution was omitted from the implementation, and (2) "override" terminology in schema descriptions was not updated. Neither is blocking for a first merge since the seller link resolution is an additive feature that can be layered on top.

**Decision**

`GO-WITH-CONDITIONS` -- Two plan commitments are not yet implemented (shopping list `seller_link` field and "override" description updates), and a few minor style issues should be addressed. None are blocking bugs.

## 2) Conformance to Plan (with evidence)

**Plan alignment**

- `Plan section 1 (PartSeller model)` <-> `app/models/part_seller.py:11-47` -- Model has correct columns (`id`, `part_id`, `seller_id`, `link`, `created_at`), UniqueConstraint on `(part_id, seller_id)`, FK with `ondelete="CASCADE"`, relationships to Part and Seller, and `@property` helpers for flat schema serialization.
- `Plan section (migration 021)` <-> `alembic/versions/021_create_part_sellers_table.py:31-75` -- Creates table, migrates data with `WHERE seller_id IS NOT NULL AND seller_link IS NOT NULL`, drops old columns. Downgrade path included.
- `Plan section (Part model)` <-> `app/models/part.py:81-83` -- `seller_id` and `seller_link` removed, `seller_links` relationship added with `cascade="all, delete-orphan"`.
- `Plan section (Seller model)` <-> `app/models/seller.py:21-23` -- `parts` back-populates replaced with `part_sellers` relationship.
- `Plan section (PartSellerService)` <-> `app/services/part_seller_service.py:18-142` -- `add_seller_link`, `remove_seller_link`, `get_seller_link_url`, `bulk_get_seller_links` all implemented with correct exception handling and IntegrityError/ResourceConflictException pattern.
- `Plan section (API endpoints)` <-> `app/api/part_seller_links.py:23-73` -- POST and DELETE endpoints with SpectTree validation, DI injection, correct status codes (201, 204).
- `Plan section (Part schemas)` <-> `app/schemas/part.py:247-250,394-396` -- `seller`/`seller_link` fields removed from PartCreateSchema, PartUpdateSchema, PartResponseSchema, PartWithTotalSchema; replaced with `seller_links: list[PartSellerLinkSchema]`.
- `Plan section (AI removal)` <-> `app/services/ai_service.py`, `app/schemas/ai_part_analysis.py`, `app/schemas/ai_part_cleanup.py`, `app/services/ai_model.py`, `app/services/prompts/part_analysis.md` -- All seller fields, `_resolve_seller()`, selectinloads, and prompt sections removed cleanly.
- `Plan section (Shopping list simplification)` <-> `app/models/shopping_list_line.py` -- `effective_seller_id` and `effective_seller` properties removed. `app/services/shopping_list_service.py:543-544` uses `line.seller_id` directly. `app/services/shopping_list_line_service.py:522-536` simplified to use `ShoppingListLine.seller_id` only.
- `Plan section (Seller service delete)` <-> `app/services/seller_service.py:112-115` -- Checks `PartSeller.seller_id` instead of `Part.seller_id`.
- `Plan section (Container wiring)` <-> `app/services/container.py:136-141` -- `part_seller_service` Factory provider added with correct dependencies; `seller_service` removed from `ai_service`.
- `Plan section (Test data)` <-> `app/data/test_data/parts.json` -- `seller_id`/`seller_link` removed from all parts, replaced with `seller_links` arrays. `app/services/test_data_service.py:208-222` creates PartSeller rows from the new format.

**Gaps / deviations**

- `Plan section 3 (ShoppingListLineListSchema and ShoppingListLineResponseSchema)` -- The plan commits to adding a `seller_link: str | None` field to both shopping list line schemas, populated via `part_sellers` lookup in the service layer. This field is **not implemented**. No `seller_link` field was added to either schema, and the `bulk_get_seller_links()` / `get_seller_link_url()` methods on `PartSellerService` are not wired into shopping list service/line service code paths (`app/schemas/shopping_list_line.py:59-108,134-162`).
- `Plan section 5 (Shopping list seller_link resolution algorithm)` -- The plan describes a detailed bulk lookup algorithm for enriching shopping list lines with `seller_link`. This algorithm is not implemented in any service.
- `Plan section (remove override terminology)` -- The plan requires updating "override" descriptions in shopping list line schemas. The descriptions at `app/schemas/shopping_list_line.py:22,43,74,143` and `app/schemas/part_shopping_list.py:104` still read "Optional seller override" and "Seller override" even though `seller_id` is now THE seller, not an override.

## 3) Correctness -- Findings (ranked)

- Title: `Major -- Shopping list seller_link field not implemented per plan`
- Evidence: `app/schemas/shopping_list_line.py:59-108` and `app/schemas/shopping_list_line.py:134-162` -- no `seller_link` field. The plan (sections 3 and 5) commits to: "Add `seller_link: str | None` field" to `ShoppingListLineListSchema` and `ShoppingListLineResponseSchema`, with service-layer bulk lookup against `part_sellers`.
- Impact: The frontend cannot display a clickable seller link for shopping list lines. This was a user requirement: "Return seller link URL in shopping list get/list endpoints when a matching `part_sellers` record exists for the line's `(part_id, seller_id)` combination". The `PartSellerService.bulk_get_seller_links()` method exists but is not wired into any consumer.
- Fix: Add `seller_link: str | None = Field(default=None, ...)` to both schemas. In the shopping list service/line service, call `part_seller_service.bulk_get_seller_links()` to enrich lines before serialization. Wire `part_seller_service` into the relevant shopping list services via DI. Add tests for the enrichment.
- Confidence: High

- Title: `Minor -- "Override" terminology not updated in schema descriptions`
- Evidence: `app/schemas/shopping_list_line.py:22` -- `"Optional seller override"` in `ShoppingListLineCreateSchema.seller_id`, `app/schemas/shopping_list_line.py:43` -- same in `ShoppingListLineUpdateSchema.seller_id`, `app/schemas/shopping_list_line.py:74` -- `"Seller override identifier"`, `app/schemas/shopping_list_line.py:143` -- `"Seller override details if specified"`, `app/schemas/part_shopping_list.py:50` -- `"Seller override or default seller context for the line"`, `app/schemas/part_shopping_list.py:104` -- `"Optional seller override for this line"`.
- Impact: Misleading OpenAPI documentation; "override" implies a fallback to a Part-level seller, which no longer exists.
- Fix: Replace "override" descriptions with direct language, e.g., "Seller for this line" / "Seller details if specified".
- Confidence: High

- Title: `Minor -- Trailing whitespace in ai_service test after seller_service removal`
- Evidence: `tests/test_ai_service.py:184,352,402,446,517,537` -- Several places where `seller_service=mock_seller_service,` was removed leave behind blank lines or lines ending with just whitespace, e.g., line 184: `seller_service=mock_seller_service,` replaced by an empty line followed by `download_cache_service=...`.
- Impact: Cosmetic only; may trigger linting warnings from ruff.
- Fix: Remove the blank lines left behind.
- Confidence: High

## 4) Over-Engineering & Refactoring Opportunities

- Hotspot: `_convert_part_to_schema_data()` manual serialization in `app/api/parts.py:100-112`
- Evidence: `app/api/parts.py:100-112` -- The list endpoint manually builds dicts for seller_links, while the detail endpoint (`get_part` at line 262) uses `PartResponseSchema.model_validate(part)` directly, relying on `from_attributes=True` and the `@property` helpers on `PartSeller`.
- Suggested refactor: Consider using `PartSellerLinkSchema.model_validate(ps).model_dump()` inside the loop or `model_validate` on the whole Part if feasible, to avoid duplicating the field list between the manual dict and the schema.
- Payoff: Single source of truth for the seller link response shape; reduces risk of drift if fields are added to `PartSellerLinkSchema` later.

## 5) Style & Consistency

- Pattern: `getattr(part, "seller_links", []) or []` defensive access
- Evidence: `app/api/parts.py:102` -- `for ps in getattr(part, "seller_links", []) or []:`
- Impact: The `seller_links` attribute is a declared `Mapped[list]` relationship on `Part` with `default_factory`-like behavior from SQLAlchemy. Using `getattr` with a fallback suggests uncertainty about whether the attribute exists. In practice, SQLAlchemy guarantees the attribute is present (as an empty list if not loaded). The `or []` guard handles `None` returns from `getattr`, but `Mapped[list]` never returns `None`.
- Recommendation: Simplify to `for ps in part.seller_links:` since the relationship is always present. If the concern is about unloaded lazy relationships, the eager load in `inventory_service.py:339` already handles this.

- Pattern: Schema descriptions inconsistency for seller_id
- Evidence: `app/schemas/shopping_list_line.py:22,43` say "Optional seller override" while the code semantics have changed to "seller_id IS the seller".
- Impact: OpenAPI documentation will mislead API consumers about the field's purpose.
- Recommendation: Update all "override" descriptions to reflect that `seller_id` is the line's seller, not a fallback override.

## 6) Tests & Deterministic Coverage (new/changed behavior only)

- Surface: PartSellerService (NEW)
- Scenarios:
  - Given a part and seller, When adding a seller link, Then link created with correct fields (`tests/services/test_part_seller_service.py::TestPartSellerService::test_add_seller_link_success`)
  - Given two sellers, When adding both to same part, Then multiple links created (`tests/services/test_part_seller_service.py::test_add_seller_link_multiple_sellers_for_one_part`)
  - Given existing link, When adding duplicate (part+seller), Then ResourceConflictException (`tests/services/test_part_seller_service.py::test_add_seller_link_duplicate_raises_conflict`)
  - Given nonexistent part, When adding link, Then RecordNotFoundException (`tests/services/test_part_seller_service.py::test_add_seller_link_nonexistent_part`)
  - Given nonexistent seller, When adding link, Then RecordNotFoundException (`tests/services/test_part_seller_service.py::test_add_seller_link_nonexistent_seller`)
  - Given existing link, When removing, Then deleted (`tests/services/test_part_seller_service.py::test_remove_seller_link_success`)
  - Given nonexistent link ID, When removing, Then RecordNotFoundException (`tests/services/test_part_seller_service.py::test_remove_seller_link_nonexistent_link`)
  - Given nonexistent part, When removing link, Then RecordNotFoundException (`tests/services/test_part_seller_service.py::test_remove_seller_link_nonexistent_part`)
  - Given link on part A, When removing using part B key, Then RecordNotFoundException (`tests/services/test_part_seller_service.py::test_remove_seller_link_wrong_part_key`)
  - Given existing link, When looking up URL, Then returns link (`tests/services/test_part_seller_service.py::test_get_seller_link_url_found`)
  - Given no link, When looking up URL, Then returns None (`tests/services/test_part_seller_service.py::test_get_seller_link_url_not_found`)
  - Given multiple links, When bulk lookup, Then all returned (`tests/services/test_part_seller_service.py::test_bulk_get_seller_links_success`)
  - Given empty pairs, When bulk lookup, Then empty dict (`tests/services/test_part_seller_service.py::test_bulk_get_seller_links_empty_pairs`)
  - Given partial matches, When bulk lookup, Then only matched returned (`tests/services/test_part_seller_service.py::test_bulk_get_seller_links_partial_match`)
  - Given cross-product data, When requesting specific pairs, Then only requested pairs returned (`tests/services/test_part_seller_service.py::test_bulk_get_seller_links_filters_by_exact_pairs`)
  - Given created link, When querying DB directly, Then persisted (`tests/services/test_part_seller_service.py::test_seller_link_persisted_to_database`)
  - Given created link, When accessing Part.seller_links, Then relationship populated (`tests/services/test_part_seller_service.py::test_part_seller_links_relationship`)
- Hooks: Standard `app`, `session`, `container` fixtures
- Gaps: None for the service layer. Comprehensive coverage.
- Evidence: `tests/services/test_part_seller_service.py` -- 16 test methods

- Surface: Part Seller Links API (NEW)
- Scenarios:
  - POST success returns 201 with correct schema (`tests/api/test_part_seller_links_api.py::test_add_seller_link_success`)
  - POST response has exactly expected fields (`tests/api/test_part_seller_links_api.py::test_add_seller_link_response_schema_structure`)
  - POST persisted to database (`tests/api/test_part_seller_links_api.py::test_add_seller_link_persisted_to_database`)
  - POST duplicate returns 409 (`tests/api/test_part_seller_links_api.py::test_add_seller_link_duplicate_returns_409`)
  - POST nonexistent part returns 404 (`tests/api/test_part_seller_links_api.py::test_add_seller_link_nonexistent_part_returns_404`)
  - POST nonexistent seller returns 404 (`tests/api/test_part_seller_links_api.py::test_add_seller_link_nonexistent_seller_returns_404`)
  - POST missing seller_id returns 400 (`tests/api/test_part_seller_links_api.py::test_add_seller_link_missing_seller_id`)
  - POST missing link returns 400 (`tests/api/test_part_seller_links_api.py::test_add_seller_link_missing_link`)
  - POST empty link returns 400 (`tests/api/test_part_seller_links_api.py::test_add_seller_link_empty_link`)
  - POST malformed JSON returns 400 (`tests/api/test_part_seller_links_api.py::test_add_seller_link_malformed_json`)
  - POST missing content-type returns 400 (`tests/api/test_part_seller_links_api.py::test_add_seller_link_missing_content_type`)
  - POST multiple sellers to same part (`tests/api/test_part_seller_links_api.py::test_add_multiple_sellers_to_same_part`)
  - DELETE success returns 204 (`tests/api/test_part_seller_links_api.py::test_remove_seller_link_success`)
  - DELETE nonexistent link returns 404 (`tests/api/test_part_seller_links_api.py::test_remove_seller_link_nonexistent_link_returns_404`)
  - DELETE nonexistent part returns 404 (`tests/api/test_part_seller_links_api.py::test_remove_seller_link_nonexistent_part_returns_404`)
  - DELETE wrong part key returns 404 (`tests/api/test_part_seller_links_api.py::test_remove_seller_link_wrong_part_key_returns_404`)
  - Seller links visible in part detail response (`tests/api/test_part_seller_links_api.py::test_seller_links_visible_in_part_response`)
  - Seller links removed after delete (`tests/api/test_part_seller_links_api.py::test_seller_links_removed_from_part_response_after_delete`)
- Hooks: Standard `app`, `client`, `session`, `container` fixtures. Uses `session.expire_all()` to avoid stale identity map in shared-session test environment.
- Gaps: None for the API layer. Comprehensive coverage.
- Evidence: `tests/api/test_part_seller_links_api.py` -- 18 test methods

- Surface: Part API (CHANGED -- seller_links in responses)
- Scenarios:
  - Create part no longer accepts seller_id/seller_link (`tests/test_parts_api.py::test_create_part_success` -- verifies `seller_links == []`)
  - List parts includes seller_links (`tests/test_parts_api.py::test_list_parts_includes_seller_links`)
  - Minimal part has empty seller_links (`tests/test_parts_api.py::test_create_part_minimal`)
  - Nullable fields cleared shows empty seller_links (`tests/test_parts_api.py::test_update_part_nullable_fields_can_be_cleared`)
- Hooks: Standard fixtures, uses `session.expire_all()` for list test.
- Gaps: None.
- Evidence: `tests/test_parts_api.py` -- seller-related assertions updated in 6 tests

- Surface: AI Service (CHANGED -- seller removal)
- Scenarios:
  - Cleanup returns result without seller fields (`tests/test_ai_service.py::test_cleanup_part_returns_result_without_seller_fields`)
  - Cleanup resolves type only (no seller) (`tests/test_ai_service.py::test_cleanup_part_resolves_type`)
  - Service init without seller_service dependency (constructor tests updated)
  - Cached response fixtures no longer include seller fields
- Hooks: AI service fixture updated to remove `mock_seller_service` parameter.
- Gaps: None.
- Evidence: `tests/test_ai_service.py` -- ~20 occurrences of seller_service removed

- Surface: Shopping list line/service (CHANGED -- effective_seller removal)
- Scenarios:
  - Group ordering uses line.seller_id directly (`tests/services/test_shopping_list_line_service.py` -- seller tests updated to set seller_id on the line, not the part)
  - Seller grouping uses line.seller_id (`tests/services/test_shopping_list_service.py` -- tests updated)
  - Seller notes upsert (`tests/api/test_shopping_lists_api.py` -- updated to set seller_id on line)
- Hooks: Tests now create parts without seller_id and set seller_id directly on shopping list lines.
- Gaps: No tests for shopping list `seller_link` resolution (since feature is not implemented -- see Major finding).
- Evidence: `tests/services/test_shopping_list_line_service.py`, `tests/services/test_shopping_list_service.py`, `tests/api/test_shopping_list_lines_api.py`, `tests/api/test_shopping_lists_api.py`

- Surface: Seller service delete (CHANGED)
- Scenarios:
  - Delete seller with part_sellers entries raises InvalidOperationException (`tests/services/test_seller_service.py::test_delete_seller_with_associated_parts`)
  - Delete seller API with part_sellers entries returns 400 (`tests/api/test_seller_api.py` -- updated to use PartSeller instead of Part.seller_id)
- Hooks: Tests create PartSeller rows instead of setting seller_id on Part.
- Gaps: None.
- Evidence: `tests/services/test_seller_service.py`, `tests/api/test_seller_api.py`

- Surface: Test data loading (CHANGED)
- Scenarios:
  - Parts loaded without seller_id/seller_link, PartSeller rows created from seller_links array (`tests/test_test_data_service.py` -- updated assertions)
- Hooks: Standard test data service fixtures.
- Gaps: None.
- Evidence: `tests/test_test_data_service.py`

## 7) Adversarial Sweep

- Checks attempted: Derived state persistence, transaction/session safety, DI wiring, migration/test data integrity, observability, cascade behavior.
- Evidence: See entries below.
- Why code held up: The implementation follows established patterns consistently. Each adversarial check is documented.

**Adversarial check 1: Cascade delete consistency**

- Checks attempted: Part deletion should cascade to PartSeller rows; Seller deletion should cascade to PartSeller rows.
- Evidence: `app/models/part.py:81-83` -- `cascade="all, delete-orphan"` on Part.seller_links. `app/models/seller.py:21-23` -- `cascade="all, delete-orphan"` on Seller.part_sellers. `alembic/versions/021_create_part_sellers_table.py:46-49` -- FK constraints have `ondelete="CASCADE"`. However, note that `Seller.part_sellers` has `cascade="all, delete-orphan"` which means SQLAlchemy will delete the PartSeller rows via the ORM when a Seller is deleted through `session.delete()`. But `SellerService.delete_seller()` at `app/services/seller_service.py:109-124` explicitly checks for existing links and raises `InvalidOperationException` before deletion, so the cascade is a safety net.
- Why code held up: Both ORM-level and DB-level cascades are in place. The service-level guard prevents accidental deletion of sellers with active links.

**Adversarial check 2: Transaction safety in add_seller_link**

- Checks attempted: IntegrityError handling after flush, session rollback on conflict.
- Evidence: `app/services/part_seller_service.py:59-65` -- The try/except catches `IntegrityError`, calls `self.db.rollback()`, and raises `ResourceConflictException`. This follows the pattern established in `app/services/seller_service.py:37-44`.
- Why code held up: Rollback ensures the session is clean after an IntegrityError. The unique constraint on `(part_id, seller_id)` makes the duplicate detection reliable at the DB level.

**Adversarial check 3: Eager loading for seller_links serialization**

- Checks attempted: Whether the API list endpoint and detail endpoint properly load `PartSeller.seller` for serialization (needed for `seller_name` and `seller_website`).
- Evidence: `app/services/inventory_service.py:339` -- `selectinload(Part.seller_links).selectinload(PartSeller.seller)` for list endpoint. `app/services/part_service.py:101-102` -- same pattern for detail endpoint. `app/api/parts.py:102` -- accesses `ps.seller.name` and `ps.seller.website`.
- Why code held up: The chained selectinload ensures seller data is available without N+1 queries.

**Adversarial check 4: Migration data integrity**

- Checks attempted: Whether the migration correctly handles parts with null seller_id or null seller_link.
- Evidence: `alembic/versions/021_create_part_sellers_table.py:62-68` -- `WHERE seller_id IS NOT NULL AND seller_link IS NOT NULL`. This means parts with seller_id but null seller_link (STUV, BCEF, PQST in test data) are silently dropped, which matches the plan's documented acceptable data loss. The test data correctly has `"seller_links": []` for these parts.
- Why code held up: The WHERE clause is restrictive enough to prevent inserting rows with missing data. The downgrade path at lines 96-103 correctly reconstructs the original columns.

**Adversarial check 5: DI wiring completeness**

- Checks attempted: Whether `part_seller_service` is properly wired and all API modules that need it can receive it.
- Evidence: `app/services/container.py:136-141` -- `part_seller_service` Factory provider with `db=db_session, part_service=part_service, seller_service=seller_service`. `app/startup.py:95,115` -- blueprint registered. `app/api/part_seller_links.py:35` -- `Provide[ServiceContainer.part_seller_service]`. Container wires to `app.api` package in `app/__init__.py`.
- Why code held up: The wiring follows the exact same pattern as other services. The blueprint is registered on `api_bp` which ensures OIDC auth protection.

## 8) Invariants Checklist

- Invariant: Each (part_id, seller_id) pair appears at most once in `part_sellers`.
  - Where enforced: `app/models/part_seller.py:28-29` -- `UniqueConstraint("part_id", "seller_id", name="uq_part_sellers_part_seller")`. `alembic/versions/021_create_part_sellers_table.py:52`.
  - Failure mode: Concurrent INSERT requests could race. The DB constraint catches this; the service translates it to ResourceConflictException.
  - Protection: DB-level unique constraint + IntegrityError handling in `app/services/part_seller_service.py:59-65`.
  - Evidence: `tests/services/test_part_seller_service.py::test_add_seller_link_duplicate_raises_conflict`

- Invariant: Deleting a Part cascades to all its PartSeller rows.
  - Where enforced: `app/models/part.py:81-83` -- `cascade="all, delete-orphan"`. `alembic/versions/021_create_part_sellers_table.py:46` -- `ondelete="CASCADE"`.
  - Failure mode: If deletion bypasses ORM (raw SQL), only the FK cascade protects.
  - Protection: Both ORM cascade and FK cascade are configured. Tests in `tests/services/test_part_seller_service.py::test_part_seller_links_relationship` verify the relationship.
  - Evidence: `app/models/part_seller.py:17-18` -- FK with `ondelete="CASCADE"`.

- Invariant: A Seller cannot be deleted while it has associated PartSeller rows.
  - Where enforced: `app/services/seller_service.py:112-118` -- Checks `PartSeller.seller_id` before allowing deletion.
  - Failure mode: If the check were removed or bypassed, the FK cascade on Seller would delete PartSeller rows silently.
  - Protection: Service-level guard raises `InvalidOperationException`. `tests/services/test_seller_service.py::test_delete_seller_with_associated_parts` and `tests/api/test_seller_api.py` verify this behavior.
  - Evidence: `app/services/seller_service.py:112-118`

- Invariant: Shopping list line grouping uses `line.seller_id` directly (no Part.seller fallback).
  - Where enforced: `app/services/shopping_list_service.py:543-544` -- `seller_id = line.seller_id`. `app/services/shopping_list_line_service.py:525-536` -- WHERE clause uses only `ShoppingListLine.seller_id`.
  - Failure mode: If `effective_seller_id` were accidentally reintroduced, grouping would depend on stale Part data.
  - Protection: The `effective_seller_id` and `effective_seller` properties have been removed from the model (`app/models/shopping_list_line.py`). Tests verify grouping by line.seller_id.
  - Evidence: `tests/services/test_shopping_list_line_service.py` and `tests/services/test_shopping_list_service.py`

## 9) Questions / Needs-Info

- Question: Is the shopping list `seller_link` field intentionally deferred to a follow-up change, or was it accidentally omitted?
- Why it matters: The plan explicitly commits to this field (plan sections 3, 4, 5, and User Requirements Checklist item 16). The `PartSellerService.bulk_get_seller_links()` method was implemented but never wired into shopping list code paths, suggesting the infrastructure was prepared but the integration was not completed.
- Desired answer: Confirmation of whether to implement this in the current change or defer it with documentation.

## 10) Risks & Mitigations (top 3)

- Risk: Shopping list `seller_link` omission means the frontend cannot display product URLs on shopping list lines, reducing user utility for the procurement workflow.
- Mitigation: Implement the `seller_link` field in shopping list schemas and wire `bulk_get_seller_links()` into shopping list service before the frontend depends on this data.
- Evidence: Plan section 3 (Data Contracts) and section 5 (Algorithm), `app/schemas/shopping_list_line.py:59-108`

- Risk: "Override" terminology in schema descriptions may confuse frontend developers consuming the OpenAPI spec, leading to incorrect assumptions about seller_id behavior.
- Mitigation: Update descriptions in `app/schemas/shopping_list_line.py` and `app/schemas/part_shopping_list.py` to reflect that seller_id is the line's actual seller.
- Evidence: `app/schemas/shopping_list_line.py:22,43,74,143`, `app/schemas/part_shopping_list.py:50,104`

- Risk: The `bulk_get_seller_links()` method uses an IN-based cross-product query (`part_id IN (...) AND seller_id IN (...)`) followed by a Python-side filter against the requested pairs set. For large pair lists with many distinct part_ids and seller_ids, this could return more rows than necessary from the database.
- Mitigation: For a hobby inventory system this is not a practical concern. If scale ever becomes relevant, switch to a VALUES-based join or explicit tuple conditions.
- Evidence: `app/services/part_seller_service.py:127-134`

## 11) Confidence

Confidence: High -- The implementation is thorough, well-tested, and follows all project conventions. The two plan deviations are clearly identifiable and addressable without rework. The core refactoring (model, migration, service, API, AI removal, shopping list simplification, test data) is complete and correct.
