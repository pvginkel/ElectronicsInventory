# Frontend Impact: Pick List Shortfall Handling

## Overview

The backend now supports specifying how to handle stock shortfall when creating pick lists. This allows users to create pick lists even when some parts don't have sufficient inventory.

## User Workflow

### Current Flow (unchanged when no shortfall)

1. User views kit detail
2. User clicks "Create Pick List"
3. User enters requested units
4. Pick list is created

### New Flow (when shortfall detected)

1. User views kit detail
2. User clicks "Create Pick List"
3. Frontend sees shortfall from kit contents (parts where `shortfall > 0`)
4. User enters requested units
5. **NEW**: If shortfall exists, frontend prompts user to choose handling for each affected part:
   - **Limit**: "Include only what's available"
   - **Omit**: "Skip this part entirely"
   - The backend also accepts a Reject option. Do not include this. The dialog has a Cancel button, which has the same effect. Instead, leave all options to an empty default and require the user to pick something before submitting the dialog.
6. Frontend submits request with shortfall handling choices
7. Pick list is created (or rejected if any parts have `reject` handling)

## API Changes

### Endpoint

`POST /api/kits/<kit_id>/pick-lists`

### Request Schema (updated)

```json
{
  "requested_units": 2,
  "shortfall_handling": {
    "ABCD": { "action": "limit" },
    "DEFG": { "action": "omit" }
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `requested_units` | integer | Yes | Number of kit units to build |
| `shortfall_handling` | object | No | Map of part key → action. Omit entirely if no shortfall or all parts should reject. |

### Shortfall Handling Object

The `shortfall_handling` field is a map where:
- **Keys**: Part keys (4-character strings like `"ABCD"`)
- **Values**: Objects with an `action` field

```json
{ "action": "reject" | "limit" | "omit" }
```

### Actions

| Action | Behavior | Use Case |
|--------|----------|----------|
| `reject` | Fails pick list creation if part has shortfall | Default. User wants full quantity or nothing. |
| `limit` | Reduces quantity to what's available | User will proceed with partial stock. |
| `omit` | Excludes part from pick list entirely | User has bulk/untracked stock or will source elsewhere. |

### Response Codes

| Code | Condition |
|------|-----------|
| 201 | Pick list created successfully |
| 400 | Invalid request (e.g., invalid action value, missing `action` field) |
| 404 | Kit not found |
| 409 | Cannot create pick list (parts with `reject` action have shortfall, or all parts would be omitted) |

### Error Response Format (409)

When parts with `reject` handling have shortfall:
```json
{
  "error": "insufficient stock for parts with reject handling: ABCD, EFGH"
}
```

When all parts would be omitted:
```json
{
  "error": "all parts would be omitted; cannot create empty pick list"
}
```

## Preview Endpoint (Recommended)

Use the preview endpoint to get accurate shortfall information for a specific `requested_units` value. This avoids duplicating the complex reservation and availability calculations in the frontend.

### Endpoint

`POST /api/kits/<kit_id>/pick-lists/preview`

### Request

```json
{
  "requested_units": 10
}
```

### Response

```json
{
  "parts_with_shortfall": [
    {
      "part_key": "ABCD",
      "required_quantity": 20,
      "usable_quantity": 15,
      "shortfall_amount": 5
    }
  ]
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `part_key` | string | 4-character part identifier |
| `required_quantity` | integer | Total quantity needed for requested units |
| `usable_quantity` | integer | Quantity available after accounting for reservations |
| `shortfall_amount` | integer | How many units short (`required - usable`) |

### Response Codes

| Code | Condition |
|------|-----------|
| 200 | Preview calculated successfully |
| 400 | Invalid request (e.g., `requested_units < 1`) |
| 404 | Kit not found |

**Note**: An empty `parts_with_shortfall` array means all parts have sufficient stock.

## Frontend Implementation Guide

### Step 1: Check for Shortfall Using Preview Endpoint

When user clicks "Create Pick List" and enters `requested_units`:

```typescript
const previewResponse = await fetch(`/api/kits/${kitId}/pick-lists/preview`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ requested_units: requestedUnits }),
});

const preview = await previewResponse.json();

if (preview.parts_with_shortfall.length > 0) {
  // Show shortfall handling dialog with preview.parts_with_shortfall
} else {
  // No shortfall - submit without shortfall_handling
}
```

### Step 2: Collect User Choices

Display a dialog/modal using the preview data. For each part in `parts_with_shortfall`:

```
Part ABCD (Capacitor 100nF):
  Required: 20, Available: 15, Short by: 5

  ○ Limit - Include only 15 available
  ○ Omit - Skip this part

Part EFGH (LED Red 5mm):
  Required: 50, Available: 0, Short by: 50

  ○ Limit - Include only 0 available
  ○ Omit - Skip this part
```

**Note**: Do not show a "Reject" option in the UI. The Cancel button serves the same purpose. Require the user to select either Limit or Omit for each part before enabling the submit button.

### Step 3: Build Request

```typescript
interface ShortfallAction {
  action: 'reject' | 'limit' | 'omit';
}

interface CreatePickListRequest {
  requested_units: number;
  shortfall_handling?: Record<string, ShortfallAction>;
}

// Build request from user choices
const request: CreatePickListRequest = {
  requested_units: requestedUnits,
};

if (Object.keys(userChoices).length > 0) {
  request.shortfall_handling = {};
  for (const [partKey, action] of Object.entries(userChoices)) {
    if (action !== 'reject') {
      // Only include non-default actions
      request.shortfall_handling[partKey] = { action };
    }
  }
}
```

**Note**: You can omit `shortfall_handling` entirely or omit parts with `reject` action since `reject` is the default. However, including explicit `reject` entries is also valid.

### Step 4: Handle Response

```typescript
try {
  const response = await fetch(`/api/kits/${kitId}/pick-lists`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (response.status === 201) {
    // Success - navigate to pick list
    const pickList = await response.json();
    navigateTo(`/pick-lists/${pickList.id}`);
  } else if (response.status === 409) {
    // Conflict - show error message
    const error = await response.json();
    showError(error.error);
  } else if (response.status === 400) {
    // Validation error
    const error = await response.json();
    showError(error.error);
  }
} catch (e) {
  showError('Failed to create pick list');
}
```

## Edge Cases

| Scenario | Backend Behavior | Frontend Handling |
|----------|------------------|-------------------|
| No shortfall | Creates pick list normally | Don't send `shortfall_handling` |
| All parts `reject` | Returns 409 with part list | Show error, let user change choices |
| All parts `omit` | Returns 409 "all parts would be omitted" | Show error, require at least one non-omit part |
| All parts `limit` to 0 | Creates empty pick list (valid) | Allow this - user may want to track the attempt |
| Unknown part key in map | Silently ignored | No special handling needed |
| Part without shortfall in map | Action is ignored, full quantity used | No special handling needed |

## Example Requests

### No shortfall handling (backward compatible)
```json
POST /api/kits/1/pick-lists
{
  "requested_units": 2
}
```

### Mixed handling
```json
POST /api/kits/1/pick-lists
{
  "requested_units": 2,
  "shortfall_handling": {
    "ABCD": { "action": "limit" },
    "EFGH": { "action": "omit" }
  }
}
```

### Explicit reject (optional, same as omitting the key)
```json
POST /api/kits/1/pick-lists
{
  "requested_units": 2,
  "shortfall_handling": {
    "ABCD": { "action": "reject" }
  }
}
```
