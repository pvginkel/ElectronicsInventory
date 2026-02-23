# Seller Links Refactor -- Technical Plan

## 0) Research Log & Findings

### Areas Researched

**Part model and seller relationship.** The `Part` model (`app/models/part.py:48-51`) stores `seller_id` (FK to `sellers.id`) and `seller_link` (varchar 500) directly. The `Seller` model (`app/models/seller.py:22`) has a `parts` back-populates relationship. The `PartService.create_part()` (`app/services/part_service.py:44-98`) accepts both `seller_id` and `seller_link` parameters and writes them to the Part row.

**Part schemas.** `PartCreateSchema` (`app/schemas/part.py:57-67`), `PartUpdateSchema` (`app/schemas/part.py:163-173`), `PartResponseSchema` (`app/schemas/part.py:269-276`), and `PartWithTotalSchema` (`app/schemas/part.py:420-427`) all include `seller`/`seller_id`/`seller_link` fields. The list endpoint helper `_convert_part_to_schema_data()` (`app/api/parts.py:98-135`) manually serializes the seller relationship and seller_link.

**AI analysis pipeline.** `PartAnalysisDetailsSchema` (`app/schemas/ai_part_analysis.py:122-153`) includes `seller`, `seller_link`, `seller_is_existing`, and `existing_seller_id`. `AIPartCreateSchema` (`app/schemas/ai_part_analysis.py:289-299`) includes `seller_id` and `seller_link`. `CleanedPartDataSchema` (`app/schemas/ai_part_cleanup.py:107-140`) includes `seller`, `seller_link`, `seller_is_existing`, `existing_seller_id`. The LLM response model `PartAnalysisDetails` (`app/services/ai_model.py:49-60`) has `seller` and `seller_url` fields. `AIService._resolve_seller()` (`app/services/ai_service.py:489-520`) resolves seller names against existing sellers. `AIService.analyze_part()` calls `_resolve_seller()` at line 221 and populates seller fields at lines 247-252. `AIService.cleanup_part()` calls `_resolve_seller()` at line 414 and populates seller fields at lines 435-439.

**Prompt template.** The Mouser seller guidance section in `app/services/prompts/part_analysis.md:83-93` instructs the LLM to set `seller` to "Mouser" and `seller_url` to the Mouser product page URL. This section must be removed.

**Shopping list line model.** `ShoppingListLine` (`app/models/shopping_list_line.py:118-131`) has `effective_seller_id` and `effective_seller` properties that fall back to `part.seller_id` / `part.seller` when the line's own `seller_id` is None.

**Shopping list line schemas.** `ShoppingListLineListSchema` (`app/schemas/shopping_list_line.py:90-93`) exposes `effective_seller_id`. `ShoppingListLineResponseSchema` (`app/schemas/shopping_list_line.py:148-152`) exposes `effective_seller`. Create/update schemas describe `seller_id` as "optional seller override".

**Shopping list service seller grouping.** `ShoppingListService._build_seller_groups()` (`app/services/shopping_list_service.py:538-579`) uses `line.effective_seller_id` and `line.effective_seller` to group lines. `ShoppingListLineService.set_group_ordered()` (`app/services/shopping_list_line_service.py:522-542`) uses `Part.seller_id` in its WHERE clause for the `effective_seller` fallback.

**Seller service delete check.** `SellerService.delete_seller()` (`app/services/seller_service.py:100-124`) checks `Part.seller_id` to prevent deletion of sellers with associated parts. This must be updated to check `part_sellers` instead.

**Test data.** `app/data/test_data/parts.json` includes `seller_id` and `seller_link` on many parts. `app/data/test_data/shopping_list_lines.json` includes `seller_id` on some lines. `app/services/test_data_service.py:179-202` loads seller_id/seller_link from part data.

**Alembic migrations.** Current latest is `020_create_attachment_sets.py`. New migration will be `021`.

### Key Conflicts and Resolutions

**Seller grouping in shopping lists.** The `effective_seller` pattern currently merges `line.seller_id` with `part.seller_id` for grouping. After this refactor, `line.seller_id` IS the seller (no fallback). The grouping logic in `_build_seller_groups()` must be simplified to use only `line.seller_id`. The `set_group_ordered()` WHERE clause that references `Part.seller_id` must be simplified too.

**Seller link URL in shopping list responses.** The change brief requires returning a `seller_link` URL when a matching `part_sellers` record exists for the line's `(part_id, seller_id)` combination. This is a new lookup that replaces the old direct access to `part.seller_link`.

**AI create endpoint.** `POST /ai-parts/create` currently passes `seller_id` and `seller_link` from `AIPartCreateSchema` to `part_service.create_part()`. After removal from the schema, this endpoint will no longer set seller info on parts. Users will add seller links separately via the new `POST /parts/<part_id>/seller-links` endpoint.

---

## 1) Intent & Scope

**User intent**

Refactor the parts-seller relationship from a single-seller-per-part model stored directly on the `parts` table to a many-to-many link table (`part_sellers`) that supports multiple sellers per part, each with their own product URL. Simultaneously remove seller auto-population from AI analysis/cleanup flows, and simplify the shopping list's "effective seller" override pattern so that the line's seller is the actual seller rather than a fallback override.

**Prompt quotes**

"Create a link table between parts and sellers that stores the seller-specific product URL"

"Remove all seller-related fields and logic from AI Part Creation, AI Part Cleanup, and Shared _resolve_seller() method"

"seller_id on ShoppingListLine is THE seller, not an override. Remove the effective_seller_id / effective_seller fallback pattern"

"Return seller link URL in shopping list get/list endpoints when a matching part_sellers record exists for the line's (part_id, seller_id) combination"

**In scope**

