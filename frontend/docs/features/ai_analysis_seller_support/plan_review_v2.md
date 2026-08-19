# Plan Review v2: AI Analysis Seller Support

**Review Date:** 2026-01-06
**Plan Version:** Updated after initial review corrections
**Reviewer:** Claude Code (Plan Review Command)

---

## 1) Summary & Decision

**Readiness**

The updated plan comprehensively addresses all issues raised in the initial review. The state initialization code pattern is now explicit and correct (lines 194-200), the dialog integration flow properly clarifies that parent components handle mutations while dialogs only call callbacks (lines 212-218), validation logic includes explicit code snippets (lines 494-499), test factory documentation correctly notes the seller factory already exists (line 470), and risks have been updated to reflect actual concerns (duplicate name handling at lines 517-520). The plan follows the established type suggestion pattern throughout, provides detailed evidence for every claim, and includes deterministic Playwright coverage with proper instrumentation. All sections are implementation-ready with precise file/line references.

**Decision**

`GO` — All blocking issues from the initial review have been resolved. The plan is implementation-ready with comprehensive coverage, proper architectural alignment, and deterministic testing strategy. No conditions or blockers remain.

---

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `docs/commands/plan_feature.md` — Pass — `plan.md:6-26` — Research log comprehensively documents discovery work including searched areas (types, transformation layer, generated API types, review step component, seller components, hooks, and Playwright patterns), relevant components with specific line references, and explicit confirmation that no conflicts were identified. Template requirements fully satisfied.

- `docs/commands/plan_feature.md` — Pass — `plan.md:28-63` — Intent & scope section includes user intent restatement, verbatim prompt quotes ("Add support for the new `seller` and `seller_link` fields..." and "Unlike `TypeCreateDialog` which only needs a name..."), clear in-scope/out-of-scope delineation, and explicit assumptions about backend schema, existing components, and UX patterns. All template fields present.

- `docs/commands/plan_feature.md` — Pass — `plan.md:66-119` — Affected areas section provides exhaustive file map with 9 distinct entries, each containing "Why" explanation and "Evidence" with file:line-range citations. Covers type definitions (ai-parts.ts:42-43), transformation logic (ai-parts.ts:80-81), form interface (ai-part-review-step.tsx:24-47), initialization (64-86), UI rendering (439-498), handlers (170-201), validation (121-136), hooks (use-sellers.ts:58-60), and dialog integration (554-562).

- `docs/contribute/architecture/application_overview.md` — Pass — `plan.md:9, 80-81, 121-140` — Plan correctly uses generated API types from `src/lib/api/generated/types.ts` (line 16 in research), leverages custom hooks wrapping generated clients (useCreateSeller from use-sellers.ts at lines 58-60), and maintains snake_case → camelCase transformation pattern in lib/utils/ai-parts.ts exactly matching the application's documented architecture.

- `docs/contribute/testing/playwright_developer_guide.md` — Pass — `plan.md:390-470` — Deterministic test plan section provides 6 detailed scenarios in Given/When/Then format, specifies instrumentation using existing `data-testid` patterns and `waitTestEvent` helpers for form events (line 429: `formId: 'SellerForm_inline-create'`), references `testData.sellers.create()` factory at line 468, and confirms seller factory exists at `tests/api/factories/seller-factory.ts` (line 470). No route mocking; all scenarios use real backend via factories.

- `CLAUDE.md` — Pass — `plan.md:194-200, 494-499, 217-218` — Plan explicitly includes initialization code pattern (section 5, lines 194-200), validation code snippet (section 14, lines 494-499), and clarifies instrumentation responsibility (dialog emits events, parent handles mutations per line 217-218). Follows project requirement to ship instrumentation changes with Playwright coverage in same slice (section 14, lines 476-502).

**Fit with codebase**

- `src/components/parts/ai-part-review-step.tsx` (TypeCreateDialog pattern) — `plan.md:99, 170-197, 554-562` — Plan mirrors existing type suggestion flow exactly: handlers at lines 170-197 match type handlers at component lines 170-201, suggestion box UI pattern at plan lines 276-313 mirrors component lines 276-313, and dialog rendering at plan line 555-562 matches TypeCreateDialog pattern at component lines 554-562. Perfect alignment confirmed.

