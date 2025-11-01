# Plan Review: Alert Component Extraction

## 1) Summary & Decision

**Readiness**

The updated plan successfully addresses all four concerns from the previous review. The className prop decision is now properly justified and aligned with established UI component patterns (Badge, Button, Card, EmptyState all accept className). The action button layout rules are concrete and grounded in evidence from actual usage sites, with clear examples showing parent-controlled Button components. The shortfall badge exclusion is well-reasoned with structural and semantic differences documented. The testId pattern is clarified with explicit auto-append behavior for dismiss buttons. The plan provides comprehensive coverage of all alert patterns, follows project conventions for component extraction, and includes deterministic test coverage tied to existing specs.

**Decision**

`GO` — All previous blockers have been resolved. The plan is implementation-ready with clear scope, concrete contracts, and adequate risk mitigation. The className decision aligns with codebase patterns, action button handling maps cleanly to all identified usages, and test coverage is deterministic.

---

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `docs/commands/plan_feature.md` — Pass — `plan.md:1-637` — Plan follows the prescribed template structure with all required sections: research log, intent/scope, affected areas with file:line evidence, data model, API surface, algorithms, derived state, async coordination, errors, instrumentation, lifecycle, security, UX impact, test plan, slices, risks, and confidence rating. Evidence is quoted with file paths and line numbers throughout.

- `docs/product_brief.md` — Pass — `plan.md:45-81` — Alert component is a UI infrastructure extraction that supports the inventory workflows without changing product features. The component will display contextual error/warning messages for shopping list conflicts (brief section 6-7), kit BOM errors (brief section 10.7), and part detail failures (brief section 10.2-3). No product brief violations; purely technical debt reduction.

- `docs/contribute/architecture/application_overview.md` — Pass — `plan.md:96-104,162-180` — Plan places new component in `src/components/ui/alert.tsx` and exports via `src/components/ui/index.ts` barrel, matching the documented UI composition pattern. Component accepts `testId` prop for Playwright targeting per architecture guidelines on test-friendly UI building blocks. No TanStack Query or generated API involvement, correctly identified as purely presentational.

- `docs/contribute/testing/playwright_developer_guide.md` — Pass — `plan.md:466-538` — Test plan relies on existing Playwright specs and `data-testid` attributes without requiring new instrumentation events (Alert is presentational, not data-fetching or form-based). Coverage preserves existing testId hierarchies (e.g., `shopping-lists.concept.duplicate-banner` + `.dismiss` child). No route interception, no fixed waits, API-first data setup via factories. Aligns with deterministic wait principles and test-event taxonomy (no ListLoading or Form events needed for static alerts).

**Fit with codebase**

- `src/components/ui/badge.tsx:23-26` — `plan.md:299-300,365-366` — Plan correctly models className merge pattern after Badge component, which uses `cn(baseClasses, variantClasses[variant], className)`. Alert will follow identical pattern for layout control while maintaining internal styling encapsulation.

- `src/components/ui/empty-state.tsx:18,42` — `plan.md:64-67,86-87,365-366` — EmptyState accepts className prop for layout control (margins, width, positioning). Plan cites EmptyState as precedent for Alert className acceptance. Pattern confirmed: `className={cn('text-center', variant === 'default' ? 'rounded-lg border...' : 'rounded-md border...', className)}`.

- `src/components/ui/information-badge.tsx:30` — `plan.md:248,335-346` — InformationBadge **does NOT accept className prop** (JSDoc line 30: "Intentionally does not support custom className prop to enforce style encapsulation"). However, plan's comparison to InformationBadge is for **controlled component pattern and icon handling logic**, not className acceptance. Plan correctly cites Badge, Button, Card, EmptyState as className precedents, not InformationBadge. No contradiction.

- `tests/e2e/shopping-lists/shopping-lists.spec.ts:612-617` — `plan.md:476-478,616` — Plan preserves existing testId pattern: base testId on container (`shopping-lists.concept.duplicate-banner`) + child testId for dismiss button (`.dismiss`). Spec confirms: `duplicateBanner.getByTestId('shopping-lists.concept.duplicate-banner.dismiss').click()`. Pattern will be maintained post-refactoring via auto-append dismiss button testId when `onDismiss` prop provided.

