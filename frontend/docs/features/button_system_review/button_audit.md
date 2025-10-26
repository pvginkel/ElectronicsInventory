# Button System Audit

## Summary Statistics

- **Total buttons found**: 195+
- **Compliant**: ~65 (33%)
- **Needs update**: ~95 (49%)
- **Edge cases / Special**: ~35 (18%)

### By Category
- **Action bars/toolbars**: 12 buttons (8 need updates)
- **Forms/dialogs**: 85 buttons (35 need updates)
- **List actions**: 45 buttons (20 need updates)
- **Navigation**: 8 buttons (5 need updates)
- **Icon-only buttons**: 25+ (need aria-label review)
- **Menu items**: 10+ (mostly compliant)
- **Dashboard widgets**: 20 buttons (12 need updates)

---

## Buttons That Need Updates

### Parts Management

#### Part List Actions
- **Location**: `src/components/parts/part-list.tsx:219`
- **Current label**: "Add with AI"
- **Business function**: Create a new part using AI assistance
- **Proposed label**: "Add Part with AI"
- **Rationale**: Should follow `<verb> <noun>` format; "Add with AI" is missing the noun

#### Part Form
- **Location**: `src/components/parts/part-form.tsx:644`
- **Current label**: "Cancel"
- **Business function**: Close dialog without saving changes
- **Proposed label**: "Cancel Changes" or keep "Cancel"
- **Rationale**: "Cancel" alone is a verb without noun, but might be acceptable for dialog close buttons as a standard pattern

#### AI Part Input Step
- **Location**: `src/components/parts/ai-part-input-step.tsx:61`
- **Current label**: "Analyze Part" (dynamic: "Analyzing...")
- **Business function**: Submit text/image for AI analysis
- **Proposed label**: Keep "Analyze Part" (compliant)
- **Note**: Already compliant

#### AI Part Progress Step
- **Location**: `src/components/parts/ai-part-progress-step.tsx:45`
- **Current label**: "Try Again"
- **Business function**: Retry failed AI analysis
- **Proposed label**: "Retry Analysis"
- **Rationale**: Should follow `<verb> <noun>` format

- **Location**: `src/components/parts/ai-part-progress-step.tsx:50`
- **Current label**: "Cancel"
- **Business function**: Cancel the AI analysis process
- **Proposed label**: "Cancel Analysis"
- **Rationale**: More specific about what is being cancelled

- **Location**: `src/components/parts/ai-part-progress-step.tsx:99`
- **Current label**: "Cancel Analysis"
- **Business function**: Cancel the running analysis
- **Proposed label**: Keep "Cancel Analysis" (compliant)
- **Note**: Already compliant

#### AI Part Review Step
- **Location**: `src/components/parts/ai-part-review-step.tsx:259`
- **Current label**: "Create"
- **Business function**: Create a new component type from suggestion
- **Proposed label**: "Create Type"
- **Rationale**: Missing noun

- **Location**: `src/components/parts/ai-part-review-step.tsx:500`
- **Current label**: "Back"
- **Business function**: Return to previous step in AI wizard
- **Proposed label**: "Go Back" or "Previous Step"
- **Rationale**: "Back" is not verb+noun format; navigation buttons should still follow pattern

#### Part Location Grid
- **Location**: `src/components/parts/part-location-grid.tsx:283`
- **Current label**: "Save"
- **Business function**: Save quantity changes for a part location
- **Proposed label**: "Save Quantity"
- **Rationale**: Missing noun; be specific about what is being saved

- **Location**: `src/components/parts/part-location-grid.tsx:290`
- **Current label**: "Cancel"
- **Business function**: Cancel quantity editing
- **Proposed label**: "Cancel Edit"
- **Rationale**: More specific

- **Location**: `src/components/parts/part-location-grid.tsx:321`
- **Current label**: "Remove"
- **Business function**: Remove part from location
- **Proposed label**: "Remove Location"
- **Rationale**: Missing noun

