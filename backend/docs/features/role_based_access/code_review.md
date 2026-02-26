# Code Review: Role-Based Access Control

## 1) Summary & Decision

**Readiness**

The implementation is well-structured, closely follows the approved plan, and passes all quality gates (ruff, mypy, vulture, and the full 1123-test suite with zero regressions). The 71 new tests provide thorough coverage of the role hierarchy, method-based inference, `@safe_query`, `@allow_roles` validation, testing-mode role enforcement, OIDC integration, OpenAPI annotation, and edge cases. The code respects the project's layering conventions (AuthService owns role logic, `check_authorization` in utils handles enforcement, the `before_request` hook stays thin). No database changes are needed, and no existing behavior is broken. Two minor findings and one style observation are noted below, none of which block shipping.

**Decision**

`GO` -- The implementation is correct, comprehensive, well-tested, and conforms to the plan and project guidelines.

## 2) Conformance to Plan (with evidence)

**Plan alignment**

- `Plan Section 2: AuthService constructor` -- `app/services/auth_service.py:62-68` adds `read_role`, `write_role`, `admin_role`, `additional_roles` constructor arguments with documented defaults, exactly as specified.
- `Plan Section 2: role hierarchy expansion` -- `app/services/auth_service.py:98-104` precomputes `_hierarchy_map` at construction; `expand_roles` at line 145 applies it. Token validation at line 282 calls `expand_roles` after `_extract_roles`, matching the plan.
- `Plan Section 2: resolve_required_role` -- `app/services/auth_service.py:168-202` implements the four-step resolution order (allow_roles override, safe_query, GET/HEAD, other methods) as planned.
- `Plan Section 2: container wiring` -- `app/services/container.py:202-209` wires `read_role="reader"`, `write_role="editor"`, `admin_role="admin"`, `additional_roles=[]` as constructor arguments, matching the plan.
- `Plan Section 2: check_authorization` -- `app/utils/auth.py:152-204` replaces the old any-authenticated-passes logic with method-based role inference using `auth_service.resolve_required_role`, including the blanket 403 path.
- `Plan Section 2: authenticate_request` -- `app/utils/auth.py:207-298` threads the new `http_method` parameter through both `check_authorization` call sites (lines 240 and 291).
- `Plan Section 2: @safe_query decorator` -- `app/utils/auth.py:75-90` implements the decorator; applied to three endpoints at `app/api/parts.py:355`, `app/api/kits.py:267`, `app/api/kits.py:316`.
- `Plan Section 2: @allow_roles validation` -- `app/utils/auth.py:365-388` implements `validate_allow_roles_at_startup`; called from `app/__init__.py:217-219` when OIDC is enabled.
- `Plan Section 2: OpenAPI annotation` -- `app/utils/spectree_config.py:72-151` implements `annotate_openapi_security`; called from `app/__init__.py:221-223`.
- `Plan Section 2: OIDC hooks` -- `app/api/oidc_hooks.py:76-77` expands test-session roles through hierarchy; lines 86 and 100 pass `auth_service` and `request.method` to the updated authorization functions.

**Gaps / deviations**

- `Plan commitment: Comprehensive tests (73 tests)` -- The test file contains 71 tests, not 73. Two scenarios from the plan appear to be consolidated into other tests rather than omitted. This is acceptable; coverage is thorough. (`tests/test_role_based_access.py`)
- No other gaps or deviations from the plan were identified.

## 3) Correctness -- Findings (ranked)

- Title: `Minor -- OpenAPI annotation silently skips routes it cannot path-match`
- Evidence: `app/utils/spectree_config.py:112-116` -- The path conversion handles `<int:arg>`, `<string:arg>`, and `<arg>` but not all Flask converter types (e.g., `<float:arg>`, `<path:arg>`, or custom converters).
- Impact: If a future route uses a non-standard converter, the annotation would silently skip it. Currently no such routes exist in the codebase, so this has zero impact today.
- Fix: No action needed now. If a new converter type is introduced later, extend the replacement list. The best-effort nature of the function (wrapped in try/except) means it would gracefully degrade.
- Confidence: Low (theoretical, no current impact)

- Title: `Minor -- OpenAPI annotation tests use conditional assertions`
- Evidence: `tests/test_role_based_access.py:763-767` (TestOpenApiSecurityAnnotations) -- Tests like `test_get_endpoint_has_security` guard their assertions with `if types_path and "get" in types_path:`, which means the test passes even if the path is missing from the spec.
- Impact: If the Spectree spec output structure changes (e.g., different path format), the test would pass vacuously rather than catching the regression.
- Fix: Replace the `if` guard with an explicit `assert types_path is not None` and `assert "get" in types_path` to fail fast if the spec structure is unexpected. Example:
  ```python
  types_path = spec.get("paths", {}).get("/api/types")
  assert types_path is not None, "Expected /api/types in spec paths"
  assert "get" in types_path
  get_op = types_path["get"]
  assert "security" in get_op
  assert get_op["x-required-role"] == "reader"
  ```
