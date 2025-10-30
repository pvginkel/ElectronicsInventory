# Plan Review — Toast System Improvements

## 1) Summary & Decision

**Readiness**

This plan is comprehensive and well-researched, with all major unknowns resolved through backend and codebase investigation. The scope is clearly bounded to two undo flows (shopping list line deletion, kit part removal) plus toast UI fixes. The kit archive undo pattern provides a proven reference implementation. Backend endpoints are confirmed to support full restoration payloads. Test instrumentation requirements are explicit and aligned with existing patterns. The plan identifies a known Radix UI timer bug with a clear mitigation strategy. However, several technical gaps exist around API hook availability, snapshot data structure completeness, optimistic update implementation details, and missing instrumentation coverage that must be addressed before implementation can proceed safely.

**Decision**

`GO-WITH-CONDITIONS` — The plan establishes a solid foundation and demonstrates thorough research, but implementation requires resolving four major conditions: (1) confirm or create the shopping list line addition hook, (2) specify complete snapshot payloads with all fields needed for restoration, (3) detail optimistic update cache manipulation patterns for both deletion and undo flows, and (4) add missing instrumentation event emissions for both undo mutations. These gaps are tractable and documented in sections below.

---

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `docs/commands/plan_feature.md` — **Pass** — Plan structure follows all 16 required headings (plan.md:1-831); research log included (plan.md:3-35); evidence quotes provided throughout with file:line citations.

- `docs/product_brief.md` — **Pass** — Undo functionality aligns with product principle of "simple, fast, focused" workflows (brief.md:3); removes friction from curation workflows (line deletion, kit BOM management) per sections 10-11 of brief; shopping lists and kits are core features (brief.md:70-75, 149-154).

- `docs/contribute/architecture/application_overview.md` — **Pass** — Plan references generated API hooks (plan.md:100-104, 241-265), custom hook wrappers with camelCase mapping (plan.md:47-50), TanStack Query cache patterns (plan.md:73-74, 396-418), and test mode instrumentation (plan.md:75, 474-531); aligns with architecture.md:30-40.

- `docs/contribute/testing/playwright_developer_guide.md` — **Pass** — Plan requires API-first data setup via factories (plan.md:623, 646), real backend for undo tests (plan.md:76), dirty database tolerance (plan.md:623, 770), test-event assertions (plan.md:616-622, 640-645), and no route interception (plan.md:76); all conform to guide.md:14-16, 94-106.

**Fit with codebase**

- `src/components/ui/toast.tsx` — **Pass** — Plan correctly identifies overflow bug (message title at :98-100 lacks truncation; plan.md:16, 84-86) and duration prop usage (:74; plan.md:18, 304); proposed fixes (overflow-hidden, line-clamp-3) align with existing Tailwind patterns in component.

- `src/contexts/toast-context-provider.tsx` — **Pass** — Plan references existing `showSuccess` signature with `options.action` (plan.md:22-23, 176-177) matching provider implementation (:21-44); instrumentation wrapper usage (:80-82) confirms test-event emission path.

- `src/components/kits/kit-archive-controls.tsx` — **Pass** — Plan uses kit archive as reference pattern (plan.md:20-26, 417) matching actual implementation: `undoInFlightRef` (:37, :104-107), snapshot restoration (:38-39, :61-67), undo button in toast (:136-142), form instrumentation with `undo: true` (:73, :81).

- `src/routes/shopping-lists/$listId.tsx` — **Pass** — Plan identifies confirmation dialog removal site (:214-232; plan.md:97-98, 329) and `deleteLineMutation` usage (:226; plan.md:226); aligns with existing mutation patterns.

- `src/hooks/use-kit-contents.ts` — **Pass** — Plan identifies confirmation dialog removal site (:777-814; plan.md:109-110) and existing "add content" mutation reference (:532-538; plan.md:249); reuse strategy is sound.

- `src/lib/test/toast-instrumentation.ts` — **Pass** — Plan expects `action` field in `ToastTestEvent` (plan.md:224, 481) matching actual implementation where `actionId` is mapped to `action` field (:89, :98); instrumentation pattern is already in place.

- `tests/e2e/kits/kits-overview.spec.ts` — **Pass** — Plan references undo test pattern (:161-212; plan.md:627) demonstrating `waitTestEvent` for undo toast (:174-176), undo button testId pattern (:199), and metadata.undo assertions (:189, :192); proposed shopping list undo specs follow same structure.

- `tests/e2e/kits/kit-detail.spec.ts` — **Pass** — Plan correctly identifies spec that must be updated (:1150-1193; plan.md:153-154, 816) to remove confirmation dialog assertions (`kits.detailDeleteDialog`, `kits.detailDeleteConfirm` at :1172-1182) and add undo toast checks.

---

## 3) Open Questions & Ambiguities

**Question 1: Does a generated hook exist for `POST /shopping-lists/{list_id}/lines`, or must the plan create a custom wrapper?**

- **Why it matters**: The plan assumes "add line" mutation hook exists for undo (plan.md:103-104, 236-241, 329) but does not explicitly name it. Backend endpoint confirmed at `/work/backend/app/api/shopping_list_lines.py:28-56` (`add_shopping_list_line`). Frontend imports `usePostPartsShoppingListMembershipsByPartKey` which targets `POST /api/parts/{part_key}/shopping-list-memberships` (different endpoint). Generated hooks should include `usePostShoppingListsLinesByListId` or similar based on OpenAPI schema. If missing, implementation must either regenerate API client or create custom hook.

