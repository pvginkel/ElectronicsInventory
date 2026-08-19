# Change Brief: Seller Links Migration

## Summary

Migrate the parts domain from the legacy single `seller` + `seller_link` fields to the new `seller_links` array on the part response. This is a breaking API change: the backend has already removed `seller_id` and `seller_link` from the part create/update schemas and replaced them with a dedicated `/api/parts/{part_key}/seller-links` CRUD endpoint. The frontend still references the old fields, causing ~25 TypeScript errors.

## What Needs to Change

### 1. Part Details Screen
Replace the "Seller Information" section (which shows a single seller name + link) with a list of all seller links. Each entry shows the seller logo (if available) before the seller name, with the product page URL as a clickable link.

### 2. Part Form (Create/Edit)
Remove the old single Seller + Seller Link fields from the part form. Replace with an inline list that shows existing seller links with the ability to add new ones (via SellerSelector + link URL input) and remove existing ones. Uses the dedicated `POST /api/parts/{part_key}/seller-links` and `DELETE /api/parts/{part_key}/seller-links/{seller_link_id}` endpoints.

### 3. Part Card (List View)
Replace the single-seller VendorInfo display with a row of seller icons. Show seller logos as small clickable icons that open the seller link in a new tab. If no logo is available, show a chip with the seller name instead. This row appears on the same line as box locations, aligned to the right.

### 4. AI Cleanup Flow
Strip all seller/seller_link comparison and application logic from the AI cleanup dialog and merge step. The AI flow will no longer handle seller assignments (can be revisited later).

### 5. Supporting Code
- Update `use-duplicate-part.ts` to remove seller field copying
- Update `use-parts-selector.ts` fuzzy search to use seller_links array for seller name matching
- Update `part-factory.ts` and `part-list.spec.ts` to remove `seller_id` references
- Update or replace `vendor-info.tsx` component

## Backend Dependency

The `PartSellerLinkSchema` response currently includes: `id`, `seller_id`, `seller_name`, `seller_website`, `link`, `created_at`. It needs to also include `logo_url` (the CAS URL for the seller logo image) so the frontend can display seller logos without a separate lookup.
