# Alert Component Extraction — Code Review

## 1) Summary & Decision

**Readiness**

The Alert component extraction is well-executed and achieves its primary objective of eliminating CSS soup across 9 inline alert implementations. The component follows established project patterns (variant-based styling, className merge via cn(), testId propagation, React.forwardRef), integrates cleanly with all consumer components, and preserves existing Playwright test contracts. TypeScript strict mode passes, ESLint shows no issues, and the user confirmed all 70 affected Playwright specs pass. The implementation demonstrates strong adherence to the plan with excellent type safety, accessibility considerations, and consistent refactoring across all consumers.

However, there are three correctness issues that must be addressed: (1) the `role` attribute logic at line 149 is a tautology that always renders `role="alert"` instead of implementing the documented variant-based role assignment, (2) the kit overview error alert is missing a required testId on its retry button, creating a gap in test coverage, and (3) the concept-table sticky banner's className override uses overly specific border utilities that partially defeat variant encapsulation.

**Decision**

`GO-WITH-CONDITIONS` — The implementation is fundamentally sound and ready to merge after addressing the three findings below. Fix the role attribute logic to correctly distinguish between `alert` and `status` semantics, add the missing testId to the kit overview retry button, and simplify the concept-table border overrides to preserve variant border styling.

---

## 2) Conformance to Plan (with evidence)

**Plan alignment**

- Plan Section 3 (AlertProps shape) ↔ `src/components/ui/alert.tsx:13-66` — Props interface matches specification exactly, including variant union type, icon boolean|ReactNode|undefined handling, optional title/onDismiss/action, required testId, and layout-focused className.

- Plan Section 3 (Variant-to-Style mapping) ↔ `src/components/ui/alert.tsx:124-129` — All four variants implemented with correct color classes: error uses `border-destructive/50 bg-destructive/10 text-destructive`, warning uses `border-amber-300 bg-amber-50 text-amber-900`, info/success variants added as planned.

- Plan Section 3 (Standardized spacing) ↔ `src/components/ui/alert.tsx:159` — Padding `px-4 py-3`, gap-3 between icon and content (line 159), rounded-md borders all match plan specification.

- Plan Section 3 (TestId pattern contract) ↔ `src/components/ui/alert.tsx:184` — Dismiss button auto-generates `${testId}.dismiss` testId as documented, matching existing pattern in `shopping-lists.spec.ts:616`.

- Plan Section 5 (Alert Component Render Logic, Steps 1-11) ↔ `src/components/ui/alert.tsx:121-196` — Implementation follows documented flow: variant mapping (lines 124-137), className merge via cn() (lines 158-162), icon handling (lines 140-146), optional title rendering (line 170), children as body content (line 171), action buttons in flex container (lines 175-190), testId propagation (line 163), role attribute (line 149).

- Plan Section 14 (Implementation Slices 1-3) ↔ Modified files — All three slices delivered in single changeset: Alert component created and exported (`src/components/ui/alert.tsx`, `src/components/ui/index.ts`), all 6 error banner refactorings completed (part-details, pick-list-lines, kit-bom-row-editor, add-to-shopping-list-dialog, kit-overview-list, overview-list), all 3 warning banner refactorings completed (concept-line-form, concept-table, pick-list-lines excluded inline badge as planned).

- Plan Section 2 (Refactored Components) ↔ All 9 identified consumers — Each component correctly replaces inline CSS-styled div with Alert component:
  - `concept-line-form.tsx:260` → Alert with warning variant, icon=true, onDismiss callback, mb-4 className, testId preserved
  - `part-details.tsx:348` → Alert with error variant, icon=true, action=retry button, testId preserved, wraps ul list as children
  - `pick-list-lines.tsx:82` → Alert with error variant, icon=true, title extracted, testId preserved, ul list children
  - `kit-bom-row-editor.tsx:207` → Alert with error variant, icon=true, testId added as planned (kits.detail.bom.row-editor.error)
  - `add-to-shopping-list-dialog.tsx:279` → Alert with error variant, icon=true, testId preserved, embedded anchor link in children
  - `concept-table.tsx:106` → Alert with warning variant, icon=true, action=focus button, onDismiss, className with z-index and pointer-events, testId preserved
  - `kit-overview-list.tsx:175` → Alert with error variant, icon=true, title extracted, action=retry button, testId preserved
  - `overview-list.tsx:280` → Alert with error variant, icon=true, testId preserved
  - All refactorings remove inline border/bg/text color classes and delegate to variant prop