- **Research performed**: Checked `src/hooks/use-shopping-lists.ts:9` which imports `usePostPartsShoppingListMembershipsByPartKey` (targets parts endpoint, not direct line addition). Checked backend at `shopping_list_lines.py:28-56` which defines `POST /shopping-lists/<int:list_id>/lines` accepting `ShoppingListLineCreateSchema` with `part_id`, `needed`, `seller_id`, `note`. Frontend must use correct hook.

- **Needed answer**: Verify `pnpm generate:api` produces `usePostShoppingListsLinesByListId` or equivalent hook for direct line creation endpoint. If not, plan must add step to regenerate API client or specify custom hook wrapper. Implementation slice 2 (plan.md:703-714) should explicitly reference the correct hook name.

**Question 2: Are all fields captured in snapshot schemas (plan.md:179-214) sufficient to recreate deleted records, or are additional fields (e.g., `created_at`, `updated_at`, backend-generated IDs) needed for deterministic restoration?**

- **Why it matters**: Snapshot payloads drive undo mutations (plan.md:314-321, 341-348). Missing fields cause undo failures. Plan lists `DeletedLineSnapshot` with `lineId`, `listId`, `partId`, `partKey`, `needed`, `sellerId`, `note` (plan.md:182-192) and `DeletedContentSnapshot` with `contentId`, `kitId`, `partId`, `partKey`, `requiredPerUnit`, `note`, `version` (plan.md:198-213). Backend `ShoppingListLineCreateSchema` (backend line 14, 46-52) requires `part_id`, `needed`, `seller_id`, `note` (matches plan). Kit content schema requires `part_id`, `required_per_unit`, `note` (plan.md:246-249, matches backend). However, plan does not specify whether `partId` must be resolved from `partKey` before undo mutation or if hook accepts `partKey` directly.

- **Research performed**: Backend endpoint `add_shopping_list_line` (shopping_list_lines.py:40-56) accepts `part_id` (integer), not `part_key`. Frontend snapshots must capture `partId` (plan.md:189, 195) in addition to `partKey`. Plan correctly includes both (plan.md:188-189), but undo handler implementation must pass `partId` to mutation, not `partKey`.

- **Needed answer**: Confirm undo mutations pass `partId` (integer) to backend, not `partKey` (string). Plan should explicitly state in section 5 (Algorithms & UI Flows, plan.md:308-355) that undo handlers use `snapshot.partId` in mutation payload. Add note to implementation slice 2 (plan.md:703-714) to verify frontend line object structure includes `line.part.id` before deletion.

**Question 3: Does the plan specify how optimistic updates manipulate TanStack Query cache for line/content deletion and undo restoration, or must implementer infer from kit archive pattern?**

- **Why it matters**: Plan references "optimistic deletion" multiple times (plan.md:59, 311, 327, 338, 351) and states "TanStack Query optimistically removes line from cache" (plan.md:315) but does not provide cache key or `setQueryData` pseudocode. Kit archive pattern uses `applyStatusTransition` helper (kit-archive-controls.tsx:64, :119) which is specific to kit status changes. Shopping list line deletion and kit content removal require different cache manipulation (removing item from array vs. status transition). Without explicit cache update patterns, implementer may introduce stale data or incorrect rollback logic.

- **Research performed**: Verified kit archive uses custom `applyStatusTransition` and `restoreSnapshot` helpers (kit-archive-controls.tsx:17-22, :62-67) but these are not reusable for line/content array mutations. Shopping list detail query likely uses key `['getShoppingListById', { path: { list_id: listId } }]` (plan.md:269) returning response with `lines` array. Kit detail query uses `['getKitsByKitId', { path: { kit_id: kitId } }]` (plan.md:270) returning `contents` array.

- **Needed answer**: Plan should add pseudocode in section 5 (Algorithms & UI Flows) showing cache manipulation:
  - **Delete optimistic update**: `queryClient.setQueryData(listQueryKey, (old) => ({ ...old, lines: old.lines.filter(line => line.id !== lineId) }))`
  - **Undo optimistic update**: `queryClient.setQueryData(listQueryKey, (old) => ({ ...old, lines: [...old.lines, restoredLine] }))`
  - Similar patterns for kit contents.
  - Note that undo creates new record (different `id`, `version`) so restored line/content uses backend response, not original snapshot ID.

**Question 4: Does the plan specify when and where to emit form instrumentation events for undo mutations, or does implementer infer from kit archive references?**

- **Why it matters**: Plan states undo mutations must emit form events with `metadata.undo = true` (plan.md:412-414, 495-498) but does not specify exact call sites in shopping list or kit content handlers. Kit archive pattern shows `trackFormSubmit(UNARCHIVE_FORM_ID, metadata)` at click time (kit-archive-controls.tsx:108) and `trackFormSuccess/Error` in mutation callbacks (:74, :82). Shopping list undo handler must follow same pattern but plan does not provide implementation guidance for where to add these calls in `$listId.tsx` or `use-kit-contents.ts`.

- **Research performed**: Verified kit archive emits submit before `mutateAsync` (kit-archive-controls.tsx:108-110) and success/error in mutation options (:73-76, :81-82). Plan references this pattern (plan.md:490-491) but does not translate it to shopping list or kit content undo handlers.

- **Needed answer**: Plan should add explicit instrumentation steps to section 5 (Algorithms & UI Flows, plan.md:308-355):
  - **Line deletion undo flow** (plan.md:308-330): Add step "6a. Call `trackFormSubmit('ShoppingListLine:restore', { undo: true, lineId, listId, partKey })` before undo mutation"
  - **Line deletion undo flow** (plan.md:308-330): Add step "6b. Call `trackFormSuccess` or `trackFormError` in undo mutation `onSuccess`/`onError` callbacks"
  - Same for kit content undo flow (plan.md:332-355).

---

## 4) Deterministic Playwright Coverage (new/changed behavior only)

