# Plan Review: CapacityBar Component Extraction

## 1) Summary & Decision

**Readiness**

The updated plan successfully addresses the critical className prop inconsistency identified in the previous review by explicitly documenting that CapacityBar will NOT expose className, and that ProgressBar will be composed internally with hard-coded props (size="md", variant="default"). The plan now provides clear, implementation-ready specifications with comprehensive evidence, well-defined scope, and minimal risk. The component follows established UI patterns (MetricDisplay, SectionHeading, CollectionGrid) that similarly reject className props to enforce consistency. All technical details are grounded in file:line evidence from the codebase, and the single-slice implementation strategy is appropriate for this low-risk refactoring.

**Decision**

`GO` — The plan is implementation-ready. The className prop concern has been resolved through explicit documentation and design constraints. No blocking issues remain.

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `docs/commands/plan_feature.md` — Pass — `plan.md:1-516` — Plan follows all required section templates (0-16), provides file:line evidence for all claims, uses prescribed XML template outputs, and documents derived values, invariants, and test coverage as required.

- `docs/contribute/ui/data_display.md` — Pass — `plan.md:18-19, 389-394` — Plan correctly identifies that CapacityBar is a presentational component for label+value+progress visualization, similar to DescriptionItem pattern. Plan appropriately composes existing ProgressBar component (lines 6, 220-222) rather than reimplementing progress bar rendering, consistent with the guideline to "reuse existing abstractions."

- `docs/contribute/architecture/application_overview.md` — Pass — `plan.md:82-89` — Plan follows established export pattern through `src/components/ui/index.ts` and references domain-driven folder layout (box-card, box-details in `src/components/boxes`).

- `docs/contribute/testing/playwright_developer_guide.md` — Pass — `plan.md:405-440` — Plan correctly identifies that existing Playwright tests do NOT assert on visual progress bars and require no modifications. Tests target functional behavior (metadata badges) rather than visual rendering. Plan explicitly scopes visual changes as out-of-scope for test updates (lines 413-419, 421-429), which aligns with the project's real-backend policy and deterministic workflows.

- `CLAUDE.md` — Pass — `plan.md:22-24, 154-158` — Plan explicitly documents that className is NOT supported (line 155 comment) and that ProgressBar composition uses hard-coded props without spreading (lines 156-157, 220-222), following the directive to "prefer extending existing abstractions over introducing new ones."

**Fit with codebase**

- `ProgressBar` component (`src/components/ui/progress-bar.tsx:1-72`) — `plan.md:6, 136-137, 220-222` — Plan correctly proposes to compose ProgressBar internally with fixed props (`size="md"`, `variant="default"`). However, note that ProgressBar extends `NativeDivProps` and accepts className (line 17 of progress-bar.tsx), which current usage demonstrates (ai-part-progress-step.tsx:85 passes `className="w-full"`). The plan's decision to NOT expose className from CapacityBar means consumers cannot customize ProgressBar's container styling, which is consistent with the stated goal of "encapsulate all styling decisions" (plan.md:42, 50) and matches patterns like MetricDisplay and SectionHeading.

- `MetricDisplay` component (`src/components/ui/metric-display.tsx:10-19, 48-63`) — `plan.md:18, 154-158` — Plan follows the established pattern of NOT exposing className prop (MetricDisplay JSDoc lines 27-29 explicitly states "Intentionally does not support custom className prop to enforce consistent metric styling"). CapacityBar's CapacityBarProps interface (plan.md:145-159) correctly mirrors this approach with explanatory comment (line 155).

- `BoxCard` usage (`src/components/boxes/box-card.tsx:49-60`) — `plan.md:91-107, 228-239` — Plan accurately quotes the existing inline implementation and proposes clean replacement. The spacing change (mt-3 → mt-2) is acknowledged as acceptable visual regression (plan.md:26-27, 475-477).

- `BoxDetails` usage (`src/components/boxes/box-details.tsx:257-266`) — `plan.md:109-125, 241-252` — Plan correctly identifies the DescriptionItem + inline progress bar pattern and proposes removing the wrapper div structure. The usageStats memo (plan.md:275-280) is properly referenced with dependencies.