**Gaps / deviations**

- Plan Section 3 (Accessible role attribute): Plan specifies "Sets `role="alert"` for error/warning, `role="status"` for info/success" with invariant documented in Section 6. Implementation at `src/components/ui/alert.tsx:149` contains logic error: `const role = variant === 'error' || variant === 'warning' ? 'alert' : 'alert';` always evaluates to `'alert'` for all variants. Should be `'alert' : 'status'` in ternary to match plan.

- Plan Section 13 (Test Plan, Kit BOM row editor): Plan states "Add testId during refactoring: `kits.detail.bom.row-editor.error`". Implementation at `src/components/kits/kit-bom-row-editor.tsx:208` correctly adds testId to Alert component, but no corresponding Playwright spec verification mentioned in user's verification report. Gap is acceptable as this is form-level error display with lower test priority, but should be tracked for future coverage.

- Plan Section 8 (Edge case: Concept table sticky banner with z-index layering): Plan specifies passing layout classes via className for sticky positioning. Implementation at `src/components/shopping-lists/concept-table.tsx:109` correctly passes `className="relative z-[60] rounded-none border-b border-t-0 border-l-0 border-r-0 pointer-events-auto"`. However, the border utility classes (`border-b border-t-0 border-l-0 border-r-0`) override variant border styling, which partially defeats variant encapsulation. While functionally correct for the sticky banner's visual requirements (bottom border only), this is a minor deviation from the plan's intent that className should only control layout (margins, width, positioning, z-index) per Section 3 prop documentation. Consider refactoring to `border-0 border-b` to reduce specificity and preserve variant border-color inheritance.

- Minor deviation: Plan Section 3 (Action button layout rules) describes parent providing styled Button components. All implementations correctly follow this pattern, but `kit-overview-list.tsx:181` retry button is missing a testId. The button is functional and visible to Playwright via role-based selectors, but lacks explicit testId for consistency with other action buttons (e.g., `concept-table.tsx:122` has `shopping-lists.concept.duplicate-banner.focus` testId). Not a blocker, but should add `data-testid="kits.overview.error.retry"` for test robustness.

---

## 3) Correctness — Findings (ranked)

- Title: `Major — Role attribute logic always renders 'alert' instead of implementing variant-based semantics`
- Evidence: `src/components/ui/alert.tsx:149` — `const role = variant === 'error' || variant === 'warning' ? 'alert' : 'alert';`
- Impact: All Alert instances render `role="alert"` regardless of variant, violating ARIA best practices. The `role="status"` semantic for non-critical info/success messages is never applied, causing assistive technology to treat informational alerts with the same urgency as errors. While no current consumers use info/success variants, the component API is incomplete and will propagate incorrect accessibility semantics when these variants are adopted in future work.
- Fix: Change line 149 to `const role = variant === 'error' || variant === 'warning' ? 'alert' : 'status';` to align with plan specification (Section 3, Section 6 invariant) and ARIA authoring practices.
- Confidence: High

- Title: `Major — Missing testId on kit overview error retry button`
- Evidence: `src/components/kits/kit-overview-list.tsx:181` — `<Button variant="outline" onClick={...}>Retry</Button>` lacks `data-testid` attribute
- Impact: Playwright specs targeting the kit overview error state must rely on role-based selectors (`getByRole('button', { name: /retry/i })`) instead of explicit testId, reducing test robustness and making locators less specific. If multiple retry buttons exist in DOM or button text changes, tests may select wrong element or fail unexpectedly. Other action buttons in the codebase (e.g., `concept-table.tsx:122`, `part-details.tsx:351`) include testIds for deterministic targeting.
- Fix: Add `data-testid="kits.overview.error.retry"` to Button component at line 181 to match project testId conventions and ensure Playwright specs can target the retry action reliably.
- Confidence: High

