# Code Review: AI Analysis Seller Support

## 1) Summary & Decision

**Readiness**

The implementation correctly replicates the established type suggestion pattern for seller fields, maintaining consistency with the existing codebase architecture. All three key files (types, transformation utility, and review component) were modified as specified in the plan. The code follows TypeScript strict mode, uses camelCase domain models, integrates properly with existing components and hooks, and maintains the same state management patterns. The transformation layer correctly maps snake_case API fields to camelCase frontend models. However, the implementation is incomplete: no Playwright tests were added or updated, violating the project's Definition of Done requirement that UI changes must ship with automated test coverage in the same change.

**Decision**

`GO-WITH-CONDITIONS` — Implementation is technically sound and follows documented patterns correctly, but violates the mandatory testing policy. Must add Playwright test coverage before merging.

## 2) Conformance to Plan (with evidence)

**Plan alignment**

- Type definitions (`plan.md` section 3, lines 123-133) ↔ `src/types/ai-parts.ts:42-45` — All four seller-related fields added correctly:
  ```typescript
  seller?: string;
  sellerIsExisting?: boolean;
  existingSellerId?: number;
  sellerLink?: string;
  ```

- Transformation mapping (`plan.md` section 3, lines 131-132) ↔ `src/lib/utils/ai-parts.ts:80-83` — Backend fields correctly mapped using nullish coalescing:
  ```typescript
  seller: analysis?.seller ?? undefined,
  sellerIsExisting: analysis?.seller_is_existing ?? undefined,
  existingSellerId: analysis?.existing_seller_id ?? undefined,
  sellerLink: analysis?.seller_link ?? undefined,
  ```

- Form data interface (`plan.md` section 3, lines 137-147) ↔ `src/components/parts/ai-part-review-step.tsx:47-50` — Form state fields match specification:
  ```typescript
  sellerIsExisting: boolean;
  sellerId?: number;
  suggestedSellerName?: string;
  sellerLink: string;
  ```

- State initialization (`plan.md` section 5, lines 196-199) ↔ `src/components/parts/ai-part-review-step.tsx:88-91` — Correctly distinguishes existing vs. new seller:
  ```typescript
  sellerIsExisting: analysisResult.sellerIsExisting || false,
  sellerId: analysisResult.sellerIsExisting ? analysisResult.existingSellerId ?? undefined : undefined,
  suggestedSellerName: !analysisResult.sellerIsExisting ? (analysisResult.seller || undefined) : undefined,
  sellerLink: analysisResult.sellerLink || '',
  ```

- Validation logic (`plan.md` section 5, lines 236-240) ↔ `src/components/parts/ai-part-review-step.tsx:142-144` — Prevents submission with unresolved suggestion:
  ```typescript
  if (formData.suggestedSellerName && !formData.sellerId) {
    newErrors.seller = 'Please create the suggested seller or select an existing one';
  }
  ```

- Seller suggestion UI (`plan.md` section 5, lines 407-415) ↔ `src/components/parts/ai-part-review-step.tsx:509-539` — Suggestion box matches type pattern with "Create Seller" and clear buttons

- Seller creation handlers (`plan.md` section 5, lines 209-216) ↔ `src/components/parts/ai-part-review-step.tsx:215-242` — Three handlers implemented following type pattern: `handleCreateSuggestedSeller`, `handleClearSellerSuggestion`, `handleConfirmCreateSeller`

- Dialog integration (`plan.md` section 5, lines 210-211) ↔ `src/components/parts/ai-part-review-step.tsx:638-646` — `SellerCreateDialog` rendered conditionally with `initialName` pre-filled

**Gaps / deviations**

- **CRITICAL**: `plan.md` section 13 (lines 391-470) — Test plan documented but zero Playwright tests added or updated. The plan specified 7 test scenarios covering:
  - Existing seller pre-population
  - New seller suggestion display
  - Seller creation flow
  - Clear suggestion interaction
  - Validation enforcement
  - End-to-end AI analysis with seller

  No modifications found in `tests/e2e/parts/part-ai-creation.spec.ts` or new test files. This violates `CLAUDE.md` Definition of Done: "Playwright specs are created or updated in the same change" and the UI & Playwright Coupling mandate: "Ship instrumentation changes and matching Playwright coverage in the same slice."

- `plan.md` section 9 (lines 324-347) — Plan references instrumentation from `SellerCreateDialog` (`formId: 'SellerForm_inline-create'`) which exists at `src/components/sellers/seller-create-dialog.tsx:85-99`, but no test assertions verify this instrumentation is functional for the inline creation scenario.

