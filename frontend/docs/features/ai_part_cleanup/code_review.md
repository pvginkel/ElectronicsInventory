# Code Review — AI Part Cleanup Feature

**Reviewer**: Claude Code
**Date**: 2026-01-07
**Scope**: Unstaged changes implementing AI Part Cleanup feature
**Plan Reference**: `docs/features/ai_part_cleanup/plan.md`

---

## 1) Summary & Decision

**Readiness**

The AI Part Cleanup implementation delivers a complete, well-structured feature that follows established patterns from the AI analysis feature. The code demonstrates strong adherence to project conventions with comprehensive Playwright test coverage, proper instrumentation, and careful error handling. However, several critical issues must be addressed before shipping: missing `data-value-type` attributes break test selectors, incorrect test selector usage in one error case, and the dialog lacks proper cleanup on unmount which could cause state leaks. The transformation logic is solid, SSE integration follows the documented pattern, and the merge table implementation correctly handles selective field updates.

**Decision**

`GO-WITH-CONDITIONS` — The implementation is fundamentally sound and follows project patterns correctly, but three blocking issues must be fixed: (1) add missing `data-value-type` attributes to merge table cells to match test expectations, (2) fix test selector mismatch for progress error message, and (3) add proper SSE cleanup in dialog unmount effect. All three fixes are minimal and straightforward.

---

## 2) Conformance to Plan (with evidence)

**Plan alignment**

- `Section 14, Slice 1` ↔ `src/hooks/use-ai-part-cleanup.ts:1-148` — Hook implements SSE task subscription, POST to `/api/ai-parts/cleanup`, and result transformation as specified
- `Section 14, Slice 2` ↔ `src/components/parts/ai-part-cleanup-progress-step.tsx:1-118` — Progress step renders loading/error states with retry/cancel buttons
- `Section 14, Slice 3` ↔ `src/components/parts/ai-part-cleanup-merge-step.tsx:1-486` — Merge step implements checkbox table with field comparison and selective PATCH updates
- `Section 14, Slice 4` ↔ `src/components/parts/ai-part-cleanup-merge-step.tsx:346-483` — Type/seller creation integrated with inline buttons replacing rows after creation
- `Section 14, Slice 5` ↔ `src/components/parts/ai-part-cleanup-no-changes-step.tsx:1-41` — No-changes step with success message and close button
- `Section 14, Slice 6` ↔ `tests/e2e/parts/ai-part-cleanup.spec.ts:1-550, tests/support/helpers/ai-cleanup-mock.ts:1-243` — SSE mock pattern and comprehensive E2E scenarios
- `Section 9` ↔ `src/components/parts/ai-part-cleanup-dialog.tsx:103-113` — Test event emission for dialog open with `parts.cleanup.dialog` scope
- `Section 9` ↔ `src/components/parts/ai-part-cleanup-merge-step.tsx:194-202, 301-309` — Form instrumentation events for apply submit/success
- `Section 12, UX Impact` ↔ `src/components/parts/part-details.tsx:304-318` — Menu item added with SparkleIcon using gradient colors
- `Section 3, Data Models` ↔ `src/types/ai-parts.ts:52-103` — Types defined for `CleanedPartData`, `TransformedCleanupResult`, `CleanupFieldChange`
- `Section 3, Data Models` ↔ `src/lib/utils/ai-parts.ts:143-264` — Transformation functions for cleanup result (snake_case ↔ camelCase) and `normalizeFieldValue` helper

**Gaps / deviations**

