# Plan: Role-Based Access Control

## 0) Research Log & Findings

**Areas researched:**

- **AuthService** (`app/services/auth_service.py`): Singleton service that validates JWTs and extracts roles from `realm_access` and `resource_access` claims. Currently has no concept of hierarchical roles or required-role inference. Constructor takes only `config: Settings`.
- **Auth utilities** (`app/utils/auth.py`): Contains `public()`, `allow_roles()`, `check_authorization()`, and `authenticate_request()`. The `allow_roles` decorator sets `func.allowed_roles` as a free-form `set[str]` with no validation against a configured set. `check_authorization` checks if the user has at least one of the allowed roles, but performs no role expansion (hierarchy). When no `@allow_roles` is present, any authenticated user passes.
- **OIDC hooks** (`app/api/oidc_hooks.py:30-105`): The `before_request` hook on `api_bp` retrieves the view function from `current_app.view_functions`, checks `is_public`, validates the token, and calls `check_authorization`. There is no method-based role inference -- all non-public endpoints are treated identically regardless of HTTP method.
- **Service container** (`app/services/container.py:202-205`): `auth_service` is a `providers.Singleton(AuthService, config=config)`. Role names are not passed in.
- **Three POST-as-query endpoints** confirmed:
  - `POST /api/parts/shopping-list-memberships/query` (`app/api/parts.py:345`)
  - `POST /api/kits/shopping-list-memberships/query` (`app/api/kits.py:257`)
  - `POST /api/kits/pick-list-memberships/query` (`app/api/kits.py:305`)
- **Spectree** (`app/utils/spectree_config.py`): Uses `SpecTree` with Flask backend. The `@api.validate()` decorator accepts a `security` parameter. Spectree exposes `SecurityScheme` and `SecuritySchemeData` classes for defining security schemes. The OpenAPI spec can have per-operation security via the `security` kwarg on `@api.validate()`.
- **Existing `@allow_roles` usage**: No endpoints currently use `@allow_roles` in `app/api/`. It is only defined and documented in `app/utils/auth.py:75-94`.
- **Test infrastructure**: `tests/conftest_infrastructure.py` provides `oidc_app` and `oidc_client` fixtures with mocked JWKS. `TestingService` supports test sessions with configurable roles. No dedicated auth unit test files exist in the `tests/` directory currently.

**Conflicts identified and resolved:**

1. The change brief says "blanket 403 when resolved required role is None" but the existing `before_request` hook returns 401 for `AuthenticationException` and 403 for `AuthorizationException`. The plan will use `AuthorizationException` (403) for the "role configured but user lacks it" case, and a new 403 for the "no recognized role at all" case. Both are authorization failures, not authentication failures.

2. The change brief mentions "OpenAPI automation" via a startup hook. The Spectree `@api.validate(security=...)` parameter sets per-endpoint security in the spec, but it requires knowing the role at decoration time. Since the method-based inference means the role is determined by the HTTP method of each endpoint, the startup hook will need to iterate `app.url_map` after all blueprints are registered, compute the effective role for each endpoint, and set a function attribute that Spectree can read. However, Spectree's `security` param is set at decoration time and cannot be added post-hoc to already-registered endpoints. The practical approach is: define a security scheme on the SpecTree instance at configuration time, and then add a startup hook that builds a role-map dict (endpoint -> role) and exposes it via an API endpoint or injects it into the generated OpenAPI spec by patching Spectree's spec output. The simpler and more maintainable approach is to add a dedicated endpoint (e.g., `GET /api/auth/role-map`) that returns the computed role map, or to post-process the OpenAPI spec. I will use a spec post-processing hook that runs once at startup after all routes are registered, iterating `app.view_functions` and annotating the spec dict. This avoids touching every `@api.validate()` call.

## 1) Intent & Scope

**User intent**

Add method-based role enforcement to the existing OIDC authentication layer so that HTTP method determines the minimum required role (GET = reader, POST/PUT/PATCH/DELETE = editor), with a role hierarchy (admin > editor > reader) and a `@safe_query` decorator for POST endpoints that are read-only queries.

**Prompt quotes**

"Add read_role, write_role, and admin_role (optional) as constructor arguments to AuthService, wired in container.py -- not as environment variables"

"Method-based inference, not per-endpoint annotation. GET requests require read_role; all other HTTP methods require write_role."

"@safe_query decorator for POST endpoints that are actually read-only queries (3 endpoints identified)"

"When OIDC is enabled and resolved required role is None, reject with blanket 403 (not 401)"

"OpenAPI automation: startup hook that reads effective role per endpoint and sets security attribute for Spectree to include in spec"