- New `part_sellers` table with migration (create table, migrate data, drop columns)
- New `PartSeller` SQLAlchemy model
- `POST /parts/<part_id>/seller-links` and `DELETE /parts/<part_id>/seller-links/<seller_link_id>` endpoints
- Remove seller fields from Part model, Part schemas, AI schemas, AI model, AI service, and AI prompt
- Simplify shopping list line model/schema/service to remove effective_seller fallback
- Add seller_link URL to shopping list line responses via part_sellers lookup
- Update seller service delete check to use part_sellers instead of Part.seller_id
- Update seller grouping in shopping list service
- Update all affected tests and test data files

**Out of scope**

- Seller CRUD endpoints (sellers API stays unchanged apart from the delete check)
- Frontend implementation (documented separately in frontend_impact.md if needed)
- Shopping list seller notes (the `ShoppingListSellerNote` model and schema are unaffected; they reference `seller_id` directly and do not depend on Part.seller_id)

**Assumptions / constraints**

- BFF pattern: breaking API changes are acceptable since frontend updates are coordinated.
- Existing `(seller_id, seller_link)` pairs on parts where either is NULL are acceptable data loss during migration.
- The `part_sellers` table uses a single seller per part constraint (unique on part_id + seller_id) but allows multiple sellers per part.
- No backwards compatibility shims are needed.

---

## 1a) User Requirements Checklist

**User Requirements Checklist**

- [ ] Create `part_sellers` table with `id`, `part_id` (FK), `seller_id` (FK), `link` (URL), `created_at`
- [ ] Add unique index on `(part_id, seller_id)` in the `part_sellers` table
- [ ] Create Alembic migration that: (a) creates the new table, (b) migrates existing non-null (seller_id, seller_link) pairs from parts, (c) drops seller_id and seller_link from parts
- [ ] Drop combinations where seller_id OR seller_link is None during migration (acceptable data loss)
- [ ] Remove `seller_id` and `seller_link` columns from the Part model
- [ ] Remove seller fields from AI part creation schemas: `PartAnalysisDetailsSchema` (seller, seller_link, seller_is_existing, existing_seller_id), `AIPartCreateSchema` (seller_id, seller_link)
- [ ] Remove seller fields from AI part cleanup schema: `CleanedPartDataSchema` (seller, seller_link, seller_is_existing, existing_seller_id)
- [ ] Remove `seller` and `seller_url` from LLM response model `PartAnalysisDetails` in `ai_model.py`
- [ ] Remove `_resolve_seller()` method from `AIService`
- [ ] Remove seller resolution logic from `AIService.analyze_part()` and `AIService.cleanup_part()`
- [ ] Update AI prompt template `part_analysis.md` to remove seller-related instructions (Mouser seller guidance section)
- [ ] Create `POST /parts/<part_id>/seller-links` endpoint (body: seller_id, link)
- [ ] Create `DELETE /parts/<part_id>/seller-links/<seller_link_id>` endpoint
- [ ] Return seller links as a list in `GET /parts/<id>` and `GET /parts` response schemas
- [ ] Remove `effective_seller_id` and `effective_seller` properties from `ShoppingListLine` model
- [ ] Shopping list line `seller_id` is THE seller (not an override) -- remove override terminology/comments
- [ ] Return seller link URL in shopping list get/list endpoints when a matching `part_sellers` record exists for the line's (part_id, seller_id)
- [ ] Update Part schemas (create, update, response, list) to remove seller_id/seller_link and add seller_links
- [ ] Update shopping list line schemas to remove effective_seller pattern and add seller_link field
- [ ] Update all affected tests (service tests, API tests)
- [ ] Update test data files in `app/data/test_data/` to reflect schema changes

---

## 2) Affected Areas & File Map

- Area: `app/models/part_seller.py` (NEW)
- Why: New `PartSeller` SQLAlchemy model for the `part_sellers` link table.
- Evidence: Change brief section 1 specifies `id`, `part_id`, `seller_id`, `link`, `created_at` columns.

- Area: `app/models/part.py`
- Why: Remove `seller_id`, `seller_link` columns and `seller` relationship. Add `seller_links` relationship to `PartSeller`.
- Evidence: `app/models/part.py:48-51` (seller_id, seller_link columns), `app/models/part.py:85-87` (seller relationship).

- Area: `app/models/seller.py`
- Why: Remove `parts` back-populates relationship (replaced by `part_sellers`). Add `part_sellers` relationship.
- Evidence: `app/models/seller.py:22` (`parts: Mapped[list["Part"]]`).

- Area: `app/models/shopping_list_line.py`
- Why: Remove `effective_seller_id` and `effective_seller` properties. Update comments to remove "override" terminology.
- Evidence: `app/models/shopping_list_line.py:117-131` (effective_seller_id, effective_seller properties).

- Area: `app/models/__init__.py`
- Why: Register new `PartSeller` model for Alembic discovery.
- Evidence: `app/models/__init__.py:1-45` (model import registry).

- Area: `alembic/versions/021_create_part_sellers_table.py` (NEW)
- Why: Migration to create `part_sellers` table, migrate data, drop old columns.
- Evidence: Latest migration is `020_create_attachment_sets.py`.

- Area: `app/schemas/part.py`
- Why: Remove `seller_id`/`seller_link` from `PartCreateSchema` and `PartUpdateSchema`. Replace `seller`/`seller_link` with `seller_links` list in `PartResponseSchema` and `PartWithTotalSchema`.
- Evidence: `app/schemas/part.py:57-67` (create), `app/schemas/part.py:163-173` (update), `app/schemas/part.py:269-276` (response), `app/schemas/part.py:420-427` (list with total).

- Area: `app/schemas/part_seller.py` (NEW)
- Why: New Pydantic schemas for `PartSeller` create request and response.
- Evidence: Change brief section 3 specifies `POST` body `{seller_id, link}`.

