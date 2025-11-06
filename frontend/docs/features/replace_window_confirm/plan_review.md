# Plan Review: Replace window.confirm with ConfirmDialog

## 1) Summary & Decision

**Readiness**

The updated plan successfully addresses all four major conditions from the first review. The JSX rendering location is now precisely specified with line numbers and pattern evidence. Test migration details include both confirmation and cancellation paths with exact selector patterns and backend verification. The cursor styling solution correctly handles disabled states using Tailwind's `data-[disabled]:` variant. Unmount behavior is documented with a clear validation checkpoint. The plan follows the box-details reference pattern, provides complete test migration guidance, and maintains instrumentation continuity.

**Decision**

`GO` — All major conditions resolved. The plan is implementation-ready with clear technical guidance, complete test coverage strategy, and validated patterns from existing code.

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `docs/commands/plan_feature.md` — Pass — `plan.md:3-22` — Research log documents discovery work with file/line evidence for each referenced component, hook, and test: "Examined existing `useConfirm` hook pattern in `src/hooks/use-confirm.ts` (lines 1-65)" and six additional discovery entries
- `docs/commands/plan_feature.md` — Pass — `plan.md:24-56` — Intent & Scope uses the required template with verbatim prompt quotes: `"Replace window.confirm() with the useConfirm hook and ConfirmDialog component, matching the pattern used in src/components/boxes/box-details.tsx (lines 208-217)"`
- `docs/commands/plan_feature.md` — Pass — `plan.md:59-71` — Affected Areas provide evidence with exact line ranges for all three files: `src/components/kits/kit-detail.tsx:315-317`, `src/components/ui/dropdown-menu.tsx:91`, and `tests/e2e/kits/kit-detail.spec.ts:1330-1337`
- `docs/commands/plan_feature.md` — Pass — `plan.md:189-205` — Deterministic Test Plan documents both scenarios (confirmation and cancellation), instrumentation hooks (dialog role selector with accessible name matching, button selectors), and explicitly addresses the cancellation gap: "The cancellation scenario should be added to the existing test"
- `docs/contribute/testing/playwright_developer_guide.md` — Pass — `plan.md:194-204` — Test migration replaces `page.once('dialog')` event listener with standard `page.getByRole('dialog', { name: 'Delete Kit' })` selector matching accessible name from `DialogTitle`, follows role-based selector pattern from developer guide, and provides exact button selectors using `confirmText` and `cancelText` props
- `docs/contribute/testing/playwright_developer_guide.md` — Pass — `plan.md:202` — Dialog visibility assertion acknowledges Radix UI `data-state` attributes and defers to Playwright's automatic visibility/actionability waits: "Playwright automatically waits for elements to be visible and actionable, so no explicit waitFor calls are needed"
- `docs/contribute/architecture/application_overview.md` — Pass — `plan.md:73-82` — Data Model section correctly describes contract change from synchronous `window.confirm` to `Promise<boolean>` returned by `useConfirm`, notes existing `async` handler allows seamless migration

**Fit with codebase**

- `src/hooks/use-confirm.ts` — `plan.md:61-62, 104` — Correctly identifies direct hook usage pattern (not wrapped custom hook) and specifies JSX rendering location at line 518 after existing dialogs, matching box-details pattern at line 446
- `src/components/ui/dialog.tsx:217` — `plan.md:196-197` — Correctly documents that `DialogTitle` component provides accessible name from the `title` prop for role-based selector matching
- `src/components/ui/dropdown-menu.tsx:91-93` — `plan.md:64-66, 214` — Correctly identifies current `cursor-default` styling at line 91, proposes `'cursor-pointer data-[disabled]:cursor-default'` solution that preserves default cursor for disabled items using existing `data-[disabled]:` variant at line 93
- `tests/e2e/kits/kit-detail.spec.ts:1330-1337` — `plan.md:193-203` — Correctly documents existing test structure using `page.once('dialog')` and provides exact replacement pattern with `page.getByRole('dialog', { name: 'Delete Kit' })` and button selectors