**In scope**

- Add `read_role`, `write_role`, `admin_role`, and `additional_roles` constructor parameters to `AuthService`
- Wire the role names in `container.py` as constructor arguments
- Implement role hierarchy expansion in `AuthService` (admin implies editor implies reader)
- Method-based role inference in the `before_request` hook (GET -> read_role, non-GET -> write_role)
- `@safe_query` decorator for POST-as-query endpoints
- Apply `@safe_query` to the 3 identified endpoints
- Constrain `@allow_roles` to only accept configured roles
- Blanket 403 when OIDC is enabled and resolved required role is None
- OpenAPI spec annotation with per-endpoint security via startup hook
- Comprehensive tests for all new behavior
- Code-level documentation (docstrings)

**Out of scope**

- Database schema changes (no new tables or columns)
- Frontend changes (documented separately if needed)
- Per-endpoint role annotation for standard CRUD endpoints (the method-based inference handles this)
- New metrics (the existing `AUTH_VALIDATION_TOTAL` already captures authorization outcomes)

**Assumptions / constraints**

- The IdP (Keycloak) assigns a single role per user; the auth layer expands it. The hierarchy is fixed: admin > editor > reader.
- `@public` endpoints bypass role checking entirely (no change to existing behavior).
- When OIDC is disabled, all role enforcement is skipped (existing behavior preserved).
- Testing mode (`is_testing`) with test sessions uses the same role enforcement logic.
- The three role names ("reader", "editor", "admin") are hardcoded in `container.py`, not configurable via environment. The `additional_roles` list is empty for EI (no "pipeline" role needed).

## 1a) User Requirements Checklist

**User Requirements Checklist**

- [ ] Add read_role, write_role, and admin_role (optional) as constructor arguments to AuthService, wired in container.py -- not as environment variables
- [ ] Add additional_roles list parameter to AuthService for app-specific non-hierarchical roles (e.g., "pipeline")
- [ ] Implement role hierarchy: admin implies editor implies reader (role expansion in auth layer)
- [ ] Method-based role inference: GET -> read_role, non-GET -> write_role (no per-endpoint annotation needed for the common case)
- [ ] Add @safe_query decorator for POST endpoints that are read-only queries, overriding method-based inference to require read_role
- [ ] Apply @safe_query to the 3 existing POST-as-query endpoints (parts shopping-list-memberships query, kits shopping-list-memberships query, kits pick-list-memberships query)
- [ ] Constrain @allow_roles to only accept roles from the configured set (read_role, write_role, admin_role, additional_roles) -- reject unknown role names
- [ ] When OIDC is enabled and resolved required role is None, reject with blanket 403 (not 401)
- [ ] OpenAPI automation: startup hook that reads effective role per endpoint and sets security attribute for Spectree to include in spec
- [ ] Comprehensive tests for role enforcement, hierarchy expansion, @safe_query, @allow_roles validation, and 403 rejection
- [ ] Document the method-based role split and @safe_query usage clearly in code (docstrings, not separate docs)

## 2) Affected Areas & File Map

- Area: `app/services/auth_service.py` -- `AuthService.__init__`
- Why: Add `read_role`, `write_role`, `admin_role`, `additional_roles` constructor parameters and role hierarchy expansion logic.
- Evidence: `app/services/auth_service.py:52-55` -- constructor currently takes only `config: Settings`

- Area: `app/services/auth_service.py` -- new method `expand_roles`
- Why: Implement role hierarchy expansion (admin -> {admin, editor, reader}).
- Evidence: `app/services/auth_service.py:245-277` -- `_extract_roles` returns raw roles from token; expansion must happen after extraction

- Area: `app/services/auth_service.py` -- new method `resolve_required_role`
- Why: Determine the required role for a request based on HTTP method and endpoint attributes (`is_safe_query`, `allowed_roles`).
- Evidence: `app/services/auth_service.py:131` -- `validate_token` is the existing entry point; the new method is called from the hook, not from validate_token

- Area: `app/services/auth_service.py` -- new property `configured_roles`
- Why: Expose the full set of valid role names for `@allow_roles` validation.
- Evidence: `app/services/auth_service.py:45-55` -- class needs to know its configured role set

- Area: `app/services/container.py` -- `auth_service` provider
- Why: Wire `read_role`, `write_role`, `admin_role`, `additional_roles` as constructor arguments.
- Evidence: `app/services/container.py:202-205` -- currently `providers.Singleton(AuthService, config=config)`

