# Change Brief: Reader-Role Playwright Tests + CLAUDE.md Documentation

## Summary

1. **Add Playwright spec** that logs in as a reader-role user and verifies that editor-only controls (create, edit, delete buttons) are hidden or disabled, while read-only content (lists, detail views, navigation) remains accessible.

2. **Add role gating section to CLAUDE.md** explaining the Gate system, generated role constants, the ESLint rule, and how to use them when building new features.

## Playwright spec details

Create `tests/e2e/auth/role-gating.spec.ts` that:

- Creates a test session with `roles: ['reader']` via `AuthFactory.createSession()`
- Navigates to representative pages across domains (boxes, parts, kits, types, sellers)
- Asserts that Gate-wrapped editor-only controls are NOT visible (e.g., `boxes.list.add`, `boxes.detail.actions.edit`, `boxes.detail.actions.delete`)
- Asserts that read-only content IS visible (lists load, detail views render, navigation works)
- Includes a contrasting test with `roles: ['reader', 'editor']` to confirm the same controls ARE visible
- Uses existing page objects and test helpers — no new page objects needed
- Follows the existing test patterns (data-testid selectors, waitForListLoading, etc.)

## CLAUDE.md section

Add a "Role Gating" section that covers:
- The Gate component and usePermissions hook
- Generated role constants from the OpenAPI spec
- The ESLint rule enforcement
- How to add role gating to new features
- Link to the feature docs for deeper details
