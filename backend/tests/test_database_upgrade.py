"""Tests for database upgrade helpers."""

from __future__ import annotations

from sqlalchemy import inspect

from app.extensions import db


def test_kits_tables_exist_after_upgrade(app):
    """Kits-related tables should be present after migrations run."""
    with app.app_context():
        inspector = inspect(db.engine)
        tables = set(inspector.get_table_names())
        expected = {"kits", "kit_shopping_list_links", "kit_pick_lists", "kit_contents"}
        assert expected.issubset(tables)
