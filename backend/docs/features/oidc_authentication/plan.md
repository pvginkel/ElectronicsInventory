# OIDC Authentication -- Technical Plan

## 0) Research Log & Findings

### IoTSupport source code analysis

Examined the full OIDC/Keycloak authentication implementation in `/work/IoTSupport/backend`:

- **AuthService** (`app/services/auth_service.py`): Singleton that discovers JWKS URI from the OIDC well-known endpoint at startup, initializes `PyJWKClient` with 5-minute key cache, and validates JWT tokens (signature, issuer, audience, expiry). Extracts roles from `realm_access.roles` and `resource_access.<audience>.roles`. Records Prometheus metrics for validation outcomes and durations.
- **OidcClientService** (`app/services/oidc_client_service.py`): Singleton that discovers OIDC endpoints (authorization, token, end_session, jwks_uri) at startup with 3-retry logic. Provides PKCE challenge generation, authorization URL generation, authorization code exchange, and token refresh. Records metrics for token exchange and refresh operations.
- **Auth utilities** (`app/utils/auth.py`): Contains `@public` decorator, `@allow_roles` decorator, `@requires_role` decorator, `authenticate_request()` function (handles token extraction from cookie/Bearer header, silent refresh, authorization checks), `serialize_auth_state`/`deserialize_auth_state` using `itsdangerous.URLSafeTimedSerializer`, `validate_redirect_url` for open-redirect prevention, `get_token_expiry_seconds`, `get_cookie_secure`, and `PendingTokenRefresh` dataclass.
- **Auth API endpoints** (`app/api/auth.py`): Blueprint at `/auth` (child of `/api`). Login (GET /api/auth/login), callback (GET /api/auth/callback), logout (GET /api/auth/logout), and self/user-info (GET /api/auth/self). All marked `@public`. Handles cookie management for access_token, refresh_token, id_token, and auth_state.
- **before_request hook** (`app/api/__init__.py`): On `api_bp`, checks `@public` first, then test session bypass, then `oidc_enabled` bypass, then `authenticate_request()`. Corresponding `after_request` hook sets refreshed cookies or clears them on refresh failure.
- **Container wiring** (`app/services/container.py`): `auth_service` and `oidc_client_service` are `Singleton` providers taking `config` and `metrics_service`.
- **Config** (`app/config.py`): OIDC settings include `oidc_enabled`, `oidc_issuer_url`, `oidc_client_id`, `oidc_client_secret`, `oidc_scopes`, `oidc_audience` (falls back to client_id), `oidc_clock_skew_seconds`, `oidc_cookie_name`, `oidc_cookie_secure` (inferred from baseurl), `oidc_cookie_samesite`, `oidc_refresh_cookie_name`, and `baseurl`.
- **Exceptions**: `AuthenticationException` and `AuthorizationException` extend `BusinessLogicException`.
- **Test fixtures** (`tests/conftest.py`): `mock_oidc_discovery`, `mock_jwks`, `generate_test_jwt` (RSA keypair generator), `auth_enabled_settings` pattern using `model_copy`.
- **Tests**: Comprehensive test suites for AuthService (`tests/services/test_auth_service.py`), auth utilities (`tests/utils/test_auth_utils.py`), auth endpoints (`tests/api/test_auth_endpoints.py`), and auth middleware (`tests/api/test_auth_middleware.py`).

### ElectronicsInventory target codebase analysis

- **Config** (`app/config.py`): Uses same two-layer pattern (Environment + Settings) as IoTSupport. Currently has NO OIDC-related fields. Has `secret_key`, `flask_env`, `is_testing` property.
- **Exceptions** (`app/exceptions.py`): Has `BusinessLogicException` base class but does NOT have `AuthenticationException` or `AuthorizationException`. These must be added.
- **Container** (`app/services/container.py`): No auth services. Has `shutdown_coordinator` as Singleton, `metrics_service` as Singleton.
- **API __init__** (`app/api/__init__.py`): Simple blueprint registration only. No before_request hook. Health and metrics blueprints are registered as children of `api_bp` (so they live at `/api/health/*` and `/api/metrics`).
- **App factory** (`app/__init__.py`): Testing, SSE, and CAS blueprints registered at app root level but their url_prefixes start with `/api/` anyway.
- **MetricsService** (`app/services/metrics_service.py`): Has abstract protocol pattern. Does NOT have `increment_counter` or `record_operation_duration` generic methods like IoTSupport's MetricsService. Auth metrics must be added as concrete methods on the protocol and implementation.
- **Error handling** (`app/utils/error_handling.py`): `handle_api_errors` decorator handles `BusinessLogicException` subclasses but has no explicit handlers for auth exceptions.
- **Dependencies** (`pyproject.toml`): Missing `httpx`, `PyJWT`, `itsdangerous`, and `cryptography`. These must be added.
- **SSE callback** (`app/api/sse.py`): At `/api/sse/callback`, has its own shared-secret auth. Must be marked `@public`.
- **Testing endpoints** (`app/api/testing.py`): At `/api/testing/*`, have `check_testing_mode` guards. Under `OIDC_ENABLED=false` (test settings) they remain accessible.

### Key design conflicts resolved

1. **Health/Metrics under /api**: In EI, health and metrics are children of `api_bp` (at `/api/health/*` and `/api/metrics`). The change brief says they are "outside /api/" but they are not. Resolution: Mark health and metrics endpoints `@public` to exempt them from the before_request auth hook, matching the IoTSupport pattern exactly.

2. **MetricsService API difference**: IoTSupport uses generic `increment_counter`/`record_operation_duration` methods. EI uses typed abstract methods. Resolution: Add specific auth metric methods to the EI MetricsServiceProtocol and implementation rather than porting the generic pattern, keeping consistency with EI conventions.

3. **Authorization model difference**: IoTSupport uses `@allow_roles` as an opt-in for additional roles beyond admin (admin always gets access; non-admin users are denied unless `@allow_roles` grants them access). The EI requirement is "default is authenticated-only (no role check unless @allow_roles is set)". Resolution: Adapt the `check_authorization` logic -- when `OIDC_ENABLED=true`, the default is authenticated-only (any valid token passes). Role enforcement only kicks in when `@allow_roles` is explicitly set on an endpoint.

4. **Missing dependencies**: EI lacks `httpx`, `PyJWT`, `itsdangerous`, `cryptography`. These are all needed. Resolution: Add them to pyproject.toml.

5. **Test session support**: IoTSupport's TestingService manages test sessions and forced auth errors. EI's TestingService is unrelated (DB reset, test data). Resolution: The EI testing service does not need test session support because `OIDC_ENABLED=false` in tests bypasses auth entirely. If E2E test session support is needed later, it can be added to a separate service. The `get_current_user` endpoint must be simplified to remove TestingService dependency when porting.

