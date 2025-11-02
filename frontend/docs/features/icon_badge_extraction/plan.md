# Icon Badge Component Extraction — Technical Plan

## 0) Research Log & Findings

### Discovery Work

Conducted comprehensive search across the codebase for circular badge patterns using multiple strategies:
- Searched for `rounded-full.*flex.*items-center.*justify-center` pattern (found 5 files)
- Searched for specific size patterns: `w-8 h-8 rounded-full`, `w-10 h-10 rounded-full`, `w-12 h-12 rounded-full`
- Manually inspected all identified files to understand pattern variations
- Reviewed existing UI badge components for pattern consistency
- Checked Playwright tests for selectors that target these badges

### Pattern Variations Identified

The circular icon badge pattern appears with several structural variations:

**Variant 1: Location number indicators** (location-item.tsx)
- Container: `w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium`
- Content: Location number (text)
- Colors: Conditional based on occupancy status
  - Occupied: `bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300`
  - Empty: `bg-muted text-muted-foreground`
- Purpose: Display location numbers in box location list

**Variant 2: Activity timeline icons** (recent-activity-timeline.tsx)
- Container: `w-8 h-8 rounded-full flex items-center justify-center text-sm border`
- Content: Emoji icons (➕, ➖, 🔄)
- Colors: Dynamic based on activity type
  - Addition: `text-green-600 bg-green-50 border-green-200`
  - Removal: `text-amber-600 bg-amber-50 border-amber-200`
  - Move: `text-blue-600 bg-blue-50 border-blue-200`
- Purpose: Display activity type indicators in recent activity timeline

**Variant 3: Documentation milestone badges** (documentation-status.tsx)
- Container: `w-8 h-8 rounded-full text-xs font-bold transition-all duration-300`
- Content: Percentage numbers (50%, 75%, 90%, 100%)
- Colors: Dynamic based on achievement status
  - Achieved: `bg-green-500 text-white shadow-md`
  - Next milestone: `bg-primary/20 text-primary border-2 border-primary animate-pulse`
  - Future: `bg-muted text-muted-foreground`
- Additional feature: Checkmark overlay for achieved milestones
- Purpose: Display documentation progress milestones

**Variant 4: Quick start step numbers** (about.tsx)
- Container: `w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-semibold`
- Content: Step numbers (1, 2, 3, 4)
- Colors: Primary theme colors
- Purpose: Display step numbers in quick start guide

**Variant 5: AI progress error icon** (ai-part-progress-step.tsx)
- Container: `w-16 h-16 mx-auto bg-destructive/10 rounded-full flex items-center justify-center`
- Content: Lucide icon component (X icon)
- Colors: Destructive theme colors
- Size: Larger variant (w-16 h-16)
- Purpose: Display error state in AI analysis workflow

**Variant 6: AI progress loading icon** (ai-part-progress-step.tsx)
- Container: `w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center`
- Content: Lucide icon component (Loader2 with animate-spin)
- Colors: Primary theme colors with low opacity background
- Size: Larger variant (w-16 h-16)
- Purpose: Display loading state in AI analysis workflow

**Variant 7: Media viewer action buttons** (media-viewer-base.tsx, hover-actions.tsx)
- Container: `w-8 h-8` or `w-10 h-10 rounded-full flex items-center justify-center`
- Content: SVG icons inline
- Colors: `bg-background/90 hover:bg-background` or `bg-red-500/90 hover:bg-red-500` (destructive)
- Additional features: `backdrop-blur-sm`, click handlers, tooltips
- Purpose: Action buttons in media viewer and hover overlays

**Variant 8: Documentation error icon** (media-viewer-base.tsx)
- Container: `w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center`
- Content: SVG icon inline
- Colors: Destructive theme with opacity
- Size: Larger variant (w-16 h-16)
- Purpose: Display error state when image fails to load

### Affected Files Summary

1. `/work/frontend/src/components/boxes/location-item.tsx` - Lines 23-29 (location number badge)
2. `/work/frontend/src/components/dashboard/recent-activity-timeline.tsx` - Lines 72-77 (activity icon badge)
3. `/work/frontend/src/components/dashboard/documentation-status.tsx` - Lines 69-79 (milestone badge with overlay)
4. `/work/frontend/src/routes/about.tsx` - Line 117 (step number badge)
5. `/work/frontend/src/components/parts/ai-part-progress-step.tsx` - Lines 34, 74 (error and loading badges)
6. `/work/frontend/src/components/documents/media-viewer-base.tsx` - Lines 264 (error icon badge)
7. `/work/frontend/src/components/documents/camera-capture.tsx` - Line 140 (camera error badge)
8. `/work/frontend/src/components/ui/hover-actions.tsx` - Lines 38-40, 54-57 (action button badges)

### Architecture Context

- UI components live in `src/components/ui/`
- Existing badge components: `badge.tsx` (text badges), `status-badge.tsx` (entity status), `information-badge.tsx` (metadata/tags)
- IconBadge is distinct from existing badge components: circular shape, icon/text content, status indicators
- Components export from `src/components/ui/index.ts`
- Tailwind CSS used for styling
- Most UI components accept className prop merged via cn() utility (Badge, Button, Card) for layout flexibility
- Exception: InformationBadge and StatusBadge exclude className with documented rationale (enforce strict styling)
- Test instrumentation via `data-testid` props throughout

### Testing Infrastructure

- Playwright tests rely on `data-testid` attributes for selectors
- Test files reference activity badges: `dashboard.activity.item.icon`, `dashboard.activity.item.badge`
- Test files reference milestone badges: `dashboard.documentation.milestone`
- Instrumentation helpers in `src/lib/test/`
- Empty state tests exist but don't specifically target icon badges

### Key Decision: className Prop Exclusion

Following the pattern of StatusBadge and InformationBadge, IconBadge will **NOT** expose className prop. Rationale:
- Icon badges serve a specific visual role: circular status indicators with semantic color schemes
- Allowing className would enable CSS soup at call sites, defeating the purpose of centralization
- Size, color, and content are controlled through semantic props (size, variant, children)
- Layout adjustments (margin, positioning) should be handled by parent containers, not the badge itself
- This aligns with the documented pattern for semantic UI components that enforce strict visual consistency

