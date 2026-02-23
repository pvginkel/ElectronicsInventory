# Seller Links Refactor -- Plan Review

## 1) Summary & Decision

**Readiness**

The plan is well-researched and comprehensive. It accurately maps the affected areas, quotes specific line ranges, and covers the full breadth of changes required -- model, migration, service, schema, API, AI pipeline, shopping list simplification, test data, and tests. The file map is exhaustive (94 occurrences across 15 test files noted at plan line 224), the data model contracts are precise, and the implementation slices form a sound dependency chain. The initial review identified four findings (two Major, two Minor); all four have been resolved directly in the plan. The plan now explicitly covers eager load updates in shopping list services, correct blueprint registration in `startup.py`, the inline `serialize_part()` helper in AI cleanup, and service-layer seller_link resolution with bulk lookup details.

**Decision**

`GO` -- All review findings have been addressed in the plan. The plan is implementation-ready.

---

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `CLAUDE.md` (layered architecture) -- Pass -- `plan.md:108-225` -- API endpoints delegate to service; service contains business logic; models are declarative. The plan correctly places the new `PartSellerService` in the service layer and a new blueprint in the API layer.
- `CLAUDE.md` (no backwards compat / BFF pattern) -- Pass -- `plan.md:73-76` -- "BFF pattern: breaking API changes are acceptable since frontend updates are coordinated." Aligns with CLAUDE.md: "Make breaking changes freely; no backwards compatibility needed."
- `CLAUDE.md` (testing requirements) -- Pass -- `plan.md:543-638` -- Comprehensive test plan covering service, API, model cascade, test data loading, and shopping list scenarios. Every new/changed surface has explicit Given/When/Then scenarios.
- `CLAUDE.md` (migration numbering) -- Pass -- `plan.md:130-132` -- Correctly identifies latest migration as `020_create_attachment_sets.py` and plans migration as `021`.
- `CLAUDE.md` (native_enum=False) -- Pass -- No new enums are introduced; the `PartSeller` model uses only integer PKs, FKs, varchar, and timestamps.
- `docs/product_brief.md` (seller model) -- Pass -- `product_brief.md:51` says "Seller and seller product page link (single set; you can update it)." The plan intentionally upgrades this to a many-to-many, which is a product evolution. The brief is descriptive rather than prescriptive, and the refactor enriches functionality (multiple sellers per part).
- `CLAUDE.md` (no tombstones) -- Pass -- `plan.md:58` explicitly calls for removing seller fields from Part model and all downstream schemas. No shims, re-exports, or stubs proposed.

**Fit with codebase**

- `app/models/__init__.py` -- `plan.md:126-128` -- Plan correctly identifies the need to register `PartSeller` for Alembic discovery. Note: `Seller` itself is NOT in `__init__.py` (only imported transitively via `ShoppingListSellerNote`), so the plan should ensure `PartSeller` is explicitly imported.
- `app/services/container.py` -- `plan.md:186-188` -- Plan correctly identifies the need to add `part_seller_service` Factory and remove `seller_service` from `ai_service`. The existing container at `container.py:328-342` shows `seller_service=seller_service` in the `ai_service` provider.
- `app/services/part_service.py:137-149` (`update_part_details`) -- Note -- The `update_part_details` method uses `setattr` to apply arbitrary field updates from `PartUpdateSchema`. Once `seller_id` and `seller_link` are removed from `PartUpdateSchema`, Pydantic will no longer parse them, so the passthrough is automatically safe. The implementer should verify this during testing.
- `app/services/shopping_list_service.py:493-517` (`_load_list_with_lines`) -- RESOLVED -- The plan now explicitly addresses removing `selectinload(Part.seller)` from `_load_list_with_lines()` at line 500 (plan line 182-184). The `set_group_ordered()` eager load at `shopping_list_line_service.py:547` is also now addressed (plan line 178-180).
- `app/startup.py:64-119` -- RESOLVED -- The plan now correctly references `app/startup.py:register_blueprints()` for blueprint registration (plan line 198-200), following the existing pattern.

---

## 3) Open Questions & Ambiguities

- Question: Should `PartSeller.link` be nullable or NOT NULL?
- Why it matters: The plan states `link: varchar(500) NOT NULL` at line 237, but the migration data transfer at line 378 only copies rows where `seller_link IS NOT NULL`. Parts with a `seller_id` but NULL `seller_link` would be dropped. If a user has seller associations without URLs, those relationships are lost. The brief says "acceptable data loss" (line 74), but the implementer needs to know this is a conscious decision.
- Needed answer: Confirm that `link` is required (NOT NULL) on the new table, meaning seller-link-less associations are intentionally not migrated.

