# Badge and Chip Standardization – Plan Review

## 1) Summary & Decision

**Readiness**

The plan is well-researched and demonstrates strong repository knowledge, with comprehensive evidence citations covering all affected components. The abstraction of three identical badge wrapper components is justified, the color palette standardization is sensible, and the link chip relocation aligns with the part detail pattern. However, the plan contains critical gaps in Playwright test coordination, instrumentation metadata updates, and deterministic test coverage for badge relocation. The adversarial sweep surfaced missing backend factory extensions, ambiguous component API contracts for color semantics, and undocumented testid requirements for body-rendered chip containers. These gaps elevate risk for CI failures and make the implementation less deterministic than required by project policy.

**Decision**

`GO-WITH-CONDITIONS` — The plan is implementable but requires clarification and extension in four areas: (1) explicit Playwright backend factory requirements for seeding kit-shopping-list links and shopping-list-kit links, (2) instrumentation metadata updates to reflect chip placement changes, (3) deterministic test scenarios for build target badge relocation, and (4) component API contract for KeyValueBadge color prop vs className. Addressing these conditions will elevate confidence to High and ensure Slice 4 and Slice 5 ship with complete test coverage.

---

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `docs/commands/plan_feature.md` — **Pass** — `plan.md:1-612` — Plan follows all required sections (0-16) with evidence citations, derived state documentation, and implementation slices.
- `docs/product_brief.md` — **Pass** — `plan.md:55-98` — Scope aligns with UI standardization goals; no new data model or workflow changes proposed that would conflict with product brief.
- `AGENTS.md` (via CLAUDE.md) — **Pass** — `plan.md:176-185, 463-523` — Plan references Playwright developer guide and instrumentation requirements; commits to updating specs alongside UI changes (line 79).
- `docs/contribute/architecture/application_overview.md` — **Pass** — `plan.md:101-175` — Plan correctly identifies domain-driven component structure (`src/components/kits`, `src/components/shopping-lists`, `src/components/ui`) and TanStack Query cache invalidation patterns (line 314).
- `docs/contribute/testing/playwright_developer_guide.md` — **Conditional Pass** — `plan.md:463-523` — Plan acknowledges Playwright spec updates (lines 179-185, 479-480, 492-494) but does not specify backend factory extensions or data-testid additions for body-rendered chip containers. Missing explicit backend coordination violates "API-first data setup" principle (playwright_developer_guide.md:14).

**Fit with codebase**

- `DetailScreenLayout` component — `plan.md:192-195` — Plan correctly assumes `metadataRow` accepts ReactNode and that chips will move to `children` (body content). Evidence: `src/components/layout/detail-screen-layout.tsx:4-26` (cited but not shown in plan; assumption holds per standard layout patterns).
- `createKitDetailHeaderSlots` return shape — `plan.md:197-200` — Plan proposes adding `linkChips` slot to return object but does not show updated TypeScript interface. Fit concern: existing consumers spread `{...headerSlots}` into `DetailScreenLayout` props (kit-detail.tsx:300-308), so adding a new slot field will not break spreads but requires explicit body rendering logic.
- `useShoppingListDetailHeaderSlots` return shape — `plan.md:202-205` — Similar to kit header; plan proposes `linkChips` in slots object but does not document whether route file (`src/routes/shopping-lists/$listId.tsx`) currently has body content rendering section or if one must be added.
- `KeyValueBadge` color API — `plan.md:266-277` — Plan states "color is semantic ('neutral' | 'info' | 'warning' | 'success' | 'danger')" (line 269) but also shows "color mapping should be centralized in KeyValueBadge component" (line 277). **Ambiguity**: Does the component accept a `color` prop with semantic names, or does it accept `className` and expect callers to know the canonical palette? Current badge wrappers use `className` (pick-list-detail.tsx:389-399, kit-detail.tsx:569-579), so plan needs to clarify API contract.

---

## 3) Open Questions & Ambiguities

