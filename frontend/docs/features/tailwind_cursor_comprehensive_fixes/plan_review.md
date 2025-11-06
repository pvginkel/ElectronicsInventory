# Plan Review: Comprehensive Cursor Pointer Fixes for TailwindCSS v4 Upgrade

## 1) Summary & Decision

**Readiness**

This plan is implementation-ready with comprehensive research and clear scope. The technical approach is sound—adding `cursor-pointer` classes to 16 interactive elements affected by TailwindCSS v4's removal of default cursor styles. The plan correctly identifies the document tile's two-region architecture, specifies conditional logic for the type list clear button, and confirms that all changes are CSS-only with no impact on Playwright test selectors. Evidence is thorough, with file:line references for all 16 affected components and verification that existing data-testid attributes remain stable.

**Decision**

`GO` — The plan is technically complete and ready for implementation. All affected areas are documented with evidence, the distinction between conditional (type list clear button) and unconditional cursor additions is clear, and the test impact analysis correctly identifies that CSS class changes won't affect data-testid-based locators.

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `docs/commands/plan_feature.md` — Pass — `plan.md:1-424` — All 16 required sections present with proper templates filled. Research log (section 0) documents investigation areas and key findings. Affected areas (section 2) provides file:line evidence for all 16 components with "Why" and "Evidence" bullets as required.

- `docs/product_brief.md` — Pass — `plan.md:39-68` — Plan focuses on UI cursor feedback for interactive elements, which supports the product's "simple, fast, and focused" goal. No data model or API changes align with the brief's focus on consistent user experience.

- `docs/contribute/architecture/application_overview.md` — Pass — `plan.md:242-255, 379-380` — Plan correctly identifies this as a CSS-only change with no impact on generated API client, TanStack Query, or React state. Acknowledges that existing data-testid attributes in `src/components/ui/` remain stable.

- `docs/contribute/testing/playwright_developer_guide.md` — Pass — `plan.md:341-380` — Test plan correctly notes that cursor CSS property isn't programmatically testable in Playwright, proposes manual visual verification, and confirms existing data-testid locators won't be affected. Aligns with guide's emphasis on data-testid stability and avoiding changes that break test selectors.

**Fit with codebase**

- `src/components/documents/document-tile.tsx:118-119, 163` — Pass — `plan.md:111-114` — Plan correctly identifies the two-region architecture where both the image area (line 118) and footer (line 163) have separate onClick handlers. Explicitly documents NOT to pass onClick to Card, which is the correct pattern for this component.

- `src/components/types/type-list.tsx:227` — Pass — `plan.md:127-130` — Plan identifies the disabled prop on the clear button and correctly specifies conditional cursor-pointer logic (only when `!disabled`).

- `src/components/ui/hover-actions.tsx:48-60` — Pass — `plan.md:81-84` — IconButton component identified correctly with onClick handler and no existing cursor-pointer class. Plan's proposal to add unconditional cursor-pointer aligns with the component's reusable nature.

## 3) Open Questions & Ambiguities

**Question resolved via research:**

The plan's research log (section 0) addresses potential ambiguities:

- **Document tile architecture** — Resolved via investigation. Plan correctly documents that document tiles have TWO separate clickable divs (image area + footer) rather than a single Card onClick, and provides evidence at lines 118 and 163. No further clarification needed.

- **Type list clear button disabled state** — Resolved via code inspection. Plan confirms disabled prop exists at line 227 and specifies conditional cursor-pointer logic. No ambiguity remains.

- **Playwright test stability** — Resolved via research. Plan confirms tests use data-testid attributes (not CSS class selectors) and documents that document tile tests target the Card element (line 114), not the nested divs being modified. No test changes required.

**No unresolved questions:**

All potential ambiguities were proactively researched and documented in section 0. The plan provides clear evidence for the architectural decisions and test impact assessments.

## 4) Deterministic Playwright Coverage (new/changed behavior only)

**Behavior: Document tile cards**

- **Scenarios:**
  - Given a part with attached documents, When user views part details page, Then document tiles render with data-document-tile attribute
  - Given user hovers over document image area, When cursor is positioned over image, Then pointer cursor displays (manual verification only)
  - Given user clicks document image area, When onClick fires, Then media viewer opens or external link opens (existing test coverage)
- **Instrumentation:** Existing data-document-tile selector on Card element (line 114), not affected by inner div cursor-pointer change
- **Backend hooks:** None required — existing document endpoints support the feature
- **Gaps:** No automated cursor CSS verification (not feasible in Playwright) — manual visual verification required. This gap is justified because CSS cursor property cannot be queried programmatically by Playwright.
- **Evidence:** `plan.md:341-348` references `tests/e2e/parts/part-documents.spec.ts` which tests document interactions using the data-document-tile locator

**Behavior: Type list clear search button**

- **Scenarios:**
  - Given type list search input has text, When clear button is enabled, Then cursor-pointer class is present
  - Given type list is disabled, When clear button renders, Then cursor-pointer class is NOT present
  - Given user clicks clear button when enabled, When onClick fires, Then search clears (existing test coverage)