6. **Missing ValidationException**: IoTSupport's auth utilities (`deserialize_auth_state`, `validate_redirect_url`) raise `ValidationException` which does not exist in EI's exception hierarchy. Resolution: Add `ValidationException` to `app/exceptions.py` and a corresponding handler (HTTP 400) in `app/utils/error_handling.py`.

7. **App-level blueprints outside api_bp**: Four blueprints (testing_bp, sse_bp, cas_bp, icons_bp) are registered directly on the Flask app at `/api/*` URLs but are NOT children of api_bp (`app/__init__.py:185-198`). Resolution: The before_request hook on api_bp intentionally does not cover these. They have their own access controls. No `@public` markers needed. The original plan item to mark SSE callback with `@public` was incorrect and has been removed.

## 1) Intent & Scope

**User intent**

Port the OIDC/Keycloak BFF cookie-based authentication system from the IoTSupport backend to the ElectronicsInventory backend. The ElectronicsInventory app is currently unauthenticated (single-user hobby app). This adds opt-in authentication via `OIDC_ENABLED` configuration toggle so the app can be deployed behind Keycloak when desired, while keeping local development and testing frictionless with auth disabled by default.

**Prompt quotes**

"Port the OIDC/Keycloak authentication system from the IoTSupport backend"
"BFF cookie pattern (backend manages tokens in HTTP-only cookies)"
"PKCE authorization code flow"
"Default = authenticated only (no role check). Roles only checked when @allow_roles is set"
"OIDC_ENABLED config toggle (default false) to disable auth for local dev"
"OIDC_ENABLED=false in test settings"
"Exclude Keycloak admin API integration and device/M2M auth"

**In scope**

