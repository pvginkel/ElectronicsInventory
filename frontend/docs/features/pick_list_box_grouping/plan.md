# Pick List Box Grouping - Implementation Plan

## 0) Research Log & Findings

**Searched areas:**
- Backend schema: `backend/app/schemas/pick_list.py` (PickListLineLocationSchema at line 101-117, KitPickListLineSchema at 148-177)
- Backend models: `backend/app/models/location.py` (Location.box relationship at line 25), `backend/app/models/box.py` (Box.description at line 27)
- Backend service: `backend/app/services/kit_pick_list_service.py` (detail query at lines 344-357 eager-loads `lines.location` but not `lines.location.box`)
- Backend PDF report: `backend/app/services/pick_list_report_service.py` (box grouping at lines 160-186, header format `#<box_no> - <box_description>` at line 209, sort by `(loc_no, line.id)` at lines 178-184)
- Frontend types: `src/types/pick-lists.ts` (groupPickListLines groups by kitContentId, PickListLocation interface lacks boxDescription)
- Frontend detail hook: `src/hooks/use-pick-list-detail.ts` (calls groupPickListLines at line 73, extracts uniquePartKeys at lines 77-86)
- Frontend components: `src/components/pick-lists/pick-list-lines.tsx` (renders per-kitContentId cards with PartInlineSummary in header, metric chips at lines 166-184)
- Frontend detail container: `src/components/pick-lists/pick-list-detail.tsx` (passes lineGroups and availability to PickListLines)
- Reference card pattern: `src/components/shopping-lists/ready/seller-group-card.tsx` (ListSectionHeader + table with PartInlineSummary in rows)
- Reference table: `src/components/shopping-lists/concept-table.tsx` (flat table with Part column using PartInlineSummary per row)
- Availability hook: `src/hooks/use-pick-list-availability.ts` (fetches per partKey, lookup via getLineAvailabilityQuantity using partKey + boxNo + locNo)
- Execution hook: `src/hooks/use-pick-list-execution.ts` (optimistic updates keyed by lineId -- grouping-agnostic)
- Quantity update hook: `src/hooks/use-pick-list-line-quantity-update.ts` (optimistic updates keyed by lineId -- grouping-agnostic)
- Page object: `tests/support/page-objects/pick-lists-page.ts` (group locator uses kitContentId, needs updating to boxNo)
- Playwright specs: `tests/e2e/pick-lists/pick-list-detail.spec.ts` (group assertions at lines 104-110 use kitContentId)
- Backend tests: `backend/tests/api/test_pick_lists_api.py` (seed helper at lines 16-57, detail assertions at lines 96-108)
- ListSectionHeader: `src/components/primitives/list-section-header.tsx` (title + description + information + actions + footer slots)

**Key findings:**
1. The `Location.box` relationship uses default lazy loading (`lazy="select"`). The service queries eager-load `lines.location` but not `lines.location.box`. To serialize `box_description` we must either add a `selectinload(KitPickListLine.location).selectinload(Location.box)` chain to the detail query, or resolve the description via a Pydantic model validator using the already-loaded `box_no` + a joined query. The eager-load approach is cleaner.
2. The execution and quantity-update hooks operate on `lineId` and are agnostic to grouping -- they require no changes.
3. Availability data is fetched per `partKey` and looked up by `(partKey, boxNo, locNo)` -- this already works across groups because a box group may contain multiple parts.
4. The `PartInlineSummary` component already supports compact inline rendering suitable for table rows (partKey badge, description, optional cover image, optional link).
5. The PDF report sorts boxes by `box_no` ascending, then lines within a box by `(loc_no, line.id)` -- this is the target sort order.

**Conflicts resolved:**
- The current `PickListLineGroup` interface is tightly coupled to per-part grouping (carries `partKey`, `partId`, per-part metrics). A new `PickListBoxGroup` interface will replace it.
- The `pick-list-detail.tsx` container passes `lineGroups` typed as `PickListLineGroup[]`. This will change to `PickListBoxGroup[]`.
- The page object `group()` locator currently keys on `kitContentId`. It will change to key on `boxNo`.

---

## 1) Intent & Scope

**User intent**

Reorganize the pick list detail screen so lines are grouped by storage box rather than by component/part, matching the printed PDF report layout. This is a presentation-layer change with a minor backend schema addition (`box_description`).

