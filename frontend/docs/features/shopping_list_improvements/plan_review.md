# Shopping List Improvements – Plan Review

## 1) Summary & Decision

**Readiness**

The plan is thorough and implementation-ready with strong evidence backing each decision. It correctly mirrors the existing kit detail unlink pattern, properly accounts for cache invalidation and explicit refetch requirements, and defines comprehensive instrumentation scopes. The 16-section structure covers all necessary aspects from data contracts to Playwright scenarios. However, three architectural decisions remain ambiguous: (1) whether the header slots hook should return kitsQuery for route-level refetch, (2) the specific implementation strategy for chip layout collapse, and (3) backend factory requirements for deterministic test coverage.

**Decision**

`GO-WITH-CONDITIONS` — Plan is implementable and follows established patterns, but requires resolving three architectural ambiguities before implementation: clarify kitsQuery exposure strategy (hook return vs route duplication), lock down chip collapse implementation approach (absolute positioning vs conditional render vs width:0), and document required backend factories for Playwright coverage.

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `AGENTS.md` — Pass — plan.md:1-16 — Research log demonstrates repository scanning and existing pattern reuse per "Follow the patterns documented in the contributor guides; prefer extending existing abstractions"
- `plan_feature.md` — Pass — plan.md:1-483 — All 16 required sections present with structured templates, evidence citations, and file:line references
- `playwright_developer_guide.md` — Pass — plan.md:377-408 — Test plan uses instrumentation-first approach, includes Given/When/Then scenarios, specifies data-testid patterns, and waits on test-event signals per "tests frequently assert on emitted test-event payloads"
- `application_overview.md` — Pass — plan.md:130-148 — API surface uses generated hooks (useKitShoppingListUnlinkMutation, useGetShoppingListsKitsByListId), TanStack Query cache invalidation, and camelCase domain models per architecture snapshot
- `test_instrumentation.md` — Pass — plan.md:269-285 — Instrumentation scope `shoppingLists.detail.kitUnlinkFlow` follows ui_state taxonomy with phases (open, submit, success, error) and structured metadata per event taxonomy table

**Fit with codebase**

- `useKitShoppingListUnlinkMutation` (use-kit-shopping-list-links.ts:184-243) — plan.md:130-142 — Hook already exists and handles cache invalidation correctly via `invalidateKitShoppingListCaches`; plan correctly leverages it
- `useShoppingListDetailHeaderSlots` (detail-header-slots.tsx:56-257) — plan.md:68-70 — Plan proposes hook receives `onUnlinkKit` callback from route and threads to chips; aligns with separation of concerns (route owns state/mutation, hook owns rendering)
- `KitLinkChip` (kit-link-chip.tsx:31-85) — plan.md:64-66 — Plan extends component with optional unlink props matching `ShoppingListLinkChip` pattern (onUnlink, unlinkDisabled, unlinkLoading, unlinkTestId); consistent with existing chip architecture
- `KitDetail` unlink pattern (kit-detail.tsx:246-408) — plan.md:171 — Plan mirrors route-owned state (linkToUnlink, unlinkingLinkId), mutation, dialog, and instrumentation; explicit `.refetch()` call at line 387 correctly identified as codebase pattern
- Skeleton loading state (detail-header-slots.tsx:149-180) — plan.md:173-187 — Early return missing `linkChips` slot confirmed; fix adds skeleton for state (a) while existing lines 244-248 handle state (b); no redundancy because early return exits

## 3) Open Questions & Ambiguities

- Question: Should `useShoppingListDetailHeaderSlots` return `kitsQuery` object, or should the route call `useGetShoppingListsKitsByListId` separately for refetch access?
- Why it matters: Route needs `kitsQuery.refetch()` after successful unlink (plan.md:160, 221) to reload kit chips immediately. Hook currently calls query internally (detail-header-slots.tsx:115-118) but doesn't expose it. Returning it changes hook API; duplicating query in route may cause double-fetching during mount.
- Needed answer: Architect decision with justification. Recommend: Hook should return `{ slots, overlays, kitsQuery }` to match kit-detail pattern where route has direct query access. Alternative (route calls query separately) requires disabling query in hook when route provides its own, adding complexity.

---