- `src/components/sellers/seller-create-dialog.tsx` — `plan.md:14, 212-218, 427-431` — Plan correctly identifies dialog API contract (requires `name` and `website`, lines 34-53 in component), notes dialog uses `onSuccess` callback pattern rather than handling mutation directly (plan line 217 matches component lines 66-68 calling `onSuccess(payload)`), and references form instrumentation with correct formId (plan line 429 matches component line 85 `generateFormId('SellerForm', 'inline-create')`). Callback-based integration properly documented.

- `src/types/ai-parts.ts` and `src/lib/utils/ai-parts.ts` — `plan.md:6-8, 121-133, 484-488` — Plan's proposed type changes (seller?: string, sellerIsExisting?: boolean, existingSellerId?: number, sellerLink?: string at plan lines 125-129) align with transformation pattern in ai-parts.ts lines 59-82, which uses `analysis?.field ?? undefined` for optional fields. Mapping strategy (plan lines 484-488) maintains consistency with existing transformAIPartAnalysisResult function structure.

- `src/hooks/use-sellers.ts` — `plan.md:111-113, 165-177` — Plan references `useCreateSeller()` hook at line 111 (component will import and use), which exists at hooks file line 58-60 wrapping `usePostSellers()`. Integration surface section (plan lines 172-177) correctly describes POST /api/sellers endpoint, mutation payload structure, and automatic cache invalidation matching TanStack Query patterns used throughout codebase.

- `tests/api/factories/seller-factory.ts` — `plan.md:468-470` — Plan documents seller factory already exists and provides `create()` and `randomSellerName()` methods (factory lines 39-54, 130-132). Test plan scenario at plan lines 462-468 correctly references `testData.sellers.create()` pattern matching factory API, ensuring deterministic test data setup per Playwright developer guide principles.

---

## 3) Open Questions & Ambiguities

No unresolved questions remain. All potential ambiguities from the initial review have been addressed:

1. **State initialization pattern** — Resolved with explicit code at plan lines 194-200 showing conditional logic for `sellerIsExisting`, `sellerId`, `suggestedSellerName`, and `sellerLink` initialization.

2. **Dialog integration responsibilities** — Clarified at plan lines 212-218 that parent component invokes `createSellerMutation.mutateAsync()` and dialog only calls `onSuccess()` callback with form values, matching SellerCreateDialog implementation lines 55-72.

3. **Validation implementation** — Made explicit with code snippet at plan lines 494-499 showing exact validation logic to add to `validateForm()` function.

4. **Test factory availability** — Confirmed seller factory exists at plan line 470 with reference to `tests/api/factories/seller-factory.ts`.

All questions that could be answered through research have been answered with evidence from the codebase.

---

## 4) Deterministic Playwright Coverage (new/changed behavior only)

- **Behavior:** AI Part Review Step - Seller Suggestion (existing seller)
- **Scenarios:**
  - Given AI analysis returns `seller_is_existing: true` and `existing_seller_id: 5`, When review step loads, Then `SellerSelector` dropdown is pre-populated with seller ID 5, And seller link input is populated with `analysisResult.sellerLink`, And no suggestion box is shown (`tests/e2e/parts/ai-parts-seller.spec.ts` - to be created)
- **Instrumentation:** `data-testid="parts.ai.review-step"` (existing, line 204 in component), seller selector uses existing test IDs from SellerSelector component
- **Backend hooks:** `testData.sellers.create()` factory to seed existing seller (available at `tests/api/factories/seller-factory.ts`)
- **Gaps:** None
- **Evidence:** `plan.md:392-401`, component `ai-part-review-step.tsx:466-472`

---

- **Behavior:** AI Part Review Step - Seller Suggestion (new seller)
- **Scenarios:**
  - Given AI analysis returns `seller: "Mouser"`, `seller_is_existing: false`, When review step loads, Then suggestion box displays "Suggested seller: Mouser", And "Create Seller" button is visible, And clear (X) button is visible, And `SellerSelector` dropdown is not shown (`tests/e2e/parts/ai-parts-seller.spec.ts`)
