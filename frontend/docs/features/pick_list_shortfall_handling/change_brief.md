# Change Brief: Pick List Shortfall Handling

## Summary

Enhance the pick list creation dialog to support shortfall handling. When a user attempts to create a pick list and some parts don't have sufficient inventory, the dialog should guide them through choosing how to handle each shortfall before submitting.

## Functional Requirements

### Two-Step Dialog Flow

**Step 1: Enter Requested Units**
- User enters the number of kit units to build (existing behavior)
- User clicks "Continue" button
- Frontend calculates which parts have shortfall based on `requestedUnits * requiredPerUnit > available`
- If no parts have shortfall, proceed directly to create the pick list (skip step 2)
- If parts have shortfall, transition to step 2

**Step 2: Shortfall Handling (conditional)**
- Display a list of parts that have insufficient stock
- For each part, show:
  - Part key and description
  - Required quantity vs available quantity
  - Shortfall amount
- For each part, present two action options (radio buttons):
  - **Limit**: "Include only what's available" - reduces quantity to available stock
  - **Omit**: "Skip this part entirely" - excludes part from pick list
- **No default selection** - user must explicitly choose an action for every shortfall part
- Submit button remains disabled until all parts have an action selected
- User can cancel to abort (equivalent to "reject" behavior)

### API Integration

- When submitting with shortfall handling, include the `shortfall_handling` field in the request body
- Format: `{ "PART_KEY": { "action": "limit" | "omit" }, ... }`
- Only include parts where user selected "limit" or "omit"

### Error Handling

- If all parts would be omitted, let the backend reject with 409 error
- Display the error using the standard toast/error mechanism
- No frontend-side prevention of this scenario

## Out of Scope

- "Reject" action in the UI (cancel button serves this purpose)
- Bulk "apply to all" actions
- Live recalculation of shortfall as user types units
