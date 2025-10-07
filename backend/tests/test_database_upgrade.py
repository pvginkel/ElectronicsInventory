"""Tests for database upgrade helpers."""

from __future__ import annotations


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

    with app.app_context():
        # Guard to ensure the test environment matches expectations.
        assert database_module.db.engine.dialect.name == "sqlite"

        original_create_all = database_module.db.create_all

        def tracking_create_all() -> None:
            create_called["value"] = True
            original_create_all()

        monkeypatch.setattr(database_module.db, "create_all", tracking_create_all)
        monkeypatch.setattr(database_module, "MetaData", metadata_factory)

        result = database_module.upgrade_database(recreate=True)

    metadata = metadata_holder.get("instance")
    assert metadata is not None
    assert metadata.reflect_called
    assert metadata.drop_called
    assert create_called["value"]
    assert result == []