---

## 1) Intent & Scope

**User intent**

Extract repeated circular badge pattern used for icons, status indicators, and activity markers into a reusable `IconBadge` component in `src/components/ui/`, eliminating CSS class soup by centralizing all styling in the component. This is technical debt elimination work following the UI Component Refactoring Workflow.

**Prompt quotes**

"Circular badges with icons, colors, and hover states used for status indicators and activity markers throughout the app."

"Extract IconBadge (circular badge with icons/status indicators) into a reusable UI component in src/components/ui/"

"NO className (must NOT expose className prop)"

"REMOVE all className props from the new component interface (not deprecate, REMOVE)"

"Accept minor visual differences as acceptable losses for consistency"

"Make breaking changes - do not attempt backward compatibility"

**In scope**

- Create new `IconBadge` component in `src/components/ui/icon-badge.tsx`
- Support size variants: `sm` (w-8 h-8), `md` (w-10 h-10), `lg` (w-12 h-12), `xl` (w-16 h-16)
- Support color variants: semantic schemes for status/activity (success, error, warning, info, neutral, primary, destructive)
- Accept content as `children` prop (text, emoji, or React node including Lucide icons)
- Optional animation prop for milestone-style pulsing effects
- Optional border prop for activity timeline style
- Generate `data-testid` automatically from required `testId` prop
- Refactor all 7 identified usage sites to use the new component
- REMOVE className prop entirely from component interface (TypeScript will enforce)
- Accept visual changes as standardization benefits (no backward compatibility)
- Update Playwright tests where selectors reference badge markup
- Export component from `src/components/ui/index.ts`

**Out of scope**

- Backward compatibility layers or deprecation warnings
- className prop support (explicitly excluded)
- Custom size values beyond predefined variants
- Gradient backgrounds (solid colors only)
- Image content (icons and text only)
- Interactive badge behaviors beyond onClick handlers (handled by parent components)
- Badge groups or badge composition patterns
- Overlay elements (checkmark overlay for milestones will be handled separately)

**Assumptions / constraints**

- All icon badges currently use `data-testid` attributes that tests depend on
- Minor visual regressions (exact padding/spacing differences) are acceptable for consistency
- Size standardization may cause slight size adjustments at some usage sites
- TypeScript strict mode will catch all call sites that break from removed className prop
- Hover states and transitions can be encapsulated in variant styling
- Parent components handle conditional rendering (empty states, loading states, achievement status)
- Semantic color variants can cover all existing color schemes
- The refactoring touches 7+ files but is a pure UI change with no business logic impact

---

## 2) Affected Areas & File Map

### New Component

- **Area**: `src/components/ui/icon-badge.tsx`
- **Why**: New reusable component encapsulating all circular icon badge patterns
- **Evidence**: Does not exist; will be created following StatusBadge and InformationBadge patterns

- **Area**: `src/components/ui/index.ts`
- **Why**: Export the new IconBadge component
- **Evidence**: Existing pattern exports all UI components from this barrel file

### Components to Refactor (7 files)

- **Area**: `src/components/boxes/location-item.tsx`
- **Why**: Contains location number badge with conditional occupancy styling (lines 23-29)
- **Evidence**:
  ```tsx
  // Line 23-29: Location number badge
  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
    location.isOccupied
      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300'
      : 'bg-muted text-muted-foreground'
  }`}>
    {location.locNo}
  </div>
  ```

- **Area**: `src/components/dashboard/recent-activity-timeline.tsx`
- **Why**: Contains activity icon badges with dynamic colors and border (lines 72-77)
- **Evidence**:
  ```tsx
  // Line 72-77: Activity icon badge
  <div
    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm border ${getActivityColor()}`}
    data-testid="dashboard.activity.item.icon"
  >
    {getActivityIcon()}
  </div>

  // Helper function returns dynamic classes:
  // Addition: 'text-green-600 bg-green-50 border-green-200'
  // Removal: 'text-amber-600 bg-amber-50 border-amber-200'
  // Move: 'text-blue-600 bg-blue-50 border-blue-200'
  ```

- **Area**: `src/components/dashboard/documentation-status.tsx`
- **Why**: Contains milestone badges with achievement states and checkmark overlay (lines 69-79)
- **Evidence**:
  ```tsx
  // Line 69-79: Milestone badge with complex styling
  <div className={`
    relative inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold
    transition-all duration-300
    ${achieved
      ? 'bg-green-500 text-white shadow-md'
      : isNext
      ? 'bg-primary/20 text-primary border-2 border-primary animate-pulse'
      : 'bg-muted text-muted-foreground'
    }
  `} data-testid="dashboard.documentation.milestone" data-milestone={milestone} data-achieved={achieved}>
    {milestone}%
    {achieved && (
      <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-600 rounded-full flex items-center justify-center">
        <span className="text-white text-xs">✓</span>
      </div>
    )}
  </div>
  ```

- **Area**: `src/routes/about.tsx`
- **Why**: Contains step number badges with primary theme (line 117)
- **Evidence**:
  ```tsx
  // Line 117: Step number badge
  <div className="flex-shrink-0 w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-semibold">
    {step.step}
  </div>
  ```

- **Area**: `src/components/parts/ai-part-progress-step.tsx`
- **Why**: Contains error (line 34) and loading (line 74) icon badges with larger size
- **Evidence**:
  ```tsx
  // Line 34: Error icon badge (xl size)
  <div className="w-16 h-16 mx-auto bg-destructive/10 rounded-full flex items-center justify-center">
    <X className="h-8 w-8 text-destructive" />
  </div>

  // Line 74: Loading icon badge (xl size)
  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
    <Loader2 className="h-8 w-8 text-primary animate-spin" />
  </div>
  ```

- **Area**: `src/components/documents/media-viewer-base.tsx`
- **Why**: Contains error icon badge for image loading failure (line 264)
- **Evidence**:
  ```tsx
  // Line 264: Error icon badge
  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10"/>
      <line x1="15" y1="9" x2="9" y2="15"/>
      <line x1="9" y1="9" x2="15" y2="15"/>
    </svg>
  </div>
  ```

