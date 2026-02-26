"""Comprehensive tests for role-based access control.

Tests cover:
  - AuthService role hierarchy expansion
  - Method-based role inference and enforcement (before_request hook)
  - @safe_query decorator behavior
  - @allow_roles startup validation and runtime enforcement
  - Blanket 403 for unrecognized roles
  - Testing mode with test sessions and role enforcement
  - OpenAPI security annotations
"""

import sqlite3
from collections.abc import Generator
from typing import Any
from unittest.mock import MagicMock, patch

import pytest
from flask import Blueprint, Flask
from sqlalchemy.pool import StaticPool

from app import create_app
from app.app_config import AppSettings
from app.config import Settings
from app.exceptions import AuthorizationException
from app.services.auth_service import AuthContext, AuthService
from app.utils.auth import (
    allow_roles,
    check_authorization,
    safe_query,
    validate_allow_roles_at_startup,
)
from tests.conftest_infrastructure import _build_test_settings


def _build_test_app_settings() -> AppSettings:
    """EI-specific test app settings."""
    return AppSettings(ai_testing_mode=True)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_auth_service(
    *,
    read_role: str | None = "reader",
    write_role: str | None = "editor",
    admin_role: str | None = "admin",
    additional_roles: list[str] | None = None,
    oidc_enabled: bool = False,
) -> AuthService:
    """Create an AuthService with a minimal mock config (OIDC disabled)."""
    settings = _build_test_settings().model_copy(update={
        "oidc_enabled": oidc_enabled,
    })
    return AuthService(
        config=settings,
        read_role=read_role,
        write_role=write_role,
        admin_role=admin_role,
        additional_roles=additional_roles,
    )


def _make_view_func(
    *,
    is_public: bool = False,
    is_safe_query: bool = False,
    allowed_roles: set[str] | None = None,
) -> Any:
    """Build a fake view function with optional decorator attributes."""
    def view() -> None:
        pass
    if is_public:
        view.is_public = True  # type: ignore[attr-defined]
    if is_safe_query:
        view.is_safe_query = True  # type: ignore[attr-defined]
    if allowed_roles is not None:
        view.allowed_roles = allowed_roles  # type: ignore[attr-defined]
    return view


# ===========================================================================
# 1) AuthService -- configured_roles property
# ===========================================================================


class TestConfiguredRoles:
    """Tests for AuthService.configured_roles property."""

    def test_all_three_tiers(self) -> None:
        svc = _make_auth_service()
        assert svc.configured_roles == {"reader", "editor", "admin"}

    def test_no_admin_role(self) -> None:
        svc = _make_auth_service(admin_role=None)
        assert svc.configured_roles == {"reader", "editor"}

    def test_additional_roles(self) -> None:
        svc = _make_auth_service(additional_roles=["pipeline", "ci"])
        assert svc.configured_roles == {"reader", "editor", "admin", "pipeline", "ci"}

    def test_additional_roles_with_no_admin(self) -> None:
        svc = _make_auth_service(admin_role=None, additional_roles=["pipeline"])
        assert svc.configured_roles == {"reader", "editor", "pipeline"}

    def test_no_roles_configured(self) -> None:
        """Row 1: all None -> empty configured_roles (any authed user passes)."""
        svc = _make_auth_service(read_role=None, write_role=None, admin_role=None)
        assert svc.configured_roles == set()

    def test_admin_only(self) -> None:
        """Row 2: only admin set."""
        svc = _make_auth_service(read_role=None, write_role=None, admin_role="admin")
        assert svc.configured_roles == {"admin"}

    def test_reader_and_admin_no_editor(self) -> None:
        """Row 8: reader + admin, no editor tier."""
        svc = _make_auth_service(read_role="reader", write_role=None, admin_role="admin")
        assert svc.configured_roles == {"reader", "admin"}


class TestConfigurationValidation:
    """Tests for invalid role configurations."""

    def test_reader_set_without_writer_or_admin_raises(self) -> None:
        """Row 7: read_role set but no write_role and no admin_role is invalid."""
        with pytest.raises(ValueError, match="no role would be able to write"):
            _make_auth_service(read_role="reader", write_role=None, admin_role=None)


