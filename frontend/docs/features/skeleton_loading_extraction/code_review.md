# Code Review — Skeleton Loading Component Extraction

## 1) Summary & Decision

**Readiness**

The skeleton loading component extraction is well-executed and meets the core requirements of the plan. The new `skeleton.tsx` primitive component provides a clean, type-safe API with proper edge-case handling and thorough documentation. All 21 identified component files have been successfully refactored to use the new skeleton primitives, replacing inline implementations with consistent, reusable patterns. The implementation preserves all existing `data-testid` attributes without introducing wrapper divs, ensuring Playwright test compatibility. Type safety is maintained throughout with explicit TypeScript interfaces and proper prop validation. The code demonstrates good attention to detail with edge-case handling (negative numbers, empty strings, count <= 0) and comprehensive inline documentation.

However, there is one critical deviation from the plan: domain-specific skeleton wrapper functions were not removed as specified. Six skeleton functions (`LowStockSkeleton`, `CategoryDistributionSkeleton`, `DocumentationSkeleton`, `ActivityTimelineSkeleton`, `StorageGridSkeleton`, `MetricsCardsSkeleton`) remain in the dashboard components, and `MetricsCardsSkeleton` is still exported. The plan explicitly required "REMOVE className props from any domain-specific skeleton wrappers completely (not deprecate, REMOVE)" and stated "Make breaking changes—do not attempt backward compatibility." While these functions now internally use the new skeleton primitives (reducing code duplication), their continued existence creates an inconsistent API surface and partial migration state.

**Decision**

`GO-WITH-CONDITIONS` — The implementation successfully delivers the core skeleton primitive component with excellent quality and proper edge-case handling. All component files have been refactored correctly, and test preservation appears sound based on the 176/177 passing Playwright tests. However, the deviation from the plan's explicit requirement to remove all domain-specific skeleton wrappers must be addressed before final acceptance. The condition for GO: remove the six remaining skeleton wrapper functions and update their call sites to compose skeleton primitives directly inline, as demonstrated in parts/list components.

## 2) Conformance to Plan (with evidence)

**Plan alignment**

- Plan Section 3 "Component Props Contracts" ↔ `src/components/ui/skeleton.tsx:32-44` — Skeleton and SkeletonGroup interfaces match specification exactly, including `variant`, `width`, `height`, `testId` props with correct types (`string | number` for dimensions)

- Plan Section 3 "Component Defaults" ↔ `src/components/ui/skeleton.tsx:49-63` — Variant defaults implemented as specified with correct Tailwind classes (`text: { width: 'w-full', height: 'h-4', rounded: 'rounded' }`, `circular: { width: 'w-8', height: 'h-8', rounded: 'rounded-full' }`, etc.)

- Plan Section 3 "Width/Height Prop Mapping" ↔ `src/components/ui/skeleton.tsx:75-106` — `parseSizeProps` function correctly handles all specified cases: strings starting with 'w-'/'h-' as Tailwind classes, strings ending with '%'/'px' as inline styles, numbers as pixel values, with proper edge-case handling (negative numbers, empty strings)

- Plan Section 3 "testId Conventions" ↔ `src/components/ui/skeleton.tsx:147` and `177` — testId applied directly to outermost div element without wrapper containers, preserving existing test selector patterns

- Plan Section 8 "Edge Cases" ↔ `src/components/ui/skeleton.tsx:83,91,165` — Edge cases handled as specified: negative numbers return empty object (line 83), empty strings return empty object (line 91), count <= 0 renders null (line 165)

- Plan Section 2 "Affected Areas" — All 21 identified component files modified to use new skeleton primitives (dashboard: 7 files, parts: 2 files, boxes: 2 files, kits: 3 files, shopping-lists: 2 files, sellers: 1 file, types: 1 file, pick-lists: 1 file, documents: 1 file, parts-list: 1 file)

**Gaps / deviations**

- Plan Section 1 "In scope" requirement: "Remove all domain-specific skeleton wrapper functions completely" — **NOT FULFILLED**. Six skeleton functions remain in dashboard components:
  - `src/components/dashboard/low-stock-alerts.tsx:199-223` — `LowStockSkeleton()` function still exists
  - `src/components/dashboard/category-distribution.tsx:108-145` — `CategoryDistributionSkeleton()` function still exists
  - `src/components/dashboard/documentation-status.tsx:144-175` — `DocumentationSkeleton()` function still exists
  - `src/components/dashboard/recent-activity-timeline.tsx:148-175` — `ActivityTimelineSkeleton()` function still exists
  - `src/components/dashboard/storage-utilization-grid.tsx:105-129` — `StorageGridSkeleton()` function still exists
  - `src/components/dashboard/enhanced-metrics-cards.tsx:190-212` — `MetricsCardsSkeleton()` function still exists **AND IS EXPORTED**

