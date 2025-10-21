### 0) Research Log & Findings
- Reviewed kit header slots that currently render static count badges for shopping/pick lists to swap out (`src/components/kits/kit-detail-header.tsx:128`).
- Confirmed kit detail view already loads full data but does not surface `shoppingListLinks` or `pickLists` yet (`src/components/kits/kit-detail.tsx:24`).
- Verified KitDetail domain model exposes shoppingListLinks and pickLists including stale flags and requested units (`src/types/kits.ts:192`).
- Audited part detail membership chips that need extraction into a reusable component (`src/components/parts/part-details.tsx:325`).
- Noted part detail already emits instrumentation for shopping list memberships we must preserve (`src/components/parts/part-details.tsx:170`).
- Located Playwright assertions tied to legacy badges that will fail after chip swap (`tests/e2e/kits/kit-detail.spec.ts:81`).
- Found kits page object exposing badge locators slated for replacement (`tests/support/page-objects/kits-page.ts:55`).
- Identified part entrypoint spec expectations depending on current chip test ids (`tests/e2e/shopping-lists/parts-entrypoints.spec.ts:42`).
- Revisited ui_state instrumentation helper for emitting deterministic linkage events (`src/lib/test/ui-state.ts:46`).
- Confirmed Playwright guide expects deterministic waits via `waitForUiState`/`waitForListLoading` hooks (`docs/contribute/testing/playwright_developer_guide.md:82`).
- Re-read architecture overview to align component placement with domain-driven structure (`docs/contribute/architecture/application_overview.md:3`).

### 1) Intent & Scope

**User intent**

Replace the provisional badge counts on the kit detail header with actionable shopping list and pick list chips by reusing the existing shopping list chip UI patterns and delivering accessible instrumentation-ready links.

**Prompt quotes**

"Kit linkage chips"  
"refactoring the existing chips in the shopping list into reusable components"  
"Only refactoring the part detail screen, and adding the shopping list and pick list chips to the kit detail screen, is in scope."

**In scope**

- Extract the part detail shopping list badge markup into a reusable chip component and ensure PartDetails continues to render correctly.
- Render shopping list and pick list chips on the kit detail header using the new components, matching the shopping-list presentation (icon + name + status badge) with no additional tooltip or stale affordances.
- Add `kits.detail.links` instrumentation and update Playwright coverage plus page objects for the new selectors.

**Out of scope**

- Applying the pick list chip to shopping list or other domains beyond kit detail.
- Backend schema or API changes; rely on existing fields returned by `GET /api/kits/{kit_id}`.
- Unlink or mutation flows on chips (purely read-only in this slice).

**Assumptions / constraints**

Kit detail payload already includes the linkage arrays we need (names + statuses, with stale flags reserved for future slices); chip styling should match existing Tailwind tokens without introducing new design primitives; Playwright will run against the real backend so factory helpers must seed linkage data deterministically.

### 2) Affected Areas & File Map
- Area: src/components/kits/kit-detail-header.tsx
- Why: Replace the metadataRow badges with grouped chip sections and preserve the build-target badge within the header layout.
- Evidence: src/components/kits/kit-detail-header.tsx:128 — metadata row currently renders static count badges for shopping and pick lists.

- Area: src/components/kits/kit-detail.tsx
- Why: Wire linkage data into the header slots and emit ui_state instrumentation alongside existing list loading events.
- Evidence: src/components/kits/kit-detail.tsx:43 — detail component already handles query status but lacks linkage-specific instrumentation.

- Area: src/components/parts/part-details.tsx
- Why: Swap inline membership markup to use the reusable chip component while keeping loading/error states untouched.
- Evidence: src/components/parts/part-details.tsx:325 — current chip markup is embedded directly in the map of memberships.

- Area: src/components/shopping-lists/shopping-list-link-chip.tsx (new)
- Why: Encapsulate the shared shopping list chip styling (icon + name + status badge) for reuse across parts and kits.
- Evidence: src/components/parts/part-details.tsx:332 — existing link + badge composition defines the baseline to extract.

- Area: src/components/kits/pick-list-link-chip.tsx (new)
- Why: Provide a dedicated chip component for pick list summaries that mirrors the shopping-list chip surface (icon + name + status badge).
- Evidence: src/types/kits.ts:175 — pick list summaries expose identifiers and status we map into the chip props.