- Area: `app/utils/auth.py` -- `check_authorization`
- Why: Replace current logic with method-based role inference using `AuthService.resolve_required_role`. Add `auth_service: AuthService` and `http_method: str` parameters.
- Evidence: `app/utils/auth.py:134-164` -- current implementation only checks `allowed_roles` attribute

- Area: `app/utils/auth.py` -- `authenticate_request`
- Why: Thread `auth_service` (already a parameter) and new `http_method` parameter through to both internal `check_authorization` call sites (lines 198 and 249). Both the direct-validation path and the token-refresh path call `check_authorization` and must pass the new parameters.
- Evidence: `app/utils/auth.py:198,249` -- two `check_authorization` calls inside `authenticate_request`

- Area: `app/utils/auth.py` -- new `safe_query` decorator
- Why: Mark POST endpoints that require only read_role.
- Evidence: `app/utils/auth.py:62-72` -- `public` decorator follows the same attribute-stamping pattern

- Area: `app/utils/auth.py` -- `allow_roles` decorator
- Why: Add validation that provided role names are in `AuthService.configured_roles`. This requires the decorator to accept or look up the configured roles set.
- Evidence: `app/utils/auth.py:75-94` -- current decorator accepts arbitrary strings

- Area: `app/api/oidc_hooks.py` -- `before_request_authentication`
- Why: Pass `request.method` and view function to `check_authorization` so it can perform method-based role inference.
- Evidence: `app/api/oidc_hooks.py:30-105` -- currently passes `actual_func` to `check_authorization` but not the HTTP method

- Area: `app/api/parts.py` -- `query_part_shopping_list_memberships`
- Why: Apply `@safe_query` decorator.
- Evidence: `app/api/parts.py:345-355` -- POST endpoint that is a read-only query

- Area: `app/api/kits.py` -- `query_shopping_list_memberships_for_kits`
- Why: Apply `@safe_query` decorator.
- Evidence: `app/api/kits.py:257-271` -- POST endpoint that is a read-only query

- Area: `app/api/kits.py` -- `query_pick_list_memberships_for_kits`
- Why: Apply `@safe_query` decorator.
- Evidence: `app/api/kits.py:305-319` -- POST endpoint that is a read-only query

- Area: `app/utils/spectree_config.py` -- `configure_spectree`
- Why: Define a security scheme on the SpecTree instance so per-endpoint security references resolve.
- Evidence: `app/utils/spectree_config.py:28-35` -- SpecTree creation; no security schemes defined currently

- Area: `app/__init__.py` -- `create_app`
- Why: Add startup hook after blueprint registration that annotates OpenAPI spec with per-endpoint security.
- Evidence: `app/__init__.py:169-177` -- blueprint registration happens here; the hook runs after `app.register_blueprint(api_bp)`

- Area: `tests/test_role_based_access.py` (new file)
- Why: Comprehensive tests for role enforcement, hierarchy expansion, `@safe_query`, `@allow_roles` validation, and 403 rejection.
- Evidence: No existing auth test files in `tests/`

## 3) Data Model / Contracts

- Entity / contract: `AuthService` constructor signature
- Shape:
  ```
  AuthService(
      config: Settings,
      read_role: str = "reader",
      write_role: str = "editor",
      admin_role: str | None = "admin",
      additional_roles: list[str] | None = None,
  )
  ```
- Refactor strategy: Direct change to constructor; no backwards compatibility needed (BFF pattern). All callers are in `container.py`.
- Evidence: `app/services/auth_service.py:52-55`, `app/services/container.py:202-205`

- Entity / contract: `AuthContext.roles` after hierarchy expansion
- Shape: If token has `{"roles": ["editor"]}`, after expansion `AuthContext.roles` becomes `{"editor", "reader"}`. If token has `{"roles": ["admin"]}`, becomes `{"admin", "editor", "reader"}`.
- Refactor strategy: Expansion happens inside `validate_token` after `_extract_roles`; callers receive the expanded set transparently.
- Evidence: `app/services/auth_service.py:178` -- `roles = self._extract_roles(payload, expected_audience)`

- Entity / contract: `check_authorization` function signature
- Shape:
  ```
  check_authorization(
      auth_context: AuthContext,
      auth_service: AuthService,
      http_method: str,
      view_func: Callable | None = None,
  ) -> None
  ```
- Refactor strategy: Add `auth_service` and `http_method` parameters; update both call sites in `oidc_hooks.py` (test-session path at line 84, OIDC path at line 98) and both call sites in `authenticate_request` (lines 198 and 249).
- Evidence: `app/utils/auth.py:134,198,249`, `app/api/oidc_hooks.py:84,98`