- **Area**: `src/components/documents/camera-capture.tsx`
- **Why**: Contains camera error badge with xl size and inline SVG (line 140)
- **Evidence**:
  ```tsx
  // Line 140-146: Camera error badge
  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-500">
      <circle cx="12" cy="12" r="10"/>
      <line x1="15" y1="9" x2="9" y2="15"/>
      <line x1="9" y1="9" x2="15" y2="15"/>
    </svg>
  </div>
  ```

- **Area**: `src/components/ui/hover-actions.tsx`
- **Why**: Contains IconButton component (lines 22-66) implementing circular action buttons
- **Evidence**:
  ```tsx
  // Line 38-40: Size definitions
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10'
  };

  // Line 54-57: Badge rendering
  <button
    className={`
      ${sizeClasses[size]}
      ${variantClasses[variant]}
      rounded-full flex items-center justify-center
      transition-colors backdrop-blur-sm
    `}
  >
    {icon}
  </button>
  ```

### Test Files (Potentially Affected)

- **Area**: `tests/e2e/dashboard/recent-activity.spec.ts`
- **Why**: Tests reference activity icon badges via selectors
- **Evidence**: `dashboard.activity.item.icon` selector at line 58

- **Area**: `tests/e2e/dashboard/documentation-status.spec.ts`
- **Why**: Tests reference milestone badges via selectors
- **Evidence**: `dashboard.documentation.milestone` selector at line 47

- **Area**: `tests/e2e/boxes/boxes-detail.spec.ts`
- **Why**: Tests interact with location items that contain number badges
- **Evidence**: Tests location occupancy state which affects badge styling

---

## 3) Data Model / Contracts

### IconBadge Component Props

- **Entity**: IconBadge component props interface
- **Shape**:
  ```typescript
  interface IconBadgeProps {
    // Required
    children: React.ReactNode;         // Badge content (text, emoji, icon component)

    // Optional instrumentation
    testId?: string;                   // Optional test ID for the container; only required when badge is independently tested

    // Optional styling
    size?: 'sm' | 'md' | 'lg' | 'xl'; // Size variant (default: 'sm')
    variant?: 'success' | 'error' | 'warning' | 'info' | 'neutral' | 'primary' | 'destructive'; // Color scheme
    border?: boolean;                  // Add border (default: false)
    animated?: boolean;                // Apply pulse animation (default: false)

    // Optional interaction
    onClick?: () => void;              // Click handler for interactive badges

    // Explicitly NO className prop
  }
  ```
- **Mapping**: Direct pass-through from usage sites; no transformation required. Domain-specific logic (conditional colors, achievement states) remains in parent components; IconBadge receives final semantic variant.
- **Evidence**: Derived from analyzing 7+ usage sites and identifying common patterns. NO className follows StatusBadge (status-badge.tsx:18) and InformationBadge (information-badge.tsx:10) patterns that exclude className for strict style encapsulation.

### Variant Styling Decisions

- **Entity**: `variant` prop styling rules
- **Shape**:
  ```typescript
  type IconBadgeVariant = 'success' | 'error' | 'warning' | 'info' | 'neutral' | 'primary' | 'destructive';

  // Variant color mappings (all with text + background):
  // 'success': bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300
  //            (location occupied, achieved milestones)
  // 'error': bg-amber-50 text-amber-600 dark:bg-amber-900 dark:text-amber-300
  //          (activity removal, errors)
  // 'warning': bg-amber-50 text-amber-600 (same as error for consistency)
  // 'info': bg-blue-50 text-blue-600 dark:bg-blue-900 dark:text-blue-300
  //         (activity moves)
  // 'neutral': bg-muted text-muted-foreground
  //            (default state, empty locations)
  // 'primary': bg-primary text-primary-foreground
  //            (step numbers, next milestone highlights)
  // 'destructive': bg-destructive/10 text-destructive
  //                (AI error states, image load failures)

  // Size mappings:
  // 'sm': w-8 h-8 text-sm
  // 'md': w-10 h-10 text-base
  // 'lg': w-12 h-12 text-lg
  // 'xl': w-16 h-16 text-xl

  // Border styling (when border=true):
  // Adds border-2 with color matching variant:
  // - success: border-emerald-200
  // - error/warning: border-amber-200
  // - info: border-blue-200
  // - primary: border-primary (full opacity; milestone 'next' state background is bg-primary/20 handled by parent logic)
  // - destructive: border-destructive
  // - neutral: border-muted

  // Animation styling (when animated=true):
  // Adds: animate-pulse transition-all duration-300
  ```
- **Mapping**: Consolidates all 8 variants into semantic color schemes. Activity colors map to success/error/info. Location occupancy maps to success/neutral. Milestones map to primary/success/neutral with animated prop for "next" state.
- **Evidence**: Lines 23-29 (location), 72-77 (activity), 69-79 (milestones), 117 (steps), 34 & 74 (AI progress), 264 (media error)

### Breaking Changes

All usage sites must be updated simultaneously. No deprecated props or backward compatibility layer. className prop is completely removed (TypeScript will enforce).

---

## 4) API / Integration Surface

### Component Export

- **Surface**: `src/components/ui/index.ts` barrel export
- **Inputs**: None (static export)
- **Outputs**: `IconBadge` component available for import
- **Errors**: N/A (compile-time)
- **Evidence**: Existing pattern: `src/components/ui/index.ts` exports all UI components

### Usage Pattern

- **Surface**: Import and render in domain components
- **Inputs**: IconBadgeProps as defined in section 3
- **Outputs**: Rendered DOM with `data-testid` attributes
- **Errors**: TypeScript compile errors if required props missing or invalid values provided
- **Evidence**: Pattern established by existing UI components like `StatusBadge`, `InformationBadge`, `Button`

---

## 5) Algorithms & UI Flows

### Component Render Flow

