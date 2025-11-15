# Code Review — AI Duplicate UI Manual Fixes (HEAD)

**Commit**: a0cd7d3 "Applied more manual fixes."
**Reviewer**: Claude Code
**Date**: 2025-11-14

## 1) Summary & Decision

**Readiness**

This commit applies manual UI fixes to the AI duplicate detection feature, including LinkChip integration, card styling improvements, dialog sizing adjustments, button reordering, and status badge color changes. The changes generally align with the plan but introduce a critical testId duplication bug that breaks 2 out of 5 Playwright tests. TypeScript compilation and ESLint pass cleanly, and the changes demonstrate good understanding of React patterns and component composition. However, the testId duplication is a blocker that must be resolved before merging.

**Decision**

`NO-GO` — Critical correctness issue: Duplicate testId violation in AIPartLinkChip causes Playwright strict mode failures. Tests "shows analysis with duplicate bar when both analysis and duplicates returned" and "duplicate bar item opens part in new tab on click" fail due to testId being applied to both the Tooltip wrapper div and the LinkChip Link element, creating ambiguous selectors. Fix required: remove testId from wrapper div on line 72-73 of ai-part-link-chip.tsx, keeping it only on LinkChip.

## 2) Conformance to Plan (with evidence)

**Plan alignment**

- Plan section "LinkChip Extension" ↔ `src/components/ui/link-chip.tsx:13,20,76,84-86,153-163` — LinkChip extended with `openInNewTab`, `infoIcon`, `infoTooltip`, `infoIconTestId` props. Info icon correctly renders outside Link element to prevent navigation interference (line 153-163).

- Plan section "AIPartLinkChip Creation" ↔ `src/components/parts/ai-part-link-chip.tsx:1-104` — Domain wrapper created following kit/shopping-list chip pattern. Maps DuplicatePartEntry to LinkChip, fetches part details via `useDuplicatePartDetails`, provides hover card and reasoning tooltips.

- Plan section "Duplicate Bar Redesign" ↔ `src/components/parts/ai-duplicate-bar.tsx:34-50` — Bar redesigned to horizontal chip layout. Label left (line 36-38), chips right with wrapping (line 41-48). Background changed to `bg-blue-50 dark:bg-blue-950/30` (line 31), header font size increased to `text-base` (line 36).

- Plan section "Card Size Reduction" ↔ `src/components/parts/ai-duplicate-card.tsx:18,56,73,114` — `inTooltip` prop added, cards use `max-w-[180px]` constraint, Card variant switches to "slim" when `inTooltip={true}` to remove border in tooltip context.

- Plan section "Dialog Sizing" ↔ `src/components/parts/ai-part-dialog.tsx:187-190,193` — Dialog className conditionally applies sizing: review step gets near-fullscreen (`w-[calc(100vw-60px)] h-[calc(100vh-60px)]`), duplicates step gets `max-w-[800px]`.

- Plan section "Cancel Buttons" ↔ `src/components/parts/ai-part-input-step.tsx:62-72`, `src/components/parts/ai-duplicates-only-step.tsx:64-71` — Cancel buttons added to input step (line 63-71) and duplicates step (line 64-70). Both wire to `onCancel` prop.

- Plan section "Status Badge Colors" ↔ `src/components/ui/status-badge.tsx:9-10`, `src/components/parts/ai-part-link-chip.tsx:95-102` — New `success` and `warning` color variants added to StatusBadge (green/amber with dark mode support). AIPartLinkChip maps high→success, medium→warning.

- Plan section "Duplicate Sorting" — Sorting implementation not visible in this commit. Plan called for `useSortedDuplicates` hook usage in duplicate bar and duplicates-only step. Code shows `useSortedDuplicates(duplicateParts)` called in both components (ai-duplicate-bar.tsx:23, ai-duplicates-only-step.tsx:29), confirming implementation exists (likely in previous commit).

**Gaps / deviations**

- **Duplicate Bar Layout Deviation** — `src/components/parts/ai-duplicate-bar.tsx:36` — Header has conflicting classes `text-base` and `text-lg`. Plan specified `text-base` (16px), but code includes both. `text-lg` (18px) will override `text-base`. This appears to be an accidental duplication rather than intentional styling.