- Area: `app/schemas/ai_part_analysis.py`
- Why: Remove seller fields from `PartAnalysisDetailsSchema` and `AIPartCreateSchema`.
- Evidence: `app/schemas/ai_part_analysis.py:122-153` (PartAnalysisDetailsSchema seller fields), `app/schemas/ai_part_analysis.py:289-299` (AIPartCreateSchema seller fields).

- Area: `app/schemas/ai_part_cleanup.py`
- Why: Remove seller fields from `CleanedPartDataSchema`.
- Evidence: `app/schemas/ai_part_cleanup.py:107-140` (seller, seller_link, seller_is_existing, existing_seller_id).

- Area: `app/schemas/shopping_list_line.py`
- Why: Remove `effective_seller_id` from `ShoppingListLineListSchema`, remove `effective_seller` from `ShoppingListLineResponseSchema`, add `seller_link` field, update "override" descriptions.
- Evidence: `app/schemas/shopping_list_line.py:90-93` (effective_seller_id), `app/schemas/shopping_list_line.py:148-152` (effective_seller).

- Area: `app/services/ai_model.py`
- Why: Remove `seller` and `seller_url` from `PartAnalysisDetails`.
- Evidence: `app/services/ai_model.py:59-60` (seller, seller_url fields).

- Area: `app/services/ai_service.py`
- Why: Remove `_resolve_seller()` method, remove seller resolution from `analyze_part()` and `cleanup_part()`, remove seller fields from schema construction, remove `seller_service` dependency. Also remove seller fields from the inline `serialize_part()` helper inside `cleanup_part()` (lines 329-330: `"seller": part.seller.name ...` and `"seller_link": part.seller_link`), and remove `selectinload(Part.seller)` from the cleanup queries (lines 285 and 295).
- Evidence: `app/services/ai_service.py:489-520` (_resolve_seller), `app/services/ai_service.py:221-252` (analyze_part seller usage), `app/services/ai_service.py:411-439` (cleanup_part seller usage), `app/services/ai_service.py:53` (seller_service import in __init__), `app/services/ai_service.py:285,295` (selectinload Part.seller in cleanup queries), `app/services/ai_service.py:329-330` (serialize_part seller fields).

- Area: `app/services/prompts/part_analysis.md`
- Why: Remove the Mouser seller guidance section (lines 83-93) instructing the LLM to set seller/seller_url.
- Evidence: `app/services/prompts/part_analysis.md:83-93` (seller vs product page section).

- Area: `app/services/part_service.py`
- Why: Remove `seller_id` and `seller_link` parameters from `create_part()`. Remove `selectinload(Part.seller)` from `get_part()`.
- Evidence: `app/services/part_service.py:52-53` (seller params in create_part), `app/services/part_service.py:104` (selectinload Part.seller in get_part).

- Area: `app/services/part_seller_service.py` (NEW)
- Why: New service for creating and deleting part-seller links, and for looking up seller_link by (part_id, seller_id).
- Evidence: Change brief section 3 (new endpoints), section 4 (seller link lookup for shopping lists).

- Area: `app/services/seller_service.py`
- Why: Update `delete_seller()` to check `part_sellers` table instead of `Part.seller_id`.
- Evidence: `app/services/seller_service.py:112-115` (Part.seller_id check in delete_seller).

- Area: `app/services/shopping_list_line_service.py`
- Why: Simplify `set_group_ordered()` WHERE clause to use only `ShoppingListLine.seller_id` (no Part.seller_id fallback). Remove `selectinload(Part.seller)` eager load from `set_group_ordered()` (line 547) since `Part.seller` relationship will no longer exist. Simplify `_get_line()` to no longer need Part.seller eager load.
- Evidence: `app/services/shopping_list_line_service.py:522-542` (set_group_ordered seller grouping), `app/services/shopping_list_line_service.py:547` (selectinload Part.seller in set_group_ordered).

- Area: `app/services/shopping_list_service.py`
- Why: Simplify `_build_seller_groups()` to use `line.seller_id` directly instead of `line.effective_seller_id`/`line.effective_seller`. Simplify `upsert_seller_note()` WHERE clause. Add seller_link lookup from part_sellers. Remove `selectinload(Part.seller)` from `_load_list_with_lines()` (line 500) since `Part.seller` relationship will no longer exist -- replace with `selectinload(Part.seller_links)` if seller link data is needed for response serialization, or remove if not needed.
- Evidence: `app/services/shopping_list_service.py:551` (effective_seller_id usage), `app/services/shopping_list_service.py:338-341` (Part.seller_id fallback in upsert_seller_note), `app/services/shopping_list_service.py:500` (selectinload Part.seller in _load_list_with_lines).

- Area: `app/services/container.py`
- Why: Add `part_seller_service` Factory provider. Remove `seller_service` dependency from `ai_service`. Wire `part_seller_service` into `shopping_list_service` and/or `shopping_list_line_service` for the seller_link bulk lookup needed in list/detail responses.
- Evidence: `app/services/container.py:328-342` (ai_service provider with seller_service), `app/services/container.py:134` (seller_service provider), `app/services/container.py:137-140` (shopping_list_service provider), `app/services/container.py:216-221` (shopping_list_line_service provider).

- Area: `app/api/parts.py`
- Why: Remove seller serialization from `_convert_part_to_schema_data()`. Add seller_links serialization. Remove `seller_id`/`seller_link` from `create_part()` call.
- Evidence: `app/api/parts.py:98-135` (_convert_part_to_schema_data), `app/api/parts.py:150-162` (create_part call).

- Area: `app/api/part_seller_links.py` (NEW)
- Why: New blueprint with `POST /parts/<part_id>/seller-links` and `DELETE /parts/<part_id>/seller-links/<seller_link_id>` endpoints.
- Evidence: Change brief section 3.

