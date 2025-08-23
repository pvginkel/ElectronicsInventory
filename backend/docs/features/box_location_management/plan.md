# Box and Location Management - Technical Plan (Implemented)

## Description

Implement basic box and storage location management for the Electronics Inventory. This includes creating numbered boxes with numbered locations and providing APIs to manage them. The implementation uses surrogate keys (auto-incrementing integer IDs) for database performance while maintaining business logic with box numbers. Advanced features like part assignments, location suggestions, and reorganization planning will be implemented later.

## Database Models (SQLAlchemy 2.x) - ✅ IMPLEMENTED

### Files Created:
- `app/models/box.py` - Box model ✅
- `app/models/location.py` - Location model ✅

### Models Structure (Actual Implementation):

**Box Model** (`app/models/box.py`):
- `id: Mapped[int]` - Primary Key, auto-incrementing surrogate key
- `box_no: Mapped[int]` - Business identifier, unique, auto-generated sequentially 
- `description: Mapped[str]` - Box description (non-nullable)
- `capacity: Mapped[int]` - Number of locations (non-nullable)
- `created_at: Mapped[datetime]` - Auto-set creation timestamp with server_default
- `updated_at: Mapped[datetime]` - Auto-updating timestamp with onupdate
- `locations: Mapped[list[Location]]` - Relationship with cascade="all, delete-orphan" and lazy="selectin"

**Location Model** (`app/models/location.py`):
- `id: Mapped[int]` - Primary Key, auto-incrementing surrogate key
- `box_id: Mapped[int]` - Foreign Key to boxes.id (non-nullable)
- `box_no: Mapped[int]` - Business identifier for display/logic (non-nullable)
- `loc_no: Mapped[int]` - Location number within box (non-nullable)
- `box: Mapped[Box]` - Relationship back to Box
- `UniqueConstraint(box_no, loc_no)` - Composite unique key for business logic

## Pydantic Schemas - ✅ IMPLEMENTED

### Files Created:
- `app/schemas/box.py` - Box request/response schemas ✅
- `app/schemas/location.py` - Location schemas ✅

### Schema Structure (Actual Implementation):

**Box Schemas** (`app/schemas/box.py`):
- `BoxCreateSchema` - For creating boxes (description with min_length=1, capacity > 0)
- `BoxResponseSchema` - Full box details with locations, timestamps, uses from_attributes=True
- `BoxListSchema` - Lightweight box list with box_no, description, capacity only
- `BoxLocationGridSchema` - Additional schema for UI grid display (not used in current API)

**Location Schemas** (`app/schemas/location.py`):
- `LocationResponseSchema` - Location details (box_no, loc_no with from_attributes=True)

## API Endpoints - ✅ IMPLEMENTED

### Files Created:
- `app/api/boxes.py` - Box management endpoints ✅
- `app/api/locations.py` - Location management endpoints ✅

### Box Endpoints (`app/api/boxes.py`) - All Implemented:
- `POST /boxes` - Create new box with specified capacity ✅
- `GET /boxes` - List all boxes with summary info ✅
- `GET /boxes/{box_no}` - Get box details with locations ✅
- `PUT /boxes/{box_no}` - Update box capacity and description ✅
- `DELETE /boxes/{box_no}` - Delete box ✅
- `GET /boxes/{box_no}/locations` - Get all locations in box ✅

### Location Endpoints (`app/api/locations.py`) - Implemented:
- `GET /locations/{box_no}/{loc_no}` - Get specific location details ✅

### Error Handling Implementation:
- Uses `@handle_api_errors` decorator from `app/utils/error_handling.py`
- Handles ValidationError (Pydantic), IntegrityError (database), and generic exceptions
- Returns structured JSON error responses with appropriate HTTP status codes
- Provides user-friendly error messages for common constraint violations

## Business Logic Services - ✅ IMPLEMENTED

### Files Created:
- `app/services/box_service.py` - Core box and location management ✅

### Box Service (`app/services/box_service.py`) - Implemented as Static Methods:

**Key Functions (Actual Implementation):**
- `create_box(db: Session, description: str, capacity: int) -> Box` - Creates box with auto-generated box_no, generates all locations, uses db.flush() for immediate ID access
- `get_box_with_locations(db: Session, box_no: int) -> Box | None` - Get box with locations via eager loading
- `get_all_boxes(db: Session) -> list[Box]` - List all boxes ordered by box_no
- `update_box_capacity(db: Session, box_no: int, new_capacity: int, new_description: str) -> Box | None` - Handles capacity increase/decrease, manages location lifecycle, expires relationships
- `delete_box(db: Session, box_no: int) -> bool` - Delete box with automatic cascade to locations

### Service Layer Patterns:
- All methods are static methods taking explicit Session parameter
- Services return ORM objects, APIs convert to Pydantic DTOs
- Proper session management with flush() and expire() for relationship handling
- Uses explicit queries rather than ORM navigation for performance

## Database Session Management - ✅ IMPLEMENTED

### Session Pattern:
- Uses Flask `g` object to store database session per request
- SessionLocal configured in conftest.py for tests with autoflush=True, expire_on_commit=False
- Manual flush() required when accessing auto-generated IDs on new objects
- Proper transaction management with rollback on exceptions

## Algorithm Details - ✅ IMPLEMENTED

### Box Number Generation Algorithm:
1. Query for maximum existing `box_no` using `func.coalesce(func.max(Box.box_no), 0)`
2. Assign `next_box_no = max_box_no + 1` (starting from 1 if no boxes exist)
3. Create box with auto-generated surrogate key `id` and business key `box_no`

### Location Generation Algorithm:
When creating a box with capacity N:
1. Generate locations 1 through N using range(1, capacity + 1)
2. Each location gets both surrogate key `id` and business identifiers (`box_id`, `box_no`, `loc_no`)
3. Uses batch `db.add_all()` for efficiency
4. Each location gets unique (`box_no`, `loc_no`) pair enforced by database constraint

### Capacity Update Algorithm:
- **Increase**: Create new Location objects for loc_no > current_capacity
- **Decrease**: Query and delete Location objects where loc_no > new_capacity
- **Same**: Only update description
- Uses `db.expire(box, ['locations'])` to reload relationship after changes

## Testing Implementation - ✅ COMPREHENSIVE

### Test Files Created:
- `tests/test_box_service.py` - Unit tests for service layer ✅
- `tests/test_box_api.py` - API endpoint integration tests ✅
- `tests/test_database_constraints.py` - Database constraint validation ✅
- `tests/test_capacity_validation.py` - Capacity change validation ✅
- `tests/conftest.py` - Test configuration and fixtures ✅

### Test Patterns:
- Uses pytest with class-based test organization
- Fixture-based dependency injection (app, session, client)
- In-memory SQLite for test isolation
- Comprehensive validation testing for edge cases
- Tests both service layer (ORM objects) and API layer (JSON responses)
- Database constraint testing with explicit flush() calls
- Error handling validation for all failure modes

### Files Modified - ✅ COMPLETED:
- `app/models/__init__.py` - Import new models (Box, Location) ✅
- `app/schemas/__init__.py` - Import new schemas ✅  
- `app/api/__init__.py` - Register new blueprints (boxes_bp, locations_bp) ✅
- `app/__init__.py` - Register blueprints in Flask app ✅