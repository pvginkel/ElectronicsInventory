# Button System Review — Technical Plan

## 0) Research Log & Findings

### Discovery Work Performed

**Scope**: Comprehensive audit of all button labels across the Electronics Inventory frontend to identify non-compliant instances and wrapping issues in action bars.

**Search Strategy**:
- Searched for `<Button` component usage across the codebase
- Identified HTML `<button>` elements
- Examined icon buttons, menu items, and action bar implementations
- Reviewed `DetailScreenLayout` component for action bar wrapping behavior

**Key Findings**:

1. **Button Inventory** (`docs/features/button_system_review/button_audit.md`):
   - Total buttons found: 195+
   - Compliant: ~65 (33%)
   - Need updates: ~95 (49%)
   - Edge cases: ~35 (18%)

2. **Categories Analyzed**:
   - Action bars/toolbars: 12 buttons (8 need updates)
   - Forms/dialogs: 85 buttons (35 need updates)
   - List actions: 45 buttons (20 need updates)
   - Navigation: 8 buttons (5 need updates)
   - Icon-only buttons: 25+ (need aria-label review)
   - Dashboard widgets: 20 buttons (12 need updates)

3. **Action Bar Wrapping**:
   - `DetailScreenLayout` uses `flex flex-wrap gap-2` for actions (src/components/layout/detail-screen-layout.tsx:112)
   - Button labels that are too long can cause awkward wrapping on smaller screens
   - Examples found in part details, box details, kit details, shopping list details

4. **Common Non-Compliance Patterns**:
   - Missing nouns: "Add", "Save", "Remove", "Retry" → need object specification
   - Emoji usage: "🛒 Add to List", "📄 Add Docs" → violates style guide
   - Case issues: "Save & next" → should be "Save & Next"
   - Abbreviations: "Add Docs" → should be "Add Documentation"
   - Navigation language: "Back to Boxes" → should use action verbs
   - Technical vs. business language: "Mark Done" → should be "Complete List"

5. **Edge Cases Identified**:
   - Generic "Cancel" buttons in dialogs (recommendation: keep as-is for established pattern)
   - Icon-only buttons lacking proper aria-labels
   - Pagination controls ("Show {N} More") that don't fit strict verb+noun
   - State-dependent labels (loading states)
   - Menu trigger buttons needing context-specific labels

6. **Component Evidence**:
   - DetailScreenLayout: `src/components/layout/detail-screen-layout.tsx:111-115`
   - Button component: `src/components/ui/button.tsx:34-49` (size classes show padding/height)
   - Part details actions: `src/components/parts/part-details.tsx:267-304`
   - Multiple form dialogs with non-compliant Cancel/Save patterns

**Conflicts Resolved**:
- Decision to keep generic "Cancel" in modal dialogs as established UI pattern
- Specific label choices documented in `button_audit.md` answers section

### 1) Intent & Scope

**User intent**

Standardize all button labels across the application to follow a consistent `<verb> <noun>` format that describes business functions in title case, and fix wrapping issues in action bars to maintain professional appearance across screen sizes.

**Prompt quotes**

"Fix button wrapping issues and standardize button labels app-wide to follow `<verb> <noun>` format."

"Review all action bars in DetailScreenLayout usages to prevent button and label wrapping"

"Audit all button labels and update to follow format: `<verb> <noun>`, business-function oriented, title case"

**In scope**

- Update ~95 button labels to conform to `<verb> <noun>` format with business-function orientation and title case
- Remove emoji prefixes from all button labels (🛒, 📄, ➕)
- Add or update aria-labels for 25+ icon-only buttons to follow same standard
- Review and adjust action bar button groups in DetailScreenLayout usages to prevent wrapping
- Update contributor documentation with button labeling standards
- Add Playwright test coverage for critical button label patterns
- Fix case inconsistencies ("Save & next" → "Save & Next")
- Expand abbreviations ("Docs" → "Documentation")

**Out of scope**

- Button visual styling or color scheme changes
- Button component API changes
- Responsive layout overhaul beyond action bar adjustments
- Button accessibility features beyond aria-label updates
- Internationalization or localization of button labels
- Backend API changes
- Non-button interactive elements (links, tabs, etc.)

**Assumptions / constraints**