### Behavior: Shopping list line deletion with undo (Concept view)

- **Scenarios**:
  - Given user on shopping list detail (Concept status, 3 lines), When user clicks delete on second line, Then line removed immediately (optimistic), success toast with undo appears, toast includes part description (`tests/e2e/shopping-lists/line-deletion-undo.spec.ts:happy-path`)
  - Given undo toast visible after line deletion, When user clicks undo button, Then undo mutation submits, line restored to list, success toast "Restored line", original undo toast dismissed (`tests/e2e/shopping-lists/line-deletion-undo.spec.ts:undo-success`)
  - Given undo toast visible after line deletion, When user waits 15 seconds without clicking undo, Then toast auto-dismisses, undo button no longer available, line remains deleted (`tests/e2e/shopping-lists/line-deletion-undo.spec.ts:timeout`)
  - Given user deleted line and undo toast visible, When undo mutation fails with 404 (list modified by another user), Then error toast appears "Could not restore line", cache not rolled back, list refetches (`tests/e2e/shopping-lists/line-deletion-undo.spec.ts:undo-error`)
  - Given user on shopping list detail, When user rapidly deletes 3 lines in sequence, Then each deletion shows its own undo toast, user can undo any deletion independently, no mutations conflict (`tests/e2e/shopping-lists/line-deletion-undo.spec.ts:concurrent-deletions`)

- **Instrumentation**:
  - `data-testid="shopping-lists.concept.table.row.${lineId}.delete"` (delete button)
  - `data-testid="shopping-lists.toast.undo.${lineId}"` (undo button in toast)
  - Form event: `{ formId: 'ShoppingListLine:delete', phase: 'submit' | 'success' | 'error', metadata: { lineId, listId, partKey } }`
  - Form event: `{ formId: 'ShoppingListLine:restore', phase: 'submit' | 'success' | 'error', metadata: { undo: true, lineId, listId, partKey } }`
  - Toast event: `{ kind: 'toast', level: 'success', message: 'Removed part from Concept list', action: 'undo' }`
  - List loading event: `{ scope: 'shoppingLists.list', phase: 'ready' }` (after undo refetch)

- **Backend hooks**: Factory `ShoppingListFactory.createLine()` confirmed at `tests/api/factories/shopping-list-factory.ts:62-93` supporting `partKey`, `needed`, `sellerId`, `note` (plan.md:623, 796-798); backend endpoint `POST /shopping-lists/{list_id}/lines` confirmed at `shopping_list_lines.py:28-56` accepting all required fields (plan.md:241, 776-784).

- **Gaps**: **Major** — Plan does not specify `data-testid` for delete button in shopping list Concept table (plan.md:617). Existing shopping list route may not have instrumented delete button. Implementation slice 2 must add `data-testid="shopping-lists.concept.table.row.${line.id}.delete"` to delete button in `$listId.tsx` before Playwright spec can locate it.

- **Evidence**: Plan.md:608-628 (test scenarios), 616-622 (instrumentation), 776-798 (backend confirmation).

---

### Behavior: Kit content removal with undo (kit detail view)

- **Scenarios**:
  - Given user on kit detail page (5 contents), When user clicks remove on third content, Then content removed immediately (optimistic), success toast with undo appears, toast includes part description (`tests/e2e/kits/kit-contents-undo.spec.ts:happy-path`)
  - Given undo toast visible after content removal, When user clicks undo button, Then undo mutation submits, content restored to kit (with new ID), success toast "Restored part to kit", original undo toast dismissed (`tests/e2e/kits/kit-contents-undo.spec.ts:undo-success`)
  - Given undo toast visible after content removal, When user waits 15 seconds without clicking undo, Then toast auto-dismisses, undo button no longer available, content remains deleted (`tests/e2e/kits/kit-contents-undo.spec.ts:timeout`)
  - Given user removed content and undo toast visible, When undo mutation fails with 409 (part already in kit - should not happen), Then error toast appears "Could not restore part (already exists in kit)", kit detail refetches (`tests/e2e/kits/kit-contents-undo.spec.ts:undo-conflict`)
  - Given user on kit detail page, When user removes content, clicks undo, then tries to remove same content again, Then second removal targets newly created content ID, no conflict with first operation (`tests/e2e/kits/kit-contents-undo.spec.ts:undo-then-delete`)

- **Instrumentation**:
  - `data-testid="kits.detail.content.${contentId}.remove"` (remove button)
  - `data-testid="kits.detail.toast.undo.${contentId}"` (undo button in toast)
  - Form event: `{ formId: 'KitContent:delete', phase: 'submit' | 'success' | 'error', metadata: { contentId, kitId, partKey } }`
  - Form event: `{ formId: 'KitContent:restore', phase: 'submit' | 'success' | 'error', metadata: { undo: true, contentId, kitId, partKey } }`
  - Toast event: `{ kind: 'toast', level: 'success', message: 'Removed part from kit', action: 'undo' }`
  - List loading event: `{ scope: 'kits.detail', phase: 'ready' }` (after undo refetch)

- **Backend hooks**: Kit factory `testData.kits.addContent` confirmed in `kit-detail.spec.ts:1160-1163` usage; backend endpoint `POST /api/kits/{kit_id}/contents` confirmed in plan.md:245-249 via `usePostKitsContentsByKitId` (existing hook reused for undo).

- **Gaps**: **Major** — Plan states kit content removal currently uses confirmation dialog (plan.md:109-110, 777-814 in `use-kit-contents.ts`) but does not specify which component renders `remove.confirmRow` (plan.md:114-116). Implementation slice 3 must identify consuming component (likely `src/components/kits/kit-detail.tsx`) and remove dialog UI before undo flow can replace it. Existing spec `kit-detail.spec.ts:1150-1193` expects `kits.detailDeleteDialog` and `kits.detailDeleteConfirm` (plan.md:153-154, 816); these page object methods and testIds must be removed or updated.

