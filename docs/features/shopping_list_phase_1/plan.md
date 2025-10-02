# Shopping List Phase 1 Backend Implementation Plan

## Brief Description

Implement the foundational shopping list functionality (Concept lists) that allows users to create, manage, and compose shopping lists with parts, quantities, and notes. This phase focuses on the basic list management and line item CRUD operations with duplicate prevention, setting the stage for the ordering workflow in Phase 2.

## Files to Create or Modify

### Database Models

**Create `app/models/shopping_list.py`:**
- `ShoppingList` model with fields:
  - `id` (primary key)
  - `name` (required, unique)
  - `description` (optional)
  - `status` (enum: "concept", "ready", "done", defaults to "concept")
    - Note: "done" status represents archived/completed lists that are hidden by default in the UI
  - `created_at`, `updated_at` (timestamps)
  - Relationship to `ShoppingListLine` with cascade delete
  - Relationship configured as `lines = relationship("ShoppingListLine", back_populates="shopping_list", cascade="all, delete-orphan", lazy="selectin")`

**Create `app/models/shopping_list_line.py`:**
- `ShoppingListLine` model with fields:
  - `id` (primary key)
  - `shopping_list_id` (foreign key to ShoppingList, required)
  - `part_id` (foreign key to Part, required)
  - `seller_id` (foreign key to Seller, optional - seller override)
  - `needed` (integer ≥ 1, required)
  - `ordered` (integer, default 0)
  - `received` (integer, default 0)
  - `note` (text, optional)
  - `status` (enum: "new", "ordered", "done", defaults to "new")
  - `created_at`, `updated_at` (timestamps)
  - Unique constraint on (shopping_list_id, part_id) for duplicate prevention
  - Check constraint: needed ≥ 1
  - Relationships configured as:
    - `shopping_list = relationship("ShoppingList", back_populates="lines", lazy="selectin")`
    - `part = relationship("Part", lazy="selectin")`
    - `seller = relationship("Seller", lazy="selectin")`

**Modify `app/models/__init__.py`:**
- Add imports for ShoppingList and ShoppingListLine

### Pydantic Schemas

**Create `app/schemas/shopping_list.py`:**
- `ShoppingListCreateSchema`: name (required), description (optional)
- `ShoppingListUpdateSchema`: name (optional), description (optional)
- `ShoppingListStatusUpdateSchema`: status (enum)
- `ShoppingListResponseSchema`: all fields + lines count by status
- `ShoppingListListSchema`: lightweight listing with id, name, description, status, line counts, last_updated

**Create `app/schemas/shopping_list_line.py`:**
- `ShoppingListLineCreateSchema`: part_id (required), seller_id (optional), needed (≥1), note (optional)
- `ShoppingListLineUpdateSchema`: seller_id (optional), needed (≥1), note (optional)
- `ShoppingListLineResponseSchema`: all fields + computed part and seller details
- `ShoppingListLineListSchema`: lightweight version for list views

### Services

**Create `app/services/shopping_list_service.py`:**
- `ShoppingListService(BaseService)` with methods:
  - `create_list(name, description=None)`: Create new list in concept status
  - `get_list(list_id)`: Get list with lines
  - `update_list(list_id, **kwargs)`: Update name/description
  - `delete_list(list_id)`: Delete list (cascade deletes lines)
  - `set_list_status(list_id, status)`: Change list status with validation
  - `list_lists(include_done=False)`: Get all lists with line counts (optionally include done lists)
  - `get_list_stats(list_id)`: Get line counts by status

**Create `app/services/shopping_list_line_service.py`:**
- `ShoppingListLineService(BaseService)` with methods:
  - `add_line(list_id, part_id, needed, seller_id=None, note=None)`: Add line with duplicate check
  - `update_line(line_id, **kwargs)`: Update line details
  - `delete_line(line_id)`: Remove line from list
  - `list_lines(list_id, include_done=True)`: Get all lines for a list
  - `check_duplicate(list_id, part_id)`: Check if part already on list

**Modify `app/services/container.py`:**
- Add `shopping_list_service` provider
- Add `shopping_list_line_service` provider with dependency on `part_service` and `seller_service`

### API Endpoints

