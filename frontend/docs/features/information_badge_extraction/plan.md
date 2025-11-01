# Information Badge Component Extraction — Technical Plan

## 0) Research Log & Findings

### Searched Areas
- Grepped for common badge patterns: `inline-flex items-center gap-1 px-2 py-1`, `bg-secondary text-secondary-foreground`, and `px-2 py-1 text-xs`
- Searched for files containing "badge" keyword in TSX files (found 25 files)
- Examined existing UI badge components: `badge.tsx` (base), `status-badge.tsx` (entity status), `key-value-badge.tsx` (metrics)
- Reviewed domain components using badge patterns: `tags-input.tsx`, `metadata-badge.tsx`, `location-summary.tsx`, `vendor-info.tsx`
- Checked dashboard components for similar patterns
- Searched for Playwright test coverage of affected components

### Relevant Components Found

**Primary badge-like patterns in domain components:**
1. `src/components/parts/tags-input.tsx:44` - Removable tags in tags input component
   - Pattern: `inline-flex items-center gap-1 px-2 py-1 text-xs bg-secondary text-secondary-foreground rounded-md`
   - Features: Close button (×), secondary background
2. `src/components/parts/metadata-badge.tsx:14-17` - Metadata display badges
   - Pattern: `inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-secondary text-secondary-foreground`
   - Features: Icon + label, accepts className prop (TO BE REMOVED)
3. `src/components/parts/location-summary.tsx:18` - Location summary display
   - Pattern: `inline-flex items-center gap-1 text-sm text-muted-foreground`
   - Features: Icon + text, different styling (muted foreground, no background)
4. `src/components/parts/vendor-info.tsx:15` - Vendor information display
   - Pattern: `inline-flex items-center gap-1 text-sm text-muted-foreground`
   - Features: Icon + text/link, different styling

**Dashboard components with inline badge patterns:**
5. `src/components/dashboard/storage-utilization-grid.tsx:65` - Box number badge
   - Pattern: `bg-background/90 rounded px-2 py-1 text-xs font-mono font-bold`
6. `src/components/dashboard/low-stock-alerts.tsx:98` - Stock level badge
   - Pattern: `px-2 py-1 rounded-full text-xs font-medium` with dynamic color classes

**Existing UI badge components (for reference, not to be replaced):**
- `src/components/ui/badge.tsx` - Base badge component with className support (used by status-badge and key-value-badge)
- `src/components/ui/status-badge.tsx` - Entity status badges (bold colors, no className)
- `src/components/ui/key-value-badge.tsx` - Metric/attribute badges (subtle colors, no className)

### Key Findings
- The Information Badge pattern is distinct from StatusBadge (entity status) and KeyValueBadge (metrics) in purpose and styling
- Current implementations mix layout classes (`inline-flex items-center gap-1`) with variant-specific styles
- MetadataBadge and similar components expose className props that enable CSS soup at call sites
- Tags in TagsInput embed layout styling directly in the component
- Dashboard badges use similar patterns but with custom color schemes (likely should remain custom)
- No existing Playwright tests specifically target these badge patterns; tests interact with parent components (part forms, part details)

### Conflicts Resolved
- **Decision**: Create a new `InformationBadge` component rather than extending existing badge components, as it serves a different purpose (supplementary info/tags vs. status or metrics)
- **Decision**: Implement InformationBadge as a standalone span element (not wrapping base Badge component) to allow explicit border-radius control. The base Badge component hardcodes `rounded-full`, but InformationBadge needs `rounded-md` for tags and flexible border control. This pattern divergence is justified because InformationBadge serves a different visual role (supplementary metadata/tags) than status/metric badges.
- **Decision**: LocationSummary uses muted foreground styling without background—this will be standardized to a consistent "subtle" variant
- **Decision**: VendorInfo will NOT be refactored as it includes unique link interaction semantics (href, onClick stopPropagation, external navigation, tooltips) that don't fit a generic badge abstraction
- **Decision**: Dashboard-specific badges (storage box badges, low-stock badges) will NOT be refactored as they have feature-specific color logic

---

## 1) Intent & Scope

**User intent**

Extract inline badge/tag styling patterns from domain components into a reusable, encapsulated `InformationBadge` UI component. This is technical debt elimination work following the UI component workflow to centralize styling and remove CSS class soup.

**Prompt quotes**

"The Information Badge is a small presentational component used to display metadata, tags, and supplementary information."

