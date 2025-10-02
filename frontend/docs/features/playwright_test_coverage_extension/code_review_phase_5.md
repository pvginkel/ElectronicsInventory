# Playwright Test Coverage Extension – Phase 5 Code Review

## Findings

1. **High** – `src/hooks/use-dashboard.ts:290`
   - `storageQuery.data?.filter(...).length` dereferences `.length` on `undefined` while the storage summary query is still loading. That throws during the initial render and breaks the dashboard screen, blocking all downstream tests.
   - Suggested fix: assign the filtered result to an intermediate array (defaulted to `[]`) or guard the length call (e.g. `storageQuery.data?.filter(...).length ?? 0`).

2. **High** – `src/hooks/use-dashboard.ts:356`
   - The same unguarded `.length` access exists for the low stock query. Until the low stock response arrives, the code executes `.length` on `undefined`, causing the widget to crash and preventing any Playwright coverage from running.
   - Suggested fix: mirror the storage fix by defaulting the filtered collection before reading `.length`.

## Notes

- All other instrumentation, test IDs, and Playwright specs align with the Phase 5 requirements once the hook guards are in place.
