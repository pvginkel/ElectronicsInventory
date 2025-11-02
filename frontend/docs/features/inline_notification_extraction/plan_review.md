# Plan Review — InlineNotification Component Extraction

## 1) Summary & Decision

**Readiness**

This plan proposes extracting a single inline warning badge pattern from `pick-list-lines.tsx` into a reusable `InlineNotification` component with four semantic variants (error, warning, info, success). The research is thorough, accurately identifies the sole current usage, correctly excludes non-badge patterns (colored text), and demonstrates clear understanding of component boundaries. The implementation scope is minimal, well-defined, and includes preservation of existing test coverage. The component API deliberately excludes `className` to enforce visual consistency—a reasonable design choice given the inline-flow context. Section 0 (Research Log) provides strong evidence that the pattern genuinely exists in only one location, and the plan transparently acknowledges that future variants (error/info/success) are speculative. All affected files are correctly identified with accurate line references.

**Decision**

`GO` — Plan is implementation-ready with strong evidence, minimal scope, clear test preservation strategy, and appropriate component boundaries. The deliberate exclusion of `className` is justified for inline-flow components.

---

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `docs/commands/plan_feature.md` — Pass — `plan.md:0-69` — Section 0 (Research Log) demonstrates thorough repository search using multiple criteria (CSS patterns, icon usage, component landscape analysis, test coverage), satisfying the "research-first" mandate and providing file:line evidence for all claims.

- `docs/commands/plan_feature.md` — Pass — `plan.md:74-119` — Section 1 (Intent & Scope) includes verbatim prompt quotes ("extracting an InlineNotification component", "WITHOUT a className prop", "REMOVE className props"), clear in-scope/out-of-scope boundaries, and explicit assumptions (only 1 current usage, future variants for anticipated needs).

- `docs/commands/plan_feature.md` — Pass — `plan.md:122-163` — Section 2 (Affected Areas) provides exhaustive file map with "why" justifications and accurate evidence quotes (`pick-list-lines.tsx:209-216`, `tests/e2e/pick-lists/pick-list-detail.spec.ts:120`, `tests/support/page-objects/pick-lists-page.ts:83`).

- `docs/commands/plan_feature.md` — Pass — `plan.md:329-350` — Section 13 (Deterministic Test Plan) correctly identifies existing coverage, notes no instrumentation events required (presentational component), and confirms tests will remain green via `data-testid` preservation.

- `docs/contribute/architecture/application_overview.md` — Pass — `plan.md:125-134` — Component follows established UI component patterns (placement in `src/components/ui/`, export from barrel file, `testId` prop support, domain-driven organization).

- `docs/contribute/testing/playwright_developer_guide.md` — Pass — `plan.md:156-163, 329-350` — Plan preserves existing test selectors and page object methods, correctly notes no test-event instrumentation needed for presentational components, and follows data-testid convention (`feature.section.element`).

**Fit with codebase**

- `src/components/ui/alert.tsx` — `plan.md:172-207, 221-230` — InlineNotification component API mirrors Alert's variant system (error/warning/info/success, icon prop with boolean/ReactNode support, testId requirement) while appropriately omitting block-level features (title, onDismiss, action). Variant color mappings differ intentionally: Alert uses `border-amber-300` (plan:77) for warning; InlineNotification proposes `border-amber-400` (plan:224, 319) for higher contrast in compact inline contexts. This divergence is explicitly documented and justified.

- `src/components/ui/badge.tsx` — `plan.md:36-48` — Plan correctly distinguishes InlineNotification from Badge family: Badge uses `rounded-full` borders and `px-2.5 py-0.5` padding without icon support; InlineNotification uses `rounded` borders, `px-2 py-1` padding, and lucide-react icon integration. Component fills documented gap for semantic inline notifications.

