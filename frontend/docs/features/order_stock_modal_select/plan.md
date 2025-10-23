### 0) Research Log & Findings
- Validated that `AddToShoppingListDialog` derives shopping lists from `useShoppingListsOverview`, filters to the current status set (concept today), and renders inline creation fields behind a checkbox toggle we will remove (`src/components/shopping-lists/part/add-to-shopping-list-dialog.tsx:57`, `src/components/shopping-lists/part/add-to-shopping-list-dialog.tsx:375`).
- Reviewed `SearchableSelect` to confirm focus, keyboard, and inline creation affordances we can reuse for the modal revamp (`src/components/ui/searchable-select.tsx:16`).
- Studied `SellerSelector` for query filtering, `useListLoadingInstrumentation`, and inline creation patterns that match the requested searchable select behavior (`src/components/sellers/seller-selector.tsx:24`, `src/components/sellers/seller-selector.tsx:99`).
- Re-read the existing concept list creation dialog to ensure we can surface it inline and capture success through `onCreated` callbacks (`src/components/shopping-lists/list-create-dialog.tsx:23`).
- Audited current Playwright coverage and page objects referencing the dropdown to size the test updates (`tests/e2e/shopping-lists/parts-entrypoints.spec.ts:1`, `tests/support/page-objects/parts-page.ts:324`).
- Revisited instrumentation guidance to anchor the plan on documented telemetry expectations (`docs/contribute/testing/playwright_developer_guide.md:10`, `docs/contribute/architecture/test_instrumentation.md:22`).
- Confirmed backend query schema accepts `status` filters but no `search` parameter, so client-side filtering is required (`../backend/app/schemas/shopping_list.py:120-144`).

### 1) Intent & Scope (1–3 short paragraphs)

**User intent**

Refactor the Order Stock modal into a reusable shopping list selector with configurable status filters (e.g., concept-only) and optional inline creation so kits can consume the same component without duplicating effort.

**Prompt quotes**

"Order Stock modal searchable select"

**In scope**

- Replace the modal’s native dropdown with the existing searchable select pattern, including search term, option counts, and keyboard navigation.
- Remove the inline list creation form from the Order Stock dialog and launch the existing `ListCreateDialog` via a “Create list” affordance that only appears when concept lists are allowed; ensure the created list is auto-selected.
- Expose deterministic instrumentation and Playwright updates so the shared component can power future kit flows.

**Out of scope**

- Kit-specific UI wiring or routing (modal remains owned by the parts feature).
- Backend contract changes; rely on existing `GET/POST` shopping list endpoints.
- Reworking seller selection or other unrelated modal fields.

**Assumptions / constraints**

Shared selector will load shopping lists via `GET /shopping-lists` with `status[]=<allowed>` derived from props (Order Stock passes `['concept']`); backend omits free-text search, so filtering happens client-side. Playwright specs must continue to hit the real backend per testing policy. No feature flag is required—the revamp ships in one slice.

### 2) Affected Areas & File Map (with repository evidence)

- Area: src/components/shopping-lists/part/add-to-shopping-list-dialog.tsx
- Why: Swap dropdown for searchable select, remove inline creation fields, coordinate new selector component, and keep instrumentation intact.
- Evidence: src/components/shopping-lists/part/add-to-shopping-list-dialog.tsx:57

- Area: src/components/shopping-lists/shopping-list-selector.tsx (new)
- Why: Encapsulate the reusable searchable select with configurable status filters and optional inline creation, exposing instrumentation props so consumers can opt into deterministic waits.
- Evidence: docs/epics/kits_feature_breakdown.md:173

- Area: src/hooks/use-shopping-lists.ts
- Why: Provide a shopping-list search hook backed by `useGetShoppingLists` that accepts status filters and instrumentation metadata.
- Evidence: src/hooks/use-shopping-lists.ts:622

- Area: src/components/ui/searchable-select.tsx
- Why: Ensure props cover needed hooks (e.g., wheel capture, disabled states) and document inline creation behavior for shopping lists.
- Evidence: src/components/ui/searchable-select.tsx:16

- Area: src/components/shopping-lists/list-create-dialog.tsx
- Why: Reuse for inline creation and add `initialName` / optional `initialDescription` props so typed values flow from the selector into the dialog.
- Evidence: src/components/shopping-lists/list-create-dialog.tsx:23

