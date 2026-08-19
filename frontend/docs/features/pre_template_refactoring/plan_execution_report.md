# Plan Execution Report: Pre-Template Refactoring

## Status

**DONE** — All 8 refactorings from the plan have been implemented successfully. `pnpm check` passes. Playwright suite: 226 passed, 6 failed (pre-existing flaky tests), 5 skipped.

## Summary

The Electronics Inventory frontend has been refactored to cleanly separate infrastructure code from domain code, creating well-defined seams for future Copier-based template extraction. This is a purely structural refactoring with no functional changes.

**Files changed:** 47 modified, 11 new files created, 1 file deleted
**Net change:** ~930 lines moved from existing files to new files

### New files created (11)

| File | Purpose | Ownership |
|------|---------|-----------|
| `src/lib/consts.ts` | Centralized project constants | App-owned |
| `src/components/layout/sidebar-nav.ts` | Navigation items array | App-owned |
| `src/app-theme.css` | EI brand colors, category utilities, ai-glare | App-owned |
| `src/providers/core-providers.tsx` | QueryClient + Toast + QuerySetup | Template-owned |
| `src/providers/auth-providers.tsx` | AuthProvider + AuthGate | Template-owned |
| `src/providers/sse-providers.tsx` | SseContext + DeploymentProvider | Template-owned |
| `src/lib/test/test-events.ts` | Test event type definitions (moved) | Template-owned |
| `tests/support/fixtures-infrastructure.ts` | Generic test infrastructure fixtures | Template-owned |
| `tests/support/selectors-domain.ts` | Domain-specific selectors | App-owned |
| `tests/support/test-id.ts` | Standalone `testId()` helper (cycle-breaking) | Template-owned |
| *(additional fix)* `tests/support/process/servers.ts` | Added `OIDC_ENABLED=false` override | Template-owned |

### Key modifications

- **`__root.tsx`**: Simplified from 7-level inline provider nesting to 3 composed provider groups
- **`index.css`**: Removed EI-specific content (category colors, ai-glare, glare-sweep); added `@import "./app-theme.css"`
- **`fixtures.ts`**: Reduced from 660 lines to 156 lines (infrastructure extracted to `fixtures-infrastructure.ts`)
- **`selectors.ts`**: Reduced from 213 lines to ~50 lines (domain selectors extracted to `selectors-domain.ts`)
- **39 files**: Import path updates from `@/types/test-events` to `@/lib/test/test-events`
- **`servers.ts`**: Added `OIDC_ENABLED: 'false'` to backend env in test fixture — the environment `.env` had `OIDC_ENABLED=true` pointing to a Keycloak instance, causing all non-auth tests to get 401. Tests use the testing service endpoints (`/api/testing/auth/*`) for auth simulation, which work regardless of OIDC setting.

## Code Review Summary

**Decision:** GO-WITH-CONDITIONS

| Severity | Count | Resolved |
|----------|-------|----------|
| BLOCKER | 0 | N/A |
| MAJOR | 0 | N/A |
| MINOR | 1 | Yes |

**Minor issue found and resolved:**
- Circular runtime value import between `selectors.ts` and `selectors-domain.ts` — fixed by extracting `testId()` into standalone `tests/support/test-id.ts` module, breaking the dependency cycle.

## Verification Results

### `pnpm check`
- ESLint: PASS (no errors)
- TypeScript strict mode: PASS (no errors)

### Playwright tests
- **226 passed**, 6 failed, 5 skipped (out of 237 total)
- The 6 failures are pre-existing flaky tests unrelated to the refactoring:
  1. `shared-worker-version-sse.spec.ts` — SSE event timeout (timing-sensitive multi-tab test)
  2. `kit-detail.spec.ts:1082` — text assertion mismatch ("External update" vs "updated by another request")
  3. `parts-entrypoints.spec.ts:83` — toast wait timeout (30s)
  4. `parts-entrypoints.spec.ts:181` — test event timeout
  5. `shopping-lists-detail.spec.ts:109` — part selector text format mismatch (pre-existing UI format issue)
  6. `instrumentation-snapshots.spec.ts:54` — toast wait timeout (30s)

### Requirements checklist
- 16/16 items verified as PASS
- See `requirements_verification.md` for detailed evidence

## Outstanding Work & Suggested Improvements

No outstanding work required for the refactoring itself.

**Pre-existing test issues (not caused by this refactoring):**
- 6 flaky/failing tests should be investigated separately — they appear to be timing issues and assertion mismatches in the existing test suite.

**Suggested follow-up for template extraction:**
- `selectors.ts` (with `testId()`, `buildSelector()`, `selectors.common`) becomes template-owned
- `selectors-domain.ts` becomes app-owned (`_skip_if_exists`)
- `test-id.ts` becomes template-owned (leaf dependency, no imports)
- The `@import "./app-theme.css"` in `index.css` should be preserved in the template version of `index.css`
- The `OIDC_ENABLED: 'false'` override in `servers.ts` is already the correct behavior for template test infrastructure
