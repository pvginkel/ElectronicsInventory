# Plan Execution Report: Role-Based Access Control

## Status

**DONE** — The plan was implemented successfully. All requirements verified, all tests pass, all static checks clean.

## Summary

Implemented method-based role enforcement for the OIDC authentication layer. GET/HEAD requests require the `reader` role; all other HTTP methods require `editor`. An `admin` role sits above both in the hierarchy (admin implies editor implies reader). The role configuration is wired as constructor arguments to `AuthService` in `container.py` — not as environment variables.

Key deliverables:
- **AuthService** extended with role hierarchy expansion and method-based role resolution
- **`@safe_query`** decorator for 3 POST-as-query endpoints
- **`@allow_roles`** validation at startup against configured roles
- **Blanket 403** when OIDC enabled and user has no recognized role
- **OpenAPI role map** (`app.openapi_role_map`) populated at startup for frontend consumption
- **71 tests** across 15 test classes covering all new behavior

## Code Review Summary

- **Decision:** GO
- **Blockers:** 0
- **Major:** 0
- **Minor:** 2 (both resolved)
  1. OpenAPI path conversion only handled 3 converter types — resolved by switching to regex-based conversion
  2. OpenAPI test assertions were conditional (could pass vacuously) — resolved by rewriting tests to use `app.openapi_role_map` with explicit assertions

### Additional fix during review resolution

During resolution of Finding #2, discovered a pre-existing Spectree limitation: when multiple `create_app()` calls occur (test fixtures), Spectree-decorated view functions carry `_decorator` pointing to a prior `SpecTree` instance, making the new instance's spec incomplete. Resolved by decoupling the role map computation from Spectree's spec generation — `annotate_openapi_security` now builds the role map independently via Flask's `url_map`, then injects into the Spectree spec on a best-effort basis.

## Verification Results

```
$ poetry run ruff check .
All checks passed!

$ poetry run mypy .
Success: no issues found in 276 source files

$ poetry run vulture app/ vulture_whitelist.py --min-confidence 80
(no output — clean)

$ poetry run pytest
1123 passed, 4 skipped, 5 deselected in 154.90s
```

## Files Changed

| File | Change |
|------|--------|
| `app/services/auth_service.py` | Role config, hierarchy expansion, role resolution |
| `app/services/container.py` | Wired role names to AuthService |
| `app/utils/auth.py` | `@safe_query`, updated `check_authorization`, `@allow_roles` validation |
| `app/api/oidc_hooks.py` | Updated before_request hook to pass auth_service and method |
| `app/api/parts.py` | `@safe_query` on 1 endpoint |
| `app/api/kits.py` | `@safe_query` on 2 endpoints |
| `app/utils/spectree_config.py` | Security scheme, `annotate_openapi_security` with role map |
| `app/__init__.py` | Startup hooks for validation and annotation |
| `tests/test_role_based_access.py` | 71 tests (new file) |

## Outstanding Work & Suggested Improvements

No outstanding work required.
