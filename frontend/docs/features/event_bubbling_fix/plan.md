# Technical Plan: Fix Event Bubbling Issues

## 0) Research Log & Findings

**Discovery scope:**
- Examined Dialog component (`src/components/ui/dialog.tsx`) - Radix-based Dialog with ConfirmDialog variant
- Analyzed SearchableSelect component (`src/components/ui/searchable-select.tsx`) - Radix Popover-based with inline creation
- Reviewed SellerSelector and SellerCreateDialog components
- Investigated DocumentTile and IconButton implementations
- Examined Form and Button components for event handling patterns
- Reviewed PartForm and PartDetails components to understand nested form scenarios

**Key findings:**

1. **IconButton properly prevents bubbling** (`src/components/ui/hover-actions.tsx:49-52`):
   - Already calls `e.stopPropagation()` and `e.preventDefault()`
   - This is NOT the source of the document deletion bubbling issue

2. **ConfirmDialog buttons do NOT prevent bubbling** (`src/components/ui/dialog.tsx:221-230`):
   - Cancel button uses plain `onClick={() => onOpenChange(false)}`
   - Confirm button uses plain `onClick={handleConfirm}`
   - Neither button prevents event propagation to parent elements

3. **SearchableSelectCreateOption does NOT prevent bubbling** (`src/components/ui/searchable-select.tsx:390-406`):
   - Create button uses plain `onClick={onClick}`
   - Only prevents `onMouseDown` to maintain focus

4. **Button component has preventValidation mechanism** (`src/components/ui/button.tsx:58-76`):
   - Uses `onMouseUp` with `preventDefault()` and `stopPropagation()` when `preventValidation={true}`
   - This pattern is available but not consistently used in dialogs

5. **Document deletion flow** (`src/components/documents/document-tile.tsx:43-66`):
   - DocumentTile renders inside a clickable Card that opens the link/media
   - IconButton for delete is properly preventing bubbling
   - ConfirmDialog renders INSIDE the Card component (line 177)
   - When user clicks "Delete" in the dialog, event bubbles up to the Card's onClick handler
   - This explains why the link opens after confirming deletion

6. **Seller creation flow** (`src/components/sellers/seller-create-dialog.tsx`):
   - Dialog wraps a Form element with onSubmit
   - Form is nested inside a parent PartForm (in edit part screen)
   - Submit button type="submit" triggers form submission
   - Form submission event can bubble to parent form

**Conflicts resolved:**
- The issue is NOT in IconButton (already working correctly)
- The issue IS in how Form submissions and Dialog button clicks propagate
- Two distinct problems require different solutions:
  1. Dialog buttons need event propagation prevention
  2. Nested forms need submission event isolation

## 1) Intent & Scope

**User intent**

Fix widespread event bubbling issues where dialog/modal confirmations trigger unintended actions on parent components. Specifically resolve: (1) link documents opening after deletion confirmation, and (2) part form submission when confirming inline seller creation.

**Prompt quotes**

"When deleting a link document, after confirming the delete in the dialog, the link is opened (even though the deletion succeeds). The delete confirmation action is bubbling up and triggering the link click."

"When using the searchable select to create a seller inline, confirming the seller creation dialog also commits the parent part edit form. The seller creation confirmation is bubbling up and triggering the form submission."

"Fix the root cause by ensuring that form submissions and button clicks within dialogs properly stop event propagation. This should be addressed at the component level where dialogs and forms are implemented, so the fix applies across all instances."

**In scope**

- Add event propagation prevention to ConfirmDialog buttons (both confirm and cancel actions using e.stopPropagation() only, no preventDefault())
- Add event propagation prevention to SellerCreateDialog form submission by wrapping the onSubmit handler
- Verify fix applies to both identified scenarios (document deletion, seller creation)
- Add or update Playwright tests to ensure the bugs don't regress, including keyboard navigation tests
- Manual verification of other ConfirmDialog usages (type deletion, kit deletion, etc.)

**Out of scope**

- Changes to IconButton (already working correctly)
- Changes to base Button component behavior (preventValidation pattern is optional, not default)
- SearchableSelectCreateOption button (no concrete evidence of bug; will monitor for symptoms)
- Changes to shared useFormState hook (using component-specific wrapper instead)
- Architectural refactoring of Dialog or Form components beyond event handling
- Changes to how Radix UI primitives are configured
- Performance optimizations unrelated to event bubbling

**Assumptions / constraints**

- The fix must work with existing Radix UI Dialog and Popover primitives
- Changes must be backward compatible with all existing dialog/form usages
- Event prevention should be implemented at the lowest appropriate level (dialog buttons, form handlers)
- The fix should be comprehensive enough to prevent similar issues in future dialogs
- Playwright tests must exercise the real backend per project testing policy

