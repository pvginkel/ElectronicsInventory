# Kits Membership Indicators Plan

### 0) Research Log & Findings
- Reviewed kit overview UI to understand current card structure and where membership indicators need to live (`src/components/kits/kit-card.tsx:1-118`).
- Analyzed the existing `ShoppingListIndicator` embedded in the parts list to capture reusable patterns for hover panels, counts, and instrumentation (`src/components/parts/part-list.tsx:434-532`).
- Inspected `use-part-shopping-list-memberships` to document normalization logic and query patterns we can generalize (`src/hooks/use-part-shopping-list-memberships.ts:1-200`).
- Confirmed new backend endpoints for kit memberships are available via the regenerated client (`src/lib/api/generated/hooks.ts:792-824` and `openapi-cache/openapi.json` diff).
- Validated current instrumentation expectations in canonical docs (`docs/contribute/testing/playwright_developer_guide.md`) and architecture guidance on wrapping generated hooks (`docs/contribute/architecture/application_overview.md:33`).
- Surveyed Playwright coverage for kits to scope test updates (`tests/e2e/kits/kits-overview.spec.ts:1-85`) and supporting page objects (`tests/support/page-objects/kits-page.ts:1-80`).

### 1) Intent & Scope

**User intent**

Build reusable membership indicators for kits (shopping & pick lists) by extracting the parts implementation, wiring new kit membership endpoints, and restoring UI parity on the kits overview cards.

**Prompt quotes**

"I want that to become generic and reusable.", "I want a separate one for pick lists with its own icon (clipboard-list).", "You can read the full diff by calling `git diff openapi-cache/openapi.json`."

**In scope**

- Extract the parts shopping-list indicator into a shareable component/hook pair and reuse it for kits.
- Add a pick-list indicator leveraging the new kit membership endpoints with dedicated iconography.
- Update kit overview cards (and relevant tests) to consume the new indicators while preserving instrumentation.

**Out of scope**

- Backend changes or further API contract tweaks beyond the provided membership endpoints.
- Full kit detail workspace — only placeholder navigation support if required.
- Styling refactors unrelated to membership indicators or build-target badge alignment already delivered.

**Assumptions / constraints**

- New kit membership endpoints are production-ready and exposed in the regenerated OpenAPI client.
- Kits overview remains the primary consumer; other surfaces (e.g., kit detail) can reuse the shared component later without additional backend changes.
- Indicator components must align with existing hover/tooltip interaction patterns documented for parts.

### 2) Affected Areas & File Map

- Area: `src/hooks/use-part-shopping-list-memberships.ts`
- Why: Extract normalization and lookup logic into a shared hook to support both parts and kits.
- Evidence: `src/hooks/use-part-shopping-list-memberships.ts:1-200` (current query + mapping logic).

- Area: `src/components/parts/part-list.tsx`
- Why: Replace inline `ShoppingListIndicator` with shared component usage and ensure part UI keeps expected behavior.
- Evidence: `src/components/parts/part-list.tsx:434-532` (indicator implementation + tooltip markup).

- Area: `src/lib/api/generated/hooks.ts`
- Why: Confirm request/response schemas for kit membership endpoints before wrapping them in TanStack `useQuery` helpers (do not rely on the generated `usePost*` mutation wrappers).
- Evidence: `src/lib/api/generated/hooks.ts:792-824`.

- Area: `src/lib/api/generated/types.ts`
- Why: Reference new schemas for kit membership payloads when defining client-side models.
- Evidence: `openapi-cache/openapi.json` diff lines introducing `KitPickListMembershipQueryResponseSchema` and related types.

- Area: `src/types/kits.ts`
- Why: Add membership summary interfaces for kits mirroring parts’ domain models.
- Evidence: Existing kit types `src/types/kits.ts:1-60` (place to extend domain-layer models).

- Area: `src/types/shopping-lists.ts`
- Why: Evaluate reusing or extending shopping list membership types for kits; ensure shared component can rely on unified types.
- Evidence: `src/types/shopping-lists.ts:1-220` (current membership definitions).