- `src/components/shopping-lists/concept-table.tsx:106,112-133` — `plan.md:129-131,199-205,269-270,364-366,574-577` — Plan correctly identifies sticky banner with `z-[60]` and `pointer-events-auto` for layering above table. Action buttons (View existing line + Dismiss) are parent-provided Button components with explicit testIds. Plan maps this to Alert `action` prop containing styled Button components, with layout classes passed via `className="z-[60] pointer-events-auto"`. Confirmed fit: parent controls button styling and testIds, Alert renders in flex container.

- `src/components/shopping-lists/concept-line-form.tsx:260,268-280` — `plan.md:108-109,199-205,268-271` — Dialog banner has single Dismiss button. Plan maps to Alert with `onDismiss` handler; dismiss button auto-rendered with testId `${testId}.dismiss`. Confirmed fit: simpler than concept-table case, no action prop needed.

---

## 3) Open Questions & Ambiguities

No open questions remain. All previous ambiguities have been resolved:

- **Resolved**: className prop acceptance — Plan now documents this follows project UI component pattern (Badge, Button, Card, EmptyState) with clear guidance that className is for layout control only (margins, width, positioning, z-index), not styling (colors, borders, padding). JSDoc will enforce this convention. Evidence: `plan.md:64-67,86-87,365-366,596-598`.

- **Resolved**: Action button layout rules — Plan provides concrete examples showing parent provides styled Button components within `action` prop, Alert renders in flex container alongside auto-generated dismiss button. Three usage patterns documented with file:line evidence. Evidence: `plan.md:194-205,269-271,591-593`.

- **Resolved**: Shortfall badge scope — Plan excludes with clear structural and semantic justification (inline-flex vs block-level, data visualization vs contextual messaging, table cell context vs standalone alert). Evidence: `plan.md:79-80,368-373`.

- **Resolved**: testId pattern for dismiss button — Plan clarifies Alert auto-appends `.dismiss` suffix when `onDismiss` prop provided, matching existing pattern in `concept-line-form.tsx:276`. Evidence: `plan.md:206-210`.

---

## 4) Deterministic Playwright Coverage (new/changed behavior only)

- **Behavior**: Shopping list concept duplicate banner (dialog variant)
  - **Scenarios**:
    - Given duplicate part added to concept list, When form submits, Then duplicate banner visible with part key (`tests/e2e/shopping-lists/shopping-lists.spec.ts:612-614`)
    - Given duplicate banner visible, When dismiss button clicked, Then banner hidden (`tests/e2e/shopping-lists/shopping-lists.spec.ts:616-617`)
  - **Instrumentation**: `data-testid="shopping-lists.concept.duplicate-banner"` on Alert container, `data-testid="shopping-lists.concept.duplicate-banner.dismiss"` on auto-rendered dismiss button
  - **Backend hooks**: None required (uses existing part creation factories)
  - **Gaps**: None; existing test coverage will verify refactored Alert component
  - **Evidence**: `plan.md:466-478`, `tests/e2e/shopping-lists/shopping-lists.spec.ts:612-617`

- **Behavior**: Shopping list concept duplicate banner (sticky table variant)
  - **Scenarios**:
    - Given duplicate part added to concept table, When banner renders, Then banner visible with z-index layering and action buttons
    - Given banner with "View existing line" button, When clicked, Then scrolls to duplicate row
    - Given banner with dismiss button, When clicked, Then banner hidden
  - **Instrumentation**: `data-testid="shopping-lists.concept.duplicate-banner"` on Alert container with `className="z-[60] pointer-events-auto"`, `data-testid="shopping-lists.concept.duplicate-banner.focus"` on action button (parent-provided), `data-testid="shopping-lists.concept.duplicate-banner.dismiss"` on dismiss button
  - **Backend hooks**: None required
  - **Gaps**: Verify existing spec exercises sticky banner scenario (may be covered by duplicate detection test)
  - **Evidence**: `plan.md:129-131,199-205,269-270,571-577`