- Question: Which chip collapse implementation strategy should be used: (a) absolute positioning, (b) conditional rendering based on hover state, or (c) CSS width:0 with flex layout?
- Why it matters: Plan section 14 slice 5 (plan.md:435-440) lists three options without recommendation. Each has different implications for accessibility (keyboard navigation, screen readers), animation smoothness (layout reflow vs transform), and browser compatibility. Wrong choice may require rework during implementation or cause accessibility issues.
- Needed answer: Lock down approach before implementation. Consider: absolute positioning (position: absolute; right: 0.5rem; opacity transition) avoids layout reflow but complicates responsive design; conditional rendering requires hover state in React (complex for CSS-only hover); width:0 approach conflicts with flex-shrink-0. Recommend absolute positioning with reduced-motion media query support, matching badge patterns elsewhere in codebase.

---

- Question: What backend factories are required for Playwright coverage of kit-shopping-list link unlink flow?
- Why it matters: Plan section 13 (plan.md:377-398) describes test scenarios requiring: (1) create shopping list, (2) create kit, (3) create kit-shopping-list link, (4) unlink specific link. factories_and_fixtures.md documents TypeTestFactory and PartTestFactory but doesn't mention kit or shopping list factories. Missing factories block deterministic test implementation per playwright_developer_guide.md core principle #1: "API-first data setup."
- Needed answer: Audit tests/api/factories/ to confirm existence of (or plan to add): KitTestFactory, ShoppingListTestFactory, KitShoppingListLinkFactory. If missing, backend work must precede Playwright specs or plan should note this dependency in section 14 (Implementation Slices).

## 4) Deterministic Playwright Coverage (new/changed behavior only)

- Behavior: Kit chip unlink from shopping list detail page
- Scenarios:
  - Given shopping list detail loaded with 2 kit links, When user hovers over first kit chip, Then unlink button fades in (plan.md:381)
  - Given unlink button visible, When user clicks unlink button, Then ui_state event phase 'open' emitted with targetKitId and listId (plan.md:382)
  - Given confirmation dialog open, When user clicks confirm, Then ui_state phase 'submit' emitted, DELETE /kit-shopping-list-links/{linkId} called (plan.md:385)
  - Given DELETE succeeds (200), When response received, Then ui_state phase 'success' emitted, success toast shows, kit chip removed after refetch (plan.md:386)
  - Given DELETE returns 404, When response received, Then ui_state phase 'success' with noop:true, warning toast shows, chip removed after refetch (plan.md:387)
  - Given DELETE fails (500), When response received, Then ui_state phase 'error' emitted with error details, error toast shows, chip remains (plan.md:388)
  - Given shopping list status is 'done', When page renders, Then kit chips render without unlink buttons (plan.md:389)
  - Given unlinking kit A in progress, When user clicks unlink on kit B, Then second click ignored (plan.md:390)
  - Given list contains archived kit link, When page renders, Then archived kit chip shows unlink button on hover (plan.md:391)
- Instrumentation:
  - Wait for ListLoading scope 'shoppingLists.detail.kits' phase 'ready' before interacting (plan.md:393)
  - Wait for ui_state scope 'shoppingLists.detail.kitUnlinkFlow' phase 'success' before asserting chip removed (plan.md:394)
  - Use data-testid="shopping-lists.concept.body.kits.{kitId}.unlink" for unlink buttons (plan.md:395)
  - Use data-testid="shopping-lists.detail.kit-unlink.dialog" for confirmation dialog (plan.md:396)
- Backend hooks: **Missing** — Plan doesn't specify required factories. Need confirmation that testData.shoppingLists.create(), testData.kits.create(), and testData.kitShoppingListLinks.create() exist or must be added.
- Gaps: Chip collapse behavior not covered (plan.md:435-440 describes fix but no test scenario); icon standardization not tested (visual change, low priority)
- Evidence: plan.md:377-398 — scenarios section; tests/e2e/kits/kit-detail.spec.ts referenced as pattern for kit side unlink

---

- Behavior: Shopping list detail skeleton loading state padding consistency
- Scenarios:
  - Given navigating to shopping list detail, When kitsQuery is loading, Then kit chips skeleton renders in content body with same wrapper classes as loaded kit chips (plan.md:402)
  - Given kit chips skeleton rendered, When kitsQuery completes, Then actual kit chips render with no perceived padding shift (plan.md:403)
