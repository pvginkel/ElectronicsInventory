# Plan Review — Minor Fixes and Cleanup

## 1) Summary & Decision

**Readiness**

The plan addresses two housekeeping tasks: adding pick list deletion and removing the part detail refresh button. Research is thorough, evidence is well-cited, and the deletion pattern follows established CRUD conventions from shopping lists. However, the plan contains several gaps that would surface during implementation: incomplete instrumentation specification for the deletion mutation, missing navigation context details, absent confirmation dialog specification for test selectors, and no blocking issues section documenting the backend dependency per testing policy. Additionally, Slice 4 (remove part detail refresh) has already been completed, making the implementation slices partially stale.

**Decision**

`GO-WITH-CONDITIONS` — The plan provides a solid foundation and follows established patterns, but requires clarification on instrumentation scope, navigation context handling, confirmation dialog specification, and backend coordination tracking before implementation begins. The part detail refresh removal is already complete and should be verified rather than re-implemented.

---

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `docs/contribute/testing/index.md` — **Fail** — `plan.md:442-447` — Plan states "Backend DELETE endpoint (dependency) ... must complete before frontend integration" but does not include a **Blocking Issues** section at the top of the plan as required: "If a feature cannot currently be exercised without interception, treat that as a backend gap. Before any Playwright work begins, add a **Blocking Issues** section at the top of the feature plan that calls out the missing backend support."

- `docs/contribute/architecture/application_overview.md` — **Pass** — `plan.md:32-46, 76-95` — Plan correctly identifies TanStack Query patterns, generated hooks usage, and cache invalidation via `queryClient.invalidateQueries()` matching the architecture's server state management approach.

- `docs/contribute/testing/playwright_developer_guide.md` — **Partial Pass** — `plan.md:401-423` — Deterministic test scenarios are documented with Given/When/Then structure and backend verification, but instrumentation specification lacks the exact scope/phase pattern required for `waitForUiState` helpers (see section 4 for details).

- `AGENTS.md` (CLAUDE.md) — **Pass** — `plan.md:47-50` — Plan correctly specifies Playwright coverage must ship with UI changes: "Testing: Add Playwright spec for pick list deletion workflow."

- `docs/product_brief.md` — **Pass** — `plan.md:32-36, 70-106` — Pick list deletion aligns with kits workflow (product_brief.md:149-155) where operators create and complete pick lists. Removal of manual refresh aligns with modern React Query patterns without conflicting with product requirements.

**Fit with codebase**

- `src/components/kits/kit-pick-list-panel.tsx` — `plan.md:82-84, 156-189` — Alignment confirmed. Panel renders open and completed pick lists with link items; adding delete button next to each item follows established UI patterns. Existing instrumentation (`kits.detail.pickLists.panel`, `kits.detail.pickLists.navigate`) demonstrates the component already emits ui_state events.

- `src/hooks/use-pick-list-detail.ts` — `plan.md:85-88` — Alignment confirmed. Hook exports `buildPickListDetailQueryKey` (line 17-19 in actual file) which can be used for targeted cache invalidation after deletion, though plan should specify this over the broad `invalidateQueries()` pattern.

- `src/components/parts/part-details.tsx` — `plan.md:99-106` — **Already implemented**. System reminder shows lines 303-309 were removed (Refresh dropdown item). Slices 4-5 are complete; verification pass needed instead of re-implementation.

- `src/lib/api/generated/hooks.ts` — `plan.md:76-80, 143-147` — Pattern match confirmed. Shopping list deletion hook (hooks.ts:1910-1926) provides template: mutation wraps `api.DELETE`, returns void on 204, invalidates queries in `onSuccess`. Pick list deletion will follow identical structure once backend endpoint exists.

---

## 3) Open Questions & Ambiguities

- **Question**: How does the delete mutation access `kitId` for navigation when deletion is triggered from the pick list detail page?
  - **Why it matters**: Plan specifies navigation to `{ to: '/kits/$kitId', params: { kitId: String(kitId) } }` (plan.md:182) but the mutation context only receives `pickListId`. If deleting from the kit detail panel, `kit.id` is available in scope. If deleting from the pick list detail page, the mutation needs `detail.kitId` passed through—this must be explicit.
  - **Needed answer**: Specify whether delete action will be added to both kit panel AND pick list detail page, or only kit panel. If both, document how kitId propagates from pick list detail context to the mutation's onSuccess callback for navigation.