- Generic "Cancel" buttons in modal dialogs are acceptable as established UI pattern
- Pagination controls ("Show More", "Show Less") may remain as exceptions
- Button component structure (`src/components/ui/button.tsx`) remains unchanged
- DetailScreenLayout component provides action bar with `flex-wrap` (acceptable pattern)
- Changes are purely presentational; no business logic modifications needed
- Playwright specs must be extended to verify button labels in critical flows
- All changes ship atomically by feature area to avoid partial states

### 2) Affected Areas & File Map (with repository evidence)

#### Layout Components

- **Area**: DetailScreenLayout
- **Why**: Action bar container reviewed for wrapping behavior; no changes needed but usage patterns must be verified
- **Evidence**: `src/components/layout/detail-screen-layout.tsx:111-115` — actions rendered with `flex flex-wrap gap-2`, which is appropriate

#### Parts Management (21 button updates)

- **Area**: part-list.tsx
- **Why**: "Add with AI" button missing noun
- **Evidence**: `src/components/parts/part-list.tsx:219` — current label "Add with AI" → "Add Part with AI"

- **Area**: part-form.tsx
- **Why**: Generic "Cancel" button (keep as-is per standards)
- **Evidence**: `src/components/parts/part-form.tsx:644` — "Cancel" acceptable in dialog context

- **Area**: ai-part-progress-step.tsx
- **Why**: "Try Again" and "Cancel" buttons need specificity
- **Evidence**:
  - `src/components/parts/ai-part-progress-step.tsx:45` — "Try Again" → "Retry Analysis"
  - `src/components/parts/ai-part-progress-step.tsx:50` — "Cancel" → "Cancel Analysis"

- **Area**: ai-part-review-step.tsx
- **Why**: "Create" and "Back" buttons missing nouns
- **Evidence**:
  - `src/components/parts/ai-part-review-step.tsx:259` — "Create" → "Create Type"
  - `src/components/parts/ai-part-review-step.tsx:500` — "Back" → "Go Back"

- **Area**: part-location-grid.tsx
- **Why**: Multiple buttons missing nouns ("Save", "Cancel", "Remove", "Add")
- **Evidence**:
  - `src/components/parts/part-location-grid.tsx:283` — "Save" → "Save Quantity"
  - `src/components/parts/part-location-grid.tsx:290` — "Cancel" → "Cancel Edit"
  - `src/components/parts/part-location-grid.tsx:321` — "Remove" → "Remove Location"
  - `src/components/parts/part-location-grid.tsx:437` — "Add" → "Add Location"

- **Area**: part-details.tsx
- **Why**: "Retry" button in error state needs noun; action bar buttons reviewed (already compliant)
- **Evidence**:
  - `src/components/parts/part-details.tsx:357` — "Retry" → "Reload Data"
  - `src/components/parts/part-details.tsx:269-303` — "Edit Part", "Delete Part", "Order Stock", "Duplicate Part" all compliant

- **Area**: tags-input.tsx
- **Why**: "Add" button missing noun
- **Evidence**: `src/components/parts/tags-input.tsx:69` — "Add" → "Add Tag"

#### Shopping Lists Management (16 button updates)

- **Area**: concept-line-form.tsx
- **Why**: Generic "Cancel" (keep as-is)
- **Evidence**: `src/components/shopping-lists/concept-line-form.tsx:370` — "Cancel" acceptable

- **Area**: ready/ready-toolbar.tsx
- **Why**: Business-function naming needed for "Mark Done" and "Back to Concept"
- **Evidence**:
  - `src/components/shopping-lists/ready/ready-toolbar.tsx:41` — "Mark Done" → "Complete List"
  - `src/components/shopping-lists/ready/ready-toolbar.tsx:54` — "Back to Concept" → "Revert to Concept"

- **Area**: ready/order-group-dialog.tsx
- **Why**: Case and specificity issues
- **Evidence**:
  - `src/components/shopping-lists/ready/order-group-dialog.tsx:209` — "Cancel" acceptable
  - `src/components/shopping-lists/ready/order-group-dialog.tsx:218` — "Save ordered quantities" → "Save Quantities"

- **Area**: ready/order-line-dialog.tsx
- **Why**: Case and specificity issues (match group dialog)
- **Evidence**:
  - `src/components/shopping-lists/ready/order-line-dialog.tsx:165` — "Cancel" acceptable
  - `src/components/shopping-lists/ready/order-line-dialog.tsx:174` — "Save ordered quantity" → "Save Quantity"

