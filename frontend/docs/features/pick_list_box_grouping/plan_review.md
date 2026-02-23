# Pick List Box Grouping - Plan Review

## 1) Summary & Decision

**Readiness**

The plan is thorough, well-researched, and implementation-ready. It demonstrates strong understanding of the codebase, correctly identifies all affected files, and provides precise line-range evidence for every claim. The data flow analysis (hooks, optimistic updates, availability lookups) is accurate. The plan correctly identifies that execution and quantity-update hooks are line-ID-keyed and grouping-agnostic, that the availability lookup must shift from `group.partKey` to `line.kitContent.partKey` in the new layout, and that the `ListSectionHeader` component is the right structural pattern. The adversarial sweep below surfaces real issues, but all are addressable without redesigning the approach.

**Decision**

`GO-WITH-CONDITIONS` -- Three conditions must be addressed before implementation begins: (1) the availability lookup source must be explicitly changed from `group.partKey` to `line.kitContent.partKey` in the plan, (2) the Playwright test plan needs a scenario for the multi-part-per-box case with specific box header assertions, and (3) the plan should specify `data-testid` for the new Part column cell within each row to support the new assertion target.

---

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `docs/commands/plan_feature.md` -- Pass -- All 16 required sections are present and populated. The User Requirements Checklist (plan:82-95) is included as required. Research Log is detailed (plan:4-35).
- `docs/product_brief.md` -- Pass -- The plan aligns with the "Projects (kits)" workflow (product brief, section 7, workflow 7) and the storage model (product brief, section 5). Box grouping reflects the physical picking flow described by the brief's "BOX-LOCATION" labeling scheme (product brief:35).
- `docs/contribute/architecture/application_overview.md` -- Pass -- plan:117-119 correctly uses the domain hook pattern (`usePickListDetail` wrapping generated API hooks). The plan calls `pnpm generate:api` (plan:57, 405) and preserves the snake_case-to-camelCase mapping pattern (plan:163). Uses `useMemo` for derived state (plan:218), consistent with the architecture overview's React Query patterns.
- `docs/contribute/testing/playwright_developer_guide.md` -- Pass -- plan:364-387 specifies deterministic waits via `waitForListLoading` and `waitForUiState`, uses factories for data setup, and updates page objects with `data-testid`-based locators. No route interception is introduced.

**Fit with codebase**

- `usePickListDetail` hook -- plan:117-119 -- Confirmed. The hook at `src/hooks/use-pick-list-detail.ts:72-75` calls `groupPickListLines` and returns `lineGroups: PickListLineGroup[]`. The plan's proposal to replace this with `groupPickListLinesByBox` returning `PickListBoxGroup[]` is a clean substitution with the same `useMemo` pattern.
- `PickListLines` component -- plan:121-123 -- Confirmed. The component at `src/components/pick-lists/pick-list-lines.tsx:39-56` accepts `groups: PickListLineGroup[]`. The plan correctly identifies this as the major restructure point.
- `ListSectionHeader` -- plan:122, 227 -- Confirmed. The component at `src/components/primitives/list-section-header.tsx:57` accepts `title: string` and `testId?: string`, which matches the plan's usage of `title="#${boxNo} - ${boxDescription}"`. The `noBorder` prop may be needed since the card already provides border separation.
- `SellerGroupCard` reference pattern -- plan:233 -- Confirmed. `src/components/shopping-lists/ready/seller-group-card.tsx:51-183` uses `ListSectionHeader` with `description`, `information`, and `actions` slots inside a bordered card, followed by a table. This is a suitable structural template.
- `PartInlineSummary` -- plan:228-229 -- Confirmed. The component at `src/components/parts/part-inline-summary.tsx:7-16` supports `showCoverImage?: boolean` and `link?: boolean` props as described.
- Optimistic update functions -- plan:190-198 -- Confirmed. Both `applyPickListLineStatusPatch` (`src/types/pick-lists.ts:349-413`) and `applyPickListLineQuantityPatch` (`src/types/pick-lists.ts:421-468`) use spread operators on the raw snake_case lines and are keyed by `lineId`, making them grouping-agnostic. The new `box_description` field will be preserved through the spread.

---

## 3) Open Questions & Ambiguities

No blocking open questions remain. The plan resolved all its own questions autonomously (plan:440-443). Two minor clarifications are noted below but neither blocks progress:

- Question: Should the `ListSectionHeader` use `noBorder={true}` since the parent `Card` component already provides visual separation?
- Why it matters: Without `noBorder`, the section header will render a `border-b` class that may create a double-border effect between the header and the table.
- Needed answer: Inspect the `SellerGroupCard` reference pattern -- it uses `ListSectionHeader` inside a div with its own `rounded-lg border`, and the header's border-b creates the visual separator between header and table content. This is the desired behavior; the Card component's border is on the outer container, while the header's border-b separates header from table body. No change needed.

- Question: Should the `PickListBoxGroup` interface include an `id` field or is `boxNo` sufficient as the unique key?
- Why it matters: The `Card` component is keyed by `boxNo` (plan:225). If a pick list could theoretically span multiple location sets with the same `boxNo` (it cannot, since `boxNo` is a unique identifier for a box), this would cause React key collisions.
- Needed answer: `boxNo` is unique per box in the storage model (product brief, section 5: "Boxes are numbers: Box 1, Box 2, ..."). Using `boxNo` as the key is correct and sufficient.

---

## 4) Deterministic Playwright Coverage (new/changed behavior only)

- Behavior: Box group card rendering with box-number-based grouping
- Scenarios:
  - Given a pick list with lines in two different boxes, When the detail page loads, Then lines are grouped under box headers formatted as `#<box_no> - <box_description>` and sorted by `box_no` ascending (`tests/e2e/pick-lists/pick-list-detail.spec.ts`)
  - Given a box group with multiple lines, When the group renders, Then lines within the box are sorted by `(locNo, lineId)` ascending (`tests/e2e/pick-lists/pick-list-detail.spec.ts`)
  - Given a box group card, When it renders, Then each table row contains a Part column showing PartInlineSummary for that specific line (`tests/e2e/pick-lists/pick-list-detail.spec.ts`)
  - Given the new layout, When a box group header renders, Then no metric chips are present (`tests/e2e/pick-lists/pick-list-detail.spec.ts`)
- Instrumentation: `waitForListLoading(page, 'pickLists.detail.lines', 'ready')`, `waitForUiState(page, 'pickLists.detail.availability', 'ready')`. Group locators change to `pick-lists.detail.group.box-${boxNo}`. Line locators remain `pick-lists.detail.line.${lineId}`.
- Backend hooks: Existing `testData.kits.createPickList` factory and `testData.boxes.create` factory are sufficient. The `box_description` field will be populated from the box created by `testData.boxes.create({ overrides: { description: '...' } })`.
- Gaps: **The plan does not include a test scenario for the multi-part-per-box case with box header assertions.** The existing first test case (`shows live availability and highlights shortfalls`) seeds two parts in two different boxes. After regrouping by box, each box will contain one part. To validate the core value proposition (multiple parts visible in a single box group), the test should seed two parts in the **same** box. This is a **Major** gap because it leaves the primary behavioral change (parts from different kit contents co-located in one box group) untested.
- Evidence: plan:364-377 (test plan), `tests/e2e/pick-lists/pick-list-detail.spec.ts:8-122` (existing test seeds parts in different boxes).

- Behavior: Availability lookup correctness within box groups containing multiple parts
- Scenarios:
  - Given a box group containing lines for two different parts, When availability data loads, Then each row shows the correct stock level for its own part at its own location (`tests/e2e/pick-lists/pick-list-detail.spec.ts`)
- Instrumentation: Same as above. Per-line `pick-lists.detail.line.${lineId}.availability` testids remain unchanged.
- Backend hooks: Seed two parts with stock in the same box but different locations (or same location if the schema allows).
- Gaps: Same as above -- this scenario requires the multi-part-per-box test data setup.
- Evidence: plan:374 (scenario reference), `src/hooks/use-pick-list-availability.ts:150-167` (lookup function).

---

## 5) Adversarial Sweep (must find >=3 credible issues or declare why none exist)

**Major -- Availability lookup must change from `group.partKey` to `line.kitContent.partKey`**

**Evidence:** `src/components/pick-lists/pick-list-lines.tsx:213-218` -- current code uses `group.partKey` for the availability lookup:
```typescript
const inStockQuantity = availabilityEnabled
  ? getLineAvailabilityQuantity(
      availability,
      group.partKey,    // <-- group-level partKey
      line.location.boxNo,
      line.location.locNo,
    )
  : null;
```
Plan:230 states: "call `getLineAvailabilityQuantity(availability, line.kitContent.partKey, line.location.boxNo, line.location.locNo)` -- unchanged, still works because the partKey comes from the line, not the group."