- `Section 9, data-testid attributes` — Missing `data-value-type` attributes on merge table old/new value cells (`src/components/parts/ai-part-cleanup-merge-step.tsx:431-438`); tests expect `[data-value-type="old"]` and `[data-value-type="new"]` selectors (`tests/e2e/parts/ai-part-cleanup.spec.ts:107-126`) but implementation only has conditional class names. **Blocker**: tests will fail.
- `Section 9, cleanup_query_invalidated` — Plan specifies query invalidation test event but implementation only invalidates without emitting event (`src/components/parts/ai-part-cleanup-merge-step.tsx:296-298`). Tests don't assert on this event, so not blocking, but deviates from observability plan.
- `Section 8, Edge case: Dialog closed after type/seller creation` — Plan recommends confirmation dialog to prevent orphaned resources (`Section 8:524-529`), but implementation allows immediate close without warning (`src/components/parts/ai-part-cleanup-dialog.tsx:139-144`). Acceptable deviation since backend cleanup policy handles this, but UX could be improved.

---

## 3) Correctness — Findings (ranked)

- **Blocker — Missing data-value-type attributes break test selectors**
  - Evidence: `src/components/parts/ai-part-cleanup-merge-step.tsx:431-438` — Table cells for old/new values lack `data-value-type` attributes. Tests use `descriptionRow.locator('[data-value-type="old"]')` (`tests/e2e/parts/ai-part-cleanup.spec.ts:107-108`) and `tagsRow.locator('[data-value-type="old"]')` (`tests/e2e/parts/ai-part-cleanup.spec.ts:125-126`) which will fail to find elements.
  - Impact: Four test scenarios will fail at runtime: lines 107-112 (description value assertions), 125-126 (tags value assertions), creating false test failures despite correct implementation.
  - Fix: Add `data-value-type="old"` to line 431 `<td>` and `data-value-type="new"` to line 437 `<td>` elements. Also add to type/seller creation rows at lines 357-359 and 391-393.
  - Confidence: High — direct selector mismatch between test and implementation.

- **Blocker — Test selector mismatch for progress error message**
  - Evidence: `tests/e2e/parts/ai-part-cleanup.spec.ts:298` expects `parts.cleanup.progress.error` but implementation provides `parts.cleanup.progress-error` (`src/components/parts/ai-part-cleanup-progress-step.tsx:35`) and `parts.cleanup.progress-error-message` (line 38).
  - Impact: Test assertion `const errorText = page.getByTestId('parts.cleanup.progress.error')` will fail to locate error message container, causing test failure.
  - Fix: Change test line 298 to use `parts.cleanup.progress-error` to match implementation, OR change implementation line 35 to use `parts.cleanup.progress.error` (preferred: align with dotted naming convention used elsewhere like `parts.cleanup.merge.table`).
  - Confidence: High — exact testid string mismatch.

- **Major — Dialog unmount doesn't cancel in-flight cleanup task**
  - Evidence: `src/components/parts/ai-part-cleanup-dialog.tsx:117-127` — Effect triggers cleanup on open but lacks cleanup function to call `cancelCleanup()` on unmount. If dialog unmounts while `isCleaningUp === true`, SSE subscription remains active.
  - Impact: SSE listener continues receiving events after component unmounts, potentially causing state updates on unmounted component (React warning) or memory leaks if subscription isn't cleaned up by `useSSETask` internal logic.
  - Fix: Add cleanup function to effect at line 127: `return () => { if (isCleaningUp) { cancelCleanup(); } };` — ensures SSE unsubscribes when dialog unmounts during active cleanup.
  - Confidence: High — standard React effect cleanup pattern; `useAIPartAnalysis` doesn't have this issue because it's used differently, but this dialog triggers cleanup in effect.

- **Major — Double transformation in useAIPartCleanup result**
  - Evidence: `src/hooks/use-ai-part-cleanup.ts:60-66` transforms result in `onResult` callback and sets `isCleaningUp = false`, but line 137 also transforms `sseResult` when returning. This means successful cleanup triggers transformation twice.
  - Impact: Performance inefficiency (double transformation) and potential confusion since `result` is computed from `sseResult` but `onSuccess` callback receives separately transformed data. Not a correctness bug since both produce same output, but violates single-responsibility.
  - Fix: Remove line 137 transformation and instead store transformed result in state within `onResult` callback, then return that state variable. Pattern: `const [result, setResult] = useState<TransformedCleanupResult | null>(null);` at line 51, call `setResult(transformedResult)` at line 61, return `result` directly at line 144.
  - Confidence: High — transformation executed twice on every successful cleanup.