- Confidence: High

## 4) Over-Engineering & Refactoring Opportunities

No over-engineering was identified. The implementation is lean:

- `resolve_required_role` is a clean 15-line method with a well-documented resolution order.
- The hierarchy map is precomputed once at construction (3 dict entries) rather than recomputed per request.
- `annotate_openapi_security` is properly isolated as a standalone function rather than being embedded in `create_app`.
- `validate_allow_roles_at_startup` is appropriately simple (iterates view functions, checks set difference).

The code follows the project's existing patterns without introducing unnecessary abstractions.

## 5) Style & Consistency

- Pattern: `@safe_query` decorator placement differs from `@public` decorator placement
- Evidence: In `app/api/auth.py:42-43`, `@public` is placed **before** `@api.validate`. In `app/api/kits.py:266-267` and `app/api/parts.py:354-355`, `@safe_query` is placed **after** `@api.validate`.
- Impact: Both orderings work because Spectree uses `functools.wraps`, which propagates `__dict__` from the inner function. However, the inconsistency could confuse future developers about the correct placement convention.
- Recommendation: This is purely cosmetic and does not affect behavior. If consistency is desired in the future, adopt a single convention (e.g., always place attribute-stamping decorators before `@api.validate`). Not worth changing now since the tests confirm correctness.

## 6) Tests & Deterministic Coverage (new/changed behavior only)

- Surface: AuthService -- configured_roles, expand_roles, resolve_required_role
- Scenarios:
  - Given default roles, configured_roles returns {reader, editor, admin} (`tests/test_role_based_access.py::TestConfiguredRoles::test_default_roles`)
  - Given admin_role=None, configured_roles excludes admin (`TestConfiguredRoles::test_no_admin_role`)
  - Given additional_roles, they are included (`TestConfiguredRoles::test_additional_roles`)
  - Given admin role, expand to {admin, editor, reader} (`TestExpandRoles::test_admin_expands_to_all`)
  - Given editor role, expand to {editor, reader} (`TestExpandRoles::test_editor_expands_to_editor_and_reader`)
  - Given unknown role, pass through unchanged (`TestExpandRoles::test_unknown_role_passed_through`)
  - Given empty roles, return empty set (`TestExpandRoles::test_empty_roles`)
  - Given GET method, resolve to reader (`TestResolveRequiredRole::test_get_requires_read_role`)
  - Given POST method, resolve to editor (`TestResolveRequiredRole::test_post_requires_write_role`)
  - Given @safe_query, POST resolves to reader (`TestResolveRequiredRole::test_safe_query_overrides_post`)
  - Given @allow_roles, override all method inference (`TestResolveRequiredRole::test_allow_roles_overrides_everything`)
- Hooks: `_make_auth_service` helper creates AuthService with minimal config; `_make_view_func` builds fake view functions with decorator attributes
- Gaps: None identified
- Evidence: `tests/test_role_based_access.py:89-208`

- Surface: check_authorization -- unit-level enforcement
- Scenarios:
  - Reader can GET, cannot POST (`TestCheckAuthorization::test_reader_can_get`, `test_reader_cannot_post`)
  - Editor can GET and POST (`test_editor_can_post`, `test_editor_can_get`)
  - Admin passes all methods (`test_admin_can_do_anything`)
  - @safe_query allows reader on POST (`test_safe_query_allows_reader_on_post`)
  - Unrecognized role yields blanket 403 (`test_unrecognized_role_blanket_403`)
  - Empty roles yield blanket 403 (`test_empty_roles_blanket_403`)
  - @allow_roles admin-only rejects editor, allows admin (`test_allow_roles_admin_only_rejects_editor`, `test_allow_roles_admin_only_allows_admin`)
- Hooks: Same helpers as above
- Gaps: None
- Evidence: `tests/test_role_based_access.py:215-293`

- Surface: Integration -- OIDC before_request hook method-based enforcement
- Scenarios:
  - Reader with bearer token can GET, cannot POST (`TestMethodBasedRoleEnforcement::test_reader_can_get`, `test_reader_cannot_post`)
  - Editor can GET and POST (`test_editor_can_get`, `test_editor_can_post`)
  - Admin can do everything (`test_admin_can_do_everything`)
  - Unrecognized role returns 403 with error message (`test_no_recognized_role_returns_403`)
  - No token returns 401 (`test_no_token_returns_401`)
  - Empty roles return 403 (`test_empty_roles_returns_403`)
