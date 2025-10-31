# Badge Chip Standardization – Plan Review

**Reviewer**: Claude (Sonnet 4.5)
**Review Date**: 2025-10-27
**Plan Version**: docs/features/badge_chip_standardization/plan.md (updated 2025-10-27)

---

## 1) Summary & Decision

**Readiness**

The plan delivers comprehensive coverage of badge standardization with strong evidence (file:line citations), well-structured 9-slice implementation, and explicit Playwright scenarios. The two-component abstraction (KeyValueBadge for `<key>: <value>` metrics, StatusBadge for entity state) is architecturally sound and eliminates duplication of three inline badge wrappers. Research log documents conflicts resolution (Part detail already follows target pattern; kit/shopping list chips need relocation). However, critical gaps exist: (1) **accessibility validation missing** — StatusBadge replaces variant-based distinction with 3 colors without WCAG contrast validation or color-blind testing; (2) **instrumentation type contracts undefined** — adding `renderLocation: 'body'` to metadata lacks TypeScript interface definitions; (3) **factory extension sequencing ambiguous** — helpers documented as "prerequisite" but listed in Slice 4 "Touches"; (4) **conditional color API unvalidated** — box Usage badge requires runtime color computation but KeyValueBadge API doesn't show pattern; (5) **testid migration incomplete** — shopping list chip testid prefix change (`.header.` → `.body.`) not grepped for existing spec usage.

**Decision**

`GO-WITH-CONDITIONS` — Plan structure is strong and scope is complete (35-40 badges across 15+ files), but requires fixes before Slices 4-9: **(A)** Add accessibility validation section (WCAG contrast, color-blind simulation) for StatusBadge 3-color palette; **(B)** Define TypeScript interfaces for metadata extension (`renderLocation` field); **(C)** Split factory work into Slice 3.5 or clarify it's internal to Slice 4; **(D)** Show KeyValueBadge conditional color usage pattern (box Usage threshold); **(E)** Grep for shopping list chip testid usage in specs. Slices 1-3 can proceed with KeyValueBadge/StatusBadge creation and Build target relocation pending variant-color interaction clarification.

---

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `docs/commands/plan_feature.md` — **Pass** — plan.md:0-997 — All 16 template sections present with file:line evidence. Research log (Section 0) documents discovery and conflicts. Intent quotes prompt verbatim (plan.md:82-87). Affected areas exhaustive with evidence (Section 2). Deterministic test plan includes scenarios, instrumentation, backend hooks (Section 13).

- `docs/product_brief.md` — **Pass** — plan.md:75-131 — Scope aligns with product model. Badge standardization supports existing workflows (brief sections 10-11: kits, shopping lists, pick lists, parts, boxes). No new entities introduced. Badge color semantics map to domain concepts (neutral for general metrics, warning for open/remaining work, success for completed, danger for shortfalls).

- `AGENTS.md` lines 42-46 ("Ship instrumentation changes and matching Playwright coverage in the same slice") — **Partial Fail** — plan.md:606-633, 814-912 — Instrumentation metadata extension documented (plan.md:621-632: add `renderLocation: 'body'`), but Slice 4-5 touches don't include instrumentation hook files. Plan.md:316-317 says "update instrumentation metadata" but Section 2 (Affected Areas) doesn't list `kit-detail.tsx:92-102` or `detail-header-slots.tsx:136-146` as files requiring updates. Slice deliverables incomplete.

- `docs/contribute/architecture/application_overview.md` — **Pass** — plan.md:206-218 — New badge components placed in `src/components/ui/` per directory structure (overview.md:18-21). Uses TanStack Query cache as source of truth (plan.md:555-567 confirms query invalidation approach).

