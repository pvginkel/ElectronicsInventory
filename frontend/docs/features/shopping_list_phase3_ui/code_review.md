# Code Review

## Findings

- **Major** – Duplicate guard path skips the failure toast, so the Playwright spec that waits for it will hang; move the toast call ahead of the early return so the UI still surfaces the backend conflict (`src/components/shopping-lists/part/add-to-shopping-list-dialog.tsx:183`).
- **Minor** – `mapMembership` computes a trimmed note but returns the untrimmed original, letting stray whitespace leak into badges/tooltips; return the trimmed value instead (`src/hooks/use-part-shopping-list-memberships.ts:99`).

## Next Steps

1. Restore the toast emission on conflict and re-run `pnpm playwright test tests/e2e/shopping-lists/parts-entrypoints.spec.ts`.
2. Return the trimmed note string from `mapMembership` and spot-check the rendered badges/tooltip output.