- Plan Section 1 "Out of scope" — Progress bar's `animate-pulse` usage correctly left untouched (`src/components/ui/progress-bar.tsx:56`), as it's an indeterminate progress indicator, not a skeleton loading state

- Plan Section 3 "SkeletonGroup" — Component is implemented but **never used** in any refactored file. All components manually implement `Array.from({ length: N }).map()` patterns instead of leveraging SkeletonGroup for repetition

- Plan Section 13 "Deterministic Test Plan" — Plan specified updating Playwright tests, but based on the 176/177 passing test result, existing tests continue to pass without modification (which is correct since testId attributes were preserved)

## 3) Correctness — Findings (ranked)

- Title: `Major — Domain-specific skeleton wrapper functions not removed as specified`
- Evidence: `src/components/dashboard/enhanced-metrics-cards.tsx:190` — `export function MetricsCardsSkeleton()` and 5 other skeleton functions remain in dashboard components
- Impact: Creates inconsistent API surface where some components use inline skeleton primitives (parts/list, boxes/list, types/list) while dashboard components preserve wrapper functions. External consumers may still import and use `MetricsCardsSkeleton`, preventing full migration to primitive composition. Violates explicit plan requirement: "REMOVE className props from any domain-specific skeleton wrappers completely (not deprecate, REMOVE)" and "Make breaking changes—do not attempt backward compatibility."
- Fix: Remove all six skeleton wrapper functions from dashboard components. Update their call sites to compose `<Skeleton>` primitives directly inline, following the pattern used in `src/components/parts/part-list.tsx:232-237` and `src/components/boxes/box-list.tsx:197-199`. Remove export statement for `MetricsCardsSkeleton`.
- Confidence: High

- Title: `Minor — SkeletonGroup component implemented but unused`
- Evidence: `src/components/ui/skeleton.tsx:158-181` — SkeletonGroup component fully implemented with count, spacing, children props, but `git diff` shows zero usages across all 21 refactored files
- Impact: Dead code that increases maintenance surface without providing value. All components manually implement `Array.from({ length: N }).map()` patterns instead of using SkeletonGroup. Future maintainers may be confused about whether to use SkeletonGroup or manual array mapping.
- Fix: Either (1) adopt SkeletonGroup in components with repetitive skeleton patterns (e.g., `src/components/dashboard/enhanced-metrics-cards.tsx:196-209` could use `<SkeletonGroup count={4}>` with custom children), or (2) remove SkeletonGroup from `skeleton.tsx` until a genuine use case emerges (YAGNI principle). Option 2 is safer given that all components successfully use manual repetition.
- Confidence: High

- Title: `Minor — Inline skeleton on span element may cause layout issues`
- Evidence: `src/components/boxes/box-list.tsx:209` and `src/components/types/type-list.tsx:334` and `src/components/sellers/seller-list.tsx:291` — `<Skeleton width="w-32" height="h-5" />` used within `renderCounts()` function, which expects inline content for list screen counts display
- Impact: Skeleton component renders a `div` element (block display by default), but is used in a context that previously had `<span className="inline-flex ...">`. This may cause layout shifts or break inline alignment in the counts display. No test failures reported, but visual regression possible.
- Fix: Verify visual appearance of counts skeleton in list screens. If layout is broken, either (1) add an `inline` boolean prop to Skeleton that applies `inline-block` display, or (2) wrap Skeleton usage in the calling component: `<span className="inline-flex"><Skeleton width="w-32" height="h-5" /></span>`, or (3) use the original inline-flex div pattern for this specific case.
- Confidence: Medium (depends on whether tests verify visual layout or only DOM presence)