- **Flow**: IconBadge component rendering
- **Steps**:
  1. Accept props: `{ testId, children, size = 'sm', variant = 'neutral', border = false, animated = false, onClick? }`
  2. Determine base classes: `inline-flex items-center justify-center rounded-full font-medium`
  3. Determine size classes based on `size`:
     - `sm`: `w-8 h-8 text-sm`
     - `md`: `w-10 h-10 text-base`
     - `lg`: `w-12 h-12 text-lg`
     - `xl`: `w-16 h-16 text-xl`
  4. Determine variant classes based on `variant`:
     - `success`: `bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300`
     - `error`: `bg-amber-50 text-amber-600 dark:bg-amber-900 dark:text-amber-300`
     - `warning`: `bg-amber-50 text-amber-600 dark:bg-amber-900 dark:text-amber-300`
     - `info`: `bg-blue-50 text-blue-600 dark:bg-blue-900 dark:text-blue-300`
     - `neutral`: `bg-muted text-muted-foreground`
     - `primary`: `bg-primary text-primary-foreground`
     - `destructive`: `bg-destructive/10 text-destructive`
  5. If `border=true`, add border classes:
     - Base: `border-2`
     - Variant-specific border color matching background scheme
  6. If `animated=true`, add animation classes: `animate-pulse transition-all duration-300 motion-reduce:animate-none` (respects prefers-reduced-motion for accessibility)
  7. If `onClick` provided, add interactive classes: `cursor-pointer hover:opacity-80 transition-opacity`
  8. Merge all classes using `cn()` utility (NO custom className accepted)
  9. Render as `div` (or `button` if onClick provided) with conditional `data-testid={testId}` (only if testId provided)
  10. Render `children` content (text, emoji, or React component)
- **States / transitions**: Pure render, no internal state; hover/animation states via CSS
- **Hotspots**: None (simple composition component)
- **Evidence**: Derived from analyzing 8+ existing implementations

### Milestone Checkmark Overlay Refactoring Pattern

- **Flow**: Refactor documentation milestone badges with checkmark overlay
- **Steps (before/after pattern)**:
  ```typescript
  // BEFORE (current implementation — lines 69-84 of documentation-status.tsx)
  <div className={`
    relative inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold
    transition-all duration-300
    ${achieved
      ? 'bg-green-500 text-white shadow-md'
      : isNext
      ? 'bg-primary/20 text-primary border-2 border-primary animate-pulse'
      : 'bg-muted text-muted-foreground'
    }
  `} data-testid="dashboard.documentation.milestone" data-milestone={milestone} data-achieved={achieved}>
    {milestone}%
    {achieved && (
      <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-600 rounded-full flex items-center justify-center">
        <span className="text-white text-xs">✓</span>
      </div>
    )}
  </div>

  // AFTER (IconBadge + separate overlay)
  <div className="relative inline-flex" data-testid="dashboard.documentation.milestone" data-milestone={milestone} data-achieved={achieved}>
    <IconBadge size="sm" variant={achieved ? 'success' : isNext ? 'primary' : 'neutral'} animated={isNext}>
      {milestone}%
    </IconBadge>
    {achieved && (
      <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-600 rounded-full flex items-center justify-center">
        <span className="text-white text-xs">✓</span>
      </div>
    )}
  </div>
  ```
  Note: Wrapper div receives test ID and data attributes (preserves test compatibility). IconBadge has no testId prop (parent wrapper is test target).
- **States / transitions**: None (static rendering)
- **Hotspots**: Maintaining relative positioning for overlay; ensuring test ID remains on wrapper
- **Evidence**: Lines 69-84 in documentation-status.tsx

### Refactoring Flow per Component

- **Flow**: Replace inline circular badge markup with IconBadge component
- **Steps**:
  1. Import IconBadge from `@/components/ui/icon-badge`
  2. Identify circular badge conditional branches in component
  3. Map existing color logic to semantic variants (success/error/info/neutral/primary/destructive)
  4. Replace JSX with `<IconBadge testId="..." size="..." variant="...">{content}</IconBadge>`
  5. Remove all inline className strings related to circular badge styling
  6. Preserve existing `data-testid` values exactly (critical for test compatibility)
  7. Add border prop where original implementation had borders (activity timeline)
  8. Add animated prop where original implementation had animations (milestones)
  9. Verify TypeScript compilation (no className prop usage allowed)
- **States / transitions**: No state changes in consuming components; conditional logic for variant selection remains in parent
- **Hotspots**: Ensuring test IDs remain identical to avoid breaking Playwright specs; mapping dynamic color functions to semantic variants
- **Evidence**: Pattern established by refactoring requirements

---

## 6) Derived State & Invariants

### Test ID Consistency

- **Derived value**: `data-testid` attribute on rendered container (when testId provided)
- **Source**: Optional `testId` prop passed by consuming component
- **Writes / cleanup**: None (stateless rendering)
- **Guards**: TypeScript allows optional testId; only applied to DOM if provided
- **Invariant**: When test IDs are provided, they must match existing patterns exactly to preserve Playwright test compatibility. Omit testId when parent container provides sufficient test targeting (e.g., location items, card containers). Provide testId when badge is independently tested (e.g., activity icons, milestone badges when wrapper has testId).
- **Evidence**: All components use consistent `data-testid` patterns: `dashboard.activity.item.icon`, `dashboard.documentation.milestone` (on wrapper), `boxes.detail.locations.item` (no specific badge ID)

### Variant Color Consistency

- **Derived value**: CSS color classes applied to badge
- **Source**: `variant` prop (TypeScript union type)
- **Writes / cleanup**: None
- **Guards**: TypeScript union type restricts to valid variants
- **Invariant**: Each variant must map to exactly one color scheme; no custom colors allowed
- **Evidence**: Variants derived from lines 23-29 (location), 72-77 (activity), 69-79 (milestones), 34 & 74 (AI progress)

### Size Standardization

- **Derived value**: Width/height classes applied to badge
- **Source**: `size` prop (defaults to 'sm')
- **Writes / cleanup**: None
- **Guards**: TypeScript union type restricts to 'sm' | 'md' | 'lg' | 'xl'
- **Invariant**: All badges use predefined sizes; no custom dimensions allowed
- **Evidence**: Current implementations use w-8 h-8 (most common), w-10 h-10 (hover-actions), w-16 h-16 (AI progress, media errors)

---

## 7) State Consistency & Async Coordination

### Pure Component Contract

