# Seller Links Migration -- Frontend Technical Plan

## 0) Research Log & Findings

**Searched areas:** Generated OpenAPI spec (`openapi-cache/openapi.json`), generated hooks (`src/lib/api/generated/hooks.ts`, `types.ts`), all domain components under `src/components/parts/`, all hooks under `src/hooks/`, AI cleanup utilities (`src/lib/utils/ai-parts.ts`, `src/types/ai-parts.ts`), seller components (`src/components/sellers/`), test factories (`tests/api/factories/`), and existing Playwright specs (`tests/e2e/parts/`).

**Key findings:**

1. **OpenAPI spec already reflects the migration.** `PartCreateSchema.1a46b79` and `PartUpdateSchema.1a46b79` no longer contain `seller_id` or `seller_link` fields. Both `PartResponseSchema` and `PartWithTotalSchema` now expose a `seller_links` array of `PartSellerLinkSchema` objects (fields: `id`, `seller_id`, `seller_name`, `seller_website`, `link`, `created_at`). The old `seller` embedded object and `seller_link` string are gone from the response schemas.

2. **Generated hooks exist for the new endpoints.** `usePostPartsSellerLinksByPartKey` (POST to `/api/parts/{part_key}/seller-links`) and `useDeletePartsSellerLinksByPartKeyAndSellerLinkId` (DELETE to `/api/parts/{part_key}/seller-links/{seller_link_id}`) are already generated and available.

3. **Frontend code still references `part.seller` and `part.seller_link` extensively.** These references cause TypeScript errors because the generated types no longer include these fields. Affected files: `part-details.tsx` (lines 520-537, 140-141), `part-form.tsx` (lines 25-26, 61-62, 113-114, 138-139, 209-210, 235-236), `part-card.tsx` (lines 159-163), `vendor-info.tsx` (entire component), `use-duplicate-part.ts` (lines 25-26), `use-parts-selector.ts` (line 156), `part-list.tsx` (lines 117-122, 157-164).

4. **AI cleanup flow has deep seller/seller_link integration.** The cleanup SSE result type (`CleanupTaskResult` in `use-ai-part-cleanup.ts`) includes `seller_link`, `seller`, `seller_is_existing`, and `existing_seller_id`. The merge step (`ai-part-cleanup-merge-step.tsx`) compares and applies seller/seller_link changes. The review step (`ai-part-review-step.tsx`) includes seller selection UI. The utility functions in `ai-parts.ts` include seller fields in `transformCleanupResult`, `transformToCreateSchema`, and `transformToUpdatePayload`.

5. **`PartSellerLinkSchema` is missing `logo_url`.** The current schema only has: `id`, `seller_id`, `seller_name`, `seller_website`, `link`, `created_at`. The backend must add `logo_url` before logo display can work. This is documented as a backend dependency.

6. **Test factory (`part-factory.ts`)** uses `seller_id` and `seller_link` fields in the part creation payload (line 71-72). The `part-list.spec.ts` test (lines 28-37) creates a part with `seller_id` and `seller_link` overrides.

7. **`VendorInfo` component** (`vendor-info.tsx`) currently accepts a single `seller` object and `sellerLink` string. It needs to be replaced with a component that renders multiple seller links with logos.

---

## 1) Intent & Scope

**User intent**

Migrate the parts domain UI from the legacy single-seller model (`seller` + `seller_link` on the part response) to the new `seller_links` array. Remove all references to the removed fields, wire up the new seller-links CRUD endpoints, and update all affected UI surfaces (details screen, form, card, AI flows, supporting hooks, tests).

**Prompt quotes**

- "Migrate the parts domain from the legacy single `seller` + `seller_link` fields to the new `seller_links` array on the part response."
- "The backend has already removed `seller_id` and `seller_link` from the part create/update schemas."
- "The AI flow will no longer handle seller assignments (can be revisited later)."

**In scope**

- Replace single-seller display on part details with seller links list
- Replace seller fields in part form with inline seller links CRUD
- Replace single-seller VendorInfo on part cards with seller logo icons row
- Strip seller/seller_link handling from AI cleanup flow entirely
- Remove seller field copying from `use-duplicate-part.ts`
- Update fuzzy search in `use-parts-selector.ts` to use `seller_links` array
- Update test factory and specs to remove `seller_id` references
- Update or replace `vendor-info.tsx` to work with `seller_links`
- Resolve all TypeScript errors related to seller/seller_id/seller_link

**Out of scope**

- Backend changes to `PartSellerLinkSchema` (adding `logo_url`)
- AI part creation flow seller link auto-attachment (revisited later)
- Seller CRUD management screens (already exist, unaffected)
- Shopping list seller group functionality (uses its own seller_id, not part.seller)

**Assumptions / constraints**

- The backend `PartSellerLinkSchema` will add `logo_url` before the frontend logo display ships; until then, the name-chip fallback is the only option.
- The `seller_links` array is already populated on both `PartResponseSchema` and `PartWithTotalSchema` responses.
- Generated API hooks for POST/DELETE seller-links are available and functional.
- `pnpm generate:api` has already been run against the updated OpenAPI spec (the cached spec already reflects the migration).

---

## 1a) User Requirements Checklist

**User Requirements Checklist**