- Component export pattern (`src/components/ui/index.ts:1-53`) — `plan.md:82-89` — Plan follows established export convention. All UI components in index.ts export both component and Props interface (e.g., MetricDisplay + MetricDisplayProps, SectionHeading + SectionHeadingProps), confirming CapacityBar + CapacityBarProps is the correct pattern.

## 3) Open Questions & Ambiguities

No open questions remain. The plan resolves all previous ambiguities:

1. **Resolved**: className prop handling is now explicitly documented as NOT supported (plan.md:155-158)
2. **Resolved**: ProgressBar composition is specified with hard-coded props and no spreading (plan.md:220-222)
3. **Resolved**: Spacing standardization (mt-2) is acknowledged as acceptable visual change (plan.md:26-27)
4. **Resolved**: testId support is clearly defined (plan.md:49, 154, 223)

All edge cases are documented (plan.md:294-335), including division by zero (total=0), over-capacity (used>total), and negative inputs (caller responsibility). No implementation blockers exist.

## 4) Deterministic Playwright Coverage (new/changed behavior only)

**Behavior: Box list cards capacity display**
- Scenarios:
  - Given boxes list loaded, When viewing box cards, Then cards display usage information with progress bar (`tests/e2e/boxes/boxes-list.spec.ts`)
  - (Existing test scenario — no visual progress bar assertions)
- Instrumentation: `boxes.list.item.{boxNo}` testid on card (unchanged)
- Backend hooks: No changes to backend factories; tests use existing box data setup
- Gaps: None — visual rendering change does not require new test coverage. Tests verify functional behavior (card visibility, metadata accuracy), not CSS rendering.
- Evidence: `plan.md:413-420` — "tests focus on: Box card visibility and metadata badges ... Existing test already passes with visual change; no assertions on progress bar"

**Behavior: Box detail summary capacity display**
- Scenarios:
  - Given box detail loaded, When viewing summary card, Then usage displays with label and progress bar (`tests/e2e/boxes/boxes-detail.spec.ts`)
  - (Existing test scenario — asserts on metadata badge, not visual progress bar in summary)
- Instrumentation: `boxes.detail.metadata.usage` testid (KeyValueBadge in header, separate from CapacityBar in summary card)
- Backend hooks: No changes; tests use existing box detail data
- Gaps: None — CapacityBar in summary card is visual-only. Tests already verify usage percentage in metadata badge (plan.md:353-355), which is the functional requirement.
- Evidence: `plan.md:421-429` — "Existing tests already pass with visual change; no assertions on progress bar in summary card ... tests verify badge, not visual representation"

**Overall assessment**: Plan correctly identifies that this is a pure visual refactoring with no new testable behavior. Existing Playwright tests remain valid because they target functional metadata (badges, percentages) rather than visual rendering (progress bar CSS). This aligns with the project's testing philosophy of asserting backend state and instrumentation events, not visual styling.

## 5) Adversarial Sweep (must find ≥3 credible issues or declare why none exist)

**Checks attempted:**
- className prop exposure inconsistency (RESOLVED in updated plan)
- ProgressBar composition prop spreading (RESOLVED in updated plan)
- Division by zero edge case handling (lines 296-300)
- Percentage calculation clamping (lines 302-306)
- usageStats memo dependency tracking (lines 275-280)
- testId propagation from props to rendered elements (lines 223, 339-346)
- Import path consistency (lines 232, 245)
- TypeScript interface completeness (lines 145-159)
- Spacing standardization visual regression (lines 475-477)
- Export pattern conformance (lines 82-89)

**Evidence:** `plan.md:145-159` (CapacityBarProps with className exclusion comment), `plan.md:220-222` (ProgressBar composition without spreading), `plan.md:296-313` (edge case handling), `plan.md:275-280` (usageStats memo)

**Why the plan holds:**

The updated plan successfully closes the critical className prop concern through explicit documentation and design constraints. After thorough examination, no credible blocking issues remain:

1. **ClassName encapsulation is now explicit**: The plan documents at lines 155-157 that className is intentionally NOT supported and ProgressBar is composed with hard-coded props. This matches the established pattern in MetricDisplay (metric-display.tsx:27-29) and SectionHeading (section-heading.tsx:37-39).

2. **Edge cases are defensively handled**: Division by zero (total=0) is guarded, percentage is clamped to [0, 100], and null/undefined handling is delegated to parent components with clear documentation (plan.md:296-321).