- Area: `src/components/common/membership-indicator.tsx` (new)
- Why: Host the extracted indicator presentation and tooltip logic, parameterized for shopping vs pick lists.
- Evidence: New reusable component derived from `part-list` indicator; see `src/components/parts/part-list.tsx:434-532` for source pattern.

- Area: `src/hooks/use-membership-lookup.ts` (new)
- Why: Provide shared lookup hook that can fetch memberships for arbitrary entities using provided query functions.
- Evidence: Derived need from `src/hooks/use-part-shopping-list-memberships.ts:34-183`.

- Area: `src/components/kits/kit-card.tsx`
- Why: Swap inline activity block for new indicators (shopping + pick lists) beside the build-target badge.
- Evidence: `src/components/kits/kit-card.tsx:1-93` (current card layout).

- Area: `src/components/kits/kit-overview-list.tsx`
- Why: Ensure necessary data (kit IDs) flows into cards for indicator hydration; confirm counts/instrumentation unaffected.
- Evidence: `src/components/kits/kit-overview-list.tsx:50-120` (kits data normalization).

- Area: `tests/support/page-objects/kits-page.ts`
- Why: Extend page object with locators/assertions for the new indicators (e.g., hover panels, counts).
- Evidence: `tests/support/page-objects/kits-page.ts:1-80`.

- Area: `tests/e2e/kits/kits-overview.spec.ts`
- Why: Add scenarios validating indicator visibility, hover content, and data parity with backend.
- Evidence: `tests/e2e/kits/kits-overview.spec.ts:1-85`.

- Area: `tests/support/page-objects/parts-page.ts` & `tests/e2e/parts` specs
- Why: Verify parts tests continue to pass with shared indicator component; adjust selectors if needed.
- Evidence: `tests/support/page-objects/parts-page.ts:1-120`.

- Area: `tests/api/factories/kit-factory.ts`
- Why: Provide helper to seed pick/shopping list memberships for E2E scenarios.
- Evidence: `tests/api/factories/kit-factory.ts:1-120`.

- Area: `docs/features/kits_overview_archiving/plan.md`
- Why: Reference prior plan for instrumentation expectations; no edits anticipated but informs constraints.
- Evidence: `docs/features/kits_overview_archiving/plan.md:200-320`.

### 3) Data Model / Contracts

- Entity / contract: `KitShoppingListMembershipSummary`
- Shape: `{ kitId: number; memberships: KitShoppingListMembership[]; hasActiveShopping: boolean; activeCount: number; completedCount: number; listNames: string[] }`
- Mapping: Map `kit_id` and `shopping_lists[]` from the response into kit-focused summaries (no `partKey`), mirroring the derived counts from `ShoppingListMembershipSummary`.
- Evidence: `openapi-cache/openapi.json` (KitShoppingListMembershipQueryResponseSchema), `src/lib/api/generated/types.ts:3060-3210`.

- Entity / contract: `KitPickListMembershipSummary`
- Shape: `{ kitId: number; pickLists: KitPickListMembership[]; hasOpenPickList: boolean; openCount: number; completedCount: number }`
- Mapping: Adapt pick list payloads (`pick_lists[]`) into camelCase models, capturing status counts for tooltip display.
- Evidence: `openapi-cache/openapi.json:3060-3210`.

- Entity / contract: Shared membership indicator props
- Shape: `{ entityIds: number[]; variant: 'shopping' | 'pick'; summaries: Record<number, KitMembershipSummary>; isLoading: boolean; error: Error | null }`
- Mapping: Shared component consumes kit summaries keyed by ID; parts continue to pass string keys through the same abstraction via overloads.
- Evidence: `src/components/parts/part-list.tsx:434-532` (UI pattern to generalize), `src/hooks/use-part-shopping-list-memberships.ts:96-220` (summary shape inspiration).

- Entity / contract: React Query cache keys
- Shape: `['kits.memberships', { kitIds: number[]; includeDone: boolean; scope: 'shopping' | 'pick' }]`
- Mapping: New kit-specific hook dedupes normalized ID arrays and injects scope to separate shopping vs pick caches.
- Evidence: `src/hooks/use-part-shopping-list-memberships.ts:58-120` (existing normalization/key strategy).