- [ ] Part details screen shows a list of all seller links with seller logo before seller name
- [ ] Part form has inline list of seller links with add/remove capability using dedicated POST/DELETE endpoints
- [ ] Part card in list view shows seller icons on same line as box locations, aligned right
- [ ] Clicking seller logo on part card opens seller link in new tab
- [ ] If no seller logo available, show chip with seller name instead
- [ ] AI cleanup flow has all seller/seller_link handling stripped out
- [ ] use-duplicate-part.ts updated to remove seller field copying
- [ ] use-parts-selector.ts fuzzy search uses seller_links array for seller name matching
- [ ] part-factory.ts and part-list.spec.ts updated to remove seller_id references
- [ ] vendor-info.tsx updated or replaced to work with seller_links array
- [ ] All pre-existing TypeScript errors related to seller/seller_link/seller_id are resolved
- [ ] Backend dependency documented: PartSellerLinkSchema needs logo_url field added

---

## 2) Affected Areas & File Map

- Area: `src/components/parts/part-details.tsx`
- Why: Remove legacy "Seller Information" section (lines 520-537) that reads `part.seller` and `part.seller_link`. Replace with a seller links list iterating over `part.seller_links`. Also update `partSummary` (line 140) to remove `defaultSellerId`.
- Evidence: `part-details.tsx:520-537` -- conditional block `{(part.seller || part.seller_link) && (...)}` renders single seller. Line 140: `defaultSellerId: part.seller?.id ?? null`.

- Area: `src/components/parts/part-form.tsx`
- Why: Remove `sellerId` and `sellerLink` from `PartFormData` interface and all form state, remove SellerSelector + Seller Link input fields, remove `seller_id`/`seller_link` from create/update mutation payloads. Add inline seller links list with add/remove using the dedicated endpoints. The form will show existing seller links (fetched from the part response) and allow adding new ones or removing existing ones.
- Evidence: `part-form.tsx:25-26` -- `sellerId`/`sellerLink` in PartFormData. Lines 61-62 -- initial state. Lines 113-114 -- edit population. Lines 138-139 -- duplicate population. Lines 209-210, 235-236 -- mutation payloads. Lines 583-604 -- seller form fields.

- Area: `src/components/parts/part-card.tsx` (PartListItem)
- Why: Replace `VendorInfo` component usage with a row of clickable seller icons/chips. Currently passes `part.seller` and `part.seller_link` (line 159-163). Must switch to `part.seller_links` array.
- Evidence: `part-card.tsx:159-163` -- `<VendorInfo seller={part.seller} sellerLink={part.seller_link} inCardContext />`.

- Area: `src/components/parts/vendor-info.tsx`
- Why: Rewrite to accept a `seller_links` array and render seller logos (or name chips as fallback). The old single-seller interface is obsolete.
- Evidence: `vendor-info.tsx:4-13` -- interface accepts `seller?: { id: number; name: string } | null` and `sellerLink?: string | null`.

- Area: `src/hooks/use-duplicate-part.ts`
- Why: Remove `sellerId` and `sellerLink` from the returned `formData` object.
- Evidence: `use-duplicate-part.ts:25-26` -- `sellerId: part.seller?.id || undefined, sellerLink: part.seller_link || ''`.

- Area: `src/hooks/use-parts-selector.ts`
- Why: Update fuzzy search to match against `seller_links` array seller names instead of `raw?.seller?.name`.
- Evidence: `use-parts-selector.ts:156` -- `{ term: raw?.seller?.name ?? '', type: 'text' }`.

- Area: `src/components/parts/part-list.tsx`
- Why: Update fuzzy search filter to use `seller_links` for seller name matching instead of `part.seller?.name`.
- Evidence: `part-list.tsx:157-164` -- `const sellerName = part.seller?.name;` and `{ term: sellerName ?? '', type: 'text' }`.

- Area: `src/hooks/use-ai-part-cleanup.ts`
- Why: Remove `seller_link`, `seller`, `seller_is_existing`, and `existing_seller_id` from the `CleanupTaskResult` interface. The cleanup flow no longer handles seller data.
- Evidence: `use-ai-part-cleanup.ts:14,27-29` -- `seller_link: string | null`, `seller: string | null`, `seller_is_existing: boolean`, `existing_seller_id: number | null`.

- Area: `src/components/parts/ai-part-cleanup-dialog.tsx`
- Why: Remove seller-related comparisons from `checkForChanges`. Remove `seller_link` and `seller` from `fieldsToCompare`.
- Evidence: `ai-part-cleanup-dialog.tsx:77-79` -- `{ old: current.seller_link, new: cleaned.sellerLink }` and `{ old: current.seller?.name, new: cleaned.seller }`.

- Area: `src/components/parts/ai-part-cleanup-merge-step.tsx`
- Why: Remove `sellerLink` and `seller` from `FIELD_CONFIG`, `URL_FIELDS`, field comparisons, and the apply-changes switch. Remove seller creation dialog and `createdSellerId` state. Remove `seller_link` and `seller_id` from the update payload body.
- Evidence: `ai-part-cleanup-merge-step.tsx:30,58,61,145-146,152,314,317,380-387,497-528,589-600` -- seller fields throughout the merge step.

- Area: `src/components/parts/ai-part-review-step.tsx`
- Why: Remove seller-related form state (`sellerIsExisting`, `sellerId`, `suggestedSellerName`, `sellerLink`), remove SellerSelector UI, remove seller validation, and remove seller fields from `transformToCreateSchema` call.
- Evidence: `ai-part-review-step.tsx:47-50,88-92,143-145,171-172,216-243,481-573` -- seller form fields and logic.