- Instrumentation:
  - Wait for ListLoading scope 'shoppingLists.list' phase 'ready' to assert loading complete (plan.md:405)
  - Capture screenshot during loading to verify skeleton padding matches (plan.md:406)
- Backend hooks: Standard shopping list with kit links (no special backend setup beyond existing factories)
- Gaps: Visual regression testing may be needed; manual verification acceptable per plan note (plan.md:407)
- Evidence: plan.md:400-408 — skeleton padding scenarios; docs/outstanding_changes.md:46 cited as original issue description

## 5) Adversarial Sweep (must find ≥3 credible issues or declare why none exist)

**Major — Ambiguous kitsQuery exposure strategy blocks explicit refetch pattern**
**Evidence:** plan.md:221 — "Route needs access to kitsQuery (from hook return or by calling useGetShoppingListsKitsByListId directly)"; plan.md:420 — "Route needs access to kitsQuery for refetch (from hook return or direct call to useGetShoppingListsKitsByListId)"
**Why it matters:** Plan correctly identifies explicit refetch requirement (plan.md:160, 193, 221) matching kit-detail.tsx:387 pattern, but leaves architectural decision open-ended. If route calls query separately, it duplicates the hook's internal query (detail-header-slots.tsx:115-118), potentially causing double-fetching on mount and complicating enabled/disabled coordination. If hook returns query, it changes hook API and requires updating route to destructure `{ slots, overlays, kitsQuery }` instead of current `{ slots, overlays }`.
**Fix suggestion:** Plan section 2 (Affected Areas) should recommend: "Extend useShoppingListDetailHeaderSlots return type to include kitsQuery so route can call kitsQuery.refetch() after mutation success. Update ConceptHeader component (src/routes/shopping-lists/$listId.tsx) to destructure kitsQuery from hook and pass to unlink handler closure." This matches kit-detail pattern where route has direct query access via useKitDetail return.
**Confidence:** High — Both approaches work, but hook-return strategy avoids query duplication and is consistent with kit-detail architecture (useKitDetail returns query object at kit-detail.tsx:62-72)

---

**Major — Chip collapse implementation strategy not locked down risks rework during implementation**
**Evidence:** plan.md:437-439 — "adjust unlink button layout to not reserve space when opacity-0; options include: (a) absolute positioning with right offset, (b) conditional rendering based on hover state, (c) CSS grid/flexbox with width:0 when hidden"
**Why it matters:** Each approach has different implications. Absolute positioning (a) avoids layout reflow but adds z-index complexity and complicates responsive layouts where chip width varies. Conditional rendering (b) requires React state for hover (useHover hook or onMouseEnter/Leave), adding component complexity and potential flickering on fast hover. Width:0 approach (c) conflicts with flex-shrink-0 currently on button (shopping-list-link-chip.tsx per plan.md:90) and may not fully hide button due to padding/margins. Plan section 15 (plan.md:466-468) mentions "Use CSS transitions for smooth expansion/collapse" but doesn't specify which base approach to use. Developer implementing slice 5 may choose wrong approach and require rework.
**Fix suggestion:** Plan section 14 slice 5 should recommend: "Use absolute positioning approach: unlink button positioned absolutely within chip container (position: relative), offset right: 0.5rem. Transition opacity only (no width/position animation to avoid layout reflow). Add reduced-motion media query to disable transition for accessibility. Test with keyboard navigation to ensure focus visible." Reference existing absolute-positioned patterns in codebase (e.g., badge overlays, dropdown indicators) if present.
**Confidence:** High — Absolute positioning is standard pattern for hover-revealed actions that shouldn't reserve space (seen in card hover actions, table row actions). Conditional rendering adds unnecessary React complexity for pure CSS interaction.

---