- Area: `app/startup.py`
- Why: Register the new `part_seller_links_bp` blueprint in `register_blueprints()`. All domain blueprints are registered here, not in `app/api/__init__.py`.
- Evidence: `app/startup.py:86-119` (domain blueprint registration in `register_blueprints()`).

- Area: `app/api/ai_parts.py`
- Why: Remove `seller_id`/`seller_link` from the `create_part_from_ai_analysis()` call.
- Evidence: `app/api/ai_parts.py:158-159` (seller_id, seller_link passed to create_part).

- Area: `app/services/inventory_service.py`
- Why: Remove `selectinload(Part.seller)` from `get_all_parts_with_totals()`. Add `selectinload(Part.seller_links)` instead.
- Evidence: `app/services/inventory_service.py:337-338` (selectinload Part.seller).

- Area: `app/services/test_data_service.py`
- Why: Update part loading to not write seller_id/seller_link on Part, instead create `PartSeller` rows. Add new test data for `part_sellers`.
- Evidence: `app/services/test_data_service.py:179-202` (seller_id/seller_link loading).

- Area: `app/data/test_data/parts.json`
- Why: Remove `seller_id` and `seller_link` fields from part data entries.
- Evidence: `app/data/test_data/parts.json:16-17` (seller_id, seller_link on first part).

- Area: `app/data/test_data/part_sellers.json` (NEW)
- Why: New test data file for part_sellers rows extracted from existing part seller data.
- Evidence: Test data pattern in `app/data/test_data/`.

- Area: Tests (multiple files)
- Why: Update all test files referencing seller_id/seller_link on parts, effective_seller, AI seller fields.
- Evidence: 94 occurrences across 15 test files.

---

## 3) Data Model / Contracts

- Entity / contract: `part_sellers` table (NEW)
- Shape:
  ```
  part_sellers
  ├── id: integer PK autoincrement
  ├── part_id: integer FK -> parts.id (NOT NULL, ON DELETE CASCADE)
  ├── seller_id: integer FK -> sellers.id (NOT NULL, ON DELETE CASCADE)
  ├── link: varchar(500) NOT NULL
  ├── created_at: timestamp NOT NULL DEFAULT now()
  └── UNIQUE(part_id, seller_id)
  ```
- Refactor strategy: New table; no backwards compatibility needed. Migration creates table, copies data, drops old columns atomically.
- Evidence: Change brief section 1.

- Entity / contract: `parts` table (CHANGED -- columns removed)
- Shape: Remove `seller_id` (FK) and `seller_link` (varchar 500) columns.
- Refactor strategy: Destructive migration after data copy. BFF pattern allows breaking changes.
- Evidence: `app/models/part.py:48-51`.

- Entity / contract: `PartSeller` SQLAlchemy model (NEW)
- Shape:
  ```python
  class PartSeller(db.Model):
      id: Mapped[int]  # PK
      part_id: Mapped[int]  # FK parts.id, cascade delete
      seller_id: Mapped[int]  # FK sellers.id, cascade delete
      link: Mapped[str]  # varchar(500)
      created_at: Mapped[datetime]  # server_default=func.now()
      # Relationships
      part: Mapped[Part]
      seller: Mapped[Seller]
  ```
- Refactor strategy: Direct model creation; no legacy to handle.
- Evidence: Change brief section 1.

- Entity / contract: `PartResponseSchema` / `PartWithTotalSchema` (CHANGED)
- Shape: Remove `seller: SellerListSchema | None` and `seller_link: str | None`. Add `seller_links: list[PartSellerLinkSchema]` where each entry is `{id, seller_id, seller_name, seller_website, link, created_at}`.
- Refactor strategy: Breaking API change; frontend will be updated in parallel.
- Evidence: `app/schemas/part.py:269-276`.

- Entity / contract: `PartCreateSchema` / `PartUpdateSchema` (CHANGED)
- Shape: Remove `seller_id: int | None` and `seller_link: str | None`.
- Refactor strategy: Seller links are now managed via dedicated endpoints, not part create/update.
- Evidence: `app/schemas/part.py:57-67`, `app/schemas/part.py:163-173`.

- Entity / contract: `PartAnalysisDetailsSchema` (CHANGED)
- Shape: Remove `seller`, `seller_link`, `seller_is_existing`, `existing_seller_id` fields.
- Refactor strategy: AI no longer suggests sellers.
- Evidence: `app/schemas/ai_part_analysis.py:122-153`.

- Entity / contract: `AIPartCreateSchema` (CHANGED)
- Shape: Remove `seller_id` and `seller_link` fields.
- Refactor strategy: Parts created from AI no longer include seller info.
- Evidence: `app/schemas/ai_part_analysis.py:289-299`.

- Entity / contract: `CleanedPartDataSchema` (CHANGED)
- Shape: Remove `seller`, `seller_link`, `seller_is_existing`, `existing_seller_id` fields.
- Refactor strategy: AI cleanup no longer touches seller data.
- Evidence: `app/schemas/ai_part_cleanup.py:107-140`.

- Entity / contract: `PartAnalysisDetails` LLM model (CHANGED)
- Shape: Remove `seller: str | None` and `seller_url: str | None`.
- Refactor strategy: LLM no longer asked for seller info.
- Evidence: `app/services/ai_model.py:59-60`.

- Entity / contract: `ShoppingListLineListSchema` (CHANGED)
- Shape: Remove `effective_seller_id`. Add `seller_link: str | None` field.
- Refactor strategy: No effective_seller pattern; seller_id on line is the real seller.
- Evidence: `app/schemas/shopping_list_line.py:90-93`.

- Entity / contract: `ShoppingListLineResponseSchema` (CHANGED)
- Shape: Remove `effective_seller: SellerListSchema | None`. Add `seller_link: str | None`.
- Refactor strategy: Seller is the line's own seller; link comes from part_sellers lookup.
- Evidence: `app/schemas/shopping_list_line.py:148-152`.

---

## 4) API / Integration Surface