- **Behavior**: Part details link badge error alert
  - **Scenarios**:
    - Given shopping list or kit membership query fails, When part details page loads, Then error alert visible with message
    - Given error alert visible with retry button, When retry clicked, Then queries refetch
  - **Instrumentation**: `data-testid="parts.detail.link.badges.error"` on Alert container, retry button testId (parent-provided within `action` prop)
  - **Backend hooks**: API factories to create part, potentially mock failure scenario or verify error state via backend logs
  - **Gaps**: Verify existing part detail specs exercise error state and retry flow
  - **Evidence**: `plan.md:481-493`

- **Behavior**: Pick list availability error banner
  - **Scenarios**:
    - Given availability queries fail for multiple parts, When pick list detail loads, Then error banner visible with part keys and error messages
    - Given error banner visible, When user interacts with pick list, Then banner persists (not dismissible)
  - **Instrumentation**: `data-testid="pick-lists.detail.availability.error"` on Alert container
  - **Backend hooks**: API factories to create pick list with parts, potentially mock availability failure or verify error state via backend logs
  - **Gaps**: Verify pick list error scenario is exercised in e2e specs
  - **Evidence**: `plan.md:495-506`

- **Behavior**: Kit BOM row editor form error
  - **Scenarios**:
    - Given form submission fails, When form mutation rejects, Then error alert visible with message
    - Given error alert visible, When user corrects input and resubmits, Then error alert hidden
  - **Instrumentation**: `data-testid="kits.detail.bom.row-editor.error"` (to be added during refactoring; current implementation lacks explicit testId)
  - **Backend hooks**: API factories to create kit, mutation failure scenario or validation error
  - **Gaps**: Add testId during refactoring and ensure kit BOM editing specs assert on error display
  - **Evidence**: `plan.md:508-520`

- **Behavior**: Shopping list and kit overview error states
  - **Scenarios**:
    - Given overview query fails, When user navigates to overview page, Then error alert visible with retry button
    - Given error alert with retry button, When retry clicked, Then query refetches
  - **Instrumentation**: `data-testid="kits.overview.error"` on Alert container (kits), `data-testid="shopping-lists.overview.error"` on Alert container (shopping lists), retry button testId (parent-provided within `action` prop)
  - **Backend hooks**: API factories to create kits/shopping lists, potentially mock query failure or verify error state via backend logs
  - **Gaps**: Verify overview error states are exercised in e2e specs (may require backend failure injection)
  - **Evidence**: `plan.md:522-538`

All deterministic coverage relies on existing or easily verifiable Playwright specs. No new instrumentation events required (Alert is presentational). TestId hierarchies preserve existing patterns. Backend coordination limited to standard factory usage and error scenario verification.

---

## 5) Adversarial Sweep (must find ≥3 credible issues or declare why none exist)

**Checks attempted**:
1. **Action button testId collision risk**: Verified parent provides full testIds for action buttons (e.g., `${baseTestId}.focus`, `${baseTestId}.retry`). Alert only auto-appends `.dismiss` for dismiss button. No collision risk.
2. **className CSS soup reintroduction**: Plan documents className for layout only, but no runtime enforcement. Code review is only guard. Checked if TypeScript branded types could enforce this — not practical. Mitigation relies on JSDoc and review discipline.
3. **Icon type narrowing edge case**: Alert must handle `icon?: ReactNode | boolean`. Type narrowing via `typeof icon === 'boolean'` is standard but could fail if icon is `0` (falsy number). However, TypeScript signature enforces `ReactNode | boolean`, not `ReactNode | boolean | number`, so `0` would be type error. No runtime issue.
4. **Dismiss button accessibility without onDismiss callback update**: If parent provides `onDismiss` but forgets to update visibility state, Alert remains visible after dismiss click. Plan documents this as developer error with JSDoc guidance. No additional guard possible (controlled component pattern).
5. **Action prop button styling consistency**: Parent provides styled Button components, but no enforcement that buttons match Alert variant (e.g., error Alert could have success-colored button). Plan assumes parent maintains semantic consistency. Code review must catch mismatches.
6. **Role attribute accessibility mapping**: Plan maps `error`/`warning` → `role="alert"`, `info`/`success` → `role="status"`. However, ARIA spec recommends `role="alert"` for important, time-sensitive information and `role="status"` for advisory info. Success messages (e.g., "Item saved") may be time-sensitive. Re-examine mapping.
7. **Shortfall badge exclusion may orphan future consolidation**: Plan excludes shortfall badge from scope due to structural differences. However, if InformationBadge gains warning variant support in future, shortfall badge might fit better there than remaining inline. Plan acknowledges this possibility but doesn't propose next steps.