- **Instrumentation:** Add `data-testid` to seller suggestion box following type suggestion box pattern at component lines 276-302, reuse clear button pattern
- **Backend hooks:** No prerequisite data needed; AI analysis mock provides `seller_is_existing: false`
- **Gaps:** None (plan should specify exact `data-testid` value to add, but this is Minor since pattern is clear)
- **Evidence:** `plan.md:405-416`, component pattern at `ai-part-review-step.tsx:276-302`

---

- **Behavior:** Seller Creation from Suggestion
- **Scenarios:**
  - Given suggestion box shows "Mouser", When user clicks "Create Seller", Then `SellerCreateDialog` opens with name field pre-filled "Mouser", When user enters "https://www.mouser.com" in website field and submits, Then form instrumentation emits `form` event with `phase: 'success'`, And dialog closes, And `SellerSelector` shows newly created seller, And suggestion box is removed (`tests/e2e/parts/ai-parts-seller.spec.ts`)
- **Instrumentation:** `waitTestEvent(page, 'form', evt => evt.formId === 'SellerForm_inline-create' && evt.phase === 'success')` — instrumentation exists in SellerCreateDialog at lines 85-99
- **Backend hooks:** POST /api/sellers via mutation triggered by parent component callback handler
- **Gaps:** None
- **Evidence:** `plan.md:419-432`, `seller-create-dialog.tsx:85-99`

---

- **Behavior:** Clear Seller Suggestion
- **Scenarios:**
  - Given suggestion box shows suggested seller, When user clicks clear (X) button, Then suggestion box is removed, And `SellerSelector` dropdown is shown, And `sellerId` is undefined (`tests/e2e/parts/ai-parts-seller.spec.ts`)
- **Instrumentation:** Standard React state update, no dedicated test event (verify via UI visibility assertions)
- **Backend hooks:** None required
- **Gaps:** None
- **Evidence:** `plan.md:435-445`, component pattern `ai-part-review-step.tsx:176-180`

---

- **Behavior:** Validation - Unresolved Suggestion
- **Scenarios:**
  - Given suggestion box shows suggested seller, When user clicks "Add Part" without creating or clearing seller, Then inline error shows "Please create the suggested seller or select an existing one", And submit button remains enabled but form submission is blocked (`tests/e2e/parts/ai-parts-seller.spec.ts`)
- **Instrumentation:** Standard validation error display (assert on error message text presence)
- **Backend hooks:** None required
- **Gaps:** None
- **Evidence:** `plan.md:448-457`, validation pattern `ai-part-review-step.tsx:128-132`

---

- **Behavior:** End-to-End AI Analysis with Seller
- **Scenarios:**
  - Given backend factory creates seller "DigiKey" with ID 10, When AI analysis mock returns `seller: "DigiKey"`, `seller_is_existing: true`, `existing_seller_id: 10`, `seller_link: "https://digikey.com/part123"`, Then review step shows `SellerSelector` pre-populated with ID 10, And seller link input shows "https://digikey.com/part123", When user submits form, Then part creation payload includes `seller_id: 10`, `seller_link: "https://digikey.com/part123"` (`tests/e2e/parts/ai-parts-end-to-end.spec.ts`)
- **Instrumentation:** Form submission events, backend API response validation
- **Backend hooks:** `testData.sellers.create()` to seed "DigiKey" seller, AI analysis mock returns matching `existing_seller_id`
- **Gaps:** None
- **Evidence:** `plan.md:460-470`, factory exists at `tests/api/factories/seller-factory.ts`

**Summary:** All new/changed behaviors have deterministic Playwright scenarios with specified instrumentation and backend coordination. No route mocking required; all tests use real backend via factories per Playwright developer guide. Minor gap: exact `data-testid` value for seller suggestion box not specified, but pattern is clear from type suggestion reference.

---

## 5) Adversarial Sweep (must find ≥3 credible issues or declare why none exist)

**Minor — Test ID Specification Incomplete for New Seller Suggestion Box**

**Evidence:** `plan.md:405-416, section 13 "AI Part Review Step - Seller Suggestion (new seller)"` — Plan states "Add `data-testid` to suggestion box, reuse clear button pattern from type" but does not specify the exact `data-testid` value to add.

