# Button System Review — Code Review

## 1) Summary & Decision

**Readiness**

The implementation addresses the majority of button label standardization requirements defined in the plan, successfully updating ~57 button labels across 16 UI component files and 3 test files. Emoji prefixes have been removed, case inconsistencies corrected, and most labels now follow the `<verb> <noun>` pattern. However, **critical gaps exist** in both implementation completeness and test coverage. Specifically: (1) the "Add with AI" button label was not updated despite test expectations being changed, creating a test-vs-UI mismatch; (2) only 3 icon-only buttons received aria-labels when the plan identified 25+ candidates; (3) the "Retry" button at part-details.tsx:357-359 (link badge error state) remains non-compliant; (4) Slice 5 (documentation) is completely missing. These gaps introduce **immediate test failures** and leave accessibility work incomplete.

**Decision**

`GO-WITH-CONDITIONS` — Core button label changes are sound and well-executed, but the following must be addressed before shipping:
1. **BLOCKER**: Fix test-vs-UI mismatch for "Add with AI" button (either update UI to match test or revert test change)
2. **MAJOR**: Complete aria-label audit for remaining 22+ icon-only buttons (plan Slice 4)
3. **MAJOR**: Update "Retry" button at part-details.tsx:357-359 to "Reload Data" or equivalent
4. **MAJOR**: Create button labeling standards documentation (plan Slice 5) to ensure consistency for future development

---

## 2) Conformance to Plan (with evidence)

**Plan alignment**

- **Slice 1 (High Priority — Core Actions)** ↔ Partially implemented across multiple files:
  - `src/components/parts/part-location-grid.tsx:283-441` — "Save" → "Save Quantity", "Cancel" → "Cancel Edit", "Remove" → "Remove Location", "Add" → "Add Location" ✅
  - `src/components/parts/tags-input.tsx:69` — "Add" → "Add Tag" ✅
  - `src/components/parts/part-details.tsx:357-359` — "Retry" → **NOT UPDATED** (still "Retry") ❌
  - `src/components/shopping-lists/ready/update-stock-dialog.tsx:759-781` — "Save" → "Save Stock", "Save & next" → "Save & Next", "Mark Done" → "Complete Item" ✅
  - `src/components/dashboard/low-stock-alerts.tsx:142-194` — "Add" → "Add Stock", "Cancel" → "Cancel Add", emojis removed ✅
  - `src/components/dashboard/documentation-status.tsx:122` — "📄 Add Docs" → "Add Documentation" ✅
  - `src/components/documents/camera-capture.tsx:191-199` — "Retake" → "Retake Photo", "Capture" → "Capture Photo" ✅
  - `src/components/pick-lists/pick-list-detail.tsx:321` — "Retry" → "Reload List" ✅

- **Slice 2 (Medium Priority — Navigation & Secondary Actions)** ↔ Fully implemented:
  - `src/components/parts/ai-part-review-step.tsx:263,503` — "Create" → "Create Type", "Back" → "Go Back" ✅
  - `src/components/parts/ai-part-progress-step.tsx:45,50` — "Try Again" → "Retry Analysis", "Cancel" → "Cancel Analysis" ✅
  - `src/components/shopping-lists/ready/ready-toolbar.tsx:47,60` — "Mark Done" → "Complete List", "Back to Concept" → "Revert to Concept" ✅
  - `src/components/boxes/box-details.tsx:214` — "Back to Boxes" → "View All Boxes" ✅
  - `src/components/documents/add-document-modal.tsx:237` — "Use Camera" → "Capture Photo" ✅
  - `src/components/documents/camera-capture.tsx:194` — "Use Photo" → "Accept Photo" ✅

- **Slice 3 (Low Priority — Polish & Consistency)** ↔ Fully implemented:
  - `src/components/shopping-lists/ready/order-group-dialog.tsx:221` — "Save ordered quantities" → "Save Quantities" ✅
  - `src/components/shopping-lists/ready/order-line-dialog.tsx:177` — "Save ordered quantity" → "Save Quantity" ✅
  - `src/components/shopping-lists/ready/seller-group-order-note-dialog.tsx:178` — "Save changes" → "Save Notes" ✅