- Surface: `POST /api/parts/<part_id>/seller-links` (NEW)
- Inputs: JSON body `{seller_id: int, link: str}`. Path param `part_id` (integer, the Part PK obtained from the part key).
- Outputs: 201 with `PartSellerLinkSchema` response `{id, seller_id, seller_name, seller_website, link, created_at}`.
- Errors: 404 if part or seller not found. 409 if (part_id, seller_id) already exists.
- Evidence: Change brief section 3.

Note: The URL uses `part_id` (integer PK) rather than `part_key` (4-char string) since seller-links are a sub-resource. However, for consistency with the existing Parts API which uses `part_key` in URLs, the endpoint should be `POST /api/parts/<part_key>/seller-links` and resolve the key internally.

- Surface: `DELETE /api/parts/<part_key>/seller-links/<seller_link_id>` (NEW)
- Inputs: Path params `part_key` (string), `seller_link_id` (integer, the PartSeller PK).
- Outputs: 204 No Content.
- Errors: 404 if part or seller link not found. 404 if seller_link_id does not belong to the specified part.
- Evidence: Change brief section 3.

- Surface: `POST /api/parts` (CHANGED)
- Inputs: Remove `seller_id` and `seller_link` from request body.
- Outputs: Response now includes `seller_links: []` instead of `seller`/`seller_link`.
- Errors: No change.
- Evidence: `app/api/parts.py:138-164`.

- Surface: `PUT /api/parts/<part_key>` (CHANGED)
- Inputs: Remove `seller_id` and `seller_link` from request body.
- Outputs: Response now includes `seller_links` list.
- Errors: No change.
- Evidence: `app/api/parts.py:321-332`.

- Surface: `GET /api/parts/<part_key>` (CHANGED)
- Inputs: No change.
- Outputs: Response now includes `seller_links` list instead of `seller`/`seller_link`.
- Errors: No change.
- Evidence: `app/api/parts.py:251-265`.

- Surface: `GET /api/parts` (CHANGED)
- Inputs: No change.
- Outputs: Each part now includes `seller_links` list instead of `seller`/`seller_link`.
- Errors: No change.
- Evidence: `app/api/parts.py:167-248`.

- Surface: `POST /api/ai-parts/create` (CHANGED)
- Inputs: Remove `seller_id` and `seller_link` from request body.
- Outputs: No change to response structure (still returns PartResponseSchema with seller_links: []).
- Errors: No change.
- Evidence: `app/api/ai_parts.py:134-200`.

- Surface: `GET /api/shopping-lists/<list_id>/lines` (CHANGED)
- Inputs: No change.
- Outputs: Lines now have `seller_link: str | None` instead of `effective_seller_id`. The `seller_link` value comes from part_sellers lookup.
- Errors: No change.
- Evidence: `app/api/shopping_list_lines.py:105-131`.

- Surface: `GET /api/shopping-lists/<list_id>` (CHANGED)
- Inputs: No change.
- Outputs: Lines within the response use `seller_id` (no effective_seller fallback), and include `seller_link`. Seller grouping uses `line.seller_id` directly.
- Errors: No change.
- Evidence: Shopping list response schema changes.

- Surface: `DELETE /api/sellers/<seller_id>` (CHANGED behavior)
- Inputs: No change.
- Outputs: No change.
- Errors: Now checks `part_sellers` table for associated parts instead of `Part.seller_id`.
- Evidence: `app/services/seller_service.py:112-115`.

---

## 5) Algorithms & State Machines

- Flow: Migration data transfer (021)
- Steps:
  1. Create `part_sellers` table with all columns and constraints.
  2. Execute `INSERT INTO part_sellers (part_id, seller_id, link, created_at) SELECT id, seller_id, seller_link, now() FROM parts WHERE seller_id IS NOT NULL AND seller_link IS NOT NULL`.
  3. Drop column `seller_link` from `parts`.
  4. Drop column `seller_id` from `parts` (this also removes the FK constraint and index).
- States / transitions: None (one-shot migration).
- Hotspots: The INSERT handles all existing parts in a single statement. With ~50 parts in test data this is trivial. Production would also be small (hobby inventory).
- Evidence: `app/data/test_data/parts.json` shows ~50 parts.

- Flow: Shopping list seller_link resolution
- Steps:
  1. The seller_link resolution is performed in the **service layer** (not as a schema `@computed_field`), consistent with the project's pattern of avoiding `@computed_field` for ORM integration. The service enriches line data before schema serialization.
  2. After loading shopping list lines, check each line: if `line.seller_id` is not None and `line.part_id` is not None, look up `part_sellers` for the row matching `(part_id=line.part_id, seller_id=line.seller_id)`.
  3. If a row exists, attach `seller_link` = row's `link` value to the line data.
  4. If no row exists, attach `seller_link` = None.
  5. For list endpoints that return multiple lines, perform a **bulk lookup** to avoid N+1: collect all `(part_id, seller_id)` pairs from lines, execute a single query against `part_sellers`, then distribute results to lines.
- States / transitions: None.
- Hotspots: For list endpoints that return multiple lines, the bulk lookup keeps this O(1) queries regardless of line count.
- Evidence: `app/services/shopping_list_line_service.py:271-288` (list_lines) returns multiple lines. CLAUDE.md schema requirements discourage `@computed_field` for ORM integration.

- Flow: Seller grouping in Ready view (simplified)
- Steps:
  1. For each line in the shopping list, use `line.seller_id` directly as the group key.
  2. If `line.seller_id` is None, group under "ungrouped".
  3. If `line.seller_id` is not None, group under `str(seller_id)`.
  4. For each line, look up `seller_link` from `part_sellers` if available.
- States / transitions: None.
- Hotspots: None; the grouping is already O(n) in line count.
- Evidence: `app/services/shopping_list_service.py:538-579`.

---

