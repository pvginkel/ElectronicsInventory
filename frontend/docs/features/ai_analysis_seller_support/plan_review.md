# Plan Review: AI Analysis Seller Support

## 1) Summary & Decision

**Readiness**

The plan demonstrates strong alignment with project patterns and provides comprehensive coverage of the seller suggestion feature. The approach correctly mirrors the established type suggestion pattern, includes thorough error handling, and properly addresses state consistency. However, there is a critical blocker: the plan fails to update the `TransformedAIPartAnalysisResult` type definitions to use the correct types from the backend schema, and misses the required validation logic for unresolved seller suggestions. Additionally, the plan contains a significant inconsistency in how it describes the dialog integration pattern.

**Decision**

`GO-WITH-CONDITIONS` — The plan is fundamentally sound and follows established patterns, but requires the following corrections before implementation:
1. Fix the type definition for seller fields to match backend schema (string types, not null)
2. Add seller suggestion validation to prevent form submission with unresolved suggestions
3. Clarify the SellerCreateDialog integration pattern to match the code-level implementation details
4. Address the state initialization discrepancy for sellerIsExisting

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `docs/commands/plan_feature.md` — **Pass** — `plan.md:1-498` — Plan follows the prescribed template structure with all required sections (0-16), includes research log with line-level evidence, properly scopes the feature, documents data contracts, provides deterministic test scenarios, and includes instrumentation details.

- `docs/product_brief.md` — **Pass** — `plan.md:27-31` — Feature aligns with product brief section 5 "Storage model" which specifies "Seller and seller product page link (single set; you can update it)" at `product_brief.md:51`, and section 9 "AI helpers (MVP)" at `product_brief.md:106-110` which describes AI photo intake for auto-tagging and datasheet fetching.

- `docs/contribute/architecture/application_overview.md` — **Pass** — `plan.md:66-117` — Plan correctly uses TanStack Query patterns, generated API hooks, camelCase transformation layer (`transformAIPartAnalysisResult`), and follows domain-driven folder structure.

- `docs/contribute/testing/playwright_developer_guide.md` — **Fail** — `plan.md:461-463` — Plan states "May need to add seller factory to `tests/api/factories/` if not present" but codebase review confirms `tests/api/factories/seller-factory.ts` already exists with comprehensive factory methods including `create()`, `createKnownVendor()`, and `randomSellerName()`. This is a documentation accuracy issue, not a blocker.

**Fit with codebase**

- `SellerCreateDialog` — `plan.md:210-211` — **Issue**: Plan states dialog calls `onSuccess({ name, website })` callback which then invokes `useCreateSeller` mutation (lines 204-208), but actual component at `seller-create-dialog.tsx:55-73` shows dialog directly calls `onSuccess` and the *parent component* is responsible for mutation. Plan should clarify that the review step component will need to wrap the dialog's `onSuccess` callback with mutation logic, following the pattern established by type creation at `ai-part-review-step.tsx:182-197`.

- `transformAIPartAnalysisResult` — `plan.md:72-76, 80-81` — **Critical Issue**: Plan correctly identifies transformation layer but type definitions at `plan.md:122-132` declare `seller?: string; sellerIsExisting?: boolean; existingSellerId?: number; sellerLink?: string` while current implementation at `ai-parts.ts:42-43` has `seller: null; sellerLink: null` as placeholder types. Backend schema at `generated/types.ts:1793-1807` confirms fields are `seller: string | null`, `seller_is_existing: boolean`, `existing_seller_id: number | null`, `seller_link: string | null`. Type definitions must be updated to reflect optional fields with correct primitive types, not null placeholders.

- `PartFormData` interface — `plan.md:136-148` — **Alignment confirmed**: Proposed extension matches existing pattern for type suggestions at `ai-part-review-step.tsx:24-47`. Adding `sellerIsExisting: boolean`, `suggestedSellerName?: string`, `sellerId?: number`, `sellerLink: string` mirrors `typeIsExisting`, `suggestedTypeName`, `typeId` pattern.

