"""Tests for database upgrade helpers."""

from __future__ import annotations

from types import SimpleNamespace

from sqlalchemy import inspect

from app.extensions import db


def test_upgrade_database_recreate_sqlite_uses_sqlalchemy_metadata(app, monkeypatch):
    """When recreating a SQLite database, migrations should fall back to metadata rebuild."""
    from app import database as database_module

    class TrackingMetaData:
        def __init__(self) -> None:
            self.tables = {"dummy": object()}
            self.reflect_called = False
            self.drop_called = False

        def reflect(self, bind) -> None:
            self.reflect_called = True

        def drop_all(self, bind) -> None:
            self.drop_called = True

    metadata_holder: dict[str, TrackingMetaData] = {}

    def metadata_factory() -> TrackingMetaData:
        metadata = TrackingMetaData()
        metadata_holder["instance"] = metadata
        return metadata

    create_called = {"value": False}
    stamp_calls: list[tuple[SimpleNamespace, str]] = []

    with app.app_context():
        # Guard to ensure the test environment matches expectations.
        assert database_module.db.engine.dialect.name == "sqlite"

        original_create_all = database_module.db.create_all

        def tracking_create_all() -> None:
            create_called["value"] = True
            original_create_all()

        monkeypatch.setattr(database_module.db, "create_all", tracking_create_all)
        monkeypatch.setattr(database_module, "MetaData", metadata_factory)
        monkeypatch.setattr(
            database_module,
            "_get_alembic_config",
            lambda: SimpleNamespace(attributes={}),
        )

        def fake_stamp(config: SimpleNamespace, revision: str) -> None:
            stamp_calls.append((config, revision))

        monkeypatch.setattr(database_module.command, "stamp", fake_stamp)

        result = database_module.upgrade_database(recreate=True)

    metadata = metadata_holder.get("instance")
    assert metadata is not None
    assert metadata.reflect_called
    assert metadata.drop_called
    assert create_called["value"]
    assert stamp_calls and stamp_calls[0][1] == "head"
    stamped_config = stamp_calls[0][0]
    assert stamped_config.attributes["connection"] is not None
    assert result == []


def test_kits_tables_exist_after_upgrade(app):
    """Kits-related tables should be present after migrations run."""
    with app.app_context():
        inspector = inspect(db.engine)
        tables = set(inspector.get_table_names())
        expected = {"kits", "kit_shopping_list_links", "kit_pick_lists"}
        assert expected.issubset(tables)