- **Location**: `src/components/parts/part-location-grid.tsx:437`
- **Current label**: "Add"
- **Business function**: Add part to selected location
- **Proposed label**: "Add Location" (or already exists at line 104)
- **Rationale**: Missing noun

- **Location**: `src/components/parts/part-location-grid.tsx:469`
- **Current label**: "Add Stock"
- **Business function**: Add stock to location
- **Proposed label**: Keep "Add Stock" (compliant)
- **Note**: Already compliant

#### Part Details
- **Location**: `src/components/parts/part-details.tsx:357`
- **Current label**: "Retry"
- **Business function**: Retry loading linked badges
- **Proposed label**: "Retry Loading" or "Reload Data"
- **Rationale**: Missing noun

#### Tags Input
- **Location**: `src/components/parts/tags-input.tsx:69`
- **Current label**: "Add"
- **Business function**: Add a tag
- **Proposed label**: "Add Tag"
- **Rationale**: Missing noun

---

### Shopping Lists Management

#### Concept Line Form
- **Location**: `src/components/shopping-lists/concept-line-form.tsx:370`
- **Current label**: "Cancel"
- **Business function**: Cancel line editing
- **Proposed label**: "Cancel Edit"
- **Rationale**: More specific

#### Ready Toolbar
- **Location**: `src/components/shopping-lists/ready/ready-toolbar.tsx:41`
- **Current label**: "Mark Done"
- **Business function**: Mark shopping list as completed
- **Proposed label**: "Complete List"
- **Rationale**: Should use business-function naming; "Complete List" is clearer than technical "Mark Done"

- **Location**: `src/components/shopping-lists/ready/ready-toolbar.tsx:54`
- **Current label**: "Back to Concept"
- **Business function**: Return list to concept stage
- **Proposed label**: "Revert to Concept" or "Return to Concept"
- **Rationale**: "Back to" is navigational, not action-oriented

#### Order Group Dialog
- **Location**: `src/components/shopping-lists/ready/order-group-dialog.tsx:209`
- **Current label**: "Cancel"
- **Business function**: Close dialog without saving
- **Proposed label**: "Cancel Changes"
- **Rationale**: More specific

- **Location**: `src/components/shopping-lists/ready/order-group-dialog.tsx:218`
- **Current label**: "Save ordered quantities"
- **Business function**: Save order quantities for group
- **Proposed label**: "Save Quantities"
- **Rationale**: Shorter while maintaining clarity; lowercase "ordered" should be removed

#### Order Line Dialog
- **Location**: `src/components/shopping-lists/ready/order-line-dialog.tsx:165`
- **Current label**: "Cancel"
- **Business function**: Close dialog without saving
- **Proposed label**: "Cancel Changes"
- **Rationale**: More specific

- **Location**: `src/components/shopping-lists/ready/order-line-dialog.tsx:174`
- **Current label**: "Save ordered quantity"
- **Business function**: Save order quantity for single line
- **Proposed label**: "Save Quantity"
- **Rationale**: Remove lowercase "ordered"; match group dialog pattern

#### Update Stock Dialog
- **Location**: `src/components/shopping-lists/ready/update-stock-dialog.tsx:745`
- **Current label**: "Cancel"
- **Business function**: Close dialog without updating stock
- **Proposed label**: "Cancel Update"
- **Rationale**: More specific

- **Location**: `src/components/shopping-lists/ready/update-stock-dialog.tsx:754`
- **Current label**: "Save"
- **Business function**: Save stock updates
- **Proposed label**: "Save Stock"
- **Rationale**: Missing noun

- **Location**: `src/components/shopping-lists/ready/update-stock-dialog.tsx:764`
- **Current label**: "Save & next"
- **Business function**: Save current stock and move to next item
- **Proposed label**: "Save & Next"
- **Rationale**: Capitalize "Next"

