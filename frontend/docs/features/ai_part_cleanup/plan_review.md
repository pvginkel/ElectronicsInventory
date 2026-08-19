# Plan Review: AI Part Cleanup

## 1) Summary & Decision

**Readiness**

The plan has been significantly strengthened in response to the previous review. All four major issues identified have been adequately addressed: (1) cache invalidation instrumentation now includes the `cleanup_query_invalidated` signal with proper test event emission, (2) field normalization is integrated directly into the comparison algorithm via the `normalizeFieldValue()` helper, (3) edge case handling for dialog close after type/seller creation has been added with a confirmation dialog pattern, and (4) the sparkle icon gradient rendering issue has been resolved with a documented SVG gradient technique. The plan now provides a complete, implementation-ready specification that aligns with project patterns and testing requirements.

**Decision**

`GO` — All major risks have been mitigated, instrumentation is complete for deterministic testing, and the plan follows established patterns from the AI analysis feature. The comparison algorithm explicitly handles null/empty string normalization, cache invalidation is properly instrumented, and edge cases are documented with clear handling strategies.

---

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `docs/commands/plan_feature.md` — Pass — `plan.md:1-843` — Plan follows the prescribed structure with all required sections (Research Log, Intent & Scope, Affected Areas, Data Model, API Surface, Algorithms, Derived State, State Consistency, Errors, Instrumentation, Lifecycle, UX Impact, Test Plan, Slices, Risks, Confidence). Each section uses the documented templates and includes file/line evidence.

- `docs/contribute/architecture/application_overview.md` — Pass — `plan.md:154-155, 424-425` — Plan correctly leverages TanStack Query for state management, uses generated API hooks pattern (noting the absence of a PATCH hook and opting for manual fetch), and aligns with domain-driven folder structure (`src/components/parts/`, `src/hooks/`).

- `docs/contribute/testing/playwright_developer_guide.md` — Pass — `plan.md:683-737` — Test plan follows API-first data setup principle (factories create parts), includes deterministic wait patterns via test events (`waitTestEvent`, `waitForUiState`), and documents SSE mocking infrastructure. Coverage explicitly lists instrumentation hooks for each scenario.

- `docs/contribute/testing/playwright_developer_guide.md` (no-route-mocks policy) — Pass — `plan.md:177-183` — Plan acknowledges the `testing/no-route-mocks` ESLint rule and commits to creating an SSE mock helper (`ai-cleanup-mock.ts`) following the documented AI analysis pattern rather than intercepting routes.

**Fit with codebase**

- `src/hooks/use-ai-part-analysis.ts` — `plan.md:151-155` — Plan correctly models `useAIPartCleanup` after the existing analysis hook, reusing SSE subscription pattern, error handling via `emitComponentError`, and transformation utilities. Alignment confirmed.

- `src/components/parts/ai-part-review-step.tsx` — `plan.md:139-143, 398, 513-529` — Plan reuses type/seller creation dialogs and inline creation pattern from review step. The dialog close edge case (lines 524-529) adds a confirmation dialog when type/seller has been created but not applied, which is consistent with form dirty state patterns and improves UX safety.

- `src/lib/utils/ai-parts.ts` — `plan.md:159-161, 386-387, 419-421` — Plan extends existing transformation utilities with cleanup-specific functions and adds the `normalizeFieldValue()` helper directly into the comparison logic. This prevents the empty string vs. null false positives identified in the previous review.

- `src/lib/test/query-instrumentation.ts` — `plan.md:590-597` — Plan adds `cleanup_query_invalidated` signal as a test event following the query instrumentation pattern. This enables deterministic Playwright assertions on cache refresh before checking updated UI state, closing the instrumentation gap from the previous review.

---

## 3) Open Questions & Ambiguities

No blocking questions remain. The plan provides clear answers to implementation concerns:

- **Question (resolved):** How should empty string vs. null be handled in field comparison?
  - **Answer:** Plan specifies `normalizeFieldValue()` helper at `plan.md:386-387` that coerces empty strings and undefined to null before comparison, preventing spurious diff rows.

- **Question (resolved):** Should cache invalidation be instrumented for testing?
  - **Answer:** Plan adds `cleanup_query_invalidated` signal at `plan.md:590-597` emitted after `queryClient.invalidateQueries()` call, enabling Playwright to wait for cache refresh.

- **Question (resolved):** What happens if user closes dialog after creating type/seller but before applying?
  - **Answer:** Plan specifies confirmation dialog at `plan.md:524-529` with message "You created a type/seller that won't be applied to this part. Close anyway?" following form dirty state pattern.