"NO className prop - all styling must be encapsulated"

"REMOVE className props completely - Not deprecated, not no-op - completely removed"

"Minor spacing/padding differences are acceptable casualties"

"Make breaking changes - do not attempt backward compatibility"

**In scope**

- Create `src/components/ui/information-badge.tsx` with full style encapsulation as a standalone span element (not wrapping base Badge component)
- Define API with props: `icon` (optional), `children` (content), `onRemove` (optional for removable tags), `variant` (color scheme), `testId` (REQUIRED for Playwright test reliability)
- Refactor `src/components/parts/tags-input.tsx` to use the new component for tag rendering with proper testId propagation
- REMOVE `src/components/parts/metadata-badge.tsx` entirely (replaced by InformationBadge)
- Refactor `src/components/parts/location-summary.tsx` to use InformationBadge, remove className prop
- Update all call sites that use MetadataBadge to use InformationBadge directly
- Standardize visual appearance (accept minor differences as casualties)
- Update type definitions to remove className props
- Fix all TypeScript errors from removed props
- Add aria-label to remove button for accessibility
- Document visual regression from rounded-full to rounded-md for metadata badges

**Out of scope**

- Dashboard-specific badges (storage-utilization-grid.tsx, low-stock-alerts.tsx) remain unchanged (feature-specific color logic)
- Existing StatusBadge and KeyValueBadge remain unchanged (different purposes)
- **VendorInfo component** (`src/components/parts/vendor-info.tsx`) — NOT included in refactor due to unique link interaction semantics (external navigation, click event handling, href, onClick stopPropagation, tooltips) that don't fit a generic badge abstraction. VendorInfo shares layout patterns but serves a distinct interaction purpose; it will retain custom implementation.
- Playwright test creation for standalone InformationBadge (tests will verify through parent components)
- Backward compatibility or deprecation warnings (breaking changes expected)

**Assumptions / constraints**

- The codebase follows React 19 + TypeScript strict mode
- Tailwind CSS is used for styling
- No className prop is the firm constraint per UI component workflow
- Visual differences from standardization are acceptable
- Tests currently interact with parent components (part forms, part details) rather than badges directly
- TypeScript compiler will catch all affected call sites when className prop is removed

---

## 2) Affected Areas & File Map

### New Component

- **Area**: `src/components/ui/information-badge.tsx`
- **Why**: Create the new reusable Information Badge component with encapsulated styling
- **Evidence**: Does not exist; will be created following the pattern of status-badge.tsx and key-value-badge.tsx

### Domain Components to Refactor

- **Area**: `src/components/parts/tags-input.tsx`
- **Why**: Replace inline badge styling (lines 42-56) with InformationBadge component
- **Evidence**: `src/components/parts/tags-input.tsx:44` - `className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-secondary text-secondary-foreground rounded-md"`

- **Area**: `src/components/parts/metadata-badge.tsx`
- **Why**: DELETE this file entirely - replaced by InformationBadge
- **Evidence**: `src/components/parts/metadata-badge.tsx:1-23` - entire component; exposes className prop at line 6

- **Area**: `src/components/parts/location-summary.tsx`
- **Why**: Replace inline span with InformationBadge component, remove className prop from interface
- **Evidence**: `src/components/parts/location-summary.tsx:18` - `className={inline-flex items-center gap-1 text-sm text-muted-foreground ${className || ''}}`; className prop at line 11

- **Area**: `src/components/parts/vendor-info.tsx` — REMOVED FROM SCOPE
- **Why**: VendorInfo has unique link interaction semantics (href, onClick stopPropagation, external navigation, tooltips) that don't fit a generic badge abstraction. While it shares layout patterns with InformationBadge, it serves a distinct interaction purpose and will retain custom implementation.
- **Evidence**: `src/components/parts/vendor-info.tsx:16-27` - conditional link rendering with `<a>` tag, href, target, onClick event handling, and title tooltip

### Components Using MetadataBadge

Search required to identify all call sites. Expected locations based on common patterns:
- Part detail views
- Part list views
- Kit components
- Shopping list components

### UI Index

- **Area**: `src/components/ui/index.ts`
- **Why**: Export the new InformationBadge component
- **Evidence**: `src/components/ui/index.ts` - add export for InformationBadge

### Type Definitions