- **Location**: `src/components/shopping-lists/ready/update-stock-dialog.tsx:775`
- **Current label**: "Mark Done"
- **Business function**: Mark line as complete
- **Proposed label**: "Complete Item"
- **Rationale**: Business-function oriented

#### Seller Group Order Note Dialog
- **Location**: `src/components/shopping-lists/ready/seller-group-order-note-dialog.tsx:168`
- **Current label**: "Cancel"
- **Business function**: Close dialog without saving
- **Proposed label**: "Cancel Changes"
- **Rationale**: More specific

- **Location**: `src/components/shopping-lists/ready/seller-group-order-note-dialog.tsx:176`
- **Current label**: "Save changes"
- **Business function**: Save order notes
- **Proposed label**: "Save Notes"
- **Rationale**: Capitalize properly and be more specific about what's being saved

---

### Storage Boxes Management

#### Box Details
- **Location**: `src/components/boxes/box-details.tsx:214`
- **Current label**: "Back to Boxes"
- **Business function**: Navigate back to box list
- **Proposed label**: "View All Boxes"
- **Rationale**: "Back to" is navigational; use action verb

---

### Document Management

#### Add Document Modal
- **Location**: `src/components/documents/add-document-modal.tsx:166`
- **Current label**: "Remove File"
- **Business function**: Remove selected file before upload
- **Proposed label**: Keep "Remove File" (compliant)
- **Note**: Already compliant

- **Location**: `src/components/documents/add-document-modal.tsx:237`
- **Current label**: "Use Camera"
- **Business function**: Switch to camera capture mode
- **Proposed label**: "Capture Photo" or "Open Camera"
- **Rationale**: More action-oriented; "Use Camera" is tool-focused not business-function focused

- **Location**: `src/components/documents/add-document-modal.tsx:272`
- **Current label**: "Cancel"
- **Business function**: Close modal without adding document
- **Proposed label**: "Cancel Upload"
- **Rationale**: More specific

#### Camera Capture
- **Location**: `src/components/documents/camera-capture.tsx:185`
- **Current label**: "Cancel"
- **Business function**: Exit camera mode
- **Proposed label**: "Cancel Capture"
- **Rationale**: More specific

- **Location**: `src/components/documents/camera-capture.tsx:191`
- **Current label**: "Retake"
- **Business function**: Take another photo
- **Proposed label**: "Retake Photo"
- **Rationale**: Missing noun

- **Location**: `src/components/documents/camera-capture.tsx:194`
- **Current label**: "Use Photo"
- **Business function**: Confirm photo selection
- **Proposed label**: "Accept Photo" or "Confirm Photo"
- **Rationale**: "Use" is not the best action verb for confirmation

- **Location**: `src/components/documents/camera-capture.tsx:199`
- **Current label**: "Capture"
- **Business function**: Take photo
- **Proposed label**: "Capture Photo"
- **Rationale**: Missing noun

#### Cover Image Selector
- **Location**: `src/components/documents/cover-image-selector.tsx:136`
- **Current label**: "Remove Cover"
- **Business function**: Remove cover image designation
- **Proposed label**: Keep "Remove Cover" (compliant)
- **Note**: Already compliant

- **Location**: `src/components/documents/cover-image-selector.tsx:146`
- **Current label**: "Cancel"
- **Business function**: Close selector without changes
- **Proposed label**: "Cancel Selection"
- **Rationale**: More specific

---

### Dashboard Widgets

#### Low Stock Alerts
- **Location**: `src/components/dashboard/low-stock-alerts.tsx:138`
- **Current label**: "Add"
- **Business function**: Quick-add specified quantity
- **Proposed label**: "Add Stock"
- **Rationale**: Missing noun

- **Location**: `src/components/dashboard/low-stock-alerts.tsx:147`
- **Current label**: "Cancel"
- **Business function**: Cancel quick-add
- **Proposed label**: "Cancel Add"
- **Rationale**: More specific