- Area: `src/lib/utils/ai-parts.ts`
- Why: Remove seller-related fields from `transformAIPartAnalysisResult`, `transformToCreateSchema`, `transformCleanupResult`, and `transformToUpdatePayload`.
- Evidence: `ai-parts.ts:82-85,121-122,141-143,175-176,189,198,200-201,217-218,243,250-251,263` -- seller fields in all transform functions.

- Area: `src/types/ai-parts.ts`
- Why: Remove seller-related fields from `PartAnalysisDetailsSchema`, `TransformedAIPartAnalysisResult`, and `CleanedPartData`.
- Evidence: `ai-parts.ts:40-41,43-45,95-98,119-120,132-136` -- seller fields in type definitions.

- Area: `src/components/shopping-lists/part/add-to-shopping-list-dialog.tsx`
- Why: The `PartSummary` interface (line 24) requires `defaultSellerId: number | null`, which is computed from `part.seller?.id` in `part-details.tsx:140`. After migration, there is no single default seller. Set `defaultSellerId: null` in the `partSummary` object in `part-details.tsx`. The dialog already handles `null` gracefully -- the seller dropdown starts empty (`sellerId: part.defaultSellerId ?? undefined` at line 65), so no changes are needed in the dialog itself, only in the `partSummary` computation.
- Evidence: `add-to-shopping-list-dialog.tsx:21-25` -- `PartSummary` interface with `defaultSellerId`. `add-to-shopping-list-dialog.tsx:65` -- form initialization. `part-details.tsx:140` -- `defaultSellerId: part.seller?.id ?? null`.

- Area: `tests/api/factories/part-factory.ts`
- Why: Remove `seller_id: null` and `seller_link: null` from the default part creation payload.
- Evidence: `part-factory.ts:71-72` -- `seller_id: null, seller_link: null`.

- Area: `tests/e2e/parts/part-list.spec.ts`
- Why: Remove `seller_id` and `seller_link` from the part creation overrides in the "renders part card metadata" test.
- Evidence: `part-list.spec.ts:35-36` -- `seller_id: seller.id, seller_link: seller.website ?? null`.

---

## 3) Data Model / Contracts

- Entity / contract: `PartSellerLinkSchema` (response from part detail and list endpoints)
- Shape:
  ```json
  {
    "id": 1,
    "seller_id": 42,
    "seller_name": "DigiKey",
    "seller_website": "https://www.digikey.com",
    "link": "https://www.digikey.com/en/products/detail/abc123",
    "created_at": "2024-01-15T10:30:00Z"
  }
  ```
  **Pending backend addition:** `logo_url: string | null` -- CAS URL for seller logo image.
- Mapping: No snake_case-to-camelCase adapter needed; the seller links are consumed directly from the API response within components. If a custom hook wrapper is added, map to: `{ id, sellerId, sellerName, sellerWebsite, link, logoUrl, createdAt }`.
- Evidence: `openapi-cache/openapi.json:5699-5748` -- `PartResponseSchema.1a46b79.PartSellerLinkSchema`.

- Entity / contract: `PartSellerCreateSchema` (request body for POST seller-link)
- Shape:
  ```json
  {
    "seller_id": 42,
    "link": "https://www.digikey.com/en/products/detail/abc123"
  }
  ```
- Mapping: Frontend form collects seller (via SellerSelector, yielding `sellerId`) and a link URL string. Map to `{ seller_id: sellerId, link: linkUrl }`.
- Evidence: `openapi-cache/openapi.json:5786-5812` -- `PartSellerCreateSchema.f085a8d`.

- Entity / contract: `PartFormData` (local form state in `part-form.tsx`)
- Shape: Remove `sellerId?: number` and `sellerLink: string`. Seller links are managed via POST/DELETE endpoints, not through the part create/update payload.
- Mapping: N/A -- fields are simply deleted.
- Evidence: `part-form.tsx:18-36` -- current `PartFormData` interface.

- Entity / contract: Part create/update payloads (`PartCreateSchema`, `PartUpdateSchema`)
- Shape: No longer include `seller_id` or `seller_link`. Already reflected in generated types.
- Mapping: Remove these fields from all `body` objects in mutation calls.
- Evidence: `openapi-cache/openapi.json:4903-5130` (create), `openapi-cache/openapi.json:6456-6693` (update).

---

## 4) API / Integration Surface

- Surface: `GET /api/parts/{part_key}` (existing, `useGetPartsByPartKey`)
- Inputs: `{ path: { part_key: string } }`
- Outputs: `PartResponseSchema` now includes `seller_links: PartSellerLinkSchema[]` instead of `seller` and `seller_link`. Used by part details, edit form, cleanup dialog, and duplicate hook.
- Errors: Standard 404/error boundaries.
- Evidence: `part-details.tsx:79-82`, `part-form.tsx:84-87`.

- Surface: `GET /api/parts` (existing, via `useAllParts`)
- Inputs: Query params for includes.
- Outputs: `PartWithTotalSchema[]` now includes `seller_links: PartSellerLinkSchema[]`. Used by part list and part selector.
- Errors: Standard error handling via React Query.
- Evidence: `part-list.tsx:38-40`, `use-parts-selector.ts:55-59`.

