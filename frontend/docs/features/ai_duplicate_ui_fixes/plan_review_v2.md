# Plan Review v2 - AI Duplicate UI Fixes

## 1) Summary & Decision

**Readiness**

The updated plan successfully addresses the three critical findings from the initial review. The addition of the `useSortedDuplicates` hook provides a clear solution for coordinating async part detail fetches and sorting, the LinkChip extension structure has been clarified with proper DOM positioning to prevent navigation interference, and the instrumentation section now specifies comprehensive testId naming conventions. The plan demonstrates strong alignment with project architecture patterns (domain wrapper chips following kit/shopping-list precedent, Tooltip component for rich content, cancel button patterns from progress step). The scope is well-defined, risks are acknowledged with reasonable mitigations, and test removal is surgical and justified. All major architectural invariants are preserved, and the plan provides sufficient detail for implementation without speculative unknowns.

**Decision**

`GO` — The plan is ready for implementation. All critical issues from the previous review have been adequately resolved with concrete specifications. The async coordination gap is closed by the new hook contract (lines 160-176), the LinkChip DOM structure is explicitly documented to prevent click interference (lines 88-91), and instrumentation coverage is complete with testId patterns for all new components (lines 136-157). No blocking issues remain.

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `docs/commands/plan_feature.md` — **Pass** — Plan follows required sections including Research Log (lines 3-31), Intent & Scope (lines 33-82), Data Model/Contracts (lines 177-224), Algorithms & UI Flows (lines 245-298), Derived State & Invariants (lines 299-324), State Consistency & Async Coordination (lines 326-349), Instrumentation (lines 402-430), Deterministic Test Plan (lines 502-571), and Implementation Slices (lines 572-591). All required headings present with appropriate content depth.

- `docs/contribute/architecture/application_overview.md` — **Pass** — Plan correctly uses domain-driven folder structure (`src/components/parts/ai-part-link-chip.tsx` for new chip, `src/hooks/use-sorted-duplicates.ts` for coordination hook, `src/lib/utils/ai-parts.ts` for sorting utility per lines 130-134). Hook wraps generated API clients following documented pattern (lines 160-176 reference `useDuplicatePartDetails` which wraps `useGetPartsByPartKey`). CamelCase conversion honored throughout (lines 180-190, 208-224).

- `docs/contribute/testing/playwright_developer_guide.md` — **Pass** — Plan recognizes test removal is surgical and existing tests must continue passing (lines 59-61, 565-571). Instrumentation section specifies testId patterns following `feature.section.element` convention (lines 138-156: `parts.ai.review.duplicate-bar.chip.${partKey}`, `parts.ai.duplicates.cancel`, etc.). No new route mocking proposed; existing backend contracts preserved (lines 226-242). Acknowledges dirty database policy by not requiring cleanup (implicit).

- `docs/contribute/ui/tooltip_guidelines.md` — **Pass** — Plan correctly selects Tooltip component with `content` prop for rich card tooltips (lines 27-28: "Use Tooltip component with `content` prop and `placement="auto"`"). Acknowledges portal rendering and accessibility (line 492: "Tooltip component provides aria-describedby, role='tooltip', Escape to close"). Placement choice (`auto`) aligns with guidelines for dynamic positioning (lines 268-269, 391-393).

**Fit with codebase**

- **LinkChip extension** — `plan.md:85-91` — **Good fit**. Plan proposes adding optional props (`infoIcon`, `infoTooltip`, `infoIconTestId`) which follows the existing pattern of optional props like `onUnlink`, `unlinkDisabled`, etc. (seen in `link-chip.tsx:30-36`). Critically, the updated plan now specifies info icon renders **outside** the Link element (line 91: "Structure: `<div wrapper> <Link>...</Link> {infoIcon && <Tooltip>...}</Tooltip>} </div>`"), preventing click propagation issues. This is a valid extension that maintains backward compatibility since all new props are optional.

