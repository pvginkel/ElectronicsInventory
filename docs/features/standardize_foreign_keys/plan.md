# Standardize Foreign Keys to Use Surrogate Primary Keys

## Overview

Currently, the `part_locations` and `quantity_history` tables reference `parts.id4` (a natural key) instead of `parts.id` (the surrogate primary key). This violates database normalization best practices and can lead to performance issues. This plan will:

1. Update foreign key relationships to use `parts.id` instead of `parts.id4`
2. Rename the `id4` field to `key` for better semantic meaning
3. Ensure all related models, services, and APIs continue to function correctly

## Current Problem

**Foreign Keys Using Natural Key:**
- `part_locations.part_id4` → `parts.id4` (should reference `parts.id`)
- `quantity_history.part_id4` → `parts.id4` (should reference `parts.id`)

**Files That Need Changes:**

### Database Migration
- `alembic/versions/003_create_parts_tables.py` (modify existing migration)

### Model Files
- `app/models/part.py` - Rename `id4` to `key`, update relationships
- `app/models/part_location.py` - Change `part_id4` to `part_id`, update foreign key reference
- `app/models/quantity_history.py` - Change `part_id4` to `part_id`, update foreign key reference

### Service Files (to be identified after model changes)
- Search for all references to `id4` and `part_id4` fields
- Update to use surrogate key relationships where appropriate
- Update all methods to use new field names consistently

### Schema Files (to be identified after model changes)  
- Update Pydantic schemas to reflect field name changes
- Change API contracts to use new field names

## Migration Strategy

Since the database has not been deployed to production yet, we can **rewrite the existing migration** instead of creating a new one. This is much simpler and cleaner.

### Phase 1: Update Existing Migration
1. **Modify `alembic/versions/003_create_parts_tables.py`** directly
2. **Change `parts.id4` to `parts.key`** in the initial table creation
3. **Change `part_id4` columns to `part_id`** with proper integer foreign key references
4. **Update foreign key constraints** to reference `parts.id` instead of `parts.key`
5. **Update indexes** to use new column names

### Phase 2: Model Updates
1. **Update Part model:**
   - Rename `id4: Mapped[str]` to `key: Mapped[str]`
   - Update relationship back-references
   - Update `__repr__` method

2. **Update PartLocation model:**
   - Rename `part_id4: Mapped[str]` to `part_id: Mapped[int]` 
   - Change foreign key from `ForeignKey("parts.key")` to `ForeignKey("parts.id")`
   - Update unique constraint from `part_id4, box_no, loc_no` to `part_id, box_no, loc_no`
   - Update `__repr__` method

3. **Update QuantityHistory model:**
   - Rename `part_id4: Mapped[str]` to `part_id: Mapped[int]`
   - Change foreign key from `ForeignKey("parts.key")` to `ForeignKey("parts.id")`
   - Update `__repr__` method

### Phase 3: Service Layer Updates
1. **Search and identify all service methods** that reference:
   - `part_id4` fields (now `part_id`)
   - Direct queries using `parts.key` (formerly `parts.id4`)
2. **Update queries** to use proper join relationships instead of string matching
3. **Update all methods to use new field names consistently**
4. **Update test data and fixtures**

### Phase 4: API Schema Updates
1. **Update Pydantic schemas** to use new field names
2. **Update API endpoints** to use new field names
3. **Update OpenAPI documentation** to reflect changes

## Detailed Migration Changes

### Update Existing Migration (003_create_parts_tables.py)

Since we can recreate the database, we'll modify the existing migration to create the schema correctly from the start:

**Key Changes:**
1. **Parts table**: Rename `id4` column to `key`
2. **Part_locations table**: Change `part_id4` to `part_id` (integer) with FK to `parts.id`  
3. **Quantity_history table**: Change `part_id4` to `part_id` (integer) with FK to `parts.id`
4. **Indexes**: Update to reflect new column names
5. **Constraints**: Update unique constraint to use `part_id` instead of `part_id4`

**Specific Migration Changes:**

```python
# Change parts table column name
sa.Column('key', sa.CHAR(4), nullable=False),  # was 'id4'

# Change part_locations foreign key column
sa.Column('part_id', sa.Integer(), nullable=False),  # was 'part_id4' CHAR(4)

# Update part_locations foreign key constraint
sa.ForeignKeyConstraint(['part_id'], ['parts.id'], ),  # was ['part_id4'], ['parts.id4']

# Update part_locations unique constraint  
sa.UniqueConstraint('part_id', 'box_no', 'loc_no'),  # was 'part_id4', 'box_no', 'loc_no'

# Change quantity_history foreign key column
sa.Column('part_id', sa.Integer(), nullable=False),  # was 'part_id4' CHAR(4)

# Update quantity_history foreign key constraint
sa.ForeignKeyConstraint(['part_id'], ['parts.id'], ),  # was ['part_id4'], ['parts.id4'] 

# Update index names
op.create_index('ix_parts_key', 'parts', ['key'])  # was 'ix_parts_id4'
op.create_index('ix_part_locations_part_id', 'part_locations', ['part_id'])  # was 'ix_part_locations_part_id4'
op.create_index('ix_quantity_history_part_id', 'quantity_history', ['part_id'])  # was 'ix_quantity_history_part_id4'
```

**No complex data migration needed** - we're changing the schema before any production data exists.

## Testing Requirements

1. **Migration testing**: Verify migration runs cleanly on existing data
2. **Model relationship testing**: Ensure all relationships work with surrogate keys
3. **Service layer testing**: All existing functionality works with new schema
4. **API testing**: All endpoints work with updated field names
5. **Performance testing**: Verify foreign key queries perform as expected

## Risk Assessment

**Low Risk:**
- Database normalization is a standard practice
- Surrogate key relationships are more performant
- Changes are internal to the application

**Mitigation Strategies:**
- Comprehensive testing at each phase
- Rollback capability in migration
- Test with realistic data volumes

## Success Criteria

1. All foreign keys reference surrogate primary keys (`parts.id`)
2. The natural key is renamed from `id4` to `key` for clarity  
3. All API functionality works with updated field names
4. Database queries use proper joins instead of string matching
5. Test suite passes with 100% coverage
6. Performance is maintained or improved