## 3) Correctness — Findings (ranked)

- Title: **Blocker — Missing Playwright test coverage**
- Evidence: `git diff tests/` shows no changes; `tests/e2e/parts/part-ai-creation.spec.ts:63-64` sets seller fields to `null` in existing spec but was not updated
- Impact: Violates mandatory testing policy from `CLAUDE.md` and `docs/contribute/testing/playwright_developer_guide.md`. The feature cannot be verified to work correctly, and regressions are undetectable. The plan documented 7 test scenarios (section 13) that remain unimplemented.
- Fix: Add Playwright coverage for at minimum: (1) AI analysis with existing seller pre-selects dropdown, (2) AI analysis with new seller shows suggestion box, (3) creating suggested seller via dialog populates `sellerId` and removes suggestion. Use `aiAnalysisMock` to seed seller fields, `testData.sellers.create()` factory for prerequisites, and `waitTestEvent(page, 'form', evt => evt.formId === 'SellerForm_inline-create' && evt.phase === 'success')` to verify creation.
- Confidence: High

- Title: **Major — Mutation error handling silently swallows exceptions**
- Evidence: `src/components/parts/ai-part-review-step.tsx:239-241` — Empty catch block in `handleConfirmCreateSeller`:
  ```typescript
  } catch {
    // Error handling is automatic via the global error handling system
  }
  ```
- Impact: If `createSellerMutation.mutateAsync` throws (network failure, validation error, etc.), the dialog remains open but the catch block does nothing. The comment claims "automatic" handling, but mutation errors must be actively tracked for instrumentation. Without explicit `instrumentationRef.current?.trackError()`, the form instrumentation may miss the error phase.
- Fix: Verify whether `useCreateSeller` mutation already integrates with global error handling that emits instrumentation events. If not, add explicit error tracking similar to `SellerCreateDialog:71` pattern or ensure mutation hook emits test events on error.
- Confidence: Medium — Depends on whether `useCreateSeller` hook already handles instrumentation; review `src/hooks/use-sellers.ts:58-60` implementation.

- Title: **Minor — Initialization logic could be simplified with single conditional**
- Evidence: `src/components/parts/ai-part-review-step.tsx:88-90` — Three separate ternary expressions:
  ```typescript
  sellerIsExisting: analysisResult.sellerIsExisting || false,
  sellerId: analysisResult.sellerIsExisting ? analysisResult.existingSellerId ?? undefined : undefined,
  suggestedSellerName: !analysisResult.sellerIsExisting ? (analysisResult.seller || undefined) : undefined,
  ```
- Impact: Slightly harder to verify mutual exclusivity invariant between `sellerId` and `suggestedSellerName` at a glance. Not a correctness issue but adds cognitive overhead.
- Fix: Add inline comment documenting the invariant: `// Invariant: sellerId and suggestedSellerName are mutually exclusive based on sellerIsExisting`
- Confidence: High

## 4) Over-Engineering & Refactoring Opportunities

No over-engineering detected. The implementation correctly reuses existing abstractions (`SellerCreateDialog`, `SellerSelector`, `useCreateSeller`) and follows the established type suggestion pattern without introducing new complexity. The code duplication between type and seller handlers is acceptable given the consistent pattern it creates.

## 5) Style & Consistency

- Pattern: Handler naming convention
- Evidence: `src/components/parts/ai-part-review-step.tsx:215-242` — Three seller handlers follow exact naming pattern from type handlers (lines 182-213): `handleCreateSuggested*`, `handleClear*Suggestion`, `handleConfirmCreate*`
- Impact: Positive — Perfect consistency aids maintenance
- Recommendation: None; this is exemplary pattern replication

- Pattern: Mutation hook usage
- Evidence: `src/components/parts/ai-part-review-step.tsx:99` imports `useCreateSeller` alongside existing `useCreateType` at line 98
- Impact: Positive — Parallel structure maintains predictability
- Recommendation: None; consistent with existing code

## 6) Tests & Deterministic Coverage (new/changed behavior only)

**CRITICAL GAP: Zero test coverage provided**

- Surface: AI Part Review Step — Seller suggestion rendering and interaction
- Scenarios: **NONE IMPLEMENTED** (plan documented 7 scenarios at lines 391-470)
  - Missing: Existing seller pre-population test
  - Missing: New seller suggestion display test
  - Missing: Seller creation flow test
  - Missing: Clear suggestion test
  - Missing: Validation error test
  - Missing: End-to-end AI analysis with seller test
