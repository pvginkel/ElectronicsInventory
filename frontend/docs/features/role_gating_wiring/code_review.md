# Code Review -- Role Gating Wiring

## 1) Summary & Decision

**Readiness**

The implementation is a faithful, mechanical wiring of the existing `Gate` component and generated role constants into all files flagged by the `role-gating/role-import-enforcement` ESLint rule. All 13 hook files import and re-export role constants. All 13 component/route files (plus one correctly identified extra, `kit-detail-header.tsx`) import role constants and wrap editor-only elements in `<Gate>`. The ESLint rule is promoted from `warn` to `error`. `pnpm check` passes with zero lint, type, and knip errors. The change is low-risk because the test user holds the `editor` role, making Gate transparent in all existing Playwright specs.

**Decision**

`GO` -- The implementation fulfills all plan requirements, `pnpm check` passes cleanly, and no correctness or architectural issues were found. Two minor suggestions are noted below but are non-blocking.

---

## 2) Conformance to Plan (with evidence)

**Plan alignment**

- Plan Section 14 Slice 1 (Hook re-exports) -- All 13 hook files add role constant imports and `export {}` re-exports. Each uses the `/** @public */` JSDoc annotation to prevent knip false positives on unused exports.
  - `src/hooks/use-parts.ts:10-16` -- imports and re-exports `postInventoryPartsStockByPartKeyRole`, `deleteInventoryPartsStockByPartKeyRole`
  - `src/hooks/use-shopping-lists.ts:63-90` -- imports and re-exports 9 role constants
  - Pattern consistent across all 13 hook files.

- Plan Section 14 Slice 2 (Component Gate wiring) -- All 12 component files and 1 route file add role constant imports. Files with visible interactive elements wrap them in `<Gate>`. Files where the dialog/form is opened by an already-gated trigger use the `void` expression pattern to satisfy the lint rule without adding Gate wrappers.
  - `src/components/boxes/box-details.tsx:248-264` -- Edit and Delete buttons individually gated with semantically correct role constants
  - `src/components/boxes/box-list.tsx:135-145,241-261` -- Add button and empty-state CTA gated; fallback omits action for viewer-role users
  - `src/components/parts/seller-link-section.tsx:132-158,173-182` -- Remove buttons use `<Gate fallback={...}>` with disabled icons; Add button uses bare Gate
  - `src/components/pick-lists/pick-list-detail.tsx:326-335` -- Delete button gated
  - `src/routes/shopping-lists/$listId.tsx:22-24` -- `void` expression satisfies lint for indirect usage

- Plan Section 14 Slice 2 (kit-detail.tsx) -- The plan attributed kit action buttons to `kit-detail.tsx`. In practice, the action buttons live in `kit-detail-header.tsx` (a helper function `createKitDetailHeaderSlots`). The implementation correctly gates buttons in `kit-detail-header.tsx:255-326` and uses `void` expressions in `kit-detail.tsx:46` for the three role constants whose UI triggers live in the header.
  - `src/components/kits/kit-detail-header.tsx:255-326` -- Order Stock, Edit Kit, and More Actions menu each gated
  - `src/components/kits/kit-detail.tsx:611-626` -- "Add" BOM content button gated with `postKitsContentsByKitIdRole`

- Plan Section 14 Slice 3 (ESLint promotion) -- `eslint.config.js:50-52` changes severity from `'warn'` to `'error'` with an updated comment referencing the feature docs.

- Plan Section 14 Slice 4 (Verification) -- `pnpm check` passes with 0 errors.

**Gaps / deviations**

- Plan lists `kit-detail.tsx` as containing all kit action buttons, but the implementation correctly identifies that buttons live in `kit-detail-header.tsx`. This is an improvement over the plan. `kit-detail-header.tsx` was not in the plan's 26-file list but is correctly added (28 files total = 13 hooks + 14 component/route/config + 1 extra header file).
- The plan suggested per-action role constants for each dropdown item in `kit-detail-header.tsx` (e.g., `deleteKitsByKitIdRole` for delete, `postKitsUnarchiveByKitIdRole` for unarchive). The implementation wraps the entire dropdown in a single `<Gate requires={postKitsArchiveByKitIdRole}>` (`kit-detail-header.tsx:284`). Since all constants resolve to `"editor"`, this has no behavioral impact. The trade-off is reduced specificity if roles diverge in the future. This is a reasonable simplification given all constants currently map to the same role.
- The plan suggests `part-details.tsx` could use individual gating or a single Gate. The implementation uses a single `<Gate requires={deletePartsByPartKeyRole}>` around the entire actions block (`part-details.tsx:292-327`). Same trade-off as above -- acceptable.

---

## 3) Correctness -- Findings (ranked)

No blocker or major findings. Two minor observations:

- Title: Minor -- Coarse-grained Gate on kit dropdown menu
- Evidence: `src/components/kits/kit-detail-header.tsx:284` -- entire dropdown (archive, unarchive, delete) gated with `postKitsArchiveByKitIdRole`
- Impact: If roles diverge in the future (e.g., archive requires `editor` but delete requires `admin`), this single Gate would need to be split. No current impact since all constants resolve to `"editor"`.
- Fix: Accept as-is. If roles diverge, split the Gate at that time.
- Confidence: High

- Title: Minor -- `void` expression as unused-import suppression
- Evidence: `src/components/kits/kit-detail.tsx:46`, `src/components/kits/kit-attachment-section.tsx:10`, `src/components/parts/part-form.tsx:12`, and 5 other files
- Impact: The `void roleConstant;` idiom is unconventional but correct. It satisfies TypeScript's `noUnusedLocals` check and keeps the ESLint rule happy. Each occurrence has a comment explaining the reason. The pattern is consistent across all 8 files that use it.
- Fix: No fix needed. The approach is pragmatic and well-documented with inline comments. An alternative would be a `// @ts-expect-error` or a `_` prefix convention, but `void` is arguably cleaner.
- Confidence: High

---

## 4) Over-Engineering & Refactoring Opportunities

No over-engineering observed. The implementation is mechanical and minimal.

- Hotspot: Duplicate EmptyState in `box-list.tsx`
- Evidence: `src/components/boxes/box-list.tsx:241-261` -- The EmptyState component is duplicated: once in the Gate's children (with action prop) and once in the fallback (without action prop).
- Suggested refactor: Extract a shared `BoxesEmptyState` component that accepts an optional `onCreateBox` prop, or conditionally pass the `action` prop based on a `canCreate` flag derived from `usePermissions`. This would eliminate the JSX duplication.
- Payoff: Reduces maintenance burden when the empty-state copy or styling changes (only one place to update). Very low priority given the small size of the duplication.

---

## 5) Style & Consistency

- Pattern: Import source for role constants in component files
- Evidence: `src/components/boxes/box-details.tsx:26` imports from `@/lib/api/generated/roles` (direct); `src/components/pick-lists/pick-list-detail.tsx:19` also imports directly from `@/lib/api/generated/roles`. No component file imports role constants from the hook re-exports.
- Impact: The plan recommended preferring hook re-exports when the component already imports a custom hook. In practice, no component uses the hook re-exports. Since the re-exports exist for future convenience (and are marked `/** @public */` for knip), this is acceptable. The direct import approach is actually more explicit.
- Recommendation: Accept the current direct-import pattern. The hook re-exports provide a consumption path for future code that wants a single import for both the hook and its role constant.

- Pattern: Consistent comment style for `void` expressions
- Evidence: All 8 files with `void` expressions include an explanatory comment (`// Role constant import satisfies role-gating lint rule; ...`). The comments vary slightly in wording but convey the same information.
- Impact: None -- the variation is minor and each comment is contextually accurate.
- Recommendation: Accept as-is. The comments are helpful and consistent enough.

---

## 6) Tests & Deterministic Coverage (new/changed behavior only)

- Surface: All pages with Gate-wrapped elements (boxes, kits, parts, pick-lists, shopping-lists, seller-links)
- Scenarios:
  - Given the test user has the `editor` role, When any page with Gate-wrapped elements loads, Then all interactive elements render normally and existing Playwright tests pass without modification. (Covered by all existing specs in `tests/e2e/`)
  - Given the ESLint rule is promoted to `error`, When `pnpm check` is run, Then 0 errors from `role-gating/role-import-enforcement`. (Verified: `pnpm check` passes.)
- Hooks: No new instrumentation events. Existing `data-testid` attributes are preserved inside Gate wrappers. Gate renders a React fragment (`<>{children}</>`) that adds no DOM nodes.
- Gaps: Viewer-role rendering tests are explicitly deferred in the plan (Section 13). This is acceptable because: (a) the current test infrastructure does not provision viewer-role users, (b) the change brief marks it out of scope, and (c) the backend enforces roles regardless of frontend gating.
- Evidence: `pnpm check` passes; plan Section 13 documents the deferred test gap.

---

## 7) Adversarial Sweep