- **Domain wrapper pattern (AIPartLinkChip)** — `plan.md:126-129` — **Perfect fit**. Plan explicitly references KitLinkChip and ShoppingListLinkChip as precedents. Examined `kit-link-chip.tsx` shows the exact pattern: domain wrapper maps domain types to LinkChip props (status enum to badge props at lines 23-30), provides domain-specific icon (CircuitBoard), computes accessibility label (line 54), and passes through all LinkChip props. AIPartLinkChip will follow this pattern with DuplicatePartEntry → LinkChip mapping, Wrench icon, confidence → badge mapping.

- **useSortedDuplicates hook** — `plan.md:160-176` — **Good fit**. The new hook addresses the async coordination gap identified in the first review. Contract specifies the hook will internally call `useDuplicatePartDetails` for each duplicate in parallel, collect results into a map, and return `{ sortedDuplicates, isLoading }`. This pattern aligns with `use-types.ts:17-35` which uses `useMemo` to derive filtered data from a generated hook. The coordination strategy (parallel fetches via multiple hook calls, useMemo for sorting) is standard React Query + hooks composition.

- **Tooltip with card content** — `plan.md:309-316` — **Alignment confirmed**. Plan assumes Tooltip can render complex React elements (AIPartDuplicateCard) in content mode. Verified `tooltip.tsx:9` shows `content?: React.ReactNode` prop, and `tooltip_guidelines.md:40-55` documents this exact use case ("Use Tooltip with content prop when content is structured"). AIPartDuplicateCard is already a pure presentational component (accepts duplicate, part, onClick props per `ai-duplicate-card.tsx:12-18`), making it reusable in tooltip portal context.

- **Cancel button wiring** — `plan.md:116-119` — **Perfect fit**. Plan proposes passing `onClose` or `onCancel` prop to child steps and wiring to `handleDialogClose`. Examined `ai-part-dialog.tsx:118-123` shows `handleDialogClose` already handles canceling analysis if in progress. The pattern of passing close handler to child components is standard React composition. Review step already has "Go Back" button demonstrating footer button patterns (`ai-part-review-step.tsx:499-522`).

- **180px card constraint** — `plan.md:102-107` — **Precedent confirmed**. Plan references `location-container.tsx:45` which uses `gridTemplateColumns: 'repeat(${columnCount}, 180px)'`. While the plan proposes `max-w-[180px]` class on cards instead of fixed grid columns, both approaches enforce the 180px constraint. The max-width approach is more flexible for responsive layouts while maintaining the size limit. Card component already uses Tailwind classes, so adding max-width class is consistent (line 106 specifies adding class to card component).

- **Test removal** — `plan.md:377-406, 408-469` — **Surgically scoped**. Plan identifies exact line ranges of two tests to delete from `ai-parts-duplicates.spec.ts`. Verified these tests exist at the specified ranges: "shows error when neither analysis nor duplicates returned" (377-406) and "shows fallback UI when duplicate part fetch fails with 404" (408-469). Both tests exercise edge cases (null analysis/duplicates, 404 after delete) that the change brief indicates are no longer required. Removal will not affect remaining passing tests since tests follow dirty database policy (independent data creation per spec).

## 3) Open Questions & Ambiguities

No open questions remain. The plan resolves all uncertainties from the initial review and addresses remaining decisions explicitly:

- **Sorting coordination** — Resolved by `useSortedDuplicates` hook specification (lines 160-176)
- **LinkChip DOM structure** — Resolved by explicit structure documentation (line 91)
- **Tooltip content type** — Resolved by AIPartDuplicateCard reuse (lines 309-316)
- **Hover target** — Resolved by decision to show tooltip on info icon hover only, not entire chip (lines 625-629)
- **Description vs manufacturer_code sorting** — Resolved by decision to use description (lines 619-623)
- **Missing cover image** — Resolved by confirming existing placeholder pattern (lines 631-635)

All implementation details are specified with sufficient precision for a developer to proceed without additional clarification.

## 4) Deterministic Playwright Coverage (new/changed behavior only)

### Duplicate Bar (Review Step)

