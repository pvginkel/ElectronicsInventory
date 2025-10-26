### 0) Research Log & Findings
- Reviewed `src/routes/kits/index.tsx:10` and `src/routes/kits/index.tsx:65` to confirm the overview route still navigates to `/kits/new`, triggering the placeholder view instead of an inline modal.
- Checked `src/components/kits/kit-overview-list.tsx:289` to see the CTA that forwards `onCreateKit`, matching the routing behaviour above.
- Opened `src/routes/kits/new.tsx:3` to verify the current placeholder screen that must be replaced by the modal flow.
- Studied `src/components/kits/kit-metadata-dialog.tsx:1` as the existing metadata form pattern (form state, instrumentation, optimistic cache updates) to mirror in a create dialog.
- Reviewed `src/components/types/TypeList.tsx:200` to mirror the inline “Add” modal pattern and CTA naming used for Types.
- Audited `src/components/parts/part-list.tsx:433` and supporting helpers to understand how shopping list membership indicators are wired today.
- Reused the membership lookup pattern from `src/hooks/use-part-shopping-list-memberships.ts:240` for batching queries and instrumentation; plan to apply the same approach to kit usage.
- Examined the part detail badge container at `src/components/parts/part-details.tsx:284` and the surrounding layout `src/components/parts/part-details.tsx:384` to determine how to fold kit link chips into the existing panel.
- Reviewed Playwright fixtures and selectors in `tests/support/page-objects/kits-page.ts:78` and `tests/support/page-objects/parts-page.ts:208` to scope the necessary test updates.
- Located the current create CTA expectation in `tests/e2e/kits/kits-overview.spec.ts:198` and detail badge assertions in `tests/e2e/shopping-lists/parts-entrypoints.spec.ts:54` to map deterministic scenarios.
- Consulted the stack and testing guides (`docs/contribute/architecture/application_overview.md:8`, `docs/contribute/testing/index.md:3`, `docs/contribute/testing/playwright_developer_guide.md:9`) to align with canonical routing, instrumentation, and real-backend policies.

### 1) Intent & Scope

<intent_scope_template>
**User intent**

Deliver the remaining UX polish for kits by replacing the placeholder “New Kit” flow with a real creation modal, surfacing kit membership indicators on part cards, and folding kit link chips into the part detail badge panel.

**Prompt quotes**

"There is no create function. The "New Kit" button on the kit list view goes to a placeholder page."

"I want a membership indicator for kits below the membership indicator for shopping lists here: src/components/parts/part-list.tsx:435."

"That panel should be refactored to contain all link chips, maybe with the name "parts.detail.link.badges"."

"In this panel, kit link chips need to be added when the part is used in a kit."

**In scope**

- Provide a modal-based create flow on the kits overview that mirrors the edit metadata dialog and navigates into the new kit on success.
- Delete the `/kits/new` route and surface the modal directly from the kits overview, renaming the CTA to “Add Kit” for parity with the Types list.
- Add a kit membership indicator to part list cards, batching backend queries and reusing instrumentation/test patterns.
- Refactor the part detail link badge container to host both shopping list and kit chips, reintroducing `KitLinkChip` for navigation.
- Update Playwright specs, page objects, and instrumentation hooks tied to these UI changes.

**Out of scope**

- Backend schema or API changes; rely on existing `/api/kits` and `/api/parts/{part_key}/kits` endpoints.
- Broader redesign of kits overview or part detail layouts beyond the specified modal, indicators, and badge panel.
- Non-deterministic test coverage (e.g., load-time race conditions outside the touched flows).

**Assumptions / constraints**

- Kit creation should redirect to the new kit detail using existing TanStack Router patterns and preserve overview search context when returning.
- `/api/kits` accepts `KitCreateSchema` (name, optional description, optional build_target) and responds with `KitResponseSchema` (confirmed via factories at `tests/api/factories/kit-factory.ts:33`).
- `/api/parts/{part_key}/kits` is live and returns `PartKitUsageSchema` data (`openapi-cache/openapi.json:5485`) that can be mapped into UI summaries without backend changes.
</intent_scope_template>

### 2) Affected Areas & File Map

- Area: `src/routes/kits/index.tsx`
- Why: Convert the create handler from route navigation to modal orchestration, manage open state, and post-create navigation.
- Evidence: `src/routes/kits/index.tsx:10`