## 3) Open Questions & Ambiguities

No open questions remain. The plan resolves all ambiguities through:

1. **JSX rendering location** — Line 518 specified with pattern evidence from box-details.tsx:446
2. **Test migration** — Complete selector replacement documented with accessible name matching and button role selectors
3. **Cursor styling** — Disabled state handling specified using `data-[disabled]:cursor-default`
4. **Unmount behavior** — Documented with validation checkpoint to confirm no console errors on mid-dialog navigation

All design decisions are grounded in existing codebase patterns with file/line evidence.

## 4) Deterministic Playwright Coverage (new/changed behavior only)

- Behavior: Kit deletion confirmation dialog (replaces native browser dialog with styled component)
- Scenarios:
  - **Confirmation path** (update existing test at lines 1292-1364): Given an active kit with no dependencies, When user clicks "Delete Kit" in ellipsis menu and clicks "Delete" button in dialog, Then `DELETE_FORM_ID` submit/success events fire, kit is deleted, and user navigates to `/kits` overview (`tests/e2e/kits/kit-detail.spec.ts`)
  - **Cancellation path** (extend existing test): Given an active kit, When user clicks "Delete Kit" and clicks "Cancel" button (or presses Escape or clicks backdrop), Then NO `DELETE_FORM_ID` submit event fires, kit is not deleted, and detail view remains visible (`tests/e2e/kits/kit-detail.spec.ts`)
- Instrumentation:
  - Dialog selector: `page.getByRole('dialog', { name: 'Delete Kit' })` matches accessible name from `DialogTitle` at line 217 of dialog.tsx
  - Confirm button: `dialog.getByRole('button', { name: 'Delete' })` matches `confirmText` prop from use-confirm.ts:59
  - Cancel button: `dialog.getByRole('button', { name: 'Cancel' })` matches default `cancelText` prop from use-confirm.ts:60
  - Existing `waitTestEvent` calls for `DELETE_FORM_ID` submit/success remain unchanged at lines 1312-1327
  - Cancellation path asserts NO submit event fires after Cancel/Escape/backdrop click
- Backend hooks: No new backend factories or helpers required; existing kit creation via `testData.kits.create()` and backend deletion verification via `testData.kits.getDetail()` (lines 1298-1363) remain unchanged
- Gaps: Cancellation scenario is documented as extension to existing test but not shown as implemented; this is acceptable as the plan explicitly calls out the gap and provides complete implementation guidance
- Evidence: `plan.md:189-205` — complete test plan with selectors and instrumentation; `src/components/ui/dialog.tsx:217` — DialogTitle provides accessible name; `src/hooks/use-confirm.ts:57-62` — confirmProps with title/confirmText/cancelText; `tests/e2e/kits/kit-detail.spec.ts:1330-1337` — existing dialog listener pattern to replace

## 5) Adversarial Sweep

**Checks attempted:**
- JSX rendering location precision and portal ordering
- Test selector stability across animation states
- Cursor styling impact on app-wide dropdown menus with disabled items
- Unmount behavior and promise cleanup
- Instrumentation event continuity (no changes to form IDs or tracking calls)
- Cache invalidation requirements (none for this change)
- Accessible name matching between DialogTitle and role selector

**Evidence:** `plan.md:61-62, 104, 161, 196-197, 214, 226-228`

**Why the plan holds:**

The plan explicitly addresses all four conditions from the first review:

1. **JSX rendering location** (condition 1 resolved) — Line 518 is precisely specified with evidence from kit-detail.tsx:510-519 showing the closing structure before `</div>`. The pattern matches box-details.tsx:446 where `<ConfirmDialog {...confirmProps} />` is rendered at component root level outside the main layout
2. **Test migration completeness** (condition 2 resolved) — Both confirmation path (update existing test) and cancellation path (extend test) are documented with exact selectors, event assertions, and backend verification. The cancellation path explicitly notes that NO submit event should fire, validating the dialog's cancel behavior
3. **Cursor styling with disabled state** (condition 3 resolved) — The solution `'cursor-pointer data-[disabled]:cursor-default'` correctly applies pointer cursor to enabled items while preserving default cursor for disabled items. The plan references line 93 showing the existing `data-[disabled]:pointer-events-none` rule and notes that manual smoke testing should verify dropdown menus with disabled items
4. **Unmount behavior validation** (condition 4 resolved) — The plan documents the promise resolver cleanup mechanism (lines 38, 43 of use-confirm.ts), notes that Radix UI portal closes automatically on unmount, and specifies a validation checkpoint: "navigate away mid-dialog to confirm no console errors or warnings appear"