## 6) Derived State & Invariants

- Derived value: `seller_links` on Part response
  - Source: Unfiltered `part_sellers` rows for the given part_id, eager-loaded via relationship.
  - Writes / cleanup: Adding/removing PartSeller rows via new endpoints. CASCADE delete when Part or Seller is deleted.
  - Guards: Unique constraint on (part_id, seller_id) prevents duplicate entries. FK constraints ensure referential integrity.
  - Invariant: Each (part_id, seller_id) pair appears at most once in `part_sellers`.
  - Evidence: Change brief section 1, unique index requirement.

- Derived value: `seller_link` on ShoppingListLine response
  - Source: Filtered lookup in `part_sellers` matching `(line.part_id, line.seller_id)`.
  - Writes / cleanup: No writes; this is a read-only derivation. If the PartSeller row is deleted, the seller_link becomes None.
  - Guards: The lookup only occurs when `line.seller_id IS NOT NULL`. If no matching part_sellers row exists, the field is None.
  - Invariant: The seller_link reflects the current state of part_sellers at query time; no cached/stale value.
  - Evidence: Change brief section 4.

- Derived value: Seller group membership in Ready view
  - Source: `ShoppingListLine.seller_id` directly (no longer filtered through Part.seller_id fallback).
  - Writes / cleanup: Group structure is ephemeral (computed per request, not persisted).
  - Guards: Simplification removes the filtered-view risk. Previously, the effective_seller used a filtered path (line.seller_id OR part.seller_id) which could cause grouping instability if part.seller_id changed. Now grouping depends only on the line's own seller_id.
  - Invariant: A line belongs to exactly one seller group based on its seller_id (or "ungrouped" if None).
  - Evidence: `app/services/shopping_list_service.py:551`.

---

## 7) Consistency, Transactions & Concurrency

- Transaction scope: Each API request runs in a single Flask request-scoped session. The Alembic migration runs in its own transaction.
- Atomic requirements: (1) Migration must create part_sellers, insert data, and drop columns in one migration step (Alembic transaction). (2) Creating a PartSeller row is a single INSERT with flush. (3) Deleting a PartSeller row is a single DELETE with flush.
- Retry / idempotency: The unique constraint on (part_id, seller_id) serves as a natural idempotency guard for POST. Repeated POSTs with the same (part_id, seller_id) will return 409 conflict. DELETE is naturally idempotent (404 if already deleted).
- Ordering / concurrency controls: The unique constraint prevents duplicate PartSeller rows from concurrent requests. No optimistic locking needed; the operations are simple inserts/deletes.
- Evidence: `app/services/container.py:103-105` (ContextLocalSingleton session pattern), standard Flask request lifecycle.

---

## 8) Errors & Edge Cases

- Failure: Part not found when adding seller link
- Surface: `POST /parts/<part_key>/seller-links`
- Handling: 404 with RecordNotFoundException message.
- Guardrails: Part lookup by key with existing PartService.get_part().
- Evidence: `app/services/part_service.py:100-109`.

- Failure: Seller not found when adding seller link
- Surface: `POST /parts/<part_key>/seller-links`
- Handling: 404 with RecordNotFoundException message.
- Guardrails: Seller lookup by ID with existing SellerService.get_seller().
- Evidence: `app/services/seller_service.py:46-61`.

- Failure: Duplicate (part_id, seller_id) when adding seller link
- Surface: `POST /parts/<part_key>/seller-links`
- Handling: 409 with ResourceConflictException message ("seller link already exists for this part and seller").
- Guardrails: Unique constraint on (part_id, seller_id) in the database. IntegrityError caught and translated.
- Evidence: Pattern used in `app/services/seller_service.py:37-44`.

- Failure: Seller link not found or does not belong to part on delete
- Surface: `DELETE /parts/<part_key>/seller-links/<seller_link_id>`
- Handling: 404 with RecordNotFoundException message.
- Guardrails: Query for PartSeller by ID with part_id filter.
- Evidence: Standard pattern across all delete endpoints.

- Failure: Migration encounters parts with seller_id but NULL seller_link (or vice versa)
- Surface: Alembic migration 021
- Handling: Only rows where BOTH seller_id IS NOT NULL AND seller_link IS NOT NULL are migrated. Partial data is silently dropped.
- Guardrails: The INSERT...SELECT WHERE clause filters nulls. This is documented as acceptable data loss.
- Evidence: Change brief section 1.

- Failure: Shopping list line references a seller_id that has no part_sellers entry
- Surface: Shopping list GET/list endpoints
- Handling: `seller_link` field returns None. This is expected behavior (the seller is set on the line but no product URL has been configured for this part+seller combo).
- Guardrails: None needed; None is the correct response.
- Evidence: Change brief section 4.

---

## 9) Observability / Telemetry

No new metrics are introduced for this change. The refactor is primarily a data model and API restructuring. Existing metrics remain valid:

- Signal: Existing `SHOPPING_LIST_LINES_MARKED_ORDERED_TOTAL` counter
- Type: Counter
- Trigger: When lines are marked as ordered via single or group actions.
- Labels / fields: `mode` (single/group)
- Consumer: Existing dashboards
- Evidence: `app/services/shopping_list_line_service.py:25-28`.

The new seller-link endpoints are simple CRUD operations that do not warrant dedicated metrics. Standard Flask request logging provides sufficient observability.

---

## 10) Background Work & Shutdown

No background workers, threads, or jobs are introduced or affected by this change. The AI analysis task and cleanup task continue to function (with reduced scope since seller resolution is removed), but they are existing background workers that do not need new shutdown hooks.

- Worker / job: AI Part Analysis Task (EXISTING, reduced scope)
- Trigger cadence: User-initiated via `/ai-parts/analyze`
- Responsibilities: Reduced -- no longer resolves sellers or populates seller fields in results.
- Shutdown handling: Existing lifecycle coordinator integration unchanged.
- Evidence: `app/services/ai_part_analysis_task.py:18-131`.

