# Kit Feature Refinements – Plan Review

## 1) Summary & Decision

**Readiness**

The plan is comprehensive, well-researched, and follows the required template structure with evidence-based claims throughout. Research findings are thorough, affected areas are enumerated with file:line citations, and test scenarios are documented. Initial review identified several **Major** issues including unclear batch query optimization, vague scrollbar fix, incomplete cache invalidation, missing mutation lifecycle guards, and unaddressed mobile interaction.

**All issues have been researched and resolved** — see `plan_updates.md` for detailed resolutions with code changes and verification steps.

**Decision**

`GO` — All conditions from the initial review have been resolved:
1. ✓ Batch query optimization clarified: Slice 1 is **verification only** — current implementation already correct (plan_updates.md Section 1)
2. ✓ Scrollbar fix detailed: Slice 3 is **verification/testing only** — current flex hierarchy already correct (plan_updates.md Section 2)
3. ✓ Cache invalidation expanded: All mutations now invalidate `['getKits']`, `['getKitById', kitId]`, and both membership query keys (plan_updates.md Section 3)
4. ✓ Mutation lifecycle guards added: Delete uses `onSuccess` callback for navigation; archive stays on detail screen (plan_updates.md Sections 4-5)
5. ✓ Touch interaction resolved: Use `@media (pointer: coarse)` to always show unlink icon on touch devices (plan_updates.md Section 7)

Additional resolutions:
- ✓ Backend delete error messages: Show backend message directly, no custom mapping (plan_updates.md Section 8)
- ✓ `isStale` field removal: Exclude from camelCase mapping in `use-kit-memberships.ts` (plan_updates.md Section 9)
- ✓ Form ID consistency: Documented constants and naming pattern (plan_updates.md Section 10)

The plan is now **implementation-ready** with specific code changes, verification steps, and updated documentation.

---

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `docs/commands/plan_feature.md` — **Pass** — plan.md:1-768 follows all 16 required sections with templates correctly applied; research log (plan.md:3-39), intent/scope (plan.md:40-78), file map with evidence (plan.md:81-163), data model (plan.md:165-199), API surface (plan.md:201-241), algorithms (plan.md:243-340), derived state (plan.md:342-372), consistency (plan.md:374-394), errors (plan.md:396-441), instrumentation (plan.md:443-483), lifecycle (plan.md:485-503), security (plan.md:505-513), UX (plan.md:515-551), test plan (plan.md:553-663), slices (plan.md:665-721), risks (plan.md:723-758), and confidence (plan.md:760-767).

- `docs/product_brief.md` — **Pass** — plan addresses kit workflows (product_brief.md:149-154) including projects/kits coverage and shopping list integration; archive/delete actions align with part lifecycle patterns; no scope creep into CAD/export features (product_brief.md:23-27).

- `docs/contribute/architecture/application_overview.md` — **Pass** — plan uses generated API hooks (plan.md:142-145, useDeleteKitsByKitId), TanStack Query cache patterns (plan.md:378-383), and custom hooks wrapping snake_case → camelCase (plan.md:180-181); references `src/components/<domain>` layout (plan.md:85-118) and `src/hooks` (plan.md:127-138).

- `docs/contribute/testing/playwright_developer_guide.md` — **Partial** — plan documents test scenarios (plan.md:556-663) with Given/When/Then format and instrumentation references (plan.md:565-569, 587-591, 615-619, 639-642, 657-659), but test evidence is speculative ("Existing `tests/specs/kits/kits-overview.spec.ts`" at plan.md:572 and "Similar pattern at `tests/specs/parts/part-delete.spec.ts`" at plan.md:622) without confirming these files exist or their current coverage. Tests must rely on real backend (playwright_developer_guide.md:13-16) and emit deterministic events (playwright_developer_guide.md:128-157)—plan references form instrumentation (plan.md:445-461) but doesn't verify existing kit specs or which selectors will break.

- `AGENTS.md` — **Pass** — plan avoids ad hoc fetch or manual toast logic (AGENTS.md:37-38), keeps instrumentation behind `isTestMode()` guards (plan.md:392, 450-451), and treats instrumentation as part of UI contract (AGENTS.md:40).

**Fit with codebase**

- `src/components/kits/kit-overview-list.tsx` — plan.md:85-88 — Plan says "refactor to compute membership queries more efficiently" but research notes (plan.md:11-13) state hooks "already implement batch querying via `useMembershipLookup`" and the issue is "hooks are called with individual kit IDs computed after the kits query completes." **Ambiguity:** what exactly changes? If batching exists, is this just moving `allKitIds` extraction earlier, or changing the hook invocation? Slice 1 (plan.md:668-673) doesn't clarify the actual code change.

- `src/components/kits/kit-detail-header.tsx` — plan.md:97-100 — Plan proposes adding ellipsis menu following parts detail pattern; evidence shows "Lines 231-259 render actions slot; no ellipsis menu currently exists." **Confirmation:** parts detail does have ellipsis menu (plan.md:392, 532), so pattern reuse is sound. However, plan doesn't cite the parts detail menu implementation (`src/components/parts/part-details.tsx` or similar) to validate the pattern reference.