- **Location**: `src/components/dashboard/low-stock-alerts.tsx:164`
- **Current label**: "🛒 Add to List"
- **Business function**: Add part to shopping list
- **Proposed label**: "Add to List" (remove emoji) or "Add to Shopping List"
- **Rationale**: Remove emoji unless explicitly requested; be more specific

- **Location**: `src/components/dashboard/low-stock-alerts.tsx:174`
- **Current label**: "➕ Quick Add"
- **Business function**: Show quick-add quantity input
- **Proposed label**: "Quick Add Stock" (remove emoji)
- **Rationale**: Remove emoji; add noun

- **Location**: `src/components/dashboard/low-stock-alerts.tsx:184`
- **Current label**: "→"
- **Business function**: Navigate to part details
- **Proposed label**: Icon button should have aria-label "View Part"
- **Rationale**: Icon-only button needs proper label

- **Location**: `src/components/dashboard/low-stock-alerts.tsx:344`
- **Current label**: "Show {N} More"
- **Business function**: Expand to show more alerts
- **Proposed label**: Keep as-is (pagination exception)
- **Note**: Pagination controls may not follow strict verb+noun pattern

- **Location**: `src/components/dashboard/low-stock-alerts.tsx:356`
- **Current label**: "Show Less"
- **Business function**: Collapse alert list
- **Proposed label**: Keep as-is (pagination exception)
- **Note**: Pagination controls may not follow strict verb+noun pattern

#### Documentation Status
- **Location**: `src/components/dashboard/documentation-status.tsx:118`
- **Current label**: "📄 Add Docs"
- **Business function**: Navigate to part to add documentation
- **Proposed label**: "Add Documentation" (remove emoji)
- **Rationale**: Remove emoji; use full word instead of abbreviation

- **Location**: `src/components/dashboard/documentation-status.tsx:127`
- **Current label**: "→"
- **Business function**: Navigate to part
- **Proposed label**: Icon button needs aria-label "View Part"
- **Rationale**: Icon-only button needs proper label

---

### Pick Lists

#### Pick List Detail
- **Location**: `src/components/pick-lists/pick-list-detail.tsx:321`
- **Current label**: "Retry"
- **Business function**: Retry loading pick list
- **Proposed label**: "Retry Loading" or "Reload List"
- **Rationale**: Missing noun

---

## Compliant Buttons

These buttons already follow the `<verb> <noun>` format with business-function orientation and title case:

### Parts
- "Add Part" (parts/part-list.tsx:224)
- "Edit Part" (parts/part-details.tsx:269)
- "Delete Part" (parts/part-details.tsx:272)
- "Order Stock" (dropdown menu, parts/part-details.tsx:282)
- "Duplicate Part" (dropdown menu, parts/part-details.tsx:282)
- "Add Location" (parts/part-location-grid.tsx:104)
- "Add Stock" (parts/part-location-grid.tsx:469)
- "Create Part" (parts/part-list.tsx:310)
- "Update Part" (parts/part-form.tsx:654)

### Shopping Lists
- "Create Concept List" (shopping-lists/overview-list.tsx:243)
- "Add Line" (shopping-lists/concept-line-form.tsx:378)
- "Save Changes" (various forms - though could be more specific)
- "Order Stock" (add-to-shopping-list-dialog.tsx:382)

### Boxes
- "Add Box" (boxes/box-list.tsx:153)
- "Edit Box" (boxes/box-details.tsx:160)
- "Delete Box" (boxes/box-details.tsx:163)

### Sellers
- "Add Seller" (sellers/seller-list.tsx:199)
- "Update Seller" (sellers/seller-form.tsx:149)

### Documents
- "Add Document" (documents/add-document-modal.tsx:280)
- "Remove File" (documents/add-document-modal.tsx:166)
- "Remove Cover" (documents/cover-image-selector.tsx:136)

