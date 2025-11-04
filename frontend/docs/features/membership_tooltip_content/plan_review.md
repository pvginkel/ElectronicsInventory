# Plan Review: MembershipTooltipContent Component Extraction

## 1) Summary & Decision

**Readiness**

The updated plan comprehensively addresses all prior review feedback. The tooltip width has been changed to w-72 with clear justification (lines 69, 412-414), test coverage gaps for part card tooltips are explicitly documented with new test scenarios added (lines 452-474, Slice 5), badge component heterogeneity is acknowledged and accommodated through the ReactNode approach (lines 51-55, 174), and a full call site audit has been performed (lines 42-49). The plan demonstrates thorough research, clear component boundaries, appropriate test coverage strategy, and alignment with project standards. All previous blocker and major issues have been resolved with evidence-backed decisions.

**Decision**

`GO` — All previous concerns have been adequately addressed with explicit documentation, research evidence, and concrete implementation steps. The plan is ready for implementation.

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `docs/commands/plan_feature.md` — Pass — `plan.md:0-566` — Plan follows required structure with all sections (0-16) present, properly numbered, and containing detailed evidence. Research log documents findings with line references, data model contracts are explicit, test plan includes scenarios with instrumentation, and implementation slices are sequenced correctly.

- `docs/contribute/ui/tooltip_guidelines.md` — Pass — `plan.md:305-367` — Plan correctly positions MembershipTooltipContent as pure presentational content within Tooltip component's content prop. No interactive elements planned (links are informational navigation, not critical actions). TestId convention follows documented pattern (lines 433-449, testId appended with .tooltip suffix for content mode).

- `docs/contribute/testing/playwright_developer_guide.md` — Pass — `plan.md:425-485` — Test plan emphasizes API-first data setup through factories, uses existing instrumentation (waitForListLoading), relies on UI visibility assertions without route mocks, and documents existing test coverage in kits-overview.spec.ts while identifying gaps in part-list.spec.ts.

- `docs/contribute/architecture/application_overview.md` — Pass — `plan.md:119-153` — Component placement in src/components/ui/ follows domain-driven structure. Pure presentational component with no data fetching aligns with architecture pattern of separating UI from hooks/API layers.

- `docs/ui_component_workflow.md` — Pass — `plan.md:68-69, 83-84, 126-128` — Plan explicitly removes className props per workflow principle 3 (Encapsulation) and principle 8 (Aggressive Cleanup). Component has clear semantic meaning (MembershipTooltipContent represents tooltip content for membership data) and is domain-agnostic through generic item structure.

**Fit with codebase**

- `MembershipIndicator` (membership-indicator.tsx) — `plan.md:126-128` — Plan correctly identifies three className props to remove (tooltipClassName, iconWrapperClassName, containerClassName) at lines 18-20, 34-36 of membership-indicator.tsx. Hard-coding w-72 on line 83 aligns with existing kit card override pattern (kit-card.tsx:94, 109). Breaking change is intentional and TypeScript will catch all call sites.

- `StatusBadge` vs `Badge` heterogeneity — `plan.md:51-55, 174` — Plan acknowledges kit cards use StatusBadge while part cards use Badge component, and correctly accepts ReactNode for statusBadge prop to support both patterns without forcing standardization (domain-specific choice preserved).

- `SectionHeading` component — `plan.md:29, 180, 234` — Plan reuses existing SectionHeading component from src/components/ui/, maintaining consistency with established UI patterns (referenced in tooltip_guidelines.md:353).

- `Link` component integration — `plan.md:176-179, 200-214, 245-259` — Plan correctly uses TanStack Router Link with params and search props, maintaining existing navigation patterns from kit-card.tsx and part-card.tsx.

- Test instrumentation — `plan.md:341-367, 425-485` — Plan relies on existing test events (ListLoading) and UI visibility assertions without introducing new instrumentation, following principle that component is pure presentational (lines 294-303, 349-357).

