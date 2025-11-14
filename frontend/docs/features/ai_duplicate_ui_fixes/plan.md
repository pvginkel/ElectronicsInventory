# AI Duplicate Detection UI Fixes - Implementation Plan

## 0) Research Log & Findings

### Searched Areas
- **LinkChip Component**: Located at `src/components/ui/link-chip.tsx` — Pure presentational chip with TanStack Router Link, icon, label, StatusBadge, and optional unlink button. Currently supports `icon`, `statusBadgeColor`, `statusBadgeLabel`, but no support for additional info icon or hover card.
- **Duplicate Bar**: `src/components/parts/ai-duplicate-bar.tsx` and `ai-duplicate-bar-item.tsx` — Horizontal scrollable bar with flat inline items. Current item uses custom button with inline layout showing part key, description, badge, and info icon with tooltip.
- **Duplicate Card**: `src/components/parts/ai-duplicate-card.tsx` — Grid-tile cards with cover image, description, part key, confidence badge, and info tooltip. Uses Card `variant="grid-tile"` with `onClick` handler.
- **Duplicates-Only Step**: `src/components/parts/ai-duplicates-only-step.tsx` — Full-screen grid layout using responsive grid classes. No explicit card sizing constraints.
- **Location Container Reference**: `src/components/boxes/location-container.tsx:45` — Uses fixed 180px grid columns: `style={{ gridTemplateColumns: 'repeat(${columnCount}, 180px)' }}`.
- **AI Dialog Structure**: `src/components/parts/ai-part-dialog.tsx` — Routes between input, progress, review, and duplicates steps. Currently has cancel support in progress step only.
- **Review Step**: `src/components/parts/ai-part-review-step.tsx` — Shows AIPartDuplicateBar at top when duplicates present. Has "Go Back" button but no cancel.
- **Input Step**: `src/components/parts/ai-part-input-step.tsx` — Simple form with submit button. No cancel button currently.
- **Tooltip Component**: `src/components/ui/tooltip.tsx` — Supports both simple `title` and rich `content` modes with portal rendering, placement control, and accessibility.
- **Confidence Badge**: `src/components/parts/ai-confidence-badge.tsx` — Displays high (green) or medium (amber) badges.
- **Test File**: `tests/e2e/parts/ai-parts-duplicates.spec.ts` — Contains the two failing tests to be removed (lines 377-406, 408-469).

### Key Findings
1. **LinkChip is navigation-focused**: Designed for entity linking (kits, shopping lists). Extending it for duplicate bar requires adding optional tooltip/info icon support while maintaining its core navigation contract.
2. **Card hover animation clips**: Cards use `hover:scale-[1.02]` which can clip at container borders. Location container shows the pattern of using fixed-width columns.
3. **Duplicate bar has two rendering contexts**: Bar items (compact horizontal) and cards (large vertical grid). Both share same data source but different visual treatments.
4. **Sorting not implemented**: Current code renders duplicates in API response order. Need to sort by confidence (high > medium) then alphabetically by description.
5. **Cancel patterns**: Progress step shows `<Button variant="outline" onClick={onCancel}>Cancel Analysis</Button>` pattern. Review and input steps lack cancel functionality.
6. **Background color**: Current bar uses `bg-muted/30` which appears gray in dark mode per change brief.

### Conflicts Resolved
- **LinkChip extension vs. new component**: Decision: Extend LinkChip to support optional info icon and tooltip rather than creating a new component. This maintains consistency with existing chip patterns and avoids duplication. Add optional props: `infoIcon`, `infoTooltip`, `infoIconTestId`.
- **Hover card vs. tooltip**: Decision: Use Tooltip component with `content` prop and `placement="auto"` to show AIPartDuplicateCard on hover. Tooltip already supports rich content and portal rendering. No need for new popover component.
- **Bar layout change**: Decision: Redesign bar to show chips horizontally on RIGHT of label using flexbox with wrap. Remove subtext. Current vertical layout (label/subtext above, items below) will become horizontal (label left, chips right).
- **Panel background color**: Decision: Use `bg-blue-50 dark:bg-blue-950/30` to add subtle blue tint distinguishing it from muted gray.
- **Font size increase**: Decision: Change header from `text-sm` to `text-base` (16px).

## 1) Intent & Scope

**User intent**

Apply targeted UI/UX improvements to the AI duplicate detection feature based on user feedback. The changes focus on (1) redesigning the duplicate bar to use LinkChip components with enhanced features, (2) reducing card sizes in the duplicates-only screen, (3) adding cancel buttons throughout the AI workflow, and (4) removing two unnecessary failing tests.

**Prompt quotes**

- "Reuse the `LinkChip` component instead of custom bar item component"
- "Reduce card width to maximum 180px (reference: `src/components/boxes/location-container.tsx:45`)"
- "Add Cancel button to review step (where duplicate bar shows)"
- "Add Cancel button to duplicates-only screen"
- "Add Cancel button to input step (and make 'Analyze Part' button regular size)"
- "Sort duplicates: high confidence first, then medium confidence, then alphabetically by description within each confidence level"
- "On hover over a part chip, show a popup/tooltip with the full duplicate card (same card as duplicate-only screen)"
- "Delete the two error-handling edge case tests from `tests/e2e/parts/ai-parts-duplicates.spec.ts`"