---

## 11) Security & Permissions

No new security concerns. The new seller-link endpoints follow the same authentication pattern as existing Part sub-resource endpoints:

- Concern: Authentication on new endpoints
- Touchpoints: `POST /parts/<part_key>/seller-links`, `DELETE /parts/<part_key>/seller-links/<seller_link_id>`
- Mitigation: Blueprint registered under `api_bp` which has the `before_request` OIDC validation hook. No `@public` decorator needed.
- Residual risk: None beyond existing auth model.
- Evidence: `app/api/__init__.py` (api_bp registration pattern), OIDC `before_request` hook.

---

## 12) UX / UI Impact

- Entry point: Part detail page, seller section
- Change: Instead of a single seller dropdown + link field, the UI will show a list of seller links with add/remove actions.
- User interaction: User clicks "Add seller link" to add a seller-URL pair. User clicks remove icon to delete a seller link. Seller links are displayed as a list on the part detail view.
- Dependencies: New `POST /parts/<key>/seller-links` and `DELETE` endpoints. Changed `PartResponseSchema` shape.
- Evidence: Change brief section 3.

- Entry point: AI part creation flow
- Change: No seller suggestion is shown. Seller link must be added manually after part creation.
- User interaction: AI analysis results no longer include seller/seller_link fields. The user adds sellers separately.
- Dependencies: Changed `PartAnalysisDetailsSchema` and `AIPartCreateSchema`.
- Evidence: Change brief section 2.

- Entry point: Shopping list line display
- Change: Lines show `seller_link` (URL) when available instead of `effective_seller` object. The seller on a line is the line's own seller, not a fallback.
- User interaction: Seller column shows the line's seller directly. A link icon appears when seller_link is available.
- Dependencies: Changed `ShoppingListLineListSchema` and `ShoppingListLineResponseSchema`.
- Evidence: Change brief section 4.

---

## 13) Deterministic Test Plan

- Surface: PartSellerService (NEW)
- Scenarios:
  - Given a part and seller exist, When creating a seller link, Then a PartSeller row is created with correct fields
  - Given a part and seller exist, When creating a seller link with a duplicate (part_id, seller_id), Then a 409 conflict is raised
  - Given a part exists with a seller link, When deleting the seller link by ID, Then the row is removed
  - Given a part exists, When deleting a non-existent seller link ID, Then a 404 is raised
  - Given a part exists with seller links, When listing seller links for the part, Then all links are returned
  - Given a part exists with seller links, When the part is deleted, Then all seller links are cascade-deleted
  - Given a seller exists with part seller links, When the seller is deleted, Then all associated seller links are cascade-deleted
  - Given a (part_id, seller_id) pair, When looking up seller_link, Then the link URL is returned or None if no match
- Fixtures / hooks: Standard `app`, `session`, `container` fixtures. Create Part and Seller in test setup.
- Gaps: None.
- Evidence: Existing service test pattern in `tests/test_part_service.py`.

- Surface: `POST /parts/<part_key>/seller-links` API
- Scenarios:
  - Given valid part_key, seller_id, and link, When POSTing, Then 201 with seller link response
  - Given invalid part_key, When POSTing, Then 404
  - Given invalid seller_id, When POSTing, Then 404
  - Given duplicate (part_id, seller_id), When POSTing, Then 409
  - Given missing required fields, When POSTing, Then 422 validation error
- Fixtures / hooks: Flask test client, seeded Part and Seller rows.
- Gaps: None.
- Evidence: Existing API test pattern in `tests/api/test_parts_api.py`.

- Surface: `DELETE /parts/<part_key>/seller-links/<seller_link_id>` API
- Scenarios:
  - Given existing seller link, When DELETing, Then 204
  - Given non-existent seller link, When DELETing, Then 404
  - Given seller link belonging to different part, When DELETing, Then 404
- Fixtures / hooks: Flask test client, seeded PartSeller row.
- Gaps: None.
- Evidence: Existing delete endpoint test patterns.

- Surface: PartService (CHANGED)
- Scenarios:
  - Given part creation without seller fields, When creating a part, Then Part is created without seller_id/seller_link columns
  - Given part with seller_links relationship, When getting part details, Then seller_links are accessible
- Fixtures / hooks: Existing `container.part_service()` fixture.
- Gaps: None.
- Evidence: `tests/test_part_service.py`.

- Surface: Part API responses (CHANGED)
- Scenarios:
  - Given a part with seller links, When GETting the part, Then response includes `seller_links` list
  - Given a part without seller links, When GETting the part, Then response includes `seller_links: []`
  - Given a part with seller links, When listing parts, Then each part includes `seller_links`
  - Given part creation, When POSTing to create part, Then request body does not accept seller_id/seller_link
- Fixtures / hooks: Seeded parts with and without PartSeller rows.
- Gaps: None.
- Evidence: `tests/test_parts_api.py`, `tests/api/test_parts_api.py`.

- Surface: AI analysis/cleanup (CHANGED)
- Scenarios:
  - Given AI analysis result, When analysis completes, Then result has no seller/seller_link fields
  - Given AI cleanup result, When cleanup completes, Then result has no seller/seller_link fields
  - Given AIPartCreateSchema, When creating part from AI, Then request does not accept seller_id/seller_link
- Fixtures / hooks: Existing AI service test fixtures with cached responses (will need cached response JSON updated to remove seller fields).
- Gaps: None.
- Evidence: `tests/test_ai_service.py`, `tests/test_ai_parts_api.py`, `tests/test_ai_part_cleanup_task.py`.

