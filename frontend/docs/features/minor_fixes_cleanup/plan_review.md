# Plan Review — Minor Fixes and Cleanup

## 1) Summary & Decision

**Readiness**

The plan is thorough and well-researched, following established CRUD patterns from shopping lists and parts deletion. Both features (pick list deletion and part detail refresh removal) are scoped appropriately as housekeeping tasks. The research log demonstrates comprehensive investigation of backend endpoints, generated hooks, and test patterns. The instrumentation strategy follows documented patterns, cache invalidation is targeted correctly, and navigation preserves context. However, there are minor gaps in test scenario coverage and documentation of search parameter contracts that should be addressed before implementation.

**Decision**

`GO-WITH-CONDITIONS` — The plan is implementation-ready with three conditions: (1) add explicit Playwright test scenario verifying part detail refresh option is absent, (2) document search parameter contracts (kitOverviewStatus, kitOverviewSearch) in the Data Model section, and (3) clarify acceptance criteria for Slice 5 verification.

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `plan_feature.md` — Pass — `plan.md:1-541` — All 16 required sections present with evidence-backed entries. Research log (plan.md:3-36), file map with evidence (plan.md:77-114), data contracts (plan.md:117-145), deterministic test plan (plan.md:415-450) all conform to template structure.

- `application_overview.md` — Pass — `plan.md:86-87, 324-327` — Plan correctly references TanStack Query for cache management, generated hooks (`useDeletePickListsByPickListId` at hooks.ts:1617), and instrumentation via `isTestMode()` guard pattern (application_overview.md:44-46).

- `playwright_developer_guide.md` — Pass with gaps — `plan.md:427-431` — Instrumentation events specified correctly (ui_state scope, loading/ready/error phases), confirmation dialog uses semantic selection pattern (`getByRole('button', { name: /delete/i })`), backend factory exists (`testData.kits.createPickList`). However, test scenarios (plan.md:420-425) don't cover all edge cases documented in section 8 (plan.md:273-313), specifically cross-tab deletion (plan.md:301-305) lacks corresponding test scenario.

- `product_brief.md` — Pass — `plan.md:70-72` — Pick list deletion aligns with product brief section 5 "Projects (kits)" (product_brief.md:70-76) which documents pick lists as ephemeral workflow aids. Deletion is appropriate housekeeping and doesn't violate any product constraints.

- `AGENTS.md` — Pass — `plan.md:471-475` — Plan references `isTestMode()` guard (AGENTS.md:38) and instrumentation coupling requirement (AGENTS.md:44-46). Implementation notes correctly defer to existing patterns rather than introducing new abstractions (AGENTS.md:35).

**Fit with codebase**

- `src/components/pick-lists/pick-list-detail.tsx` — `plan.md:89-92` — Component already receives `kitOverviewStatus` and `kitOverviewSearch` props (pick-list-detail.tsx:33-34), confirming navigation context availability. DetailScreenLayout pattern matches part-details.tsx:455-477 structure, providing consistent location for action buttons.

- `src/hooks/use-pick-list-detail.ts` — `plan.md:93-96` — Hook already exports `buildPickListDetailQueryKey` (plan.md:95), confirming targeted cache invalidation is achievable without modification.

- `src/components/parts/part-details.tsx` — `plan.md:106-114` — Refresh option removal verified via system reminder showing lines 303-309 removed. Remaining dropdown menu structure (part-details.tsx:289-312) intact with "Order Stock" and "Duplicate Part" options preserved.

- `tests/e2e/pick-lists/pick-list-detail.spec.ts` — `plan.md:99-100` — Existing spec demonstrates instrumentation patterns (pick-list-detail.spec.ts:85-92, 180-189) and search param preservation (pick-list-detail.spec.ts:303-314), providing reference implementation for deletion scenarios.

## 3) Open Questions & Ambiguities

