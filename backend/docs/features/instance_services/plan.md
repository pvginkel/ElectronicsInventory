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

### Phase 1: Dependency Injection Setup

1. **Install Dependency Injector**
   - Add `dependency-injector` package to project dependencies
   - This provides providers, containers, and wiring capabilities

2. **Create Service Container**
   - Create `app/services/container.py` using `dependency-injector.containers.DeclarativeContainer`
   - Define service providers using `providers.Factory` for request-scoped services
   - Configure database session provider for service injection

3. **Create Base Service Class**
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

### Phase 3: Flask Integration

7. **Update Application Factory**
   - Initialize service container in `create_app()`
   - Configure container with database session provider
   - Set up dependency-injector wiring for Flask integration

8. **Configure Dependency Wiring**
   - Use dependency-injector's `@inject` decorator on API endpoints
   - Configure automatic service injection using container wiring
   - Set up request-scoped service resolution

### Phase 4: Update API Layer

9. **Update API Endpoints**
   - Replace `ServiceClass.method(g.db, ...)` calls with injected service instances
   - Add `@inject` decorator to endpoints that need services
   - Use dependency-injector's automatic injection instead of manual `g.db` passing

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

### Service Container Definition
```python
# In app/services/container.py
from dependency_injector import containers, providers
from sqlalchemy.orm import Session

class ServiceContainer(containers.DeclarativeContainer):
    # Database session provider
    db_session = providers.Dependency(instance_of=Session)
    
    # Service providers
    part_service = providers.Factory(PartService, db=db_session)
    box_service = providers.Factory(BoxService, db=db_session)
    inventory_service = providers.Factory(
        InventoryService, 
        db=db_session,
        part_service=part_service
    )
    type_service = providers.Factory(TypeService, db=db_session)
    test_data_service = providers.Factory(TestDataService, db=db_session)
```

### Service Injection in API Endpoints
```python
# In API endpoints
from dependency_injector.wiring import Provide, inject
from app.services.container import ServiceContainer

@inject
def create_part(
    part_service: PartService = Provide[ServiceContainer.part_service]
):
    part = part_service.create_part(description=data.description, ...)
    return PartResponseSchema.model_validate(part).model_dump(), 201
```

### Service Instance Pattern
```python
# Converted service class
class PartService:
    def __init__(self, db: Session):
        self.db = db
    
    def create_part(self, description: str, **kwargs) -> Part:
        key = self.generate_part_key()
        # ... rest of implementation using self.db
```

## Cross-Service Dependencies

Services that depend on other services:
- `InventoryService` depends on `PartService` (for quantity calculations and cleanup)
- API endpoints may need multiple services injected

The dependency-injector container automatically handles:
- Dependency resolution and initialization order
- Circular dependency detection
- Request-scoped service lifecycle management

## Backwards Compatibility

This is a breaking change that affects:
- All service method calls throughout the codebase
- Test setup and service instantiation  
- API endpoint service usage patterns

However, the public API contracts (HTTP endpoints) remain unchanged.

## Benefits

1. **Improved Testability** - Services can be easily mocked and stubbed using dependency-injector's override capabilities
2. **Better Separation of Concerns** - Each service manages its own dependencies with clear container definitions
3. **Mature Dependency Injection** - Uses battle-tested `dependency-injector` package with comprehensive features
4. **Configuration Management** - Built-in support for configuration injection and environment-specific overrides
5. **Type Safety** - Full mypy support and typing annotations for injected dependencies
6. **Performance** - Cython-optimized dependency resolution with minimal runtime overhead
7. **Framework Integration** - Seamless Flask integration with automatic wiring capabilities

## Implementation Order

Execute phases sequentially to minimize breaking changes:
1. Install dependency-injector package and create container setup
2. Convert one service at a time, starting with services that have no dependencies
3. Configure Flask wiring and container integration
4. Update API endpoints to use dependency injection
5. Update tests last to verify everything works correctly

The refactoring maintains all existing business logic while leveraging a mature, production-ready dependency injection framework.