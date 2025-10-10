# Shopping List Phase 3 – Backend Requirements

## Overview
- Introduce a bulk membership lookup endpoint so the UI can decorate part lists without issuing one request per card.
- The response must mirror the existing `/api/parts/{part_key}/shopping-list-memberships` payloads and continue to exclude `done` shopping lists/lines.
- Provide deterministic ordering so the frontend can render consistent tooltips and badges.

## Endpoint Specification
- **Method & Route:** `POST /api/parts/shopping-list-memberships/query`
- **Authentication:** None (same as current shopping list endpoints).
- **Request Body (`application/json`):**
  - `part_keys: string[]` — 1..100 part keys to inspect. Reject empty arrays with `400`.
  - `include_done?: boolean` — optional flag (default `false`). When `true`, include memberships whose list or line status is `done`. Keep default aligned with current single-part endpoint behaviour.
- **Response (`200 OK`):**
  ```json
  {
    "memberships": [
      {
        "part_key": "ABCD",
        "memberships": [
          {
            "shopping_list_id": 42,
            "shopping_list_name": "Workbench Restock",
            "shopping_list_status": "concept",
            "line_id": 321,
            "line_status": "new",
            "needed": 5,
            "ordered": 0,
            "received": 0,
            "note": "Grab extras if on sale",
            "seller": {
              "id": 7,
              "name": "Digikey",
              "website": "https://www.digikey.com"
            }
          }
        ]
      }
    ]
  }
  ```
  - `memberships` must contain one entry per requested key (include empty arrays for parts with no active memberships).
  - Each item in the `memberships` arrays must match `PartShoppingListMembershipSchema` used by the existing single-part endpoint.
- **Error Responses:**
  - `400` — invalid payload, duplicate keys, more than 100 keys, or malformed data.
  - `404` — when any requested part key does not exist.
  - Reuse `ErrorResponseSchema` for all error payloads to stay consistent with the API surface.

## Behaviour & Implementation Notes
- Introduce `ShoppingListService.list_part_memberships_bulk(part_ids, include_done)` to fetch all memberships in one round trip and have `list_part_memberships` delegate to it for parity.
- Enforce an upper bound (100 keys) to prevent pathological requests; return `400` if exceeded.
- Preserve ordering:
  1. `memberships` should follow the order of `part_keys`.
  2. Lines within each part should sort by `shopping_list_status` (`concept`, `ready`, `done` if included), then by `updated_at` descending, mirroring `list_part_memberships`.
- Reuse existing serialization helpers (`PartShoppingListMembershipSchema.from_line`) so schema updates remain centralised.
- When `include_done` is false (default), filter out lines where either the line or list is `done`. When true, return all statuses without additional filtering.
- Trim whitespace from submitted keys and reject duplicates or blank values with a validation error so the frontend gets a deterministic 400 response instead of ambiguous results.
- Instrumentation: ensure the endpoint logs correlation IDs and participates in existing request logging so frontend instrumentation can retrieve metadata if needed.

## Testing
- Add unit tests covering:
  - Happy path with multiple part keys and mixed memberships.
  - Empty membership arrays for parts not on any lists.
  - `include_done` toggling (confirm done lines appear only when requested).
  - Validation errors (empty array, >100 keys, unknown part key).
- Update the OpenAPI schema (`docs/openapi.yaml` / code generation source) and regenerate client hooks so the frontend can consume the new endpoint via `pnpm generate:api`.
