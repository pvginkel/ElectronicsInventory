# API Error Reporting Technical Specification

## Overview

This document specifies how the Electronics Inventory API handles and reports errors. The API uses a consistent, structured approach to error reporting.

## Error Response Structure

All API error responses follow a consistent JSON structure:

```json
{
  "error": "Human-readable error message",
  "details": "Additional context or technical details"
}
```

### Field Specifications

- **`error`**: Human-readable error message suitable for display to users
- **`details`**: Additional technical context, may be a string or array of strings

## HTTP Status Codes

The API uses standard HTTP status codes to categorize different types of errors:

| Status Code | Meaning | When Used |
|-------------|---------|-----------|
| `400` | Bad Request | Invalid input, business rule violations |
| `404` | Not Found | Resource doesn't exist |
| `409` | Conflict | Resource already exists, insufficient quantities |
| `422` | Unprocessable Entity | Request validation failures |
| `500` | Internal Server Error | Unexpected server errors |

## Error Categories

### 1. Validation Errors (400/422)

**Trigger**: Request data fails validation (Pydantic schema validation)

**Response Structure**: For field-level validation errors, the `details` field contains an array of field error strings:

```json
{
  "error": "Validation failed",
  "details": [
    "description: Field required",
    "capacity: Ensure this value is greater than 0"
  ]
}
```

**Field Error Format**: `"field_name: Error message"`

### 2. Business Logic Errors (400/409)

**Trigger**: Operation violates business rules or domain constraints

**Examples**:
- Deleting a box that contains parts
- Insufficient inventory quantities  
- Invalid operations based on current state

```json
{
  "error": "Cannot delete box 5 because it contains parts that must be moved or removed first",
  "details": "The requested operation cannot be performed"
}
```

### 3. Resource Not Found (404)

**Trigger**: Requested resource doesn't exist

```json
{
  "error": "Box 999 was not found",
  "details": "The requested resource could not be found"
}
```

### 4. Resource Conflicts (409)

**Trigger**: Resource conflicts or insufficient resources

**Examples**:
- Duplicate resources
- Insufficient quantities for operations
- Resource capacity exceeded

```json
{
  "error": "Not enough parts available at 7-3 (requested 10, have 5)",
  "details": "The requested quantity is not available"
}
```

## Endpoint-Specific Error Patterns

### Box Management

#### POST /api/boxes (Create Box)
- **400**: Invalid capacity (≤ 0), missing description, validation failures
- **409**: Database constraint violations

#### GET /api/boxes/{box_no} (Get Box)
- **404**: Box doesn't exist

#### PUT /api/boxes/{box_no} (Update Box)
- **400**: Invalid capacity, description, or validation failures
- **404**: Box doesn't exist

#### DELETE /api/boxes/{box_no} (Delete Box)
- **400**: Box contains parts that must be removed first
- **404**: Box doesn't exist

### Inventory Management

#### POST /api/inventory/parts/{part_id}/stock (Add Stock)
- **400**: Invalid quantity (≤ 0), invalid operation parameters
- **404**: Part or location not found

#### DELETE /api/inventory/parts/{part_id}/stock (Remove Stock)
- **400**: Invalid quantity, business rule violations
- **404**: Part not found at specified location
- **409**: Insufficient quantity available

#### PUT /api/inventory/parts/{part_id}/move (Move Stock)
- **400**: Invalid operation parameters
- **404**: Source or destination location not found
- **409**: Insufficient quantity at source location

## Domain-Specific Error Messages

The API generates context-specific error messages for common scenarios:

### Box Operations
- `"Box {box_no} was not found"`
- `"Cannot delete box {box_no} because it contains parts that must be moved or removed first"`

### Inventory Operations
- `"Location {box_no}-{loc_no} was not found"`
- `"Part location {part_id} at {box_no}-{loc_no} was not found"`
- `"Not enough parts available at {box_no}-{loc_no} (requested {requested}, have {available})"`
- `"Cannot {operation} because {reason}"`

### Validation Messages
- `"Field required"`
- `"Ensure this value is greater than {min_value}"`
- `"String too short"`
- `"Invalid {field_type} format"`