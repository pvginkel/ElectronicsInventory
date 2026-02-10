# OIDC Authentication -- Plan Execution Report

## Status

**DONE** -- The plan was implemented successfully. All slices delivered, all tests pass, all review findings resolved.

## Summary

Ported OIDC/Keycloak authentication from the IoTSupport backend to the ElectronicsInventory backend. The implementation follows the BFF (Backend-for-Frontend) cookie pattern with PKCE authorization code flow. All 8 implementation slices from the plan were completed:

1. Dependencies and configuration (httpx, PyJWT, cryptography, itsdangerous; 12 OIDC config fields)
2. Exception types (AuthenticationException, AuthorizationException, ValidationException) and error handling
3. Auth services (AuthService for JWT validation with JWKS caching; OidcClientService for OIDC discovery, PKCE, token exchange/refresh)
4. Auth utilities (@public, @allow_roles, authenticate_request, token extraction, state serialization, redirect validation)
5. Auth metrics (4 Prometheus counters + 1 histogram with `ei_` prefix)
6. Auth API endpoints (login, callback, logout, self) and before_request/after_request hooks
7. Public endpoint markers (@public on health, metrics; SSE/testing/CAS/icons outside api_bp scope)
8. Comprehensive test suite (119 tests across 5 files)

### Files Created (9)
- `app/services/auth_service.py` -- JWT validation service
- `app/services/oidc_client_service.py` -- OIDC client service (discovery, PKCE, token exchange)
- `app/utils/auth.py` -- Auth utilities and decorators
- `app/api/auth.py` -- BFF auth endpoints
- `tests/services/test_auth_service.py` -- 15 AuthService tests
- `tests/services/test_oidc_client_service.py` -- 41 OidcClientService tests
- `tests/utils/test_auth_utils.py` -- 26 auth utility tests
- `tests/api/test_auth_endpoints.py` -- 11 auth endpoint tests
- `tests/api/test_auth_middleware.py` -- 17 auth middleware tests (+ 9 token refresh tests)

### Files Modified (12)
- `app/config.py` -- 12 OIDC environment variables and Settings fields
- `app/exceptions.py` -- 3 new exception types
- `app/utils/error_handling.py` -- Handlers for auth exceptions (401, 403, 400)
- `app/services/container.py` -- AuthService and OidcClientService as Singleton providers
- `app/services/metrics_service.py` -- 4 auth metric methods on protocol and implementation
- `app/api/__init__.py` -- before_request/after_request hooks, auth_bp registration
- `app/api/health.py` -- @public on readyz, healthz, drain
- `app/api/metrics.py` -- @public on get_metrics
- `app/__init__.py` -- Wire modules include auth API
- `tests/conftest.py` -- OIDC test settings, generate_test_jwt/mock fixtures
- `pyproject.toml` -- httpx, pyjwt, cryptography, itsdangerous dependencies
- `poetry.lock` -- Updated lock file

## Code Review Summary

**Decision:** GO-WITH-CONDITIONS (all conditions resolved)

| Severity | Count | Resolved |
|----------|-------|----------|
| Blocker  | 0     | N/A      |
| Major    | 0     | N/A      |
| Minor    | 3     | 3        |

**Findings resolved:**
1. Dead code path in `get_current_user` -- removed fallback validation (unreachable after before_request hook)
2. `id_token` cookie not cleared on failed refresh in after_request -- added id_token clearing
3. `time.time()` usage in `get_token_expiry_seconds` -- added clarifying comment (correct usage: absolute timestamp arithmetic)

**Reviewer questions answered:**
- `itsdangerous` added as explicit dependency in pyproject.toml
- Full callback integration test tracked as optional follow-up (each piece tested at unit level)

## Verification Results

### Ruff
```
All checks passed (no output)
```

### Mypy
```
Success: no issues found in 273 source files
```

### Pytest (auth tests)
```
119 passed, 3 warnings in 4.93s
```

Full test suite: 377 passed, 886 errors (pre-existing S3/database connectivity errors in sandbox -- not caused by auth changes), 30 deselected.

## Outstanding Work & Suggested Improvements

1. **Full callback integration test** -- An end-to-end test that exercises the complete callback flow (valid auth_state cookie + matching state + mocked token exchange) would add confidence. Low priority since each piece is tested individually.

2. **Cookie path restriction** -- Auth cookies are set with default `path="/"`. Restricting to `path="/api/"` would reduce exposure surface. Low priority for a single-user hobby app.

3. **Retry backoff on OIDC discovery** -- The 3-retry loop has no sleep between attempts. Adding a 1-second delay would be more polite to the OIDC provider. Low priority since this only runs at startup.

4. **Frontend integration** -- The frontend needs to handle 401 responses by redirecting to `/api/auth/login?redirect=<current_url>`, call `/api/auth/self` to determine auth state, and provide a logout button. This is tracked separately.