- Area: tests/support/page-objects/kits-page.ts
- Why: Update locators to target chip sections/test ids instead of the deprecated badge selectors.
- Evidence: tests/support/page-objects/kits-page.ts:55 — page object currently exposes `detailShoppingBadge`/`detailPickBadge`.

- Area: src/routes/pick-lists/$pickListId.tsx (new)
- Why: Provide a placeholder route so pick list chip navigation resolves instead of 404ing.
- Evidence: src/routes currently lacks a pick-list detail module; placeholder will render "Pick list placeholder" until the full workspace ships.

- Area: tests/e2e/kits/kit-detail.spec.ts
- Why: Assert chip rendering and navigation using the new instrumentation waits.
- Evidence: tests/e2e/kits/kit-detail.spec.ts:81 — spec presently verifies the numeric badges.

- Area: tests/support/page-objects/parts-page.ts
- Why: Keep helper methods aligned with the new reusable chip structure and data-test ids.
- Evidence: tests/support/page-objects/parts-page.ts:207 — badge container/query logic assumes the old markup.

- Area: tests/e2e/shopping-lists/parts-entrypoints.spec.ts
- Why: Ensure existing scenarios still pass after the chip extraction and update assertions as needed.
- Evidence: tests/e2e/shopping-lists/parts-entrypoints.spec.ts:42 — spec fetches `parts.detail.shopping-list.badge` selectors.

### 3) Data Model / Contracts
- Entity / contract: KitDetail.shoppingListLinks
- Shape: { id, shoppingListId, name, status, isStale, honorReserved, requestedUnits, snapshotKitUpdatedAt, createdAt, updatedAt }
- Mapping: `mapKitDetail` already converts snake_case fields into camelCase arrays the chips can consume without extra adapters; we only surface `name` and `status` for now, leaving stale/requested metadata available for future slices.
- Evidence: src/types/kits.ts:162

- Entity / contract: KitDetail.pickLists
- Shape: { id, kitId, status, requestedUnits, lineCount, openLineCount, completedLineCount, totalQuantityToPick, pickedQuantity, remainingQuantity, createdAt, updatedAt, completedAt }
- Mapping: The pick list chip will rely on the identifiers and `status` field to show the same surface as shopping-list chips, keeping progress metrics available for later expansion.
- Evidence: src/types/kits.ts:175

- Entity / contract: ShoppingListMembershipSummary.memberships
- Shape: { listId, listName, listStatus, needed, ordered, received, note, seller }
- Mapping: PartDetails will pass membership records to the new chip component, keeping the camelCase properties exposed by the hook.
- Evidence: src/types/shopping-lists.ts:127

### 4) API / Integration Surface
- Surface: GET /api/kits/{kit_id} / useGetKitsByKitId
- Inputs: path param `kit_id` derived from the TanStack Router route.
- Outputs: Kit detail payload including `shopping_list_links` and `pick_lists`; chips reuse both arrays and existing badge counts.
- Errors: Propagate through existing query error handling (toast + list loading instrumentation).
- Evidence: src/hooks/use-kit-detail.ts:32

- Surface: POST /api/parts/shopping-list-memberships/query
- Inputs: body `{ part_keys, include_done }` generated by `usePartShoppingListMemberships`.
- Outputs: Membership summaries that PartDetails maps to chips.
- Errors: Already wrapped with `toApiError`; component retains existing retry UI.
- Evidence: src/hooks/use-part-shopping-list-memberships.ts:41

### 5) Algorithms & UI Flows
- Flow: Kit detail header readiness
- Steps:
  1. `useKitDetail` fetches detail data and exposes query status for header rendering.
  2. New `useUiStateInstrumentation('kits.detail.links')` observes the same status to emit loading/ready events with linkage metadata.
  3. `createKitDetailHeaderSlots` groups build-target badge, shopping list chips, and pick list chips, sorting links deterministically before output.
  4. Header renders chips or empty-state copy alongside existing actions when detail resolves.
- States / transitions: loading skeleton → ready chips or empty message; refetching should keep chips visible while updating metadata.
- Hotspots: Large link arrays must wrap responsively to avoid header overflow.
- Evidence: src/components/kits/kit-detail.tsx:63