- Hooks: `SellerCreateDialog` emits `form` events with `formId: 'SellerForm_inline-create'` (verified at `src/components/sellers/seller-create-dialog.tsx:85-99`), but no tests consume these events
- Gaps: Complete absence of test coverage. Existing spec `tests/e2e/parts/part-ai-creation.spec.ts:63-64` hardcodes `seller: null` and was not updated despite the implementation making seller functional.
- Evidence: `git diff tests/` returns empty; plan section 13 (`docs/features/ai_analysis_seller_support/plan.md:391-470`) shows comprehensive test plan that was not executed

**Required test additions (minimum viable):**

1. Update `tests/e2e/parts/part-ai-creation.spec.ts` to verify seller fields are populated when AI returns seller data
2. Add scenario testing `sellerIsExisting: true` with pre-selected dropdown
3. Add scenario testing `sellerIsExisting: false` with suggestion box → create seller → verify dropdown shows new seller
4. Verify validation error when user attempts submit with unresolved `suggestedSellerName`

## 7) Adversarial Sweep

**Attempted attacks:**

1. **Race condition: Seller creation during form submission**
   - Attack: User clicks "Add Part" while `createSellerMutation` is in flight
   - Code review: `src/components/parts/ai-part-review-step.tsx:151` checks `isCreating` before proceeding, but `createSellerMutation.isPending` is separate. User could click submit while seller dialog is processing.
   - Evidence: `handleCreatePart` at line 150 validates `formData.sellerId` presence; if seller creation hasn't completed, `sellerId` will be undefined and validation will fail with "Please create the suggested seller..." message
   - Why code held up: Validation catches the race — cannot submit without `sellerId`, and seller creation must complete and set `sellerId` before validation passes

2. **Stale closure: Dialog initialName prop changes mid-open**
   - Attack: `suggestedSellerName` changes while dialog is open (e.g., via external state mutation)
   - Code review: `SellerCreateDialog` uses `useEffect` at `src/components/sellers/seller-create-dialog.tsx:79-83` to sync `initialName` to form value when dialog opens:
     ```typescript
     useEffect(() => {
       if (open && initialName && form.values.name !== initialName) {
         setValue('name', initialName)
       }
     }, [form.values.name, initialName, open, setValue])
     ```
   - Evidence: Effect depends on `initialName`, so if parent component's `suggestedSellerName` changes while dialog is open, the effect will update the form field
   - Why code held up: `SellerCreateDialog` defensively handles prop changes during open state

3. **Derived state inconsistency: sellerId and suggestedSellerName both defined**
   - Attack: Initialization or mutation logic sets both `sellerId` and `suggestedSellerName` simultaneously
   - Code review: Initialization at lines 88-90 uses mutually exclusive conditionals (`sellerIsExisting ? ... : undefined` and `!sellerIsExisting ? ... : undefined`). Mutation handlers enforce clearing:
     - `handleConfirmCreateSeller` (line 235): sets `sellerId`, clears `suggestedSellerName` to `undefined`
     - `handleClearSellerSuggestion` (lines 221-225): clears both `sellerId` and `suggestedSellerName` to `undefined`
   - Evidence: No code path sets both to defined values simultaneously
   - Why code held up: Initialization and all state transitions preserve mutual exclusivity invariant

## 8) Invariants Checklist

- Invariant: `formData.sellerId` and `formData.suggestedSellerName` are mutually exclusive (at most one is defined at any time)
  - Where enforced: Initialization logic (`src/components/parts/ai-part-review-step.tsx:88-90`) and mutation handlers (`handleConfirmCreateSeller` at lines 235-236, `handleClearSellerSuggestion` at lines 222-224)
  - Failure mode: Both fields defined would cause UI to render suggestion box (driven by `suggestedSellerName !== undefined` at line 509) while `sellerId` is populated, leading to confusing state where user sees suggestion but backend has seller ID
  - Protection: Conditional initialization branches are mutually exclusive; handlers that set `sellerId` clear `suggestedSellerName` and vice versa
  - Evidence: Lines 88-90, 222-224, 235-236

- Invariant: Form cannot submit if `suggestedSellerName` is defined but `sellerId` is undefined (user must resolve suggestion)
  - Where enforced: Validation function (`src/components/parts/ai-part-review-step.tsx:142-144`)
  - Failure mode: Without validation, part creation would proceed with unresolved seller suggestion, losing AI-provided seller name and creating part without seller metadata
  - Protection: Validation sets `newErrors.seller` and `validateForm()` returns false, preventing `handleCreatePart` from calling `onCreatePart` (line 151 checks `!validateForm()` early return)
  - Evidence: Lines 142-144, 151

