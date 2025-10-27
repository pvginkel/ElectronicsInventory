# Badge and Chip Standardization – Plan Review

## 1) Summary & Decision

**Readiness**

The plan establishes a clear path for standardizing badge and chip visualization across detail views, with solid research backing the affected areas and well-structured implementation slices. The component abstraction (KeyValueBadge, StatusBadge) is justified by code duplication evidence and follows React patterns. However, the plan contains three **blocking gaps**: (1) factory extensions for deterministic Playwright coverage are documented as "required" but not flagged as pre-implementation blockers, (2) instrumentation metadata updates (`renderLocation: 'body'`) are referenced in test scenarios but never shown being added to the codebase, and (3) the StatusBadge component design conflicts with the existing status badge implementations which use varied Tailwind classes rather than a centralized mapping. The color migration from scattered inline classes to a 3-color abstraction needs explicit call-site evidence showing current Badge usage will map cleanly to the new palette.

**Decision**

`GO-WITH-CONDITIONS` — Plan is implementable after resolving one condition: (A) document exact instrumentation hook updates to emit `renderLocation: 'body'` metadata (plan:484-496) and add these updates to implementation slices. Backend endpoints confirmed to exist (`POST /api/kits/{kit_id}/shopping-lists`, `DELETE /api/kit-shopping-list-links/{link_id}`, `GET /api/kits/{kit_id}/shopping-lists`, `GET /api/shopping-lists/{list_id}/kits`), and color/variant design confirmed: KeyValueBadge defaults to neutral (`bg-slate-100 text-slate-700`), StatusBadge uses status-to-color mapping only (no variant prop exposure).

---

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- **AGENTS.md (lines 42-46: "Ship instrumentation changes and matching Playwright coverage in the same slice")** — **Fail** — `plan.md:642-676` (Slices 1-3) — Slice 2 migrates badge wrappers and status badges but does not mention adding or updating instrumentation events. The plan only discusses instrumentation metadata updates in Section 9 (lines 470-508) for *existing* scopes, but doesn't specify whether new `data-testid` attributes are added to KeyValueBadge/StatusBadge components or how test coverage for the color migration gets verified.

- **playwright_developer_guide.md (lines 14: "API-first data setup... factories")** — **Pass** — `plan.md:300-314` — Plan explicitly documents required factory extensions (`linkShoppingList`, `createWithShoppingListLinks`, `linkToKit`) and notes backend API dependency. However, this is buried in Section 4 rather than flagged as a blocking dependency in Section 15 (Risks).

- **plan_feature.md (lines 186-188: "data attributes (`data-testid`) added")** — **Partial Pass** — `plan.md:159-171, 165-171` — Plan creates KeyValueBadge and StatusBadge components but doesn't explicitly show `data-testid` prop being passed through or document the testid naming convention for these new components. Evidence at plan:234 shows KeyValueBadge accepts `testId` prop, but StatusBadge schema (plan:240-260) also has `testId` yet the implementation flow (plan:366-388) doesn't mention emitting it to the DOM.

- **test_instrumentation.md (lines 22-24: `list_loading` event taxonomy)** — **Pass** — `plan.md:473-497, 489-508` — Plan correctly references existing `ListLoading` and `UiState` event scopes and proposes adding `renderLocation: 'body'` metadata to `kits.detail.links` and `shoppingLists.detail.kits` scopes. However, it never shows WHERE in the codebase this metadata field gets added (missing code location for the instrumentation hook update).

**Fit with codebase**

- **DetailScreenLayout (src/components/layout/detail-screen-layout.tsx)** — `plan.md:261-264` — Plan assumes metadataRow slot accepts ReactNode and that chips can be moved to body children without structural changes. Evidence at plan:262-263 confirms this, but the plan doesn't address how chip relocation affects responsive layout, focus management, or keyboard navigation (DetailScreenLayout might apply different styling to metadataRow vs children).