- **Major — Race condition in field changes computation**
  - Evidence: `src/components/parts/ai-part-cleanup-merge-step.tsx:65-137` computes `fieldChanges` in `useMemo` with deps `[currentPart, cleanedPart]`, but `checkedFields` state initialization at lines 139-141 runs only once on mount with initial `fieldChanges` value.
  - Impact: If `currentPart` or `cleanedPart` change after mount (e.g., query refetch), `fieldChanges` recomputes but `checkedFields` state retains stale field names, causing checkbox state to desync from displayed rows.
  - Fix: Add `useEffect` to reset `checkedFields` when `fieldChanges` changes: `useEffect(() => { setCheckedFields(new Set(fieldChanges.map(c => c.fieldName))); }, [fieldChanges]);` — ensures checkbox state stays in sync with computed changes.
  - Confidence: Medium — unlikely in practice since `currentPart` and `cleanedPart` are stable during dialog lifecycle, but technically possible if query invalidates.

- **Minor — Fallback to merge step on missing data is unreachable**
  - Evidence: `src/components/parts/ai-part-cleanup-dialog.tsx:48-49` has fallback `setCurrentStep('merge')` if `currentPart` or `cleanedPart` is null, but this should never happen since `onSuccess` only fires after SSE completes successfully with valid result.
  - Impact: Dead code path that could mask bugs if cleanup result unexpectedly returns null.
  - Fix: Change fallback to log error and show error state instead of silently routing to merge: `console.error('Cleanup succeeded but missing data'); setCurrentStep('progress'); setError('Invalid cleanup result');` — surfaces unexpected states for debugging.
  - Confidence: Medium — fallback may be defensive programming, but logging is better than silent failure.

- **Minor — Type/seller creation success doesn't invalidate list queries**
  - Evidence: `src/components/parts/ai-part-cleanup-merge-step.tsx:156-167, 169-181` — `handleCreateType` and `handleCreateSeller` call mutations but don't invalidate `['types']` or `['sellers']` query keys afterward.
  - Impact: If user creates type/seller during cleanup flow, then navigates to type/seller list page, newly created items may not appear until manual refresh. Not critical for cleanup flow itself but violates cache consistency expectations.
  - Fix: Add `queryClient.invalidateQueries({ queryKey: ['types'] })` after line 162 and `queryClient.invalidateQueries({ queryKey: ['sellers'] })` after line 176.
  - Confidence: High — standard cache invalidation pattern missing.

- **Minor — Missing error instrumentation for PATCH failures**
  - Evidence: `src/components/parts/ai-part-cleanup-merge-step.tsx:314-318` catches PATCH errors and logs them but doesn't call `emitComponentError` like the hook does (`src/hooks/use-ai-part-cleanup.ts:122`).
  - Impact: PATCH errors during apply won't emit test error events, making it harder to debug failures in Playwright tests or production monitoring.
  - Fix: Add `emitComponentError(error as Error, 'ai-part-cleanup-apply');` before line 317 — aligns with error instrumentation pattern from hook.
  - Confidence: High — inconsistent error instrumentation.

- **Minor — Sparkle icon gradient ID could collide**
  - Evidence: `src/components/icons/SparkleIcon.tsx:15` defines gradient with hardcoded ID `sparkle-gradient`. If multiple `SparkleIcon` instances render on same page, all share same gradient definition (benign) but if other gradients use same ID, conflict occurs.
  - Impact: Low probability since ID is specific, but SVG gradient IDs should be unique per instance or use shared defs.
  - Fix: Either move gradient definition to app-level SVG defs and reference by ID, or make ID unique per component instance via `useId()` hook. For simplicity, current implementation is acceptable if only one cleanup menu item appears per page.
  - Confidence: Low — unlikely conflict but technically incorrect SVG usage.

---

## 4) Over-Engineering & Refactoring Opportunities