**Prompt quotes**

"Group pick list lines by box instead of by component/part"
"Box group header matches the PDF printout format (`#<box_no> - <box_description>`)"
"Add `box_description` to the backend PickListLineLocationSchema and regenerate the frontend API client"
"Sort order matches the PDF: boxes by box_no ascending, lines within a box by (loc_no, line.id)"
"Remove per-part metric chips (Lines, Quantity to pick, Remaining) from card headers"
"Use the shopping list concept table / seller group card layout as a structural basis"

**In scope**

- Add `box_description` field to backend `PickListLineLocationSchema` with eager-loading of `Location.box`
- Write backend tests for the schema change and run the full backend test suite
- Regenerate the frontend API client
- Replace the `groupPickListLines` function with `groupPickListLinesByBox`
- Replace `PickListLineGroup` interface with `PickListBoxGroup`
- Update `pick-list-lines.tsx` to render box group cards with `ListSectionHeader` (header format: `#<box_no> - <box_description>`)
- Move `PartInlineSummary` from card header into each table row as a new "Part" column
- Remove per-part metric chips from card headers
- Sort boxes by `box_no` ascending, lines within a box by `(loc_no, line.id)`
- Update Playwright page object and specs to use box-based group selectors
- Preserve all existing interactive features: pick/undo, inline quantity editing, availability display, shortfall warnings

**Out of scope**

- Changing the PDF report itself
- Modifying the pick list creation flow or line generation logic
- Adding new interactive features (filtering, searching within the pick list)
- Changes to the pick list overview/listing page
- Changes to the kit detail page's pick list panel

**Assumptions / constraints**

- The backend `Location` model already has a `box` relationship to `Box` (confirmed at `backend/app/models/location.py:25`)
- The `Box.description` field is non-nullable (`Mapped[str]`, confirmed at `backend/app/models/box.py:27`)
- After adding `box_description` to the schema, `pnpm generate:api` will produce the updated generated types
- The eager-loading change in the service queries is safe because the `location` is already eagerly loaded -- we are just chaining one more level

## 1a) User Requirements Checklist

**User Requirements Checklist**

- [ ] Group pick list lines by box instead of by component/part
- [ ] Box group header matches the PDF printout format (`#<box_no> - <box_description>`)
- [ ] Add `box_description` to the backend PickListLineLocationSchema and regenerate the frontend API client
- [ ] Component/part info (PartInlineSummary) moves into each table row
- [ ] Keep all existing columns: Location (full "3-7" format), Status, Qty to pick, In stock, Shortfall, Actions
- [ ] Keep inline quantity editing
- [ ] Remove per-part metric chips (Lines, Quantity to pick, Remaining) from card headers
- [ ] Sort order matches the PDF: boxes by box_no ascending, lines within a box by (loc_no, line.id)
- [ ] Write backend tests for the schema change and run the backend test suite
- [ ] Use the shopping list concept table / seller group card layout as a structural basis for the new box group cards

---

## 2) Affected Areas & File Map

- Area: `backend/app/schemas/pick_list.py` - `PickListLineLocationSchema`
- Why: Add `box_description: str` field so the frontend can display box headers without an extra API call.
- Evidence: `backend/app/schemas/pick_list.py:101-117` -- current schema has only `id`, `box_no`, `loc_no`.

- Area: `backend/app/services/kit_pick_list_service.py` - detail query methods
- Why: Add `selectinload(Location.box)` to the `selectinload(KitPickListLine.location)` chain so `location.box.description` is available during Pydantic serialization.
- Evidence: `backend/app/services/kit_pick_list_service.py:349-354` -- current query loads `lines.location` but not `lines.location.box`.

- Area: `backend/tests/api/test_pick_lists_api.py`
- Why: Add assertions that `box_description` is present in the API response for pick list detail and line endpoints.
- Evidence: `backend/tests/api/test_pick_lists_api.py:96-108` -- existing detail test asserts line structure but not location fields.