- `src/components/pick-lists/pick-list-lines.tsx:209-216` — `plan.md:137-150` — Existing shortfall badge CSS (`inline-flex items-center gap-2 rounded border border-amber-400 bg-amber-50 px-2 py-1 text-amber-900`, AlertTriangle icon h-3.5 w-3.5) will be replaced with `<InlineNotification variant="warning" icon={true} testId={...}>Shortfall {quantity}</InlineNotification>`. Refactoring is straightforward with no visual regression risk.

- `tests/support/page-objects/pick-lists-page.ts:83` — `plan.md:159-163` — Page object method `lineShortfall(lineId)` returns locator for `data-testid="pick-lists.detail.line.{lineId}.shortfall"`. Plan correctly notes testId will be preserved on InlineNotification component, ensuring zero test changes required.

---

## 3) Open Questions & Ambiguities

**None.** Plan explicitly resolves all design questions autonomously per requirements (plan:87, 395). Border color difference from Alert (amber-400 vs amber-300) is documented with justification (plan:317-319). Future needs for dismiss/action buttons are acknowledged as out-of-scope with YAGNI principle (plan:391). No blocking ambiguities remain.

---

## 4) Deterministic Playwright Coverage (new/changed behavior only)

- **Behavior**: Pick list detail page — shortfall badge display
  - **Scenarios**:
    - Given pick list line with sufficient stock (shortfall = 0), When viewing line, Then no shortfall badge displayed (implicit coverage via conditional rendering)
    - Given pick list line with shortfall > 0, When viewing line, Then shortfall badge displays "Shortfall {quantity}" with warning icon (`tests/e2e/pick-lists/pick-list-detail.spec.ts:120`)
  - **Instrumentation**: `data-testid="pick-lists.detail.line.{lineId}.shortfall"` on container element; no test-event coordination required (presentational component)
  - **Backend hooks**: Factory methods create pick list lines with configurable stock levels; existing coverage uses this pattern
  - **Gaps**: None. Refactoring preserves existing selectors and test assertions. No new behavior introduced, therefore no new test scenarios required.
  - **Evidence**: `plan.md:329-350` documents test preservation strategy; `tests/e2e/pick-lists/pick-list-detail.spec.ts:120` shows assertion `await expect(pickLists.lineShortfall(lineForPartB!.id)).toContainText('Shortfall 6');` will continue working unchanged.

---

## 5) Adversarial Sweep (must find ≥3 credible issues or declare why none exist)

### Finding 1

**Minor — Speculative variant design may accumulate unused code**

**Evidence:** `plan.md:90-91, 112-113` — Plan creates error/info/success variants despite acknowledging "only 1 current usage to convert" and "Component will be designed for future reuse (error/info/success variants for anticipated needs)."

**Why it matters:** Creating untested variants violates YAGNI and introduces maintenance surface (color mappings, icon defaults, documentation examples) for code paths that may never execute. When a future need arises, implementation will discover mismatches (e.g., destructive errors needing different padding, success notifications needing auto-dismiss).

**Fix suggestion:** Defer non-warning variants until concrete usage emerges. Ship initial implementation with only `variant="warning"` and `InlineNotificationVariant = 'warning'` type. Document extension path in component JSDoc. When error/info/success needs arise, add variants in the same PR that introduces usage—this keeps implementation grounded in real requirements and ensures test coverage ships with each variant. Alternatively, if anticipatory design is mandated, add explicit TODO comments in Section 13 (Test Plan) noting these variants lack coverage and must gain scenarios before production use.

**Confidence:** Medium — Speculative design is common in component libraries and may reflect project preferences, but plan lacks justification for why future variants are sufficiently certain to warrant immediate implementation.

---

### Finding 2

**Minor — No accessibility guidance for ARIA attributes or semantic roles**

**Evidence:** `plan.md:235-240` — Rendering flow specifies `data-testid`, class composition, icon sizing, and content slots but omits ARIA attributes. Alert component (reference pattern) includes `role="alert"` or `role="status"` based on severity (`src/components/ui/alert.tsx:149`).