- **Slice 4 (Accessibility — Aria-Label Audit)** ↔ Minimally implemented (3/25+):
  - `src/components/dashboard/low-stock-alerts.tsx:184` — Added `aria-label="View Part"` to icon button ✅
  - `src/components/dashboard/documentation-status.tsx:130` — Added `aria-label="View Part"` to icon button ✅
  - `src/components/parts/part-details.tsx:282` — Added `aria-label="More Actions"` to dropdown menu trigger ✅
  - **Remaining 22+ icon-only buttons not addressed** ❌

- **Slice 5 (Documentation & Testing)** ↔ Partially implemented:
  - `tests/support/page-objects/parts-page.ts:34` — Updated "Add with AI" → "Add Part with AI" selector ✅
  - `tests/support/page-objects/shopping-lists-page.ts:363` — Updated "mark done" → "complete list|mark done" regex ✅
  - `tests/e2e/shopping-lists/shopping-lists-detail.spec.ts:242,254` — Updated "save changes" → "save notes" selectors ✅
  - **Button labeling standards documentation (docs/contribute/ui/button_standards.md) not created** ❌

**Gaps / deviations**

- **Plan commitment: Update "Add with AI" button** (`plan.md:118`) — UI component at `src/components/parts/part-list.tsx:220` still displays "Add with AI" instead of "Add Part with AI", but test selector at `tests/support/page-objects/parts-page.ts:34` expects "Add Part with AI". This **mismatch will cause test failures** (`code_path:src/components/parts/part-list.tsx:220`, `code_path:tests/support/page-objects/parts-page.ts:34`)

- **Plan commitment: Update "Retry" button in part-details.tsx** (`plan.md:147`) — The "Retry" button at `src/components/parts/part-details.tsx:357-359` in the link badge error state was not updated. Plan specified "Retry" → "Reload Data", but this button remains as "Retry" without a noun (`code_path:src/components/parts/part-details.tsx:357-359`)

- **Plan commitment: Complete aria-label audit for 25+ icon buttons** (`plan.md:659-680`) — Only 3 icon buttons received aria-labels (dashboard widget arrows and parts menu trigger). The plan identified 25+ icon-only buttons requiring aria-labels, but the remaining 22+ were not addressed (`gap:missing aria-labels`)

- **Plan commitment: Create button_standards.md documentation** (`plan.md:692`) — No documentation file was created at `docs/contribute/ui/button_standards.md` to codify button labeling standards for future contributors (`gap:missing documentation`)

---

## 3) Correctness — Findings (ranked)

- **Title**: `Blocker — Test-vs-UI mismatch for "Add Part with AI" button`
  - **Evidence**: `tests/support/page-objects/parts-page.ts:34` — Test selector changed to `/add part with ai/i`, but `src/components/parts/part-list.tsx:220` — UI still renders "Add with AI"
  - **Impact**: Playwright specs using the parts page object will fail when attempting to click the "Add Part with AI" button, blocking CI/CD pipeline and preventing merge
  - **Fix**: Either (1) update `src/components/parts/part-list.tsx:220` button label to "Add Part with AI" to match test expectation, OR (2) revert `tests/support/page-objects/parts-page.ts:34` to `/add with ai/i` if label change was intentionally deferred
  - **Confidence**: High — Direct inspection of both files confirms the mismatch; test will fail on next execution

- **Title**: `Major — "Retry" button at part-details.tsx missing noun`
  - **Evidence**: `src/components/parts/part-details.tsx:357-359` — `<Button type="button" size="sm" variant="outline" onClick={handleLinkBadgeRetry}>Retry</Button>`
  - **Impact**: Violates established button labeling standard; inconsistent with other "Retry" → "Reload [Object]" changes (pick-list-detail.tsx:321 changed "Retry" → "Reload List"); reduces clarity for users encountering link badge error state
  - **Fix**: Change label to "Reload Data" or "Retry Load" to follow `<verb> <noun>` pattern and align with pick list error handling
  - **Confidence**: High — Plan explicitly called out this change at plan.md:147, and surrounding error context shows this button retries fetching membership data