- **Area**: ready/update-stock-dialog.tsx
- **Why**: Multiple buttons with case and noun issues
- **Evidence**:
  - `src/components/shopping-lists/ready/update-stock-dialog.tsx:754` — "Save" → "Save Stock"
  - `src/components/shopping-lists/ready/update-stock-dialog.tsx:764` — "Save & next" → "Save & Next"
  - `src/components/shopping-lists/ready/update-stock-dialog.tsx:775` — "Mark Done" → "Complete Item"

- **Area**: ready/seller-group-order-note-dialog.tsx
- **Why**: Case and specificity
- **Evidence**: `src/components/shopping-lists/ready/seller-group-order-note-dialog.tsx:176` — "Save changes" → "Save Notes"

#### Storage Boxes (1 button update)

- **Area**: box-details.tsx
- **Why**: Navigation language instead of action verb
- **Evidence**: `src/components/boxes/box-details.tsx:214` — "Back to Boxes" → "View All Boxes"

#### Document Management (7 button updates)

- **Area**: add-document-modal.tsx
- **Why**: "Use Camera" is tool-focused, not business-function; generic "Cancel"
- **Evidence**:
  - `src/components/documents/add-document-modal.tsx:237` — "Use Camera" → "Capture Photo"
  - `src/components/documents/add-document-modal.tsx:272` — "Cancel" acceptable

- **Area**: camera-capture.tsx
- **Why**: Multiple buttons missing nouns
- **Evidence**:
  - `src/components/documents/camera-capture.tsx:191` — "Retake" → "Retake Photo"
  - `src/components/documents/camera-capture.tsx:194` — "Use Photo" → "Accept Photo"
  - `src/components/documents/camera-capture.tsx:199` — "Capture" → "Capture Photo"

- **Area**: cover-image-selector.tsx
- **Why**: Generic "Cancel"
- **Evidence**: `src/components/documents/cover-image-selector.tsx:146` — "Cancel" acceptable

#### Dashboard Widgets (12 button updates)

- **Area**: low-stock-alerts.tsx
- **Why**: Emoji usage, missing nouns, icon button aria-labels
- **Evidence**:
  - `src/components/dashboard/low-stock-alerts.tsx:138` — "Add" → "Add Stock"
  - `src/components/dashboard/low-stock-alerts.tsx:147` — "Cancel" → "Cancel Add"
  - `src/components/dashboard/low-stock-alerts.tsx:164` — "🛒 Add to List" → "Add to Shopping List" (remove emoji)
  - `src/components/dashboard/low-stock-alerts.tsx:174` — "➕ Quick Add" → "Quick Add Stock" (remove emoji)
  - `src/components/dashboard/low-stock-alerts.tsx:184` — icon button needs aria-label="View Part"

- **Area**: documentation-status.tsx
- **Why**: Emoji usage, abbreviation, icon button aria-label
- **Evidence**:
  - `src/components/dashboard/documentation-status.tsx:118` — "📄 Add Docs" → "Add Documentation" (remove emoji, expand abbreviation)
  - `src/components/dashboard/documentation-status.tsx:127` — icon button needs aria-label="View Part"

#### Pick Lists (1 button update)

- **Area**: pick-list-detail.tsx
- **Why**: "Retry" missing noun
- **Evidence**: `src/components/pick-lists/pick-list-detail.tsx:321` — "Retry" → "Reload List"

#### Documentation

- **Area**: Contributor documentation
- **Why**: Button labeling standards must be documented for future development
- **Evidence**: Referenced in `docs/contribute/index.md` and linked from architecture overview

#### Test Coverage

- **Area**: Playwright specs for critical flows
- **Why**: Button label changes must be reflected in test selectors and assertions
- **Evidence**: Tests using `data-testid` selectors will need assertions on button text

### 3) Data Model / Contracts

No data model changes required. This is a purely presentational change affecting button labels and aria-labels in the UI layer only.

### 4) API / Integration Surface

No API changes required. All changes are confined to component labels and accessibility attributes.

### 5) Algorithms & UI Flows (step-by-step)

#### Flow: Button Label Standardization

**Steps:**

1. Identify button element in component
2. Determine current label text (visible text or aria-label)
3. Evaluate label against standards:
   - Does it follow `<verb> <noun>` format?
   - Does it describe business function (not technical operation)?
   - Is it in title case?
   - Does it avoid emojis and abbreviations?
4. Apply correction based on audit recommendations
5. For icon-only buttons, add or update `aria-label` attribute
6. Verify button still fits appropriately in action bar context
7. Update related Playwright selectors if tests rely on button text