- **Area**: Type definitions for LocationSummary
- **Why**: Remove className from prop interfaces
- **Evidence**: Inline type definitions in respective component file (VendorInfo removed from refactor scope)

---

## 3) Data Model / Contracts

No API contract changes. This is purely a UI refactoring.

### Component Props Contract

- **Entity**: InformationBadge component props
- **Shape**:
  ```typescript
  interface InformationBadgeProps {
    /** Optional icon/emoji to display before content */
    icon?: string;
    /** Badge content (text or React nodes) */
    children: React.ReactNode;
    /** Optional remove handler for removable tags. When provided, renders an accessible remove button with aria-label */
    onRemove?: () => void;
    /** Visual variant (defaults to 'default') */
    variant?: 'default' | 'subtle';
    /** Test ID for Playwright selectors - REQUIRED for test reliability */
    testId: string;
  }
  ```
- **Mapping**: No snake_case/camelCase mapping; pure UI component
- **Implementation note**: Implemented as a standalone span element (not wrapping base Badge component) to allow explicit border-radius control. The base Badge component hardcodes `rounded-full`, but InformationBadge needs `rounded-md` for tags. This pattern divergence is justified because InformationBadge serves a different visual role (supplementary metadata/tags) than status/metric badges.
- **Evidence**: Pattern derived from status-badge.tsx:18-27 and key-value-badge.tsx:13-22; testId requirement aligns with StatusBadge and KeyValueBadge patterns

### Updated Domain Component Props

- **Entity**: LocationSummaryProps (className removed)
- **Shape**:
  ```typescript
  interface LocationSummaryProps {
    locations: PartLocation[];
    // className prop REMOVED
  }
  ```
- **Evidence**: `src/components/parts/location-summary.tsx:9-12`

- **Entity**: VendorInfoProps — NO CHANGES (component removed from refactor scope)
- **Justification**: VendorInfo retains custom implementation due to unique link interaction semantics
- **Evidence**: See section 2 (Affected Areas) for exclusion rationale

---

## 4) API / Integration Surface

No backend API integration changes. This is purely a UI component refactoring.

---

## 5) Algorithms & UI Flows

### InformationBadge Rendering Flow

- **Flow**: Badge rendering with variants and optional remove functionality
- **Steps**:
  1. Receive props (icon, children, onRemove, variant, testId)
  2. Determine variant classes based on variant prop ('default' or 'subtle')
     - 'default': `bg-secondary text-secondary-foreground rounded-md` (for tags and metadata badges)
     - 'subtle': `text-muted-foreground` (no background, for LocationSummary-style displays)
  3. Render container as standalone `<span>` with appropriate classes (inline-flex items-center gap-1 px-2 py-1 text-xs + variant classes)
     - **Implementation note**: Uses standalone span rather than wrapping base Badge component to allow explicit border-radius control (rounded-md). Base Badge hardcodes rounded-full, which conflicts with tag requirements.
  4. If icon provided, render icon span
  5. Render children content
  6. If onRemove provided, render accessible remove button with × symbol and `aria-label="Remove {children}"` for screen reader support
  7. Apply testId to container via `data-testid={testId}` for Playwright selectors
- **States / transitions**: Stateless presentational component; hover states handled by CSS
- **Hotspots**: None (pure presentation, no complex logic)
- **Evidence**: Similar pattern in status-badge.tsx:53-69, but diverges by using standalone span instead of Badge wrapper

### TagsInput Refactor Flow

- **Flow**: Replace inline badge markup with InformationBadge component and add testId instrumentation
- **Steps**:
  1. Import InformationBadge from @/components/ui
  2. Replace span (lines 42-56) with InformationBadge
  3. Pass onRemove handler to InformationBadge
  4. **Add testId propagation**: Pass `testId={tags.form.tag.${index}}`or `testId={tags.form.tag.${tag}}` (sanitized for testId compliance) to each InformationBadge instance for Playwright test reliability
  5. Remove inline button styling (Button component no longer needed in badge)
  6. Test functionality: adding tags, removing tags, backspace behavior
- **States / transitions**: No state changes; existing TagsInput state management unchanged
- **Hotspots**: Ensure onRemove callback continues to work correctly; verify testId propagation for Playwright assertions on individual tag presence and removal
- **Evidence**: `src/components/parts/tags-input.tsx:42-56`

### MetadataBadge Replacement Flow