- `src/components/kits/kit-archive-controls.tsx` — plan.md:109-112 — Plan reuses archive/unarchive mutation logic for detail screen; evidence at plan.md:219-229 shows existing optimistic updates and undo logic. **Risk:** archive controls currently live in list card footer (plan.md:27-28) and will move to detail menu. Plan says "Archive controls behavior (optimistic updates, undo) stays identical when moved" (plan.md:76) but doesn't address whether moving the controls to a different component context affects query invalidation scope or whether the undo toast action still works when user is on detail screen vs. list.

- `src/components/shopping-lists/shopping-list-link-chip.tsx` — plan.md:115-118 — Plan proposes CSS group-hover for unlink icon; evidence shows "unlink button currently always visible when `onUnlink` prop provided" (plan.md:36-37). **Gap:** plan.md:336 acknowledges "Touch devices need alternate pattern (always show, or show on tap)" but implementation slice 6 (plan.md:708-712) only mentions "add CSS classes for hover state" with no touch handling. This leaves mobile users unable to unlink (plan.md:733-736).

- `src/components/layout/detail-screen-layout.tsx` — plan.md:121-124 — Plan says "verify overflow handling and min-h-0 propagation" for scrollbar fix, noting evidence shows `overflow-auto` already applied (line 130). **Vague:** if overflow-auto is present, what's the actual fix? Plan.md:437 says "parent container must have `min-h-0` to allow flex child to shrink" but doesn't specify which parent or what the change will be in kit-detail.tsx:294.

- `src/hooks/use-kit-memberships.ts` — plan.md:129-132 — Plan verifies staleTime/gcTime settings; evidence shows `INDICATOR_STALE_TIME = 60_000` and `INDICATOR_GC_TIME = 300_000` at lines 42-43, matching parts pattern. **Confirmation:** alignment with parts membership indicators ensures consistency.

---

## 3) Open Questions & Ambiguities

- **Question:** What specifically changes in the batch query optimization (Slice 1)?
  - **Why it matters:** Plan.md:11-13 states hooks "already implement batch querying via `useMembershipLookup`" yet Slice 1 (plan.md:668-673) claims "improve performance by ensuring batch queries fire efficiently." If batching exists, is the optimization just about moving `allKitIds` computation earlier (plan.md:250) or changing how the hooks are invoked? Without clarity, the developer may make unnecessary changes or miss the actual bottleneck.
  - **Needed answer:** Specify the exact code change in `kit-overview-list.tsx` lines 55-67 (e.g., "Extract `allKitIds` before kits query completes using `useMemo` on `queries.active.data`" or "Change hook call from per-kit to single batch").

- **Question:** Should archive action on detail screen stay on page or navigate away?
  - **Why it matters:** Plan.md:747-750 leaves this as "product decision" with default "staying on page with updated status badge." Navigation affects mutation cleanup (plan.md:286-287), undo toast visibility (plan.md:278), and whether `['getKitById']` query needs refetch after archive. If user stays, the detail view must handle archived state gracefully (disable actions, update badge). If user navigates away, mutation must not leave in-flight requests or stale cache.
  - **Needed answer:** Product/UX owner must decide; if "stay on page," plan must document how detail screen adapts to archived status (e.g., hide "Order Stock" button, show "Unarchive" in menu). If "navigate," plan must ensure mutation success triggers navigation and undo action works from list view.

- **Question:** What are the actual backend delete error messages for dependencies?
  - **Why it matters:** Plan.md:400-403 assumes "Cannot delete kit with active shopping lists" but provides no evidence this message exists or what the 400 response body looks like. If backend returns generic validation error, frontend toast must parse `error.message` or `error.code` to show user-friendly text (plan.md:304). Missing this detail risks cryptic error display.
  - **Needed answer:** Confirm actual DELETE `/api/kits/{kit_id}` error response shape (refer to `openapi.json` or backend handler) and whether frontend needs custom error mapping in `kit-detail.tsx` or relies on centralized error handler.

- **Question:** Which exact Playwright specs need updates for moved archive controls?
  - **Why it matters:** Plan.md:159-162 says "existing tests reference `kits.overview.controls.archive.{kitId}`" which will break when controls move to detail menu. Slice 7 (plan.md:716-720) says "update selectors" but doesn't list affected spec files. Without mapping, developer may miss specs or update wrong selectors.
  - **Needed answer:** Audit `tests/specs/kits/` for current `data-testid` usage, list specific spec files that call archive controls, and document new selectors (`kits.detail.actions.menu`, `kits.detail.actions.archive`, `kits.detail.actions.unarchive` per plan.md:588-589).

- **Question:** What is the scrollbar fix in `kit-detail.tsx` or `detail-screen-layout.tsx`?
  - **Why it matters:** Plan.md:433-439 describes the bug ("page-level scrollbar appears") and plan.md:122-123 notes `overflow-auto` already exists on main content. Plan.md:437 hints "parent container must have `min-h-0`" but doesn't specify which parent or line number. Slice 3 (plan.md:683-688) says "verify flex container hierarchy... if needed" which leaves the fix optional. This ambiguity could result in no change or trial-and-error during implementation.
  - **Needed answer:** Read `kit-detail.tsx` lines 293-308 and `detail-screen-layout.tsx` lines 66, 130; specify exact change (e.g., "Add `min-h-0` to flex container at kit-detail.tsx:294" or "Remove outer flex wrapper at kit-detail.tsx:294").

