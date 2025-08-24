# Parts Backend API Implementation Plan

## Brief Description

Implement the complete backend API for electronics parts management, including CRUD operations, location assignments, quantity tracking, and inventory management. This includes the core part model, part-location relationships, quantity history, and all API endpoints for managing parts within the storage system.

## Database Models to Create

### 1. Parts Table (`app/models/part.py`)
- `id` (INT, auto-increment, primary key) - surrogate key for relationships
- `id4` (CHAR(4), unique, not null) - business key, 4 uppercase letters (e.g., "BZQP") 
- `manufacturer_code` (VARCHAR(255), nullable) - e.g., "OMRON G5Q-1A4"
- `type_id` (INT, foreign key to types.id, nullable) - category reference
- `description` (TEXT, not null) - free text description
- `image_url` (VARCHAR(500), nullable) - S3 URL for main part image
- `tags` (TEXT[], nullable) - PostgreSQL array of tags
- `seller` (VARCHAR(255), nullable) - vendor/supplier name
- `seller_link` (VARCHAR(500), nullable) - product page URL
- `created_at` (DATETIME, not null, default now())
- `updated_at` (DATETIME, not null, default now(), on update now())

### 2. Types Table (`app/models/type.py`)
- `id` (INT, auto-increment, primary key)
- `name` (VARCHAR(100), unique, not null) - e.g., "Relay", "Resistor", "IC"
- `created_at` (DATETIME, not null, default now())
- `updated_at` (DATETIME, not null, default now(), on update now())

### 3. Part Locations Table (`app/models/part_location.py`) 
- `id` (INT, auto-increment, primary key)
- `part_id4` (CHAR(4), foreign key to parts.id4, not null)
- `box_no` (INT, not null) - denormalized for queries
- `loc_no` (INT, not null) - denormalized for queries
- `location_id` (INT, foreign key to locations.id, not null) - referential integrity
- `qty` (INT, not null, check > 0) - quantity at this location
- `created_at` (DATETIME, not null, default now())
- `updated_at` (DATETIME, not null, default now(), on update now())
- Unique constraint on (part_id4, box_no, loc_no)

### 4. Quantity History Table (`app/models/quantity_history.py`)
- `id` (INT, auto-increment, primary key) 
- `part_id4` (CHAR(4), foreign key to parts.id4, not null)
- `delta_qty` (INT, not null) - positive for additions, negative for removals
- `location_reference` (VARCHAR(20), nullable) - "box_no-loc_no" for context
- `timestamp` (DATETIME, not null, default now())

## Service Layer Files to Create

### 1. `app/services/part_service.py`
- `generate_part_id4(db: Session) -> str` - Generate unique 4-letter ID with collision handling
- `create_part(db: Session, manufacturer_code: str, type_id: int, description: str, ...) -> Part`
- `get_part(db: Session, part_id4: str) -> Part | None`
- `get_parts_list(db: Session, limit: int, offset: int) -> list[Part]`  
- `update_part_details(db: Session, part_id4: str, **kwargs) -> Part | None`
- `delete_part(db: Session, part_id4: str) -> bool`
- `get_total_quantity(db: Session, part_id4: str) -> int`

### 2. `app/services/type_service.py`
- `create_type(db: Session, name: str) -> Type`
- `get_all_types(db: Session) -> list[Type]`
- `get_type(db: Session, type_id: int) -> Type | None`
- `update_type(db: Session, type_id: int, name: str) -> Type | None`
- `delete_type(db: Session, type_id: int) -> bool`

### 3. `app/services/inventory_service.py`
- `add_stock(db: Session, part_id4: str, box_no: int, loc_no: int, qty: int) -> PartLocation`
- `remove_stock(db: Session, part_id4: str, box_no: int, loc_no: int, qty: int) -> bool`
- `move_stock(db: Session, part_id4: str, from_box: int, from_loc: int, to_box: int, to_loc: int, qty: int) -> bool`
- `get_part_locations(db: Session, part_id4: str) -> list[PartLocation]`
- `suggest_location(db: Session, type_id: int) -> tuple[int, int] | None`
- `cleanup_zero_quantities(db: Session, part_id4: str) -> None` - Remove all location assignments when total qty = 0

## API Schema Files to Create

### 1. `app/schemas/part.py`
- `PartCreateSchema` - manufacturer_code, type_id, description, tags, seller, seller_link
- `PartUpdateSchema` - same fields as create, all optional
- `PartResponseSchema` - full part details with relationships
- `PartListSchema` - lightweight for listings (id4, manufacturer_code, description, total_qty)
- `PartLocationResponseSchema` - part location details with quantity