- Title: `Minor — cover-image-display.tsx retains inline skeleton instead of using primitive`
- Evidence: `src/components/documents/cover-image-display.tsx:43` — `<div className={cn('rounded-lg bg-muted animate-pulse', getSizeClasses(size), className)} />` still uses inline implementation
- Impact: One component remains inconsistent with the skeleton extraction goal. The cover image display has dynamic sizing (`size` prop) and accepts a `className` prop for customization, which doesn't map cleanly to the Skeleton component's encapsulated API (no className prop per plan). However, this inconsistency means future maintainers must remember two patterns.
- Fix: Either (1) refactor to use Skeleton primitive by passing size-derived width/height, accepting loss of className customization, or (2) document this as an intentional exception in a code comment explaining why inline skeleton is preferred here (dynamic sizing + className support).
- Confidence: Medium (may be acceptable exception given dynamic sizing requirements)

## 4) Over-Engineering & Refactoring Opportunities

- Hotspot: `parseSizeProps` function complexity vs. actual usage patterns
- Evidence: `src/components/ui/skeleton.tsx:75-106` — 32 lines of code handling multiple string formats (Tailwind classes, CSS units with regex, fallback), but inspection of all 21 refactored files shows only Tailwind utility classes are used (e.g., `width="w-32"`, `height="h-8"`, `width="flex-1"`)
- Suggested refactor: Simplify `parseSizeProps` to only handle Tailwind classes and numbers, removing the CSS unit regex pattern (`/^\d+(\.\d+)?(px|%|rem|em|vh|vw)$/`) unless there's evidence it's needed. Simpler version:
  ```typescript
  function parseSizeProps(prop: string | number | undefined, axis: 'width' | 'height') {
    if (prop === undefined) return {};
    if (typeof prop === 'number') {
      if (prop < 0) return {};
      return { style: { [axis]: `${prop}px` } };
    }
    const trimmed = prop.trim();
    if (trimmed === '') return {};
    return { className: trimmed }; // All strings as Tailwind classes
  }
  ```
- Payoff: Reduces cognitive load, removes untested code path (CSS unit regex), and maintains all current functionality since no components use CSS unit strings. If CSS units are needed later, re-add with actual usage examples and tests.

- Hotspot: Repetitive skeleton wrapper functions in dashboard components
- Evidence: `src/components/dashboard/*.tsx` — Six skeleton functions (199-223 lines each) that are structurally similar: Card wrapper + array mapping + Skeleton primitives. Example pattern in `low-stock-alerts.tsx:199-223`, `category-distribution.tsx:108-145`, etc.
- Suggested refactor: Remove all six functions as specified in plan, moving skeleton JSX inline to their call sites. This eliminates an abstraction layer that no longer provides value since the Skeleton primitive handles composition. If common patterns emerge across multiple dashboard components, extract a higher-level `DashboardCardSkeleton` component that accepts layout configuration, but only after seeing 3+ identical patterns.
- Payoff: Eliminates 6 functions (~150 lines total), improves consistency with parts/boxes/kits components that use inline composition, and removes the exported `MetricsCardsSkeleton` API that conflicts with the primitive-based approach.

## 5) Style & Consistency

- Pattern: Inconsistent skeleton implementation strategy across domains
- Evidence: Dashboard components (`src/components/dashboard/*.tsx`) retain dedicated skeleton functions, while parts/boxes/types/sellers components (`src/components/parts/part-list.tsx:232-237`, `src/components/boxes/box-list.tsx:197-199`) use inline Skeleton primitive composition directly
- Impact: Future contributors will be unsure whether to create a skeleton function or compose primitives inline. Code review discussions may arise about which pattern to follow. Dashboard code appears less modernized than other domains.
- Recommendation: Standardize on inline composition as demonstrated in parts/list components. Remove dashboard skeleton functions to achieve consistency. Document in `skeleton.tsx` header comment that skeleton primitives should be composed inline at usage sites, not wrapped in domain-specific functions.

- Pattern: Mixed approaches to handling wrapper divs around skeletons
- Evidence: `src/components/parts/part-list.tsx:234-236` wraps Skeleton in `<div key={index} data-testid="..."><Skeleton height="h-48" /></div>`, while `src/components/boxes/box-list.tsx:198` applies testId directly to Skeleton: `<Skeleton key={index} height="h-48" />` (no wrapper). Dashboard components (`src/components/dashboard/low-stock-alerts.tsx:204`) use wrapper divs with testId on wrapper.
- Impact: Test selector strategy is inconsistent. Some tests must select wrapper div with testId, others select Skeleton element directly. No functional breakage since both work, but makes test authoring less predictable.
- Recommendation: Establish convention: apply testId to Skeleton primitive when it's the only child (simplest case), apply testId to wrapper div when additional structure is needed (e.g., borders, padding, multiple skeletons in a card). Document convention in Playwright developer guide's selector section.

