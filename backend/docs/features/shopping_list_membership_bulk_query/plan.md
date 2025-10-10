Brief description:
- Deliver the backend support for the Shopping List Phase 3 UI bulk membership lookup by adding `POST /api/parts/shopping-list-memberships/query`, allowing the frontend to decorate part tiles without spamming one request per card while preserving the existing single-part payload semantics.

Relevant files & functions:
- app/api/parts.py – add `query_part_shopping_list_memberships()` route wired to `POST /api/parts/shopping-list-memberships/query` and reuse `PartShoppingListMembershipSchema` for serialization.
- app/schemas/part_shopping_list.py – introduce request/response schemas for the bulk query (`PartShoppingListMembershipQueryRequestSchema`, `PartShoppingListMembershipQueryItemSchema`, `PartShoppingListMembershipQueryResponseSchema`).
- app/services/part_service.py – provide a helper such as `get_part_ids_by_keys(part_keys: Sequence[str])` that validates key existence and preserves the caller’s order.
- app/services/shopping_list_service.py – extend with `list_part_memberships_bulk(part_ids: Sequence[int], include_done: bool)` plus any shared ordering helpers, and have the existing `list_part_memberships()` reuse the shared logic.
- tests/services/test_shopping_list_service.py – add coverage for the new bulk service method (multiple keys, empty membership arrays, `include_done=True`, invalid part id handling) and assert that ordering continues to match the existing single-part endpoint.
- tests/services/test_part_service.py – exercise the new key lookup helper (happy path, missing keys, order preservation) to satisfy public-method coverage requirements.
- tests/test_parts_api.py – exercise the API behaviour (happy path honouring call order, empty membership arrays, `include_done`, 400s for empty or >100 keys or duplicates, 404 when any key is unknown).
- optional: app/api/__init__.py or blueprint wiring if needed once the new route is added (verify Spectree registration).

Phase 1 – shared query & schema groundwork:
- Define `PartShoppingListMembershipQueryRequestSchema` with `part_keys: list[str]` and `include_done: bool | None`; enforce length constraints (1..100), trim whitespace, and surface clear Pydantic validation errors for empty arrays or oversized batches. Include a validator that fails when the input contains duplicates so we align with the “duplicated keys” 400 requirement.
- Create `PartShoppingListMembershipQueryItemSchema` encapsulating the per-key response shape (`part_key`, `membership: list[PartShoppingListMembershipSchema]`) and wrap it in `PartShoppingListMembershipQueryResponseSchema` (top-level `memberships: list[...]`) so Spectree and OpenAPI share one definition.
- In `PartService`, add a helper that fetches `(Part.key, Part.id)` for the supplied keys using a single SELECT; raise `RecordNotFoundException` if any key is missing and return an ordered list/tuple of `(key, id)` pairs that preserves the request order. This helper will make the API logic concise and consistent across endpoints.

Phase 2 – bulk membership retrieval logic:
- Implement `ShoppingListService.list_part_memberships_bulk(part_ids, include_done=False)`:
  - Build one `select(ShoppingListLine)` statement joining `ShoppingList`, `Part`, and seller relationships (`selectinload`) for all requested part ids.
  - Apply status filtering: when `include_done` is `False`, add `ShoppingListLine.status != DONE` and `ShoppingList.status != DONE`; otherwise include all statuses.
  - Keep the existing ordering semantics (`ShoppingListLine.updated_at DESC`, `ShoppingList.updated_at DESC`, `ShoppingListLine.created_at ASC`) so the bulk endpoint mirrors the current single-part behaviour.
  - Execute once, group the resulting lines by `part_id` while preserving the incoming part id order, and return a dict/list keyed so the API can inject empty arrays for parts without memberships.
- Refactor the existing `list_part_memberships(part_id)` to delegate to the new helper (with a single `part_id` list) so both endpoints share identical ordering and filtering behaviour.

Phase 3 – API endpoint, docs, and tests:
- Add the new Flask route in `app/api/parts.py`:
  - Validate the payload with the new request schema; rely on Pydantic validators to surface `ValidationError` for empty arrays, duplicates, or limit violations so the standard handler emits a `400`.
  - Use the PartService helper to resolve keys to ids; if it raises `RecordNotFoundException`, let `@handle_api_errors` convert it into the required `404`.
  - Call `shopping_list_service.list_part_memberships_bulk`, then build the response array by iterating over the original key order and serializing each line with `PartShoppingListMembershipSchema.from_line`.
  - Ensure the response always includes one item per requested key, even when the membership list is empty.
  - Register the Spectree response using the new response schema so `/api` docs stay accurate.
- Extend `tests/services/test_shopping_list_service.py` with fixtures that create Concept, Ready, and Done lists to verify status filtering and ordering (Ready lines should continue to appear ahead of Concept lines by default, matching the current endpoint). Cover the grouped ordering by asserting the sequence of returned memberships for multiple parts.
- Add API tests in `tests/test_parts_api.py` to assert:
  - `POST /api/parts/shopping-list-memberships/query` returns membership arrays ordered according to the requested `part_keys`.
  - Each membership list preserves the existing Ready-before-Concept ordering within a part.
  - Empty membership arrays for parts not on any lists.
  - Inclusion of Done memberships when `include_done` is true (and absence by default).
  - Validation errors for empty `part_keys`, more than 100 keys, and duplicate keys.
  - A `404` when any requested key does not exist.
- Confirm Spectree registration by wiring the route through `@api.validate`, then refresh the generated frontend client (not in scope for backend change but call out in PR instructions).