**Minor — Role attribute mapping may not align with ARIA best practices**

**Evidence:** `plan.md:287-292` — "Derived value: Accessible role attribute / Source: variant prop / Writes / cleanup: Sets `role="alert"` for error/warning, `role="status"` for info/success / Invariant: Alert/status semantics must align with ARIA best practices for assistive technology"

**Why it matters:** ARIA specification recommends `role="alert"` for important, time-sensitive information that requires immediate user attention, and `role="status"` for advisory information that does not require immediate action. The plan's mapping assumes `error`/`warning` are always urgent and `info`/`success` are always advisory. However, success messages (e.g., "Form submitted successfully") may warrant `role="alert"` if they are time-sensitive confirmations. Conversely, informational warnings (e.g., "This feature is experimental") may fit `role="status"`. The variant-based mapping is too rigid and may produce semantically incorrect ARIA roles.

**Fix suggestion:** Change role assignment to always use `role="alert"` for all Alert variants, since the component name and usage context imply user attention is required. ARIA's `role="status"` is better suited for live regions with ongoing state updates (e.g., progress indicators, status bars), not contextual alert banners. Alternatively, expose `role` as an optional prop if semantic flexibility is needed, defaulting to `role="alert"` for all variants. Reference: [WAI-ARIA Authoring Practices - Alert](https://www.w3.org/WAI/ARIA/apg/patterns/alert/).

**Confidence:** Medium — ARIA semantics are nuanced; default `role="alert"` is safer for contextual error/warning/info/success messages, but edge cases may exist where `role="status"` is appropriate. Exposing `role` as optional prop provides flexibility without breaking encapsulation.

---

**Minor — Action prop lacks type contract for Button components**

**Evidence:** `plan.md:176,234` — "action?: ReactNode; // Optional action button(s) - parent provides styled Button components with testIds" / "8. If `action` is provided, render in flex container (parent provides styled Button components)"

**Why it matters:** Plan documents that `action` prop should contain styled Button components, but TypeScript signature is `action?: ReactNode`. This allows parent to pass arbitrary ReactNode (e.g., plain text, anchor links, custom divs), which would break Alert's layout assumptions (flex container expects button elements). Without type enforcement, developer could pass incompatible children and encounter layout bugs or accessibility issues. Code review must catch misuse, but TypeScript could enforce this at compile time.

**Fix suggestion:** Restrict `action` prop type to `React.ReactElement<ButtonProps> | React.ReactElement<ButtonProps>[]` (single Button or array of Buttons). This enforces that only Button components (or components with compatible props) can be passed, catching layout mismatches at compile time. Parent can still wrap Buttons in fragments if needed (`<>{[btn1, btn2]}</>`), but arbitrary ReactNode is prevented. If flexibility is truly required (e.g., custom anchor links styled as buttons), document this explicitly and adjust type to `React.ReactElement<React.ComponentPropsWithoutRef<'button'>>` to enforce button-like semantics.

**Confidence:** Medium — Type restriction improves safety but may be overly rigid if future action use cases emerge (e.g., anchor links, icon buttons). Start with strict type and relax if justified by real usage.

---

**Minor — Plan does not address ARIA labeling for dismiss button without title prop**

**Evidence:** `plan.md:236,354-357` — "9. If `onDismiss` is provided, render dismiss button with `data-testid="${testId}.dismiss"` in same flex container as action buttons" / "Edge case: onDismiss provided but parent does not update visibility state / Handling: Developer error; Alert is controlled component, parent must handle state update / Guardrails: Document in component JSDoc that `onDismiss` callback must update parent state to hide Alert"