## 6) Tests & Deterministic Coverage (new/changed behavior only)

- Surface: Dashboard skeleton loading states (7 components)
- Scenarios:
  - Given dashboard loads with slow API, When page renders, Then skeletons display with correct testId attributes (`tests/e2e/dashboard/*.spec.ts` — assuming coverage exists based on instrumentation)
  - Given skeletons visible, When API completes, Then skeletons disappear and content renders
- Hooks: Existing `data-testid` attributes preserved on outermost elements: `dashboard.low-stock.skeleton`, `dashboard.low-stock.skeleton.card`, `dashboard.metrics.skeleton`, `dashboard.metrics.skeleton.card`, etc.
- Gaps: None identified. User reported 176/177 tests passing, with 1 flaky test unrelated to changes. All existing testId attributes preserved without introducing wrapper divs (verified in diff).
- Evidence: `src/components/dashboard/low-stock-alerts.tsx:201,203` — testId preserved on wrapper div; `src/components/dashboard/enhanced-metrics-cards.tsx:194,197` — testId on container and cards

- Surface: Parts detail and location grid skeleton states
- Scenarios:
  - Given part detail loads, When fetching part data, Then card skeleton displays with grid layout (`src/components/parts/part-details.tsx:424-437`)
  - Given location grid loads, When fetching locations, Then header and row skeletons display (`src/components/parts/part-location-grid.tsx:39-58`)
- Hooks: Skeletons render without explicit testId attributes (acceptable since parent container has testId for loading state detection)
- Gaps: None. Implementation preserves existing structure without introducing new test dependencies.
- Evidence: Diff shows only Skeleton primitive substitution, no structural changes to testable elements

- Surface: List component skeletons (parts-list, type-list, seller-list, box-list, kits, shopping-lists)
- Scenarios:
  - Given list page loads, When data is fetching, Then skeleton cards/rows display in grid layout
  - Given skeleton displays, When data arrives, Then list content replaces skeletons
- Hooks: `data-testid="parts.list.loading"`, `data-testid="parts.list.loading.skeleton"`, `data-testid="types.list.loading.skeleton"`, etc. preserved
- Gaps: None. All existing testId attributes migrated from inline div to Skeleton `testId` prop.
- Evidence: `src/components/parts/part-list.tsx:232-237`, `src/components/types/type-list.tsx:317-322`, `src/components/sellers/seller-list.tsx:280`

## 7) Adversarial Sweep (must attempt ≥3 credible failures or justify none)

- **Attack 1: Negative width/height causes invalid CSS**
  - Attempt: Pass `width={-10}` or `height={-5}` to Skeleton component
  - Evidence: `src/components/ui/skeleton.tsx:83` — `if (prop < 0) return {};` guard prevents negative numbers from being applied
  - Result: Code correctly returns empty object, falling back to variant defaults. No invalid CSS generated. **Attack fails (code holds up).**

- **Attack 2: Empty string width/height breaks className**
  - Attempt: Pass `width=""` or `height=""` to Skeleton component
  - Evidence: `src/components/ui/skeleton.tsx:91` — `if (trimmed === '') return {};` guard prevents empty strings
  - Result: Empty strings ignored, variant defaults applied. className remains valid. **Attack fails (code holds up).**

- **Attack 3: Invalid Tailwind class causes layout breakage**
  - Attempt: Pass `width="invalid-class"` to Skeleton, expecting Tailwind to ignore unknown class, causing skeleton to collapse
  - Evidence: `src/components/ui/skeleton.tsx:105` — Fallback case `return { className: trimmed };` applies any string as className
  - Result: Invalid Tailwind class is applied to div, but browser ignores it. Skeleton falls back to `w-full` or `h-4` from variant defaults only if width/height is `undefined`. If invalid string is passed, defaults are NOT applied (lines 131-132 use `||` operator with truthiness check, and `parseSizeProps` returns `{ className: 'invalid-class' }`, which is truthy). **Attack succeeds — potential layout breakage if invalid class is passed.**
  - Mitigation: Lines 131-132 logic is subtle. When `parseSizeProps` returns `{ className: 'invalid-class' }`, the condition `widthParsed.className || (width === undefined ? defaults.width : undefined)` evaluates to `'invalid-class'`, so defaults are NOT applied. If 'invalid-class' is not a valid Tailwind utility, the skeleton will have no effective width, potentially collapsing. However, TypeScript prevents accidental invalid strings (developers must explicitly pass strings). In practice, this is low risk since all usage sites use valid Tailwind classes. Mark as **Minor** issue, not **Major**, since it requires intentional misuse and TypeScript provides soft guardrails.