- **Title**: `Major — Incomplete aria-label coverage for icon-only buttons`
  - **Evidence**: Plan identified 25+ icon-only buttons (`plan.md:659-680`); only 3 received aria-labels in this commit (low-stock-alerts.tsx:184, documentation-status.tsx:130, part-details.tsx:282)
  - **Impact**: Remaining icon-only buttons lack accessible labels, violating WCAG accessibility guidelines; screen reader users cannot identify button purpose; incomplete Slice 4 delivery
  - **Fix**: Search codebase for icon-only buttons (buttons with only icon children, no text), add `aria-label` attributes following `<verb> <noun>` pattern. Examples: dropdown menu triggers → "More Actions", clear/close icons → "Clear [Field]", navigation arrows → "View [Entity]"
  - **Confidence**: High — Grep for icon-only buttons revealed 29 files with aria-label attributes total, suggesting many more candidates remain

- **Title**: `Major — Missing button labeling standards documentation`
  - **Evidence**: Plan Slice 5 (`plan.md:682-725`) specified creating `docs/contribute/ui/button_standards.md` and linking from `docs/contribute/ui/index.md`; no such files were created or modified
  - **Impact**: Future contributors lack guidance on button labeling conventions; risk of regression to non-compliant labels; incomplete knowledge transfer; plan delivery incomplete
  - **Fix**: Create `docs/contribute/ui/button_standards.md` documenting `<verb> <noun>` pattern, business-function naming, title case requirement, emoji prohibition, and acceptable exceptions (generic "Cancel" in dialogs, pagination controls). Link from `docs/contribute/ui/index.md` and reference in `docs/contribute/index.md` if appropriate
  - **Confidence**: High — Plan explicitly called for this deliverable; essential for maintainability

- **Title**: `Minor — Whitespace change in low-stock-alerts.tsx`
  - **Evidence**: `src/components/dashboard/low-stock-alerts.tsx:171` — Empty line removed between buttons
  - **Impact**: Purely cosmetic; no functional change
  - **Fix**: None required (within acceptable formatting cleanup)
  - **Confidence**: High — Visible in diff as whitespace-only change

---

## 4) Over-Engineering & Refactoring Opportunities

No over-engineering detected. Changes are minimal, targeted label-only updates without introducing unnecessary abstraction or complexity. All modifications are simple string literal replacements.

- **Hotspot**: None identified
- **Evidence**: N/A
- **Suggested refactor**: N/A
- **Payoff**: N/A

---

## 5) Style & Consistency

- **Pattern**: Consistent application of `<verb> <noun>` pattern across all updated buttons
  - **Evidence**: `src/components/parts/part-location-grid.tsx:283-441`, `src/components/shopping-lists/ready/update-stock-dialog.tsx:759-781` — All button labels now follow format
  - **Impact**: Positive — Improves consistency and clarity across the application
  - **Recommendation**: Continue this pattern for remaining non-compliant buttons identified in findings above

- **Pattern**: Emoji removal from dashboard widgets
  - **Evidence**: `src/components/dashboard/low-stock-alerts.tsx:168,178`, `src/components/dashboard/documentation-status.tsx:122` — Emojis (🛒, ➕, 📄) removed from button labels
  - **Impact**: Positive — More professional appearance, better accessibility (emojis can be problematic for screen readers)
  - **Recommendation**: Verify visual distinction is maintained; consider using Button component's `icon` prop if needed

- **Pattern**: Case consistency for compound button labels
  - **Evidence**: `src/components/shopping-lists/ready/update-stock-dialog.tsx:769` — "Save & next" → "Save & Next" (capitalizing "Next")
  - **Impact**: Positive — Title case applied consistently
  - **Recommendation**: Audit for remaining case inconsistencies in other compound labels

---

## 6) Tests & Deterministic Coverage (new/changed behavior only)

**Surface**: Dashboard widgets (low stock alerts, documentation status)

- **Scenarios**:
  - Given a low stock alert is displayed, When user views the alert card, Then "Add to Shopping List" button (without emoji) is visible (`tests/e2e/dashboard/*` — not explicitly verified in diff)
  - Given a low stock alert is displayed, When user views quick-add actions, Then "Quick Add Stock" button (without emoji) is visible (`tests/e2e/dashboard/*` — not explicitly verified in diff)
  - Given dashboard documentation widget displayed, When user views add action, Then "Add Documentation" button (without emoji) is visible (`tests/e2e/dashboard/*` — not explicitly verified in diff)
