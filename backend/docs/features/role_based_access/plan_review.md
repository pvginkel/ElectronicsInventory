# Plan Review: Role-Based Access Control

## 1) Summary & Decision

**Readiness**

The plan is well-structured, correctly identifies all touchpoints, and demonstrates solid understanding of the existing auth infrastructure. The core design -- method-based role inference with hierarchy expansion and `@safe_query` -- is sound and minimal. The plan has been updated to address all conditions from the initial review: (1) `authenticate_request` is now explicitly listed in the file map and contracts with its two internal `check_authorization` call sites; (2) the OpenAPI annotation mechanism is fully specified including the lazy generation timing, in-place `_spec` mutation, and error-resilience wrapper; (3) HEAD requests are now handled alongside GET in the method-based inference algorithm.

**Decision**

`GO` -- All major findings from the initial review have been incorporated into the plan. The remaining risks (Spectree internal API stability, test session role requirements) are minor and have documented mitigations.

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `CLAUDE.md` (layering) -- Pass -- `plan.md:88-152` -- All changes respect the API -> Service -> Utils layering. Role logic stays in `AuthService` and `auth.py`; no business logic leaks into the API layer.
- `CLAUDE.md` (no database changes) -- Pass -- `plan.md:59` -- Explicit "no database schema changes" statement; confirmed by the plan's file map.
- `CLAUDE.md` (BFF pattern / no backwards compat) -- Pass -- `plan.md:167` -- Plan states "Direct change to constructor; no backwards compatibility needed."
- `CLAUDE.md` (testing requirements) -- Pass -- `plan.md:407-481` -- Comprehensive test plan with Given/When/Then scenarios for every new surface, including HEAD requests.
- `CLAUDE.md` (metrics / observability) -- Pass -- `plan.md:360-369` -- Plan explicitly reuses existing `AUTH_VALIDATION_TOTAL` and justifies no new metrics.
- `CLAUDE.md` (error handling / fail fast) -- Pass -- `plan.md:328-358` -- Startup validation for `@allow_roles` fails fast with `ValueError`.
- `docs/product_brief.md` -- Pass -- Product brief describes a single-user hobby app. Role-based access is an infrastructure concern outside the product brief scope but does not conflict with it.
- `docs/commands/plan_feature.md` (all sections present) -- Pass -- All 16 required sections are present and populated.

**Fit with codebase**

- `app/utils/auth.py:authenticate_request` -- `plan.md:114-116,188-200` -- Now explicitly documented. Both call sites at lines 198 and 249 are accounted for in the contracts and file map.
- `app/services/container.py:202-205` -- `plan.md:106-108` -- Straightforward provider update. The plan correctly notes the singleton provider.
- `app/api/oidc_hooks.py:70-88` (test session path) -- `plan.md:126-128,185-186` -- Both the test-session path (line 84) and the OIDC path (line 98) are now called out as needing updates.
- `app/utils/spectree_config.py:38` -- `plan.md:282-295` -- The OpenAPI annotation mechanism is now fully specified: SecurityScheme definition, forced spec generation timing, in-place `_spec` mutation, and error-resilience wrapping.

## 3) Open Questions & Ambiguities

- Question: When OIDC is disabled, does the startup `@allow_roles` validation still run?
- Why it matters: If the validation only runs when OIDC is enabled, typos in `@allow_roles` decorators would not be caught in development environments where OIDC is typically disabled. Running the validation unconditionally catches configuration errors early regardless of OIDC state.
- Needed answer: Confirm that the startup validation runs regardless of OIDC state. The `AuthService` singleton is always constructed (it handles OIDC-disabled gracefully at `auth_service.py:97-98`), so `configured_roles` should always be available.

## 4) Deterministic Backend Coverage (new/changed behavior only)

- Behavior: `AuthService.expand_roles` (role hierarchy expansion)
- Scenarios:
  - Given admin role in token, When expand_roles called, Then roles contain {admin, editor, reader} (`tests/test_role_based_access.py::test_expand_admin`)
  - Given editor role in token, When expand_roles called, Then roles contain {editor, reader} (`tests/test_role_based_access.py::test_expand_editor`)
  - Given reader role in token, When expand_roles called, Then roles contain {reader} (`tests/test_role_based_access.py::test_expand_reader`)
  - Given additional non-hierarchical role "pipeline", When expand_roles called, Then roles contain only {pipeline} (`tests/test_role_based_access.py::test_expand_additional`)
  - Given admin_role=None, When expand_roles called with editor, Then roles contain {editor, reader} (`tests/test_role_based_access.py::test_expand_no_admin`)
