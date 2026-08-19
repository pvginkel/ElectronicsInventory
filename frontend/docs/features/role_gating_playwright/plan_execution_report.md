# Role Gating Playwright Tests — Plan Execution Report

## Status

**DONE** — all 3 slices delivered, all requirements verified, code review issues resolved.

## Summary

Added Playwright tests verifying role-based UI gating and documented the role gating system in CLAUDE.md.

### What was implemented

**Slice 1 — Playwright spec** (`tests/e2e/auth/role-gating.spec.ts`):
- 6 reader-role tests covering boxes list, box detail, part detail, seller link fallback, kit detail, and pick-list detail
- 1 editor-role contrasting test covering all domains in a single sweep
- Seed helper creates all necessary entities (box, part, seller, seller link, kit with contents, pick list) via Node-level API factories before setting the constrained browser session

**Slice 2 — CLAUDE.md update:**
Added "Role Gating" section documenting the Gate component, usePermissions hook, generated role constants, ESLint rule, backend enforcement, and Playwright coverage.

**Slice 3 — Verification:**
`pnpm check` clean, 7/7 Playwright tests passing.

### Files changed

| File | Change |
|------|--------|
| `tests/e2e/auth/role-gating.spec.ts` | New — 7 tests |
| `CLAUDE.md` | Added "Role Gating" section |

## Code Review Summary

**Decision:** GO-WITH-CONDITIONS (1 major, 1 minor — both resolved)

1. **Major — Unwrapped `apiClient.POST` for stock creation** (line 73-76): The raw `POST` call wasn't wrapped in `apiRequest()`, so failures would be silently swallowed. Fixed: wrapped in `apiClient.apiRequest(() => ...)`.
2. **Minor — Explicit type parameter on kit-reservations call** (line 54): Overrode OpenAPI inference with `<{ part_id: number }>`. Fixed: removed type parameter, let OpenAPI types flow through.

## Verification Results

| Check | Result |
|-------|--------|
| `pnpm check` | Clean (lint, type-check, knip) |
| `pnpm playwright test tests/e2e/auth/role-gating.spec.ts` | 7 passed (16.2s) |
| Requirements checklist | 9/9 items verified |

## Outstanding Work & Suggested Improvements

No outstanding work required. Possible future enhancements:
- **Additional domain coverage:** Shopping list detail page reader-role tests (currently only indirectly tested via the contrasting editor test).
- **Role promotion/demotion tests:** Verify that re-creating a session with different roles mid-test updates the Gate behavior without a page reload.