**In scope**

- Extend LinkChip component to support optional info icon with tooltip
- Create AIPartLinkChip domain wrapper following kit/shopping-list chip patterns
- Redesign AIPartDuplicateBar to use chip components horizontally with wrapping
- Implement hover-to-show-card behavior using Tooltip component with card content
- Add sorting utility for duplicates (confidence then description)
- Reduce duplicate card max-width to 180px and adjust grid layout
- Add padding to card container to prevent hover animation clipping
- Add Cancel buttons to input, review, and duplicates-only steps
- Wire cancel buttons to dialog close handler
- Remove two failing tests from ai-parts-duplicates.spec.ts
- Update styling: panel background color, header font size, chip cursor

**Out of scope**

- Changes to duplicate detection algorithm or backend API
- Modifications to AI analysis flow or progress step beyond cancel button
- Changes to card content or internal layout (only container sizing)
- New Playwright test coverage (existing passing tests must continue to pass)
- Changes to other AI workflow steps (document grid, review form fields)
- Performance optimizations or loading state improvements

**Assumptions / constraints**

- LinkChip extension must not break existing kit and shopping list chip usages
- Tooltip component can render complex React elements (AIPartDuplicateCard) in content mode
- AIPartDuplicateCard component is reusable and can be rendered both in grid and tooltip contexts
- Cancel functionality in all steps should close dialog and reset state via existing `onClose` handler
- Sorting logic runs client-side after data fetch (no backend changes)
- 180px max-width cards will work responsively with existing grid classes
- Test removal will not affect CI/CD pipeline health (tests are intentionally failing edge cases)

## 2) Affected Areas & File Map

### Components to Modify

- **Area**: `src/components/ui/link-chip.tsx`
- **Why**: Extend LinkChip to support optional info icon with tooltip for duplicate bar usage
- **Evidence**: `link-chip.tsx:39-86` — Current LinkChipProps and component structure. Need to add `infoIcon?: ReactNode`, `infoTooltip?: ReactNode`, `infoIconTestId?: string` props.
- **Implementation Note**: Info icon must render **outside** the Link element (after Link wrapper closes) to prevent click navigation interference. Structure: `<div wrapper> <Link>...</Link> {infoIcon && <Tooltip><span onClick={stopProp}>{infoIcon}</span></Tooltip>} </div>`

- **Area**: `src/components/parts/ai-duplicate-bar.tsx`
- **Why**: Redesign to use AIPartLinkChip components in horizontal layout with wrapping
- **Evidence**: `ai-duplicate-bar.tsx:18-42` — Current vertical layout with header/subtext and horizontal scrollable items. Replace with flexbox layout: header left, chips right with wrap. Update background to `bg-blue-50 dark:bg-blue-950/30`, header to `text-base`.

- **Area**: `src/components/parts/ai-duplicate-bar-item.tsx`
- **Why**: Replace with new AIPartLinkChip component (this file becomes obsolete but may be referenced temporarily)
- **Evidence**: `ai-duplicate-bar-item.tsx:1-111` — Custom button component with inline layout. Will be replaced by LinkChip-based implementation.

- **Area**: `src/components/parts/ai-duplicates-only-step.tsx`
- **Why**: Update grid layout to enforce 180px card width and add container padding
- **Evidence**: `ai-duplicates-only-step.tsx:51` — Current grid uses `grid gap-4` with responsive column classes. Need to switch to fixed-width columns like location-container or add max-width constraint to cards.

- **Area**: `src/components/parts/ai-duplicate-card.tsx`
- **Why**: Add max-width constraint and ensure component works in both grid and tooltip contexts
- **Evidence**: `ai-duplicate-card.tsx:111-158` — Card component with grid-tile variant. Need to add `max-w-[180px]` class and ensure hover animations don't cause layout issues in tooltips.

- **Area**: `src/components/parts/ai-part-input-step.tsx`
- **Why**: Add Cancel button and adjust Analyze button to regular size
- **Evidence**: `ai-part-input-step.tsx:60-68` — Current submit button uses `className="w-full"`. Change to normal width and add cancel button below.

- **Area**: `src/components/parts/ai-part-review-step.tsx`
- **Why**: Add Cancel button to actions footer
- **Evidence**: `ai-part-review-step.tsx:499-522` — Actions footer with "Go Back" and "Add Part" buttons. Add Cancel button on the right side of the footer.

- **Area**: `src/components/parts/ai-part-dialog.tsx`
- **Why**: Wire cancel buttons to dialog close handler and pass to child steps
- **Evidence**: `ai-part-dialog.tsx:118-123` — `handleDialogClose` already handles canceling analysis if in progress. Need to pass `onClose` or `onCancel` prop to input, review, and duplicates steps.