- Area: `src/components/kits/kit-overview-list.tsx`
- Why: Trigger the modal, rename the CTA to “Add Kit,” and mirror the Type list layout for in-place dialog orchestration.
- Evidence: `src/components/kits/kit-overview-list.tsx:289`, `src/components/types/TypeList.tsx:200`

- Area: `src/routes/kits/new.tsx`
- Why: Delete the placeholder route and ensure `/kits` handles all creation flows via modal state.
- Evidence: `src/routes/kits/new.tsx:3`

- Area: `src/components/kits/kit-create-dialog.tsx` *(new)*
- Why: Encapsulate the create form, instrumentation, toasts, and React Query invalidation following the metadata dialog pattern.
- Evidence: `src/components/kits/kit-metadata-dialog.tsx:1`

- Area: `src/hooks/use-kit-create.ts` *(new)*
- Why: Optionally wrap `usePostKits` with React Query invalidation helpers if the dialog needs a reusable abstraction.
- Evidence: `tests/api/factories/kit-factory.ts:33`

- Area: `src/components/parts/part-list.tsx`
- Why: Inject the new kit membership indicator, including tooltip content and error handling stacked under the existing shopping indicator.
- Evidence: `src/components/parts/part-list.tsx:433`

- Area: `src/hooks/use-part-kit-memberships.ts` *(new)*
- Why: Batch `/api/parts/{part_key}/kits` queries, map summaries, and emit instrumentation akin to the shopping list lookup.
- Evidence: `src/hooks/use-part-shopping-list-memberships.ts:240`

- Area: `src/components/parts/part-details.tsx`
- Why: Rename and restructure the link badge panel, render both shopping list and kit chips, and handle loading/error states for both queries.
- Evidence: `src/components/parts/part-details.tsx:284`

- Area: `src/components/kits/kit-link-chip.tsx` *(restored)*
- Why: Provide reusable kit navigation chips for the part detail panel, matching the previous implementation pattern.
- Evidence: `docs/features/kit_pick_list_panel/plan.md:54`

- Area: `tests/support/page-objects/kits-page.ts`
- Why: Add helpers for the create dialog (open, submit, close), adopt the “Add Kit” button text, and remove expectations about route navigation.
- Evidence: `tests/support/page-objects/kits-page.ts:78`

- Area: `tests/support/page-objects/parts-page.ts`
- Why: Update badge container selectors (`parts.detail.link.badges`) and expose kit chip locators plus list indicator accessors.
- Evidence: `tests/support/page-objects/parts-page.ts:208`

- Area: `tests/e2e/kits/kits-overview.spec.ts`
- Why: Replace the navigation assertion with modal interactions and ensure instrumentation events fire for create.
- Evidence: `tests/e2e/kits/kits-overview.spec.ts:198`

- Area: `tests/e2e/shopping-lists/parts-entrypoints.spec.ts`
- Why: Extend scenarios to cover kit badges, new test IDs, and combined panel behaviour.
- Evidence: `tests/e2e/shopping-lists/parts-entrypoints.spec.ts:54`

### 3) Data Model / Contracts

<data_model_template>
- Entity / contract: KitCreate payload & response
- Shape: `payload { name: string; description?: string | null; build_target?: number }`, `response { id: number; name: string; description: string | null; build_target: number; status: 'active' | 'archived'; ... }`
- Mapping: Use trimmed values in the dialog, submitting snake_case fields (`build_target`) and mapping the response via generated `usePostKits`.
- Evidence: `tests/api/factories/kit-factory.ts:33`
</data_model_template>

<data_model_template>
- Entity / contract: Part kit usage summary
- Shape: `[{ kit_id, kit_name, status: 'active'|'archived', build_target, required_per_unit, reserved_quantity, updated_at }]`
- Mapping: Normalize to `{ kitId, name, status, buildTarget, requiredPerUnit, reservedQuantity, updatedAt }` via a new mapper in `src/types/kits`.
- Evidence: `openapi-cache/openapi.json:5485`
</data_model_template>

<data_model_template>
- Entity / contract: Part list kit membership indicator summary
- Shape: `{ partKey: string; kits: PartKitUsageSummary[]; hasMembership: boolean; activeCount: number; archivedCount: number }`
- Mapping: Derived in `use-part-kit-memberships` using `useMembershipLookup`, storing summaries keyed by part key for card lookup.
- Evidence: `src/hooks/use-part-shopping-list-memberships.ts:240`
</data_model_template>