**Question:** Should a new Playwright test be added to explicitly assert the part detail refresh option is absent, or is running existing tests sufficient verification?

**Why it matters:** The test plan section (plan.md:438-450) describes scenarios but doesn't specify adding a new test. Slice 5 (plan.md:496-502) says "Verification needed" without defining acceptance criteria. If existing tests don't reference the refresh button, they won't fail when it's present, leaving a coverage gap for regression.

**Needed answer:** Confirm whether Slice 5 should include adding a test scenario like "Given part detail page open, When user opens actions dropdown, Then refresh option is not present" or document why existing coverage is sufficient.

---

**Question:** Are `kitOverviewStatus` and `kitOverviewSearch` search parameters part of the formal contract between pick list detail and kit detail pages?

**Why it matters:** These parameters appear in multiple places (plan.md:33-34, 191, 425, 436, 475) but are not documented in the Data Model / Contracts section (plan.md:117-145). The plan should clarify whether these are optional convenience parameters or required for correct navigation behavior.

**Needed answer:** Document search parameter shape, optionality, and validation rules in section 3 to establish the navigation contract clearly.

## 4) Deterministic Playwright Coverage (new/changed behavior only)

**Behavior:** Pick list deletion from detail page

**Scenarios:**
- Given open pick list detail page, When user clicks delete action and confirms, Then pick list is removed from backend, user navigates to kit detail, success toast appears, ui_state event (scope: `pickLists.detail.delete`, phase: `ready`) emitted (`plan.md:421`)
- Given completed pick list detail page, When user clicks delete action and confirms, Then pick list is removed and user navigates to kit detail (`plan.md:422`)
- Given pick list deleted by another user, When current user attempts delete, Then backend returns 404, error toast shows, user remains on detail page showing "not found" after cache invalidation (`plan.md:423-424`)
- Given pick list detail page with kit overview search params, When user deletes pick list, Then user navigates to kit detail with search params preserved (`plan.md:425`)

**Instrumentation:**
- Delete button: `data-testid="pick-lists.detail.actions.delete"` (`plan.md:427`)
- Confirm dialog: `getByRole('dialog')` and `getByRole('button', { name: /delete/i })` (`plan.md:428`)
- Wait for `ui_state` event with scope `pickLists.detail.delete`, phase `ready` (`plan.md:429`)
- Backend verification: `testData.kits.createPickList(kitId, options)` factory seeds pick lists, assert absence via GET returning 404 or missing from kit detail (`plan.md:430`)
- Navigation verification: Assert URL changes to `/kits/{kitId}` with optional search params (`plan.md:431`)

**Backend hooks:** Existing factory `testData.kits.createPickList` supports deletion testing (plan.md:26, 530). Generated hook `useDeletePickListsByPickListId` at hooks.ts:1617 (plan.md:53, 86-87).

**Gaps:**
- Missing scenario for disabled button state during mutation (plan.md:201 mentions "Delete button disabled while mutation is pending" but no test scenario verifies this)
- Cross-tab deletion edge case documented (plan.md:301-305) but not included in test scenarios (plan.md:420-436)

**Evidence:** `plan.md:415-450`, references existing pick list detail spec structure (`tests/e2e/pick-lists/pick-list-detail.spec.ts`), part delete pattern (`part-details.tsx:215-236`), confirmation dialog pattern (`tests/e2e/boxes/boxes-detail.spec.ts:71`, `tests/e2e/types/types-crud.spec.ts:53`)

---

**Behavior:** Part detail refresh option removal

**Scenarios:**
- Given part detail page open, When user opens actions dropdown, Then "Refresh" option is not present (`plan.md:442`)
- Given part detail loaded data, When backend data changes and user refocuses window, Then TanStack Query refetches automatically (`plan.md:443`)

**Instrumentation:**
- Actions dropdown: `data-testid="parts.detail.actions.menu"` (`plan.md:445`)
- Verify "Refresh" item does not exist in dropdown (`plan.md:446`)
- Existing `parts.detail` loading instrumentation continues (`plan.md:447`)