- **Flow**: Replace all MetadataBadge usages with InformationBadge
- **Steps**:
  1. Search codebase for `import.*MetadataBadge` and `<MetadataBadge`
  2. For each call site:
     - Replace import: `import { InformationBadge } from '@/components/ui'`
     - Replace usage: `<InformationBadge icon={icon}>{label}</InformationBadge>`
     - Remove any className prop usage (will cause TypeScript error if present)
  3. Delete metadata-badge.tsx file
  4. Fix TypeScript errors from removed className props
- **States / transitions**: No state impact; direct component swap
- **Hotspots**: Call sites passing className prop will break (intentional)
- **Evidence**: `src/components/parts/metadata-badge.tsx:1-23`

---

## 6) Derived State & Invariants

No derived state. InformationBadge is a pure presentational component.

- **Derived value**: None
  - **Source**: N/A
  - **Writes / cleanup**: N/A
  - **Guards**: N/A
  - **Invariant**: Component must remain stateless
  - **Evidence**: Pattern from status-badge.tsx (stateless component)

---

## 7) State Consistency & Async Coordination

No async coordination required. This is a synchronous UI component refactoring.

- **Source of truth**: Props passed from parent components
- **Coordination**: None; component is stateless
- **Async safeguards**: None required
- **Instrumentation**: testId prop allows Playwright selection; no test-event emission needed
- **Evidence**: Pattern from status-badge.tsx:53-69 (stateless, testId-enabled)

---

## 8) Errors & Edge Cases

### Empty or Missing Content

- **Failure**: Children prop is empty or undefined
- **Surface**: InformationBadge component
- **Handling**: Render empty badge (allow caller to handle conditional rendering)
- **Guardrails**: TypeScript requires children prop (React.ReactNode)
- **Evidence**: Standard React children handling

### Missing Icon in Variants Expecting Icons

- **Failure**: Icon not provided for metadata badges that previously always had icons
- **Surface**: Call sites replacing MetadataBadge
- **Handling**: Icon is optional; badge renders without icon
- **Guardrails**: Code review to ensure icons are passed where expected
- **Evidence**: icon?: string in props definition

### onRemove Not Provided for Removable Tags

- **Failure**: Tags that should be removable don't show remove button
- **Surface**: TagsInput component
- **Handling**: onRemove is optional; no remove button if not provided
- **Guardrails**: Code review and functional testing of TagsInput
- **Evidence**: onRemove?: () => void in props definition

### className Prop Usage at Call Sites

- **Failure**: Call sites attempt to pass className prop (breaking change)
- **Surface**: All call sites of LocationSummary or InformationBadge (VendorInfo removed from refactor scope)
- **Handling**: TypeScript compiler error; developer must remove className usage
- **Guardrails**: TypeScript strict mode catches all occurrences
- **Evidence**: Intentional breaking change per UI component workflow

### Visual Differences After Standardization

- **Failure**: Minor padding/spacing differences from previous implementations; border-radius change for metadata badges (rounded-full → rounded-md)
- **Surface**: Visual appearance of tags, metadata badges, location summaries
- **Handling**: Accept as casualties; document significant changes and verify acceptability through visual inspection
- **Guardrails**: Visual inspection during testing; before/after screenshots for metadata badges
- **Evidence**: UI component workflow principles: "Minor visual differences acceptable"; metadata-badge.tsx:15 currently uses rounded-full

---

## 9) Observability / Instrumentation

### Playwright Test Selectors

- **Signal**: data-testid attribute on InformationBadge (REQUIRED prop)
- **Type**: Test selector attribute
- **Trigger**: Always applied (testId is required, not optional)
- **Labels / fields**: testId string value
- **Consumer**: Playwright selectors in existing tests (parts CRUD, part detail views)
- **TagsInput-specific instrumentation**: Each InformationBadge instance in TagsInput receives testId in format `parts.form.tag.${index}` or `parts.form.tag.${tag}` (sanitized) to enable Playwright assertions on individual tag presence and removal
- **Accessibility**: Remove button (when onRemove provided) includes `aria-label="Remove {children}"` for screen reader support and Playwright role-based selectors
- **Evidence**: Pattern from status-badge.tsx:64 `data-testid={testId}`; testId requirement aligns with StatusBadge and KeyValueBadge

### No Test-Event Emission Required

Information badges are passive display elements that don't trigger user workflows or backend interactions, so no test-event instrumentation is needed.

---

## 10) Lifecycle & Background Work

