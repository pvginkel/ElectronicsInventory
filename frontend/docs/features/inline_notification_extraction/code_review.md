# Code Review — InlineNotification Component Extraction

## 1) Summary & Decision

**Readiness**

The implementation successfully extracts the inline notification pattern into a reusable `InlineNotification` component with correct API specification, proper TypeScript types, and complete refactoring of the identified usage. All tests pass (`pnpm check` and Playwright specs), the component follows established project patterns (similar to Alert component), and the testId attribute is properly preserved. The code is production-ready with no blocking issues identified.

**Decision**

`GO` — Implementation meets all plan requirements, follows project conventions, maintains test coverage, and introduces no regressions. TypeScript strict mode passes, the component API matches the specification exactly (no className prop), and the refactored pick list shortfall badge maintains identical visual output while eliminating CSS duplication.

---

## 2) Conformance to Plan (with evidence)

**Plan alignment**

- **Section 1 (Intent & Scope)** ↔ `src/components/ui/inline-notification.tsx:1-132` — Component created with exact variant types ('error' | 'warning' | 'info' | 'success'), icon support (boolean | ReactNode), testId prop, and NO className prop as specified.

```typescript
export interface InlineNotificationProps {
  variant: InlineNotificationVariant;
  children: React.ReactNode;
  icon?: React.ReactNode | boolean;
  testId: string;
}
```

- **Section 3 (Data Model / Contracts)** ↔ `src/components/ui/inline-notification.tsx:4-40` — Props interface matches plan specification exactly, including JSDoc comments describing variant semantics and icon behavior.

- **Section 5 (Algorithms & UI Flows)** ↔ `src/components/ui/inline-notification.tsx:91-129` — Rendering flow implemented as planned:
  - Variant-to-color mapping (lines 94-99)
  - Variant-to-icon mapping (lines 102-107)
  - Icon resolution logic (lines 110-116)
  - Container with base classes and variant colors (line 121)
  - Icon slot with standardized sizing `h-3.5 w-3.5 flex-shrink-0 aria-hidden="true"` (line 113)

- **Section 2 (Affected Areas)** ↔ `src/components/ui/index.ts:4-9` — Component exported from UI barrel file.

```typescript
export {
  InlineNotification,
  type InlineNotificationProps,
  type InlineNotificationVariant,
} from './inline-notification';
```

- **Section 2 (Pick List Refactoring)** ↔ `src/components/pick-lists/pick-list-lines.tsx:210-216` — Shortfall badge refactored from inline CSS to InlineNotification component, preserving testId.

```tsx
<InlineNotification
  variant="warning"
  icon={true}
  testId={`pick-lists.detail.line.${lineId}.shortfall`}
>
  Shortfall {NUMBER_FORMATTER.format(shortfall)}
</InlineNotification>
```

- **Section 13 (Deterministic Test Plan)** ↔ Playwright execution output — All 7 tests in `tests/e2e/pick-lists/pick-list-detail.spec.ts` pass, including shortfall badge assertions at line 120 (`await expect(pickLists.lineShortfall(lineForPartB!.id)).toContainText('Shortfall 6');`).

**Gaps / deviations**

None identified. Implementation adheres to plan specification completely.

---

## 3) Correctness — Findings (ranked)

**No findings.** The implementation is correct.

All type checks pass, the component API matches the specification, the refactored usage maintains identical visual output, testId preservation ensures test compatibility, and Playwright specs confirm functional correctness.

---

## 4) Over-Engineering & Refactoring Opportunities

**No over-engineering identified.** The component is appropriately scoped.

The implementation follows the same pattern established by the Alert component (variant mapping, icon resolution, forwardRef), uses straightforward conditional logic for icon rendering, and avoids unnecessary abstractions. The four variants (error, warning, info, success) are justified by the plan's anticipation of future needs while maintaining simplicity in the current implementation.

**Minor observation (not a problem):**

- Hotspot: Icon size classes duplicated between InlineNotification and default icon rendering
- Evidence: `src/components/ui/inline-notification.tsx:113` — `<IconComponent className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />`
- Note: When `icon` is a custom ReactNode, the consumer must manually apply sizing classes. This is intentional per the plan and documented in JSDoc examples.
- Payoff: No refactor needed; pattern matches Alert component behavior and provides flexibility for custom icons.

---

## 5) Style & Consistency

**Pattern: Component structure matches Alert component**

- Evidence: `src/components/ui/inline-notification.tsx:91-129` vs `src/components/ui/alert.tsx:121-194`
- Impact: Positive consistency—both components use identical variant-to-class and variant-to-icon mapping patterns, forwardRef, and displayName assignment.
- Recommendation: Maintain this consistency when adding future notification-style components.