- **Hooks**: Existing `data-testid` attributes preserved (dashboard.low-stock.item.shopping-list, dashboard.low-stock.item.quick-add.toggle, dashboard.documentation.item.add)
- **Gaps**: No evidence of updated dashboard E2E specs in commit to verify emoji removal and label changes
- **Evidence**: `src/components/dashboard/low-stock-alerts.tsx:168-194`, `src/components/dashboard/documentation-status.tsx:122-130`

**Surface**: Shopping list ready toolbar and dialogs

- **Scenarios**:
  - Given a shopping list in "ready" status, When toolbar is rendered, Then "Complete List" button (updated from "Mark Done") is visible (`tests/support/page-objects/shopping-lists-page.ts:363` — updated)
  - Given shopping list detail page, When seller group note dialog opens, Then "Save Notes" button (updated from "Save changes") is visible (`tests/e2e/shopping-lists/shopping-lists-detail.spec.ts:242,254` — updated)
  - Given order group dialog, When user edits quantities, Then "Save Quantities" button is visible (`plan.md:646` — spec update not in diff)
  - Given order line dialog, When user edits quantity, Then "Save Quantity" button is visible (`plan.md:647` — spec update not in diff)
- **Hooks**: `data-testid` attributes maintained; page object helper at `tests/support/page-objects/shopping-lists-page.ts:363` updated to match new button text with regex fallback `/complete list|mark done/i`
- **Gaps**: Order group/line dialog spec updates not visible in commit; may rely on case-insensitive regex patterns that still match
- **Evidence**: `src/components/shopping-lists/ready/ready-toolbar.tsx:47-60`, `tests/e2e/shopping-lists/shopping-lists-detail.spec.ts:242,254`, `tests/support/page-objects/shopping-lists-page.ts:363`

**Surface**: Part detail actions and error states

- **Scenarios**:
  - Given part detail page with dropdown menu, When user interacts with menu trigger, Then aria-label "More Actions" is accessible to screen readers (`tests/e2e/parts/*` — not explicitly verified in diff)
  - Given part detail page fails to load, When error state renders, Then "Retry" button appears (**BLOCKER**: Button label not updated, inconsistent with "Reload List" pattern)
- **Hooks**: `data-testid="parts.detail.actions.menu"` preserved; aria-label added
- **Gaps**: No test coverage for aria-label verification; "Retry" button at part-details.tsx:357-359 not updated despite plan commitment
- **Evidence**: `src/components/parts/part-details.tsx:282,357-359`

**Surface**: Part location grid actions

- **Scenarios**:
  - Given part location grid in edit mode, When user modifies quantity, Then "Save Quantity" and "Cancel Edit" buttons are visible (`plan.md:507` — spec update expected but not in diff)
  - Given part location grid, When user removes location, Then "Remove Location" button appears (`plan.md:507` — spec update expected but not in diff)
  - Given part location grid, When user adds location, Then "Add Location" button is visible (`plan.md:507` — spec update expected but not in diff)
- **Hooks**: `data-testid` attributes preserved (parts.locations.remove, parts.locations.add-save)
- **Gaps**: Plan mentioned `tests/e2e/parts/part-locations.spec.ts` requires updates (plan.md:507), but no changes to this file appear in commit diff. Tests may use case-insensitive regex or testid-only selectors that still pass, but explicit text assertions should be added for completeness
- **Evidence**: `src/components/parts/part-location-grid.tsx:283-441`

**Surface**: Camera capture workflow

- **Scenarios**:
  - Given user initiates camera capture, When camera interface loads, Then "Capture Photo" button (updated from "Capture") is visible (`tests/e2e/documents/*` or camera-specific spec — not in diff)
  - Given photo is captured, When preview is shown, Then "Accept Photo" (updated from "Use Photo") and "Retake Photo" (updated from "Retake") buttons are visible (`tests/e2e/documents/*` — not in diff)
- **Hooks**: No `data-testid` attributes visible in snippet; tests likely rely on button text selectors
- **Gaps**: No evidence of camera capture E2E spec updates in commit; if such specs exist, they may fail with new button text
- **Evidence**: `src/components/documents/camera-capture.tsx:191-199`

**Surface**: Parts list "Add Part with AI" action

- **Scenarios**:
  - Given parts list page, When user views actions, Then "Add Part with AI" button is clickable (**BLOCKER**: Test expects "Add Part with AI" but UI renders "Add with AI")