- Hooks: `oidc_role_app` fixture creates OIDC-enabled app with mocked JWKS; `generate_test_jwt` creates tokens with specific roles
- Gaps: None
- Evidence: `tests/test_role_based_access.py:460-548`

- Surface: @safe_query endpoint integration
- Scenarios:
  - Reader can POST to all three safe_query endpoints (`TestSafeQueryEndpoints::test_reader_can_query_*`)
  - Reader cannot POST to non-safe-query endpoints (`test_reader_cannot_post_to_non_safe_query`)
- Hooks: Same OIDC fixtures
- Gaps: None
- Evidence: `tests/test_role_based_access.py:550-596`

- Surface: Testing mode with test sessions
- Scenarios:
  - Reader session can GET, cannot POST (`TestTestingModeRoleEnforcement::test_reader_session_can_get`, `test_reader_session_cannot_post`)
  - Editor session can POST (`test_editor_session_can_post`)
  - Admin session has full access (`test_admin_session_can_do_anything`)
  - Empty-role session gets 403 (`test_no_role_session_gets_403`)
  - Reader session can use @safe_query (`test_reader_session_can_use_safe_query`)
- Hooks: Standard `app`/`client` fixtures with `testing_service.create_session`
- Gaps: None
- Evidence: `tests/test_role_based_access.py:604-682`

- Surface: OpenAPI security annotations
- Scenarios:
  - GET endpoint has security with reader role (`TestOpenApiSecurityAnnotations::test_get_endpoint_has_security`)
  - POST endpoint has security with editor role (`test_post_endpoint_has_write_role`)
  - @safe_query POST has security with reader role (`test_safe_query_endpoint_has_read_role`)
  - BearerAuth security scheme is defined (`test_security_scheme_defined`)
  - Public endpoint has no security (`test_public_endpoint_has_no_security`)