- Instrumentation: Existing `AUTH_VALIDATION_TOTAL` covers validation; no new metrics needed.
- Persistence hooks: None (in-memory only).
- Gaps: None.
- Evidence: `plan.md:409-419`

- Behavior: Method-based role enforcement (before_request hook)
- Scenarios:
  - Given reader role + GET request, Then 200 (`tests/test_role_based_access.py::test_reader_get_allowed`)
  - Given reader role + POST request (non-safe-query), Then 403 (`tests/test_role_based_access.py::test_reader_post_denied`)
  - Given editor role + POST request, Then 200 (`tests/test_role_based_access.py::test_editor_post_allowed`)
  - Given admin role + any request, Then 200 (`tests/test_role_based_access.py::test_admin_all_allowed`)
  - Given OIDC disabled + any request, Then 200 (`tests/test_role_based_access.py::test_oidc_disabled_no_enforcement`)
  - Given no recognized role, Then 403 (`tests/test_role_based_access.py::test_no_role_denied`)
  - Given reader role + HEAD request, Then 200 (`tests/test_role_based_access.py::test_reader_head_allowed`)
- Instrumentation: Existing `AUTH_VALIDATION_TOTAL` and `AuthorizationException` error handler.
- Persistence hooks: DI wiring update in `container.py`.
- Gaps: None.
- Evidence: `plan.md:421-433`

- Behavior: `@safe_query` decorator on 3 POST endpoints
- Scenarios:
  - Given reader role + POST to each safe_query endpoint, Then 200 (`tests/test_role_based_access.py::test_safe_query_*`)
  - Given reader role + POST to non-safe-query endpoint, Then 403 (`tests/test_role_based_access.py::test_reader_non_safe_post_denied`)
- Instrumentation: None new.
- Persistence hooks: None.
- Gaps: None.
- Evidence: `plan.md:435-443`

- Behavior: `@allow_roles` startup validation
- Scenarios:
  - Given valid role names, Then startup succeeds (`tests/test_role_based_access.py::test_allow_roles_valid`)
  - Given unknown role name, Then startup raises ValueError (`tests/test_role_based_access.py::test_allow_roles_invalid`)
  - Given admin_role=None and @allow_roles("admin"), Then startup raises ValueError (`tests/test_role_based_access.py::test_allow_roles_admin_none`)
- Instrumentation: None.
- Persistence hooks: None.
- Gaps: None.
- Evidence: `plan.md:445-452`

- Behavior: OpenAPI security annotations
- Scenarios:
  - Given fully started app, When OpenAPI spec fetched, Then each /api operation has security field (`tests/test_role_based_access.py::test_openapi_security`)
  - Given GET endpoint, Then security indicates read_role with `x-required-role` vendor extension (`tests/test_role_based_access.py::test_openapi_get_role`)
  - Given POST endpoint without @safe_query, Then security indicates write_role (`tests/test_role_based_access.py::test_openapi_post_role`)
  - Given @public endpoint, Then security is empty (`tests/test_role_based_access.py::test_openapi_public`)
- Instrumentation: None.
- Persistence hooks: None.
- Gaps: None. The mechanism (force `api.spec`, mutate `_spec` in place) is now fully specified in the plan.
- Evidence: `plan.md:472-481`

## 5) Adversarial Sweep

**Minor -- `@allow_roles` interaction with method-based inference may confuse developers**

**Evidence:** `plan.md:261` -- Step 2 now explicitly states "`@allow_roles` is a complete override of method-based inference, not an additive constraint." This is correct behavior, but the clarifying note is only in the algorithm section.

**Why it matters:** A developer might still use `@allow_roles("editor")` on a GET endpoint thinking it adds a stricter requirement, when in fact it replaces the method-based check entirely. The docstring for `@allow_roles` should echo this override semantics.