- **Evidence**: Plan.md:630-651 (test scenarios), 640-645 (instrumentation), 815-817 (existing spec update requirement).

---

### Behavior: Toast message overflow fix (all toasts)

- **Scenarios**:
  - Given user triggers mutation with very long part description (e.g., "Super Long Part Description That Definitely Exceeds The Maximum Width Of The Toast Container And Should Wrap Or Truncate"), When success toast appears, Then message text truncates after 3 lines with ellipsis, close button remains visible in top-right corner, close button is clickable (`tests/e2e/app-shell/toast-display.spec.ts:overflow-truncation`)
  - Given user sees toast with undo button and long message, When user hovers close button, Then close button is visually interactive (hover state), click closes toast immediately (`tests/e2e/app-shell/toast-display.spec.ts:close-button-interactive`)
  - Given user sees toast with 2-line message (not overflowing), When toast renders, Then message displays fully without truncation, close button remains in top-right corner (`tests/e2e/app-shell/toast-display.spec.ts:short-message-no-truncation`)

- **Instrumentation**:
  - `data-testid="app-shell.toast.item"` (toast container) — already exists in `toast.tsx:150`
  - `data-testid="app-shell.toast.viewport"` (toast viewport) — already exists in `toast.tsx:163`
  - Visual regression test: capture screenshot of toast with long message, verify close button position

- **Backend hooks**: No backend changes; CSS-only fix. Tests can trigger toasts via any mutation (e.g., type creation, part update).

- **Gaps**: None. Instrumentation already in place (plan.md:661-667). Tests can assert on element positions and clickability using Playwright locators.

- **Evidence**: Plan.md:653-668 (test scenarios, instrumentation).

---

### Behavior: Toast auto-close with action buttons (all toasts)

- **Scenarios**:
  - Given user triggers mutation that shows success toast with undo button, When toast appears, Then toast auto-dismisses after 15 seconds (even if user hovers undo button during that time) (`tests/e2e/app-shell/toast-display.spec.ts:auto-close-with-action`)
  - Given user sees toast with undo button, When user hovers undo button at 5 seconds, keeps mouse over button for 3 seconds, then moves mouse away, Then toast remains visible until 15-second timer completes from initial mount time (total) (`tests/e2e/app-shell/toast-display.spec.ts:hover-resume-timer`)
  - Given user sees toast with undo button, When user clicks undo button at 3 seconds, Then undo mutation submits, undo toast appears, original toast is removed immediately (not waiting for 15-second timer) (`tests/e2e/app-shell/toast-display.spec.ts:action-click-dismisses`)

- **Instrumentation**:
  - `data-testid="app-shell.toast.item"` (toast container) — already exists
  - Playwright can wait for toast to disappear: `await expect(page.getByTestId('app-shell.toast.item')).toBeHidden({ timeout: 16000 })`

- **Backend hooks**: No backend changes; duration timer fix. Tests can trigger toasts via any mutation with undo (e.g., kit archive, shopping list line deletion after slice 2).

- **Gaps**: **Major** — Plan identifies Radix UI timer bugs (plan.md:746-753, 786-792) but does not specify exact fix approach in section 5 (Algorithms & UI Flows). Plan states "investigate Radix UI duration behavior; may need to force `duration` override or adjust `onOpenChange` logic" (plan.md:298) and "implement custom timeout management using `setTimeout`" (plan.md:753, 792). Implementation slice 1 (plan.md:691-700) must choose between (a) custom `setTimeout` wrapper that calls `removeToast(id)` after 15s regardless of Radix state, or (b) Radix UI upgrade to newer version (if bugs fixed upstream). Plan should specify preferred approach and add pseudocode to section 5.

- **Evidence**: Plan.md:672-686 (test scenarios), 679-682 (instrumentation), 746-753, 786-792 (Radix UI bug details).

---

## 5) Adversarial Sweep (must find ≥3 credible issues or declare why none exist)

### Major — Missing API Hook Specification for Shopping List Line Addition (Undo Reverse Mutation)

**Evidence:** Plan.md:100-104, 236-241, 329 — Plan states "May need to export or enhance `useDeleteShoppingListLineMutation`... verify if additional hooks required for 'add line' reverse mutation" and "Undo mutations reuse existing backend endpoints (`POST /api/shopping-lists/{list_id}/lines`...)". Plan assumes undo handler will call "add line" mutation (plan.md:318, 329) but does not name the hook. Generated hooks in `use-shopping-lists.ts:9` include `usePostPartsShoppingListMembershipsByPartKey` which targets different endpoint (`POST /api/parts/{part_key}/shopping-list-memberships`). Backend endpoint confirmed at `shopping_list_lines.py:28-56` as `POST /shopping-lists/<int:list_id>/lines`.

**Why it matters:** If generated hook for direct line creation does not exist, implementation will fail at undo handler development (slice 2, plan.md:703-714). Developer must either regenerate API client, create custom wrapper, or discover the correct hook name. Ambiguity delays implementation and risks using wrong endpoint (parts membership vs. direct line creation).

**Fix suggestion:** Perform research to identify exact hook name:
1. Run `grep -r "usePost.*ShoppingList.*Line" /work/frontend/src/lib/api/generated/` to find generated hook.
2. If hook exists, update plan.md:100-104, 236-241, 329 to reference it by name (e.g., `usePostShoppingListsLinesByListId`).
3. If hook does not exist, add step to slice 1 or 2: "Regenerate API client via `pnpm generate:api` to include `POST /shopping-lists/{list_id}/lines` endpoint. Verify hook exported in `src/lib/api/generated/hooks.ts`."
4. Update section 4 (API / Integration Surface, plan.md:236-241) to show hook signature: `usePostShoppingListsLinesByListId({ path: { list_id: number }, body: { part_id, needed, seller_id, note } })`.