### 4) API / Integration Surface

<integration_surface_template>
- Surface: `POST /api/kits` via `usePostKits`
- Inputs: `{ body: { name, description, build_target } }` from the create dialog; defaults build target to 1 if empty.
- Outputs: `KitResponseSchema` used to navigate to `/kits/$kitId` and invalidate the `['getKits']` query family so overview tabs refetch with fresh data.
- Errors: Surfaced through toast exceptions and instrumentation error events; retry left manual via modal reopen.
- Evidence: `tests/api/factories/kit-factory.ts:33`
</integration_surface_template>

<integration_surface_template>
- Surface: `GET /api/parts/{part_key}/kits` via `useGetPartsKitsByPartKey`
- Inputs: `{ path: { part_key } }` batched through `useMembershipLookup` for cards and detail view.
- Outputs: Array of kit usage objects mapped into summaries for indicators and chips.
- Errors: Combined with shopping list errors to show panel-level fallback messaging; indicator tooltip hides on failure.
- Evidence: `openapi-cache/openapi.json:5485`
</integration_surface_template>

<integration_surface_template>
- Surface: `useListLoadingInstrumentation` events
- Inputs: New scopes `kits.list.memberships.kits?` (for part list kits) and `parts.detail.kits` to track query lifecycle.
- Outputs: Emits `list_loading` events consumed by Playwright helpers.
- Errors: Error metadata includes part count and message for deterministic assertions.
- Evidence: `src/hooks/use-part-shopping-list-memberships.ts:284`
</integration_surface_template>

### 5) Algorithms & UI Flows

<algorithm_template>
- Flow: Kit creation from overview
- Steps:
  1. User clicks the `Add Kit` CTA; state toggles `createDialogOpen` and triggers form instrumentation open event.
  2. On submit, validate trimmed name/description/build target, emit `form` submit event, and call `usePostKits`.
  3. After success, invalidate all `getKits` queries via `queryClient.invalidateQueries({ queryKey: ['getKits'] })` so both status buckets refetch with the current search term before closing the dialog.
  4. Navigate to `/kits/$kitId` carrying status/search context; toast success confirming creation.
  - States / transitions: Dialog open/closed, mutation pending, navigation to detail.
  - Hotspots: Reset modal state when search params change and guard against rapid double submits while queries refetch.
  - Evidence: `src/components/kits/kit-overview-list.tsx:289`, `src/components/types/TypeList.tsx:200`
</algorithm_template>

<algorithm_template>
- Flow: Part list kit membership indicator
- Steps:
  1. Collect visible part keys and pass to `usePartKitMemberships` to batch fetch kit usage.
  2. When summaries resolve, render indicator below shopping list indicator only when `hasMembership` is true.
  3. Tooltip lists active kit names/status; archive-only membership still renders but flagged accordingly.
  4. Handle loading/error states by showing spinner or error glyph stacked under quantity badge.
- States / transitions: Query pending/error/success; summary updates on refetch.
- Hotspots: Avoid layout shift when both indicators render; ensure tooltip width matches design.
- Evidence: `src/components/parts/part-list.tsx:433`
</algorithm_template>

<algorithm_template>
- Flow: Part detail link badges
- Steps:
  1. Parallel fetch shopping list memberships and kit usage for the part.
  2. Render a single container (`parts.detail.link.badges`) showing skeleton/error states consolidated across both queries.
  3. Display shopping list chips first, followed by kit chips (active, then archived) using `KitLinkChip`.
  4. Provide empty copy when neither memberships nor kit usage exist.
- States / transitions: Loading skeleton vs. combined errors vs. aggregated chips.
- Hotspots: Keep anchor IDs stable for deep links; ensure grid spacing remains consistent.
- Evidence: `src/components/parts/part-details.tsx:384`
</algorithm_template>

### 6) Derived State & Invariants
- Derived: `createDialogDisabled` — true when the form has validation errors or mutation pending; invariant prevents double submit.
- Derived: `kitIndicatorSummary` — counts active vs. archived kits per part; invariant ensures tooltip lists at least status + name.
- Derived: `linkPanelState` — merges shopping and kit query statuses into one display state; invariant guarantees only one error banner at a time.

