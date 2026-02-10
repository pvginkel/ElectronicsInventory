# OIDC Authentication -- Plan Review

**Plan amendments applied during review:** The three Major findings below have been addressed by amending the plan directly. Changes include: (1) added `ValidationException` to the exceptions file map, data model, and design conflicts; (2) added scope boundary note documenting the four app-level blueprints outside `api_bp` and removed the incorrect SSE `@public` marker; (3) added explicit `MetricsServiceProtocol` method signatures to the data model section; (4) added note about stripping `TestingService` dependency from `get_current_user`. All amendments are in `plan.md` in sections 0, 1a, 2, and 3.

## 1) Summary & Decision

**Readiness**

The plan is thorough, well-researched, and demonstrates deep knowledge of both the IoTSupport source codebase and the ElectronicsInventory target codebase. The research log correctly identifies all key differences (config pattern, exceptions, metrics API, authorization model, health/metrics endpoint placement). The file map is exhaustive, the test plan covers all new surfaces, and the implementation slices are properly ordered. Three issues were identified during review (missing `ValidationException`, undocumented blueprint scope boundary, missing metrics method signatures) and have been resolved by amending the plan directly.

**Decision**

`GO` -- The three Major findings (blueprints outside `api_bp`, missing `ValidationException`, metrics method signatures) have been resolved by amending the plan. The plan is now implementation-ready.

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `docs/product_brief.md` -- Pass -- `plan.md:49` -- "currently unauthenticated (single-user hobby app)" correctly notes this is additive. Product brief says "No login required" (Section 2), and the plan respects this via OIDC_ENABLED=false default.
- `CLAUDE.md` (layering) -- Pass -- `plan.md:148-168` -- New services (AuthService, OidcClientService) go in `app/services/`, utilities in `app/utils/`, endpoints in `app/api/`. This follows the `API -> Service -> Model` layering.
- `CLAUDE.md` (DI container) -- Pass -- `plan.md:178-180` -- Plan specifies Singleton providers for auth_service and oidc_client_service in container.py, consistent with existing pattern (`app/services/container.py:155-159`).
- `CLAUDE.md` (testing requirements) -- Pass -- `plan.md:643-743` -- All new surfaces have Given/When/Then scenarios, fixtures are identified, no deferred gaps.
- `CLAUDE.md` (error handling) -- Pass -- `plan.md:137-144` -- Plan adds AuthenticationException and AuthorizationException to error handling, using typed exceptions per CLAUDE.md mandate.
- `CLAUDE.md` (no backwards compat) -- Pass -- `plan.md:281` -- "No backward compatibility needed; add fields with sensible defaults."
- `CLAUDE.md` (metrics protocol) -- Pass -- `plan.md:190-192` -- Plan correctly identifies that EI uses abstract protocol pattern and proposes typed methods rather than generic increment_counter.
- `docs/commands/plan_feature.md` (template conformance) -- Pass -- All 16 required sections are present and populated.

**Fit with codebase**

- `app/api/__init__.py` -- `plan.md:170-174` -- Plan correctly notes there is no before_request hook today. However, the plan must account for blueprints registered at the app level that have `/api/` URL prefixes. The before_request hook on `api_bp` will NOT fire for testing_bp, sse_bp, cas_bp, or icons_bp because they are registered directly on the Flask app, not as children of api_bp (see `app/__init__.py:185-198`).
- `app/services/metrics_service.py` -- `plan.md:190-192` -- The MetricsServiceProtocol uses abstract methods and concrete methods with default `return None` bodies. The plan proposes adding typed auth metric methods, which fits the established pattern.
- `app/config.py` -- `plan.md:124-132` -- The two-layer Environment+Settings pattern is identical to IoTSupport. The plan's config additions fit cleanly.
- `app/exceptions.py` -- `plan.md:137-138` -- The exception hierarchy is compatible. However, see adversarial finding about missing `ValidationException` in EI.
- `tests/conftest.py` -- `plan.md:214-216` -- The `_build_test_settings()` function constructs Settings with explicit fields. Adding OIDC fields with defaults will not break existing tests since OIDC_ENABLED defaults to false.