- Flow: Shopping list chip render
- Steps:
  1. Chip component receives `name`, `status`, and navigation props.
  2. Status determines the badge variant/label (concept vs ready) while reusing the shopping cart icon treatment from PartDetails.
  3. Component renders a focusable `Link` with `data-testid="kits.detail.links.shopping.<id>"`, matching the existing part-detail markup for consistency.
- States / transitions: Loading skeleton hands off to chips; refetch keeps the same structure while statuses update.
- Hotspots: Maintain keyboard focus styles and responsive wrapping when many chips appear.
- Evidence: src/components/parts/part-details.tsx:332

- Flow: Pick list chip navigation
- Steps:
  1. Chip mirrors the shopping-list styling by showing a pick-list icon, the label (e.g., `Pick list #123`), and a status badge (`open` or `completed`).
  2. `Link` navigates to `/pick-lists/<id>` (placeholder route for now) and relies on global router instrumentation for route events.
  3. Tests wait for `kits.detail.links` ready event before asserting chips.
- States / transitions: Status badge toggles styling between open/completed.
- Hotspots: Ensure iconography communicates pick-list context without relying on extra tooltip copy.
- Evidence: src/types/kits.ts:175

### 6) Derived State & Invariants
- Derived value: `sortedShoppingLinks` sorts links by status priority (concept → ready → done) then name for stable rendering.
- Mapping: Built from `KitDetail.shoppingListLinks` and memoized in the header slots.
- Evidence: src/types/kits.ts:162

- Derived value: `hasLinkedWork` determines if either shopping or pick link arrays are non-empty to show chips vs empty copy.
- Mapping: Uses `KitDetail.shoppingListLinks.length` and `KitDetail.pickLists.length` while guarding against undefined detail.
- Evidence: src/types/kits.ts:192

- Derived value: `linkStatusMetadata` packages shopping/pick counts and status mix for `useUiStateInstrumentation`.
- Mapping: Built from the same arrays when emitting `kits.detail.links` events so Playwright can assert deterministic metadata.
- Evidence: docs/features/kit_linkage_chips/plan.md:186-188

### 7) Accessibility & Usability
- Use `Link` elements with existing focus ring classes so chips remain keyboard navigable just like the part detail badges (`src/components/parts/part-details.tsx:331`).
- Provide `aria-label`/`title` text summarizing status and list context for screen readers.
- Ensure icons (shopping cart, alert triangle) include `aria-hidden` and rely on text labels to avoid redundancy.
- Maintain sufficient color contrast by reusing badge variants already vetted in part/shopping list flows.

### 8) Instrumentation & Telemetry
- Add `useUiStateInstrumentation('kits.detail.links', ...)` to emit loading/ready events with shopping/pick counts and status distribution metadata (`src/lib/test/ui-state.ts:46`).
- Continue emitting `useListLoadingInstrumentation` for detail/contents scopes so existing waits stay intact (`src/components/kits/kit-detail.tsx:43`).
- Update Playwright specs to use `waitForUiState(page, 'kits.detail.links', 'ready')` before asserting chips, aligning with the Playwright guide (`docs/contribute/testing/playwright_developer_guide.md:82`).
- Retain part detail instrumentation scope `parts.detail.shoppingLists` unchanged when swapping in the chip component (`src/components/parts/part-details.tsx:170`).

### 9) Error & Empty States
- Preserve PartDetails error banner and retry button around the membership chip area while rendering the new component inside the success branch (`src/components/parts/part-details.tsx:299`).
- When the kit has no linked shopping or pick lists, show a concise empty message in the header rather than blank space to guide planners.
- Keep the header loading skeleton aligned with the chip layout by updating the placeholder rows that currently assume three badges (`src/components/kits/kit-detail.tsx:148`).

### 10) Lifecycle & Background Work
- Chips rely on the same `useKitDetail` query lifecycle; refetches triggered by TanStack Query should update chip props without reloading the page (`src/hooks/use-kit-detail.ts:32`).
- No additional background polling is introduced; chips simply re-render when the detail query invalidates.