### 7) Error Handling & Empty States
- Show dialog-level inline validation for missing name or negative build target; errors tracked via instrumentation snapshot.
- Part list indicator surfaces error glyph with tooltip “Failed to load kit data” similar to shopping indicator messaging.
- Link badge panel collapses to combined error alert with retry button when either query fails; otherwise shows “This part is not linked...” copy when both datasets are empty.

### 8) Instrumentation & Analytics

<telemetry_template>
- Signal: `form` events for `KitOverview:create`
- Type: instrumentation event
- Trigger: Dialog open/submit/success/error via `useFormInstrumentation`
- Labels / fields: `{ kitName, buildTarget }` trimmed snapshot
- Consumer: Playwright `waitTestEvent` in kits overview spec validates submit/success
- Evidence: `src/components/kits/kit-metadata-dialog.tsx:38`
</telemetry_template>

<telemetry_template>
- Signal: `list_loading` for `parts.list.kitIndicators`
- Type: instrumentation event
- Trigger: New `usePartKitMemberships` hook lifecycle
- Labels / fields: `{ partCount, activePartCount, membershipCount }`
- Consumer: Parts list Playwright helper waits for ready state before tooltip assertions
- Evidence: `src/hooks/use-part-shopping-list-memberships.ts:284`
</telemetry_template>

<telemetry_template>
- Signal: `list_loading` for `parts.detail.kits`
- Type: instrumentation event
- Trigger: Part detail kit usage query start/success/error
- Labels / fields: `{ partKey, activeCount }`
- Consumer: Detail badge spec waits for ready before verifying chip counts
- Evidence: `docs/contribute/testing/playwright_developer_guide.md:9`
</telemetry_template>

### 9) Accessibility & i18n
- Maintain accessible labels on `KitLinkChip` and the new indicator by mirroring existing patterns (`aria-label` combines kit name + status).
- Ensure modal focus trapping and keyboard submit/cancel match the metadata dialog.
- Tooltip content should remain textual; avoid icon-only indicators without labels.

### 10) Lifecycle & Background Work

<lifecycle_template>
- Hook / effect: Dialog open state effect in `KitsOverviewRoute`
- Trigger cadence: on modal close or when search params change
- Responsibilities: Reset form state and ensure the inline modal does not reopen after navigation (mirrors Type list pattern).
- Cleanup: Reset local state on unmount/navigation so the dialog stays closed when returning to the overview.
- Evidence: `src/routes/kits/index.tsx:31`, `src/components/types/TypeList.tsx:200`
</lifecycle_template>

<lifecycle_template>
- Hook / effect: Kit usage query instrumentation
- Trigger cadence: runs whenever highlighted part keys change on the list
- Responsibilities: Resize lookup cache, emit list loading events
- Cleanup: `useMembershipLookup` handles query cache; no manual cleanup required
- Evidence: `src/hooks/use-part-shopping-list-memberships.ts:240`
</lifecycle_template>

### 11) Security & Permissions
- Not applicable; all flows rely on existing authenticated endpoints without new permission checks.

### 12) UX / UI Impact

<ux_impact_template>
- Entry point: Kits overview CTA
- Change: Replace navigation with modal; user stays on overview while creating kits
- User interaction: Immediate feedback plus success toast and redirect to detail
- Dependencies: `KitCreateDialog`, `usePostKits`, router navigation
- Evidence: `src/components/kits/kit-overview-list.tsx:289`
</ux_impact_template>

<ux_impact_template>
- Entry point: Parts list card header
- Change: Additional kit membership indicator stacked under shopping indicator
- User interaction: Hover reveals kits consuming the part with status labels
- Dependencies: `MembershipIndicator`, `usePartKitMemberships`
- Evidence: `src/components/parts/part-list.tsx:433`
</ux_impact_template>

<ux_impact_template>
- Entry point: Part detail link badge panel
- Change: Consolidated panel with shopping list and kit chips, renamed test IDs
- User interaction: Users can jump to kits directly; empty state messaging updated
- Dependencies: `ShoppingListLinkChip`, `KitLinkChip`, new hook
- Evidence: `src/components/parts/part-details.tsx:384`
</ux_impact_template>

### 13) Deterministic Test Plan

<test_plan_template>
- Surface: Kits overview create modal
- Scenarios:
  - Given the overview is ready, When the user clicks `Add Kit`, Then the modal opens and `form` open events fire.
  - Given the modal with valid inputs, When the user submits, Then Playwright waits for `form` submit/success and navigation to `/kits/$kitId`.
  - Given the modal with invalid name, When the user submits, Then validation error text appears and no request is sent.