## 3) Open Questions & Ambiguities

- Question: Should the CAS, testing, SSE, and icons blueprints (registered at app level, not under api_bp) also be protected when OIDC is enabled?
- Why it matters: These blueprints serve `/api/cas/*`, `/api/testing/*`, `/api/sse/*`, and `/api/icons/*` URLs but bypass the api_bp before_request hook entirely since they are registered on the Flask app directly (`app/__init__.py:185-198`). If auth is desired on these routes when OIDC is enabled, the hook placement must change or per-blueprint hooks must be added.
- Needed answer: Explicit statement on which of these routes need auth protection. Testing endpoints have their own `check_testing_mode` guard. SSE callback has shared-secret auth. CAS and icons serve public content. A reasonable answer is "none need OIDC auth" but this should be documented explicitly.

---

- Question: Does the IoTSupport `ValidationException` (used by `deserialize_auth_state` and `validate_redirect_url`) need to be ported or mapped to an existing EI exception?
- Why it matters: EI does not have a `ValidationException` class. The IoTSupport auth utilities at `/work/IoTSupport/backend/app/utils/auth.py:341,391-393` raise `ValidationException` which is defined in `/work/IoTSupport/backend/app/exceptions.py:43-47`. Without this type, the ported code will fail at runtime.
- Needed answer: Either add `ValidationException` to EI's `app/exceptions.py` or map these error paths to an existing EI exception type (e.g., `InvalidOperationException`).

---

- Question: Should the `@public` decorator be applied to all endpoints in the four non-api_bp blueprints, or should the before_request hook be restructured?
- Why it matters: If the before_request hook is only on api_bp, endpoints on testing_bp, sse_bp, cas_bp, and icons_bp are inherently public. But if the plan later changes to use an app-level before_request, these would need `@public` markers.
- Needed answer: Confirm that the hook stays on api_bp only, and document that app-level blueprints are outside its scope by design.

## 4) Deterministic Backend Coverage (new/changed behavior only)

- Behavior: AuthService (JWT validation with JWKS caching)
- Scenarios:
  - Given OIDC enabled, When AuthService initialized, Then JWKS client created (`tests/services/test_auth_service.py`)
  - Given valid JWT, When validate_token called, Then AuthContext returned with correct roles
  - Given expired JWT, When validate_token called, Then AuthenticationException raised
  - Given invalid signature, When validate_token called, Then AuthenticationException raised
  - Given wrong issuer/audience, When validate_token called, Then AuthenticationException raised
- Instrumentation: `ei_auth_validation_total` (Counter), `ei_auth_validation_duration_seconds` (Histogram), `ei_jwks_refresh_total` (Counter)
- Persistence hooks: No DB changes. DI wiring in container.py. New dependencies in pyproject.toml.
- Gaps: None identified.
- Evidence: `plan.md:646-659`

---

- Behavior: OidcClientService (OIDC flow operations)
- Scenarios:
  - Given OIDC enabled, When initialized, Then endpoints discovered
  - Given provider unreachable, When initialized, Then ValueError after 3 retries
  - Given valid code, When exchange_code_for_tokens called, Then TokenResponse returned
  - Given valid refresh_token, When refresh_access_token called, Then new TokenResponse returned
- Instrumentation: `ei_oidc_token_exchange_total` (Counter), `ei_auth_token_refresh_total` (Counter)
- Persistence hooks: No DB changes. DI wiring in container.py.
- Gaps: None identified.
- Evidence: `plan.md:663-677`

---