- **Attack 4: count={0} in SkeletonGroup renders empty container div in DOM**
  - Attempt: Pass `count={0}` to SkeletonGroup, expecting unnecessary empty div to remain in DOM
  - Evidence: `src/components/ui/skeleton.tsx:165` — `if (count <= 0 && !children) return null;`
  - Result: SkeletonGroup correctly returns null, preventing empty div. **Attack fails (code holds up).**

- **Attack 5: flex-1 width causes className collision**
  - Attempt: Pass `width="flex-1"` to Skeleton, expecting it to conflict with default `w-full` from variant defaults
  - Evidence: `src/components/dashboard/low-stock-alerts.tsx:214-215` — `<Skeleton width="flex-1" height="h-8" />` is actually used in production code. `parseSizeProps('flex-1', 'width')` returns `{ className: 'flex-1' }`. Lines 131-132: `widthParsed.className || (width === undefined ? defaults.width : undefined)` evaluates to `'flex-1'`, so default `w-full` is NOT applied.
  - Result: Skeleton applies only `flex-1` class, no collision. However, the logic is subtle and could confuse future maintainers. **Attack fails functionally (code works correctly), but highlights complexity.**

**Adversarial proof**

- Checks attempted: Negative numbers, empty strings, invalid classes, zero count, className collision with flex utilities
- Evidence: `src/components/ui/skeleton.tsx:83,91,105,131-132,165` — guards and fallback logic cover edge cases
- Why code held up: Explicit edge-case handling in `parseSizeProps` (negative, empty string) and SkeletonGroup (count <= 0). The width/height fallback logic (`||` operator) correctly prioritizes parsed values over defaults. TypeScript type system prevents most misuse (e.g., passing boolean or null). Only one attack (invalid Tailwind class) can cause minor layout issues, but requires intentional misuse in TypeScript code.

## 8) Invariants Checklist (table)

- Invariant: Skeleton component must never introduce wrapper divs that break existing test selectors
  - Where enforced: `src/components/ui/skeleton.tsx:143-149` — Skeleton renders a single `<div>` with testId applied directly to it, no nested structure
  - Failure mode: If Skeleton wrapped output in additional div (e.g., `<div><div data-testid={testId} /></div>`), Playwright selectors expecting `data-testid` on outermost element would fail
  - Protection: Component implementation is minimal (single div return), and 176/177 passing Playwright tests verify selectors remain intact
  - Evidence: `git diff` shows testId migration from inline divs to Skeleton `testId` prop (e.g., `src/components/types/type-list.tsx:319-320`)

- Invariant: All skeleton loading states must use consistent Tailwind tokens (`bg-muted`, `animate-pulse`)
  - Where enforced: `src/components/ui/skeleton.tsx:128-129` — Skeleton component hardcodes `bg-muted` and `animate-pulse` classes; no props allow overriding
  - Failure mode: If components bypass Skeleton primitive and use inline divs with different background colors (e.g., `bg-gray-300`), visual consistency breaks
  - Protection: Plan explicitly prohibits `className` prop (`skeleton.tsx:5` header comment: "NO className prop - all styling is encapsulated"), forcing all skeletons through the primitive
  - Evidence: One exception found: `src/components/documents/cover-image-display.tsx:43` retains inline `bg-muted animate-pulse` div due to dynamic sizing requirements

- Invariant: Skeleton dimensions must default to variant-specific values when width/height props are omitted
  - Where enforced: `src/components/ui/skeleton.tsx:120,131-132` — Defaults pulled from `VARIANT_DEFAULTS` map and applied via `||` fallback operator when `width === undefined`
  - Failure mode: If `parseSizeProps` returned an empty object for undefined props but fallback logic failed, skeleton would render with no dimensions, collapsing to zero height
  - Protection: Lines 131-132 explicitly check `width === undefined` to apply defaults; `parseSizeProps(undefined)` correctly returns `{}` (line 79), triggering fallback
  - Evidence: Multiple usages omit width or height (e.g., `src/components/parts/part-details.tsx:428` — `<Skeleton width="w-1/3" height="h-6" />` specifies both; `src/components/parts/part-details.tsx:430` — `<Skeleton height="h-4" />` omits width, defaults to `w-full`)

## 9) Questions / Needs-Info