- **Card Variant Naming Inconsistency** — `src/components/ui/card.tsx:23` — New "slim" variant uses `border-0 p-2`, but naming suggests minimal styling. In tooltip context, cards should have no border to avoid double-border, but padding reduction from p-4 to p-2 is not mentioned in plan and may be unintentional side effect.

- **Info Icon Rendering Logic** — `src/components/parts/ai-duplicate-card.tsx:100-105,151-157` — Info icon hidden in tooltip context using unusual JSX pattern `{inTooltip || <Tooltip>...</Tooltip>}`. This works because JSX `{false || component}` renders the component, but `{true || component}` short-circuits to `true` (renders nothing). More conventional pattern would be `{!inTooltip && <Tooltip>...</Tooltip>}` for clarity and maintainability.

- **Grid Layout Simplification** — `src/components/parts/ai-duplicates-only-step.tsx:44` — Plan called for responsive grid classes or fixed 180px columns. Implementation uses simple `grid-cols-4` (fixed 4 columns). This may not be responsive on narrow viewports. Plan section 12 mentioned "grid-cols-1 → grid-cols-5 based on count" but implementation removed dynamic column calculation entirely.

- **Button Positioning Change Not in Plan** — `src/components/parts/ai-part-input-step.tsx:62-79` — Submit button moved from left to right, cancel button on left. Plan did not specify button ordering. This deviates from typical form patterns where primary action (Submit) is often rightmost, which is what was implemented, but the change was not explicitly called out in plan.

## 3) Correctness — Findings (ranked)

**Blocker — Duplicate testId causes Playwright strict mode violation**

- Evidence: `src/components/parts/ai-part-link-chip.tsx:72-74,83` — testId prop passed to both Tooltip wrapper div (`<div onClick={...} data-testid={testId}>` on line 73) AND to LinkChip component (`testId={testId}` on line 83). LinkChip internally applies testId to its Link element (link-chip.tsx:129), creating two elements with identical testId.
- Impact: Playwright tests fail with "strict mode violation: getByTestId resolved to 2 elements". Tests "shows analysis with duplicate bar when both analysis and duplicates returned" (line 242) and "duplicate bar item opens part in new tab on click" (line 313) cannot select chip reliably. This breaks test suite and violates project's deterministic selector policy.
- Fix: Remove testId from wrapper div on line 72-73. Tooltip component already supports testId prop for its own wrapper. Change line 72 from `<Tooltip content={cardTooltipContent} placement="bottom" testId={testId}>` to `<Tooltip content={cardTooltipContent} placement="bottom">`. The LinkChip testId (line 83) is sufficient for test selection.
- Confidence: High — Test output shows exact duplicate selector error, fix is straightforward prop removal.

**Major — Inconsistent CSS class application in duplicate bar header**

- Evidence: `src/components/parts/ai-duplicate-bar.tsx:36` — `className="text-base font-semibold text-foreground whitespace-nowrap text-lg"` contains both `text-base` (16px) and `text-lg` (18px) font size classes.
- Impact: Tailwind's specificity rules cause `text-lg` to override `text-base` because both are utility classes with equal specificity and `text-lg` appears later in the class list. This produces 18px font instead of plan-specified 16px. Future Tailwind updates or class reordering could change which class wins, creating unpredictable styling.
- Fix: Remove `text-lg` from className, keeping only `text-base` as specified in plan. Change line 36 to `className="text-base font-semibold text-foreground whitespace-nowrap"`.
- Confidence: High — Duplicate utility classes are a Tailwind anti-pattern and create maintenance confusion.

**Major — Unconventional JSX conditional rendering pattern**

- Evidence: `src/components/parts/ai-duplicate-card.tsx:100,151` — `{inTooltip || <Tooltip>...</Tooltip>}` pattern used for conditional rendering. Works but violates React conventions and ESLint best practices.
- Impact: Code is harder to understand for developers unfamiliar with short-circuit evaluation. ESLint rule `react/jsx-no-leaked-render` (if enabled) would flag this pattern. When `inTooltip=true`, expression evaluates to `true` (truthy) which JSX converts to empty render, but this is non-obvious. Future refactoring could break this subtle logic.
- Fix: Replace with conventional conditional: `{!inTooltip && <Tooltip>...</Tooltip>}`. Apply to both occurrences (lines 100-105 and 151-157).
- Confidence: High — Standard React pattern, no functional change, improves code clarity.