**States / transitions:**
- No state changes in application logic
- Visual rendering remains identical except for text content
- Loading states for buttons ("Creating...", "Saving...") remain as-is (no standardization needed)

**Hotspots:**
- Dashboard widgets with emoji buttons (high user visibility)
- Action bars in DetailScreenLayout usages (wrapping risk)
- Dialog submit buttons used in multiple workflows

**Evidence:** `src/components/parts/part-details.tsx:267-304`, `src/components/shopping-lists/ready/ready-toolbar.tsx:41-54`

#### Flow: Icon Button Accessibility Enhancement

**Steps:**

1. Locate icon-only button elements (no visible text children)
2. Verify presence of `aria-label` attribute
3. If missing or non-compliant, add `aria-label` following `<verb> <noun>` format
4. Ensure label is contextually specific (e.g., "View Part" not just "View")
5. Test with screen reader to verify clarity

**States / transitions:**
- No visual change (icon remains the same)
- Accessibility tree now contains proper labels

**Hotspots:**
- Dashboard widget arrow buttons
- Menu trigger buttons (ellipsis icons)
- Clear/close buttons in forms

**Evidence:** `src/components/dashboard/low-stock-alerts.tsx:184`, `src/components/dashboard/documentation-status.tsx:127`

### 6) Derived State & Invariants

No derived state or invariants apply to this change. Button labels are static strings or simple conditional expressions based on loading/edit mode, which remain unchanged in structure.

### 7) State Consistency & Async Coordination

No async coordination needed. Button label changes are synchronous updates to JSX literals and do not interact with TanStack Query caches or form state.

### 8) Errors & Edge Cases

#### Edge Case: Generic "Cancel" Buttons

- **Failure**: Overly generic "Cancel" in complex dialogs may confuse users
- **Surface**: All modal dialogs with Cancel buttons
- **Handling**: Maintain generic "Cancel" as established UI pattern; add specificity only where dialog purpose is unclear from title
- **Guardrails**: Review each dialog title for clarity before deciding to keep generic "Cancel"
- **Evidence**: `docs/features/button_system_review/button_audit.md` Edge Cases section

#### Edge Case: Pagination Controls

- **Failure**: "Show More" / "Show Less" don't follow strict `<verb> <noun>` pattern
- **Surface**: Dashboard widgets, list components
- **Handling**: Allow exception for standard progressive disclosure UI pattern
- **Guardrails**: Document as acceptable exception in contributor guidelines
- **Evidence**: `src/components/dashboard/low-stock-alerts.tsx:344-356`

#### Edge Case: Dynamic Button Labels (Loading States)

- **Failure**: Loading states using present continuous ("Creating...") might not match base label format
- **Surface**: All buttons with loading prop
- **Handling**: Leave loading states as-is; existing patterns ("Creating...", "Saving...") are intuitive and don't require standardization
- **Guardrails**: No specific pattern enforcement needed; loading states work well in current form
- **Evidence**: Button component supports loading prop at `src/components/ui/button.tsx:20,72`

#### Edge Case: Long Button Labels in Action Bars

- **Failure**: "Add Part with AI" or "Add to Shopping List" might wrap on narrow screens
- **Surface**: Action bars in DetailScreenLayout, mobile viewports
- **Handling**: Verify wrapping behavior is acceptable; DetailScreenLayout already uses `flex-wrap gap-2` which is appropriate; responsive abbreviation deferred until specific issues are identified
- **Guardrails**: Mobile usage expected to be infrequent; raise specific issues if wrapping causes usability problems
- **Evidence**: `src/components/layout/detail-screen-layout.tsx:111-115`

#### Edge Case: Icon + Text Buttons with Emojis

- **Failure**: Removing emojis might reduce visual distinction
- **Surface**: Dashboard widgets
- **Handling**: Remove emojis per style guide; rely on proper icon props instead of emoji prefixes
- **Guardrails**: Use Button component's `icon` prop for visual distinction if needed
- **Evidence**: `src/components/dashboard/low-stock-alerts.tsx:164,174`, `src/components/dashboard/documentation-status.tsx:118`

### 9) Observability / Instrumentation

#### Signal: Button label test assertions

- **Type**: Playwright test assertion
- **Trigger**: Test specs that verify button presence and functionality
- **Labels / fields**: Button text content, aria-label values
- **Consumer**: Playwright test runner, CI pipeline
- **Evidence**: Tests using `getByRole('button', { name: '...' })` will need updates