- **Behavior**: Duplicate bar with horizontal chip layout showing sorted duplicates
- **Scenarios**:
  - Given analysis with duplicates, When review step loads, Then duplicate bar visible with blue background (`bg-blue-50 dark:bg-blue-950/30`) and header "Potential Duplicates Found" at `text-base` font size (`plan.md:507-508`)
  - Given multiple duplicates (high and medium confidence), When bar renders, Then chips sorted high confidence first, then medium, then alphabetically by description within each group (`plan.md:508-509`)
  - Given duplicate chip info icon, When user hovers, Then tooltip shows AIPartDuplicateCard content (`plan.md:509-510`)
  - Given duplicate chip, When user clicks LinkChip, Then part opens in new tab (`plan.md:510`)
  - Given duplicate chip, When user hovers over chip wrapper, Then cursor changes to pointer (`plan.md:511`)
- **Instrumentation**:
  - Container: `parts.ai.review.duplicate-bar` (line 514)
  - Chip wrapper: `parts.ai.review.duplicate-bar.chip.${partKey}` (line 515)
  - Info icon wrapper: `parts.ai.review.duplicate-bar.chip.${partKey}.info` (line 143)
  - Info tooltip: `parts.ai.review.duplicate-bar.chip.${partKey}.info.tooltip` (line 144, Tooltip auto-suffixes `.tooltip`)
- **Backend hooks**: No new hooks needed. Existing part fetch via `GET /api/parts/{part_key}` and AI analysis SSE mock already support this flow (`plan.md:226-235`)
- **Gaps**: None. Existing test at `ai-parts-duplicates.spec.ts:180-257` covers analysis with duplicate bar and can be updated to assert new chip-based layout and sorting order. Test already waits for duplicate bar visibility and asserts content.

### Duplicates-Only Step

- **Behavior**: Full-screen grid with 180px max-width cards, sorted, and cancel button
- **Scenarios**:
  - Given duplicate-only result, When step renders, Then cards have max-width 180px constraint (`plan.md:522`)
  - Given many duplicates, When grid renders, Then cards sorted high confidence first, then medium, then alphabetically (`plan.md:523`)
  - Given duplicates step, When user clicks Cancel, Then dialog closes and returns to parts list (`plan.md:524`)
- **Instrumentation**:
  - Step container: `parts.ai.duplicates-only-step` (existing, line 526)
  - Card: `parts.ai.duplicates.card.${partKey}` (existing, line 527)
  - Cancel button: `parts.ai.duplicates.cancel` (new, line 528)
- **Backend hooks**: No new hooks needed. Existing duplicate-only test at `ai-parts-duplicates.spec.ts:5-116` already seeds parts and emits SSE duplicate-only response.
- **Gaps**: None. Existing test covers card rendering and can be updated to assert 180px max-width (via computed styles or visual regression) and cancel button presence/functionality.

### Input Step Cancel Button

- **Behavior**: Cancel button closes dialog without submitting analysis
- **Scenarios**:
  - Given input step, When user clicks Cancel, Then dialog closes without submitting (`plan.md:536`)
  - Given input step with text entered, When user clicks Cancel and reopens dialog, Then text cleared (existing dialog reset behavior, `plan.md:537`)
- **Instrumentation**:
  - Step container: `parts.ai.input-step` (existing, line 538)
  - Cancel button: `parts.ai.input.cancel` (new, line 539)
- **Backend hooks**: None needed. Dialog close is frontend-only state transition.
- **Gaps**: Intentional — plan states no new test coverage required (line 540: "Intentional — no new test coverage required, existing dialog open/close tests sufficient"). This is acceptable for a straightforward UI control that reuses existing close handler.

### Review Step Cancel Button

- **Behavior**: Cancel button closes dialog from review step, disabled during mutation
- **Scenarios**:
  - Given review step, When user clicks Cancel, Then dialog closes (`plan.md:546`)
  - Given review step during part creation (isCreating=true), When user hovers Cancel, Then button disabled (`plan.md:547`)
- **Instrumentation**:
  - Actions footer: `parts.ai.review-actions` (existing, line 549)
  - Cancel button: `parts.ai.review.cancel` (new, line 550)
- **Backend hooks**: None needed. Dialog close is frontend action; mutation disabling uses existing isCreating state from useCreatePart hook.
- **Gaps**: None. Existing review step test at `ai-parts-duplicates.spec.ts:180-257` can verify button presence and enabled state.