No lifecycle hooks or background work. InformationBadge is a stateless presentational component.

- **Hook / effect**: None
- **Trigger cadence**: N/A
- **Responsibilities**: N/A
- **Cleanup**: N/A
- **Evidence**: Stateless component pattern

---

## 11) Security & Permissions

Not applicable. This is a pure UI component with no security implications.

---

## 12) UX / UI Impact

### Visual Standardization

- **Entry point**: All locations using tags, metadata badges, location summaries, or vendor info
- **Change**: Consistent badge styling across the application
- **User interaction**: No functional changes; users see standardized badge appearance
- **Dependencies**: None; purely visual changes
- **Evidence**: Affected components listed in section 2

### Potential Visual Differences

- Tags in TagsInput: Standardized to `bg-secondary text-secondary-foreground rounded-md` (no visual change)
- **Metadata badges: Standardized to `bg-secondary text-secondary-foreground rounded-md` — VISUAL REGRESSION from rounded-full to rounded-md**
  - **Impact**: Border radius changes from fully circular to rounded rectangle
  - **Verification required**: Visual inspection of part list cards with metadata badges; before/after screenshots recommended
- Location summaries: Standardized to `text-muted-foreground` with subtle variant (no background)

### Remove Button Styling

Tags with remove functionality will have standardized remove button appearance (× symbol with hover state) and accessible aria-label for screen readers.

---

## 13) Deterministic Test Plan

### Existing Test Coverage

Current Playwright tests interact with parent components (part forms, part details) rather than testing badges in isolation. No new test creation is required; verification will happen through existing tests.

### Verification Scenarios

- **Surface**: Part creation/edit forms (tests/e2e/parts/part-crud.spec.ts)
- **Scenarios**:
  - Given part form is open, When tags are added, Then tags display as InformationBadge components with testIds
  - Given part form with tags, When remove button is clicked (via testId or role selector), Then tag is removed
  - Given part form is submitted, When navigating to detail view, Then tags display correctly
  - Given individual tag, When Playwright targets by testId (e.g., `parts.form.tag.0`), Then specific tag is addressable for assertions
- **Instrumentation / hooks**:
  - Existing testIds on form elements and detail view elements
  - **New**: Individual tag testIds propagated from TagsInput to InformationBadge instances (`parts.form.tag.${index}`)
  - **New**: Remove button aria-label enables role-based Playwright selectors
- **Gaps**: None after testId propagation is implemented
- **Evidence**: `tests/e2e/parts/part-crud.spec.ts:1-77`

- **Surface**: Part detail view (tests/e2e/parts/part-crud.spec.ts, part-details.tsx)
- **Scenarios**:
  - Given part has metadata, When viewing part details, Then metadata badges display as InformationBadge with rounded-md border (visual change from rounded-full)
  - Given part has vendor info, When viewing part details, Then vendor info displays with icon (VendorInfo component unchanged, not refactored)
  - Given part has location data, When viewing part details, Then location summary displays with InformationBadge
- **Instrumentation / hooks**: Existing testIds on detail view elements
- **Gaps**: None; visual inspection sufficient
- **Manual verification required**: Before/after screenshots of part list cards to confirm metadata badge border-radius change (rounded-full → rounded-md) is acceptable
- **Evidence**: `src/components/parts/part-details.tsx:1-100` (metadata, vendor, location display)

### TypeScript Compilation

- **Surface**: All TypeScript files in project
- **Scenarios**:
  - Given className props are removed, When TypeScript compiles, Then no errors occur (all usages fixed)
- **Instrumentation / hooks**: `pnpm check` command
- **Gaps**: None
- **Evidence**: TypeScript strict mode configuration

---

## 14) Implementation Slices

### Slice 1: Create InformationBadge Component

- **Goal**: Establish the reusable UI component with all style variants
- **Touches**:
  - Create `src/components/ui/information-badge.tsx`
  - Update `src/components/ui/index.ts` to export InformationBadge
- **Dependencies**: None

### Slice 2: Refactor TagsInput

- **Goal**: Replace inline badge styling in TagsInput with InformationBadge and add testId instrumentation
- **Touches**:
  - Update `src/components/parts/tags-input.tsx`
  - Add testId propagation to each tag: `parts.form.tag.${index}` or `parts.form.tag.${tag}` (sanitized)
- **Dependencies**: Slice 1 complete

