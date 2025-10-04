# Shopping List Part Entry (Phase 3)

## Brief description
- Implement backend support for **Phase 3 — Part-centric entry points & indicators** so the Part detail and tiles can surface active shopping list context and add items straight into Concept lists.
- Deliver the epic’s explicit requirements: "Operation to **list Shopping Lists containing a given Part** where the line is **not Done**" and "Operation to **add a Part to a specific Concept list** with Needed/Note/Seller override".

## Relevant files and functions
- `app/services/shopping_list_service.py`: add a dedicated query helper (e.g., `list_part_memberships`) that returns non-Done `ShoppingListLine` instances with their parent list metadata.
- `app/services/shopping_list_line_service.py`: expose a wrapper such as `add_part_to_concept_list` that enforces Concept-only inserts before delegating to existing line creation logic.
- `app/api/parts.py`: mount `GET /api/parts/<part_key>/shopping-list-memberships` and `POST /api/parts/<part_key>/shopping-list-memberships` routes that call the new service methods and serialize responses.
- `app/schemas/part_shopping_list.py` (new): define `PartShoppingListMembershipSchema` for the badge/icon payload and `PartShoppingListMembershipCreateSchema` for the part-detail add request.
- `tests/services/test_shopping_list_service.py`: extend coverage for the membership query, ensuring Done lists/lines are excluded and results are sorted predictably.
- `tests/services/test_shopping_list_line_service.py`: cover Concept-only enforcement, duplicate prevention, and successful adds via the new wrapper.
- `tests/test_parts_api.py`: exercise the new endpoints for happy path, duplicate/invalid-status failures, and 404 when the part key is unknown.

## Implementation steps
1. **Service query for active memberships**
   - In `ShoppingListService`, implement `list_part_memberships(part_id: int) -> list[ShoppingListLine]`.
   - Build a `select(ShoppingListLine)` joined to `ShoppingList` filtering `ShoppingListLine.part_id == part_id`, `ShoppingListLine.status != ShoppingListLineStatus.DONE`, and `ShoppingList.status != ShoppingListStatus.DONE`.
   - Use `.options(selectinload(...))` to preload `ShoppingListLine.shopping_list`, `ShoppingListLine.part`, and `ShoppingListLine.seller` so schema serialization has all data without extra queries.
   - Order primarily by `ShoppingListLine.updated_at` (desc) so badges reflect the most recently touched lines, then by `ShoppingList.updated_at` and `ShoppingListLine.created_at` to keep results deterministic when timestamps tie.
   - Return the hydrated line objects; let the API layer convert to schema instances.

2. **Concept-only add helper**
   - In `ShoppingListLineService`, create `add_part_to_concept_list(list_id: int, part_id: int, needed: int, *, seller_id: int | None = None, note: str | None = None)`.
   - Load the list via `_get_list_for_update` and raise `InvalidOperationException` if `status` is not `ShoppingListStatus.CONCEPT`.
   - Ensure the part exists (reuse `_ensure_part_exists`) and seller (via `seller_service`) before adding.
   - Delegate to the existing `add_line` method so duplicate prevention, metrics, and shared invariants stay centralized, then re-fetch the line so `shopping_list`, `part`, and `seller` relationships are populated for schema conversion.
   - Touch the parent list timestamp to keep list ordering accurate for the membership query.

3. **Schema definitions**
   - Add `app/schemas/part_shopping_list.py` with:
     - `PartShoppingListMembershipSchema` capturing `shopping_list_id`, `shopping_list_name`, `shopping_list_status`, `line_id`, `line_status`, `needed`, `ordered`, `received`, `seller` (using `SellerListSchema | None`), and `note`. Configure `model_config = ConfigDict(from_attributes=True)` to support ORM input.
     - `PartShoppingListMembershipCreateSchema` holding `shopping_list_id`, `needed`, optional `seller_id`, and `note` with validation (`ge=1` for needed) that mirrors the Phase 3 form fields.
   - If helpful, add a lightweight helper (e.g., `from_line` classmethod) to translate a `ShoppingListLine` instance into the membership schema payload.

4. **API routes**
   - In `app/api/parts.py`, import the new schemas and services.
   - `GET /api/parts/<part_key>/shopping-list-memberships`:
     - Resolve the part using `part_service.get_part(part_key)` so a missing key still returns 404.
     - Call `shopping_list_service.list_part_memberships(part.id)` and convert to `PartShoppingListMembershipSchema` objects.
     - Return a 200 with the serialized list; the consumer can render badges and decide whether to show the part tile icon.
   - `POST /api/parts/<part_key>/shopping-list-memberships`:
     - Validate the payload against `PartShoppingListMembershipCreateSchema`.
     - Resolve the part to obtain `id`, then call `shopping_list_line_service.add_part_to_concept_list`.
     - Serialize the resulting line via `PartShoppingListMembershipSchema` (capturing the parent list name/status); respond with 201.
     - Propagate domain errors (`InvalidOperationException` for non-Concept lists or duplicates) via existing error handling so the UI gets 400 messages consistent with earlier phases.

5. **Tests**
   - Extend `TestShoppingListService` with scenarios covering:
     - Lists in Concept and Ready returning memberships, but Done lists/lines being excluded.
     - Sorting precedence (`ShoppingListLine.updated_at` descending) and note/seller data present when applicable.
   - Extend `TestShoppingListLineService` to verify:
     - `add_part_to_concept_list` succeeds for Concept lists and populates seller overrides.
     - The method rejects Ready/Done lists with the expected `InvalidOperationException` message.
     - Duplicate inserts still raise the existing duplicate error.
   - In `tests/test_parts_api.py`, add API coverage for:
     - GET membership payload including list names/statuses for multiple lists.
     - POST success (201) returning the new membership summary and persisting data.
     - POST failure when the target list is not Concept, confirming we surface the 400 error message.
     - GET/POST with an unknown part key returning 404.
   - Use existing fixtures (`container`, `client`, `session`) and commit between setup steps so timestamps/order assertions are deterministic.