#### Signal: Accessibility audit

- **Type**: Manual accessibility review
- **Trigger**: Before marking slice complete
- **Labels / fields**: aria-label presence on icon-only buttons
- **Consumer**: QA and accessibility reviewers
- **Evidence**: Icon buttons at dashboard and detail screens

### 10) Lifecycle & Background Work

No lifecycle hooks or background work involved. Button label changes are static JSX modifications.

### 11) Security & Permissions

Not applicable. Button labels do not affect security or permissions logic.

### 12) UX / UI Impact

#### Entry point: All screens with buttons (app-wide change)

**Change**: Button labels will be more consistent, professional, and descriptive

**User interaction:**
- Users will see standardized button labels following `<verb> <noun>` pattern
- Business-function naming makes actions clearer ("Order Stock" vs. "Create Shopping List")
- Removal of emojis creates more professional appearance
- Icon-only buttons gain proper screen reader labels

**Dependencies:**
- Button component (`src/components/ui/button.tsx`) remains unchanged
- DetailScreenLayout continues to use `flex-wrap` for action bars
- No backend changes required

**Evidence:**
- `src/components/parts/part-details.tsx:267-304` (action bar)
- `src/components/dashboard/low-stock-alerts.tsx:138-184` (dashboard widgets)
- `src/components/shopping-lists/ready/ready-toolbar.tsx:41-54` (toolbar)

#### Specific high-impact changes:

1. **Dashboard widgets**: "🛒 Add to List" → "Add to Shopping List"
   - More professional without emoji
   - Clearer distinction from other "Add" actions
   - Evidence: `src/components/dashboard/low-stock-alerts.tsx:164`

2. **Shopping list workflow**: "Mark Done" → "Complete List" / "Complete Item"
   - Business-function naming more intuitive
   - Consistent with overall terminology
   - Evidence: `src/components/shopping-lists/ready/ready-toolbar.tsx:41`, `src/components/shopping-lists/ready/update-stock-dialog.tsx:775`

3. **Camera capture flow**: "Use Camera" → "Capture Photo", "Use Photo" → "Accept Photo"
   - Action-oriented language clearer than tool-focused
   - Better describes user's intent
   - Evidence: `src/components/documents/add-document-modal.tsx:237`, `src/components/documents/camera-capture.tsx:194`

### 13) Deterministic Test Plan (new/changed behavior only)

#### Surface: Dashboard low stock alerts

**Scenarios:**
- Given a low stock alert is displayed
- When user views the alert card
- Then the "Add to Shopping List" button (without emoji) is visible
- And the "Quick Add Stock" button (without emoji) is visible
- And the arrow icon button has aria-label="View Part"

**Instrumentation / hooks:**
- Existing `data-testid="low-stock-alerts.*"` selectors
- Button text assertions using `getByRole('button', { name: 'Add to Shopping List' })`

**Gaps:** None - dashboard widget tests cover this flow

**Evidence:** `src/components/dashboard/low-stock-alerts.tsx:164,174,184`

#### Surface: Part detail actions

**Scenarios:**
- Given a part detail page is loaded
- When the action bar is rendered
- Then "Edit Part", "Delete Part" buttons are visible (already compliant)
- And the "Reload Data" button appears in error state (updated from "Retry")

**Instrumentation / hooks:**
- `data-testid="parts.detail.actions.*"` attributes
- Button text assertions

**Gaps:** Add test for error state button label

**Evidence:** `src/components/parts/part-details.tsx:269-357`

#### Surface: Shopping list ready toolbar

**Scenarios:**
- Given a shopping list in "ready" status is displayed
- When the toolbar is rendered
- Then "Complete List" button (updated from "Mark Done") is visible
- And "Revert to Concept" button (updated from "Back to Concept") is visible

**Instrumentation / hooks:**
- `data-testid="ready-toolbar.*"` attributes
- Button text assertions in shopping list E2E specs

**Gaps:** Update existing specs with new button text

**Evidence:** `src/components/shopping-lists/ready/ready-toolbar.tsx:41-54`

#### Surface: Camera capture workflow

**Scenarios:**
- Given user initiates camera capture from document modal
- When camera interface loads
- Then "Capture Photo" button (updated from "Capture") is visible
- When photo is captured
- Then "Accept Photo" (updated from "Use Photo") and "Retake Photo" (updated from "Retake") buttons are visible