### 2. `app/schemas/type.py`  
- `TypeCreateSchema` - name
- `TypeUpdateSchema` - name
- `TypeResponseSchema` - id, name, created_at, updated_at

### 3. `app/schemas/inventory.py`
- `AddStockSchema` - box_no, loc_no, qty
- `RemoveStockSchema` - box_no, loc_no, qty  
- `MoveStockSchema` - from_box_no, from_loc_no, to_box_no, to_loc_no, qty
- `LocationSuggestionSchema` - box_no, loc_no

## API Endpoint Files to Create

### 1. `app/api/parts.py`
- `POST /parts` - Create new part
- `GET /parts` - List parts with pagination, optional type filter
- `GET /parts/{part_id4}` - Get single part with full details
- `PUT /parts/{part_id4}` - Update part details
- `DELETE /parts/{part_id4}` - Delete part (only if total quantity is 0)
- `GET /parts/{part_id4}/locations` - Get all locations for a part
- `GET /parts/{part_id4}/history` - Get quantity change history

### 2. `app/api/types.py`
- `POST /types` - Create part type
- `GET /types` - List all types  
- `GET /types/{type_id}` - Get single type
- `PUT /types/{type_id}` - Update type name
- `DELETE /types/{type_id}` - Delete type (only if no parts use it)

### 3. `app/api/inventory.py` 
- `POST /parts/{part_id4}/stock` - Add stock to location
- `DELETE /parts/{part_id4}/stock` - Remove stock from location
- `POST /parts/{part_id4}/move` - Move stock between locations
- `GET /inventory/suggestions/{type_id}` - Get location suggestions for part type

## Database Migration

### 1. `alembic/versions/003_create_parts_tables.py`
- Create types table
- Create parts table with 4-character ID and foreign key to types
- Create part_locations table with foreign keys and constraints
- Create quantity_history table
- Add indexes for performance:
  - parts.id4 (unique)
  - parts.type_id 
  - part_locations.part_id4
  - part_locations composite (box_no, loc_no)
  - quantity_history.part_id4, quantity_history.timestamp

## Key Algorithms

### 1. Part ID Generation Algorithm
```
1. Generate random 4 uppercase letters (A-Z)
2. Try to insert into database
3. If unique constraint violation, retry with new ID
4. Return generated ID (maximum 3 attempts before error)
```

### 2. Location Suggestion Algorithm  
```
1. Find locations already containing same type_id parts (prefer same category)
2. If none, find designated boxes for this type (future enhancement)
3. Otherwise, find first available location ordered by box_no, loc_no
4. Return (box_no, loc_no) or None if no space
```

### 3. Zero Quantity Cleanup Algorithm
```
1. When removing stock, calculate new total quantity
2. If total reaches exactly 0:
   a. Delete all part_location records for this part
   b. Add history entry with negative delta
3. If total would go negative, reject the operation
```

### 4. Stock Movement Algorithm
```
1. Validate source location has sufficient quantity
2. Validate destination location exists
3. Begin transaction:
   a. Reduce quantity at source (delete record if becomes 0)
   b. Increase quantity at destination (create record if new)
   c. Add history entries for both operations
4. Commit transaction
```

## Blueprint Registration

Update `app/__init__.py` to register new blueprints:
- `app.register_blueprint(parts_bp)`
- `app.register_blueprint(types_bp)` 
- `app.register_blueprint(inventory_bp)`

## Business Rules Implementation

### 1. Part ID Uniqueness
- Database enforces unique constraint on parts.id4
- Service layer handles collision retries during generation

### 2. Zero Quantity Cleanup  
- Automatically triggered in inventory_service.remove_stock()
- All part_locations deleted when total quantity = 0
- Part record persists for historical data

### 3. Location Validation
- All location references validated against existing locations table
- Foreign key constraints ensure referential integrity

### 4. Quantity Constraints
- part_locations.qty must be > 0 (database check constraint)
- Stock removal operations validate sufficient quantity exists

## Testing Files to Create

### 1. `tests/test_part_service.py`
- Test part creation with ID generation
- Test part CRUD operations
- Test ID collision handling

### 2. `tests/test_inventory_service.py` 
- Test stock addition/removal/movement
- Test zero quantity cleanup
- Test location suggestions

### 3. `tests/test_parts_api.py`
- Test all part API endpoints
- Test validation and error cases

### 4. `tests/test_types_api.py`
- Test type management APIs

### 5. `tests/test_inventory_api.py`
- Test inventory management endpoints

This plan provides the complete backend foundation for parts management, following the established patterns from the box/location implementation while adding the inventory tracking and part relationship functionality required by the product specifications.