# Role Gating Infrastructure – Requirements Verification Report

**Generated:** 2026-02-26
**Plan Reference:** docs/features/role_gating_infrastructure/plan.md (Section 1a)

## Summary

**Total Checklist Items:** 14 | **PASS:** 14 | **FAIL:** 0

## Verification Results

### 1. Generator script reads `x-required-role` from each endpoint in `openapi-cache/openapi.json`
- **Status:** PASS
- **Evidence:** `scripts/generate-api.js:509-512` — reads `operation['x-required-role']` for each operation. Test coverage at `scripts/__tests__/generate-roles.test.ts:89-104`.

### 2. Generator reads `x-auth-roles.read` from the spec root and suppresses constants for endpoints whose required role matches that value
- **Status:** PASS
- **Evidence:** `scripts/generate-api.js:494-498` — reads `spec['x-auth-roles']?.read`; line 516 — skips if `requiredRole === readRole`. Test at `scripts/__tests__/generate-roles.test.ts:141-152`.

### 3. Generator outputs `src/lib/api/generated/roles.ts` with named constants and `RequiredRole` union type
- **Status:** PASS
- **Evidence:** File exists with 64 constants (e.g., `deletePartsByPartKeyRole = "editor" as const` at line 10) and `RequiredRole` union at line 68.

### 4. Generator outputs `src/lib/api/generated/role-map.json` mapping mutation hook names to role constant names
- **Status:** PASS
- **Evidence:** File exists with 66 entries (e.g., `"useDeletePartsByPartKey": "deletePartsByPartKeyRole"`). Generator code at `scripts/generate-api.js:555-561`.

### 5. Constant naming convention: strip `use` prefix, add `Role` suffix
- **Status:** PASS
- **Evidence:** `scripts/generate-api.js:476-479` — `hookNameToRoleConstant()` helper. All 64 constants follow convention. Tests at `scripts/__tests__/generate-roles.test.ts:57-67`.

### 6. `RequiredRole` union is derived from distinct non-read role values found in the spec
- **Status:** PASS
- **Evidence:** `scripts/generate-api.js:503,523,534` — collects distinct values into Set. Current output: `"editor"` only. Multi-role test at `scripts/__tests__/generate-roles.test.ts:154-172`.

### 7. `Gate` component accepts `requires` prop (single or array) and optional `fallback` prop
- **Status:** PASS
- **Evidence:** `src/components/auth/gate.tsx:22-28` — `GateProps` with `requires: RequiredRole | RequiredRole[]` and `fallback?: ReactNode`. Tests at `src/components/auth/__tests__/gate.test.tsx:52-95`.

### 8. `Gate` performs flat `user.roles.includes()` check — no hierarchy encoding
- **Status:** PASS
- **Evidence:** `src/hooks/use-permissions.ts:29-32` — plain `.includes()` check. No hierarchy logic anywhere. Tests at `src/hooks/__tests__/use-permissions.test.ts:29-52`.

### 9. `usePermissions` hook provides `hasRole(role: RequiredRole): boolean` check
- **Status:** PASS
- **Evidence:** `src/hooks/use-permissions.ts:14-17` — interface; line 26 — export. Tests at `src/hooks/__tests__/use-permissions.test.ts:29-52`.

### 10. Custom ESLint rule reads generated `role-map.json` and enforces mutation hook/role constant co-imports
- **Status:** PASS
- **Evidence:** `scripts/eslint-rules/role-import-enforcement.js:26-35` — loads role map; lines 71-116 — enforcement logic. Tests at `scripts/__tests__/role-import-enforcement.test.ts:48-126`.

### 11. Generator script integrates into `pnpm generate:api` command
- **Status:** PASS
- **Evidence:** `scripts/generate-api.js:586` — `generateRoles(spec)` called from `generateAPI()`. Build pipeline runs `generate:api:build` before `check`.

### 12. All generated files follow existing code generation patterns in the project
- **Status:** PASS
- **Evidence:** Same "do not edit manually" header, same output directory, same sequential call pattern in `generateAPI()`, same Knip exclusion.

### 13. Vitest include extended for scripts tests
- **Status:** PASS
- **Evidence:** `vitest.config.ts:11-14` includes `scripts/**/__tests__/**/*.test.ts`.

### 14. ESLint rule registered in config with correct scope
- **Status:** PASS
- **Evidence:** `eslint.config.js:40-52` — `role-gating` plugin block scoped to `src/**/*.{ts,tsx}`.