## 2) Affected Areas & File Map

- Area: ConfirmDialog component
- Why: Confirm and cancel buttons need to prevent event propagation to parent elements
- Evidence: `src/components/ui/dialog.tsx:221-230` - buttons use plain onClick without stopPropagation

- Area: SearchableSelectCreateOption button (DESCOPED - no concrete evidence of bug)
- Why: Originally thought to need stopPropagation, but no evidence exists that clicking this button triggers parent behavior
- Note: If future reports indicate this button causes bubbling issues, it can be addressed using the same pattern as ConfirmDialog buttons
- Evidence: `src/components/ui/searchable-select.tsx:390-406` - onClick={onClick} without stopPropagation, but no bug reported

- Area: SellerCreateDialog form submission
- Why: Form submission needs to prevent propagation to parent forms (when dialog is opened from within PartForm)
- Implementation: Wrap the onSubmit handler to call e.stopPropagation() before form.handleSubmit - this approach is scoped to nested dialogs only and doesn't modify the shared useFormState hook
- Evidence: `src/components/sellers/seller-create-dialog.tsx:116` - Form onSubmit={form.handleSubmit} without stopPropagation

- Area: DocumentTile component (minimal change)
- Why: Need to verify ConfirmDialog is positioned outside clickable Card or relies on fixed buttons
- Evidence: `src/components/documents/document-tile.tsx:177` - ConfirmDialog rendered inside Card, relies on button fix

- Area: PartDetails component (verification)
- Why: Verify document deletion scenario after fix
- Evidence: `src/components/parts/part-details.tsx:702-725` - document grid usage

- Area: PartForm component (verification)
- Why: Verify seller creation scenario after fix
- Evidence: `src/components/parts/part-form.tsx:583-592` - SellerSelector usage

- Area: Playwright test for part documents
- Why: Add regression coverage for document deletion not opening link
- Evidence: `tests/e2e/parts/part-documents.spec.ts:81` - existing deleteDocument test needs verification step

- Area: Playwright test for seller selector
- Why: Add regression coverage for inline seller creation not submitting parent form
- Evidence: Need to create or extend seller selector test coverage

## 3) Data Model / Contracts

No data model changes required. This is purely a UI event handling fix.

## 4) API / Integration Surface

No API or integration changes required. All backend interactions remain unchanged.

## 5) Algorithms & UI Flows

- Flow: Document deletion with confirmation
- Steps:
  1. User clicks delete icon on DocumentTile
  2. IconButton prevents propagation (EXISTING) and shows ConfirmDialog
  3. User clicks "Delete" in ConfirmDialog
  4. **FIX**: Button handler calls e.stopPropagation() before executing onConfirm
  5. onConfirm executes deletion logic (EXISTING)
  6. Dialog closes via onOpenChange(false) (EXISTING)
  7. **VERIFICATION**: Card's onClick is NOT triggered, link does NOT open
- Note: Steps marked EXISTING are current behavior; steps marked FIX are new implementation
- States / transitions: Dialog open → confirm clicked → dialog closed, no parent click
- Hotspots: Event bubbling from dialog buttons to Card click handler
- Evidence: `src/components/documents/document-tile.tsx:31-66`, `src/components/ui/dialog.tsx:204-230`

- Flow: Inline seller creation from part form
- Steps:
  1. User types in SellerSelector SearchableSelect (EXISTING)
  2. User clicks "Create seller" option (EXISTING)
  3. SearchableSelect opens SellerCreateDialog (EXISTING)
  4. User fills form and clicks "Create Seller" (EXISTING)
  5. **FIX**: Wrapped onSubmit handler calls e.stopPropagation() before calling form.handleSubmit
  6. Seller is created via mutation (EXISTING)
  7. Dialog closes (EXISTING)
  8. **VERIFICATION**: Parent PartForm is NOT submitted
- Implementation detail: Wrap the handler in SellerCreateDialog like: `const handleSubmit = (e: React.FormEvent) => { e.stopPropagation(); form.handleSubmit(e); }`
- Note: Steps marked EXISTING are current behavior; steps marked FIX are new implementation
- States / transitions: SearchableSelect open → create clicked → dialog open → form submitted → dialog closed, parent form untouched
- Hotspots: Event bubbling from nested form submission to parent form
- Evidence: `src/components/sellers/seller-create-dialog.tsx:116-169`, `src/components/parts/part-form.tsx:676-683`

## 6) Derived State & Invariants

No derived state changes. The components maintain the same state management; only event propagation is controlled.

## 7) State Consistency & Async Coordination