- **Area**: `tests/e2e/parts/ai-parts-duplicates.spec.ts`
- **Why**: Remove two failing edge case tests
- **Evidence**: `ai-parts-duplicates.spec.ts:377-406` (test: "shows error when neither analysis nor duplicates returned"), `ai-parts-duplicates.spec.ts:408-469` (test: "shows fallback UI when duplicate part fetch fails with 404").

### Components to Create

- **Area**: `src/components/parts/ai-part-link-chip.tsx` (new file)
- **Why**: Domain-specific wrapper for duplicate part chips following kit/shopping-list patterns
- **Evidence**: `src/components/kits/kit-link-chip.tsx` and `src/components/shopping-lists/shopping-list-link-chip.tsx` show domain wrapper pattern with status badge mapping, icon selection, and accessibility labels.

### Utilities to Create

- **Area**: `src/lib/utils/ai-parts.ts` (extend existing)
- **Why**: Add sorting utility for duplicate parts array
- **Evidence**: File path inferred from `src/lib/utils/parts.ts` (parts utilities) and `src/lib/utils/ai-parts.ts` reference in `ai-part-review-step.tsx:13` — `transformToCreateSchema` shows AI parts utilities exist.

### Instrumentation Changes

**AIPartLinkChip** (new component):
- `testId` prop (required): Base testId for chip (e.g., `parts.ai.review.duplicate-bar.chip.${partKey}`)
- Chip wrapper: Uses `testId` directly on wrapper div
- Info icon wrapper: `${testId}.info` (for hover target in tests)
- Info tooltip: `${testId}.info.tooltip` (Tooltip component auto-suffixes `.tooltip`)

**AIPartDuplicateCard** (existing):
- No changes to existing testId structure
- Continue using `parts.ai.duplicates.card.${partKey}` for card
- Continue using `parts.ai.duplicate-reasoning.card.${partKey}` for tooltip

**Naming Convention**:
- Bar context: `.chip.` prefix for chips, `.chip.${partKey}.info.tooltip` for tooltips
- Card context: `.card.` prefix (existing pattern preserved)

**New Cancel Buttons**:
- Input step: `parts.ai.input.cancel`
- Review step: `parts.ai.review.cancel`
- Duplicates step: `parts.ai.duplicates.cancel`

### Hooks

- **Area**: `src/hooks/use-duplicate-part-details.ts`
- **Why**: No changes needed — already fetches part details for both bar and card
- **Evidence**: `use-duplicate-part-details.ts:1-28` — Hook used by both DuplicateBarItemWithData and DuplicateCardWithData wrappers.

- **Area**: `src/hooks/use-sorted-duplicates.ts` (new)
- **Why**: Coordinate multiple async part detail fetches and return sorted array when data is ready
- **Evidence**: Addresses review finding about sorting strategy requiring async coordination
- **Contract**:
  ```typescript
  function useSortedDuplicates(duplicateParts: DuplicatePartEntry[]) {
    // Fetch all part details in parallel using useDuplicatePartDetails for each
    // Collect results into a partDetailsMap: Record<partKey, PartResponseSchema | undefined>
    // Sort with useMemo: high confidence > medium > alphabetical by description (or partKey fallback)
    // Return { sortedDuplicates: DuplicatePartEntry[], isLoading: boolean }
  }
  ```

## 3) Data Model / Contracts

### Duplicate Part Entry

- **Entity / contract**: DuplicatePartEntry (frontend model)
- **Shape**:
  ```typescript
  interface DuplicatePartEntry {
    partKey: string;
    confidence: 'high' | 'medium';
    reasoning: string;
  }
  ```
- **Mapping**: Already camelCase (no snake_case conversion needed)
- **Evidence**: `src/types/ai-parts.ts:13-17` — Frontend type definition.

### LinkChip Props Extension

- **Entity / contract**: LinkChipProps (extended interface)
- **Shape**:
  ```typescript
  // New optional props
  infoIcon?: ReactNode;       // Info icon element (e.g., <Info className="h-4 w-4" />)
  infoTooltip?: ReactNode;    // Tooltip content for info icon
  infoIconTestId?: string;    // Test ID for info icon wrapper
  ```
- **Mapping**: Props flow from AIPartLinkChip → LinkChip. Info icon renders after StatusBadge, triggers Tooltip on hover.
- **Evidence**: `src/components/ui/link-chip.tsx:9-37` — Current LinkChipProps interface.

### Part Response Schema

- **Entity / contract**: PartResponseSchema (from generated API types)
- **Shape**: Used for fetching duplicate part details, includes key, description, manufacturer_code, cover_attachment, etc.
- **Mapping**: snake_case API response → camelCase via useDuplicatePartDetails hook
- **Evidence**: `src/components/parts/ai-duplicate-card.tsx:10` — `components['schemas']['PartResponseSchema.1a46b79']`

### AI Analysis Result