## 3) Open Questions & Ambiguities

No open questions remain. The plan explicitly resolves all previous ambiguities:

- **Tooltip width** (lines 69, 412-414): Resolved to w-72 with justification that kit cards already use this width and it accommodates complex membership content.

- **List spacing** (lines 33, 90-91, 408-409): Resolved to space-y-2 (most common pattern) with acknowledgment that visual review may reveal need for adjustment.

- **Metadata text size** (lines 34, 92, 410-411): Resolved to text-xs (standard Tailwind) over text-[11px] (arbitrary custom value).

- **Component naming** (line 76): Resolved to MembershipTooltipContent as it reflects domain semantics better than LinkedItemsTooltip.

- **Badge component standardization** (lines 51-55): Explicitly out of scope; ReactNode approach preserves domain-specific choices.

- **Part card test coverage** (lines 61-62, 452-474): Gap identified and new test slice added (Slice 5) to close coverage gap before work is considered complete.

## 4) Deterministic Playwright Coverage (new/changed behavior only)

- **Behavior**: Kit card shopping list indicator tooltip (kit-card.tsx:173-226)
  - **Scenarios**:
    - Given kit with active shopping list memberships, When user hovers over shopping cart icon, Then tooltip shows "Linked shopping lists" heading and list of names with status badges (tests/e2e/kits/kits-overview.spec.ts:98-125)
    - Given shopping list membership with units and honor reserved flag, When tooltip is displayed, Then metadata row shows "{X} units" and "Honors reservations"
    - Given kit with no active shopping list memberships, When membership indicator is present, Then tooltip shows "No active shopping lists."
  - **Instrumentation**: Tooltip testId: `kits.overview.card.${kitId}.shopping-indicator.tooltip`, content assertions on list names and status badge text
  - **Backend hooks**: Factory methods (testData.kits.create, testData.shoppingLists.create) with membership setup
  - **Gaps**: None - existing tests cover scenarios
  - **Evidence**: plan.md:425-437

- **Behavior**: Kit card pick list indicator tooltip (kit-card.tsx:228-282)
  - **Scenarios**:
    - Given kit with open pick list memberships, When user hovers over clipboard icon, Then tooltip shows "Open pick lists" heading and list of pick list IDs with status badges (tests/e2e/kits/kits-overview.spec.ts:126-142)
    - Given pick list membership with open lines and remaining quantity, When tooltip is displayed, Then metadata row shows "{X} open lines" and "{Y} items remaining"
  - **Instrumentation**: Tooltip testId: `kits.overview.card.${kitId}.pick-indicator.tooltip`, content assertions on pick list IDs and metadata text
  - **Backend hooks**: Factory methods with pick list membership setup
  - **Gaps**: None - existing tests cover scenarios
  - **Evidence**: plan.md:438-449

- **Behavior**: Part card shopping list indicator tooltip (part-card.tsx:178-211)
  - **Scenarios**:
    - Given part on active shopping lists, When user hovers over shopping cart icon, Then tooltip shows "On shopping lists" heading and list of shopping list names with status badges
    - Given part with no active shopping list memberships, When membership indicator is present, Then tooltip shows "No active shopping lists."
  - **Instrumentation**: Tooltip testId: `parts.list.card.shopping-list-indicator.tooltip`, content assertions on list names and status badge text
  - **Backend hooks**: Factory methods (testData.parts.create, testData.shoppingLists.create) with membership setup
  - **Gaps**: MAJOR - part-list.spec.ts does not include shopping list indicator tooltip tests. Plan addresses with new test slice (Slice 5, lines 519-524).
  - **Evidence**: plan.md:452-461, 519-524