**Why it matters:** While the pattern reference is clear (type suggestion box at component lines 276-302), the implementer must infer the naming convention. Explicit test IDs prevent inconsistency and make Playwright specs easier to write without requiring implementer to inspect the type pattern first.

**Fix suggestion:** Add explicit test ID specification to section 13 (lines 405-416): "Add `data-testid='parts.ai.seller-suggestion'` to the seller suggestion box container, matching the pattern used for type suggestions." Also add to section 14 implementation checklist at line 500 after "Update seller section UI..."

**Confidence:** High — This is a documentation completeness issue rather than a technical gap. The implementation will work without this clarification, but explicit IDs improve plan precision per the review methodology's "be exhaustive" requirement for affected areas.

---

**Minor — SellerCreateDialog Props Interface Mismatch Documentation**

**Evidence:** `plan.md:212-218, section 5 "Create suggested seller" flow` — Plan describes dialog callback as `onSuccess({ name, website })` with trimmed values, but SellerCreateDialog component at lines 13-14 shows callback signature is `onSuccess: (data: { name: string; website: string }) => void`, and the actual trimming happens inside the dialog's onSubmit handler (component lines 56-59) before calling onSuccess at line 67.

**Why it matters:** The plan's description is technically correct but could be clearer about where trimming occurs. Current wording "Dialog calls `onSuccess({ name, website })` callback with trimmed values" (line 213) implies dialog performs trimming, which it does, but doesn't clarify that this happens in dialog's internal onSubmit handler before invoking the parent's onSuccess callback. This could confuse implementers about where validation/trimming responsibilities lie.

**Fix suggestion:** Clarify section 5, step 4 (line 213) to read: "Dialog's internal onSubmit handler trims values and calls parent's `onSuccess({ name, website })` callback with cleaned data." This makes the flow unambiguous: dialog handles field-level validation and normalization, parent handles mutation.

**Confidence:** Medium — The existing description is accurate but could be more precise. The implementer can infer correct behavior from component reference at line 219, but explicit clarification would strengthen the plan per the "no guessing" requirement.

---

**Minor — Missing Explicit State Update After Seller Creation Success**

**Evidence:** `plan.md:212-218, section 5, step 6` — Plan states "On mutation success: Set `sellerId = result.id`, clear `suggestedSellerName`, set `sellerIsExisting = true`, close dialog" but the implementation checklist at lines 492-502 does not include explicit code for this state update logic in the `handleConfirmCreateSeller` handler pattern.

**Why it matters:** While the type creation handler at component lines 182-197 provides the pattern, the plan should include the exact seller-specific code to ensure the implementer sets all three fields (`sellerId`, `suggestedSellerName`, `sellerIsExisting`) in correct sequence. Missing any field could leave form in inconsistent state (e.g., suggestion still visible after successful creation).

**Fix suggestion:** Add explicit handler code to section 14 implementation checklist (after line 493 "Add `showCreateSellerDialog` state and `createSellerMutation` hook"):
```typescript
const handleConfirmCreateSeller = useCallback(async (data: { name: string; website: string }) => {
  try {
    const result = await createSellerMutation.mutateAsync({ body: data });
    updateField('sellerId', result.id);
    updateField('suggestedSellerName', undefined);
    updateField('sellerIsExisting', true);
    setShowCreateSellerDialog(false);
  } catch {
    // Error handling automatic via global system
  }
}, [updateField, createSellerMutation]);
```

**Confidence:** High — The pattern exists (TypeCreateDialog handler at component lines 182-197), but seller flow requires different callback signature (receives `{ name, website }` object instead of string). Explicit code prevents implementer mistakes with field clearing sequence.

---

**Checks attempted that found no issues:**

- **React Query cache invalidation:** Checked that `useCreateSeller` (plan line 172-177) wraps `usePostSellers` which is a generated hook. Verified in `use-sellers.ts:58-60` that mutation is properly wrapped and will trigger automatic cache invalidation per TanStack Query patterns used throughout the app. No manual invalidation needed in parent component. Evidence: application_overview.md confirms centralized React Query error handling and cache management.

- **Seller/SellerLink field independence:** Verified that `sellerLink` field (plan lines 82, 143, 193, 476-496) has no dependency on `sellerId` or `suggestedSellerName` state. Field is initialized from `analysisResult.sellerLink` (line 82, 193) and allows independent editing regardless of seller suggestion state. Component shows sellerLink input at lines 476-496 as standalone field, correctly treated as pass-through data per plan assumption at line 62. No risk of orphaned state.