### 4) API / Integration Surface

- Surface: `POST /api/kits/shopping-list-memberships/query` wrapped in new `useKitShoppingListMemberships` query hook
  - Inputs: `{ kit_ids: number[]; include_done: boolean }`
  - Outputs: `memberships[]` grouped per kit containing active/completed shopping list associations.
  - Errors: Wrap with `toApiError` and surface through shared indicator (toast + tooltip fallback), consistent with parts implementation.
  - Evidence: `src/lib/api/generated/hooks.ts:812-824` for schema, `src/hooks/use-part-shopping-list-memberships.ts:131-220` as hook reference.

- Surface: `POST /api/kits/pick-list-memberships/query` wrapped in new `useKitPickListMemberships` query hook
  - Inputs: `{ kit_ids: number[]; include_done: boolean }`
  - Outputs: memberships per kit with pick list status counts.
  - Errors: Same handling path as shopping list query; share instrumentation metadata.
  - Evidence: `src/lib/api/generated/hooks.ts:792-811`.

- Surface: `POST /api/parts/shopping-list-memberships/query`
  - Inputs/Outputs: Already in use; shared lookup hook must accept adapters for kit vs part fetchers without mutating existing behavior.
  - Evidence: `src/hooks/use-part-shopping-list-memberships.ts:131-220`.

### 5) Algorithms & UI Flows

- Flow: Membership indicator loading lifecycle
  - Steps:
    1. Parent component passes entity identifiers (kit IDs or part keys) into shared hook.
    2. Hook normalizes IDs, dedupes, and issues bulk membership query.
    3. Response maps into summary objects; component renders icon with counts.
    4. Hover reveals tooltip listing memberships with counts/status (kits expose informational content only; no new navigation affordance for pick lists).
  - States / transitions: `useQuery` statuses (loading → success/error); `hasActiveMembership` drives icon visibility; tooltip uses `group-hover`.
  - Hotspots: Avoid re-fetch loops by stabilizing query keys; throttle high-volume lists with memoization.
  - Evidence: `src/hooks/use-part-shopping-list-memberships.ts:96-180`.

- Flow: Kits overview render with indicators
  - Steps:
    1. Kits overview loads summary data; kit IDs fed to indicator component.
    2. Indicators fetch shopping/pick data in parallel (shared hook caches per scope).
    3. Tooltip interactions mirror existing parts behavior (counts/status only, no pick-list deep links), while ensuring `stopPropagation` prevents unintended card navigation.
  - States / transitions: Query caches keyed by kit IDs; tooltip visible on hover/focus.
  - Hotspots: Ensure list loading instrumentation is unaffected by additional fetches.
  - Evidence: `src/components/kits/kit-overview-list.tsx:50-120`.

### 6) Derived State & Invariants

- Derived value: `hasActiveMembership` — drives icon visibility; remains true if at least one membership present.
- Derived value: `activeShoppingCount` vs `completedCount` — ensures tooltips display accurate counts.
- Derived value: `queryKey` deduplicates IDs to avoid redundant network calls.

### 7) State Consistency & Async Coordination

- Source of truth: React Query caches keyed by entity IDs.
- Coordination: Shared hook ensures multiple components requesting same IDs reuse data.
- Async safeguards: Debounce or guard empty ID arrays; return early with empty summaries.

### 8) Errors & Edge Cases

- Error: Backend returns 400 for invalid kit IDs — component should render error icon/tooltip (reuse parts pattern).
- Edge case: Zero memberships — icon hidden; tooltip suppressed.
- Edge case: Hover interactions on archived kits — ensure `stopPropagation` prevents card navigation.

### 9) Observability / Instrumentation

