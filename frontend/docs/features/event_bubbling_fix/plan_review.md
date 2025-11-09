# Plan Review: Fix Event Bubbling Issues

## 1) Summary & Decision

**Readiness**

The plan thoroughly addresses the event bubbling issues with a focused, well-researched approach. The Research Log demonstrates comprehensive investigation of the codebase, accurately identifying ConfirmDialog buttons and nested form submissions as the root causes. The test plan now includes concrete verification strategies (URL tracking, form state assertions) and keyboard accessibility coverage. The plan acknowledges the risk of other nested dialogs and provides a mitigation strategy. All major concerns from the first review have been addressed with specific implementation details and evidence.

**Decision**

`GO` — The plan is implementation-ready. The root causes are correctly identified with file/line evidence, the fixes are minimal and surgical (stopPropagation only, no preventDefault), the test strategy is deterministic and follows project patterns, and the keyboard accessibility risk is properly analyzed with concrete testing steps.

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `docs/commands/plan_feature.md` — Pass — `plan.md:0-339` — All required sections present with templates properly filled. Research Log documents discovery work, file map includes evidence citations, test plan includes specific scenarios and instrumentation.

- `docs/contribute/testing/playwright_developer_guide.md` — Pass — `plan.md:228-268` — Test plan follows API-first data setup, uses real backend via factories, includes randomized identifiers via makeUnique, relies on deterministic waits (URL checks, form visibility, backend polling), and avoids route mocks.

- `docs/contribute/testing/index.md` — Pass — `plan.md:228-268` — Adheres to mandatory real-backend policy, fresh data per test principle, and instrumentation-driven assertions. Keyboard tests supplement mouse-driven scenarios appropriately.

- `docs/product_brief.md` — Pass — `plan.md:52-65` — Addresses user-reported bugs (document link opening, part form submission) with component-level fixes that benefit all dialog instances.

**Fit with codebase**

- `ConfirmDialog` (src/components/ui/dialog.tsx:221-230) — `plan.md:68,273-281` — Fix correctly targets onClick handlers in both cancel and confirm buttons. Uses stopPropagation without preventDefault, preserving button semantics while preventing event bubbling to parent Card/Form elements.

- `SellerCreateDialog` (src/components/sellers/seller-create-dialog.tsx:116) — `plan.md:103-106,160-166` — Wrapping onSubmit handler is the correct scoped approach. Avoids modifying shared useFormState hook, preventing risk to other forms. Implementation detail provided: `const handleSubmit = (e: React.FormEvent) => { e.stopPropagation(); form.handleSubmit(e); }`.

- `DocumentTile` (src/components/documents/document-tile.tsx:177) — `plan.md:108-110` — No structural change needed. ConfirmDialog renders inside Card, but button-level fix prevents bubbling to Card's onClick. Clean separation of concerns.

- Test coverage (tests/e2e/parts/part-documents.spec.ts:81, tests/e2e/sellers/sellers-selector.spec.ts:29-66) — `plan.md:228-268` — Existing specs provide foundation. Plan correctly identifies gap in part-documents.spec.ts (missing URL verification) and major gap in sellers-selector.spec.ts (only tests creation flow, not edit flow where bubbling occurs).

## 3) Open Questions & Ambiguities

All questions from the first review have been resolved or adequately addressed:

- **Other nested dialog forms**: Plan acknowledges this risk in section 15 (lines 303-311) with concrete mitigation: search for all Dialog+Form components, determine nesting scenarios, apply same pattern, add code comments. This is appropriately scoped for post-implementation verification rather than pre-implementation research.

- **Default behavior for dialog buttons**: Listed as open question (lines 328-330) but correctly classified as architectural decision, not blocking. Current surgical approach is safer for initial fix.

- **Intentional event bubbling**: Addressed in lines 332-334 with expectation that no legitimate cases exist, to be verified during code review and testing.

No new blocking ambiguities identified. The plan is sufficiently specific for implementation.

## 4) Deterministic Playwright Coverage (new/changed behavior only)

- **Behavior**: Document deletion confirmation (DocumentTile with ConfirmDialog inside clickable Card)
  - **Scenarios**:
    - Given part with link document, When user deletes and confirms, Then document removed AND link NOT opened (verify via URL check)
    - Given part with multiple documents, When one deleted, Then only that document removed, no other actions triggered
  - **Instrumentation**: data-testid on document tiles, existing part-documents page object, URL verification via page.url() capture before/after
  - **Backend hooks**: testData.attachments.list() for polling deletion success, testData.attachments.getCover() for cover verification
  - **Gaps**: Current test at line 81 verifies deletion but missing URL verification. Plan provides implementation: `const urlBefore = page.url(); await partsDocuments.deleteDocument(...); expect(page.url()).toBe(urlBefore);`
  - **Evidence**: `plan.md:228-238`