**Minor — Duplicates-only step grid layout not responsive**

- Evidence: `src/components/parts/ai-duplicates-only-step.tsx:44` — Grid uses fixed `grid-cols-4` regardless of viewport width or duplicate count.
- Impact: On narrow viewports (<768px), 4 columns of 180px cards (720px minimum) will overflow or shrink cards below intended size. Plan section 12 mentioned responsive behavior but implementation hardcodes column count. With 1-3 duplicates, grid has empty columns. With 5+ duplicates, layout may not utilize space efficiently.
- Fix: Restore responsive grid classes based on duplicate count, or use `grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4` for viewport-based responsiveness. Alternatively, use `auto-fit` with minmax: `grid-template-columns: repeat(auto-fit, minmax(180px, 1fr))`.
- Confidence: Medium — Layout works on desktop but may break mobile experience. Requires viewport testing to confirm severity.

**Minor — Card variant "slim" has unspecified padding reduction**

- Evidence: `src/components/ui/card.tsx:23` — New "slim" variant defined as `border-0 p-2`, reducing padding from default p-4 (16px) to p-2 (8px).
- Impact: Plan specified removing border for tooltip context but did not mention padding change. Reduced padding may affect card content layout, especially if card was designed for 16px internal spacing. Could cause content to feel cramped or icons to touch card edges.
- Fix: If padding reduction is intentional, document in plan or comment. Otherwise, change variant to `border-0 p-4` to maintain spacing consistency while removing border. Test visual appearance of card in tooltip to verify spacing is acceptable.
- Confidence: Low — May be acceptable visual trade-off for tooltip context, but warrants verification.

**Minor — Dialog className max-h typo or incomplete**

- Evidence: `src/components/parts/ai-part-dialog.tsx:188` — `className` includes `max-w-none max-h` but `max-h` is incomplete (no value like `max-h-screen`).
- Impact: Tailwind will ignore `max-h` as it's not a valid utility class. Review step dialog still gets constrained height via `h-[calc(100vh-60px)]` so no visual bug, but incomplete class is dead code and suggests potential copy-paste error.
- Fix: Remove `max-h` from className. Change line 188 to `currentStep === 'review' && "w-[calc(100vw-60px)] h-[calc(100vh-60px)] max-w-none"`.
- Confidence: High — Simple cleanup, no functional impact.

**Minor — Duplicate bar spacing and layout alignment edge cases**

- Evidence: `src/components/parts/ai-duplicate-bar.tsx:34,41` — Outer flex uses `items-center` (line 34) which vertically centers label and chips. Chips wrapper uses `flex-1` (line 41) to take remaining space.
- Impact: When chips wrap to multiple lines, label remains vertically centered relative to entire chip area, which may look unbalanced (label centered against 2-3 rows of chips). Better alignment might be `items-start` so label aligns with top row of chips. However, this is subjective and may be intentional design choice.
- Fix: Consider changing line 34 from `items-center` to `items-start` for top alignment. Test with multiple duplicates to verify visual balance. If current centering is preferred, add comment explaining rationale.
- Confidence: Low — Subjective UX decision, not a clear bug.

## 4) Over-Engineering & Refactoring Opportunities

**Hotspot: AIPartLinkChip wrapper div click handler is redundant**

- Evidence: `src/components/parts/ai-part-link-chip.tsx:66-73` — Wrapper div has `onClick={handleWrapperClick}` which calls `window.open()`, but LinkChip already has `openInNewTab={true}` which makes the Link element open in new tab via `target="_blank"` (link-chip.tsx:125).
- Suggested refactor: Remove wrapper div click handler (lines 66-68 and 73). LinkChip's built-in `target="_blank"` navigation handles new tab opening. Wrapper click is redundant and may cause double-navigation or interfere with keyboard events.
- Payoff: Simpler component, fewer event handlers, clearer separation of concerns. LinkChip owns navigation behavior.

**Hotspot: Card variant "slim" could be more semantic**