**Major — Missing backend factory documentation blocks Playwright implementation**
**Evidence:** plan.md:377-398 — test scenarios require creating shopping list, kit, and kit-shopping-list link; factories_and_fixtures.md documents TypeTestFactory and PartTestFactory but no mention of kit or shopping list factories
**Why it matters:** playwright_developer_guide.md core principle #1 states "API-first data setup – Always create prerequisite data with factories; UI interactions are only for the scenario under test." Test scenario "Given shopping list detail page loaded with 2 kit links" (plan.md:381) requires backend factories to seed deterministic data. Without documented factories, developer implementing slice 4 (plan.md:430-433) cannot write specs without either (1) discovering factories exist but are undocumented, (2) adding missing factories (backend work outside scope), or (3) violating no-route-mocks policy by stubbing data.
**Fix suggestion:** Plan section 13 (Deterministic Test Plan) should add: "Backend factories required: testData.shoppingLists.create({ name?, description?, status? }), testData.kits.create({ name?, status? }), testData.kitShoppingListLinks.create({ kitId, shoppingListId, requestedUnits?, honorReserved? }). If factories missing, coordinate with backend team to add before implementing slice 4 (Playwright coverage)." Check tests/api/factories/ to confirm existence or add to plan dependencies.
**Confidence:** High — Factories are mandatory per testing policy; their absence blocks test implementation. Simple audit of tests/api/factories/ resolves uncertainty.

---

**Minor — Icon standardization scope uses vague "or equivalent" language**
**Evidence:** plan.md:445-448 — "src/components/layout/sidebar.tsx (or equivalent sidebar navigation component) — change kit navigation icon from Package to CircuitBoard"
**Why it matters:** "Or equivalent" suggests planner didn't locate exact file. If sidebar structure differs (e.g., navigation in app-shell.tsx or separate nav component), implementer must re-search. Plan.md:94 states "Current inconsistency: Package icon in sidebar/part-detail chips, Layers in shopping list kit chips (per plan), CircuitBoard in part cards (correct baseline)" but doesn't provide file:line evidence for Package usage locations.
**Fix suggestion:** Plan section 14 slice 6 should include grep results: "Run `grep -r 'from.*lucide-react' src/components | grep -E '(Package|Layers)' to locate all kit-related icon imports. Audit each usage to confirm kit context before replacing." Provide concrete file list instead of "or equivalent."
**Confidence:** Medium — Not blocking (implementer can grep during implementation) but reduces plan precision. Evidence-based planning requires file:line citations per plan_feature.md method section.

---

**Minor — Disabled state pattern description could be clearer**
**Evidence:** plan.md:194 — "unlink button disabled if `unlinkingLinkId !== null` (prevents concurrent unlink operations)"; plan.md:251 — "handleUnlinkRequest checks `if (unlinkMutation.isPending || unlinkingLinkId !== null) return` before setting linkToUnlink; second click ignored"
**Why it matters:** Two guard mechanisms mentioned: (1) disabled prop on button, (2) early return in handler. Plan suggests ALL unlink buttons are disabled while ANY unlink is in flight (plan.md:194), but error handling section (plan.md:251-252) says handler-level guard prevents concurrent operations. These aren't contradictory (both can be true), but pattern isn't explicitly stated as: "ALL buttons disabled visually (unlinkDisabled={unlinkingLinkId !== null}), specific button shows loading (unlinkLoading={unlinkingLinkId === link.linkId}), AND handler guards against race condition." Developer may implement only one guard mechanism.
**Fix suggestion:** Plan section 2 (KitLinkChip component changes) should clarify: "Pass unlinkDisabled={unlinkingLinkId !== null} to disable ALL unlink buttons during any operation (prevents user confusion about which operation is in flight), unlinkLoading={unlinkingLinkId === link.linkId} to show spinner on specific button, AND implement handler-level guard (plan.md:276-285) as defense-in-depth against race conditions." Reference shopping-list-link-chip.tsx pattern if it follows same strategy.
**Confidence:** Medium — Pattern is correct but could be more explicit. Not blocking (existing ShoppingListLinkChip provides reference implementation per plan.md:7).

## 6) Derived-Value & State Invariants (table)

- Derived value: linkedKits
  - Source dataset: Mapped from kitsQuery.data via mapShoppingListKitLinks (unfiltered query response) at detail-header-slots.tsx:120
  - Write / cleanup triggered: After unlink mutation success, invalidateKitShoppingListCaches marks query stale (use-kit-shopping-list-links.ts:202,225), then explicit kitsQuery.refetch() in route success handler reloads (plan.md:160, 193, 387 pattern)
  - Guards: Unlink button not rendered when shoppingList.status === 'done' (onUnlink prop not passed to KitLinkChip per plan.md:257); unlink button disabled when unlinkingLinkId !== null (prevents concurrent operations per plan.md:194)
  - Invariant: linkedKits.length must equal kitLinkCount emitted in instrumentation metadata (detail-header-slots.tsx:129) AND must equal number of rendered KitLinkChip components in content body; after successful unlink, linkedKits.length must decrease by 1 unless 404 noop (plan.md:195-196)
  - Evidence: plan.md:191-196 — derived value section for linkedKits; detail-header-slots.tsx:120,129 — mapping and instrumentation usage