- Surface: `POST /api/parts/{part_key}/seller-links` (`usePostPartsSellerLinksByPartKey`)
- Inputs: `{ path: { part_key: string }, body: { seller_id: number, link: string } }`
- Outputs: Created `PartSellerLinkSchema` (201). Post-mutation: invalidate the part detail query to refresh seller links.
- Errors: 400 (validation), 404 (part not found), 409 (conflict/duplicate link).
- Evidence: `hooks.ts:1587-1602` -- generated mutation hook.

- Surface: `DELETE /api/parts/{part_key}/seller-links/{seller_link_id}` (`useDeletePartsSellerLinksByPartKeyAndSellerLinkId`)
- Inputs: `{ path: { part_key: string, seller_link_id: number } }`
- Outputs: 204 No Content. Post-mutation: invalidate the part detail query.
- Errors: 400 (validation), 404 (not found).
- Evidence: `hooks.ts:1608-1623` -- generated mutation hook.

- Surface: `POST /api/parts` and `PUT /api/parts/{part_key}` (existing, create/update)
- Inputs: No longer include `seller_id` or `seller_link` in the body.
- Outputs: Same `PartResponseSchema` with `seller_links` array.
- Errors: Unchanged.
- Evidence: `openapi-cache/openapi.json:4903-5130` (PartCreateSchema no longer has seller fields).

---

## 5) Algorithms & UI Flows

- Flow: **Part details seller links display**
- Steps:
  1. Part detail query resolves with `seller_links` array.
  2. If `seller_links` is empty, no seller section is rendered.
  3. If `seller_links` has entries, render a "Seller Information" section with a list.
  4. Each entry shows: seller logo (from `logo_url`, or name chip if unavailable), seller name, and the product link as a clickable external link.
- States / transitions: Loaded from the part query; no separate loading state needed.
- Hotspots: None; the seller links are a small array.
- Evidence: `part-details.tsx:520-537` -- current single-seller rendering.

- Flow: **Part form seller links CRUD (create/edit mode)**
- Steps:
  1. When editing, the part form fetches the existing part (already done via `useGetPartsByPartKey`). The `seller_links` array is displayed as a read-only list below the "Seller Information" section heading.
  2. Each displayed link shows seller name, link URL, and a remove button (X icon).
  3. Below the list, an "Add Seller Link" inline row provides a SellerSelector + link URL Input + Add button.
  4. Clicking "Add" calls `usePostPartsSellerLinksByPartKey` with the part key and the seller/link pair. On success, invalidate the part detail query so the list refreshes.
  5. Clicking "Remove" on an existing link calls `useDeletePartsSellerLinksByPartKeyAndSellerLinkId`. On success, invalidate the part detail query.
  6. In create mode, seller links are not available (the part does not exist yet). The section shows a note: "Save the part first, then add seller links."
  7. In duplicate mode, same as create mode -- seller links are added after the part is created.
- States / transitions: Adding/removing are independent mutations; the list refreshes via query invalidation. Button disabled states while mutations are pending.
- Hotspots: Multiple rapid add/remove calls; serial execution with disabled states prevents race conditions.
- Evidence: `part-form.tsx:547-604` -- current seller fields section to be replaced.

- Flow: **Part card seller icons display**
- Steps:
  1. `PartListItem` receives part data with `seller_links` array.
  2. In the "Vendor and Location Section" area (currently `<VendorInfo>` + `<LocationSummary>`), render seller icons on the same line as box locations, aligned right.
  3. For each seller link: if `logo_url` is available, render a small clickable `<img>` tag with the logo. If not, render a chip with the seller name.
  4. Clicking a seller icon/chip opens the seller link URL in a new tab. Use `stopPropagation` + `preventDefault` + `window.open` since the card is inside a `CardLink` anchor.
  5. If `seller_links` is empty, render nothing (same as current behavior with no seller).
  6. Limit the number of displayed icons/chips to a maximum of 3. If more seller links exist, show a "+N" overflow indicator after the third chip. This prevents visual clutter on cards with many seller links.
- States / transitions: Static display from the list query response.
- Hotspots: Avoid re-renders by memoizing the seller icons sub-component.
- Evidence: `part-card.tsx:157-169` -- current VendorInfo + LocationSummary section.

- Flow: **Fuzzy search seller_links expansion** (part list and part selector)
- Steps:
  1. In `part-list.tsx` (line 157-164), replace the single seller search term:
     ```
     // Old:
     const sellerName = part.seller?.name;
     { term: sellerName ?? '', type: 'text' }
     // New:
     ...(part.seller_links ?? []).map(sl => ({ term: sl.seller_name ?? '', type: 'text' as const }))
     ```
  2. In `use-parts-selector.ts` (line 156), apply the same replacement:
     ```
     // Old:
     { term: raw?.seller?.name ?? '', type: 'text' }
     // New:
     ...(raw?.seller_links ?? []).map(sl => ({ term: sl.seller_name ?? '', type: 'text' as const }))
     ```
  3. This pattern mirrors the existing tags expansion at `part-list.tsx:166`:
     `...(part.tags ?? []).map(tag => ({ term: tag, type: 'text' as const }))`