### Test File Cleanup

- **Behavior**: Two tests removed from suite
- **Scenarios**:
  - Given test suite runs, When Playwright executes `ai-parts-duplicates.spec.ts`, Then two removed tests no longer appear in output (`plan.md:557-558`)
  - Given test suite runs, When all tests complete, Then all remaining tests pass (`plan.md:558`)
- **Instrumentation**: N/A — test file change only
- **Backend hooks**: N/A
- **Gaps**: None
- **Evidence**: Lines 559-561 specify verification command: `pnpm playwright test tests/e2e/parts/ai-parts-duplicates.spec.ts`

**Coverage Assessment**: Plan provides complete instrumentation and scenario coverage for all new behaviors. The testId naming convention is consistent and discoverable (`.chip.`, `.info`, `.cancel` patterns). No critical gaps. The plan correctly identifies that cancel buttons reuse existing patterns and don't require new dedicated specs beyond presence/state verification in existing tests.

## 5) Adversarial Sweep

### Issue 1: Minor — Info icon click propagation to tooltip close handler

**Evidence:** `plan.md:88-91` — LinkChip structure specifies info icon renders outside Link element to prevent navigation interference: "Info icon must render **outside** the Link element (after Link wrapper closes) to prevent click navigation interference." Plan also mentions `stopProp` in structure example: `<span onClick={stopProp}>{infoIcon}</span>`.

**Why it matters:** While the plan correctly identifies the need to prevent navigation on info icon click, the `stopProp` reference in the structure example (line 91) is incomplete. The info icon wrapper needs `onClick={(e) => e.stopPropagation()}` to prevent the click from bubbling to parent handlers. However, since the info icon will be wrapped in a Tooltip component that manages its own hover/click behavior, and the Tooltip will be outside the Link element, there may be competing event handlers. The plan should clarify whether the info icon itself should be clickable or hover-only.

**Fix suggestion:** Add explicit guidance in section 5 (Algorithms & UI Flows) that the info icon interaction is hover-only (no click handler), and the stopPropagation is only needed if a click handler exists to close the tooltip. Alternatively, specify that clicking the info icon should toggle the tooltip (in addition to hover), and in that case, add the click handler specification to the LinkChip extension section: "Info icon wrapper should include `onClick={(e) => { e.stopPropagation(); /* tooltip already handles open/close via Tooltip component */ }}`". Based on Tooltip component examination (`tooltip.tsx:61-86`), the Tooltip manages open/close via hover, not click, so the info icon likely doesn't need a click handler at all — just the wrapper outside the Link is sufficient.

**Confidence:** Low — This is a minor implementation detail. The plan correctly positions the info icon outside the Link, which is the critical architectural decision. The stopPropagation detail can be resolved during implementation by testing the interaction. Given that Tooltip manages hover state internally, and the info icon is outside the clickable Link, there's low risk of actual interference. Downgrading to Minor.

### Issue 2: Minor — useSortedDuplicates hook implementation missing data structure detail

**Evidence:** `plan.md:167-176` — Hook contract specifies: "Fetch all part details in parallel using useDuplicatePartDetails for each... Collect results into a partDetailsMap: Record<partKey, PartResponseSchema | undefined>... Sort with useMemo..."

**Why it matters:** The contract specifies calling `useDuplicatePartDetails` for each duplicate, but doesn't clarify whether this is done via array.map or individual hook calls. React hooks cannot be called conditionally or in loops, so the implementation must either: (a) call the hook N times for N duplicates (works but verbose and limited to known max count), (b) create N wrapper components each calling the hook once (current pattern in `ai-duplicate-bar.tsx:47-58`), or (c) use a different coordination approach. The plan seems to assume the hook itself will call `useDuplicatePartDetails` multiple times, but the contract at line 172 says "Fetch all part details in parallel using useDuplicatePartDetails for each" which implies the hook internally iterates, violating rules of hooks.

