# Role Gating Wiring -- Plan Review

## 1) Summary & Decision

**Readiness**

The plan is well-researched, implementation-ready, and closely aligned with the infrastructure already shipped. It correctly identifies all 26 ESLint-flagged files, describes the Gate component behavior accurately against the actual source, and proposes a sensible four-slice implementation with the ESLint severity promotion gated behind full wiring. The research log demonstrates genuine codebase investigation with resolved discrepancies between the change brief and ESLint output. The updated import strategy (prefer hook re-exports, use semantically correct constants) provides clear guidance for implementers. No blockers or major issues remain.

**Decision**

`GO` -- the plan is ready for implementation. The minor items noted below are informational and do not block progress.

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `docs/commands/plan_feature.md` -- Pass -- The plan includes all 16 required sections (0 through 16), uses the prescribed templates, and quotes verbatim prompt text in section 1 (`plan.md:32`).
- `docs/product_brief.md` -- Pass -- The plan does not conflict with the product brief. Role gating is a UX-layer concern not addressed by the brief, but the brief's single-user model (`product_brief.md:9`) implies the editor role is always active, consistent with the plan's assumption (`plan.md:53`).
- `docs/contribute/architecture/application_overview.md` -- Pass -- `plan.md:77` follows the documented pattern of custom hooks wrapping generated API hooks. The re-export strategy aligns with the architecture overview's guidance that "Custom hooks in src/hooks/ adapt API responses to frontend domain models" (`application_overview.md:33`).
- `docs/contribute/testing/playwright_developer_guide.md` -- Pass -- `plan.md:330-338`. The plan correctly identifies that no new Playwright specs are needed because the test user holds the `editor` role, and defers viewer-role testing to a follow-up. This aligns with the Playwright guide's principle that specs must hit the live backend (`playwright_developer_guide.md:15`).
- `CLAUDE.md` (Definition of Done) -- Pass with note -- `CLAUDE.md:79-82` requires "Playwright specs are created or updated in the same change." The plan explicitly defers new specs (`plan.md:46`), which is justified because the change is invisible to editor-role users and all existing specs must pass. This is a conscious deviation documented in the plan.

**Fit with codebase**

- `Gate` component -- `plan.md:211-221` -- Confirmed. The plan accurately describes Gate's behavior: fragment rendering (`gate.tsx:49,52`), `requires` prop accepting single or array, fallback defaulting to null. No DOM nodes are added.
- `usePermissions` hook -- `plan.md:228-231` -- Confirmed. The plan correctly notes that `AuthGate` prevents rendering before auth resolves (`use-permissions.ts:23-24`), so `user` is always non-null.
- ESLint rule scope -- `plan.md:10,55` -- Confirmed. The rule only checks imports from paths ending with `generated/hooks` (`role-import-enforcement.js:38-42`). Custom hook wrappers are not flagged.
- Import strategy -- `plan.md:368-372` -- The updated guidance correctly prioritizes hook re-exports when the component already imports from `src/hooks/`, and falls back to direct generated-roles imports only for files that use generated hooks directly. This is consistent with the architecture's layering principle.
- Semantic role constants -- `plan.md:372,402,406,414` -- The updated per-component guidance now specifies the correct role constant for each action (e.g., `putBoxesByBoxNoRole` for edit, `deleteBoxesByBoxNoRole` for delete), which is future-proof and communicates intent.

## 3) Open Questions & Ambiguities

No open questions remain. The previous review's two ambiguities (import source preference and semantic constant selection) have been resolved in the updated plan.

## 4) Deterministic Playwright Coverage (new/changed behavior only)

- Behavior: Gate-wrapped interactive elements across all pages
- Scenarios:
  - Given the test user has the `editor` role, When any page with Gate-wrapped elements loads, Then all interactive elements render normally and existing Playwright tests pass without modification (`plan.md:334`)
  - Given the ESLint rule is promoted to `error`, When `pnpm check` is run, Then 0 errors and 0 warnings from `role-gating/role-import-enforcement` are reported (`plan.md:335`)
- Instrumentation: No new `data-testid` attributes or test events. Existing selectors remain valid because Gate renders fragments (`gate.tsx:49,52`).
- Backend hooks: None required. The test user already holds the `editor` role (`plan.md:15-16`).
- Gaps: Viewer-role rendering tests are explicitly deferred (`plan.md:46,337`). Justified because the test infrastructure does not provision viewer-role users, the change is invisible to editor-role users, and backend enforcement remains the security boundary.
- Evidence: `plan.md:330-338`, `tests/infrastructure/auth/auth.spec.ts`

## 5) Adversarial Sweep (must find >=3 credible issues or declare why none exist)

**Minor -- `kit-detail.tsx` imports only 3 mutation hooks but plan recommends 6 role constants for Gate wrapping**

**Evidence:** `plan.md:406` recommends Gate-wrapping archive, unarchive, delete, edit-metadata, create-pick-list, and add-shopping-list triggers with their respective role constants. However, `kit-detail.tsx:32-34` only directly imports `usePostKitsArchiveByKitId`, `usePostKitsUnarchiveByKitId`, and `useDeleteKitsByKitId`. The edit-metadata, create-pick-list, and add-shopping-list actions are handled by child dialogs (`kit-metadata-dialog.tsx`, `kit-pick-list-create-dialog.tsx`, `kit-shopping-list-dialog.tsx`) that have their own mutation hook imports.

**Why it matters:** The ESLint rule only requires importing role constants for the 3 directly-imported mutation hooks. The additional 3 constants (`patchKitsByKitIdRole`, `postKitsPickListsByKitIdRole`, `postKitsShoppingListsByKitIdRole`) are UX gating recommendations, not lint requirements. The implementer should understand this distinction to avoid confusion about what is mandatory vs. recommended.

