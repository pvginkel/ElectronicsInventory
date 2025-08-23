# Box and Location Management - Technical Plan

## Description

Implement basic box and storage location management for the Electronics Inventory. This includes creating numbered boxes with numbered locations and providing APIs to manage them. The implementation uses surrogate keys (auto-incrementing integer IDs) for database performance while maintaining business logic with box numbers. Advanced features like part assignments, location suggestions, and reorganization planning will be implemented later.

## Database Models (SQLAlchemy 2.x)

### Files to Create:
- `app/models/box.py` - Box model
- `app/models/location.py` - Location model

### Models Structure:

**Box Model** (`app/models/box.py`):
- `id: Mapped[int]` (Primary Key, auto-incrementing surrogate key)
- `box_no: Mapped[int]` (Business identifier, unique, auto-generated sequentially)
- `description: Mapped[str]` (description)
- `capacity: Mapped[int]` (number of locations)
- `created_at: Mapped[datetime]`
- `updated_at: Mapped[datetime]`
- `locations: Mapped[list[Location]]` (relationship)

**Location Model** (`app/models/location.py`):
- `id: Mapped[int]` (Primary Key, auto-incrementing surrogate key)
- `box_id: Mapped[int]` (Foreign Key to boxes.id)
- `box_no: Mapped[int]` (Business identifier for display/logic)
- `loc_no: Mapped[int]` (Location number within box)
- `UniqueConstraint(box_no, loc_no)` (composite unique key for business logic)
- `box: Mapped[Box]` (relationship via box_id)

## Pydantic Schemas

### Files to Create:
- `app/schemas/box.py` - Box request/response schemas
- `app/schemas/location.py` - Location schemas

### Schema Structure:

**Box Schemas** (`app/schemas/box.py`):
- `BoxCreateSchema` - for creating boxes (capacity, required description)
- `BoxResponseSchema` - full box details with locations and description
- `BoxListSchema` - lightweight box list with description

**Location Schemas** (`app/schemas/location.py`):
- `LocationResponseSchema` - location details

## API Endpoints

### Files to Create:
- `app/api/boxes.py` - Box management endpoints
- `app/api/locations.py` - Location management endpoints

### Box Endpoints (`app/api/boxes.py`):
- `POST /boxes` - Create new box with specified capacity
- `GET /boxes` - List all boxes with summary info
- `GET /boxes/{box_no}` - Get box details
- `PUT /boxes/{box_no}` - Update box
- `DELETE /boxes/{box_no}` - Delete empty box
- `GET /boxes/{box_no}/locations` - Get all locations in box

### Location Endpoints (`app/api/locations.py`):
- `GET /locations/{box_no}/{loc_no}` - Get specific location details

## Business Logic Services

### Files to Create:
- `app/services/box_service.py` - Core box and location management

### Box Service (`app/services/box_service.py`):

**Key Functions:**
- `create_box(description: str, capacity: int) -> Box` - Creates box with auto-generated box_no and generates all locations (1 to capacity)
- `get_box_with_locations(box_no: int) -> Box` - Get box with all its locations by business identifier
- `get_all_boxes() -> list[Box]` - List all boxes
- `update_box_capacity(box_no: int, new_capacity: int, new_description: str) -> Box` - Update box capacity and description (validate no conflicts)
- `delete_box(box_no: int) -> bool` - Delete box if empty, return success status

## Database Migrations

### File to Create:
- `alembic/versions/002_create_box_location_tables.py` - Migration for box/location tables

### Migration Contents:
- Create `boxes` table with surrogate primary key (`id`) and unique business key (`box_no`)
- Create `locations` table with surrogate primary key (`id`), foreign key to `boxes.id`, and composite unique constraint (`box_no`, `loc_no`)
- Add proper foreign key constraints using surrogate keys for performance

## Algorithm Details

### Box Number Generation Algorithm:
When creating a new box:
1. Query for maximum existing `box_no` value
2. Assign `next_box_no = max_box_no + 1` (starting from 1 if no boxes exist)
3. Create box with auto-generated surrogate key `id` and business key `box_no`

### Location Generation Algorithm:
When creating a box with capacity N:
1. Generate locations 1 through N
2. Each location gets both surrogate key `id` and business identifiers (`box_id`, `box_no`, `loc_no`)
3. Locations fill left-to-right, top-to-bottom (UI responsibility)
4. Each location gets unique (`box_no`, `loc_no`) pair for business logic

## Files to Modify:
- `app/models/__init__.py` - Import new models (Box, Location)
- `app/schemas/__init__.py` - Import new schemas
- `app/api/__init__.py` - Register new blueprints (boxes_bp, locations_bp)
- `app/__init__.py` - Register blueprints in Flask app

## Testing Requirements:
- Unit tests for box service functions
- API endpoint tests for box CRUD operations
- Database constraint validation tests (unique box numbers, location constraints)