- Instrumentation / hooks: `waitTestEvent` for `KitOverview:create`, dialog `data-testid` selectors.
- Gaps: None.
- Evidence: `tests/e2e/kits/kits-overview.spec.ts:198`
</test_plan_template>

<test_plan_template>
- Surface: Parts list indicators
- Scenarios:
  - Given a part used in kits, When the list loads, Then both indicators render with tooltips containing kit names/status.
- Instrumentation / hooks: `waitForListLoading(page, 'parts.list.kitIndicators', 'ready')`, tooltip selectors.
- Gaps: None (error state remains covered by component tests and manual QA).
- Evidence: `tests/e2e/shopping-lists/parts-entrypoints.spec.ts:54`
</test_plan_template>

<test_plan_template>
- Surface: Part detail link badges
- Scenarios:
  - Given a part on concept lists and in kits, When detail loads, Then the combined panel lists both shopping list chips and kit chips.
  - Given kit usage only, When detail loads, Then the panel shows kit chips and empties shopping list state without error.
  - Given failed kit usage query, When retry clicked, Then instrumentation emits ready after refetch succeeds.
- Instrumentation / hooks: `waitForListLoading(page, 'parts.detail.kits', 'ready')`, new `parts.detail.link.badges` selectors.
- Gaps: None.
- Evidence: `src/components/parts/part-details.tsx:384`
</test_plan_template>

### 14) Implementation Slices

<implementation_slice_template>
- Slice: Kit create modal & hook
- Goal: Deliver the functional modal with API wiring and navigation, delete `/kits/new`, and rename the overview CTA to “Add Kit”.
- Touches: `src/routes/kits/index.tsx`, `src/routes/kits/new.tsx`, `src/components/kits/kit-overview-list.tsx`, `src/components/kits/kit-create-dialog.tsx`, `src/hooks/use-kit-create.ts`
- Dependencies: None; baseline for subsequent slices
</implementation_slice_template>

<implementation_slice_template>
- Slice: Part kit membership indicator
- Goal: Surface kit indicator on list cards with instrumentation
- Touches: `src/hooks/use-part-kit-memberships.ts`, `src/components/parts/part-list.tsx`
- Dependencies: Hook from previous slice not required; can build in parallel
</implementation_slice_template>

<implementation_slice_template>
- Slice: Part detail link badges
- Goal: Consolidate panel and render kit chips
- Touches: `src/components/parts/part-details.tsx`, `src/components/kits/kit-link-chip.tsx`
- Dependencies: Kit hook/indicator to reuse mapping logic
</implementation_slice_template>

<implementation_slice_template>
- Slice: Playwright coverage
- Goal: Update specs and page objects after UI changes
- Touches: `tests/support/page-objects/*`, `tests/e2e/kits/kits-overview.spec.ts`, `tests/e2e/shopping-lists/parts-entrypoints.spec.ts`
- Dependencies: UI changes complete to avoid brittle selectors
</implementation_slice_template>

### 15) Risks & Open Questions

<risk_template>
- Risk: Query invalidation might lag, leaving overview counters stale as we navigate into the new kit.
- Impact: Users (and tests) could miss the freshly created kit on return if refetch hasn’t settled.
- Mitigation: Emit list-loading instrumentation and wait for ready state before overview assertions; ensure navigation happens after the invalidation fires.
</risk_template>

<risk_template>
- Risk: Part list queries could overload backend if both shopping and kit lookups fire for large lists
- Impact: Longer load times and potential timeouts
- Mitigation: Reuse memoized key normalization and throttle instrumentation to only visible parts; consider pagination later if needed
</risk_template>

<risk_template>
- Risk: Combined badge panel error handling might mask which query failed
- Impact: Debugging harder and user may not retry correctly
- Mitigation: Include concise copy mentioning shopping vs. kits; log detailed error in console for diagnosis
</risk_template>

<open_question_template>
- Question: After creating a kit, should we always navigate to detail or keep the user on the overview?
- Why it matters: Determines whether the modal closes with toast-only feedback or triggers router navigation.
- Owner / follow-up: Confirm with product/design or user (prompt assumption currently points to detail redirect).
</open_question_template>

### 16) Confidence

<confidence_template>Confidence: Medium — Patterns exist for metadata dialogs and membership indicators, but integrating dual queries in the detail panel introduces nuanced error handling.</confidence_template>