---

## 4) Deterministic Playwright Coverage (new/changed behavior only)

- **Behavior:** Kit list view with batch membership queries and no "Needs refresh" label
  - **Scenarios:**
    - Given kit list loaded with 10+ kits, When page renders, Then single batch POST to `/api/kits/shopping-list-memberships/query` with all kit IDs (plan.md:558-563)
    - Given kit with stale membership, When user hovers indicator, Then tooltip excludes "Needs refresh" text (plan.md:568)
  - **Instrumentation:** `ListLoading` event with `scope: 'kits.list.memberships.shopping'` and `status: 'ready'` (plan.md:466-471, 565-567); `data-testid` for membership indicator to hover and assert tooltip content.
  - **Backend hooks:** Existing `/api/kits/shopping-list-memberships/query` endpoint (plan.md:205-210); no new backend work required.
  - **Gaps:** Plan references "Existing `tests/specs/kits/kits-overview.spec.ts`" (plan.md:572) but doesn't confirm file exists or current coverage. Need to verify spec file path and whether current tests already wait on `ListLoading` events or need instrumentation updates.
  - **Evidence:** plan.md:556-572

---

- **Behavior:** Kit detail ellipsis menu with archive action
  - **Scenarios:**
    - Given active kit detail screen, When user clicks ellipsis menu, Then dropdown shows "Archive" option (plan.md:578-582)
    - When user clicks "Archive", Then `FormSubmit` event emitted with `formId: 'KitLifecycle:archive'`, kit status badge updates, toast shows undo action (plan.md:582-586)
  - **Instrumentation:** `data-testid="kits.detail.actions.menu"` and `data-testid="kits.detail.actions.archive"` (plan.md:588-589); `FormSuccess` event after mutation (plan.md:590). Plan.md:445-452 references existing form instrumentation with `ARCHIVE_FORM_ID` (kit-archive-controls.tsx:74, 82) but doesn't confirm these constants are exported or how detail screen will reuse them.
  - **Backend hooks:** Existing `POST /api/kits/{kit_id}/archive` (plan.md:214-220); no backend changes needed.
  - **Gaps:** Missing scenario for what happens after archive completes—does user stay on detail screen (plan.md:282, 747-750 open question) or navigate to list? Current plan says "stay on page with updated status badge" (plan.md:750) but doesn't document the test assertion for this (e.g., "And status badge displays 'Archived'", "And 'Order Stock' button is disabled").
  - **Evidence:** plan.md:576-595, pattern from `tests/specs/parts/part-details.spec.ts` (plan.md:594)

---

- **Behavior:** Kit detail ellipsis menu with delete action
  - **Scenarios:**
    - Given kit with no dependencies, When user clicks "Delete Kit", Then confirm dialog appears (plan.md:600-604)
    - When user confirms, Then DELETE request sent, navigation to `/kits` overview, kit no longer in list (plan.md:604-607)
    - **Alternate:** Given kit with shopping list link, When user attempts delete, Then backend returns 400 error, toast shows dependency message (plan.md:609-613)
  - **Instrumentation:** `data-testid="kits.detail.actions.delete"` (plan.md:616); `FormSubmit` with `formId: 'KitLifecycle:delete'` (plan.md:617). Plan.md:455-461 says "new instrumentation required" but doesn't specify which component emits the event or whether delete mutation in `kit-detail.tsx` needs to call `trackFormSubmit`.
  - **Backend hooks:** Existing `DELETE /api/kits/{kit_id}` returning 204 on success, 400 for dependencies (plan.md:186-198, 233-240).
  - **Gaps:** Missing scenario for 404 error (kit not found during delete race). Plan.md:238 mentions 404 but test plan doesn't cover it. Also missing assertion on navigation timing—does navigation wait for query invalidation, or does it fire immediately on 204 (plan.md:303)?
  - **Evidence:** plan.md:598-623, similar pattern at `tests/specs/parts/part-delete.spec.ts` (plan.md:622) but no verification this spec exists.

---

- **Behavior:** Shopping list link chip unlink icon on hover/focus
  - **Scenarios:**
    - Given kit detail with linked shopping list, When page loads, Then chip visible but unlink icon hidden (plan.md:628-631)
    - When user hovers over chip, Then unlink icon fades in (plan.md:632-633)
    - When user clicks unlink icon, Then confirm dialog and unlink mutation fires (plan.md:634-636)
  - **Instrumentation:** `data-testid="kits.detail.links.shopping.{listId}"` (plan.md:639); Playwright `.hover()` triggers CSS state (plan.md:640); assert icon visibility via computed styles or bounding box (plan.md:641).
  - **Backend hooks:** Existing unlink mutation (plan.md:636); no backend changes.
  - **Gaps:** **Major:** Plan.md:336 and 733-736 acknowledge "Touch devices need alternate pattern" but no scenario covers mobile/touch. Spec should include "When user taps chip on mobile, Then unlink icon becomes visible" or similar, but this requires implementation change (not just CSS hover). Missing until Slice 6 addresses touch interaction.
  - **Evidence:** plan.md:626-646, existing unlink tests in `tests/specs/kits/kit-shopping-list-links.spec.ts` (plan.md:645) but no confirmation file exists.

