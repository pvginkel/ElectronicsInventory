# Technical Plan: AI Analysis Seller Support

## 0) Research Log & Findings

Searched areas and relevant components:

1. **Type definitions** - Located `src/types/ai-parts.ts` containing the `TransformedAIPartAnalysisResult` interface with placeholder `seller: null` and `sellerLink: null` fields at lines 42-43.

2. **Transformation layer** - Found `src/lib/utils/ai-parts.ts` with `transformAIPartAnalysisResult` function (lines 40-95) that currently hardcodes seller fields to `null` at lines 80-81.

3. **Generated API types** - Examined `src/lib/api/generated/types.ts` (lines 1711-1807) confirming the backend schema includes:
   - `seller: string | null` (line 1793)
   - `seller_is_existing: boolean` (line 1800)
   - `existing_seller_id: number | null` (line 1716)
   - `seller_link: string | null` (line 1807)

4. **Review step component** - Analyzed `src/components/parts/ai-part-review-step.tsx` which implements the type suggestion pattern (lines 276-313) that should be replicated for seller.

5. **Seller components** - Located `SellerSelector` component imported at line 8 and `SellerCreateDialog` at `src/components/sellers/seller-create-dialog.tsx` which requires both `name` and `website` fields (lines 34-53).

6. **Hooks** - Found `src/hooks/use-sellers.ts` exposing `useCreateSeller()` at line 58-60.

7. **Playwright patterns** - Reviewed `tests/e2e/parts/ai-parts-duplicates.spec.ts` showing how AI analysis responses are mocked via SSE, and `docs/contribute/testing/playwright_developer_guide.md` confirming the no-mocking policy and factory-based approach.

No conflicts identified. The seller field implementation follows the exact pattern already established for type suggestion handling.

## 1) Intent & Scope

**User intent**

Enable the AI part analysis feature to display and handle seller information returned by the backend, allowing users to either select an existing seller or create a new one based on AI suggestions, following the same interaction pattern currently used for type suggestions.

**Prompt quotes**

"Add support for the new `seller` and `seller_link` fields returned by AI part analysis, handling them the same way `type` is currently handled."

"Unlike `TypeCreateDialog` which only needs a name, `SellerCreateDialog` requires both name and website URL - the suggested seller name should be pre-filled but the user will need to provide a website."

**In scope**

- Update `TransformedAIPartAnalysisResult` interface to include seller-related fields
- Map seller fields from snake_case API response to camelCase frontend model
- Initialize form state with seller data following the type suggestion pattern
- Display seller suggestion box when AI returns a non-existing seller name
- Allow users to create suggested seller via existing `SellerCreateDialog`
- Allow users to clear seller suggestion and use dropdown selector
- Pass seller data through to part creation payload

**Out of scope**

- Changes to `SellerCreateDialog` UI or validation logic
- Backend API modifications
- Changes to seller management features outside AI workflow
- Seller link validation beyond existing URL input handling
- AI analysis prompt or response generation logic

**Assumptions / constraints**

- Backend already returns `seller`, `seller_is_existing`, `existing_seller_id`, and `seller_link` fields in the API response schema
- `SellerCreateDialog` component already exists and requires both name and website parameters
- The existing type suggestion pattern (lines 276-313 in `ai-part-review-step.tsx`) provides the correct UX model
- `seller_link` is a simple string field with no "is_existing" logic, treated as pass-through data
- Form instrumentation patterns and test events remain consistent with existing implementation

## 2) Affected Areas & File Map

- Area: Type definitions for AI analysis results
- Why: Add seller-related fields to frontend model
- Evidence: `src/types/ai-parts.ts:42-43` — Current placeholder fields `seller: null; sellerLink: null;`

---

- Area: AI analysis result transformation utility
- Why: Map backend seller fields from snake_case to camelCase
- Evidence: `src/lib/utils/ai-parts.ts:80-81` — Hardcoded `seller: null, sellerLink: null`

---

- Area: Part form data interface
- Why: Add seller suggestion state fields to match type pattern
- Evidence: `src/components/parts/ai-part-review-step.tsx:24-47` — `PartFormData` interface with `suggestedTypeName` pattern at lines 31

---