- Area: tests/support/page-objects/parts-page.ts
- Why: Update helper APIs to operate on the searchable select rather than `<select>` and expose inline creation helpers.
- Evidence: tests/support/page-objects/parts-page.ts:324

- Area: tests/support/page-objects/seller-selector-harness.ts
- Why: Mirror harness patterns (search, select, inline creation) when adding a shopping list selector harness.
- Evidence: tests/support/page-objects/seller-selector-harness.ts:1

- Area: tests/api/factories/shopping-list-factory.ts
- Why: Add an `expectConceptMembership` helper so Playwright specs can assert backend state after inline creation.
- Evidence: tests/api/factories/shopping-list-factory.ts:1

- Area: tests/e2e/shopping-lists/parts-entrypoints.spec.ts
- Why: Adjust scenarios to drive the searchable select, wait on new instrumentation, and cover inline creation.
- Evidence: tests/e2e/shopping-lists/parts-entrypoints.spec.ts:1

- Area: src/lib/test/query-instrumentation.ts
- Why: Reuse `useListLoadingInstrumentation` when supplied via props; ensure metadata builders accept consumer overrides.
- Evidence: src/lib/test/query-instrumentation.ts:200

### 3) Data Model / Contracts

- Entity / contract: ShoppingListOption
- Shape: `{ id: number; name: string; status: ShoppingListStatus; lineCounts: { new: number; ordered: number; done: number } }` trimmed from `ShoppingListOverviewSummary`.
- Mapping: Map `shopping_list` payloads to camelCase via existing overview mapper; selector filters client-side by search term and status allowlist before deriving labels.
- Evidence: src/types/shopping-lists.ts:16

- Entity / contract: OrderStockFormState
- Shape: `{ selectedListId: number | null }` plus existing quantity/note fields; no embedded name/description inputs after removal.
- Mapping: `useFormState` holds the selected shopping list identifier as a string; convert to number before mutation.
- Evidence: src/components/shopping-lists/part/add-to-shopping-list-dialog.tsx:73

- Entity / contract: ShoppingListCreateResult
- Shape: `{ id: number; name: string }` emitted from `ListCreateDialog` on success.
- Mapping: Inline selector consumes result to set both React Query cache (via invalidation) and `SearchableSelect` value + search term; dialog accepts `initialName` / `initialDescription` props to preserve the user’s typed values.
- Evidence: src/components/shopping-lists/list-create-dialog.tsx:23

- Entity / contract: ShoppingListSelectorProps (new component API)
- Shape: `{ value?: number; onChange(listId: number | undefined): void; statuses: ShoppingListStatus[]; enableCreate?: boolean; enabled?: boolean; instrumentation?: { scope: string; getReadyMetadata?: () => Record<string, unknown>; getErrorMetadata?: (error: unknown) => Record<string, unknown>; getAbortedMetadata?: () => Record<string, unknown> } }`.
- Mapping: Consumers (Order Stock, future kits) pass desired statuses (e.g., `['concept']`), drive the `enabled` flag from their own open state, and supply the instrumentation scope for `list_loading`; selector internally wires overrides into hooks and `SearchableSelect`.
- Evidence: src/components/types/type-selector.tsx:12, src/components/sellers/seller-selector.tsx:24

### 4) API / Integration Surface

- Surface: GET /shopping-lists (`useGetShoppingLists`)
- Inputs: `query: { status: allowedStatuses }` (default `['concept']`; no backend search parameter available).
- Outputs: Array of `ShoppingListListSchema` mapped to selector options; cache keyed solely by status filters.
- Errors: Surfaces to toast + inline message; emits list_loading `error` metadata for selector.
- Evidence: src/hooks/use-shopping-lists.ts:622

- Surface: POST /shopping-lists (`useCreateShoppingListMutation`)
- Inputs: `{ name, description? }` from inline creation dialog.
- Outputs: Created shopping list object (concept today); triggers cache invalidation for overview + detail queries.
- Errors: `ApiError` surfaces via toast and instrumentation; inline dialog shows validation errors.
- Evidence: src/hooks/use-shopping-lists.ts:810