# ===========================================================================
# 2) AuthService -- role hierarchy expansion
# ===========================================================================


class TestExpandRoles:
    """Tests for AuthService.expand_roles method."""

    def test_admin_expands_to_all(self) -> None:
        svc = _make_auth_service()
        assert svc.expand_roles({"admin"}) == {"admin", "editor", "reader"}

    def test_editor_expands_to_editor_and_reader(self) -> None:
        svc = _make_auth_service()
        assert svc.expand_roles({"editor"}) == {"editor", "reader"}

    def test_reader_stays_reader(self) -> None:
        svc = _make_auth_service()
        assert svc.expand_roles({"reader"}) == {"reader"}

    def test_unknown_role_passed_through(self) -> None:
        svc = _make_auth_service()
        assert svc.expand_roles({"unknown"}) == {"unknown"}

    def test_multiple_roles_expanded(self) -> None:
        svc = _make_auth_service()
        # If a user has both "admin" and "pipeline", both get expanded/preserved
        result = svc.expand_roles({"admin", "pipeline"})
        assert result == {"admin", "editor", "reader", "pipeline"}

    def test_no_admin_role_configured(self) -> None:
        svc = _make_auth_service(admin_role=None)
        # "admin" is not in the hierarchy, so it passes through unchanged
        assert svc.expand_roles({"admin"}) == {"admin"}
        assert svc.expand_roles({"editor"}) == {"editor", "reader"}

    def test_additional_role_not_expanded(self) -> None:
        svc = _make_auth_service(additional_roles=["pipeline"])
        result = svc.expand_roles({"pipeline"})
        assert result == {"pipeline"}

    def test_empty_roles(self) -> None:
        svc = _make_auth_service()
        assert svc.expand_roles(set()) == set()

    def test_admin_skips_missing_write_tier(self) -> None:
        """Row 8: admin expands to {admin, reader} when write_role is None."""
        svc = _make_auth_service(read_role="reader", write_role=None, admin_role="admin")
        assert svc.expand_roles({"admin"}) == {"admin", "reader"}

    def test_admin_only_config(self) -> None:
        """Row 2: admin expands to just {admin} when no other tiers set."""
        svc = _make_auth_service(read_role=None, write_role=None, admin_role="admin")
        assert svc.expand_roles({"admin"}) == {"admin"}

    def test_no_tiers_configured(self) -> None:
        """Row 1: no hierarchy at all, roles pass through unchanged."""
        svc = _make_auth_service(read_role=None, write_role=None, admin_role=None)
        assert svc.expand_roles({"something"}) == {"something"}


# ===========================================================================
# 3) AuthService -- resolve_required_role
# ===========================================================================