**Pattern: Variant color classes differ from Alert for inline context**

- Evidence:
  - InlineNotification warning: `border-amber-400 bg-amber-50 text-amber-900` (line 96)
  - Alert warning: `border-amber-300 bg-amber-50 text-amber-900` (alert.tsx:126)
- Impact: Intentional differentiation—plan specifies `border-amber-400` for inline notifications to maintain higher contrast in compact inline contexts (Section 12). This is a deliberate design decision, not an inconsistency.
- Recommendation: Document this distinction in JSDoc if future maintainers question the difference. Current implementation is correct.

**Pattern: No className prop (enforced consistency)**

- Evidence: `src/components/ui/inline-notification.tsx:12-40` — Props interface excludes className
- Impact: Positive enforcement—prevents layout escape hatches and ensures visual consistency across all inline notification usages, as specified in plan Section 1 ("NO className prop support").
- Recommendation: If consumers request layout control, direct them to wrap the component in a container div (per plan Section 15 risk mitigation).

**Pattern: Icon aria-hidden="true"**

- Evidence: `src/components/ui/inline-notification.tsx:113` — Icons marked `aria-hidden="true"`
- Impact: Correct accessibility pattern—text content provides semantic meaning, icons are decorative.
- Recommendation: Maintain this pattern; aligns with Alert component (alert.tsx:143) and plan Section 12.

---

## 6) Tests & Deterministic Coverage (new/changed behavior only)

**Surface: Pick List Detail — Shortfall Badge**

**Scenarios:**
- Given a pick list line with insufficient stock (shortfall > 0), When viewing the line, Then shortfall badge displays "Shortfall {quantity}" with warning icon (`tests/e2e/pick-lists/pick-list-detail.spec.ts:120`)
  - Assertion: `await expect(pickLists.lineShortfall(lineForPartB!.id)).toContainText('Shortfall 6');`
  - Result: PASS (verified in test execution output)

- Given a pick list line with sufficient stock, When viewing the line, Then no shortfall badge is displayed—"—" placeholder shown instead (`tests/e2e/pick-lists/pick-list-detail.spec.ts:203, 227`)
  - Assertion: `await expect(pickLists.lineShortfall(lineId)).toHaveText('—');`
  - Result: PASS

**Hooks:**
- Selector: `data-testid="pick-lists.detail.line.{lineId}.shortfall"` (preserved in refactoring)
- Page object: `tests/support/page-objects/pick-lists-page.ts:82-84` — `lineShortfall(lineId: number)` method
- No instrumentation events: Component is presentational; tests assert DOM visibility and content via standard Playwright locators (per plan Section 9)

**Gaps:**

None. Existing test coverage is comprehensive and remains green after refactoring. The component extraction is a pure refactoring with no behavior changes, so no new test scenarios are required.

**Evidence:**
- Test execution: All 7 tests in `tests/e2e/pick-lists/pick-list-detail.spec.ts` pass (18.2s runtime)
- Type checking: `pnpm check` passes with no TypeScript errors
- Linting: ESLint passes with no violations

---

## 7) Adversarial Sweep (must attempt ≥3 credible failures or justify none)

**Checks attempted:**

1. **Missing testId causing Playwright failures**
   - Evidence: `src/components/ui/inline-notification.tsx:39` — testId marked as required in TypeScript interface
   - Why code held up: TypeScript compiler enforces testId presence at call sites; attempting to use InlineNotification without testId produces compile error. Refactored usage at `src/components/pick-lists/pick-list-lines.tsx:213` correctly provides testId.

2. **Icon rendering inconsistency between default and custom icons**
   - Evidence: `src/components/ui/inline-notification.tsx:110-116` — Icon resolution logic
   - Why code held up: Logic correctly distinguishes `icon === true` (default icon), `icon && typeof icon !== 'boolean'` (custom icon), and falsy icon (no icon). The check `typeof icon !== 'boolean'` prevents boolean values from being rendered as ReactNode.

3. **Variant typo or invalid value causing runtime errors**
   - Evidence: `src/components/ui/inline-notification.tsx:7, 20` — TypeScript type constraint `InlineNotificationVariant = 'error' | 'warning' | 'info' | 'success'`
   - Why code held up: TypeScript strict mode enforces variant type at compile time. The refactored usage at `pick-list-lines.tsx:211` uses `variant="warning"` which is type-checked. Runtime access to `variantClasses[variant]` and `defaultIcons[variant]` is guaranteed safe because variant is constrained to valid keys.

4. **Accessibility regression (missing aria-hidden on icons)**
   - Evidence: `src/components/ui/inline-notification.tsx:113` — `aria-hidden="true"` applied to default icons
   - Why code held up: Default icons correctly include `aria-hidden="true"`. Custom icons (when `icon` is ReactNode) must be provided with accessibility attributes by the consumer, which is documented in JSDoc examples and matches Alert component pattern.

