### 1) Summary & Decision
**Readiness**
The plan maps the component extraction, hook layering, and instrumentation touchpoints in detail (“Encapsulate the reusable searchable select with configurable status filters…” `docs/features/order_stock_modal_select/plan.md:42-44`, “Surface deterministic instrumentation…” `docs/features/order_stock_modal_select/plan.md:22-24`, `docs/features/order_stock_modal_select/plan.md:205-207`). However, three blockers remain: Playwright coverage references a non-existent helper (`testData.shoppingLists.expectConceptMembership`) (`docs/features/order_stock_modal_select/plan.md:262-268`), the shared selector hardcodes a parts-specific `list_loading` scope despite aiming for reuse (`docs/features/order_stock_modal_select/plan.md:205`, `docs/features/order_stock_modal_select/plan.md:300`), and the create-list flow would drop the user’s typed name because `ListCreateDialog` lacks any `initialName` prop (`docs/features/order_stock_modal_select/plan.md:22-24`, `docs/features/order_stock_modal_select/plan.md:129-134`; `src/components/shopping-lists/list-create-dialog.tsx:13-20`).

**Decision**
`GO-WITH-CONDITIONS` — resolve instrumentation scope ownership, add the missing deterministic test helper (or adjust coverage), and preserve the inline-create prefill UX before implementation proceeds.

### 2) Conformance & Fit (with evidence)
**Conformance to refs**
- `docs/contribute/testing/playwright_developer_guide.md` — Fail — `docs/features/order_stock_modal_select/plan.md:262-268` — “Backend hooks… `testData.shoppingLists.expectConceptMembership`… Gaps: None.” (Plan depends on an undefined helper, so deterministic backend assertions are not actually satisfied.)
- `docs/contribute/architecture/application_overview.md` — Pass — `docs/features/order_stock_modal_select/plan.md:42-55` — “Encapsulate the reusable searchable select… Provide a shopping-list search hook backed by `useGetShoppingLists`…” (Aligns with the documented pattern of domain components wrapping generated API hooks.)

**Fit with codebase**
- `src/components/ui/searchable-select.tsx` — `docs/features/order_stock_modal_select/plan.md:50-52` — “Ensure props cover needed hooks (e.g., wheel capture, disabled states)…” (Extends the existing shared control rather than inventing a new widget.)
- `src/components/shopping-lists/list-create-dialog.tsx` — `docs/features/order_stock_modal_select/plan.md:22-24` — Reusing the dialog without adding `initialName` support conflicts with the existing inline-create pattern that mirrors `SellerCreateDialog` (`src/components/shopping-lists/list-create-dialog.tsx:13-20` exposes only `open`, `onOpenChange`, `onCreated`).

### 3) Open Questions & Ambiguities
- Question: How will the selector gate fetches “behind `open` state” when no `open` prop is defined on `ShoppingListSelector`? (`docs/features/order_stock_modal_select/plan.md:170-173`)
  Why it matters: Without clarity, the query may fire unnecessarily or, worse, fail to refetch when the dialog opens.
  Needed answer: Specify whether the component receives `open`, is conditionally rendered, or uses another mechanism to control `enabled`.
- Question: What instrumentation scope should non-parts consumers use once the selector is shared? (`docs/features/order_stock_modal_select/plan.md:205`, `docs/features/order_stock_modal_select/plan.md:300`)
  Why it matters: Defaulting to `parts.orderStock.lists` will mislabel kit flows and break test expectations when reuse happens.
  Needed answer: Either require consumers to pass a scope or adopt a neutral default consistent with the documentation taxonomy.

### 4) Deterministic Playwright Coverage (new/changed behavior only)
- Behavior: Part detail Order Stock modal — select existing list (`docs/features/order_stock_modal_select/plan.md:253-260`)
  - Scenarios:
    - Given concept lists exist, When the user searches and selects one, Then the selection persists through submit (`tests/e2e/shopping-lists/parts-entrypoints.spec.ts`)
    - Given a duplicate membership, When the user submits, Then conflict messaging and validation instrumentation fire (`tests/e2e/shopping-lists/parts-entrypoints.spec.ts`)
  - Instrumentation: `waitForListLoading(page, 'parts.orderStock.lists', 'ready')`, `waitTestEvent('ShoppingListMembership:addFromPart')` (`docs/features/order_stock_modal_select/plan.md:257-258`)
  - Backend hooks: `testData.parts.create`, `testData.shoppingLists.createWithLines`, `testData.sellers.create` (`docs/features/order_stock_modal_select/plan.md:258-259`)
  - Gaps: Requires updated instrumentation scope ownership (Major).
  - Evidence: `docs/features/order_stock_modal_select/plan.md:253-260`
- Behavior: Inline creation from selector (`docs/features/order_stock_modal_select/plan.md:262-268`)
  - Scenarios:
    - Given no matching list, When the user creates one, Then the new list auto-selects and submit succeeds (`tests/e2e/shopping-lists/parts-entrypoints.spec.ts`)
    - Given validation errors, When submitting empty name, Then dialog validation event surfaces
  - Instrumentation: `waitTestEvent('ShoppingListCreate:concept')`, `waitForListLoading` refresh (`docs/features/order_stock_modal_select/plan.md:266-267`)
  - Backend hooks: `testData.parts.create`, `testData.shoppingLists.expectConceptMembership` (`docs/features/order_stock_modal_select/plan.md:267-268`)
  - Gaps: Major — `testData.shoppingLists.expectConceptMembership` does not exist yet, so backend verification is undefined.
  - Evidence: `docs/features/order_stock_modal_select/plan.md:262-268`

