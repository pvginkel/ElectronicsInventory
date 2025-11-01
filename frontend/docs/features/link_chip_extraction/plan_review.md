# Plan Review — Link Chip Component Extraction

## 1) Summary & Decision

**Readiness**

The plan provides a comprehensive, well-structured approach to extracting duplicated link chip patterns into a reusable UI component. The research phase is thorough (identified all usage sites, examined existing UI patterns, verified className usage), the scope is appropriately bounded (technical debt cleanup with no backward compatibility requirements), and the implementation approach aligns with project patterns (StatusBadge as reference, domain wrappers for status mapping, preservation of testId structure). The plan correctly identifies this as a pure presentational refactoring with no backend API changes, no state management, and no instrumentation requirements. All affected Playwright specs are identified and the verification strategy is sound.

**Decision**

`GO-WITH-CONDITIONS` — Plan is implementation-ready with three clarifications needed: (1) StatusBadge className exception must be justified or removed from LinkChip design (Medium severity - architectural consistency), (2) DEFAULT_SHOPPING_LIST_SEARCH removal needs explicit call-site migration steps (Minor severity - completeness), and (3) ShoppingListLinkChip's flexible routing props (to/params/listId) should be preserved or explicitly simplified with justification (Medium severity - API design).

---

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `docs/ui_component_workflow.md` — **Pass** — `plan.md:9-35,58-64,438-445` — Plan explicitly follows Principle #1 "Encapsulation: All styling lives in components/ui. Reusable components do NOT expose className props" and Principle #6 "Aggressive Cleanup: Remove className props completely—do NOT keep them as deprecated or no-op parameters." The plan states "REMOVE className prop from KitLinkChip and ShoppingListLinkChip interfaces" and "Plan to REMOVE className props from domain-specific wrappers completely (not deprecate, REMOVE)."

- `docs/ui_component_workflow.md` — **Pass** — `plan.md:40-82` — Plan follows workflow structure with research log (Section 0), intent/scope (Section 1), affected areas (Section 2), and implementation slices (Section 14). The scope correctly identifies this as technical debt work with explicit out-of-scope boundaries (no new features, no backward compatibility).

- `docs/contribute/architecture/application_overview.md` — **Pass** — `plan.md:206-218,309-323` — Plan correctly identifies this as pure presentational component work with "No Backend API Changes," "No Async State or Query Coordination," and "No Test-Mode Instrumentation." This aligns with the architecture's separation of concerns: UI components in `src/components/ui/` are presentational building blocks (line 52 of application_overview.md).

- `docs/contribute/testing/playwright_developer_guide.md` — **Pass** — `plan.md:449-500,531-537` — Plan maintains existing Playwright test coverage without requiring new instrumentation. The deterministic test plan correctly relies on `data-testid` attributes (matching line 186 of playwright_developer_guide.md: "Add data-testid attributes when semantic roles are insufficient") and preserves existing test structure to avoid regressions.

- `docs/commands/plan_feature.md` — **Pass** — `plan.md:3-35,85-142,145-201` — Plan structure matches template requirements: Research Log (Section 0), Intent & Scope with prompt quotes (Section 1), Affected Areas with evidence (Section 2), Data Model/Contracts (Section 3). Evidence citations use `path:line-range` format as required.

**Fit with codebase**

- `src/components/ui/status-badge.tsx` — `plan.md:155-185,186-201` — **Alignment confirmed with exception**: Plan models LinkChip after StatusBadge pattern (lines 13-14: "Reviewed StatusBadge as a reference for presentational component design"). StatusBadge explicitly does NOT accept className (line 36: "Intentionally does not support custom className prop to enforce the 3-color abstraction"). However, the plan's LinkChipProps interface does not show className, and domain wrappers explicitly remove it (line 199: "removes className prop (breaking change)"). **EXCEPTION**: Both KitLinkChip and ShoppingListLinkChip currently accept and use className (kit-link-chip.tsx:15,43,71; shopping-list-link-chip.tsx:34,54,91), passing it to the container via cn() utility. The plan must clarify whether LinkChip will accept className internally or completely ban it like StatusBadge.

- `src/components/ui/button.tsx` — `plan.md:220-257` — **Alignment confirmed**: Button component (lines 1-50 of button.tsx) DOES accept className and merges it via cn() utility, unlike StatusBadge. The plan references Button for the unlink button implementation but does not clarify whether LinkChip follows Button's pattern (accepts className) or StatusBadge's pattern (rejects className). This is an unresolved architectural decision.