- Entity / contract: `authenticate_request` function signature
- Shape:
  ```
  authenticate_request(
      auth_service: AuthService,
      config: Settings,
      http_method: str,
      oidc_client_service: OidcClientService | None = None,
      view_func: Callable | None = None,
  ) -> None
  ```
- Refactor strategy: Add `http_method` parameter (passed from the hook via `request.method`). Thread it to both internal `check_authorization` calls (lines 198 and 249). `auth_service` is already a parameter.
- Evidence: `app/utils/auth.py:167-256`

- Entity / contract: OpenAPI security scheme
- Shape: A `SecurityScheme` named "BearerAuth" with type `http`, scheme `bearer`, bearerFormat `JWT`.
- Refactor strategy: Added to `configure_spectree`; no existing scheme to replace.
- Evidence: `app/utils/spectree_config.py:28-35`

## 4) API / Integration Surface

No new HTTP endpoints are added. Existing behavior changes:

- Surface: All `GET /api/*` endpoints (56 endpoints)
- Inputs: Existing (no change)
- Outputs: Existing (no change)
- Errors: New 403 if user lacks `read_role` (previously: any authenticated user passed)
- Evidence: `app/api/oidc_hooks.py:30-105`

- Surface: All non-GET `/api/*` endpoints (70 endpoints, minus 3 safe_query)
- Inputs: Existing (no change)
- Outputs: Existing (no change)
- Errors: New 403 if user lacks `write_role` (previously: any authenticated user passed)
- Evidence: `app/api/oidc_hooks.py:30-105`

- Surface: `POST /api/parts/shopping-list-memberships/query`
- Inputs: Existing `PartShoppingListMembershipQueryRequestSchema` (no change)
- Outputs: Existing (no change)
- Errors: Now requires only `read_role` instead of `write_role` due to `@safe_query`
- Evidence: `app/api/parts.py:345-355`

- Surface: `POST /api/kits/shopping-list-memberships/query`
- Inputs: Existing `KitMembershipBulkQueryRequestSchema` (no change)
- Outputs: Existing (no change)
- Errors: Now requires only `read_role` instead of `write_role` due to `@safe_query`
- Evidence: `app/api/kits.py:257-271`

- Surface: `POST /api/kits/pick-list-memberships/query`
- Inputs: Existing `KitMembershipBulkQueryRequestSchema` (no change)
- Outputs: Existing (no change)
- Errors: Now requires only `read_role` instead of `write_role` due to `@safe_query`
- Evidence: `app/api/kits.py:305-319`

- Surface: OpenAPI spec (`/api/docs`)
- Inputs: N/A
- Outputs: Each operation now includes a `security` field indicating the required role
- Errors: N/A
- Evidence: `app/utils/spectree_config.py`

## 5) Algorithms & State Machines

- Flow: Role hierarchy expansion (inside `validate_token`)
- Steps:
  1. Extract raw roles from JWT claims via `_extract_roles` (existing).
  2. For each extracted role, expand using hierarchy: if role == admin_role, add write_role and read_role; if role == write_role, add read_role.
  3. Return `AuthContext` with the expanded role set.
- States / transitions: None (stateless transformation).
- Hotspots: Negligible -- a small set iteration on every token validation. The expansion map is precomputed at `AuthService.__init__` time.
- Evidence: `app/services/auth_service.py:178`

- Flow: Method-based role resolution (inside `check_authorization`)
- Steps:
  1. If endpoint has `is_public` attribute, skip (already handled before this function is called).
  2. If endpoint has `allowed_roles` attribute, required_roles = that set. **Note:** `@allow_roles` is a complete override of method-based inference, not an additive constraint. The user must have at least one of the listed roles regardless of HTTP method.
  3. Else if endpoint has `is_safe_query` attribute, required_role = read_role.
  4. Else if HTTP method in ("GET", "HEAD"), required_role = read_role. (HEAD is auto-generated by Flask for GET routes and is a safe, read-only method.)
  5. Else (POST/PUT/PATCH/DELETE), required_role = write_role.
  6. If OIDC is enabled and resolved required_role is None (e.g., admin_role is None and somehow selected), return 403.
  7. Check that `auth_context.roles` intersects with the required role set (after hierarchy expansion on the context side, a single role check suffices).
  8. If no match, raise `AuthorizationException`.
- States / transitions: None.
- Hotspots: Runs on every authenticated request. Lookup is O(1) set membership.
- Evidence: `app/utils/auth.py:134-164`