- **Source of truth**: Props provided by parent component
- **Coordination**: None required (stateless component)
- **Async safeguards**: N/A (synchronous rendering)
- **Instrumentation**: `data-testid` attributes enable Playwright assertions via `page.getByTestId()`
- **Evidence**: UI components in `src/components/ui/` follow stateless pattern (badge.tsx, status-badge.tsx, information-badge.tsx)

### Parent Component Responsibility

- **Source of truth**: Parent component's conditional logic determines variant, size, border, and animated props
- **Coordination**: Parent manages achievement states, activity types, occupancy status, loading states that drive badge appearance
- **Async safeguards**: Parents already implement query state handling and instrumentation
- **Instrumentation**: No new instrumentation required; badges are static display elements
- **Evidence**: Lines 23-29 (location-item.tsx conditional occupancy), 28-39 (recent-activity-timeline.tsx activity type logic), 65-66 (documentation-status.tsx achievement logic)

---

## 8) Errors & Edge Cases

### Missing Required Props

- **Failure**: TypeScript compile error if `testId` or `children` omitted
- **Surface**: Build-time error in consuming component
- **Handling**: Developer must provide required props
- **Guardrails**: TypeScript strict mode, required prop definitions
- **Evidence**: Standard React TypeScript pattern

### Invalid Variant

- **Failure**: TypeScript compile error if variant not in union type
- **Surface**: Build-time error in consuming component
- **Handling**: Developer must use valid variant string
- **Guardrails**: TypeScript union type constraint
- **Evidence**: Standard TypeScript enum pattern

### Invalid Size

- **Failure**: TypeScript compile error if size not 'sm' | 'md' | 'lg' | 'xl'
- **Surface**: Build-time error in consuming component
- **Handling**: Developer must use valid size string
- **Guardrails**: TypeScript union type constraint
- **Evidence**: Standard TypeScript enum pattern

### Attempt to Pass className Prop

- **Failure**: TypeScript compile error (className not in prop interface)
- **Surface**: Build-time error in consuming component
- **Handling**: Developer must remove className usage; adjust layout in parent container instead
- **Guardrails**: TypeScript strict mode, intentional prop omission
- **Evidence**: Follows StatusBadge and InformationBadge patterns that exclude className

### Empty Children

- **Failure**: Badge renders empty (no content visible)
- **Surface**: Visual bug in consuming component
- **Handling**: Developer must provide non-empty children
- **Guardrails**: Code review, visual testing
- **Evidence**: Standard React children handling

### Icon Size Mismatch

- **Failure**: Lucide icon size doesn't match badge size (looks oversized or undersized)
- **Surface**: Visual inconsistency
- **Handling**: Documentation should recommend icon size guidelines:
  - sm badge: h-4 w-4 icon
  - md badge: h-5 w-5 icon
  - lg badge: h-6 w-6 icon
  - xl badge: h-8 w-8 icon
- **Guardrails**: Code review, visual inspection
- **Evidence**: Line 34 uses h-8 w-8 icon with w-16 h-16 badge (xl size); line 74 similar pattern

### Visual Differences After Standardization

- **Failure**: Minor padding/font-weight differences from previous implementations
- **Surface**: Visual appearance of badges may differ slightly
- **Handling**: Accept as casualties; document significant changes
- **Guardrails**: Visual inspection during testing
- **Evidence**: UI component workflow principles: "Minor visual differences acceptable"

---

## 9) Observability / Instrumentation

### Static Test ID

- **Signal**: `data-testid` attribute on container element
- **Type**: HTML attribute for test instrumentation
- **Trigger**: Always rendered on badge container
- **Labels / fields**: Single string from `testId` prop
- **Consumer**: Playwright selectors via `page.getByTestId(testId)`
- **Evidence**: `tests/e2e/dashboard/recent-activity.spec.ts` line 58, `tests/e2e/dashboard/documentation-status.spec.ts` line 47

### Additional Data Attributes

For milestone badges specifically, preserve existing data attributes beyond testId:
- `data-milestone` (milestone value)
- `data-achieved` (achievement status)

These are domain-specific and should be passed through as additional props or handled by parent component.

**Decision**: IconBadge will NOT support arbitrary data attributes. Parent components should wrap IconBadge in a container div if additional data attributes are needed. This maintains IconBadge's focus on pure presentation.

### No Runtime Events

No test-event emission required for icon badges. These are static UI elements without user interaction lifecycle (beyond optional onClick, which is a standard DOM event).

---

## 10) Lifecycle & Background Work

### No Lifecycle Hooks

IconBadge is a pure functional component with no effects, subscriptions, or cleanup.

- **Hook / effect**: None
- **Trigger cadence**: N/A
- **Responsibilities**: N/A
- **Cleanup**: N/A
- **Evidence**: Stateless UI component pattern established by status-badge.tsx, information-badge.tsx

---

## 11) Security & Permissions

Not applicable. IconBadge is a presentational component with no data access, authentication, or authorization logic.

---

## 12) UX / UI Impact

### Entry Points (7 components affected)

- **Entry point**: Box detail page (`/boxes/:id`)
- **Change**: Replace inline location number badges with IconBadge component
- **User interaction**: No behavioral change; visual standardization to predefined size and colors
- **Dependencies**: IconBadge component
- **Evidence**: Lines 23-29 in `src/components/boxes/location-item.tsx`

- **Entry point**: Dashboard recent activity card
- **Change**: Replace inline activity icon badges with IconBadge component
- **User interaction**: No behavioral change; slight color/border standardization possible
- **Dependencies**: IconBadge component
- **Evidence**: Lines 72-77 in `src/components/dashboard/recent-activity-timeline.tsx`

- **Entry point**: Dashboard documentation status card
- **Change**: Replace inline milestone badges with IconBadge component; checkmark overlay handled separately (not part of IconBadge)
- **User interaction**: No behavioral change; animation/styling standardization
- **Dependencies**: IconBadge component
- **Evidence**: Lines 69-79 in `src/components/dashboard/documentation-status.tsx`

- **Entry point**: About page (`/about`)
- **Change**: Replace inline step number badges with IconBadge component
- **User interaction**: No behavioral change; size/color standardization
- **Dependencies**: IconBadge component
- **Evidence**: Line 117 in `src/routes/about.tsx`

