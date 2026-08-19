# Role Gating Wiring -- Technical Plan

## 0) Research Log & Findings

**Searched areas:** All 26 files flagged by `role-gating/role-import-enforcement`, the Gate component (`src/components/auth/gate.tsx`), `usePermissions` hook (`src/hooks/use-permissions.ts`), generated role constants (`src/lib/api/generated/roles.ts`), the role-map JSON (`src/lib/api/generated/role-map.json`), the ESLint rule source (`scripts/eslint-rules/role-import-enforcement.js`), the ESLint config (`eslint.config.js`), and the infrastructure plan execution report (`docs/features/role_gating_infrastructure/plan_execution_report.md`).

**Key findings:**

- Running `npx eslint 'src/**/*.{ts,tsx}'` produces exactly **52 warnings** across **26 files** (13 hook files, 12 component files, 1 route file). The change brief lists 15 hook files but 2 of those (`use-kit-contents.ts`, `use-shopping-lists.ts`) are already accounted for in the 13 distinct hook files flagged by ESLint. The change brief also lists 10 component files -- ESLint confirms 12 component/route files (the `box-list.tsx` was missing from the brief's component list, as it directly imports `usePostBoxes`).
- The ESLint rule (`role-import-enforcement`) only checks that role constants are **imported** alongside mutation hooks. It does not verify that `<Gate>` wraps interactive elements. The Gate wiring in component files is a design-level concern enforced by code review, not by the linter.
- The `Gate` component (`src/components/auth/gate.tsx`) accepts `requires: RequiredRole | RequiredRole[]` and an optional `fallback: ReactNode`. It uses `usePermissions` to check roles.
- All role constants in `roles.ts` currently resolve to `"editor"`. The `RequiredRole` union type is `"editor"`.
- Hook files are pure wrappers -- they do not render UI. For hooks, the change is import-only: import role constants and re-export them.
- Component/route files contain interactive elements (buttons, forms, dialogs) that trigger mutations. These need `<Gate>` wrapping.
- The test user in Playwright specs already has the `editor` role (confirmed by `tests/infrastructure/auth/` specs), so `<Gate>` will render children for all existing tests.

**Conflicts resolved:**

- The change brief lists 15 hook files but only 13 are unique ESLint-flagged hook files. Two files in the brief's hook list (`use-kit-contents.ts`, `use-pick-list-execution.ts`) are legitimate hook files that do appear in the warning output. The brief may have counted by hand; the ESLint output is authoritative for the 26-file total.
- `box-list.tsx` imports `usePostBoxes` directly but was not in the brief's component list. ESLint confirms it needs treatment. The 26-file total in the brief is correct because it includes all hook + component + route files.

---

## 1) Intent & Scope

**User intent**

Wire the existing `Gate` component and generated role constants into every file that currently triggers `role-gating/role-import-enforcement` warnings, then promote the ESLint rule from `warn` to `error` so that future mutations are always paired with role gating.

**Prompt quotes**

"Wire the Gate component and role constants into all existing files that import mutation hooks, satisfying the role-gating/role-import-enforcement ESLint rule. Once complete, promote the ESLint rule from warn to error."

**In scope**

- Import role constants into all 26 flagged files (13 hooks, 12 components, 1 route).
- Re-export role constants from hook files so consuming components can import them alongside the hooks they already use.
- Wrap editor-only interactive elements in component/route files with `<Gate requires={...}>`.
- Use `<Gate fallback={...}>` for inline controls where hiding would shift layout (e.g., inline action buttons in table rows).
- Promote the ESLint rule severity from `warn` to `error` in `eslint.config.js`.
- Verify `pnpm check` passes with 0 errors and 0 warnings from the role-gating rule.
- Verify no existing Playwright tests break.

**Out of scope**

- Adding new Playwright specs for role-gated rendering (deferred to a follow-up that tests viewer-role behavior).
- Modifying the `Gate` component or `usePermissions` hook.
- Changing the generated `roles.ts` or `role-map.json`.
- Modifying backend role assignments.

**Assumptions / constraints**

- The test backend authenticates Playwright's test user with the `editor` role, so `<Gate requires="editor">` will always render children in existing specs. No test breakage is expected from the wiring.
- All role constants currently resolve to `"editor"`. When future roles are added, the same pattern extends naturally.
- Components that import mutation hooks via custom hooks (not directly from generated hooks) are not flagged by the ESLint rule. Only direct imports from `@/lib/api/generated/hooks` trigger warnings.

---

## 1a) User Requirements Checklist

**User Requirements Checklist**

- [ ] All 26 files with role-gating lint warnings have the corresponding role constant imported
- [ ] Hook files re-export role constants so consuming components can access them
- [ ] Component and route files wrap editor-only interactive elements in `<Gate requires={...}>`
- [ ] `<Gate fallback={...}>` is used for inline controls where hiding would shift layout
- [ ] ESLint rule severity promoted from `warn` to `error` in `eslint.config.js`
- [ ] `pnpm check` passes with 0 errors and 0 warnings from the role-gating rule
- [ ] No existing Playwright tests are broken by the Gate wiring

---

## 2) Affected Areas & File Map

### Hook files (13) -- import and re-export role constants

Each hook file imports mutation hooks from `@/lib/api/generated/hooks`. The fix is to add a parallel import of the corresponding role constant(s) from `@/lib/api/generated/roles` and re-export them so consuming components do not need to reach into the generated layer.

- Area: `src/hooks/use-parts.ts`
- Why: Uses `usePostInventoryPartsStockByPartKey`, `useDeleteInventoryPartsStockByPartKey`. Needs `postInventoryPartsStockByPartKeyRole`, `deleteInventoryPartsStockByPartKeyRole`.
- Evidence: `src/hooks/use-parts.ts:4-5` -- import of two mutation hooks without role constants.

- Area: `src/hooks/use-sellers.ts`
- Why: Uses `usePostSellers`, `usePutSellersBySellerId`, `useDeleteSellersBySellerId`. Needs 3 role constants.
- Evidence: `src/hooks/use-sellers.ts:4-6` -- three mutation hook imports.

- Area: `src/hooks/use-types.ts`
- Why: Uses `usePostTypes`, `usePutTypesByTypeId`, `useDeleteTypesByTypeId`. Needs 3 role constants.
- Evidence: `src/hooks/use-types.ts:4-6` -- three mutation hook imports.

- Area: `src/hooks/use-shopping-lists.ts`
- Why: Uses 9 mutation hooks (`usePostShoppingLists`, `usePutShoppingListsByListId`, `useDeleteShoppingListsByListId`, `usePostPartsShoppingListMembershipsByPartKey`, `usePutShoppingListLinesByLineId`, `useDeleteShoppingListLinesByLineId`, `usePutShoppingListsStatusByListId`, `usePostShoppingListLinesReceiveByLineId`, `usePostShoppingListLinesCompleteByLineId`). Needs 9 role constants.
- Evidence: `src/hooks/use-shopping-lists.ts:6-14` -- nine mutation hook imports.

- Area: `src/hooks/use-kit-contents.ts`
- Why: Uses `useDeleteKitsContentsByKitIdAndContentId`, `usePatchKitsContentsByKitIdAndContentId`, `usePostKitsContentsByKitId`. Needs 3 role constants.
- Evidence: `src/hooks/use-kit-contents.ts:4-6` -- three mutation hook imports.

- Area: `src/hooks/use-kit-create.ts`
- Why: Uses `usePostKits`. Needs `postKitsRole`.
- Evidence: `src/hooks/use-kit-create.ts:4` -- one mutation hook import.

- Area: `src/hooks/use-kit-shopping-list-links.ts`
- Why: Uses `usePostKitsShoppingListsByKitId`, `useDeleteKitShoppingListLinksByLinkId`. Needs 2 role constants.
- Evidence: `src/hooks/use-kit-shopping-list-links.ts:4-5` -- two mutation hook imports.

- Area: `src/hooks/use-pick-list-execution.ts`
- Why: Uses `usePostPickListsLinesPickByPickListIdAndLineId`, `usePostPickListsLinesUndoByPickListIdAndLineId`. Needs 2 role constants.
- Evidence: `src/hooks/use-pick-list-execution.ts:5-6` -- two mutation hook imports.

- Area: `src/hooks/use-pick-list-line-quantity-update.ts`
- Why: Uses `usePatchPickListsLinesByPickListIdAndLineId`. Needs 1 role constant.
- Evidence: `src/hooks/use-pick-list-line-quantity-update.ts:5` -- one mutation hook import.

- Area: `src/hooks/use-seller-group-mutations.ts`
- Why: Uses `usePostShoppingListsSellerGroupsByListId`, `useDeleteShoppingListsSellerGroupsByListIdAndSellerId`, `usePutShoppingListsSellerGroupsByListIdAndSellerId`. Needs 3 role constants.
- Evidence: `src/hooks/use-seller-group-mutations.ts:12-14` -- three mutation hook imports.

- Area: `src/hooks/use-attachment-set-cover.ts`
- Why: Uses `usePutAttachmentSetsCoverBySetId`. Needs 1 role constant.
- Evidence: `src/hooks/use-attachment-set-cover.ts:2` -- one mutation hook import.

- Area: `src/hooks/use-part-documents.ts`
- Why: Uses `useDeleteAttachmentSetsAttachmentsBySetIdAndAttachmentId`. Needs 1 role constant.
- Evidence: `src/hooks/use-part-documents.ts:2` -- one mutation hook import.

- Area: `src/hooks/use-url-preview.ts`
- Why: Uses `usePostPartsAttachmentPreview`. Needs 1 role constant.
- Evidence: `src/hooks/use-url-preview.ts:3` -- one mutation hook import.

### Component files (12) -- import role constants and wrap elements in `<Gate>`

Each component file imports mutation hooks directly from generated hooks. The fix is: (a) add role constant imports, and (b) wrap mutation-triggering interactive elements in `<Gate requires={...}>` (or `<Gate fallback={...}>` where hiding would shift layout).

- Area: `src/components/boxes/box-details.tsx`
- Why: Directly imports `usePutBoxesByBoxNo`, `useDeleteBoxesByBoxNo`. The "Edit Box" and "Delete Box" buttons in the `actions` block need Gate wrapping.
- Evidence: `src/components/boxes/box-details.tsx:6-7` -- two mutation hook imports; lines 246-257 -- action buttons.

- Area: `src/components/boxes/box-list.tsx`
- Why: Directly imports `usePostBoxes`. The "Add Box" button and empty-state CTA need Gate wrapping.
- Evidence: `src/components/boxes/box-list.tsx:12` -- one mutation hook import; lines 133-140 -- add button; lines 241-244 -- empty-state CTA.

- Area: `src/components/kits/kit-detail.tsx`
- Why: Directly imports `usePostKitsArchiveByKitId`, `usePostKitsUnarchiveByKitId`, `useDeleteKitsByKitId`. Action buttons (archive, unarchive, delete, edit metadata, create pick list, add shopping list) need Gate wrapping.
- Evidence: `src/components/kits/kit-detail.tsx:32-34` -- three mutation hook imports.

- Area: `src/components/kits/kit-metadata-dialog.tsx`
- Why: Directly imports `usePatchKitsByKitId`. The entire dialog is editor-only; the parent caller (kit-detail) gates the trigger button.
- Evidence: `src/components/kits/kit-metadata-dialog.tsx:11` -- one mutation hook import.

- Area: `src/components/kits/kit-attachment-section.tsx`
- Why: Directly imports `useDeleteAttachmentSetsAttachmentsBySetIdAndAttachmentId`. Delete and set-cover actions need Gate wrapping.
- Evidence: `src/components/kits/kit-attachment-section.tsx:7` -- one mutation hook import.

- Area: `src/components/kits/kit-pick-list-create-dialog.tsx`
- Why: Directly imports `usePostKitsPickListsByKitId`, `usePostKitsPickListsPreviewByKitId`. The dialog is editor-only; parent gates the trigger.
- Evidence: `src/components/kits/kit-pick-list-create-dialog.tsx:21-22` -- two mutation hook imports.

- Area: `src/components/parts/part-details.tsx`
- Why: Directly imports `useDeletePartsByPartKey`. The delete action, edit button, add-document button, add-to-list button, and AI cleanup button need Gate wrapping.
- Evidence: `src/components/parts/part-details.tsx:30` -- one mutation hook import.

- Area: `src/components/parts/part-form.tsx`
- Why: Directly imports `usePostParts`, `usePutPartsByPartKey`, `usePostPartsCopyAttachment`. The entire form is editor-only; callers gate the trigger, but the import needs the constant.
- Evidence: `src/components/parts/part-form.tsx:9` -- three mutation hook imports.

- Area: `src/components/parts/ai-part-dialog.tsx`
- Why: Directly imports `usePostAiPartsCreate`. The dialog is editor-only; callers gate the trigger.
- Evidence: `src/components/parts/ai-part-dialog.tsx:9` -- one mutation hook import.

- Area: `src/components/parts/ai-part-cleanup-merge-step.tsx`
- Why: Directly imports `usePutPartsByPartKey`. The merge/apply step is inside an already-gated dialog flow.
- Evidence: `src/components/parts/ai-part-cleanup-merge-step.tsx:11` -- one mutation hook import.

- Area: `src/components/parts/seller-link-section.tsx`
- Why: Directly imports `usePostPartsSellerLinksByPartKey`, `useDeletePartsSellerLinksByPartKeyAndSellerLinkId`. The "Add Seller Link" form and remove buttons need Gate wrapping.
- Evidence: `src/components/parts/seller-link-section.tsx:9-10` -- two mutation hook imports.

- Area: `src/components/pick-lists/pick-list-detail.tsx`
- Why: Directly imports `useDeletePickListsByPickListId`. The delete action needs Gate wrapping.
- Evidence: `src/components/pick-lists/pick-list-detail.tsx:18` -- one mutation hook import.

### Route file (1)

- Area: `src/routes/shopping-lists/$listId.tsx`
- Why: Directly imports `usePostShoppingListsLinesByListId`. The "Add Line" flow and mutation-triggering buttons need Gate wrapping.
- Evidence: `src/routes/shopping-lists/$listId.tsx:21` -- one mutation hook import.

### Config file (1)

- Area: `eslint.config.js`
- Why: Promote `role-gating/role-import-enforcement` from `'warn'` to `'error'`.
- Evidence: `eslint.config.js:53` -- `'role-gating/role-import-enforcement': 'warn'`.

---

## 3) Data Model / Contracts

No data model or API contract changes. The role constants are already generated and the `RequiredRole` type is already defined. This change only wires existing constants into consuming files.

---

## 4) API / Integration Surface

No new API surfaces. The `Gate` component consumes the `usePermissions` hook which reads from `AuthContext`. No network calls are added or changed.

---

## 5) Algorithms & UI Flows

- Flow: Gate rendering decision
- Steps:
  1. Component mounts and renders a `<Gate requires="editor">` wrapper around editor-only elements.
  2. `Gate` calls `usePermissions().hasRole("editor")`.
  3. `usePermissions` reads `user.roles` from `AuthContext`.
  4. If the user has the `editor` role, `Gate` renders `children`.
  5. If the user lacks the role and a `fallback` is provided, `Gate` renders the fallback.
  6. If the user lacks the role and no fallback is given, `Gate` renders nothing.
- States / transitions: The Gate is purely declarative; no state transitions. It re-renders when the auth context changes (e.g., role change on re-login).
- Hotspots: None. The `hasRole` check is a simple `Array.includes` on a short array.
- Evidence: `src/components/auth/gate.tsx:39-53`

---

## 6) Derived State & Invariants

- Derived value: `authorized` flag inside Gate
  - Source: `usePermissions().hasRole(role)` for each role in the `requires` array, derived from `AuthContext.user.roles`.
  - Writes / cleanup: None. The flag only drives rendering.
  - Guards: `AuthGate` prevents the app tree from rendering before auth resolves, so `user` is always non-null.
  - Invariant: `authorized` must stay in sync with `AuthContext`. If the user's roles change (e.g., demotion), `Gate` must re-evaluate. This is automatic because `useAuthContext` triggers re-renders on context changes.
  - Evidence: `src/components/auth/gate.tsx:46`, `src/hooks/use-permissions.ts:29-31`

- Derived value: role constant re-exports from hooks
  - Source: Constants imported from `@/lib/api/generated/roles`.
  - Writes / cleanup: None. These are static re-exports.
  - Guards: The ESLint rule enforces that every mutation hook import is paired with its role constant.
  - Invariant: `pnpm generate:api` must be run when endpoints change to keep constants in sync with the role-map.
  - Evidence: `src/lib/api/generated/roles.ts`, `src/lib/api/generated/role-map.json`

- Derived value: ESLint rule severity
  - Source: `eslint.config.js` config value.
  - Writes / cleanup: Changing `'warn'` to `'error'` means `pnpm check` will fail on missing role imports.
  - Guards: CI runs `pnpm check` on every PR.
  - Invariant: After promotion, all files importing mutation hooks must also import the corresponding role constant. Any new mutation hook usage must include the role import or CI will fail.
  - Evidence: `eslint.config.js:53`

---

## 7) State Consistency & Async Coordination

- Source of truth: `AuthContext` for the user's roles.
- Coordination: `Gate` reads roles synchronously from context. No caching or derived stores beyond React's context system.
- Async safeguards: `AuthGate` (the authentication boundary) prevents the component tree from rendering until the user object is available. This guarantees `usePermissions` always has a valid user.
- Instrumentation: No new instrumentation events for this change. The Gate renders or hides elements but does not emit events. Instrumentation events from forms and lists continue to fire as before because the test user holds the `editor` role.
- Evidence: `src/components/auth/auth-gate.tsx`, `src/hooks/use-permissions.ts:26-34`

---

## 8) Errors & Edge Cases

- Failure: User lacks the `editor` role
- Surface: Any component with `<Gate requires="editor">` wrapping.
- Handling: `Gate` hides the wrapped element (renders `null`) or shows the `fallback` if provided. The user sees a read-only view. Backend returns 403 if a mutation is somehow triggered without the role.
- Guardrails: `Gate fallback` should show a disabled/tooltip version for inline controls. For standalone action buttons, hiding is acceptable.
- Evidence: `src/components/auth/gate.tsx:48-52`

- Failure: Gate wrapping accidentally hides critical navigation or read-only content
- Surface: Any page where Gate is over-applied.
- Handling: Only mutation-triggering elements (buttons, forms) should be wrapped. Read-only content must remain outside any Gate.
- Guardrails: Code review. The ESLint rule only enforces import pairing, not correct Gate placement.
- Evidence: N/A -- design guideline, not automated.

- Failure: `pnpm check` fails after promotion to `error`
- Surface: CI.
- Handling: All 52 warnings must be resolved before the severity promotion commit. Run `pnpm check` locally to verify.
- Guardrails: Promote severity in the final commit of the change, after all imports are in place.
- Evidence: `eslint.config.js:53`

---

## 9) Observability / Instrumentation

No new instrumentation signals. The Gate component is a rendering wrapper that does not emit test events. Existing `ListLoading`, `Form`, and `UiState` instrumentation events continue to fire as before because:

1. The test user has the `editor` role, so `Gate` renders children.
2. Gate does not intercept or delay child rendering.

If viewer-role testing is added later, a `GateBlocked` event could be emitted, but that is out of scope for this change.

---

## 10) Lifecycle & Background Work

No new lifecycle hooks or effects. `Gate` is a pure render component with no subscriptions, timers, or side effects.

---

## 11) Security & Permissions

- Concern: Authorization -- hiding editor-only UI from viewer-role users.
- Touchpoints: Every component file listed in section 2 that wraps interactive elements in `<Gate>`.
- Mitigation: The `Gate` component checks roles via `usePermissions`. The backend enforces `x-required-role` on every endpoint regardless of frontend gating. Frontend gating is a UX convenience, not a security boundary.
- Residual risk: If `Gate` is misapplied (e.g., wrapping too much or too little), the worst case is a UX issue -- the backend still enforces roles. Accepted because this is a progressive enhancement.
- Evidence: `src/components/auth/gate.tsx:1-7` (docstring), `src/hooks/use-permissions.ts:7-8` (docstring)

---

## 12) UX / UI Impact

- Entry point: All editor-only interactive elements across the application.
- Change: Buttons, forms, and action menus that trigger mutations will be hidden (or replaced with a disabled fallback) for users without the `editor` role.
- User interaction: For editor-role users (the current default), there is no visible change. For future viewer-role users, editor-only controls will be absent or disabled.
- Dependencies: `AuthContext` must provide `user.roles`. The `Gate` component and `usePermissions` hook must be available (already shipped in the infrastructure slice).
- Evidence: `src/components/auth/gate.tsx`

**Fallback strategy:**

Use `<Gate fallback={...}>` in these situations:
- Inline action buttons in table rows (e.g., delete icons in seller-link-section, kit-attachment-section) where hiding would leave an empty column or misalign the row.
- Toolbar buttons adjacent to read-only content where hiding would noticeably shift layout.

Use bare `<Gate>` (no fallback, renders nothing) in these situations:
- Standalone action buttons in header action bars (e.g., "Add Box", "Edit Box", "Delete Box").
- Floating action buttons and empty-state CTAs.
- Entire dialog/form components that are only opened by already-gated trigger buttons.

---

## 13) Deterministic Test Plan

- Surface: All pages with Gate-wrapped elements
- Scenarios:
  - Given the test user has the `editor` role, When any page with Gate-wrapped elements loads, Then all interactive elements render normally and existing Playwright tests pass without modification.
  - Given the ESLint rule is promoted to `error`, When `pnpm check` is run, Then 0 errors and 0 warnings from `role-gating/role-import-enforcement` are reported.
- Instrumentation / hooks: No new `data-testid` attributes. Existing selectors continue to work because Gate renders children for editor-role users.
- Gaps: Viewer-role rendering tests are deferred to a follow-up. Justification: the current test infrastructure does not provision viewer-role users, and the change brief explicitly marks this as out of scope.
- Evidence: `tests/infrastructure/auth/auth.spec.ts` (confirms editor-role test user), `eslint.config.js:53`

---

## 14) Implementation Slices

- Slice: 1 -- Hook file role constant imports
- Goal: Satisfy the ESLint rule for all 13 hook files and make role constants available for downstream component use.
- Touches: `src/hooks/use-parts.ts`, `src/hooks/use-sellers.ts`, `src/hooks/use-types.ts`, `src/hooks/use-shopping-lists.ts`, `src/hooks/use-kit-contents.ts`, `src/hooks/use-kit-create.ts`, `src/hooks/use-kit-shopping-list-links.ts`, `src/hooks/use-pick-list-execution.ts`, `src/hooks/use-pick-list-line-quantity-update.ts`, `src/hooks/use-seller-group-mutations.ts`, `src/hooks/use-attachment-set-cover.ts`, `src/hooks/use-part-documents.ts`, `src/hooks/use-url-preview.ts`
- Dependencies: None. This is a pure import/re-export change.

Pattern for each hook file:

```typescript
// Add alongside existing generated-hooks import:
import {
  <roleConstantName>,
} from '@/lib/api/generated/roles';

// Re-export at bottom of file:
export { <roleConstantName> } from '@/lib/api/generated/roles';
```

When a hook file has multiple mutation hooks, import and re-export all corresponding role constants. Group them in a single import statement and a single re-export statement for readability.

- Slice: 2 -- Component and route file Gate wiring
- Goal: Import role constants into all 12 component files and 1 route file, wrap editor-only interactive elements in `<Gate>`.
- Touches: `src/components/boxes/box-details.tsx`, `src/components/boxes/box-list.tsx`, `src/components/kits/kit-detail.tsx`, `src/components/kits/kit-metadata-dialog.tsx`, `src/components/kits/kit-attachment-section.tsx`, `src/components/kits/kit-pick-list-create-dialog.tsx`, `src/components/parts/part-details.tsx`, `src/components/parts/part-form.tsx`, `src/components/parts/ai-part-dialog.tsx`, `src/components/parts/ai-part-cleanup-merge-step.tsx`, `src/components/parts/seller-link-section.tsx`, `src/components/pick-lists/pick-list-detail.tsx`, `src/routes/shopping-lists/$listId.tsx`
- Dependencies: Slice 1 must be complete so that hooks re-export role constants.

Import strategy for role constants:

- **Prefer hook re-exports** when the component already imports a custom hook from `src/hooks/`. For example, if a component imports `useAddStock` from `@/hooks/use-parts`, import the role constant from the same hook file: `import { postInventoryPartsStockByPartKeyRole } from '@/hooks/use-parts'`.
- **Use direct import from `@/lib/api/generated/roles`** only when the component imports the mutation hook directly from `@/lib/api/generated/hooks` (i.e., there is no custom hook wrapper to re-export from).
- **Always use the semantically correct role constant** for each `<Gate>` wrapper. Each action button should use the constant that corresponds to the mutation it protects. Since all constants currently resolve to `"editor"`, there is no behavioral difference, but using the correct constant per action communicates intent and is future-proof if roles diverge.

Pattern for each component/route file:

```typescript
// Option A: Import role constant from the hook re-export (preferred):
import { useAddStock, postInventoryPartsStockByPartKeyRole } from '@/hooks/use-parts';

// Option B: Import from generated roles (when using generated hooks directly):
import { postBoxesRole } from '@/lib/api/generated/roles';

// Always import Gate:
import { Gate } from '@/components/auth/gate';

// Wrap interactive elements:
<Gate requires={<roleConstantName>}>
  <Button onClick={handleMutation}>...</Button>
</Gate>

// Or with fallback for inline controls:
<Gate
  requires={<roleConstantName>}
  fallback={<Button disabled title="Editor role required">...</Button>}
>
  <Button onClick={handleMutation}>...</Button>
</Gate>
```

Detailed guidance per component:

**`box-details.tsx`**: Wrap the "Edit Box" button with `<Gate requires={putBoxesByBoxNoRole}>` and the "Delete Box" button with `<Gate requires={deleteBoxesByBoxNoRole}>`. Import both constants from `@/lib/api/generated/roles` (this file imports the mutation hooks directly from generated hooks).

**`box-list.tsx`**: Wrap the "Add Box" button returned by `renderAddButton()` and the empty-state CTA. Use `postBoxesRole`.

**`kit-detail.tsx`**: Wrap each action button with its semantically matching role constant: archive with `postKitsArchiveByKitIdRole`, unarchive with `postKitsUnarchiveByKitIdRole`, delete with `deleteKitsByKitIdRole`. The edit-metadata trigger, create-pick-list trigger, and add-shopping-list trigger should each use the role constant corresponding to their mutation (`patchKitsByKitIdRole`, `postKitsPickListsByKitIdRole`, `postKitsShoppingListsByKitIdRole`). Import all constants from `@/lib/api/generated/roles` (this file imports the mutation hooks directly from generated hooks).

**`kit-metadata-dialog.tsx`**: Import role constant to satisfy lint rule. The dialog is only opened by an already-gated trigger, so no additional Gate wrapping inside the dialog is needed.

**`kit-attachment-section.tsx`**: Wrap delete and set-cover action buttons. Use `deleteAttachmentSetsAttachmentsBySetIdAndAttachmentIdRole`.

**`kit-pick-list-create-dialog.tsx`**: Import role constants to satisfy lint rule. Dialog is opened by an already-gated trigger.

**`part-details.tsx`**: Wrap each action with its semantically matching role constant: the delete button with `deletePartsByPartKeyRole`, the edit button with `putPartsByPartKeyRole` (imported from `@/lib/api/generated/roles` since `usePutPartsByPartKey` is not used directly in this file -- the edit navigates to a route). The add-document button, add-to-shopping-list button, and AI cleanup button live in the "More Actions" dropdown; wrap the dropdown trigger or individual items with appropriate constants. Since this file only directly imports `useDeletePartsByPartKey`, the ESLint rule only requires `deletePartsByPartKeyRole`. The other action buttons are UX gating (not lint-required) and can use `deletePartsByPartKeyRole` as a convenience, or a single wrapping `<Gate requires="editor">` around the entire actions block.

**`part-form.tsx`**: Import role constants to satisfy lint rule. The form is rendered inside a route or dialog that is already gated by the caller.

**`ai-part-dialog.tsx`**: Import role constant to satisfy lint rule. Dialog is opened by an already-gated trigger.

**`ai-part-cleanup-merge-step.tsx`**: Import role constant to satisfy lint rule. This step is inside an already-gated dialog flow.

**`seller-link-section.tsx`**: Wrap the "Add Seller Link" form toggle with `<Gate requires={postPartsSellerLinksByPartKeyRole}>` (bare Gate, renders nothing for viewers). Wrap individual remove buttons with `<Gate requires={deletePartsSellerLinksByPartKeyAndSellerLinkIdRole} fallback={...}>` using a disabled trash icon button as the fallback to maintain row layout: `fallback={<Button variant="ghost" size="sm" className="ml-auto flex-shrink-0 h-7 w-7 p-0" disabled title="Editor role required"><Trash2 className="h-4 w-4 opacity-50" /></Button>}`.

**`pick-list-detail.tsx`**: Wrap the delete action button. Use `deletePickListsByPickListIdRole`.

**`$listId.tsx` (shopping list route)**: Import role constant to satisfy lint rule. Wrap the "Add Line" button and mutation-triggering inline controls.

- Slice: 3 -- ESLint severity promotion
- Goal: Lock down the rule so future violations block CI.
- Touches: `eslint.config.js`
- Dependencies: Slices 1 and 2 must be complete. Run `pnpm check` to verify 0 warnings before this change.

Change in `eslint.config.js`:
```
- 'role-gating/role-import-enforcement': 'warn',
+ 'role-gating/role-import-enforcement': 'error',
```

Also remove or update the soft-launch comment on lines 50-52 to reflect that the rule is now enforced.

- Slice: 4 -- Verification
- Goal: Confirm all requirements are met.
- Touches: No files; execution-only.
- Dependencies: Slices 1-3 complete.

Steps:
1. Run `pnpm check` -- expect 0 errors and 0 warnings from `role-gating/role-import-enforcement`.
2. Run existing Playwright tests against the affected pages -- expect all green.
3. Manually verify that the `editor`-role test user sees all interactive elements.

---

## 15) Risks & Open Questions

- Risk: Gate wrapping breaks a Playwright selector by changing DOM nesting (Gate adds a React fragment wrapper).
- Impact: A Playwright test fails because a `data-testid` query that relied on a specific parent-child relationship no longer matches.
- Mitigation: Gate renders via `<>{children}</>` (fragment), so it adds no DOM nodes. Risk is negligible. Run all Playwright specs as part of verification.

- Risk: Over-wrapping hides read-only content from viewers.
- Impact: Viewer-role users cannot see content they should be able to read.
- Mitigation: Only wrap mutation-triggering interactive elements. Leave all display content, lists, and navigation outside of Gate. Code review enforces this boundary.

- Risk: Promoting ESLint rule to `error` while some files are not yet updated.
- Impact: `pnpm check` fails in CI for unrelated PRs.
- Mitigation: Promote severity in the same PR as the wiring changes, and only after confirming all 52 warnings are resolved. The severity promotion commit must come last.

---

## 16) Confidence

Confidence: High -- the change is mechanical (import + re-export + wrap), the Gate component is already tested, the ESLint rule provides automated verification, and the test user holds the `editor` role so no existing specs will break.
