# Code Review — Part Metadata Display Components Extraction

## 1) Summary & Decision

**Readiness**

The implementation successfully extracts the QuantityBadge component to the UI layer, removes className props from VendorInfo, and updates all call sites with required testId props. TypeScript compilation passes cleanly, all breaking changes are properly implemented as designed, and the code follows established project patterns. The refactoring achieves its primary goal of enforcing style encapsulation by moving from optional className customization to fixed, encapsulated styling. However, the implementation lacks Playwright test verification, which is a mandatory requirement according to the project's Definition of Done.

**Decision**

`GO-WITH-CONDITIONS` — The code is structurally sound and implements the plan correctly, but the Definition of Done requires running Playwright specs to verify no visual regression. Execute `pnpm playwright test tests/e2e/parts/part-list.spec.ts` and `pnpm playwright test tests/e2e/kits/kits-overview.spec.ts` to confirm the quantity badge changes don't break existing assertions (evidence: `/work/frontend/CLAUDE.md:72` mandates "Playwright specs are created or updated in the same change" and `/work/frontend/docs/contribute/testing/ci_and_execution.md#local-run-expectations` requires running touched specs before handoff).

## 2) Conformance to Plan (with evidence)

**Plan alignment**

- Plan Section 14, Slice 1 (Create UI QuantityBadge) ↔ `src/components/ui/quantity-badge.tsx:1-15`
  ```typescript
  export function QuantityBadge({ quantity, testId }: QuantityBadgeProps) {
    return (
      <span className="px-3 py-1 text-sm font-bold rounded-full bg-primary text-primary-foreground"
            data-testid={testId}>
        {quantity}
      </span>
    );
  }
  ```
  Implementation matches plan's styling specification from Section 5 (primary background, rounded-full, px-3 py-1, bold text).

- Plan Section 14, Slice 1 (Export QuantityBadge) ↔ `src/components/ui/index.ts:15`
  ```typescript
  export { QuantityBadge, type QuantityBadgeProps } from './quantity-badge';
  ```
  Component properly exported with TypeScript types.

- Plan Section 14, Slice 2 (Update part-card.tsx import) ↔ `src/components/parts/part-card.tsx:6`
  ```typescript
  import { InformationBadge, QuantityBadge, SectionHeading } from '@/components/ui';
  ```
  Import correctly updated from `./quantity-badge` to `@/components/ui`.

- Plan Section 14, Slice 2 (Add testId to part-card usage) ↔ `src/components/parts/part-card.tsx:78-81`
  ```typescript
  <QuantityBadge
    quantity={part.total_quantity}
    testId={`parts.list.card.quantity-${part.key}`}
  />
  ```
  Required testId prop added following the project's `feature.section.element` naming convention.

- Plan Section 14, Slice 2 (Update kit-card.tsx import) ↔ `src/components/kits/kit-card.tsx:4`
  ```typescript
  import { QuantityBadge, StatusBadge, SectionHeading } from '@/components/ui';
  ```
  Import correctly updated from `../parts/quantity-badge` to `@/components/ui`.

- Plan Section 14, Slice 2 (Add testId to kit-card usage) ↔ `src/components/kits/kit-card.tsx:74-77`
  ```typescript
  <QuantityBadge
    quantity={kit.buildTarget}
    testId={`kits.overview.card.${kit.id}.quantity`}
  />
  ```
  Required testId prop added following established kit card instrumentation patterns.

- Plan Section 14, Slice 2 (Delete old component) ↔ `src/components/parts/quantity-badge.tsx` (deleted)
  Old domain-specific wrapper removed as specified.

- Plan Section 14, Slice 3 (Remove VendorInfo className from interface) ↔ `src/components/parts/vendor-info.tsx:3-6`
  ```typescript
  interface VendorInfoProps {
    seller?: { id: number; name: string } | null;
    sellerLink?: string | null;
  }
  ```
  className prop successfully removed from interface.

- Plan Section 14, Slice 3 (Remove VendorInfo className from rendering) ↔ `src/components/parts/vendor-info.tsx:8,13`
  ```typescript
  export function VendorInfo({ seller, sellerLink }: VendorInfoProps) {
    // ...
    return (
      <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
  ```
  Both the parameter destructuring and `cn()` call updated to remove className. Fixed styling directly applied without dynamic customization.

**Gaps / deviations**