**Confidence:** High — Backend endpoint exists and is documented; only hook name/existence is ambiguous. Resolution is straightforward via grep or API regeneration.

---

### Major — Incomplete Optimistic Update Pseudocode for Cache Manipulation

**Evidence:** Plan.md:315, 338, 396-418 — Plan states "TanStack Query optimistically removes line from cache" (plan.md:315) and "Optimistically restore line to cache" (plan.md:318) but does not provide `queryClient.setQueryData` pseudocode. Section 7 (State Consistency & Async Coordination, plan.md:396-418) describes coordination strategy at high level ("Optimistic updates modify cache before mutation completes; snapshots captured before optimistic update allow rollback on error") but omits implementation patterns. Kit archive pattern uses custom helpers `applyStatusTransition` and `restoreSnapshot` (kit-archive-controls.tsx:64, :119) which are specific to status field transitions, not array item removal/addition.

**Why it matters:** Without explicit cache manipulation patterns, implementer may introduce bugs: (1) Undo restoration appends new line at wrong position (end of array vs. original index); (2) Optimistic deletion does not trigger UI re-render if cache key is wrong; (3) Rollback on error restores stale snapshot instead of refetching; (4) Concurrent deletions corrupt cache due to missing `cancelQueries` call. Kit archive pattern's `applyStatusTransition` is not reusable for array mutations (shopping list lines, kit contents are arrays, not status fields). Developer must infer correct pattern from TanStack Query docs, risking implementation inconsistency.

**Fix suggestion:** Add pseudocode to section 5 (Algorithms & UI Flows, plan.md:308-355) showing cache manipulation for both deletion and undo:

**Shopping List Line Deletion (plan.md:308-330, add after step 5):**
```typescript
// Step 5a: Cancel in-flight queries to prevent race
await queryClient.cancelQueries({ queryKey: ['getShoppingListById', { path: { list_id: listId } }] });

// Step 5b: Optimistic deletion - remove line from cache
const listQueryKey = ['getShoppingListById', { path: { list_id: listId } }];
queryClient.setQueryData(listQueryKey, (old) => {
  if (!old) return old;
  return {
    ...old,
    lines: old.lines.filter(line => line.id !== snapshot.lineId)
  };
});
```

**Shopping List Line Undo (plan.md:308-330, add after step 6):**
```typescript
// Step 6a: Optimistic restoration - call undo mutation
await addLineMutation.mutateAsync({
  path: { list_id: snapshot.listId },
  body: {
    part_id: snapshot.partId,
    needed: snapshot.needed,
    seller_id: snapshot.sellerId,
    note: snapshot.note,
  }
});

// Step 6b: Backend returns new line with different ID
// Query invalidation (step 7) refetches list to get authoritative state
queryClient.invalidateQueries({ queryKey: ['getShoppingListById', { path: { list_id: listId } }] });
```

Similar patterns for kit contents (replace `lines` array with `contents`, use kit query key).

Add note: "Undo creates new record (different `lineId` or `contentId`) so optimistic restoration uses backend response from mutation, not original snapshot ID. Query invalidation after undo ensures UI reflects authoritative backend state."

**Confidence:** High — TanStack Query `setQueryData` API is well-documented; pattern is standard for array mutations. Adding pseudocode eliminates ambiguity without changing plan scope.

---

### Major — Missing Instrumentation Call Sites for Undo Form Events

**Evidence:** Plan.md:412-414, 495-498, 619-621, 643-645 — Plan states "Form events emitted for undo mutations: same helpers with `metadata.undo = true` flag" and lists expected event payloads for `ShoppingListLine:restore` and `KitContent:restore` with `phase: 'submit' | 'success' | 'error'`. Kit archive pattern shows `trackFormSubmit` before `mutateAsync` (kit-archive-controls.tsx:108) and `trackFormSuccess/Error` in mutation callbacks (:82, :74). However, plan's section 5 (Algorithms & UI Flows, plan.md:308-355) does not specify where to add these instrumentation calls in shopping list or kit content undo handlers.

**Why it matters:** Playwright specs rely on form events to wait for undo mutations (plan.md:619-621, 643-645: "Playwright waits for `phase: 'success'` with `metadata.undo === true`"). If instrumentation calls are missing or placed incorrectly, tests will timeout or fail. Implementer must infer call sites from kit archive pattern, risking inconsistency (e.g., calling `trackFormSubmit` after mutation starts instead of before, breaking determinism).

**Fix suggestion:** Update section 5 (Algorithms & UI Flows) to add explicit instrumentation steps:

**Shopping List Line Deletion Undo (plan.md:308-330):**
- Add step 6a (before step 6): "Call `trackFormSubmit('ShoppingListLine:restore', { undo: true, lineId: snapshot.lineId, listId: snapshot.listId, partKey: snapshot.partKey })` immediately before calling `addLineMutation.mutateAsync(...)`."
- Add step 6c (after mutation completes): "In undo mutation's `onSuccess` callback, call `trackFormSuccess('ShoppingListLine:restore', { undo: true, lineId: restoredLine.id, listId, partKey })`."
- Add step 6d (error path): "In undo mutation's `onError` callback, call `trackFormError('ShoppingListLine:restore', { undo: true, lineId: snapshot.lineId, listId, partKey })`."

