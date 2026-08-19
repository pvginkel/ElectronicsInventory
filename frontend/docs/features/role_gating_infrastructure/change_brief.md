# Change Brief: Role Gating Infrastructure

## Summary

Implement frontend infrastructure for role-based UI gating, driven automatically from the OpenAPI spec's `x-required-role` annotations.

## What needs to be built

1. **Generator script** that reads `openapi-cache/openapi.json` and produces:
   - `src/lib/api/generated/roles.ts` — named role constants (e.g., `deletePartsByPartKeyRole = "editor" as const`) and a `RequiredRole` union type. Only generates constants for endpoints whose `x-required-role` differs from the `x-auth-roles.read` value in the spec (i.e., skips reader-level endpoints since every authenticated user is a reader).
   - `src/lib/api/generated/role-map.json` — a mapping from mutation hook names to their corresponding role constant names, consumed by the ESLint rule.

2. **`Gate` component** (`src/components/auth/gate.tsx`) that:
   - Accepts a `requires` prop (single `RequiredRole` or array of them).
   - Does a flat `user.roles.includes()` check against the authenticated user's roles (no hierarchy encoding — the backend provides the full role list).
   - Supports an optional `fallback` prop for rendering a disabled alternative instead of hiding children entirely.

3. **`usePermissions` hook** (`src/hooks/use-permissions.ts`) that exposes a `hasRole(role)` check, used internally by Gate and available to components that need imperative checks (e.g., for disabling buttons via spread props).

4. **Custom ESLint rule** that reads the generated `role-map.json` and enforces: if a file imports a mutation hook listed in the map, it must also import the corresponding role constant from `generated/roles.ts`. This catches missing Gates at lint time. Reader-level hooks are excluded from the map so they don't trigger false positives.

## What is explicitly out of scope

- Wiring up `Gate` components across existing UI (second push).
- Route-level guards (readers and editors see the same pages).
- Role hierarchy logic in the frontend (backend responsibility).

## Design decisions already made

- Naming convention: hook `useDeletePartsByPartKey` → constant `deletePartsByPartKeyRole`.
- The generator reads `x-auth-roles.read` from the spec root to determine the "baseline" role to suppress.
- The `RequiredRole` union type is derived from the distinct non-read roles found in the spec.
- The ESLint rule uses the generated role-map.json so it requires zero manual maintenance.