### Slice 3: Remove MetadataBadge and Update Call Sites

- **Goal**: Replace all MetadataBadge usages with InformationBadge, delete wrapper component
- **Touches**:
  - Search and replace all MetadataBadge imports and usages
  - Delete `src/components/parts/metadata-badge.tsx`
- **Dependencies**: Slice 1 complete

### Slice 4: Refactor LocationSummary

- **Goal**: Replace inline badge styling, remove className prop
- **Touches**:
  - Update `src/components/parts/location-summary.tsx` (remove className prop, use InformationBadge with 'subtle' variant)
  - Fix all call sites passing className to LocationSummary (if any)
- **Note**: VendorInfo removed from refactor scope due to unique link interaction semantics
- **Dependencies**: Slice 1 complete

### Slice 5: Verification and Cleanup

- **Goal**: Ensure all TypeScript errors are resolved, tests pass, and visual changes are acceptable
- **Touches**:
  - Run `pnpm check` to verify TypeScript compilation
  - Run Playwright tests for parts, kits, shopping lists (any areas using affected components)
  - Fix any remaining TypeScript errors or test failures
  - **Visual verification**: Capture before/after screenshots of part list cards to document metadata badge visual changes (rounded-full → rounded-md) for design review
- **Dependencies**: Slices 1-4 complete

---

## 15) Risks & Open Questions

### Risks

- **Risk**: Call sites passing className to MetadataBadge or LocationSummary will break (breaking change)
- **Impact**: TypeScript compilation errors at call sites
- **Mitigation**: TypeScript compiler will catch all occurrences; systematic search and fix during implementation

- **Risk**: Visual differences from standardization may be unexpected, particularly metadata badge border-radius change (rounded-full → rounded-md)
- **Impact**: Users may notice different badge appearance; design stakeholders may reject visual change
- **Mitigation**: Accept as casualties per UI component workflow; capture before/after screenshots for explicit design review before merging

- **Risk**: Remove button accessibility may break existing Playwright tests if they rely on specific selectors
- **Impact**: Playwright tests fail due to selector changes
- **Mitigation**: Add aria-label to remove button; verify tests using role-based selectors still work

- **Risk**: testId propagation in TagsInput may be incomplete or incorrect format
- **Impact**: Playwright tests can't address individual tags; test reliability suffers
- **Mitigation**: Make testId required (not optional) in InformationBadge props; document testId pattern in TagsInput refactor flow; verify tag-level assertions work

- **Risk**: Undiscovered usages of badge patterns in other components
- **Impact**: Inconsistent styling remains in codebase
- **Mitigation**: Comprehensive search during implementation; document any deferred components

### Open Questions

- **Question**: Should LocationSummary use 'default' or 'subtle' variant?
- **Why it matters**: Visual consistency decision affects appearance
- **Owner / follow-up**: Resolve during implementation by testing both; use 'subtle' for non-background appearance (matches current muted-foreground styling)
- **Note**: VendorInfo removed from question scope as it's excluded from refactor

- **Question**: Should InformationBadge support additional variants beyond 'default' and 'subtle'?
- **Why it matters**: Future extensibility vs. simplicity
- **Owner / follow-up**: Start with two variants; add more only if clear need emerges

- **Question**: Are there other components using similar badge patterns not discovered in initial search?
- **Why it matters**: Incomplete refactoring leaves CSS class soup
- **Owner / follow-up**: Comprehensive grep during implementation; visual inspection of common views

- **Question**: What testId format should be used for tags in TagsInput?
- **Why it matters**: Test reliability and consistency with existing testId conventions
- **Owner / follow-up**: Use either `parts.form.tag.${index}` (stable for index-based assertions) or `parts.form.tag.${tag}` (sanitized, stable for content-based assertions); decide during implementation based on test requirements

---

## 16) Confidence

**Confidence**: High — This is a straightforward component extraction with well-defined scope and clear implementation path. The pattern follows existing UI component structure (StatusBadge, KeyValueBadge) with an intentional divergence (standalone span vs. Badge wrapper) to support rounded-md border radius. TypeScript will catch all breaking changes from className prop removal. The main risks are well-understood: visual differences from standardization (particularly rounded-full → rounded-md for metadata badges) are explicitly acceptable per the UI component workflow, testId propagation is required and documented, and VendorInfo exclusion eliminates link interaction complexity. Implementation is low-risk with clear verification steps including visual regression documentation.
