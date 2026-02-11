"""Static icon endpoints with immutable caching for attachment previews."""

import hashlib
import logging
from pathlib import Path
from typing import Any

from flask import Blueprint, Response

icons_bp = Blueprint("icons", __name__, url_prefix="/api/icons")

logger = logging.getLogger(__name__)


class _IconCache:
    """Cache for static icon data loaded once at first access."""

    _pdf_data: bytes | None = None
    _pdf_hash: str | None = None

    @classmethod
    def get_pdf_icon(cls) -> tuple[bytes, str]:
        """Get PDF icon data and version hash (cached)."""
        if cls._pdf_data is None:
            icon_path = Path(__file__).parent.parent / "assets" / "pdf-icon.svg"
            with open(icon_path, 'rb') as f:
                cls._pdf_data = f.read()
            full_hash = hashlib.sha256(cls._pdf_data).hexdigest()
            cls._pdf_hash = full_hash[:16]
        return cls._pdf_data, cls._pdf_hash  # type: ignore[return-value]


def get_pdf_icon_version() -> str:
    """Get the version hash for the PDF icon."""
    _, version = _IconCache.get_pdf_icon()
    return version


@icons_bp.route("/pdf", methods=["GET"])
def get_pdf_icon() -> Any:
    """Serve PDF icon with immutable caching.

    Query params:
        version: Hash of icon content for cache busting (ignored by server)

    Returns:
        SVG icon with Cache-Control: immutable header
    """
    icon_data, _ = _IconCache.get_pdf_icon()

    response = Response(
        icon_data,
        mimetype='image/svg+xml',
    )
    response.headers['Cache-Control'] = 'public, max-age=31536000, immutable'
    return response
