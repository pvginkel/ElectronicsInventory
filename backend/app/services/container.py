"""Dependency injection container for services."""

from dependency_injector import containers, providers
from sqlalchemy.orm import sessionmaker

from app.config import Settings
from app.services.ai_service import AIService
from app.services.attachment_set_service import AttachmentSetService
from app.services.auth_service import AuthService
from app.services.box_service import BoxService
from app.services.connection_manager import ConnectionManager
from app.services.dashboard_service import DashboardService
from app.services.datasheet_extraction_service import DatasheetExtractionService
from app.services.document_service import DocumentService
from app.services.download_cache_service import DownloadCacheService
from app.services.duplicate_search_service import DuplicateSearchService
from app.services.html_document_handler import HtmlDocumentHandler
from app.services.image_service import ImageService
from app.services.inventory_service import InventoryService
from app.services.kit_pick_list_service import KitPickListService
from app.services.kit_reservation_service import KitReservationService
from app.services.kit_service import KitService
from app.services.kit_shopping_list_service import KitShoppingListService
from app.services.metrics_service import MetricsService
from app.services.mouser_service import MouserService
from app.services.oidc_client_service import OidcClientService
from app.services.part_service import PartService
from app.services.pick_list_report_service import PickListReportService
from app.services.s3_service import S3Service
from app.services.seller_service import SellerService
from app.services.setup_service import SetupService
from app.services.shopping_list_line_service import ShoppingListLineService
from app.services.shopping_list_service import ShoppingListService
from app.services.task_service import TaskService
from app.services.test_data_service import TestDataService
from app.services.testing_service import TestingService
from app.services.type_service import TypeService
from app.services.url_transformers import LCSCInterceptor, URLInterceptorRegistry
from app.services.version_service import VersionService
from app.utils.ai.ai_runner import AIRunner
from app.utils.ai.datasheet_extraction import ExtractSpecsFromDatasheetFunction
from app.utils.ai.duplicate_search import DuplicateSearchFunction
from app.utils.ai.mouser_search import (
    SearchMouserByKeywordFunction,
    SearchMouserByPartNumberFunction,
)
from app.utils.ai.openai.openai_runner import OpenAIRunner
from app.utils.lifecycle_coordinator import LifecycleCoordinator
from app.utils.reset_lock import ResetLock
from app.utils.temp_file_manager import TempFileManager


def _create_ai_runner(cfg: Settings) -> AIRunner | None:
    """Factory function to create AI runner based on configuration.

    Args:
        cfg: Application settings

    Returns:
        OpenAIRunner instance, or None if AI is disabled

    Raises:
        ValueError: If AI_PROVIDER doesn't match configured API keys
    """
    if not cfg.real_ai_allowed:
        return None

    if cfg.ai_provider == "openai":
        if not cfg.openai_api_key:
            raise ValueError(
                "OPENAI_API_KEY is required when AI_PROVIDER is set to 'openai'"
            )
        return OpenAIRunner(cfg.openai_api_key)

    else:
        raise ValueError(
            f"Invalid AI_PROVIDER: {cfg.ai_provider}. Must be 'openai'"
        )


