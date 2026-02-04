# Change Brief: Pick List Shortfall Handling

## Summary

Add the ability to specify how to handle shortfall when creating pick lists for kits. Currently, creating a pick list fails with a 409 error if any part has insufficient stock. This change allows the frontend to specify per-part handling strategies for parts with shortfall.

## Motivation

Users may register components they don't (yet) track inventory of - either because they haven't booked it in, or it's bulk material they won't track. The current all-or-nothing behavior prevents creating pick lists in these scenarios.

## Functional Requirements

### Request Payload Change

The `POST /api/kits/<kit_id>/pick-lists` endpoint will accept an optional `shortfall_handling` field:

```json
{
  "requested_units": 2,
  "shortfall_handling": {
    "ABCD": { "action": "limit" },
    "DEFG": { "action": "omit" }
  }
}
```

The `shortfall_handling` map is keyed by **part ID** (the 4-character string identifier).

### Shortfall Actions

Three actions are supported:

1. **`reject`** (default): Reject creating the pick list if there is shortfall for this part. This mirrors the current behavior.

2. **`limit`**: Limit the quantity in the pick list to what is currently available in stock. If 100 units are required but only 60 are available, create pick list lines for 60 units.

3. **`omit`**: Omit the part entirely from the pick list. No `KitPickListLine` rows are created for this part.

### Edge Cases

- If a part is not included in `shortfall_handling`, it defaults to `reject` behavior.
- If all parts would be omitted (resulting in zero lines), reject the request.
- If all parts are limited to zero quantity, still create the pick list (empty but valid).
- Reservation behavior is unchanged - available quantity still excludes reservations from other active kits.

### Frontend Responsibility

The frontend already knows if there is shortfall (via kit detail response). When shortfall is detected, the frontend will prompt the user to specify handling for each affected part before submitting the request.