- States / transitions: No new states. Purely a data mapping change in the filter predicate.
- Hotspots: If a part has many seller links, the search terms array grows. This is negligible since parts typically have 1-5 sellers.
- Evidence: `part-list.tsx:157-164,166` -- current seller name and tags search terms. `use-parts-selector.ts:156` -- current seller search term.

- Flow: **AI cleanup seller stripping**
- Steps:
  1. Remove `seller_link`, `seller`, `seller_is_existing`, `existing_seller_id` from `CleanupTaskResult` interface.
  2. Remove corresponding fields from `transformCleanupResult`.
  3. Remove seller/sellerLink comparisons from `checkForChanges` in `ai-part-cleanup-dialog.tsx`.
  4. Remove `sellerLink` and `seller` entries from `FIELD_CONFIG` and field change comparisons in `ai-part-cleanup-merge-step.tsx`.
  5. Remove seller creation dialog, `createdSellerId` state, and seller-related switch cases from the apply-changes handler.
  6. Remove `seller_link` and `seller_id` from the PUT body construction.
  7. Remove seller fields from the AI review step form, validation, and create-part schema transformation.
  8. Remove seller fields from all type definitions in `ai-parts.ts`.
- States / transitions: Simpler state machine with fewer fields. No new states introduced.
- Hotspots: Must verify no runtime errors from missing fields in SSE payloads. If the backend still sends seller fields in SSE, they are simply ignored by the frontend transform.
- Evidence: `use-ai-part-cleanup.ts:8-31`, `ai-part-cleanup-merge-step.tsx:30,58,61`, `ai-part-review-step.tsx:47-50`.

---

## 6) Derived State & Invariants

- Derived value: **Seller names for fuzzy search** (part list and part selector)
  - Source: `part.seller_links` array from the parts list query. Extract all `seller_name` values via `.map(sl => ({ term: sl.seller_name ?? '', type: 'text' as const }))`.
  - Writes / cleanup: Read-only. Used in `fuzzyMatch` filter calls. Each seller name is a separate `FuzzySearchTerm` entry in the search array (mirrors the tags expansion pattern).
  - Guards: If `seller_links` is undefined or empty, the spread produces zero terms (same as current behavior for null seller).
  - Invariant: The fuzzy search must match if any seller name in the `seller_links` array matches the search term. Each seller name must be an independent search term to avoid cross-seller false positives.
  - Evidence: `part-list.tsx:157,166` (seller name + tags pattern), `use-parts-selector.ts:156`.

- Derived value: **Part form seller links display list**
  - Source: `existingPart.seller_links` from the `useGetPartsByPartKey` query in edit mode.
  - Writes / cleanup: Mutations (POST/DELETE) invalidate the part query, causing a re-fetch that updates this list.
  - Guards: Only shown in edit mode. In create/duplicate mode, a placeholder message is shown.
  - Invariant: The displayed list must always reflect the server state. Optimistic updates are not used; the list refreshes after mutation success.
  - Evidence: `part-form.tsx:84-87` -- existing part query.

- Derived value: **Part detail seller section visibility**
  - Source: `part.seller_links` array from the part detail query.
  - Writes / cleanup: Read-only display.
  - Guards: Section only rendered when `seller_links.length > 0`.
  - Invariant: Empty array means no seller section. The backend guarantees the array is always present (may be empty).
  - Evidence: `part-details.tsx:520` -- current conditional check.

- Derived value: **`partSummary.defaultSellerId`** (part details -> shopping list dialog)
  - Source: Previously `part.seller?.id`. Post-migration, always `null` since there is no canonical single seller.
  - Writes / cleanup: Drives initial seller selection in `AddToShoppingListDialog` form (line 65: `sellerId: part.defaultSellerId ?? undefined`).
  - Guards: Dialog handles `null` gracefully -- the seller dropdown starts empty, user selects manually.
  - Invariant: Post-migration, `defaultSellerId` must be `null`. The shopping list dialog must not error or pre-select an incorrect seller.
  - Evidence: `part-details.tsx:140`, `add-to-shopping-list-dialog.tsx:24,65`.

- Derived value: **AI cleanup field changes list** (after seller removal)
  - Source: `currentPart` fields compared to `cleanedPart` fields via `normalizeFieldValue`.
  - Writes / cleanup: Checked fields drive the PUT payload construction.
  - Guards: Seller/sellerLink fields are no longer included; cannot produce false change detections for removed fields.
  - Invariant: The field changes array contains only fields that exist on both the current part response and the cleaned part model.
  - Evidence: `ai-part-cleanup-merge-step.tsx:83-155`.

---

## 7) State Consistency & Async Coordination

- Source of truth: **Part detail query** (`useGetPartsByPartKey` cache key) is the single source of truth for seller links on the detail and edit screens.
- Coordination: After POST/DELETE seller-link mutations, the part detail query is invalidated, triggering a re-fetch. Components consuming the query automatically update.
- Async safeguards: Mutation hooks disable the add/remove buttons while pending. No optimistic updates are used -- the query re-fetch provides the authoritative state.
- Instrumentation: The existing `parts.detail` list loading instrumentation continues to emit ready/error events. No new instrumentation is needed for the seller links section specifically, as it is part of the part detail query.
- Evidence: `part-details.tsx:171-194` -- existing `useListLoadingInstrumentation` for `parts.detail`.