- Question: RESOLVED -- How does the shopping list service compute `seller_link` in practice?
- Resolution: The plan now explicitly specifies (plan line 387-393) that seller_link resolution is performed in the **service layer**, consistent with the project's pattern of avoiding `@computed_field` for ORM integration. A bulk lookup approach is described to avoid N+1. The container wiring entry (plan line 186-188) also notes that `part_seller_service` must be injected into the shopping list services.

- Question: RESOLVED -- Blueprint registration location.
- Resolution: The plan now correctly references `app/startup.py:register_blueprints()` (plan line 198-200) instead of `app/api/__init__.py`.

---

## 4) Deterministic Backend Coverage (new/changed behavior only)

- Behavior: `POST /parts/<part_key>/seller-links` (new endpoint)
- Scenarios:
  - Given valid part and seller, When POSTing link, Then 201 with PartSellerLinkSchema response
  - Given invalid part_key, When POSTing, Then 404
  - Given invalid seller_id, When POSTing, Then 404
  - Given duplicate (part_id, seller_id), When POSTing, Then 409
  - Given missing required fields, When POSTing, Then 422
- Instrumentation: No new metrics (standard Flask request logging per plan line 493).
- Persistence hooks: Migration 021 creates table; test data `part_sellers.json` seeded; DI container wired with `part_seller_service`.
- Gaps: None.
- Evidence: `plan.md:559-568`.

- Behavior: `DELETE /parts/<part_key>/seller-links/<seller_link_id>` (new endpoint)
- Scenarios:
  - Given existing seller link, When DELETing, Then 204
  - Given non-existent seller_link_id, When DELETing, Then 404
  - Given seller_link_id belonging to different part, When DELETing, Then 404
- Instrumentation: None planned.
- Persistence hooks: Same as above.
- Gaps: None.
- Evidence: `plan.md:570-577`.

- Behavior: Shopping list seller_link resolution
- Scenarios:
  - Given line with seller_id matching a part_sellers entry, When serializing, Then seller_link is the URL
  - Given line with seller_id NOT matching any part_sellers entry, When serializing, Then seller_link is None
  - Given line without seller_id, When serializing, Then seller_link is None
- Instrumentation: None planned.
- Persistence hooks: Depends on `part_sellers` table being populated.
- Gaps: Plan does not specify where the N+1-avoiding bulk lookup is implemented. The test plan at `plan.md:606-614` covers the scenarios but does not describe a test for the bulk optimization path.
- Evidence: `plan.md:386-393`, `plan.md:606-614`.

- Behavior: SellerService.delete_seller (changed check)
- Scenarios:
  - Given seller with part_sellers entries, When deleting, Then InvalidOperationException
  - Given seller with no part_sellers entries, When deleting, Then seller is deleted
- Instrumentation: None planned.
- Persistence hooks: None beyond migration.
- Gaps: None. The plan also needs to account for the `ON DELETE CASCADE` on `part_sellers.seller_id` -- if cascade is set, the DB would happily delete associated `part_sellers` rows, making the service-level check necessary to prevent silent data loss.
- Evidence: `plan.md:625-631`.

- Behavior: AI analysis/cleanup seller field removal
- Scenarios:
  - Given AI analysis result, When analysis completes, Then no seller/seller_link fields
  - Given AI cleanup result, When cleanup completes, Then no seller/seller_link fields
  - Given cached AI response with seller fields, When loading cache, Then validation fails (extra="forbid" on PartAnalysisSuggestion)
- Instrumentation: Existing AI metrics unchanged.
- Persistence hooks: Cached response fixtures must be updated to remove seller fields.
- Gaps: The plan identifies this risk at line 687-689 but does not list the specific cached fixture file paths. The test plan mentions "cached response JSON updated" at line 602 but no explicit test for the stale-cache-rejection scenario.
- Evidence: `plan.md:597-604`, `plan.md:687-689`.

---

## 5) Adversarial Sweep

**RESOLVED Major -- Missing eager load updates in shopping list service**

**Evidence:** The original plan did not mention `_load_list_with_lines()` at `app/services/shopping_list_service.py:498-506` which eager-loads `selectinload(Part.seller)`, or `set_group_ordered()` at `shopping_list_line_service.py:547` which does the same.

**Resolution:** The plan has been updated. The `shopping_list_service.py` entry (plan line 182-184) now explicitly calls out removing `selectinload(Part.seller)` from `_load_list_with_lines()` at line 500. The `shopping_list_line_service.py` entry (plan line 178-180) now explicitly calls out removing the eager load from `set_group_ordered()` at line 547. Risk is closed.

---

**RESOLVED Major -- Blueprint registration in wrong file**

**Evidence:** The original plan listed `app/api/__init__.py` as the registration location. All domain blueprints are actually registered in `app/startup.py:register_blueprints()`.

**Resolution:** The plan has been updated. The affected area entry now correctly references `app/startup.py:register_blueprints()` (plan line 198-200). Risk is closed.

---

**Minor -- `Seller` model not in `app/models/__init__.py` affects PartSeller discovery**