**Why it matters:** The plan says this is "unchanged" but it IS a change. The current code reads `group.partKey` (which works because the current group is per-part, so `group.partKey === line.kitContent.partKey`). After regrouping by box, the `PickListBoxGroup` has no `partKey` field at all. The implementation must switch to `line.kitContent.partKey`. If the implementer follows the "unchanged" characterization and tries to reference a non-existent `group.partKey`, TypeScript will catch it, but the plan should accurately document this as a required change rather than characterizing it as unchanged.

**Fix suggestion:** In Section 5 (Box group card rendering, step 7), change the wording from "unchanged" to explicitly state this is a source change:
> "Availability lookup: for each line, call `getLineAvailabilityQuantity(availability, line.kitContent.partKey, ...)`. This changes from the current code which reads `group.partKey`, which is equivalent in the per-part grouping but must become `line.kitContent.partKey` in the per-box grouping since a box group may contain lines for different parts."

**Confidence:** High

---

**Major -- Missing `data-testid` for new Part column cell in table rows**

**Evidence:** plan:318 -- "Individual line testids (`pick-lists.detail.line.${lineId}.*`) are unchanged since they are keyed by line ID, not group." plan:228-229 -- "Each row renders: `PartInlineSummary` (compact, with link)..."

**Why it matters:** The plan adds a new "Part" column to each table row containing `PartInlineSummary`, but does not specify a `data-testid` for this cell. The plan's test scenario (plan:370) states "Then each table row contains a Part column showing the part description and key for that specific line" -- but there is no instrumented locator to select and assert against this content. The existing line-level `data-testid` (`pick-lists.detail.line.${lineId}`) wraps the entire `<tr>`, so a `containsText` assertion could work, but the plan should be explicit about the new `PartInlineSummary`'s `testId` prop for precise assertions. The current card-header rendering uses `testId={`pick-lists.detail.group.${groupId}.summary`}` for `PartInlineSummary` -- a similar pattern should be defined for the row-level Part cell.

**Fix suggestion:** Add a `data-testid` specification: each row's `PartInlineSummary` should receive `testId={`pick-lists.detail.line.${lineId}.part`}`. Document this in the Instrumentation section (Section 9) alongside the existing `data-testid` changes.

**Confidence:** High

---

**Minor -- Plan claims `box_description` property on Location ORM model is "preferred" but does not specify the alternative fallback**

**Evidence:** plan:150 -- "adding a `@property` to the Location model is preferred" and plan:396 -- "add `box_description` property) OR use a Pydantic `@computed_field`"

**Why it matters:** The plan leaves two implementation approaches as alternatives without committing to one. While this is labeled as a backend detail and the implementer will resolve it, the OR in slice 1 (plan:396) introduces ambiguity. The Location model `@property` approach requires the `box` relationship to be eagerly loaded (which the plan also specifies), while the Pydantic `@computed_field` approach would work differently. Leaving both open could cause an implementer to choose the computed_field path without adding the eager-load.

**Fix suggestion:** Commit to the `@property` approach on the Location model since the plan already specifies the eager-load change (plan:106). Remove the OR from slice 1 and state definitively: "Add `box_description` property to `backend/app/models/location.py`".

**Confidence:** Medium

---

**Minor -- `ListSectionHeader.title` accepts `string` but plan passes string interpolation**

**Evidence:** `src/components/primitives/list-section-header.tsx:6` -- `title: string;` and plan:227 -- `title="#${boxNo} - ${boxDescription}"`.

**Why it matters:** The `ListSectionHeader` component's `title` prop is typed as `string` (not `ReactNode`), which means the template literal `#${boxNo} - ${boxDescription}` will work correctly as a JavaScript string interpolation. No issue here -- this is a confirmation that the plan's usage is type-safe.

- Checks attempted: Verified `ListSectionHeader.title` type compatibility with plan's usage.
- Evidence: `src/components/primitives/list-section-header.tsx:6`, plan:227.
- Why the plan holds: The `title` prop is `string` and the plan passes a template literal string, which is valid.

---

## 6) Derived-Value & State Invariants (table)