- Evidence: `src/components/ui/card.tsx:7,23` — Variant named "slim" but its purpose is tooltip-context rendering (no border, reduced padding).
- Suggested refactor: Rename variant to "tooltip" or "borderless" to better express intent. Update all usages in ai-duplicate-card.tsx.
- Payoff: More self-documenting code. Future developers will understand variant purpose without inspecting styles.

**Hotspot: Confidence badge mapping duplicated**

- Evidence: `src/components/parts/ai-part-link-chip.tsx:94-104` — `getConfidenceBadgeProps` function maps confidence to badge color/label. Similar logic likely exists in ai-confidence-badge.tsx (not visible in diff but referenced in ai-duplicate-card.tsx:6).
- Suggested refactor: Extract confidence-to-badge mapping to shared utility in `src/lib/utils/ai-parts.ts` or export from ai-confidence-badge.tsx. Reuse in both AIPartLinkChip and AIPartConfidenceBadge components.
- Payoff: Single source of truth for badge styling rules. Easier to maintain if confidence levels or colors change.

## 5) Style & Consistency

**Pattern: Inconsistent conditional rendering approaches**

- Evidence: `src/components/parts/ai-duplicate-card.tsx:100,151` uses `{condition || <Component />}` pattern, while most React codebase uses `{condition && <Component />}` or ternary operators.
- Impact: Codebase mixing conditional rendering patterns makes code harder to scan. New contributors may copy inconsistent pattern.
- Recommendation: Standardize on `{!condition && <Component />}` or `{condition ? null : <Component />}` for conditional rendering. Update AIPartDuplicateCard to match project conventions.

**Pattern: testId prop handling inconsistency**

- Evidence: `src/components/parts/ai-part-link-chip.tsx:72` passes testId to Tooltip, line 83 passes same testId to LinkChip. LinkChip (link-chip.tsx:99-100) computes wrapper testId by appending `.wrapper` suffix if wrapperTestId not provided. AIPartLinkChip's Tooltip testId should follow different namespace.
- Impact: testId collision creates selector ambiguity (see Blocker finding). Even after fix, pattern is unclear about testId ownership.
- Recommendation: Adopt consistent testId suffixing pattern. For AIPartLinkChip: wrapper div (if needed) gets base testId, LinkChip gets `${testId}` (which internally becomes `${testId}.wrapper` for its div), Tooltip gets `${testId}.card`. Document pattern in component comment.

**Pattern: Cancel button testId naming follows project conventions**

- Evidence: `src/components/parts/ai-part-input-step.tsx:68`, `src/components/parts/ai-duplicates-only-step.tsx:67` use testIds `parts.ai.input.cancel` and `parts.ai.duplicates.cancel` following existing `parts.ai.*` taxonomy.
- Impact: Positive — consistent with project's hierarchical testId scheme. Enables reliable Playwright selectors.
- Recommendation: None — pattern is correct. Confirms change author understands project conventions.

**Pattern: StatusBadge color palette extension is well-designed**

- Evidence: `src/components/ui/status-badge.tsx:9-10` adds `success` and `warning` colors with semantic naming and dark mode support (`bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300`).
- Impact: Positive — follows existing active/inactive color pattern, provides good contrast ratios, extends badge vocabulary cleanly.
- Recommendation: Consider documenting color semantics in StatusBadge JSDoc comment (similar to line 39-42) to guide future color additions.

## 6) Tests & Deterministic Coverage (new/changed behavior only)

**Surface: Duplicate Bar with LinkChip Components**

- Scenarios:
  - Given analysis with duplicates, When review step loads, Then duplicate bar shows chips with wrench icons and confidence badges (`tests/e2e/parts/ai-parts-duplicates.spec.ts:238-244`)
  - Given bar chip, When user clicks, Then part opens in new tab (`tests/e2e/parts/ai-parts-duplicates.spec.ts:310-321`)
  - Given bar chip info icon, When user hovers, Then reasoning tooltip appears (test exists at line 246-252)
- Hooks: `parts.ai.review.duplicate-bar`, `parts.ai.review.duplicate-bar.chip.${partKey}`, `parts.ai.review.duplicate-bar.chip.${partKey}.info`
- Gaps:
  - **Blocker** — Tests fail due to duplicate testId bug. After fix, existing tests should pass.
  - Hover-to-show-card behavior (chip hover shows full duplicate card) mentioned in plan but no test verifies it. Plan specified Tooltip testId would be auto-suffixed to `${testId}.tooltip`, but AIPartLinkChip uses Tooltip for card content (line 72). Test should verify card visibility on chip hover.