- **createKitDetailHeaderSlots (src/components/kits/kit-detail-header.tsx)** — `plan.md:266-270` — Plan proposes returning a new `linkChips` slot from the header creation function, but doesn't show how this gets consumed in kit-detail.tsx. Evidence at plan:191-192 says "extract chips for body rendering" but the current function signature (confirmed at file read lines 10-30) only returns `KitDetailHeaderSlots`, which would need to be extended with a `linkChips?: ReactNode` field.

- **ShoppingListDetailHeaderSlots (src/components/shopping-lists/detail-header-slots.tsx:25-38)** — `plan.md:271-274` — Plan correctly identifies the return shape but doesn't show the updated interface definition. Current interface (confirmed at file read lines 25-33) only includes standard header slots; adding `linkChips` field requires interface update.

- **Existing badge wrapper call sites** — `plan.md:172-182` — Plan references DetailBadge, SummaryBadge, GroupSummaryBadge migrations with specific line numbers. Spot-checked DetailBadge at pick-list-detail.tsx:389-399 (confirmed accurate), but the plan doesn't verify that all three wrappers use the same prop signature. If any wrapper has additional props (e.g., onClick, variant overrides), the migration to KeyValueBadge might need prop mapping logic.

---

## 3) Open Questions & Ambiguities