- Source of truth: **Parts list query** (`useAllParts` cache key) is the source for seller icons on part cards.
- Coordination: Seller links are embedded in the list response. No separate query is needed.
- Async safeguards: Standard React Query caching and background re-fetch.
- Instrumentation: Existing `parts.list` instrumentation covers the list loading lifecycle.
- Evidence: `part-list.tsx:38-40` -- `useAllParts` usage.

---

## 8) Errors & Edge Cases

- Failure: **POST seller-link returns 409 Conflict** (duplicate link for same seller on same part)
- Surface: Part form inline add row
- Handling: The global error handler shows a toast via `ApiError`. The add button re-enables. No local error state needed.
- Guardrails: The SellerSelector already prevents selecting an invalid seller. The 409 is the backend's guard against duplicate entries.
- Evidence: `openapi-cache/openapi.json:13670-13678` -- 409 response defined.

- Failure: **DELETE seller-link returns 404** (link already removed by another session)
- Surface: Part form seller link remove button
- Handling: Global error handler shows toast. The part query re-fetch will update the list, removing the stale entry.
- Guardrails: The remove button is disabled while the mutation is pending.
- Evidence: `openapi-cache/openapi.json:13724-13731` -- 404 response defined.

- Failure: **Part response has `seller_links` as undefined** (backward compatibility concern)
- Surface: All surfaces that read `seller_links`
- Handling: Treat undefined/null the same as an empty array. Use `part.seller_links ?? []` everywhere.
- Guardrails: The generated type marks `seller_links` as optional (`seller_links?`), so the fallback is necessary.
- Evidence: `types.ts:5487` -- `seller_links?: ...[]`.

- Failure: **`logo_url` not yet available on `PartSellerLinkSchema`**
- Surface: Part card seller icons, part details seller list
- Handling: Until the backend adds `logo_url`, treat all seller links as having no logo. Show the name chip fallback for every entry.
- Guardrails: Code checks `sellerLink.logo_url` with optional chaining and defaults to the chip.
- Evidence: Change brief, section "Backend Dependency".

- Failure: **Adding seller link in create mode** (part does not exist yet)
- Surface: Part form in create/duplicate mode
- Handling: The seller links section shows an informational message: "Save the part first, then add seller links." The POST endpoint requires a `part_key`, which is not available until after part creation.
- Guardrails: The add row is not rendered in create/duplicate mode.
- Evidence: Architectural constraint -- POST requires `part_key` path parameter.

---

## 9) Observability / Instrumentation

- Signal: `parts.detail` (existing)
- Type: `ListLoading` instrumentation event
- Trigger: Part detail query lifecycle (loading, success, error, aborted). Already includes seller links data since it is part of the part response.
- Labels / fields: `{ partKey, hasCoverAttachment, typeId }` -- no change needed.
- Consumer: Playwright `waitForTestEvent` helper.
- Evidence: `part-details.tsx:171-194`.

- Signal: `parts.form.sellerLink.add` / `parts.form.sellerLink.remove` (new)
- Type: Form instrumentation events (via `trackForm*` pattern)
- Trigger: Emitted on successful POST/DELETE seller-link mutations in the part form.
- Labels / fields: `{ partKey, sellerId, sellerLinkId }` for remove; `{ partKey, sellerId, link }` for add.
- Consumer: Playwright specs for seller link CRUD testing.
- Evidence: Pattern from `part-form.tsx:195` -- existing `instrumentation.trackSubmit`.

- Signal: `parts.cleanup.merge` (existing, modified)
- Type: Form test event
- Trigger: Apply changes in the cleanup merge step. The `changesCount` field will now exclude seller/sellerLink fields.
- Labels / fields: `{ changesCount: number }` -- count will be lower since seller fields are excluded.
- Consumer: Existing `ai-part-cleanup.spec.ts` tests.
- Evidence: `ai-part-cleanup-merge-step.tsx:288-296`.

---

## 10) Lifecycle & Background Work

- Hook / effect: **Part detail query re-fetch after seller link mutation**
- Trigger cadence: On successful POST or DELETE seller-link mutation.
- Responsibilities: Invalidates the part detail query cache key to trigger a background re-fetch. This updates the seller links list in the form.
- Cleanup: Standard React Query lifecycle. No subscriptions or timers introduced.
- Evidence: Generated hooks already call `queryClient.invalidateQueries()` (no arguments, blanket invalidation) in `onSuccess` (`hooks.ts:1597-1600`, `hooks.ts:1618-1620`). This blanket invalidation is acceptable for the initial implementation since modifying generated code is not advisable. If scoped invalidation is desired later, override `onSuccess` at the call site (e.g., pass `{ onSuccess: () => queryClient.invalidateQueries({ queryKey: ['getPartsByPartKey', partKey] }) }` when invoking the mutation hook).

- Hook / effect: **No new lifecycle hooks introduced.**
- Trigger cadence: N/A
- Responsibilities: The existing part query lifecycle and mutation invalidation patterns handle all seller link state.
- Cleanup: N/A
- Evidence: Existing patterns in `part-form.tsx` and `part-details.tsx`.

---

## 11) Security & Permissions

Not applicable. Seller links follow the same access model as parts -- no role-based gating or sensitive data exposure changes.

---

## 12) UX / UI Impact