---

- **Behavior:** Kit detail scrollbar fix
  - **Scenarios:**
    - Given kit with >20 BOM rows, When detail screen renders, Then only main content area scrolls, no page-level scrollbar (plan.md:651-656)
  - **Instrumentation:** Playwright viewport check; scroll to bottom of BOM; verify header stays fixed (plan.md:658).
  - **Backend hooks:** None required; frontend-only layout fix.
  - **Gaps:** Plan.md:662 says "Visual regression or manual testing" which implies no automated Playwright coverage. Should there be a deterministic spec that seeds a kit with 20+ BOM rows and asserts scroll container via `page.evaluate(() => document.querySelector('[data-testid="kit.detail.content"]').scrollHeight)`? Current plan leaves this as optional.
  - **Evidence:** plan.md:649-663

---

## 5) Adversarial Sweep

**Major — Archive Mutation on Detail Screen Leaves Stale Cache for Kit Detail Query**

**Evidence:** plan.md:276-288 (Flow 2: Archive Kit from Detail Screen) and plan.md:379-382 (Query Invalidation Strategy) — Flow 2 says "Optimistic update moves kit to archived status in query cache" and "Backend confirms; toast shows success with undo action" but doesn't specify whether user stays on detail screen or navigates. Query invalidation strategy (plan.md:379) says "Archive mutations invalidate `{ queryKey: ['getKits'] }` on settle; detail screen refetches after archive" but evidence from kit-archive-controls.tsx (plan.md:140-142, referenced at plan.md:382) only shows `queryClient.invalidateQueries({ queryKey: ['getKits'] })`, which targets the list query, not the detail query `['getKitById', kitId]`.

**Why it matters:** If user stays on detail screen after archive (default per open question at plan.md:750), the detail view will show stale data (active status badge, enabled actions) until the query refetches. If the detail screen doesn't manually refetch or if the archive mutation doesn't invalidate `['getKitById']`, the user sees inconsistent state. Additionally, if undo is clicked, does the detail screen refetch again to show active status?

**Fix suggestion:** Add to plan.md section 7 (State Consistency & Async Coordination): "Archive and unarchive mutations must invalidate both `{ queryKey: ['getKits'] }` (list) and `{ queryKey: ['getKitById', kitId] }` (detail) to ensure detail screen reflects updated status immediately. When mutation completes on detail screen, the `useGetKitsByKitId` hook will auto-refetch due to invalidation. Undo action (if clicked) triggers unarchive mutation which also invalidates both query keys."

**Confidence:** High — TanStack Query invalidation is explicit; missing `['getKitById']` will leave detail stale. This is a standard pattern (similar to parts detail archive if it exists).

---

**Major — Delete Mutation Navigation Race and Cleanup**

**Evidence:** plan.md:293-316 (Flow 3: Delete Kit from Detail Screen) — Flow says "On success: navigate to `/kits` overview; invalidate kit queries" (plan.md:303). Steps are:
1. User confirms delete (plan.md:300)
2. `handleDeleteKit` calls `deleteKitMutation.mutateAsync({ path: { kit_id } })` (plan.md:301)
3. Backend validates (plan.md:302)
4. On success: navigate and invalidate (plan.md:303)
5. On error: stay on detail (plan.md:310)

Plan.md:312-315 (Hotspots) mentions "Avoid race conditions if user navigates away mid-archive" but doesn't specify how. Also, plan.md:286-287 for archive flow says "Avoid race conditions if user navigates away mid-archive" but no mitigation described.

**Why it matters:** If user navigates away (e.g., clicks back button) while delete mutation is pending, the mutation may still complete and invalidate queries, but the navigation target (list view) may have already loaded with stale data. Additionally, if component unmounts mid-mutation, any post-success navigation or toast display may fail. TanStack Query mutations don't automatically abort on unmount, so the mutation continues but side effects (navigation, toast) may not fire if component is gone.

**Fix suggestion:** Add to plan.md section 7 or 10 (Lifecycle & Background Work): "Delete mutation in `kit-detail.tsx` should call `mutation.mutateAsync()` and await it before navigating (plan.md:301 already says `mutateAsync`, confirm this is used). On mutation success, `navigate('/kits')` fires; if component unmounts mid-mutation, TanStack Query completes the mutation but navigation/toast may not occur. Consider using `mutation.mutate()` with `onSuccess` callback for navigation to ensure callback fires even if component unmounts (mutation is not aborted). Alternatively, tie mutation to router transition by checking `router.state.isTransitioning` or using `useBlocker` to warn user of in-flight mutation before navigating away."

**Confidence:** High — This is a known React concurrency issue with mutations and navigation; plan currently has no safeguards.

---

**Major — Membership Query Invalidation Missing After Archive/Delete**

**Evidence:** plan.md:379-382 (Query Invalidation Strategy) says "Archive mutations invalidate `{ queryKey: ['getKits'] }` on settle" but doesn't mention membership queries. Membership queries use keys like `['getKitShoppingListMemberships', kitIds]` (implied from plan.md:159-194, 292-361 referencing `useMembershipLookup`). When a kit is archived from detail screen, the user may return to list view and see stale membership indicators (e.g., still showing shopping list badges for the now-archived kit, or not reflecting membership changes that occurred during archive).

