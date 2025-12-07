"""Tests for CLI helpers."""

from types import SimpleNamespace

from flask import Flask

import app.cli as cli


class _DummyQuery:
    """Simplistic query stub returning the provided count."""

    def __init__(self, count: int) -> None:
        self._count = count

    def count(self) -> int:  # pragma: no cover - trivial
        return self._count


class _DummySession:
    """Minimal session stub for CLI tests."""

    def query(self, model):  # pragma: no cover - trivial
        return _DummyQuery(0)

    def get_bind(self):  # pragma: no cover - trivial
        return SimpleNamespace(dialect=SimpleNamespace(name="sqlite"))

    def execute(self, *args, **kwargs):  # pragma: no cover - trivial
        return None

    def commit(self):  # pragma: no cover - trivial
        pass

    def close(self):  # pragma: no cover - trivial
        pass


class _DummyTestDataService:
    """Stubbed test data loader that tracks invocation."""

    def __init__(self, session):  # pragma: no cover - trivial
        self.session = session
        self.loaded = False

    def load_full_dataset(self) -> None:
        self.loaded = True


def test_handle_load_test_data_reports_target_database(monkeypatch, capsys):
    """The CLI should make the target database explicit before destructive work."""
    app = Flask(__name__)
    app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///cli-test.db"
    app.container = SimpleNamespace(session_maker=lambda: _DummySession)

    monkeypatch.setattr(cli, "check_db_connection", lambda: True)
    monkeypatch.setattr(cli, "upgrade_database", lambda recreate=False: [])
    monkeypatch.setattr(cli, "sync_master_data_from_setup", lambda session: None)

    service_stub = _DummyTestDataService(_DummySession())
    monkeypatch.setattr(cli, "TestDataService", lambda session: service_stub)

    cli.handle_load_test_data(app=app, confirmed=True)

    output = capsys.readouterr().out
    assert "sqlite:///cli-test.db" in output
    assert "🗄  Using database" in output