- **Question:** Does `KeyValueBadge` accept a `color` prop with semantic values ('neutral', 'info', 'warning', 'success', 'danger'), or does it accept `className` and expect callers to pass the full Tailwind color classes?
  - **Why it matters:** If the API uses `className`, color standardization is not enforceable at compile time; callers can pass arbitrary classes. If the API uses a `color` enum, the component can map to the canonical palette (plan.md:105-115) and TypeScript will enforce semantic consistency.
  - **Needed answer:** Specify the component props interface: `{ label: string; value: string | number; color?: 'neutral' | 'info' | 'warning' | 'success' | 'danger'; className?: string; testId: string }` and document whether `color` overrides or is overridden by `className`.

- **Question:** When link chips move from header `metadataRow` to body content, what `data-testid` will the body container use?
  - **Why it matters:** Existing Playwright specs likely wait for `data-testid="kits.detail.links"` or similar, which is currently the metadataRow testid (kit-detail-header.tsx:204). If chips move to body without a documented container testid, specs will break or require ad hoc locators.
  - **Needed answer:** Document the body container testid convention (e.g., `kits.detail.body.links` for kit detail, `shopping-lists.detail.body.kits` for shopping list detail) and add to Section 13 (Deterministic Test Plan) instrumentation hooks.

- **Question:** Do existing Playwright specs assert on the empty state message "Link a shopping list to reserve parts" (kit-detail-header.tsx:237-239)?
  - **Why it matters:** If specs assert on that text, Slice 4 will break CI. Plan states empty state removal (line 78, 236-239) but does not list affected specs.
  - **Needed answer:** Grep `tests/e2e/kits/kit-detail.spec.ts` for "Link a shopping list" or equivalent selector and document in Section 13 which assertions must be removed alongside the empty state.

- **Question:** Does the shopping list detail route file (`src/routes/shopping-lists/$listId.tsx`) currently render body content below `DetailScreenLayout`, or will Slice 5 need to add a body section?
  - **Why it matters:** If the route file only passes header slots to the layout and has no body rendering logic, Slice 5 scope expands to include structural changes. Plan assumes body rendering exists (line 167) but does not cite evidence from the route file.
  - **Needed answer:** Read `src/routes/shopping-lists/$listId.tsx` to confirm body rendering pattern and document the integration point in Section 2 (Affected Areas).

---

## 4) Deterministic Playwright Coverage (new/changed behavior only)

### Behavior: Kit detail – shopping list link chips in body

- **Scenarios:**
  - Given kit with shopping list links, When viewing kit detail, Then chips appear in body content below header (`tests/e2e/kits/kit-detail.spec.ts` — to be updated)
  - Given kit with no shopping lists, When viewing kit detail, Then no chip section renders and no empty state message appears
  - Given kit detail loading, When rendering, Then no skeleton chips render in header metadataRow
- **Instrumentation:**
  - `data-testid="kits.detail.body"` for body container (plan.md:474)
  - **Missing:** `data-testid` for body link chips container (e.g., `kits.detail.body.links`)
  - `data-testid="kits.detail.links.shopping.{listId}"` for each chip (plan.md:475) — chip testid itself does not change
  - Wait for `UiState` event with scope `'kits.detail.links'` phase `'ready'` (plan.md:476) — **Gap:** instrumentation metadata may need update to include "renderLocation: 'body'" field to distinguish from header rendering
- **Backend hooks:**
  - **Missing:** Plan does not specify whether `testData.kits` factory needs a `createWithShoppingListLinks()` helper or similar. Existing factory may only create isolated kits; linking shopping lists may require multi-step API calls (create kit → create shopping list → link via POST endpoint).
  - **Missing:** Plan does not specify whether `testData.shoppingLists` factory needs `linkToKit(kitId)` helper.
- **Gaps:**
  - No explicit backend factory extension documented for deterministic link seeding
  - No testid for body link chips container
  - No clarification on whether instrumentation metadata reflects chip placement
