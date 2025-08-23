# Box and Location Management - Technical Plan

## Description

Implement basic box and storage location management for the Electronics Inventory. This includes creating numbered boxes with numbered locations and providing APIs to manage them. Advanced features like part assignments, location suggestions, and reorganization planning will be implemented later.

## Database Models (SQLAlchemy 2.x)

### Files to Create:
- `app/models/box.py` - Box model
- `app/models/location.py` - Location model

### Models Structure:

**Box Model** (`app/models/box.py`):
- `box_no: Mapped[int]` (Primary Key)
- `description: Mapped[str]` (description)
- `capacity: Mapped[int]` (number of locations)
- `created_at: Mapped[datetime]`
- `updated_at: Mapped[datetime]`
- `locations: Mapped[list[Location]]` (relationship)

**Location Model** (`app/models/location.py`):
- `box_no: Mapped[int]` (Foreign Key to boxes)
- `loc_no: Mapped[int]` 
- `UniqueConstraint(box_no, loc_no)` (composite unique key)
- `box: Mapped[Box]` (relationship)

## Pydantic Schemas

### Files to Create:
- `app/schemas/box.py` - Box request/response schemas
- `app/schemas/location.py` - Location schemas

### Schema Structure:

**Box Schemas** (`app/schemas/box.py`):
- `BoxCreateSchema` - for creating boxes (capacity, required description)
- `BoxResponseSchema` - full box details with locations and description
- `BoxListSchema` - lightweight box list with description
- `BoxLocationGridSchema` - box with location grid for UI

**Location Schemas** (`app/schemas/location.py`):
- `LocationResponseSchema` - location details

## API Endpoints

### Files to Create:
- `app/api/boxes.py` - Box management endpoints
- `app/api/locations.py` - Location management endpoints

### Box Endpoints (`app/api/boxes.py`):
- `POST /boxes` - Create new box with specified capacity
- `GET /boxes` - List all boxes with summary info
- `GET /boxes/{box_no}` - Get box details with location grid
- `PUT /boxes/{box_no}` - Update box (capacity changes require validation)
- `DELETE /boxes/{box_no}` - Delete empty box
- `GET /boxes/{box_no}/locations` - Get all locations in box

### Location Endpoints (`app/api/locations.py`):
- `GET /locations/{box_no}/{loc_no}` - Get specific location details

## Business Logic Services

### Files to Create:
- `app/services/box_service.py` - Core box and location management

### Box Service (`app/services/box_service.py`):

**Key Functions:**
- `create_box(capacity: int) -> Box` - Creates box and generates all locations (1 to capacity)
- `get_box_with_locations(box_no: int) -> Box` - Get box with all its locations
- `get_all_boxes() -> list[Box]` - List all boxes
- `update_box_capacity(box_no: int, new_capacity: int) -> Box` - Update box capacity (validate no conflicts)
- `delete_box(box_no: int)` - Delete box if empty
- `get_location_grid(box_no: int) -> dict` - Grid layout for UI display

## Database Migrations

### File to Create:
- `alembic/versions/002_create_box_location_tables.py` - Migration for box/location tables

### Migration Contents:
- Create `boxes` table
- Create `locations` table with composite unique constraint (box_no, loc_no)
- Add foreign key constraint from locations to boxes

## Algorithm Details

### Location Generation Algorithm:
When creating a box with capacity N:
1. Generate locations 1 through N
2. Locations fill left-to-right, top-to-bottom (UI responsibility)
3. Each location gets unique (box_no, loc_no) pair

## Files to Modify:
- `app/models/__init__.py` - Import new models (Box, Location)
- `app/schemas/__init__.py` - Import new schemas
- `app/api/__init__.py` - Register new blueprints (boxes_bp, locations_bp)
- `app/__init__.py` - Register blueprints in Flask app

## Testing Requirements:
- Unit tests for box service functions
- API endpoint tests for box CRUD operations
- Database constraint validation tests (unique box numbers, location constraints)
- Box capacity validation tests