- Area: Form state initialization
- Why: Populate seller fields from AI analysis on mount
- Evidence: `src/components/parts/ai-part-review-step.tsx:64-86` — Initialization logic setting `suggestedTypeName` at line 71 and `typeId` at line 70

---

- Area: Seller Information card UI
- Why: Render suggestion box or dropdown based on `suggestedSellerName` state
- Evidence: `src/components/parts/ai-part-review-step.tsx:439-498` — Current seller fields at lines 466-497, mirroring type pattern at lines 274-313

---

- Area: Seller suggestion handlers
- Why: Implement create and clear actions for suggested seller
- Evidence: `src/components/parts/ai-part-review-step.tsx:170-201` — Type handlers at lines 170-201 provide pattern

---

- Area: Form validation
- Why: Add seller suggestion validation following type pattern
- Evidence: `src/components/parts/ai-part-review-step.tsx:121-136` — Type validation at lines 128-132

---

- Area: Seller creation mutation hook
- Why: Import and wire `useCreateSeller` hook
- Evidence: `src/hooks/use-sellers.ts:58-60` — `useCreateSeller()` export

---

- Area: SellerCreateDialog integration
- Why: Show dialog when user clicks "Create Seller" button
- Evidence: `src/components/parts/ai-part-review-step.tsx:554-562` — TypeCreateDialog pattern, SellerCreateDialog imported at line 8

## 3) Data Model / Contracts

- Entity / contract: `TransformedAIPartAnalysisResult`
- Shape:
  ```typescript
  {
    seller?: string;              // AI-suggested seller name (e.g., "Mouser")
    sellerIsExisting?: boolean;   // Whether seller matches existing record
    existingSellerId?: number;    // ID of existing seller if sellerIsExisting=true
    sellerLink?: string;          // AI-suggested seller product page URL (changed from null)
  }
  ```
- Mapping: `seller` ← `analysis_result.seller`, `sellerIsExisting` ← `seller_is_existing`, `existingSellerId` ← `existing_seller_id`, `sellerLink` ← `seller_link`
- Evidence: `src/lib/api/generated/types.ts:1793-1807` — Backend schema fields

---

- Entity / contract: `PartFormData` interface extension
- Shape:
  ```typescript
  {
    sellerIsExisting: boolean;         // Track if AI suggested existing seller
    suggestedSellerName?: string;      // Name of seller to create (when sellerIsExisting=false)
    sellerId?: number;                 // Selected or created seller ID
    sellerLink: string;                // Seller product page URL
  }
  ```
- Mapping: Initialized from `analysisResult.sellerIsExisting`, `analysisResult.seller`, `analysisResult.existingSellerId`, `analysisResult.sellerLink`
- Evidence: `src/components/parts/ai-part-review-step.tsx:24-47` — Existing form data structure

---

- Entity / contract: Seller creation payload
- Shape:
  ```typescript
  {
    name: string;    // Trimmed seller name
    website: string; // User-provided website URL
  }
  ```
- Mapping: `name` pre-filled from `suggestedSellerName`, `website` supplied by user in dialog
- Evidence: `src/components/sellers/seller-create-dialog.tsx:34-53` — Dialog validation rules

## 4) API / Integration Surface

- Surface: GET /api/sellers (via `useSellers` hook)
- Inputs: None (fetches all sellers for dropdown)
- Outputs: Array of seller objects with `id`, `name`, `website` fields
- Errors: Handled by global error boundary and toast system
- Evidence: `src/hooks/use-sellers.ts:10-28` — `useSellers()` hook wrapping `useGetSellers`

---

- Surface: POST /api/sellers (via `useCreateSeller` hook)
- Inputs: `{ body: { name: string; website: string } }`
- Outputs: Created seller object with `id`, `name`, `website`; invalidates sellers query cache
- Errors: Form instrumentation tracks error phase, global toast shows message
- Evidence: `src/hooks/use-sellers.ts:58-60` — `useCreateSeller()` hook

---

- Surface: AI analysis SSE stream
- Inputs: User prompt text
- Outputs: SSE payload with `analysis_result.seller`, `seller_is_existing`, `existing_seller_id`, `seller_link`
- Errors: Analysis failure captured in `analysisFailureReason` field
- Evidence: `src/lib/api/generated/types.ts:1788-1807` — PartAnalysisDetailsSchema

## 5) Algorithms & UI Flows