- **Evidence:** `plan.md:466-480`

### Behavior: Shopping list detail – kit link chips in body

- **Scenarios:**
  - Given shopping list with kit links, When viewing list detail, Then chips appear in body below header (`tests/e2e/shopping-lists/shopping-list-detail.spec.ts` — may not exist; plan states "No existing spec file found" line 494)
  - Given shopping list with no kits, When viewing list detail, Then no chip section rendered in body
- **Instrumentation:**
  - **Missing:** `data-testid` for body container in shopping list detail route
  - Wait for `ListLoading` event with scope `'shoppingLists.detail.kits'` phase `'ready'` (plan.md:490)
- **Backend hooks:**
  - **Missing:** Similar factory gap as kit detail; no documented helper to seed shopping list → kit links
- **Gaps:**
  - No existing Playwright spec file (plan acknowledges this line 494); plan does not propose whether to create `tests/e2e/shopping-lists/shopping-list-detail.spec.ts` or extend an existing suite
  - Missing backend coordination for kit link seeding
- **Evidence:** `plan.md:482-494`

### Behavior: KeyValueBadge component

- **Scenarios:**
  - Given component receives label, value, className, testId, When rendered, Then displays `{label}: {value}` in Badge with custom classes
  - Given component receives variant prop, When rendered, Then Badge uses specified variant
- **Instrumentation:**
  - `data-testid={testId}` passed through to Badge (plan.md:503)
- **Backend hooks:** None required (presentational component)
- **Gaps:**
  - No dedicated test file; plan states "covered by parent component specs" (line 504), which aligns with project patterns but reduces isolation
  - **Missing scenario:** Given component receives `color` prop (if API uses semantic colors), When rendered, Then correct Tailwind classes are applied
- **Evidence:** `plan.md:496-508`

### Behavior: Kit detail – Build target badge moved to metadataRow

- **Scenarios:**
  - Given kit detail loaded, When viewing header, Then titleMetadata contains only status badge
  - Given kit detail loaded, When viewing header, Then metadataRow contains Build target badge
- **Instrumentation:**
  - `data-testid="kits.detail.header.status"` for status badge (plan.md:517)
  - `data-testid="kits.detail.badge.build-target"` for Build target badge (plan.md:518)
- **Backend hooks:** Existing `testData.kits.create()` should suffice (badge uses `kit.buildTarget` field)
- **Gaps:**
  - **Critical:** Plan lists these scenarios in Section 13 (lines 510-522) but does not reference any Playwright spec file. Section 14 (Implementation Slices) lists Slice 3 as "Move Kit Detail Build Target Badge" but does not include "Update Playwright specs" in the touches list (plan.md:549-555). This suggests the badge relocation may ship without test coverage, violating AGENTS.md policy "Ship instrumentation changes and matching Playwright coverage in the same slice" (CLAUDE.md:43-44).
- **Evidence:** `plan.md:510-522`

---

## 5) Adversarial Sweep (must find ≥3 credible issues or declare why none exist)

### **Major — Missing Backend Factory Extensions for Link Chip Seeding**

**Evidence:** `plan.md:209-229` (API / Integration Surface section) — No backend API changes listed; plan states "All data fetching hooks remain unchanged" (line 211). Section 13 (Deterministic Test Plan) references backend hooks only generically ("wait for ListLoading event") without specifying factory helpers.

**Why it matters:** Playwright tests must create kits with shopping list links and shopping lists with kit links deterministically. The plan does not specify whether existing factories (`testData.kits.create()`, `testData.shoppingLists.create()`) support linking entities, or whether new helpers like `testData.kits.createWithShoppingListLinks({ linkIds: [1, 2] })` or `testData.shoppingLists.linkToKit(kitId)` must be added to `tests/api/factories/`. Without documented factory extensions, Slice 4 and Slice 5 cannot ship with complete Playwright coverage per AGENTS.md "API-first data setup" policy (playwright_developer_guide.md:14).