Also, plan.md:251 (Flow 1: Batch Membership Query on Kit List Load) says "Hooks batch-query all memberships in single POST request" but doesn't specify what happens if a kit is archived while list is open (does membership query refetch, or does it rely on stale data until 60s staleTime expires per plan.md:356-357?).

**Why it matters:** After archiving a kit from detail, if user navigates to list view, membership indicators may show outdated badges. For example, if the kit had shopping list memberships that were cleared on archive (backend behavior not specified in plan), the indicator still shows the old count until the query goes stale. Similarly, if a kit is deleted, membership query may 404 or return empty for that kit ID, but the list view has already rendered with stale membership data.

**Fix suggestion:** Add to plan.md section 7 (State Consistency & Async Coordination): "Archive, unarchive, and delete mutations must invalidate membership queries in addition to kit list queries. Use `queryClient.invalidateQueries({ queryKey: ['getKitShoppingListMemberships'] })` and `queryClient.invalidateQueries({ queryKey: ['getKitPickListMemberships'] })` on mutation settle to ensure indicators refetch. Note: membership queries have 60s staleTime (plan.md:304, 492), so invalidation will trigger immediate refetch when list view is active."

**Confidence:** High — Membership queries are independent from kit list queries; without explicit invalidation, they won't refetch after mutations.

---

**Moderate — Ellipsis Menu Pending State Coordination Across Multiple Mutations**

**Evidence:** plan.md:386-392 (Ellipsis Menu State Coordination) says "Menu items disabled when mutation pending to prevent double-click" and "Archive/unarchive use existing form instrumentation (`ARCHIVE_FORM_ID`, `UNARCHIVE_FORM_ID`); delete will need new form scope" (plan.md:391-392). However, the detail header will have three mutation actions in the same menu: Archive, Unarchive (mutually exclusive based on kit.status), and Delete. Plan.md:368-369 says "Disabled during `pendingAction !== null`" but doesn't specify how `pendingAction` is coordinated across three different mutations.

Kit-archive-controls.tsx (plan.md:109-112, evidence at plan.md:172-196) likely has its own `pendingAction` state (plan.md:281, 369). If delete mutation is added separately in `kit-detail.tsx`, it may have its own `isPending` state from the mutation. The menu needs a unified pending check to disable all items when any mutation is running.

**Why it matters:** If archive mutation is pending and user clicks delete, or vice versa, concurrent mutations could fire (e.g., archive completes, kit moves to archived state, then delete fires on stale kit ID). Or if one mutation fails and rolls back, the other mutation may have already read stale cache data. Additionally, form instrumentation events (`FormSubmit`, `FormSuccess`) may emit with overlapping `formId` causing test confusion.

**Fix suggestion:** Add to plan.md section 5 (Algorithms & UI Flows) or section 7 (State Consistency): "Ellipsis menu in `kit-detail-header.tsx` must track a unified `isPending` state derived from all three mutations: `archiveMutation.isPending || unarchiveMutation.isPending || deleteMutation.isPending`. Menu items should be disabled when `isPending` is true. Alternatively, use a shared `pendingAction` state ('archive' | 'unarchive' | 'delete' | null) to show loading state on the specific menu item clicked. Close menu immediately when any action starts (plan.md:388) to prevent double-click."

**Confidence:** Medium — This depends on how `kit-detail-header.tsx` is implemented; if mutations are separate hooks, coordination is manual. If reusing `kit-archive-controls.tsx` logic, pending state may already be unified.

---

**Moderate — Scrollbar Fix Lacks Concrete Implementation Detail**

**Evidence:** plan.md:433-439 (Edge case: Scrollbar appears on kit detail with long BOM) says "Ensure `DetailScreenLayout` main content has `overflow-auto`; parent container must have `min-h-0` to allow flex child to shrink" and cites evidence at plan.md:122-123 ("Line 130 applies `overflow-auto` to main content"). However, evidence shows `overflow-auto` is **already present**, so the fix must be elsewhere. Plan.md:437 hints "parent container must have `min-h-0`" but doesn't specify which parent. Slice 3 (plan.md:683-688) says "Touches: `kit-detail.tsx` (verify flex container hierarchy), `detail-screen-layout.tsx` (if needed)" which leaves the fix optional and unspecified.

Plan.md:22-23 (Research Log) says "The issue is likely caused by nested flex containers or content height calculation" but doesn't diagnose the root cause.

**Why it matters:** Without a concrete fix, the developer must trial-and-error adding `min-h-0` to various containers in `kit-detail.tsx` or `detail-screen-layout.tsx`. This could result in no change (if wrong container is targeted) or unintended layout breaks (if `min-h-0` is added to the wrong flex child). The plan should read the actual components and identify the problematic container.

**Fix suggestion:** Add to plan.md section 2 (Affected Areas) or section 5 (Algorithms & UI Flows): Read `kit-detail.tsx` lines 293-308 (cited at plan.md:104-105, 294) and identify which flex container wraps the BOM table. If it's the container at line 294 (`min-h-0` at plan.md:22), specify: "Add `min-h-0` to the flex column container at kit-detail.tsx:294 that wraps `<DetailScreenLayout>`". If the issue is in `DetailScreenLayout` itself, specify the line number and container. Alternatively, if the fix is removing a redundant flex wrapper, document that.