- Form initialization — `plan.md:187-196` — **Minor inconsistency**: Plan states "If `true`: Set `sellerId = existingSellerId`, leave `suggestedSellerName = undefined`" but does not initialize `sellerIsExisting` field. Current implementation at `ai-part-review-step.tsx:64-86` shows initialization logic should set ALL relevant state fields. Plan should explicitly show `sellerIsExisting: analysisResult.sellerIsExisting || false` in step 1.

- Validation logic — `plan.md:226-234` — **Critical Missing**: Plan describes validation pattern following type at lines 128-132, but the actual code snippet referenced (`ai-part-review-step.tsx:128-132`) only validates type fields. Plan must explicitly state that seller validation logic needs to be ADDED to the existing `validateForm` function, checking `if (formData.suggestedSellerName && !formData.sellerId)` similar to the type validation pattern.

## 3) Open Questions & Ambiguities

- Question: Does the backend return `seller_is_existing: false` or `seller_is_existing: null` when no seller match is found?
- Why it matters: Affects fallback logic in transformation layer. Plan states "treat as `sellerIsExisting: false`" at line 295 but doesn't specify the exact null-checking pattern.
- Needed answer: Review backend response schema or add explicit null coalescing to handle both cases: `sellerIsExisting: analysis?.seller_is_existing ?? false`

**Research findings**: The backend schema at `generated/types.ts:1795-1800` shows `seller_is_existing: boolean` with `@default false`, indicating it's always populated as a boolean. No ambiguity exists; transformation layer should safely read the value without null coalescing beyond the optional chaining for `analysis?.seller_is_existing`.

- Question: Should the seller link field be validated for URL format?
- Why it matters: Product page URL field has browser-native URL validation (type="url"), but plan states "rely on browser URL input type validation" at line 311.
- Needed answer: Confirm whether backend accepts malformed URLs or if frontend should add explicit validation.

**Research findings**: The `seller-create-dialog.tsx:39-53` shows explicit URL validation with protocol checking (`['http:', 'https:']`). The seller link field in `ai-part-review-step.tsx:476-496` uses `type="url"` for browser validation. Plan correctly states no custom validation is needed for seller_link; browser validation is sufficient and consistent with other URL fields in the form.

- Question: What happens if user creates a seller with a name that matches an existing seller?
- Why it matters: Could create duplicate sellers in the system. Plan doesn't address duplicate prevention.
- Needed answer: Clarify if backend enforces uniqueness constraints or if frontend should check for duplicates before creation.

**Research findings**: The `seller-create-dialog.tsx` does not include duplicate checking logic. The backend may enforce uniqueness (would return API error), but the plan should acknowledge this as a backend responsibility. The global error handling system would show the toast if backend rejects duplicate names. No action required in plan, but worth documenting as an assumption.

## 4) Deterministic Playwright Coverage (new/changed behavior only)

- Behavior: AI Part Review Step - Seller Suggestion (existing seller)
- Scenarios:
  - Given AI analysis returns `seller_is_existing: true` and `existing_seller_id: 5`, When review step loads, Then `SellerSelector` dropdown is pre-populated with seller ID 5 and seller link input is populated with `analysisResult.sellerLink`, And no suggestion box is shown
- Instrumentation: `data-testid="parts.ai.review-step"`, seller selector uses existing test IDs, seller link field has standard input attributes
- Backend hooks: `testData.sellers.create()` to seed existing seller with ID 5 before analysis
- Gaps: None — factory exists at `tests/api/factories/seller-factory.ts`
- Evidence: `plan.md:386-395`, `seller-factory.ts:39-54`

---

- Behavior: AI Part Review Step - Seller Suggestion (new seller)
- Scenarios:
  - Given AI analysis returns `seller: "Mouser"`, `seller_is_existing: false`, When review step loads, Then suggestion box displays "Suggested seller: Mouser", And "Create Seller" button is visible, And clear (X) button is visible, And `SellerSelector` dropdown is not shown
- Instrumentation: Plan states "Add `data-testid` to suggestion box, reuse clear button pattern from type" — requires adding `data-testid="parts.ai.seller-suggestion-box"` to match type pattern
- Backend hooks: No backend setup required; mock analysis response with seller suggestion
- Gaps: **Minor** — Plan should specify exact `data-testid` values for Create Seller button and suggestion box container to match type pattern at `ai-part-review-step.tsx:276-302`
- Evidence: `plan.md:398-409`