- Flow: Initialize seller state on mount
- Steps:
  1. Initialize `sellerIsExisting = analysisResult.sellerIsExisting || false`
  2. If `sellerIsExisting` is `true`: Set `sellerId = existingSellerId`, leave `suggestedSellerName = undefined`
  3. If `sellerIsExisting` is `false` and `analysisResult.seller` present: Set `suggestedSellerName = seller`, leave `sellerId = undefined`
  4. Set `sellerLink = analysisResult.sellerLink || ''`
- Initialization code pattern:
  ```typescript
  sellerIsExisting: analysisResult.sellerIsExisting || false,
  sellerId: analysisResult.sellerIsExisting ? analysisResult.existingSellerId ?? undefined : undefined,
  suggestedSellerName: !analysisResult.sellerIsExisting ? (analysisResult.seller || undefined) : undefined,
  sellerLink: analysisResult.sellerLink || '',
  ```
- States / transitions: Form mounts → seller fields initialized → UI renders suggestion box or dropdown
- Hotspots: Initialization must correctly distinguish existing vs. new seller to show appropriate UI
- Evidence: `src/components/parts/ai-part-review-step.tsx:64-86` — Type initialization pattern at lines 69-71

---

- Flow: Create suggested seller
- Steps:
  1. User clicks "Create Seller" button in suggestion box
  2. Open `SellerCreateDialog` with `initialName` pre-filled from `suggestedSellerName`
  3. User provides website URL, submits dialog
  4. Dialog calls `onSuccess({ name, website })` callback with trimmed values
  5. Parent component's `onSuccess` handler invokes `createSellerMutation.mutateAsync({ body: { name, website } })`
  6. On mutation success: Set `sellerId = result.id`, clear `suggestedSellerName`, set `sellerIsExisting = true`, close dialog
  7. Form instrumentation (from dialog) emits success event
- States / transitions: Idle → Dialog open → Submitting → Success (dialog closes, dropdown shows new seller) | Error (dialog remains open, toast shown)
- Hotspots: Dialog requires both name and website; validation failure keeps dialog open. Parent component handles mutation, not the dialog itself.
- Evidence: `src/components/parts/ai-part-review-step.tsx:182-197` — Type creation handler pattern shows parent handles mutation

---

- Flow: Clear seller suggestion
- Steps:
  1. User clicks clear (X) button in suggestion box
  2. Set `suggestedSellerName = undefined`, `sellerId = undefined`, `sellerIsExisting = false`
  3. UI re-renders showing `SellerSelector` dropdown
- States / transitions: Suggestion box visible → Dropdown visible
- Hotspots: Must clear all seller-related state to reset form section
- Evidence: `src/components/parts/ai-part-review-step.tsx:176-180` — Clear suggestion handler

---

- Flow: Form validation before submission
- Steps:
  1. Check if `suggestedSellerName` is set but `sellerId` is undefined
  2. If true: Set validation error "Please create the suggested seller or select an existing one"
  3. Prevent form submission until user resolves (creates seller or clears suggestion)
- States / transitions: Invalid → User creates seller → Valid | User clears suggestion → Valid
- Hotspots: Validation prevents partial submission with orphaned suggestion
- Evidence: `src/components/parts/ai-part-review-step.tsx:128-132` — Type validation pattern

## 6) Derived State & Invariants

- Derived value: Seller suggestion visibility
  - Source: `formData.suggestedSellerName !== undefined`
  - Writes / cleanup: Controls conditional render of suggestion box vs. `SellerSelector`
  - Guards: Suggestion cleared when user clicks clear button or successfully creates seller
  - Invariant: If `suggestedSellerName` is defined, `sellerId` must be undefined (mutually exclusive)
  - Evidence: `src/components/parts/ai-part-review-step.tsx:276` — Type pattern uses same logic

- Derived value: Form validity
  - Source: Description required, type/typeId constraints, seller validation
  - Writes / cleanup: Enables/disables submit button
  - Guards: Validation runs on field changes and clears errors when user corrects issues
  - Invariant: Cannot submit if `suggestedSellerName` is present without `sellerId` (user must create or clear)
  - Evidence: `src/components/parts/ai-part-review-step.tsx:121-136` — Validation logic