- **Behavior**: Inline seller creation from part edit form (nested forms scenario)
  - **Scenarios**:
    - Given part edit form with seller selector, When user creates seller inline and confirms, Then seller created AND part form NOT submitted
    - Given part edit form with validation errors, When user creates seller inline, Then seller created, parent form shows errors, user remains in edit mode
  - **Instrumentation**: Form instrumentation events (waitTestEvent for SellerForm success), parent form visibility check (expect(parts.formRoot).toBeVisible()), backend API verification that part NOT updated (testData.parts.getDetail())
  - **Backend hooks**: testData.parts.create() for seeding, testData.sellers.create() for verification, testData.parts.getDetail() for non-mutation check
  - **Gaps**: Major gap correctly identified - existing sellers-selector.spec.ts:29-66 only covers part CREATION flow. Need new test for EDIT flow where bubbling actually occurs. Plan provides implementation approach in lines 247-253.
  - **Evidence**: `plan.md:240-254`

- **Behavior**: Keyboard accessibility for dialogs and forms
  - **Scenarios**:
    - Given ConfirmDialog open, When user presses Enter on focused Confirm button, Then action executes and dialog closes
    - Given ConfirmDialog open, When user presses Escape, Then dialog closes without action (Radix UI behavior)
    - Given SellerCreateDialog form, When user presses Enter in last input, Then form submits and seller created
  - **Instrumentation**: Same form/UI instrumentation as mouse scenarios, page.keyboard.press('Enter') and page.keyboard.press('Escape') for keyboard simulation
  - **Backend hooks**: Same backend coordination as mouse-driven tests
  - **Gaps**: Manual testing checklist for all ConfirmDialog usages (type deletion, kit deletion, box deletion) noted for verification
  - **Evidence**: `plan.md:257-268`

**Overall coverage assessment**: The test plan is comprehensive and deterministic. URL verification and form non-mutation checks provide concrete proof that bubbling is prevented. Keyboard testing ensures accessibility compliance. The identified gaps (URL check missing, edit flow missing) are acknowledged with specific remediation plans.

## 5) Adversarial Sweep (must find ≥3 credible issues or declare why none exist)

**Minor — SearchableSelectCreateOption descended but evidence-based decision documented**

**Evidence:** `plan.md:98-101` — "SearchableSelectCreateOption button (DESCOPED - no concrete evidence of bug)"

**Why it matters:** First review flagged this as potential gap. Plan now explicitly descopes with clear reasoning: no bug reported, onClick without stopPropagation exists but no evidence of unwanted parent behavior triggered.

**Fix suggestion:** None needed. Plan correctly applies evidence-based approach - fix reported bugs, don't speculatively fix code without symptoms. If future reports indicate bubbling from this button, the same pattern can be applied.

**Confidence:** High

---

**Minor — Nested dialog audit deferred to post-implementation**

**Evidence:** `plan.md:303-311` — Risk section acknowledges "Incomplete fix - other nested form scenarios may exist beyond SellerCreateDialog"

**Why it matters:** Multiple Dialog+Form patterns exist in codebase (grep found 20 files). Only SellerCreateDialog is targeted for nested form fix. TypeCreateDialog, KitCreateDialog, KitPickListCreateDialog, etc. may have similar nesting scenarios.

**Fix suggestion:** Consider adding a checklist to section 14 (Implementation Slices) for the verification slice:
- Search codebase: `grep -r "Dialog.*Form.*onSubmit"`
- For each Dialog+Form component, document: Can this dialog be opened from within another form?
- If yes, verify in UI whether that parent form has submission behavior
- Apply e.stopPropagation() pattern to any confirmed nested scenarios
- Add inline code comment: "// Prevent nested form submission from bubbling to parent forms"

This elevates the manual verification to a structured implementation checklist.

**Confidence:** Medium

---

**Minor — Form submission keyboard behavior analysis is thorough but could specify implementation verification**

**Evidence:** `plan.md:313-320` — "React's synthetic events unify mouse and keyboard (Enter/Space on buttons triggers onClick). Calling e.stopPropagation() in onClick stops propagation regardless of input method..."