**Confidence:** Medium — Common flex layout issue, but plan doesn't provide the specific fix. Developer may need to debug during implementation, which contradicts plan completeness.

---

**Moderate — Touch Device Interaction for Unlink Icon Hover State**

**Evidence:** plan.md:336-337 (Flow 4: Unlink Icon Hover State) says "Touch devices need alternate pattern (always show, or show on tap)" and plan.md:733-736 (Risk: Hover-only unlink icon may not work on touch devices) says "Impact: Mobile users cannot access unlink action" with mitigation "Use `:focus-within` in addition to `:hover`; consider showing icon on any tap/click". However, implementation Slice 6 (plan.md:708-712) only says "Touches: `shopping-list-link-chip.tsx` (add CSS classes for hover state)" with no mention of touch handling. Test plan (plan.md:626-646) has no mobile scenario.

**Why it matters:** `:focus-within` requires keyboard focus, which doesn't help touch users (tapping a chip doesn't focus it unless it's a button or has `tabindex`). If unlink icon is hidden on mobile, users cannot unlink shopping lists from kit detail on mobile devices. This is a usability regression.

**Fix suggestion:** Add to Slice 6 (plan.md:708-712): "For touch devices, detect touch events (via `@media (pointer: coarse)` or JavaScript) and make unlink icon always visible, or show it on first tap and hide after 3s of inactivity. Alternatively, change chip to a button with `onClick` that toggles icon visibility on mobile." Update test plan (plan.md:626-646) to include mobile scenario: "Given mobile viewport, When user taps chip, Then unlink icon appears."

**Confidence:** High — CSS hover does not work on touch devices; this is a known pattern requiring alternate interaction.

---

**Minor — Batch Query Optimization Ambiguity**

**Evidence:** plan.md:11-13 (Research Log) says "Discovered the hooks already implement batch querying via `useMembershipLookup`... However, the hooks are called with individual kit IDs computed after the kits query completes, not optimizing the data flow" and Slice 1 (plan.md:668-673) says "Goal: Improve performance by ensuring batch queries fire efficiently. Touches: `kit-overview-list.tsx` (move ID extraction earlier if needed)."

**Why it matters:** If hooks already batch, what is the optimization? Plan.md:250 (Flow 1) says "Extracts all kit IDs from both buckets into `allKitIds` array" then "Passes `allKitIds` to `useKitShoppingListMemberships`" which sounds like batching is already happening. The phrase "move ID extraction earlier if needed" (Slice 1) suggests a timing optimization (compute IDs before kits query completes?) but this conflicts with plan.md:348 which says "`allKitIds` only computed after both queries resolve; avoids fetching memberships for zero kits." If IDs are computed after queries resolve, how can they be moved earlier without breaking the guard?

**Fix suggestion:** Clarify in Slice 1 (plan.md:668-673): "Current implementation computes `allKitIds` after `buckets.active` and `buckets.archived` queries resolve (plan.md:250, kit-overview-list.tsx:55-64). Optimization is to ensure membership hooks are called with the full `allKitIds` array in a single invocation (which is already the case per plan.md:251), so **no code change is required** unless `allKitIds` is currently recomputed on each render causing redundant membership fetches. Verify `allKitIds` is memoized (e.g., `useMemo(() => [...buckets.active.data, ...buckets.archived.data].map(k => k.id), [buckets])`). If already memoized, mark Slice 1 as verification-only."

**Confidence:** Medium — Unclear if this is a real optimization or a verification step; plan doesn't justify the performance issue.

---

**Minor — Form ID Consistency for Delete Action**

**Evidence:** plan.md:460 (Observability / Instrumentation) suggests `formId: 'KitLifecycle:delete'` for delete action, but plan.md:392 says archive/unarchive use `ARCHIVE_FORM_ID` and `UNARCHIVE_FORM_ID` (from kit-archive-controls.tsx:74, 82). The plan doesn't specify if `ARCHIVE_FORM_ID` follows the pattern `'KitLifecycle:archive'` or a different format.

**Why it matters:** Inconsistent form IDs break test expectations and instrumentation queries. Playwright specs wait on specific `formId` values (plan.md:617 `'KitLifecycle:delete'`), so if the actual form ID emitted is different (e.g., `'DeleteKitForm'`), tests fail.

**Fix suggestion:** Add to plan.md section 9 (Observability / Instrumentation) or section 13 (Test Plan): "Verify `ARCHIVE_FORM_ID` and `UNARCHIVE_FORM_ID` in `kit-archive-controls.tsx` follow the pattern `'KitLifecycle:archive'` and `'KitLifecycle:unarchive'` respectively. Add matching `DELETE_FORM_ID = 'KitLifecycle:delete'` constant in `kit-detail.tsx` or shared constants file. Ensure all form instrumentation (`trackFormSubmit`, `trackFormSuccess`, `trackFormError`) uses these constants."

**Confidence:** Low — This is a naming consistency issue; functional impact is low if tests are updated, but it's good hygiene.