class TestResolveRequiredRole:
    """Tests for AuthService.resolve_required_role."""

    # --- Full three-tier (EI default) ---

    def test_get_requires_read_role(self) -> None:
        svc = _make_auth_service()
        assert svc.resolve_required_role("GET") == "reader"

    def test_head_requires_read_role(self) -> None:
        svc = _make_auth_service()
        assert svc.resolve_required_role("HEAD") == "reader"

    def test_post_requires_write_role(self) -> None:
        svc = _make_auth_service()
        assert svc.resolve_required_role("POST") == "editor"

    def test_put_requires_write_role(self) -> None:
        svc = _make_auth_service()
        assert svc.resolve_required_role("PUT") == "editor"

    def test_patch_requires_write_role(self) -> None:
        svc = _make_auth_service()
        assert svc.resolve_required_role("PATCH") == "editor"

    def test_delete_requires_write_role(self) -> None:
        svc = _make_auth_service()
        assert svc.resolve_required_role("DELETE") == "editor"

    # --- Decorator overrides ---

    def test_safe_query_overrides_post(self) -> None:
        svc = _make_auth_service()
        view = _make_view_func(is_safe_query=True)
        assert svc.resolve_required_role("POST", view) == "reader"

    def test_allow_roles_overrides_everything(self) -> None:
        svc = _make_auth_service()
        view = _make_view_func(allowed_roles={"admin"})
        # Even for GET, the explicit override takes precedence
        assert svc.resolve_required_role("GET", view) == {"admin"}
        assert svc.resolve_required_role("POST", view) == {"admin"}

    def test_allow_roles_takes_precedence_over_safe_query(self) -> None:
        svc = _make_auth_service()
        view = _make_view_func(is_safe_query=True, allowed_roles={"admin"})
        assert svc.resolve_required_role("POST", view) == {"admin"}

    def test_no_view_func_uses_method_inference(self) -> None:
        svc = _make_auth_service()
        assert svc.resolve_required_role("GET", None) == "reader"
        assert svc.resolve_required_role("POST", None) == "editor"

    # --- Write fallback to admin_role (rows 2 and 8) ---

    def test_write_falls_back_to_admin_when_write_role_none(self) -> None:
        """Row 2: write_role=None, admin_role=admin -> writes require admin."""
        svc = _make_auth_service(read_role=None, write_role=None, admin_role="admin")
        assert svc.resolve_required_role("POST") == "admin"
        assert svc.resolve_required_role("DELETE") == "admin"

    def test_read_open_when_read_role_none(self) -> None:
        """Row 2: read_role=None -> reads return None (any authed user)."""
        svc = _make_auth_service(read_role=None, write_role=None, admin_role="admin")
        assert svc.resolve_required_role("GET") is None

    def test_reader_admin_two_tier(self) -> None:
        """Row 8: reader/None/admin -> GET=reader, POST=admin."""
        svc = _make_auth_service(read_role="reader", write_role=None, admin_role="admin")
        assert svc.resolve_required_role("GET") == "reader"
        assert svc.resolve_required_role("POST") == "admin"

    # --- All tiers None (row 1) ---

    def test_no_roles_configured_returns_none(self) -> None:
        """Row 1: all None -> no gates, everything returns None."""
        svc = _make_auth_service(read_role=None, write_role=None, admin_role=None)
        assert svc.resolve_required_role("GET") is None
        assert svc.resolve_required_role("POST") is None


# ===========================================================================
# 4) check_authorization -- unit tests
# ===========================================================================