- Derived value: unlinkingLinkId
  - Source dataset: Set to link.linkId when mutation starts (submit phase); cleared to null in .finally() block when mutation settles
  - Write / cleanup triggered: Set in handleConfirmUnlink when user confirms dialog (plan.md:375-376 pattern); cleared in .finally() at plan.md:405 pattern to ensure cleanup even on error
  - Guards: handleUnlinkRequest checks `if (unlinkMutation.isPending || unlinkingLinkId !== null) return` before allowing new unlink request (plan.md:251,277-278); prevents starting second operation while first is in flight
  - Invariant: At most one link can be unlinking at a time; unlinkingLinkId must match a linkId in current linkedKits array or be null; unlinkingLinkId must be cleared (set to null) before user can start another unlink operation (plan.md:202)
  - Evidence: plan.md:198-203 — derived value section for unlinkingLinkId; kit-detail.tsx:119,278,376,405 — state management pattern from reference implementation

- Derived value: canUnlinkKits (boolean)
  - Source dataset: Computed as shoppingList.status !== 'done' when rendering kit chips (route-level check)
  - Write / cleanup triggered: No writes; read-only guard for unlink button rendering decision
  - Guards: Prevents unlink button from being rendered when list is completed (plan.md:257-258); backend also enforces constraint (double-check). Kit status (active/archived) does NOT affect this guard per plan.md:208,476 — archived kits can be unlinked if list is not done
  - Invariant: If list status is 'done', zero kit chips should render unlink buttons (onUnlink prop omitted); if list status is 'concept' or 'ready', ALL kit chips (regardless of kit status active/archived) should render interactive unlink buttons (plan.md:209-210)
  - Evidence: plan.md:205-211 — derived value section for canUnlinkKits; $listId.tsx:517 per plan — isCompleted check pattern

## 7) Risks & Mitigations (top 3)

- Risk: Ambiguous kitsQuery exposure decision may cause implementation delays or require rework when explicit refetch pattern is attempted during slice 2 implementation
- Mitigation: Resolve in plan revision before GO decision — recommend hook-return strategy (extend useShoppingListDetailHeaderSlots return type to include kitsQuery) to match kit-detail architecture and avoid query duplication
- Evidence: plan.md:221,420 — ambiguous "from hook return or direct call" language; kit-detail.tsx:62-72 — reference architecture where route has direct query access

---

- Risk: Chip collapse implementation strategy left open-ended may lead to accessibility issues (keyboard navigation, screen reader announcements) or animation jank (layout reflow) if wrong approach chosen during slice 5
- Mitigation: Lock down approach in plan revision — recommend absolute positioning with opacity transition only (no width/position animation) plus reduced-motion media query support; test with keyboard navigation and screen readers during implementation
- Evidence: plan.md:437-439 — three options listed without recommendation; plan.md:466-468 — risk noted but mitigation is generic "use CSS transitions"

---

- Risk: Missing backend factory documentation blocks Playwright implementation in slice 4, potentially delaying or requiring out-of-scope backend work
- Mitigation: Audit tests/api/factories/ immediately to confirm existence of kit, shopping list, and kit-shopping-list link factories; if missing, coordinate with backend team to add before slice 4 or defer Playwright coverage to follow-up work (not acceptable per AGENTS.md "Ship instrumentation changes and matching Playwright coverage in the same slice")
- Evidence: plan.md:377-398 — test scenarios require seeding kit-shopping-list links; factories_and_fixtures.md — no mention of required factories

## 8) Confidence

Confidence: High — Plan is thorough, well-evidenced, and correctly mirrors proven kit-detail unlink pattern. Cache invalidation strategy is correct (invalidate marks stale, explicit refetch reloads). Instrumentation follows documented taxonomy. Playwright scenarios are comprehensive. Three architectural ambiguities require resolution before implementation but are straightforward decisions (kitsQuery exposure strategy, chip collapse approach, factory audit). Once conditions addressed, plan is ready for implementation.