- **Behavior**: Part card kit membership indicator tooltip (part-card.tsx:234-268)
  - **Scenarios**:
    - Given part used in kits, When user hovers over circuit board icon, Then tooltip shows "Used in kits" heading and list of kit names with status badges
    - Given kit membership with quantities, When tooltip is displayed, Then metadata row shows "{X} per kit • reserved {Y}"
  - **Instrumentation**: Tooltip testId: `parts.list.card.kit-indicator.tooltip`, content assertions on kit names, status badges, and metadata
  - **Backend hooks**: Factory methods (testData.parts.create, testData.kits.create) with kit membership setup
  - **Gaps**: MAJOR - part-list.spec.ts does not include kit indicator tooltip tests. Plan addresses with new test slice (Slice 5, lines 519-524).
  - **Evidence**: plan.md:463-474, 519-524

## 5) Adversarial Sweep

**Minor — Metadata Array Empty Check Defensive Coding**

**Evidence:** plan.md:324-329 (Empty Metadata Array handling), lines 215-219 (kit-card.tsx conditional metadata render)

**Why it matters:** The plan documents conditional rendering when metadata.length > 0, but the TypeScript interface (plan.md:180) defines metadata as `metadata?: ReactNode[]` (optional array). If a call site passes an empty array `[]`, the conditional check `metadata.length > 0` will work correctly, but if metadata is undefined, accessing `.length` would throw a runtime error unless the code uses optional chaining or explicit undefined check.

**Fix suggestion:** In the component implementation (Slice 1), ensure the metadata render uses `item.metadata?.length > 0` or `item.metadata && item.metadata.length > 0` to safely handle both undefined and empty array cases. This is a standard React pattern and likely will be implemented correctly, but should be explicitly called out in Slice 1 checklist to ensure defensive coding.

**Confidence:** Low — This is a standard React conditional rendering pattern that any competent developer will handle correctly, but worth noting for defensive implementation.

**Medium — Link Optional Chaining Safety**

**Evidence:** plan.md:278-285 (Link vs Plain Text Rendering invariant), lines 176-179 (MembershipTooltipContentItem interface with optional link)

**Why it matters:** The plan specifies conditional rendering based on presence of `item.link` property. The component must safely check for link existence before accessing nested properties (to, params, search). If the implementation uses `if (item.link)` followed by `<Link to={item.link.to} ...>`, TypeScript should enforce safety, but runtime errors could occur if link object is defined but properties are missing.

**Fix suggestion:** In Slice 1 implementation, ensure the Link conditional uses `item.link?.to` checks or ensure the TypeScript interface marks `to` as required within the optional link object (which it does at line 176). Consider adding a runtime assertion or comment in the component code that link.to is guaranteed to exist when link object is present, since the interface enforces this.

**Confidence:** Medium — TypeScript interface should prevent this, but defensive coding in the component implementation will eliminate any runtime risk.

**Minor — TestId Prop Optional but Tests Rely on It**

**Evidence:** plan.md:199 (testId?: string in MembershipTooltipContentProps), lines 433-447 (test scenarios rely on testId)

**Why it matters:** The component API defines testId as optional (line 199), but all test scenarios in Section 13 assume testId will be provided by call sites. If a call site omits testId, tooltip assertions will fail. The plan doesn't explicitly document that all four call sites MUST provide testId when refactoring.

**Fix suggestion:** In Slices 3-4 (kit-card and part-card refactoring), add explicit checklist item to ensure all renderTooltip functions pass testId prop to MembershipTooltipContent. Alternatively, make testId required in the interface (remove optional marker) if all call sites are expected to provide it for test coverage. The existing MembershipIndicator already requires testId (membership-indicator.tsx:12), so the downstream component should inherit this requirement.

**Confidence:** Medium — Tests will fail if testId is omitted, which provides immediate feedback, but better to make the requirement explicit in the plan.

**Checks attempted:**
- State consistency issues: None found (component is stateless, no derived state affects cache writes)
- React concurrency gotchas: None found (no useEffect, useState, or async coordination)
- Generated API usage: None found (component is pure presentational, no API calls)
- Stale cache risks: None found (parent components manage cache, tooltip content is synchronous render)
- Optional chaining for nullable fields: Identified metadata and link optional fields requiring defensive checks