class TestCheckAuthorization:
    """Tests for the check_authorization function."""

    def test_reader_can_get(self) -> None:
        svc = _make_auth_service()
        ctx = AuthContext(subject="u", email=None, name=None, roles={"reader"})
        # Should not raise
        check_authorization(ctx, svc, "GET")

    def test_reader_cannot_post(self) -> None:
        svc = _make_auth_service()
        ctx = AuthContext(subject="u", email=None, name=None, roles={"reader"})
        with pytest.raises(AuthorizationException, match="Insufficient permissions"):
            check_authorization(ctx, svc, "POST")

    def test_editor_can_post(self) -> None:
        svc = _make_auth_service()
        # Editor expanded roles include reader
        ctx = AuthContext(subject="u", email=None, name=None, roles={"editor", "reader"})
        check_authorization(ctx, svc, "POST")

    def test_editor_can_get(self) -> None:
        svc = _make_auth_service()
        ctx = AuthContext(subject="u", email=None, name=None, roles={"editor", "reader"})
        check_authorization(ctx, svc, "GET")

    def test_admin_can_do_anything(self) -> None:
        svc = _make_auth_service()
        ctx = AuthContext(
            subject="u", email=None, name=None,
            roles={"admin", "editor", "reader"},
        )
        check_authorization(ctx, svc, "GET")
        check_authorization(ctx, svc, "POST")
        check_authorization(ctx, svc, "PUT")
        check_authorization(ctx, svc, "DELETE")

    def test_safe_query_allows_reader_on_post(self) -> None:
        svc = _make_auth_service()
        view = _make_view_func(is_safe_query=True)
        ctx = AuthContext(subject="u", email=None, name=None, roles={"reader"})
        check_authorization(ctx, svc, "POST", view)

    def test_unrecognized_role_blanket_403(self) -> None:
        svc = _make_auth_service()
        ctx = AuthContext(subject="u", email=None, name=None, roles={"unknown"})
        with pytest.raises(AuthorizationException, match="No recognized role"):
            check_authorization(ctx, svc, "GET")

    def test_empty_roles_blanket_403(self) -> None:
        svc = _make_auth_service()
        ctx = AuthContext(subject="u", email=None, name=None, roles=set())
        with pytest.raises(AuthorizationException, match="No recognized role"):
            check_authorization(ctx, svc, "GET")

    def test_allow_roles_admin_only_rejects_editor(self) -> None:
        svc = _make_auth_service()
        view = _make_view_func(allowed_roles={"admin"})
        ctx = AuthContext(
            subject="u", email=None, name=None,
            roles={"editor", "reader"},
        )
        with pytest.raises(AuthorizationException, match="Insufficient permissions"):
            check_authorization(ctx, svc, "GET", view)

    def test_allow_roles_admin_only_allows_admin(self) -> None:
        svc = _make_auth_service()
        view = _make_view_func(allowed_roles={"admin"})
        ctx = AuthContext(
            subject="u", email=None, name=None,
            roles={"admin", "editor", "reader"},
        )
        check_authorization(ctx, svc, "GET", view)

    def test_allow_roles_multiple_roles(self) -> None:
        svc = _make_auth_service()
        view = _make_view_func(allowed_roles={"reader", "editor"})
        ctx = AuthContext(subject="u", email=None, name=None, roles={"reader"})
        check_authorization(ctx, svc, "POST", view)

    def test_no_role_gate_any_authed_passes(self) -> None:
        """When resolve returns None, any authenticated user passes."""
        svc = _make_auth_service(read_role=None, write_role=None, admin_role=None)
        ctx = AuthContext(subject="u", email=None, name=None, roles=set())
        # Neither GET nor POST should raise
        check_authorization(ctx, svc, "GET")
        check_authorization(ctx, svc, "POST")

    def test_admin_only_write_gate(self) -> None:
        """Row 2: reads open, writes gated behind admin."""
        svc = _make_auth_service(read_role=None, write_role=None, admin_role="admin")
        admin_ctx = AuthContext(subject="u", email=None, name=None, roles={"admin"})
        anon_ctx = AuthContext(subject="u", email=None, name=None, roles=set())
        # Admin can do both
        check_authorization(admin_ctx, svc, "GET")
        check_authorization(admin_ctx, svc, "POST")
        # Non-admin can read (no gate) but not write
        check_authorization(anon_ctx, svc, "GET")
        with pytest.raises(AuthorizationException):
            check_authorization(anon_ctx, svc, "POST")

    def test_reader_admin_two_tier(self) -> None:
        """Row 8: reader/None/admin -> reader reads, admin writes."""
        svc = _make_auth_service(read_role="reader", write_role=None, admin_role="admin")
        reader_ctx = AuthContext(subject="u", email=None, name=None, roles={"reader"})
        admin_ctx = AuthContext(subject="u", email=None, name=None, roles={"admin", "reader"})
        # Reader can GET, not POST
        check_authorization(reader_ctx, svc, "GET")
        with pytest.raises(AuthorizationException, match="Insufficient permissions"):
            check_authorization(reader_ctx, svc, "POST")
        # Admin can both
        check_authorization(admin_ctx, svc, "GET")
        check_authorization(admin_ctx, svc, "POST")


# ===========================================================================
# 5) @safe_query decorator
# ===========================================================================


class TestSafeQueryDecorator:
    """Tests for the @safe_query decorator."""

    def test_sets_attribute(self) -> None:
        @safe_query
        def my_view() -> None:
            pass
        assert getattr(my_view, "is_safe_query", False) is True

    def test_preserves_function(self) -> None:
        @safe_query
        def my_view() -> str:
            return "hello"
        assert my_view() == "hello"


# ===========================================================================
# 6) @allow_roles decorator
# ===========================================================================


class TestAllowRolesDecorator:
    """Tests for the @allow_roles decorator."""

    def test_sets_allowed_roles(self) -> None:
        @allow_roles("admin", "editor")
        def my_view() -> None:
            pass
        assert getattr(my_view, "allowed_roles", set()) == {"admin", "editor"}