**Instrumentation / hooks:**
- `data-testid` attributes on camera capture buttons
- Button text assertions

**Gaps:** Update camera capture E2E spec with new button labels (if camera spec exists)

**Evidence:** `src/components/documents/camera-capture.tsx:191-199`

#### Surface: Part location grid actions

**Scenarios:**
- Given part detail page with location grid displayed
- When user edits quantity for a location
- Then "Save Quantity" button (updated from "Save") is visible
- And "Cancel Edit" button (updated from "Cancel") is visible
- When user clicks remove location
- Then "Remove Location" button (updated from "Remove") is visible
- When user adds new location
- Then "Add Location" button (updated from "Add") is visible

**Instrumentation / hooks:**
- `data-testid` attributes on location grid buttons
- Button role selectors `getByRole('button', { name: /save/i })`

**Gaps:** Update `tests/e2e/parts/part-locations.spec.ts` with new button labels

**Evidence:** `src/components/parts/part-location-grid.tsx:283-437`

#### Surface: Dashboard widget emoji removal

**Scenarios:**
- Given low stock alerts widget displayed
- When user views quick-add actions
- Then "Add to Shopping List" button visible without emoji prefix (updated from "🛒 Add to List")
- And "Quick Add Stock" button visible without emoji prefix (updated from "➕ Quick Add")
- Given documentation status widget displayed
- When user views add documentation action
- Then "Add Documentation" button visible without emoji prefix (updated from "📄 Add Docs")

**Instrumentation / hooks:**
- Button text assertions must verify exact match without emoji: `getByRole('button', { name: /^Add to Shopping List$/i })`
- `data-testid="low-stock-alerts.*"` selectors

**Gaps:** Update dashboard widget specs to assert emoji-free button text

**Evidence:** `src/components/dashboard/low-stock-alerts.tsx:164,174`, `src/components/dashboard/documentation-status.tsx:118`

#### Surface: Tags input button specificity

**Scenarios:**
- Given part form with tags input displayed
- When user types tag and clicks add
- Then "Add Tag" button (updated from "Add") is visible

**Instrumentation / hooks:**
- Button role selectors
- Form submission events

**Gaps:** Update part form specs if they assert on tag add button text

**Evidence:** `src/components/parts/tags-input.tsx:69`

#### Surface: Box navigation action verb

**Scenarios:**
- Given box detail page displayed
- When toolbar is rendered
- Then "View All Boxes" button (updated from "Back to Boxes") is visible

**Instrumentation / hooks:**
- Button role selectors
- Navigation events

**Gaps:** Update `tests/e2e/boxes/boxes-detail.spec.ts` if it asserts on navigation button text

**Evidence:** `src/components/boxes/box-details.tsx:214`

#### Surface: Icon-only buttons accessibility

**Scenarios:**
- Given icon-only buttons are rendered in dashboard widgets
- When accessibility tree is inspected
- Then all icon buttons have descriptive aria-labels following `<verb> <noun>` format

**Instrumentation / hooks:**
- Accessibility testing with `getByRole('button', { name: '...' })`
- Screen reader testing

**Gaps:** Add explicit accessibility test assertions for icon buttons

**Evidence:** `src/components/dashboard/low-stock-alerts.tsx:184`

### 14) Implementation Slices (only if large)

#### Slice 1: High Priority - Core Actions (45 buttons)

**Goal**: Fix the most common and visible button label issues

**Touches:**
- All "Save" buttons without nouns → "Save [Object]"
- All "Add" buttons without nouns → "Add [Object]"
- All "Remove" without nouns → "Remove [Object]"
- All "Retry" without nouns → "Retry [Action]" or "Reload [Object]"
- Remove emojis from all buttons
- Fix case issues ("Save & next" → "Save & Next")

**Files:**
- `src/components/parts/part-location-grid.tsx` (Save, Remove, Add)
- `src/components/parts/tags-input.tsx` (Add)
- `src/components/parts/part-details.tsx` (Retry → Reload Data)
- `src/components/shopping-lists/ready/update-stock-dialog.tsx` (Save, case fix)
- `src/components/dashboard/low-stock-alerts.tsx` (Add, emoji removal)
- `src/components/dashboard/documentation-status.tsx` (emoji removal, abbreviation)
- `src/components/documents/camera-capture.tsx` (Retake, Capture)
- `src/components/pick-lists/pick-list-detail.tsx` (Retry → Reload List)

**Dependencies**: None - pure JSX changes