- Checks attempted:
  1. **Gate fragment wrapping breaks DOM structure or Playwright selectors** -- Gate renders `<>{children}</>` (fragment), adding no DOM nodes. Verified at `src/components/auth/gate.tsx:49`. Parent elements like `div.flex` continue to be the direct DOM parents of buttons. No Playwright `data-testid` selectors rely on specific parent-child nesting that would break.
  2. **Loading/skeleton state accidentally gated** -- Checked `kit-detail-header.tsx:112-134`. The loading skeleton path renders disabled buttons without any Gate wrapping. The Gate wrapping only applies to the "ready" branch (line 253+). Same pattern holds in other components: Gate wraps only the interactive elements, not loading or error states.
  3. **`void` expression has runtime side effects** -- `void expr` evaluates `expr` and returns `undefined`. The role constants are string literals (`"editor" as const`), so evaluation has no side effects. TypeScript compiles `void postKitsArchiveByKitIdRole` to `void 0` or simply omits it in optimized builds. No risk.
  4. **Race between auth context and Gate rendering** -- `AuthGate` (the authentication boundary at the app root) prevents the component tree from rendering until the user object is available. This guarantees `usePermissions` in `Gate` always has a valid `user` object. Verified at `src/hooks/use-permissions.ts:27-31`.
  5. **knip flags re-exported role constants as unused** -- The `/** @public */` JSDoc annotation on each re-export statement tells knip the export is intentionally public. Verified by `pnpm check:knip` passing cleanly.
- Evidence: `src/components/auth/gate.tsx:49`, `src/components/kits/kit-detail-header.tsx:112-134`, `src/hooks/use-permissions.ts:27-31`, `pnpm check` passes.
- Why code held up: Gate is a pure rendering wrapper with no DOM side effects. The `void` pattern is well-documented. Auth context is guaranteed to be available before Gate renders. knip recognizes `@public` annotations.

---

## 8) Invariants Checklist

- Invariant: Every file importing a mutation hook from `@/lib/api/generated/hooks` must also import the corresponding role constant from `@/lib/api/generated/roles`.
  - Where enforced: ESLint rule `role-gating/role-import-enforcement` at `error` severity (`eslint.config.js:52`), checked by `pnpm check:lint`.
  - Failure mode: A developer adds a new mutation hook import without the paired role constant.
  - Protection: CI runs `pnpm check` which now treats missing role imports as errors, blocking the PR.
  - Evidence: `scripts/eslint-rules/role-import-enforcement.js:103-114`, `eslint.config.js:52`

- Invariant: Gate renders children for users with the `editor` role and renders nothing (or fallback) for users without.
  - Where enforced: `src/components/auth/gate.tsx:46-52` -- `roles.some((role) => hasRole(role))` check.
  - Failure mode: `usePermissions` returns incorrect role information (e.g., stale context after role change).
  - Protection: `usePermissions` reads from React context, which triggers re-renders on auth state changes. `AuthGate` prevents rendering before auth resolves.
  - Evidence: `src/components/auth/gate.tsx:39-52`, `src/hooks/use-permissions.ts:26-34`

- Invariant: Hook re-exports remain in sync with the generated role constants.
  - Where enforced: `pnpm generate:api` regenerates `roles.ts` and `role-map.json`. The ESLint rule reads `role-map.json` to determine which hooks need which constants.
  - Failure mode: A new endpoint is added but `pnpm generate:api` is not run, leaving the role map stale.
  - Protection: CI runs `pnpm check` which loads the role map; if the map is stale relative to the hooks, the rule will either flag missing constants or miss new hooks entirely. The `generate:api` step in CI prevents drift.
  - Evidence: `scripts/eslint-rules/role-import-enforcement.js:26-35`, `src/lib/api/generated/role-map.json`

---

## 9) Questions / Needs-Info

No blocking questions. The implementation is self-contained and aligns with the plan.

---

## 10) Risks & Mitigations (top 3)

- Risk: Coarse-grained Gate wrapping (e.g., entire actions block in `part-details.tsx`, entire dropdown in `kit-detail-header.tsx`) may need splitting when roles diversify beyond `"editor"`.
- Mitigation: All role constants are semantically named per endpoint, so splitting a Gate into per-action Gates is straightforward. The current approach avoids premature granularity.
- Evidence: `src/components/parts/part-details.tsx:292`, `src/components/kits/kit-detail-header.tsx:284`

- Risk: Viewer-role test coverage is deferred; viewer-facing UX regressions could ship undetected.
- Mitigation: The plan explicitly defers viewer-role testing. The backend enforces roles on every endpoint regardless. A follow-up ticket should be created to add viewer-role Playwright specs once the test infrastructure supports provisioning viewer users.
- Evidence: Plan Section 13 (Deterministic Test Plan -- Gaps)

- Risk: The `void roleConstant;` pattern is unfamiliar and could confuse future contributors.
- Mitigation: Every occurrence has an inline comment explaining the purpose. The pattern is used consistently across 8 files. If the ESLint rule is ever extended to verify Gate usage (not just imports), the `void` expressions could be replaced with actual Gate wrappers.
- Evidence: `src/components/kits/kit-detail.tsx:44-46`, `src/components/parts/part-form.tsx:10-12`

---

## 11) Confidence

Confidence: High -- The change is mechanical, well-scoped, and verified by `pnpm check`. No correctness issues were found. The deferred viewer-role test gap is explicitly documented and accepted by the plan.
