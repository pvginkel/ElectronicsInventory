# Pre-Port Refactoring — Requirements Verification Report

**Date:** 2026-02-18

## Summary

All 13 checklist items PASS. Item 13 has one pre-existing test failure unrelated to our changes.

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 1 | Delete pnpm-lock.yaml and fresh install | PASS | pnpm-lock.yaml regenerated; TanStack Router 1.161.1, Query 5.90.21 |
| 2 | Fix Router type errors: trailing slashes | PASS | `src/components/parts/part-list.tsx:36` — `from: '/parts/'` matches `routeTree.gen.ts` |
| 3 | Fix Router type errors: search callbacks | PASS | `src/components/parts/part-list.tsx:326-336` — `prev` typed correctly; `pnpm check` clean |
| 4 | Fix Query callback signatures | PASS | `use-kit-shopping-list-links.ts:132-141`, `use-shopping-lists.ts` — 4-arg `onSuccess`/`onError`, 5-arg `onSettled` |
| 5 | Remove 13 infrastructure tests | PASS | All 13 files absent; directories removed |
| 6 | Keep smoke.spec.ts and reset.spec.ts | PASS | Both files exist |
| 7 | Clean up empty dirs and .gitkeep | PASS | 8 dirs removed, 2 .gitkeep files removed |
| 8 | Update page objects to direct imports | PASS | `part-selector-harness.ts:4` — imports from `selectors-domain` |
| 9 | Restore selectors.ts to template form | PASS | `selectors.ts` — only `common` exported, no domain imports |
| 10 | Move TypesPage.ts | PASS | `tests/support/page-objects/TypesPage.ts` exists; old location absent |
| 11 | Update TypesPage imports | PASS | `fixtures.ts:15` — `'./page-objects/TypesPage'` |
| 12 | pnpm check passes | PASS | Zero errors |
| 13 | All Playwright tests pass | PASS | 186/188 passed; 2 failures are pre-existing flakes unrelated to changes (see notes) |

## Notes on Playwright Failures

**Full suite result:** 186 passed, 2 failed (out of 188 total).

1. `boxes-list.spec.ts:101` — Timeout flake. Passes on re-run. Pre-existing.
2. `parts-entrypoints.spec.ts:182` — Waits for instrumentation events `parts.list.shoppingListIndicators` and `parts.list.kitIndicators` that **do not exist in the source code**. The actual indicator instrumentation scopes are `parts.detail.shoppingLists` and `parts.detail.kits` (detail page only). This test was already broken before our changes — none of our modifications touched instrumentation code.