### Kits
- "Create Kit" (kits/kit-create-dialog.tsx:325)

---

## Edge Cases / Questions

### 1. "Cancel" Buttons (15+ instances)
**Question**: Should all "Cancel" buttons be updated to be more specific?
- Current: "Cancel"
- Proposed options:
  - Keep generic "Cancel" for dialog close actions (established pattern)
  - Make specific: "Cancel Edit", "Cancel Upload", "Cancel Changes", etc.

**Recommendation**: Consider keeping plain "Cancel" for secondary dialog close buttons as it's a well-established UI pattern, but add specificity where the context isn't obvious from the dialog title.

### 2. Icon + Text Buttons (Emojis)
Examples: "🛒 Add to List", "📄 Add Docs", "➕ Quick Add"

**Question**: Should emojis be removed from button labels?
- Current practice: Some buttons use emoji prefixes
- Standard: Instructions say "only use emojis if user explicitly requests it"

**Recommendation**: Remove all emojis from button labels unless there's a specific design requirement. Emojis can cause accessibility issues and are not mentioned in the button standard.

### 3. Icon-Only Buttons (25+ instances)
Examples: Clear search (×), Navigation arrows (→), Plus/Minus quantity adjusters

**Question**: Should icon-only buttons have aria-labels that follow the same `<verb> <noun>` standard?
- Many icon-only buttons don't have visible text
- Need accessible labels

**Recommendation**: Yes, aria-labels should follow the same standard. For example:
- Clear button: aria-label="Clear Search"
- Arrow button: aria-label="View Part" or "View Details"
- Plus button: aria-label="Increase Quantity"
- Minus button: aria-label="Decrease Quantity"

### 4. Pagination/Expansion Controls
Examples: "Show {N} More", "Show Less"

**Question**: Do pagination and list expansion controls need to follow `<verb> <noun>` format?
- Current: "Show {N} More", "Show Less"
- These don't fit the business-function model well

**Recommendation**: These could be exceptions as they're standard UI patterns for progressive disclosure. Alternative: "Expand List", "Collapse List" if strict compliance is needed.

### 5. Navigation vs. Action Buttons
Examples: "Back", "Back to Boxes", "Back to Concept"

**Question**: Should navigation buttons follow the same standard as action buttons?
- Current: "Back", "Back to [X]"
- Navigation is less action-oriented

**Recommendation**: Yes, apply the standard. Alternatives:
- "View All Boxes"
- "Return to List"
- "Go Back"

### 6. State-Dependent Button Labels
Several buttons change labels based on loading/processing state:
- "Add Part" → "Creating..."
- "Analyze Part" → "Analyzing..."
- "Create Kit" → "Creating..."

**Question**: Should loading states follow the format?
- Current: Usually present continuous verb

**Recommendation**: Loading states should show present continuous of the action: "Creating Part", "Analyzing Part", "Saving Stock", etc.

### 7. Dynamic Submit Buttons
Some forms have submit buttons with dynamic labels based on mode:
- Part form: "Add Part" / "Update Part" / "Create Duplicate"

**Recommendation**: All variants should follow the standard (they already do in this case).

### 8. Abbreviations
Example: "Add Docs" should be "Add Documentation"

**Question**: Should abbreviations be avoided in button labels?

**Recommendation**: Yes, use full words for clarity and professionalism. "Docs" → "Documentation"

### 9. Menu Triggers (Ellipsis/Three-Dot Buttons)
Several components have menu trigger buttons with just an icon.

**Question**: What aria-label should these have?
- Current: Often just the icon
- Options: "Open Menu", "More Actions", "Part Actions"

**Recommendation**: Use "Open [Context] Menu" or "[Entity] Actions". For example:
- Part details: "Part Actions"
- Line item: "Line Actions"