- Source of truth: Existing component state (dialog open/closed, form values, mutations)
- Coordination: No changes to state synchronization; only event flow control
- Async safeguards: Existing mutation handling remains unchanged
- Instrumentation: Existing form and mutation instrumentation remains unchanged
- Evidence: No state coordination changes needed

## 8) Errors & Edge Cases

- Failure: Dialog button click fails to execute action
- Surface: Any component using ConfirmDialog
- Handling: Ensure stopPropagation is called BEFORE action execution, not instead of
- Guardrails: Manual testing of all dialog interactions, Playwright coverage
- Evidence: Implementation must preserve existing error handling

- Failure: Form submission still bubbles despite prevention
- Surface: SellerCreateDialog nested in PartForm
- Handling: Apply stopPropagation at multiple levels (button, form handler)
- Guardrails: Defense in depth - prevent at both form and button level
- Evidence: `src/components/sellers/seller-create-dialog.tsx:116`, `src/components/ui/dialog.tsx:224-230`

- Failure: Event prevention breaks keyboard navigation or accessibility
- Surface: All dialogs and forms
- Handling: Use stopPropagation only on mouse/click events, preserve keyboard behavior
- Guardrails: Test with keyboard navigation, verify Enter key still works
- Evidence: Radix UI handles keyboard events separately

## 9) Observability / Instrumentation

No new instrumentation needed. Existing instrumentation remains:
- Form submission events from `useFormInstrumentation`
- Dialog interactions tracked through existing patterns
- Test mode events continue to emit as before

## 10) Lifecycle & Background Work

No lifecycle or background work changes. Event handlers are synchronous.

## 11) Security & Permissions

Not applicable - no security or permission changes.

## 12) UX / UI Impact

- Entry point: All dialogs and modals throughout the application
- Change: Users will no longer experience unintended actions after confirming dialogs
- User interaction:
  - Deleting a link document will NO LONGER open the link after confirmation
  - Creating a seller inline will NO LONGER submit the parent part form
- Dependencies: Existing Dialog and Form components
- Evidence: `src/components/ui/dialog.tsx`, `src/components/sellers/seller-create-dialog.tsx`

## 13) Deterministic Test Plan

- Surface: Document deletion on part detail page
- Scenarios:
  - Given a part with a link document, When user clicks delete icon and confirms deletion, Then document is deleted AND link is NOT opened
  - Given a part with multiple documents, When user deletes one, Then only that document is removed and no other actions occur
