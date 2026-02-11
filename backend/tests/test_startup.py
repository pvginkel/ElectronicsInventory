"""Tests for app-specific startup hooks (post_migration_hook, load_test_data_hook).

These tests exercise the hooks at the function level with stubbed sessions
and services. The CLI-level orchestration is tested in tests/test_cli.py.
"""

from types import SimpleNamespace
from typing import Any

import pytest
from flask import Flask

import app.startup as startup

# ---------------------------------------------------------------------------
# Stubs
# ---------------------------------------------------------------------------


class _DummyQuery:
    """Simplistic query stub returning the provided count."""

    def __init__(self, count: int) -> None:
        self._count = count

    def count(self) -> int:
        return self._count


class _DummySession:
    """Minimal session stub for startup hook tests."""

    def __init__(self, dialect_name: str = "sqlite") -> None:
        self._dialect_name = dialect_name
        self.committed = False
        self.closed = False
        self.executed_statements: list[Any] = []

    def query(self, model: Any) -> _DummyQuery:
        return _DummyQuery(0)

    def get_bind(self) -> SimpleNamespace:
        return SimpleNamespace(dialect=SimpleNamespace(name=self._dialect_name))

    def execute(self, stmt: Any, *args: Any, **kwargs: Any) -> None:
        self.executed_statements.append(stmt)

    def commit(self) -> None:
        self.committed = True

    def close(self) -> None:
        self.closed = True


class _DummyTestDataService:
    """Stubbed test data loader that tracks invocation."""

    def __init__(self) -> None:
        self.loaded = False

    def load_full_dataset(self) -> None:
        self.loaded = True


def _make_app(
    session: _DummySession | None = None,
    test_data_service: _DummyTestDataService | None = None,
) -> Flask:
    """Create a minimal Flask app with a stubbed container for hook tests."""
    app = Flask(__name__)
    app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///hook-test.db"

    if session is None:
        session = _DummySession()

    app.container = SimpleNamespace(  # type: ignore[attr-defined]
        session_maker=lambda: lambda: session,
        test_data_service=lambda: test_data_service or _DummyTestDataService(),
    )
    return app


# ---------------------------------------------------------------------------
# post_migration_hook
# ---------------------------------------------------------------------------


class TestPostMigrationHook:
    """Tests for the post_migration_hook function."""

    def test_syncs_master_data_and_commits(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """On success, master data is synced and the session is committed and closed."""
        session = _DummySession()
        app = _make_app(session=session)
        sync_calls: list[Any] = []

        monkeypatch.setattr(
            startup, "sync_master_data_from_setup", lambda s: sync_calls.append(s)
        )

        startup.post_migration_hook(app)

        assert len(sync_calls) == 1
        assert sync_calls[0] is session
        assert session.committed is True
        assert session.closed is True

    def test_sync_failure_prints_warning_and_continues(
        self, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
    ) -> None:
        """If sync_master_data_from_setup raises, a warning is printed (non-fatal)."""
        session = _DummySession()
        app = _make_app(session=session)

        def _failing_sync(s: Any) -> None:
            raise RuntimeError("sync failed")

        monkeypatch.setattr(startup, "sync_master_data_from_setup", _failing_sync)

        # Should NOT raise
        startup.post_migration_hook(app)

        output = capsys.readouterr().out
        assert "Warning" in output
        assert "sync failed" in output
        # Session must still be closed even on failure
        assert session.closed is True

    def test_session_closed_on_commit_failure(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """If commit raises, the session is still closed via the finally block."""
        session = _DummySession()

        def _exploding_commit() -> None:
            raise RuntimeError("commit failed")

        session.commit = _exploding_commit  # type: ignore[assignment]
        app = _make_app(session=session)

        monkeypatch.setattr(startup, "sync_master_data_from_setup", lambda s: None)

        # Non-fatal -- should not raise
        startup.post_migration_hook(app)

        assert session.closed is True


# ---------------------------------------------------------------------------
# load_test_data_hook
# ---------------------------------------------------------------------------


class TestLoadTestDataHook:
    """Tests for the load_test_data_hook function."""

    def test_success_path(
        self, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
    ) -> None:
        """On success, master data syncs, test data loads, and summary is printed."""
        session = _DummySession()
        service = _DummyTestDataService()
        app = _make_app(session=session, test_data_service=service)
        sync_calls: list[Any] = []

        monkeypatch.setattr(
            startup, "sync_master_data_from_setup", lambda s: sync_calls.append(s)
        )

        startup.load_test_data_hook(app)

        # Verify sync was called
        assert len(sync_calls) == 1
        assert sync_calls[0] is session

        # Verify session was committed (for master data sync)
        assert session.committed is True

        # Verify test data service was invoked
        assert service.loaded is True

        # Verify session was closed
        assert session.closed is True

        # Verify summary was printed
        output = capsys.readouterr().out
        assert "Test data loaded successfully" in output
        assert "Dataset summary" in output
        assert "part types" in output
        assert "storage boxes" in output

    def test_postgres_sequence_reset(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """On PostgreSQL, the boxes_box_no_seq sequence is reset."""
        session = _DummySession(dialect_name="postgresql")
        app = _make_app(session=session)

        monkeypatch.setattr(startup, "sync_master_data_from_setup", lambda s: None)

        startup.load_test_data_hook(app)

        # Verify a SQL statement was executed (the setval call)
        assert len(session.executed_statements) == 1
        stmt_text = str(session.executed_statements[0])
        assert "setval" in stmt_text
        assert "boxes_box_no_seq" in stmt_text

    def test_sqlite_skips_sequence_reset(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """On SQLite, the sequence reset step is skipped."""
        session = _DummySession(dialect_name="sqlite")
        app = _make_app(session=session)

        monkeypatch.setattr(startup, "sync_master_data_from_setup", lambda s: None)

        startup.load_test_data_hook(app)

        # No SQL statements should be executed for SQLite (no setval)
        assert len(session.executed_statements) == 0

    def test_sync_failure_propagates(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """If sync_master_data_from_setup raises, the exception propagates (fatal)."""
        session = _DummySession()
        app = _make_app(session=session)

        def _failing_sync(s: Any) -> None:
            raise RuntimeError("sync failed")

        monkeypatch.setattr(startup, "sync_master_data_from_setup", _failing_sync)

        with pytest.raises(RuntimeError, match="sync failed"):
            startup.load_test_data_hook(app)

        # Session must still be closed via finally block
        assert session.closed is True

    def test_test_data_failure_propagates(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """If load_full_dataset raises, the exception propagates (fatal)."""
        session = _DummySession()
        service = _DummyTestDataService()

        def _exploding_load() -> None:
            raise RuntimeError("load failed")

        service.load_full_dataset = _exploding_load  # type: ignore[assignment]
        app = _make_app(session=session, test_data_service=service)

        monkeypatch.setattr(startup, "sync_master_data_from_setup", lambda s: None)

        with pytest.raises(RuntimeError, match="load failed"):
            startup.load_test_data_hook(app)

        assert session.closed is True

    def test_session_closed_on_summary_failure(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """If the summary queries fail, the session is still closed."""
        session = _DummySession()

        def _exploding_query(model: Any) -> _DummyQuery:
            raise RuntimeError("query failed")

        session.query = _exploding_query  # type: ignore[assignment]
        app = _make_app(session=session)

        monkeypatch.setattr(startup, "sync_master_data_from_setup", lambda s: None)

        with pytest.raises(RuntimeError, match="query failed"):
            startup.load_test_data_hook(app)

        assert session.closed is True
