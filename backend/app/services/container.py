"""Dependency injection container for services."""

from dependency_injector import containers, providers
from sqlalchemy.orm import Session

from app.config import Settings
from app.services.box_service import BoxService
from app.services.document_service import DocumentService
from app.services.image_service import ImageService
from app.services.inventory_service import InventoryService
from app.services.part_service import PartService
from app.services.s3_service import S3Service
from app.services.task_service import TaskService
from app.services.test_data_service import TestDataService
from app.services.type_service import TypeService
from app.services.url_thumbnail_service import URLThumbnailService


class ServiceContainer(containers.DeclarativeContainer):
    """Container for service dependency injection."""

    # Configuration and database session providers
    config = providers.Dependency(instance_of=Settings)
    db_session = providers.Dependency(instance_of=Session)

    # Service providers - Factory creates new instances for each request
    part_service = providers.Factory(PartService, db=db_session)
    box_service = providers.Factory(BoxService, db=db_session)
    type_service = providers.Factory(TypeService, db=db_session)
    test_data_service = providers.Factory(TestDataService, db=db_session)

    # Document management services
    s3_service = providers.Factory(S3Service, db=db_session)
    image_service = providers.Factory(ImageService, db=db_session, s3_service=s3_service)
    url_thumbnail_service = providers.Factory(URLThumbnailService, db=db_session, s3_service=s3_service)
    document_service = providers.Factory(
        DocumentService,
        db=db_session,
        s3_service=s3_service,
        image_service=image_service,
        url_service=url_thumbnail_service
    )

    # InventoryService depends on PartService
    inventory_service = providers.Factory(
        InventoryService,
        db=db_session,
        part_service=part_service
    )

    # TaskService - Singleton for in-memory task management with configurable settings
    task_service = providers.Singleton(
        TaskService,
        max_workers=config.provided.TASK_MAX_WORKERS,
        task_timeout=config.provided.TASK_TIMEOUT_SECONDS,
        cleanup_interval=config.provided.TASK_CLEANUP_INTERVAL_SECONDS
    )