**Kit Content Removal Undo (plan.md:332-355):**
- Same pattern for `KitContent:restore` formId with `contentId`, `kitId`, `partKey` metadata.

Add note in section 9 (Observability / Instrumentation, plan.md:492-499): "Undo instrumentation follows kit archive pattern: `trackFormSubmit` before `mutateAsync`, `trackFormSuccess/Error` in mutation callbacks. Metadata includes `undo: true` flag to distinguish undo operations from forward mutations."

**Confidence:** High — Kit archive pattern provides exact call sites (kit-archive-controls.tsx:108, :82, :74); translating to shopping list/kit content handlers is straightforward. Adding explicit steps eliminates guesswork.

---

### Major — Ambiguous Data Flow for `partId` vs. `partKey` in Undo Snapshots and Mutations

**Evidence:** Plan.md:188-189, 195, 329 — `DeletedLineSnapshot` includes both `partId: number` and `partKey: string` fields. Backend endpoint `add_shopping_list_line` (shopping_list_lines.py:46-52) requires `part_id: int` in request body, not `part_key`. Plan states undo handler calls "add line" mutation with snapshot data (plan.md:318, 329: "passed to undo handler to call 'add line' mutation with `partId`, `needed`, `sellerId`, `note`") but does not clarify whether frontend line objects include `line.part.id` field or only `line.part.key`.

**Why it matters:** If frontend line objects lack `part.id` field (only have `part.key`), snapshot cannot capture `partId` and undo mutation will fail (backend rejects string `part_key` when expecting integer `part_id`). Developer must either (1) fetch `partId` from part key before undo, (2) refactor line object to include `part.id`, or (3) discover that `part.id` already exists but is undocumented in plan. Ambiguity delays implementation and risks runtime errors during undo.

**Fix suggestion:** Perform research to verify shopping list line object structure:
1. Check `src/routes/shopping-lists/$listId.tsx` around line 226 (`deleteLineMutation.mutateAsync({ lineId: line.id, listId: line.shoppingListId, partKey: line.part.key })`) — does `line.part` include `id` field?
2. Check backend response schema `ShoppingListLineResponseSchema` to confirm part object structure (likely includes `part_id` and `part_key`).
3. If `line.part.id` exists, update plan.md:188-195 to note: "Snapshot captures `partId: line.part.id` (integer) and `partKey: line.part.key` (string); undo mutation passes `partId` to backend."
4. If `line.part.id` does not exist, add prerequisite to slice 2 (plan.md:703-714): "Verify shopping list line objects include `part.id` field from backend response. If missing, refactor response mapping in `use-shopping-lists.ts` to include `part.id` alongside `part.key`."

**Confidence:** High — Backend schema is explicit about `part_id` requirement. Frontend response mapping either includes `part.id` or must be updated. Resolution is straightforward via codebase inspection.

---

### Minor — Toast Auto-Close Fix Approach Underspecified

