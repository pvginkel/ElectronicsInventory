# Change Brief: OIDC Authentication via Keycloak

## Summary

Port the OIDC/Keycloak authentication system from the IoTSupport backend (`/work/IoTSupport/backend`) to the ElectronicsInventory backend. The implementation follows the BFF (Backend-for-Frontend) cookie pattern where the backend manages the full OAuth2 authorization code flow with PKCE, storing tokens in HTTP-only cookies.

## Scope

**Include:**
- `AuthService` singleton: JWT validation using JWKS from Keycloak's OIDC discovery endpoint, with key caching.
- `OidcClientService` singleton: OIDC endpoint discovery, authorization code exchange (with PKCE), and token refresh.
- BFF login/callback/logout endpoints managed by the backend.
- `before_request` hook on `/api/*` routes that validates the access token (from cookie or Bearer header), with automatic silent refresh when the token is expired but a refresh token is available.
- `@public` decorator to exempt specific endpoints from authentication.
- `@allow_roles("role")` decorator for opt-in role-based authorization. **The default is authenticated-only (no role check)**; roles are only enforced when `@allow_roles` is explicitly set.
- `OIDC_ENABLED` configuration toggle (default `false` for local dev) to disable authentication entirely.
- Auth-related Prometheus metrics (token validation, refresh attempts, JWKS discovery).
- Integration with the existing dependency injection container and graceful shutdown coordinator.
- Comprehensive tests for all new services and endpoints.

**Exclude:**
- Keycloak admin API integration.
- Device/M2M authentication.

## Endpoint Protection Rules

- `/api/*` endpoints require authentication (unless decorated with `@public`).
- `/health/*` and `/metrics` are outside the `/api/` prefix and are not authenticated.
- The SSE callback endpoint (`/api/sse/callback`) should be marked `@public` to keep its existing shared-secret auth mechanism.
- Testing endpoints already have their own `check_testing_mode` guard; under `OIDC_ENABLED=false` (test settings) they remain accessible.

## Testing Strategy

- `OIDC_ENABLED=false` in test settings so the existing test suite continues to work without Keycloak.
- New auth endpoints (login, callback, logout, token refresh, self/user-info) must have dedicated tests.
- New services (AuthService, OidcClientService) must have dedicated unit tests.

## Source Reference

The IoTSupport OIDC implementation lives at `/work/IoTSupport/backend` and includes `AuthService`, `OidcClientService`, auth decorators, BFF endpoints, and testing bypass support.