**Fix suggestion:** Clarify the implementation strategy in lines 167-176. Recommend: "Hook receives `duplicateParts` array. For each entry, invoke `useDuplicatePartDetails(entry.partKey)` as individual hook calls (duplicates.map(d => useDuplicatePartDetails(d.partKey))). Since duplicates array length is stable per analysis result, this doesn't violate rules of hooks. Collect query results into an array of `{ duplicate, query }` tuples. Use useMemo to derive sorted array once all queries have data: `const sortedDuplicates = useMemo(() => { const withData = tuples.filter(t => t.query.data); return sortBy(withData, ...) }, [tuples])`. Return `{ sortedDuplicates, isLoading: tuples.some(t => t.query.isLoading) }`." This clarification would make the implementation path unambiguous.

**Confidence:** Medium — The hook contract is functional but lacks implementation clarity. However, examining `use-types.ts:17-35` and the existing `ai-duplicate-bar.tsx:47-58` wrapper pattern shows the codebase already handles this via component wrappers (DuplicateBarItemWithData), not a centralized hook. The plan may be over-engineering by introducing a new coordination hook when the existing wrapper pattern works. The implementation will likely succeed either way (centralized hook or wrapper pattern), but the current spec is ambiguous about how to call N hooks without violating rules of hooks.

### Issue 3: Minor — Tooltip testId pattern inconsistency

**Evidence:** `plan.md:143-144` — Instrumentation specifies info icon wrapper as `${testId}.info` and tooltip as `${testId}.info.tooltip`, with note "Tooltip component auto-suffixes `.tooltip`". However, existing duplicate card reasoning tooltip follows different pattern: `parts.ai.duplicate-reasoning.card.${partKey}` for trigger and `parts.ai.duplicate-reasoning.card.${partKey}.tooltip` for tooltip (`ai-parts-duplicates.spec.ts:94-100`).

**Why it matters:** The plan introduces a new testId pattern for chip info tooltips (`.chip.${partKey}.info.tooltip`) while the existing card reasoning tooltips use `.duplicate-reasoning.card.${partKey}.tooltip`. This creates inconsistency: both are duplicate reasoning tooltips, but one uses `.duplicate-reasoning` namespace while the other uses `.info`. Tests may become harder to maintain if similar UI elements use different naming schemes.

**Fix suggestion:** Align tooltip naming patterns. Recommend using `.duplicate-reasoning.chip.${partKey}` for the chip info icon trigger and `.duplicate-reasoning.chip.${partKey}.tooltip` for the tooltip content, matching the existing card pattern. Update lines 143-144 and 516 accordingly: "Info icon wrapper: `parts.ai.duplicate-reasoning.chip.${partKey}` (for hover target), Info tooltip: `parts.ai.duplicate-reasoning.chip.${partKey}.tooltip`". This maintains semantic consistency (both are reasoning tooltips) while distinguishing context (card vs chip) via the middle segment.

**Confidence:** Low — This is a naming convention detail that doesn't affect functionality. The current plan's testId pattern is discoverable and functional, just inconsistent with existing patterns. Implementation will work either way. Could easily be adjusted during code review if preferred.

### Checks Attempted

- **Stale cache after sort**: Examined plan's coordination strategy. The `useSortedDuplicates` hook derives sorted data from query results via useMemo, which re-computes when part details change. No cache writes, so no stale data risk. Section 7 (State Consistency) confirms "No writes — pure derivation" (line 305). Invariant holds.

- **Filtered dataset driving writes**: Checked section 6 (Derived State & Invariants). All three derived values (sorted duplicates, chip tooltip content, cancel button visibility) are read-only — no writes to cache, storage, or persistent state. Lines 303-305 explicitly state "No writes — pure derivation." No risk.

- **Instrumentation gaps for deterministic tests**: Reviewed section 13 (Deterministic Test Plan) and section 9 (Instrumentation). All new components have testIds specified: chips (line 515), info icons (line 143), tooltips (line 144), cancel buttons (lines 154-156). Existing tests cover bar and cards and can be updated to assert new structure. No missing instrumentation.