**Verification**:
- Run `pnpm check` to verify TypeScript and ESLint pass
- Run `pnpm playwright test tests/e2e/dashboard/` to verify dashboard specs green
- Run `pnpm playwright test tests/e2e/parts/part-locations.spec.ts` to verify part location specs green
- Update affected page objects/specs in same commit as UI changes

#### Slice 2: Medium Priority - Navigation & Secondary Actions (30 buttons)

**Goal**: Update navigation and workflow-specific buttons with business-function naming

**Touches:**
- "Back" → action-oriented alternative ("Go Back", "View All [Entity]")
- "Mark Done" → "Complete [Object]"
- "Try Again" → "Retry [Action]"
- Camera-related: "Use Camera" → "Capture Photo", "Use Photo" → "Accept Photo"
- Specific "Cancel" labels where context unclear

**Files:**
- `src/components/parts/ai-part-review-step.tsx` (Back, Create Type)
- `src/components/parts/ai-part-progress-step.tsx` (Try Again → Retry Analysis)
- `src/components/shopping-lists/ready/ready-toolbar.tsx` (Mark Done → Complete List, Back to Concept → Revert to Concept)
- `src/components/shopping-lists/ready/update-stock-dialog.tsx` (Mark Done → Complete Item)
- `src/components/boxes/box-details.tsx` (Back to Boxes → View All Boxes)
- `src/components/documents/add-document-modal.tsx` (Use Camera → Capture Photo)
- `src/components/documents/camera-capture.tsx` (Use Photo → Accept Photo)

**Dependencies**: None - slices can be delivered in any order

**Verification**:
- Run `pnpm check` to verify TypeScript and ESLint pass
- Run `pnpm playwright test tests/e2e/shopping-lists/` to verify shopping list specs green (update page object helper `markListDoneFromReady()` in same commit)
- Run `pnpm playwright test tests/e2e/boxes/` to verify box navigation specs green
- Update affected page objects/specs in same commit as UI changes

#### Slice 3: Low Priority - Polish & Consistency (20 buttons)

**Goal**: Final refinements and lesser-used areas

**Touches:**
- "Save changes" → "Save [Object]" for specificity
- Specific Cancel labels ("Cancel Edit", "Cancel Add") where helpful
- Remaining case issues
- Consistency across similar dialogs (order-group-dialog vs order-line-dialog)

**Files:**
- `src/components/shopping-lists/ready/order-group-dialog.tsx` (Save ordered quantities → Save Quantities)
- `src/components/shopping-lists/ready/order-line-dialog.tsx` (Save ordered quantity → Save Quantity)
- `src/components/shopping-lists/ready/seller-group-order-note-dialog.tsx` (Save changes → Save Notes)
- `src/components/parts/part-location-grid.tsx` (Cancel → Cancel Edit)
- `src/components/dashboard/low-stock-alerts.tsx` (Cancel → Cancel Add)

**Dependencies**: None - slices can be delivered in any order

**Verification**:
- Run `pnpm check` to verify TypeScript and ESLint pass
- Run `pnpm playwright test tests/e2e/shopping-lists/` to verify shopping list dialog specs green
- Most Cancel button changes use case-insensitive regex patterns in tests (no updates needed)

#### Slice 4: Accessibility - Aria-Label Audit (25+ icon buttons)

**Goal**: Ensure all icon-only buttons have proper aria-labels

**Touches:**
- All icon-only buttons get descriptive aria-labels
- Apply `<verb> <noun>` format to aria-labels
- Menu triggers (ellipsis icons) use "More Actions" as standard label

**Files:**
- `src/components/dashboard/low-stock-alerts.tsx` (arrow button, line 184)
- `src/components/dashboard/documentation-status.tsx` (arrow button, line 127)
- All dropdown menu triggers (ellipsis icons) → aria-label="More Actions"
- Clear/close icon buttons across forms

**Dependencies**: None - slices can be delivered in any order

**Verification**:
- Run `pnpm check` to verify TypeScript and ESLint pass
- Run `pnpm playwright test tests/e2e/dashboard/` to verify dashboard specs green
- Consider adding new accessibility-focused spec that verifies icon button aria-labels via `getByRole('button', { name: 'View Part' })`

#### Slice 5: Documentation & Testing

**Goal**: Document standards and update test coverage

**Touches:**
- Add button labeling standards to contributor documentation
- Update Playwright specs that assert on button text
- Add accessibility test coverage for icon button aria-labels
- Document exceptions (Cancel, pagination controls)