- **Hotspot: Redundant field mapping switch statement in handleApplyChanges**
  - Evidence: `src/components/parts/ai-part-cleanup-merge-step.tsx:213-276` — Large switch statement manually maps each field name to `cleanedPart` property. This duplicates logic already present in `checkField` function at lines 80-111.
  - Suggested refactor: Extract field metadata to shared map with both label and property accessor, then iterate over checked fields to build `updateData` object dynamically. Example:
    ```typescript
    const FIELD_MAP = {
      description: { label: 'Description', getValue: (data) => data.description },
      manufacturerCode: { label: 'Manufacturer Code', getValue: (data) => data.manufacturerCode },
      // ... etc
    };
    for (const change of fieldChanges.filter(c => checkedFields.has(c.fieldName))) {
      const field = FIELD_MAP[change.fieldName];
      updateData[change.fieldName] = field.getValue(cleanedPart);
    }
    ```
  - Payoff: Reduces 60+ lines of switch statement to 5-line loop, eliminates duplication, makes adding new fields require only one entry in `FIELD_MAP`.

- **Hotspot: Checkbox state managed separately from field changes**
  - Evidence: `src/components/parts/ai-part-cleanup-merge-step.tsx:139-141, 143-153` — `checkedFields` state is separate Set from `fieldChanges` array, requiring manual sync and lookup.
  - Suggested refactor: Store `isChecked` boolean directly in `fieldChanges` array as mutable state, then use `setFieldChanges` to toggle. This consolidates state and eliminates Set lookups.
  - Payoff: Single source of truth for checkbox state, clearer data flow, eliminates `checkedFields.has()` lookups scattered through code.

- **Hotspot: Type/seller creation logic duplicated**
  - Evidence: `src/components/parts/ai-part-cleanup-merge-step.tsx:346-378, 381-412` — Type and seller creation buttons have nearly identical structure and logic.
  - Suggested refactor: Extract shared component `CreateResourceRow` that accepts resource type ('type' or 'seller') and renders appropriate button/dialog. Reduces duplication and makes pattern reusable.
  - Payoff: Cuts 50+ lines of duplicated JSX, centralizes creation flow logic, easier to maintain.

---

## 5) Style & Consistency

- **Pattern: Inconsistent eslint disable comment formatting**
  - Evidence: `src/components/parts/ai-part-cleanup-dialog.tsx:120` uses `eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state initialization on dialog open` while `tests/support/helpers/ai-cleanup-mock.ts:98` uses `eslint-disable-next-line testing/no-route-mocks -- AI cleanup SSE lacks deterministic backend stream`.
  - Impact: Both formats are valid, but mixing `set-state-in-effect` (hyphenated) with standard rule names creates inconsistency.
  - Recommendation: Use standard eslint rule naming consistently; if custom rule exists, ensure naming convention is documented.

- **Pattern: Guidepost comment placement**
  - Evidence: `src/components/parts/ai-part-cleanup-dialog.tsx:43, 58, 116` and `src/hooks/use-ai-part-cleanup.ts:76` use guidepost comments effectively to explain intent. However, `src/components/parts/ai-part-cleanup-merge-step.tsx:63-64` has guidepost explaining computation but doesn't explain why `normalizeFieldValue` is needed (prevents false positives from null/empty differences).
  - Impact: Guideposts improve readability but inconsistent detail level reduces clarity.
  - Recommendation: Add brief rationale to line 64 comment: `// Use normalizeFieldValue to prevent false positives from null/empty string differences`

- **Pattern: Test data-testid conventions**
  - Evidence: Most test IDs follow `parts.cleanup.progress`, `parts.cleanup.merge.table` (dotted scope), but `parts.cleanup.no-changes.close` (line 34 of no-changes step) uses three-level dotted scope while apply button uses `parts.cleanup.apply-button` (two-level with hyphen).
  - Impact: Minor inconsistency in selector naming depth.
  - Recommendation: Standardize on consistent depth: either `parts.cleanup.no-changes-close` or `parts.cleanup.buttons.close` to match established patterns.