- **Entity / contract**: TransformedAIPartAnalysisResult
- **Shape**:
  ```typescript
  interface TransformedAIPartAnalysisResult {
    duplicateParts?: DuplicatePartEntry[];
    // ... other analysis fields
  }
  ```
- **Mapping**: API response transformed to camelCase by useAIPartAnalysis hook
- **Evidence**: `src/types/ai-parts.ts:22-47` — Frontend type definition with duplicateParts array.

## 4) API / Integration Surface

### No New API Calls Required

- **Surface**: All existing — `useGetPartsByPartKey`, AI analysis SSE stream
- **Inputs**: Duplicate part keys from analysis result
- **Outputs**: Part details (description, manufacturer_code, cover_attachment, etc.)
- **Errors**: Already handled — 404 falls back to showing part key only, other errors logged to console
- **Evidence**: `src/hooks/use-duplicate-part-details.ts:11-28` — Hook with retry: false, error logging for non-404 responses.

### Dialog Close Integration

- **Surface**: Dialog close handler
- **Inputs**: User click on Cancel button
- **Outputs**: Dialog closes, analysis canceled if in progress, state reset
- **Errors**: None — synchronous action
- **Evidence**: `src/components/parts/ai-part-dialog.tsx:118-123` — `handleDialogClose` callback.

## 5) Algorithms & UI Flows

### Flow: Duplicate Part Sorting

- **Flow**: Sort duplicates before rendering in bar or grid
- **Steps**:
  1. Receive duplicateParts array from analysis result
  2. Sort by confidence: 'high' entries before 'medium' entries
  3. Within each confidence group, sort alphabetically by part description (requires fetched part data)
  4. Handle missing part data gracefully (fallback to partKey for sorting)
  5. Return sorted array to rendering component
- **States / transitions**: Pure function, no state. Sorting happens during render or via useMemo in parent component.
- **Hotspots**: Must wait for part details to load before sorting by description. Consider sorting by partKey first (for initial render), then re-sort once details load.
- **Evidence**: `src/components/parts/ai-duplicate-bar.tsx:35-37` — Current map over duplicateParts without sorting.

### Flow: LinkChip with Info Icon and Hover Card

- **Flow**: User hovers over duplicate chip's info icon, sees full card in tooltip
- **Steps**:
  1. AIPartLinkChip renders with infoIcon and infoTooltip props
  2. LinkChip renders info icon outside Link element (after Link closes), wrapped in Tooltip component
  3. User hovers over info icon specifically (not entire chip)
  4. Tooltip component shows AIPartDuplicateCard in portal
  5. User moves mouse away, tooltip closes
- **States / transitions**: Tooltip manages isOpen state internally via useTooltip hook
- **Hotspots**: Info icon must render outside Link element to prevent navigation on click. Tooltip shows on info icon hover only, not chip hover, to avoid interfering with chip click navigation. Ensure card renders correctly in portal context (no grid constraints).
- **Evidence**: `src/components/ui/tooltip.tsx:61-79` — Tooltip open/close logic. `src/components/ui/link-chip.tsx:108-136` — Link element with click handler.

### Flow: Cancel Button Action

- **Flow**: User clicks Cancel in any step, dialog closes
- **Steps**:
  1. User clicks Cancel button in input, review, or duplicates-only step
  2. Button onClick calls onCancel or onClose prop
  3. Parent dialog component (AIPartDialog) receives callback
  4. Dialog calls handleDialogClose, which cancels analysis if in progress
  5. Dialog closes, state resets to 'input' step via useEffect
- **States / transitions**: currentStep state resets when dialog re-opens
- **Hotspots**: Ensure Cancel in progress step still works (already implemented). Avoid duplicate cancel logic.
- **Evidence**: `src/components/parts/ai-part-dialog.tsx:55-64` — useEffect that resets state on dialog open/close.

### Flow: Horizontal Bar Layout with Wrapping

- **Flow**: Render duplicate chips horizontally next to label, wrapping to multiple lines if needed
- **Steps**:
  1. AIPartDuplicateBar receives duplicateParts array
  2. Sort duplicates using sorting utility
  3. Render flex container with label on left, chip list on right
  4. Map over sorted duplicates, render AIPartLinkChip for each
  5. Chips wrap to next line via `flex-wrap: wrap`
  6. Each chip has pointer cursor and hover effects
- **States / transitions**: No component state — all props-driven
- **Hotspots**: Label and chips must maintain alignment when wrapping. Chips should have consistent gap spacing (gap-2).
- **Evidence**: `src/components/parts/ai-duplicate-bar.tsx:23-30` — Current header rendering. `src/components/ui/link-chip.tsx:98-107` — Chip wrapper div with hover styles.

## 6) Derived State & Invariants

### Derived value: Sorted Duplicates Array