- Entry point: Part details screen (`/parts/$partId`)
- Change: "Seller Information" section changes from a single seller name + link to a list of seller links. Each row shows a seller logo (or name chip) followed by the seller name and a clickable external link to the product page.
- User interaction: Users see all associated sellers at a glance. Links open in new tabs.
- Dependencies: `part.seller_links` array from the part detail API response. `logo_url` field (pending backend).
- Evidence: `part-details.tsx:520-537`.

- Entry point: Part form (`/parts/new`, `/parts/$partId/edit`)
- Change: The old "Seller" dropdown and "Seller Link" input are replaced with an inline CRUD list. In edit mode, existing seller links are displayed as removable rows; a compact add-row with SellerSelector + URL input + Add button sits below. In create mode, a placeholder message is shown instead.
- User interaction: Users add seller links one at a time after saving the part. Each add/remove is a discrete API call with immediate UI feedback.
- Dependencies: `usePostPartsSellerLinksByPartKey`, `useDeletePartsSellerLinksByPartKeyAndSellerLinkId` hooks.
- Evidence: `part-form.tsx:547-604`.

- Entry point: Part list card (`/parts`)
- Change: The single-seller VendorInfo chip is replaced with a row of small seller icons (from `logo_url`) or name chips. Icons are clickable and open the seller link in a new tab. The row appears on the same line as box locations, aligned right.
- User interaction: Users can see which sellers carry a part at a glance. Clicking an icon navigates to the seller's product page.
- Dependencies: `part.seller_links` array. `logo_url` field (pending backend).
- Evidence: `part-card.tsx:157-169`.

- Entry point: AI cleanup dialog
- Change: Seller/seller_link fields are removed from the merge review table and the apply-changes flow. The "Seller" and "Seller Link" rows no longer appear. The "Create Seller" button and dialog are removed.
- User interaction: Users no longer see seller-related suggestions in the AI cleanup flow.
- Dependencies: None (removal only).
- Evidence: `ai-part-cleanup-merge-step.tsx:497-528,589-600`.

---

## 13) Deterministic Test Plan

- Surface: Part list card seller display
- Scenarios:
  - Given a part with seller links via the API, When the part list loads, Then seller name chips are visible on the card (since `logo_url` is not yet available, only chips are testable initially).
  - Given a part with no seller links, When the part list loads, Then no seller elements appear on the card.
- Instrumentation / hooks: `data-testid="parts.list.card.seller-links"` on the seller icons container. `data-testid="parts.list.card.seller-chip"` on each name chip.
- Gaps: Logo image display testing deferred until `logo_url` is available from the backend.
- Evidence: `part-list.spec.ts:25-61` -- existing card metadata test.

- Surface: Part details seller links section
- Scenarios:
  - Given a part with seller links, When the detail screen loads, Then a "Seller Information" section shows each seller name and link.
  - Given a part with no seller links, When the detail screen loads, Then no seller section is rendered.
- Instrumentation / hooks: `data-testid="parts.detail.seller-links"` on the seller links container. `data-testid="parts.detail.seller-link-item"` on each row.
- Gaps: None.
- Evidence: `part-details.tsx:520-537`.

- Surface: Part form seller link CRUD (edit mode)
- Scenarios:
  - Given a part in edit mode with no seller links, When the user adds a seller link via SellerSelector + URL input + Add button, Then the link appears in the list and the API confirms creation.
  - Given a part with an existing seller link, When the user clicks the remove button, Then the link is removed from the list and the API confirms deletion.
  - Given a part in create mode, When the form loads, Then the seller links section shows a placeholder message instead of the add row.
- Instrumentation / hooks: `data-testid="parts.form.seller-links.add"` on the add button. `data-testid="parts.form.seller-links.remove"` on remove buttons. Wait for `FormTestEvent` with phase `success` after mutations.
- Gaps: None.
- Evidence: `part-form.tsx:547-604`.

- Surface: AI cleanup flow (seller removal verification)
- Scenarios:
  - Given a part with seller data, When AI cleanup runs and suggests changes, Then the merge table does not include Seller or Seller Link rows.
  - Given a part, When applying cleanup changes, Then the PUT payload does not include `seller_id` or `seller_link` fields.
- Instrumentation / hooks: Verify `parts.cleanup.merge.table` rows do not contain `data-field="seller"` or `data-field="sellerLink"`.
- Gaps: None.
- Evidence: `tests/e2e/parts/ai-part-cleanup.spec.ts`.

- Surface: Part factory and existing tests
- Scenarios:
  - Given the updated part factory without `seller_id`/`seller_link`, When creating parts, Then no TypeScript errors occur and parts are created successfully.
  - Given the updated part-list spec without seller overrides, When running the test, Then it passes without seller-related assertions.
- Instrumentation / hooks: Standard factory API calls.
- Gaps: The existing `part-list.spec.ts` test that creates a part with `seller_id` must be updated.
- Evidence: `part-factory.ts:57-78`, `part-list.spec.ts:28-37`.

- Surface: Seller link test factory helper (prerequisite for all seller link specs)
- Scenarios:
  - Given a part and a seller created via factories, When `createPartSellerLink(partKey, sellerId, link)` is called, Then a seller link is created via `POST /api/parts/{part_key}/seller-links` and the response is returned.