- **Hooks**: `tests/support/page-objects/parts-page.ts:34` — page object selector updated to `/add part with ai/i`
- **Gaps**: **CRITICAL MISMATCH** — Test selector updated but UI component not changed; will cause test failures
- **Evidence**: `tests/support/page-objects/parts-page.ts:34`, `src/components/parts/part-list.tsx:220`

---

## 7) Adversarial Sweep (must attempt ≥3 credible failures or justify none)

**Attack 1: Test-vs-UI mismatch causing CI failures**

- **Fault line probed**: Test selectors relying on exact button text matches after label changes
- **Evidence**: `tests/support/page-objects/parts-page.ts:34` expects `/add part with ai/i`, but `src/components/parts/part-list.tsx:220` renders "Add with AI"
- **Failure mode**: When Playwright runs parts page specs and attempts to click "Add Part with AI" button via page object helper, `page.getByRole('button', { name: /add part with ai/i })` will fail to find a match, causing spec failure
- **Impact**: CI/CD pipeline blocked, PR cannot merge, developer velocity reduced
- **Confidence**: High — This is a **confirmed failure** waiting to happen on next test run

**Attack 2: Missing aria-labels breaking accessibility audits**

- **Fault line probed**: Icon-only buttons without accessible labels
- **Evidence**: Plan identified 25+ icon-only buttons requiring aria-labels (`plan.md:659-680`); only 3 were addressed (dashboard arrows, parts menu trigger). Remaining candidates include: clear/close icons in forms, menu trigger ellipsis icons across detail screens, navigation arrow buttons in widgets
- **Failure mode**: Automated accessibility testing (axe-core, Lighthouse) will flag missing button labels as WCAG violations; manual screen reader testing will reveal buttons announced as "button" without context
- **Impact**: Accessibility compliance failure; poor experience for screen reader users; incomplete Slice 4 delivery blocks "Definition of Done"
- **Confidence**: High — Grep results show 29 files with aria-label attributes, suggesting many icon buttons remain unlabeled; plan explicitly called out 25+ candidates

**Attack 3: Inconsistent error-state button labeling**

- **Fault line probed**: Button label patterns for error states with retry actions
- **Evidence**: `src/components/pick-lists/pick-list-detail.tsx:321` changed "Retry" → "Reload List", but `src/components/parts/part-details.tsx:357-359` "Retry" button (link badge error state) remains unchanged
- **Failure mode**: Users encountering different error states will see inconsistent button labeling ("Reload List" vs. "Retry"), reducing perceived polish and clarity
- **Impact**: UX inconsistency; missed opportunity to align all error recovery actions under `<verb> <noun>` pattern
- **Confidence**: High — Plan explicitly called out part-details.tsx:357 ("Retry" → "Reload Data") at plan.md:147, indicating this was a known issue

---

## 8) Invariants Checklist (table)

No critical invariants apply to this change. Button label updates are static JSX modifications with no derived state, persistent writes, or async coordination. The implementation does not touch:
- Query cache invalidation logic
- Form submission flows
- Navigation state
- Persistent data writes

**Invariant**: Button labels match test selectors

- **Where enforced**: Test specs using `getByRole('button', { name: /pattern/i })` matchers must align with JSX button text
- **Failure mode**: Test selector expects updated label but JSX not changed (or vice versa), causing test to fail when finding button
- **Protection**: CI runs full Playwright suite before merge; regex patterns with `/i` flag provide case-insensitivity; fallback patterns like `/complete list|mark done/i` provide transition tolerance
- **Evidence**: **Already broken** at `tests/support/page-objects/parts-page.ts:34` vs. `src/components/parts/part-list.tsx:220`

**Invariant**: Aria-labels provide accessible names for icon-only buttons

- **Where enforced**: WCAG 2.1 SC 4.1.2 (Name, Role, Value); enforced by automated accessibility testing and manual screen reader audits
- **Failure mode**: Icon buttons without aria-labels are announced as generic "button" without context, making them unusable for screen reader users
- **Protection**: Only 3 buttons protected with aria-labels so far; remaining 22+ icon buttons lack this safeguard
- **Evidence**: `src/components/dashboard/low-stock-alerts.tsx:184`, `src/components/dashboard/documentation-status.tsx:130`, `src/components/parts/part-details.tsx:282` (3 of 25+ icon buttons)