**Backend hooks:** None required (removal only)

**Gaps:**
- Test plan describes scenarios but Slice 5 (plan.md:496-502) doesn't specify whether to add a new test or just run existing tests. Acceptance criteria unclear.

**Evidence:** `plan.md:438-450`, existing part detail tests (`tests/e2e/parts/part-crud.spec.ts`), system reminder confirms removal at part-details.tsx:303-309

## 5) Adversarial Sweep

**Major — Search parameters not documented as formal contract**

**Evidence:** `plan.md:33-34, 191, 198, 425, 436, 475` — Search params (`kitOverviewStatus`, `kitOverviewSearch`) referenced throughout but absent from section 3 "Data Model / Contracts" (plan.md:117-145).

**Why it matters:** Navigation behavior depends on these parameters to preserve kit overview context when returning from pick list detail. Without formal documentation, their shape, optionality, and validation rules are ambiguous. The plan shows they're passed as props (plan.md:33-34) and used in navigation (plan.md:191) but doesn't define the contract. This could lead to implementation inconsistencies if developers aren't sure whether `undefined` vs missing param has different semantics.

**Fix suggestion:** Add entry to section 3 documenting search parameter contract:
```
- Entity / contract: Pick list detail navigation search params
- Shape: { kitOverviewStatus?: KitStatus, kitOverviewSearch?: string }
- Mapping: Passed from kit detail route search state to pick list detail, preserved on navigation back
- Evidence: pick-list-detail.tsx:33-34, navigation at plan.md:191
```

**Confidence:** High — Parameters appear in 6 locations but lack formal specification. Standard practice per plan_feature.md:93-104 requires documenting all contract changes.

---

**Major — Test scenario for part refresh removal lacks specificity**

**Evidence:** `plan.md:496-502` — Slice 5 says "Verification needed" and "Run pnpm playwright test tests/e2e/parts/ and verify all pass" without specifying new coverage.

**Why it matters:** Behavioral changes require explicit test coverage per AGENTS.md:44-46 ("Ship instrumentation changes and matching Playwright coverage in the same slice"). The removal of the refresh option is a user-visible change. If existing tests don't assert the absence of the refresh button, there's no regression protection. The test plan section (plan.md:442) describes a scenario but doesn't tie it to Slice 5's acceptance criteria.

**Fix suggestion:** Update Slice 5 to specify either: (A) "Add test scenario to existing part detail spec asserting actions dropdown does not contain 'Refresh' option when opened" or (B) "Verify existing tests pass without modification; no new test needed because refresh button was never tested and removal doesn't affect existing assertions" with justification for (B).

**Confidence:** High — AGENTS.md:44-46 and playwright_developer_guide.md:185-188 require test coverage for UI changes. Slice 5's vagueness creates ambiguity about definition of done.

---

**Minor — Cross-tab deletion edge case lacks test coverage**

**Evidence:** `plan.md:301-305` documents edge case ("User is on pick list detail page in one tab, views or deletes list from another tab/session") but `plan.md:420-436` test scenarios don't include it. Plan says "navigation only occurs when deletion initiated from that specific tab" (plan.md:303) but no test verifies this behavior.

**Why it matters:** Cross-tab behavior is a potential source of user confusion. The plan correctly identifies that the stale tab should show "not found" UI without automatic navigation (plan.md:303), but without a test scenario, this invariant isn't verified. While this may be acceptable to defer, the plan should explicitly acknowledge the gap in section 13 "Gaps" (plan.md:432-435) and justify deferral.

**Fix suggestion:** Either add test scenario: "Given pick list detail page open in Tab A, When pick list deleted in Tab B, Then Tab A shows 'Pick list not found' after cache invalidation without navigation" or add to Gaps: "Cross-tab deletion notification deferred (acceptable; showing 'not found' UI is correct behavior per plan.md:303)".