**Evidence:** Plan.md:298, 467-470, 753, 792 — Plan states "Investigate Radix UI duration behavior; if timer pauses indefinitely on focus, force duration override or adjust `onOpenChange` logic" (plan.md:298) and "Implement custom timeout management using `setTimeout` to force toast dismissal after 15 seconds" (plan.md:753). Section 15 (Risks, plan.md:746-753) identifies Radix UI bugs (issues #2268, #2461, #2233) but does not recommend specific mitigation: (a) custom `setTimeout` wrapper, (b) Radix UI version upgrade, or (c) fork/patch Radix component.

**Why it matters:** Implementation slice 1 (plan.md:691-700) must fix auto-close before adding undo flows (slice 2-3 depend on reliable 15-second timeout). If approach is underspecified, developer may choose suboptimal solution (e.g., Radix upgrade introduces breaking changes, custom timeout duplicates timer logic, patch creates maintenance burden). Ambiguity delays slice 1 delivery and risks rework if first attempt fails.

**Fix suggestion:** Add decision to section 5 (Algorithms & UI Flows, plan.md:291-305) or slice 1 (plan.md:691-700):

**Recommended approach:** Custom timeout wrapper (minimal risk, no external dependencies):
1. In `ToastProvider` (`toast-context-provider.tsx`), wrap `setToasts` to start `setTimeout` for each toast.
2. Store timer ID in toast object or ref map (`Map<toastId, NodeJS.Timeout>`).
3. Clear timer on manual close (`removeToast`) or action click.
4. After 15 seconds, call `removeToast(id)` to force dismissal regardless of Radix state.
5. Preserve Radix `duration` prop for accessibility (screen reader announcements) but add fallback timer.

**Alternative (if preferred):** Test Radix UI upgrade to latest version (check issues #2268, #2461, #2233 for fix status). If fixed, upgrade `@radix-ui/react-toast` in `package.json` and verify no breaking changes in `toast.tsx`. If not fixed, proceed with custom timeout.

Add to plan.md:691-700 (slice 1): "Fix auto-close by implementing custom `setTimeout` wrapper in `ToastProvider`. Store timer IDs in ref map, clear on manual close, force `removeToast(id)` after 15s. Radix `duration` prop retained for a11y but overridden by custom timer."

**Confidence:** Medium — Custom timeout approach is proven and low-risk, but Radix upgrade path is uncertain without checking latest release notes. Recommending custom timeout eliminates ambiguity, but implementer may prefer to check Radix fixes first.

---

### Minor — Shopping List Line Delete Button `data-testid` Not Specified in Plan

**Evidence:** Plan.md:617 — Instrumentation section lists `data-testid="shopping-lists.concept.table.row.${lineId}.delete"` for delete button, but plan does not confirm this testId exists in current implementation or must be added. Section 2 (Affected Areas, plan.md:95-99) does not mention adding testId to delete button in `$listId.tsx`. Existing route may render delete button without instrumentation.

**Why it matters:** Playwright spec `line-deletion-undo.spec.ts` (plan.md:610-628) must locate delete button to click and trigger deletion flow. If testId is missing, spec fails immediately with "locator not found" error. Developer must add testId to delete button before writing test, but plan does not explicitly require this change in affected areas or implementation slices.

**Fix suggestion:** Add to section 2 (Affected Areas, plan.md:95-99):
- Update "Shopping List Detail Route" entry to include: "Add `data-testid="shopping-lists.concept.table.row.${line.id}.delete"` to delete button in Concept table (if not already present). Evidence: Playwright spec `line-deletion-undo.spec.ts` requires testId to locate button (plan.md:617)."

Add to slice 2 (plan.md:703-714):
- "Verify delete button in `$listId.tsx` Concept table includes `data-testid`. If missing, add attribute to button element before implementing undo handler."

**Confidence:** High — This is a common instrumentation gap. Adding testId is trivial but must be explicit in plan to avoid test failures.

---

### Minor — Kit Content Confirmation Dialog Consuming Component Not Identified

**Evidence:** Plan.md:114-116, 722-723 — Plan states "Component that renders `remove.confirmRow` confirmation dialog (likely `src/components/kits/kit-detail.tsx` or inline dialog)" and lists it as affected area but does not confirm which component. Section 14 (Implementation Slices, plan.md:721-728) states "Component rendering `remove.confirmRow` dialog — remove dialog UI" without specifying file path.

**Why it matters:** Implementation slice 3 (plan.md:717-728) must remove dialog UI before undo flow can replace it. If consuming component is unknown, developer must search codebase to find dialog render site, delaying implementation. Existing Playwright spec `kit-detail.spec.ts:1150-1193` asserts on dialog visibility (plan.md:816: `kits.detailDeleteDialog`, `kits.detailDeleteConfirm`) so dialog definitely exists in current implementation.

**Fix suggestion:** Perform research to identify component:
1. Run `grep -r "remove.confirmRow" /work/frontend/src/` to find usage site.
2. Likely candidates: `src/components/kits/kit-detail.tsx`, `src/routes/kits/$kitId.tsx`, or inline in kit contents table component.
3. Update plan.md:114-116 and 722-723 to specify exact file path: "Component rendering `remove.confirmRow` dialog: `src/components/kits/kit-detail.tsx` lines X-Y (or equivalent path)."
4. Update slice 3 to include: "Remove dialog render logic from `<specific-file>` (lines referencing `remove.confirmRow`, `remove.open`, `remove.close`)."

**Confidence:** High — `grep` will locate usage immediately. Adding file path eliminates ambiguity without changing plan scope.

---

## 6) Derived-Value & State Invariants (table)

### Derived value: Shopping List Line Deletion Snapshot

- **Source dataset**: Filtered line data from `lines` array (from `useShoppingListDetail` query) at moment of delete button click. Line object includes `line.id`, `line.shoppingListId`, `line.part.id`, `line.part.key`, `line.needed`, `line.seller?.id`, `line.note`.
- **Write / cleanup triggered**: Snapshot stored in React ref (`deletedLineSnapshotRef`) before calling `deleteLineMutation.mutateAsync()`. Passed to undo handler if user clicks undo button. Cleared when toast dismisses (auto-close after 15s, manual close, or undo completion).
- **Guards**: Snapshot only valid until cache refresh. If undo mutation fails with 404 (line already deleted by another user), error handler skips cache rollback and shows error toast (plan.md:424-428). Snapshot `listId` must match current route `listId` to prevent undo from adding line to wrong list. Snapshot `partId` must be integer (from `line.part.id`) matching backend schema requirement.
- **Invariant**: Snapshot `partId` must match deleted line's `part.id`; snapshot `listId` must match current route `listId` from `useParams`; prevents undo from adding line to wrong list. Snapshot must be cleared after undo completes or toast dismisses to prevent stale data reuse if user deletes same line again later.
- **Evidence**: Plan.md:361-367 (derived state section), 179-195 (snapshot schema), 314-321 (deletion flow), 424-428 (error handling).

### Derived value: Kit Content Deletion Snapshot

- **Source dataset**: Filtered content row from `contents` array (from `useKitDetail` query) at moment of remove button click. Content object includes `content.id`, `kitId`, `content.part.id`, `content.part.key`, `content.requiredPerUnit`, `content.note`, `content.version`.
- **Write / cleanup triggered**: Snapshot stored in React ref (`deletedContentSnapshotRef`) within `use-kit-contents.ts` before calling `deleteMutation.mutateAsync()`. Passed to undo handler if user clicks undo button. Cleared when toast dismisses or undo completes.
- **Guards**: Snapshot only valid until cache refresh. Undo creates new content record (different `contentId`, `version`) so restored content uses backend response, not original snapshot ID. If undo mutation fails with 409 (part already in kit - should not happen), error handler shows error toast and refetches kit detail (plan.md:432-436). Snapshot `kitId` must match current kit.
- **Invariant**: Snapshot `partId` must resolve to valid part; snapshot `kitId` must match current kit from route params; prevents undo from adding content to wrong kit. After undo, new content has different `contentId` and `version` than original; UI must not assume ID stability across delete/undo cycles.
- **Evidence**: Plan.md:368-375 (derived state section), 198-213 (snapshot schema), 341-348 (removal flow), 432-436 (error handling).

### Derived value: Undo In-Flight Flag

- **Source dataset**: React ref initialized to `false`; set to `true` when undo button clicked; reset to `false` in undo mutation's `onSuccess`, `onError`, or `finally` callback.
- **Write / cleanup triggered**: Updated in undo click handler (`handleUndo` callback). Prevents duplicate undo invocations if user clicks undo button multiple times rapidly (before first mutation completes). Must be reset even if mutation fails to allow retry after error.
- **Guards**: Check `undoInFlightRef.current` before starting undo mutation; early return if already in flight (kit archive pattern at kit-archive-controls.tsx:104-107). Reset flag in mutation's `onSettled` or `finally` block to ensure cleanup on success or error.
- **Invariant**: Flag must be reset to `false` after every mutation completion (success or error); failure to reset blocks all subsequent undo attempts for same toast. Flag is scoped to individual undo operation (each deletion has its own toast and undo handler), not global across all toasts.
- **Evidence**: Plan.md:376-383 (derived state section), kit-archive-controls.tsx:37, :104-107 (ref initialization and check), kit-archive-controls.tsx:91 (reset in `onSuccess`).

### Derived value: Toast Undo Button Visibility

- **Source dataset**: Toast is in `toasts` array (state in `ToastProvider`) and has not been removed; toast object includes `action` prop with `id: 'undo'`, `label: 'Undo'`, `onClick: handleUndo`, `testId`.
- **Write / cleanup triggered**: Undo button rendered in `ToastComponent` if `toast.action` is defined (toast.tsx:101-113). Button click triggers `onClick` handler (undo mutation), then calls `removeToast(id)` to dismiss toast immediately (toast-context-provider.tsx:27-29). Toast auto-dismisses after 15 seconds (timer managed by Radix or custom timeout wrapper) which also calls `removeToast(id)`.
- **Guards**: Toast auto-dismisses after 15 seconds regardless of user interaction (plan fix addresses Radix timer bug). Undo handler must check `undoInFlightRef` to prevent duplicate clicks before toast is removed. If user navigates away, toast context unmounts and undo UI is lost (acceptable per plan.md:446-449).
- **Invariant**: Undo button only clickable while toast is open (in DOM); click removes toast immediately (via `removeToast(id)` wrapped in action `onClick`) to prevent double-click. Toast must dismiss after 15 seconds even if user hovers undo button (custom timeout override required per plan.md:753).
- **Evidence**: Plan.md:384-391 (derived state section), toast-context-provider.tsx:24-30 (action onClick wrapper), toast.tsx:102-112 (undo button render), plan.md:446-449 (navigation edge case).

---

> **Filtered-to-persistent check**: None of the derived values use filtered/subset data to drive persistent writes. Shopping list line snapshot and kit content snapshot are captured from unfiltered query results (full `lines` or `contents` arrays) at moment of deletion, not from filtered/paginated views. Undo mutations write to backend using snapshot data but create new records (do not update original IDs), and query invalidation refetches authoritative state after mutation. No filtered-view-to-persistent-write risk identified.

---

## 7) Risks & Mitigations (top 3)

### Risk: Radix UI Toast duration timer does not resume after action button interaction, causing toasts to never auto-close

- **Mitigation**: Implement custom timeout management using `setTimeout` in `ToastProvider` to force dismissal after 15 seconds regardless of Radix state (plan.md:753, 792). Store timer IDs in ref map keyed by toast ID. Clear timer on manual close or action click. Test thoroughly in slice 1 before proceeding to undo flows (slices 2-3 depend on reliable auto-close). Alternative: test Radix UI upgrade to latest version if bugs #2268, #2461, #2233 are fixed upstream.
- **Evidence**: Plan.md:746-753 (risk description), 786-792 (Radix bugs confirmed), 298-305 (auto-close fix flow), 691-700 (slice 1 implementation).

### Risk: Shopping list line undo mutation may fail if generated API hook for direct line creation (`POST /shopping-lists/{list_id}/lines`) does not exist

- **Mitigation**: Verify hook existence before slice 2 implementation. Run `pnpm generate:api` to regenerate API client if endpoint is missing from generated hooks. Confirm hook signature accepts `{ path: { list_id }, body: { part_id, needed, seller_id, note } }` matching backend schema (shopping_list_lines.py:28-56). If hook does not exist, add step to slice 1 or 2 to regenerate client and verify export. Update plan.md:100-104, 236-241, 329 with exact hook name once confirmed.
- **Evidence**: Plan.md:100-104 (affected area uncertainty), 236-241 (API surface), 756-760 (risk description, marked RESOLVED but hook name not specified).

### Risk: Undo mutation may conflict with concurrent edits by other users (e.g., user deletes line, another user deletes entire list, undo fails with 404)

- **Mitigation**: Acceptable per research; undo is best-effort operation. Error handling shows clear message "Could not restore line (shopping list may have been modified)" (plan.md:427, 765). User can manually re-add line/content if needed. No complex conflict resolution required (matches product brief's single-user scope, brief.md:9). Query invalidation after error refetches current state to ensure UI is accurate.
- **Evidence**: Plan.md:762-766 (risk description), 424-428 (error handling for 404), docs/product_brief.md:9 (single user context).

---

## 8) Confidence

**Confidence: Medium-High** — Plan demonstrates thorough research and resolves most unknowns (backend endpoints confirmed, kit archive pattern provides reference, test infrastructure verified). Scope is well-bounded and realistic. However, several implementation details remain underspecified (API hook name, optimistic cache manipulation pseudocode, instrumentation call sites, auto-close fix approach) which could delay or complicate implementation. Addressing the major findings in sections 3-5 (open questions, coverage gaps, adversarial sweep) would raise confidence to High. Current state is sufficient for experienced developer to proceed with clarifications during implementation, but junior developer may struggle with ambiguities. Recommended to resolve Major findings before starting implementation to minimize rework risk.