- Surface: POST /parts/{part_key}/shopping-list-memberships (`useCreateShoppingListLineMutation`)
- Inputs: `{ listId, partKey, needed, sellerId?, note? }` once selector resolves list ID.
- Outputs: Mutation success triggers membership invalidation and closes modal.
- Errors: 409 conflicts flagged for duplicates; `trackFormValidationError` handles instrumentation.
- Evidence: src/hooks/use-shopping-lists.ts:925

### 5) Algorithms & UI Flows (step-by-step)

- Flow: Load searchable shopping list options
  - Steps:
    1. `ShoppingListSelector` calls `useShoppingListOptions({ statuses, enabled })`, wrapping `useGetShoppingLists({ query: { status: statuses } }, { enabled })` so requests only fire while the dialog is open.
    2. Memo-filter the returned lists by the selector’s `searchTerm`, mirroring the `TypeSelector` pattern, and drop any statuses not in the allowlist.
    3. Hydrate `SearchableSelect` with filtered options; keep `searchTerm` in sync with selection and emit instrumentation metadata via the consumer-supplied scope.
  - States / transitions: Query `status` (`loading` → `success`/`error`), local `searchTerm`, consumer-provided `enabled` flag controlling fetches.
  - Hotspots: Avoid unnecessary recompute by memoizing filter; propagate `isLoading`/`error` states so inline creation affordance stays responsive even when disabled.
- Evidence: src/components/types/type-selector.tsx:24

- Flow: Shopping list creation modal (concept-only today)
- Steps:
  1. User triggers the selector’s “Create list” affordance (only rendered when `statuses` includes `'concept'` and `enableCreate` prop is true); selector opens `ListCreateDialog`, passing the current search term via `initialName` (and optional `initialDescription` when we support prefilling notes).
  2. Dialog submits via `useCreateShoppingListMutation`, invalidating caches on success.
  3. Selector receives `onCreated`, refreshes options, and selects the returned list ID.
- States / transitions: Track dialog open state separately; selector stays mounted while modal is open.
- Hotspots: Ensure selector waits for refetch before selecting; guard against race where dialog closes before query completes.
- Evidence: src/components/shopping-lists/list-create-dialog.tsx:63

- Flow: Submit Order Stock form
- Steps:
  1. Form validation ensures an allowed shopping list is selected before submit (no secondary name/description fields remain).
  2. On submit, call `trackSubmit`, run `useCreateShoppingListLineMutation` with the selected list ID.
  3. On success, track success, fire toast, invalidate memberships, and close modal.
- States / transitions: Form busy state derived from mutation statuses and selector loading state.
- Hotspots: Prevent submit while selector is refetching or list ID missing; maintain `conflictError` for 409 path.
- Evidence: src/components/shopping-lists/part/add-to-shopping-list-dialog.tsx:140

### 6) Derived State & Invariants

- Derived value: `shoppingListOptions`
  - Source: React Query shopping list data filtered client-side within the selector.
  - Writes / cleanup: Drives `SearchableSelect` options; resets when modal closes.
  - Guards: Normalize casing for comparisons; fallback to empty array if query errors.
  - Invariant: Option list reflects the shopping lists returned for the current query response filtered by search term and allowed statuses.
  - Evidence: src/components/types/type-selector.tsx:24

- Derived value: `createDialogOpen`
  - Source: Local state toggled by selector “Create list” action.
  - Writes / cleanup: Controls mounting of `ListCreateDialog`; resets to false on dialog close.
  - Guards: Only open when selector is enabled; disable action while options are loading.
  - Invariant: Creation dialog and Order Stock form never collect the same fields simultaneously.
- Evidence: src/components/sellers/seller-selector.tsx:57

- Derived value: `instrumentationSnapshot`
  - Source: `snapshotFields` memo capturing selected list ID, needed quantity, seller override, and part key.
  - Writes / cleanup: Feeds `trackSubmit/Success/Error` and validation telemetry.
  - Guards: Recomputed on dependency change; ensure list ID parses to number before emission.
  - Invariant: Snapshot fields always mirror the mutation payload so Playwright waits stay deterministic.
- Evidence: src/components/shopping-lists/part/add-to-shopping-list-dialog.tsx:192

### 7) State Consistency & Async Coordination