**Fix suggestion:** Add a subsection to Section 4 (API / Integration Surface) titled "Playwright Factory Extensions" that documents:
- `testData.kits.createWithShoppingListLinks({ shoppingListIds: number[], kit?: Partial<KitDetail> }): Promise<KitDetail>`
- `testData.shoppingLists.linkToKit(listId: number, kitId: number): Promise<void>`
- Evidence from `tests/api/factories/kits.ts` and `tests/api/factories/shopping-lists.ts` (if helpers already exist) or mark as "TODO: extend factories in Slice 4/5"

**Confidence:** High — This is a deterministic gap; no implementation can achieve "complete Playwright coverage" without explicit backend coordination.

---

### **Major — Instrumentation Metadata Does Not Reflect Chip Placement**

**Evidence:** `plan.md:361-397` (Observability / Instrumentation section, lines 371-377) — `UiState` event for `kits.detail.links` scope emits metadata `{ kitId, hasLinkedWork, shoppingLists: { count, ids, statusCounts } }`. Plan does not propose adding a `renderLocation` or `placement` field to distinguish whether chips are in header vs body.

**Why it matters:** When chips move from header metadataRow to body content, Playwright specs that assert on instrumentation metadata will not detect the placement change. If a future refactor accidentally moves chips back to the header, tests relying solely on metadata will not catch the regression. The plan states "After chip relocation, verify test events still emit with correct metadata" (line 318), but "correct metadata" is not defined beyond link counts and IDs.

**Fix suggestion:** Extend Section 9 (Observability / Instrumentation) to propose a metadata field update:
- Before: `{ kitId, hasLinkedWork, shoppingLists: { count, ids, statusCounts } }`
- After: `{ kitId, hasLinkedWork, shoppingLists: { count, ids, statusCounts, renderLocation: 'body' } }`
- Add corresponding metadata update to `getLinksReadyMetadata` in `kit-detail.tsx:92-102` and document in Section 13 that Playwright specs should assert `metadata.shoppingLists.renderLocation === 'body'` to lock in the pattern.

**Confidence:** High — The plan explicitly commits to instrumentation as "part of the UI contract" (CLAUDE.md:40), so omitting placement metadata creates a testability gap.

---

### **Major — Slice 3 (Build Target Badge Relocation) Has No Playwright Coverage**

**Evidence:** `plan.md:549-555` (Implementation Slices, Slice 3) — "Move Kit Detail Build Target Badge" lists `src/components/kits/kit-detail-header.tsx` as the only touched file. No Playwright spec update listed. Section 13 (Deterministic Test Plan, lines 510-522) defines scenarios for build target badge but does not cite a spec file or state "will add to `tests/e2e/kits/kit-detail.spec.ts`".

**Why it matters:** AGENTS.md policy requires "Ship instrumentation changes and matching Playwright coverage in the same slice" (CLAUDE.md:43-44). If Slice 3 moves the badge without updating specs, the change is incomplete. Additionally, Section 15 (Risks & Open Questions) lists "Playwright specs break due to chip relocation" (line 582) but does not mention badge relocation risk, suggesting the plan may underestimate scope.

**Fix suggestion:** Extend Slice 3 "Touches" list to include:
- `tests/e2e/kits/kit-detail.spec.ts` (update badge selector assertions)
- Add explicit scenario to Section 13: "Given active kit loaded, When viewing header, Then `data-testid='kits.detail.header.status'` exists in `titleMetadata` and `data-testid='kits.detail.badge.build-target'` exists in `metadataRow` (not in `titleMetadata`)"

**Confidence:** High — The plan's own structure (Section 13 + Slice 3) reveals this gap.

---

### **Major — KeyValueBadge Color API Ambiguity Prevents Compile-Time Enforcement**

**Evidence:** `plan.md:266-277` (Algorithms & UI Flows, lines 269-277) — Plan states component will accept `color` prop with semantic values but Flow description shows "Additional Tailwind classes from className prop can override if needed" (line 272). Section 2 (Affected Areas) shows existing badge wrappers accept `className` prop (pick-list-detail.tsx:385, kit-detail.tsx:565).