- **Entry point**: AI part creation workflow
- **Change**: Replace inline error and loading badges with IconBadge component
- **User interaction**: No behavioral change; consistent xl size and variant colors
- **Dependencies**: IconBadge component
- **Evidence**: Lines 34, 74 in `src/components/parts/ai-part-progress-step.tsx`

- **Entry point**: Media viewer error state
- **Change**: Replace inline error icon badge with IconBadge component
- **User interaction**: No behavioral change; consistent destructive variant styling
- **Dependencies**: IconBadge component
- **Evidence**: Line 264 in `src/components/documents/media-viewer-base.tsx`

- **Entry point**: Media viewer and hover overlay action buttons
- **Change**: Replace IconButton component with IconBadge (with onClick support)
- **User interaction**: **Potential change** - IconBadge may not support all IconButton features (backdrop-blur-sm, variant-specific hover states)
- **Alternative approach**: Keep IconButton as separate component for interactive buttons; IconBadge remains purely for status indicators
- **Dependencies**: IconBadge component OR decision to keep IconButton separate
- **Evidence**: Lines 22-66 in `src/components/ui/hover-actions.tsx`

### Accessibility Considerations

- Maintain semantic HTML (div or button based on onClick presence)
- Preserve text contrast ratios (all variant colors chosen for accessibility)
- Interactive badges (with onClick) are keyboard-accessible (button element)
- Animation (animate-pulse) can be disabled via `prefers-reduced-motion` CSS (add in implementation)

---

## 13) Deterministic Test Plan

### Scenario 1: Location Item Badges

- **Surface**: Box detail page location list
- **Scenarios**:
  - **Given** box has empty location, **When** viewing box detail, **Then** location badge displays with neutral variant (bg-muted text-muted-foreground)
  - **Given** box has occupied location, **When** viewing box detail, **Then** location badge displays with success variant (bg-emerald-100 text-emerald-700)
- **Instrumentation / hooks**: `page.getByTestId('boxes.detail.locations.item.{boxNo}-{locNo}')` (existing parent container ID)
- **Gaps**: No specific badge test ID currently; acceptable as location item is the semantic unit
- **Evidence**: Existing tests in `tests/e2e/boxes/boxes-detail.spec.ts`

### Scenario 2: Activity Timeline Icon Badges

- **Surface**: Dashboard recent activity card
- **Scenarios**:
  - **Given** activity is addition, **When** viewing dashboard, **Then** activity icon badge displays with success variant and emoji ➕
  - **Given** activity is removal, **When** viewing dashboard, **Then** activity icon badge displays with error variant and emoji ➖
  - **Given** activity is move, **When** viewing dashboard, **Then** activity icon badge displays with info variant and emoji 🔄
- **Instrumentation / hooks**: `page.getByTestId('dashboard.activity.item.icon')`
- **Gaps**: None
- **Evidence**: Existing tests in `tests/e2e/dashboard/recent-activity.spec.ts`

### Scenario 3: Documentation Milestone Badges

- **Surface**: Dashboard documentation status card
- **Scenarios**:
  - **Given** milestone not achieved, **When** viewing dashboard, **Then** milestone badge displays with neutral variant
  - **Given** milestone achieved, **When** viewing dashboard, **Then** milestone badge displays with success variant and checkmark overlay
  - **Given** milestone is next target, **When** viewing dashboard, **Then** milestone badge displays with primary variant and pulse animation
- **Instrumentation / hooks**: `page.getByTestId('dashboard.documentation.milestone')`
- **Gaps**: Checkmark overlay is NOT part of IconBadge; parent component will render overlay separately
- **Evidence**: Existing tests in `tests/e2e/dashboard/documentation-status.spec.ts`

### Scenario 4: About Page Step Badges

- **Surface**: About page quick start guide
- **Scenarios**:
  - **Given** user views about page, **When** page loads, **Then** step number badges display with primary variant
- **Instrumentation / hooks**: `page.getByTestId('about.quickstart.step')` (existing parent container ID)
- **Gaps**: No specific badge test ID needed; step container is sufficient
- **Evidence**: No existing specific tests; smoke test coverage sufficient

### Scenario 5: AI Progress Badges

- **Surface**: AI part analysis workflow
- **Scenarios**:
  - **Given** AI analysis errors, **When** viewing error state, **Then** error badge displays with destructive variant and X icon (xl size)
  - **Given** AI analysis in progress, **When** viewing progress state, **Then** loading badge displays with primary variant and Loader2 icon with spin animation (xl size)
- **Instrumentation / hooks**: `page.getByTestId('parts.ai.progress-error')`, `page.getByTestId('parts.ai.progress-card')`
- **Gaps**: None
- **Evidence**: Existing tests in `tests/e2e/parts/part-ai-creation.spec.ts`

### Scenario 6: Media Viewer Error Badge

- **Surface**: Media viewer when image fails to load
- **Scenarios**:
  - **Given** image load fails, **When** viewing media viewer, **Then** error badge displays with destructive variant and error icon (xl size)
- **Instrumentation / hooks**: Visual inspection (no specific test coverage for media viewer error states)
- **Gaps**: Media viewer error state testing is out of scope for this refactor
- **Evidence**: No existing tests; acceptable gap

### Scenario 7: IconButton Refactoring Decision

- **Surface**: Media viewer and hover overlays
- **Scenarios**: DEFERRED DECISION
- **Decision required**: Should IconButton be refactored to use IconBadge, or should it remain separate?
  - Option A: Refactor IconButton to use IconBadge internally (adds complexity to IconBadge for interactive features)
  - Option B: Keep IconButton separate; it serves a different purpose (action buttons vs status indicators)
  - **Recommendation**: Option B - Keep IconButton separate. IconBadge should remain focused on status/indicator badges without interactive button complexities (backdrop-blur, variant-specific hover states, button semantics).
- **Instrumentation / hooks**: Existing hover-actions tests (if any)
- **Gaps**: Decision to be made during implementation
- **Evidence**: Lines 22-66 in `src/components/ui/hover-actions.tsx`

