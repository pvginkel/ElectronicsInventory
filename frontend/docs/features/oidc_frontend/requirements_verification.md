# OIDC Frontend -- Requirements Verification Report

All 17 requirements from section 1a of the plan have been verified.

| # | Requirement | Status | Evidence |
|---|------------|--------|----------|
| 1 | Code generator updated (401 middleware + response.status) | PASS | `scripts/generate-api.js:52-85,185-186,263-264` |
| 2 | API regenerated (client.ts, hooks.ts, types.ts) | PASS | `src/lib/api/generated/client.ts:1-27`, `hooks.ts` uses result.response.status |
| 3 | toApiError(error, status?) with optional HTTP status | PASS | `src/lib/api/api-error.ts:44-56` |
| 4 | auth-redirect.ts with buildLoginUrl() | PASS | `src/lib/auth-redirect.ts:11-15` |
| 5 | use-auth.ts wrapping useGetAuthSelf with 401 detection | PASS | `src/hooks/use-auth.ts:56-78` |
| 6 | auth-context.tsx with AuthProvider (no 401 redirect) | PASS | `src/contexts/auth-context.tsx:59-106`, no redirect effect |
| 7 | auth-gate.tsx with loading/error/authenticated states | PASS | `src/components/auth/auth-gate.tsx:20-161` |
| 8 | top-bar.tsx with hamburger, logo+title, spacer, UserDropdown | PASS | `src/components/layout/top-bar.tsx:18-76` |
| 9 | user-dropdown.tsx with name display, dropdown, logout | PASS | `src/components/layout/user-dropdown.tsx:25-128` |
| 10 | sidebar.tsx modified to navigation-only (no header) | PASS | `src/components/layout/sidebar.tsx` -- no logo/title/toggle |
| 11 | __root.tsx restructured with AuthProvider+AuthGate | PASS | `src/routes/__root.tsx:49-67` |
| 12 | DeploymentNotificationBar renders above TopBar | PASS | `src/routes/__root.tsx:107-111` |
| 13 | AuthFactory with createSession, clearSession, forceError | PASS | `tests/api/factories/auth.ts:21-74` |
| 14 | fixtures.ts updated with auth fixture + error suppression | PASS | `tests/support/fixtures.ts:43,97,226-229,394-400` |
| 15 | AuthPage.ts page object created | PASS | `tests/e2e/auth/AuthPage.ts:1-188` |
| 16 | auth.spec.ts with focused auth flow tests | PASS | `tests/e2e/auth/auth.spec.ts:1-333` |
| 17 | Existing tests unaffected (no auth sessions required) | PASS | Only `auth.spec.ts` uses `auth.createSession` |

**Result: 17/17 PASS**