- `docs/contribute/testing/playwright_developer_guide.md` lines 14 ("API-first data setup") — **Pass** — plan.md:432-450, 713-746 — Factory extensions documented (`linkShoppingList`, `createWithShoppingListLinks`, `linkToKit`) with backend endpoint evidence (openapi.json:12522, 11673, 12472, 15145). However, sequencing ambiguous (see Open Question #1). Guide lines 163-164 require test-specific hooks for deterministic behavior; plan complies.

**Fit with codebase**

- `src/components/ui/` — plan.md:206-218 — New KeyValueBadge and StatusBadge align with existing UI library. Both extend base Badge component. No conflicts.

- `DetailScreenLayout` metadataRow slot — plan.md:391-394 — Plan assumes slot accepts ReactNode. Evidence at plan.md:262 references detail-screen-layout.tsx:4-26; assumption valid. Chip relocation to body (children slot) doesn't alter layout API.

- `createKitDetailHeaderSlots` return shape — plan.md:396-399 — Plan proposes returning `linkChips` slot. Current signature at kit-detail-header.tsx:10-30 returns `KitDetailHeaderSlots`; interface extension required. Plan.md:316-317 acknowledges this but doesn't show updated interface definition (TypeScript type gap).

- `useShoppingListDetailHeaderSlots` return shape — plan.md:401-404 — Similar to kit header; adds `linkChips` field to `ShoppingListDetailHeaderSlots`. Plan.md:322-324 documents this but doesn't show interface update.

- Badge wrapper call sites — plan.md:220-231 — DetailBadge (pick-list-detail.tsx:389-399), SummaryBadge (kit-detail.tsx:569-579), GroupSummaryBadge (pick-list-lines.tsx:346-352) all accept `{ label, value, className, testId }`. Plan doesn't verify signature uniformity across all three (minor risk if wrappers differ).

- TanStack Query invalidation — plan.md:555-567 — Plan states query invalidation triggers chip re-render but doesn't document cache keys or mutation invalidation scope. Kit chips render from `useKitDetail`; shopping list chips from `useGetShoppingListsKitsByListId`. Unlink mutation (plan.md:587-592) should invalidate both queries; plan doesn't validate this.

---

## 3) Open Questions & Ambiguities

**1. Factory extension sequencing**

- **Question**: Should factory helpers (`linkShoppingList`, `createWithShoppingListLinks`, `linkToKit`) be implemented as a separate prerequisite slice before Slice 4, or as part of Slice 4's internal ordering?
- **Why it matters**: Plan.md:432-450 says helpers are "required before Slices 4-5" and Slice 4 (plan.md:825) says "Test setup prerequisite: Implement factory helpers... *before writing Playwright specs*", but lists `tests/api/factories/kit-factory.ts` under Slice 4's "Touches" (plan.md:820). This creates ambiguity: if factories are prerequisite, they need separate completion criteria; if they're part of Slice 4, "before specs" implies internal ordering (factories first, UI second, then specs).
- **Needed answer**: Either **(A)** create "Slice 3.5: Extend Test Factories" with deliverable: `linkShoppingList`, `createWithShoppingListLinks`, `linkToKit` + optional unit tests; update Slice 4 deps to "Slice 3.5 complete"; remove factory files from Slice 4 touches. Or **(B)** clarify Slice 4 description: "Slice 4 completes factory extensions before chip relocation UI work; specs are final deliverable."

**2. KeyValueBadge conditional color pattern**

- **Question**: How do call sites pass computed color values when color depends on runtime data (e.g., box Usage badge: `color="danger"` if usagePercentage ≥90%, else `color="neutral"`)?
- **Why it matters**: KeyValueBadge API (plan.md:353-363) accepts `color?: 'neutral' | 'info' | 'warning' | 'success' | 'danger'` but doesn't show usage. Slice 9 (plan.md:904-906) requires box Usage conditional color (plan.md:306-307) but doesn't validate pattern. If `color` prop is reactive, `<KeyValueBadge color={usagePercentage >= 90 ? 'danger' : 'neutral'} .../>` works; if static, pattern invalid.
- **Needed answer**: Add code sample to Section 5 (Algorithms & UI Flows):
  ```tsx
  <KeyValueBadge
    label="Usage"
    value="{usagePercentage}%"
    color={usagePercentage >= 90 ? 'danger' : 'neutral'}
    testId="boxes.detail.badge.usage"
  />
  ```
  Confirm KeyValueBadge re-renders with new color classes on prop change (React standard behavior, but validate component doesn't cache classes).

**3. StatusBadge 'new' status semantic mapping justification**

- **Question**: Why does StatusBadge map shopping list line status `'new'` to "inactive" color (plan.md:377) when 'new' represents active work awaiting order, not planning phase?
- **Why it matters**: Plan.md:377 states "concept, done, archived, **new** (planning phase) → **inactive** color" but gaps.md:49-74 shows 'new' is used for shopping list lines ready to order (active work). Mapping 'new' to inactive (slate gray, same as 'concept'/'done'/'archived') semantically groups it with finished/planning states. Users may expect 'new' lines to have active visual weight.
- **Needed answer**: Either **(A)** justify mapping: "'new' lines haven't been ordered yet, so inactive color is correct" and document rationale in plan.md:377 note. Or **(B)** remap 'new' → active color and update plan.md:377, 383, gaps.md:56, 77.

**4. Variant-color interaction in KeyValueBadge**

- **Question**: How do `variant` and `color` props interact when both specified?
- **Why it matters**: Plan.md:358-362 shows KeyValueBadge accepts `variant?: 'default' | 'outline' | 'secondary'` (Badge base styling) and `color?: 'neutral' | ...` (Tailwind bg/text classes). If caller passes `variant="outline"` (border-only, no bg) + `color="danger"` (red bg), does outline override bg? Plan.md:494 says `variant={variant ?? 'outline'}` (defaults to outline) but doesn't document interaction.
- **Needed answer**: Simplify API by removing `variant` prop (use color as single axis) OR document precedence in Section 5: "variant controls Badge structure; color classes apply to wrapper. outline variant shows border + text color only; filled variants show bg + text."

**5. Shopping list chip testid prefix change verification**

- **Question**: Do existing Playwright specs query shopping list kit chips using `.header.` testid prefix?
- **Why it matters**: Plan.md:739 documents testid change from `shopping-lists.concept.header.kits.{kitId}` to `.body.kits.{kitId}` for consistency. Slice 5 says "update selectors" (plan.md:835) but doesn't verify whether specs use old testids. If specs exist and use `.header.` pattern, they'll break.
- **Needed answer**: Run `pnpm exec rg 'shopping-lists\..*\.header\.kits' tests/e2e/` and document results at plan.md:739. If matches found, list affected spec files in Slice 5 touches. If no matches, add note: "Grep confirmed no specs use `.header.kits.` testids; no updates required."

**6. Badge wrapper export scope**

- **Question**: Are DetailBadge, SummaryBadge, GroupSummaryBadge exported from their modules?
- **Why it matters**: Plan documents inline definitions (plan.md:220-231) and removal, but doesn't verify wrappers aren't exported/imported elsewhere. If other components import them, removal causes TypeScript errors outside documented scope.
- **Needed answer**: Run `pnpm exec rg 'import.*DetailBadge|import.*SummaryBadge|import.*GroupSummaryBadge' src/` to confirm no external usage. If matches found, expand Section 2 affected areas. If clean, add note: "Grep confirmed badge wrappers are local; removal safe."

---

## 4) Deterministic Playwright Coverage (new/changed behavior only)

**Behavior: Kit detail – shopping list link chips relocated to body**

- **Scenarios**:
  - Given kit with 2 shopping list links (concept, ready), When viewing kit detail, Then chips render in body content below header (not in metadataRow) with testids `kits.detail.links.shopping.{listId}` (`tests/e2e/kits/kit-detail.spec.ts`)
  - Given kit with no shopping lists, When viewing kit detail, Then no chip section renders and no empty state message (verify absence of empty state text "Link a shopping list...")
- **Instrumentation**: `data-testid="kits.detail.body.links"` (new container testid, must add in Slice 4); `data-testid="kits.detail.links.shopping.{listId}"` (existing chip testid, relocated); UiState event scope 'kits.detail.links' phase 'ready' with `metadata.shoppingLists.renderLocation === 'body'`
- **Backend hooks**: `testData.kits.createWithShoppingListLinks({ shoppingListIds: [list1.id, list2.id] })` — factory helper documented at plan.md:433-437; backend endpoints exist (openapi.json:12522, 11673, 12472)
- **Gaps**: **Major** — Instrumentation metadata update (`renderLocation: 'body'`) referenced at plan.md:621-622 but never shown being implemented. Slice 4 (plan.md:819) says "update instrumentation metadata" but doesn't list `kit-detail.tsx:92-102` under touches. Without metadata emission, spec assertion `metadata.shoppingLists.renderLocation === 'body'` will fail.
- **Evidence**: plan.md:713-729

**Behavior: Shopping list detail – kit link chips relocated to body**

- **Scenarios**:
  - Given shopping list with 2 kit links, When viewing list detail, Then chips render in body below header with testids `shopping-lists.detail.body.kits.{kitId}`
  - Given shopping list with no kits, When viewing list detail, Then no chip section rendered
- **Instrumentation**: `data-testid="shopping-lists.detail.body.kits"` (new container); ListLoading event scope 'shoppingLists.detail.kits' phase 'ready' with `metadata.renderLocation === 'body'`
- **Backend hooks**: `testData.shoppingLists.createList()` then `testData.shoppingLists.linkToKit(listId, kitId)` — factory helper documented at plan.md:440; backend endpoint openapi.json:15145
- **Gaps**: **Major** — Plan.md:744 states "No existing spec file `tests/e2e/shopping-lists/shopping-list-detail.spec.ts` found." Slice 5 (plan.md:835) says "update selectors" but if no spec exists, must CREATE spec. Contradictory. **Minor** — Testid prefix change (plan.md:739) not verified against existing specs (see Open Question #5).
- **Evidence**: plan.md:731-746

**Behavior: KeyValueBadge with semantic color mapping**

- **Scenarios**:
  - Given KeyValueBadge with `color="warning"`, When rendered, Then Badge displays `bg-amber-100 text-amber-800`
  - Given KeyValueBadge with color omitted, When rendered, Then Badge displays neutral color (plan.md:362: defaults to neutral `bg-slate-100 text-slate-700`)
  - Given component receives `variant="outline"`, When rendered, Then Badge uses outline variant (plan.md:358-362: variant prop accepted)
- **Instrumentation**: `data-testid={testId}` prop passed through (plan.md:755)
- **Backend hooks**: None (UI-only component)
- **Gaps**: **Minor** — Plan.md:758 says "No dedicated test file needed; covered by parent component specs." New reusable UI component typically gets Storybook story or unit test for variants. Without explicit coverage, color mapping bugs slip through.
- **Evidence**: plan.md:748-760

**Behavior: StatusBadge with 10-status-to-3-color mapping**

- **Scenarios**:
  - Given StatusBadge with `status="active"`, When rendered, Then Badge displays `bg-blue-600 text-white` (active color)
  - Given StatusBadge with `status="concept"`, When rendered, Then Badge displays `bg-slate-400 text-slate-700` (inactive color)
  - Given StatusBadge with `status="completed"`, When rendered, Then Badge displays `bg-emerald-600 text-white` (success color)
- **Instrumentation**: `data-testid={testId}` prop (plan.md:369-373)
- **Backend hooks**: None
- **Gaps**: **Major** — No test coverage scenario documented in Section 13. StatusBadge centralizes 10→3 mapping (plan.md:376-379) but plan doesn't specify how regressions get caught. If mapping has typo (e.g., `concept: 'inactiv'`), component fails at runtime. TypeScript exhaustiveness check not validated.
- **Evidence**: Not documented in plan.md Section 13

**Behavior: Box detail Usage badge with conditional color threshold**

- **Scenarios**:
  - Given box with 95% usage, When viewing detail, Then Usage badge shows "Usage: 95%" with color="danger" (red bg)
  - Given box with 50% usage, When viewing detail, Then Usage badge shows "Usage: 50%" with color="neutral" (slate bg)
- **Instrumentation**: `data-testid="boxes.detail.badge.usage"` (inferred from pattern)
- **Backend hooks**: `testData.boxes.create({ capacity: 100 })` + `testData.parts.createWithLocation({ boxId, quantity: 95|50 })`
- **Gaps**: **Major** — Plan.md:987 acknowledges "conditional color logic testing gap" but Section 13 doesn't document scenario. Slice 9 (plan.md:895-912) requires box Usage migration with conditional but has no Playwright verification. This is the ONLY conditional color instance; must be tested.
- **Evidence**: plan.md:306-307, 987, gaps.md:185-192

**Behavior: Build target badge relocation from titleMetadata to metadataRow**

- **Scenarios**:
  - Given active kit loaded, When viewing header, Then `data-testid='kits.detail.header.status'` exists in titleMetadata (status badge only) and `data-testid='kits.detail.badge.build-target'` exists in metadataRow (not titleMetadata)
- **Instrumentation**: testids listed above
- **Backend hooks**: Existing `testData.kits.create({ buildTarget: 'Production' })`
- **Gaps**: None
- **Evidence**: plan.md:762-774, 812

---

## 5) Adversarial Sweep (must find ≥3 credible issues or declare why none exist)

**Blocker — Accessibility: Color-only distinction without WCAG validation**

**Evidence:** plan.md:188-190 — "StatusBadge intentionally removes multi-variant approach with a unified bold color palette... The bold, saturated background colors (`bg-blue-600 text-white` for active, `bg-slate-400 text-slate-700` for inactive, `bg-emerald-600 text-white` for success) provide clear visual hierarchy without requiring variant diversity."

**Why it matters:** Current shopping list status badges use **structural** diversity (concept: 'default', ready: 'secondary', done: 'outline' per detail-header-slots.tsx:43-47). Outline variant provides border-only styling (lower visual weight, distinct structure). StatusBadge replaces this with 3 colors only. Users with protanopia (red-blind), deuteranopia (green-blind), or tritanopia (blue-blind) may not distinguish blue-600 (active) from emerald-600 (success) or slate-400 (inactive). Plan doesn't:
1. Validate WCAG 2.1 contrast ratios (AA requires 4.5:1 for text, 3:1 for UI components)
2. Show color-blind simulation testing
3. Provide fallback distinction (icons, patterns, labels)

**Fix suggestion:** Add Section 2 subsection "Accessibility Validation":
- Document WCAG contrast ratios for all 3 StatusBadge colors using Tailwind's luminance values
- Simulate color-blind vision (tools: Sim Daltonism, Chrome DevTools) to verify 3 colors remain distinguishable for protanopia/deuteranopia/tritanopia
- If colors aren't distinguishable, add `icon` prop to StatusBadge (checkmark for success, dot for inactive, arrow for active) OR reintroduce variant diversity (outline for inactive, filled for active/success)
- Document findings: "StatusBadge 3-color palette validated for WCAG AA compliance and color-blind accessibility via [tool name]. Blue-600/emerald-600 distinction maintained via [icon/pattern]."

**Confidence:** High — Accessibility regression. Multi-variant approach provided non-color distinction; StatusBadge's color-only approach must be validated before standardizing 40+ badges.

---

**Blocker — Type Safety: Instrumentation metadata extension without interface definitions**

**Evidence:** plan.md:621-622 — "After Slice 4 implementation, add `renderLocation: 'body'` field to metadata returned by `getLinksReadyMetadata` (kit-detail.tsx:92-94)." plan.md:631-632 repeats for shopping list.

**Why it matters:** `getLinksReadyMetadata` and `getReadyMetadata` are callbacks returning metadata objects consumed by instrumentation hooks (likely typed in `src/types/test-events.ts` or `src/lib/test/`). Adding `renderLocation` field without TypeScript interface update risks:
1. **Breaking change** if metadata types are strict (no index signature). Existing producers (other detail views, analytics) must update to include field or field must be optional.
2. **Runtime failure** if instrumentation consumers expect specific shape.
3. **Stale assertions** if Playwright specs assert on `metadata.renderLocation` but emission never added.

Plan shows metadata usage (plan.md:621-632, 636-643) but never documents:
- Where metadata type interfaces live
- Whether `renderLocation` is optional or required
- Which files emit metadata and need updates

**Fix suggestion:** Add Section 3 entry:
```markdown
**Entity / contract:** UiState metadata extension for chip relocation
**Shape:**
```typescript
// src/types/test-events.ts (or instrumentation hook types)
interface KitLinksMetadata {
  kitId: number;
  hasLinkedWork: boolean;
  shoppingLists: {
    count: number;
    ids: number[];
    statusCounts: Record<string, number>;
    renderLocation?: 'header' | 'body'; // NEW FIELD (optional to avoid breaking existing emitters)
  };
}
```
**Mapping:** Optional field added to avoid breaking existing `getLinksReadyMetadata` implementations. Slice 4 updates kit-detail.tsx:92-102 to emit `renderLocation: 'body'`.
**Evidence:** plan.md:621-622
```

Add to Slice 4 touches:
- `src/components/kits/kit-detail.tsx` (lines 92-102: update `getLinksReadyMetadata` callback)
- `src/types/test-events.ts` or equivalent (extend metadata interface with `renderLocation?` field)

**Confidence:** High — Type safety critical. Metadata extension without interface definition causes runtime failures and test assertion errors.

---

**Major — Factory extension sequencing blocks Slices 4-5 Playwright coverage**

**Evidence:** plan.md:432-450 — "Slices 4 and 5 require the following backend coordination: [lists factory helpers]... Only factory wrapper helpers need to be implemented before Slices 4-5 Playwright specs can be written." plan.md:825 — "**Test setup prerequisite:** Implement factory helpers (`linkShoppingList`, `createWithShoppingListLinks`) in `tests/api/factories/kit-factory.ts` before writing Playwright specs." But plan.md:820 lists `tests/api/factories/kit-factory.ts` under Slice 4 "Touches."

**Why it matters:** "Prerequisite" implies factories must exist before Slice 4 starts, but listing factory files in Slice 4 touches implies they're part of the slice. This creates ambiguity:
- If factories are prerequisite, implementer may start Slice 4 without them, causing spec failures
- If factories are part of Slice 4, "prerequisite" language is misleading and should say "internal ordering: factories first, then UI, then specs"

Backend endpoints exist (openapi.json:12522, 11673, 12472, 15145) so factory work is unblocked. But without clear sequencing, Slice 4 implementation risks.

**Fix suggestion:** Add "Slice 3.5: Extend Test Factories for Link Chip Coverage" to Section 14:
```markdown
### Slice 3.5: Extend Test Factories
**Goal:** Implement factory helpers for kit↔shopping list linking to unblock Slices 4-5 Playwright specs
**Touches:**
- tests/api/factories/kit-factory.ts (`linkShoppingList(kitId, listId)`, `createWithShoppingListLinks({ shoppingListIds })`)
- tests/api/factories/shopping-list-factory.ts (`linkToKit(listId, kitId)`)
- (Optional) Unit tests for factory helpers
**Dependencies:** Backend endpoints exist (openapi.json:12522, 11673, 12472, 15145); no backend work required
```
Update Slice 4 dependencies: "Slices 1-3.5 complete" and remove factory files from Slice 4 touches.

**Confidence:** High — Factory work clearly scoped; making it explicit slice removes ambiguity and ensures Playwright coverage isn't deferred.

---

**Major — Conditional color API pattern unvalidated**

**Evidence:** plan.md:306-307 — "**Usage badge** (line 177-179): Conditional color based on threshold → migrate to `KeyValueBadge` with... `color` conditional (danger if ≥90%, neutral otherwise)" plan.md:353-363 — `interface KeyValueBadgeProps { ... color?: 'neutral' | 'info' | 'warning' | 'success' | 'danger'; ... }`

**Why it matters:** Box detail Usage badge is the ONLY instance of conditional color logic in entire plan. If KeyValueBadge doesn't correctly apply color classes based on runtime prop value, badge shows incorrect color. Pattern not validated:
- Does KeyValueBadge re-render with new color classes on prop change? (React standard but plan doesn't confirm component design)
- Do call sites compute color value: `<KeyValueBadge color={usagePercentage >= 90 ? 'danger' : 'neutral'} .../>`? (syntax valid but plan doesn't show example)
- Is conditional tested? (plan.md:987 acknowledges gap but Section 13 has no scenario; Slice 9 has no Playwright verification)

Without validated pattern, Slice 9 implementation may fail or ship without test coverage.

**Fix suggestion:** Add to Section 5 (Algorithms & UI Flows):
```markdown
### Flow: KeyValueBadge with conditional color (box Usage threshold example)
**Steps:**
1. Component computes color value from data: `const color = usagePercentage >= 90 ? 'danger' : 'neutral'`
2. Passes computed value to KeyValueBadge: `<KeyValueBadge label="Usage" value="{usagePercentage}%" color={color} testId="..." />`
3. KeyValueBadge maps color string to Tailwind classes via internal mapping (Section 2 palette)
4. Badge re-renders with new classes on prop change (React standard)
**States / transitions:** Color changes when usagePercentage crosses 90% threshold; KeyValueBadge reactively applies new classes
**Evidence:** plan.md:306-307
```

Add to Section 13 (Deterministic Test Plan) under "Behavior: Box detail Usage badge with conditional color threshold" (already documented at plan.md:306-307 but no Playwright scenario). Add to Slice 9 deliverables: "Playwright spec for Usage badge 90% threshold."

**Confidence:** High — Only conditional color instance; must validate pattern and add test coverage.

---

**Major — StatusBadge exhaustiveness check missing**

**Evidence:** plan.md:369-385 — `interface StatusBadgeProps { status: 'active' | 'concept' | 'ready' | 'done' | 'archived' | 'open' | 'completed' | 'new' | 'ordered' | 'received'; ... }` plan.md:376-379 — "concept, done, archived, new → inactive; ready, active, open, ordered → active; completed, received → success"

**Why it matters:** StatusBadge accepts 10 status literal values and maps them to 3 color names. If component uses switch statement or object lookup without exhaustiveness check, TypeScript won't catch missing mappings:
- Typo like `status="activ"` fails at runtime
- Future status addition (e.g., `status="cancelled"`) without mapping update fails silently
- Runtime error if mapping returns `undefined` color name

Plan doesn't show code validation or TypeScript pattern ensuring all 10 statuses have entries.

**Fix suggestion:** Add to Section 5 (Algorithms & UI Flows):
```markdown
### Flow: StatusBadge status-to-color mapping with TypeScript exhaustiveness
**Steps:**
1. Component receives `status` prop (one of 10 literal values)
2. Internal mapping uses TypeScript `Record<StatusBadgeProps['status'], 'inactive' | 'active' | 'success'>`:
   ```typescript
   const STATUS_COLOR_MAP: Record<StatusBadgeProps['status'], 'inactive' | 'active' | 'success'> = {
     concept: 'inactive', done: 'inactive', archived: 'inactive', new: 'inactive',
     ready: 'active', active: 'active', open: 'active', ordered: 'active',
     completed: 'success', received: 'success',
   };
   ```
3. TypeScript enforces all 10 status values have entries (exhaustiveness check)
4. Component retrieves color name: `const colorName = STATUS_COLOR_MAP[status];` (guaranteed defined)
5. Color name maps to Tailwind classes via COLOR_CLASSES object
**Evidence:** plan.md:502-524
```

Add note: "TypeScript `Record<K, V>` provides exhaustiveness check; adding new status requires updating both union type and STATUS_COLOR_MAP."

**Confidence:** Medium — TypeScript structural typing provides safety if code uses `Record<...>` pattern, but plan should validate implementation.

---

**Major — Testid migration incomplete: shopping list chip prefix change not grepped**

**Evidence:** plan.md:739 — "Individual chip testid: `data-testid=\"shopping-lists.concept.header.kits.{kitId}\"` (existing testid, chip relocated from header; testid prefix will change from `.header.` to `.body.` for consistency)" plan.md:835 — "Playwright specs for shopping list detail (update selectors; verify no empty state...)"

**Why it matters:** Plan documents testid prefix change (`.header.kits.` → `.body.kits.`) but doesn't verify existing Playwright specs query using old prefix. If specs exist and use `page.getByTestId('shopping-lists.concept.header.kits.123')`, they'll fail after relocation. Slice 5 says "update selectors" but doesn't list which spec files or show grep evidence. Kit detail empty state grep (plan.md:727-728) only checked `tests/e2e/kits/`; similar verification needed for shopping list.

**Fix suggestion:** Run before Slice 5:
```bash
pnpm exec rg 'shopping-lists\..*\.header\.kits' tests/e2e/
pnpm exec rg 'shopping-lists\.concept\.header' tests/e2e/
```

Add results to plan.md:739. If matches found:
- List affected spec files in Slice 5 touches: `tests/e2e/shopping-lists/overview.spec.ts` (example)
- Document testid updates required: "Update `shopping-lists.concept.header.kits.${id}` → `shopping-lists.detail.body.kits.${id}`"

If no matches, add note: "Grep confirmed no specs use `.header.kits.` testids; no selector updates required."

**Confidence:** High — Testid changes without grep verification cause deterministic spec failures. Verification takes 10 seconds; must be done before Slice 5.

---

**Minor — Empty state removal grep incomplete**

**Evidence:** plan.md:727-728 — "**Gaps:** No existing Playwright assertions on empty state message \"Link a shopping list to reserve parts...\" found (grep result: no matches in tests/e2e/kits/). Safe to remove empty state without breaking tests."

**Why it matters:** Grep only checked `tests/e2e/kits/` directory. Assertions may exist in:
1. Page objects (`tests/support/page-objects/kits-page.ts` — plan.md:341-343 says this file needs updates for chip relocation)
2. Text matchers not using testids: `page.getByText(/Link a shopping list/)`

If assertions exist outside `tests/e2e/kits/`, removal causes failures.

**Fix suggestion:** Run comprehensive grep:
```bash
pnpm exec rg -i "link a shopping list" tests/
pnpm exec rg "kits\.detail\.links\.empty" tests/
pnpm exec rg -i "no shopping lists" tests/e2e/kits/
```

Add results to plan.md:727. If matches found, list affected files in Slice 4 touches. If clean, replace "no matches in tests/e2e/kits/" with "no matches in entire tests/ directory."

**Confidence:** Medium — Plan's grep may be incomplete but risk is low if empty state was never tested. Comprehensive verification reduces risk.

---

**Minor — Date formatting i18n risk**

**Evidence:** plan.md:954-958 — "Part detail 'Created' date and box detail 'Updated' date currently use `toLocaleDateString()` formatting; migrating to KeyValueBadge preserves this but doesn't standardize date format... **Mitigation:** KeyValueBadge accepts formatted string as `value` prop; date formatting logic remains at call site..."

**Why it matters:** `toLocaleDateString()` output varies by system locale (en-US: "10/27/2025", en-GB: "27/10/2025"). Playwright specs asserting on exact date strings fail if CI locale differs from dev environment. Plan acknowledges issue but doesn't mitigate for tests.

**Fix suggestion:** Add to Slice 9 deliverables:
- "Update part and box detail date formatting to use fixed format: `new Intl.DateTimeFormat('en-US', { dateStyle: 'short' }).format(date)` or ISO format: `date.toISOString().split('T')[0]` to ensure deterministic Playwright assertions."

OR add to Section 13 test plan:
- "Date badge assertions use regex patterns (`/Created.*\d{1,2}\/\d{1,2}\/\d{4}/`) rather than exact strings to tolerate locale variations."

**Confidence:** Medium — Low-severity (only 2 badges) but causes flaky tests. Documenting mitigation in Slice 9 or test plan suffices.

---

**Minor — Badge wrapper prop signature uniformity unchecked**

**Evidence:** plan.md:27-32 — "Found three nearly-identical badge wrapper components... All three accept `{ label, value, className, testId }`" plan.md:220-231 — Lists DetailBadge, SummaryBadge, GroupSummaryBadge with file locations but doesn't quote signatures.

**Why it matters:** Plan assumes all three wrappers have identical props. If any has additional props (e.g., SummaryBadge accepts `variant` or `onClick`), migration to KeyValueBadge loses functionality unless KeyValueBadge supports them. Plan should verify uniformity.

**Fix suggestion:** Add to Section 0 (Research Log):
- Quote SummaryBadge signature from kit-detail.tsx:569-579
- Quote GroupSummaryBadge signature from pick-list-lines.tsx:346-352
- Confirm all three match: `{ label: string; value: string | number; className?: string; testId: string }`
- If differences exist, document how KeyValueBadge API accommodates them (e.g., add missing props or update call sites to drop unsupported props)

**Confidence:** Low — Plan likely verified this during research but didn't document. Due diligence check.

---

## 6) Derived-Value & State Invariants (table)

**Derived value: Kit detail – sortedShoppingLinks**

- **Source dataset**: Unfiltered `kit.shoppingListLinks` array sorted by `sortShoppingLinks(kit.shoppingListLinks)` (plan.md:531). Helper sorts by status then name; does NOT filter (plan.md:534: "does not filter the array—it only sorts").
- **Write / cleanup triggered**: Determines rendering of link chips section in body content. When `sortedShoppingLinks.length === 0`, no chip container renders (plan.md:532). No cache writes, navigation, or storage mutations.
- **Guards**: Conditional check `hasShoppingLists = sortedShoppingLinks.length > 0` gates chip rendering (plan.md:533). No feature flags. No status-based filtering.
- **Invariant**: `hasShoppingLists` must equal `kit.shoppingListLinks.length > 0` because `sortShoppingLinks` doesn't filter (plan.md:534-535). If future developer adds `.filter(link => link.status !== 'done')` to `sortShoppingLinks`, invariant breaks and chips won't render when they should. **Subtle risk**: Derived value uses `sortedShoppingLinks.length` (sorted array output) not `kit.shoppingListLinks.length` (original source). While functionally equivalent today, this creates coupling to sort function. If `sortShoppingLinks` ever returns subset, invariant silently breaks.
- **Evidence**: plan.md:530-535

**Derived value: Shopping list detail – linkedKits**

- **Source dataset**: Mapped from `kitsQuery.data` via `mapShoppingListKitLinks` (detail-header-slots.tsx:129, plan.md:538). Source is TanStack Query response; no filtering documented in mapper.
- **Write / cleanup triggered**: Drives conditional rendering of kit chips in body (plan.md:539). Updates instrumentation metadata with kit link count and status counts (detail-header-slots.tsx:136-146, plan.md:541). No cache mutations or navigation.
- **Guards**: `kitsQuery.isLoading` shows skeleton; `linkedKits.length > 0` gates chip section (plan.md:540). Instrumentation emits kit link count.
- **Invariant**: Kit link count in instrumentation metadata (line 138) must equal `linkedKits.length` and must equal `kitsQuery.data?.kits.length` (or equivalent) (plan.md:541). Plan doesn't verify `mapShoppingListKitLinks` is 1:1 transform (no filtering). If mapper filters certain kit statuses, instrumentation reports incorrect counts. **Risk**: Metadata emitted before `linkedKits` fully mapped causes race (instrumentation count ≠ rendered chip count).
- **Evidence**: plan.md:537-542

**Derived value: Pick list detail – attribute badge values**

- **Source dataset**: Unfiltered fields from `detail` object: `requestedUnits`, `lineCount`, `openLineCount`, `remainingQuantity` (pick-list-detail.tsx:197-220, plan.md:545).
- **Write / cleanup triggered**: None. Purely presentational; badges display computed values (plan.md:546). No side effects.
- **Guards**: `detail` existence check before rendering badges (plan.md:547).
- **Invariant**: Badge labels must remain `<key>: <value>` format when migrating to KeyValueBadge (plan.md:548). Current implementation uses `label="Requested units"`, `value={NUMBER_FORMATTER.format(detail.requestedUnits)}`. KeyValueBadge renders `{label}: {value}` (plan.md:492-494), preserving format. No risk as long as component follows documented pattern.
- **Evidence**: plan.md:544-549

**Derived value: Box detail – Usage badge color (conditional)**

- **Source dataset**: Computed from `usageStats.usagePercentage` (derived from `box.capacity` and part quantities), unfiltered (plan.md:306).
- **Write / cleanup triggered**: No writes. Determines KeyValueBadge `color` prop: `danger` if ≥90%, `neutral` otherwise (plan.md:306-307). Badge color reactive to usage stat changes.
- **Guards**: Threshold check `usagePercentage >= 90` gates color selection (plan.md:306). No feature flags.
- **Invariant**: KeyValueBadge must support dynamic `color` prop (runtime value, not static). If component caches color classes on mount, badge won't update when usage crosses threshold. Plan doesn't validate KeyValueBadge re-renders with new classes on prop change (React standard but should confirm component design). **Test gap**: No Playwright scenario for 90% threshold (plan.md:987).
- **Evidence**: plan.md:306-307, gaps.md:185-192

**Derived value: StatusBadge – color name from status value**

- **Source dataset**: Single `status` prop (one of 10 literals) filtered through internal mapping to 3 color names (inactive, active, success) (plan.md:376-379).
- **Write / cleanup triggered**: No writes. Color name determines Tailwind classes applied to Badge (plan.md:510-512). Purely presentational.
- **Guards**: TypeScript union type constrains `status` prop to 10 valid values (plan.md:369). Internal mapping must be exhaustive (see Adversarial finding).
- **Invariant**: Every status value in union type must have corresponding entry in STATUS_COLOR_MAP. If mapping incomplete, component fails at runtime with undefined color name. Plan doesn't show code validation (no TypeScript `Record<...>` pattern documented). **Risk**: Future status addition (e.g., `status="cancelled"`) without mapping update fails silently.
- **Evidence**: plan.md:502-524, 369-385

---

## 7) Risks & Mitigations (top 3)

**1. Accessibility regression: Color-only distinction without validation**

- **Risk**: StatusBadge replaces variant-based visual distinction (outline, filled, secondary) with 3 bold colors (inactive: slate, active: blue, success: emerald). Users with color blindness may not distinguish colors, and plan doesn't validate WCAG contrast ratios or provide fallback distinction (icons, patterns). (plan.md:188-190, 168-187)
- **Mitigation**: **Before Slice 6**, validate WCAG 2.1 AA contrast ratios for all 3 StatusBadge colors using Tailwind luminance docs. Simulate color-blind vision (protanopia, deuteranopia, tritanopia) with Sim Daltonism or Chrome DevTools. If colors aren't sufficiently distinguishable, add `icon` prop to StatusBadge or reintroduce variant diversity (outline for inactive, filled for active/success). Document findings in plan.md Section 2 "Badge Color Standardization" subsection "Accessibility Validation."
- **Evidence**: plan.md:188-190, 168-187

**2. Instrumentation type safety: Metadata extension breaks contracts**

- **Risk**: Adding `renderLocation: 'body'` field to instrumentation metadata in Slices 4-5 may break TypeScript contracts if metadata types are strict (no index signature). Plan doesn't show type definitions or validate existing consumers handle unknown fields. (plan.md:621-632)
- **Mitigation**: **During Slice 4 planning**, locate metadata type interfaces in `src/types/test-events.ts` (or similar). If types strict, add `renderLocation?: 'header' | 'body'` as optional field to avoid breaking existing producers. Update plan.md Section 3 to document type extension. If field required, list all call sites and update in Slices 4-5. Validate Playwright `waitTestEvent` handles unknown fields gracefully. Add to Slice 4/5 touches: `src/types/test-events.ts` (or equivalent) for interface updates.
- **Evidence**: plan.md:621-632, 636-643

**3. Factory extension sequencing blocks Playwright coverage**

- **Risk**: Plan states factory helpers "required before Slices 4-5" and "prerequisite" but lists factory files under Slice 4 "Touches," creating ambiguity. Implementer may start chip relocation without factories, causing spec failures. (plan.md:432-450, 814-826)
- **Mitigation**: Add "Slice 3.5: Extend Test Factories" to Section 14 with deliverables: `linkShoppingList`, `createWithShoppingListLinks`, `linkToKit` helpers + optional unit tests. List backend endpoints (openapi.json:12522, 11673, 12472, 15145) as evidence no backend work required. Update Slice 4 dependencies to "Slice 3.5 complete" and remove factory files from Slice 4 touches. This makes factory work explicit prerequisite, unblocking Slices 4-5 Playwright coverage.
- **Evidence**: plan.md:432-450, 814-826

---

## 8) Confidence

**Confidence: Medium** — Plan structure is strong (follows template, comprehensive evidence, 9-slice implementation), scope well-defined (35-40 badges across 15+ files), and two-component abstraction (KeyValueBadge, StatusBadge) architecturally sound. Research log resolves conflicts (part detail already follows target pattern). However, **critical gaps require resolution before Slices 4-9**: (1) **Blocker**: Accessibility validation missing for StatusBadge 3-color palette (WCAG contrast, color-blind testing); (2) **Blocker**: Instrumentation metadata type contracts undefined (`renderLocation` field extension lacks TypeScript interfaces); (3) **Major**: Factory extension sequencing ambiguous (prerequisite or internal to Slice 4?); (4) **Major**: Conditional color API pattern unvalidated (box Usage threshold); (5) **Major**: StatusBadge exhaustiveness check not documented; (6) **Major**: Testid migration incomplete (shopping list chips not grepped). Slices 1-3 can proceed (KeyValueBadge/StatusBadge creation, Build target relocation) pending variant-color interaction clarification. Plan is implementable after addressing 2 Blocker and 5 Major findings.