- Surface: ShoppingListLine model properties (CHANGED)
- Scenarios:
  - Given a shopping list line with seller_id, When accessing seller_id, Then it returns the line's own seller_id (no fallback)
  - Given a shopping list line without seller_id, When serializing, Then seller_id is None and seller_link is None
  - Given a shopping list line with seller_id matching a part_sellers entry, When serializing, Then seller_link URL is populated
  - Given a shopping list line with seller_id NOT matching any part_sellers entry, When serializing, Then seller_link is None
- Fixtures / hooks: Seeded ShoppingListLine with Part and PartSeller rows.
- Gaps: None.
- Evidence: `tests/services/test_shopping_list_line_service.py`.

- Surface: Shopping list seller grouping (CHANGED)
- Scenarios:
  - Given lines with seller_id set, When building seller groups, Then lines are grouped by line.seller_id directly
  - Given lines without seller_id, When building seller groups, Then lines appear in "ungrouped"
  - Given a line where part has a seller link but line.seller_id is None, When building seller groups, Then line is in "ungrouped" (no fallback)
- Fixtures / hooks: Seeded shopping list with lines and seller associations.
- Gaps: None.
- Evidence: `tests/services/test_shopping_list_service.py`.

- Surface: SellerService.delete_seller (CHANGED)
- Scenarios:
  - Given a seller with part_sellers entries, When deleting, Then InvalidOperationException is raised
  - Given a seller with no part_sellers entries, When deleting, Then seller is deleted
- Fixtures / hooks: Existing seller service test fixtures.
- Gaps: None.
- Evidence: `tests/services/test_seller_service.py`.

- Surface: Test data loading
- Scenarios:
  - Given updated test data files, When running load-test-data, Then parts are created without seller_id/seller_link and part_sellers are created separately
- Fixtures / hooks: test_data_service integration.
- Gaps: None.
- Evidence: `tests/test_test_data_service.py`.

---

## 14) Implementation Slices

- Slice: 1 -- Data model and migration
- Goal: Establish the new PartSeller model and migrate existing data.
- Touches: `app/models/part_seller.py` (new), `app/models/part.py`, `app/models/seller.py`, `app/models/__init__.py`, `alembic/versions/021_create_part_sellers_table.py` (new).
- Dependencies: Must land before any service/API changes. Other slices build on this.

- Slice: 2 -- Part seller service and API endpoints
- Goal: CRUD operations for seller links.
- Touches: `app/services/part_seller_service.py` (new), `app/schemas/part_seller.py` (new), `app/api/part_seller_links.py` (new), `app/api/__init__.py`, `app/services/container.py`.
- Dependencies: Depends on Slice 1 (model exists).

- Slice: 3 -- Part schema and API cleanup
- Goal: Remove seller fields from Part schemas/service/API and add seller_links.
- Touches: `app/schemas/part.py`, `app/services/part_service.py`, `app/api/parts.py`, `app/services/inventory_service.py`.
- Dependencies: Depends on Slice 1 (seller_links relationship exists on Part).

- Slice: 4 -- AI pipeline seller removal
- Goal: Remove all seller logic from AI analysis and cleanup flows.
- Touches: `app/schemas/ai_part_analysis.py`, `app/schemas/ai_part_cleanup.py`, `app/services/ai_model.py`, `app/services/ai_service.py`, `app/services/prompts/part_analysis.md`, `app/api/ai_parts.py`, `app/services/container.py`.
- Dependencies: Depends on Slice 3 (Part create no longer accepts seller fields).

- Slice: 5 -- Shopping list simplification
- Goal: Remove effective_seller pattern, add seller_link to responses.
- Touches: `app/models/shopping_list_line.py`, `app/schemas/shopping_list_line.py`, `app/services/shopping_list_line_service.py`, `app/services/shopping_list_service.py`.
- Dependencies: Depends on Slice 1 (part_sellers table for link lookup).

- Slice: 6 -- Seller service update
- Goal: Update seller delete check to use part_sellers instead of Part.seller_id.
- Touches: `app/services/seller_service.py`.
- Dependencies: Depends on Slice 1.

- Slice: 7 -- Test data and tests
- Goal: Update all test data files and tests.
- Touches: `app/data/test_data/parts.json`, `app/data/test_data/part_sellers.json` (new), `app/services/test_data_service.py`, all affected test files.
- Dependencies: Depends on all previous slices.

---

## 15) Risks & Open Questions

- Risk: Shopping list seller grouping behavior change may surprise users who relied on the effective_seller fallback.
- Impact: Lines previously grouped under a seller (via part.seller_id) will now appear as "ungrouped" if line.seller_id is not explicitly set.
- Mitigation: The migration does not affect shopping list lines. If needed, a data migration could populate `shopping_list_lines.seller_id` from `parts.seller_id` for existing lines where `line.seller_id IS NULL AND parts.seller_id IS NOT NULL`. Decision: Not required per the change brief. Shopping list line seller_id is independent.

- Risk: AI cached response files (used for testing/replay) may contain seller fields that cause validation errors after schema changes.
- Impact: Tests using cached AI responses may fail.
- Mitigation: Update cached response fixtures to remove seller fields. The `PartAnalysisSuggestion` model uses `extra="forbid"`, so stale cached responses with seller fields would fail validation.

- Risk: Test data referencing seller_id on parts must be restructured into part_sellers.json.
- Impact: `load-test-data` command will fail if test data files are not updated.
- Mitigation: Part of the implementation plan (Slice 7). Extract seller data from parts.json into part_sellers.json.

All open questions have been resolved autonomously based on the change brief's explicit decisions:
- NULL seller_id or seller_link combinations are dropped during migration (acceptable loss).
- No backwards compatibility needed (BFF pattern).
- Shopping list line seller_id is the real seller, not an override.

---

## 16) Confidence

Confidence: High -- The change brief is precise, the codebase is well-structured with clear patterns, all affected areas have been identified through exhaustive grep/read, and the refactoring follows established conventions (model + service + schema + API + tests).