- Area: `src/types/pick-lists.ts` - interfaces and grouping function
- Why: (1) Add `boxDescription` to `PickListLocation`. (2) Replace `PickListLineGroup` with `PickListBoxGroup`. (3) Replace `groupPickListLines` with `groupPickListLinesByBox`. (4) Update `mapPickListLineLocation` to include `boxDescription`.
- Evidence: `src/types/pick-lists.ts:16-20` (PickListLocation), `src/types/pick-lists.ts:59-73` (PickListLineGroup), `src/types/pick-lists.ts:170-216` (groupPickListLines), `src/types/pick-lists.ts:160-168` (mapPickListLineLocation).

- Area: `src/hooks/use-pick-list-detail.ts`
- Why: Change `lineGroups` from `PickListLineGroup[]` to `PickListBoxGroup[]` and call the new grouping function.
- Evidence: `src/hooks/use-pick-list-detail.ts:72-75` -- currently calls `groupPickListLines`.

- Area: `src/components/pick-lists/pick-list-lines.tsx`
- Why: Major restructure: (1) Change props from `PickListLineGroup[]` to `PickListBoxGroup[]`. (2) Replace per-kitContent card header (PartInlineSummary + metric chips) with per-box card header (`ListSectionHeader` with `#<box_no> - <box_description>`). (3) Add "Part" column to table with `PartInlineSummary` in each row. (4) Update column widths. (5) Remove metric chips.
- Evidence: `src/components/pick-lists/pick-list-lines.tsx:147-191` (card rendering with CardHeader containing PartInlineSummary and metric KeyValueBadges), `src/components/pick-lists/pick-list-lines.tsx:193-384` (table rendering).

- Area: `src/components/pick-lists/pick-list-detail.tsx`
- Why: Update the `RenderContentOptions` type and the `renderContent` call site to pass `PickListBoxGroup[]` instead of `PickListLineGroup[]`.
- Evidence: `src/components/pick-lists/pick-list-detail.tsx:23` (imports PickListLineGroup), `src/components/pick-lists/pick-list-detail.tsx:388` (groups type in RenderContentOptions).

- Area: `tests/support/page-objects/pick-lists-page.ts`
- Why: Change `group()` locator from `pick-lists.detail.group.${kitContentId}` to `pick-lists.detail.group.box-${boxNo}`. Add new `groupHeader()` locator for box header text assertions.
- Evidence: `tests/support/page-objects/pick-lists-page.ts:52-57` (group/groupMetrics methods keyed by kitContentId).

- Area: `tests/e2e/pick-lists/pick-list-detail.spec.ts`
- Why: Update assertions that reference group locators (currently use `kitContentId`) to use `boxNo`. Update group content assertions to check for box header text instead of part summary text in header. Verify PartInlineSummary now appears in table rows.
- Evidence: `tests/e2e/pick-lists/pick-list-detail.spec.ts:104-110` (group assertions using `lineForPartA!.kit_content.id`).

---

## 3) Data Model / Contracts

- Entity / contract: `PickListLineLocationSchema` (backend Pydantic schema)
- Shape:
  ```python
  class PickListLineLocationSchema(BaseModel):
      id: int
      box_no: int
      loc_no: int
      box_description: str  # NEW - sourced from location.box.description
  ```
- Mapping: `from_attributes=True` on the model config will auto-read `box_description` if it is exposed as a property. However, since the Pydantic schema uses `from_attributes=True` and the ORM `Location` model does not have a `box_description` attribute directly, we need a `@computed_field` or a `model_validator` to read `self.box.description`. The cleanest approach: add a `@computed_field` property `box_description` that returns `self.box.description` when `box` is loaded, or add a `box_description` property to the `Location` ORM model. Given the project pattern of keeping schemas simple, adding a `@property` to the Location model is preferred.
- Evidence: `backend/app/schemas/pick_list.py:101-117`, `backend/app/models/location.py:14-30`.

- Entity / contract: `PickListLocation` (frontend camelCase model)
- Shape:
  ```typescript
  interface PickListLocation {
    id: number;
    boxNo: number;
    locNo: number;
    boxDescription: string;  // NEW
  }
  ```
- Mapping: `mapPickListLineLocation` maps `location.box_description` to `boxDescription`.
- Evidence: `src/types/pick-lists.ts:16-20`, `src/types/pick-lists.ts:160-168`.

- Entity / contract: `PickListBoxGroup` (new frontend interface, replaces `PickListLineGroup`)
- Shape:
  ```typescript
  interface PickListBoxGroup {
    boxNo: number;
    boxDescription: string;
    lines: PickListLine[];  // sorted by (locNo, line.id)
  }
  ```
