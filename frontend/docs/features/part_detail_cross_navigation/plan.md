# Part Detail Cross Navigation — Frontend Plan

### 0) Research Log & Findings
- Reviewed `PartDetails` header/actions and existing instrumentation hooks to anchor the new indicator (src/components/parts/part-details.tsx:145, src/components/parts/part-details.tsx:673).
- Studied shared `MembershipIndicator` and its tooltip behaviors for consistency (src/components/common/membership-indicator.tsx:22, src/components/parts/part-list.tsx:433, src/components/kits/kit-card.tsx:110).
- Confirmed generated TanStack Query hook and schema for part kit usage (src/lib/api/generated/hooks.ts:1513, src/lib/api/generated/types.ts:5195).
- Validated `KitReservationEntry` mapping utilities to repurpose for tooltip rows (src/types/kits.ts:130, src/types/kits.ts:413).
- Checked kit detail route params/search handling for navigation targets (src/routes/kits/$kitId/index.tsx:10).
- Reviewed Playwright page objects/helpers that already wait on parts detail instrumentation (tests/support/page-objects/parts-page.ts:124, tests/e2e/shopping-lists/parts-entrypoints.spec.ts:52).
- Re-read architecture and testing guides for React + TanStack conventions and instrumentation policies (docs/contribute/architecture/application_overview.md:1, docs/contribute/testing/playwright_developer_guide.md:1).

### 1) Intent & Scope

**User intent**

Expose kit usage context directly on the part detail header so planners can see active consumers and jump to kit detail without leaving the page.

**Prompt quotes**

"Surface kit usage context on the part detail page so planners can trace where a part is consumed and jump to the relevant kits."  
"Add a \"Used in Kits\" icon alongside existing part detail affordances, showing tooltip with active kits using the part."

**In scope**

- Fetch and display kit usage for a part inside `PartDetails`, reusing generated API hooks and instrumentation patterns.
- Render a MembershipIndicator-style control with a non-interactive tooltip summarizing consuming kits.
- Render inline kit navigation chips (using the existing `KitLinkChip` pattern) inside the `PartDetails` header actions row so users can jump straight to kit detail pages from the header.
- Emit deterministic `useListLoadingInstrumentation` events and expose `data-testid`s for Playwright.
- Add Playwright coverage that validates tooltip content and cross-navigation against the real backend.

**Out of scope**

- Backend API or schema changes (plan assumes `/api/parts/{part_key}/kits` already ships per epic).
- Updates to kit detail UI beyond ensuring navigation lands correctly.
- Surfacing kit usage on other surfaces (e.g., parts list, shopping dialogs).

**Assumptions / constraints**

`GET /parts/{part_key}/kits` returns only active kits with fields documented in the epic. Part detail fetch establishes permissions, and all tests run against the real backend per `docs/contribute/testing/index.md`. Navigation can always land on the default kit detail view without preserving overview filters. Tooltip UX only needs to handle current kit volumes; high-count ergonomics are intentionally deferred.

### 2) Affected Areas & File Map

- Area: src/components/parts/part-details.tsx
  - Why: Add the indicator in the header actions area, coordinate query enabling, and wire new instrumentation/test ids.
  - Evidence: src/components/parts/part-details.tsx:145, src/components/parts/part-details.tsx:673
- Area: src/components/parts/part-kit-usage-indicator.tsx (new)
  - Why: Encapsulate indicator UI, tooltip rendering, and render consuming-kit link chips using shared indicator patterns.
  - Evidence: src/components/common/membership-indicator.tsx:22, src/components/parts/part-list.tsx:433
- Area: src/hooks/use-part-kit-usage.ts (new)
  - Why: Wrap `useGetPartsKitsByPartKey` with camelCase mapping, memoized summaries, and instrumentation helpers.
  - Evidence: src/lib/api/generated/hooks.ts:1513, src/types/kits.ts:130
- Area: src/types/kits.ts
  - Why: Export/extend mapping utilities so the new hook can reuse reservation normalization without duplication.
  - Evidence: src/types/kits.ts:413
- Area: tests/support/page-objects/parts-page.ts
  - Why: Add indicator, tooltip, and chip locators plus helper actions for deterministic Playwright assertions.
  - Evidence: tests/support/page-objects/parts-page.ts:124
- Area: tests/e2e/parts/part-cross-navigation.spec.ts (new)
  - Why: Cover tooltip rendering and navigation to kits using real backend fixtures and instrumentation waits.
  - Evidence: tests/e2e/shopping-lists/parts-entrypoints.spec.ts:52

### 3) Data Model / Contracts

- Entity / contract: PartKitUsage
  - Shape: `{ kitId: number; kitName: string; status: KitStatus; requiredPerUnit: number; reservedQuantity: number; buildTarget: number; updatedAt: string }`
  - Mapping: Adapt snake_case payload via `mapKitReservation`, clamping counts to non-negative values.
  - Evidence: src/lib/api/generated/types.ts:5195, src/types/kits.ts:130, src/types/kits.ts:413