- **Missing backend coordination**: Verified section 4 (API / Integration Surface). No new API calls required (lines 226-242). All data comes from existing AI analysis SSE stream and part detail fetches. Dialog close is synchronous frontend action (lines 237-242). No backend gaps.

- **React 19 concurrency issues**: Plan uses standard patterns (useMemo, multiple query hooks, props-driven rendering). No manual subscriptions, intervals, or stale closures. Section 10 (Lifecycle) confirms "No long-running background tasks" (line 448). Tooltip component manages its own portal lifecycle (lines 441-446). Low concurrency risk.

- **Generated API type misuse**: Checked section 3 (Data Model). Plan correctly references `components['schemas']['PartResponseSchema.1a46b79']` type (line 211) and uses generated hook `useGetPartsByPartKey` (line 161). CamelCase conversion happens in existing `useDuplicatePartDetails` hook (lines 208-212), not in plan scope. Proper type usage.

**Why the plan holds**: The plan limits scope to UI-only changes with no new data mutations, backend integrations, or complex async flows. All new components reuse existing primitives (LinkChip, Tooltip, Button, Card) with well-tested patterns. Sorting and filtering are pure derivations with no side effects. The three minor issues identified are implementation details that won't block delivery or introduce bugs — they're polish-level concerns addressable during code review.

## 6) Derived-Value & State Invariants

### Derived value: Sorted Duplicates Array

- **Source dataset**: `duplicateParts` prop (unfiltered DuplicatePartEntry[]) + part details from multiple `useDuplicatePartDetails` queries (async, may be loading/error/success per entry)
- **Write / cleanup triggered**: None. Pure derivation used for rendering order in bar and grid. No cache mutations, no storage writes, no navigation triggers.
- **Guards**: Sort function handles missing part details via fallback to partKey when description is unavailable (line 306: "Fallback to partKey sorting when description unavailable"). Hook returns `isLoading` flag so components can show loading state or render unsorted initially (line 339: "Hook returns { sortedDuplicates, isLoading }").
- **Invariant**: Sorted array length === input duplicateParts length. No filtering. All entries preserved. Sorting is stable and deterministic for same input data.
- **Evidence**: `plan.md:301-308` — Derived state section explicitly states "Sorted array must preserve all entries from original duplicateParts. No filtering or mutation of original data." Line 339 shows coordination strategy returns sorted array without filtering.

### Derived value: Chip Info Tooltip Content

- **Source dataset**: Single DuplicatePartEntry + PartResponseSchema (filtered to one part per chip) from `useDuplicatePartDetails` query, plus `isLoading`/`isError` query state
- **Write / cleanup triggered**: None. Tooltip content (ReactNode) is passed to Tooltip component which manages portal rendering and cleanup internally. No persistent writes.
- **Guards**: Plan suggests tooltip should only show when part data is loaded (line 313: "Consider showing tooltip only when part data available"). However, AIPartDuplicateCard already handles loading and error states (verified in `ai-duplicate-card.tsx:49-80`), so tooltip can safely render in all states — the card will show appropriate loading/error UI.
- **Invariant**: Tooltip content is a static React element (AIPartDuplicateCard) with consistent dimensions (max-w-[180px] per line 106) to prevent tooltip repositioning during hover. No dynamic size changes after initial render.
- **Evidence**: `plan.md:309-316` — Tooltip content section. Line 315 states "Tooltip content must be static React element... with consistent dimensions to avoid repositioning during hover."

### Derived value: Cancel Button Visibility and Enabled State

- **Source dataset**: Current dialog step state (input/progress/review/duplicates) + `isCreating` mutation state (filtered to review step only)
- **Write / cleanup triggered**: onClick triggers dialog close via `handleDialogClose`, which may trigger analysis cancellation if `isAnalyzing === true` (filtered write condition). Dialog close resets `currentStep` state to 'input' via useEffect (line 283: "Dialog closes, state resets to 'input' step via useEffect").
- **Guards**: Cancel buttons always visible in input/review/duplicates steps (line 321: "Cancel should always be available..."). Cancel in review step disabled during mutation (line 399: "`disabled={isCreating}` prop on Cancel button"). Progress step already has cancel with conditional rendering (line 322).
- **Invariant**: Clicking cancel always closes dialog. If analysis in progress, must call `cancelAnalysis()` before close. If mutation in progress (isCreating), button is disabled so click is impossible.
- **Evidence**: `plan.md:317-324` — Derived value section for cancel button. Lines 344-349 document coordination: "If analysis in progress (isAnalyzing === true), cancelAnalysis() called before closing dialog."