- **Source**: duplicateParts prop from analysisResult, part details from useDuplicatePartDetails per entry
- **Writes / cleanup**: No writes — pure derivation. Used for rendering order in bar and grid.
- **Guards**: Sort function must handle missing part details (isLoading or isError states). Fallback to partKey sorting when description unavailable.
- **Invariant**: Sorted array must preserve all entries from original duplicateParts. No filtering or mutation of original data.
- **Evidence**: `src/components/parts/ai-duplicate-bar.tsx:14-16` — If no duplicates, return null. Bar component must handle empty array gracefully.

### Derived value: Chip Tooltip Content

- **Source**: duplicate (DuplicatePartEntry), part (PartResponseSchema), isLoading, isError from useDuplicatePartDetails
- **Writes / cleanup**: No writes — content passed to Tooltip which manages portal rendering and cleanup
- **Guards**: Tooltip should only show if part data is loaded (not show loading spinner in tooltip). Consider showing tooltip only when part data available.
- **Invariant**: Tooltip content must be static React element (AIPartDuplicateCard) with consistent dimensions to avoid repositioning during hover.
- **Evidence**: `src/components/ui/tooltip.tsx:164-200` — Tooltip portal rendering with position state.

### Derived value: Cancel Button Visibility

- **Source**: Current dialog step, isAnalyzing state
- **Writes / cleanup**: No writes — button visibility controlled by step component
- **Guards**: Cancel should always be available in input, review, and duplicates steps. Progress step already has cancel (conditional on onCancel prop).
- **Invariant**: Cancel button must always close dialog regardless of analysis state. If analysis in progress, must also call cancelAnalysis.
- **Evidence**: `src/components/parts/ai-part-dialog.tsx:118-123` — handleDialogClose checks isAnalyzing and calls cancelAnalysis.

## 7) State Consistency & Async Coordination

### Duplicate Part Details Fetching

- **Source of truth**: TanStack Query cache, keyed by part_key
- **Coordination**: useDuplicatePartDetails hook per duplicate entry. Each DuplicateBarItemWithData and DuplicateCardWithData wrapper fetches independently. Query deduplication ensures single fetch per part_key.
- **Async safeguards**: retry: false prevents infinite 404 retries. Non-404 errors logged but don't block rendering (fallback to partKey display).
- **Instrumentation**: No instrumentation needed — internal component data fetching, not user-initiated action.
- **Evidence**: `src/hooks/use-duplicate-part-details.ts:11-17` — Query with retry: false, error logging in useEffect.

### Sorting Coordination

- **Source of truth**: duplicateParts prop from parent, part details from multiple `useDuplicatePartDetails` queries
- **Coordination**: Use `useSortedDuplicates(duplicateParts)` hook in parent components (AIPartDuplicateBar, AIPartDuplicatesOnlyStep). Hook internally calls `useDuplicatePartDetails` for each duplicate in parallel, collects results into partDetailsMap, and returns sorted array via useMemo.
- **Async safeguards**: Hook returns `{ sortedDuplicates, isLoading }`. Parent components can show loading state or render unsorted chips initially. Sorting function handles missing part details by falling back to partKey sorting when description is unavailable.
- **Instrumentation**: None required — internal data coordination, not user-initiated action
- **Evidence**: New hook pattern addresses review finding about async coordination gap. Hook centralizes fetch coordination and sorting logic. Pattern: `const { sortedDuplicates, isLoading } = useSortedDuplicates(duplicateParts); return sortedDuplicates.map(...)`

### Cancel Button State

- **Source of truth**: Dialog open/close state, currentStep state
- **Coordination**: Cancel button onClick propagates to parent dialog handleDialogClose. Dialog manages step transitions and analysis cancellation.
- **Async safeguards**: If analysis in progress (isAnalyzing === true), cancelAnalysis() called before closing dialog. SSE stream cleanup handled by useAIPartAnalysis hook.
- **Instrumentation**: No new instrumentation — dialog close is not a tracked event. Analysis cancellation already logged if needed.
- **Evidence**: `src/components/parts/ai-part-dialog.tsx:72-75` — handleCancelAnalysis calls cancelAnalysis and sets step to input.

## 8) Errors & Edge Cases

### Failure: Part details fetch fails (404 or error)

- **Surface**: AIPartLinkChip in duplicate bar, AIPartDuplicateCard in grid and tooltip
- **Handling**: Show partKey as label, fallback to generic "Unable to load part details" message. Info tooltip still shows reasoning text.
- **Guardrails**: useDuplicatePartDetails returns isError: true, component checks and renders fallback UI
- **Evidence**: `src/components/parts/ai-duplicate-card.tsx:68-106` — Error state fallback rendering.

### Failure: Empty duplicateParts array

- **Surface**: AIPartDuplicateBar
- **Handling**: Component returns null early (current behavior preserved)
- **Guardrails**: Conditional check at component top: `if (!duplicateParts || duplicateParts.length === 0) return null;`
- **Evidence**: `src/components/parts/ai-duplicate-bar.tsx:14-16` — Early return for empty array.

### Failure: LinkChip navigation broken (malformed partKey)