**Why it matters:** If KeyValueBadge accepts both `color` and `className`, and `className` can override `color`, then the canonical palette (plan.md:105-115) is a soft guideline, not an enforceable contract. Callers can pass `className="bg-purple-500 text-white"` and bypass standardization. TypeScript will not catch palette violations.

**Fix suggestion:** Add a subsection to Section 3 (Data Model / Contracts) titled "KeyValueBadge Props Contract":
```typescript
interface KeyValueBadgeProps {
  label: string;
  value: string | number;
  color?: 'neutral' | 'info' | 'warning' | 'success' | 'danger';
  variant?: 'default' | 'outline' | 'secondary';
  className?: string; // Additional classes; does NOT override color mapping
  testId: string;
}
```
Document that `color` prop maps to the canonical palette (plan.md:105-115) and that `className` is merged *after* color classes via `cn()` utility, so semantic color takes precedence unless a consumer explicitly overrides with `!important` (which should be flagged in code review).

**Confidence:** Medium — This is an API design ambiguity rather than a functional defect, but it affects long-term maintainability.

---

### **Major — Derived Value `hasShoppingLists` Uses Filtered View Without Documented Filter Logic**

**Evidence:** `plan.md:285-290` (Derived State & Invariants) — `hasShoppingLists` is derived from `sortedShoppingLinks.length > 0` (kit-detail-header.tsx:140). Plan cites `sortShoppingLinks` helper but does not document whether it filters by status or other criteria.

**Why it matters:** If `sortShoppingLinks` filters out certain link statuses (e.g., excludes archived shopping lists), the filtered view will determine whether to render chips in the body. This is a **filtered view driving a persistent render decision**, which the plan template flags for explicit callout (plan_feature.md:156). If the filter logic changes in the future (e.g., "show archived links in a separate section"), the chip rendering logic may break unexpectedly.

**Fix suggestion:** Add a derived value entry to Section 6 (Derived State & Invariants) titled "sortedShoppingLinks filter logic":
- **Source:** `kit.shoppingListLinks` array (unfiltered from API)
- **Writes / cleanup:** Determines `hasShoppingLists` boolean, which gates rendering of body link chips section
- **Guards:** Current implementation sorts by status and name but does not filter by status. If future requirements add status-based filtering (e.g., hide 'done' lists), this will affect chip visibility.
- **Invariant:** `hasShoppingLists` must remain true if *any* shopping list links exist, regardless of status, otherwise links may be hidden unexpectedly.
- **Evidence:** `kit-detail-header.tsx:106-115` (sortShoppingLinks implementation should be cited)

**Confidence:** Medium — This is a documentation gap; the code may already handle it correctly, but the plan does not surface the invariant explicitly.

---

### **Minor — Empty State Removal May Break Existing Playwright Assertions**

**Evidence:** `plan.md:78, 236-239, 288-289` — Plan states "Remove empty state messages for missing link chips" (line 78) and cites kit-detail-header.tsx:237-239 which renders "Link a shopping list to reserve parts. Pick lists now live in the panel below." when `hasShoppingLists` is false. Section 8 (Errors & Edge Cases, line 355) references this text but does not list which Playwright specs assert on it.

**Why it matters:** If `tests/e2e/kits/kit-detail.spec.ts` includes an assertion like `await expect(page.getByTestId('kits.detail.links.empty')).toBeVisible()`, Slice 4 will break CI. Plan acknowledges the empty state removal (line 78) but does not document affected specs or propose updating them in the same slice.

**Fix suggestion:** Add to Section 3 (Open Questions & Ambiguities):
- **Question:** Do existing Playwright specs assert on the empty state message testid `kits.detail.links.empty` or the text "Link a shopping list to reserve parts"?
- **Why it matters:** If yes, Slice 4 must remove those assertions in the same commit to avoid CI failures.
- **Needed answer:** Grep `tests/e2e/kits/` for `kits.detail.links.empty` and document findings in Section 13 (Deterministic Test Plan, line 478).