- Entity / contract: KitUsageSummary
  - Shape: `{ kits: PartKitUsage[]; totalReserved: number; activeCount: number; hasKits: boolean }`
  - Mapping: Reduce mapped usages similar to shopping-list summaries to calculate totals/flags.
  - Evidence: src/hooks/use-part-shopping-list-memberships.ts:223, src/types/kits.ts:336

### 4) API / Integration Surface

- Surface: GET /api/parts/{part_key}/kits → `useGetPartsKitsByPartKey`
- Inputs: `{ path: { part_key: partId } }`, `enabled: Boolean(partId)` with conservative `staleTime` to avoid redundant fetches.
- Outputs: Array of PartKitUsage items; hook exposes sorted entries and summary stats for UI/instrumentation.
- Errors: Propagate `ApiError` to render retry affordance; rely on generated client error typing for messages.
- Evidence: src/lib/api/generated/hooks.ts:1513

### 5) Algorithms & UI Flows

- Flow: Used-in-kits indicator lifecycle
  - Steps:
    1. `PartDetails` renders the indicator when part detail query returns a valid `partId`.
    2. Indicator hook fetches kit usage, emitting `parts.detail.kitUsage` events for loading/error/ready.
    3. Pending state shows spinner; success state memoizes kit rows, totals, and tooltip ordering.
    4. Tooltip rows display kit name, reserved quantity, and build target as read-only context (no interactive controls).
    5. Adjacent `KitLinkChip` instances render for each consumer, enabling navigation to `/kits/$kitId`.
  - States / transitions: Query `pending → success|error`, tooltip open/close, navigation triggered by chip `Link`s.
  - Hotspots: Prevent resort churn via memoization, cap tooltip height with scroll, share query cache across hovers, and wrap chip list for overflow.
  - Evidence: src/components/parts/part-details.tsx:145, src/components/common/membership-indicator.tsx:22, src/routes/kits/$kitId/index.tsx:10

### 6) Derived State & Invariants

- Derived value: `hasKitUsage`
  - Source: `summary.activeCount > 0`
  - Writes / cleanup: Controls rendering of indicator.
  - Guards: Expose only when query status is `success`.
  - Invariant: Indicator stays hidden for zero active kits, matching epic requirements.
  - Evidence: src/components/common/membership-indicator.tsx:65
- Derived value: `sortedKits`
  - Source: Sort by `reservedQuantity` desc, `updatedAt` desc.
  - Writes / cleanup: Provides stable tooltip ordering for deterministic tests.
  - Guards: Memoized on `partId` + raw list to avoid re-sorting on hover.
  - Invariant: Order remains consistent between renders for the same data set.
  - Evidence: src/hooks/use-part-shopping-list-memberships.ts:223
- Derived value: `kitLinkItems`
  - Source: Map `sortedKits` into chip models `{ kitId, kitName, status }`.
  - Writes / cleanup: Drives `KitLinkChip` props rendered alongside the indicator.
  - Guards: Hidden when `hasKitUsage` is false to avoid empty chip groups.
  - Invariant: Chip list mirrors tooltip content and keeps aria-labels aligned with kit metadata.
  - Evidence: src/components/kits/kit-link-chip.tsx:25
- Derived value: `usageTotals`
  - Source: Reduce reserved quantities/build targets across entries.
  - Writes / cleanup: Display optional tooltip header summary.
  - Guards: Defaults to zero when query errors or returns empty.
  - Invariant: Sum matches per-row reserved values to avoid user confusion.
  - Evidence: src/types/kits.ts:336

### 7) State Consistency & Async Coordination

- Source of truth: TanStack Query cache `['getPartsKitsByPartKey', { path: { part_key: partId } }]`.
- Coordination: Indicator component consumes summary state; `PartDetails` toggles presence via query enablement.
- Async safeguards: `enabled` gate prevents fetch before `partId` resolves; TanStack cancels in-flight requests on param change/unmount.
- Instrumentation: `useListLoadingInstrumentation` scope `parts.detail.kitUsage` parallels existing `parts.detail` scopes for deterministic Playwright waits.
- Evidence: src/components/parts/part-details.tsx:145, src/lib/api/generated/hooks.ts:1513

### 8) Errors & Edge Cases

- Failure: Kit usage query fails
  - Surface: Indicator button
  - Handling: Show error state (alert icon + retry) mirroring shopping list membership behavior.
  - Guardrails: Reset summary to empty to avoid stale rows.
  - Evidence: src/components/parts/part-details.tsx:176
- Failure: No active kits
  - Surface: Part header
  - Handling: Do not render indicator; ensure layout spacing is unaffected.
  - Guardrails: `hasKitUsage` derived check.
  - Evidence: src/components/common/membership-indicator.tsx:65
- Failure: Large kit list overflows tooltip
  - Surface: Tooltip panel
  - Handling: Constrain height with scroll and allow keyboard focus management via existing indicator structure.
  - Guardrails: Reuse `MembershipIndicator` markup to keep accessibility intact.
  - Evidence: src/components/common/membership-indicator.tsx:97