- Mapping: Built by `groupPickListLinesByBox` which groups `detail.lines` by `line.location.boxNo`, sorts groups by `boxNo` ascending, and sorts lines within each group by `(locNo, lineId)`.
- Evidence: replaces `src/types/pick-lists.ts:59-73`.

---

## 4) API / Integration Surface

- Surface: `GET /api/pick-lists/{pick_list_id}` (generated hook: `useGetPickListsByPickListId`)
- Inputs: `{ path: { pick_list_id: number } }`
- Outputs: `KitPickListDetailSchema` with `lines[].location.box_description` now populated. No new endpoints.
- Errors: No change -- existing error handling (404, 500) remains.
- Evidence: `src/hooks/use-pick-list-detail.ts:56-65`, `backend/app/schemas/pick_list.py:245-256`.

- Surface: `POST /api/pick-lists/{pick_list_id}/lines/{line_id}/pick` and `POST .../undo` (execution mutations)
- Inputs: No change.
- Outputs: Returns full `KitPickListDetailSchema` with `box_description` in each line's location. The optimistic update path (`applyPickListLineStatusPatch`) operates on the raw snake_case detail and is unaffected since `box_description` is just passed through.
- Errors: No change.
- Evidence: `src/hooks/use-pick-list-execution.ts:296-391`.

- Surface: `PATCH /api/pick-lists/{pick_list_id}/lines/{line_id}` (quantity update mutation)
- Inputs: No change.
- Outputs: Returns full `KitPickListDetailSchema` with `box_description`. Same pass-through behavior as execution.
- Errors: No change.
- Evidence: `src/hooks/use-pick-list-line-quantity-update.ts:212-311`.

- Surface: `GET /api/parts/{part_key}/locations` (availability queries)
- Inputs: No change.
- Outputs: No change. Availability lookup remains per `(partKey, boxNo, locNo)`.
- Errors: No change.
- Evidence: `src/hooks/use-pick-list-availability.ts:20-32`.

---

## 5) Algorithms & UI Flows