**Evidence:** The plan states at line 126-128 that `PartSeller` must be registered in `app/models/__init__.py` for Alembic discovery. This is correct. However, `Seller` itself is also not directly imported in `__init__.py` (only imported transitively). Since `PartSeller` will import `Seller` via its foreign key relationship, the transitive import chain will work. No action needed, but worth noting during implementation that the `PartSeller` import in `__init__.py` is sufficient.

**Why it matters:** Low risk; just a clarification for the implementer.

**Fix suggestion:** None required, but the plan could note this for completeness.

**Confidence:** High

---

**RESOLVED Minor -- `cleanup_part` serializes seller data from Part before AI call**

**Evidence:** The original plan did not explicitly call out the `serialize_part()` inline helper at `ai_service.py:329-330` or the `selectinload(Part.seller)` at `ai_service.py:285,295`.

**Resolution:** The plan has been updated. The `ai_service.py` entry (plan line 158-160) now explicitly lists the `serialize_part()` helper lines and the cleanup query eager loads. Risk is closed.

---

## 6) Derived-Value & Persistence Invariants

- Derived value: `seller_links` list on Part response
  - Source dataset: Unfiltered `part_sellers` rows for the given `part_id`, eager-loaded via `Part.seller_links` relationship.
  - Write / cleanup triggered: Adding/removing `PartSeller` rows via new endpoints. CASCADE delete when Part or Seller is deleted from DB.
  - Guards: Unique constraint on `(part_id, seller_id)` prevents duplicates. FK constraints ensure referential integrity. Service-level validation of part and seller existence before INSERT.
  - Invariant: Each `(part_id, seller_id)` pair appears at most once in `part_sellers`. Every `PartSeller` row references valid `parts.id` and `sellers.id`.
  - Evidence: `plan.md:230-243`, `plan.md:409-414`.

- Derived value: `seller_link` URL on ShoppingListLine response
  - Source dataset: Filtered lookup in `part_sellers` matching `(line.part_id, line.seller_id)`.
  - Write / cleanup triggered: No writes; read-only derivation. If the `PartSeller` row is deleted, the value becomes None on next read.
  - Guards: Lookup only performed when `line.seller_id IS NOT NULL` and `line.part_id IS NOT NULL`. Returns None when no matching row exists.
  - Invariant: The `seller_link` is always consistent with the current `part_sellers` state at query time -- no stale caching.
  - Evidence: `plan.md:416-421`.

- Derived value: Seller group membership in Ready view
  - Source dataset: `ShoppingListLine.seller_id` directly (after refactor, no filtered fallback through `Part.seller_id`).
  - Write / cleanup triggered: Group structure is ephemeral -- computed per request, not persisted.
  - Guards: The refactor eliminates the filtered-view risk that previously existed with `effective_seller_id` falling back to `Part.seller_id`. Now grouping depends solely on the line's own `seller_id`, which is a stable, unfiltered source.
  - Invariant: A line belongs to exactly one seller group based on its `seller_id` (or "ungrouped" if None). No cross-entity derivation.
  - Evidence: `plan.md:423-428`, `app/services/shopping_list_service.py:538-581`.

---

## 7) Risks & Mitigations (top 3)

- Risk: Shopping list eager loads referencing `Part.seller` will crash after the relationship is removed. Multiple codepaths in `shopping_list_service.py` and `shopping_list_line_service.py` use `selectinload(Part.seller)`.
- Mitigation: Audit all `selectinload(Part.seller)` references across the codebase before implementation. Replace with `selectinload(Part.seller_links)` where seller link data is needed, or remove where it is no longer needed.
- Evidence: `app/services/shopping_list_service.py:500`, `app/services/shopping_list_line_service.py:547`, `app/services/ai_service.py:285`.

- Risk: Stale AI response cache files containing seller fields will fail validation due to `extra="forbid"` on `PartAnalysisSuggestion` model (`app/services/ai_model.py:74`).
- Mitigation: The plan identifies this at `plan.md:687-689`. Update all cached response fixtures during implementation. Consider adding a test that attempts to load a response with seller fields to verify validation rejects it.
- Evidence: `plan.md:687-689`, `app/services/ai_model.py:74`.

- Risk: Shopping list lines previously grouped via `effective_seller_id` (falling back to `Part.seller_id`) will lose their grouping after the refactor, potentially confusing users with existing shopping lists.
- Mitigation: The plan documents this at `plan.md:683-685` and explicitly decides against a data migration. This is acceptable since the line's `seller_id` is the authoritative source going forward, and the BFF pattern allows coordinated frontend updates.
- Evidence: `plan.md:683-685`.

---

## 8) Confidence

Confidence: High -- The plan is thorough, well-evidenced, and covers the full scope of changes. All identified gaps from the initial review have been resolved directly in the plan. A competent developer can implement this plan as written.