- **Instrumentation:** Existing data-testid="types.list.search.clear" selector unchanged
- **Backend hooks:** None required — local state change only
- **Gaps:** No automated cursor CSS verification — conditional class logic verified by code review. Justified because this is a pure CSS presentation concern that doesn't affect functionality.
- **Evidence:** `plan.md:350-358` references `src/components/types/type-list.tsx:226` for data-testid attribute

**Behavior: All 14 unconditional buttons**

- **Scenarios:**
  - Given any button with onClick handler, When user hovers, Then cursor-pointer class is present (manual verification)
  - Given user clicks button, When onClick fires, Then action executes (existing test coverage for all)
- **Instrumentation:** All buttons have existing data-testid attributes or are locators via parent selectors
- **Backend hooks:** None required — existing endpoints support all button actions
- **Gaps:** No automated cursor CSS verification for any buttons — pure visual change. Justified because Playwright cannot query CSS cursor property, and existing functional tests cover the onClick behavior.
- **Evidence:** `plan.md:359-366` references existing test coverage in multiple specs (document tiles, search functionality)

**Overall coverage assessment:**

The plan appropriately identifies that cursor style is not testable via Playwright and proposes manual visual verification as the validation strategy. This aligns with the testing guide's principle of using appropriate verification methods for different concerns. The existing functional tests remain valid since data-testid locators are unchanged.

## 5) Adversarial Sweep

**Major — Type List Clear Button: Disabled State Styling Conflict**

**Evidence:** `plan.md:163-171, 221-230, 397-400` — The plan specifies conditional cursor-pointer using `!disabled` condition, but browsers typically apply `cursor: not-allowed` to disabled buttons by default. If both conditions apply simultaneously, the explicit `cursor-pointer` class may override the native disabled cursor.

**Why it matters:** Users may see a pointer cursor on a disabled button, suggesting it's clickable when it's not. This creates a confusing UX that contradicts the disabled state's visual contract.

**Fix suggestion:** Remove cursor-pointer explicitly when disabled rather than just omitting it. Use a pattern like `className={cn('...base-classes', disabled ? 'cursor-not-allowed' : 'cursor-pointer')}` to ensure the disabled cursor is explicitly set. Alternatively, research whether TailwindCSS v4's disabled: variant handles this correctly and document the decision.

**Confidence:** High — This is a common CSS specificity issue with button disabled states.

**Minor — Document Tile: Missing Hover Affordance Symmetry**

**Evidence:** `plan.md:182-202` — The plan documents that the footer (line 163) already has cursor-pointer, and proposes adding it to the image area (line 118) to match. However, the flow description notes "no scale effect (not Card-level hover)" for the image hover state.

**Why it matters:** While cursor-pointer provides basic feedback, users might expect both regions to have identical hover affordances beyond just cursor. If the footer has additional hover styling (background change, scale, etc.) that the image area lacks, the regions will feel inconsistent.

**Fix suggestion:** Verify whether the footer div at line 163 has any hover: classes beyond cursor-pointer. If it does, document in the plan whether those should also be applied to the image area wrapper (line 118) for consistency. If the hover styles differ intentionally, add a brief note explaining why (e.g., "footer hover is stronger because it's the primary interaction target").

**Confidence:** Medium — This depends on whether the existing implementation has intentional styling asymmetry.

**Minor — IconButton Reusability: Missing Documentation of Hover State Dependencies**

**Evidence:** `plan.md:81-84, 47-64` — IconButton is identified as a high-priority reusable component used throughout the app, but the plan doesn't document whether IconButton's variant classes (lines 54-56 in hover-actions.tsx) already include hover state transitions that might interact with cursor-pointer.

**Why it matters:** If IconButton variants define hover:bg-X transitions, adding cursor-pointer might create a perceptual lag if the CSS transitions aren't tuned for cursor changes. This is a minor polish issue but affects the "feels responsive" quality of the UI.

**Fix suggestion:** Add a note in section 2 (Affected Areas) for IconButton documenting whether the component's transition-colors class (line 58 in hover-actions.tsx) properly coordinates with the new cursor-pointer addition. If not, consider adding a transition-cursor class alongside it.

**Confidence:** Low — This is a micro-optimization that may not be perceptible, but it's worth noting for completeness.

**Minor — Implementation Order: High-Priority Components Should Ship First**

**Evidence:** `plan.md:383-393` — The plan proposes shipping all 16 cursor-pointer additions as a single atomic commit, but acknowledges an implementation order (document tile → high-priority reusable → medium-priority → lower-priority) "if splitting for code review."

**Why it matters:** If the single commit is large or needs to be rolled back due to unexpected side effects on one component, all 16 fixes would be reverted together. Incremental shipping of high-priority reusable components (IconButton, Input clear, SearchableSelect) would deliver value faster and isolate risk.

**Fix suggestion:** Revise section 14 to recommend shipping in 2-3 slices:
1. High-priority reusable components (7 components) — ships value broadly and establishes the pattern
2. Document tile + medium-priority common UI (5 components) — addresses the most visible user-facing issue
3. Lower-priority specific instances (4 components) — completes the work with minimal risk