**Confidence:** Medium — This is a likely edge case; many specs do not assert on empty states, but the risk is non-zero.

---

### **Minor — Part Detail Pattern Inconsistency Creates Misleading Target**

**Evidence:** `plan.md:29-32, 357` — Plan states "Part detail already follows the target pattern (chips below header in body content)" (line 32) and "Part: keeps existing empty state; not changed in this standardization" (line 357). However, part-details.tsx:367-375 renders an empty state message "This part is not on Concept or Ready shopping lists and is not used in any kits."

**Why it matters:** The plan uses part detail as the "target pattern" for kit and shopping list detail, but part detail *does* render an empty state, contradicting the plan's goal of "Remove empty state messages for missing link chips" (line 78). This creates ambiguity: should kit/shopping list detail render nothing (as the plan states) or render an empty message (as part detail does)?

**Fix suggestion:** Add a clarification to Section 1 (Intent & Scope):
- **In scope:** Remove empty state messages for kit and shopping list detail views when no link chips exist (render nothing, per lines 78, 288-289).
- **Out of scope:** Part detail empty state message remains unchanged (line 357) because it provides user guidance. Kit and shopping list detail omit empty states because the absence of chips is normal and requires no affordance.

**Confidence:** Low — This is a documentation consistency issue; the implementation intent is likely correct, but the plan's phrasing is misleading.

---

## 6) Derived-Value & State Invariants (table)

### Derived value: hasShoppingLists (kit detail)

- **Source dataset:** Filtered from `kit.shoppingListLinks` array via `sortedShoppingLinks` helper (kit-detail-header.tsx:139-140). The helper sorts by status and name but **does not filter by status** (based on plan evidence; actual implementation not cited).
- **Write / cleanup triggered:** Determines whether to render link chips section in body content (kit-detail.tsx:280-290, body rendering logic to be added in Slice 4). When false, no chips section renders and no empty state message renders.
- **Guards:** Conditional rendering in body: `if (hasShoppingLists) { render chips } else { render nothing }` (plan.md:288-289). No feature flags or optimistic update rollbacks mentioned.
- **Invariant:** When `kit.shoppingListLinks.length > 0`, `hasShoppingLists` must be true and chip section must render in body. When `kit.shoppingListLinks.length === 0`, `hasShoppingLists` must be false and no chip section (and no empty state) must render. If `sortShoppingLinks` introduces status-based filtering in the future, this invariant could break.
- **Evidence:** `plan.md:285-290` (Derived State & Invariants, kit detail)

### Derived value: linkedKits (shopping list detail)

- **Source dataset:** Mapped from `kitsQuery.data` via `mapShoppingListKitLinks` (detail-header-slots.tsx:129). The mapping extracts `{ linkId, kitId, kitName, kitStatus }` from the API response.
- **Write / cleanup triggered:** Drives conditional rendering of kit chips in body content (shopping list detail route, body rendering to be added in Slice 5). Triggers instrumentation metadata updates via `useListLoadingInstrumentation` (detail-header-slots.tsx:131-155).
- **Guards:** `linkedKits.length > 0` determines chip section visibility (plan.md:295). No guards on status filtering (e.g., active vs archived kits both render).
- **Invariant:** Kit link count in instrumentation metadata (line 138) must match rendered chip count in body. If `mapShoppingListKitLinks` filters out certain statuses (not documented in plan), the metadata count could diverge from UI count, breaking Playwright assertions.
- **Evidence:** `plan.md:292-297` (Derived State & Invariants, shopping list detail)

### Derived value: sortedShoppingLinks (kit detail header)