class ServiceContainer(containers.DeclarativeContainer):
    """Container for service dependency injection."""

    # Configuration and database session providers
    config = providers.Dependency(instance_of=Settings)
    session_maker = providers.Dependency(instance_of=sessionmaker)
    db_session = providers.ContextLocalSingleton(
        session_maker.provided.call()
    )

    # Document management services - defined early for service dependencies
    s3_service = providers.Factory(S3Service, settings=config)

    image_service = providers.Factory(
        ImageService,
        s3_service=s3_service,
        settings=config
    )

    # AttachmentSet service - manages attachments for Parts and Kits
    attachment_set_service = providers.Factory(
        AttachmentSetService,
        db=db_session,
        s3_service=s3_service,
        image_service=image_service,
        settings=config
    )

    # Service providers - Factory creates new instances for each request
    part_service = providers.Factory(
        PartService,
        db=db_session,
        attachment_set_service=attachment_set_service
    )
    box_service = providers.Factory(BoxService, db=db_session)
    type_service = providers.Factory(TypeService, db=db_session)
    seller_service = providers.Factory(SellerService, db=db_session)
    dashboard_service = providers.Factory(DashboardService, db=db_session)
    setup_service = providers.Factory(SetupService, db=db_session)
    shopping_list_service = providers.Factory(
        ShoppingListService,
        db=db_session,
    )

    # Lifecycle coordinator - Singleton for managing startup and graceful shutdown
    lifecycle_coordinator = providers.Singleton(
        LifecycleCoordinator,
        graceful_shutdown_timeout=config.provided.graceful_shutdown_timeout,
    )

    # Utility services
    temp_file_manager = providers.Singleton(
        TempFileManager,
        base_path=config.provided.download_cache_base_path,
        cleanup_age_hours=config.provided.download_cache_cleanup_hours,
        lifecycle_coordinator=lifecycle_coordinator
    )
    download_cache_service = providers.Factory(
        DownloadCacheService,
        temp_file_manager=temp_file_manager,
        max_download_size=config.provided.max_file_size,
        download_timeout=30
    )

    # Test data service - depends on s3_service for loading part images
    test_data_service = providers.Factory(TestDataService, db=db_session, s3_service=s3_service)

    html_handler = providers.Factory(
        HtmlDocumentHandler,
        download_cache_service=download_cache_service,
        settings=config,
        image_service=image_service
    )

    # Metrics service - Singleton for background thread management
    metrics_service = providers.Singleton(
        MetricsService,
        container=providers.Self(),
        lifecycle_coordinator=lifecycle_coordinator,
    )

    # Auth services - Singletons for OIDC authentication
    auth_service = providers.Singleton(
        AuthService,
        config=config,
    )
    oidc_client_service = providers.Singleton(
        OidcClientService,
        config=config,
    )

    # ConnectionManager - Singleton for SSE Gateway token mapping
    connection_manager = providers.Singleton(
        ConnectionManager,
        gateway_url=config.provided.sse_gateway_url,
        http_timeout=2.0,  # Short timeout to avoid exceeding SSE Gateway's 5s callback timeout
    )

    kit_reservation_service = providers.Factory(
        KitReservationService,
        db=db_session,
    )
    inventory_service = providers.Factory(
        InventoryService,
        db=db_session,
        part_service=part_service,
        kit_reservation_service=kit_reservation_service,
        shopping_list_service=shopping_list_service,
    )
    shopping_list_line_service = providers.Factory(
        ShoppingListLineService,
        db=db_session,
        seller_service=seller_service,
        inventory_service=inventory_service,
    )
    kit_pick_list_service = providers.Factory(
        KitPickListService,
        db=db_session,
        inventory_service=inventory_service,
        kit_reservation_service=kit_reservation_service,
    )
    pick_list_report_service = providers.Factory(
        PickListReportService,
    )
    kit_shopping_list_service = providers.Factory(
        KitShoppingListService,
        db=db_session,
        inventory_service=inventory_service,
        kit_reservation_service=kit_reservation_service,
        shopping_list_service=shopping_list_service,
        shopping_list_line_service=shopping_list_line_service,
    )
    kit_service = providers.Factory(
        KitService,
        db=db_session,
        inventory_service=inventory_service,
        kit_reservation_service=kit_reservation_service,
        attachment_set_service=attachment_set_service,
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

    # TaskService - Singleton for in-memory task management with configurable settings
    task_service = providers.Singleton(
        TaskService,
        lifecycle_coordinator=lifecycle_coordinator,
        connection_manager=connection_manager,
        max_workers=config.provided.task_max_workers,
        task_timeout=config.provided.task_timeout_seconds,
        cleanup_interval=config.provided.task_cleanup_interval_seconds
    )

    # AI runner - conditional singleton (only when real AI is enabled)
    ai_runner = providers.Singleton(
        _create_ai_runner,
        cfg=config,
    )

    # Duplicate search service
    duplicate_search_service = providers.Factory(
        DuplicateSearchService,
        config=config,
        part_service=part_service,
        ai_runner=ai_runner,
    )

    # Duplicate search function
    duplicate_search_function = providers.Factory(
        DuplicateSearchFunction,
        duplicate_search_service=duplicate_search_service
    )

    # Mouser service and functions
    mouser_service = providers.Factory(
        MouserService,
        config=config,
        download_cache_service=download_cache_service,
    )

    mouser_part_number_search_function = providers.Factory(
        SearchMouserByPartNumberFunction,
        mouser_service=mouser_service
    )

    mouser_keyword_search_function = providers.Factory(
        SearchMouserByKeywordFunction,
        mouser_service=mouser_service
    )

    # Datasheet extraction service and function
    datasheet_extraction_service = providers.Factory(
        DatasheetExtractionService,
        config=config,
        document_service=document_service,
        type_service=type_service,
        ai_runner=ai_runner,
        temp_file_manager=temp_file_manager
    )

    datasheet_extraction_function = providers.Factory(
        ExtractSpecsFromDatasheetFunction,
        datasheet_extraction_service=datasheet_extraction_service
    )

    # AI service
    ai_service = providers.Factory(
        AIService,
        db=db_session,
        config=config,
        temp_file_manager=temp_file_manager,
        type_service=type_service,
        seller_service=seller_service,
        download_cache_service=download_cache_service,
        document_service=document_service,
        duplicate_search_function=duplicate_search_function,
        mouser_part_number_search_function=mouser_part_number_search_function,
        mouser_keyword_search_function=mouser_keyword_search_function,
        datasheet_extraction_function=datasheet_extraction_function,
        ai_runner=ai_runner
    )

    # Version service - Singleton managing SSE subscribers
    version_service = providers.Singleton(
        VersionService,
        settings=config,
        lifecycle_coordinator=lifecycle_coordinator,
        connection_manager=connection_manager
    )

    # Testing utilities - Singleton reset lock for concurrency control
    reset_lock = providers.Singleton(ResetLock)

    # Testing service - Factory for database reset operations
    testing_service = providers.Factory(
        TestingService,
        db=db_session,
        reset_lock=reset_lock,
        test_data_service=test_data_service
    )