**Filtered-write risk assessment**: The cancel button during mutation (filtered condition: isCreating === true) triggers disabled state, not a write, so there's no risk of incomplete writes. The analysis cancellation (filtered condition: isAnalyzing === true) is a **guarded write** — the SSE stream cleanup is only triggered if analysis is actually running, which is correct behavior. No unguarded filtered writes present.

## 7) Risks & Mitigations (top 3)

### Risk 1: LinkChip extension breaks existing kit and shopping list chips

- **Mitigation**: All new LinkChip props (`infoIcon`, `infoTooltip`, `infoIconTestId`) are optional with default undefined. Component renders info icon conditionally: `{infoIcon && <Tooltip>...</Tooltip>}` (line 91). Existing chip usages (KitLinkChip, ShoppingListLinkChip) don't provide these props, so they render as before. Add manual verification step: after implementation, navigate to kits page and shopping lists page to verify chips render correctly. If types are strict, TypeScript will catch any required prop violations at compile time.
- **Evidence**: `plan.md:594-597` — Risk section explicitly calls out this risk and mitigation strategy of optional props and testing existing features.

### Risk 2: Sorting by description requires all part details loaded, causing UI jank or unsorted initial render

- **Mitigation**: The `useSortedDuplicates` hook returns `{ sortedDuplicates, isLoading }` allowing components to handle loading state (line 339). Plan suggests two-phase sort: initial render with partKey sorting, re-sort when details load (line 612: "Implement two-phase sort: (1) by partKey initially, (2) re-sort when part details load"). This is acceptable UX — duplicates appear quickly in a reasonable order (partKey is stable and deterministic), then re-sort to optimal order once descriptions load. React Query caches part details, so subsequent renders are instant. Alternative: show loading skeleton for entire bar until all details load, but this delays initial feedback. The progressive render approach is better.
- **Evidence**: `plan.md:609-612` — Risk section documents this risk and mitigation. Lines 337-342 (State Consistency section) specify hook coordination strategy with isLoading flag.

### Risk 3: Tooltip with card content causes layout jank or positioning issues

- **Mitigation**: Use fixed card dimensions (`max-w-[180px]`, defined height via card content) so tooltip size is predictable (line 600: "Use fixed card dimensions"). Tooltip `placement="auto"` will choose stable position based on viewport space (line 601). The AIPartDuplicateCard component is already production-ready and renders consistently in the duplicates-only grid (verified in tests at `ai-parts-duplicates.spec.ts:82-100`). Rendering the same card in a tooltip portal should be no different — same component, same props, just different parent (portal vs grid). Test with multiple viewport sizes during implementation to verify no repositioning flicker. Tooltip component already handles portal positioning with computed top/left (verified in `tooltip.tsx:170-179` per plan line 393).
- **Evidence**: `plan.md:598-603` — Risk section documents mitigation strategy. Lines 391-393 reference Tooltip positioning implementation.

## 8) Confidence

**Confidence: High** — The updated plan resolves all critical issues from the initial review. The `useSortedDuplicates` hook provides a clear (if slightly under-specified) solution for async coordination. The LinkChip DOM structure is explicitly documented to prevent navigation interference. The instrumentation section comprehensively specifies testId patterns. All changes are UI-only modifications using well-established patterns (domain wrapper chips, Tooltip component, cancel button wiring). No new API integrations, no complex state management, no cross-feature dependencies. The three minor issues identified in the adversarial sweep (click propagation detail, hook implementation clarity, testId consistency) are polish-level concerns that won't block implementation or introduce bugs. Main remaining risk is UI polish (spacing, colors, sizing, sorting jank) which is easily adjustable post-implementation and testable via existing Playwright specs. The plan is ready for implementation.