**Why it matters:** Screen readers benefit from semantic roles on notification elements. Warning/error notifications should likely carry `role="alert"` (assertive announcements), while info/success may use `role="status"` (polite announcements). Inline notifications appearing conditionally (like shortfall badges) should be announced when they appear, but plan provides no guidance on which role (if any) to apply or whether `aria-live` regions are needed.

**Fix suggestion:** Add accessibility subsection to Section 5 (Algorithms & UI Flows) or Section 12 (UX/UI Impact) specifying: (1) whether InlineNotification should render with `role="alert"` for warning/error variants and `role="status"` for info/success, mirroring Alert component pattern (alert.tsx:149); (2) whether `aria-live` is redundant given semantic roles; (3) guidance on `aria-label` or `aria-describedby` if icon-only usage is anticipated. Reference Alert component's role mapping as precedent and note any intentional divergence (e.g., inline notifications may not require assertive announcements if they're always visible on initial render).

**Confidence:** Medium — Accessibility is important but plan may intentionally defer this to implementation phase. However, explicit documentation prevents inconsistent implementation.

---

### Finding 3

**Minor — No guidance on wrapping behavior for long content in constrained containers**

**Evidence:** `plan.md:267-272` — Edge case documentation notes "Very long text content may wrap or overflow container" and states "Component uses `inline-flex` so it naturally wraps with parent layout. Consumer controls wrapping context." However, `inline-flex` prevents internal text wrapping—content will expand horizontally, potentially overflowing table cells.

**Why it matters:** Shortfall badge appears in table cell (`pick-list-lines.tsx:208` shows `<td>` parent). Long part names or large shortfall quantities could cause horizontal overflow, breaking table layout or causing awkward scrolling. The existing implementation uses `inline-flex` without `flex-wrap` or `max-width`, so this is status quo, but extracting to reusable component solidifies the behavior without documenting layout constraints.

**Fix suggestion:** Update Section 8 (Errors & Edge Cases) plan:267-272 to clarify: (1) InlineNotification container is `inline-flex` but does NOT wrap text internally (text will expand horizontally); (2) consumers in constrained contexts (table cells, narrow panels) should apply `max-width` or `truncate` classes to parent container if overflow is a concern; (3) alternatively, consider adding optional `className` prop *only* for text-specific utilities (`truncate`, `text-wrap`) if layout control becomes necessary—document this as exception to no-className rule with strict guidance. For now, accept current behavior (plan:270-272 already notes "consumers must manage layout constraints") but make it explicit that `inline-flex` prevents internal wrapping.

**Confidence:** Low — This is a refinement rather than a blocker. Current implementation works without overflow issues, suggesting table column widths accommodate expected content. Documentation improvement prevents future confusion.

---

### Adversarial Checks Attempted (no additional issues found)

- **Check: State consistency across variants** — Component is stateless; no cache invalidation or query coordination required (plan:246-253). No risk.

- **Check: Test-event instrumentation gaps** — Plan correctly notes no instrumentation events needed for presentational component (plan:294). Existing data-testid preservation ensures test reliability (plan:342). Verified existing spec (`tests/e2e/pick-lists/pick-list-detail.spec.ts:120`) asserts via page object locator; refactoring preserves selector. No gap.

- **Check: Destructive/className conflict** — Alert component accepts `className` for layout control (alert.tsx:59), while InlineNotification explicitly excludes it (plan:94, 206). Plan justifies decision: inline components should flow with content, not require layout escape hatches. Mitigation documented: consumers can wrap in container div if needed (plan:387). Reasonable tradeoff, no conflict.

- **Check: Icon size mismatch with custom icons** — Plan documents risk (plan:274-279) and accepts it as consumer responsibility. Alert uses h-5 w-5 icons (alert.tsx:143), InlineNotification uses h-3.5 w-3.5 (plan:239, existing code pick-list-lines.tsx:214). Documented difference is intentional (compact inline vs block-level). No issue.