**Create `app/api/shopping_lists.py`:**
- `POST /shopping-lists`: Create new list
- `GET /shopping-lists`: List all lists (query param: include_done)
- `GET /shopping-lists/{list_id}`: Get list details with lines
- `PUT /shopping-lists/{list_id}`: Update list name/description
- `DELETE /shopping-lists/{list_id}`: Delete list
- `PUT /shopping-lists/{list_id}/status`: Update list status

**Create `app/api/shopping_list_lines.py`:**
- `POST /shopping-lists/{list_id}/lines`: Add line to list
- `PUT /shopping-list-lines/{line_id}`: Update line
- `DELETE /shopping-list-lines/{line_id}`: Delete line
- `GET /shopping-lists/{list_id}/lines`: List lines (query param: include_done)

**Modify `app/api/__init__.py`:**
- Register shopping list blueprints

**Modify `app/__init__.py` (application factory):**
- Add `app.api.shopping_lists` and `app.api.shopping_list_lines` to the container wiring list (around line 53)

### Tests

- `tests/services/test_shopping_list_service.py`: Service CRUD, status transitions, duplicate handling
- `tests/services/test_shopping_list_line_service.py`: Line CRUD, duplicate prevention, read-only fields
- `tests/api/test_shopping_lists_api.py`: List endpoints, validation, status codes
- `tests/api/test_shopping_list_lines_api.py`: Line endpoints, validation, error responses

### Database Migration

**Create `alembic/versions/013_create_shopping_lists.py`:**
- Create `shopping_lists` table
- Create `shopping_list_lines` table with:
  - Foreign keys to shopping_lists, parts, and sellers
  - Unique constraint on (shopping_list_id, part_id)
  - Check constraint on needed ≥ 1
  - Indexes on shopping_list_id, part_id, status

### Test Dataset Updates

- Update `app/data/test_data/sellers.json` and `app/data/test_data/parts.json` if new fixture sellers/parts are required for shopping list coverage.
- Add new shopping list fixture files (e.g., `shopping_lists.json`, `shopping_list_lines.json`) storing realistic scenarios, including duplicate prevention and status coverage.
- Extend `app/services/test_data_service.py` to load the new shopping list fixtures in dependency order.
- Ensure `poetry run python -m app.cli load-test-data --yes-i-am-sure` succeeds after the schema and dataset updates.

## Algorithms

### Duplicate Prevention Algorithm

When adding a line to a shopping list:
1. Query for existing line with same (shopping_list_id, part_id)
2. If exists, raise `InvalidOperationException` with message directing user to edit existing line
3. If not exists, create new line

### Status Transition Validation

For list status changes:
1. **Concept → Ready**: Always allowed if list has ≥1 line
2. **Ready → Concept**: Only allowed if no lines have status="ordered"
3. **Ready → Done**: Allowed when user explicitly marks list as complete (manual action)
4. **Concept → Done**: Not allowed (must go through Ready)
5. **Done → Any other status**: Not allowed (Done is final)
6. Validate business rules before persisting status change

### Line Status Rules

Phase 1 constraints (IMPORTANT):
1. Lines can only be status="new" in Phase 1 (no "ordered" or "done" status transitions allowed)
2. The `ordered` field must remain at 0 - any attempt to set ordered > 0 should raise `InvalidOperationException`
3. The `received` field must remain at 0 - any attempt to set received > 0 should raise `InvalidOperationException`
4. These fields exist in the schema for Phase 2 compatibility but are read-only in Phase 1
5. The ordering workflow that modifies these fields will be implemented in Phase 2

## Error Handling

- `RecordNotFoundException`: When list or line doesn't exist
- `InvalidOperationException`: For duplicate parts, invalid status transitions, constraint violations
- All errors should include clear user-friendly messages

## Testing Requirements

### Service Tests
- Test all CRUD operations for lists and lines
- Test duplicate prevention with same part on same list
- Test status transition validation
- Test cascade deletion
- Test line count aggregation

### API Tests
- Test all endpoints with valid/invalid data
- Test request validation (missing required fields, invalid types)
- Test proper HTTP status codes (201 for create, 200 for success, 404 for not found, 400 for validation errors)
- Test response schemas match specifications

### Database Tests
- Test unique constraint on (shopping_list_id, part_id)
- Test cascade delete behavior
- Test check constraint on needed ≥ 1
- Test foreign key relationships