This maintains the "atomic per slice" principle while reducing blast radius.

**Confidence:** Medium — This is a process/risk management suggestion rather than a technical flaw.

## 6) Derived-Value & State Invariants (table)

**Derived value: Type list clear button disabled state**

- **Source dataset:** `disabled` prop passed to button component, derived from parent TypeList component state (unfiltered state)
- **Write / cleanup triggered:** No writes — purely presentational class modification based on prop value
- **Guards:** Conditional class application using `disabled` prop value: `!disabled && 'cursor-pointer'`
- **Invariant:** Button must only show pointer cursor when enabled; when `disabled === true`, cursor-pointer class must NOT be present to avoid conflicting with native disabled cursor behavior
- **Evidence:** `plan.md:219-225, 163-171` — disabled prop at line 227 in type-list.tsx

**Derived value: Document tile clickability regions**

- **Source dataset:** Two separate div onClick handlers (image wrapper at line 118 + footer at line 163), both calling handleTileClick function (unfiltered—always clickable)
- **Write / cleanup triggered:** No writes — cursor-pointer is CSS-only change with no state mutations
- **Guards:** None — both regions always clickable (no disabled state)
- **Invariant:** Both clickable regions must show pointer cursor consistently; if one region has cursor-pointer, the other must also have it to maintain UX symmetry
- **Evidence:** `plan.md:226-232` — div onClick at lines 118-119 and 163 in document-tile.tsx

**Derived value: Button hover states across all 14 unconditional cases**

- **Source dataset:** Button onClick prop presence (all have explicit handlers), unfiltered—no conditional rendering
- **Write / cleanup triggered:** No writes — cursor-pointer is visual feedback only, no side effects
- **Guards:** None — no disabled states to check for these 14 buttons
- **Invariant:** All buttons with onClick handlers must show pointer cursor on hover; removing onClick would make cursor-pointer incorrect
- **Evidence:** `plan.md:233-239` — All button locations in section 2 have onClick handlers present

**Note on filtered vs unfiltered sources:**

All three derived values are sourced from **unfiltered** inputs (props, component structure). No derived value drives a **persistent** write or cache mutation, so no risk of data loss or state drift. The only guard required is for the type list clear button's conditional cursor-pointer, which is already specified in the plan.

## 7) Risks & Mitigations (top 3)

**Risk: Conditional cursor-pointer logic for type list clear button may conflict with native disabled cursor**

- **Mitigation:** Use explicit `cursor-not-allowed` class when disabled (see Adversarial Sweep finding). Test both enabled and disabled states visually during manual verification checklist (section 13, lines 374-375).
- **Evidence:** `plan.md:397-400, 221-230, 163-171` — disabled prop at line 227, conditional logic specified in flow section

**Risk: Missing cursor-pointer on future buttons after this fix**

- **Mitigation:** Plan suggests adding to UI contribution guidelines. Strengthen this by creating a checklist item in `docs/contribute/ui/button_checklist.md` (or similar) that requires cursor-pointer for all interactive elements. Code review should catch missing cursor-pointer going forward.
- **Evidence:** `plan.md:276-280, 405-408` — Plan identifies pattern establishment goal

**Risk: Incomplete coverage of missing cursor-pointer cases**

- **Mitigation:** Plan documents comprehensive codebase scan completed (section 0). To validate completeness, run a final grep for button/onClick patterns before implementation: `grep -r "onClick={" src/components --include="*.tsx" | grep -v "cursor-pointer"` and cross-reference against the 16 documented cases. If additional cases are found, either add to scope or document why they're excluded.
- **Evidence:** `plan.md:28-33, 415-420` — Research log claims comprehensive scan, open question acknowledges coverage concern

## 8) Confidence

**Confidence: High** — The plan is thorough, well-researched, and correctly scoped. All 16 affected components are documented with file:line evidence, the distinction between conditional and unconditional cursor-pointer is clear, and the test impact analysis is sound. The only material issue (type list disabled state cursor conflict) has a straightforward fix. Manual verification is the appropriate test strategy for CSS cursor changes, and the plan provides a clear checklist. Minor improvements (hover affordance symmetry, implementation slicing) would enhance the plan but don't block implementation.

---

## Recommendations for Plan Author

1. **Address the disabled cursor conflict** (Major finding): Update section 5 (Algorithms & UI Flows, lines 163-171) to specify explicit `cursor-not-allowed` when disabled, not just omitting `cursor-pointer`.

2. **Consider incremental shipping** (Minor finding): Revise section 14 (Implementation Slices) to recommend 2-3 slices instead of a single commit, prioritizing high-value reusable components first.

3. **Document hover affordance consistency** (Minor finding): Add a note in section 2 for document tile explaining whether the footer has additional hover styles beyond cursor-pointer, and whether the image area should match them.

4. **Validate completeness before implementation**: Run the suggested grep command in Risk #3 to confirm no additional missing cursor-pointer cases exist.

5. **Optional enhancement**: Add a follow-up task to create a UI contribution guideline document that includes cursor-pointer as a required checklist item for interactive elements.

With these adjustments, the plan will be fully robust and ready for confident implementation.