- Evidence: Test failures at line 242 and 313 show testId duplication. Test at line 248-252 verifies info icon tooltip but not hover card.

**Surface: Duplicate Cards in Tooltip Context**

- Scenarios:
  - Given bar chip, When user hovers, Then tooltip shows AIPartDuplicateCard with max-width 180px, no border, confidence badge, part image
- Hooks: Card rendered in Tooltip content, should use `inTooltip={true}` prop and "slim" variant
- Gaps:
  - **Major** — No test coverage for card-in-tooltip rendering. Plan section 13 mentioned "hover over info icon shows card" but implementation shows card on chip hover (Tooltip wrapper around entire LinkChip on line 72), not info icon hover. Unclear which behavior is correct. Tests should verify:
    - Card visible in tooltip on hover
    - Card has correct styling (no border, 180px width)
    - Card content matches duplicate entry (description, confidence, reasoning hidden)
- Evidence: Plan section 13 ambiguity about hover target. Implementation wraps LinkChip in Tooltip (line 72-76), making entire chip hover trigger, but plan initially said "info icon hover".

**Surface: Duplicates-Only Step Card Grid**

- Scenarios:
  - Given duplicate-only result, When grid renders, Then cards have max-width 180px (`tests/e2e/parts/ai-parts-duplicates.spec.ts:368-375`)
  - Given many duplicates, When grid renders, Then layout does not clip card hover animations (plan mentioned adding padding)
- Hooks: `parts.ai.duplicates-only-step`, `parts.ai.duplicates.card.${partKey}`
- Gaps:
  - Test verifies cards are visible but doesn't assert max-width constraint. Could add assertion: `await expect(card).toHaveCSS('max-width', '180px')` or check computed styles.
  - No test for hover animation clipping. Plan mentioned adding container padding (`p-1` added on line 44) to prevent clipping, but this is visual regression territory (may require screenshot comparison).
- Evidence: Test at line 368-375 checks card visibility, not sizing. Grid layout change (line 44) reduces from `getGridClasses(count)` dynamic logic to fixed `grid-cols-4`.

**Surface: Cancel Buttons in All Steps**

- Scenarios:
  - Given input step, When user clicks Cancel, Then dialog closes (`parts.ai.input.cancel`)
  - Given duplicates step, When user clicks Cancel, Then dialog closes (`parts.ai.duplicates.cancel`)
- Hooks: `parts.ai.input.cancel`, `parts.ai.duplicates.cancel` testIds present
- Gaps:
  - **Minor** — No explicit test coverage for new cancel buttons. Plan section 13 stated "Intentional — no new test coverage required" but CI should verify buttons are present and clickable. Consider smoke test that opens dialog, clicks cancel, asserts dialog closed.
- Evidence: Cancel buttons instrumented (line 68 in ai-part-input-step.tsx, line 67 in ai-duplicates-only-step.tsx) but no tests exercise them.

**Surface: Status Badge Color Changes**

- Scenarios:
  - Given high confidence duplicate, When rendered, Then badge shows green "High" label with success color
  - Given medium confidence duplicate, When rendered, Then badge shows amber "Medium" label with warning color
- Hooks: `parts.ai.confidence.high`, `parts.ai.confidence.medium` (badges rendered by AIPartConfidenceBadge)
- Gaps:
  - Existing tests verify badge visibility and label text (line 90-91, 105-106) but don't assert color classes. Color change from active/inactive to success/warning is visual. Tests implicitly verify by checking testId and label, assuming badge renders correctly.
- Evidence: Badge colors changed in ai-part-link-chip.tsx (line 100,102) and status-badge.tsx (line 9-10). Tests at line 90-91 verify badge presence, not specific color value.

## 7) Adversarial Sweep (must attempt ≥3 credible failures or justify none)

**Attack 1: testId collision in LinkChip wrapper causes selector ambiguity**