- Derived value: Seller creation dialog state
  - Source: `showCreateSellerDialog` boolean controlled by user action
  - Writes / cleanup: Dialog reset on close, form values updated on success
  - Guards: Dialog only opens when `suggestedSellerName` is defined
  - Invariant: Dialog `initialName` always matches current `suggestedSellerName`
  - Evidence: `src/components/parts/ai-part-review-step.tsx:554-562` — Type dialog pattern

## 7) State Consistency & Async Coordination

- Source of truth: React component state (`formData`) initialized from `analysisResult` prop
- Coordination:
  - `suggestedSellerName` and `sellerId` are mutually exclusive
  - Creating seller asynchronously updates `sellerId` and clears `suggestedSellerName`
  - Clearing suggestion synchronously resets both fields
- Async safeguards:
  - `useCreateSeller` mutation handled by TanStack Query
  - Form submission disabled during `isSubmitting` state
  - Dialog remains open on creation failure (error handled by global toast)
- Instrumentation:
  - `SellerCreateDialog` emits form events via `useFormInstrumentation`
  - Review step form emits events via existing instrumentation
  - Playwright tests can wait on `form` events with `formId: 'SellerForm_inline-create'`
- Evidence: `src/components/sellers/seller-create-dialog.tsx:85-99` — Instrumentation setup

## 8) Errors & Edge Cases

- Failure: User submits form with suggested seller name but hasn't created it
- Surface: `ai-part-review-step.tsx` validation
- Handling: Display inline error message, disable submit button, prompt user to create or clear
- Guardrails: Validation runs before `handleCreatePart` proceeds
- Evidence: `src/components/parts/ai-part-review-step.tsx:128-132` — Type validation pattern

---

- Failure: Seller creation API request fails
- Surface: `SellerCreateDialog` form submission
- Handling: Global error handler shows toast, dialog remains open, instrumentation emits error event
- Guardrails: Form state not cleared on error; user can retry or cancel
- Evidence: `src/components/sellers/seller-create-dialog.tsx:70-72` — Error handling in onSubmit

---

- Failure: AI returns seller name but backend lookup fails (sellerIsExisting undefined/null)
- Surface: Transformation layer
- Handling: Treat as `sellerIsExisting: false`, show suggestion box
- Guardrails: Default to safe behavior (offer creation) rather than failing
- Evidence: `src/lib/utils/ai-parts.ts:40-95` — Transformation uses `??` operators for optional fields

---

- Failure: User provides invalid website URL in creation dialog
- Surface: `SellerCreateDialog` validation
- Handling: Show field-level error, disable submit button
- Guardrails: URL validation ensures protocol is http/https
- Evidence: `src/components/sellers/seller-create-dialog.tsx:39-53` — Website validation rules

---

- Failure: Seller link is invalid or empty
- Surface: Review step seller link input
- Handling: Allow empty value (field is optional), rely on browser URL input type validation
- Guardrails: No custom validation needed; backend accepts null
- Evidence: `src/components/parts/ai-part-review-step.tsx:476-496` — Seller link field allows clearing

## 9) Observability / Instrumentation

- Signal: Seller creation form events
- Type: Test event (kind: 'form')
- Trigger: When `SellerCreateDialog` opens, submits, succeeds, or errors
- Labels / fields: `formId: 'SellerForm_inline-create'`, `phase`, `fields: { name, website }`
- Consumer: Playwright tests via `waitTestEvent(page, 'form', ...)`
- Evidence: `src/components/sellers/seller-create-dialog.tsx:85-99` — `useFormInstrumentation` hook

---

- Signal: Part creation with seller data
- Type: Test event (kind: 'form')
- Trigger: When review step form submits with seller fields populated
- Labels / fields: `formId` from review step, includes `sellerId` and `sellerLink` in payload
- Consumer: Playwright specs validating end-to-end AI → part creation flow
- Evidence: `src/components/parts/ai-part-review-step.tsx:138-163` — Form submission handler

---

- Signal: Seller selector change
- Type: UI state change (no dedicated test event)
- Trigger: User selects seller from dropdown or suggestion box updates
- Labels / fields: N/A (tracked via form state updates)
- Consumer: Visual regression tests, manual QA
- Evidence: `src/components/parts/ai-part-review-step.tsx:165-168` — Type change handler pattern

## 10) Lifecycle & Background Work