- **Question (resolved):** How to render gradient on sparkle icon SVG?
  - **Answer:** Plan documents SVG gradient technique at `plan.md:173-176` using `<linearGradient>` inside `<defs>` and `fill="url(#sparkle-gradient)"`, correctly noting that Tailwind gradient utilities don't apply to SVG fills.

All open questions from the previous review have been resolved with concrete implementation details and evidence-based solutions.

---

## 4) Deterministic Playwright Coverage (new/changed behavior only)

- **Behavior:** Part detail page menu - "Cleanup Part" item visibility and interaction
  - **Scenarios:**
    - Given part detail page is open, When user clicks dropdown menu, Then "Cleanup Part" item is visible with sparkle icon (`tests/e2e/parts/ai-part-cleanup.spec.ts`)
    - Given dropdown menu is open, When user clicks "Cleanup Part", Then cleanup dialog opens to progress step (`tests/e2e/parts/ai-part-cleanup.spec.ts`)
  - **Instrumentation:** `data-testid="parts.detail.actions.menu"`, `data-testid="parts.detail.actions.cleanup"`, `waitForUiState(page, 'parts.cleanup.dialog', 'open')`
  - **Backend hooks:** Part factory to create test part via `testData.parts.create()`
  - **Gaps:** None
  - **Evidence:** `plan.md:683-691`

- **Behavior:** Cleanup dialog progress step - SSE task lifecycle
  - **Scenarios:**
    - Given dialog opened, When cleanup task starts, Then progress bar shows "Starting cleanup..." (`tests/e2e/parts/ai-part-cleanup.spec.ts`)
    - Given progress running, When SSE emits progress updates, Then progress text updates (`tests/e2e/parts/ai-part-cleanup.spec.ts`)
    - Given cleanup completes successfully, When changes detected, Then merge step renders (`tests/e2e/parts/ai-part-cleanup.spec.ts`)
    - Given cleanup completes successfully, When no changes detected, Then no-changes step renders (`tests/e2e/parts/ai-part-cleanup.spec.ts`)
    - Given cleanup fails, When error occurs, Then error message shows with Retry/Cancel buttons (`tests/e2e/parts/ai-part-cleanup.spec.ts`)
  - **Instrumentation:** `waitTestEvent(page, 'sse', evt => evt.event === 'task_started')`, `waitTestEvent(page, 'sse', evt => evt.event === 'progress_update')`, `waitTestEvent(page, 'sse', evt => evt.event === 'task_completed')`
  - **Backend hooks:** SSE mock helper `tests/support/helpers/ai-cleanup-mock.ts` with `emitStarted()`, `emitProgress()`, `emitCompleted()` methods following AI analysis mock pattern
  - **Gaps:** None
  - **Evidence:** `plan.md:693-703`

- **Behavior:** Merge/apply changes step - selective field updates
  - **Scenarios:**
    - Given cleanup completed with changes, When merge step renders, Then table shows only changed fields with old (red) and new (green) values (`tests/e2e/parts/ai-part-cleanup.spec.ts`)
    - Given merge table rendered, When user unchecks a checkbox, Then both old and new values turn gray (`tests/e2e/parts/ai-part-cleanup.spec.ts`)
    - Given all checkboxes unchecked, When user checks "Apply Changes" button, Then button is disabled (`tests/e2e/parts/ai-part-cleanup.spec.ts`)
    - Given at least one checkbox checked, When user clicks "Apply Changes", Then PATCH request sent with selected changes (`tests/e2e/parts/ai-part-cleanup.spec.ts`)
    - Given PATCH succeeds, When response received, Then success toast shown, dialog closes, part query invalidated (`tests/e2e/parts/ai-part-cleanup.spec.ts`)
    - Given type does not exist, When "Create Type" button clicked, Then type creation dialog opens (`tests/e2e/parts/ai-part-cleanup.spec.ts`)
    - Given type created, When creation succeeds, Then "Create Type" button replaced with checkbox row (`tests/e2e/parts/ai-part-cleanup.spec.ts`)
  - **Instrumentation:** `data-testid="parts.cleanup.merge.table"`, `data-testid="parts.cleanup.merge.row"`, `data-testid="parts.cleanup.merge.checkbox"`, `waitTestEvent(page, 'form', evt => evt.formId === 'ai-part-cleanup-apply' && evt.phase === 'submit')`, `waitTestEvent(page, 'form', evt => evt.phase === 'success')`, `waitTestEvent(page, 'query', evt => evt.queryKey.includes(partKey) && evt.phase === 'invalidated')`
  - **Backend hooks:** Factory to create parts with specific field values for comparison, type/seller factories for creation flow testing
  - **Gaps:** None
  - **Evidence:** `plan.md:705-717`