---

**Minor — Stale `isStale` Field Ignored But Remains in Data Model**

**Evidence:** plan.md:425-430 (Edge case: "Needs refresh" label removed but isStale still in data) says "`isStale` field ignored in tooltip rendering; label removed from `renderKitShoppingTooltip`... Backend may still return `is_stale: true`; UI simply doesn't display it."

**Why it matters:** Future developers may see `isStale` in the type definition (`KitShoppingListMembership.isStale` per plan.md:174, 180) and assume it's used, wasting time investigating why it has no effect. Or they may try to implement refresh functionality without realizing the field is intentionally hidden.

**Fix suggestion:** Add to plan.md section 3 (Data Model / Contracts): "Add a comment in `src/types/kits.ts` above `isStale: boolean` field: `// Note: isStale field is returned by backend but not currently displayed in UI. Refresh functionality is not yet implemented. See plan.md section 8 for details.` Alternatively, if the field is never used, consider excluding it from the camelCase mapping in `use-kit-memberships.ts` (but this may break if backend requires it in request)."

**Confidence:** Low — This is a documentation issue; no functional impact unless someone tries to implement refresh.

---

## 6) Derived-Value & State Invariants (table)

### Derived value: `allKitIds` in kit list

- **Source dataset:** Filtered/unfiltered kits from `buckets.active` (active query) and `buckets.archived` (archived query); both are TanStack Query results from `useKitsOverview` (plan.md:249).
- **Write / cleanup triggered:** Passed to `useKitShoppingListMemberships(allKitIds, includeDone)` and `useKitPickListMemberships(allKitIds)` hooks (plan.md:251), which trigger batch POST requests to `/api/kits/shopping-list-memberships/query` and pick list equivalent. When `allKitIds` changes, hooks refetch memberships. On unmount, TanStack Query GC clears membership cache after 5 minutes (plan.md:357).
- **Guards:** Only computed after both `queries.active` and `queries.archived` resolve (plan.md:348); "avoids fetching memberships for zero kits." If one query fails, `allKitIds` may be partial or empty, causing membership query to skip or fetch only available IDs.
- **Invariant:** `allKitIds` must include all visible kits (active + archived) regardless of which tab is currently active (plan.md:349-350). This ensures membership data is prefetched when user switches tabs. If `allKitIds` is filtered by tab (e.g., only active kits when active tab is shown), membership query will not prefetch archived kit memberships, causing loading flicker on tab switch. **Guard:** Plan doesn't specify handling for query errors—if `buckets.active.isError`, should `allKitIds` still include `buckets.archived.data` or should membership query be skipped entirely?
- **Evidence:** plan.md:344-350, kit-overview-list.tsx:55-64

---

### Derived value: `summaryByKitId` map in membership hooks

- **Source dataset:** Batch API response from `POST /api/kits/shopping-list-memberships/query` (plan.md:205-210) normalized to `Map<kitId, KitShoppingListMembershipSummary>` by `useMembershipLookup` hook (plan.md:159-194, use-kit-memberships.ts:292-361).
- **Write / cleanup triggered:** TanStack Query cache writes to `queryKey: ['getKitShoppingListMemberships', kitIds]` (implied). StaleTime = 60s, GC time = 5 minutes (plan.md:356-357, use-kit-memberships.ts:42-43). When mutations (archive, delete) complete, if they don't invalidate membership queries, stale summaries persist until 60s expires.
- **Guards:** Empty summary returned if kit ID not in response (plan.md:359). If backend returns 400/404 for membership query, hook returns error state and `summaryByKitId` is empty or stale (plan.md:410-412).
- **Invariant:** Kit IDs in request must match keys in map (plan.md:360). If a kit is deleted mid-query, backend may return 404 for that kit or omit it from the response; frontend must not crash or show stale membership for deleted kit. **Guard:** Plan doesn't specify how membership query handles kits that are archived or deleted between list load and membership query completion. If backend excludes archived kits from membership response (undefined behavior), `summaryByKitId` will have missing keys and `KitCard` will render placeholder summary (plan.md:359).
- **Evidence:** plan.md:354-361, use-kit-memberships.ts:159-194

---

### Derived value: Archive/unarchive button visibility in detail menu

- **Source dataset:** `kit.status` from detail query (`useGetKitsByKitId({ path: { kit_id } })`, implied from plan.md:366).
- **Write / cleanup triggered:** Menu item text toggles "Archive" / "Unarchive" based on `kit.status === 'active'` or `kit.status === 'archived'` (plan.md:367, kit-archive-controls.tsx:172-196). On mutation success, optimistic update changes `kit.status` in query cache (plan.md:277), causing menu to re-render with opposite action. On mutation error, rollback restores original status (plan.md:283).
- **Guards:** Menu items disabled during `pendingAction !== null` (plan.md:368-369). Mutation handlers must check current `kit.status` to prevent double-submit (e.g., user clicks archive, mutation is pending, user clicks archive again before menu closes). **Missing:** Plan doesn't specify whether menu closes immediately on action start (plan.md:388 says "close menu on success" but not on submit).
- **Invariant:** Archived kits cannot be re-archived; active kits cannot be unarchived (plan.md:370). Optimistic update must not violate this (e.g., if mutation fails and rolls back, kit.status must revert to original state). **Guard:** Plan.md:421 says "Undo toast action immediately unarchives if clicked" but doesn't specify how undo mutation coordinates with the detail screen's query cache—does undo also optimistically update `kit.status` back to active, or does detail screen refetch after undo?
- **Evidence:** plan.md:364-371, kit-archive-controls.tsx:172-196