- Title: `Minor — Concept table sticky banner className overrides partially defeat variant encapsulation`
- Evidence: `src/components/shopping-lists/concept-table.tsx:109` — `className="relative z-[60] rounded-none border-b border-t-0 border-l-0 border-r-0 pointer-events-auto"`
- Impact: The border utility classes (`border-b border-t-0 border-l-0 border-r-0`) override Alert's variant border styling by explicitly disabling top/left/right borders and only rendering bottom border. While this achieves the sticky banner's visual requirements (horizontal divider line), it circumvents the variant's border-amber-300 styling and reduces component encapsulation. Future Alert variant changes to border styles will not propagate to this consumer. The plan's Section 3 JSDoc documentation states className should only be used for layout (margins, width, positioning, z-index), not for overriding component styling.
- Fix: Simplify className to `className="relative z-[60] rounded-none border-0 border-b pointer-events-auto"` to reduce specificity while achieving the same visual result. Alternatively, accept this as a legitimate layout override for the sticky banner use case and document the pattern in Alert's JSDoc with an example. Either approach resolves the minor encapsulation concern without changing behavior.
- Confidence: Medium (Low impact; functionally correct; primarily a maintainability consideration)

---

## 4) Over-Engineering & Refactoring Opportunities

- Hotspot: No over-engineering detected. Component implementation is appropriately scoped with minimal abstraction.
- Evidence: `src/components/ui/alert.tsx:121-196` — Render logic is straightforward with clear conditional blocks, no unnecessary helper functions or indirection layers, variant mapping uses plain object literals (lines 124-137), icon resolution uses simple type narrowing (lines 140-146).
- Suggested refactor: None required. Implementation correctly avoids premature optimization and matches the complexity level of similar UI components (Badge, EmptyState, InformationBadge).
- Payoff: N/A

---

## 5) Style & Consistency

- Pattern: Alert component follows established UI component conventions consistently
- Evidence:
  - `src/components/ui/alert.tsx:121` — Uses `React.forwardRef<HTMLDivElement, AlertProps>` pattern matching Badge (badge.tsx:10), EmptyState (empty-state.tsx:32)
  - `src/components/ui/alert.tsx:158-162` — Uses `cn()` utility for className merge matching Badge (badge.tsx:23-27), EmptyState (empty-state.tsx:37-42)
  - `src/components/ui/alert.tsx:196` — Sets `Alert.displayName = 'Alert'` matching Badge (badge.tsx:34), EmptyState (empty-state.tsx:91)
  - `src/components/ui/index.ts:1-2` — Export pattern with type exports matches other UI components (information-badge.tsx export at index.ts:5)
- Impact: No consistency issues detected. Implementation aligns with project UI component standards.
- Recommendation: No changes needed.

---

## 6) Tests & Deterministic Coverage (new/changed behavior only)

- Surface: Shopping list concept duplicate banner (dialog and table variants)
- Scenarios:
  - Given duplicate part added to concept list via dialog form, When form submits, Then duplicate banner visible in dialog with part key (`tests/e2e/shopping-lists/shopping-lists.spec.ts:612-614`)
  - Given duplicate banner visible in dialog, When dismiss button clicked, Then banner hidden (`tests/e2e/shopping-lists/shopping-lists.spec.ts:616-617`)
  - (Implicit) Given duplicate banner visible in concept table with focus button, When focus button clicked, Then row scrolls into view (not explicitly verified in provided test snippet, but action handler exists at `concept-table.tsx:116-120`)