### 5) Adversarial Sweep
**Major — Missing backend helper for membership assertion**
**Evidence:** `docs/features/order_stock_modal_select/plan.md:262-268` — “Backend hooks: … `testData.shoppingLists.expectConceptMembership`… Gaps: None.”
**Why it matters:** Playwright policy requires asserting real backend state using existing helpers; referencing a helper that is not present will stall implementation or silently skip the check.
**Fix suggestion:** Add the helper to the plan’s file map/slices (e.g., extend `tests/support/test-data/shopping-lists.ts`) or rewrite the coverage to use an existing assertion path.
**Confidence:** High

**Major — Shared selector defaults to parts-specific instrumentation scope**
**Evidence:** `docs/features/order_stock_modal_select/plan.md:205` — “`list_loading` (default `parts.orderStock.lists`, overridable via selector props)”; `docs/features/order_stock_modal_select/plan.md:300` — “Require selector consumers to pass the desired `list_loading` scope (defaulting to `parts.orderStock.lists`).”
**Why it matters:** A reusable selector emitting `parts.*` events will misclassify kit or future consumers, breaking the taxonomy documented in `docs/contribute/architecture/test_instrumentation.md`.
**Fix suggestion:** Make `scope` a required prop or adopt a neutral default (e.g., `shoppingLists.selector`) while requiring feature-specific overrides.
**Confidence:** High

**Major — Inline create dialog would lose typed name**
**Evidence:** `docs/features/order_stock_modal_select/plan.md:22-24` — “Remove the inline list creation form… launch the existing `ListCreateDialog`…”; `docs/features/order_stock_modal_select/plan.md:129-134` — flow delegates to the existing dialog; `src/components/shopping-lists/list-create-dialog.tsx:13-20` — props omit any `initialName` input.
**Why it matters:** The current dialog lets users type once; moving to `ListCreateDialog` without seeding the search term forces re-entry and degrades UX compared to `SellerSelector`, which sets `initialName`.
**Fix suggestion:** Extend the plan to add `initialName` (and optional `initialDescription`) support on `ListCreateDialog`, seeding it from the selector’s search term before opening.
**Confidence:** High

### 6) Derived-Value & State Invariants
- Derived value: `shoppingListOptions`
  - Source dataset: `useGetShoppingLists` results filtered by `searchTerm` and status allowlist (`docs/features/order_stock_modal_select/plan.md:118-123`)
  - Write / cleanup triggered: Feeds `SearchableSelect` options each render
  - Guards: Memoized filter to avoid recompute (`docs/features/order_stock_modal_select/plan.md:118-123`)
  - Invariant: Options reflect the latest query payload constrained by the allowlist
  - Evidence: `docs/features/order_stock_modal_select/plan.md:118-123`
- Derived value: `createDialogOpen`
  - Source dataset: Local state toggled by “Create list” affordance (`docs/features/order_stock_modal_select/plan.md:125-133`, `docs/features/order_stock_modal_select/plan.md:151-154`)
  - Write / cleanup triggered: Controls `ListCreateDialog` mount/unmount
  - Guards: Only set when creation is enabled for concept lists (`docs/features/order_stock_modal_select/plan.md:22-24`, `docs/features/order_stock_modal_select/plan.md:125-133`)
  - Invariant: Inline creation UI and selector never collect fields simultaneously
  - Evidence: `docs/features/order_stock_modal_select/plan.md:151-156`
- Derived value: `instrumentationSnapshot`
  - Source dataset: Form state snapshot of part key, mode, needed quantity, list ID (`docs/features/order_stock_modal_select/plan.md:162-167`)
  - Write / cleanup triggered: Passed into `trackSubmit/trackSuccess/trackError`
  - Guards: Snapshot recomputed on dependency change, list ID normalized before emission (`docs/features/order_stock_modal_select/plan.md:162-167`)
  - Invariant: Telemetry mirrors the mutation payload for deterministic waits
  - Evidence: `docs/features/order_stock_modal_select/plan.md:162-167`

### 7) Risks & Mitigations (top 3)
- Risk: “Client-side filtering may lag once allowed shopping lists scale” (`docs/features/order_stock_modal_select/plan.md:290-292`)
  Mitigation: Keep filter logic isolated and plan backend search/pagination upgrade when thresholds are hit.
  Evidence: `docs/features/order_stock_modal_select/plan.md:290-292`
- Risk: “Newly created list may not appear in selector before submit” (`docs/features/order_stock_modal_select/plan.md:294-296`)
  Mitigation: Await React Query refetch completion before auto-selecting, with manual fallback.
  Evidence: `docs/features/order_stock_modal_select/plan.md:294-296`
- Risk: “Test timing flakiness if instrumentation scope mismatched” (`docs/features/order_stock_modal_select/plan.md:298-300`)
  Mitigation: Require consumers to pass the desired scope and update helpers in the same slice.
  Evidence: `docs/features/order_stock_modal_select/plan.md:298-300`

### 8) Confidence
Confidence: Medium — The plan is cohesive, but the highlighted gaps (missing helper, scope ownership, inline-create UX) must be resolved to avoid rework.