---

- Behavior: Seller Creation from Suggestion
- Scenarios:
  - Given suggestion box shows "Mouser", When user clicks "Create Seller", Then `SellerCreateDialog` opens with name field pre-filled "Mouser", When user enters "https://www.mouser.com" in website field and submits, Then form instrumentation emits `form` event with `phase: 'success'`, And dialog closes, And `SellerSelector` shows newly created seller, And suggestion box is removed
- Instrumentation: `waitTestEvent(page, 'form', evt => evt.formId === 'SellerForm_inline-create' && evt.phase === 'success')`
- Backend hooks: POST `/api/sellers` via mutation, invalidates sellers query cache automatically
- Gaps: None — instrumentation already exists in `seller-create-dialog.tsx:85-99`
- Evidence: `plan.md:412-425`

---

- Behavior: Clear Seller Suggestion
- Scenarios:
  - Given suggestion box shows suggested seller, When user clicks clear (X) button, Then suggestion box is removed, And `SellerSelector` dropdown is shown, And `sellerId` is undefined
- Instrumentation: Standard React state update, no dedicated test event
- Backend hooks: None required
- Gaps: None — follows type clear pattern at `ai-part-review-step.tsx:176-180`
- Evidence: `plan.md:428-438`

---

- Behavior: Validation - Unresolved Suggestion
- Scenarios:
  - Given suggestion box shows suggested seller, When user clicks "Add Part" without creating or clearing seller, Then inline error shows "Please create the suggested seller or select an existing one", And submit button remains enabled but form submission is blocked
- Instrumentation: Standard validation error display in form error state
- Backend hooks: None required (client-side validation)
- Gaps: **Major** — Plan describes this scenario but does NOT include it in section 2 "Affected Areas & File Map" or section 8 "Errors & Edge Cases" validation handling. Implementation checklist should explicitly call out adding this validation rule to `validateForm()` function.
- Evidence: `plan.md:441-450`

---

- Behavior: End-to-End AI Analysis with Seller
- Scenarios:
  - Given backend factory creates seller "DigiKey" with ID 10, When AI analysis mock returns `seller: "DigiKey"`, `seller_is_existing: true`, `existing_seller_id: 10`, `seller_link: "https://digikey.com/part123"`, Then review step shows `SellerSelector` pre-populated with ID 10, And seller link input shows "https://digikey.com/part123", When user submits form, Then part creation payload includes `seller_id: 10`, `seller_link: "https://digikey.com/part123"`
- Instrumentation: Factory-based seller creation, SSE mock for analysis (following existing AI test patterns)
- Backend hooks: `testData.sellers.create({ overrides: { name: 'DigiKey' } })` — factory confirmed available
- Gaps: None — corrects earlier statement about missing factory
- Evidence: `plan.md:453-464`, `seller-factory.ts:39-54`

## 5) Adversarial Sweep (must find ≥3 credible issues or declare why none exist)

**Major — Type Definition Mismatch Between Plan and Codebase**

**Evidence:** `plan.md:122-132` declares:
```typescript
seller?: string;              // AI-suggested seller name
sellerIsExisting?: boolean;   // Whether seller matches existing record
existingSellerId?: number;    // ID of existing seller
sellerLink?: string;          // AI-suggested seller product page URL (changed from null)
```

But `src/types/ai-parts.ts:42-43` shows:
```typescript
seller?: null;
sellerLink?: null;
```

Backend schema at `src/lib/api/generated/types.ts:1788-1807` confirms fields should be:
```typescript
seller: string | null;
seller_is_existing: boolean;
existing_seller_id: number | null;
seller_link: string | null;
```

**Why it matters:** Plan claims to update these type definitions (section 2, lines 66-69) but the proposed types are incomplete. `seller?: string` allows `undefined` but doesn't match the transformation layer which will receive `null` from the API. The transformation must handle `analysis?.seller ?? undefined` to convert backend `null` to frontend `undefined`, OR the type should be `seller?: string | null` to preserve the wire format.