- Hooks: `data-testid="shopping-lists.concept.duplicate-banner"` on Alert container, `data-testid="shopping-lists.concept.duplicate-banner.dismiss"` on auto-generated dismiss button (Alert component line 184), `data-testid="shopping-lists.concept.duplicate-banner.focus"` on parent-provided focus button (concept-table.tsx:122)
- Gaps: Test coverage for concept table duplicate banner with focus button is not evident in provided test snippets. Verify that a scenario exercises the table banner (not just dialog banner) and asserts focus button interaction.
- Evidence: `tests/e2e/shopping-lists/shopping-lists.spec.ts:612-617`, `src/components/shopping-lists/concept-line-form.tsx:260-272`, `src/components/shopping-lists/concept-table.tsx:105-130`

- Surface: Part details link badge error
- Scenarios:
  - Given shopping list or kit membership query fails, When part details page loads, Then error alert visible with retry button
  - (Implicit) Given error alert with retry button, When retry clicked, Then queries refetch
- Hooks: `data-testid="parts.detail.link.badges.error"` on Alert container (part-details.tsx:349), retry button testId not explicitly provided in parent (part-details.tsx:351) but Button is functional and locatable via role
- Gaps: PartsPage page object exposes `getLinkBadgeError()` helper (`tests/support/page-objects/parts-page.ts:248`) confirming tests target this error state. Verify that retry button interaction is exercised in part detail specs. Button lacks explicit testId but is addressable via `getLinkBadgeError().getByRole('button', { name: /reload/i })`.
- Evidence: `src/components/parts/part-details.tsx:344-363`, `tests/support/page-objects/parts-page.ts:248`

- Surface: Pick list availability error banner
- Scenarios:
  - Given availability queries fail for multiple parts, When pick list detail loads, Then error banner visible with part keys and error messages in unordered list
- Hooks: `data-testid="pick-lists.detail.availability.error"` on Alert container (pick-list-lines.tsx:81)
- Gaps: No dismiss behavior (banner is static, no onDismiss handler). Test coverage must assert banner visibility and content when availability errors occur. User verification report confirms all pick-list specs pass.
- Evidence: `src/components/pick-lists/pick-list-lines.tsx:79-93`

- Surface: Kit BOM row editor form error
- Scenarios:
  - Given form submission fails, When mutation rejects, Then error alert visible with message
- Hooks: `data-testid="kits.detail.bom.row-editor.error"` on Alert container (kit-bom-row-editor.tsx:208), added as planned
- Gaps: No explicit test coverage verification provided. Form-level error display is lower priority for e2e coverage since mutation errors are rare in test scenarios. Acceptable gap; track for future coverage if BOM editing error scenarios become critical.
- Evidence: `src/components/kits/kit-bom-row-editor.tsx:205-211`

- Surface: Shopping list and kit overview error states
- Scenarios:
  - Given overview query fails, When user navigates to overview page, Then error alert visible with retry button
  - (Implicit) Given error alert with retry button, When retry clicked, Then query refetches
- Hooks: `data-testid="kits.overview.error"` on Alert container (kit-overview-list.tsx:179), `data-testid="shopping-lists.overview.error"` on Alert container (overview-list.tsx:280)
- Gaps: Kit overview error alert retry button is missing testId (see Finding 2 above). Shopping list overview error alert has no action buttons (static error display). User verification report confirms all 70 specs pass, suggesting error states are either not exercised or tests use role-based selectors. Recommend adding backend failure injection scenarios to exercise these error paths explicitly.
- Evidence: `src/components/kits/kit-overview-list.tsx:173-190`, `src/components/shopping-lists/overview-list.tsx:277-284`

- Surface: Add to shopping list dialog conflict error
- Scenarios:
  - Given part already exists on selected shopping list, When user attempts to add duplicate, Then conflict error alert visible with link to existing lists
