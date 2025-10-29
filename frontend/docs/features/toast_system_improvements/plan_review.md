# Toast System Improvements — Plan Review

## 1) Summary & Decision

**Readiness**

The plan is comprehensive and well-researched, with extensive evidence from code inspection and strong alignment with established patterns (kit archive undo reference). The toast overflow fix is straightforward, but the Radix UI auto-close issue presents confirmed implementation risk (multiple documented upstream bugs). The undo pattern is proven but requires careful execution across three distinct mutation surfaces. Test coverage plans are thorough but require backend API verification for shopping list "add line" mutations. The plan correctly identifies all affected areas and provides detailed implementation slices.

**Decision**

`GO-WITH-CONDITIONS` — The plan is implementation-ready with the following conditions: (1) Verify backend support for shopping list line addition with all required fields (quantity, note) during Slice 2 implementation; (2) Implement custom toast duration handling in Slice 1 to work around Radix UI timer bugs (#2268, #2461, #2233) before adding undo buttons; (3) Update kit-detail.spec.ts:1150-1193 as documented in Slice 3.

---

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `docs/commands/plan_feature.md` — Pass — `plan.md:0-909` — Plan includes all required sections (0-15) with evidence-backed claims, file:line references, and detailed implementation slices
- `docs/product_brief.md` — Pass — `plan.md:40-70` — Scope aligns with inventory management workflows; undo improves "finding things" by reducing friction during curation (brief section 8)
- `AGENTS.md` — Pass — `plan.md:129-137, 174-188` — Instrumentation requirements honored: test events guarded by `isTestMode()`, `TodoWrite` not mentioned (correctly), coverage plans include `data-testid` attributes
- `docs/contribute/architecture/application_overview.md` — Pass — `plan.md:83-125, 255-279` — Respects domain-driven layout (`src/components/ui/toast.tsx`, `src/hooks/use-shopping-lists.ts`), uses generated API hooks, follows camelCase model mapping
- `docs/contribute/testing/playwright_developer_guide.md` — Pass — `plan.md:676-778` — Test plans use API factories for data setup, specify `data-testid` selectors, rely on `waitTestEvent` for deterministic assertions, no route interception proposed

**Fit with codebase**

- `src/components/ui/toast.tsx:84-121` — `plan.md:15-16, 307-320` — Overflow fix aligns with existing layout structure; plan correctly identifies missing text constraints on ToastPrimitive.Title
- `src/contexts/toast-context-provider.tsx:21-44` — `plan.md:89-93` — Duration propagation analysis matches implementation; plan correctly notes no special handling for action toasts exists today
- `src/routes/shopping-lists/$listId.tsx:214-232` — `plan.md:96-101, 214-232` — Confirmation dialog removal aligns with existing mutation flow; plan captures full context including error handling
- `src/hooks/use-kit-contents.ts:777-814` — `plan.md:109-113, 756-784` — Confirmation removal matches hook structure; plan correctly identifies `confirmRow` export and consuming component updates needed
- `src/lib/test/toast-instrumentation.ts:88-99` — `plan.md:237-251` — Action mapping verification confirmed; `actionId` → `event.action` already implemented at line 98
- `src/components/kits/kit-archive-controls.tsx:103-143` — `plan.md:20-25, 103-152` — Plan's undo pattern directly mirrors kit archive reference implementation (optimistic updates, snapshot refs, reverse mutations, form instrumentation with `undo: true`)

---

## 3) Open Questions & Ambiguities

- Question: Does the backend "add shopping list line" endpoint (`POST /api/shopping-lists/{list_id}/lines`) accept full payload including `quantity` and `note` fields for undo restoration?
- Why it matters: Plan assumes undo mutation can recreate deleted line with original attributes (plan.md:186-200, 257-264); if backend requires different fields or creates line with default quantity=1, undo will not fully restore previous state
- Needed answer: Verify endpoint schema during Slice 2 implementation by inspecting backend OpenAPI spec or testing via `tests/api/factories/shopping-list-factory.ts`

- Question: What is the backend behavior for the group ordering endpoint when some lines in the batch no longer exist (404)?
- Why it matters: Plan proposes partial success handling (plan.md:493-500, 869-873) but does not confirm whether backend returns structured error with success/failure counts or aborts entire batch on first 404
- Needed answer: Test batch endpoint with mixed valid/invalid line IDs during Slice 4 implementation; adjust undo handler based on observed response (atomic rollback vs individual line handling)

- Question: Does the current Radix UI Toast version (1.2.15) in `package.json` match the documented timer bugs?
- Why it matters: Plan cites GitHub issues #2268, #2461, #2233 (plan.md:851-893) but does not verify if the project's installed version exhibits these bugs or if a newer version fixes them
- Needed answer: Check `package.json` for `@radix-ui/react-toast` version during Slice 1; test timer behavior with action buttons in local dev; consider upgrading to latest version if bugs are fixed upstream

---

## 4) Deterministic Playwright Coverage (new/changed behavior only)

### Behavior: Toast message overflow with long text

- Scenarios:
  - Given user triggers mutation with very long part description (>120 chars), When success toast appears, Then message truncates after 3 lines with ellipsis and close button remains visible/clickable (`tests/e2e/app-shell/toast-display.spec.ts`)
  - Given user sees toast with undo button and long message, When user hovers close button, Then close button shows hover state and click dismisses toast (`tests/e2e/app-shell/toast-display.spec.ts`)
- Instrumentation: `data-testid="app-shell.toast.item"`, `data-testid="app-shell.toast.viewport"`, toast layout assertions via bounding box checks
- Backend hooks: None required (CSS-only fix)
- Gaps: None
- Evidence: `plan.md:747-762`

### Behavior: Toast auto-close with action buttons

- Scenarios:
  - Given user triggers mutation with undo button, When toast appears, Then toast auto-dismisses after 15 seconds regardless of hover/focus interaction (`tests/e2e/app-shell/toast-display.spec.ts`)
  - Given user sees toast with undo button, When user clicks undo at 3 seconds, Then original toast dismisses immediately and undo success toast appears (`tests/e2e/app-shell/toast-display.spec.ts`)
- Instrumentation: `data-testid="app-shell.toast.item"`, `await expect(toast).toBeHidden({ timeout: 16000 })`, `ToastTestEvent` with `action: 'undo'`
- Backend hooks: None required (frontend timer fix)
- Gaps: None
- Evidence: `plan.md:765-778`

### Behavior: Shopping list line deletion with undo

- Scenarios:
  - Given user is on Concept view with 3 lines, When user clicks delete on second line, Then line removed immediately (optimistic), success toast with undo button appears, toast includes part description (`tests/e2e/shopping-lists/line-deletion-undo.spec.ts`)
  - Given undo toast is visible, When user clicks undo button, Then undo mutation submits, line restored, success toast shows "Restored line", original toast dismissed (`tests/e2e/shopping-lists/line-deletion-undo.spec.ts`)
  - Given undo toast is visible, When user waits 15 seconds, Then toast auto-dismisses, undo no longer available, line remains deleted (`tests/e2e/shopping-lists/line-deletion-undo.spec.ts`)
  - Given user deleted line, When undo mutation fails with 404 (list modified by another user), Then error toast appears "Could not restore line", cache not rolled back, list refetches (`tests/e2e/shopping-lists/line-deletion-undo.spec.ts`)
  - Given user rapidly deletes 3 lines, When each deletion completes, Then each shows independent undo toast, user can undo any deletion, no mutation conflicts (`tests/e2e/shopping-lists/line-deletion-undo.spec.ts`)
- Instrumentation: `data-testid="shopping-lists.concept.table.row.${lineId}.delete"`, `data-testid="shopping-lists.toast.undo.${lineId}"`, `FormTestEvent` with `formId: 'ShoppingListLine:delete'` and `formId: 'ShoppingListLine:restore'` (with `metadata.undo: true`), `ToastTestEvent` with `action: 'undo'`, `ListLoadingTestEvent` with `scope: 'shoppingLists.list'` after undo
- Backend hooks: API factory must support `testData.shoppingLists.addLine(listId, { partKey, quantity, note })` for deterministic line seeding
- Gaps: **Major** — Plan assumes "add line" factory exists but does not verify; must be added during Slice 2 if missing
- Evidence: `plan.md:678-698`

### Behavior: Kit content removal with undo

- Scenarios:
  - Given user is on kit detail with 5 contents, When user clicks remove on third content, Then content removed immediately (optimistic), success toast with undo button appears, toast includes part description (`tests/e2e/kits/kit-contents-undo.spec.ts`)
  - Given undo toast is visible, When user clicks undo button, Then undo mutation submits, content restored with new ID, success toast shows "Restored part to kit", original toast dismissed (`tests/e2e/kits/kit-contents-undo.spec.ts`)
  - Given undo toast is visible, When user waits 15 seconds, Then toast auto-dismisses, undo no longer available, content remains deleted (`tests/e2e/kits/kit-contents-undo.spec.ts`)
  - Given user removed content, When undo mutation fails with 409 (part already in kit), Then error toast appears "Could not restore part (already exists in kit)", kit detail refetches (`tests/e2e/kits/kit-contents-undo.spec.ts`)
  - Given user removes content, clicks undo, then tries to remove same content again, When second removal executes, Then second removal targets newly created content ID, no conflict with first operation (`tests/e2e/kits/kit-contents-undo.spec.ts`)
- Instrumentation: `data-testid="kits.detail.content.${contentId}.remove"`, `data-testid="kits.detail.toast.undo.${contentId}"`, `FormTestEvent` with `formId: 'KitContent:delete'` and `formId: 'KitContent:restore'` (with `metadata.undo: true`), `ToastTestEvent` with `action: 'undo'`, `ListLoadingTestEvent` with `scope: 'kits.detail'`
- Backend hooks: API factory `testData.kits.addContent(kitId, { partId, requiredPerUnit, note })` already exists (verified at `use-kit-contents.ts:532-538`)
- Gaps: None
- Evidence: `plan.md:700-721`

### Behavior: Shopping list group ordering with undo

- Scenarios:
  - Given user is on Ready view with Mouser group (8 lines in "New" status), When user clicks "Mark Ordered" on Mouser group, Then all 8 lines marked ordered immediately (optimistic), success toast with undo button appears: "Marked 8 lines Ordered for Mouser [Undo]" (`tests/e2e/shopping-lists/group-ordering-undo.spec.ts`)
  - Given undo toast is visible, When user clicks undo button, Then undo mutation submits with previous quantities (all 0), all 8 lines revert to "New" status, success toast shows "Reverted 8 lines to previous state" (`tests/e2e/shopping-lists/group-ordering-undo.spec.ts`)
  - Given undo toast is visible, When user waits 15 seconds, Then toast auto-dismisses, undo no longer available, lines remain ordered (`tests/e2e/shopping-lists/group-ordering-undo.spec.ts`)
  - Given user marked group ordered, When undo mutation fails partially (some lines deleted by another user), Then warning toast appears "Reverted X of 8 lines (Y lines no longer exist)", list detail refetches (`tests/e2e/shopping-lists/group-ordering-undo.spec.ts`)
  - Given user has two seller groups (Mouser, Digikey), When user marks Mouser ordered, then immediately marks Digikey ordered, Then two undo toasts stack, user can undo either group independently (`tests/e2e/shopping-lists/group-ordering-undo.spec.ts`)
- Instrumentation: `data-testid="shopping-lists.ready.group.${groupKey}.markOrdered"`, `data-testid="shopping-lists.toast.undo.group.${groupKey}"`, `FormTestEvent` with `formId: 'ShoppingListGroup:order'` and `formId: 'ShoppingListGroup:revert'` (with `metadata.undo: true`), `ToastTestEvent` with `action: 'undo'`, `ListLoadingTestEvent` with `scope: 'shoppingLists.list'`
- Backend hooks: API factory must support seeding shopping lists with multiple lines in "New" status across different seller groups for batch ordering scenarios
- Gaps: **Major** — Partial failure handling (plan.md:493-500) depends on backend batch endpoint returning structured error; if endpoint aborts on first failure, test scenarios cannot verify partial success behavior
- Evidence: `plan.md:724-744`

---

## 5) Adversarial Sweep (must find ≥3 credible issues or declare why none exist)

**Major — Missing shopping list "add line" factory verification**
**Evidence:** `plan.md:257-264, 678-698` — Plan assumes `useAddShoppingListLineMutation` exists and accepts `{ listId, partKey, quantity, note }` payload for undo reverse mutation
**Why it matters:** Undo flow will fail at runtime if backend endpoint does not support full payload or if factory does not exist in test suite; line restoration will be incomplete (e.g., quantity defaults to 1) or mutation will return 400/422 validation error
**Fix suggestion:** Add verification step to Slice 2: Before implementing line deletion undo, inspect `src/hooks/use-shopping-lists.ts` for existing "add line" hook and review OpenAPI spec for `POST /api/shopping-lists/{list_id}/lines` to confirm schema includes `quantity` and `note` fields; if missing, coordinate backend update before proceeding
**Confidence:** High

**Major — Radix UI toast duration bug requires custom timer implementation**
**Evidence:** `plan.md:851-893` — Plan cites Radix UI GitHub issues (#2268, #2461, #2233) documenting timer pause/resume failures after clicking action/close buttons; timer does not resume, causing all subsequent toasts to stick indefinitely
**Why it matters:** Adding undo buttons without fixing auto-close will create worse UX than current state; users will see multiple toasts stacking on screen after clicking undo button, requiring manual dismissal; this violates plan goal of "consistent auto-close behavior" (plan.md:48-49)
**Fix suggestion:** In Slice 1 (toast overflow/auto-close fix), implement custom timeout management using `setTimeout` to force dismissal after 15 seconds regardless of Radix UI internal timer state; wrap `ToastComponent` with `useEffect` that sets timeout on mount and clears on unmount; test thoroughly with action button clicks to confirm timer always completes
**Confidence:** High

**Major — Kit detail spec expects confirmation dialog, must be updated in Slice 3**
**Evidence:** `plan.md:159-161, 900-903` — Plan correctly identifies `tests/e2e/kits/kit-detail.spec.ts:1150-1193` spec "removes kit contents after confirmation" expects `kits.detailDeleteDialog` and `kits.detailDeleteConfirm` (confirmed at lines 1172-1182); Slice 3 must update this spec to remove confirmation assertions and add undo toast checks
**Why it matters:** Spec will fail immediately after Slice 3 implementation if not updated; CI will break; plan acknowledges this but does not include spec update in affected files list (plan.md:81-162)
**Fix suggestion:** Add explicit task to Slice 3 implementation checklist: "Update kit-detail.spec.ts:1150-1193 to remove lines 1172-1182 (dialog visibility assertions) and replace with undo toast wait pattern from kits-overview.spec.ts:161-212"; run `pnpm playwright test tests/e2e/kits/kit-detail.spec.ts` before declaring Slice 3 complete
**Confidence:** High

**Minor — Snapshot cleanup timing ambiguity**
**Evidence:** `plan.md:620-626` — Plan states "Snapshot cleanup on toast dismiss" hook should clear snapshot ref when toast is removed, but does not specify whether cleanup happens on auto-dismiss (15s timeout), manual close button click, or undo button click
**Why it matters:** If snapshot is not cleared after undo completes, stale snapshot data may persist in memory; subsequent undo attempts (if user deletes another line) could reference wrong snapshot; memory leak over long sessions
**Fix suggestion:** Clarify in implementation: Clear snapshot ref in undo click handler immediately after calling `removeToast(id)` (follows kit archive pattern at `kit-archive-controls.tsx:84, 90`); do not rely on toast lifecycle hooks for cleanup timing
**Confidence:** Medium

**Minor — Concurrent undo click guard missing from plan's derived-value section**
**Evidence:** `plan.md:432-439` — Plan documents `undoInFlightRef` invariant but does not include it in data model contracts (section 3) or API integration surface (section 4); only appears in derived values section
**Why it matters:** Implementer may overlook guard when translating undo handler from plan to code; double-click on undo button will trigger two reverse mutations, corrupting cache state
**Fix suggestion:** Reference kit archive implementation during code review: `kit-archive-controls.tsx:104-107` shows early return pattern; ensure all three undo handlers (line deletion, content removal, group ordering) include identical guard at start of `onClick` handler
**Confidence:** Medium

**Minor — Form instrumentation formId naming inconsistency risk**
**Evidence:** `plan.md:550-563, 686-691, 710-714, 733-738` — Plan proposes form IDs `ShoppingListLine:delete`, `ShoppingListLine:restore`, `KitContent:delete`, `KitContent:restore`, `ShoppingListGroup:order`, `ShoppingListGroup:revert` but does not verify these align with existing formId conventions in codebase
**Why it matters:** If naming convention differs from existing patterns (e.g., codebase uses `shopping-lists.line.delete` instead of `ShoppingListLine:delete`), test event filters will not match, causing Playwright specs to timeout waiting for non-existent events
**Fix suggestion:** Before implementing instrumentation in Slices 2-4, grep for existing formId patterns: `rg "formId:" src/` to confirm convention (kit archive uses `KitLifecycle:archive`); maintain consistency with existing domain:action format
**Confidence:** Medium

---

## 6) Derived-Value & State Invariants (table)

- Derived value: Shopping List Line Deletion Snapshot
  - Source dataset: Filtered line data from `lines` array (from `useShoppingListDetail`) at moment of deletion click
  - Write / cleanup triggered: Stored in React ref before `deleteLineMutation.mutateAsync()`; passed to undo handler if user clicks undo; cleared after toast dismisses or undo completes
  - Guards: Snapshot only valid until cache refresh; if line already deleted by another user (404 on undo), show error toast and skip rollback
  - Invariant: Snapshot `partKey` must match deleted line's `partKey`; snapshot `listId` must match current route `listId`; prevents undo from adding line to wrong list
  - Evidence: `plan.md:186-200, 408-415`

- Derived value: Kit Content Deletion Snapshot
  - Source dataset: Filtered content row from `contents` array (from `useKitDetail`) at moment of removal click
  - Write / cleanup triggered: Stored in React ref within `use-kit-contents.ts` before `deleteMutation.mutateAsync()`; passed to undo handler; cleared after toast dismisses or undo completes
  - Guards: Snapshot only valid until cache refresh; undo creates new content record (different `contentId`, `version`); if part already in kit (409 on undo), show error toast
  - Invariant: Snapshot `partId` must resolve to valid part; snapshot `kitId` must match current kit; prevents undo from adding content to wrong kit
  - Evidence: `plan.md:202-218, 417-423`

- Derived value: Shopping List Group Ordering Snapshot
  - Source dataset: Filtered lines from `sellerGroups` matching `groupKey` at moment of order click; current `orderedQuantity` for each line (5-15 lines typically)
  - Write / cleanup triggered: Stored in React ref before `orderGroupMutation.mutateAsync()`; passed to undo handler; cleared after toast dismisses or undo completes
  - Guards: Snapshot captures 5-15 line IDs and quantities; undo mutation must target same lines; if any line deleted (404 on undo), skip that line and proceed with rest (partial success); if entire group deleted, show error toast
  - Invariant: Snapshot `lineId` list must match lines in group at mutation time; prevents undo from affecting wrong lines if group composition changes
  - Evidence: `plan.md:220-235, 424-431`

- Derived value: Undo In-Flight Flag
  - Source dataset: React ref initialized to `false`; set to `true` when undo clicked; reset to `false` after undo mutation settles
  - Write / cleanup triggered: Updated in undo click handler; prevents duplicate undo invocations if user clicks undo button multiple times
  - Guards: Check `undoInFlightRef.current` before starting undo mutation; early return if already in flight
  - Invariant: Flag must be reset even if undo mutation fails; ensures user can retry undo after error
  - Evidence: `plan.md:432-439` (mirrors `kit-archive-controls.tsx:37, 104-107`)

- Derived value: Toast Undo Button Visibility
  - Source dataset: Toast is visible (not dismissed); user has not navigated away; undo button rendered if toast includes `action` prop
  - Write / cleanup triggered: Undo button click triggers `onClick` handler, then removes toast via `removeToast(id)` (toast-context-provider.tsx:27-29)
  - Guards: Toast auto-dismisses after 15 seconds; undo handler must complete within toast lifetime or user must manually trigger before navigation
  - Invariant: Undo button only clickable while toast is open; click removes toast immediately to prevent double-click
  - Evidence: `plan.md:440-447` (verified at `toast-context-provider.tsx:23-30`)

---

## 7) Risks & Mitigations (top 3)

- Risk: Radix UI Toast timer SHOULD pause on hover/focus (expected behavior per Radix UI design), but known bugs in v1.2.15 prevent timer from resuming after user clicks action/close buttons or moves focus away, causing toasts to never auto-close (GitHub issues #2268, #2461, #2233)
- Mitigation: Implement custom timeout management using `setTimeout` in Slice 1 to force toast dismissal after 15 seconds regardless of Radix UI internal timer state; test with rapid action button clicks to confirm timer always completes; consider upgrading to latest Radix UI version if bugs are fixed upstream
- Evidence: `plan.md:851-893` (web search confirmed timer pause/resume issues)

- Risk: Backend "add shopping list line" endpoint may not support full payload (quantity, note) for undo restoration, causing line to be recreated with default quantity=1 or validation error
- Mitigation: During Slice 2 implementation, verify `POST /api/shopping-lists/{list_id}/lines` schema in OpenAPI spec before implementing undo handler; if backend does not accept `quantity`/`note`, coordinate backend update or adjust undo flow to show partial restoration warning ("Line restored with default quantity")
- Evidence: `plan.md:257-264, 860-863`

- Risk: Partial failure handling for group ordering undo (some lines 404) depends on backend batch endpoint returning structured error with success/failure counts; if endpoint aborts entire batch on first 404, undo handler cannot distinguish partial success from total failure
- Mitigation: Test batch endpoint behavior during Slice 4 by seeding group with mixed valid/invalid line IDs; if endpoint is atomic (all-or-nothing), adjust plan to show single error toast instead of partial success count; use `Promise.allSettled()` for individual mutations if batch endpoint does not support partial success
- Evidence: `plan.md:493-500, 869-873` (backend endpoint confirmed at `/work/backend/app/api/shopping_list_lines.py:196-237`)

---

## 8) Confidence

Confidence: High — Plan is thorough, well-researched, and grounded in proven patterns (kit archive undo reference). Evidence from code inspection is accurate, and affected areas are exhaustively mapped. Main risks are external dependencies (Radix UI bugs, backend API schema) that can be resolved during implementation. Test coverage plans are comprehensive and follow documented instrumentation patterns. Slices are appropriately ordered (fix toast bugs before adding undo). Conditions for GO decision are narrow and verifiable (backend API check, custom timer, spec update). Plan is ready for implementation.