**Fix suggestion:** Update `src/types/ai-parts.ts:42-43` to:
```typescript
seller?: string;              // Converted from API null to undefined via ??, or left as string | null
sellerIsExisting?: boolean;   // Backend returns boolean, optional if analysis_result missing
existingSellerId?: number;    // Converted from API null to undefined
sellerLink?: string;          // Converted from API null to undefined
```

AND update `src/lib/utils/ai-parts.ts:80-81` to:
```typescript
seller: analysis?.seller ?? undefined,
sellerIsExisting: analysis?.seller_is_existing ?? undefined,
existingSellerId: analysis?.existing_seller_id ?? undefined,
sellerLink: analysis?.seller_link ?? undefined,
```

**Confidence:** High — This is a direct type system inconsistency that will cause TypeScript compilation failures or runtime mismatches.

---

**Major — Seller Suggestion Validation Logic Not Explicitly Added to Implementation Scope**

**Evidence:** `plan.md:226-234` describes validation flow:
> "Steps:
>   1. Check if `suggestedSellerName` is set but `sellerId` is undefined
>   2. If true: Set validation error 'Please create the suggested seller or select an existing one'"

References pattern at `ai-part-review-step.tsx:128-132` which shows type validation:
```typescript
if (formData.suggestedTypeName && !formData.typeId) {
  newErrors.type = 'Please create the suggested type or select an existing one';
}
```

However, section 2 "Affected Areas & File Map" at lines 103-106 states:
> "- Area: Form validation
> - Why: Add seller suggestion validation following type pattern
> - Evidence: `src/components/parts/ai-part-review-step.tsx:121-136` — Type validation at lines 128-132"

BUT the `validateForm` function currently at `ai-part-review-step.tsx:121-136` does NOT include seller validation. Plan lists it as an affected area but doesn't show it in the implementation checklist (section 14).

**Why it matters:** Without explicit validation code in the implementation checklist, developer might miss adding this critical guard. Form would allow submission with orphaned `suggestedSellerName`, leading to inconsistent state.

**Fix suggestion:** Add to section 14 "Implementation Slices" under "Touches":
```
- `src/components/parts/ai-part-review-step.tsx` - UI and state management
  - Add seller validation to `validateForm()` function:
    ```typescript
    if (formData.suggestedSellerName && !formData.sellerId) {
      newErrors.seller = 'Please create the suggested seller or select an existing one';
    }
    ```
  - Add seller state fields to PartFormData
  - Add seller suggestion handlers (create, clear)
  - Update seller section UI to show suggestion box or selector
```

**Confidence:** High — This is a missing implementation detail that could lead to incomplete validation.

---

**Major — SellerCreateDialog Integration Pattern Inconsistency**

**Evidence:** `plan.md:204-211` states:
> "Flow: Create suggested seller
> Steps:
>   ...
>   4. Callback invokes `useCreateSeller` mutation with trimmed values
>   5. On success: Set `sellerId = result.id`, clear `suggestedSellerName`, close dialog"

But `seller-create-dialog.tsx:55-73` shows:
```typescript
onSubmit: async (values) => {
  const payload = { name: values.name.trim(), website: values.website.trim() }
  try {
    instrumentationRef.current?.trackSubmit(instrumentationFields)
    await onSuccess(payload)  // <-- Calls onSuccess, doesn't invoke mutation
    instrumentationRef.current?.trackSuccess(instrumentationFields)
    handleDialogOpenChange(false)
  } catch {
    instrumentationRef.current?.trackError(instrumentationFields)
  }
}
```

The dialog calls `onSuccess` and expects the parent to handle mutation. Type creation pattern at `ai-part-review-step.tsx:182-197` confirms this:
```typescript
const handleConfirmCreateType = useCallback(async (typeName: string) => {
  if (!typeName.trim()) return;
  try {
    const result = await createTypeMutation.mutateAsync({ body: { name: typeName.trim() } });
    updateField('typeId', result.id);
    updateField('suggestedTypeName', undefined);
    ...
```

**Why it matters:** Plan's flow description at step 4 incorrectly places mutation inside dialog callback. Implementation must follow type pattern: dialog emits `onSuccess({ name, website })`, parent component's handler calls `createSellerMutation.mutateAsync()`. Misunderstanding this pattern could lead to incorrect implementation.