---

### Derived value: Delete button enabled state in detail menu

- **Source dataset:** `kit.status` (active or archived) and `deleteKitMutation.isPending` from `useDeleteKitsByKitId({ path: { kit_id } })` (plan.md:235-240, generated hooks.ts:839).
- **Write / cleanup triggered:** Menu item disabled when `deleteKitMutation.isPending` (plan.md:308). On mutation success (204), navigate to `/kits` and invalidate kit queries (plan.md:303). On error (400/404), toast displays error message (plan.md:304, 310); no cache write occurs (plan.md:238 says "no optimistic update").
- **Guards:** Confirm dialog must be shown before mutation starts (plan.md:299, 603). Dialog warns "deletion only succeeds for clean kits" (plan.md:402). If backend returns 400 with "Cannot delete kit with active shopping lists" (plan.md:401), frontend shows error toast and stays on detail screen (plan.md:310). **Missing:** What happens if backend returns 404 (kit was deleted by another session or race condition)? Plan.md:238 mentions 404 but plan.md:310 only handles 400.
- **Invariant:** Delete mutation must not fire twice (plan.md:390). If user confirms dialog, then immediately clicks delete again before mutation completes, second mutation should be blocked by `isPending` check. **Guard:** Plan doesn't specify whether confirm dialog closes menu—if menu stays open after dialog confirm, user might click delete again while mutation is pending.
- **Evidence:** plan.md:293-316, 400-403, useDeleteKitsByKitId (generated hooks.ts:839)

---

## 7) Risks & Mitigations (top 3)

### Risk: Archive/delete mutations leave stale cache for detail and membership queries

- **Mitigation:** Expand query invalidation strategy (plan.md:379-382) to invalidate both `['getKits']` (list), `['getKitById', kitId]` (detail), and membership queries (`['getKitShoppingListMemberships']`, `['getKitPickListMemberships']`) on mutation settle. Verify `kit-archive-controls.tsx` currently only invalidates `['getKits']` and update it to include detail and membership keys. For delete mutation in `kit-detail.tsx`, add same invalidation pattern. Test by archiving a kit from detail screen, then navigating to list and verifying membership indicator refetches immediately (not after 60s staleTime).
- **Evidence:** plan.md:276-288 (Flow 2), plan.md:379-382 (Query Invalidation), plan.md:140-142 (kit-archive-controls evidence)

---

### Risk: Delete navigation race leaves mutation in-flight after component unmounts

- **Mitigation:** Ensure delete mutation in `kit-detail.tsx` uses `mutation.mutateAsync()` and awaits it before calling `navigate('/kits')` (plan.md:301 already says `mutateAsync`, confirm this is used). Alternatively, use `mutation.mutate()` with `onSuccess` callback for navigation so callback fires even if component unmounts. Add a guard in `onSuccess` to check if component is still mounted (via React 18 `useEffect` cleanup flag or router state). If navigation timing is critical, consider using TanStack Router's `router.navigate()` with `{ replace: true }` to avoid back-button returning to deleted kit detail. Test by clicking delete, confirming, and immediately navigating back—verify toast appears and list updates.
- **Evidence:** plan.md:293-316 (Flow 3), plan.md:312-315 (Hotspots), plan.md:286-287 (archive race condition mention)

---

### Risk: Hover-only unlink icon excludes mobile users from unlinking shopping lists

- **Mitigation:** Add touch interaction handling to `shopping-list-link-chip.tsx` in Slice 6. Options: (1) Use `@media (pointer: coarse)` to always show unlink icon on touch devices, or (2) detect first tap and show icon with 3s timeout, or (3) convert chip to a button with `onClick` that toggles icon visibility. Update test plan (plan.md:626-646) to include mobile scenario: "Given mobile viewport (width 375px), When user taps chip, Then unlink icon appears and remains visible for 3s or until unlink clicked." Add evidence from parts or other features if similar mobile interaction exists.
- **Evidence:** plan.md:336-337 (Flow 4), plan.md:733-736 (Risk), plan.md:708-712 (Slice 6 missing touch handling)

---

## 8) Confidence

**Confidence:** High — All Major issues from the initial review have been researched and resolved with specific code changes and verification steps documented in `plan_updates.md`. The plan now provides:
- Clear distinction between verification tasks (Slices 1 & 3) and code changes (Slices 2, 4-7)
- Comprehensive cache invalidation strategy covering all affected query keys
- Detailed mutation lifecycle guards for navigation and component unmount scenarios
- Concrete touch interaction solution using `@media (pointer: coarse)`
- Product decisions on archive navigation (stay on page) and error message handling (show backend message)
- Removal of unused `isStale` field from data mapping

The plan is implementation-ready per the "another developer can implement without guessing" standard (plan_feature.md:324). All ambiguities are eliminated, evidence is complete, and both code changes and verification steps are specified.