- **Check: Variant color drift from Alert** — Plan explicitly documents divergence (warning border: amber-400 for inline vs amber-300 for Alert) and justifies with higher contrast needs in compact contexts (plan:317-319). Risk acknowledged (plan:381-383) with mitigation (document relationship in JSDoc). Acceptable.

- **Check: TypeScript strict mode compliance** — Props interface uses strict types (`variant: InlineNotificationVariant`, `children: React.ReactNode`, `icon?: React.ReactNode | boolean`, `testId: string`). No `any` types. Complies with plan:3 (Data Model / Contracts) and CLAUDE.md definition of done.

- **Check: Missing backend coordination** — Component is purely presentational, no API calls (plan:212). Correct.

---

## 6) Derived-Value & State Invariants (table)

**None; proof.**

InlineNotification is a pure presentational component with no React state, no TanStack Query integration, no form coordination, and no derived calculations. All props are consumed directly for rendering:

- `variant` maps to static color classes (plan:221-225)
- `icon` resolves to ReactNode or default icon component (plan:231-234)
- `children` renders as-is (plan:240)
- `testId` applies to container attribute (plan:238)

Component does not:
- Filter or transform source datasets
- Write to cache or trigger mutations
- Depend on route parameters or global state
- Maintain internal state that could drift from props

**Evidence:** plan:246 (Section 6: Derived State & Invariants states "None required. Component is stateless and purely presentational."); plan:253 (Section 7: State Consistency confirms "Not applicable. Component has no async behavior, no TanStack Query integration, no instrumentation events."); plan:299 (Section 10: Lifecycle confirms "Not applicable. Component has no effects, subscriptions, or background work.").

---

## 7) Risks & Mitigations (top 3)

- **Risk:** Future inline notification needs may require dismiss/action buttons or other interactive features not supported by current API
  - **Mitigation:** Plan acknowledges risk (plan:389-391) and proposes YAGNI approach: start simple, extend API when concrete use case emerges. Document extension path in component JSDoc. If interactive inline notifications become common, consider Alert component instead or create variant with different API.
  - **Evidence:** `plan.md:389-391` — "Future inline notification needs may require dismiss/action buttons… Start simple; extend API when concrete use case emerges"

- **Risk:** Variant color mappings may diverge between InlineNotification and Alert over time, creating inconsistent user experience
  - **Mitigation:** Plan documents relationship in component JSDoc (plan:382). Both components should use same variant names (error/warning/info/success) and similar color families, accepting minor differences for context (compact inline vs block-level). Periodic visual regression review can catch unintended drift.
  - **Evidence:** `plan.md:381-383` — "InlineNotification and Alert variants may diverge over time… Document the relationship in component JSDoc"

- **Risk:** Excluding `className` prop may generate consumer requests for layout control (margins, positioning, wrapping)
  - **Mitigation:** Design decision is documented in plan (plan:94, 206, 385-387). Consumers can wrap component in container div if layout control needed. If specific layout needs emerge repeatedly, evaluate whether they represent genuine reusable patterns (e.g., `max-width` for table cells) that warrant optional `className` with strict documentation limiting usage to layout utilities only.
  - **Evidence:** `plan.md:385-387` — "Consumers may want layout control… consumers can wrap component in container div if layout control needed"

---

## 8) Confidence

**Confidence: High** — Plan demonstrates thorough research with accurate repository evidence, minimal well-scoped implementation (single refactoring site), clear component boundaries, explicit test preservation strategy, and reasonable design tradeoffs. The sole current usage is correctly identified and quoted. Speculative variant design (error/info/success) is transparently acknowledged. Risks are documented with pragmatic mitigations. No blocking ambiguities remain. Implementation can proceed with high confidence of success, pending consideration of the three minor findings (speculative variants, accessibility guidance, wrapping behavior documentation).