**Fix suggestion:** Revise `plan.md:204-211` flow description:
```
Steps:
  1. User clicks "Create Seller" button in suggestion box
  2. Open `SellerCreateDialog` with `initialName` pre-filled from `suggestedSellerName`
  3. User provides website URL, submits dialog
  4. Dialog calls `onSuccess({ name, website })` callback with trimmed values
  5. Parent component's `onSuccess` handler invokes `createSellerMutation.mutateAsync({ body: { name, website } })`
  6. On mutation success: Set `sellerId = result.id`, clear `suggestedSellerName`, close dialog
  7. Form instrumentation (from dialog) emits success event
```

**Confidence:** High — This is an architectural pattern mismatch between plan description and actual component API.

---

**Minor — State Initialization Missing sellerIsExisting Assignment**

**Evidence:** `plan.md:187-196` states:
> "Flow: Initialize seller state on mount
> Steps:
>   1. Read `analysisResult.sellerIsExisting` flag
>   2. If `true`: Set `sellerId = existingSellerId`, leave `suggestedSellerName = undefined`
>   3. If `false` and `analysisResult.seller` present: Set `suggestedSellerName = seller`, leave `sellerId = undefined`
>   4. Set `sellerLink = analysisResult.sellerLink || ''`"

Type initialization at `ai-part-review-step.tsx:64-86` shows:
```typescript
const [formData, setFormData] = useState<PartFormData>(() => ({
  ...
  typeIsExisting: analysisResult.typeIsExisting || false,
  typeId: analysisResult.typeIsExisting ? analysisResult.existingTypeId ?? undefined : undefined,
  suggestedTypeName: !analysisResult.typeIsExisting ? (analysisResult.type || undefined) : undefined,
  ...
}));
```

Plan's initialization steps don't mention setting `sellerIsExisting` field, but `PartFormData` interface at lines 136-148 includes `sellerIsExisting: boolean`.

**Why it matters:** Form state should mirror the pattern established by `typeIsExisting`. Missing initialization could default to `undefined` instead of `false`, causing type errors or incorrect conditional rendering.

**Fix suggestion:** Revise step 1 in initialization flow to:
```
1. Read `analysisResult.sellerIsExisting` flag and initialize state field:
   - Set `sellerIsExisting = analysisResult.sellerIsExisting || false`
```

And update initialization code example in section 2 to show:
```typescript
sellerIsExisting: analysisResult.sellerIsExisting || false,
sellerId: analysisResult.sellerIsExisting ? analysisResult.existingSellerId ?? undefined : undefined,
suggestedSellerName: !analysisResult.sellerIsExisting ? (analysisResult.seller || undefined) : undefined,
sellerLink: analysisResult.sellerLink || '',
```

**Confidence:** Medium — This is a consistency issue that could cause minor state bugs but is easy to catch during code review.

---

**Minor — Test Factory Documentation Outdated**

**Evidence:** `plan.md:491-493` states:
> "- Risk: Seller factories may not exist in Playwright test suite
> - Impact: Cannot create prerequisite sellers for test scenarios
> - Mitigation: Add seller factory to `tests/api/factories/` if missing (check during implementation)"

But `tests/api/factories/seller-factory.ts` exists with full implementation including `create()`, `createKnownVendor()`, `createMany()`, `createTestSet()`, `randomSellerName()`, and `randomSellerUrl()`.

Section 13 at line 462 also states: "May need to add seller factory to `tests/api/factories/` if not present"

**Why it matters:** Misleads implementer into thinking factory needs creation. Wastes time during implementation and suggests incomplete research phase.

**Fix suggestion:** Remove risk from section 15 and update section 13 line 461-463 to:
```
- Instrumentation / hooks: Use `testData.sellers.create()` factory (available at `tests/api/factories/seller-factory.ts`)
- Gaps: None
```

**Confidence:** High — This is a factual error easily verified by checking codebase.

## 6) Derived-Value & State Invariants (table)