**Files:**
- `docs/contribute/ui/button_standards.md` (new file)
- Update `docs/contribute/ui/index.md` to link to button standards
- Playwright specs in `tests/` that use button text selectors (see audit below)
- Accessibility test suite additions

**Test File Audit** (grep-based evidence):

Command used: `grep -r "getByRole.*button.*name" tests/ --include="*.ts" -l`

Affected test files requiring updates:
- `tests/support/page-objects/shopping-lists-page.ts:363` — uses `getByRole('button', { name: /mark done/i })` → update to match "Complete List"
- `tests/support/page-objects/shopping-lists-page.ts:536` — uses testid `shopping-lists.ready.update-stock.mark-done` → update to match "Complete Item"
- `tests/e2e/types/TypesPage.ts` — uses `getByRole('button', { name: 'Delete' })` → no change needed (Delete remains)
- `tests/e2e/types/types-workflow.spec.ts` — uses Delete button → no change needed
- `tests/e2e/types/types-crud.spec.ts` — uses Delete button → no change needed
- `tests/support/page-objects/parts-page.ts` — uses `getByRole('button', { name: /add with ai/i })` → update to "Add Part with AI"
- Multiple specs use generic `/save/i`, `/cancel/i`, `/delete/i` patterns with regex — no updates needed for case-insensitive matches
- Icon button aria-labels are new additions — no existing test assertions to update

Specs requiring explicit updates for business-function label changes:
1. Shopping list specs using "Mark Done" → update page object helper at `tests/support/page-objects/shopping-lists-page.ts:363`
2. Parts specs using "Add with AI" → update page object at `tests/support/page-objects/parts-page.ts` addWithAIButton locator
3. Dashboard specs (if exist) using emoji buttons → verify removal of emoji prefixes in button text assertions

**Verification Strategy**:
- Run `pnpm playwright test tests/support/page-objects/` to verify page object changes compile
- Run `pnpm playwright test tests/e2e/shopping-lists/` to verify shopping list spec updates
- Run `pnpm playwright test tests/e2e/parts/` to verify parts spec updates
- Run `pnpm playwright test tests/e2e/dashboard/` to verify dashboard spec updates
- Run full suite `pnpm playwright test` to catch any missed assertions
- Run `pnpm check` to verify ESLint and TypeScript pass

**Dependencies**: Can be delivered in any order relative to Slices 1-4. If delivered first, provides reference standard for implementation. If delivered last, documents implemented patterns.

### 15) Risks & Open Questions

#### Risk: Test Brittleness

- **Risk**: Changing button labels breaks existing Playwright tests that select by text
- **Impact**: CI failures, blocked PRs until tests updated
- **Mitigation**: Identify all tests using button text selectors before changes; update tests in same commit as label changes; prioritize `data-testid` selectors over text selectors going forward

#### Risk: User Confusion During Rollout

- **Risk**: Users accustomed to current labels (e.g., "Mark Done") may be briefly confused by new labels ("Complete List")
- **Impact**: Minor temporary confusion, potential support questions
- **Mitigation**: Changes improve clarity overall; business-function naming is more intuitive; no training required for straightforward label improvements

#### Risk: Long Labels Causing Layout Issues

- **Risk**: More descriptive labels (e.g., "Add Part with AI", "Add to Shopping List") may cause wrapping or overflow in action bars
- **Impact**: Unprofessional appearance, reduced usability on mobile
- **Mitigation**: DetailScreenLayout already uses `flex-wrap gap-2` which handles wrapping appropriately; defer mobile viewport validation to visual QA post-implementation; adjust spacing/sizing only if critical usability issues identified during QA

#### Risk: Emoji Removal Reduces Visual Distinction

- **Risk**: Dashboard widget buttons lose visual interest without emoji prefixes
- **Impact**: Slightly less engaging UI, harder to scan quickly
- **Mitigation**: Emojis violate style guide and accessibility best practices; proper use of Button component's `icon` prop can provide visual distinction if needed; cleaner, more professional appearance outweighs novelty

### 16) Confidence

**Confidence: High** — Changes are well-scoped to presentational JSX modifications; comprehensive audit provides clear action plan; no business logic or API changes required; existing test infrastructure supports validation; risks are minor and easily mitigated; slices can be delivered in any order allowing flexible prioritization; verification requirements added to each slice ensure test suite stays green throughout delivery.