**Fix suggestion:** Ensure the implementation adds a clear docstring on `@allow_roles` stating that it replaces method-based inference entirely. This is a documentation concern, not a plan change.

**Confidence:** Low

---

- Checks attempted: authenticate_request call-site threading, HEAD method handling, OpenAPI spec timing, test-session role enforcement, Spectree internal API stability, @allow_roles override semantics
- Evidence: `plan.md:114-116` (authenticate_request now listed), `plan.md:263` (HEAD handled), `plan.md:282-295` (OpenAPI mechanism specified), `plan.md:354-358` (test session behavior documented)
- Why the plan holds: All major issues from the initial review have been addressed. The remaining finding is a documentation concern, not a design issue.

## 6) Derived-Value & Persistence Invariants

- Derived value: Expanded role set on `AuthContext`
  - Source dataset: Raw roles from JWT `realm_access.roles` and `resource_access.<audience>.roles` (unfiltered -- all roles from token are extracted)
  - Write / cleanup triggered: None; in-memory only for request duration
  - Guards: Expansion only runs when OIDC is enabled; hierarchy map is immutable after `AuthService` construction
  - Invariant: A user with the admin role must always have {admin, editor, reader} in their expanded set; a user with editor must always have {editor, reader}
  - Evidence: `plan.md:299-304`

- Derived value: Effective required role per endpoint
  - Source dataset: HTTP method (`request.method`), `is_safe_query` attribute, `allowed_roles` attribute on view function
  - Write / cleanup triggered: None; computed per-request
  - Guards: `is_public` endpoints bypass role checking entirely; OIDC-disabled mode skips enforcement; HEAD is treated as GET
  - Invariant: GET and HEAD endpoints always require read_role unless overridden by `@allow_roles`; non-GET/HEAD endpoints always require write_role unless overridden by `@safe_query` or `@allow_roles`
  - Evidence: `plan.md:306-311`

- Derived value: Configured roles set on `AuthService`
  - Source dataset: Constructor arguments `read_role`, `write_role`, `admin_role`, `additional_roles`
  - Write / cleanup triggered: Used for `@allow_roles` startup validation (fail-fast)
  - Guards: `admin_role` may be None (excluded from set); `read_role` and `write_role` are always included
  - Invariant: The configured set is immutable after construction and always includes at least `read_role` and `write_role`
  - Evidence: `plan.md:313-318`

- Derived value: OpenAPI per-operation security annotation
  - Source dataset: `app.view_functions` and `app.url_map.iter_rules()` iterated at startup
  - Write / cleanup triggered: In-place mutation of cached `api._spec` dict
  - Guards: Only runs once at startup after all blueprints are registered; wrapped in try/except for resilience; endpoints outside `api_bp` are excluded
  - Invariant: Every non-public `/api/*` operation in the OpenAPI spec must have a `security` field and `x-required-role` extension matching the runtime enforcement
  - Evidence: `plan.md:282-295`

## 7) Risks & Mitigations (top 3)

- Risk: The OpenAPI spec post-processing relies on Spectree internals (`_spec` dict structure, lazy generation timing) that could break on Spectree version upgrades.
- Mitigation: Pin the Spectree version; wrap annotation in try/except with warning log; test the spec structure in the test suite.
- Evidence: `plan.md:294`, `plan.md:516-518`

- Risk: Existing test sessions (Playwright) that don't specify roles will be rejected with 403 when role enforcement is active in testing mode.
- Mitigation: When OIDC is disabled (the common test/dev case), role enforcement is skipped entirely. Only test sessions created with OIDC enabled need roles. Document that Playwright test sessions should include `roles: ["admin"]`.
- Evidence: `plan.md:512-514`

- Risk: The `@allow_roles` override semantics may confuse developers who expect it to add constraints on top of method-based inference.
- Mitigation: Clear docstrings on `@allow_roles` and the clarifying note already in the algorithm (plan.md:261). Code review should catch misuse.
- Evidence: `plan.md:261`

## 8) Confidence

Confidence: High -- All conditions from the initial review have been resolved. The plan is implementation-ready with clear contracts, comprehensive test scenarios, and well-documented mechanisms for the OpenAPI annotation and method-based inference.
