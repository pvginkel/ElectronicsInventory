# Change Brief: Pre-Port Refactoring (Third Pass)

Perform the five refactoring tasks documented in `docs/ei_post_port_refactoring.md` on the current EI frontend codebase, prior to re-porting onto the frontend template. The goal is to bring the codebase up to date with current dependency versions and clean up template/domain boundaries so the next port is clean.

## Tasks

1. **TanStack Router Upgrade** — Delete `pnpm-lock.yaml`, run `pnpm install` to get current versions, then fix the resulting type errors in route paths (trailing slash changes) and `navigate()` search param callbacks. Run `pnpm exec tsr generate` to determine the correct route IDs.

2. **TanStack Query Mutation Callback Signatures** — Fix all `mutate()` option callback invocations (`onSuccess`, `onError`, `onSettled`) in the custom hooks to match the current TanStack Query API (argument count changed from 3 to 4).

3. **Remove Infrastructure Tests** — Delete the 12 infrastructure test files that now live in the template mother project. Keep domain tests, `tests/smoke.spec.ts`, and `tests/e2e/setup/reset.spec.ts`. Clean up empty directories.

4. **Fix `selectors.ts` Re-export Pattern** — Update all page objects to import domain selectors directly from `selectors-domain.ts` instead of going through the template-owned `selectors.ts` file. Then restore `selectors.ts` to its template-owned form (only exporting `common`).

5. **Move Misplaced Page Object** — Move `tests/e2e/types/TypesPage.ts` to `tests/support/page-objects/` and update all imports.

## Reference

Full details, file lists, and error counts are in `docs/ei_post_port_refactoring.md`.