- Invariant: `SellerCreateDialog` only opens when `suggestedSellerName` is defined
  - Where enforced: Conditional render (`src/components/parts/ai-part-review-step.tsx:638`) and button handler (`handleCreateSuggestedSeller` at lines 215-219)
  - Failure mode: Opening dialog without `suggestedSellerName` would render with empty `initialName`, forcing user to type seller name manually (defeats purpose of AI suggestion)
  - Protection: Handler checks `if (formData.suggestedSellerName)` before setting dialog state; JSX uses `&&` short-circuit with `showCreateSellerDialog && formData.suggestedSellerName`
  - Evidence: Lines 215-219, 638

- Invariant: Transformation layer never produces both `seller` and `sellerId` from AI analysis (backend contract)
  - Where enforced: Backend API schema (`openapi-cache/openapi.json:208-224, 362-398`) defines `existing_seller_id` as populated only when `seller_is_existing: true`
  - Failure mode: If backend returned `seller_is_existing: false` with `existing_seller_id: 5`, frontend would incorrectly initialize `sellerId: 5` and `suggestedSellerName: undefined` (lines 89-90), hiding AI suggestion
  - Protection: Transformation trusts backend contract; initialization logic at lines 88-90 prevents both from being defined even if backend violates contract (conditional branches are exclusive)
  - Evidence: `src/components/parts/ai-part-review-step.tsx:88-90`; `openapi-cache/openapi.json:208-224`

## 9) Questions / Needs-Info

- Question: Does `useCreateSeller` mutation hook already integrate with global error handling and emit test-event instrumentation on error?
- Why it matters: The empty catch block at `src/components/parts/ai-part-review-step.tsx:239-241` claims "automatic" error handling. If the mutation hook does not emit `form` events with `phase: 'error'`, Playwright tests cannot assert error scenarios and the instrumentation contract is incomplete.
- Desired answer: Review `src/hooks/use-sellers.ts` implementation or confirm that the mutation leverages a shared abstraction (e.g., `useMutation` wrapper) that handles error instrumentation automatically. If not, add explicit `trackError` call.

- Question: Should the existing `tests/e2e/parts/part-ai-creation.spec.ts` be updated to cover seller fields, or should a new dedicated spec be created?
- Why it matters: Plan section 13 shows comprehensive test scenarios but did not specify file location. Extending the existing spec avoids duplication but may bloat a single file; a new spec provides isolation but requires setup duplication.
- Desired answer: Preferred test organization strategy for this feature — extend existing spec with seller variants or create `tests/e2e/parts/part-ai-creation-seller.spec.ts`.

## 10) Risks & Mitigations (top 3)

- Risk: Feature deployed without test coverage, allowing regressions to reach production
- Mitigation: Block merge until minimum viable Playwright coverage added: (1) existing seller pre-selection test, (2) new seller suggestion + creation flow test, (3) validation enforcement test. Update `tests/e2e/parts/part-ai-creation.spec.ts` to populate seller fields in `aiAnalysisMock` and assert UI behavior.
- Evidence: Section 6 findings; plan section 13 (`docs/features/ai_analysis_seller_support/plan.md:391-470`)

- Risk: `useCreateSeller` mutation error handling may not emit instrumentation events, breaking test assertions
- Mitigation: Before writing tests, verify `src/hooks/use-sellers.ts:58-60` implementation emits `form` events on error or add explicit `trackError` call in `handleConfirmCreateSeller` catch block (line 239-241). Run local test with network failure to confirm toast appears and event is emitted.
- Evidence: Section 3 Major finding; Section 9 question

- Risk: Backend changes to seller fields or validation logic could break frontend assumptions without detection
- Mitigation: Playwright tests using real backend will catch contract violations (e.g., backend returning `seller_is_existing: false` with `existing_seller_id` populated). This is the primary reason test coverage is mandatory.
- Evidence: Section 8 invariant 4; testing policy from `docs/contribute/testing/playwright_developer_guide.md:2-3` (real backend always)

## 11) Confidence

Confidence: Medium — Implementation is technically correct and follows documented patterns precisely, but the complete absence of test coverage introduces significant delivery risk. Code quality is high, but the work is not shippable without Playwright tests per project Definition of Done.
