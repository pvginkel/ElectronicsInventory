"""API blueprints for Electronics Inventory."""

from flask import Blueprint

# Create main API blueprint
api_bp = Blueprint("api", __name__, url_prefix="/api")


# Import and register all resource blueprints
# Note: Imports are done after api_bp creation to avoid circular imports
from app.api.ai_parts import ai_parts_bp  # noqa: E402
from app.api.boxes import boxes_bp  # noqa: E402
from app.api.dashboard import dashboard_bp  # noqa: E402
from app.api.documents import documents_bp  # noqa: E402
from app.api.health import health_bp  # noqa: E402
from app.api.inventory import inventory_bp  # noqa: E402
from app.api.kit_shopping_list_links import kit_shopping_list_links_bp  # noqa: E402
from app.api.kits import kits_bp  # noqa: E402
from app.api.locations import locations_bp  # noqa: E402
from app.api.metrics import metrics_bp  # noqa: E402
from app.api.parts import parts_bp  # noqa: E402
from app.api.pick_lists import pick_lists_bp  # noqa: E402
from app.api.sellers import sellers_bp  # noqa: E402
from app.api.shopping_list_lines import shopping_list_lines_bp  # noqa: E402
from app.api.shopping_lists import shopping_lists_bp  # noqa: E402
from app.api.sse import sse_bp  # noqa: E402
from app.api.tasks import tasks_bp  # noqa: E402
from app.api.types import types_bp  # noqa: E402
from app.api.utils import utils_bp  # noqa: E402

api_bp.register_blueprint(ai_parts_bp)  # type: ignore[attr-defined]
api_bp.register_blueprint(boxes_bp)  # type: ignore[attr-defined]
api_bp.register_blueprint(dashboard_bp)  # type: ignore[attr-defined]
api_bp.register_blueprint(documents_bp)  # type: ignore[attr-defined]
api_bp.register_blueprint(health_bp)  # type: ignore[attr-defined]
api_bp.register_blueprint(inventory_bp)  # type: ignore[attr-defined]
api_bp.register_blueprint(kits_bp)  # type: ignore[attr-defined]
api_bp.register_blueprint(kit_shopping_list_links_bp)  # type: ignore[attr-defined]
api_bp.register_blueprint(locations_bp)  # type: ignore[attr-defined]
api_bp.register_blueprint(metrics_bp)  # type: ignore[attr-defined]
api_bp.register_blueprint(pick_lists_bp)  # type: ignore[attr-defined]
api_bp.register_blueprint(parts_bp)  # type: ignore[attr-defined]
api_bp.register_blueprint(sellers_bp)  # type: ignore[attr-defined]
api_bp.register_blueprint(shopping_lists_bp)  # type: ignore[attr-defined]
api_bp.register_blueprint(shopping_list_lines_bp)  # type: ignore[attr-defined]
api_bp.register_blueprint(sse_bp)  # type: ignore[attr-defined]
api_bp.register_blueprint(tasks_bp)  # type: ignore[attr-defined]
api_bp.register_blueprint(types_bp)  # type: ignore[attr-defined]
api_bp.register_blueprint(utils_bp)  # type: ignore[attr-defined]
