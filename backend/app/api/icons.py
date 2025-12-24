"""Static icon endpoints with immutable caching for attachment previews."""

import hashlib
import logging
from pathlib import Path
from typing import Any

from flask import Blueprint, Response

from app.utils.error_handling import handle_api_errors

icons_bp = Blueprint("icons", __name__, url_prefix="/api/icons")

logger = logging.getLogger(__name__)


class _IconCache:
    """Cache for static icon data loaded once at first access."""

    _pdf_data: bytes | None = None
    _pdf_hash: str | None = None
    _link_data: bytes | None = None
    _link_hash: str | None = None

    @classmethod
    def _load_icon(cls, icon_type: str) -> tuple[bytes, str]:
        """Load icon data and compute hash.

        Args:
            icon_type: Either 'pdf' or 'link'

        Returns:
            Tuple of (icon_bytes, version_hash)
        """
        icon_path = Path(__file__).parent.parent / "assets" / f"{icon_type}-icon.svg"
        with open(icon_path, 'rb') as f:
            data = f.read()
        full_hash = hashlib.sha256(data).hexdigest()
        return data, full_hash[:16]

    @classmethod
    def get_pdf_icon(cls) -> tuple[bytes, str]:
        """Get PDF icon data and version hash (cached)."""
        if cls._pdf_data is None:
            cls._pdf_data, cls._pdf_hash = cls._load_icon('pdf')
        return cls._pdf_data, cls._pdf_hash  # type: ignore[return-value]

    @classmethod
    def get_link_icon(cls) -> tuple[bytes, str]:
        """Get link icon data and version hash (cached)."""
        if cls._link_data is None:
            cls._link_data, cls._link_hash = cls._load_icon('link')
        return cls._link_data, cls._link_hash  # type: ignore[return-value]


def get_pdf_icon_version() -> str:
    """Get the version hash for the PDF icon."""
    _, version = _IconCache.get_pdf_icon()
    return version


def get_link_icon_version() -> str:
    """Get the version hash for the link icon."""
    _, version = _IconCache.get_link_icon()
    return version


@icons_bp.route("/pdf", methods=["GET"])
@handle_api_errors
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


@icons_bp.route("/link", methods=["GET"])
@handle_api_errors
def get_link_icon() -> Any:
    """Serve link icon with immutable caching.

    Query params:
        version: Hash of icon content for cache busting (ignored by server)

    Returns:
        SVG icon with Cache-Control: immutable header
    """
    icon_data, _ = _IconCache.get_link_icon()

    response = Response(
        icon_data,
        mimetype='image/svg+xml',
    )
    response.headers['Cache-Control'] = 'public, max-age=31536000, immutable'
    return response