- `src/components/kits/kit-link-chip.tsx` and `src/components/shopping-lists/shopping-list-link-chip.tsx` — `plan.md:38-45,186-201` — **Fit issue**: Plan claims "Components do NOT accept className props currently (good — aligns with StatusBadge pattern)" (line 28), but this is factually incorrect. Both components declare `className?: string` in their props interfaces (kit-link-chip.tsx:15, shopping-list-link-chip.tsx:34) and apply it to the container div (kit-link-chip.tsx:71, shopping-list-link-chip.tsx:91). The plan correctly identifies that no call sites USE className (line 444: "Grep search confirmed no call sites pass className prop"), but the statement that components "do NOT accept" it is misleading.

- `src/components/shopping-lists/shopping-list-link-chip.tsx` — `plan.md:417-424` — **Migration gap**: Plan states "ShoppingListLinkChip currently has DEFAULT_SHOPPING_LIST_SEARCH constant; this will be moved to call sites for consistency" (line 419). However, Section 2 (Affected Areas) does not list any usage sites that need to be updated to pass explicit search props after this constant is removed. The only usage site documented is kits/kit-detail-header.tsx (line 118), but no evidence is provided showing whether it relies on the default or passes explicit search.

- `@tanstack/react-router Link` — `plan.md:211-217,220-257` — **Alignment confirmed**: Plan correctly uses TanStack Router's Link component for navigation (lines 213-215: "Surface: <Link /> component from @tanstack/react-router. Inputs: to, params, search props passed through from LinkChip"). This matches existing usage in both link chip implementations.

---

## 3) Open Questions & Ambiguities

**Question 1: LinkChip className Policy**

- **Question**: Should LinkChip accept a className prop (like Button) or reject it entirely (like StatusBadge)?
- **Why it matters**: The plan references StatusBadge as the model (line 13) but both existing link chips accept className. If LinkChip rejects className, the plan must justify why the base component is more restrictive than domain wrappers. If LinkChip accepts className, this contradicts the UI workflow principle "Reusable components do NOT expose className props" (ui_component_workflow.md:9).
- **Needed answer**: Explicit architectural decision with justification. **RESOLVED via research**: The UI workflow document (ui_component_workflow.md:9) states "Reusable components do NOT expose className props" as Principle #1. StatusBadge (line 36) enforces this by explicitly documenting "Intentionally does not support custom className prop." The plan SHOULD follow this pattern. The existing className props in KitLinkChip and ShoppingListLinkChip are technical debt to be removed, not features to preserve. **Recommendation**: LinkChip must NOT accept className. Update plan to clarify this design decision and correct the misleading statement at line 28.

**Question 2: DEFAULT_SHOPPING_LIST_SEARCH Migration**

- **Question**: Which call sites currently rely on DEFAULT_SHOPPING_LIST_SEARCH, and how will they be updated when the constant is removed?
- **Why it matters**: Removing a default value is a breaking change. If call sites implicitly rely on it, they must be updated to pass explicit search props. The plan identifies this change (line 419) but provides no migration steps.
- **Needed answer**: Explicit list of affected call sites and migration code. **RESOLVED via research**: ShoppingListLinkChip is used in two locations: (1) parts/part-details.tsx:385-392 (does NOT pass search prop, so relies on default), (2) kits/kit-detail-header.tsx:235-243 (does NOT pass search prop, so relies on default). Both will break when DEFAULT_SHOPPING_LIST_SEARCH is removed unless the refactored wrapper supplies the default internally. **Recommendation**: Keep default search logic inside ShoppingListLinkChip wrapper (not LinkChip) to maintain call-site compatibility. Add explicit note to plan Section 2 documenting this decision.

**Question 3: ShoppingListLinkChip Routing Flexibility**

- **Question**: Should LinkChip preserve ShoppingListLinkChip's flexible routing API (to/params/listId alternatives) or simplify to require explicit to/params always?
- **Why it matters**: ShoppingListLinkChip accepts either `listId` (convenience) or explicit `to`/`params` (flexibility) with runtime validation (lines 66-73 of shopping-list-link-chip.tsx). KitLinkChip only accepts `kitId` (simpler). If LinkChip follows KitLinkChip's pattern, ShoppingListLinkChip's wrapper must handle the to/params fallback logic. If LinkChip accepts both patterns, the component becomes more complex.
- **Needed answer**: API design decision. **RESOLVED via research**: The LinkChipProps interface in plan.md:156-185 uses the explicit `to/params` pattern (lines 158-160), not the listId shorthand. This means ShoppingListLinkChip wrapper must convert listId to to/params before delegating to LinkChip. Existing ShoppingListLinkChip already does this (lines 66-73), so the wrapper will preserve this logic. **Recommendation**: No plan change needed, but Section 5 (Algorithms & UI Flows) should document the wrapper's routing resolution logic to clarify this design.