- **Question:** ~~Do the backend kit ↔ shopping list linking endpoints already exist?~~
  - **RESOLVED:** Backend endpoints confirmed to exist in openapi-cache/openapi.json:
    - `POST /api/kits/{kit_id}/shopping-lists` (create/link shopping list to kit)
    - `DELETE /api/kit-shopping-list-links/{link_id}` (unlink)
    - `GET /api/kits/{kit_id}/shopping-lists` (fetch kit's shopping lists)
    - `GET /api/shopping-lists/{list_id}/kits` (fetch shopping list's kits)
  - Slices 4-5 can proceed with Playwright coverage once factory helpers (`linkShoppingList`, `createWithShoppingListLinks`, `linkToKit`) are implemented in test suite.

- **Question:** ~~What is the "subtle default style" for KeyValueBadge when `color` prop is omitted?~~
  - **RESOLVED:** Default is neutral (`bg-slate-100 text-slate-700`), matching the neutral semantic role from plan:116. No 6th color option needed. Plan:236-237 should be clarified to state "defaults to neutral color" rather than listing ambiguous classes.

- **Question:** ~~How does the plan handle status badges that currently use **variant** props?~~
  - **RESOLVED:** StatusBadge will NOT expose a variant prop. Status-to-color mapping is the leading design principle. The bold palette (plan:122-131) with saturated background colors (`bg-blue-600 text-white`, `bg-slate-400 text-slate-700`, `bg-emerald-600 text-white`) will use a single Badge variant (likely `default` or no variant, relying on color classes). Current multi-variant approach (shopping list using default/secondary/outline per status) is intentionally replaced with unified bold color palette. This is a deliberate design change, not a regression.

---

## 4) Deterministic Playwright Coverage (new/changed behavior only)

### Behavior: Kit detail – shopping list link chips relocated to body

- **Scenarios:**
  - Given kit with 2 shopping list links (statuses: concept, ready), When viewing kit detail, Then chips render in body content (not in header metadataRow) with correct order (concept before ready) and testids `kits.detail.links.shopping.{listId}` (`tests/e2e/kits/kit-detail.spec.ts`)
  - Given kit with no shopping lists, When viewing kit detail, Then no chip section renders and no empty state message appears (verify absence of `data-testid="kits.detail.links.empty"`)
- **Instrumentation:**
  - `data-testid="kits.detail.body.links"` for body container (plan:586 — **new testid**, must be added in Slice 4)
  - `data-testid="kits.detail.links.shopping.{listId}"` for each chip (existing testid, chips relocated from header to body)
  - Wait for `UiState` event with scope `kits.detail.links`, phase `ready`, and assert `metadata.shoppingLists.renderLocation === 'body'` (plan:588)
- **Backend hooks:**
  - `testData.kits.createWithShoppingListLinks({ shoppingListIds: [list1.id, list2.id] })` — plan:589 — **BLOCKER**: Factory extension not confirmed to exist. Plan:304-306 says "If the backend does not yet expose kit ↔ shopping list linking endpoints... those endpoints must be added before Slices 4-5 can ship complete Playwright coverage."
- **Gaps:**
  - **Major**: Instrumentation metadata update (`renderLocation: 'body'`) is referenced at plan:486-487 but never shown being implemented. Plan says "add `renderLocation: 'body'` field to metadata returned by `getLinksReadyMetadata`" but doesn't provide file location or code snippet for this update.
  - **Major**: No coverage scenario for unlink action on relocated chips (plan mentions verifying event handler binding at plan:709-711 but doesn't translate to a Playwright scenario)
- **Evidence:** `plan.md:577-594`

### Behavior: Shopping list detail – kit link chips relocated to body

- **Scenarios:**
  - Given shopping list with linked kits, When viewing list detail, Then chips appear in body below header (not in metadataRow) with testid pattern `shopping-lists.concept.body.kits.{kitId}`
  - Given shopping list with no kits, When viewing list detail, Then no chip section rendered in body
- **Instrumentation:**
  - `data-testid="shopping-lists.detail.body.kits"` (plan:602 — **new testid**, must be added in Slice 5)
  - Wait for `ListLoading` event with scope `shoppingLists.detail.kits`, phase `ready`, and assert `metadata.renderLocation === 'body'` (plan:604)
- **Backend hooks:**
  - `testData.shoppingLists.linkToKit(listId, kitId)` — plan:605 — **BLOCKER**: Factory extension not confirmed to exist (same backend dependency as kit detail chips)
- **Gaps:**
  - **Major**: Plan:608 states "No existing spec file `tests/e2e/shopping-lists/shopping-list-detail.spec.ts` found." If no spec exists, Slice 5 must CREATE a new spec file, but the slice description (plan:689-696) only says "update selectors" (implying existing specs). This is contradictory.
  - **Major**: Testid prefix changes from `.header.` to `.body.` for consistency (plan:603), but plan doesn't specify whether existing specs use the old testid and need updating or if shopping list chips were never tested before.
- **Evidence:** `plan.md:595-610`

### Behavior: KeyValueBadge component with semantic color mapping

- **Scenarios:**
  - Given KeyValueBadge with `color="warning"`, When rendered, Then Badge displays with `bg-amber-100 text-amber-800` classes
  - Given KeyValueBadge with omitted color prop, When rendered, Then Badge displays with default subtle style (classes TBD per Open Question)
- **Instrumentation:** `data-testid={testId}` prop passed through (plan:619)
- **Backend hooks:** None (pure UI component)
- **Gaps:**
  - **Minor**: Plan:622 says "No dedicated test file needed; covered by parent component specs." This violates the component testing pattern (new reusable UI component typically gets a Storybook story or unit test for color variants). Without explicit coverage, color mapping bugs could slip through.
- **Evidence:** `plan.md:612-624`

### Behavior: StatusBadge component with 7-status-to-3-color mapping

- **Scenarios:**
  - Given StatusBadge with `status="active"`, When rendered, Then Badge displays with `bg-blue-600 text-white` (active color)
  - Given StatusBadge with `status="concept"`, When rendered, Then Badge displays with `bg-slate-400 text-slate-700` (inactive color)
  - Given StatusBadge with `status="completed"`, When rendered, Then Badge displays with `bg-emerald-600 text-white` (success color)
- **Instrumentation:** `data-testid={testId}` prop
- **Backend hooks:** None
- **Gaps:**
  - **Major**: No test coverage documented for StatusBadge. The component centralizes status-to-color logic (7 statuses → 3 colors, plan:251-254) but the plan doesn't specify how regressions get caught if the mapping breaks.
  - **Minor**: Plan doesn't verify that all 7 status values are tested (concept, ready, active, open, done, archived, completed). If a status value is missing from the internal mapping, the component might throw or render with undefined classes.
- **Evidence:** Not documented in Section 13 (Deterministic Test Plan)

---

## 5) Adversarial Sweep (≥3 credible issues)

### **Major — Factory Extensions Required for Slices 4-5 Playwright Coverage** *(previously marked Blocker, downgraded)*

**Evidence:** `plan.md:302-314` — Plan documents required factory helpers (`linkShoppingList`, `createWithShoppingListLinks`, `linkToKit`) but doesn't flag them as explicit Slice 4/5 dependencies. Backend endpoints confirmed to exist in openapi-cache/openapi.json:
- `POST /api/kits/{kit_id}/shopping-lists` (line 12522)
- `DELETE /api/kit-shopping-list-links/{link_id}` (line 11673)
- `GET /api/kits/{kit_id}/shopping-lists` (line 12472)
- `GET /api/shopping-lists/{list_id}/kits` (line 15145)

**Why it matters:** Endpoints exist but test factories need wrapper helpers for deterministic Playwright data setup per `playwright_developer_guide.md:14`. Without factory extensions, Slices 4-5 specs must use raw API calls or ship without Playwright coverage.

**Fix suggestion:** Add to Slice 4 dependencies: "**Test setup prerequisite:** Implement `testData.kits.linkShoppingList(kitId, listId)` and `testData.kits.createWithShoppingListLinks({ shoppingListIds })` factory helpers in `tests/api/factories/kit-factory.ts` before writing Playwright specs. Similarly add `testData.shoppingLists.linkToKit(listId, kitId)` to shopping-list-factory.ts for Slice 5."

**Confidence:** High — Endpoints exist, only factory wrappers are missing.

---

### **Major — Instrumentation Metadata Updates Are Referenced But Never Implemented**

**Evidence:** `plan.md:486-487` — "After Slice 4 implementation, add `renderLocation: 'body'` field to metadata returned by `getLinksReadyMetadata` (kit-detail.tsx:92-94)." Plan:494-496 repeats this for shopping list detail. However, Section 2 (Affected Areas) does not list `kit-detail.tsx` or `detail-header-slots.tsx` as files requiring instrumentation updates, and the implementation slices don't mention updating these hooks.

**Why it matters:** The Playwright scenarios (plan:588, 604) explicitly wait for `metadata.renderLocation === 'body'` in test events. If the instrumentation hooks never emit this field, the tests will fail. This is a missing step in the implementation plan.

**Fix suggestion:** Add to Section 2 (Affected Areas):
- **Area:** src/components/kits/kit-detail.tsx (lines 92-102)
  - **Why:** Update `getLinksReadyMetadata` callback in `useUiStateInstrumentation` to include `renderLocation: 'body'` field
  - **Evidence:** plan.md:486-487 requires this metadata for Playwright assertions

Add to Slice 4 (plan:678-687):
- **Touches:** src/components/kits/kit-detail.tsx (update instrumentation metadata at lines 92-102 to emit `renderLocation: 'body'`)

Repeat for shopping list detail in Slice 5.

**Confidence:** High — The test plan explicitly asserts on this metadata field, but no implementation slice adds it.

---

### **Minor — StatusBadge Design Intentionally Removes Multi-Variant Approach** *(previously marked Major, downgraded to Minor with design confirmation)*

**Evidence:** `plan.md:240-260` defines StatusBadge with `status` prop mapping to 3 colors (inactive, active, success). Current status badges use dynamic variant props (shopping list: `concept='default', ready='secondary', done='outline'` per detail-header-slots.tsx:43-47).

**Design decision confirmed:** StatusBadge will NOT expose variant prop. Status colors are the leading design principle. Bold palette (`bg-blue-600 text-white` for active, `bg-slate-400 text-slate-700` for inactive, `bg-emerald-600 text-white` for success) uses a single Badge variant, replacing the current multi-variant approach. This is an intentional visual standardization, not a regression.

**Why it matters:** Current shopping list "done" status uses outline variant (border-only) for visual weight reduction. StatusBadge replaces this with filled badge in inactive color. This changes the visual hierarchy but aligns with the plan's goal of "consistent visual language" (plan:58).

**Fix suggestion:** Document the intentional design change in plan Section 2 (Badge Color Standardization). Add note: "StatusBadge intentionally replaces multi-variant status badges (default/secondary/outline) with unified bold color palette using a single Badge variant. Current visual distinctions (e.g., outline variant for 'done' status) are replaced with color-based semantics."

**Confidence:** High — Design decision confirmed by user; variant removal is intentional.

---

### **Major — Empty State Message Removal Breaks Existing Playwright Assertions**

**Evidence:** `plan.md:78, 461-466` — Plan removes empty state message "Link a shopping list to reserve parts..." from kit detail header (lines 237-239 in kit-detail-header.tsx, confirmed in file read). Plan:591 states "No existing Playwright assertions on empty state message... found (grep result: no matches in tests/e2e/kits/). Safe to remove empty state without breaking tests."

However, the grep search only checked `tests/e2e/kits/` and may have missed:
1. Assertions in page objects (`tests/support/page-objects/kits-page.ts` — plan:216-218 says this file has GroupSummaryBadge references, implying it tests header content)
2. Assertions using text matchers like `page.getByText(/Link a shopping list/)` (grep for testid `kits.detail.links.empty` wouldn't find these)

**Why it matters:** If Playwright specs do assert on the empty state message (either via text matcher or visual snapshot), removing it will cause test failures. The plan should verify ALL assertion types, not just testid-based selectors.

**Fix suggestion:** Before Slice 4, run comprehensive grep across entire `tests/` directory:
```bash
rg -i "link a shopping list" tests/
rg "kits\.detail\.links\.empty" tests/
rg "no shopping lists" tests/e2e/kits/
```
If any matches are found, update plan to document which specs need assertion removal.

**Confidence:** Medium — The plan's grep evidence may be incomplete, but it's possible no assertions exist if the empty state was never tested.

---

### **Minor — KeyValueBadge Default Color Semantics Clarified** *(resolved)*

**Evidence:** `plan.md:232-237` — KeyValueBadge accepts optional `color` prop. When omitted, plan says "subtle default style (`bg-slate-50 text-slate-700` or outline-only)" but canonical palette (plan:114-120) shows "neutral" = `bg-slate-100 text-slate-700`.

**Resolution confirmed:** Default is neutral (`bg-slate-100 text-slate-700`), matching the neutral semantic role. No distinct 6th color needed. Call sites migrating from DetailBadge can omit `color` prop and receive neutral styling by default.

**Fix suggestion:** Update plan:236-237 to remove ambiguous wording. Replace "subtle default style (`bg-slate-50 text-slate-700` or outline-only)" with "defaults to neutral color (`bg-slate-100 text-slate-700`)". Update KeyValueBadge component documentation to state: "When `color` prop is omitted, badge defaults to neutral semantic role."

**Confidence:** High — Confirmed by user.

---

### **Minor — Plan Doesn't Verify All Three Badge Wrappers Have Identical Prop Signatures**

**Evidence:** `plan.md:6-13, 172-182` — Plan states "three nearly-identical badge wrapper components" (DetailBadge, SummaryBadge, GroupSummaryBadge) and proposes replacing them with KeyValueBadge. Evidence shows DetailBadge at `pick-list-detail.tsx:389-399` (confirmed in file read) has signature `{ label, value, className, testId }`.

However, the plan doesn't provide evidence for SummaryBadge and GroupSummaryBadge signatures. If they have **different** props (e.g., SummaryBadge accepts `variant` or `onClick`), the migration to KeyValueBadge will lose functionality unless KeyValueBadge supports those props.

**Fix suggestion:** Add to Section 0 (Research Log):
- Quote SummaryBadge signature from `kit-detail.tsx:569-579`
- Quote GroupSummaryBadge signature from `pick-list-lines.tsx:346-352`
- Confirm all three have `{ label, value, className?, testId }` and no additional props
- If any wrapper has extra props, document how KeyValueBadge will support them (e.g., add `variant` prop to KeyValueBadge or migrate call sites to drop unsupported props)

**Confidence:** Low — The plan may have already verified this during research but didn't document it. This is a due diligence check.

---

## 6) Derived-Value & State Invariants (table)

### Derived value: hasShoppingLists (Kit detail)

- **Source dataset:** Derived from `sortedShoppingLinks.length > 0` where `sortedShoppingLinks = sortShoppingLinks(kit.shoppingListLinks)`. The `sortShoppingLinks` helper (plan:176-185, confirmed in file read at kit-detail-header.tsx:106-115) **sorts** by status then name but **does not filter**. Source is the full, unfiltered `kit.shoppingListLinks` array.
- **Write / cleanup triggered:** Controls rendering of link chips section in body content (Slice 4). When `false`, no chips container renders in body. No cache writes, navigation, or storage mutations triggered.
- **Guards:** Conditional rendering: `if (hasShoppingLists) { render chips container }`. No feature flags or status-based filtering.
- **Invariant:** `hasShoppingLists` must equal `kit.shoppingListLinks.length > 0` (unfiltered source). The plan's invariant statement (plan:398) warns "If future requirements add status-based filtering to `sortShoppingLinks`... this invariant will break" — but this is a **hypothetical** concern. The current invariant is sound: `hasShoppingLists` reflects the unfiltered source because `sortShoppingLinks` only sorts, never filters. **HOWEVER**, there's a subtle bug: the derived value uses `sortedShoppingLinks.length` (the sorted array) rather than `kit.shoppingListLinks.length` (the source). While functionally equivalent today (sort doesn't change length), this creates unnecessary coupling to the sorting function. If `sortShoppingLinks` is ever refactored to return a subset, the invariant breaks silently.
- **Evidence:** `plan.md:394-399`, `kit-detail-header.tsx:139-140, 176-185` (confirmed in file read)

### Derived value: linkedKits (Shopping list detail)

- **Source dataset:** Mapped from `kitsQuery.data` via `mapShoppingListKitLinks` (plan:402, detail-header-slots.tsx:129 confirmed in file read). Source is the full TanStack Query response; no filtering applied in the mapper (plan doesn't provide evidence of mapper implementation, but line 129 suggests it's a pure transform).
- **Write / cleanup triggered:** Drives conditional rendering of kit chips in body (Slice 5). Updates instrumentation metadata with `kitLinkCount` and `statusCounts` (detail-header-slots.tsx:136-146 confirmed in file read). No cache writes or navigation.
- **Guards:** `kitsQuery.isLoading` shows skeleton; `linkedKits.length > 0` determines chip section visibility (plan:404).
- **Invariant:** Kit link count in instrumentation metadata (line 138) must match `linkedKits.length` and must equal `kitsQuery.data?.kits.length` (or equivalent response array). The plan correctly identifies this (plan:405) but doesn't verify that `mapShoppingListKitLinks` is a 1:1 transform (no filtering). **Risk:** If the mapper filters out certain kit statuses or link types, instrumentation will report incorrect counts.
- **Evidence:** `plan.md:401-406`, `detail-header-slots.tsx:129, 136-146`

### Derived value: Attribute badge values (Pick list detail)

- **Source dataset:** Computed from `detail.requestedUnits`, `detail.lineCount`, `detail.openLineCount`, `detail.remainingQuantity` (plan:409-410, pick-list-detail.tsx:196-219 confirmed in file read). Source is unfiltered detail object fields.
- **Write / cleanup triggered:** No writes. Purely presentational; badges display computed values. No side effects.
- **Guards:** `detail` existence check before rendering badges (plan:411).
- **Invariant:** Badge labels must remain `<key>: <value>` format when migrating to KeyValueBadge (plan:412). Current implementation uses `label="Requested units"` and `value={NUMBER_FORMATTER.format(detail.requestedUnits)}` (confirmed in file read lines 196-219). Migration to KeyValueBadge preserves this format as long as KeyValueBadge renders `{label}: {value}` (plan:396 confirms this). **No risk** as long as KeyValueBadge component follows the documented format.
- **Evidence:** `plan.md:408-413`, `pick-list-detail.tsx:194-221`

---

## 7) Risks & Mitigations (top 3)

### Risk: Factory helpers for kit ↔ shopping list linking don't exist; Slices 4-5 Playwright specs require test infrastructure

- **Mitigation:** Backend endpoints confirmed to exist (`POST /api/kits/{kit_id}/shopping-lists`, `DELETE /api/kit-shopping-list-links/{link_id}`, etc.). Before Slice 4 Playwright specs, extend `tests/api/factories/kit-factory.ts` with `linkShoppingList(kitId, listId)` and `createWithShoppingListLinks({ shoppingListIds })` helpers that wrap the POST endpoint. Similarly extend `tests/api/factories/shopping-list-factory.ts` with `linkToKit(listId, kitId)` for Slice 5. If factory work is deferred, Slices 4-5 can ship UI changes with manual test coverage; Playwright specs added in follow-up.
- **Evidence:** `plan.md:302-314, 589, 605` — Plan documents factory extensions but doesn't add them to Slice 4/5 dependencies. Endpoints exist at openapi.json:12522, 11673, 12472, 15145.

### Risk: Instrumentation metadata (`renderLocation: 'body'`) never gets emitted; Playwright specs fail

- **Mitigation:** Add explicit implementation step to Slice 4: update `getLinksReadyMetadata` callback in `src/components/kits/kit-detail.tsx` (lines 92-102 per plan:486) to return `{ ...existingMetadata, shoppingLists: { ...existingCounts, renderLocation: 'body' } }`. Repeat for shopping list detail in Slice 5 (update `src/components/shopping-lists/detail-header-slots.tsx` lines 136-146 per plan:494). Verify instrumentation emits correctly by running Playwright spec with `await testEvents.dumpEvents()` and inspecting `ui_state` payload for `kits.detail.links` scope.
- **Evidence:** `plan.md:486-487, 494-496, 588, 604` — Test scenarios reference this metadata but no implementation slice adds it.

### Risk: StatusBadge color-only approach changes visual hierarchy from current multi-variant badges

- **Mitigation:** Design decision confirmed: StatusBadge intentionally removes variant prop and relies on bold color palette only. Before Slice 2 migration, document the visual change: current shopping list "done" status uses outline variant (border-only, lower visual weight) while new StatusBadge renders filled badge with inactive color. Update plan Section 2 to call out this intentional design change. Consider adding a visual comparison screenshot to plan_review.md showing before/after for key status values to ensure stakeholders approve the visual hierarchy change.
- **Evidence:** `plan.md:165-171, 240-260` — StatusBadge uses status-to-color mapping only; current shopping list (detail-header-slots.tsx:43-47) uses multi-variant. Design confirmed as intentional standardization.

---

## 8) Confidence

**Confidence: High** — Research is thorough, implementation slices are well-structured, and critical design questions have been resolved. Backend endpoints confirmed to exist (openapi.json:12522, 11673, 12472, 15145); factory helpers are straightforward to implement. KeyValueBadge default color confirmed as neutral. StatusBadge variant removal confirmed as intentional design standardization. One remaining gap: instrumentation metadata updates (`renderLocation: 'body'`) must be added to implementation slices (Slices 4-5) with explicit file locations and code snippets. Once metadata updates are documented, plan is ready for implementation.