- Hooks: `data-testid="parts.shopping-list.add.conflict"` on Alert container (add-to-shopping-list-dialog.tsx:280)
- Gaps: No dismiss behavior (banner is static). Alert wraps inline anchor link (`<a href="#parts.detail.link.badges">`) in children, which is semantically valid. Verify that specs exercise conflict detection flow and assert alert visibility.
- Evidence: `src/components/shopping-lists/part/add-to-shopping-list-dialog.tsx:279-287`

---

## 7) Adversarial Sweep (must attempt ≥3 credible failures or justify none)

### Attack 1: Icon prop type narrowing edge case — custom icon not wrapped in flex-shrink container

**Hypothesis**: When `icon` prop receives a custom ReactNode (not boolean), the icon is rendered directly without the `flex-shrink-0` wrapper that default icons receive (line 166), potentially causing layout breaks if custom icon lacks size constraints.

**Evidence**: `src/components/ui/alert.tsx:140-146` — Icon resolution logic sets `iconNode` to custom ReactNode when `typeof icon !== 'boolean'`, but render at line 166 wraps ALL icons (default and custom) in `<div className="flex-shrink-0">{iconNode}</div>`, preventing flex shrinkage regardless of icon type.

**Why code held up**: The flex-shrink-0 wrapper applies universally to the icon slot (line 166), not conditionally within the icon resolution logic. Custom icons inherit the same flex container constraints as default icons, ensuring layout stability. Attack fails; no risk.

### Attack 2: Dismiss button focus trap — clicking dismiss while action button has focus

**Hypothesis**: When Alert has both `action` buttons and `onDismiss` handler, clicking dismiss button while an action button has focus could cause focus to be lost or trapped, especially if parent immediately unmounts Alert on dismiss callback without managing focus return.

**Evidence**: `src/components/ui/alert.tsx:179-188` — Dismiss button is a native `<button type="button">` with focus styles (`focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2`) but no explicit focus management logic. Parent components control Alert visibility via conditional rendering (e.g., `{duplicateNotice && <Alert>}` at concept-line-form.tsx:259), and onDismiss callbacks immediately set state to null (concept-line-form.tsx:265: `setDuplicateError(null)`), causing React to unmount Alert synchronously.

**Why code held up**: Browser focus management handles this case automatically. When a focused element is unmounted, focus returns to `document.body` by default, which is acceptable for inline alerts (not modals). The Alert component is not a focus trap container (no `role="dialog"` or focus lock), so immediate unmounting is safe. The warning/error semantics (`role="alert"`) announce dismissal to screen readers via live region behavior. Attack reveals no risk in current usage patterns, though future modal-like Alert use cases might require explicit focus return logic.

### Attack 3: Concurrent state updates — parent calls onDismiss while Alert is mid-render

**Hypothesis**: If parent component updates Alert props (e.g., changes variant or children) concurrently with onDismiss callback execution, React 19's concurrent rendering could cause stale props to be read or dismiss handler to fire against wrong Alert instance.

**Evidence**: `src/components/ui/alert.tsx:121-196` — Alert is a pure presentational component with no internal state, effects, or async operations. The `onDismiss` callback is passed directly to button onClick handler (line 181) and executes synchronously. Parent components control visibility and props via local state (e.g., `duplicateError` in concept-line-form.tsx:42, `duplicateNotice` in concept-table.tsx prop).

**Why code held up**: React 19's concurrent rendering guarantees that event handlers (like onClick) always receive the props from the render that attached the handler, preventing stale closure bugs. The onDismiss callback is a stable reference (or parent-provided callback), and Alert's lack of internal state eliminates derived state consistency risks. All state updates are synchronous within the React render cycle. Attack fails; no concurrency risk.

### Attack 4: TestId suffix collision — parent provides testId ending in ".dismiss"

**Hypothesis**: If parent provides a testId like `"foo.bar.dismiss"`, the auto-generated dismiss button testId becomes `"foo.bar.dismiss.dismiss"`, which is semantically confusing and could collide with other test selectors or break test assumptions about testId structure.