- Source of truth: Shopping list options live in a dedicated React Query cache keyed by allowed statuses; form state lives in `useFormState`.
- Coordination: Selector hook updates the selected list ID via `onChange`; creation dialog success handler writes the new ID back into form state.
  - Async safeguards: The selector accepts an `enabled` flag derived from the modal’s `open` state so `useGetShoppingLists` sleeps until the dialog is visible; client-side filtering avoids extra backend churn.
  - Instrumentation: Forward optional `list_loading` scope + metadata props to the selector; keep form `track*` events for submission aligned with documented testing hooks.
- Evidence: src/components/shopping-lists/part/add-to-shopping-list-dialog.tsx:226

### 8) Errors & Edge Cases

- Failure: Shopping list fetch fails
- Surface: Order Stock modal selector empty state
- Handling: Surface “Failed to load shopping lists” inline messaging (update copy) and keep create-new path available when permitted.
- Guardrails: `list_loading` `error` event plus toast via selector hook if needed.
- Evidence: src/components/shopping-lists/part/add-to-shopping-list-dialog.tsx:369

- Failure: Duplicate membership (409)
- Surface: Submit handler catch block
- Handling: Display conflict banner + toast and leave modal open for re-selection.
- Guardrails: `trackValidationError('listId', ...)` ensures tests observe validation event.
- Evidence: src/components/shopping-lists/part/add-to-shopping-list-dialog.tsx:176

- Failure: Shopping list creation modal validation (concept path)
- Surface: `ListCreateDialog` fields
- Handling: Dialog shows validation copy for name/description limits and blocks submit until resolved.
- Guardrails: Form instrumentation tracks validation, preventing invalid API calls.
- Evidence: src/components/shopping-lists/list-create-dialog.tsx:47

### 9) Observability / Instrumentation

- Signal: `form` events (`ShoppingListMembership:addFromPart`)
- Type: instrumentation event
- Trigger: Dialog open/submit/success/error via `useFormInstrumentation`.
- Labels / fields: Include mode, partKey, listId in snapshot metadata.
- Consumer: Playwright `waitTestEvent` helper.
- Evidence: src/components/shopping-lists/part/add-to-shopping-list-dialog.tsx:200

- Signal: `list_loading` (scope supplied by each consumer via selector props)
  - Type: instrumentation event
  - Trigger: Selector wiring forwards the required scope and optional metadata builders into `useListLoadingInstrumentation`.
  - Labels / fields: Include `optionCount`, `searchTerm`, and consumer-provided tags for ready metadata.
  - Consumer: Playwright `waitForListLoading`.
  - Evidence: src/lib/test/query-instrumentation.ts:200

- Signal: `form` events (`ShoppingListCreate:concept`)
- Type: instrumentation event
- Trigger: Inline create dialog open/submit/success.
- Labels / fields: Name, description snapshot.
- Consumer: Playwright harness for inline creation flow.
- Evidence: src/components/shopping-lists/list-create-dialog.tsx:63

### 10) Lifecycle & Background Work

- Hook / effect: Modal initialization effect
- Trigger cadence: Runs on dialog open.
- Responsibilities: Reset form state, seed selected list ID when options exist, clear conflict errors.
- Cleanup: Resets form values and conflict state on close.
- Evidence: src/components/shopping-lists/part/add-to-shopping-list-dialog.tsx:226

- Hook / effect: Search term synchronization inside `SearchableSelect`
- Trigger cadence: Runs when `value` or `searchTerm` changes.
- Responsibilities: Keep displayed label aligned with selected option.
- Cleanup: Resets search term when option cleared.
- Evidence: src/components/ui/searchable-select.tsx:176

- Hook / effect: Selector instrumentation
- Trigger cadence: Executes when query loading state flips.
- Responsibilities: Emit `list_loading` ready/error events with metadata.
- Cleanup: Aborts outstanding instrumentation state on unmount.
- Evidence: src/components/sellers/seller-selector.tsx:99

### 11) Security & Permissions (if applicable)

Not applicable — dialogs reuse authenticated user flows and server-side authorization already guards shopping list operations.

### 12) UX / UI Impact (if applicable)

- Entry point: Part detail Order Stock dialog
- Change: Replace dropdown with searchable select + inline creation affordance.
- User interaction: Users can search allowed shopping lists (concept by default), optionally create a new concept list inline, and see option counts before submitting.
- Dependencies: Requires new selector component, status-filtered query hook, and instrumentation.
- Evidence: src/components/shopping-lists/part/add-to-shopping-list-dialog.tsx:351

