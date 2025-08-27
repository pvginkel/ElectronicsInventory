# Service Response Model Refactoring Plan

## Brief Description

This plan addresses the refactoring of service layer methods that currently return dictionary objects instead of proper typed models. The current implementation uses raw dictionaries for calculated data like box usage statistics and part totals, which undermines type safety and API consistency. Additionally, the types endpoint needs extension to include part count statistics.

## Issues to Address

### 1. Dictionary Response Types in Service Layer
**Problem**: Service methods return untyped dictionaries instead of proper response models
**Current Methods**:
- `BoxService.calculate_box_usage()` returns `dict` 
- `BoxService.get_all_boxes_with_usage()` returns `list[dict]`
- `InventoryService.get_all_parts_with_totals()` returns `list[dict]`

### 2. Missing Part Count in Types Endpoint
**Problem**: Types endpoint doesn't show how many parts use each type
**Root Cause**: TypeService lacks part counting functionality

## Files and Functions to Modify

### Service Layer Refactoring
- **`app/services/box_service.py`**: 
  - Modify `calculate_box_usage()` to return proper model instead of dict
  - Modify `get_all_boxes_with_usage()` to return proper models instead of list[dict]
- **`app/services/inventory_service.py`**: 
  - Modify `get_all_parts_with_totals()` to return proper models instead of list[dict]

### New Response Models
- **`app/schemas/box.py`**: 
  - Create `BoxUsageStatsModel` dataclass for service layer responses
  - Create `BoxWithUsageModel` dataclass for service layer responses
- **`app/schemas/part.py`**: 
  - Create `PartWithTotalModel` dataclass for service layer responses
- **`app/schemas/type.py`**: 
  - Create `TypeWithStatsModel` dataclass for service layer responses
  - Add `TypeWithStatsResponseSchema` for API responses

### Type Statistics Enhancement
- **`app/services/type_service.py`**: 
  - Add `get_all_types_with_part_counts()` method
  - Add `calculate_type_part_count()` method
- **`app/api/types.py`**: 
  - Modify `list_types()` endpoint to optionally return part counts
  - Add query parameter `include_stats=true` to control response format

### API Layer Updates
- **`app/api/boxes.py`**: Update to handle new service response models
- **`app/api/inventory.py`**: Update to handle new service response models

## Implementation Algorithm

### Service Response Models Pattern
1. Create dataclass models in schema files for service layer responses
2. Service methods return these typed models instead of dictionaries
3. API layer converts service models to Pydantic response schemas
4. Maintain separation: service models for internal use, Pydantic schemas for API

### Box Usage Statistics Refactoring
1. Create `BoxUsageStatsModel` dataclass with fields: `box_no`, `total_locations`, `occupied_locations`, `available_locations`, `usage_percentage`
2. Create `BoxWithUsageModel` dataclass combining Box ORM model with usage stats
3. Update `BoxService.calculate_box_usage()` to return `BoxUsageStatsModel`
4. Update `BoxService.get_all_boxes_with_usage()` to return `list[BoxWithUsageModel]`
5. Update API endpoints to convert service models to existing Pydantic schemas

### Part Total Quantity Refactoring
1. Create `PartWithTotalModel` dataclass combining Part ORM model with total quantity
2. Update `InventoryService.get_all_parts_with_totals()` to return `list[PartWithTotalModel]`
3. Update API endpoints to convert service models to existing `PartWithTotalSchema`

### Type Statistics Enhancement
1. Create `TypeWithStatsModel` dataclass with fields: `type` (ORM model), `part_count`
2. Create `TypeWithStatsResponseSchema` Pydantic schema for API responses
3. Implement `TypeService.calculate_type_part_count()` to count parts per type
4. Implement `TypeService.get_all_types_with_part_counts()` to return typed models
5. Update `list_types()` endpoint with optional `include_stats` query parameter
6. When `include_stats=true`, return `TypeWithStatsResponseSchema` instead of `TypeResponseSchema`

## Testing Requirements

### Service Layer Model Tests
- **`tests/test_box_service.py`**: Update tests to verify proper model types returned
- **`tests/test_inventory_service.py`**: Update tests to verify proper model types returned  
- **`tests/test_type_service.py`**: Add tests for new part counting methods

### API Layer Tests
- **`tests/test_box_api.py`**: Verify API responses still work with refactored service layer
- **`tests/test_inventory_api.py`**: Verify API responses still work with refactored service layer
- **`tests/test_types_api.py`**: Add tests for new `include_stats` parameter and response format

### Model Validation Tests
- **`tests/test_schemas.py`**: Test new dataclass models and Pydantic schemas
- **Type safety tests**: Verify mypy passes with proper typing throughout

## Implementation Phases

### Phase 1: Service Response Models (High Priority)
- Create dataclass models for all service responses
- Refactor `BoxService.calculate_box_usage()` and `BoxService.get_all_boxes_with_usage()`
- Refactor `InventoryService.get_all_parts_with_totals()`
- Update corresponding API endpoints
- Update all tests to handle new model types

### Phase 2: Type Statistics Enhancement (Medium Priority)
- Implement part counting in TypeService
- Add TypeWithStatsModel and response schema
- Extend types API endpoint with include_stats parameter
- Add comprehensive tests for new functionality

### Phase 3: Validation and Cleanup (Low Priority)
- Run mypy to verify type safety improvements
- Review all service methods for consistency
- Document new patterns in code comments
- Ensure all tests pass with proper coverage