- Flow: `@allow_roles` validation (at import/decoration time)
- Steps:
  1. Decorator receives role names as positional arguments.
  2. At decoration time, the configured role set is not yet available (AuthService has not been constructed). Therefore, validation must be deferred.
  3. Store the raw role names on the function attribute.
  4. At startup (after container wiring), a validation pass iterates all `app.view_functions`, finds any with `allowed_roles`, and checks each role against `auth_service.configured_roles`. Raises `ValueError` on unknown roles.
- States / transitions: None.
- Hotspots: One-time startup check. Fails fast if a typo is present.
- Evidence: `app/utils/auth.py:75-94`

- Flow: OpenAPI security annotation (startup hook)
- Steps:
  1. Define a `SecurityScheme` named "BearerAuth" (type=http, scheme=bearer, bearerFormat=JWT) on the SpecTree instance in `configure_spectree`, using `security_schemes=[SecurityScheme(name="BearerAuth", data=SecuritySchemeData(type="http", scheme="bearer", bearerFormat="JWT"))]`.
  2. After all blueprints are registered and the app is fully wired (end of `create_app`, after `app.register_blueprint(api_bp)` at line 177 and all other blueprint registrations), run the annotation hook.
  3. The hook forces generation of the spec by accessing `api.spec`, which triggers Spectree to walk `app.url_map` and build the OpenAPI dict. Since all blueprints are registered by this point, all routes will be included.
  4. Iterate `app.view_functions` and `app.url_map.iter_rules()` to build a mapping of (operationId or path+method) -> effective role. For each view function on `api_bp` (url starts with `/api/`):
     a. If `is_public`, skip.
     b. Determine effective role using the same logic as `check_authorization` (based on methods from the url_map rule, `is_safe_query`, `allowed_roles`). For routes with multiple methods (e.g., GET+HEAD), each method gets its own operation in the spec.
     c. Note: HEAD is treated as GET for role purposes.
  5. Mutate the cached `api._spec` dict in place: for each path/operation, add `"security": [{"BearerAuth": []}]` with a vendor extension `"x-required-role": "<role_name>"` so the frontend can read the effective role.
  6. The spec is now cached with annotations; subsequent requests to `/api/docs` serve the annotated version.
- States / transitions: None.
- Hotspots: Runs once at startup. Must run after all blueprints are registered. The `api.spec` property is lazily generated and cached in `api._spec`; forcing it at startup ensures all routes are present. If Spectree's internal structure changes, the annotation may silently fail; wrap in try/except with a warning log.
- Evidence: `app/__init__.py:169-177`, `app/utils/spectree_config.py:28-38`, Spectree source: `SpecTree.spec` property caches in `_spec`

## 6) Derived State & Invariants

- Derived value: Expanded role set on `AuthContext`
  - Source: Raw roles from JWT `realm_access.roles` and `resource_access.<audience>.roles` (unfiltered)
  - Writes / cleanup: No persistence; the expanded set exists only in-memory for the duration of the request
  - Guards: Expansion only applies when OIDC is enabled and `auth_service` has configured roles
  - Invariant: If a user has the admin role, their expanded set must always contain write_role and read_role
  - Evidence: `app/services/auth_service.py:178`

- Derived value: Effective required role for an endpoint
  - Source: HTTP method from `request.method`, `is_safe_query` attribute, `allowed_roles` attribute on the view function
  - Writes / cleanup: No persistence; computed per-request in `check_authorization`
  - Guards: When OIDC is disabled, no role enforcement occurs; when `is_public`, role checking is skipped
  - Invariant: A GET endpoint always requires read_role unless overridden by `@allow_roles`; a non-GET endpoint always requires write_role unless overridden by `@safe_query` or `@allow_roles`
  - Evidence: `app/utils/auth.py:134-164`

- Derived value: Configured roles set on `AuthService`
  - Source: Constructor arguments `read_role`, `write_role`, `admin_role`, `additional_roles`
  - Writes / cleanup: Built once at construction; used for `@allow_roles` validation at startup
  - Guards: `admin_role` may be None (excluded from the set if so)
  - Invariant: The configured set always includes `read_role` and `write_role`; `additional_roles` are additive and non-hierarchical
  - Evidence: `app/services/auth_service.py:52-55`

## 7) Consistency, Transactions & Concurrency

- Transaction scope: No database transactions involved. All role checking is in-memory during the request lifecycle.
- Atomic requirements: None. Role checking is a pure function of the token claims and the configured roles.
- Retry / idempotency: N/A. Token validation and role checking are idempotent.
- Ordering / concurrency controls: `AuthService` is a singleton; its role configuration is immutable after construction. The `expand_roles` method and `resolve_required_role` method are stateless and thread-safe.
- Evidence: `app/services/container.py:202-205` (Singleton provider), `app/services/auth_service.py:45-50` (thread-safety note)