- Signal: `useListLoadingInstrumentation` scopes `kits.list.memberships.shopping` and `kits.list.memberships.pick` fire around the shared hook queries with metadata `{ kitCount, activeCount, membershipCount }`.
- Signal: Parts retain existing `parts.list.shoppingListIndicators` scope; shared hook adds branching to emit the kit scopes in parallel without breaking parts telemetry.
- Evidence: `docs/contribute/ui/data_display.md:23-25` instrumentation requirement; `src/hooks/use-part-shopping-list-memberships.ts:200-272` pattern to mirror.

### 10) Lifecycle & Background Work

- Hook / effect: Shared membership hook
  - Trigger cadence: On mount and whenever ID list changes.
  - Responsibilities: Normalize IDs, fetch memberships, map summaries.
  - Cleanup: Query cache managed via TanStack; no manual teardown required.

### 11) Security & Permissions

_Not applicable_ (membership data is already exposed to authenticated users per existing parts implementation).

### 12) UX / UI Impact

- Entry point: `/kits` overview cards.
- Change: Display consistent hover indicators for shopping and pick list associations with proper iconography.
- User interaction: Hovering reveals panel with counts/status matching existing parts behavior; no new pick-list navigation links are introduced.
- Dependencies: Shared component ensures parity with parts list experience.

### 13) Deterministic Test Plan

- Surface: Kits overview indicators
  - Scenarios:
    - Given kits with shopping list memberships, when instrumentation reports `kits.list.memberships.shopping` ready and the user hovers the indicator, then tooltip lists active lists/counts.
    - Given kits with pick list memberships, when instrumentation reports `kits.list.memberships.pick` ready and the user hovers the pick indicator, then tooltip shows counts/statuses.
    - Given an error response, when instrumentation reports the same scope with `error` metadata, then fallback icon renders and tooltip conveys error copy.
  - Instrumentation / hooks: `waitForListLoading(page, 'kits.list.memberships.shopping', 'ready')`, `waitForListLoading(page, 'kits.list.memberships.pick', 'ready')`, tooltip panel test IDs, `data-testid="kits.overview.card.<id>.activity"`.
  - Gaps: None — scopes and waits defined above.

- Surface: Parts list regression
  - Scenarios:
    - Existing indicator behavior remains unchanged under shared component.
  - Instrumentation / hooks: `waitForListLoading(page, 'parts.list.shoppingListIndicators', 'ready')`, existing selectors for `parts.list.card.shopping-list-indicator`.

### 14) Implementation Slices

- Slice: Shared membership hook & types
  - Goal: Provide reusable data access for parts/kits, including new `useKitShoppingListMemberships` / `useKitPickListMemberships` query hooks and kit summary interfaces.
  - Touches: `src/hooks/use-part-shopping-list-memberships.ts`, new kit membership hook file, `src/types/kits.ts`, shared normalization utilities.

- Slice: Shared indicator component
  - Goal: Extract and generalize UI/tooltip logic.
  - Touches: new component file, update parts list to use it.

- Slice: Kit integration
  - Goal: Render shopping + pick indicators on kit cards using new query hooks and emit kit-specific instrumentation scopes.
  - Touches: `src/components/kits/kit-card.tsx`, `src/components/kits/kit-overview-list.tsx`, instrumentation wiring, tests.

- Slice: Playwright updates
  - Goal: Expand coverage for new indicators and regression-proof parts list.
  - Touches: E2E specs, page objects, factories.

### 15) Risks & Open Questions

- Risk: Bulk queries per render could spike if kit lists are large.
  - Mitigation: Memoize normalized IDs and reuse query results; consider parallelizing requests if necessary.

- Risk: Tooltip interactions on mobile/touch screens may require alternative affordance.
  - Mitigation: Validate existing parts pattern; adjust focus styles if needed.

- Question: Should pick list tooltip include navigation to specific pick list entity?
  - Why it matters: Affects tooltip content and potential deep links.
  - Answer: No — mirrors existing shopping list tooltip; pick list tooltips remain informational only per product guidance.
  - Owner / follow-up: Product/UX stakeholder (confirmed).

### 16) Confidence

Confidence: Medium — patterns are established from parts, but dual-indicator support for kits introduces new API usage that needs careful caching and tooltip UX validation.*** End Patch