**Why it matters:** The analysis is correct, but implementation should verify this assumption explicitly during development.

**Fix suggestion:** Add to section 14 verification slice: "Verify in browser DevTools that Enter key on focused Confirm button triggers onClick (not separate onKeyDown), and that stopPropagation in that handler prevents parent event listeners from firing. Document this verification in implementation notes."

**Confidence:** Low (analysis is sound; this just adds defense-in-depth verification)

---

**Checks attempted:**
- Radix UI Dialog/Popover event handling conflicts — Analyzed plan's approach of using stopPropagation without preventDefault. This preserves Radix UI's internal close handlers (onOpenChange) and focus management. Evidence: `plan.md:281` uses stopPropagation only, allowing normal button/form behavior.
- Cache invalidation risks — Not applicable; no cache writes or derived state changes. Evidence: `plan.md:169-171` explicitly states no derived state changes.
- Optimistic update rollbacks — Not applicable; no mutations are optimistic. Existing deletion and creation flows use standard TanStack Query mutations.
- Generated API usage — Not applicable; no API contract changes. Evidence: `plan.md:130-134` states no API changes required.
- SSE coordination — Not applicable; no streaming data flows involved.
- React 19 concurrency — Reviewed for useTransition/startTransition usage. Event handlers are synchronous; no concurrency issues introduced. Evidence: `plan.md:209` states event handlers are synchronous.

**Why the plan holds:** The fix is surgical and isolated to event propagation control. No state management, data flows, or async coordination changes. The React synthetic event system's unification of keyboard/mouse events is well-documented and stable. Radix UI primitives are designed to work with standard event handling patterns.

## 6) Derived-Value & State Invariants (table)

**None; proof:**

The plan explicitly documents no derived state changes in section 6 (lines 168-170): "No derived state changes. The components maintain the same state management; only event propagation is controlled."

No filtering, sorting, or aggregation occurs. No cache writes or cleanup are triggered by the event handling changes. Dialog open/closed state and form values remain unchanged; only event flow is modified.

The only state transitions are existing behaviors:
- Dialog open → user clicks button → dialog closes (existing)
- Form filled → user submits → mutation runs → dialog closes (existing)

Event propagation prevention doesn't introduce derived values because it operates on the event object itself (calling e.stopPropagation()) before any state updates occur. State changes happen after propagation is stopped, not as a result of stopping propagation.

## 7) Risks & Mitigations (top 3)

- **Risk**: Breaking existing dialog/form functionality by interfering with event handling
  - **Mitigation**: Thorough manual testing of all dialogs (type deletion, kit deletion, box deletion, shopping list operations) before deployment. Comprehensive Playwright coverage for both mouse and keyboard interactions. Use stopPropagation only (no preventDefault) to preserve default button/form behaviors.
  - **Evidence**: `plan.md:295-299`

- **Risk**: Keyboard event handling breaks, causing accessibility regression (WCAG 2.1 AA failure)
  - **Mitigation**: Add explicit Playwright keyboard tests for Enter on Confirm button, Escape to close dialog, Enter in form field. Manual accessibility review with keyboard-only navigation. React's synthetic events unify mouse/keyboard so stopPropagation in onClick applies to both input methods correctly.
  - **Evidence**: `plan.md:313-320`

- **Risk**: Incomplete fix - other nested form scenarios may exist beyond SellerCreateDialog
  - **Mitigation**: Search codebase for all Dialog+Form components. For each, determine if dialog can be opened from within another form. Apply same e.stopPropagation() pattern to nested form onSubmit handlers. Add code comment pattern to document the requirement.
  - **Evidence**: `plan.md:303-311`

All risks have concrete mitigations tied to implementation/verification steps. No unmitigated critical risks remain.

## 8) Confidence

**Confidence: High**

The plan demonstrates thorough research with 12+ component inspections documented in section 0. Root causes are pinpointed with file:line evidence (dialog.tsx:221-230, seller-create-dialog.tsx:116). The fix strategy is minimal and surgical (stopPropagation only, no architectural changes). Test coverage is deterministic with concrete verification methods (URL tracking, form state checks, keyboard simulation). The keyboard accessibility risk is properly analyzed using React's documented synthetic event behavior. Implementation slices are well-sequenced (core fixes → verification/testing). All sections follow the plan template with proper evidence citations.

The only areas of uncertainty are appropriately flagged as risks with mitigations (nested dialog audit, default behavior decision, keyboard verification). These are implementation-time validation tasks rather than design gaps.