# ===========================================================================
# 7) validate_allow_roles_at_startup
# ===========================================================================


class TestValidateAllowRolesAtStartup:
    """Tests for startup validation of @allow_roles."""

    def test_valid_roles_pass(self) -> None:
        svc = _make_auth_service()

        app = Flask(__name__)
        bp = Blueprint("test", __name__)

        @bp.route("/admin")
        @allow_roles("admin")
        def admin_only() -> str:
            return "ok"

        app.register_blueprint(bp)

        with app.app_context():
            # Should not raise
            validate_allow_roles_at_startup(app, svc)

    def test_unknown_role_raises_value_error(self) -> None:
        svc = _make_auth_service()

        app = Flask(__name__)
        bp = Blueprint("test2", __name__)

        @bp.route("/bad")
        @allow_roles("superadmin")
        def bad_endpoint() -> str:
            return "nope"

        app.register_blueprint(bp)

        with app.app_context():
            with pytest.raises(ValueError, match="superadmin"):
                validate_allow_roles_at_startup(app, svc)

    def test_admin_role_none_rejects_admin_usage(self) -> None:
        svc = _make_auth_service(admin_role=None)

        app = Flask(__name__)
        bp = Blueprint("test3", __name__)

        @bp.route("/admin")
        @allow_roles("admin")
        def admin_only() -> str:
            return "ok"

        app.register_blueprint(bp)

        with app.app_context():
            with pytest.raises(ValueError, match="admin"):
                validate_allow_roles_at_startup(app, svc)


# ===========================================================================
# 8) OIDC integration tests -- role enforcement via before_request hook
# ===========================================================================

@pytest.fixture
def oidc_role_app(
    test_settings: Settings,
    test_app_settings: AppSettings,
    template_connection: sqlite3.Connection,
    mock_oidc_discovery: dict[str, Any],
    generate_test_jwt: Any,
) -> Generator[Flask]:
    """Create an OIDC-enabled app for role-based access tests.

    The same pattern as the standard oidc_app fixture but kept local to
    ensure test isolation.
    """
    clone_conn = sqlite3.connect(":memory:", check_same_thread=False)
    template_connection.backup(clone_conn)

    settings = test_settings.model_copy(update={
        "database_url": "sqlite://",
        "sqlalchemy_engine_options": {
            "poolclass": StaticPool,
            "creator": lambda: clone_conn,
        },
        "oidc_enabled": True,
        "oidc_client_secret": "test-secret",
    })

    with patch("httpx.get") as mock_get:
        mock_response = MagicMock()
        mock_response.json.return_value = mock_oidc_discovery
        mock_response.raise_for_status = MagicMock()
        mock_get.return_value = mock_response

        with patch("app.services.auth_service.PyJWKClient") as mock_jwk_client_class:
            mock_jwk_client = MagicMock()
            mock_signing_key = MagicMock()
            mock_signing_key.key = generate_test_jwt.public_key
            mock_jwk_client.get_signing_key_from_jwt.return_value = mock_signing_key
            mock_jwk_client_class.return_value = mock_jwk_client

            app = create_app(
                settings,
                app_settings=test_app_settings,
                skip_background_services=True,
            )

            try:
                yield app
            finally:
                try:
                    app.container.lifecycle_coordinator().shutdown()
                except Exception:
                    pass
                with app.app_context():
                    from app.extensions import db as flask_db
                    flask_db.session.remove()
                clone_conn.close()


@pytest.fixture
def oidc_role_client(oidc_role_app: Flask) -> Any:
    """Test client for the OIDC-enabled role enforcement app."""
    return oidc_role_app.test_client()