- Instrumentation / hooks:
  - data-testid on document tiles
  - Existing part-documents page object
  - **URL verification**: Capture page.url() before deletion, verify it remains unchanged after (link wasn't opened)
  - Backend polling: testData.attachments.list() to verify deletion succeeded
- Implementation: Add `const urlBefore = page.url(); await partsDocuments.deleteDocument(...); expect(page.url()).toBe(urlBefore);`
- Gaps: Current test at line 81 verifies deletion but MISSING verification that link wasn't opened
- Evidence: `tests/e2e/parts/part-documents.spec.ts:81`

- Surface: Inline seller creation from part edit form
- Scenarios:
  - Given part edit form with seller selector, When user creates new seller inline and confirms, Then seller is created AND part form is NOT submitted
  - Given part edit form with validation errors, When user creates seller inline, Then seller is created, parent form shows validation errors, user remains in edit mode
- Instrumentation / hooks:
  - Form instrumentation events for seller creation: waitTestEvent(page, 'form', evt => evt.formId === 'SellerForm' && evt.phase === 'success')
  - **Parent form non-submission verification**: Check form remains visible with expect(parts.formRoot).toBeVisible(), verify part NOT updated via testData.parts.getDetail()
  - Backend polling to confirm seller was created
- Implementation:
  - Create part via API, navigate to edit form
  - Trigger inline seller creation
  - Verify part seller field unchanged via backend API call
  - Verify edit form still visible
- Gaps: **Major gap** - existing test at sellers-selector.spec.ts:29-66 only covers part CREATION flow, need to add EDIT flow test
- Evidence: `tests/e2e/sellers/sellers-selector.spec.ts:29-66`

- Surface: General dialog confirmations and keyboard accessibility
- Scenarios:
  - Given any ConfirmDialog usage, When user clicks confirm or cancel, Then action executes AND no parent handlers fire
  - **Keyboard navigation**: Given ConfirmDialog is open, When user presses Enter on focused Confirm button, Then action executes and dialog closes (verify via page.keyboard.press('Enter'))
  - **Keyboard navigation**: Given ConfirmDialog is open, When user presses Escape key, Then dialog closes without executing action (Radix UI handles this)
  - **Keyboard navigation**: Given SellerCreateDialog form, When user fills fields and presses Enter in last input, Then form submits and seller is created
  - **Manual verification**: Test type deletion from type-list card, kit deletion from kit detail, box deletion - verify no unwanted parent actions
- Instrumentation / hooks:
  - data-testid on confirm dialogs
  - Same form/UI instrumentation as mouse click scenarios
  - Manual testing with keyboard-only navigation
- Gaps: Manual testing checklist needed for all ConfirmDialog usages (component-level fix benefits all instances automatically)
- Evidence: Multiple ConfirmDialog usages throughout codebase (grep found 9+ files)

## 14) Implementation Slices

- Slice: Core event propagation fixes
- Goal: Fix the root cause in shared components
- Touches:
  - `src/components/ui/dialog.tsx` - ConfirmDialog button handlers (add e.stopPropagation() to onClick, lines 221 and 226)
  - `src/components/sellers/seller-create-dialog.tsx` - Wrap form submission handler to call e.stopPropagation() before form.handleSubmit
- Implementation details:
  - ConfirmDialog cancel button: Call e.stopPropagation() before onOpenChange(false)
  - ConfirmDialog confirm button: Call e.stopPropagation() in handleConfirm before onConfirm()
  - SellerCreateDialog: Create handleSubmit wrapper that calls e.stopPropagation() before form.handleSubmit
  - Use e.stopPropagation() ONLY (no preventDefault()) to allow normal button/form behavior while preventing bubbling
- Dependencies: None

- Slice: Verification and testing
- Goal: Ensure fixes work and add regression coverage
- Touches:
  - `tests/e2e/parts/part-documents.spec.ts` - Add URL verification to existing deletion test (verify link not opened)
  - `tests/e2e/sellers/sellers-selector.spec.ts` - Add new test for edit flow (existing test only covers creation flow)
  - Keyboard navigation tests for Enter key, Escape key, Tab navigation
  - Manual testing checklist: type deletion, kit deletion, box deletion, shopping list operations
- Dependencies: Core fixes must be complete

## 15) Risks & Open Questions

**Risks:**

- Risk: Breaking existing dialog/form functionality
- Impact: Users unable to confirm actions or submit forms
- Mitigation: Thorough manual testing of all dialogs before deployment, comprehensive Playwright coverage

- Risk: Event prevention interferes with Radix UI internal event handling
- Impact: Dialogs don't close properly or lose focus management
- Mitigation: Test with Radix UI primitives extensively, verify onOpenChange still fires

- Risk: Incomplete fix - other nested form scenarios may exist beyond SellerCreateDialog
- Impact: Users encounter bubbling bugs when using other inline creation dialogs from within forms
- Mitigation:
  - Search for all components rendering Dialog with Form elements (TypeCreateDialog, KitPickListCreateDialog, etc.)
  - For each, determine if dialog can be opened from within another form
  - Apply same e.stopPropagation() pattern to nested form onSubmit handlers
  - Add code comment pattern: "Nested forms inside dialogs must call e.stopPropagation() in onSubmit handler to prevent parent form submission"

- Risk: Keyboard event handling breaks (Enter key stops working)
- Impact: Accessibility regression for keyboard users, WCAG 2.1 AA failure
- Mitigation:
  - React's synthetic events unify mouse and keyboard (Enter/Space on buttons triggers onClick)
  - Calling e.stopPropagation() in onClick stops propagation regardless of input method, which is correct
  - Form submission via Enter works through form's onSubmit, not button's onClick
  - Add explicit Playwright keyboard tests: Enter on Confirm button, Escape to close dialog, Enter in form field
  - Manual accessibility review with keyboard-only navigation

**Open Questions:**

- Question: Are there other dialogs/modals beyond ConfirmDialog that need fixes?
- Why it matters: Ensures comprehensive fix across all dialog types
- Owner / follow-up: Search codebase for Dialog usage patterns, verify each instance

- Question: Should we make event prevention the DEFAULT behavior for all dialog buttons?
- Why it matters: Prevents future instances of this bug class
- Owner / follow-up: Architectural decision - could modify Dialog component to always stop propagation

- Question: Do any forms intentionally rely on event bubbling?
- Why it matters: Ensures fix doesn't break legitimate use cases
- Owner / follow-up: Code review and testing; no known legitimate bubbling cases expected

## 16) Confidence

Confidence: High — The root cause is clearly identified in specific components (ConfirmDialog buttons, SearchableSelectCreateOption, nested form handlers), the fix is straightforward (add e.stopPropagation()), similar patterns exist in the codebase (IconButton, Button's preventValidation), and both scenarios can be deterministically tested with Playwright against the real backend.
