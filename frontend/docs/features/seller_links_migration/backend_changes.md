# Backend Changes Required: Seller Links Migration

## 1. Add `logo_url` to `PartSellerLinkSchema`

The `PartSellerLinkSchema` (used in both `PartResponseSchema` and `PartWithTotalSchema` responses) needs a `logo_url` field added so the frontend can display seller logos without a separate API call.

### Current schema fields

```
PartSellerLinkSchema:
  id: integer (required)
  seller_id: integer (required)
  seller_name: string (required)
  seller_website: string (required)
  link: string (required)
  created_at: datetime (required)
```

### Required addition

```
  logo_url: string | null (required)
```

- **Description:** CAS URL for the seller logo image, or null if no logo is uploaded.
- **Source:** Same field as `SellerListSchema.logo_url` and `SellerResponseSchema.logo_url` -- the seller's logo from the CAS store.
- **Example:** `/api/cas/abc123def456` or `null`

### Where it appears

This field needs to be added to **all** `PartSellerLinkSchema` variants in the API:

1. `PartResponseSchema.PartSellerLinkSchema` -- returned by `GET /api/parts/{part_key}`
2. `PartWithTotalSchema.PartSellerLinkSchema` -- returned by `GET /api/parts` (list endpoint)
3. `PartSellerLinkSchema` (standalone) -- returned by `POST /api/parts/{part_key}/seller-links` (create endpoint response)

### Why

The frontend needs to display seller logos on:
- **Part cards** in the parts list (small clickable icons that open the seller link)
- **Part details** screen (logo shown before seller name in the seller links section)

Without `logo_url`, the frontend falls back to showing a text chip with the seller name. Once `logo_url` is available, logos appear automatically.

## 2. Regenerate OpenAPI Spec

After the backend change, regenerate the OpenAPI spec and update `openapi-cache/openapi.json`. The frontend will then run `pnpm generate:api` to update the generated types and hooks.

## No Other Backend Changes Required

The following are already in place:
- `seller_links` array on part response schemas
- `POST /api/parts/{part_key}/seller-links` endpoint (accepts `{ seller_id, link }`)
- `DELETE /api/parts/{part_key}/seller-links/{seller_link_id}` endpoint
- `seller_id` and `seller_link` removed from `PartCreateSchema` and `PartUpdateSchema`