- **Surface**: AIPartLinkChip click
- **Handling**: TanStack Router handles invalid routes, shows 404 page. Not a duplicate bar responsibility.
- **Guardrails**: None needed — router contract enforced by generated types
- **Evidence**: Router typing ensures part_key param is string.

### Edge Case: Very long part description in chip

- **Surface**: AIPartLinkChip label
- **Handling**: LinkChip already has truncate class on label span. Tooltip on hover shows full description in card.
- **Guardrails**: CSS truncation with ellipsis, title attribute for native tooltip
- **Evidence**: `src/components/ui/link-chip.tsx:128` — `<span className="truncate">{label}</span>`

### Edge Case: Many duplicates (20+) in bar

- **Surface**: AIPartDuplicateBar horizontal layout
- **Handling**: Chips wrap to multiple lines via flex-wrap. Scrollable container if needed (or allow bar to grow in height).
- **Guardrails**: Max height on bar container with overflow-y: auto if more than N rows. Consider flex-wrap + max-height.
- **Evidence**: Current bar uses `-mx-2 px-2` with `overflow-x-auto` for horizontal scrolling. New design uses wrap instead.

### Edge Case: Tooltip obscures chip or other UI elements

- **Surface**: Tooltip on info icon hover
- **Handling**: Tooltip component auto-places via placement="auto", finds best viewport position. Tooltip content (card) has fixed dimensions.
- **Guardrails**: Tooltip z-index (z-50) ensures it renders above other UI. Card max-width prevents overflow.
- **Evidence**: `src/components/ui/tooltip.tsx:170-179` — Tooltip positioning with fixed position and computed top/left.

### Edge Case: Cancel button clicked during mutation

- **Surface**: Review step during part creation
- **Handling**: isCreating state disables Cancel button (similar to "Add Part" button)
- **Guardrails**: `disabled={isCreating}` prop on Cancel button
- **Evidence**: `src/components/parts/ai-part-review-step.tsx:505-506` — "Go Back" button already disabled when isCreating.

## 9) Observability / Instrumentation

### Signal: Duplicate chip click

- **Type**: TanStack Router navigation event (no custom instrumentation)
- **Trigger**: User clicks AIPartLinkChip, navigates to `/parts/${partKey}` in new tab
- **Labels / fields**: part_key (in URL), target="_blank" for new tab
- **Consumer**: Browser navigation, no Playwright tracking needed
- **Evidence**: `src/components/parts/ai-duplicate-bar-item.tsx:49` — `window.open('/parts/${duplicate.partKey}', '_blank')`

### Signal: Cancel button click

- **Type**: Dialog close event (no custom instrumentation)
- **Trigger**: User clicks Cancel in input, review, or duplicates step
- **Labels / fields**: Current step (input/review/duplicates)
- **Consumer**: No tracking needed — internal dialog state management
- **Evidence**: `src/components/parts/ai-part-dialog.tsx:118-123` — handleDialogClose callback.

### Signal: Tooltip open (info icon hover)

- **Type**: Tooltip visibility (not instrumented)
- **Trigger**: User hovers over info icon in chip
- **Labels / fields**: part_key (implicit from chip context)
- **Consumer**: No Playwright tracking — tooltips tested via visibility assertions only
- **Evidence**: `docs/contribute/ui/tooltip_guidelines.md:248-274` — Tooltip testing patterns use visibility assertions, not test events.

### No New Test Events Required

All changes are UI-only with no new user-initiated mutations or critical state changes. Existing test instrumentation (parts.ai.* testIds) will be updated for new components but no new test-event emissions needed.

## 10) Lifecycle & Background Work

### Hook / effect: useDuplicatePartDetails query lifecycle

- **Trigger cadence**: On mount of DuplicateBarItemWithData or DuplicateCardWithData wrapper
- **Responsibilities**: Fetch part details by part_key, cache result, handle 404 and errors
- **Cleanup**: React Query handles cleanup on unmount, aborts in-flight requests
- **Evidence**: `src/hooks/use-duplicate-part-details.ts:11-18` — useGetPartsByPartKey with TanStack Query lifecycle.

### Hook / effect: Tooltip hover state management

- **Trigger cadence**: On mouseEnter/mouseLeave of chip wrapper or info icon
- **Responsibilities**: Open/close tooltip, compute position, render portal, handle Escape key
- **Cleanup**: Tooltip component cleans up portal on close, removes event listeners on unmount
- **Evidence**: `src/components/ui/tooltip.tsx:61-86` — handleMouseEnter/handleMouseLeave callbacks, useEffect for enabled state.

### No Long-Running Background Tasks

All components are purely reactive to props and query state. No polling, intervals, or manual subscriptions.

## 11) Security & Permissions

**Not applicable** — UI-only changes with no new data access patterns, authentication requirements, or permission checks. All duplicate part data comes from existing AI analysis endpoint which has server-side authorization.

## 12) UX / UI Impact

### Entry point: AI Part Dialog - Review Step