**Why it matters:** Dismiss button rendered by Alert likely uses icon (e.g., X symbol) without visible text. Screen readers need `aria-label` for accessibility. Plan mentions `aria-labels` for screen readers in edge case section (line 359) but does not specify how dismiss button aria-label is generated. If Alert has `title` prop, aria-label could be `"Dismiss {title}"`. Without title, generic `"Dismiss alert"` is less informative. InformationBadge example (`information-badge.tsx:91`) extracts children text for aria-label on remove button, but Alert's children may be complex ReactNode with structured content (e.g., error lists, links). Text extraction may fail or produce poor aria-labels.

**Fix suggestion:** Generate dismiss button `aria-label` as follows: if `title` prop exists, use `"Dismiss {title} alert"`; otherwise, attempt to extract plain text from `children` (similar to InformationBadge pattern) with fallback to `"Dismiss alert"`. Document in JSDoc that providing `title` prop improves dismiss button accessibility. Alternatively, expose `dismissAriaLabel?: string` prop for parent control when auto-generated label is insufficient. Reference: InformationBadge implementation at `/work/frontend/src/components/ui/information-badge.tsx:68-92` for text extraction pattern.

**Confidence:** Medium — Auto-generated aria-labels are convenient but may produce suboptimal results for complex children. Exposing optional `dismissAriaLabel` prop provides escape hatch without adding complexity to common case.

---

**Checks attempted (no issues found)**:
- **TestId preservation across refactoring**: Plan explicitly documents testId continuity (base testId on container, `.dismiss` child suffix). Existing Playwright spec confirms pattern at `tests/e2e/shopping-lists/shopping-lists.spec.ts:616`. Evidence: `plan.md:206-210,476-478,616`.
- **className prop CSS soup risk**: Plan documents layout-only usage and cites JSDoc enforcement. Code review discipline is standard guard for this pattern across Badge, Button, Card, EmptyState components. Evidence: `plan.md:596-598`.
- **Action button layout flexibility**: Plan provides three concrete usage examples (concept-table with two buttons side-by-side, concept-line-form with single dismiss, part-details with retry). All map cleanly to flex container approach. Evidence: `plan.md:199-205`.
- **Shortfall badge exclusion justification**: Plan provides structural (inline-flex vs block-level), semantic (data visualization vs contextual messaging), and layout (table cell context) differences. Exclusion is well-reasoned. Evidence: `plan.md:79-80,368-373`.
- **Icon rendering type safety**: TypeScript signature `icon?: ReactNode | boolean` enforces valid types. Type narrowing via `typeof icon === 'boolean'` is standard and safe. Evidence: `plan.md:172,227-231`.
- **Derived state invariants**: Plan documents three derived values (effective icon, accessible role, color class string) with source, guards, and invariants. No filtered views driving persistent writes. Evidence: `plan.md:277-301`.
- **Async coordination**: Alert is stateless presentational component; no TanStack Query, no effects, no async safeguards needed. Plan correctly identifies this. Evidence: `plan.md:305-327`.
- **Empty state conflict**: EmptyState component serves different purpose (feature absence) vs Alert (error/warning contextual messaging). No overlap or conflict. Evidence: `plan.md:77`.

---

## 6) Derived-Value & State Invariants (table)

- **Derived value**: Effective icon to render
  - **Source dataset**: `icon` prop (boolean | ReactNode | undefined) and `variant` prop (unfiltered; direct prop inputs)
  - **Write / cleanup triggered**: Determines which ReactNode to render in icon slot (no cache writes, no persistent state, no navigation)
  - **Guards**: Type narrowing via `typeof icon === 'boolean'` checks; TypeScript enforces `icon?: ReactNode | boolean` signature
  - **Invariant**: If `icon === true`, default icon must match variant (AlertCircle for error, AlertTriangle for warning, Info for info, CheckCircle2 for success); if custom icon provided, render as-is; if falsy, render no icon
  - **Evidence**: `plan.md:277-284`, similar logic in `src/components/ui/information-badge.tsx:86` (conditional icon rendering based on prop)