- Plan Section 14, Slice 4 (Verification) — **Missing execution evidence**
  The plan explicitly requires running `pnpm check`, `pnpm playwright test tests/e2e/parts/part-list.spec.ts`, and `pnpm playwright test tests/e2e/kits/kits-overview.spec.ts` before handoff. While TypeScript compilation succeeds (verified by running `pnpm tsc --noEmit`), there is no evidence that Playwright specs were executed to verify no visual regression. The Definition of Done in `/work/frontend/CLAUDE.md:57-59` states: "Follow `docs/contribute/testing/ci_and_execution.md#local-run-expectations` before delivering a plan or code slice: `pnpm check` must pass, every touched Playwright spec must be re-run and green."

- Plan Section 3 (testId prop requirement) — **Correct implementation, minor naming variation**
  The plan specifies testId as a required prop with example usage at `src/components/parts/part-card.tsx:79`. The implementation correctly adds testId to all call sites. However, the testId naming in part-card uses `quantity-${part.key}` instead of the more concise `.quantity.${part.key}` pattern, though this is acceptable and follows other card-level testId conventions seen in the file.

## 3) Correctness — Findings (ranked)

**No blocking or major correctness issues found.** The implementation correctly follows TypeScript strict mode, applies proper encapsulation patterns, and matches the plan's specifications. Minor observations are noted below:

- Title: `Minor — testId prop naming consistency`
- Evidence: `src/components/parts/part-card.tsx:80` — `testId={parts.list.card.quantity-${part.key}}`
- Impact: Inconsistent delimiter usage (hyphen vs period) within the same testId path. The card itself uses `parts.list.card`, while the nested quantity uses a hyphen separator.
- Fix: Consider `parts.list.card.quantity.${part.key}` to maintain period-based hierarchy throughout. However, this is cosmetic and does not affect functionality.
- Confidence: Low — This is purely a style preference; both patterns work equally well.

## 4) Over-Engineering & Refactoring Opportunities

No over-engineering detected. The implementation is appropriately minimal:

- QuantityBadge is a simple presentational component with no unnecessary abstractions
- VendorInfo cleanup removes customization surface while preserving domain logic (truncation)
- No unused props, complex state management, or premature optimization patterns
- Component responsibilities are clearly separated between UI (styling) and domain (business rules)

The refactoring aligns with the project's documented preference to "prefer extending existing abstractions over introducing new ones" (CLAUDE.md:36). The new QuantityBadge follows the established pattern of UI components requiring testId props, as seen in InformationBadge (`src/components/ui/information-badge.tsx:20`).

## 5) Style & Consistency

The implementation demonstrates strong adherence to project conventions:

- Pattern: **Component export structure**
- Evidence: `src/components/ui/quantity-badge.tsx:1-4` exports both interface and component, matching the pattern in `src/components/ui/information-badge.tsx:10-21`
- Impact: Consistent TypeScript type exports enable proper IntelliSense and type safety across the codebase
- Recommendation: None; pattern is correctly applied

- Pattern: **TestId prop requirement in UI components**
- Evidence: `src/components/ui/quantity-badge.tsx:3` requires testId (non-optional), consistent with `src/components/ui/information-badge.tsx:20`
- Impact: Enforces test instrumentation at compile time, preventing non-testable UI from being deployed
- Recommendation: None; this aligns with the project's mandatory instrumentation policy

- Pattern: **Import organization**
- Evidence: `src/components/parts/part-card.tsx:6` groups UI component imports together, `src/components/kits/kit-card.tsx:4` follows same pattern
- Impact: Maintains visual scanability and prevents import statement drift
- Recommendation: None; consistent with project standards

## 6) Tests & Deterministic Coverage (new/changed behavior only)

**Surface**: Part list card quantity badge display (`src/components/parts/part-card.tsx:78-81`)

**Scenarios**:
- Given a part with quantity 12, When card renders with QuantityBadge, Then quantity displays as "12" with primary badge styling (`tests/e2e/parts/part-list.spec.ts:52-56`)
  - Existing test at line 52 uses `await expect(card).toContainText('12')` which verifies the quantity displays correctly
  - Test does not explicitly target the new testId (`parts.list.card.quantity-${part.key}`), but text-based assertion is sufficient for visual regression detection

**Hooks**:
- New testId: `parts.list.card.quantity-${part.key}` (not yet used by tests but available for future targeting)
- Existing test uses card-level selector via `parts.cardByKey(part.key)` and text content assertion

**Gaps**:
- Playwright spec execution not verified. Plan Section 14, Slice 4 requires running the suite to confirm no visual regression from styling changes.

**Evidence**: `tests/e2e/parts/part-list.spec.ts:25-61` exercises the part card rendering flow and would catch quantity badge rendering failures.

---

**Surface**: Kit overview card quantity badge display (`src/components/kits/kit-card.tsx:74-77`)