---

## 4) Deterministic Playwright Coverage (new/changed behavior only)

**No New User-Visible Behavior**

This refactoring is purely internal. All user-facing behavior (link chip appearance, navigation, unlink interactions, accessibility) remains identical. Playwright coverage relies on existing specs that assert on testId structure and UI interactions.

**Behavior: Link Chip Rendering and Navigation**

- **Scenarios**:
  - Given part with kit/list memberships, When part detail loads, Then link chips render with correct names and statuses (`tests/e2e/shopping-lists/parts-entrypoints.spec.ts`)
  - Given kit chip, When clicked, Then navigates to kit detail page (`tests/e2e/shopping-lists/shopping-lists-detail.spec.ts:52-59`)
  - Given list chip, When clicked, Then navigates to shopping list detail page (inferred from KitLinkChip usage pattern)
- **Instrumentation**: Existing testIds maintained: `parts.detail.kit.badge`, `parts.detail.shopping-list.badge`, `shopping-lists.concept.body.kits.{kitId}`, `kits.detail.links.shopping.{listId}`. Wrapper testId pattern `${testId}.wrapper` preserved (plan.md:284-291).
- **Backend hooks**: No backend changes required. Tests use existing factories to seed parts, kits, and shopping lists with memberships.
- **Gaps**: None. Plan explicitly documents test stability (Section 13, lines 449-500) and lists all affected specs (Section 2, lines 121-141).
- **Evidence**: `plan.md:121-141,449-500,543-548`

**Behavior: Unlink Button Visibility and Interaction**

- **Scenarios**:
  - Given link chip with onUnlink prop, When hovered, Then unlink button becomes visible (existing behavior, no new tests needed)
  - Given unlink button, When clicked, Then unlink mutation triggered and chip updates (`tests/e2e/shopping-lists/shopping-lists-detail.spec.ts` for kit unlinks, inferred for list unlinks)
- **Instrumentation**: Existing unlink testIds maintained: `shopping-lists.concept.body.kits.{kitId}.unlink`, `kits.detail.links.shopping.unlink.{listId}`. Plan documents these at lines 473-474, 486-487.
- **Backend hooks**: Existing API endpoints for kit/list unlinking used by parent components via TanStack Query mutations.
- **Gaps**: None. Unlink behavior is tested via parent component specs (shopping list detail, kit detail).
- **Evidence**: `plan.md:465-490`

**Behavior: Accessibility Attributes**

- **Scenarios**:
  - Given link chip, When rendered, Then aria-label and title match "${name} (${status})" pattern (existing behavior, validated by accessibility testing tools, not explicitly in Playwright)
- **Instrumentation**: No test-specific instrumentation for accessibility. Plan correctly identifies this as preserved existing pattern (lines 426-436).
- **Backend hooks**: N/A (frontend-only concern)
- **Gaps**: None. Accessibility patterns are preserved exactly (plan.md:254,281,349,426-436).
- **Evidence**: `plan.md:426-436`

---

## 5) Adversarial Sweep (must find ≥3 credible issues or declare why none exist)

**Medium — StatusBadge className Exception Creates Architectural Inconsistency**

**Evidence:** `plan.md:13-14,28-29,155-185` + `src/components/ui/status-badge.tsx:36` + `docs/ui_component_workflow.md:9`

**Why it matters:** The plan cites StatusBadge as the reference pattern (line 13: "Reviewed StatusBadge as a reference for presentational component design") and claims "Components do NOT accept className props currently (good — aligns with StatusBadge pattern)" (line 28). However, BOTH existing link chips DO accept className (kit-link-chip.tsx:15, shopping-list-link-chip.tsx:34). The plan does not clarify whether LinkChip will accept className internally. If yes, this violates the UI workflow principle "Reusable components do NOT expose className props" (ui_component_workflow.md:9) and contradicts the StatusBadge reference. If no, the plan should explicitly state this design decision and justify why the base component is more restrictive than the existing implementations. The current ambiguity creates risk that the implementer will add className to LinkChip "just in case," undermining the workflow's encapsulation goal.