- Behavior: Auth middleware (before_request/after_request hooks)
- Scenarios:
  - Given OIDC disabled, When any /api request, Then passes through
  - Given OIDC enabled and @public endpoint, When unauthenticated request, Then passes through
  - Given OIDC enabled and valid token, When request to protected endpoint, Then 200
  - Given expired token + valid refresh, When request, Then silent refresh + new cookies
  - Given expired token + failed refresh, When request, Then 401 + cookies cleared
  - Given valid token + @allow_roles mismatch, When request, Then 403
- Instrumentation: Metrics recorded by AuthService.validate_token and OidcClientService.refresh_access_token
- Persistence hooks: No DB changes. Wire `app.api` module in container.
- Gaps: No test scenario covers app-level blueprints (testing_bp, sse_bp, cas_bp, icons_bp) remaining unaffected by the hook. Add at least one scenario verifying these are not intercepted.
- Evidence: `plan.md:724-743`

---

- Behavior: Auth API endpoints (login, callback, logout, self)
- Scenarios:
  - Given OIDC disabled, When GET /api/auth/self, Then 200 with default local-user
  - Given OIDC enabled, When GET /api/auth/login with valid redirect, Then 302 to OIDC provider
  - Given valid callback, When GET /api/auth/callback, Then 302 with token cookies
  - Given any state, When GET /api/auth/logout, Then 302 + cookies cleared
- Instrumentation: Upstream service metrics cover these flows.
- Persistence hooks: No DB changes. Wire auth API module.
- Gaps: None identified.
- Evidence: `plan.md:705-720`

---

- Behavior: @public markers on health, metrics, SSE callback
- Scenarios:
  - Given OIDC enabled, When GET /api/health/readyz without token, Then 200
  - Given OIDC enabled, When GET /api/metrics without token, Then 200
  - Given OIDC enabled, When POST /api/sse/callback without token, Then 200
- Instrumentation: N/A
- Persistence hooks: N/A
- Gaps: The SSE callback endpoint is registered on `sse_bp` which is a child of the Flask app, not `api_bp` (`app/__init__.py:189`). It will NOT be subject to the before_request hook on api_bp anyway. The `@public` marker on it is harmless but misleading. The plan should clarify this.
- Evidence: `plan.md:196-210`, `app/__init__.py:189`

## 5) Adversarial Sweep

**Major -- Missing ValidationException in EI exceptions hierarchy**

**Evidence:** `plan.md:160-162` (auth.py port) + `/work/IoTSupport/backend/app/utils/auth.py:341,391-393` + `/work/IoTSupport/backend/app/exceptions.py:43-47` -- IoTSupport's `deserialize_auth_state` and `validate_redirect_url` raise `ValidationException`. EI's `app/exceptions.py:1-73` does not define this class.

**Why it matters:** The ported `app/utils/auth.py` will import `ValidationException` from `app.exceptions`. Since it does not exist, the import will fail at module load time, crashing the application. This is a runtime error, not a subtle logic bug.