- **Question**: What is the exact confirmation dialog message and button labels for test selectors?
  - **Why it matters**: Plan mentions "Confirm dialog appears: 'Delete pick list #X? This action cannot be undone.'" (plan.md:175) and references `useConfirm` hook and `ConfirmDialog` component (plan.md:388), but Playwright tests require `data-testid` attributes for the confirm/cancel buttons. The part delete pattern (part-details.tsx:220-235) shows the confirm dialog structure but doesn't surface button test IDs.
  - **Needed answer**: Specify exact button labels ("Delete" / "Cancel"?) and whether `ConfirmDialog` component already exposes testable button selectors, or if the implementation must add them.

- **Question**: Should cache invalidation use targeted keys or the broad `invalidateQueries()` pattern?
  - **Why it matters**: Shopping list deletion (hooks.ts:1920-1922) calls `queryClient.invalidateQueries()` without arguments, which invalidates all queries. Plan specifies invalidating specific keys (plan.md:127-136, 180-181) but doesn't clarify which pattern to follow. Over-invalidation causes unnecessary refetches; targeted invalidation is more efficient but requires explicit key construction.
  - **Needed answer**: Confirm whether to follow shopping list pattern (broad invalidation, simpler code) or use targeted invalidation (efficient, matches plan's cache section). If targeted, specify the exact TanStack Query keys: `['getPickListsByPickListId', { path: { pick_list_id: number } }]` and `['getKitsPickListsByKitId', { path: { kit_id: number } }]`.

---

## 4) Deterministic Playwright Coverage (new/changed behavior only)

### Pick list deletion from kit detail panel

- **Behavior**: Kit detail page → pick list panel → delete icon → confirm → pick list removed
- **Scenarios**:
  - **Given** a kit with an open pick list, **When** user clicks delete icon (testid: `kits.detail.pick-lists.delete.{pickListId}`) and confirms, **Then** pick list is removed from backend (verified via API factory GET returning 404), panel refetches and item disappears, success toast appears, and `ui_state` event (scope: `kits.detail.pickLists.delete`, phase: `ready`) is emitted (`tests/e2e/kits/kit-detail.spec.ts` or new `tests/e2e/pick-lists/pick-list-deletion.spec.ts`)
  - **Given** a kit with a completed pick list, **When** user clicks delete icon in completed section and confirms, **Then** pick list is removed from backend and completed section (same assertions as open)
  - **Given** a pick list that another user deleted, **When** user attempts to delete it, **Then** backend returns 404, error toast shows "Pick list not found", and panel refetches to remove stale item
- **Instrumentation**:
  - Delete button: `data-testid="kits.detail.pick-lists.delete.{pickListId}"` (not specified in plan)
  - Wait for `ui_state` event: `scope: 'kits.detail.pickLists.delete'`, `phase: 'loading' | 'ready' | 'error'`
  - Toast assertion: success message includes pick list ID
  - **Gap**: Plan does not specify who emits the `kits.detail.pickLists.delete` event or where in the mutation lifecycle (plan.md:177-187 describes flow but not implementation detail)
- **Backend hooks**:
  - `testData.kits.createPickList()` factory to seed pick lists (assume exists or extend `testData.kits`)
  - API DELETE call via factory to verify 404 after deletion
  - **Gap**: Plan does not confirm pick list factory exists or specify creation pattern
- **Evidence**: `plan.md:401-423, 413-418`

### Pick list deletion while viewing detail page

- **Behavior**: Pick list detail page → user deletes pick list → navigated back to kit detail
- **Scenarios**:
  - **Given** user is viewing a pick list detail page, **When** user deletes the pick list (from that page or another tab), **Then** user is navigated to `/kits/{kitId}` with success toast
  - **Gap**: Plan does not specify whether delete action exists on pick list detail page or if this scenario only occurs via kit panel in another tab (plan.md:181-182 mentions navigation but not trigger location)
- **Instrumentation**: Same as above
- **Backend hooks**: Same as above
- **Evidence**: `plan.md:224-231, 291-295, 411`

### Part detail refresh removal (already complete)

- **Behavior**: Part detail page → actions dropdown → no "Refresh" option
- **Scenarios**:
  - **Given** part detail page is open, **When** user opens actions dropdown (testid: `parts.detail.actions.menu`), **Then** "Refresh" option is not present
- **Instrumentation**: Existing `parts.detail` loading instrumentation continues to work (part-details.tsx:168-191)
- **Backend hooks**: None required
- **Gaps**: None
- **Evidence**: `plan.md:425-436`; **Implementation status**: Complete (system reminder shows lines 303-309 removed from part-details.tsx)

---

## 5) Adversarial Sweep

### Major — Instrumentation scope and lifecycle not fully specified

**Evidence:** `plan.md:177-187, 310-316` — Flow describes emitting `ui_state` event with scope `kits.detail.pickLists.delete` and phases `loading/ready/error`, but does not specify where these events are emitted in the implementation. The kit pick list panel currently emits events (kit-pick-list-panel.tsx:68-73, 82-91) but only for panel ready state and navigation.

**Why it matters:** Playwright tests cannot wait for deterministic signals without knowing which component emits the event. If the deletion mutation is defined in the panel component, the mutation's onMutate/onSuccess/onError callbacks must emit the events. If defined elsewhere (e.g., a custom hook wrapping `useDeletePickListsByPickListId`), that location must be specified. Without this, the implementation will either miss instrumentation or add it inconsistently.

**Fix suggestion:** Add a subsection to section 9 (Observability / Instrumentation) specifying: "Deletion mutation defined in `kit-pick-list-panel.tsx` wraps the generated `useDeletePickListsByPickListId` hook. Emit `ui_state` events in mutation callbacks: `onMutate` → phase `loading`, `onSuccess` → phase `ready` with `{ kitId, pickListId, status: 'deleted' }`, `onError` → phase `error` with `{ kitId, pickListId, errorMessage }`. Guard emission with `isTestMode()`."

**Confidence:** High — Pattern established in other mutations; missing specification is a documentation gap, not a design flaw.

---

### Major — Navigation context (kitId) not explicitly passed through mutation variables

**Evidence:** `plan.md:179-182` — Mutation `onSuccess` callback navigates to `/kits/{kitId}`, but plan does not show `kitId` in mutation variables. The panel component has `kit.id` in scope (kit-pick-list-panel.tsx:47-52), but if deletion is added to pick list detail page (implied by plan.md:411), the mutation must receive `kitId` as a parameter.

**Why it matters:** If the mutation only receives `{ path: { pick_list_id: pickListId } }` (standard DELETE signature), the `onSuccess` callback cannot construct the navigation target without additional context. The plan's flow (plan.md:182) assumes `kitId` is available but doesn't specify how it gets there. This will cause runtime errors or force developers to query the pick list detail cache to extract `kitId`, adding unnecessary complexity.

**Fix suggestion:** Update section 4 (API / Integration Surface) to specify mutation variables: `{ path: { pick_list_id: number }, context: { kitId: number } }` where `context` is passed via mutation options. Update section 5 (Algorithms & UI Flows) step 6 to show: `deletePickListMutation.mutateAsync({ path: { pick_list_id: pickListId }, context: { kitId: kit.id } })`. In `onSuccess`, use `variables.context.kitId` for navigation.

**Confidence:** High — Standard TanStack Mutation pattern; missing specification will cause implementation confusion.

---

### Major — Backend dependency not tracked as blocking issue

**Evidence:** `docs/contribute/testing/index.md:49-51` requires: "If a feature cannot currently be exercised without interception, treat that as a backend gap. Before any Playwright work begins, add a **Blocking Issues** section at the top of the feature plan." Plan.md:442-447 (Slice 1) acknowledges backend dependency but does not include a blocking issues section.

**Why it matters:** Without a blocking issues section at the plan's top, developers may start frontend work before the backend endpoint is ready, forcing them to stub the DELETE call or skip tests—both violate the no-route-mocks policy. The testing documentation explicitly requires surfacing backend dependencies upfront so coordination happens before implementation begins.

**Fix suggestion:** Add a new section immediately after section 1 (Intent & Scope):
```markdown
## Blocking Issues

### Backend DELETE endpoint for pick lists

**Status:** Not yet implemented
**Required for:** Slices 2-3 (frontend deletion UI and Playwright tests)
**Specification:** `DELETE /api/pick-lists/{pick_list_id}` returning 204 No Content on success, following the pattern of `DELETE /api/shopping-lists/{list_id}` (openapi.json:14949-14950)
**Coordination:** Backend team must implement and deploy endpoint before frontend work begins on Slice 2
```

**Confidence:** High — Testing documentation explicitly mandates this pattern; omission is a conformance gap.

---

### Major — Confirmation dialog button test IDs not specified

**Evidence:** `plan.md:175, 388, 414-415` — Plan mentions confirm dialog with message "Delete pick list #X? This action cannot be undone" and references `ConfirmDialog` component (part-details.tsx:796), but does not specify button `data-testid` attributes. Playwright coverage requires asserting dialog appearance and clicking confirm/cancel buttons deterministically.

**Why it matters:** Without button test IDs, the implementation may rely on button labels ("Delete", "Cancel") which are fragile to copy changes, or use generic role queries that conflict with other buttons on the page. The plan's test instrumentation section (plan.md:414-415) mentions "reuse existing `ConfirmDialog` component with testid" but doesn't specify the IDs or verify the component supports them.

**Fix suggestion:** Verify `ConfirmDialog` component (part-details.tsx line 6, 796) already exposes `data-testid` for confirm/cancel buttons. If not, update section 12 (UX / UI Impact) to specify: "ConfirmDialog must expose `confirmButtonTestId` and `cancelButtonTestId` props, passed as `data-testid=\"kits.detail.pick-lists.delete.confirm\"` and `data-testid=\"kits.detail.pick-lists.delete.cancel\"`." Update section 13 test plan to include: "Assert confirm dialog visible via `data-testid=\"confirm-dialog\"`, click confirm button via `kits.detail.pick-lists.delete.confirm`."

**Confidence:** High — Test determinism requires explicit selectors; omission will force implementation guesswork.

---

### Minor — Cache invalidation pattern inconsistent with plan specification

**Evidence:** `plan.md:127-136, 149-155, 180-181` — Plan specifies targeted cache invalidation using specific query keys, but the reference pattern (shopping list deletion, hooks.ts:1920-1922) calls `queryClient.invalidateQueries()` without arguments, invalidating all queries. Section 3 (Data Model / Contracts) and section 5 (Algorithms & UI Flows) show specific keys but don't mandate them.

**Why it matters:** Broad invalidation (no arguments) causes all queries to refetch, creating unnecessary network traffic and UI flicker. Targeted invalidation (specific keys) is more efficient but requires explicit key construction. The plan should either commit to one pattern or justify the inconsistency. Given that `use-pick-list-detail.ts` already exports `buildPickListDetailQueryKey` (line 17-19), targeted invalidation is feasible and preferred.

**Fix suggestion:** Update section 5 step 7 (onSuccess) to specify exact invalidation calls:
```typescript
queryClient.invalidateQueries({
  queryKey: ['getPickListsByPickListId', { path: { pick_list_id: pickListId } }]
});
queryClient.invalidateQueries({
  queryKey: ['getKitsPickListsByKitId', { path: { kit_id: kitId } }]
});
```
Add rationale: "Use targeted invalidation (vs. shopping list's broad `invalidateQueries()`) to avoid refetching unrelated queries and reduce UI flicker."

**Confidence:** Medium — Functional impact is low (broad invalidation works, just inefficient), but targeted invalidation is a better long-term pattern.

---

### Minor — Implementation slices 4-5 (part detail refresh removal) already complete

**Evidence:** System reminder shows `part-details.tsx` was modified; lines 303-309 (Refresh dropdown item) were removed. Plan.md:466-478 (Slices 4-5) still list refresh removal as pending work.

**Why it matters:** Developers following the plan will attempt to remove code that's already gone, causing confusion. Slice 5 (verify part detail tests pass) is still valid work, but the removal itself is complete.

**Fix suggestion:** Update section 14 (Implementation Slices):
- Slice 4: Change status to "**Already complete** — Refresh option removed from part-details.tsx (lines 303-309 deleted). Verify the component still compiles and renders correctly."
- Slice 5: Retitle to "Verify part detail tests and manual QA" — "Run `pnpm playwright test tests/e2e/parts/` and manually test the actions dropdown to confirm no regressions. Check that TanStack Query refetch behavior still works (window refocus, etc.)."

**Confidence:** High — Evidence from system reminder is conclusive; plan should reflect current state.

---

## 6) Derived-Value & State Invariants

### Derived value: `openPickLists` and `completedPickLists` in kit pick list panel

- **Source dataset**: Filtered from `kit.pickLists` array: `openPickLists = kit.pickLists.filter(item => item.status === 'open')`, `completedPickLists = kit.pickLists.filter(item => item.status === 'completed')` (kit-pick-list-panel.tsx:53-60)
- **Write / cleanup triggered**: After deletion mutation succeeds, `queryClient.invalidateQueries` refetches `getKitsPickListsByKitId`, updating `kit.pickLists` and triggering React re-render with new filtered arrays
- **Guards**: Confirm dialog prevents accidental deletion; mutation `onError` prevents cache invalidation if backend rejects (plan.md:219)
- **Invariant**: After successful deletion, deleted pick list must not appear in either `openPickLists` or `completedPickLists` arrays on next render
- **Evidence**: `plan.md:214-221, kit-pick-list-panel.tsx:53-60`

### Derived value: `detail` (PickListDetail | undefined) in pick list detail hook

- **Source dataset**: `useGetPickListsByPickListId` query result mapped via `mapPickListDetail()` (use-pick-list-detail.ts:67-70)
- **Write / cleanup triggered**: When pick list is deleted (by current user or another session), mutation invalidates cache (`['getPickListsByPickListId', { path: { pick_list_id } }]`), triggering query refetch. If deletion occurred in same tab, mutation's `onSuccess` navigates user to `/kits/{kitId}` before 404 renders. If deletion occurred in another tab, query returns 404 and detail page shows "Pick list not found" UI (pick-list-detail.tsx:328-335 fallback).
- **Guards**: Navigation in mutation `onSuccess` happens before 404 can surface (plan.md:228). Cross-tab deletions show "not found" UI instead of navigating (plan.md:292-295)
- **Invariant**: After deletion mutation succeeds in active tab, user must be navigated to kit detail before pick list detail query refetches and returns 404. After deletion in another tab, pick list detail query refetch must return 404 and render "not found" UI.
- **Evidence**: `plan.md:223-231, use-pick-list-detail.ts:67-70`
- **Risk**: If navigation is omitted or delayed, user sees "Pick list not found" UI briefly—this is acceptable for cross-tab deletions but must be avoided for same-tab deletions via proper `onSuccess` ordering.

### Derived value: `part` data freshness in part detail component (unchanged)

- **Source dataset**: `useGetPartsByPartKey` query result with TanStack Query automatic refetch policies (part-details.tsx:70-79)
- **Write / cleanup triggered**: None from refresh removal. Mutations elsewhere (edit part, add stock, delete part) continue to invalidate part cache as before.
- **Guards**: TanStack Query `staleTime` and `refetchOnWindowFocus` policies (application_overview.md:37-38)
- **Invariant**: Part data freshness maintained by TanStack Query without manual intervention (plan.md:232-239)
- **Evidence**: `plan.md:232-239, part-details.tsx:70-79, application_overview.md:37-38`

---

## 7) Risks & Mitigations

### Risk: Backend DELETE endpoint rejects deletion due to business constraints

- **Description**: Backend may enforce constraints (e.g., cannot delete completed pick lists with audit trail dependencies) that frontend does not anticipate. Plan assumes both open and completed pick lists are deletable (plan.md:502) but does not confirm backend validation rules.
- **Mitigation**: Coordinate with backend team before Slice 1 to confirm deletion constraints. If constraints exist, update plan's error handling (plan.md:273-277) to surface constraint violation messages (e.g., "Cannot delete pick list with completed picks"). Frontend should trust backend error messages and display them in error toast without duplicating validation logic.
- **Evidence**: `plan.md:485-489, 273-277, 502`

### Risk: Cross-tab deletion causes confusing UX when user is viewing pick list detail

- **Description**: If user views pick list detail in Tab A and deletes it from kit panel in Tab B, Tab A's cache invalidation triggers 404 and shows "Pick list not found" UI without automatic navigation. Plan acknowledges this (plan.md:291-295, 492) but accepts it as "reasonable behavior." Users may not understand why the page suddenly shows an error.
- **Mitigation**: Plan accepts this as residual risk (plan.md:492). To improve UX, consider adding a broadcast channel listener that navigates user to kit detail when the *same browser* deletes a pick list in another tab (distinguish from deletions by other users/devices). Alternatively, document this behavior in user help docs and ensure "not found" message is clear: "This pick list was deleted. Return to [kit detail]."
- **Evidence**: `plan.md:291-295, 410-412, 491-493`

### Risk: Implementation diverges from plan due to unclear mutation context propagation

- **Description**: Plan's flow (plan.md:177-187) shows navigation using `kitId` but doesn't specify how `kitId` reaches the mutation's `onSuccess` callback. If developers follow the shopping list deletion pattern (hooks.ts:1916-1919) which only passes `{ path: { list_id } }`, the mutation won't have access to `kitId` for navigation. This will force last-minute design changes or workarounds (e.g., querying cache for `kitId` from `pickListId`).
- **Mitigation**: Resolve open question #1 (section 3) before implementation begins. Update plan to show mutation variables include `context: { kitId }`. Review the `useMutation` options structure in generated hooks to confirm `variables` can carry extra context fields without breaking type safety.
- **Evidence**: `plan.md:179-182, hooks.ts:1915-1919, section 3 open questions`

---

## 8) Confidence

**Confidence: Medium** — The plan follows established patterns and provides thorough research, but contains specification gaps (instrumentation lifecycle, navigation context, confirmation dialog test IDs, backend dependency tracking) that must be resolved before implementation begins. The part detail refresh removal is already complete, making slices 4-5 partially obsolete. With the identified conditions addressed, confidence rises to High.