- Question: Why were domain-specific skeleton wrapper functions retained in dashboard components despite plan requirement to remove them?
- Why it matters: The plan explicitly stated "REMOVE className props from any domain-specific skeleton wrappers completely (not deprecate, REMOVE)" and "Make breaking changes—do not attempt backward compatibility." Retaining these functions creates inconsistent API surface and violates plan commitments. Understanding the rationale (e.g., concern about breaking consuming code, time constraints, intentional decision to preserve abstractions) is necessary to determine whether this is a deferred breaking change or a misunderstanding of requirements.
- Desired answer: Clarification from implementer on whether wrapper retention was intentional (and if so, why) or an oversight. If intentional, update plan to document new decision. If oversight, confirm commitment to remove wrappers in follow-up change.

- Question: Is SkeletonGroup intended for future use, or should it be removed now?
- Why it matters: Zero usages of SkeletonGroup across all 21 refactored files suggests it's unused dead code. However, it's fully implemented with tests passing (implied by full suite passing), suggesting intentional inclusion. Clarifying whether this is premature optimization (YAGNI violation) or planned for future dashboard refactoring will guide whether to remove it or document its intended use cases.
- Desired answer: Confirmation of whether SkeletonGroup should be removed as unused, or documentation of planned future usage (with examples of components that should adopt it).

- Question: Was visual regression testing performed on skeleton loading states?
- Why it matters: The plan states "Accept minor visual differences as acceptable losses for consistency." However, some changes (e.g., `src/components/boxes/box-list.tsx:209` using Skeleton in `renderCounts` which may affect inline layout) could cause unexpected layout shifts. Knowing whether visual testing was done helps assess risk of unnoticed regressions in production.
- Desired answer: Confirmation that visual appearance of skeleton states was manually verified in at least dashboard, parts detail, and list screens. If not, recommend spot-checking these surfaces before final acceptance.

## 10) Risks & Mitigations (top 3)

- Risk: Exported `MetricsCardsSkeleton` function allows external consumers to bypass skeleton primitive API
- Mitigation: Remove export statement for `MetricsCardsSkeleton` (`src/components/dashboard/enhanced-metrics-cards.tsx:190`). Search codebase for any imports of this function and refactor to compose primitives inline. If no external consumers exist, removal is safe. If consumers found, communicate breaking change and provide migration guide (replace function call with inline Skeleton composition).
- Evidence: `src/components/dashboard/enhanced-metrics-cards.tsx:190` — `export function MetricsCardsSkeleton()` violates plan requirement

- Risk: SkeletonGroup as unused dead code increases maintenance surface and confuses contributors
- Mitigation: Either (1) remove SkeletonGroup from `skeleton.tsx` until a genuine use case emerges, or (2) refactor at least one dashboard component (e.g., `enhanced-metrics-cards.tsx:196-209`) to use SkeletonGroup, demonstrating its value. Document in component header comment when to use SkeletonGroup vs. manual array mapping. Given zero adoption across 21 files, option 1 (removal) is safer.
- Evidence: `src/components/ui/skeleton.tsx:158-181` — SkeletonGroup implemented but unused

- Risk: Minor layout regression in list screen counts display due to div vs. span rendering
- Mitigation: Manually verify visual appearance of skeleton in counts area on parts list, types list, sellers list, and boxes list pages (routes `/parts`, `/types`, `/sellers`, `/boxes`). If layout is broken, apply one of the fixes from Finding #3: add `inline` prop to Skeleton, wrap Skeleton in `<span className="inline-flex">`, or revert to inline div for this specific case. If layout is correct, no action needed.
- Evidence: `src/components/boxes/box-list.tsx:209`, `src/components/types/type-list.tsx:334`, `src/components/sellers/seller-list.tsx:291` — Skeleton used where `<span className="inline-flex">` previously existed

## 11) Confidence

Confidence: High — The skeleton primitive component is well-designed with proper TypeScript types, comprehensive edge-case handling, and excellent documentation. All 21 component files were successfully refactored with correct testId preservation, as evidenced by 176/177 passing Playwright tests. The code demonstrates attention to detail and follows React best practices. However, confidence is reduced from Very High to High due to the deviation from the plan's explicit requirement to remove domain-specific skeleton wrappers, which creates an inconsistent API surface and potential confusion for future contributors. Once the six dashboard skeleton functions are removed and SkeletonGroup's status is clarified (remove or document usage), confidence would increase to Very High.