5. **TestId preservation during refactoring**
   - Evidence: Playwright test execution shows all assertions pass without modification
   - Why code held up: The refactored component accepts testId as a prop and applies it to the container span (`src/components/ui/inline-notification.tsx:122`), maintaining the exact same `data-testid` value (`pick-lists.detail.line.${lineId}.shortfall`) that existed before refactoring.

6. **Visual regression from color class changes**
   - Evidence: Git diff shows color classes unchanged (`border-amber-400 bg-amber-50 text-amber-900`)
   - Why code held up: InlineNotification component's warning variant uses identical Tailwind classes to the original inline CSS. The plan explicitly decided to keep `border-amber-400` for higher contrast in inline contexts (Section 12).

---

## 8) Invariants Checklist (table)

**Invariant 1: testId attribute always present on container element**
- Where enforced: `src/components/ui/inline-notification.tsx:39, 122` — TypeScript requires testId prop, JSX applies it to span
- Failure mode: Missing testId would break Playwright locators like `page.getByTestId('pick-lists.detail.line.123.shortfall')`
- Protection: TypeScript required field prevents omission at compile time; JSX ensures attribute is rendered
- Evidence: `src/components/pick-lists/pick-list-lines.tsx:213` — testId correctly provided; Playwright tests pass

**Invariant 2: Icon sizing consistency (h-3.5 w-3.5) for default icons**
- Where enforced: `src/components/ui/inline-notification.tsx:113` — Default icon rendering includes `className="h-3.5 w-3.5 flex-shrink-0"`
- Failure mode: Inconsistent icon sizes would break visual alignment in table cells and inline contexts
- Protection: Hardcoded size classes on default icon component; custom icons documented to match size in JSDoc
- Evidence: Plan Section 5 specifies h-3.5 w-3.5 sizing; implementation matches specification

**Invariant 3: Variant-to-color mapping stability**
- Where enforced: `src/components/ui/inline-notification.tsx:94-99` — Static object mapping variant keys to class strings
- Failure mode: Invalid variant would cause undefined className, breaking visual styling
- Protection: TypeScript InlineNotificationVariant type constrains variant to valid keys ('error' | 'warning' | 'info' | 'success'); object access is type-safe
- Evidence: `src/components/pick-lists/pick-list-lines.tsx:211` — variant="warning" is type-checked; invalid variant like "danger" would fail compilation

**Invariant 4: No className prop escape hatch**
- Where enforced: `src/components/ui/inline-notification.tsx:12-40` — Props interface excludes className
- Failure mode: Allowing className would permit consumers to override colors/borders, breaking visual consistency (design goal)
- Protection: TypeScript interface explicitly omits className; attempting to pass className produces compile error
- Evidence: Plan Section 1 specifies "NO className prop"; implementation enforces this constraint via type system

---

## 9) Questions / Needs-Info

**No unresolved questions.** Implementation is complete and conformant to plan.

---

## 10) Risks & Mitigations (top 3)

**Risk 1: Future consumers may request className prop for layout control**
- Mitigation: Design decision documented in plan (Section 15) and component JSDoc (lines 58-60). Consumers can wrap component in container div if layout control needed. Monitor feature requests; add className only if concrete use case emerges that cannot be solved with wrapper approach.
- Evidence: Plan Section 15 "Open Questions" addresses this explicitly; Section 1 specifies "NO className prop support (enforce consistent styling, no layout escape hatches)"

**Risk 2: Variant color divergence from Alert component over time**
- Mitigation: Both components use similar variant names and structure. Document the relationship in component JSDoc (consider adding cross-reference comment). If Alert variant colors change, evaluate whether InlineNotification should follow or maintain distinct styling for inline contexts.
- Evidence: Current implementation maintains intentional difference (border-amber-400 vs border-amber-300) as specified in plan Section 12

**Risk 3: Custom icon consumers may forget to apply sizing classes**
- Mitigation: JSDoc includes example showing custom icon usage (lines 82-89). If visual inconsistencies emerge, consider adding runtime warning in development mode or updating documentation with prominent callout.
- Evidence: `src/components/ui/inline-notification.tsx:114-116` — Custom icon passed through without modification; plan Section 8 acknowledges this edge case and defers enforcement to documentation

---

## 11) Confidence

Confidence: High — Implementation matches plan specification exactly, follows established project patterns (Alert component structure), maintains test coverage (all 7 Playwright specs pass), and introduces no TypeScript or linting errors. The refactoring is a straightforward extraction with preserved visual output and testId attributes, making regression risk minimal.