- Derived value: `boxGroups`
  - Source dataset: `detail.lines` (all lines from the API response, unfiltered)
  - Write / cleanup triggered: Read-only `useMemo` derivation. Triggers re-render of `PickListLines` component. No cache writes or navigation.
  - Guards: Empty `detail.lines` produces empty `boxGroups[]`, rendering the existing empty state. Non-nullable `boxNo` and `boxDescription` are guaranteed by the backend schema.
  - Invariant: Every line in the input must appear in exactly one box group. The sum of `group.lines.length` across all groups must equal `detail.lines.length`. No line may be orphaned or duplicated by the grouping function.
  - Evidence: plan:210-219 (grouping algorithm), `src/types/pick-lists.ts:170-216` (current grouping for comparison).

- Derived value: `uniquePartKeys`
  - Source dataset: `detail.lines` (all lines, unfiltered, iterated directly -- not derived from groups)
  - Write / cleanup triggered: Feeds `usePickListAvailability` which creates parallel TanStack Query entries. No persistent writes.
  - Guards: Empty detail produces empty array; availability hook is disabled via `enabled: false`.
  - Invariant: The set of partKeys must match the actual parts in the pick list. Since extraction is line-based (not group-based), regrouping does not affect this derivation. This invariant holds regardless of grouping strategy.
  - Evidence: plan:236-240, `src/hooks/use-pick-list-detail.ts:77-86`.

- Derived value: Per-line availability quantity
  - Source dataset: `availability.availabilityByPartKey` map (keyed by partKey) + individual line's `(kitContent.partKey, location.boxNo, location.locNo)`.
  - Write / cleanup triggered: Read-only lookup per table row render. No cache mutation.
  - Guards: Returns `null` when availability data is not yet loaded or partKey is missing. Returns `0` when the specific location has no stock entry.
  - Invariant: The lookup key `(partKey, boxNo, locNo)` must use the line's own `kitContent.partKey`, not a group-level partKey. After regrouping by box, a single group may contain lines for different parts, so the partKey MUST come from the line, not the group. The current code uses `group.partKey` which must change.
  - Evidence: plan:260-265, `src/hooks/use-pick-list-availability.ts:150-167`, `src/components/pick-lists/pick-list-lines.tsx:213-218` (current code uses `group.partKey`).

---

## 7) Risks & Mitigations (top 3)

- Risk: The availability lookup currently reads `group.partKey` and this must change to `line.kitContent.partKey`. If missed, rows within multi-part box groups would show incorrect stock levels (silently displaying the wrong part's stock for some rows).
- Mitigation: TypeScript will catch a reference to `group.partKey` on `PickListBoxGroup` (which has no such field), so this cannot silently pass `pnpm check`. The plan should explicitly document this as a required change rather than "unchanged." Additionally, the Playwright test should seed a multi-part-per-box scenario to catch any lookup errors at runtime.
- Evidence: plan:230, `src/components/pick-lists/pick-list-lines.tsx:213-218`.

- Risk: The test data in the first Playwright spec (`shows live availability and highlights shortfalls`) seeds two parts in two **different** boxes. After the grouping change, this test will still pass but will not exercise the core new behavior (multiple parts in a single box group). The test could pass even if box grouping were broken for multi-part boxes.
- Mitigation: Update the existing test or add a new test that seeds two parts in the **same** box. Assert that the box group card contains both part descriptions in its table rows, and that each row's availability is correct for its respective part.
- Evidence: `tests/e2e/pick-lists/pick-list-detail.spec.ts:29-34` (creates `stockBoxA` and `stockBoxB` -- separate boxes).

- Risk: Column width management -- the new 7-column layout with `min-w` constraints (plan:350-361) totals 900px minimum width. Combined with the existing `overflow-x-auto` wrapper, this should work, but on smaller viewports the table will scroll horizontally. If the `Part` column's `PartInlineSummary` renders long descriptions, it could compress other columns.
- Mitigation: The plan already specifies `showCoverImage={false}` (plan:354) and the table is wrapped in `overflow-x-auto` (already present at `src/components/pick-lists/pick-list-lines.tsx:193`). The `table-fixed` class with percentage-based widths will prevent runaway expansion. Visual testing on common viewport widths during implementation will catch layout issues.
- Evidence: plan:350-361 (column layout), `src/components/pick-lists/pick-list-lines.tsx:195` (existing `table-fixed`).

---

## 8) Confidence

Confidence: High -- The plan is well-researched with accurate file references and demonstrates correct understanding of the codebase's data flow. The issues identified are addressable without changing the approach, and TypeScript strict mode provides a strong safety net for the type-level changes.