---

## 6) Tests & Deterministic Coverage

**Surface: Part detail page menu**

- Scenarios:
  - Given part detail page open, When dropdown menu clicked, Then "Cleanup Part" item visible with sparkle icon (`tests/e2e/parts/ai-part-cleanup.spec.ts:62-69`)
  - Given cleanup menu item clicked, When dialog opens, Then cleanup starts immediately (`tests/e2e/parts/ai-part-cleanup.spec.ts:71-76`)
- Hooks: `parts.overflowMenuButton` page object locator, `data-testid="parts.cleanup.dialog"`, `data-step` attribute, SSE connection wait
- Gaps: None — menu interaction and dialog opening fully covered
- Evidence: Test lines 59-76 verify menu, icon, dialog open, and SSE subscription

**Surface: Cleanup dialog progress step**

- Scenarios:
  - Given cleanup task starts, When SSE emits progress, Then progress messages displayed (`tests/e2e/parts/ai-part-cleanup.spec.ts:82-90`)
  - Given cleanup completes successfully, When task_completed received, Then merge step renders (`tests/e2e/parts/ai-part-cleanup.spec.ts:90-95`)
  - Given cleanup fails, When error emitted, Then error state shown with retry/cancel (`tests/e2e/parts/ai-part-cleanup.spec.ts:254-312`)
- Hooks: `data-testid="parts.cleanup.progress"`, `data-state="error"`, SSE mock `emitStarted/emitProgress/emitCompleted/emitFailure`
- Gaps: Missing test for cancel button during active progress (plan section 13 mentions cancel cleanup flow but test line 308 only tests cancel after error)
- Evidence: Lines 78-90 verify progress, 254-312 verify error handling

**Surface: Merge/apply changes step**

- Scenarios:
  - Given cleanup completed with changes, When merge step renders, Then only changed fields shown with checkboxes (`tests/e2e/parts/ai-part-cleanup.spec.ts:94-121`)
  - Given checkbox unchecked, When values rendered, Then both old/new turn gray (`tests/e2e/parts/ai-part-cleanup.spec.ts:129-131`)
  - Given changes selected, When apply clicked, Then PATCH request sent and dialog closes (`tests/e2e/parts/ai-part-cleanup.spec.ts:142-157`)
  - Given partial selection, When apply clicked, Then only checked fields updated (`tests/e2e/parts/ai-part-cleanup.spec.ts:315-392`)
  - Given all unchecked, When apply button checked, Then button disabled (`tests/e2e/parts/ai-part-cleanup.spec.ts:394-453`)
  - Given type doesn't exist, When create type button clicked, Then type creation dialog opens and new type applied (`tests/e2e/parts/ai-part-cleanup.spec.ts:455-549`)
- Hooks: `data-testid="parts.cleanup.merge.table"`, `data-testid="parts.cleanup.merge.row"`, `data-testid="parts.cleanup.merge.checkbox"`, `data-testid="parts.cleanup.apply-button"`, `waitTestEvent` for form submit/success, API client verification of updated part
- Gaps: Missing test for seller creation flow (type creation covered at 455-549 but seller not tested); missing test for simultaneous type+seller creation; missing test for tags array comparison edge cases
- Evidence: Lines 94-453 cover merge table, checkbox interaction, selective application; line 455-549 covers type creation

**Surface: No-changes step**

- Scenarios:
  - Given cleanup returns identical data, When no changes detected, Then no-changes message shown (`tests/e2e/parts/ai-part-cleanup.spec.ts:171-243`)
  - Given no-changes step rendered, When close clicked, Then dialog closes (`tests/e2e/parts/ai-part-cleanup.spec.ts:246-249`)
- Hooks: `data-testid="parts.cleanup.no-changes"`, role-based close button selector
- Gaps: None — simple message and close action fully covered
- Evidence: Lines 171-249 verify no-changes detection and close

**Surface: Error handling**