## 8) Errors & Edge Cases

- Failure: User has a valid token but no recognized role in the configured set
- Surface: `before_request_authentication` in `oidc_hooks.py`
- Handling: 403 with `AuthorizationException("No recognized role -- access denied")`
- Guardrails: The hierarchy expansion ensures that a user with "admin" will always have "reader" and "editor" in their expanded set; only truly unrecognized roles will hit this path
- Evidence: `app/api/oidc_hooks.py:96-105`

- Failure: `@allow_roles` used with a typo or unknown role name
- Surface: Application startup (validation hook)
- Handling: `ValueError` raised at startup, preventing the application from starting with misconfigured roles
- Guardrails: The startup validation iterates all view functions and checks against `auth_service.configured_roles`
- Evidence: `app/utils/auth.py:75-94`

- Failure: `admin_role` is None and an endpoint has `@allow_roles("admin")`
- Surface: Application startup (validation hook)
- Handling: `ValueError` -- "admin" would not be in `configured_roles` since `admin_role` is None
- Guardrails: Same startup validation
- Evidence: New startup hook

- Failure: OIDC disabled but `@allow_roles` or `@safe_query` are present on endpoints
- Surface: `before_request_authentication`
- Handling: No effect -- when OIDC is disabled, the hook returns early with no role checking (existing behavior preserved)
- Guardrails: The decorators are inert when OIDC is off
- Evidence: `app/api/oidc_hooks.py:90-93`

- Failure: Testing mode with test session that has no roles
- Surface: `before_request_authentication` test session path
- Handling: `check_authorization` will apply the same method-based role inference and raise `AuthorizationException` if the test session's roles don't include the required role
- Guardrails: Test sessions must include appropriate roles; existing Playwright tests that rely on no-role sessions will need to add at minimum the reader role
- Evidence: `app/api/oidc_hooks.py:70-88`

## 9) Observability / Telemetry

- Signal: `AUTH_VALIDATION_TOTAL`
- Type: Counter (existing)
- Trigger: Incremented on every token validation in `AuthService.validate_token`
- Labels / fields: `status` -- existing labels ("success", "expired", "invalid_signature", etc.)
- Consumer: Existing metrics endpoint and dashboard
- Evidence: `app/services/auth_service.py:17-20`

No new metrics are added. The existing `AUTH_VALIDATION_TOTAL` counter already tracks validation outcomes. Authorization failures (403) are already tracked via the `AuthorizationException` error handler in `flask_error_handlers.py`, which can be monitored through HTTP response code metrics. Adding a dedicated authorization counter would be a future enhancement if needed.

## 10) Background Work & Shutdown

- Worker / job: OpenAPI security annotation startup hook
- Trigger cadence: Startup-only (runs once after all blueprints are registered)
- Responsibilities: Iterates `app.view_functions`, computes effective role per endpoint, annotates OpenAPI spec
- Shutdown handling: None needed -- this is a one-shot startup task with no background thread
- Evidence: `app/__init__.py:242-257` (existing startup sequence)

- Worker / job: `@allow_roles` validation startup hook
- Trigger cadence: Startup-only (runs once after container wiring)
- Responsibilities: Validates that all `allowed_roles` on view functions are in the configured set
- Shutdown handling: None needed -- fails fast at startup if invalid
- Evidence: New hook in `app/__init__.py`

## 11) Security & Permissions

- Concern: Authorization enforcement -- ensuring read-only users cannot mutate data
- Touchpoints: `before_request_authentication` hook on `api_bp`, `check_authorization` function
- Mitigation: Method-based role inference provides defense-in-depth -- even if a developer forgets to annotate an endpoint, the HTTP method determines the minimum required role. `@allow_roles` provides per-endpoint overrides with validated role names.
- Residual risk: A developer could incorrectly mark a mutating POST endpoint with `@safe_query`, allowing a reader to execute it. This is mitigated by code review and the semantic clarity of the decorator name.
- Evidence: `app/api/oidc_hooks.py:30-105`, `app/utils/auth.py:134-164`

- Concern: Role hierarchy correctness -- admin must always imply editor and reader
- Touchpoints: `AuthService.expand_roles` method
- Mitigation: The hierarchy map is built deterministically from constructor arguments and is immutable. Tests verify the expansion.
- Residual risk: None -- the hierarchy is hardcoded and verified at startup.
- Evidence: `app/services/auth_service.py:45-55`

## 12) UX / UI Impact