**Fix suggestion:** Add `ValidationException` to `app/exceptions.py` (matching IoTSupport's pattern: `class ValidationException(BusinessLogicException): def __init__(self, message): super().__init__(message, error_code="VALIDATION_FAILED")`). Also add a handler in `app/utils/error_handling.py` mapping it to HTTP 400. Update the file map in the plan to include this new exception type.

**Confidence:** High

---

**Major -- Blueprints outside api_bp with /api/ prefix are invisible to before_request hook**

**Evidence:** `plan.md:170-174` places the before_request hook on `api_bp`. But `app/__init__.py:185-198` registers `testing_bp` (url_prefix `/api/testing`), `sse_bp` (url_prefix `/api/sse`), `cas_bp` (url_prefix `/api/cas`), and `icons_bp` (url_prefix `/api/icons`) directly on the Flask app, not as children of `api_bp`.

**Why it matters:** These endpoints serve content under `/api/*` but will never trigger the before_request hook. This is actually the desired behavior for SSE callback (has its own auth), testing (has check_testing_mode), CAS (serves immutable blobs), and icons (serves static files). However, the plan does not acknowledge this at all -- it only discusses marking SSE callback, health, and metrics with `@public` but does not mention the four app-level blueprints. If someone later moves these under api_bp for consistency, they would break without `@public` markers. The plan should explicitly document the scope boundary.

**Fix suggestion:** Add a note in the plan's "Affected Areas" section acknowledging that testing_bp, sse_bp, cas_bp, and icons_bp are registered at the app level and therefore not subject to the api_bp before_request hook. Remove the plan item about marking SSE callback with `@public` (line 103, 196-198) since it is unnecessary. Alternatively, if SSE callback should be protected, it would need to be moved under api_bp first.

**Confidence:** High

---

**Major -- IoTSupport MetricsService uses generic increment_counter/record_operation_duration that EI MetricsService does not have**

**Evidence:** `plan.md:190-192` correctly identifies this gap. However, the plan does not specify the exact method signatures to add to `MetricsServiceProtocol`. The IoTSupport `AuthService` calls `self.metrics_service.increment_counter("iot_auth_validation_total", labels={"status": "success"})` and `self.metrics_service.record_operation_duration("iot_auth_validation_duration_seconds", duration)` at `/work/IoTSupport/backend/app/services/auth_service.py:79-88,176-181`. The plan says "Add specific typed methods following EI pattern" but does not list those methods in the Data Model/Contracts section or the file map entry for metrics_service.py.

**Why it matters:** Without explicit method signatures, the implementer must reverse-engineer which metric calls exist in the IoTSupport auth services and design corresponding typed methods. This is error-prone given there are at least 5 distinct metric recording points across AuthService and OidcClientService. Given that the EI MetricsServiceProtocol is an ABC, every new method must appear on both the protocol and the implementation, plus the `StubMetricsService` used in tests. Missing any one causes a runtime `TypeError`.

**Fix suggestion:** Add a subsection in Section 3 (Data Model/Contracts) enumerating the new MetricsServiceProtocol methods:
- `record_auth_validation(status: str, duration: float) -> None`
- `record_jwks_refresh(trigger: str, status: str) -> None`
- `record_oidc_token_exchange(status: str) -> None`
- `record_auth_token_refresh(status: str) -> None`

Also note that `StubMetricsService` (if used in tests) and any mock must be updated.

**Confidence:** High

---

**Minor -- auth_state cookie `@public` interaction with get_current_user**

**Evidence:** `plan.md:707-709` -- The `/api/auth/self` endpoint is marked `@public` and handles authentication explicitly. In IoTSupport (`/work/IoTSupport/backend/app/api/auth.py:66-96`), the `get_current_user` function includes test session management via `TestingService.consume_forced_auth_error()` and `TestingService.get_session()`. The plan (line 81) explicitly excludes test session support from EI. The implementer must ensure the `get_current_user` function is simplified to remove test session logic and TestingService dependency injection, otherwise it will try to inject EI's TestingService which has a completely different API.

**Why it matters:** If the IoTSupport `get_current_user` code is copied without stripping the testing_service dependency, it will crash because EI's `TestingService` does not have `consume_forced_auth_error()` or `get_session()` methods.

**Fix suggestion:** The plan already notes this in Section 0 (conflict #5) but should add an explicit note in the file map entry for `app/api/auth.py` (line 167) stating "Remove TestingService dependency and test session logic from get_current_user; simplify to OIDC-only path."

**Confidence:** High

## 6) Derived-Value & Persistence Invariants

- Derived value: JWKS key cache
  - Source dataset: OIDC provider's JWKS endpoint; PyJWKClient fetches signing keys with 5-minute TTL
  - Write / cleanup triggered: In-memory cache only; no persistent writes
  - Guards: OIDC_ENABLED must be true; _jwks_client is None when disabled
  - Invariant: When OIDC_ENABLED=true, the JWKS cache must contain at least one valid signing key after initialization completes without error
  - Evidence: `plan.md:448-453`, `/work/IoTSupport/backend/app/services/auth_service.py:67-89`

- Derived value: oidc_audience (resolved from config)
  - Source dataset: OIDC_AUDIENCE env var, falling back to OIDC_CLIENT_ID
  - Write / cleanup triggered: Used in JWT audience validation claim comparison; no persistent state
  - Guards: When OIDC_ENABLED=true, at least OIDC_CLIENT_ID must be set (validated at AuthService init)
  - Invariant: oidc_audience is never None when OIDC is enabled; fallback to client_id is deterministic
  - Evidence: `plan.md:456-460`, `/work/IoTSupport/backend/app/config.py:134-136`

- Derived value: oidc_cookie_secure (resolved from config or baseurl)
  - Source dataset: Explicit OIDC_COOKIE_SECURE env var, or inferred from BASEURL scheme
  - Write / cleanup triggered: Controls the Secure flag on all auth cookies (access_token, refresh_token, id_token, auth_state)
  - Guards: Must match actual TLS termination configuration; misconfiguration causes cookies to not be sent
  - Invariant: When BASEURL starts with `https://`, oidc_cookie_secure must be true
  - Evidence: `plan.md:462-467`, `/work/IoTSupport/backend/app/utils/auth.py:348-361`

- Derived value: g.auth_context (per-request)
  - Source dataset: Validated JWT token claims, set by before_request hook after cryptographic verification
  - Write / cleanup triggered: Written to Flask's g object; automatically cleaned up by Flask at end of request
  - Guards: Only set after validate_token succeeds; never set on @public endpoints unless explicitly checked
  - Invariant: When g.auth_context is present, the token's signature, issuer, audience, and expiry have been verified
  - Evidence: `plan.md:469-474`, `/work/IoTSupport/backend/app/utils/auth.py:236-238`

## 7) Risks & Mitigations (top 3)

- Risk: Missing `ValidationException` and incomplete metrics method signatures will cause runtime crashes during development if the implementer ports IoTSupport code without adaptation.
- Mitigation: Amend plan Section 2 (file map) and Section 3 (data model) to explicitly enumerate `ValidationException` and the four new MetricsServiceProtocol method signatures before implementation begins.
- Evidence: `plan.md:137-144,190-192`, `/work/IoTSupport/backend/app/utils/auth.py:341,391`, `/work/IoTSupport/backend/app/services/auth_service.py:79-88,176-181`

- Risk: The before_request hook on `api_bp` does not cover testing_bp, sse_bp, cas_bp, or icons_bp which all serve `/api/*` URLs. A future refactor moving these under api_bp without adding `@public` would break health checks, SSE, and public content delivery.
- Mitigation: Add explicit documentation in the plan noting these blueprints are out-of-scope for the hook by design. Optionally add `@public` markers defensively so future migrations are safe.
- Evidence: `plan.md:170-174,196-210`, `app/__init__.py:185-198`

- Risk: Authorization model mismatch between IoTSupport (admin-always-required) and EI (authenticated-only default) could result in subtle bugs if `check_authorization` from IoTSupport is not fully rewritten.
- Mitigation: The plan acknowledges this at `plan.md:815-817`. The implementation should include explicit negative tests: (1) user without admin role accessing an endpoint without @allow_roles (should pass), (2) user without admin role accessing @allow_roles("editor") endpoint without "editor" role (should fail with 403). Both scenarios are in the test plan at `plan.md:735-737`.
- Evidence: `plan.md:436-444`, `/work/IoTSupport/backend/app/utils/auth.py:167-204`

## 8) Confidence

Confidence: High -- The plan is thorough, the IoTSupport source code is well-understood, and the identified issues are all addressable with targeted amendments. No blockers exist; the three Major findings are straightforward to resolve before implementation begins.