- Hook / effect: Initialize form state from `analysisResult`
- Trigger cadence: On component mount (via `useState` initializer)
- Responsibilities: Read seller fields from AI analysis, determine suggestion vs. existing seller state
- Cleanup: None (initialization only)
- Evidence: `src/components/parts/ai-part-review-step.tsx:64` — `useState` with factory function

---

- Hook / effect: Reset dialog state on close
- Trigger cadence: When `SellerCreateDialog` `onOpenChange(false)` fires
- Responsibilities: Clear form values, reset validation errors
- Cleanup: Form.reset() called in dialog close handler
- Evidence: `src/components/sellers/seller-create-dialog.tsx:101-107` — Dialog close handler

---

- Hook / effect: Sync `initialName` to dialog when `suggestedSellerName` changes
- Trigger cadence: When dialog opens with new `initialName` prop
- Responsibilities: Update dialog form name field to match current suggestion
- Cleanup: None (controlled by dialog open state)
- Evidence: `src/components/sellers/seller-create-dialog.tsx:79-83` — useEffect syncing initialName

## 11) Security & Permissions (if applicable)

Not applicable. This feature does not introduce new authentication, authorization, or data exposure concerns. Seller creation uses the same permission model as existing seller management features.

## 12) UX / UI Impact

- Entry point: AI Part Analysis Dialog → Review & Edit step
- Change: Seller Information card now displays suggestion box when AI returns non-existing seller
- User interaction:
  - If AI suggests existing seller: `SellerSelector` dropdown pre-populated
  - If AI suggests new seller: Suggestion box shows seller name with "Create Seller" and clear buttons
  - Click "Create Seller": Opens dialog with name pre-filled, user must provide website
  - Click clear (X): Removes suggestion, shows `SellerSelector` dropdown
  - Seller link field populated from AI analysis, user can edit or clear
- Dependencies: `SellerCreateDialog`, `SellerSelector`, `useCreateSeller` hook
- Evidence: `src/components/parts/ai-part-review-step.tsx:276-313` — Type suggestion UI pattern

## 13) Deterministic Test Plan

- Surface: AI Part Review Step - Seller Suggestion (existing seller)
- Scenarios:
  - Given AI analysis returns `seller_is_existing: true` and `existing_seller_id: 5`
  - When review step loads
  - Then `SellerSelector` dropdown is pre-populated with seller ID 5
  - And seller link input is populated with `analysisResult.sellerLink`
  - And no suggestion box is shown
- Instrumentation / hooks: `data-testid="parts.ai.review-step"`, seller selector uses existing test IDs
- Gaps: None
- Evidence: `src/components/parts/ai-part-review-step.tsx:466-472` — SellerSelector integration

---

- Surface: AI Part Review Step - Seller Suggestion (new seller)
- Scenarios:
  - Given AI analysis returns `seller: "Mouser"`, `seller_is_existing: false`
  - When review step loads
  - Then suggestion box displays "Suggested seller: Mouser"
  - And "Create Seller" button is visible
  - And clear (X) button is visible
  - And `SellerSelector` dropdown is not shown
- Instrumentation / hooks: Add `data-testid` to suggestion box, reuse clear button pattern from type
- Gaps: None
- Evidence: `src/components/parts/ai-part-review-step.tsx:276-302` — Type suggestion box pattern

---

- Surface: Seller Creation from Suggestion
- Scenarios:
  - Given suggestion box shows "Mouser"
  - When user clicks "Create Seller"
  - Then `SellerCreateDialog` opens with name field pre-filled "Mouser"
  - When user enters "https://www.mouser.com" in website field and submits
  - Then form instrumentation emits `form` event with `phase: 'success'`
  - And dialog closes
  - And `SellerSelector` shows newly created seller
  - And suggestion box is removed
- Instrumentation / hooks: `waitTestEvent(page, 'form', evt => evt.formId === 'SellerForm_inline-create' && evt.phase === 'success')`
- Gaps: None
- Evidence: `src/components/sellers/seller-create-dialog.tsx:85-99` — Form instrumentation

---

- Surface: Clear Seller Suggestion
- Scenarios:
  - Given suggestion box shows suggested seller
  - When user clicks clear (X) button
  - Then suggestion box is removed
  - And `SellerSelector` dropdown is shown
  - And `sellerId` is undefined