- Scenarios:
  - Given cleanup task fails, When error event received, Then error UI shown with retry/cancel (`tests/e2e/parts/ai-part-cleanup.spec.ts:254-312`)
- Hooks: `data-state="error"`, error message test ID, retry/cancel buttons
- Gaps: Missing test for initial cleanup request failure (404, 500 status codes before SSE subscription); missing test for network errors during apply PATCH
- Evidence: Lines 254-312 verify SSE task failure error handling

**Overall test quality**: Tests follow established SSE mock pattern correctly, use proper `waitTestEvent` for form actions, verify backend state via API client instead of mocking, and assert on real DOM state. Coverage is strong for happy path and basic error cases but missing seller creation scenario and network error cases.

---

## 7) Adversarial Sweep

**Attack 1: Race between cleanup result and query invalidation**

- Checked: `src/components/parts/ai-part-cleanup-dialog.tsx:45-47` routes to merge/no-changes based on comparison of `currentPart` from query and `cleanedPart` from SSE result. If query invalidates and refetches between cleanup completion and comparison, race could occur.
- Evidence: `currentPart` comes from `useGetPartsByPartKey` query (line 29-32) which is independent of cleanup flow. If user edits part in another tab during cleanup, `currentPart` could change after cleanup starts.
- Why code held up: Query is fetched with `enabled: open && Boolean(partId)` (line 31), so data is stable while dialog is open. Race is possible if query invalidates during dialog open (e.g., external mutation), but unlikely since cleanup dialog is modal and blocks other interactions.
- Verdict: Theoretical race but guarded by modal UX. Could be hardened by capturing `currentPart` snapshot on dialog open and using that for comparison instead of live query data.

**Attack 2: SSE subscription leak on rapid open/close**

- Checked: `src/components/parts/ai-part-cleanup-dialog.tsx:117-127` starts cleanup in effect with deps `[open, partId, startCleanup]`. If user rapidly toggles dialog open/close, multiple cleanup requests could fire before previous ones complete.
- Evidence: `startCleanup` function has guard `if (isCleaningUp) return;` (`src/hooks/use-ai-part-cleanup.ts:77-79`) preventing double-submission, but `isCleaningUp` is reset to `false` on dialog close (line 125), allowing new cleanup to start.
- Why code held up: Guard in `startCleanup` prevents concurrent requests within same dialog session. Dialog close calls `cancelCleanup()` which unsubscribes SSE (line 131-133), so previous subscription is cleaned up before new one starts. Effect deps include `startCleanup` which is stable callback, preventing infinite loops.
- Verdict: Held up — proper guards prevent double-subscription.

**Attack 3: Checkbox state divergence from field changes**