**Fix suggestion:** Add a note in the `kit-detail.tsx` guidance clarifying which constants are lint-required (the 3 directly imported) vs. which are recommended for UX gating of trigger buttons. This is informational and does not block implementation.

**Confidence:** Medium

---

**Minor -- `kit-attachment-section.tsx` also uses `useSetAttachmentSetCover` from a custom hook, not directly from generated hooks**

**Evidence:** `plan.md:410` says to wrap "delete and set-cover action buttons" using `deleteAttachmentSetsAttachmentsBySetIdAndAttachmentIdRole`. Looking at the actual file (`kit-attachment-section.tsx:6-7`), the set-cover action uses `useSetAttachmentSetCover` imported from `@/hooks/use-attachment-set-cover`, which is a custom hook wrapper. The ESLint rule only flags the direct import of `useDeleteAttachmentSetsAttachmentsBySetIdAndAttachmentId` on line 7.

**Why it matters:** The set-cover action is already covered by the custom hook's role constant (which will be re-exported from `use-attachment-set-cover.ts` in Slice 1). Wrapping the set-cover button in `<Gate>` is a UX recommendation, not a lint requirement. The implementer should import the cover role constant from the hook re-export if choosing to gate that action.

**Fix suggestion:** Clarify that the set-cover Gate wrapping is optional UX gating. If applied, import the constant from `@/hooks/use-attachment-set-cover` (the re-export), not from the generated layer.

**Confidence:** Medium

---

**Minor -- The plan does not specify which Playwright spec files to run in the verification slice**

**Evidence:** `plan.md:448` says "Run existing Playwright tests against the affected pages -- expect all green" but does not enumerate the affected spec files or glob patterns.

**Why it matters:** An implementer may run only a subset of specs and miss a breakage in an untested page. Since 13 component/route files are touched across boxes, kits, parts, pick-lists, and shopping-lists, the verification should cover all five feature domains.

**Fix suggestion:** Add a note in Slice 4 listing the relevant spec directories or a command like `pnpm playwright test tests/e2e/boxes tests/e2e/kits tests/e2e/parts tests/e2e/pick-lists tests/e2e/shopping-lists`. This is informational; running the full suite is always acceptable.

**Confidence:** Low

## 6) Derived-Value & State Invariants (table)

- Derived value: `authorized` flag inside Gate
  - Source dataset: `usePermissions().hasRole(role)` for each role in the `requires` prop, sourced from `AuthContext.user.roles` (unfiltered).
  - Write / cleanup triggered: None. Purely drives conditional rendering.
  - Guards: `AuthGate` prevents the tree from rendering before auth resolves, ensuring `user` is non-null.
  - Invariant: `authorized` must stay in sync with `AuthContext`. React context subscription guarantees re-render on context change. No stale data risk.
  - Evidence: `plan.md:227-232`, `gate.tsx:39-53`, `use-permissions.ts:26-34`

- Derived value: Role constant re-exports from custom hooks
  - Source dataset: Static constants imported from `@/lib/api/generated/roles` (unfiltered, compile-time values).
  - Write / cleanup triggered: None. These are `export { X } from '...'` re-exports with no runtime behavior.
  - Guards: ESLint rule enforces import pairing at lint time. TypeScript enforces type correctness.
  - Invariant: Re-exported constants must remain in sync with `roles.ts`. Running `pnpm generate:api` keeps them aligned. No filtered-view-to-persistent-write concern.
  - Evidence: `plan.md:234-239`, `roles.ts:1-68`

- Derived value: ESLint rule severity (`warn` -> `error`)
  - Source dataset: Configuration value in `eslint.config.js` (unfiltered scalar).
  - Write / cleanup triggered: Changing to `error` makes CI block on missing role imports. This is a persistent enforcement change.
  - Guards: Slices 1-2 must complete first (`plan.md:431`). `pnpm check` verification step (`plan.md:447`) confirms zero violations before promotion.
  - Invariant: After promotion, every file importing from `@/lib/api/generated/hooks` must also import the corresponding role constant. New mutation hook usage without role imports will fail CI.
  - Evidence: `plan.md:241-246`, `eslint.config.js:50-53`

## 7) Risks & Mitigations (top 3)

- Risk: Promoting ESLint rule to `error` while a parallel PR introduces new mutation hook usage without role imports, causing CI failures on that unrelated PR.
- Mitigation: The plan sequences the promotion as the final commit (`plan.md:428-431`). Merge the PR promptly after promotion to minimize the window where other PRs could conflict.
- Evidence: `plan.md:463-465`

- Risk: Over-wrapping hides read-only content from viewers when Gate is accidentally applied to display elements.
- Mitigation: The plan restricts Gate wrapping to mutation-triggering interactive elements only (`plan.md:270`). Code review enforces this boundary. Backend continues to enforce roles regardless.
- Evidence: `plan.md:268-272`, `gate.tsx:1-7`

- Risk: Gate wrapping breaks Playwright selectors by changing DOM nesting.
- Mitigation: Gate renders via fragment (`<>{children}</>` at `gate.tsx:49,52`), adding no DOM nodes. This is a negligible risk confirmed by source inspection.
- Evidence: `plan.md:455-457`, `gate.tsx:49,52`

## 8) Confidence

Confidence: High -- the plan has been updated to address the two issues from the initial review. The import strategy is now explicit, the semantic constant guidance is clear, and the remaining findings are minor informational items that do not affect implementation correctness.