**Evidence:** plan.md:260-303 (Derived State & Invariants, State Consistency sections confirm no cache writes or async coordination)

**Why the plan holds:** The component is a pure presentational function with no side effects, no cache writes, and no async operations. All data transformation happens synchronously during render with pre-formatted data from parent components. The three minor findings above are standard defensive coding practices rather than architectural risks.

## 6) Derived-Value & State Invariants (table)

- **Derived value**: MembershipTooltipContentItem array
  - **Source dataset**: Unfiltered membership summaries from TanStack Query hooks (already in camelCase)
  - **Write / cleanup triggered**: None (read-only transformation during render)
  - **Guards**: TypeScript type enforcement; runtime optional field checks (link, metadata)
  - **Invariant**: Items array length equals membership array length; each item has valid id, label, and statusBadge (ReactNode)
  - **Evidence**: plan.md:260-267

- **Derived value**: Empty state boolean
  - **Source dataset**: items.length === 0
  - **Write / cleanup triggered**: None (conditional render only)
  - **Guards**: None needed (length check is safe operation)
  - **Invariant**: Exactly one of empty message or item list is rendered, never both
  - **Evidence**: plan.md:269-276

- **Derived value**: Link vs plain text conditional render
  - **Source dataset**: Presence of item.link property (optional field)
  - **Write / cleanup triggered**: None (conditional render based on item shape)
  - **Guards**: TypeScript optional field handling; runtime undefined check
  - **Invariant**: If link exists, Link component is used; otherwise plain div is used. Link object contains required 'to' property when present.
  - **Evidence**: plan.md:278-285

**Proof:** No filtered view drives persistent writes. All three derived values are synchronous, read-only transformations used solely for conditional rendering within the component. No cache updates, navigation triggers, or storage mutations occur. Component is stateless with no useEffect or background work.

## 7) Risks & Mitigations (top 3)

- **Risk**: Hard-coding tooltip width to w-72 may make part card tooltips unnecessarily wide (was w-64 before)
  - **Mitigation**: Accepted as standardization trade-off; w-72 accommodates kit card content (most complex) and provides visual consistency across all membership tooltips. Plan acknowledges this as minor visual change (lines 412-414). If user testing reveals issues, width can be adjusted in single location (MembershipIndicator component) rather than scattered across call sites.
  - **Evidence**: plan.md:535-539

- **Risk**: Standardizing spacing from space-y-1 to space-y-2 may increase tooltip height beyond comfortable bounds
  - **Mitigation**: Plan explicitly notes to test with realistic data and revert to space-y-1 if space-y-2 proves too spacious (lines 541-543). Prioritizes UX over arbitrary standardization. Visual review recommended in Slice 6 (line 484).
  - **Evidence**: plan.md:540-543

- **Risk**: Removing className props from MembershipIndicator is a breaking API change that will fail TypeScript compilation at all call sites
  - **Mitigation**: Intentional breaking change; TypeScript compiler will identify all four call sites (documented at lines 42-49). Slices 3-4 explicitly handle fixing call sites during kit-card and part-card refactoring. This is the documented mechanism per ui_component_workflow.md principle 8 (breaking changes are verification tool).
  - **Evidence**: plan.md:544-547

## 8) Confidence

**Confidence:** High — The updated plan comprehensively resolves all previous review feedback with explicit evidence. Component boundaries are clear (pure presentational, stateless, no side effects). Test coverage gaps are identified and addressed with new slice. API design is domain-agnostic with appropriate use of ReactNode for flexibility. Breaking changes are intentional and handled systematically. Implementation slices are properly sequenced. All risks are acknowledged with reasonable mitigations. The plan demonstrates thorough research (research log with line references), alignment with project standards (conformance section), and practical execution strategy (6 slices with clear dependencies).
