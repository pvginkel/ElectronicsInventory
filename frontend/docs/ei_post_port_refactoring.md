# EI Frontend Post-Port Refactoring

After porting ElectronicsInventory onto the frontend template, these refactorings remain. They are listed in priority order — the first two are blocking issues that prevent the project from running on fresh dependency versions.

## 1. TanStack Router Upgrade (1.131 → current)

**Status:** Blocking — the ported project pins versions via EI's old lockfile.
**Fix:** Delete `pnpm-lock.yaml`, run `pnpm install`, fix type errors.
**Scope:** 3 files, ~13 errors

The ported project uses EI's lockfile to pin TanStack Router at 1.131.27. Current versions (~1.161) have breaking type changes in two areas:

### 1a. Route path trailing slashes

The route tree generator changed how index route IDs are formatted. Components using `useNavigate` or `<Link>` with hardcoded paths need updating:

**Files:**
- `src/components/parts/part-list.tsx` (line 36): `useNavigate({ from: '/parts' })` → `'/parts/'`
- `src/components/shopping-lists/detail-header-slots.tsx` (lines 157, 202): `'/shopping-lists/'` → `'/shopping-lists'`
- `src/routes/shopping-lists/$listId.tsx` (line 113): same trailing slash fix

The exact direction of the fix (add vs remove trailing slash) depends on what the route tree generator outputs. Run `pnpm exec tsr generate` and check the route IDs in `src/routeTree.gen.ts`.

### 1b. Navigate `search` params type changes

Components passing `search` as a function to `navigate()` have type errors. The `search` callback signature changed — the `prev` parameter type becomes `never` when the route path doesn't match.

**File:** `src/components/parts/part-list.tsx` (lines 327, 335)

```typescript
// Current (broken with new router)
navigate({
  to: '/parts',
  search: (prev) => ({ ...prev, hasStock: prev.hasStock ? undefined : true }),
});

// Fix: use the correct route path so prev is typed correctly
```

This is the same root cause as 1a — once the route path matches the generated route ID, the `search` type resolves correctly.

## 2. TanStack Query Mutation Callback Signature (5.85 → current)

**Status:** Blocking — same lockfile issue.
**Scope:** 2 files, ~30 errors

The `mutate()` options callbacks (`onSuccess`, `onError`, `onSettled`) changed their argument count. The old API passed 3 arguments; the new API passes 4.

**Files:**
- `src/hooks/use-kit-shopping-list-links.ts` — 12 errors across 4 mutation wrappers
- `src/hooks/use-shopping-lists.ts` — 18 errors across ~18 mutation wrappers

**Pattern:** Every `mutateOptions?.onSuccess?.(data, variables, context)` call needs the additional argument.

Check the TanStack Query migration guide for the exact change. It may be as simple as adding a 4th argument to each callback invocation, or the callback shape may have changed more fundamentally.

## 3. Remove Infrastructure Tests

**Status:** Non-blocking — these tests still pass, they're just redundant.
**Scope:** 12 files to remove

Infrastructure tests now live in the template mother project (`/work/ModernAppTemplate/frontend/tests/`). EI should only contain domain tests.

**Infrastructure tests to remove:**

| File | Reason |
|------|--------|
| `tests/e2e/auth/auth.spec.ts` | Auth flow (login, logout, session) |
| `tests/e2e/auth/AuthPage.ts` | Auth page object (accompanies auth.spec.ts) |
| `tests/e2e/deployment/deployment-banner.spec.ts` | Deployment version notification bar |
| `tests/e2e/deployment/shared-worker-version-sse.spec.ts` | SharedWorker SSE version detection |
| `tests/e2e/sse/task-events.spec.ts` | SSE task event streaming |
| `tests/e2e/app-shell/toast-display.spec.ts` | Toast notification lifecycle |
| `tests/e2e/shell/navigation.spec.ts` | Sidebar navigation, layout |
| `tests/e2e/shell/mobile-menu.spec.ts` | Mobile responsive menu |
| `tests/e2e/dialogs/keyboard-navigation.spec.ts` | Dialog keyboard accessibility |
| `tests/e2e/ui/tooltip.spec.ts` | Tooltip display and positioning |
| `tests/e2e/parallel/worker-isolation.spec.ts` | Playwright worker isolation |
| `tests/e2e/test-infrastructure.spec.ts` | Test event instrumentation validation |
| `tests/e2e/workflows/instrumentation-snapshots.spec.ts` | Test instrumentation snapshots |

**Borderline (keep for now):**

| File | Reason |
|------|--------|
| `tests/smoke.spec.ts` | Health check — generic but useful as a fast sanity check |
| `tests/e2e/setup/reset.spec.ts` | Test data reset — technically infrastructure but uses domain factories |

**Domain tests to keep (34 files):**

All tests under: `parts/` (10), `kits/` (4), `boxes/` (2), `sellers/` (2), `shopping-lists/` (5), `pick-lists/` (1), `types/` (7 including TypesPage.ts), `specific/` (1), `workflows/end-to-end.spec.ts` (1), `tests/unit/` (1)

After removing infrastructure tests, also remove any empty directories and the `.gitkeep` files.

## 4. Fix `selectors.ts` Re-export Pattern

**Status:** Non-blocking — works now but fragile.
**Scope:** 1 file

EI's `tests/support/selectors.ts` is a template-owned file that EI customized to re-export domain selectors:

```typescript
// EI's version (customized template file)
import { partsSelectors, typesSelectors, boxesSelectors, sellersSelectors } from './selectors-domain';

export const selectors = {
  parts: partsSelectors,   // domain
  types: typesSelectors,   // domain
  boxes: boxesSelectors,   // domain
  sellers: sellersSelectors, // domain
  common: { ... },          // template
};
```

The template's version only has `{ common: {...} }`. On the next `copier update`, EI's customization would be overwritten.

**Two options:**

**Option A (recommended):** Update all page objects to import from `selectors-domain.ts` directly instead of through `selectors.ts`. This eliminates the customization of a template-owned file:

```typescript
// Before (fragile)
import { selectors } from '../selectors';
const input = selectors.parts.form.field('name');

// After (clean)
import { partsSelectors } from '../selectors-domain';
const input = partsSelectors.form.field('name');
```

**Option B:** Update the template's `selectors.ts` to automatically re-export everything from `selectors-domain.ts`. This would benefit all downstream apps but adds coupling between template and app selector shapes.

## 5. Move Misplaced Page Object

**Status:** Non-blocking, cosmetic.
**Scope:** 1 file + import updates

`tests/e2e/types/TypesPage.ts` is a page object sitting in the test directory instead of `tests/support/page-objects/`. Move it to be consistent with all other page objects.

## Execution Order

```
1. Delete lockfile, fresh install, fix router + query errors  ← Unblocks version upgrades
2. Remove infrastructure tests                                 ← Cleanup
3. Fix selectors.ts re-export                                  ← Prevents copier update breakage
4. Move TypesPage.ts                                           ← Cosmetic
```

Items 1 is the only one requiring code changes. Items 2-4 are file moves/deletes. Total code changes: ~43 type errors across 5 files, all following clear patterns.