**Evidence**: `src/components/ui/alert.tsx:184` — Dismiss button testId is computed as template literal `${testId}.dismiss` with no validation or sanitization of parent-provided testId. The testId prop is required (line 65) and typed as `string` with no constraints.

**Why code held up**: While the suffixing logic is naive, this is not a correctness risk—it's a test authoring quality concern. The generated testId will always be unique and addressable by Playwright, even if semantically awkward (e.g., `"foo.dismiss.dismiss"`). Project testId conventions (feature.section.element) make it highly unlikely that parents would provide a testId ending in ".dismiss", as that suffix is reserved for dismiss actions by convention. Reviewing actual consumer testIds confirms no collisions: `shopping-lists.concept.duplicate-banner`, `parts.detail.link.badges.error`, `pick-lists.detail.availability.error`, etc. Attack reveals no functional risk, though a TypeScript branded type or JSDoc warning could prevent future confusion.

---

## 8) Invariants Checklist (table)

- Invariant: Alert visibility is controlled by parent via conditional rendering; Alert never manages its own visibility state
  - Where enforced: All consumer components use `{condition && <Alert>}` pattern (concept-line-form.tsx:259, concept-table.tsx:105, part-details.tsx:347, pick-list-lines.tsx:79, kit-bom-row-editor.tsx:206, add-to-shopping-list-dialog.tsx:279, kit-overview-list.tsx:174, overview-list.tsx:277)
  - Failure mode: If Alert component added internal visibility state (e.g., `const [visible, setVisible] = useState(true)`), it would conflict with parent control and cause desynchronization
  - Protection: Alert implementation at `src/components/ui/alert.tsx:121-196` contains zero useState/useEffect hooks, remaining a pure presentational component
  - Evidence: Component uses only props and derived constants; no state management or lifecycle hooks

- Invariant: Dismiss button testId always follows `${parentTestId}.dismiss` convention
  - Where enforced: `src/components/ui/alert.tsx:184` — Template literal `data-testid={\`${testId}.dismiss\`}` computes suffix deterministically
  - Failure mode: If dismiss button testId were computed differently per variant or made optional, existing Playwright specs would break (e.g., shopping-lists.spec.ts:616 expects `shopping-lists.concept.duplicate-banner.dismiss`)
  - Protection: Dismiss button testId generation is unconditional when `onDismiss` is provided; no branching logic or configuration options
  - Evidence: `tests/e2e/shopping-lists/shopping-lists.spec.ts:616` validates testId convention: `await duplicateBanner.getByTestId('shopping-lists.concept.duplicate-banner.dismiss').click();`

- Invariant: Variant color classes must remain internally consistent (border, background, text) to preserve visual hierarchy
  - Where enforced: `src/components/ui/alert.tsx:124-129` — Variant-to-class mapping object with explicit color class strings per variant
  - Failure mode: If variant classes diverged (e.g., error variant used `bg-destructive/10` but `text-amber-900`), visual semantics would break and users would receive conflicting severity signals
  - Protection: Variant classes are static string literals in closed object, not computed or overridable by props (className prop merged at line 161 but does not replace variant classes)
  - Evidence: Plan Section 3 specifies exact opacity values and color tokens; implementation matches specification (error: destructive/50 border, destructive/10 bg, destructive text; warning: amber-300 border, amber-50 bg, amber-900 text)

- Invariant: className prop must only control layout (margins, width, positioning, z-index), not component styling (colors, borders, padding)
  - Where enforced: JSDoc documentation at `src/components/ui/alert.tsx:56-58` explicitly states "DO NOT pass styling classes (colors, borders, padding) - these are controlled by variant"
  - Failure mode: If consumers pass styling classes like `className="bg-red-500 text-white"`, they override variant classes via Tailwind specificity rules, breaking visual consistency and defeating variant encapsulation
  - Protection: Documentation-only; no runtime validation or TypeScript enforcement. Code review must catch violations.
  - Evidence: Current consumers correctly use className for layout only: `concept-line-form.tsx:262` passes `className="mb-4"` (margin), `concept-table.tsx:109` passes `className="relative z-[60] ... pointer-events-auto"` (positioning and z-index). However, concept-table also passes border utilities (`border-b border-t-0 border-l-0 border-r-0`), which is a minor violation flagged in Finding 3.