- Checked: `src/components/parts/ai-part-cleanup-merge-step.tsx:139-141` initializes `checkedFields` from `fieldChanges` on mount, but if `fieldChanges` updates later (e.g., due to parent prop change), checkbox state becomes stale.
- Evidence: `useMemo` at line 65 recomputes `fieldChanges` when `currentPart` or `cleanedPart` changes, but `useState` initialization at line 139 only runs once. If cleanup result changes (shouldn't happen but technically possible), checkbox state won't update.
- Attack result: **Major finding** — already documented in section 3. Mitigation: add `useEffect` to sync `checkedFields` with `fieldChanges`.

**Attack 4: PATCH request without optimistic update could show stale data**

- Checked: `src/components/parts/ai-part-cleanup-merge-step.tsx:282-298` performs PATCH and invalidates query, but doesn't use optimistic update. If invalidation fails or query refetch is slow, user sees stale data on part detail page.
- Evidence: After `queryClient.invalidateQueries` (line 296-298), dialog closes via `onApplySuccess()` (line 312). User returns to part detail page which should refetch query automatically, but if offline or network is slow, stale data could display.
- Why code held up: Query invalidation triggers automatic refetch by TanStack Query. Even if refetch is slow, data will eventually update without user action. Optimistic updates are not standard pattern in this codebase (verified by checking other mutation usage), so this is consistent with project style.
- Verdict: Held up — relies on query invalidation pattern which is standard and sufficient.

**Attack 5: Type/seller creation during apply could create orphaned resources**

- Checked: `src/components/parts/ai-part-cleanup-merge-step.tsx:156-181` creates type/seller and stores ID in local state, but if apply fails after creation, newly created resources remain in database without being linked to part.
- Evidence: `handleApplyChanges` uses `createdTypeId` and `createdSellerId` state variables (lines 261-274) to populate PATCH payload. If PATCH fails (line 290-293), error is logged but created resources aren't rolled back.
- Attack result: Creates orphaned types/sellers that aren't used by any part. Not a data corruption issue but creates database clutter. Plan section 8 (lines 524-529) acknowledges this and recommends confirmation dialog before close, which isn't implemented.
- Verdict: Acceptable risk — backend may have cleanup policy for orphaned resources, and user intent was to create those resources anyway. Could be improved with warning before dialog close after creation.

---

## 8) Invariants Checklist

**Invariant 1: Field changes array contains only fields with normalized differences**

- Invariant: `fieldChanges` array must include only fields where `normalizeFieldValue(old) !== normalizeFieldValue(new)`
- Where enforced: `src/components/parts/ai-part-cleanup-merge-step.tsx:88-110` — `checkField` function compares normalized values before adding to changes array
- Failure mode: If `normalizeFieldValue` incorrectly treats distinct values as equal (e.g., empty string vs. null), field changes would be omitted from merge table, user wouldn't see valid updates
- Protection: `normalizeFieldValue` implementation at `src/lib/utils/ai-parts.ts:151-161` explicitly handles empty string, undefined, null, and arrays correctly; unit tests would catch regression
- Evidence: Function returns null for empty string/undefined (lines 158-160), preserves other values unchanged

**Invariant 2: Apply changes button enabled IFF at least one checkbox is checked**

- Invariant: `applyEnabled` must be `true` when `checkedFields.size > 0` AND no type/seller creation is pending
- Where enforced: `src/components/parts/ai-part-cleanup-merge-step.tsx:183` — Derived state from `checkedFields.size` and mutation `isPending` flags
- Failure mode: If button enabled with no checkboxes, PATCH request would send empty payload (harmless but confusing UX); if disabled with checkboxes, user can't apply valid changes
- Protection: Button `disabled` prop directly reads `applyEnabled` boolean (line 453), test verifies disabled state when all unchecked (test lines 440-450)
- Evidence: Invariant properly enforced in render logic and verified by test

**Invariant 3: Cleanup result from backend must match current part key**

- Invariant: `cleanedPart.key` returned by backend must equal `currentPart.key` to prevent applying changes to wrong part
- Where enforced: **NOT ENFORCED** — Code assumes backend returns correct key but doesn't validate
- Failure mode: If backend bug returns wrong part's cleanup result, changes would be computed against mismatched data, leading to incorrect PATCH or confusing diff table
- Protection: None — should add validation in `useAIPartCleanup` hook or dialog `onSuccess` callback: `if (result.cleanedPart.key !== partId) { throw new Error('Cleanup result key mismatch'); }`
- Evidence: **Missing invariant check** — escalate to Major finding. Fix: add key validation in `src/hooks/use-ai-part-cleanup.ts:61` before calling `onSuccess`.

**Invariant 4: Dialog step transitions only from progress to merge/no-changes, never backward**

- Invariant: `currentStep` state must follow deterministic flow: progress → (merge | no-changes) → closed; never merge → progress or no-changes → merge
- Where enforced: `src/components/parts/ai-part-cleanup-dialog.tsx:42-56, 134-137` — State transitions only in `onSuccess` callback and retry handler
- Failure mode: If step regresses (e.g., merge → progress), user would lose merge table state and see confusing UI
- Protection: Retry button explicitly sets step to 'progress' (line 135), close resets to 'progress' (line 125), success routes to merge/no-changes based on changes detection (lines 46-47). No code path transitions backward from merge/no-changes except close.
- Evidence: State transitions follow plan section 5 flow diagram correctly

**Invariant 5: All checked fields exist in cleanedPart data**

- Invariant: When building update payload, every field name in `checkedFields` must have corresponding property in `cleanedPart` object
- Where enforced: `src/components/parts/ai-part-cleanup-merge-step.tsx:207-276` — Switch statement maps all possible field names to `cleanedPart` properties
- Failure mode: If `checkedFields` contains field name not in switch (e.g., typo or new field added to comparison logic but not payload logic), field would be silently skipped in PATCH request
- Protection: TypeScript type checking ensures `cleanedPart` properties exist; switch statement exhaustively covers all fields in `FIELD_CONFIG` (lines 27-45)
- Evidence: Switch statement matches `FIELD_CONFIG` entries; missing case would result in no-op (field not added to payload) but not crash

---

## 9) Questions / Needs-Info

**Question 1: Should cleanup result validation include key matching?**

- Why it matters: Backend could theoretically return cleanup result for wrong part key due to bug or race condition. Code doesn't validate `cleanedPart.key === partId` before computing changes or applying updates.
- Desired answer: Confirm whether backend implementation guarantees key matching or if frontend should validate. If backend doesn't guarantee, add validation check (see Invariant 3 above).

**Question 2: Are orphaned types/sellers acceptable business logic?**

- Why it matters: If user creates type/seller during cleanup flow but apply fails or dialog is cancelled, newly created resources remain in database without being linked to any part. Plan acknowledges this (section 8:524-529) but implementation doesn't prevent it.
- Desired answer: Confirm whether backend has cleanup policy for orphaned resources, or if frontend should implement confirmation dialog before close (as plan suggests) or rollback logic on apply failure.

**Question 3: What is expected behavior if cleanup takes >2 minutes?**

- Why it matters: SSE task subscription doesn't have explicit timeout, but backend/SSE gateway may have connection timeout. If cleanup is very slow (e.g., complex analysis), user could see timeout error.
- Desired answer: Confirm expected timeout handling and whether frontend should show timeout message differently from generic error.

---

## 10) Risks & Mitigations (top 3)

**Risk 1: Test failures due to missing data-value-type attributes**

- Risk: Blocker finding — tests expect `[data-value-type="old"]` and `[data-value-type="new"]` selectors but implementation lacks these attributes, causing 4+ test assertions to fail
- Mitigation: Add `data-value-type` attributes to merge table cells at lines 431, 437 in `ai-part-cleanup-merge-step.tsx` before running tests
- Evidence: Section 3, first blocker finding; `tests/e2e/parts/ai-part-cleanup.spec.ts:107-126`

**Risk 2: SSE subscription not cleaned up on dialog unmount**

- Risk: Major finding — if dialog unmounts while cleanup is in progress (e.g., user navigates away or parent component unmounts), SSE subscription remains active, causing memory leak or state updates on unmounted component
- Mitigation: Add cleanup function to effect at `ai-part-cleanup-dialog.tsx:127` to call `cancelCleanup()` when unmounting during active cleanup
- Evidence: Section 3, third major finding; `src/components/parts/ai-part-cleanup-dialog.tsx:117-127`

**Risk 3: Checkbox state desync from field changes**

- Risk: Major finding — if `fieldChanges` array updates after mount (unlikely but possible due to query refetch), `checkedFields` state becomes stale, causing checkbox state to mismatch displayed rows
- Mitigation: Add `useEffect` to synchronize `checkedFields` with `fieldChanges` array when field changes recompute
- Evidence: Section 3, fourth major finding; `src/components/parts/ai-part-cleanup-merge-step.tsx:139-141`

---

## 11) Confidence

**Confidence: High** — Implementation follows established patterns from AI analysis feature with strong test coverage and proper instrumentation. Three blockers/majors are straightforward fixes (add attributes, fix effect cleanup, sync state). Code quality is good with clear separation of concerns, comprehensive error handling, and adherence to project conventions. Primary risk is test failures from selector mismatches which are easily resolved.