- **Behavior:** No-changes step - message display and dismissal
  - **Scenarios:**
    - Given cleanup completed with no changes, When no-changes step renders, Then message "No improvements found. Your part data is already clean!" displayed (`tests/e2e/parts/ai-part-cleanup.spec.ts`)
    - Given no-changes step rendered, When user clicks "Close", Then dialog closes (`tests/e2e/parts/ai-part-cleanup.spec.ts`)
  - **Instrumentation:** `data-testid="parts.cleanup.no-changes"`, `page.getByRole('button', { name: /close/i })`
  - **Backend hooks:** SSE mock to emit cleanup result with no field changes
  - **Gaps:** None
  - **Evidence:** `plan.md:719-726`

- **Behavior:** Error handling - request failures, SSE drops, PATCH errors
  - **Scenarios:**
    - Given cleanup request fails (404), When error occurs, Then error message shows on progress step with Retry/Cancel (`tests/e2e/parts/ai-part-cleanup.spec.ts`)
    - Given SSE connection drops, When error detected, Then error message shows with Retry (`tests/e2e/parts/ai-part-cleanup.spec.ts`)
    - Given PATCH request fails (409), When error occurs, Then error toast shown, dialog remains open (`tests/e2e/parts/ai-part-cleanup.spec.ts`)
  - **Instrumentation:** `waitTestEvent(page, 'sse', evt => evt.phase === 'error')`, `expectConflictError(page)`
  - **Backend hooks:** Backend test helpers to trigger specific error responses (404, 409, SSE failures)
  - **Gaps:** None
  - **Evidence:** `plan.md:728-736`

**Coverage assessment:** All new behaviors have explicit scenarios, instrumentation, and backend coordination. The addition of `cleanup_query_invalidated` instrumentation (plan.md:590-597) ensures deterministic assertions on cache refresh, addressing the major gap from the previous review.

---

## 5) Adversarial Sweep

**Checks attempted:**
1. Null/empty string comparison producing false positives
2. Cache invalidation race conditions between PATCH success and UI re-render
3. Type/seller creation state management during concurrent operations
4. SSE subscription cleanup on dialog unmount
5. Dialog state transitions with interrupted flows

**Evidence:** `plan.md:386-387, 419-421, 590-597, 524-529, 451-469`

**Why the plan holds:**

1. **Null/empty comparison resolved:** `normalizeFieldValue()` helper at lines 386-387 explicitly coerces empty strings and undefined to null before comparison, preventing spurious changes from appearing in the diff table. Invariant at lines 419-421 confirms that only fields with `normalizeFieldValue(oldValue) !== normalizeFieldValue(newValue)` are included.

2. **Cache invalidation instrumented:** Lines 590-597 add `cleanup_query_invalidated` signal emitted after `queryClient.invalidateQueries()` call. Playwright tests can use `waitTestEvent(page, 'query', evt => evt.queryKey.includes(partKey) && evt.phase === 'invalidated')` to wait for cache refresh before asserting updated UI state, eliminating the race condition.

3. **Type/seller creation guarded:** Lines 461-463 specify disabling "Apply Changes" button while type/seller creation is in progress. Lines 524-529 add confirmation dialog on close after creation but before apply, preventing orphaned records and user confusion.

4. **SSE cleanup documented:** Lines 451-456 reference `useSSETask` cleanup pattern (`src/hooks/use-sse-task.ts:229-233`) that calls `unsubscribeListenerRef.current()` on unmount. Dialog close cancels in-flight cleanup task per lines 453-454.

5. **State transitions explicit:** Lines 813-815 specify using explicit step enum (`'progress' | 'merge' | 'no-changes' | 'error'`) with dev mode logging for debugging state transitions.

All previously identified risks have been mitigated with explicit implementation strategies and evidence-based patterns from the existing codebase.

---

## 6) Derived-Value & State Invariants (table)