- **Evidence**: `src/components/parts/ai-part-link-chip.tsx:72-73,83` — testId applied to both Tooltip wrapper div and LinkChip component. Playwright test failures confirm strict mode violation (ai-parts-duplicates.spec.ts:242,313).
- **Failure mode**: Test uses `page.getByTestId(testId)` expecting single element, gets two: wrapper div and Link element inside LinkChip. Playwright refuses to proceed, test fails.
- **Why this is exploitable**: Any test using chip testId will hit ambiguity. Chips in duplicate bar are core UX element. Bug blocks entire duplicate detection test suite from passing (2/5 tests fail).
- **Severity**: Blocker — confirmed by test output, breaks deterministic selector contract.

**Attack 2: Dialog sizing classes conflict or override each other**

- **Evidence**: `src/components/parts/ai-part-dialog.tsx:187-190` — Conditional classNames for review and duplicates steps. Review applies `max-w-none`, duplicates applies `max-w-[800px]`. What if both conditions are true due to state bug?
- **Attempted exploit**: Force `currentStep` to be both 'review' and 'duplicates' (impossible due to TypeScript union type), or introduce state corruption where step transitions without clearing previous className. Check if `cn()` utility handles conflicting classes correctly.
- **Why code held up**: TypeScript enforces `currentStep` is single string value from union type. `cn()` utility (from clsx/tailwind-merge) merges classes and resolves conflicts by Tailwind specificity rules. `max-w-[800px]` would override `max-w-none` if both present, but conditions are mutually exclusive by design.
- **Verdict**: No exploitable race. Conditional logic is sound.

**Attack 3: Tooltip content triggers multiple renders or layout thrashing**

- **Evidence**: `src/components/parts/ai-part-link-chip.tsx:48-59` — Tooltip content is AIPartDuplicateCard component with fetched part data. Card queries for cover image and formats display. Tooltip recalculates position on every render.
- **Attempted exploit**: Hover over chip rapidly while part data is loading. Tooltip opens, shows loading card, part data resolves, card re-renders with actual content, tooltip repositions. Could cause jank or infinite render loop if card dimensions change during load.
- **Why code held up**: AIPartDuplicateCard has stable dimensions (`max-w-[180px]`, fixed height from image placeholder + text lines). Tooltip component manages its own position state (tooltip.tsx:113-125) and doesn't re-render on content changes unless position needs update. Part data loading is async but doesn't trigger Tooltip state change, only card internal content changes.
- **Verdict**: No render loop risk. Card has predictable layout.

**Attack 4: Duplicate part key collision creates incorrect sort order**

- **Evidence**: `src/components/parts/ai-duplicate-bar.tsx:23` — `useSortedDuplicates(duplicateParts)` hook sorts by confidence then description. Multiple duplicates could have same part key (impossible by API contract) or same description (possible).
- **Attempted exploit**: Create analysis result with two duplicates having identical descriptions but different part keys. Sort function compares descriptions alphabetically. If descriptions match, sort order is undefined (depends on original array order and sort stability).
- **Why code held up**: JavaScript `.sort()` is stable since ES2019 (maintains relative order of equal elements). Even if descriptions match, original array order is preserved within that subset. Part keys are unique by API contract (backend validates), so collision is impossible. If descriptions match, stable sort keeps them in API response order, which is acceptable.
- **Verdict**: Edge case handled by sort stability. No data corruption risk.

**Attack 5: Cancel button click during async part data fetch causes state corruption**

- **Evidence**: `src/components/parts/ai-duplicates-only-step.tsx:67` — Cancel button closes dialog. While dialog is open, `DuplicateCardWithData` components (line 81-92) fetch part details via `useDuplicatePartDetails` hook.
- **Attempted exploit**: User clicks Cancel while part data is loading. Dialog closes, components unmount, but async queries may still be in flight. Could TanStack Query cache get corrupted or memory leak?
- **Why code held up**: TanStack Query automatically cancels queries on component unmount (useEffect cleanup). `useDuplicatePartDetails` hook (use-duplicate-part-details.ts:11) uses React Query's built-in cancellation. When dialog closes and DuplicateCardWithData unmounts, queries abort. No state corruption.
- **Verdict**: Query lifecycle properly managed. Safe to cancel during load.

**Attack 6: LinkChip info icon and wrapper onClick handlers conflict**

