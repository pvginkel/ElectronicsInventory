"""Infrastructure utility endpoints."""

from flask import Blueprint

utils_bp = Blueprint("utils", __name__, url_prefix="/utils")
