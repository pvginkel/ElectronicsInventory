# Change Brief: Seller Links Refactor

## Problem

The current schema stores seller information directly on the `parts` table (`seller_id` + `seller_link` columns). This is a design limitation: a part can only be associated with one seller and one product URL. In practice, the same electronic component is available from multiple sellers (DigiKey, Mouser, AliExpress, etc.), each with their own product page URL.

Additionally, the AI part creation and cleanup flows populate seller information automatically, which couples seller management to the AI pipeline unnecessarily.

## Changes Required

### 1. New `part_sellers` Table

Create a link table between parts and sellers that stores the seller-specific product URL:

- Columns: `id`, `part_id` (FK), `seller_id` (FK), `link` (URL string), `created_at`
- Unique index on `(part_id, seller_id)` — one link per seller per part, but multiple sellers per part
- Migration must move existing non-null `(seller_id, seller_link)` combinations from `parts` into the new table, then drop both columns from `parts`

### 2. Remove Seller from AI Flows

Remove all seller-related fields and logic from:

- **AI Part Creation**: `PartAnalysisDetailsSchema`, `AIPartCreateSchema`, `PartAnalysisDetails` (LLM model), prompt template (`part_analysis.md`), and `AIService.analyze_part()`
- **AI Part Cleanup**: `CleanedPartDataSchema`, `AIService.cleanup_part()`
- **Shared**: `AIService._resolve_seller()` method (becomes dead code)

The Mouser integration stays for part identification and datasheets, but no longer suggests sellers.

### 3. Part Seller Link API Endpoints

- `POST /parts/<part_id>/seller-links` — Add a seller link (body: `{seller_id, link}`)
- `DELETE /parts/<part_id>/seller-links/<seller_link_id>` — Remove a seller link
- Seller links returned inline in `GET /parts/<id>` and `GET /parts` responses as a list

### 4. Shopping List Behavior Changes

- `seller_id` on `ShoppingListLine` is THE seller, not an override. Remove the `effective_seller_id` / `effective_seller` fallback pattern that falls back to `part.seller_id`.
- No default seller concept. All sellers default to None.
- Return seller link URL in shopping list get/list endpoints when a matching `part_sellers` record exists for the line's `(part_id, seller_id)` combination.
- Rewording: seller on a shopping list line is the seller, not a "seller override".

### 5. Schema, Service, and Test Updates

- Update all Part schemas (create, update, response, list) to remove `seller_id`/`seller_link` and add `seller_links` list
- Update shopping list line schemas to remove effective_seller pattern and add seller link info
- Update part service, shopping list line service, and all related tests
- Update test data files to reflect schema changes