- Derived value: Seller suggestion visibility
  - Source dataset: `formData.suggestedSellerName !== undefined` (unfiltered state field)
  - Write / cleanup triggered: Conditional render toggles between suggestion box and `SellerSelector` dropdown; cleared on create success or manual clear action
  - Guards: Suggestion only visible when `suggestedSellerName` is defined AND `sellerId` is undefined (mutually exclusive states)
  - Invariant: `suggestedSellerName` and `sellerId` cannot both be defined simultaneously; if suggestion exists, dropdown is hidden; if dropdown is active, suggestion must be cleared
  - Evidence: `plan.md:236-243`, `ai-part-review-step.tsx:276-313` (type pattern)

- Derived value: Form validity (seller portion)
  - Source dataset: `formData.suggestedSellerName`, `formData.sellerId` (unfiltered form state)
  - Write / cleanup triggered: Validation error set/cleared on field changes; prevents form submission when invalid
  - Guards: Validation only runs when `validateForm()` called (on submit attempt or field blur)
  - Invariant: Form cannot be submitted if `suggestedSellerName` is defined without corresponding `sellerId` (user must create suggested seller or clear suggestion to proceed)
  - Evidence: `plan.md:244-249`, validation pattern at `ai-part-review-step.tsx:121-136`

- Derived value: Dialog initial name synchronization
  - Source dataset: `formData.suggestedSellerName` (unfiltered state)
  - Write / cleanup triggered: `SellerCreateDialog` receives `initialName` prop; `useEffect` at `seller-create-dialog.tsx:79-83` syncs dialog form when prop changes
  - Guards: Effect only fires when `open && initialName && form.values.name !== initialName` to prevent unnecessary updates
  - Invariant: Dialog name field always reflects current `suggestedSellerName` when opened; stale values from previous dialog sessions are overwritten
  - Evidence: `plan.md:251-257`, `seller-create-dialog.tsx:79-83`

- Derived value: Created seller cache update
  - Source dataset: Mutation result from `useCreateSeller` (fresh API response)
  - Write / cleanup triggered: TanStack Query invalidates sellers cache after successful POST `/api/sellers`, triggering background refetch
  - Guards: Mutation hooks automatically invalidate via generated client; no manual cache management required
  - Invariant: After seller creation succeeds, `SellerSelector` dropdown will include newly created seller without manual refresh; query cache remains consistent with backend state
  - Evidence: `plan.md:173-176`, TanStack Query mutation pattern in `use-sellers.ts:58-60`

All derived values use unfiltered source data and include appropriate guards. No filtered-view-driven persistent writes detected.

## 7) Risks & Mitigations (top 3)

- Risk: User creates seller with duplicate name, causing backend validation error
- Mitigation: Rely on backend uniqueness constraints; global error handling system will display toast with backend error message. Frontend does not need duplicate checking logic as this is backend responsibility. Document as assumption in plan section 8.
- Evidence: `plan.md:301-305` mentions dialog validation but doesn't address duplicates; `seller-create-dialog.tsx:70-72` shows error path that surfaces backend errors

---

- Risk: Type definition mismatch between plan and backend schema causes runtime errors during transformation
- Mitigation: Correct type definitions in `src/types/ai-parts.ts` to match backend schema before implementation. Use `analysis?.seller ?? undefined` pattern in transformation to handle null-to-undefined conversion consistently. Add integration test that validates transformed types against backend response.
- Evidence: `plan.md:122-132` type definitions vs. `generated/types.ts:1788-1807` backend schema; `ai-parts.ts:80-81` transformation layer

---

- Risk: Seller suggestion validation missing from implementation causes form submission with orphaned suggestion state
- Mitigation: Explicitly add validation logic to implementation checklist in section 14. Follow exact pattern from type validation at `ai-part-review-step.tsx:128-132`. Add Playwright test scenario at `plan.md:441-450` to regression-proof this validation.
- Evidence: `plan.md:226-234` describes validation flow but doesn't include code change in section 14 implementation slice

## 8) Confidence

Confidence: Medium — The plan demonstrates thorough research and correctly identifies the type suggestion pattern as the template. However, critical issues with type definitions, validation logic omission, and dialog integration pattern inconsistency require correction before implementation. Once the identified Major issues are addressed (type system alignment, explicit validation addition, corrected dialog flow), confidence will increase to High. The plan's test coverage and instrumentation strategy are solid.