### 13) Deterministic Test Plan (new/changed behavior only)

- Surface: Part detail Order Stock modal (existing list path)
  - Scenarios:
    - Given shopping lists with allowed statuses (concept) exist, When the user searches and selects an existing list, Then the selection remains after closing and submitting adds the part.
    - Given a duplicate membership on one of the allowed lists, When the user selects the same list and submits, Then a conflict banner appears and instrumentation emits validation events.
  - Instrumentation / hooks: Order Stock passes `instrumentation.scope = 'parts.orderStock.lists'` into the selector so Playwright can `waitForListLoading(page, 'parts.orderStock.lists', 'ready')`; reuse existing `waitTestEvent` for `ShoppingListMembership:addFromPart`.
  - Backend hooks: `testData.parts.create` for the subject part, `testData.sellers.create` for override coverage, and `testData.shoppingLists.createWithLines` to seed concept lists + duplicate memberships.
  - Gaps: None — all scenarios will be updated.
- Evidence: tests/e2e/shopping-lists/parts-entrypoints.spec.ts:18

- Surface: Inline list creation within selector (concept path)
  - Scenarios:
    - Given no matching list, When the user triggers inline creation and completes the dialog, Then the new concept list appears selected and submit succeeds.
    - Given validation errors, When the user submits empty name, Then inline dialog shows validation copy and tests capture validation event.
  - Instrumentation / hooks: `waitTestEvent` for `ShoppingListCreate:concept`, `waitForListLoading` using the selector scope for the refetch.
  - Backend hooks: `testData.parts.create` to provision the source part and the new `testData.shoppingLists.expectConceptMembership` helper to assert the created membership after submit.
  - Gaps: None.
- Evidence: tests/support/page-objects/seller-selector-harness.ts:34

### 14) Implementation Slices (only if large)

- Slice: Selector hook & instrumentation
  - Goal: Introduce reusable shopping list selector with status filtering, client-side search, and a required instrumentation scope so consumers own their `list_loading` namespace.
  - Touches: `src/hooks/use-shopping-lists.ts`, new selector component, tests harness.
- Dependencies: None.

- Slice: Modal integration & inline creation wiring
 - Goal: Replace dropdown, embed selector configured with `statuses=['concept']` and `instrumentation.scope='parts.orderStock.lists'`, preserve the user-entered search term by passing `initialName`/`initialDescription` into `ListCreateDialog`, and retire legacy inline fields.
 - Touches: `add-to-shopping-list-dialog`, `list-create-dialog`, instrumentation metadata.
- Dependencies: Selector slice merged.

- Slice: Playwright coverage
- Goal: Update page objects/specs to drive new UI and assert instrumentation.
- Touches: Page objects, new harness, `parts-entrypoints.spec`, `tests/api/factories/shopping-list-factory.ts` (helper export).
- Dependencies: UI slices completed.

### 15) Risks & Open Questions

- Risk: Large shopping list catalogs could cause slow option filtering.
- Impact: Client-side filtering may lag once allowed shopping lists scale because we fetch the full dataset.
- Mitigation: Track list growth and plan backend-driven search/pagination once thresholds are met; keep filter logic isolated for easy swap.

- Risk: Newly created list may not appear in selector before submit.
- Impact: User stuck with stale options and cannot select.
- Mitigation: Await React Query refetch completion before auto-selecting; fallback to manual selection.

- Risk: Test timing flakiness if instrumentation scope mismatched.
- Impact: Playwright waits hang or race with UI.
- Mitigation: Enforce a required `scope` prop on the selector so each consumer specifies its namespace (Order Stock uses `parts.orderStock.lists`), updating helpers simultaneously.

- Question: When shopping list volume grows beyond client-side comfort, what backend search/pagination contract should replace the current filter?
- Why it matters: Prepares for future performance work without repainting the selector API.
- Owner / follow-up: Document thresholds with the shopping list API owner and schedule a backend schema extension if needed.

### 16) Confidence (one line)

Confidence: Medium — UI patterns and instrumentation are familiar, but coordinating new selector sharing and inline creation timing needs careful validation.