- Flow: Box grouping (replaces per-part grouping)
- Steps:
  1. `usePickListDetail` hook maps raw API response via `mapPickListDetail`, producing `PickListDetail` with `lines: PickListLine[]`.
  2. Hook calls `groupPickListLinesByBox(detail.lines)` instead of `groupPickListLines`.
  3. `groupPickListLinesByBox` iterates lines, groups by `line.location.boxNo` into a `Map<number, PickListBoxGroup>`.
  4. Groups are sorted by `boxNo` ascending (matching PDF's `sorted(lines_by_box.keys())`).
  5. Within each group, lines are sorted by `(line.location.locNo, line.id)` (matching PDF's `key=lambda line: (line.location.loc_no, line.id)`).
  6. Hook returns `boxGroups: PickListBoxGroup[]` instead of `lineGroups: PickListLineGroup[]`.
- States / transitions: No change to query states. The grouping is a pure synchronous derivation in `useMemo`.
- Hotspots: None -- the grouping runs once per `detail.lines` change, same as before.
- Evidence: `src/types/pick-lists.ts:170-216` (current grouping), `backend/app/services/pick_list_report_service.py:160-186` (target sort).

- Flow: Box group card rendering
- Steps:
  1. `PickListLines` component receives `boxGroups: PickListBoxGroup[]` (was `groups: PickListLineGroup[]`).
  2. For each `boxGroup`, render a `Card` keyed by `boxNo` with `data-testid="pick-lists.detail.group.box-${boxNo}"`.
  3. Card header uses `ListSectionHeader` with `title="#${boxNo} - ${boxDescription}"`.
  4. No metric chips in the header (removed).
  5. Table columns: Part (new, contains `PartInlineSummary`), Location, Status, Qty to pick, In stock, Shortfall, Actions.
  6. Each row renders: `PartInlineSummary` (compact, `showCoverImage={false}`, `link={true}`, `testId="pick-lists.detail.line.${lineId}.part"`), location label (`formatLocation`), status badge, quantity (with inline edit), availability, shortfall, pick/undo button.
  7. Availability lookup: for each line, call `getLineAvailabilityQuantity(availability, line.kitContent.partKey, line.location.boxNo, line.location.locNo)`. **This is a source change**: the current code reads `group.partKey` (which is equivalent in per-part grouping), but must change to `line.kitContent.partKey` in per-box grouping because a box group may contain lines for different parts. Each line must individually resolve its own part's availability.
- States / transitions: No change to interactive states (edit mode, pending states).
- Hotspots: Adding a column to the table increases row width. Use `min-w-[100px]` for the Part column to keep it compact. Consider reducing Location column width since it no longer needs to carry part context.
- Evidence: `src/components/shopping-lists/ready/seller-group-card.tsx:51-183` (reference pattern), `src/components/pick-lists/pick-list-lines.tsx:147-391` (current rendering).

- Flow: Unique part keys extraction (unchanged)
- Steps:
  1. `usePickListDetail` extracts `uniquePartKeys` from `detail.lines` by iterating all lines and collecting distinct `line.kitContent.partKey` values.
  2. This feeds `usePickListAvailability` which fetches per-partKey.
  3. No change needed -- the extraction is line-based, not group-based.
- Evidence: `src/hooks/use-pick-list-detail.ts:77-86`.

---

## 6) Derived State & Invariants

- Derived value: `boxGroups`
  - Source: `detail.lines` (mapped PickListLine array from API response)
  - Writes / cleanup: Read-only derivation in `useMemo`; triggers re-render of `PickListLines` component.
  - Guards: Empty `detail.lines` produces empty `boxGroups[]` which renders the existing empty state.
  - Invariant: Every line must have a `location.boxNo` and `location.boxDescription`. Since `box_no` and `box_description` are non-nullable in the backend, this is guaranteed.
  - Evidence: `src/hooks/use-pick-list-detail.ts:72-75` (current `lineGroups` derivation, same pattern).

- Derived value: `uniquePartKeys` (unchanged)
  - Source: `detail.lines` -- iterates all lines collecting `kitContent.partKey`.
  - Writes / cleanup: Feeds `usePickListAvailability` queries. After regrouping, the set of unique part keys is identical.
  - Guards: Empty detail produces empty array; availability hook is disabled.
  - Invariant: The set of partKeys must match the actual parts in the pick list to ensure every line gets an availability lookup. This holds regardless of grouping strategy since extraction is line-based.
  - Evidence: `src/hooks/use-pick-list-detail.ts:77-86`.

- Derived value: Per-line availability quantity
  - Source: `availability.availabilityByPartKey` map + line's `(kitContent.partKey, location.boxNo, location.locNo)`.
  - Writes / cleanup: Read-only lookup per table row render.
  - Guards: Returns `null` when availability data is not yet loaded or partKey is missing.
  - Invariant: The lookup key `(partKey, boxNo, locNo)` must match how availability data is indexed. Since each line still carries its own `kitContent.partKey`, regrouping by box does not break the lookup -- a box group may contain lines for different parts, and each line individually resolves its availability correctly.
  - Evidence: `src/hooks/use-pick-list-availability.ts:150-167` (getLineAvailabilityQuantity).

---

## 7) State Consistency & Async Coordination

- Source of truth: TanStack Query cache keyed by `['getPickListsByPickListId', { path: { pick_list_id } }]` holding the raw `KitPickListDetailSchema_b247181`.
- Coordination: The `detail` and `boxGroups` derivations live in `useMemo` inside `usePickListDetail`. Any cache update (from mutation success, optimistic update, or background refetch) triggers re-derivation of groups. Since the grouping function is pure and deterministic, there is no risk of inconsistency between the cached raw data and the derived groups.
- Async safeguards: Execution and quantity-update mutations use optimistic updates on the raw cache entry, then set the server response on success. The `applyPickListLineStatusPatch` and `applyPickListLineQuantityPatch` functions operate on the raw snake_case lines and are grouping-agnostic. The new `box_description` field in each line's location is simply preserved through optimistic updates (spread operator copies all fields).
- Instrumentation: No changes to instrumentation scopes or events. The `pickLists.detail`, `pickLists.detail.lines`, `pickLists.detail.execution`, `pickLists.detail.quantityEdit`, and `pickLists.detail.availability` scopes all remain unchanged.
- Evidence: `src/hooks/use-pick-list-detail.ts:56-75`, `src/hooks/use-pick-list-execution.ts:296-391`, `src/types/pick-lists.ts:349-413`.

---

## 8) Errors & Edge Cases

- Failure: Box with empty or missing description
- Surface: Box group card header in `PickListLines`
- Handling: `Box.description` is `Mapped[str]` (non-nullable) in the backend model, so it will never be `null`. If an empty string somehow occurs, the header would render as `#3 - ` which is acceptable and matches the PDF behavior.
- Guardrails: The backend schema field `box_description: str` enforces a string type.
- Evidence: `backend/app/models/box.py:27` (non-nullable).

- Failure: Lines with no location (edge case)
- Surface: Grouping function
- Handling: Every pick list line is created with a location (enforced by the creation service). The grouping function can defensively skip lines without a location, matching the PDF report's `if line.location:` guard.
- Guardrails: Backend creation service ensures every line has a valid location.
- Evidence: `backend/app/services/pick_list_report_service.py:174` (defensive check).

- Failure: Multiple parts in the same box having different availability states
- Surface: Table rows within a single box group card
- Handling: Each table row independently looks up availability for its own `(partKey, boxNo, locNo)`, so different parts in the same box display their own stock levels correctly.
- Guardrails: The `getLineAvailabilityQuantity` function is per-line, not per-group.
- Evidence: `src/hooks/use-pick-list-availability.ts:150-167`.

- Failure: API client regeneration produces breaking type changes
- Surface: Build step (`pnpm generate:api`)
- Handling: The only change is an additional `box_description: string` field on the existing `PickListLineLocationSchema` type. This is a backward-compatible additive change. Existing code that destructures location will not break.
- Guardrails: `pnpm check` (TypeScript strict mode) will catch any type mismatches.
- Evidence: `src/lib/api/generated/types.ts:3697-3715` (current schema type).

---

## 9) Observability / Instrumentation

- Signal: `pickLists.detail.lines` (ListLoading scope)
- Type: Instrumentation event
- Trigger: Unchanged -- emitted when pick list detail query transitions between loading/ready/error. The `getLinesReadyMetadata` callback reports `lineCount`, `openLineCount`, `totalQuantityToPick`, `remainingQuantity`.
- Labels / fields: No new fields needed. The line count is a pick-list-level metric, not grouping-dependent.
- Consumer: Playwright `waitForListLoading(page, 'pickLists.detail.lines', 'ready')`.
- Evidence: `src/components/pick-lists/pick-list-detail.tsx:108-116`.

No new instrumentation scopes are required for this change. The box grouping is a pure presentation-layer reorganization. All existing instrumentation scopes (`pickLists.detail`, `pickLists.detail.lines`, `pickLists.detail.execution`, `pickLists.detail.quantityEdit`, `pickLists.detail.availability`, `pickLists.detail.load`, `pickLists.detail.delete`) remain unchanged.

The `data-testid` attributes change from `pick-lists.detail.group.${kitContentId}` to `pick-lists.detail.group.box-${boxNo}` for group cards. Individual line testids (`pick-lists.detail.line.${lineId}.*`) are unchanged since they are keyed by line ID, not group. A new `data-testid` is added for the Part column cell in each row: `pick-lists.detail.line.${lineId}.part` (passed as the `testId` prop to `PartInlineSummary`).

---

## 10) Lifecycle & Background Work

- Hook / effect: `usePickListAvailability` parallel queries
- Trigger cadence: On mount (when `uniquePartKeys` is populated and `enabled` is true), with `staleTime: 30_000`.
- Responsibilities: Fetches location-level stock for each unique partKey. Unchanged by regrouping.
- Cleanup: TanStack Query handles cleanup on unmount. `gcTime: 5 * 60_000`.
- Evidence: `src/hooks/use-pick-list-availability.ts:62-70`.

No new lifecycle effects or subscriptions are introduced by this change.

---

## 11) Security & Permissions

Not applicable. The `box_description` is a non-sensitive descriptive field already visible in the PDF report (which is accessible to the same users). No new authorization boundaries are crossed.

---

## 12) UX / UI Impact

- Entry point: `/pick-lists/:pickListId` (pick list detail route)
- Change: The lines section changes from per-component/part cards to per-box cards.
  - **Before**: Each card shows a part header (PartInlineSummary with cover image, key, description) with metric chips (Lines, Quantity to pick, Remaining), followed by a table of locations.
  - **After**: Each card shows a box header (`#<box_no> - <box_description>`) using `ListSectionHeader`, followed by a table where each row includes a Part column (PartInlineSummary, compact, with link) alongside the existing Location, Status, Qty to pick, In stock, Shortfall, and Actions columns.
- User interaction: The user now walks through boxes in order (matching the physical picking flow and the PDF printout). Within each box, they see all parts sorted by location. Picking/undo and quantity editing work identically at the row level.
- Dependencies: Requires `box_description` in the API response (backend schema change). Requires regenerated frontend API client.
- Evidence: `src/components/pick-lists/pick-list-lines.tsx:147-391` (current layout), `src/components/shopping-lists/ready/seller-group-card.tsx:51-183` (target pattern).

**Column layout for the new table (7 columns):**

| Column | Width | Alignment | Content |
|--------|-------|-----------|---------|
| Part | `min-w-[200px]` | left | `PartInlineSummary` (compact, `showCoverImage={false}`, `link={true}`, `testId="pick-lists.detail.line.${lineId}.part"`) |
| Location | `min-w-[100px]` | left | `formatLocation(boxNo, locNo)` (e.g., "3-7") |
| Status | `min-w-[100px]` | left | `StatusBadge` |
| Qty to pick | `min-w-[120px]` | right | Number with inline edit |
| In stock | `min-w-[120px]` | right | Availability value |
| Shortfall | `min-w-[160px]` | left | InlineNotification or dash |
| Actions | `min-w-[100px]` | right | Pick/Undo button |

---

## 13) Deterministic Test Plan

- Surface: Pick list detail page - box grouping layout
- Scenarios:
  - Given a pick list with lines in two different boxes, When the detail page loads, Then lines are grouped under box headers formatted as `#<box_no> - <box_description>` and sorted by `box_no` ascending.
  - Given a box group with multiple lines, When the group renders, Then lines within the box are sorted by `(locNo, lineId)` ascending.
  - Given a box group card, When it renders, Then each table row contains a Part column showing the part description and key for that specific line.
  - Given the new layout, When a box group header renders, Then no metric chips (Lines, Quantity to pick, Remaining) are present.
  - Given a line in a box group, When the user clicks Pick, Then the line transitions to completed status (existing behavior, unchanged by grouping).
  - Given a line in a box group, When the user edits the quantity, Then inline editing works as before (existing behavior).
  - Given a pick list where the same box has lines for different parts, When the detail page loads, Then each line's availability shows the correct stock for its specific part at its specific location.
  - Given a pick list with two parts stocked in the same box, When the detail page loads, Then one box group card contains rows for both parts, each with its own `PartInlineSummary` (assertable via `pick-lists.detail.line.${lineId}.part`) and its own availability value.
- Instrumentation / hooks: `waitForListLoading(page, 'pickLists.detail.lines', 'ready')`, `waitForUiState(page, 'pickLists.detail.availability', 'ready')`. Group locators change to `pick-lists.detail.group.box-${boxNo}`. Line locators remain `pick-lists.detail.line.${lineId}`. Part column locators: `pick-lists.detail.line.${lineId}.part`.
- Gaps: No gaps -- all existing test scenarios (pick, undo, quantity edit, PDF viewer, delete, navigation) continue to work because they operate on line IDs, not group IDs. The group-level assertions in the first test case need updating to use box-based locators. The existing first test (`shows live availability and highlights shortfalls`) should be updated so that both parts are stocked in the **same** box to validate multi-part-per-box grouping -- the primary new behavior.
- Evidence: `tests/e2e/pick-lists/pick-list-detail.spec.ts:104-110` (existing group assertions to update).

**Page object changes (`tests/support/page-objects/pick-lists-page.ts`):**
- `group(kitContentId: number)` becomes `boxGroup(boxNo: number)` returning `page.getByTestId('pick-lists.detail.group.box-${boxNo}')`.
- `groupMetrics(kitContentId: number)` is removed (no more metric chips).
- New `boxGroupHeader(boxNo: number)` returning `page.getByTestId('pick-lists.detail.group.box-${boxNo}.header')`.
- New `linePart(lineId: number)` returning `page.getByTestId('pick-lists.detail.line.${lineId}.part')`.

**Backend test additions (`backend/tests/api/test_pick_lists_api.py`):**
- In `test_get_pick_list_detail`: assert `data["lines"][0]["location"]["box_description"]` equals the seeded box description ("API Box").
- In `test_create_pick_list_returns_detail`: assert `box_description` is present in each line's location.

---

## 14) Implementation Slices

- Slice: Backend schema change + tests
- Goal: Add `box_description` to the API response and verify with backend tests.
- Touches:
  - `backend/app/schemas/pick_list.py` (add `box_description` field)
  - `backend/app/models/location.py` (add `box_description` property that returns `self.box.description`)
  - `backend/app/services/kit_pick_list_service.py` (add `selectinload(Location.box)` to detail queries)
  - `backend/tests/api/test_pick_lists_api.py` (add assertions)
  - Run full backend test suite
- Dependencies: None. This slice can ship independently.

- Slice: Frontend API regeneration + type model changes
- Goal: Regenerate frontend types and update the grouping logic and interfaces.
- Touches:
  - `pnpm generate:api` (regenerate from updated OpenAPI spec)
  - `src/types/pick-lists.ts` (update `PickListLocation`, replace `PickListLineGroup` with `PickListBoxGroup`, replace `groupPickListLines` with `groupPickListLinesByBox`, update `mapPickListLineLocation`)
  - `src/hooks/use-pick-list-detail.ts` (change return type, call new grouping function)
- Dependencies: Slice 1 (backend schema change) must be deployed so the OpenAPI spec includes `box_description`.

- Slice: UI component changes
- Goal: Render box-grouped cards with the new layout.
- Touches:
  - `src/components/pick-lists/pick-list-lines.tsx` (major restructure: new props type, ListSectionHeader header, Part column in table, remove metric chips)
  - `src/components/pick-lists/pick-list-detail.tsx` (update type imports and renderContent options)
- Dependencies: Slice 2 (type model changes).

- Slice: Playwright test updates
- Goal: Update test selectors and assertions to match new box-based grouping.
- Touches:
  - `tests/support/page-objects/pick-lists-page.ts` (update group locators)
  - `tests/e2e/pick-lists/pick-list-detail.spec.ts` (update group assertions, verify Part column in rows, verify box headers)
- Dependencies: Slice 3 (UI component changes).

---

## 15) Risks & Open Questions

- Risk: Eager-loading `Location.box` adds a query to pick list detail fetching.
- Impact: Slightly increased database load on detail page requests.
- Mitigation: The `selectinload` strategy batches all box lookups into one query. Given that pick lists typically have 5-50 lines across a handful of boxes, the additional query is negligible. The PDF report already accesses `location.box` in the same request context.

- Risk: `PickListLineGroup` is referenced in multiple files and tests; renaming to `PickListBoxGroup` may cause missed references.
- Impact: TypeScript compilation errors.
- Mitigation: TypeScript strict mode (`pnpm check`) will catch all broken references. The `PickListLineGroup` type should be fully removed (not left as a deprecated alias) to ensure clean migration.

- Risk: Column width adjustments with the new Part column may cause layout issues on narrow screens.
- Impact: Table may require horizontal scrolling on mobile.
- Mitigation: The table already has `overflow-x-auto` wrapping. Use compact `PartInlineSummary` (no cover image) and reasonable `min-w` values. Test on common viewport widths.

**Open questions: None.** All questions have been resolved autonomously:
- Q: Should the `box_description` be a Pydantic computed field or a plain schema field? A: Add a `box_description` property to the `Location` ORM model that reads from `self.box.description`. This keeps the Pydantic schema simple with `from_attributes=True`.
- Q: Should `PartInlineSummary` in table rows show cover images? A: No, use `showCoverImage={false}` for compact table rows, matching how the concept table uses `PartInlineSummary` in rows.
- Q: Should the old `groupPickListLines` function be kept? A: No, remove it entirely along with `PickListLineGroup` to avoid dead code.

---

## 16) Confidence

Confidence: High -- the change is a well-scoped presentation-layer reorganization with a minor backend schema addition. All interactive features (pick, undo, quantity editing, availability) are line-ID-keyed and unaffected by regrouping. The target layout is well-defined by the existing PDF report and the seller-group-card pattern provides a proven structural template.