- Instrumentation / hooks: Standard React state update, no dedicated test event
- Gaps: None
- Evidence: `src/components/parts/ai-part-review-step.tsx:176-180` — Clear handler pattern

---

- Surface: Validation - Unresolved Suggestion
- Scenarios:
  - Given suggestion box shows suggested seller
  - When user clicks "Add Part" without creating or clearing seller
  - Then inline error shows "Please create the suggested seller or select an existing one"
  - And submit button remains enabled but form submission is blocked
- Instrumentation / hooks: Standard validation error display
- Gaps: None
- Evidence: `src/components/parts/ai-part-review-step.tsx:128-132` — Validation logic

---

- Surface: End-to-End AI Analysis with Seller
- Scenarios:
  - Given backend factory creates seller "DigiKey" with ID 10
  - When AI analysis mock returns `seller: "DigiKey"`, `seller_is_existing: true`, `existing_seller_id: 10`, `seller_link: "https://digikey.com/part123"`
  - Then review step shows `SellerSelector` pre-populated with ID 10
  - And seller link input shows "https://digikey.com/part123"
  - When user submits form
  - Then part creation payload includes `seller_id: 10`, `seller_link: "https://digikey.com/part123"`
- Instrumentation / hooks: Use `testData.sellers.create()` factory (available at `tests/api/factories/seller-factory.ts`)
- Gaps: None
- Evidence: `tests/e2e/parts/ai-parts-duplicates.spec.ts:13-27` — Factory usage pattern, `tests/api/factories/seller-factory.ts` — Seller factory implementation

## 14) Implementation Slices

Since this is a minor change following an established pattern, implementation can proceed as a single slice:

- Slice: Complete seller suggestion support
- Goal: Full parity with type suggestion feature for seller fields
- Touches:
  - `src/types/ai-parts.ts` - Type definitions
    - Change `seller?: null` to `seller?: string`
    - Add `sellerIsExisting?: boolean`
    - Add `existingSellerId?: number`
    - Change `sellerLink?: null` to `sellerLink?: string`
  - `src/lib/utils/ai-parts.ts` - Transformation logic
    - Map `analysis?.seller ?? undefined` → `seller`
    - Map `analysis?.seller_is_existing ?? undefined` → `sellerIsExisting`
    - Map `analysis?.existing_seller_id ?? undefined` → `existingSellerId`
    - Map `analysis?.seller_link ?? undefined` → `sellerLink`
  - `src/components/parts/ai-part-review-step.tsx` - UI and state management
    - Add `sellerIsExisting: boolean` and `suggestedSellerName?: string` to `PartFormData` interface
    - Initialize seller state fields following the type pattern (see section 5 initialization code)
    - Add `showCreateSellerDialog` state and `createSellerMutation` hook
    - Add `handleCreateSuggestedSeller`, `handleClearSellerSuggestion`, `handleConfirmCreateSeller` handlers
    - Add seller suggestion validation to `validateForm()` function:
      ```typescript
      if (formData.suggestedSellerName && !formData.sellerId) {
        newErrors.seller = 'Please create the suggested seller or select an existing one';
      }
      ```
    - Update seller section UI to show suggestion box or `SellerSelector` based on `suggestedSellerName`
    - Render `SellerCreateDialog` when `showCreateSellerDialog` is true
- Dependencies: None (all required components already exist)

## 15) Risks & Open Questions

- Risk: User creates seller but leaves website field empty
- Impact: Dialog validation prevents submission (website is required)
- Mitigation: Existing `SellerCreateDialog` validation enforces required website field

---

- Risk: AI returns seller name that differs slightly from existing seller (e.g., "Digi-Key" vs. "DigiKey")
- Impact: Backend determines `seller_is_existing`; frontend trusts this flag
- Mitigation: Backend responsibility to handle fuzzy matching; frontend implementation agnostic

---

- Risk: User creates seller with duplicate name
- Impact: Backend validation error returned
- Mitigation: Backend enforces uniqueness constraints; global error handling system displays toast with backend error message. Frontend does not need duplicate checking logic.

## 16) Confidence

Confidence: High — This change replicates the well-established type suggestion pattern with minimal complexity. All required components (dialog, hooks, selectors, test factories) already exist. The API contract is clear and stable. Testing patterns are proven.