- Entry point: All authenticated pages in the frontend
- Change: The frontend can read the OpenAPI spec to determine which endpoints require which role and hide/disable controls accordingly (e.g., hide "Add Part" button for reader-only users)
- User interaction: A reader-only user sees inventory data but cannot create, edit, or delete parts/boxes/kits. Attempting a restricted action returns 403.
- Dependencies: The frontend needs to handle 403 responses gracefully (show a "permission denied" message rather than a generic error). The OpenAPI spec `security` annotations provide the role map for proactive UI adaptation.
- Evidence: `app/utils/spectree_config.py`, change brief section 6

## 13) Deterministic Test Plan

- Surface: AuthService -- role hierarchy expansion
- Scenarios:
  - Given AuthService with read_role="reader", write_role="editor", admin_role="admin", When a token contains role "admin", Then `AuthContext.roles` contains {"admin", "editor", "reader"}
  - Given AuthService with read_role="reader", write_role="editor", admin_role="admin", When a token contains role "editor", Then `AuthContext.roles` contains {"editor", "reader"}
  - Given AuthService with read_role="reader", write_role="editor", admin_role="admin", When a token contains role "reader", Then `AuthContext.roles` contains {"reader"}
  - Given AuthService with read_role="reader", write_role="editor", admin_role=None, When a token contains role "editor", Then `AuthContext.roles` contains {"editor", "reader"}
  - Given AuthService with additional_roles=["pipeline"], When a token contains role "pipeline", Then `AuthContext.roles` contains {"pipeline"} (no expansion -- non-hierarchical)
  - Given AuthService with read_role="reader", When a token contains an unrecognized role "unknown", Then `AuthContext.roles` contains {"unknown"} (raw extraction preserved, enforcement is at the auth layer)
- Fixtures / hooks: `oidc_app` fixture from `conftest_infrastructure.py` with modified container wiring to pass role names; `generate_test_jwt` fixture for creating tokens with specific roles
- Gaps: None
- Evidence: `tests/conftest_infrastructure.py:428-493`

- Surface: Method-based role enforcement in before_request hook
- Scenarios:
  - Given OIDC enabled and user has "reader" role, When GET request to any /api endpoint, Then 200 (access granted)
  - Given OIDC enabled and user has "reader" role, When POST request to a non-safe-query /api endpoint, Then 403 (requires editor)
  - Given OIDC enabled and user has "editor" role, When POST request to any /api endpoint, Then 200 (access granted; editor implies reader)
  - Given OIDC enabled and user has "editor" role, When GET request to any /api endpoint, Then 200 (editor implies reader)
  - Given OIDC enabled and user has "admin" role, When any request to any /api endpoint, Then 200 (admin implies all)
  - Given OIDC disabled, When any request to any /api endpoint, Then 200 (no role enforcement)
  - Given OIDC enabled and user has no recognized role, When any request, Then 403
  - Given OIDC enabled and user has "reader" role, When HEAD request to a GET endpoint, Then 200 (HEAD is treated as a safe read-only method like GET)
- Fixtures / hooks: `oidc_app` / `oidc_client` fixtures; `generate_test_jwt` with specific roles
- Gaps: None
- Evidence: `tests/conftest_infrastructure.py:428-493`

- Surface: `@safe_query` decorator
- Scenarios:
  - Given OIDC enabled and user has "reader" role, When POST to `/api/parts/shopping-list-memberships/query`, Then 200 (safe_query requires only reader)
  - Given OIDC enabled and user has "reader" role, When POST to `/api/kits/shopping-list-memberships/query`, Then 200
  - Given OIDC enabled and user has "reader" role, When POST to `/api/kits/pick-list-memberships/query`, Then 200
  - Given OIDC enabled and user has "reader" role, When POST to a non-safe-query endpoint (e.g., create part), Then 403
- Fixtures / hooks: Same as above
- Gaps: None
- Evidence: `app/api/parts.py:345`, `app/api/kits.py:257,305`

- Surface: `@allow_roles` validation at startup
- Scenarios:
  - Given AuthService with configured_roles={"reader", "editor", "admin"}, When `@allow_roles("admin")` is present on a view function, Then startup succeeds
  - Given AuthService with configured_roles={"reader", "editor", "admin"}, When `@allow_roles("superadmin")` is present on a view function, Then startup raises ValueError
  - Given AuthService with admin_role=None, When `@allow_roles("admin")` is present, Then startup raises ValueError (admin not in configured set)
- Fixtures / hooks: Create a minimal Flask app with a test blueprint for isolation
- Gaps: None
- Evidence: `app/utils/auth.py:75-94`