**Confidence:** Medium — Edge case is documented and handling is correct (show not found UI), but lack of explicit test coverage means behavior relies on TanStack Query's cross-tab invalidation without verification.

---

**Minor — Mutation loading state not covered in test scenarios**

**Evidence:** `plan.md:201` states "Delete button disabled while mutation is pending" but test scenarios (plan.md:420-425) don't verify this behavior. The plan specifies testid `pick-lists.detail.actions.delete` (plan.md:427) but doesn't include a scenario asserting the button's disabled state during mutation.

**Why it matters:** Disabled state prevents duplicate mutation requests and provides user feedback. While the implementation will likely disable the button correctly (following part delete pattern at part-details.tsx:284), the test plan should include a scenario verifying this guard works, especially since the plan emphasizes deterministic coverage (plan.md:415-417).

**Fix suggestion:** Add scenario: "Given pick list deletion in progress, When mutation is pending, Then delete button is disabled and ui_state event shows phase 'loading'". This aligns with the instrumentation plan at plan.md:324-327 (onMutate emits loading phase).

**Confidence:** Medium — Implementation likely correct by pattern reuse, but explicit coverage would strengthen determinism. Less critical than data contract gaps.

---

**Checks attempted:** Instrumentation completeness, cache invalidation key correctness, navigation race conditions, derived state invariants, test scenario coverage against documented edge cases.

**Evidence:** Instrumentation events specified with scope/phase/metadata (plan.md:324-328), cache invalidation uses correct query keys (plan.md:188-190 matches hooks.ts:1617 structure), navigation happens in onSuccess after invalidation (plan.md:191), derived state section documents kitId availability (plan.md:235-240).

**Why the plan holds:** Core deletion flow follows established patterns (shopping lists, parts), instrumentation is guarded by isTestMode(), navigation preserves context, and edge case handling is documented even if not all scenarios have explicit test coverage. The identified gaps are documentation and test specificity issues rather than fundamental design flaws.

## 6) Derived-Value & State Invariants (table)

**Derived value:** `openPickLists` and `completedPickLists` arrays in kit pick list panel

- **Source dataset:** Filtered from `kit.pickLists` (kit-pick-list-panel.tsx:53-60)
- **Write / cleanup triggered:** After deletion, `invalidateQueries` refetches kit pick lists query using key `['getKitsPickListsByKitId', { path: { kit_id: detail.kitId } }]` (plan.md:190); panel re-renders with updated arrays
- **Guards:** Confirm dialog prevents accidental deletion (plan.md:183); mutation `onError` prevents cache invalidation if backend rejects deletion (plan.md:229)
- **Invariant:** Deleted pick list must not appear in either open or completed sections after mutation succeeds
- **Evidence:** `plan.md:224-231`, kit-pick-list-panel.tsx:53-60

---

**Derived value:** Pick list detail data (`detail: PickListDetail | undefined`)

- **Source dataset:** Unfiltered query result from `useGetPickListsByPickListId` (use-pick-list-detail.ts:67-70)
- **Write / cleanup triggered:** When pick list is deleted (by current user or another session), mutation invalidates cache using `buildPickListDetailQueryKey(pickListId)` (plan.md:189) and navigates user to kit detail page (plan.md:191) before 404 can render
- **Guards:** Navigation occurs in deletion mutation's `onSuccess` callback before stale data can render "not found" state (plan.md:238); prevents showing error UI for user-initiated deletion
- **Invariant:** After deletion by current user, user must be navigated away from pick list detail page to kit detail page using `detail.kitId` before cache invalidation completes; user should never see "not found" UI for their own deletion action
- **Evidence:** `plan.md:233-240`, pick-list-detail.tsx:328-335 (not found fallback), navigation pattern part-details.tsx:235

---

**Derived value:** Part data freshness after refresh removal

