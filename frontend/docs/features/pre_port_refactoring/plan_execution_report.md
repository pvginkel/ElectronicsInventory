# Pre-Port Refactoring — Plan Execution Report

## Status

**DONE** — All five refactoring tasks implemented and verified.

## Summary

All items from the pre-port refactoring plan have been implemented across three slices. The codebase now runs on current dependency versions (TanStack Router 1.161.1, TanStack Query 5.90.21), infrastructure tests have been removed, template/domain boundaries are clean, and page objects are properly organized.

### What was accomplished

**Slice 1 — Lockfile refresh and type error fixes (Tasks 1 + 2):**
- Deleted `pnpm-lock.yaml` and ran fresh `pnpm install`
- Regenerated route tree via `pnpm exec tsr generate` (output unchanged)
- Fixed `useNavigate({ from: '/parts' })` → `'/parts/'` in `part-list.tsx` to match generated route IDs
- Replaced `ShoppingListsRoute.fullPath` with `'/shopping-lists'` string literal in `detail-header-slots.tsx` and `$listId.tsx`
- Updated 12 mutation callback invocations in `use-kit-shopping-list-links.ts` (added `onMutateResult` param)
- Updated 18 `onSuccess` callback invocations in `use-shopping-lists.ts` (same pattern)
- Fixed `React.FormEvent` → `React.SubmitEvent` in `form.tsx` (React 19.2.x type change)

**Slice 2 — Remove infrastructure tests (Task 3):**
- Deleted 13 infrastructure test files (12 from refactoring doc + `instrumentation-snapshots.spec.ts`)
- Removed 8 empty directories (`auth/`, `deployment/`, `sse/`, `app-shell/`, `shell/`, `dialogs/`, `ui/`, `parallel/`)
- Removed 2 `.gitkeep` files
- Kept `smoke.spec.ts` and `reset.spec.ts` as directed

**Slice 3 — Selector cleanup and TypesPage move (Tasks 4 + 5):**
- Updated `part-selector-harness.ts` to import `partsSelectors` directly from `selectors-domain.ts`
- Restored `selectors.ts` to template-owned form (only `common` selectors)
- Moved `TypesPage.ts` from `tests/e2e/types/` to `tests/support/page-objects/`
- Updated import in `fixtures.ts`

**Post-review fix:**
- Updated stale documentation references to the old TypesPage path in `playwright_developer_guide.md` and `selector_patterns.md`

### Files changed

| File | Change |
|------|--------|
| `pnpm-lock.yaml` | Regenerated with current versions |
| `src/components/parts/part-list.tsx` | Route path `from: '/parts/'` |
| `src/components/primitives/form.tsx` | `React.SubmitEvent` type |
| `src/components/shopping-lists/detail-header-slots.tsx` | String literal `'/shopping-lists'`, removed unused import |
| `src/routes/shopping-lists/$listId.tsx` | String literal `'/shopping-lists'`, removed unused import |
| `src/hooks/use-kit-shopping-list-links.ts` | 12 callback signature updates |
| `src/hooks/use-shopping-lists.ts` | 18 callback signature updates |
| `tests/support/page-objects/part-selector-harness.ts` | Direct import from `selectors-domain` |
| `tests/support/selectors.ts` | Restored to template-owned form |
| `tests/support/fixtures.ts` | Updated TypesPage import path |
| `tests/support/page-objects/TypesPage.ts` | Moved from `tests/e2e/types/` |
| `docs/contribute/testing/playwright_developer_guide.md` | Updated TypesPage path reference |
| `docs/contribute/testing/selector_patterns.md` | Updated TypesPage path reference |
| 13 test files | Deleted (infrastructure tests) |
| 8 directories | Deleted (empty after test removal) |
| 2 `.gitkeep` files | Deleted |

## Code Review Summary

**Decision:** GO

- **BLOCKER:** 0
- **MAJOR:** 0
- **MINOR:** 2 (stale documentation paths — resolved)

All issues identified in the review have been resolved. Full review at `code_review.md`.

## Verification Results

| Check | Result |
|-------|--------|
| `pnpm check` (lint + typecheck) | Pass — zero errors |
| `pnpm build` | Pass — Vite bundle valid |
| Playwright suite (188 tests) | 186 passed, 2 pre-existing failures |

### Pre-existing test failures (not caused by this work)

1. **`boxes-list.spec.ts:101`** — Intermittent timeout flake. Passes on re-run.
2. **`parts-entrypoints.spec.ts:182`** — Waits for instrumentation events (`parts.list.shoppingListIndicators`, `parts.list.kitIndicators`) that do not exist in the source code. The actual scopes are `parts.detail.shoppingLists` and `parts.detail.kits` (detail page only). No changes in this work touched instrumentation.

## Outstanding Work & Suggested Improvements

- **Fix `parts-entrypoints.spec.ts:182`**: The test references non-existent instrumentation scopes. Either the instrumentation needs to be added to the parts list component or the test needs to be updated to remove the `waitForListLoading` calls for indicator events.
- **Investigate `boxes-list.spec.ts:101` flakiness**: Intermittent timeout suggests a race condition in the test.
- No other outstanding work required.