**Fix suggestion:** Add explicit subsection to Section 3 (Data Model / Contracts) documenting LinkChip's className policy:
```markdown
**className Prop Policy (Explicit Exclusion)**

- Entity / contract: LinkChip component API
- Decision: LinkChip does NOT accept className prop, following StatusBadge pattern and UI workflow Principle #1
- Rationale: All styling is encapsulated in the base component. Domain wrappers have no legitimate need for className overrides. Existing className props in KitLinkChip/ShoppingListLinkChip are unused technical debt (verified via grep at line 444).
- Evidence: docs/ui_component_workflow.md:9 (Principle #1), src/components/ui/status-badge.tsx:36 (StatusBadge precedent)
```

**Confidence:** High — This is a clear architectural decision point that the plan leaves implicit. Making it explicit prevents implementation drift.

---

**Minor — DEFAULT_SHOPPING_LIST_SEARCH Removal Lacks Call-Site Migration Steps**

**Evidence:** `plan.md:417-424` + `src/components/shopping-lists/shopping-list-link-chip.tsx:10-13,68-69` + `src/components/parts/part-details.tsx:384-392` + `src/components/kits/kit-detail-header.tsx:235-243`

**Why it matters:** Plan states "ShoppingListLinkChip currently has DEFAULT_SHOPPING_LIST_SEARCH constant; this will be moved to call sites for consistency" (line 419). However, research shows BOTH usage sites (part-details.tsx:385-392, kit-detail-header.tsx:235-243) do NOT pass a search prop, so they implicitly rely on the default. If the constant is removed from the component AND not added to call sites, the refactored component will pass `undefined` as search, breaking the existing behavior (shopping list detail page will lose its default sort order).

**Fix suggestion:** Update Section 2 (Affected Areas) to document call-site migration OR update Section 5 (Algorithms & UI Flows) to clarify that ShoppingListLinkChip wrapper will maintain the default internally:
```markdown
- Area: `src/components/shopping-lists/shopping-list-link-chip.tsx` (wrapper logic)
- Why: Wrapper must supply DEFAULT_SHOPPING_LIST_SEARCH when search prop is undefined to maintain backward compatibility with call sites
- Evidence: src/components/parts/part-details.tsx:385-392, src/components/kits/kit-detail-header.tsx:235-243 (neither passes search prop)
```

Alternatively, if the decision is to move the default to call sites, Section 2 must add:
```markdown
- Area: `src/components/parts/part-details.tsx`
- Why: Update ShoppingListLinkChip usage to pass explicit search={{ sort: 'description' }}
- Evidence: Current usage (lines 385-392) relies on component default

- Area: `src/components/kits/kit-detail-header.tsx`
- Why: Update ShoppingListLinkChip usage to pass explicit search={{ sort: 'description' }}
- Evidence: Current usage (lines 235-243) relies on component default
```

**Confidence:** High — This is a factual gap in the migration plan. The resolution is straightforward but must be documented.

---

**Low — ShoppingListLinkChip to/params Conversion Not Documented in Wrapper Flow**

**Evidence:** `plan.md:156-185,259-269` + `src/components/shopping-lists/shopping-list-link-chip.tsx:66-73`

**Why it matters:** LinkChipProps interface (lines 156-185) uses explicit `to: string` and `params: Record<string, string>`, not the convenience `listId?: number` pattern that ShoppingListLinkChip currently supports. The wrapper will need to convert listId to to/params before delegating to LinkChip (existing code at lines 66-73 already does this). Section 5 (Algorithms & UI Flows) documents "Status Badge Mapping" logic in wrappers (lines 259-269) but does NOT document the routing resolution logic. This creates a minor completeness gap—the implementation plan should explicitly list all wrapper responsibilities.

**Fix suggestion:** Add subsection to Section 5 (Algorithms & UI Flows):
```markdown
**Routing Resolution (ShoppingListLinkChip Wrapper)**

- Flow: Convert listId convenience prop to explicit to/params for LinkChip
- Steps:
  1. Wrapper receives either (listId + optional to/params overrides) OR (explicit to/params)
  2. If listId provided, construct `to = '/shopping-lists/$listId'` and `params = { listId: String(listId) }`
  3. If explicit to/params provided, use them as-is
  4. Throw error if neither listId nor params provided (validation preserved from existing implementation)
  5. Pass resolved to/params to LinkChip
- States / transitions: N/A (pure function)
- Hotspots: Runtime validation ensures call sites provide sufficient routing info
- Evidence: src/components/shopping-lists/shopping-list-link-chip.tsx:66-73 (existing logic to preserve)
```