- **Dialog open state management:** Verified dialog rendering pattern at plan line 501 will use conditional rendering matching TypeCreateDialog at component lines 554-562. Dialog has controlled `open` prop and `onOpenChange` handler (SellerCreateDialog component lines 11-12, 101-107) ensuring proper cleanup. No risk of stale dialog state.

- **Form validation blocking submission:** Confirmed validation at plan lines 494-499 runs in `validateForm()` callback invoked by `handleCreatePart` before mutation (component line 139 pattern). Submit button disable logic not affected by seller validation (only by `isCreating` flag per component line 545), but form submission early-exits if `validateForm()` returns false (component line 139 `if (!validateForm() || isCreating) return;`). Validation correctly blocks submission.

- **State initialization edge cases:** Reviewed initialization code at plan lines 194-200. Logic handles all cases: (1) existing seller sets `sellerId`, (2) non-existing seller with name sets `suggestedSellerName`, (3) no seller data leaves both undefined. The conditional `!analysisResult.sellerIsExisting` check prevents setting `suggestedSellerName` when `sellerIsExisting` is true, maintaining mutual exclusivity documented in section 6 invariant (plan line 248). No edge case for null/undefined `sellerIsExisting` because plan defaults to `false` (line 196: `sellerIsExisting: analysisResult.sellerIsExisting || false`).

- **TypeScript type safety:** Verified plan references generated API types at `src/lib/api/generated/types.ts:1788-1807` for backend schema (plan lines 16, 132-133, 183-184). Transformation layer at plan lines 484-488 uses nullish coalescing (`??`) matching existing pattern in `ai-parts.ts:59-82`. PartFormData interface extension at plan lines 139-144 aligns with component state structure (lines 24-47). No type mismatch risks.

**Why the plan holds:** The corrections from the initial review eliminated all major risks. State initialization is now explicit and correct, dialog integration responsibilities are clear, validation logic is specified with code, and test coverage is deterministic with existing factory support. The three minor issues above are documentation precision improvements rather than implementation blockers.

---

## 6) Derived-Value & State Invariants (table)

- **Derived value:** Seller suggestion visibility
  - **Source dataset:** Unfiltered — `formData.suggestedSellerName !== undefined` (direct form state check, not derived from query cache or filtered list)
  - **Write / cleanup triggered:** Controls conditional render of seller suggestion box vs. `SellerSelector` dropdown (component lines 276-313 pattern for type, will be replicated for seller). Cleared on successful seller creation (plan line 215, step 6) or when user clicks clear button (plan line 225, handleClearSellerSuggestion).
  - **Guards:** Suggestion cleared by two paths: (1) successful mutation in `handleConfirmCreateSeller` sets `suggestedSellerName = undefined` (plan line 215), (2) explicit user action via `handleClearSellerSuggestion` (plan lines 223-229). Dialog cannot close with suggestion still active unless mutation succeeds (dialog remains open on error per SellerCreateDialog component lines 70-72).
  - **Invariant:** If `suggestedSellerName` is defined, then `sellerId` must be undefined (mutually exclusive). If `sellerId` is defined, then `suggestedSellerName` must be undefined. Suggestion box and dropdown cannot both render simultaneously.
  - **Evidence:** `plan.md:243-249, section 6, first entry`

---

- **Derived value:** Form validity (seller section contribution)
  - **Source dataset:** Unfiltered — Direct check on `formData.suggestedSellerName` and `formData.sellerId` fields (plan lines 235-240, validation logic lines 494-499)
  - **Write / cleanup triggered:** Enables/disables form submission via `validateForm()` return value checked in `handleCreatePart` (component line 139 pattern). Validation errors set in state (plan line 134: `setErrors(newErrors)`) and cleared when user corrects field (component lines 98-102 pattern in updateField callback).
  - **Guards:** Validation runs on every form submission attempt (plan line 138-139). Errors for seller field cleared automatically when `updateField('sellerId', ...)` or `updateField('suggestedSellerName', ...)` called (component lines 99-101 pattern).
  - **Invariant:** Form cannot be submitted if `suggestedSellerName` is present without `sellerId`. This prevents orphaned suggestions from reaching backend. Once user creates seller or clears suggestion, validation passes (plan lines 494-499 logic).
  - **Evidence:** `plan.md:251-256, section 6, second entry`