### Testing Strategy

1. Run full Playwright suite after refactoring each component
2. Verify all existing badge tests still pass
3. Visual inspection of all affected pages in browser
4. Ensure test IDs are preserved exactly (no selector updates needed)
5. No new behavioral tests required (pure UI refactor)

---

## 14) Implementation Slices

### Slice 0: Establish Test Baseline

- **Goal**: Ensure all Playwright tests pass before refactoring begins
- **Touches**:
  - Run `pnpm check` to verify no TypeScript errors
  - Run `pnpm playwright test` to establish baseline
  - Document any pre-existing test failures
- **Dependencies**: None
- **Testing protocol**: All tests must pass; any failures must be documented as pre-existing issues

### Slice 1: Create IconBadge Component

- **Goal**: Ship reusable IconBadge component with all variants and sizes
- **Touches**:
  - Create `src/components/ui/icon-badge.tsx`
  - Update `src/components/ui/index.ts` to export IconBadge
  - Implement size variants (sm, md, lg, xl)
  - Implement color variants (success, error, warning, info, neutral, primary, destructive)
  - Implement border prop
  - Implement animated prop
  - Implement optional onClick support (render as button vs div)
  - Add prefers-reduced-motion support for animations
  - NO className prop (intentionally excluded)
- **Dependencies**: Slice 0 complete (baseline established)
- **Testing protocol**: Run `pnpm check` to verify TypeScript compiles; no Playwright tests needed (component not yet used)

### Slice 2: Refactor Location Item Badges

- **Goal**: Replace simplest usage (conditional variant only)
- **Touches**:
  - `src/components/boxes/location-item.tsx` (lines 23-29)
  - Map isOccupied logic to variant: occupied = 'success', empty = 'neutral'
- **Dependencies**: Slice 1 complete
- **Testing protocol**:
  1. Run affected tests BEFORE refactoring: `pnpm playwright test tests/e2e/boxes/boxes-detail.spec.ts`
  2. Refactor component to use IconBadge (preserve exact markup structure around badge)
  3. Re-run affected tests
  4. Visual change expected: slight color standardization (acceptable)
  5. If tests fail on functional assertions, treat as blocker and investigate
  6. Mark slice complete only when affected tests pass

### Slice 3: Refactor Activity Timeline Badges

- **Goal**: Replace badges with dynamic variants and borders
- **Touches**:
  - `src/components/dashboard/recent-activity-timeline.tsx` (lines 72-77, helpers 28-39)
  - Map activity type to variant: addition = 'success', removal = 'error', move = 'info'
  - Pass border=true
  - Keep emoji content in children
- **Dependencies**: Slice 2 complete
- **Testing protocol**:
  1. Run affected tests BEFORE refactoring: `pnpm playwright test tests/e2e/dashboard/recent-activity.spec.ts`
  2. Refactor component to use IconBadge with dynamic variants
  3. Re-run affected tests
  4. Ensure `dashboard.activity.item.icon` test ID is preserved
  5. If tests fail, treat as blocker and investigate
  6. Mark slice complete only when affected tests pass

### Slice 4: Refactor Documentation Milestone Badges

- **Goal**: Replace most complex badges (achievement state, animation, overlay)
- **Touches**:
  - `src/components/dashboard/documentation-status.tsx` (lines 69-79)
  - Map achievement logic to variant: achieved = 'success', next = 'primary', future = 'neutral'
  - Pass animated=true for next milestone
  - Keep checkmark overlay OUTSIDE IconBadge (render as sibling or wrapper)
  - Preserve data-milestone and data-achieved attributes on wrapper container
- **Dependencies**: Slice 3 complete
- **Testing protocol**:
  1. Run affected tests BEFORE refactoring: `pnpm playwright test tests/e2e/dashboard/documentation-status.spec.ts`
  2. Refactor component to use IconBadge with wrapper for overlay
  3. Re-run affected tests
  4. Ensure `dashboard.documentation.milestone` test ID is preserved
  5. Visual inspection: verify checkmark overlay still displays correctly
  6. If tests fail, treat as blocker and investigate
  7. Mark slice complete only when affected tests pass

### Slice 5: Refactor About Page Step Badges

- **Goal**: Replace simple primary variant badges
- **Touches**:
  - `src/routes/about.tsx` (line 117)
  - Use primary variant, sm size
- **Dependencies**: Slice 4 complete
- **Testing protocol**:
  1. Visual inspection (no specific Playwright tests for about page badges)
  2. Run smoke tests: `pnpm playwright test tests/smoke.spec.ts`
  3. Verify step badges display correctly in browser
  4. Mark slice complete after visual verification

### Slice 6: Refactor AI Progress Badges

- **Goal**: Replace xl size badges with Lucide icon children
- **Touches**:
  - `src/components/parts/ai-part-progress-step.tsx` (lines 34, 74)
  - Error badge: destructive variant, xl size, X icon as children
  - Loading badge: primary variant, xl size, Loader2 icon as children with spin class
- **Dependencies**: Slice 5 complete
- **Testing protocol**:
  1. Run affected tests BEFORE refactoring: `pnpm playwright test tests/e2e/parts/part-ai-creation.spec.ts`
  2. Refactor component to use IconBadge with Lucide icon children
  3. Re-run affected tests
  4. Ensure Loader2 spin animation still works (applied to icon, not badge)
  5. If tests fail, treat as blocker and investigate
  6. Mark slice complete only when affected tests pass

### Slice 7: Refactor Media Viewer Error Badge

- **Goal**: Replace error state badge with destructive variant
- **Touches**:
  - `src/components/documents/media-viewer-base.tsx` (line 264)
  - Use destructive variant, xl size
  - Replace inline SVG with Lucide X icon for consistency
- **Dependencies**: Slice 6 complete
- **Testing protocol**:
  1. Visual inspection (no specific Playwright tests for media viewer error states)
  2. Manually trigger image load error to verify badge displays
  3. Mark slice complete after visual verification

### Slice 7.5: Refactor Camera Capture Error Badge

- **Goal**: Replace camera error badge with destructive variant
- **Touches**:
  - `src/components/documents/camera-capture.tsx` (line 140)
  - Use destructive variant, xl size
  - Replace inline SVG with Lucide X icon for consistency