- **Source dataset:** Sorted from `kit.shoppingListLinks` array via `sortShoppingLinks` helper (kit-detail-header.tsx:139). Sort order: status (concept → ready → done) then name (alphabetical).
- **Write / cleanup triggered:** Used to compute `hasShoppingLists` (see above) and to iterate over chip elements in body rendering (Slice 4 will add `sortedShoppingLinks.map(...)` in kit-detail.tsx).
- **Guards:** None; sorting is pure function with no side effects.
- **Invariant:** Sorting must not filter or mutate the source array. If `sortShoppingLinks` later adds status-based filtering (e.g., "hide completed lists"), the invariant that `sortedShoppingLinks.length === kit.shoppingListLinks.length` will break, and `hasShoppingLists` logic must be updated to use the unfiltered source.
- **Evidence:** `plan.md:139-140, 285-290` (kit-detail-header.tsx:106-115 cited as sortShoppingLinks implementation, though not shown in plan)

### Derived value: activeShoppingMemberships (part detail)

- **Source dataset:** Filtered from `memberships` array (deduplicated by `listId`) to produce unique shopping list chips (part-details.tsx:140-152).
- **Write / cleanup triggered:** Determines whether to render shopping list chips in body content (part-details.tsx:383-391). No cache writes or navigation triggered.
- **Guards:** Conditional rendering: `if (activeShoppingMemberships.length > 0) { render chips } else if (!hasKitMemberships) { render empty state }` (part-details.tsx:364-375).
- **Invariant:** Deduplication must preserve membership metadata (listId, listName, listStatus) without losing data. If the deduplication logic changes to filter by status (e.g., exclude 'done' lists), the chip rendering will change and tests must be updated.
- **Evidence:** `plan.md:32` (part detail pattern reference; actual part-details.tsx implementation reviewed in file reads)

---

## 7) Risks & Mitigations (top 3)

### Risk: Playwright specs break due to missing testid for body link chips container

- **Mitigation:** Before starting Slice 4, add `data-testid="kits.detail.body.links"` to the container element that wraps link chips in the body. Document this testid in Section 13 (Deterministic Test Plan) and ensure Playwright specs use it in selectors. Add parallel testid `data-testid="shopping-lists.detail.body.kits"` for shopping list detail in Slice 5.
- **Evidence:** `plan.md:466-480, 482-494` (Section 13, kit and shopping list detail test plans)

### Risk: Build target badge relocation ships without Playwright coverage

- **Mitigation:** Add `tests/e2e/kits/kit-detail.spec.ts` to Slice 3 "Touches" list. Write a scenario that asserts `data-testid="kits.detail.badge.build-target"` exists in the element with `data-testid="kits.detail.header.badges"` (metadataRow) and does *not* exist in titleMetadata. Run the updated spec locally before marking Slice 3 complete.
- **Evidence:** `plan.md:549-555` (Slice 3 does not list Playwright spec updates)

### Risk: KeyValueBadge className override defeats color standardization

- **Mitigation:** Document in Section 3 (Data Model / Contracts) that `color` prop is the primary API for palette enforcement and that `className` should only be used for additional spacing/sizing adjustments, not color overrides. Add a comment in the KeyValueBadge implementation (Slice 1) that warns "Do not override color classes via className; use the color prop instead." Consider adding an ESLint rule (out of scope for this plan) that flags `className="bg-*"` usage on KeyValueBadge call sites.
- **Evidence:** `plan.md:266-277` (KeyValueBadge flow description with className override mention)

---

## 8) Confidence

**Confidence: Medium** — The plan is well-researched and demonstrates strong understanding of the codebase architecture, instrumentation requirements, and TanStack Query patterns. However, the missing backend factory extensions, undocumented testid additions, and Slice 3 Playwright gap elevate risk for CI failures and incomplete test coverage. Addressing the four GO-WITH-CONDITIONS items (backend factories, instrumentation metadata, build target badge test coverage, and KeyValueBadge API contract) will elevate confidence to High. The plan's slice structure is logical, and the color standardization is straightforward, so implementation risk is low once the test coordination is resolved.