---

- **Derived value:** Seller creation dialog initial name sync
  - **Source dataset:** Unfiltered — `formData.suggestedSellerName` prop passed to SellerCreateDialog as `initialName` (plan line 501, dialog will render similar to TypeCreateDialog at component lines 554-562)
  - **Write / cleanup triggered:** Dialog's internal useEffect syncs `initialName` prop to form field when dialog opens (SellerCreateDialog component lines 79-83: `if (open && initialName && form.values.name !== initialName) { setValue('name', initialName) }`). Dialog resets form on close (component lines 101-107: `form.reset()` called in handleDialogOpenChange).
  - **Guards:** Dialog only opens when `suggestedSellerName` is defined (plan line 261: "Dialog only opens when `suggestedSellerName` is defined"). Dialog controlled by `showCreateSellerDialog` boolean state (plan line 492). Dialog has controlled `open` prop ensuring deterministic lifecycle.
  - **Invariant:** When dialog opens, `initialName` always equals current `suggestedSellerName` value. Dialog form resets to empty state on close, preventing stale data in subsequent opens. If `suggestedSellerName` changes between dialog opens (edge case), useEffect re-syncs name field.
  - **Evidence:** `plan.md:258-264, section 6, third entry`, `seller-create-dialog.tsx:79-83, 101-107`

---

**Analysis:** None of these derived values use filtered datasets to drive persistent writes. All sources are direct form state fields or controlled props. Validation prevents writes with unresolved suggestions (guards in place). Mutual exclusivity between `suggestedSellerName` and `sellerId` is maintained by explicit state updates in both creation and clear handlers. No cache orphaning or data loss risks identified.

---

## 7) Risks & Mitigations (top 3)

- **Risk:** User creates seller but leaves website field empty
  - **Mitigation:** Existing `SellerCreateDialog` validation enforces required website field (component lines 39-53: `if (!value.trim()) return 'Website is required'`). Submit button disabled until both name and website are valid (component line 160: `disabled={!form.isValid || form.isSubmitting}`). No plan changes needed; existing component prevents this scenario.
  - **Evidence:** `plan.md:506-509, section 15, first risk entry`

---

- **Risk:** AI returns seller name that differs slightly from existing seller (e.g., "Digi-Key" vs. "DigiKey")
  - **Mitigation:** Backend determines `seller_is_existing` flag via its own fuzzy matching logic (plan assumption at line 59: "Backend already returns... `seller_is_existing`..."). Frontend trusts this boolean and shows suggestion box when `false`, dropdown when `true`. No frontend duplicate detection logic needed. Backend responsibility clearly defined; frontend implementation agnostic to matching algorithm.
  - **Evidence:** `plan.md:512-515, section 15, second risk entry`

---

- **Risk:** User creates seller with duplicate name
  - **Mitigation:** Backend enforces uniqueness constraints at database level. On POST /api/sellers with duplicate name, backend returns validation error. Global error handling system displays toast with backend error message (plan line 520: "global error handling system displays toast"). SellerCreateDialog remains open on error (component lines 70-72: catch block calls `trackError` but does not close dialog), allowing user to correct name and retry. Dialog instrumentation emits error event for Playwright verification. Frontend does not need client-side duplicate checking.
  - **Evidence:** `plan.md:517-521, section 15, third risk entry (corrected from initial review)`

---

## 8) Confidence

**Confidence:** High — All blocking issues from initial review resolved with explicit code patterns and evidence. Plan replicates proven type suggestion pattern with comprehensive references (component lines 170-201, 276-313, 554-562). Backend schema confirmed in generated types (types.ts:1788-1807). All required components exist (SellerCreateDialog, SellerSelector, useCreateSeller hook, seller factory). Testing strategy deterministic with real backend via factories (no mocking). Three minor documentation precision issues identified above do not block implementation; competent developer can infer correct behavior from referenced patterns. Plan is implementation-ready.