- **Change**: Duplicate bar redesigned with horizontal chip layout, blue background, larger header
- **User interaction**: Users see chips next to label, can click chips to open parts in new tab, hover over info icon to see full card in tooltip
- **Dependencies**: LinkChip extension, AIPartLinkChip component, Tooltip component
- **Evidence**: `src/components/parts/ai-part-review-step.tsx:209-212` — AIPartDuplicateBar rendered at top of review step.

### Entry point: AI Part Dialog - Duplicates-Only Step

- **Change**: Cards reduced to 180px max-width, container padding added, cancel button added
- **User interaction**: Users see smaller cards in grid, can cancel back to input without going through review
- **Dependencies**: Card max-width styling, cancel button wiring
- **Evidence**: `src/components/parts/ai-duplicates-only-step.tsx:38-74` — Full-height layout with grid and back button.

### Entry point: AI Part Dialog - Input Step

- **Change**: Cancel button added, Analyze button made regular size (no longer full width)
- **User interaction**: Users can cancel out of dialog without submitting analysis
- **Dependencies**: Cancel button wiring to handleDialogClose
- **Evidence**: `src/components/parts/ai-part-input-step.tsx:60-68` — Submit button currently full width.

### Visual Changes Summary

1. **Duplicate Bar**: Horizontal chips with wrap, blue background (`bg-blue-50 dark:bg-blue-950/30`), larger header (`text-base`), no subtext
2. **Duplicate Chips**: Wrench icon, part key label, confidence badge, info icon with reasoning tooltip, pointer cursor
3. **Duplicate Cards**: Max 180px width, maintained aspect ratio, unchanged content
4. **Cancel Buttons**: Outline variant, consistent placement (left or right depending on step), always enabled except during mutation
5. **Hover Interaction**: Info icon hover shows full duplicate card in tooltip overlay

### Accessibility Considerations

- LinkChip maintains existing keyboard navigation and focus management
- Cancel buttons keyboard accessible (Enter/Space to activate)
- Tooltip component provides aria-describedby, role="tooltip", Escape to close
- Info icon wrapped in focusable element for keyboard users
- Confidence badges maintain existing color contrast ratios

### Responsive Behavior

- Duplicate bar chips wrap to multiple lines on narrow viewports
- Card grid continues to use responsive column classes (grid-cols-1 → grid-cols-5 based on count)
- 180px card width enforced but grid remains responsive
- Cancel buttons stack vertically on mobile if needed (existing button layout patterns apply)

## 13) Deterministic Test Plan

### Surface: Duplicate Bar (Review Step)

- **Scenarios**:
  - Given analysis with duplicates, When review step loads, Then duplicate bar visible with blue background and header "Potential Duplicates Found"
  - Given multiple duplicates, When bar renders, Then chips sorted high confidence first, then medium, then alphabetically
  - Given duplicate chip, When user hovers over info icon, Then tooltip shows full duplicate card
  - Given duplicate chip, When user clicks, Then part opens in new tab
  - Given duplicate chip, When user hovers, Then cursor changes to pointer
- **Instrumentation / hooks**:
  - `parts.ai.review.duplicate-bar` (bar container)
  - `parts.ai.review.duplicate-bar.chip.${partKey}` (chip wrapper from AIPartLinkChip)
  - `parts.ai.duplicate-reasoning.chip.${partKey}.tooltip` (tooltip for info icon)
- **Gaps**: None — existing test coverage for bar can be adapted to new chip-based layout
- **Evidence**: `tests/e2e/parts/ai-parts-duplicates.spec.ts:180-257` — Existing test for analysis with duplicate bar.

### Surface: Duplicates-Only Step

- **Scenarios**:
  - Given duplicate-only result, When step renders, Then cards have max-width 180px
  - Given many duplicates, When grid renders, Then cards sorted high confidence first, then medium, then alphabetically
  - Given duplicates step, When user clicks Cancel, Then dialog closes and returns to parts list
- **Instrumentation / hooks**:
  - `parts.ai.duplicates-only-step` (step container)
  - `parts.ai.duplicates.card.${partKey}` (card testId, existing)
  - `parts.ai.duplicates.cancel` (new cancel button)
- **Gaps**: None — existing tests cover card rendering and navigation
- **Evidence**: `tests/e2e/parts/ai-parts-duplicates.spec.ts:5-116` — Existing duplicate-only screen test.

### Surface: Input Step Cancel Button

- **Scenarios**:
  - Given input step, When user clicks Cancel, Then dialog closes without submitting
  - Given input step, When user enters text and clicks Cancel, Then text cleared on next open
- **Instrumentation / hooks**:
  - `parts.ai.input-step` (step container, existing)
  - `parts.ai.input.cancel` (new cancel button)
- **Gaps**: Intentional — no new test coverage required, existing dialog open/close tests sufficient
- **Evidence**: `tests/e2e/parts/ai-parts-duplicates.spec.ts:31-34` — Dialog open flow.

### Surface: Review Step Cancel Button

