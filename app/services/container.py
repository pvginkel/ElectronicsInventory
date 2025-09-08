"""Dependency injection container for services."""

from dependency_injector import containers, providers
from sqlalchemy.orm import sessionmaker

from app.config import Settings
from app.services.ai_service import AIService
from app.services.box_service import BoxService
from app.services.dashboard_service import DashboardService
from app.services.document_service import DocumentService
from app.services.download_cache_service import DownloadCacheService
from app.services.html_document_handler import HtmlDocumentHandler
from app.services.image_service import ImageService
from app.services.inventory_service import InventoryService
from app.services.metrics_service import MetricsService, NoopMetricsService
from app.services.part_service import PartService
from app.services.s3_service import S3Service
from app.services.setup_service import SetupService
from app.services.task_service import TaskService
from app.services.test_data_service import TestDataService
from app.services.type_service import TypeService
from app.services.url_transformers import LCSCInterceptor, URLInterceptorRegistry
from app.utils.graceful_shutdown import GracefulShutdownManager
from app.utils.temp_file_manager import TempFileManager


class ServiceContainer(containers.DeclarativeContainer):
    """Container for service dependency injection."""

    # Configuration and database session providers
    config = providers.Dependency(instance_of=Settings)
    session_maker = providers.Dependency(instance_of=sessionmaker)
    db_session = providers.ContextLocalSingleton(
        session_maker.provided.call()
    )

    # Service providers - Factory creates new instances for each request
    part_service = providers.Factory(PartService, db=db_session)
    box_service = providers.Factory(BoxService, db=db_session)
    type_service = providers.Factory(TypeService, db=db_session)
    dashboard_service = providers.Factory(DashboardService, db=db_session)
    setup_service = providers.Factory(SetupService, db=db_session)
    test_data_service = providers.Factory(TestDataService, db=db_session)

    # Utility services
    graceful_shutdown_manager = providers.Singleton(GracefulShutdownManager)
    temp_file_manager = providers.Singleton(
        TempFileManager,
        base_path=config.provided.DOWNLOAD_CACHE_BASE_PATH,
        cleanup_age_hours=config.provided.DOWNLOAD_CACHE_CLEANUP_HOURS
    )
    download_cache_service = providers.Factory(
        DownloadCacheService,
        temp_file_manager=temp_file_manager,
        max_download_size=config.provided.MAX_FILE_SIZE,
        download_timeout=30
    )

    # Document management services
    s3_service = providers.Factory(S3Service, db=db_session, settings=config)
    image_service = providers.Factory(
        ImageService,
        db=db_session,
        s3_service=s3_service,
        settings=config
    )
    html_handler = providers.Factory(
        HtmlDocumentHandler,
        download_cache_service=download_cache_service,
        settings=config,
        image_service=image_service
    )

    # Metrics service - Singleton for background thread management
    @staticmethod
    def make_metrics_service(enabled: bool, container: 'ServiceContainer') -> NoopMetricsService:
        if enabled:
            return MetricsService(container=container)
        else:
            return NoopMetricsService()

    metrics_service = providers.Singleton(
        make_metrics_service,
        enabled=config.provided.METRICS_ENABLED,
        container=providers.Self(),
    )

    # URL interceptor registry with LCSC interceptor
    url_interceptor_registry = providers.Singleton(
        URLInterceptorRegistry
    )
    lcsc_interceptor = providers.Factory(LCSCInterceptor)

    document_service = providers.Factory(
        DocumentService,
        db=db_session,
        s3_service=s3_service,
        image_service=image_service,
        html_handler=html_handler,
        download_cache_service=download_cache_service,
        settings=config,
        url_interceptor_registry=url_interceptor_registry
    )

    # InventoryService depends on PartService and MetricsService
    inventory_service = providers.Factory(
        InventoryService,
        db=db_session,
        part_service=part_service,
        metrics_service=metrics_service
    )

    # TaskService - Singleton for in-memory task management with configurable settings
    task_service = providers.Singleton(
        TaskService,
        metrics_service=metrics_service,
        max_workers=config.provided.TASK_MAX_WORKERS,
        task_timeout=config.provided.TASK_TIMEOUT_SECONDS,
        cleanup_interval=config.provided.TASK_CLEANUP_INTERVAL_SECONDS
    )

    # AI service
    ai_service = providers.Factory(
        AIService,
        db=db_session,
        config=config,
        temp_file_manager=temp_file_manager,
        type_service=type_service,
        download_cache_service=download_cache_service,
        document_service=document_service,
        metrics_service=metrics_service
    )