- Instrumentation / hooks: Standard factory API calls via `apiRequest`.
- Gaps: None.
- Evidence: `tests/api/factories/seller-factory.ts` -- extends `SellerTestFactory` with the new method:
  ```typescript
  async createPartSellerLink(
    partKey: string,
    sellerId: number,
    link: string
  ): Promise<PartSellerLinkSchema> {
    return apiRequest(() =>
      this.client.POST('/api/parts/{part_key}/seller-links', {
        params: { path: { part_key: partKey } },
        body: { seller_id: sellerId, link },
      })
    );
  }
  ```
  This method is the prerequisite for all Playwright specs that need parts with seller links. It replaces the old pattern of passing `seller_id` in the part creation payload.

---

## 14) Implementation Slices

- Slice: **1 -- Type cleanup and AI flow seller stripping**
- Goal: Eliminate all TypeScript errors related to seller fields in AI flows and type definitions. This is the foundation slice that unblocks all other work.
- Touches: `src/types/ai-parts.ts`, `src/lib/utils/ai-parts.ts`, `src/hooks/use-ai-part-cleanup.ts`, `src/components/parts/ai-part-cleanup-dialog.tsx`, `src/components/parts/ai-part-cleanup-merge-step.tsx`, `src/components/parts/ai-part-review-step.tsx`.
- Dependencies: None. Can be done independently.

- Slice: **2 -- Part form migration**
- Goal: Remove legacy seller fields from the part form, add inline seller links CRUD for edit mode.
- Touches: `src/components/parts/part-form.tsx`, `src/hooks/use-duplicate-part.ts`.
- Dependencies: Slice 1 should be complete so TypeScript errors are resolved. Generated hooks for POST/DELETE seller-links.

- Slice: **3 -- Part details, VendorInfo rewrite, and shopping list dialog fix**
- Goal: Replace single-seller display on part details with seller links list. Rewrite `vendor-info.tsx` to accept `seller_links` array. Update `partSummary.defaultSellerId` to `null` (no single default seller post-migration; `AddToShoppingListDialog` handles `null` gracefully).
- Touches: `src/components/parts/part-details.tsx`, `src/components/parts/vendor-info.tsx`. Note: `src/components/shopping-lists/part/add-to-shopping-list-dialog.tsx` requires no code changes -- only the `partSummary` computation in `part-details.tsx` changes.
- Dependencies: Slice 1 for clean types.

- Slice: **4 -- Part card and list fuzzy search update**
- Goal: Update part card to show seller icons/chips from `seller_links`. Update fuzzy search in part list and part selector to match against `seller_links` seller names.
- Touches: `src/components/parts/part-card.tsx`, `src/components/parts/part-list.tsx`, `src/hooks/use-parts-selector.ts`.
- Dependencies: Slice 3 (VendorInfo rewrite).

- Slice: **5 -- Test factory and spec updates**
- Goal: Remove `seller_id`/`seller_link` from test factory and specs. Add `createPartSellerLink(partKey, sellerId, link)` factory method to `SellerTestFactory` for API-first seller link creation. Update or add Playwright specs for new seller links UI surfaces (card, detail, form CRUD).
- Touches: `tests/api/factories/part-factory.ts` (remove `seller_id`/`seller_link` defaults), `tests/api/factories/seller-factory.ts` (add `createPartSellerLink` method), `tests/e2e/parts/part-list.spec.ts` (replace `seller_id` override with factory method call).
- Dependencies: All previous slices. The factory method must be implemented before any Playwright spec updates that test seller link display.

---

## 15) Risks & Open Questions

- Risk: **Backend `logo_url` field not ready in time**
- Impact: All seller logo display falls back to name chips. The feature is functionally complete but visually degraded.
- Mitigation: Design the logo/chip rendering with `logo_url` optional from day one. The chip fallback is the default path. Once the backend ships `logo_url`, logos appear automatically without frontend changes.

- Risk: **SSE cleanup payload still includes seller fields after backend changes**
- Impact: Frontend transform functions may fail if they try to destructure fields that no longer exist on the SSE payload.
- Mitigation: The transform functions should be written defensively -- only read fields that are expected. If the backend stops sending seller fields in SSE, the transform simply produces `null`/`undefined` for those fields, which are now ignored. Since we are stripping seller handling entirely, the fields are not read at all.

- Risk: **Part form seller links section is only available in edit mode**
- Impact: Users cannot add seller links during initial part creation. They must save first, then edit.
- Mitigation: This is an intentional design choice documented in the change brief. The POST endpoint requires a `part_key`, which does not exist until the part is created. The form shows a clear informational message about this constraint.

- Risk: **Multiple seller links may clutter the part card in list view**
- Impact: Cards with many seller links could have visual overflow.
- Mitigation: Cap displayed icons/chips at 3 with a "+N" overflow indicator (see section 5, Part card seller icons display, step 6). This is a firm design decision, not deferred to implementation.

- Question: **Should the part form seller links section auto-refresh, or require a manual refresh?**
- Why it matters: After adding/removing a seller link, the list needs to update. Auto-refresh via query invalidation is the standard pattern in this codebase.
- Owner / follow-up: Resolved -- use query invalidation (consistent with existing patterns throughout the app).

---

## 16) Confidence

Confidence: High -- The backend API changes are already reflected in the OpenAPI spec, generated hooks exist for the new endpoints, and the scope of frontend changes is well-defined. The main risk (missing `logo_url`) has a clean fallback path. All affected files have been identified with line-level evidence.