### 11) Security & Permissions
- No new permissions are required; chips expose read-only navigation using existing router paths backed by the authenticated session (`src/hooks/use-kit-detail.ts:32`).

### 12) UX / UI Impact
- Header metadata row shifts from numeric badges to contextual chips, while keeping the build target badge in place for continuity (`src/components/kits/kit-detail-header.tsx:133`).
- Shopping list chips continue the existing badge pattern (icon + name + status), giving planners a direct route into the list.
- Pick list chips adopt the same compact treatment (icon + label + status badge) so planners can navigate without parsing quantities.
- Both shopping and pick list chips mirror the part-detail presentation, keeping the surface consistent across domains.

### 13) Deterministic Test Plan
- Surface: Kit detail header linkage chips
- Scenarios:
  - Given a kit with one concept shopping list and one open pick list, When the detail page loads, Then the chips render with names + status badges and `kits.detail.links` emits a ready event.
  - Given a kit with no linked lists, When the detail page loads, Then the header shows the empty-state copy and no chips.
  - Given the chip list is visible, When a user clicks a shopping list chip, Then Playwright observes a route test event to `/shopping-lists/<id>` and the destination page loads.
  - Given a pick list chip is clicked, When the placeholder route resolves, Then Playwright confirms the URL includes `/pick-lists/<id>` and the placeholder text renders.
- Instrumentation / hooks: `waitForUiState(page, 'kits.detail.links', 'ready')`, `waitForListLoading(page, 'kits.detail', 'ready')`, route test-event capture.
- Gaps: Placeholder route keeps navigation smoke-level until the pick-list workspace ships.
- Evidence: tests/e2e/kits/kit-detail.spec.ts:81

- Surface: Part detail shopping list chips
- Scenarios:
  - Given a part linked to concept and ready lists, When memberships load, Then chips render with correct labels and still navigate to the list.
  - Given the memberships query errors, When retry is clicked, Then the error banner persists and the instrumentation scope emits loading → ready after success.
- Instrumentation / hooks: `waitForListLoading(page, 'parts.detail.shoppingLists', 'ready')`.
- Gaps: None; existing spec already seeds both concept and ready memberships.
- Evidence: tests/e2e/shopping-lists/parts-entrypoints.spec.ts:42

### 14) Implementation Slices
- Slice: Extract reusable shopping list chip
- Goal: Create shared component, update PartDetails to use it, and keep existing tests green.
- Touches: `src/components/parts/part-details.tsx`, `src/components/shopping-lists/shopping-list-link-chip.tsx`, part-related Playwright selectors.
- Dependencies: None; leverages existing membership hook.

- Slice: Render kit linkage chips with instrumentation
- Goal: Replace header badges with chip sections, add `kits.detail.links` instrumentation, and handle empty/loading states.
- Touches: `src/components/kits/kit-detail.tsx`, `src/components/kits/kit-detail-header.tsx`, `src/components/kits/pick-list-link-chip.tsx`.
- Dependencies: Shopping list chip extraction.

- Slice: Update Playwright page objects and specs
- Goal: Align selectors and assertions with the new chips, seed linkage data, and cover navigation + status badge behavior.
- Touches: `tests/support/page-objects/kits-page.ts`, `tests/support/page-objects/parts-page.ts`, `tests/e2e/kits/kit-detail.spec.ts`, `tests/e2e/shopping-lists/parts-entrypoints.spec.ts`.
- Dependencies: UI changes complete so tests point at final structure.

### 15) Risks & Open Questions
- Risk: Long chip lists could overflow the header on smaller screens. Impact: Layout breakage; Mitigation: Ensure chips wrap and consider truncation/scroll if >N items, verified in responsive view.
- Risk: Placeholder pick-list route may diverge from the eventual workspace contract. Impact: Future refactor to align navigation; Mitigation: Keep placeholder minimal and replace once the dedicated workspace lands.
- Risk: Deterministic ordering might clash with stakeholder expectations. Impact: UI surprises for planners; Mitigation: Confirm sort priority (status then name) with PM or align with backend order before shipping.

### 16) Confidence

Confidence: Medium — UI/test touchpoints are defined, but we still need to validate deterministic seeding for concept + pick list data and confirm the placeholder route satisfies navigation checks.