- Invariant: Auto-generated aria-label for dismiss button must reference alert title when present to provide context for screen readers
  - Where enforced: `src/components/ui/alert.tsx:152` — Conditional logic: `const dismissLabel = title ? \`Close ${title} alert\` : 'Close alert';`
  - Failure mode: If aria-label always used generic "Close alert" regardless of title, screen reader users would not know which alert the dismiss button targets in scenarios with multiple alerts on screen
  - Protection: Logic is deterministic and tested via TypeScript string template; title prop is optional string type (line 39), ensuring safe string interpolation
  - Evidence: aria-label applied at line 183: `aria-label={dismissLabel}`, providing accessible context to assistive technology

---

## 9) Questions / Needs-Info

- Question: Are there existing or planned Playwright specs that exercise the kit overview error state and retry button interaction?
- Why it matters: Finding 2 identifies missing testId on kit overview retry button. If no tests target this error state, the missing testId has no immediate impact, but if tests exist, they may be brittle due to reliance on role-based selectors.
- Desired answer: Confirm whether `tests/e2e/kits/*.spec.ts` includes scenarios that inject backend failures to trigger kit overview error state, and whether those scenarios assert retry button interaction. If not, accept missing testId as low-priority technical debt.

- Question: Is the concept table sticky banner's border override pattern (border-b only) considered acceptable for specialized layout cases, or should it be refactored to preserve variant border styling?
- Why it matters: Finding 3 flags border utility classes in concept-table className as minor violation of layout-only constraint. Clarifying whether this is acceptable exception or anti-pattern will guide future Alert usage and potential refactoring.
- Desired answer: Confirm whether className="border-0 border-b" is preferred (simpler, preserves variant border-color) or accept current implementation as legitimate layout override for sticky banner visual requirements.

---

## 10) Risks & Mitigations (top 3)

- Risk: Role attribute logic bug will propagate incorrect accessibility semantics when info/success variants are adopted in future work
- Mitigation: Fix line 149 to `const role = variant === 'error' || variant === 'warning' ? 'alert' : 'status';` before merging. Add comment explaining ARIA semantics: "error/warning use role=alert for assertive announcements; info/success use role=status for polite notifications".
- Evidence: Finding 1 at `src/components/ui/alert.tsx:149`

- Risk: Missing testId on kit overview retry button reduces test robustness and creates inconsistency with other action buttons
- Mitigation: Add `data-testid="kits.overview.error.retry"` to Button at `kit-overview-list.tsx:181`. If no existing tests target this error state, create tracking issue for future test coverage of overview error scenarios with backend failure injection.
- Evidence: Finding 2 at `src/components/kits/kit-overview-list.tsx:181`

- Risk: className prop could be misused to override variant styling, defeating component encapsulation
- Mitigation: (1) Strengthen JSDoc documentation with explicit anti-pattern example showing what NOT to do (e.g., "❌ className='bg-red-500' overrides variant styling"). (2) Add code review checklist item for Alert usage: verify className contains only layout utilities (m-, p-, w-, h-, z-, top-, left-, relative, absolute, flex positioning), not colors/borders/padding. (3) Consider creating ESLint rule to detect Tailwind color/border classes in Alert className prop (future work, not blocking).
- Evidence: Finding 3 at `src/components/shopping-lists/concept-table.tsx:109`; JSDoc at `src/components/ui/alert.tsx:56-58`

---

## 11) Confidence

Confidence: High — The implementation is well-structured, follows established project patterns consistently, and achieves the plan's objectives with excellent type safety and refactoring quality. The three identified findings are straightforward to fix (single-line logic correction, add testId, simplify className), and the user's verification confirms all affected tests pass. The Alert component is production-ready after addressing the documented issues.
