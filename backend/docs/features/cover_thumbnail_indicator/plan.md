**Brief Description**
- The front-end currently infers cover-thumbnail availability by waiting for a 404 from `/documents/<part_key>/cover/thumbnail`. We need to expose a boolean in the part detail response and in the PartWithTotalAndLocationsSchema-based listings indicating whether the part simply has a cover attachment defined, mirroring the check in the thumbnail endpoint.

**Relevant Files & Functions**
- `app/models/part.py` (`Part` dataclass + relationships): add a property that answers whether the part has a cover attachment assigned.
- `app/schemas/part.py` (`PartResponseSchema`, `PartWithTotalSchema`, `PartWithTotalAndLocationsSchema`): expose the new boolean field and document it in the API schema, ensuring ORM integration picks up the new model property.
- `app/api/parts.py` (`_convert_part_to_schema_data` helper + list endpoints): include the boolean in list responses that currently return plain dicts instead of letting Pydantic render them.
- `tests/test_parts_api.py` (API coverage for list/detail endpoints): extend assertions to cover the new field for both positive and negative cases, including parts without covers.

**Implementation Steps**
1. Model helper
   - Add a read-only property on `Part` (e.g., `has_cover_attachment`) that returns `bool(self.cover_attachment_id)`; avoid touching the relationship so list queries don’t incur extra lazy loads.
2. Schema updates
   - Introduce a `has_cover_attachment: bool` field on `PartResponseSchema` (likely a `@computed_field`) with clear description/example, wired to the new `Part` property so `model_validate` picks it up when serialising individual part responses.
   - Add the same field to `PartWithTotalSchema` so every payload returned by list endpoints (including the front-end's PartWithTotalAndLocationsSchemaList output) exposes the flag; ensure inheritance propagates it to `PartWithTotalAndLocationsSchema`.
3. API wiring
   - Extend `_convert_part_to_schema_data` in `app/api/parts.py` to populate `has_cover_attachment` from the model property when building list responses.
   - Double-check any other manual dict construction (e.g., within `/parts/with-locations`) to confirm the field is present after adding it to the shared helper.
4. Documentation / discoverability
   - No external docs required beyond schema descriptions, but confirm Spectree/OpenAPI output now lists the new field for both endpoints the front-end consumes.

**Testing Strategy**
- Update existing API tests to assert `has_cover_attachment` defaults to `False` when no cover is configured and flips to `True` after assigning a cover attachment, using standard fixtures to create an attachment via the document service and mark it as the cover.
- Ensure list and detail responses both surface the field so the front end can avoid probing the thumbnail route for existence checks.
- Run `poetry run pytest` to confirm full regression coverage once changes land.
