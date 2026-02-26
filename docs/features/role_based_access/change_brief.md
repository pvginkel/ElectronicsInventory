# Change Brief: Role-Based Access Control

## Summary

Add method-based role enforcement to the OIDC authentication layer so that a user with only a "reader" role can view inventory data but cannot modify it. Write endpoints (POST/PUT/PATCH/DELETE) require the "editor" role; GET endpoints require the "reader" role. An optional "admin" role sits above "editor" in the hierarchy (admin implies editor implies reader).

## Key Design Decisions

1. **Configuration is in code, not environment variables.** The three hierarchical roles (`read_role`, `write_role`, `admin_role`) are passed as constructor arguments to `AuthService` and wired in `container.py`. They are not user-overridable from the environment — the application defines them. An `additional_roles` list supports app-specific non-hierarchical roles (e.g., IoTSupport's "pipeline" role for CI/CD).

2. **Method-based inference, not per-endpoint annotation.** GET requests require `read_role`; all other HTTP methods require `write_role`. This eliminates the need to annotate ~50 write endpoints. The only decorator needed is `@safe_query` for POST endpoints that are actually read-only queries (3 endpoints identified).

3. **`@allow_roles` is constrained.** It may only reference roles from the configured set (read_role, write_role, admin_role, or additional_roles). This prevents typos and drift.

4. **Role hierarchy.** `admin` implies `editor` implies `reader`. The IdP assigns a single role (e.g., "editor"); the auth layer expands it to include all implied roles. No expectation that the IdP issues multiple roles.

5. **Blanket 403 when role resolves to None.** If OIDC is enabled and the resolved required role is None (i.e., the role is not configured), reject with 403. A user who got a token but has no recognized role should not have access.

6. **OpenAPI automation.** A startup hook reads the effective role for each endpoint and sets the `security` attribute on the view function so Spectree includes it in the generated OpenAPI spec. The frontend can parse the spec to determine which controls to show/hide.

7. **`@safe_query` decorator.** Marks POST endpoints that don't mutate state, overriding the method-based inference to require only the read role. Applied to the 3 existing POST-as-query endpoints.