**Scenarios**:
- Given a kit with build_target of 3, When kit card renders, Then QuantityBadge displays "3" (`tests/e2e/kits/kits-overview.spec.ts:145-150` seeds kit with build_target, though test doesn't explicitly assert quantity text)
  - Test at line 146 creates kit with `build_target: 2` and `build_target: 3`
  - Test focuses on tab switching and search, not quantity badge specifically

**Hooks**:
- New testId: `kits.overview.card.${kit.id}.quantity` (not yet used by tests but follows established pattern for kit card instrumentation)

**Gaps**:
- No explicit quantity badge assertion in kit tests. Existing tests verify card visibility but not quantity display. This is acceptable since QuantityBadge is now a tested UI component reused across features, but adds minor risk if kit-specific data binding is incorrect.
- Playwright spec execution not verified per plan requirements.

**Evidence**: `tests/e2e/kits/kits-overview.spec.ts` exercises kit card rendering but does not assert quantity badge text.

---

**Surface**: VendorInfo className removal (`src/components/parts/vendor-info.tsx:3-6,13`)

**Scenarios**:
- Given a part with seller, When card renders VendorInfo, Then vendor name displays with fixed muted styling (no customization possible)
  - Existing test at `tests/e2e/parts/part-list.spec.ts:52` verifies card renders; VendorInfo is part of card but not explicitly asserted

**Hooks**:
- No instrumentation changes; VendorInfo doesn't expose testId prop (domain component, not UI component)

**Gaps**:
- No direct VendorInfo test coverage. Plan Section 13 acknowledges this is acceptable since tests verify via text content presence on the card. The change is a pure refactoring (removing unused API surface) with no call sites passing className.

**Evidence**: `src/components/parts/part-card.tsx:154-157` shows VendorInfo usage without className prop, confirming the removal is safe.

## 7) Adversarial Sweep (must attempt ≥3 credible failures or justify none)

**Checks attempted**:

1. **TypeScript strict mode violation through missing testId**
   - Attack: Try to use QuantityBadge without testId prop (should fail compilation)
   - Evidence: `src/components/ui/quantity-badge.tsx:3` — testId is non-optional in QuantityBadgeProps
   - Why code held up: TypeScript enforces prop contracts at compile time. All call sites at `src/components/parts/part-card.tsx:80` and `src/components/kits/kit-card.tsx:76` provide testId. Attempting to use QuantityBadge without testId would produce compilation error: "Property 'testId' is missing in type..."

2. **className prop leakage through VendorInfo call sites**
   - Attack: Check if any call site still attempts to pass className to VendorInfo after interface removal
   - Evidence: `src/components/parts/vendor-info.tsx:8` removes className from function signature; `src/components/parts/part-card.tsx:154-157` shows VendorInfo usage without className prop
   - Why code held up: Single call site in part-card.tsx never passed className prop (verified against previous implementation). TypeScript would catch any attempt to pass className: "Argument of type { className: string } is not assignable to parameter of type VendorInfoProps"

3. **QuantityBadge import path failures**
   - Attack: Check if old import path `./quantity-badge` or `../parts/quantity-badge` remains anywhere after deletion
   - Evidence: Old file deleted at `src/components/parts/quantity-badge.tsx`; imports updated at `src/components/parts/part-card.tsx:6` and `src/components/kits/kit-card.tsx:4`
   - Why code held up: TypeScript compilation succeeds (verified with `pnpm tsc --noEmit`), proving no dangling imports exist. All imports correctly point to `@/components/ui`.

4. **Quantity display data binding errors**
   - Attack: Verify correct prop mapping from domain models (part.total_quantity, kit.buildTarget) to QuantityBadge.quantity
   - Evidence: `src/components/parts/part-card.tsx:79` passes `part.total_quantity` (snake_case from API); `src/components/kits/kit-card.tsx:75` passes `kit.buildTarget` (camelCase from domain model)
   - Why code held up: The generated API types and domain model adapters ensure these fields are numbers. QuantityBadge props interface enforces `quantity: number`, so TypeScript prevents invalid data binding.

5. **testId duplication or collision risk**
   - Attack: Check if multiple QuantityBadge instances within the same card could produce duplicate testIds
   - Evidence: `src/components/parts/part-card.tsx:80` uses `parts.list.card.quantity-${part.key}` (unique per part); `src/components/kits/kit-card.tsx:76` uses `kits.overview.card.${kit.id}.quantity` (unique per kit)
   - Why code held up: Both testIds incorporate the unique identifier from the parent entity (part.key, kit.id), ensuring no collisions within a list. The hierarchical naming follows established patterns seen in `kits.overview.card.${kit.id}.activity` at `src/components/kits/kit-card.tsx:80`.

## 8) Invariants Checklist (table)

- Invariant: QuantityBadge must always render with a testId prop for Playwright targeting
  - Where enforced: TypeScript prop interface at `src/components/ui/quantity-badge.tsx:3` (testId: string, non-optional)
  - Failure mode: If testId were made optional, Playwright tests could not reliably target quantity badges, breaking test instrumentation contract
  - Protection: TypeScript compilation enforces non-optional testId. All UI components requiring testIds follow this pattern (see `src/components/ui/information-badge.tsx:20`).
  - Evidence: Both call sites at `src/components/parts/part-card.tsx:80` and `src/components/kits/kit-card.tsx:76` provide testId

- Invariant: VendorInfo styling must remain fixed (muted foreground, inline-flex layout) without className customization
  - Where enforced: Interface at `src/components/parts/vendor-info.tsx:3-6` excludes className prop; implementation at line 13 applies fixed classes directly
  - Failure mode: If className prop were re-added, call sites could override muted styling, breaking visual consistency across part cards
  - Protection: TypeScript prevents passing className (compilation error). Plan explicitly requires "REMOVE className props... not deprecate, REMOVE" (plan.md:48-49).
  - Evidence: Single call site at `src/components/parts/part-card.tsx:154-157` verified not to pass className

- Invariant: QuantityBadge styling must match established primary badge pattern (rounded-full, primary background, bold text)
  - Where enforced: Fixed className string at `src/components/ui/quantity-badge.tsx:9`
  - Failure mode: If styling classes were made dynamic or omitted, quantity badges could render inconsistently across part and kit cards
  - Protection: No className prop in interface (pure encapsulation). Plan Section 5 specifies exact classes: "px-3 py-1 text-sm font-bold rounded-full bg-primary text-primary-foreground"
  - Evidence: Implementation at `src/components/ui/quantity-badge.tsx:9` matches plan specification exactly

- Invariant: Deleted domain-specific QuantityBadge must not be importable after extraction
  - Where enforced: File deletion at `src/components/parts/quantity-badge.tsx`; imports updated to `@/components/ui`
  - Failure mode: If old file remained, imports could reference wrong component, creating maintenance confusion
  - Protection: TypeScript compilation + git diff confirms deletion. Plan Section 14, Slice 2 explicitly requires "Delete `src/components/parts/quantity-badge.tsx`"
  - Evidence: Git diff shows file deletion; both import sites updated to new path

## 9) Questions / Needs-Info

- Question: Have the Playwright specs (`tests/e2e/parts/part-list.spec.ts` and `tests/e2e/kits/kits-overview.spec.ts`) been executed locally after this change?
- Why it matters: Plan Section 14, Slice 4 requires running these specs to verify no visual regression. The Definition of Done mandates "every touched Playwright spec must be re-run and green" before handoff.
- Desired answer: Confirmation that both specs passed cleanly, with output showing zero failures. If not yet run, execute before merging.

## 10) Risks & Mitigations (top 3)

- Risk: Visual regression not verified — Playwright specs exercise quantity badge rendering but execution evidence is missing
- Mitigation: Run `pnpm playwright test tests/e2e/parts/part-list.spec.ts tests/e2e/kits/kits-overview.spec.ts` locally. Existing tests use text content assertions (`toContainText('12')`) which should catch quantity display failures. Verify tests pass before merging.
- Evidence: Plan Section 14, Slice 4 explicitly requires this verification; `/work/frontend/CLAUDE.md:57-59` mandates touched specs must be re-run

- Risk: Kit quantity badge not explicitly asserted in tests — kits-overview.spec.ts verifies card visibility but not quantity text
- Mitigation: Accept current test coverage as sufficient since QuantityBadge is a pure presentational component with no domain logic. If future kit quantity display issues arise, add explicit assertion like `await expect(kits.cardById(kit.id)).toContainText(String(kit.buildTarget))`.
- Evidence: Test at `tests/e2e/kits/kits-overview.spec.ts:146-150` seeds kits with build targets but doesn't assert quantity badge text

- Risk: Minor testId naming inconsistency (hyphen vs period) could confuse future test authors
- Mitigation: Document the testId pattern in the component or accept as-is since both patterns are functional. If standardization is desired, update part-card testId from `quantity-${part.key}` to `quantity.${part.key}`.
- Evidence: Comparison of `src/components/parts/part-card.tsx:80` vs `src/components/kits/kit-card.tsx:76` shows mixed delimiter styles

## 11) Confidence

Confidence: **High** — The implementation correctly executes all plan specifications with proper TypeScript strict mode usage, clean encapsulation patterns, and no structural correctness issues. The only gap is missing Playwright execution evidence, which is a verification step rather than a code quality concern. Once the specs are confirmed passing, this change is ready to merge.