- **Scenarios**:
  - Given review step, When user clicks Cancel, Then dialog closes
  - Given review step during mutation, When user hovers Cancel, Then button disabled
- **Instrumentation / hooks**:
  - `parts.ai.review-actions` (actions footer, existing at line 499)
  - `parts.ai.review.cancel` (new cancel button)
- **Gaps**: None — existing review step tests can verify button presence
- **Evidence**: `tests/e2e/parts/ai-parts-duplicates.spec.ts:180-257` — Review step test.

### Surface: Test File Cleanup

- **Scenarios**:
  - Given test suite runs, When tests execute, Then two removed tests no longer run
  - Given test suite runs, When tests execute, Then all remaining tests pass
- **Instrumentation / hooks**: N/A — test file change only
- **Gaps**: None
- **Evidence**: `tests/e2e/parts/ai-parts-duplicates.spec.ts:377-469` — Two tests to be removed.

### Playwright Verification Commands

Before delivery, run:
```bash
pnpm playwright test tests/e2e/parts/ai-parts-duplicates.spec.ts
```

All remaining tests must pass. Removed tests must not appear in output.

## 14) Implementation Slices

This is a small to medium feature; implement in a single slice to maintain consistency.

### Slice: Complete AI Duplicate UI Fixes

- **Goal**: Deliver all UI improvements and test cleanup in one cohesive change
- **Touches**:
  1. Extend LinkChip component (add info icon props)
  2. Create AIPartLinkChip domain wrapper
  3. Create duplicate sorting utility
  4. Redesign AIPartDuplicateBar (use chips, update styles)
  5. Update AIPartDuplicatesOnlyStep (card width, padding, cancel button)
  6. Update AIPartDuplicateCard (max-width constraint)
  7. Add cancel buttons to input and review steps
  8. Wire cancel buttons to dialog close handler
  9. Remove two tests from ai-parts-duplicates.spec.ts
  10. Run Playwright tests and verify all pass
- **Dependencies**: No external dependencies. No feature flags needed. No backend changes.

## 15) Risks & Open Questions

### Risk: LinkChip extension breaks existing usage

- **Impact**: Kit and shopping list chips fail to render or lose functionality
- **Mitigation**: Make all new LinkChip props optional with default undefined. Test kit and shopping list features after changes. Add conditional rendering for info icon (only render if props provided).

### Risk: Tooltip with card content causes layout jank

- **Impact**: Tooltip repositions or flickers when opening over chip
- **Mitigation**: Use fixed card dimensions (max-w-[180px], defined height). Tooltip placement="auto" will choose stable position. Test with multiple viewport sizes.

### Risk: 180px card width too narrow for content

- **Impact**: Card content truncates excessively or looks cramped
- **Mitigation**: Follow existing location-container pattern which uses 180px successfully. Card content already uses line-clamp-2 for description. Test with various part descriptions.

### Risk: Sorting by description requires all part details loaded

- **Impact**: Initial render shows unsorted or partially sorted duplicates
- **Mitigation**: Implement two-phase sort: (1) by partKey initially, (2) re-sort when part details load. Use query state to trigger re-render. Acceptable for details to load progressively.

### Risk: Cancel button in review step conflicts with "Go Back"

- **Impact**: Users confused by two exit options
- **Mitigation**: Position Cancel on far right, Go Back on left. Different button styles (Go Back = outline, Cancel = outline but different label). Cancel closes entirely, Go Back navigates to input step. Clear UX distinction.

### Open Question: Should sorting prefer description or manufacturer_code?

- **Why it matters**: Some parts have generic descriptions but distinct codes, or vice versa
- **Owner / follow-up**: Implement alphabetical sort by description first (matches change brief). If feedback suggests manufacturer_code is better, easy to swap in utility function.
- **Decision**: Use description for alphabetical sorting within confidence groups.

### Open Question: Should hover card show on chip hover or only info icon hover?

- **Why it matters**: Affects discoverability and hover behavior
- **Owner / follow-up**: Change brief says "on hover over a part chip", implying entire chip. However, LinkChip already navigates on click, so showing card on chip hover may interfere.
- **Decision**: Show tooltip on info icon hover only (explicit interaction pattern). Chip click navigates, info icon hover shows details.

### Open Question: What if duplicate has no cover image?

- **Why it matters**: Tooltip card may look empty or unbalanced
- **Owner / follow-up**: AIPartDuplicateCard already handles missing cover via CoverImageDisplay with showPlaceholder={true}. No special handling needed.
- **Decision**: Use existing placeholder pattern in card component.

## 16) Confidence

**Confidence: High** — All changes are UI-only modifications to existing components with well-defined patterns (LinkChip extension follows existing prop patterns, chip wrappers follow kit/shopping-list precedent, Tooltip component is production-ready, cancel buttons match progress step pattern). No new API integrations, no complex state management, no cross-feature dependencies. Test removal is surgical (two specific tests). Main risk is UI polish (spacing, colors, sizing) which is easily adjustable post-implementation.