- Surface: `@allow_roles` enforcement at runtime
- Scenarios:
  - Given OIDC enabled and endpoint has `@allow_roles("admin")` and user has "editor" role, Then 403 (editor does not include admin in the `allowed_roles` check -- this is an explicit override)
  - Given OIDC enabled and endpoint has `@allow_roles("admin")` and user has "admin" role, Then 200
  - Given OIDC enabled and endpoint has `@allow_roles("reader", "editor")` and user has "reader" role, Then 200
- Fixtures / hooks: Same as above; test blueprint with `@allow_roles` on a test endpoint
- Gaps: None
- Evidence: `app/utils/auth.py:75-94`

- Surface: Testing mode with test sessions
- Scenarios:
  - Given testing mode and test session has roles=["reader"], When GET to /api endpoint, Then 200
  - Given testing mode and test session has roles=["reader"], When POST to non-safe-query endpoint, Then 403
  - Given testing mode and test session has roles=["editor"], When POST to any endpoint, Then 200
- Fixtures / hooks: Test session creation via `TestingService.create_session` with specific roles
- Gaps: None
- Evidence: `app/api/oidc_hooks.py:70-88`

- Surface: OpenAPI security annotations
- Scenarios:
  - Given the app is fully started, When the OpenAPI spec is fetched, Then each /api operation has a `security` field
  - Given a GET endpoint, When spec is inspected, Then security indicates read_role
  - Given a POST endpoint without @safe_query, When spec is inspected, Then security indicates write_role
  - Given a POST endpoint with @safe_query, When spec is inspected, Then security indicates read_role
  - Given a @public endpoint, When spec is inspected, Then security is empty (no auth required)
- Fixtures / hooks: Standard `app` or `oidc_app` fixture; parse OpenAPI spec JSON
- Gaps: None
- Evidence: `app/utils/spectree_config.py`

## 14) Implementation Slices

- Slice: 1 -- AuthService role configuration and hierarchy expansion
- Goal: AuthService accepts role names and expands token roles before returning AuthContext.
- Touches: `app/services/auth_service.py`, `app/services/container.py`
- Dependencies: None; this is the foundation.

- Slice: 2 -- Method-based role inference and enforcement
- Goal: The before_request hook enforces roles based on HTTP method.
- Touches: `app/utils/auth.py` (check_authorization, authenticate_request, new safe_query decorator), `app/api/oidc_hooks.py`
- Dependencies: Slice 1 must be complete (AuthService knows its roles).

- Slice: 3 -- Apply @safe_query and constrain @allow_roles
- Goal: The 3 POST-as-query endpoints are marked safe_query; @allow_roles rejects unknown roles at startup.
- Touches: `app/api/parts.py`, `app/api/kits.py`, `app/utils/auth.py` (allow_roles validation), `app/__init__.py` (startup validation hook)
- Dependencies: Slice 2 (safe_query decorator exists).

- Slice: 4 -- OpenAPI security annotation
- Goal: The generated OpenAPI spec includes per-endpoint security information.
- Touches: `app/utils/spectree_config.py`, `app/__init__.py` (startup hook)
- Dependencies: Slices 1-3 (all role attributes are set on view functions).

- Slice: 5 -- Comprehensive tests
- Goal: All new behavior is covered by deterministic tests.
- Touches: `tests/test_role_based_access.py` (new file)
- Dependencies: Slices 1-4 (all code is in place).

## 15) Risks & Open Questions

- Risk: Existing test sessions (Playwright) that don't specify roles will be rejected with 403 when OIDC-like enforcement is enabled in testing mode
- Impact: Could break existing Playwright tests until they are updated to include roles in test sessions
- Mitigation: When `is_testing` is True and OIDC is not enabled (`oidc_enabled=False`), role enforcement is skipped entirely (existing behavior). Playwright tests that create test sessions should include `roles: ["admin"]` to get full access. Document this in the test infrastructure.

- Risk: The OpenAPI spec post-processing may break if Spectree changes its internal spec format
- Impact: The security annotations in the spec would be missing or malformed
- Mitigation: Pin Spectree version; test the spec output in the test suite

- Risk: `@allow_roles` validation at startup may surface unexpected usage if any endpoint is annotated with roles not in the configured set
- Impact: Application fails to start
- Mitigation: The validation runs early with a clear error message pointing to the offending endpoint. Currently no endpoints use `@allow_roles`, so no existing code would be affected.

All open questions have been resolved autonomously based on the codebase analysis. No blocking questions remain.

## 16) Confidence

Confidence: High -- The change is well-scoped, touches a small number of files with clear boundaries, follows established patterns (decorator attribute stamping, before_request hook), requires no database changes, and has a comprehensive test plan.