- AuthService: JWT validation with JWKS caching from OIDC discovery endpoint
- OidcClientService: OIDC endpoint discovery, authorization code exchange with PKCE, token refresh
- BFF auth endpoints: login, callback, logout, self (user-info)
- before_request hook on /api/* with token validation and automatic silent refresh
- @public decorator for endpoint exemptions
- @allow_roles decorator for opt-in role-based authorization
- OIDC_ENABLED toggle with false default
- Auth-related Prometheus metrics
- DI container integration (Singleton providers for both services)
- Comprehensive tests for all new code
- New Python dependencies: httpx, PyJWT, itsdangerous, cryptography
- AuthenticationException and AuthorizationException exception types
- Error handler integration for auth exceptions

**Out of scope**

- Keycloak admin API integration (device provisioning)
- Device/M2M authentication
- Test session management (not needed; OIDC_ENABLED=false bypasses auth in tests)
- Database schema changes (no new tables or migrations)
- Frontend changes (document frontend_impact.md separately)

**Assumptions / constraints**

- Keycloak (or compatible OIDC provider) is available at the configured issuer URL when `OIDC_ENABLED=true`.
- The OIDC provider supports PKCE authorization code flow.
- The application runs behind a reverse proxy that handles TLS termination (cookie secure flag inferred from `BASEURL`).
- `OIDC_ENABLED=false` is the default; the existing test suite continues to work without any Keycloak dependency.
- No database tables are needed for auth state (cookies + in-memory JWKS cache only).

## 1a) User Requirements Checklist

**User Requirements Checklist**

- [ ] Port AuthService from IoTSupport: JWT validation with JWKS caching from OIDC discovery endpoint
- [ ] Port OidcClientService from IoTSupport: OIDC endpoint discovery, authorization code exchange with PKCE, token refresh
- [ ] BFF cookie pattern: backend manages login/callback/logout endpoints, stores tokens in HTTP-only cookies
- [ ] before_request hook on /api/* that validates access token (cookie or Bearer header) with automatic silent refresh
- [ ] @public decorator to exempt specific endpoints from authentication
- [ ] @allow_roles decorator for opt-in role-based authorization; default is authenticated-only (no role check unless @allow_roles is set)
- [ ] Blueprints registered outside api_bp (testing, SSE, CAS, icons) documented as outside auth hook scope
- [ ] OIDC_ENABLED configuration toggle (default false) to disable authentication entirely
- [ ] OIDC_ENABLED=false in test settings so existing test suite works without Keycloak
- [ ] Auth-related Prometheus metrics (token validation, refresh attempts, JWKS discovery)
- [ ] Integration with existing DI container (ServiceContainer)
- [ ] Integration with graceful shutdown coordinator
- [ ] Comprehensive tests for AuthService
- [ ] Comprehensive tests for OidcClientService
- [ ] Comprehensive tests for auth API endpoints (login, callback, logout)
- [ ] Comprehensive tests for auth enforcement (before_request hook, @public, @allow_roles)
- [ ] Exclude Keycloak admin API integration
- [ ] Exclude device/M2M authentication

## 2) Affected Areas & File Map

- Area: `pyproject.toml`
- Why: Add new dependencies required for OIDC authentication (httpx, PyJWT, itsdangerous, cryptography).
- Evidence: `/work/ElectronicsInventory/backend/pyproject.toml:13-37` -- current dependencies section lacks all four packages. IoTSupport uses them at `/work/IoTSupport/backend/pyproject.toml:24-30`.

---

- Area: `app/config.py` -- Environment class
- Why: Add OIDC environment variables (BASEURL, OIDC_ENABLED, OIDC_ISSUER_URL, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET, OIDC_SCOPES, OIDC_AUDIENCE, OIDC_CLOCK_SKEW_SECONDS, OIDC_COOKIE_NAME, OIDC_COOKIE_SECURE, OIDC_COOKIE_SAMESITE, OIDC_REFRESH_COOKIE_NAME).
- Evidence: `/work/ElectronicsInventory/backend/app/config.py:28-257` -- Environment class has no OIDC fields. IoTSupport pattern at `/work/IoTSupport/backend/app/config.py:106-157`.

---

- Area: `app/config.py` -- Settings class
- Why: Add corresponding lowercase settings fields and derived values (oidc_audience fallback, oidc_cookie_secure inference from baseurl).
- Evidence: `/work/ElectronicsInventory/backend/app/config.py:259-459` -- Settings class and load() method need OIDC fields. IoTSupport pattern at `/work/IoTSupport/backend/app/config.py:234-523`.

---

- Area: `app/exceptions.py`
- Why: Add AuthenticationException, AuthorizationException, and ValidationException classes. AuthenticationException and AuthorizationException are needed by auth services and middleware. ValidationException is needed by auth utilities (deserialize_auth_state, validate_redirect_url) and does not exist in EI today.
- Evidence: `/work/ElectronicsInventory/backend/app/exceptions.py:1-73` -- no auth or validation exceptions. IoTSupport has them at `/work/IoTSupport/backend/app/exceptions.py:43-47,80-98`.

---

- Area: `app/utils/error_handling.py`
- Why: Add exception handlers for AuthenticationException (401), AuthorizationException (403), and ValidationException (400).
- Evidence: `/work/ElectronicsInventory/backend/app/utils/error_handling.py:47-207` -- handle_api_errors decorator has no auth or validation exception cases.

---

- Area: `app/services/auth_service.py` (NEW)
- Why: Port AuthService singleton from IoTSupport for JWT validation with JWKS caching.
- Evidence: Source at `/work/IoTSupport/backend/app/services/auth_service.py:1-297`.

---

- Area: `app/services/oidc_client_service.py` (NEW)
- Why: Port OidcClientService singleton from IoTSupport for OIDC flow operations.
- Evidence: Source at `/work/IoTSupport/backend/app/services/oidc_client_service.py:1-379`.

---

- Area: `app/utils/auth.py` (NEW)
- Why: Port auth utilities: @public, @allow_roles, authenticate_request, token extraction, state serialization, redirect validation, cookie security helpers.
- Evidence: Source at `/work/IoTSupport/backend/app/utils/auth.py:1-394`.

---

- Area: `app/api/auth.py` (NEW)
- Why: Create auth blueprint with BFF endpoints: login, callback, logout, self. The get_current_user endpoint must be simplified to remove IoTSupport's TestingService dependency (consume_forced_auth_error, get_session) since EI's TestingService has a completely different API and test sessions are not needed (OIDC_ENABLED=false bypasses auth in tests).
- Evidence: Source at `/work/IoTSupport/backend/app/api/auth.py:1-423`. TestingService dependency at lines 50-51, 66-96.

---

- Area: `app/api/__init__.py`
- Why: Add before_request and after_request hooks for authentication enforcement on the api_bp blueprint. Register auth blueprint.
- Evidence: `/work/ElectronicsInventory/backend/app/api/__init__.py:1-50` -- currently just blueprint registration. IoTSupport pattern at `/work/IoTSupport/backend/app/api/__init__.py:25-178`.

---

- Area: `app/services/container.py`
- Why: Add auth_service and oidc_client_service Singleton providers.
- Evidence: `/work/ElectronicsInventory/backend/app/services/container.py:80-336` -- no auth service providers. IoTSupport pattern at `/work/IoTSupport/backend/app/services/container.py:63-75`.

---

- Area: `app/__init__.py`
- Why: Wire auth API module in container. Add 'app.api' to wire_modules list (for before_request hook injection).
- Evidence: `/work/ElectronicsInventory/backend/app/__init__.py:130-138` -- wire_modules list.

---

- Area: `app/services/metrics_service.py`
- Why: Add auth-related metric definitions and recording methods to MetricsServiceProtocol and MetricsService implementation.
- Evidence: `/work/ElectronicsInventory/backend/app/services/metrics_service.py:20-80` -- protocol with abstract methods; no auth metrics.

---

- Area: `app/api/health.py`
- Why: Mark health endpoints with @public decorator (they are under /api/health and will be subject to before_request hook since health_bp is a child of api_bp).
- Evidence: `/work/ElectronicsInventory/backend/app/api/health.py:22-30` -- health endpoints lack @public.

---

- Area: `app/api/metrics.py` (the one registered as child of api_bp)
- Why: Mark metrics endpoint with @public decorator (it is under /api/metrics and will be subject to before_request hook).
- Evidence: `/work/ElectronicsInventory/backend/app/api/metrics.py:15-29` -- metrics endpoint lacks @public.

---

**Scope boundary note:** The following blueprints are registered directly on the Flask app (not as children of api_bp) and are therefore NOT subject to the before_request auth hook: `testing_bp` (`/api/testing`), `sse_bp` (`/api/sse`), `cas_bp` (`/api/cas`), `icons_bp` (`/api/icons`). These do not need `@public` markers because the hook never runs for them. They have their own access controls: testing endpoints use `check_testing_mode`, SSE callback uses shared-secret auth, and CAS/icons serve public immutable content. See `app/__init__.py:185-198` for registration.

---

- Area: `tests/conftest.py`
- Why: Add OIDC settings to test Settings (oidc_enabled=false), add generate_test_jwt and mock_oidc_discovery fixtures.
- Evidence: `/work/ElectronicsInventory/backend/tests/conftest.py:57-120` -- _build_test_settings has no OIDC fields.

---

- Area: `tests/services/test_auth_service.py` (NEW)
- Why: Comprehensive tests for AuthService (token validation, expiry, invalid signature, wrong issuer/audience, role extraction).
- Evidence: IoTSupport tests at `/work/IoTSupport/backend/tests/services/test_auth_service.py:1-249`.

---

- Area: `tests/services/test_oidc_client_service.py` (NEW)
- Why: Comprehensive tests for OidcClientService (PKCE generation, authorization URL, code exchange, token refresh, endpoint discovery).
- Evidence: No IoTSupport test file exists for OidcClientService; must write new tests.

---

- Area: `tests/utils/test_auth_utils.py` (NEW)
- Why: Tests for auth utility functions (@public, @allow_roles, check_authorization, token extraction, redirect validation, state serialization).
- Evidence: IoTSupport tests at `/work/IoTSupport/backend/tests/utils/test_auth_utils.py:1-332`.

---

- Area: `tests/api/test_auth_endpoints.py` (NEW)
- Why: Tests for auth API endpoints (login, callback, logout, self).
- Evidence: IoTSupport tests at `/work/IoTSupport/backend/tests/api/test_auth_endpoints.py:1-149`.

---

- Area: `tests/api/test_auth_middleware.py` (NEW)
- Why: Tests for before_request authentication middleware (Bearer token, cookie token, OIDC disabled bypass, @public bypass, token refresh, role enforcement).
- Evidence: IoTSupport tests at `/work/IoTSupport/backend/tests/api/test_auth_middleware.py:1-574`.

## 3) Data Model / Contracts

- Entity / contract: OIDC Configuration (Environment + Settings)
- Shape:
  ```
  Environment (env vars):
    BASEURL: str = "http://localhost:3000"
    OIDC_ENABLED: bool = false
    OIDC_ISSUER_URL: str | None
    OIDC_CLIENT_ID: str | None
    OIDC_CLIENT_SECRET: str | None
    OIDC_SCOPES: str = "openid profile email"
    OIDC_AUDIENCE: str | None
    OIDC_CLOCK_SKEW_SECONDS: int = 30
    OIDC_COOKIE_NAME: str = "access_token"
    OIDC_COOKIE_SECURE: bool | None
    OIDC_COOKIE_SAMESITE: str = "Lax"
    OIDC_REFRESH_COOKIE_NAME: str = "refresh_token"

  Settings (resolved):
    baseurl: str
    oidc_enabled: bool
    oidc_issuer_url: str | None
    oidc_client_id: str | None
    oidc_client_secret: str | None
    oidc_scopes: str
    oidc_audience: str | None  (fallback: oidc_client_id)
    oidc_clock_skew_seconds: int
    oidc_cookie_name: str
    oidc_cookie_secure: bool  (inferred from baseurl if not explicit)
    oidc_cookie_samesite: str
    oidc_refresh_cookie_name: str
  ```
- Refactor strategy: No backward compatibility needed; add fields with sensible defaults. OIDC_ENABLED defaults to false so no behavior change for existing deployments.
- Evidence: `/work/IoTSupport/backend/app/config.py:106-157` (Environment) and `:267-279` (Settings).

---

- Entity / contract: AuthContext dataclass
- Shape:
  ```python
  @dataclass
  class AuthContext:
      subject: str      # JWT "sub" claim
      email: str | None  # JWT "email" claim
      name: str | None   # JWT "name" claim
      roles: set[str]    # Combined realm_access + resource_access roles
  ```
- Refactor strategy: New type, no compatibility concern.
- Evidence: `/work/IoTSupport/backend/app/services/auth_service.py:19-27`.

---

- Entity / contract: TokenResponse dataclass
- Shape:
  ```python
  @dataclass
  class TokenResponse:
      access_token: str
      id_token: str | None
      refresh_token: str | None
      token_type: str
      expires_in: int
  ```
- Refactor strategy: New type, internal to OidcClientService.
- Evidence: `/work/IoTSupport/backend/app/services/oidc_client_service.py:39-47`.

---

- Entity / contract: UserInfoResponseSchema (Pydantic)
- Shape:
  ```json
  {
    "subject": "user-id",
    "email": "user@example.com",
    "name": "Display Name",
    "roles": ["admin"]
  }
  ```
- Refactor strategy: New response schema for GET /api/auth/self.
- Evidence: `/work/IoTSupport/backend/app/api/auth.py:34-41`.

---

- Entity / contract: AuthenticationException / AuthorizationException / ValidationException
- Shape:
  ```python
  class AuthenticationException(BusinessLogicException):
      def __init__(self, message: str):
          super().__init__(message, error_code="AUTHENTICATION_REQUIRED")

  class AuthorizationException(BusinessLogicException):
      def __init__(self, message: str):
          super().__init__(message, error_code="AUTHORIZATION_FAILED")

  class ValidationException(BusinessLogicException):
      def __init__(self, message: str):
          super().__init__(message, error_code="VALIDATION_FAILED")
  ```
- Refactor strategy: New exception types added to existing exception hierarchy. ValidationException is required by auth utilities (deserialize_auth_state, validate_redirect_url) and does not exist in EI today.
- Evidence: `/work/IoTSupport/backend/app/exceptions.py:43-47,80-98`.

---

- Entity / contract: MetricsServiceProtocol auth methods (new abstract methods)
- Shape:
  ```python
  # New methods on MetricsServiceProtocol and MetricsService:
  def record_auth_validation(self, status: str, duration: float) -> None: ...
  def record_jwks_refresh(self, trigger: str, status: str) -> None: ...
  def record_oidc_token_exchange(self, status: str) -> None: ...
  def record_auth_token_refresh(self, status: str) -> None: ...
  ```
- Refactor strategy: Add as concrete methods with default `return None` on the protocol (matching existing EI pattern for optional metrics, e.g., `record_kit_created`). Implement with actual Prometheus counters/histograms in MetricsService. AuthService and OidcClientService call these typed methods instead of IoTSupport's generic `increment_counter`/`record_operation_duration`.
- Evidence: `/work/ElectronicsInventory/backend/app/services/metrics_service.py:20-80` (protocol pattern), `/work/IoTSupport/backend/app/services/auth_service.py:79-88,176-181` (metric call sites to replace).

## 4) API / Integration Surface

- Surface: GET /api/auth/login
- Inputs: Query param `redirect` (URL to redirect to after login)
- Outputs: 302 redirect to OIDC provider authorization endpoint. Sets `auth_state` cookie (signed, 10-minute TTL).
- Errors: 400 if `redirect` missing or external URL. 400 if OIDC disabled.
- Evidence: `/work/IoTSupport/backend/app/api/auth.py:137-195`.

---

- Surface: GET /api/auth/callback
- Inputs: Query params `code` (authorization code), `state` (CSRF nonce). Cookie `auth_state` (PKCE verifier + redirect URL).
- Outputs: 302 redirect to original redirect URL. Sets `access_token`, `refresh_token`, `id_token` cookies. Clears `auth_state` cookie.
- Errors: 400 if missing code/state/auth_state cookie, or state mismatch. 401 if token exchange or validation fails.
- Evidence: `/work/IoTSupport/backend/app/api/auth.py:198-313`.

---

- Surface: GET /api/auth/logout
- Inputs: Query param `redirect` (optional, defaults to "/")
- Outputs: 302 redirect to OIDC end_session_endpoint (if available) or direct redirect. Clears access_token, refresh_token, id_token cookies.
- Errors: 400 if redirect URL is external (open redirect prevention).
- Evidence: `/work/IoTSupport/backend/app/api/auth.py:316-422`.

---

- Surface: GET /api/auth/self
- Inputs: Cookie `access_token` (JWT) or none.
- Outputs: 200 with `UserInfoResponseSchema` (subject, email, name, roles). When OIDC disabled, returns default local-user. When no token, returns 401.
- Errors: 401 if no valid token. Endpoint is @public (handles auth explicitly).
- Evidence: `/work/IoTSupport/backend/app/api/auth.py:43-134`.

---

- Surface: before_request hook on api_bp
- Inputs: All requests to /api/* endpoints. Reads `access_token` cookie and `Authorization: Bearer` header. Reads `refresh_token` cookie for silent refresh.
- Outputs: Passes through (None) if authenticated. 401 JSON if authentication fails. 403 JSON if authorization fails. Sets `g.auth_context` on success. Sets `g.pending_token_refresh` if tokens were refreshed.
- Errors: 401 for missing/invalid/expired tokens (when no refresh possible). 403 for insufficient roles.
- Evidence: `/work/IoTSupport/backend/app/api/__init__.py:25-101`.

---

- Surface: after_request hook on api_bp
- Inputs: Response from request handler. `g.pending_token_refresh` and `g.clear_auth_cookies` flags.
- Outputs: Modified response with updated cookies (refreshed tokens) or cleared cookies (failed refresh).
- Errors: None (passthrough).
- Evidence: `/work/IoTSupport/backend/app/api/__init__.py:104-177`.

## 5) Algorithms & State Machines

- Flow: OIDC Authorization Code Flow with PKCE (Login)
- Steps:
  1. Frontend redirects user to GET /api/auth/login?redirect=/dashboard
  2. Backend validates redirect URL against baseurl (open redirect prevention)
  3. Backend generates PKCE code_verifier (random 43-char URL-safe string) and code_challenge (SHA256 + base64url)
  4. Backend generates random nonce for CSRF protection
  5. Backend serializes AuthState (code_verifier, redirect_url, nonce) into signed cookie using itsdangerous
  6. Backend redirects (302) to OIDC provider authorization endpoint with client_id, redirect_uri=/api/auth/callback, scope, state=nonce, code_challenge, code_challenge_method=S256
  7. User authenticates at OIDC provider
  8. Provider redirects to GET /api/auth/callback?code=xxx&state=nonce
  9. Backend deserializes auth_state cookie, verifies state matches nonce
  10. Backend exchanges authorization code + code_verifier for tokens via POST to token endpoint
  11. Backend validates the received access_token (signature, issuer, audience, expiry)
  12. Backend sets access_token, refresh_token, id_token as HTTP-only cookies
  13. Backend redirects (302) to original redirect_url
- States / transitions: Stateless server-side; all flow state in signed cookies.
- Hotspots: OIDC discovery (httpx call) at startup only. Token exchange (httpx POST) at callback. JWKS key fetch when cache misses (every 5 minutes or on key rotation).
- Evidence: `/work/IoTSupport/backend/app/api/auth.py:137-313`, `/work/IoTSupport/backend/app/services/oidc_client_service.py:183-313`.

---

- Flow: Silent Token Refresh (before_request)
- Steps:
  1. Extract access_token from cookie (priority) or Authorization header
  2. If access_token present, validate it via AuthService.validate_token()
  3. If validation succeeds, set g.auth_context and check authorization. Done.
  4. If validation fails with "expired", set token_expired=True and continue
  5. If validation fails with other error, return 401 immediately
  6. Extract refresh_token from cookie
  7. If no refresh_token, return 401
  8. Call OidcClientService.refresh_access_token(refresh_token)
  9. If refresh succeeds, validate new access_token, set g.auth_context and g.pending_token_refresh
  10. If refresh fails, set g.clear_auth_cookies=True and return 401
  11. after_request hook reads g.pending_token_refresh and sets new cookies on response
  12. after_request hook reads g.clear_auth_cookies and clears auth cookies
- States / transitions: No state machine; linear decision tree per request.
- Hotspots: Token refresh adds one httpx POST per expired-token request. Refresh failures trigger cookie clearing.
- Evidence: `/work/IoTSupport/backend/app/utils/auth.py:207-296`, `/work/IoTSupport/backend/app/api/__init__.py:104-177`.

---

- Flow: Authorization Check (per-request, after authentication)
- Steps:
  1. If auth_context has role matching any role in endpoint's `@allow_roles` set, allow
  2. If endpoint has no `@allow_roles`, allow (authenticated-only default)
  3. If endpoint has `@allow_roles` but user has no matching role, deny with 403
- States / transitions: None.
- Hotspots: None; in-memory set comparison.
- Evidence: Design decision from requirements. Different from IoTSupport's "admin always required" model. In IoTSupport: `/work/IoTSupport/backend/app/utils/auth.py:167-204`.

## 6) Derived State & Invariants

- Derived value: JWKS key cache
  - Source: OIDC provider's JWKS endpoint, fetched via PyJWKClient with 5-minute TTL
  - Writes / cleanup: In-memory cache managed by PyJWKClient; no persistent writes
  - Guards: OIDC_ENABLED must be true; JWKS URI must be discovered at startup
  - Invariant: JWKS cache must always contain at least one valid signing key when OIDC is enabled
  - Evidence: `/work/IoTSupport/backend/app/services/auth_service.py:67-89`

- Derived value: oidc_audience (resolved)
  - Source: OIDC_AUDIENCE environment variable, falls back to OIDC_CLIENT_ID
  - Writes / cleanup: Used in JWT audience validation; no persistent state
  - Guards: At least OIDC_CLIENT_ID must be set when OIDC_ENABLED=true
  - Invariant: oidc_audience is never None when OIDC is enabled (validated at startup)
  - Evidence: `/work/IoTSupport/backend/app/config.py:455`

- Derived value: oidc_cookie_secure (resolved)
  - Source: Explicit OIDC_COOKIE_SECURE or inferred from BASEURL scheme (https = true)
  - Writes / cleanup: Controls Secure flag on all auth cookies
  - Guards: Must match actual deployment TLS configuration
  - Invariant: When BASEURL starts with https://, cookie_secure is true (prevents cookie leakage over HTTP)
  - Evidence: `/work/IoTSupport/backend/app/config.py:458-461`

- Derived value: g.auth_context (request-scoped)
  - Source: Validated JWT token claims; set by before_request hook or authenticate_request()
  - Writes / cleanup: Written to flask.g per request; cleaned up by Flask automatically
  - Guards: Only set after successful token validation; never set for @public endpoints (unless endpoint checks explicitly)
  - Invariant: When g.auth_context is set, the token has been cryptographically validated and is not expired
  - Evidence: `/work/IoTSupport/backend/app/utils/auth.py:236-238`

## 7) Consistency, Transactions & Concurrency

- Transaction scope: No database transactions involved. Auth is entirely stateless (JWT validation + HTTP cookies).
- Atomic requirements: Cookie setting on callback must be all-or-nothing (access_token + refresh_token + id_token in one response). Flask response.set_cookie() handles this correctly as all cookies are set on the same response object before it is sent.
- Retry / idempotency: OIDC discovery has 3-retry logic at startup. PKCE nonce ensures callback cannot be replayed (auth_state cookie has 10-minute TTL and is cleared on use). Token refresh is idempotent (new tokens replace old cookies).
- Ordering / concurrency controls: JWKS client (PyJWKClient) is thread-safe with its built-in caching. AuthService and OidcClientService are singletons shared across request threads. No locking needed beyond what PyJWKClient provides internally.
- Evidence: `/work/IoTSupport/backend/app/services/oidc_client_service.py:94-146` (retry logic), `/work/IoTSupport/backend/app/services/auth_service.py:67-89` (JWKS client init).

## 8) Errors & Edge Cases

- Failure: OIDC provider unreachable at startup
- Surface: AuthService.__init__() and OidcClientService.__init__()
- Handling: Raises ValueError / AuthenticationException during app startup. Application fails to start if OIDC_ENABLED=true but provider is unreachable.
- Guardrails: OidcClientService has 3-retry discovery. Startup failure is logged with clear error message.
- Evidence: `/work/IoTSupport/backend/app/services/oidc_client_service.py:84-146`.

---

- Failure: JWT signing key rotated (JWKS cache miss)
- Surface: AuthService.validate_token()
- Handling: PyJWKClient automatically re-fetches JWKS when a key ID is not found in cache. If re-fetch fails, raises AuthenticationException.
- Guardrails: JWKS cache has 5-minute TTL ensuring relatively fresh keys. Metric recorded for JWKS refresh events.
- Evidence: `/work/IoTSupport/backend/app/services/auth_service.py:71-76`.

---

- Failure: Access token expired, refresh token still valid
- Surface: before_request hook
- Handling: Silent refresh via OidcClientService.refresh_access_token(). New tokens set as cookies via after_request hook. User experiences no interruption.
- Guardrails: Refresh failure clears all auth cookies and returns 401, forcing re-login.
- Evidence: `/work/IoTSupport/backend/app/utils/auth.py:256-296`.

---

- Failure: Access token expired, refresh token also expired/revoked
- Surface: before_request hook
- Handling: Refresh fails (HTTPError from OIDC provider). g.clear_auth_cookies=True set. Returns 401. after_request clears cookies. Frontend redirects to login.
- Guardrails: Metric recorded for failed refresh attempts. Cookies cleared to prevent repeated failed refresh attempts.
- Evidence: `/work/IoTSupport/backend/app/utils/auth.py:273-276`.

---

- Failure: Open redirect attempt on login or logout
- Surface: login and logout endpoints
- Handling: validate_redirect_url() rejects redirect URLs with different scheme/netloc than BASEURL. Returns 400.
- Guardrails: Only relative URLs or same-origin URLs are allowed.
- Evidence: `/work/IoTSupport/backend/app/utils/auth.py:363-393`.

---

- Failure: CSRF/state mismatch on callback
- Surface: callback endpoint
- Handling: State parameter from OIDC provider is compared against nonce in signed auth_state cookie. Mismatch returns 400.
- Guardrails: auth_state cookie is signed with SECRET_KEY via itsdangerous and has 10-minute TTL.
- Evidence: `/work/IoTSupport/backend/app/api/auth.py:240-242`.

---

- Failure: Missing @public on an endpoint that should be public
- Surface: before_request hook
- Handling: Endpoint would require authentication. Returns 401 for unauthenticated requests.
- Guardrails: Test coverage for health, metrics, SSE callback, and auth endpoints verifying they are accessible without tokens.
- Evidence: Design requirement.

## 9) Observability / Telemetry

- Signal: `auth_validation_total`
- Type: Counter
- Trigger: Every call to AuthService.validate_token(), with status label
- Labels / fields: `status` = success | expired | invalid_signature | invalid_claims | invalid_token | error
- Consumer: Dashboard showing auth success/failure rates
- Evidence: `/work/IoTSupport/backend/app/services/auth_service.py:176-262` (IoTSupport uses `iot_` prefix; EI uses generic prefix).

---

- Signal: `auth_validation_duration_seconds`
- Type: Histogram
- Trigger: Every call to AuthService.validate_token()
- Labels / fields: None (single histogram)
- Consumer: Dashboard showing token validation latency
- Evidence: `/work/IoTSupport/backend/app/services/auth_service.py:179-181`.

---

- Signal: `jwks_refresh_total`
- Type: Counter
- Trigger: JWKS initialization at startup and key refresh events
- Labels / fields: `trigger` = startup | refresh; `status` = success | failed
- Consumer: Alert on JWKS refresh failures
- Evidence: `/work/IoTSupport/backend/app/services/auth_service.py:79-88`.

---

- Signal: `oidc_token_exchange_total`
- Type: Counter
- Trigger: Authorization code exchange in callback flow
- Labels / fields: `status` = success | failed
- Consumer: Dashboard showing login success rates
- Evidence: `/work/IoTSupport/backend/app/services/oidc_client_service.py:280-298`.

---

- Signal: `auth_token_refresh_total`
- Type: Counter
- Trigger: Token refresh attempts (silent refresh in before_request)
- Labels / fields: `status` = success | failed
- Consumer: Dashboard showing refresh rates and failures
- Evidence: `/work/IoTSupport/backend/app/services/oidc_client_service.py:355-376`.

## 10) Background Work & Shutdown

- Worker / job: JWKS key cache refresh
- Trigger cadence: Automatic, driven by PyJWKClient's 5-minute TTL. Not a separate background thread; refresh happens lazily on the next token validation after cache expires.
- Responsibilities: Fetch updated signing keys from OIDC provider's JWKS endpoint.
- Shutdown handling: No explicit shutdown needed. PyJWKClient uses synchronous httpx calls within request context. No background threads.
- Evidence: `/work/IoTSupport/backend/app/services/auth_service.py:71-76`.

No new background threads or workers are introduced. AuthService and OidcClientService are stateless singletons that perform synchronous HTTP calls only when servicing requests. Shutdown coordinator integration is limited to: if the application is shutting down and the before_request hook receives a request, it can check `shutdown_coordinator.is_shutting_down()` and skip authentication (letting the readiness probe fail instead). However, this is optional and not strictly required since the readiness probe returns 503 during shutdown, preventing new requests from reaching the auth hook.

## 11) Security & Permissions

- Concern: Authentication -- verifying user identity via OIDC tokens
- Touchpoints: before_request hook on api_bp, AuthService.validate_token()
- Mitigation: JWT validation with JWKS (signature, issuer, audience, expiry). PKCE prevents authorization code interception. HTTP-only cookies prevent XSS token theft. Secure flag inferred from BASEURL. SameSite=Lax prevents CSRF on state-changing requests.
- Residual risk: Cookie-based auth is vulnerable to CSRF on GET requests with side effects. Mitigated by using POST for state-changing operations (REST convention already followed).
- Evidence: `/work/IoTSupport/backend/app/services/auth_service.py:125-262`, `/work/IoTSupport/backend/app/utils/auth.py:348-361`.

---

- Concern: Authorization -- role-based access control
- Touchpoints: check_authorization() in before_request hook, @allow_roles decorator
- Mitigation: Default is authenticated-only (any valid token passes). @allow_roles restricts specific endpoints to listed roles. Roles extracted from JWT claims (realm_access + resource_access).
- Residual risk: Roles are managed in Keycloak; application trusts whatever roles are in the token. No server-side role persistence.
- Evidence: Design requirement; adapted from `/work/IoTSupport/backend/app/utils/auth.py:167-204`.

---

- Concern: Open redirect prevention
- Touchpoints: login and logout endpoints (redirect parameter)
- Mitigation: validate_redirect_url() only allows relative URLs or URLs matching BASEURL origin.
- Residual risk: None; strictly enforced.
- Evidence: `/work/IoTSupport/backend/app/utils/auth.py:363-393`.

---

- Concern: PKCE state tampering
- Touchpoints: auth_state cookie between login and callback
- Mitigation: Signed with itsdangerous.URLSafeTimedSerializer using SECRET_KEY. 10-minute TTL. State nonce verified against OIDC provider's state parameter.
- Residual risk: Requires SECRET_KEY to be strong in production. Already a Flask requirement.
- Evidence: `/work/IoTSupport/backend/app/utils/auth.py:299-345`.

---

- Concern: Sensitive token exposure
- Touchpoints: access_token, refresh_token, id_token cookies
- Mitigation: All cookies set with httponly=True (prevents JS access), secure flag (prevents HTTP transmission in production), samesite=Lax. Tokens never included in API response bodies (except /api/auth/self which returns claims, not the raw token).
- Residual risk: Tokens visible in browser cookie storage. Acceptable for single-user hobby app.
- Evidence: `/work/IoTSupport/backend/app/api/auth.py:265-311`.

## 12) UX / UI Impact

- Entry point: Frontend application
- Change: Frontend must detect 401 responses and redirect to /api/auth/login?redirect=<current_url>. After successful login, user is redirected back to original page. Logout should redirect to /api/auth/logout?redirect=/.
- User interaction: When OIDC_ENABLED=true, user sees Keycloak login page on first visit. After login, interaction is transparent (cookies handle auth). When OIDC_ENABLED=false (default), no change.
- Dependencies: Frontend needs to call GET /api/auth/self on startup to determine auth state. If 401, show login button. If 200, show user info and logout button.
- Evidence: This is a BFF pattern; frontend changes documented separately in `docs/features/oidc_authentication/frontend_impact.md`.

## 13) Deterministic Test Plan

- Surface: AuthService
- Scenarios:
  - Given OIDC enabled with valid config, When AuthService is initialized, Then JWKS client is created and JWKS URI discovered
  - Given OIDC disabled, When AuthService is initialized, Then no JWKS client created (skips discovery)
  - Given valid JWT token with admin role, When validate_token called, Then returns AuthContext with subject, email, name, roles
  - Given expired JWT token, When validate_token called, Then raises AuthenticationException with "expired"
  - Given JWT with invalid signature, When validate_token called, Then raises AuthenticationException with "signature"
  - Given JWT with wrong issuer, When validate_token called, Then raises AuthenticationException with "issuer"
  - Given JWT with wrong audience, When validate_token called, Then raises AuthenticationException with "audience"
  - Given JWT without sub claim, When validate_token called, Then raises AuthenticationException
  - Given JWT with realm_access and resource_access roles, When validate_token called, Then both role sets combined
  - Given OIDC enabled but JWKS client is None (somehow), When validate_token called, Then raises AuthenticationException "OIDC not enabled"
- Fixtures / hooks: `generate_test_jwt` fixture (RSA keypair, configurable claims), `mock_oidc_discovery` fixture, mock PyJWKClient via unittest.mock.patch
- Gaps: None
- Evidence: `/work/IoTSupport/backend/tests/services/test_auth_service.py:1-249`

---

- Surface: OidcClientService
- Scenarios:
  - Given OIDC enabled with valid config, When OidcClientService initialized, Then endpoints discovered successfully
  - Given OIDC provider unreachable, When OidcClientService initialized, Then raises ValueError after 3 retries
  - Given OIDC discovery document missing required endpoints, When initialized, Then raises ValueError
  - Given valid code_verifier, When generate_pkce_challenge called, Then returns correct S256 challenge
  - Given valid redirect_url, When generate_authorization_url called, Then returns URL with correct params and AuthState
  - Given valid authorization code and code_verifier, When exchange_code_for_tokens called, Then returns TokenResponse
  - Given failed token exchange (HTTP error), When exchange_code_for_tokens called, Then raises AuthenticationException
  - Given valid refresh_token, When refresh_access_token called, Then returns new TokenResponse
  - Given failed refresh (HTTP error), When refresh_access_token called, Then raises AuthenticationException
  - Given OIDC disabled, When endpoints property accessed, Then raises ValueError
- Fixtures / hooks: `mock_oidc_discovery`, mock httpx.get/httpx.post via unittest.mock.patch
- Gaps: None
- Evidence: `/work/IoTSupport/backend/app/services/oidc_client_service.py` (source code structure)

---

- Surface: Auth utilities (app/utils/auth.py)
- Scenarios:
  - Given function decorated with @public, When is_public checked, Then returns True
  - Given function without @public, When is_public checked, Then attribute not present
  - Given @allow_roles("editor"), When allowed_roles checked, Then set contains "editor"
  - Given @allow_roles("a", "b", "c"), When allowed_roles checked, Then set contains all three
  - Given auth_context and endpoint with @allow_roles matching role, When check_authorization called, Then passes
  - Given auth_context and endpoint with @allow_roles not matching role, When check_authorization called, Then raises AuthorizationException
  - Given auth_context and endpoint without @allow_roles, When check_authorization called, Then passes (authenticated-only default)
  - Given JWT token in cookie, When extract_token_from_request called, Then returns token
  - Given Bearer token in header, When extract_token_from_request called, Then returns token
  - Given both cookie and header, When extract_token_from_request called, Then cookie takes precedence
  - Given valid redirect URL (relative or same-origin), When validate_redirect_url called, Then passes
  - Given external redirect URL, When validate_redirect_url called, Then raises ValidationException
  - Given AuthState and secret_key, When serialize/deserialize round-tripped, Then original state recovered
  - Given expired signed data, When deserialize_auth_state called, Then raises ValidationException
  - Given JWT with exp claim, When get_token_expiry_seconds called, Then returns remaining seconds
  - Given non-JWT string, When get_token_expiry_seconds called, Then returns None
- Fixtures / hooks: Flask test request context for extract_token_from_request
- Gaps: None
- Evidence: `/work/IoTSupport/backend/tests/utils/test_auth_utils.py:1-332`

---

- Surface: Auth API endpoints
- Scenarios:
  - Given OIDC disabled, When GET /api/auth/self, Then 200 with default local-user
  - Given OIDC enabled and no token, When GET /api/auth/self, Then 401
  - Given OIDC enabled and valid token in cookie, When GET /api/auth/self, Then 200 with user info
  - Given OIDC enabled, When GET /api/auth/login without redirect, Then 400
  - Given OIDC enabled, When GET /api/auth/login with external redirect, Then 400
  - Given OIDC enabled, When GET /api/auth/login with valid redirect, Then 302 to OIDC provider + auth_state cookie set
  - Given OIDC enabled, When GET /api/auth/callback with valid code/state/cookie, Then 302 to redirect + tokens in cookies
  - Given OIDC enabled, When GET /api/auth/callback with missing state, Then 400
  - Given OIDC enabled, When GET /api/auth/callback with mismatched state, Then 400
  - Given any state, When GET /api/auth/logout, Then 302 + cookies cleared
  - Given OIDC enabled, When GET /api/auth/logout, Then redirects to OIDC end_session_endpoint
- Fixtures / hooks: Mock httpx for OIDC discovery, mock PyJWKClient, generate_test_jwt, auth_enabled_settings fixture
- Gaps: None
- Evidence: `/work/IoTSupport/backend/tests/api/test_auth_endpoints.py:1-149`

---

- Surface: Auth middleware (before_request hook)
- Scenarios:
  - Given OIDC disabled, When any /api request, Then passes through without auth check
  - Given OIDC enabled and @public endpoint, When request without token, Then passes through
  - Given OIDC enabled, When request without token to protected endpoint, Then 401
  - Given OIDC enabled and valid Bearer token, When request to protected endpoint, Then 200
  - Given OIDC enabled and valid cookie token, When request to protected endpoint, Then 200
  - Given OIDC enabled and both cookie and Bearer, When request, Then cookie takes precedence
  - Given OIDC enabled and expired access_token + valid refresh_token, When request, Then silent refresh + 200 + new cookies in response
  - Given OIDC enabled and expired access_token + failed refresh, When request, Then 401 + cookies cleared
  - Given OIDC enabled and expired access_token + no refresh_token, When request, Then 401
  - Given OIDC enabled and valid token + @allow_roles("editor") + user has "editor", When request, Then 200
  - Given OIDC enabled and valid token + @allow_roles("editor") + user has "viewer", When request, Then 403
  - Given OIDC enabled and valid token + no @allow_roles, When request, Then 200 (authenticated-only)
  - Given OIDC enabled, When GET /api/health/readyz, Then passes (health is @public)
  - Given OIDC enabled, When GET /api/metrics, Then passes (metrics is @public)
  - Given OIDC enabled, When POST /api/sse/callback, Then passes (SSE callback is @public)
- Fixtures / hooks: auth_enabled_app fixture (creates app with OIDC enabled + mocked discovery/JWKS), generate_test_jwt, mock httpx.post for refresh
- Gaps: None
- Evidence: `/work/IoTSupport/backend/tests/api/test_auth_middleware.py:1-574`

## 14) Implementation Slices

- Slice: 1 -- Dependencies and Configuration
- Goal: All OIDC configuration wired up; OIDC_ENABLED=false by default; existing tests pass.
- Touches: `pyproject.toml`, `app/config.py`, `tests/conftest.py`
- Dependencies: Must be first. Run `poetry lock` after adding dependencies.

---

- Slice: 2 -- Exception Types and Error Handling
- Goal: AuthenticationException and AuthorizationException wired into error handling.
- Touches: `app/exceptions.py`, `app/utils/error_handling.py`
- Dependencies: After slice 1.

---

- Slice: 3 -- Auth Services
- Goal: AuthService and OidcClientService ported and registered in DI container.
- Touches: `app/services/auth_service.py` (new), `app/services/oidc_client_service.py` (new), `app/services/container.py`, `app/__init__.py` (wire modules)
- Dependencies: After slice 2. Requires httpx, PyJWT dependencies.

---

- Slice: 4 -- Auth Utilities
- Goal: @public, @allow_roles, authenticate_request, token helpers, state serialization all ported.
- Touches: `app/utils/auth.py` (new)
- Dependencies: After slice 3 (imports AuthService, OidcClientService).

---

- Slice: 5 -- Auth Metrics
- Goal: Auth-related Prometheus metrics integrated.
- Touches: `app/services/metrics_service.py` (protocol and implementation)
- Dependencies: After slice 3 (AuthService references metrics methods).

---

- Slice: 6 -- Auth API Endpoints and Middleware
- Goal: BFF endpoints (login, callback, logout, self) and before_request/after_request hooks active.
- Touches: `app/api/auth.py` (new), `app/api/__init__.py`, `app/__init__.py` (wire auth module)
- Dependencies: After slices 3, 4, 5.

---

- Slice: 7 -- Public Endpoint Markers
- Goal: Health, metrics, and SSE callback endpoints marked @public.
- Touches: `app/api/health.py`, `app/api/metrics.py`, `app/api/sse.py`
- Dependencies: After slice 4 (@public decorator exists).

---

- Slice: 8 -- Test Suite
- Goal: All new code fully tested. Existing test suite still passes.
- Touches: `tests/services/test_auth_service.py` (new), `tests/services/test_oidc_client_service.py` (new), `tests/utils/test_auth_utils.py` (new), `tests/api/test_auth_endpoints.py` (new), `tests/api/test_auth_middleware.py` (new), `tests/conftest.py` (fixtures)
- Dependencies: After all prior slices.

## 15) Risks & Open Questions

- Risk: New Python dependencies (httpx, PyJWT, itsdangerous, cryptography) may conflict with existing dependency versions or increase image size.
- Impact: Build failure or version conflicts.
- Mitigation: Pin versions compatible with Python 3.12. Run `poetry lock` and full test suite after adding.

---

- Risk: EI MetricsService uses abstract protocol pattern (unlike IoTSupport's concrete class with generic methods). Adding auth metrics requires changes to both protocol and implementation.
- Impact: Moderate refactoring of metrics_service.py.
- Mitigation: Add specific typed methods (e.g., `record_auth_validation`, `record_token_refresh`) following the existing EI pattern rather than porting the generic `increment_counter`/`record_operation_duration` approach.

---

- Risk: Authorization model difference between IoTSupport (admin-always-required) and EI (authenticated-only default) could lead to subtle bugs if ported check_authorization logic is not properly adapted.
- Impact: Endpoints incorrectly requiring admin role, or endpoints missing required role checks.
- Mitigation: Simplify check_authorization: when @allow_roles is not set, any authenticated user passes. When @allow_roles is set, user must have at least one of the listed roles. Write explicit tests for both cases.

---

- Risk: Health and metrics endpoints are children of api_bp and will be subject to before_request hook. If @public is not applied or is accidentally removed, Prometheus scraping and Kubernetes health checks will break.
- Impact: Production outage (health checks fail, metrics unavailable).
- Mitigation: Explicit tests verifying health and metrics endpoints are accessible without authentication when OIDC is enabled.

---

- Risk: `itsdangerous` is a new dependency for auth state serialization. Flask already depends on it transitively, but it may not be in the explicit dependency list.
- Impact: Low; Flask includes itsdangerous as a dependency.
- Mitigation: Verify itsdangerous is available. If needed, add explicitly to pyproject.toml, but it should be available via Flask's dependency chain.

## 16) Confidence

Confidence: High -- The implementation is a well-understood port from a working codebase (IoTSupport) with comprehensive tests. The IoTSupport source code has been thoroughly examined and the adaptation points (config, exceptions, metrics, authorization model) are clearly identified and straightforward. No database changes or complex migrations are involved.