- **Dependencies**: Slice 7 complete
- **Testing protocol**:
  1. Visual inspection (no specific Playwright tests for camera error states)
  2. Manually trigger camera error to verify badge displays
  3. Mark slice complete after visual verification

### Slice 8: Decision on IconButton Refactoring

- **Goal**: Decide whether to refactor hover-actions.tsx IconButton component
- **Touches**:
  - Potentially `src/components/ui/hover-actions.tsx` (lines 22-66)
  - Review IconButton usage patterns
  - Assess complexity of merging with IconBadge
- **Dependencies**: Slice 7 complete
- **Recommendation**: **DEFER IconButton refactoring** - Keep IconButton separate from IconBadge. Rationale:
  - IconButton serves action/interaction purpose (backdrop-blur, variant-specific hover states, button semantics)
  - IconBadge serves status/indicator purpose (static or minimally interactive)
  - Merging would add complexity to IconBadge for rare interactive use cases
  - IconButton can potentially be refactored later to use IconBadge internally if clear benefits emerge
- **Testing protocol**: No action required if deferred; document decision

### Slice 9: Final Verification

- **Goal**: Full Playwright suite passes, visual review complete
- **Touches**:
  - Run `pnpm check` to verify no TypeScript errors
  - Run `pnpm playwright test` full suite as final verification
  - Manually verify each badge usage in browser
  - Re-run comprehensive grep search for `rounded-full.*flex.*items-center.*justify-center` pattern to verify no missed usage sites
  - Also search for variations like `rounded-full` alone without flex to catch potential false negatives
- **Dependencies**: Slices 1-8 (including 7.5) complete
- **Testing protocol**:
  1. All tests must pass without visual assertion changes
  2. Visual changes are acceptable if: (a) test IDs unchanged, (b) content visible, (c) layout not broken
  3. Document any remaining issues or deferred coverage (e.g., IconButton decision)

---

## 15) Risks & Open Questions

### Risk: Test ID Mismatches

- **Risk**: Accidentally changing test IDs during refactor breaks Playwright specs
- **Impact**: Test failures in CI, blocking merge
- **Mitigation**: Preserve exact test ID strings from original implementations; run Playwright tests after each slice

### Risk: Visual Regressions

- **Risk**: Standardizing colors/sizes causes noticeable UI differences users complain about
- **Impact**: User confusion, design team pushback
- **Mitigation**: Accept minor visual changes as documented in UX section; color variants chosen to match existing patterns closely

### Risk: Incomplete Discovery

- **Risk**: Additional circular badge patterns exist beyond the 7 identified files
- **Impact**: Inconsistent UX with missed refactoring opportunities
- **Mitigation**: Final grep search in Slice 9 to catch stragglers; user request already accepted this scope

### Risk: Icon Size Inconsistency

- **Risk**: Lucide icons inside badges don't match badge size (look too large or too small)
- **Impact**: Visual inconsistency, poor aesthetics
- **Mitigation**: Document icon size guidelines in component; add code review checklist item to verify icon sizes

### Risk: Checkmark Overlay Complexity

- **Risk**: Milestone checkmark overlay cannot be cleanly separated from IconBadge
- **Impact**: Either IconBadge becomes too complex (overlay prop), or overlay rendering is awkward
- **Mitigation**: Keep overlay outside IconBadge; render as wrapper or sibling; document pattern clearly

### Risk: Animation Conflicts

- **Risk**: Animated prop conflicts with icon animations (e.g., Loader2 spin)
- **Impact**: Unexpected animation behavior (double animation)
- **Mitigation**: Animated prop applies to badge container only; icon animations are independent (applied to icon element, not badge)

### Risk: onClick vs Button Semantics

- **Risk**: Using div with onClick vs button element affects accessibility/keyboard navigation
- **Impact**: Keyboard users can't interact with badges that should be clickable
- **Mitigation**: Render as button element when onClick provided; render as div otherwise; follow semantic HTML best practices

### Risk: IconButton Refactoring Unclear

- **Risk**: Unclear whether to refactor IconButton or keep separate
- **Impact**: Either (a) IconBadge becomes too complex for action buttons, or (b) missed refactoring opportunity
- **Mitigation**: **Resolved** - Recommendation in Slice 8 is to DEFER IconButton refactoring; keep separate as they serve different purposes

### Resolved Decision: className Prop Exclusion

- **Initial approach**: Exclude className prop to enforce strict encapsulation (following StatusBadge and InformationBadge patterns)
- **Why no reconsideration needed**: IconBadge serves semantic status indicator role; allowing className would enable CSS soup at call sites. Layout adjustments (margin, positioning) should be handled by parent containers, not badge itself. This is consistent with documented pattern for semantic components that enforce visual consistency.
- **Resolution**: **Confirm exclusion** - NO className prop in IconBadge. TypeScript will enforce at compile time.

### Resolved Decision: Overlay Elements

- **Question**: Should IconBadge support overlay elements (checkmark for milestones)?
- **Why it matters**: Milestone badges have checkmark overlay for achieved state; unclear if this belongs in IconBadge
- **Resolution**: **Keep overlay OUTSIDE IconBadge** - Badge component should remain simple; overlays are domain-specific and should be rendered by parent component as wrapper or sibling. Document this pattern clearly in implementation.

### Resolved Decision: Border Styling

- **Question**: Should border be a boolean prop or a variant distinction?
- **Why it matters**: Only activity badges currently use borders; unclear if this is a core feature
- **Resolution**: **Boolean prop** - Border is optional styling detail, not semantic variant. Use `border={true}` for activity badges; defaults to false. Border color automatically matches variant color.

---

## 16) Confidence

**Confidence: High** — Pattern is well-understood with 7 concrete usage sites identified, TypeScript will enforce correctness, Playwright tests provide regression safety. The main complexity (checkmark overlay) is cleanly resolved by keeping it outside IconBadge. IconButton decision is deferred with clear recommendation to keep separate. Visual changes are explicitly acceptable per technical debt workflow. All size and color variants are derived from existing implementations. No business logic impact, pure UI refactoring.