- **Derived value**: Accessible role attribute
  - **Source dataset**: `variant` prop (unfiltered; single enum value from 'error' | 'warning' | 'info' | 'success')
  - **Write / cleanup triggered**: Sets `role="alert"` or `role="status"` on container div (DOM attribute only; no React state, no cache, no navigation)
  - **Guards**: Variant must be one of four allowed values (enforced by TypeScript enum)
  - **Invariant**: Alert/status semantics must align with ARIA best practices for assistive technology (see Adversarial Sweep finding on role mapping)
  - **Evidence**: `plan.md:285-292`, accessibility patterns documented in `docs/contribute/ui/tooltip_guidelines.md:235-240` (role attributes for UI components)

- **Derived value**: Color class string
  - **Source dataset**: `variant` prop (unfiltered; single enum value) and optional `className` prop (unfiltered; parent-provided layout classes)
  - **Write / cleanup triggered**: Returns composed Tailwind class string for border, background, text colors merged with parent className via `cn()` utility (no persistent writes, no cache mutation, no storage)
  - **Guards**: Must use `cn()` utility from `@/lib/utils` for class merging; className prop merged last to allow layout overrides
  - **Invariant**: Internal color classes must remain consistent (border opacity, background opacity, text color) per variant; className prop should only contain layout classes (margins, width, positioning, z-index), not styling classes (colors, borders, padding) — enforced by JSDoc and code review, not runtime
  - **Evidence**: `plan.md:293-301`, `src/components/ui/badge.tsx:12-17,23-26` (variant-to-class mapping pattern with className merge)

> All derived values use **unfiltered** inputs (direct prop values, no array filtering or query result slicing). None trigger **persistent** writes (no cache updates, no localStorage, no navigation state mutations). No Major severity flags warranted.

---

## 7) Risks & Mitigations (top 3)

- **Risk**: Playwright specs break due to testId structure changes after refactoring
  - **Mitigation**: Preserve exact testId strings during refactoring; maintain `.dismiss` suffix convention for dismiss button child testId; run affected specs locally (`tests/e2e/shopping-lists/shopping-lists.spec.ts`, part detail specs, pick list specs, kit specs) before committing; verify `pnpm playwright test` passes for refactored components
  - **Evidence**: `plan.md:585-589`, existing testId pattern confirmed at `tests/e2e/shopping-lists/shopping-lists.spec.ts:612-617`

- **Risk**: className prop allows CSS soup to creep back into Alert consumers, defeating component encapsulation
  - **Mitigation**: Document in Alert JSDoc that className should **only** be used for layout (margins, width, positioning, z-index), not styling (colors, borders, padding); code review guidelines should enforce this convention; follow established pattern from Badge, Button, Card, EmptyState which all accept className without widespread misuse
  - **Evidence**: `plan.md:596-598`, `src/components/ui/badge.tsx:26`, `src/components/ui/button.tsx:89`, `src/components/ui/card.tsx:29`, `src/components/ui/empty-state.tsx:18,42`

- **Risk**: Action button rendering does not accommodate all existing layouts, requiring fallback to inline CSS or custom wrappers
  - **Mitigation**: Document that parent provides fully styled Button components within `action` prop, rendered in flex container alongside auto-generated dismiss button; verify during refactoring (Slice 2 and 3) that all seven identified usage sites map cleanly to this pattern (concept-table with two buttons side-by-side at `concept-table.tsx:112-133`, concept-line-form with single dismiss at `concept-line-form.tsx:268-280`, part-details with retry button at `part-details.tsx:358`); if layout gaps emerge, consider exposing `actionContainerClassName` prop for flex container customization
  - **Evidence**: `plan.md:590-593`, concrete usage examples at `plan.md:199-205`

---

## 8) Confidence

**Confidence: High** — Plan successfully resolves all previous review concerns with concrete evidence and alignment to project patterns. className prop acceptance follows established UI component conventions with clear JSDoc guidance. Action button layout rules are grounded in actual usage analysis with file:line evidence. Shortfall badge exclusion is well-justified with structural and semantic rationale. TestId pattern is explicit and preserves existing Playwright test contracts. Minor findings in adversarial sweep are refinements, not blockers. Implementation slices are incremental and safe. Test coverage is deterministic and tied to existing specs. No open questions or ambiguities remain.