**Confidence:** Medium — This is a minor documentation gap, not a design flaw. The existing code already handles this correctly; the plan just needs to make the wrapper's responsibilities explicit.

---

**Adversarial Checks Attempted (No Additional Issues Found)**

- **Cache invalidation risk**: Checked whether LinkChip or wrappers interact with TanStack Query cache. PASS — Components are pure presentational; no cache writes or invalidations (Section 7, lines 304-323).
- **React concurrency gotchas**: Checked for useEffect/useState usage that could interact with Concurrent Mode. PASS — No lifecycle hooks; pure render function (Section 10, lines 391-401).
- **Event propagation conflicts**: Checked whether stopPropagation on Link/Button could break parent handlers. PASS — Plan explicitly documents this risk (Section 15, lines 556-560) and notes that existing implementations already use stopPropagation, so no new risk is introduced.
- **TestID structure brittleness**: Checked whether Playwright specs rely on undocumented testId patterns. PASS — Plan documents all testId structures (lines 375-387, 457-461) and explicitly preserves the `.wrapper` suffix convention (lines 284-291).
- **Accessibility attribute conflicts**: Checked for overlapping aria-labels on container/link/button. PASS — Plan documents the risk (Section 15, lines 550-554) and notes that existing implementations already use this pattern without issues. Mitigation strategy is provided (prioritize Link aria-label if conflicts arise).
- **Generated API type alignment**: Checked whether domain wrappers use generated types correctly. PASS — KitStatus and ShoppingListStatus are imported from generated types (kit-link-chip.tsx:8, shopping-list-link-chip.tsx:8), and wrappers map them to badge props (plan.md:28-36,16-25).

**Why the plan holds:** This is a pure presentational refactoring with no new state, no backend changes, no instrumentation, and no async coordination. The primary risks are architectural consistency (className policy) and backward compatibility (DEFAULT_SHOPPING_LIST_SEARCH), both of which are identified above. The plan's research phase is thorough, all usage sites are documented, and existing Playwright coverage is preserved. The adversarial sweep found three issues, all addressable with documentation clarifications rather than fundamental design changes.

---

## 6) Derived-Value & State Invariants (table)

**Derived value: accessibilityLabel**
- **Source dataset**: Constructed from `label` and `statusBadgeLabel` props via template string `${label} (${statusBadgeLabel})`
- **Write / cleanup triggered**: Applied to container and Link aria-label/title attributes on every render; no cleanup (immutable string)
- **Guards**: None (always constructed from provided props; TypeScript enforces non-null strings)
- **Invariant**: accessibilityLabel MUST be consistent across container aria-label, Link aria-label, and title attributes. Divergence would confuse screen readers and break accessibility contract.
- **Evidence**: `plan.md:276-282`

**Derived value: wrapperTestId**
- **Source dataset**: Constructed from testId prop if present: `testId ? ${testId}.wrapper : undefined`
- **Write / cleanup triggered**: Applied to container div data-testid attribute; no cleanup (string or undefined)
- **Guards**: Only set if testId prop is provided (conditional derivation)
- **Invariant**: Wrapper testId MUST follow `.wrapper` suffix convention. Playwright specs rely on this pattern (e.g., `shopping-lists.concept.body.kits.${kitId}.wrapper`). Breaking this convention would orphan test selectors and cause spec failures.
- **Evidence**: `plan.md:284-291`