- **Evidence**: `src/components/parts/ai-part-link-chip.tsx:67-68,73` — Wrapper div has `onClick={handleWrapperClick}` (opens part in new tab). LinkChip inside has `openInNewTab={true}` (Link with `target="_blank"`). LinkChip's info icon (line 84-86) has `infoTooltip` which renders Tooltip with `onClick` stop propagation (link-chip.tsx:110).
- **Attempted exploit**: User clicks info icon. Does click bubble to wrapper and trigger both `handleWrapperClick` (window.open) AND info icon action (show tooltip)? Could open two tabs or have competing handlers.
- **Why code held up**: LinkChip's info icon wrapper has `onClick={handleInfoIconClick}` which calls `event.stopPropagation()` (link-chip.tsx:109-111). This prevents event from bubbling to outer div's `onClick={handleWrapperClick}`. Clicking info icon only shows tooltip, doesn't navigate. However, wrapper's `onClick` is redundant because LinkChip already handles navigation via Link element.
- **Verdict**: No double-navigation bug, but wrapper click handler is unnecessary and adds confusion (see Refactoring Opportunity).

## 8) Invariants Checklist (table)

**Invariant 1: Each duplicate chip has unique testId**

- Where enforced: `src/components/parts/ai-duplicate-bar.tsx:45-47` — testId computed as `parts.ai.review.duplicate-bar.chip.${duplicate.partKey}`. Part keys are unique by API contract.
- Failure mode: After fixing Blocker bug (remove duplicate testId from wrapper), each chip still needs unique identifier. If two duplicates somehow had same partKey, testIds would collide.
- Protection: Backend ensures part keys are unique UUIDs/slugs. Frontend doesn't validate but relies on API contract. Duplicate bar maps over array, so even if keys matched, React key warning would fire.
- Evidence: Test at line 241-242 selects chip by part key testId, expects single element after fix.

**Invariant 2: Dialog step transitions maintain single step state**

- Where enforced: `src/components/parts/ai-part-dialog.tsx:21,126-180` — `currentStep` state is single string union value. `setCurrentStep` calls are non-overlapping (input → progress → review/duplicates, cancel → input).
- Failure mode: If multiple state setters fire simultaneously (race condition), dialog could be in indeterminate step. ClassNames for sizing depend on step being exactly 'review' or 'duplicates'.
- Protection: React's state batching ensures `setCurrentStep` calls are serialized. TypeScript enforces step is one of 4 values. Effect on line 57-65 resets to 'input' on dialog close, preventing stale state.
- Evidence: Dialog structure at line 126-180 switches on currentStep, always renders single step component.

**Invariant 3: Tooltip content (AIPartDuplicateCard) matches source duplicate entry**