No credible implementation risks remain beyond standard testing validation.

## 6) Derived-Value & State Invariants (table)

- Derived value: Delete button enabled state
  - Source dataset: Unfiltered guards checking kit loading state and mutation pending states
  - Write / cleanup triggered: N/A (read-only guard)
  - Guards: `!detail || archiveMutation.isPending || unarchiveMutation.isPending || deleteKitMutation.isPending` prevents concurrent mutations
  - Invariant: User cannot trigger deletion while kit is loading or other lifecycle mutations are in flight
  - Evidence: `plan.md:119-125` — guard logic from kit-detail.tsx:312

- Derived value: Dialog open state
  - Source dataset: `useConfirm` hook internal state managed by promise resolver
  - Write / cleanup triggered: `setState({ open: false, resolve: undefined })` on confirm, cancel, or backdrop dismissal
  - Guards: Promise-based control flow ensures single resolution per dialog instance
  - Invariant: Dialog state is isolated within hook; no cross-component synchronization needed
  - Evidence: `plan.md:127-132` — state coordination from use-confirm.ts:26-50

- Derived value: Confirmation result (true/false)
  - Source dataset: User interaction with dialog buttons or dismissal actions
  - Write / cleanup triggered: `resolve(true)` on confirm button, `resolve(false)` on cancel/backdrop/escape
  - Guards: `if (!confirmed) return;` in `handleDeleteClick` prevents mutation when user cancels
  - Invariant: Mutation and instrumentation events only fire when user explicitly confirms (returns true)
  - Evidence: `plan.md:136-142` — error handling and early return pattern from kit-detail.tsx:319

> No filtered views drive persistent writes or cache mutations. All derived state is read-only guards or isolated dialog state managed by the hook.

## 7) Risks & Mitigations (top 3)

- Risk: Test flakiness if dialog animation interferes with Playwright role selector visibility checks
- Mitigation: Radix UI dialogs include `data-state` attributes for animation coordination; Playwright automatically waits for elements to be visible and actionable before interactions. No explicit `waitFor` calls needed. If flakiness occurs, verify that `data-state="open"` is present on dialog before asserting visibility
- Evidence: `plan.md:222-224` — animation coordination

- Risk: Cursor styling change affects all dropdown menus app-wide, potentially indicating disabled items as interactive
- Mitigation: The `'cursor-pointer data-[disabled]:cursor-default'` solution applies pointer cursor only to enabled items; the `data-[disabled]:` variant at line 93 of dropdown-menu.tsx ensures disabled items retain default cursor. Manual smoke test of dropdown menus with disabled items should confirm correct behavior
- Evidence: `plan.md:226-228` — cursor styling mitigation

- Risk: Component unmount while dialog is open could leave promise unresolved or cause React warnings
- Mitigation: The `useConfirm` hook stores the resolver in component state (line 31 of use-confirm.ts) and clears it when dialog closes (lines 38, 43). Radix UI portal closes automatically on component unmount. Validation checkpoint specifies: "navigate away mid-dialog to confirm no console errors or warnings appear"
- Evidence: `plan.md:161` — unmount behavior documentation

## 8) Confidence

Confidence: High — All four conditions from the first review are fully resolved with precise technical guidance, complete test coverage strategy (including cancellation path), validated patterns from existing code (box-details reference), and explicit validation checkpoints for edge cases (unmount behavior, disabled cursor styling). The plan is implementation-ready.