- **Derived value:** cleanupChanges
  - **Source dataset:** Filtered from comparing `currentPart` (unfiltered, from `useGetPartsByPartKey`) and `cleanedPart` (unfiltered, from `useAIPartCleanup` result)
  - **Write / cleanup triggered:** Drives merge table row rendering; checkbox state updates modify local `fieldChanges` state array (line 418)
  - **Guards:** Only computed if both `currentPart` and `cleanedPart` are non-null; field comparison uses `normalizeFieldValue()` helper that coerces empty strings and undefined to null before comparison (lines 386-387, 419)
  - **Invariant:** `cleanupChanges` array must only contain fields where `normalizeFieldValue(oldValue) !== normalizeFieldValue(newValue)`; empty array triggers no-changes step (lines 419-421)
  - **Evidence:** `plan.md:415-421`

- **Derived value:** applyEnabled
  - **Source dataset:** Filtered from `fieldChanges` array (only checked items)
  - **Write / cleanup triggered:** Controls "Apply Changes" button `disabled` attribute (line 425)
  - **Guards:** At least one checkbox must be checked to enable Apply (line 427)
  - **Invariant:** Button must never be enabled when all checkboxes unchecked (line 428)
  - **Evidence:** `plan.md:424-429`

- **Derived value:** updatePayload
  - **Source dataset:** Filtered from `fieldChanges` (only checked rows), converted to snake_case PATCH payload
  - **Write / cleanup triggered:** Sent as request body to `/api/parts/{part_key}` PATCH endpoint (line 434)
  - **Guards:** Type/seller fields require special handling: if type/seller was created, use new ID; if existing, use cleaned value (line 435)
  - **Invariant:** Payload must only include fields with checked changes; type_id/seller_id must be resolved before PATCH (line 436)
  - **Evidence:** `plan.md:431-437`

- **Derived value:** createdTypeId / createdSellerId
  - **Source dataset:** Not filtered; sourced from type/seller creation mutation success callbacks (line 441)
  - **Write / cleanup triggered:** Update local state, replace "Create Type/Seller" button with checkbox row (line 442)
  - **Guards:** Creation only allowed if `typeIsExisting === false` or `sellerIsExisting === false` (line 443); "Apply Changes" button disabled during creation (lines 461-463)
  - **Invariant:** After creation, field change for type/seller must use created ID in update payload (line 444)
  - **Evidence:** `plan.md:440-445`

All four derived values follow safe patterns: `cleanupChanges` and `updatePayload` operate on unfiltered source data but use guards (null checks, normalization) before writes. `applyEnabled` is a simple boolean derivation. `createdTypeId/createdSellerId` updates are properly guarded by disabling Apply during creation, preventing premature PATCH requests.

---

## 7) Risks & Mitigations (top 3)

- **Risk:** Field comparison logic produces false positives (empty string vs. null)
  - **Mitigation:** `normalizeFieldValue()` helper coerces empty strings and undefined to null before comparison (lines 386-387, 419-421). Merge table only shows rows where normalized values differ.
  - **Evidence:** `plan.md:801-806`

- **Risk:** SSE mock pattern diverges from real backend cleanup events
  - **Mitigation:** Align mock event structure with backend SSE format (lines 177-183); validate against real backend in integration testing. SSE mock follows documented `ai-analysis-mock.ts` pattern.
  - **Evidence:** `plan.md:807-810`

- **Risk:** Type/seller creation flow interrupts apply action
  - **Mitigation:** Disable "Apply Changes" button while creation in progress (lines 461-463); update field change state with new ID on creation success. Confirmation dialog on close after creation but before apply (lines 524-529).
  - **Evidence:** `plan.md:817-821`

All three risks have concrete mitigations with line-level evidence in the plan. The empty string normalization and cache invalidation instrumentation directly address the major findings from the previous review.

---

## 8) Confidence

**Confidence: High** — All major issues from the previous review have been resolved with evidence-based solutions. The plan now includes: (1) `normalizeFieldValue()` helper integrated into comparison algorithm to prevent false positives, (2) `cleanup_query_invalidated` instrumentation for deterministic cache refresh testing, (3) confirmation dialog for type/seller creation edge case, and (4) documented SVG gradient technique for sparkle icon. The plan follows established patterns from the AI analysis feature, reuses existing infrastructure (SSE, dialog components, type/seller creation), and provides complete Playwright coverage with explicit instrumentation hooks.

---

## Review Completion

This review confirms that the plan has been strengthened significantly and all previously identified major issues have been adequately addressed. The plan is ready for implementation.

**Review date:** 2026-01-07
**Reviewer:** Claude Opus 4.5 (plan-reviewer agent)
**Plan version:** Updated (post-initial-review)