- Where enforced: `src/components/parts/ai-part-link-chip.tsx:48-59` — Tooltip content is JSX element created from `duplicate` and `part` props. Card receives same `duplicate` object as chip. `useDuplicatePartDetails` fetches part by `duplicate.partKey`.
- Failure mode: If `useDuplicatePartDetails` returns wrong part (cached data from different key), tooltip shows mismatched information. User hovers chip for part A, sees card for part B.
- Protection: TanStack Query keys cache by part key (use-duplicate-part-details.ts:13). Query key is `['parts', duplicate.partKey]`. Each part key gets own cache entry. No cross-contamination unless cache key is wrong (would be hook bug, not this component's issue).
- Evidence: Tooltip content at line 48-59 passes `duplicate.partKey` to card, card fetches same key.

**Invariant 4: Card max-width constraint applies in all contexts (grid and tooltip)**

- Where enforced: `src/components/parts/ai-duplicate-card.tsx:56,73,114` — All Card elements have `max-w-[180px]` className regardless of `inTooltip` value.
- Failure mode: If max-width missing from one variant, cards in grid vs. tooltip have different sizes. Tooltip width could exceed viewport or cause overflow.
- Protection: Max-width applied in all three render paths (loading, error, success). Card variant changes (grid-tile vs. slim) but max-width is always present. Tailwind utility is inline in className string, not dependent on variant logic.
- Evidence: Max-width on line 56 (loading), 75 (error), 116 (success). All three paths render Card with consistent width constraint.

**Invariant 5: Cancel button always closes dialog, never partial state**

- Where enforced: `src/components/parts/ai-part-input-step.tsx:67`, `src/components/parts/ai-duplicates-only-step.tsx:67` — Both onClick handlers call `onCancel` prop, which is wired to `handleDialogClose` in parent dialog (ai-part-dialog.tsx:119-124).
- Failure mode: If onCancel is undefined or not wired correctly, button click does nothing. Dialog remains open, user confused.
- Protection: TypeScript requires `onCancel?: () => void` prop on step components. Parent dialog passes `onCancel={handleDialogClose}` (ai-part-dialog.tsx:132,158). handleDialogClose calls `cancelAnalysis()` if needed, then `onClose()` to close dialog (line 119-124).
- Evidence: Cancel button at line 64-71 (input step) and 64-70 (duplicates step) both call `onClick={onCancel}`. Parent provides handler.

## 9) Questions / Needs-Info

**Question 1: What is intended hover target for showing duplicate card?**

- Why it matters: Plan section 13 says "hover over info icon shows card", but implementation (ai-part-link-chip.tsx:72) wraps entire LinkChip in Tooltip, making chip hover show card. Info icon has separate reasoning tooltip (line 84-86 via LinkChip's `infoTooltip` prop). This creates two tooltips: one for card (chip hover), one for reasoning (info icon hover). Is this intentional?
- Desired answer: Clarify if card should show on chip hover (current impl) or only on separate hover area. If chip hover shows card, info icon reasoning tooltip may be redundant (reasoning is in card). If info icon hover shows card, remove Tooltip wrapper from chip.

**Question 2: Should duplicates-only grid be responsive or fixed 4 columns?**

- Why it matters: Current implementation uses `grid-cols-4` (ai-duplicates-only-step.tsx:44), which is not responsive. Plan mentioned responsive behavior. On mobile or narrow viewports, 4 columns of 180px cards (720px min) will overflow or shrink cards below intended size.
- Desired answer: Specify grid column breakpoints (e.g., 1 col on mobile, 2 on tablet, 4 on desktop) or confirm fixed 4-column layout is acceptable. If responsive required, provide breakpoint values.

**Question 3: Is "slim" card variant's padding reduction (p-4 → p-2) intentional?**

- Why it matters: Plan specified removing border for tooltip context but didn't mention padding change. Reduced padding may affect content layout (icons closer to edges, text more cramped). Need confirmation this is desired visual treatment.
- Desired answer: Confirm p-2 padding is correct for tooltip cards, or revert to p-4 with only border removed.

## 10) Risks & Mitigations (top 3)

**Risk 1: testId duplication blocks entire duplicate detection test suite**

- Mitigation: Remove testId from Tooltip wrapper div in AIPartLinkChip (line 72-73). Keep testId only on LinkChip component (line 83). Re-run Playwright tests to verify 5/5 pass. Commit cannot merge until this is fixed.
- Evidence: Test failures at ai-parts-duplicates.spec.ts:242,313. Strict mode violation error message in test output.

**Risk 2: Hover behavior ambiguity causes UX confusion**

- Mitigation: Clarify with stakeholder whether duplicate card should appear on chip hover or info icon hover. Current impl has both: card on chip hover (Tooltip wrapper), reasoning on info icon hover (LinkChip infoTooltip). If redundant, consolidate to single tooltip. Update tests to match final behavior.
- Evidence: Question 1 above. Plan section 13 ambiguity about hover target.

**Risk 3: Fixed 4-column grid breaks mobile layout**

- Mitigation: Test duplicates-only screen on mobile viewport (375px, 768px widths). If cards overflow or become unusable, implement responsive grid (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`) or auto-fit pattern (`repeat(auto-fit, minmax(180px, 1fr))`). Verify with stakeholder if mobile support is in scope.
- Evidence: Question 2 above. Grid layout change removed dynamic column calculation (ai-duplicates-only-step.tsx:44).

## 11) Confidence

Confidence: Medium — Changes demonstrate solid understanding of React patterns, component composition, and Tailwind styling. TypeScript strict mode passes, ESLint is clean, and most architectural decisions align with project conventions. However, critical testId duplication bug breaks 40% of test suite and must be fixed before merge. Additional concerns around hover behavior ambiguity, responsive grid layout, and CSS class conflicts reduce confidence. After fixing Blocker and clarifying Questions 1-3, confidence would increase to High. Implementation quality is good but needs targeted corrections before production-ready.
