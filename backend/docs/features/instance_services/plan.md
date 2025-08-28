# Instance-Based Service Layer Refactoring Plan

## Overview

Refactor the current static method service pattern to use instance-based services. This change will improve testability, enable dependency injection, and provide better separation of concerns while maintaining the existing layered architecture.

## Current State Analysis

The current service layer uses static methods exclusively:
- `PartService` - 8 static methods for part management
- `BoxService` - 9 static methods for box/location management  
- `InventoryService` - 11 static methods for inventory operations
- `TypeService` - 4 static methods for part type management
- `TestDataService` - data loading utilities

All services receive `Session` as their first parameter and contain no state. APIs call services via `ServiceClass.method_name(g.db, ...)` pattern.

## Files to Modify

### Service Layer (`app/services/`)
- `app/services/part_service.py` - Convert to instance-based PartService
- `app/services/box_service.py` - Convert to instance-based BoxService  
- `app/services/inventory_service.py` - Convert to instance-based InventoryService
- `app/services/type_service.py` - Convert to instance-based TypeService
- `app/services/test_data_service.py` - Convert to instance-based TestDataService
- `app/services/__init__.py` - Export service instances and container

### API Layer (`app/api/`)
- `app/api/parts.py` - Update to use injected service instances
- `app/api/boxes.py` - Update to use injected service instances
- `app/api/inventory.py` - Update to use injected service instances
- `app/api/types.py` - Update to use injected service instances
- `app/api/testing.py` - Update to use injected service instances
- `app/api/locations.py` - Update to use injected service instances

### Application Factory
- `app/__init__.py` - Add service container initialization and injection setup

### Test Files (`tests/`)
- `tests/test_services/test_part_service.py` - Update to use instance-based testing
- `tests/test_services/test_box_service.py` - Update to use instance-based testing
- `tests/test_services/test_inventory_service.py` - Update to use instance-based testing
- `tests/test_services/test_type_service.py` - Update to use instance-based testing
- `tests/test_api/*.py` - Update API tests to work with service injection

## Implementation Steps

### Phase 1: Service Container and Base Classes

1. **Create Service Container**
   - Create `app/services/container.py` with a simple dependency injection container
   - Define service registration and retrieval methods
   - Handle service lifecycle (singleton instances)

2. **Create Base Service Class**
   - Create `app/services/base.py` with abstract base service class
   - Define constructor that accepts `Session` dependency
   - Provide common utilities if needed

### Phase 2: Convert Services to Instance-Based

3. **Convert PartService**
   - Change all `@staticmethod` to instance methods
   - Add `__init__(self, db: Session)` constructor
   - Remove `db: Session` parameter from all methods (use `self.db`)
   - Update internal service calls to use dependency injection

4. **Convert BoxService** 
   - Same pattern as PartService
   - Handle dataclass dependencies (`BoxUsageStatsModel`, `BoxWithUsageModel`)

5. **Convert InventoryService**
   - Same pattern as PartService  
   - Update calls to `PartService` to use injected instance
   - Handle cross-service dependencies properly

6. **Convert TypeService and TestDataService**
   - Apply same conversion pattern
   - Update any cross-service dependencies

### Phase 3: Dependency Injection Setup

7. **Update Application Factory**
   - Initialize service container in `create_app()`
   - Register all service classes with container
   - Create request-scoped service instances using `g.db` session

8. **Create Service Injection Decorator**
   - Create `@inject_services` decorator for API endpoints
   - Automatically inject required services into `g` object
   - Handle service resolution from container

### Phase 4: Update API Layer

9. **Update API Endpoints**
   - Replace `ServiceClass.method(g.db, ...)` calls with `g.service_name.method(...)`
   - Add `@inject_services` decorator to endpoints that need services
   - Remove manual `g.db` passing

### Phase 5: Update Tests

10. **Update Service Tests**
    - Create service instances in test fixtures instead of calling static methods
    - Pass test database session to service constructors
    - Verify all existing test functionality still works

11. **Update API Tests** 
    - Ensure API tests work with new injection system
    - Add tests for service injection functionality
    - Verify error handling still works correctly

## Dependency Injection Pattern

### Service Registration
```python
# In app/__init__.py
container = ServiceContainer()
container.register(PartService)
container.register(BoxService) 
container.register(InventoryService, dependencies=[PartService])
```

### Service Resolution
```python
# In API endpoints
@inject_services('part_service', 'inventory_service')
def create_part():
    part = g.part_service.create_part(description=data.description, ...)
    return PartResponseSchema.model_validate(part).model_dump(), 201
```

### Service Instance Pattern
```python
# Converted service class
class PartService:
    def __init__(self, db: Session):
        self.db = db
    
    def create_part(self, description: str, **kwargs) -> Part:
        id4 = self.generate_part_id4()
        # ... rest of implementation using self.db
```

## Cross-Service Dependencies

Services that depend on other services:
- `InventoryService` depends on `PartService` (for quantity calculations and cleanup)
- API endpoints may need multiple services injected

The container will handle dependency resolution and ensure proper initialization order.

## Backwards Compatibility

This is a breaking change that affects:
- All service method calls throughout the codebase
- Test setup and service instantiation  
- API endpoint service usage patterns

However, the public API contracts (HTTP endpoints) remain unchanged.

## Benefits

1. **Improved Testability** - Services can be easily mocked and stubbed
2. **Better Separation of Concerns** - Each service manages its own dependencies
3. **Dependency Injection** - Cleaner architecture with explicit dependencies
4. **State Management** - Services can maintain state if needed in the future
5. **Extensibility** - Easier to add cross-cutting concerns (logging, caching, etc.)

## Implementation Order

Execute phases sequentially to minimize breaking changes:
1. Create container and base classes first
2. Convert one service at a time, starting with services that have no dependencies
3. Update injection system before updating API layer
4. Update tests last to verify everything works correctly

The refactoring maintains all existing business logic while improving the overall architecture.