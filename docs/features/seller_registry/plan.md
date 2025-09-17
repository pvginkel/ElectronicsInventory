# Seller Registry - Technical Plan

## Overview

Implement a Seller management system to replace the current free-text seller field on Parts with a proper foreign key relationship to a Sellers table. This enables consistent seller information across parts and supports the Shopping List feature's requirement to group items by seller.

## Files to Create

### 1. Model: `app/models/seller.py`
Create Seller entity with:
- `id`: Primary key (auto-increment integer)
- `name`: Required, unique string (max 255 chars)
- `website`: Required string (max 500 chars)
- `created_at`: Timestamp (auto-set)
- `updated_at`: Timestamp (auto-update)
- `parts`: Relationship to Part model (one-to-many, back_populates="seller_obj")

### 2. Service: `app/services/seller_service.py`
Implement SellerService(BaseService) with methods:
- `create_seller(name: str, website: str) -> Seller`
  - Validate name uniqueness
  - Create and return Seller instance
- `get_seller(seller_id: int) -> Seller`
  - Raise RecordNotFoundException if not found
- `get_all_sellers() -> list[Seller]`
  - Return all sellers ordered by name
- `update_seller(seller_id: int, name: str | None, website: str | None) -> Seller`
  - Validate name uniqueness if changed
  - Update only provided fields
- `delete_seller(seller_id: int) -> None`
  - Check for parts referencing this seller
  - Raise InvalidOperationException if referenced
  - Delete seller record

### 3. Schemas: `app/schemas/seller.py`
Define Pydantic schemas:
- `SellerCreateSchema`: name (required), website (required)
- `SellerUpdateSchema`: name (optional), website (optional)
- `SellerResponseSchema`: id, name, website, created_at, updated_at
- `SellerListSchema`: Lightweight schema with id and name only (for dropdowns)

### 4. API: `app/api/sellers.py`
Create Flask blueprint with endpoints:
- `GET /sellers` - List all sellers (return SellerListSchema array)
- `POST /sellers` - Create seller (return SellerResponseSchema, 201)
- `GET /sellers/{id}` - Get seller details (return SellerResponseSchema)
- `PUT /sellers/{id}` - Update seller (return SellerResponseSchema)
- `DELETE /sellers/{id}` - Delete seller (204 No Content)

### 5. Migration: `alembic/versions/011_create_sellers_table.py`
Database changes:
- Create `sellers` table with all fields
- Add unique constraint on `name`
- Create index on `name` for performance
- Add seller_id foreign key to parts table
- Drop seller column from parts table (no data migration)

### 6. Test Data: `app/data/test_data/sellers.json`
Create JSON file with initial seller data for development/testing

## Files to Modify

### 1. Part Model: `app/models/part.py`
- Add `seller_id: Mapped[int | None]` with foreign key to sellers.id
- Add `seller_obj: Mapped["Seller"] = relationship()` with back_populates
- Remove existing `seller` field entirely (breaking change)
- Keep `seller_link` field as product URL (distinct from seller website)

### 2. Service Container: `app/services/container.py`
- Add `seller_service = providers.Factory(SellerService, db=db_session)`

### 3. API Blueprint Registration: `app/api/__init__.py`
- Import sellers blueprint
- Register blueprint with app

### 4. Application Factory: `app/__init__.py`
- Add `'app.api.sellers'` to container wiring modules

### 5. Part Schemas: `app/schemas/part.py`
- Update `PartResponseSchema` to include `seller_obj: SellerListSchema | None`
- Remove `seller` field from all schemas (breaking change)
- Update `PartCreateSchema` and `PartUpdateSchema` to accept `seller_id` (optional)
- Keep `seller_link` field for product URL

### 6. CLI: `app/cli.py`
- Update `load-test-data` command to load sellers before parts
- Handle seller foreign key relationships in test data loading

## Implementation Steps

### Step 1: Create Seller Infrastructure
1. Create Seller model with relationships
2. Create database migration (011)
3. Run migration to create sellers table
4. Implement SellerService with CRUD operations
5. Create Pydantic schemas
6. Implement API endpoints with proper validation
7. Register in service container and application

### Step 2: Update Part Model
1. The migration (011) will:
   - Create sellers table
   - Add seller_id column to parts (nullable)
   - Drop the seller column (no data migration)
2. Update Part model to remove seller field and add seller_id/relationship
3. Update test data JSON files to remove seller field

### Step 3: Update Part Service
1. Modify part service to accept seller_id in create/update operations
2. Ensure proper foreign key validation
3. Include seller_obj in part queries (eager loading)

### Step 4: Create Test Data
1. Create `app/data/test_data/sellers.json` with initial sellers:
   - AliExpress (https://www.aliexpress.com)
   - Amazon (https://www.amazon.com)
   - TinyTronics (https://tinytronics.nl)
   - DigiKey (https://www.digikey.com)
   - Mouser (https://www.mouser.com)
   - Adafruit (https://www.adafruit.com)
   - SparkFun (https://www.sparkfun.com)
2. Update `app/data/test_data/parts.json`:
   - Remove all `seller` fields
   - Add `seller_id` references to the created sellers with the following distribution:
     - 30% AliExpress (bulk/generic items)
     - 20% TinyTronics (specialized Dutch supplier)
     - 10% DigiKey (professional components)
     - 10% Mouser (professional components)
     - 10% Amazon (quick needs)
     - 8% Adafruit (hobbyist modules)
     - 7% SparkFun (hobbyist modules)
     - 5% no seller (null seller_id)
3. Update `app/cli.py` load-test-data command to:
   - Load sellers before parts
   - Handle seller foreign key relationships

## Migration Approach

No data migration - clean slate approach:

1. Create new sellers table with proper structure
2. Add nullable seller_id foreign key to parts table
3. Drop the existing seller column entirely
4. All existing seller data is lost (intentional breaking change)
5. Frontend will be updated immediately after backend deployment to use the new seller_id field

## Validation Rules

- Seller name must be unique (database constraint)
- Seller website is a free-form string (no URL validation required)
- Cannot delete a seller that has associated parts
- Part can have null seller_id (optional relationship)

## Testing Requirements

### Service Tests
- Test all CRUD operations with valid data
- Test duplicate name prevention
- Test deletion with/without part references
- Test update with name conflicts
- Test retrieval of non-existent sellers

### API Tests
- Test all endpoints with valid/invalid payloads
- Test proper HTTP status codes
- Test response schema validation
- Test error handling for conflicts and not found

### Migration Tests
- Test clean migration without data preservation
- Test that seller column is properly dropped
- Test that seller_id foreign key works correctly
- Test preservation of seller_link as product URL

### Test Data Verification
- Verify sellers.json loads correctly
- Verify parts.json correctly references seller_id
- Verify CLI load-test-data command handles seller relationships
- Test that common sellers (DigiKey, Mouser, etc.) are created properly