### 9) Observability / Instrumentation

- Signal: `parts.detail.kitUsage`
  - Type: `useListLoadingInstrumentation` test event
  - Trigger: Indicator hook loading/error/ready transitions
  - Labels / fields: `{ partKey, kitCount, activeCount }`
  - Consumer: `waitForListLoading` Playwright helper for tooltip assertions and chip-driven navigation waits
  - Evidence: src/components/parts/part-details.tsx:145
- Signal: `data-testid="parts.detail.kit-usage.indicator"`
  - Type: DOM selector
  - Trigger: Rendered when usage exists
  - Labels / fields: Row ids `parts.detail.kit-usage.kit.<kitId>`
  - Consumer: Playwright tooltip assertions
  - Evidence: src/components/parts/part-list.tsx:433
- Signal: `data-testid="parts.detail.kit-usage.chips"`
  - Type: DOM selector
  - Trigger: Chip group rendering active when usage exists
  - Labels / fields: Chip ids `parts.detail.kit-usage.chip.<kitId>`
  - Consumer: Playwright navigation assertions via `KitLinkChip`
  - Evidence: src/components/kits/kit-link-chip.tsx:25

### 10) Lifecycle & Background Work

- Hook / effect: `useGetPartsKitsByPartKey`
  - Trigger cadence: On mount and when `partId` changes
  - Responsibilities: Fetch kit usage, populate cache, drive indicator state
  - Cleanup: TanStack aborts pending fetches automatically
  - Evidence: src/lib/api/generated/hooks.ts:1513

### 11) Security & Permissions

- Concern: Surface data aligns with part detail permissions
- Touchpoints: Indicator renders only after part detail succeeds (existing guards)
- Mitigation: No additional sensitive data exposed; hides when part fetch errors
- Residual risk: None specific to this slice
- Evidence: src/components/parts/part-details.tsx:365

### 12) UX / UI Impact

- Entry point: `/parts/$partId`
- Change: Adds compact “Used in Kits” indicator alongside header actions with a read-only tooltip plus link chips that mirror `KitLinkChip` styling for navigation.
- User interaction: Hover/focus reveals tooltip; activating a chip navigates to `/kits/$kitId` with query-backed loading states.
- Dependencies: Generated API hook, TanStack Router navigation, tooltip styling parity, `KitLinkChip`
- Evidence: src/components/parts/part-details.tsx:673

### 13) Deterministic Test Plan

- Surface: Part detail kit usage indicator
  - Scenarios:
    - Given factories create a part plus two consuming kits (`testData.parts.create`, `testData.kits.createWithContents`), when the detail view loads, then the indicator appears, the tooltip lists each kit with reserved counts, and activating a `KitLinkChip` navigates to its detail view after waiting for `waitForListLoading(page, 'kits.detail', 'ready')`.
    - Given a part with no consuming kits (`testData.parts.create` only), when the detail view loads, then the indicator and chip group stay hidden while other header actions remain accessible.
  - Instrumentation / hooks: `waitForListLoading(page, 'parts.detail.kitUsage', phase)`, `waitForListLoading(page, 'kits.detail', phase)`, `data-testid="parts.detail.kit-usage.indicator"`, chip ids `parts.detail.kit-usage.chip.<kitId>`.
  - Notes: Error state assertions are out of scope per stakeholder guidance; UI still surfaces the fallback for manual QA.
  - Evidence: tests/e2e/shopping-lists/parts-entrypoints.spec.ts:52, tests/api/factories/kit-factory.ts:28

### 14) Implementation Slices

- Slice: Hook & mapping foundation
  - Goal: Map API payloads into domain-friendly `PartKitUsage` summaries with instrumentation metadata.
  - Touches: src/hooks/use-part-kit-usage.ts, src/types/kits.ts
  - Dependencies: Generated hooks/types already present.
- Slice: UI integration
  - Goal: Render indicator in `PartDetails`, wire the non-interactive tooltip, and surface `KitLinkChip` instances with instrumentation-ready `data-testid`s.
  - Touches: src/components/parts/part-details.tsx, src/components/parts/part-kit-usage-indicator.tsx
  - Dependencies: Hook foundation complete.
- Slice: Playwright coverage
  - Goal: Validate tooltip rendering and navigation with real backend fixtures.
  - Touches: tests/e2e/parts/part-cross-navigation.spec.ts, tests/support/page-objects/parts-page.ts
  - Dependencies: UI slice merged and instrumentation available.

### 15) Risks & Open Questions

- Risk: Duplicate kit names hinder identification.
  - Impact: Users may click wrong kit.
  - Mitigation: Display kit id/build target in metadata; consider unique naming guidance later.
- Risk: Additional fetch even when `used_in_kits` hint is false.
  - Impact: Minor performance overhead.
  - Mitigation: Respect `used_in_kits` boolean (if exposed) to skip query; fall back to indicator absence.

- Open questions: None; preserving kits overview filters is explicitly not required.

### 16) Confidence

Confidence: Medium — Patterns and endpoints exist, but tooltip ergonomics need validation with real kit counts.