**Derived value: Conditional Container Padding Classes**
- **Source dataset**: Computed from `onUnlink` prop presence: `onUnlink && 'hover:pr-9 focus-within:pr-9 [@media(pointer:coarse)]:pr-9'`
- **Write / cleanup triggered**: Applied to container className via cn() utility; no cleanup (immutable class string)
- **Guards**: Only add padding classes if onUnlink callback is provided
- **Invariant**: Container padding MUST expand on hover/focus when unlink button is present to prevent visual overlap. Container padding MUST NOT expand when onUnlink is undefined (visual glitch—button doesn't exist but space is reserved). Violating this creates layout shifts and broken hover states.
- **Evidence**: `plan.md:293-300`

**Derived value: Status Badge Props (Domain Wrappers)**
- **Source dataset**: Mapped from domain status enums (KitStatus, ShoppingListStatus) via switch statements in wrapper functions getKitStatusBadgeProps / getShoppingListBadgeProps
- **Write / cleanup triggered**: Passed as statusBadgeColor/statusBadgeLabel to LinkChip on every render; no cleanup (pure function output)
- **Guards**: Switch statements exhaustively cover all status values (TypeScript enforces via enum types)
- **Invariant**: Status mapping MUST be consistent with existing implementations (e.g., KitStatus.active → 'active'/'Active', KitStatus.archived → 'inactive'/'Archived'). Changing mappings would create visual regressions and confuse users. Wrapper functions are idempotent (same input always produces same output).
- **Evidence**: `plan.md:259-269`

> **No filtered-view writes detected**: All derived values are pure render-time computations. No persistent state (cache, localStorage, URL params) is mutated based on filtered datasets. No guards are bypassed. No Major severity risk under Section 6 criteria.

---

## 7) Risks & Mitigations (top 3)

**Risk 1: TestID Structure Assumptions**

- **Risk**: Playwright specs may rely on undocumented testId conventions (e.g., `.wrapper` suffix, badge/icon/unlink suffixes) that are not captured in the plan. If the refactored LinkChip changes the testId structure or the wrappers alter how they construct testIds, specs will fail with "element not found" errors. This is especially risky because the plan documents testId preservation (lines 284-291, 375-387) but does not include a verification step to run affected specs before declaring work complete.
- **Mitigation**: Run all affected Playwright specs BEFORE declaring work complete (plan.md:531-537 includes this as Slice 4). If any specs fail, the testId structure must be adjusted to match existing patterns. The plan should add an explicit verification checkpoint: "All affected specs (shopping-lists-detail.spec.ts, parts-entrypoints.spec.ts) must pass with zero changes to locator code. If specs require updates, document the testId changes in plan_review.md."
- **Evidence**: `plan.md:121-141,284-291,375-387,543-548`

**Risk 2: Visual Regressions from Padding Standardization**

- **Risk**: Subtle differences in hover padding behavior between KitLinkChip and ShoppingListLinkChip may exist (though plan claims ~95% similarity, line 7). Standardizing to a single LinkChip implementation could introduce layout shifts, misaligned unlink buttons, or inconsistent touch-device behavior. The plan accepts this risk (lines 562-566: "Accept minor visual differences as acceptable tradeoff") but does not include a manual visual verification step.
- **Mitigation**: Test manually in browser at all affected locations (part detail page, shopping list detail header, kit detail header) to confirm hover/focus padding, unlink button positioning, and touch device behavior match existing implementations. Add screenshots to plan_review.md if discrepancies are found. If visual differences are unacceptable, adjust LinkChip styling before finalizing. The plan should add a verification step: "Manual browser testing at all usage sites to confirm no layout regressions (hover states, unlink button alignment, touch device visibility)."
- **Evidence**: `plan.md:7,293-300,562-566`

**Risk 3: DEFAULT_SHOPPING_LIST_SEARCH Removal Breaking Call Sites**

- **Risk**: If DEFAULT_SHOPPING_LIST_SEARCH constant is removed from ShoppingListLinkChip component and NOT preserved in the wrapper or migrated to call sites, both usage sites (part-details.tsx, kit-detail-header.tsx) will pass `undefined` as the search prop. This will break shopping list navigation behavior—clicking a list chip will no longer apply the default `sort: 'description'` parameter, changing the user experience.
- **Mitigation**: **Immediate fix required before implementation**: Update Section 2 (Affected Areas) to document how DEFAULT_SHOPPING_LIST_SEARCH will be handled. Either (a) preserve the default inside ShoppingListLinkChip wrapper when search prop is undefined, OR (b) update both call sites to pass explicit `search={{ sort: 'description' }}`. Add evidence citations showing current call sites do not pass search prop. Include verification step: "After refactoring, manually test shopping list navigation from part detail and kit detail pages to confirm sort order is preserved."
- **Evidence**: `plan.md:417-424` + `src/components/shopping-lists/shopping-list-link-chip.tsx:10-13,68-69` + usage sites at part-details.tsx:385-392, kit-detail-header.tsx:235-243

---

## 8) Confidence

**Confidence: High** — The plan is thorough, well-researched, and aligns with project patterns. The refactoring is low-risk (pure presentational work with no state, no backend, no instrumentation) and all usage sites are identified. The three issues identified in the adversarial sweep are documentation gaps (className policy, default search handling, routing resolution) rather than fundamental design flaws. Once the conditions are addressed (clarify className policy, document DEFAULT_SHOPPING_LIST_SEARCH handling, add routing resolution to wrapper flow), the plan is implementation-ready. Existing Playwright coverage and manual visual verification provide adequate safety nets against regressions.