**Invariant**: Button labels follow `<verb> <noun>` pattern

- **Where enforced**: Manual code review; no automated tooling to enforce pattern
- **Failure mode**: New buttons or future edits revert to generic labels ("Save", "Add", "Cancel") without nouns
- **Protection**: Plan called for creating `docs/contribute/ui/button_standards.md` to codify the pattern, but this documentation was not created; no enforcement mechanism exists
- **Evidence**: Missing documentation at `docs/contribute/ui/button_standards.md` (`plan.md:692`)

---

## 9) Questions / Needs-Info

- **Question**: Was the "Add with AI" button label change intentionally deferred?
  - **Why it matters**: Test selector was updated but UI was not, creating a blocker mismatch. If intentional, test must be reverted; if oversight, UI must be updated
  - **Desired answer**: Clarify whether `src/components/parts/part-list.tsx:220` should be updated to "Add Part with AI" (matching test) or if test change at `tests/support/page-objects/parts-page.ts:34` should be reverted to "/add with ai/i"

- **Question**: Why was the "Retry" button at part-details.tsx:357-359 not updated?
  - **Why it matters**: Plan explicitly called out this change (`plan.md:147`), and similar "Retry" buttons were updated (pick-list-detail.tsx:321 → "Reload List"). Omission creates inconsistency
  - **Desired answer**: Confirm whether this was an oversight and should be fixed, or if there's a specific reason this button should remain as "Retry"

- **Question**: What is the plan for completing the aria-label audit (Slice 4)?
  - **Why it matters**: Only 3 of 25+ icon-only buttons received aria-labels, leaving accessibility work incomplete and Slice 4 unfinished
  - **Desired answer**: Timeline and approach for identifying and labeling remaining 22+ icon-only buttons

- **Question**: When will button labeling standards documentation (Slice 5) be created?
  - **Why it matters**: Without documentation, future contributors lack guidance on button labeling conventions, risking regression to non-compliant labels
  - **Desired answer**: Timeline for creating `docs/contribute/ui/button_standards.md` and linking from contributor guides

---

## 10) Risks & Mitigations (top 3)

- **Risk**: Immediate CI/CD failure due to "Add Part with AI" test-vs-UI mismatch
  - **Mitigation**: Before merging, either (1) update `src/components/parts/part-list.tsx:220` to "Add Part with AI" or (2) revert `tests/support/page-objects/parts-page.ts:34` to `/add with ai/i`. Run `pnpm playwright test tests/e2e/parts/` to verify parts specs pass
  - **Evidence**: `tests/support/page-objects/parts-page.ts:34`, `src/components/parts/part-list.tsx:220`

- **Risk**: Incomplete accessibility coverage blocks WCAG compliance
  - **Mitigation**: Prioritize completing aria-label audit for remaining 22+ icon-only buttons before marking feature complete. Create follow-up task/PR to systematically add aria-labels following `<verb> <noun>` pattern. Run automated accessibility audit (Lighthouse, axe-core) to identify unlabeled buttons
  - **Evidence**: Plan Slice 4 (`plan.md:659-680`); only 3 of 25+ icon buttons addressed

- **Risk**: Lack of documentation leads to label pattern regression
  - **Mitigation**: Create `docs/contribute/ui/button_standards.md` documenting `<verb> <noun>` pattern, business-function naming, title case, emoji prohibition, and acceptable exceptions. Link from `docs/contribute/ui/index.md`. Consider adding ESLint rule or commit hook to flag button labels without nouns (though this may be complex to implement reliably)
  - **Evidence**: Plan Slice 5 (`plan.md:682-725`); no documentation created

---

## 11) Confidence

**Confidence: Medium** — The implemented label changes are mechanically correct and well-aligned with the plan's intent, but **critical gaps in implementation completeness** reduce confidence. The test-vs-UI mismatch for "Add Part with AI" is a **confirmed blocker** that will cause immediate failures. The incomplete aria-label audit (3 of 25+ buttons) and missing documentation leave 40% of the planned work unfinished. While the changes that *were* made are sound, the partial delivery and test misalignment introduce unacceptable risk. Confidence would be High if: (1) "Add Part with AI" mismatch is resolved, (2) "Retry" button at part-details.tsx:357-359 is updated, (3) aria-label audit is completed, and (4) documentation is created.