3. **Type safety is preserved**: CapacityBarProps interface is complete with required fields (used, total) and optional fields (label, testId). TypeScript strict mode will enforce correct usage.

4. **Visual changes are acceptable**: The mt-3 → mt-2 spacing change is acknowledged as minor (~4px difference) and justified for consistency (plan.md:26-27, 475-477).

5. **No new instrumentation required**: Component is visual-only; existing instrumentation in BoxDetails (useListLoadingInstrumentation with usagePercentage) covers functional requirements (plan.md:286-291).

The plan is implementation-ready with no credible risks that would block development.

## 6) Derived-Value & State Invariants (table)

- Derived value: **percentage**
  - Source dataset: Computed from `used` and `total` props (unfiltered inputs from parent components)
  - Write / cleanup triggered: No writes; pure calculation for UI rendering only
  - Guards:
    - `total <= 0` → return 0 (avoid division by zero)
    - `used > total` → clamp to 100 via `Math.min(100, percentage)`
    - `used < 0` or `total < 0` → undefined behavior (documented assumption: callers provide non-negative values)
  - Invariant: Percentage MUST be in range [0, 100] for valid ProgressBar rendering. Violation would cause visual glitch (progress bar overflow).
  - Evidence: `plan.md:258-266` — derived value documentation with guards and invariant

- Derived value: **displayText**
  - Source dataset: Formatted string from `label` (default "Usage:"), `used`, `total`, and computed `percentage` (unfiltered)
  - Write / cleanup triggered: No writes; ephemeral string for text node rendering
  - Guards: Default label to "Usage:" if undefined/null
  - Invariant: Text format MUST match pattern `{label} {used}/{total} ({percentage}%)` to maintain consistency with existing implementations
  - Evidence: `plan.md:268-273` — displayText derivation with format invariant

- Derived value: **usageStats** (BoxDetails only)
  - Source dataset: Computed in BoxDetails from `box` and `boxes` TanStack Query data (unfiltered)
  - Write / cleanup triggered: Passed as props to CapacityBar; no cache mutations or persistent writes
  - Guards:
    - Fallback to 0 for `box.occupied_locations ?? 0`
    - Fallback to `box.capacity` for missing `total_locations`
    - useMemo dependencies ensure recalculation when box/boxes/boxNo change
  - Invariant: usageStats MUST recalculate when source data changes. Stale usageStats would display incorrect capacity until next re-render.
  - Evidence: `plan.md:275-280` — usageStats memo with dependencies `[box, boxes, boxNo]`

**No filtered → persistent write risks**: All derived values are ephemeral UI state. No cache updates, navigation triggers, or storage mutations occur based on derived values. The filtered-write guardrail does not apply here.

## 7) Risks & Mitigations (top 3)

- Risk: Spacing change (mt-3 → mt-2) in BoxCard may be visually noticeable to users
- Mitigation: Document as intentional standardization; spacing difference is minor (~4px). If significant user feedback, component could accept optional spacing variant in future iteration (YAGNI principle applied initially).
- Evidence: `plan.md:475-477` — acknowledged risk with mitigation

- Risk: Division by zero if total=0 slips through parent component guards
- Mitigation: Implement defensive check in CapacityBar: `if (total <= 0) return 0;` before division. Document requirement for consumers to validate inputs. TypeScript type system already enforces number type (not range).
- Evidence: `plan.md:491-494` — division by zero risk with defensive guard proposal

- Risk: Future capacity display use cases may require customization not supported by initial API (e.g., color variants, size variants, custom icons)
- Mitigation: Start with minimal API based on known requirements (used, total, label, testId). Extend incrementally when new requirements are validated. This follows YAGNI principle and prevents premature abstraction.
- Evidence: `plan.md:483-486` — extensibility risk with YAGNI mitigation

## 8) Confidence

Confidence: **High** — The plan addresses the critical className prop concern through explicit documentation and design constraints. All technical details are grounded in codebase evidence, the component follows established UI patterns (MetricDisplay, SectionHeading), edge cases are defensively handled, and the single-slice implementation has minimal risk. The refactoring is well-scoped, preserves existing Playwright coverage, and requires no backend changes.