- Hooks: Standard `app` fixture
- Gaps: Conditional assertions (see Finding #2 in Section 3)
- Evidence: `tests/test_role_based_access.py:754-813`

- Surface: Additional coverage
- Scenarios:
  - HEAD treated as GET (`TestHeadRequestHandling::test_reader_can_head`)
  - OIDC disabled = no enforcement (`TestOidcDisabledNoRoleEnforcement`)
  - validate_token returns expanded roles (`TestValidateTokenHierarchyExpansion`)
  - @allow_roles startup validation (`TestValidateAllowRolesAtStartup`)
  - Edge cases: multiple roles, case sensitivity, idempotent expansion (`TestEdgeCases`)
- Hooks: Mixture of unit helpers and integration fixtures
- Gaps: None
- Evidence: `tests/test_role_based_access.py:820-869`

## 7) Adversarial Sweep

- Checks attempted: Decorator attribute propagation through Spectree wrapper, Flask view function resolution, `@safe_query` ordering, OIDC bypass via testing mode
- Evidence: `app/api/kits.py:266-267` -- `@safe_query` placed after `@api.validate`; `app/api/oidc_hooks.py:62` -- `actual_func = current_app.view_functions.get(endpoint)`; Spectree's `validate()` confirmed to use `functools.wraps` which copies `__dict__` from inner function
- Why code held up: Spectree uses `functools.wraps`, so attributes like `is_safe_query` and `is_public` propagate to the outermost wrapper that Flask stores as the view function. The integration tests at `TestSafeQueryEndpoints` confirm this empirically (all three safe_query endpoints allow reader POST access). The OIDC bypass path (testing mode) correctly expands roles through the hierarchy at `app/api/oidc_hooks.py:77` before calling `check_authorization`.

- Checks attempted: Missing `resolve_required_role` returning None in production configuration
- Evidence: `app/services/auth_service.py:168-202` -- The method always returns `self.read_role` or `self.write_role` (both guaranteed non-None by constructor), or `allowed_roles` set (guaranteed non-empty by the check at line 192), or `self.read_role` for safe_query. The only way to get None would be if the method returns an unreachable code path.
- Why code held up: The `resolve_required_role` method has no code path that returns None. The `| None` in the return type annotation is defensive typing for theoretical future cases. The guard at `app/utils/auth.py:181-183` provides a safety net.

- Checks attempted: Race condition on singleton AuthService role configuration mutation
- Evidence: `app/services/auth_service.py:86-104` -- `_configured_roles` and `_hierarchy_map` are built once in `__init__` and never mutated afterward. `expand_roles` and `resolve_required_role` are pure functions of their inputs and the immutable maps.
- Why code held up: AuthService is a singleton with immutable role configuration. All role resolution is stateless and thread-safe.

- Checks attempted: `validate_allow_roles_at_startup` skipped when OIDC is disabled
- Evidence: `app/__init__.py:217` -- `if settings.oidc_enabled:` gates the startup validation call. When OIDC is disabled, `@allow_roles` decorators are not validated.
- Why code held up: When OIDC is disabled, the `before_request` hook at `app/api/oidc_hooks.py:93-95` returns early with "OIDC disabled - skipping authentication", so `@allow_roles` annotations are inert. There is no correctness risk because the roles are never checked at runtime. If a developer enables OIDC later, the validation will run and catch any typos.

## 8) Invariants Checklist

- Invariant: Admin role always implies editor and reader roles in the expanded set
  - Where enforced: `app/services/auth_service.py:103-104` -- `self._hierarchy_map[admin_role] = {admin_role, write_role, read_role}`
  - Failure mode: If the hierarchy map is mutated after construction, admin could lose implied roles
  - Protection: The map is built once in `__init__` and is a regular dict (no external mutators); `TestExpandRoles::test_admin_expands_to_all` verifies the invariant
  - Evidence: `tests/test_role_based_access.py:117-119`

- Invariant: Every authenticated, non-public /api request must pass role authorization
  - Where enforced: `app/api/oidc_hooks.py:65-67` (public skip), `app/api/oidc_hooks.py:86` (test session path), `app/api/oidc_hooks.py:100` (OIDC path) -- all paths either skip (public/OIDC-disabled) or call `check_authorization`
  - Failure mode: If a new code path is added to the hook that returns early without calling `check_authorization`
  - Protection: The hook structure is straightforward with only three exit paths (public, test-session, OIDC). Integration tests at `TestMethodBasedRoleEnforcement` and `TestTestingModeRoleEnforcement` verify enforcement.
  - Evidence: `tests/test_role_based_access.py:460-682`

- Invariant: @allow_roles only accepts roles from the configured set (startup validation)
  - Where enforced: `app/utils/auth.py:365-388` -- `validate_allow_roles_at_startup` iterates all view functions and raises ValueError on unknown roles
  - Failure mode: If the validation is called before all blueprints are registered, some endpoints could be missed
  - Protection: The call at `app/__init__.py:217-219` is placed after all blueprint registrations (lines 170-213), ensuring all view functions are visible. `TestValidateAllowRolesAtStartup` verifies both valid and invalid cases.
  - Evidence: `tests/test_role_based_access.py:337-389`

- Invariant: OpenAPI spec includes security annotations for all non-public /api endpoints
  - Where enforced: `app/utils/spectree_config.py:97-143` -- iterates all url_map rules starting with `/api/`, skips public endpoints, annotates all others
  - Failure mode: If a route uses a path converter not handled by the replacement logic, or if the Spectree spec structure changes
  - Protection: Best-effort with try/except wrapper; `TestOpenApiSecurityAnnotations` verifies key endpoints. The function logs a warning on failure rather than crashing.
  - Evidence: `tests/test_role_based_access.py:754-813`

## 9) Questions / Needs-Info

No blocking questions. All design decisions in the plan have been implemented as specified, and the test suite confirms correct behavior across all paths.

## 10) Risks & Mitigations (top 3)

- Risk: OpenAPI annotation tests use conditional assertions that could pass vacuously if spec structure changes
- Mitigation: Convert the `if path and method in path:` guards to explicit assertions (see Section 3, Finding #2). This is a low-priority improvement.
- Evidence: `tests/test_role_based_access.py:763-767`

- Risk: Future route converters (e.g., `<float:arg>`, `<path:arg>`) would not be path-matched in OpenAPI annotation
- Mitigation: The function is best-effort and logs a warning on failure. Add new converter types to the replacement list when they are introduced.
- Evidence: `app/utils/spectree_config.py:112-116`

- Risk: Existing Playwright/E2E test sessions that do not specify roles could break when testing mode is combined with OIDC-enabled settings
- Mitigation: As noted in the plan, the standard test fixture (`app`) uses `oidc_enabled=False` (`tests/conftest_infrastructure.py:144`), so existing tests are unaffected. Playwright tests that create test sessions should include `roles: ["admin"]` for full access, which is already the pattern used in the new test file.
- Evidence: `tests/conftest_infrastructure.py:144`, `tests/test_role_based_access.py:614-618`

## 11) Confidence

Confidence: High -- The implementation is clean, well-tested (71 tests, 0 regressions in the full 1123-test suite), passes all static analysis tools, and closely follows the approved plan with no meaningful gaps.