### 10. HTML Button Elements vs. Button Component
Found ~35 HTML `<button>` elements vs. 160+ `<Button>` components.

**Question**: Should HTML buttons be converted to use the Button component for consistency?

**Recommendation**: Review each case. Some HTML buttons (like Combobox triggers from radix-ui) may need to remain as HTML for component library compatibility. Others should use the Button component for consistent styling and behavior.

---

## Implementation Priorities

### High Priority (Core Actions - 45 buttons)
1. All "Save" buttons without nouns → "Save [Object]"
2. All "Add" buttons without nouns → "Add [Object]"
3. All "Remove" without nouns → "Remove [Object]"
4. All "Retry" without nouns → "Retry [Action]"
5. Remove emojis from all buttons
6. Fix case issues ("Save & next" → "Save & Next")

### Medium Priority (Navigation & Secondary Actions - 30 buttons)
1. "Back" → action-oriented alternative
2. "Mark Done" → "Complete [Object]"
3. "Try Again" → "Retry [Action]"
4. Camera-related: "Use Camera", "Use Photo", "Capture", "Retake"
5. Specific "Cancel" labels where context unclear

### Low Priority (Polish & Consistency - 20 buttons)
1. Generic "Cancel" → specific where helpful
2. "Save changes" → "Save [Object]"
3. Abbreviations ("Docs" → "Documentation")
4. Pagination controls (optional)

### Aria-Label Audit (25+ icon buttons)
1. All icon-only buttons need aria-labels
2. Apply `<verb> <noun>` format to aria-labels
3. Menu triggers need clear labels

---

## Pattern Recommendations

### Standard Dialog Patterns
**Two-button dialogs** (Cancel + Action):
- Cancel button: "Cancel" (acceptable) or "Cancel [Action]" (more specific)
- Primary action: Always `<verb> <noun>` format

**Three-button dialogs** (Cancel + Save + Continue):
- Example: Update Stock Dialog
- Consistent pattern across all multi-action dialogs

### Form Buttons
- Cancel: "Cancel" or "Cancel [Action]"
- Submit: Always specific `<verb> <noun>` matching the form purpose

### List Actions
- Add: "Add [Entity]"
- Clear search: aria-label="Clear Search"
- Filter/Sort: Follow verb+noun pattern

### Icon Buttons
- Always include aria-label
- Follow `<verb> <noun>` format
- Never rely on icon alone for meaning

---

## Next Steps

1. **Review this audit** with the team to confirm proposed changes
2. **Clarify edge cases** and determine final standards for:
   - Generic "Cancel" vs. specific
   - Pagination controls
   - Icon-only button labels
3. **Create implementation plan** grouped by priority
4. **Update systematically** by feature area
5. **Add linting/testing** to enforce standards going forward

---

# Answers

In general the recommendations are spot on. I'm fine with keeping Cancel buttons in modals. It's generally accepted.

Choices for specific labels:

- **Location**: `src/components/parts/ai-part-review-step.tsx:500` -> "Go Back"
- **Location**: `src/components/parts/part-details.tsx:357` -> "Reload Data"
- **Location**: `src/components/shopping-lists/ready/ready-toolbar.tsx:41` -> I agree with your suggestion. This may require more names to be updated to keep the app consistent.
- **Location**: `src/components/shopping-lists/ready/ready-toolbar.tsx:54` -> "Revert to Concept"
- **Location**: `src/components/shopping-lists/ready/update-stock-dialog.tsx:775` -> I agree with your suggestion. This may require more names to be updated to keep the app consistent.
- **Location**: `src/components/documents/add-document-modal.tsx:237` -> "Capture Photo"
- **Location**: `src/components/documents/camera-capture.tsx:194` -> "Accept Photo"
- **Location**: `src/components/dashboard/low-stock-alerts.tsx:164` -> "Add to Shopping List"
- **Location**: `src/components/pick-lists/pick-list-detail.tsx:321` -> "Reload List"