- **Source dataset:** Unfiltered query cache from `useGetPartsByPartKey` with TanStack Query staleTime and refetch policies
- **Write / cleanup triggered:** None triggered by refresh removal; automatic refetch on window focus and network reconnect continues per TanStack Query defaults (application_overview.md:37-38)
- **Guards:** Query continues to refetch on window focus and network reconnect; mutations that update parts (edit, delete, add stock) continue to invalidate cache as before (plan.md:267)
- **Invariant:** Part data freshness is maintained by TanStack Query's built-in policies without manual intervention; removing refresh option does not degrade data consistency
- **Evidence:** `plan.md:242-249`, part-details.tsx:70-79, application_overview.md:37-38

---

**Derived value:** Kit navigation search parameters (`kitOverviewStatus`, `kitOverviewSearch`)

- **Source dataset:** Passed from kit detail route search state to pick list detail as props (plan.md:33-34), or fetched from kit status query if not provided (plan.md:120-133 in system reminder)
- **Write / cleanup triggered:** Preserved in navigation back to kit detail after deletion (plan.md:191); mutation `onSuccess` navigates with search params: `{ to: '/kits/$kitId', params: { kitId: String(detail.kitId) }, search: kitNavigationSearch }`
- **Guards:** Optional parameters (plan.md:191 says "with optional search params if available"); if unavailable, navigation still succeeds to kit detail without search params
- **Invariant:** Search params must be preserved when present to maintain user's kit overview filter context; navigation must not fail if params are absent
- **Evidence:** `plan.md:191, 198, 425, 436`, pick-list-detail.tsx:33-34, 135-142 (system reminder shows search param resolution logic)

> **Note:** This derived value lacks formal documentation in section 3 "Data Model / Contracts" (plan.md:117-145) — flagged as Major finding above.

## 7) Risks & Mitigations (top 3)

**Risk:** Backend DELETE endpoint rejects deletion if pick list has associated audit trail or completed picks

**Mitigation:** Coordinate with backend team on deletion constraints; ensure error messages are descriptive (e.g., "Cannot delete pick list with completed history"); frontend shows error toast and does not navigate user away; backend validates before allowing deletion per OpenAPI spec (plan.md:128, 510-513)

**Evidence:** `plan.md:510-513`, DELETE endpoint returns 204 (success), 400 (validation), 404 (not found) per plan.md:128

---

**Risk:** User in one tab deletes pick list while viewing it in another tab; active tab shows "not found" UI after cache invalidation

**Mitigation:** Cross-tab deletions show "not found" state without automatic navigation (plan.md:303, 515-516); this accurately reflects deleted state; users can navigate back manually; TanStack Query cross-tab invalidation ensures UI reflects deletion even when not initiated by current tab (plan.md:304)

**Evidence:** `plan.md:301-305, 515-517`, TanStack Query cross-tab behavior documented at pick-list-detail.tsx:328-335

---

**Risk:** Removing part detail refresh breaks undocumented user workflows where users relied on manual refresh to see updated data

**Mitigation:** Monitor feedback after release; document TanStack Query's automatic refetch behavior in user help docs if needed; existing automatic refetch on focus/reconnect (application_overview.md:37-38) should satisfy most use cases; users can navigate away/back as workaround (plan.md:215, 518-520)

**Evidence:** `plan.md:518-520`, part detail query lifecycle (plan.md:361-366), TanStack Query refetch behavior (application_overview.md:37-38)

## 8) Confidence

Confidence: High — Both changes are isolated, low-risk housekeeping tasks with clear implementation paths following established CRUD patterns (shopping lists for deletion, TanStack Query defaults for refresh removal). The plan is comprehensive with detailed evidence and documented edge cases. The identified gaps are minor (missing test scenarios, search param documentation) and can be addressed during implementation without design changes. The instrumentation strategy, cache invalidation approach, and navigation flow are all sound and follow documented patterns.
