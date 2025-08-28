"""Dependency injection container for services."""

from dependency_injector import containers, providers
from sqlalchemy.orm import Session

from app.services.part_service import PartService
from app.services.box_service import BoxService
from app.services.inventory_service import InventoryService
from app.services.type_service import TypeService
from app.services.test_data_service import TestDataService


class ServiceContainer(containers.DeclarativeContainer):
    """Container for service dependency injection."""
    
    # Database session provider
    db_session = providers.Dependency(instance_of=Session)
    
    # Service providers - Factory creates new instances for each request
    part_service = providers.Factory(PartService, db=db_session)
    box_service = providers.Factory(BoxService, db=db_session)
    type_service = providers.Factory(TypeService, db=db_session)
    test_data_service = providers.Factory(TestDataService, db=db_session)
    
    # InventoryService depends on PartService
    inventory_service = providers.Factory(
        InventoryService,
        db=db_session,
        part_service=part_service
    )