class TestMethodBasedRoleEnforcement:
    """Integration tests: method-based role enforcement through the before_request hook."""

    def test_reader_can_get(
        self, oidc_role_client: Any, generate_test_jwt: Any
    ) -> None:
        token = generate_test_jwt(roles=["reader"])
        resp = oidc_role_client.get(
            "/api/types",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200

    def test_reader_cannot_post(
        self, oidc_role_client: Any, generate_test_jwt: Any
    ) -> None:
        token = generate_test_jwt(roles=["reader"])
        resp = oidc_role_client.post(
            "/api/types",
            json={"name": "TestType"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403

    def test_editor_can_get(
        self, oidc_role_client: Any, generate_test_jwt: Any
    ) -> None:
        token = generate_test_jwt(roles=["editor"])
        resp = oidc_role_client.get(
            "/api/types",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200

    def test_editor_can_post(
        self, oidc_role_client: Any, generate_test_jwt: Any
    ) -> None:
        token = generate_test_jwt(roles=["editor"])
        resp = oidc_role_client.post(
            "/api/types",
            json={"name": "TestType"},
            headers={"Authorization": f"Bearer {token}"},
        )
        # Should be 201 (created) or 409 (already exists), not 403
        assert resp.status_code != 403

    def test_admin_can_do_everything(
        self, oidc_role_client: Any, generate_test_jwt: Any
    ) -> None:
        token = generate_test_jwt(roles=["admin"])
        resp_get = oidc_role_client.get(
            "/api/types",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp_get.status_code == 200

        resp_post = oidc_role_client.post(
            "/api/types",
            json={"name": "AdminTestType"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp_post.status_code != 403

    def test_no_recognized_role_returns_403(
        self, oidc_role_client: Any, generate_test_jwt: Any
    ) -> None:
        token = generate_test_jwt(roles=["unknown_role"])
        resp = oidc_role_client.get(
            "/api/types",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403
        data = resp.get_json()
        assert "No recognized role" in data["error"]

    def test_no_token_returns_401(self, oidc_role_client: Any) -> None:
        resp = oidc_role_client.get("/api/types")
        assert resp.status_code == 401

    def test_empty_roles_returns_403(
        self, oidc_role_client: Any, generate_test_jwt: Any
    ) -> None:
        token = generate_test_jwt(roles=[])
        resp = oidc_role_client.get(
            "/api/types",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403


class TestSafeQueryEndpoints:
    """Integration tests: @safe_query endpoints require only read_role."""

    def test_reader_can_query_parts_shopping_list_memberships(
        self, oidc_role_client: Any, generate_test_jwt: Any
    ) -> None:
        token = generate_test_jwt(roles=["reader"])
        resp = oidc_role_client.post(
            "/api/parts/shopping-list-memberships/query",
            json={"part_keys": []},
            headers={"Authorization": f"Bearer {token}"},
        )
        # 200 is expected (or 400 for validation). Not 403.
        assert resp.status_code != 403

    def test_reader_can_query_kits_shopping_list_memberships(
        self, oidc_role_client: Any, generate_test_jwt: Any
    ) -> None:
        token = generate_test_jwt(roles=["reader"])
        resp = oidc_role_client.post(
            "/api/kits/shopping-list-memberships/query",
            json={"kit_ids": []},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code != 403

    def test_reader_can_query_kits_pick_list_memberships(
        self, oidc_role_client: Any, generate_test_jwt: Any
    ) -> None:
        token = generate_test_jwt(roles=["reader"])
        resp = oidc_role_client.post(
            "/api/kits/pick-list-memberships/query",
            json={"kit_ids": []},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code != 403

    def test_reader_cannot_post_to_non_safe_query(
        self, oidc_role_client: Any, generate_test_jwt: Any
    ) -> None:
        token = generate_test_jwt(roles=["reader"])
        resp = oidc_role_client.post(
            "/api/types",
            json={"name": "Blocked"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403


# ===========================================================================
# 9) Testing mode with test sessions
# ===========================================================================


class TestTestingModeRoleEnforcement:
    """Tests for role enforcement in testing mode using test sessions.

    Flask's test client manages cookies internally via set_cookie, not
    through raw Cookie headers.
    """

    def test_reader_session_can_get(self, app: Flask, client: Any) -> None:
        """Test session with reader role can access GET endpoints."""
        testing_service = app.container.testing_service()
        token = testing_service.create_session(
            subject="test-reader",
            roles=["reader"],
        )
        client.set_cookie("access_token", token, domain="localhost")
        resp = client.get("/api/types")
        assert resp.status_code == 200

    def test_reader_session_cannot_post(self, app: Flask, client: Any) -> None:
        """Test session with reader role is blocked from POST endpoints."""
        testing_service = app.container.testing_service()
        token = testing_service.create_session(
            subject="test-reader",
            roles=["reader"],
        )
        client.set_cookie("access_token", token, domain="localhost")
        resp = client.post("/api/types", json={"name": "Blocked"})
        assert resp.status_code == 403

    def test_editor_session_can_post(self, app: Flask, client: Any) -> None:
        """Test session with editor role can POST."""
        testing_service = app.container.testing_service()
        token = testing_service.create_session(
            subject="test-editor",
            roles=["editor"],
        )
        client.set_cookie("access_token", token, domain="localhost")
        resp = client.post("/api/types", json={"name": "EditorTestType"})
        # 201 or 409, not 403
        assert resp.status_code != 403

    def test_admin_session_can_do_anything(self, app: Flask, client: Any) -> None:
        """Test session with admin role has full access."""
        testing_service = app.container.testing_service()
        token = testing_service.create_session(
            subject="test-admin",
            roles=["admin"],
        )
        client.set_cookie("access_token", token, domain="localhost")
        resp_get = client.get("/api/types")
        assert resp_get.status_code == 200

        resp_post = client.post("/api/types", json={"name": "AdminTestType2"})
        assert resp_post.status_code != 403

    def test_no_role_session_gets_403(self, app: Flask, client: Any) -> None:
        """Test session with no roles is rejected."""
        testing_service = app.container.testing_service()
        token = testing_service.create_session(
            subject="test-norole",
            roles=[],
        )
        client.set_cookie("access_token", token, domain="localhost")
        resp = client.get("/api/types")
        assert resp.status_code == 403

    def test_reader_session_can_use_safe_query(self, app: Flask, client: Any) -> None:
        """Test session with reader role can access @safe_query POST endpoints."""
        testing_service = app.container.testing_service()
        token = testing_service.create_session(
            subject="test-reader",
            roles=["reader"],
        )
        client.set_cookie("access_token", token, domain="localhost")
        resp = client.post(
            "/api/parts/shopping-list-memberships/query",
            json={"part_keys": []},
        )
        assert resp.status_code != 403


# ===========================================================================
# 10) OIDC disabled -- no role enforcement
# ===========================================================================


class TestOidcDisabledNoRoleEnforcement:
    """When OIDC is disabled, no role enforcement should occur."""

    def test_get_works_without_token(self, app: Flask, client: Any) -> None:
        resp = client.get("/api/types")
        assert resp.status_code == 200

    def test_post_works_without_token(self, app: Flask, client: Any) -> None:
        resp = client.post("/api/types", json={"name": "NoAuth"})
        # 201 or 409 -- not 401 or 403
        assert resp.status_code not in (401, 403)


# ===========================================================================
# 11) Token hierarchy expansion through validate_token
# ===========================================================================


class TestValidateTokenHierarchyExpansion:
    """Test that validate_token returns expanded roles."""

    def test_admin_token_has_all_roles(
        self,
        oidc_role_app: Flask,
        generate_test_jwt: Any,
    ) -> None:
        token = generate_test_jwt(roles=["admin"])
        auth_service = oidc_role_app.container.auth_service()
        with oidc_role_app.app_context():
            ctx = auth_service.validate_token(token)
        assert "admin" in ctx.roles
        assert "editor" in ctx.roles
        assert "reader" in ctx.roles

    def test_editor_token_has_editor_and_reader(
        self,
        oidc_role_app: Flask,
        generate_test_jwt: Any,
    ) -> None:
        token = generate_test_jwt(roles=["editor"])
        auth_service = oidc_role_app.container.auth_service()
        with oidc_role_app.app_context():
            ctx = auth_service.validate_token(token)
        assert "editor" in ctx.roles
        assert "reader" in ctx.roles
        assert "admin" not in ctx.roles

    def test_reader_token_has_only_reader(
        self,
        oidc_role_app: Flask,
        generate_test_jwt: Any,
    ) -> None:
        token = generate_test_jwt(roles=["reader"])
        auth_service = oidc_role_app.container.auth_service()
        with oidc_role_app.app_context():
            ctx = auth_service.validate_token(token)
        assert ctx.roles == {"reader"}


# ===========================================================================
# 12) OpenAPI security annotations
# ===========================================================================


class TestOpenApiSecurityAnnotations:
    """Tests for the OpenAPI security role map.

    Uses ``app.openapi_role_map`` which ``annotate_openapi_security`` always
    populates, regardless of Spectree's global instance state.  This avoids
    flaky behaviour when multiple ``create_app`` calls occur in tests.
    """

    @pytest.fixture
    def role_map(self, app: Flask) -> dict[str, dict[str, str]]:
        """Return the per-endpoint role map stored on the app."""
        return app.openapi_role_map  # type: ignore[attr-defined]

    def test_get_endpoint_has_reader_role(self, role_map: dict[str, dict[str, str]]) -> None:
        """GET endpoints should be mapped to the read role."""
        types_ops = role_map.get("/api/types")
        assert types_ops is not None, "Expected /api/types in role map"
        assert types_ops.get("get") == "reader"

    def test_post_endpoint_has_editor_role(self, role_map: dict[str, dict[str, str]]) -> None:
        """POST endpoints should be mapped to the write role."""
        types_ops = role_map.get("/api/types")
        assert types_ops is not None, "Expected /api/types in role map"
        assert types_ops.get("post") == "editor"

    def test_safe_query_endpoint_has_reader_role(self, role_map: dict[str, dict[str, str]]) -> None:
        """POST @safe_query endpoints should be mapped to the read role."""
        query_ops = role_map.get("/api/parts/shopping-list-memberships/query")
        assert query_ops is not None, "Expected query endpoint in role map"
        assert query_ops.get("post") == "reader"

    def test_security_scheme_defined(self, app: Flask) -> None:
        """The BearerAuth security scheme should be in the Spectree config."""
        from app.utils.spectree_config import api as spectree_api
        # The security scheme is always registered on the SpecTree instance
        assert any(
            s.name == "BearerAuth" for s in spectree_api.config.security_schemes
        )

    def test_public_endpoint_not_in_role_map(self, role_map: dict[str, dict[str, str]]) -> None:
        """Public endpoints should be absent from the role map."""
        assert "/api/auth/self" not in role_map


# ===========================================================================
# 13) HEAD request handling
# ===========================================================================


class TestHeadRequestHandling:
    """Tests for HEAD request role inference (treated as GET)."""

    def test_reader_can_head(
        self, oidc_role_client: Any, generate_test_jwt: Any
    ) -> None:
        """HEAD requests should be treated as GET (read_role)."""
        token = generate_test_jwt(roles=["reader"])
        # Flask auto-generates HEAD for GET routes
        resp = oidc_role_client.head(
            "/api/types",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200


# ===========================================================================
# 14) Edge cases
# ===========================================================================


class TestEdgeCases:
    """Edge case tests for role enforcement."""

    def test_multiple_roles_in_token(
        self, oidc_role_client: Any, generate_test_jwt: Any
    ) -> None:
        """User with multiple roles gets the union of permissions."""
        token = generate_test_jwt(roles=["reader", "editor"])
        resp = oidc_role_client.post(
            "/api/types",
            json={"name": "MultiRole"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code != 403

    def test_case_sensitive_roles(self) -> None:
        """Role names are case-sensitive."""
        svc = _make_auth_service()
        ctx = AuthContext(subject="u", email=None, name=None, roles={"Reader"})
        # "Reader" != "reader" -- should fail
        with pytest.raises(AuthorizationException):
            check_authorization(ctx, svc, "GET")

    def test_hierarchy_expansion_is_idempotent(self) -> None:
        """Expanding already-expanded roles should be stable."""
        svc = _make_auth_service()
        first = svc.expand_roles({"admin"})
        second = svc.expand_roles(first)
        assert first == second
