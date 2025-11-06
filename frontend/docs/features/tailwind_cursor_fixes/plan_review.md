# Plan Review: Fix Cursor Issues from TailwindCSS Upgrade

## 1) Summary & Decision

**Readiness**

This plan addresses two straightforward CSS cursor styling regressions introduced during the TailwindCSS v4 upgrade. The research is thorough and well-documented, with clear evidence from the codebase showing the root cause (Card component's conditional onClick logic) and the implementation gap (KitCard not passing onClick prop). The proposed fixes follow established patterns from other card implementations. The plan correctly identifies that no instrumentation changes are needed and that existing Playwright tests will continue to provide behavioral coverage. Manual QA is appropriately designated for visual cursor validation since Playwright cannot assert CSS cursor properties.

**Decision**

`GO` — The plan is implementation-ready with strong evidence, minimal scope, and proven patterns. The fixes are low-risk CSS adjustments that align with existing component conventions.

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `docs/commands/plan_feature.md` — Pass — `plan.md:1-262` — The plan follows the template structure completely, with all 16 sections populated. Section 0 (Research Log) demonstrates thorough codebase investigation with file:line evidence for Card variant logic, kit-card implementation, and comparison with other card components.

- `docs/product_brief.md` — Pass — `plan.md:48-58` — The plan correctly identifies this as a visual polish fix that doesn't impact any documented product workflows. Kits are a core product entity (brief:149-155), and the cursor regression affects discoverability but not functionality.

- `AGENTS.md` — Pass — `plan.md:63,70-72,148,209-220` — The plan explicitly acknowledges no instrumentation changes are required (lines 170-187), correctly identifies existing test IDs that will continue working, and includes manual QA checklist in section 13 since Playwright cannot validate CSS cursor properties.

- `docs/contribute/architecture/application_overview.md` — Pass — `plan.md:80-92` — Affected areas correctly reference domain components (`components/kits`, `components/ui`) and acknowledge the UI composition pattern where shared building blocks in `components/ui` accept props like onClick.

- `docs/contribute/testing/playwright_developer_guide.md` — Pass — `plan.md:209-228` — Section 13 correctly identifies that existing Playwright tests (kits-overview.spec.ts, part-list.spec.ts) provide behavioral coverage and that cursor validation requires manual QA. The plan does not propose any new instrumentation or test additions, which is appropriate for a CSS-only fix.

**Fit with codebase**

- `src/components/ui/card.tsx:19-21` — `plan.md:12-18` — Plan correctly identifies the Card component's conditional logic where grid-tile variant applies hover/cursor classes only when onClick prop is truthy. Evidence quote is accurate.

- `src/components/kits/kit-card.tsx:63-74` — `plan.md:21-28` — Plan correctly identifies that KitCard wraps a clickable div inside Card but doesn't pass onClick to Card itself, causing Card to render without hover effects. This is the root cause of the regression.

- `src/components/parts/part-card.tsx:51-56` — `plan.md:40,50` — Plan correctly observes that PartListItem passes onClick to Card (line 53: `onClick={onClick}`), which is the pattern KitCard should follow. However, the review of part-card.tsx reveals it uses a ternary for variant selection (`variant={onClick ? 'grid-tile' : 'grid-tile-disabled'}`) rather than always passing grid-tile with onClick. This is a more robust pattern than the plan proposes.

- `src/components/boxes/box-card.tsx:27-36` — `plan.md:42` — Plan cites BoxCard as passing onClick to Card. Evidence confirmed: line 35 shows `onClick={handleSelect}` prop on Card component.

- `src/components/ui/debounced-search-input.tsx:107-115` — `plan.md:31-32, 84-85` — Plan correctly identifies clear button at line 107-115 lacks explicit `cursor-pointer` class. The button element is native HTML which should inherit pointer cursor from Tailwind's base styles, but explicit class ensures cross-browser consistency. The button already has hover background transition (line 110: `hover:bg-muted`), so adding cursor-pointer completes the interactive affordance.

## 3) Open Questions & Ambiguities

No blocking questions remain. The plan's research section answered all implementation details:

- **Question:** Should KitCard match the variant ternary pattern used by PartListItem?
- **Why it matters:** PartListItem uses `variant={onClick ? 'grid-tile' : 'grid-tile-disabled'}` (part-card.tsx:52), which is more defensive than always passing `variant="grid-tile"` and relying on onClick presence. This pattern prevents hover styles even if Card's conditional logic changes.
- **Answer:** The plan should recommend the variant ternary pattern for consistency with PartListItem. KitCard always receives onOpenDetail prop (kit-card.tsx:28), so the ternary would be `variant={onOpenDetail ? 'grid-tile' : 'grid-tile-disabled'}` and onClick would be `onClick={() => onOpenDetail?.(kit.id)}`.

- **Question:** Does the clear button need explicit cursor-pointer?
- **Why it matters:** Native HTML button elements inherit pointer cursor from Tailwind base styles; explicit class might be redundant.
- **Answer (from research):** While native buttons should show pointer cursor by default, Tailwind's preflight reset and custom component styles can override browser defaults. Explicit `cursor-pointer` class ensures consistency and is already used in similar interactive elements throughout the codebase. This is a low-risk enhancement.

## 4) Deterministic Playwright Coverage (new/changed behavior only)

- **Behavior:** DebouncedSearchInput clear button interaction
- **Scenarios:**
  - Given parts list is open and search input contains text, When user clicks clear button, Then search is cleared and URL updates without search param (`tests/e2e/parts/part-list.spec.ts:80-83`)
  - Given kits list is open, When user types search term, Then clear button appears (`tests/e2e/kits/kits-overview.spec.ts` — likely covered in existing search scenarios)
- **Instrumentation:** `parts.list.search.clear`, `kits.overview.search.clear` test IDs (already exist at debounced-search-input.tsx:112)
- **Backend hooks:** None required; search is frontend-only filtering against already-loaded data
- **Gaps:** Cursor pointer visual validation cannot be automated via Playwright (CSS cursor property is not exposed to browser automation APIs). Manual QA checklist in plan.md:222-228 is appropriate.
- **Evidence:** `plan.md:170-179, 209-220` — plan correctly identifies existing instrumentation and Playwright test coverage via clearSearch() helper

- **Behavior:** KitCard hover and click navigation
- **Scenarios:**
  - Given kits overview is open, When user clicks a kit card, Then kit detail view opens (`tests/e2e/kits/kits-overview.spec.ts:8-150` — exercises card interactions via indicator tooltips)
  - Given kits overview is open, When user uses keyboard navigation (Enter/Space on focused card), Then kit detail opens (kit-card.tsx:53-60 implements handleKeyDown)
- **Instrumentation:** `kits.overview.card.{id}` and `kits.overview.card.{id}.link` test IDs (already exist at kit-card.tsx:66,69)
- **Backend hooks:** None required; navigation is frontend route transition
- **Gaps:** Hover animation (scale, shadow, border color) and pointer cursor are CSS properties not testable via Playwright. Manual QA required and documented in plan.md:223-224.
- **Evidence:** `plan.md:214-220` — plan correctly identifies existing test coverage and manual QA requirements

**Verdict:** No new Playwright specs required. Existing tests provide behavioral coverage for click/keyboard interactions. Visual cursor validation appropriately delegated to manual QA checklist.

## 5) Adversarial Sweep (must find ≥3 credible issues or declare why none exist)

**Major — KitCard should use variant ternary pattern for consistency**
**Evidence:** `plan.md:63-74, src/components/parts/part-card.tsx:51-56, src/components/kits/kit-card.tsx:63-74`
Current plan (lines 236-237) proposes "Pass `onClick` prop to the Card component in `kit-card.tsx`" without specifying the implementation. Comparing with PartListItem reveals a more robust pattern: `variant={onClick ? 'grid-tile' : 'grid-tile-disabled'}` (part-card.tsx:52). This ternary ensures disabled state if onClick is undefined, preventing hover effects even if Card's internal conditional changes. KitCard should match this pattern for consistency.
**Why it matters:** Using the variant ternary protects against future Card implementation changes and makes the disabled state explicit at the call site. If Card's onClick conditional is ever refactored, the variant ternary ensures KitCard continues to disable hover effects when onOpenDetail is undefined.
**Fix suggestion:** Update plan section 2 and 14 to specify: "Pass onClick handler to Card component using variant ternary: `variant={onOpenDetail ? 'grid-tile' : 'grid-tile-disabled'}` and `onClick={() => onOpenDetail?.(kit.id)}`. This matches the pattern used in PartListItem (part-card.tsx:52) and makes the disabled state explicit."
**Confidence:** High

**Minor — Event propagation risk understated**
**Evidence:** `plan.md:164-168, 247-250, src/components/kits/kit-card.tsx:42-74, src/components/ui/card.tsx:25-38`
Plan section 8 mentions "onClick propagation breaks navigation" as an edge case, but the analysis is shallow. Current implementation has inner div with onClick (kit-card.tsx:72) and Card will gain onClick. Card's handleClick (card.tsx:25-27) calls `onClick?.(e)` without stopPropagation, so both handlers will fire. The inner div's handleNavigate checks `event.defaultPrevented` and `event.button !== 0` (kit-card.tsx:43-44), but Card's onClick will fire first because React's synthetic event system processes handlers from outermost to innermost. Since both handlers call onOpenDetail, the callback fires twice per click.
**Why it matters:** Double-invocation of onOpenDetail could cause unexpected behavior if the callback has side effects (analytics, API calls, etc.). Current parent implementations likely tolerate this, but it's a latent bug.
**Fix suggestion:** Add to section 8: "Edge case: Double-invocation of onOpenDetail if both Card onClick and inner div onClick fire. Mitigation: Remove inner div's onClick/onKeyDown handlers and rely solely on Card's onClick (which already handles keyboard via Card's handleKeyDown at card.tsx:29-38). Remove role='link' and tabIndex from inner div since Card will handle focus."
**Confidence:** Medium — Current code might work accidentally, but removing redundant handlers is cleaner.

**Minor — Manual QA checklist missing clear success criteria**
**Evidence:** `plan.md:222-228`
Manual QA checklist (lines 222-228) lists actions but doesn't define success criteria for cursor validation. "Verify pointer cursor" is subjective—what does success look like? Developer might miss subtle CSS issues (cursor flickers, wrong cursor on specific browsers, etc.).
**Why it matters:** Without clear success criteria, manual QA is unreliable. Reviewer might approve incomplete fix if they don't know what "correct" looks like.
**Fix suggestion:** Expand checklist step 3-4: "3. Open `/kits`, hover over any kit card → verify pointer cursor displays immediately (no delay), scale animation triggers (card grows to ~102% of original size), and shadow intensifies (from shadow-sm to shadow-md). Compare visually with part card hover at `/parts` to ensure identical behavior. 4. Compare kit card hover to part card hover → verify both show identical cursor, scale (1.02), shadow (md), and border color (primary/50) transitions. No flicker or delay in any transition."
**Confidence:** Medium

## 6) Derived-Value & State Invariants (table)

- **Derived value:** Clear button visibility (`searchInput && <button>`)
  - **Source dataset:** Local searchInput state in DebouncedSearchInput (debounced-search-input.tsx:34)
  - **Write / cleanup triggered:** Button conditionally renders when searchInput is truthy (line 106); no cleanup needed on unmount (React handles DOM removal)
  - **Guards:** Conditional rendering `{searchInput && ...}` (line 106)
  - **Invariant:** Button only visible when search term exists; cursor must be pointer when visible
  - **Evidence:** `plan.md:127-131, src/components/ui/debounced-search-input.tsx:106-116`

- **Derived value:** Card hover styles (`onClick ? hover-styles : no-hover`)
  - **Source dataset:** Card component's onClick prop (unfiltered; directly passed from parent)
  - **Write / cleanup triggered:** CSS classes applied conditionally via className string; no persistent state writes
  - **Guards:** Ternary in variantClasses object (card.tsx:19-21)
  - **Invariant:** grid-tile variant must show hover effects (shadow-md, scale-[1.02], border-primary/50, cursor-pointer) if and only if onClick is truthy
  - **Evidence:** `plan.md:133-138, src/components/ui/card.tsx:19-21`

- **Derived value:** KitCard clickability (onOpenDetail presence)
  - **Source dataset:** onOpenDetail prop passed from parent (kits overview route)
  - **Write / cleanup triggered:** Navigation transition when card clicked; no cache writes
  - **Guards:** Optional chaining `onOpenDetail?.(kit.id)` (kit-card.tsx:50, 59)
  - **Invariant:** Card must show interactive styles (hover/cursor) if and only if onOpenDetail callback is provided
  - **Evidence:** `plan.md:114-123, src/components/kits/kit-card.tsx:28, 42-61`

**Assessment:** No filtered views drive persistent writes. All derived values are presentational CSS classes or conditional renders. No cache mutations or cross-route state. Invariants hold as stated.

## 7) Risks & Mitigations (top 3)

- **Risk:** Double-invocation of onOpenDetail if both Card onClick and inner div onClick fire
- **Mitigation:** Remove inner div's onClick/onKeyDown handlers and rely solely on Card's onClick. Card already handles keyboard navigation via handleKeyDown (card.tsx:29-38). Update plan section 8 and 14 to specify removing inner div handlers.
- **Evidence:** `plan.md:164-168, 247-250, src/components/kits/kit-card.tsx:68-74, src/components/ui/card.tsx:25-38`

- **Risk:** KitCard uses different pattern than PartListItem, reducing codebase consistency
- **Mitigation:** Update plan to specify variant ternary pattern (`variant={onOpenDetail ? 'grid-tile' : 'grid-tile-disabled'}`) matching PartListItem implementation (part-card.tsx:52). This makes disabled state explicit and protects against future Card refactors.
- **Evidence:** `plan.md:236-237, src/components/parts/part-card.tsx:51-56, src/components/kits/kit-card.tsx:63-67`

- **Risk:** Manual QA checklist lacks clear success criteria, increasing risk of incomplete validation
- **Mitigation:** Expand checklist to specify observable behaviors (cursor appears immediately, scale reaches 1.02, shadow intensifies to md, border color shifts to primary/50). Include cross-component comparison (kit card vs part card hover should be identical).
- **Evidence:** `plan.md:222-228`

## 8) Confidence

Confidence: High — This is a well-researched, minimal-scope CSS fix with clear precedent from other card implementations. The plan correctly identifies root causes, proposes low-risk changes, and appropriately scopes test coverage (existing Playwright + manual QA). The issues raised in this review are minor refinements (pattern consistency, event handler cleanup, QA criteria) that strengthen an already solid plan. Implementation risk is low; the fixes are localized to two files with no data model, API, or instrumentation changes.
