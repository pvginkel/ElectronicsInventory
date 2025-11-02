# Icon Badge Component Extraction — Plan Review

## 1) Summary & Decision

**Readiness**

The plan is comprehensive, well-researched, and ready for implementation. All major findings from the first review have been adequately addressed: camera-capture.tsx was added to affected files, testId is now optional (matching real usage patterns), the checkmark overlay refactoring pattern is concrete and preserves test compatibility, border color mapping for primary variant is clarified, and prefers-reduced-motion support is specified. The plan demonstrates thorough pattern discovery (8 variants across 8 files), clear separation between badge presentation and parent component logic, and a pragmatic slice-by-slice testing protocol. The decision to exclude className prop is well-justified and consistent with StatusBadge/InformationBadge patterns. The recommendation to defer IconButton refactoring is sound.

**Decision**

`GO` — All previous blockers resolved; plan is implementation-ready without conditions.

---

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `docs/commands/plan_feature.md` — Pass — `plan.md:0-1073` — Plan follows all required sections (0-16) with proper templates, research log, file map with evidence, data model contracts, and deterministic test scenarios. Slice-by-slice testing protocol explicitly references running Playwright tests after each refactor.

- `docs/contribute/architecture/application_overview.md` — Pass — `plan.md:92-99` — Plan correctly identifies UI component location (`src/components/ui/`), barrel export pattern (`src/components/ui/index.ts`), Tailwind styling conventions, and test instrumentation via `data-testid`. Aligns with documented architecture: "Shared UI building blocks live in `src/components/ui/` and accept `data-testid` props to support testing."

- `docs/contribute/testing/playwright_developer_guide.md` — Pass — `plan.md:750-831, 862-997` — Test plan follows "API-first data setup" (existing data already seeded), "Deterministic waits" (references existing test IDs and `page.getByTestId()`), and "Test IDs" naming conventions (`feature.section.element`). No route mocking required (pure UI refactor). Testing protocol in slices 2-7 explicitly runs affected Playwright specs before/after each refactoring step.

- `CLAUDE.md` (Testing Requirements) — Pass — `plan.md:836-997` — Slicing strategy ships instrumentation and tests together; each slice runs affected Playwright specs as verification protocol. Slice 0 establishes baseline (`pnpm check` + `pnpm playwright test`), and Slice 9 performs final verification with full suite. Matches requirement: "Ship instrumentation changes and matching Playwright coverage in the same slice."

**Fit with codebase**

- `StatusBadge` (`src/components/ui/status-badge.tsx`) — `plan.md:109-117, 368` — Plan correctly mirrors StatusBadge pattern: NO className prop (line 36 comment: "Intentionally does not support custom className prop"), required testId prop, semantic variants, and strict style encapsulation. IconBadge follows this same philosophy for circular badges.

- `InformationBadge` (`src/components/ui/information-badge.tsx`) — `plan.md:98, 368` — Plan references InformationBadge as precedent for className exclusion (line 10 shows no className in props interface, line 32 comment confirms intentional exclusion). IconBadge aligns with this pattern.

- Existing badge usage sites — `plan.md:79-301` — All 8 affected files have been identified with exact line numbers and code evidence. Discovery process was thorough: multiple search strategies (rounded-full patterns, size patterns, manual inspection). Post-refactor verification in Slice 9 includes re-running grep to catch stragglers (`plan.md:990-991`).

---

## 3) Open Questions & Ambiguities

**No blocking questions remain.** All ambiguities from the first review have been resolved:

- **className exclusion** — Resolved at `plan.md:109-117, 1050-1054`. Decision confirmed: NO className prop, following StatusBadge/InformationBadge patterns. TypeScript enforcement prevents misuse.

- **Overlay elements (checkmark)** — Resolved at `plan.md:164, 472-511, 1057-1060`. Pattern documented: overlay stays OUTSIDE IconBadge, rendered by parent as sibling within wrapper div. Concrete before/after example provided at lines 476-506.

- **Border styling** — Resolved at `plan.md:358, 398-405, 1063-1066`. Border is boolean prop (not variant distinction); defaults to false. Border color automatically matches variant. Used for activity timeline badges.

- **testId requirement** — Resolved at `plan.md:353, 538-541`. Changed from required to optional (matching real-world usage where parent containers provide sufficient test targeting). Documentation clarifies when to provide testId vs. rely on parent selector.

- **Border color for primary variant** — Resolved at `plan.md:403`. Explicitly documented: `border-primary` (full opacity). Milestone "next" state background (`bg-primary/20`) handled by parent component logic, not badge.

- **Accessibility (animations)** — Resolved at `plan.md:463, 746`. Animated prop includes `motion-reduce:animate-none` to respect `prefers-reduced-motion` for accessibility.

- **IconButton refactoring** — Resolved at `plan.md:815-822, 976-981, 1044-1048`. Decision documented: DEFER refactoring; keep IconButton separate. Rationale: different purpose (action buttons vs status indicators), merging adds unnecessary complexity.

- **camera-capture.tsx** — Resolved at `plan.md:88, 288-299, 955-966`. Added to affected files (Slice 7.5) with concrete line references and testing protocol.

---

## 4) Deterministic Playwright Coverage (new/changed behavior only)

**Behavior: Location Item Badges**
- **Scenarios:**
  - Given box has empty location, When viewing box detail, Then location badge displays with neutral variant (bg-muted text-muted-foreground) (`tests/e2e/boxes/boxes-detail.spec.ts`)
  - Given box has occupied location, When viewing box detail, Then location badge displays with success variant (bg-emerald-100 text-emerald-700)
- **Instrumentation:** `page.getByTestId('boxes.detail.locations.item.{boxNo}-{locNo}')` (existing parent container ID); no specific badge test ID (parent container is semantic unit)
- **Backend hooks:** Existing location data via factories (already seeded)
- **Gaps:** None — parent container test ID sufficient for location item assertions
- **Evidence:** `plan.md:753-760`, existing tests in `tests/e2e/boxes/boxes-detail.spec.ts`

**Behavior: Activity Timeline Icon Badges**
- **Scenarios:**
  - Given activity is addition, When viewing dashboard, Then activity icon badge displays with success variant and emoji ➕
  - Given activity is removal, When viewing dashboard, Then activity icon badge displays with error variant and emoji ➖
  - Given activity is move, When viewing dashboard, Then activity icon badge displays with info variant and emoji 🔄
- **Instrumentation:** `page.getByTestId('dashboard.activity.item.icon')`
- **Backend hooks:** Existing activity data via factories
- **Gaps:** None
- **Evidence:** `plan.md:762-771`, existing tests in `tests/e2e/dashboard/recent-activity.spec.ts` (line 327)

**Behavior: Documentation Milestone Badges**
- **Scenarios:**
  - Given milestone not achieved, When viewing dashboard, Then milestone badge displays with neutral variant
  - Given milestone achieved, When viewing dashboard, Then milestone badge displays with success variant and checkmark overlay (overlay handled by parent)
  - Given milestone is next target, When viewing dashboard, Then milestone badge displays with primary variant and pulse animation
- **Instrumentation:** `page.getByTestId('dashboard.documentation.milestone')` (on wrapper div, not IconBadge itself per refactoring pattern at lines 497-506)
- **Backend hooks:** Existing documentation stats via factories
- **Gaps:** Checkmark overlay is NOT part of IconBadge (documented separation, parent component responsibility)
- **Evidence:** `plan.md:773-782`, existing tests in `tests/e2e/dashboard/documentation-status.spec.ts` (line 332)

**Behavior: About Page Step Badges**
- **Scenarios:**
  - Given user views about page, When page loads, Then step number badges display with primary variant
- **Instrumentation:** `page.getByTestId('about.quickstart.step')` (existing parent container ID); no specific badge test ID needed
- **Backend hooks:** None (static page content)
- **Gaps:** No specific badge tests; smoke test coverage sufficient (static content)
- **Evidence:** `plan.md:784-791`

**Behavior: AI Progress Badges**
- **Scenarios:**
  - Given AI analysis errors, When viewing error state, Then error badge displays with destructive variant and X icon (xl size)
  - Given AI analysis in progress, When viewing progress state, Then loading badge displays with primary variant and Loader2 icon with spin animation (xl size)
- **Instrumentation:** `page.getByTestId('parts.ai.progress-error')`, `page.getByTestId('parts.ai.progress-card')`
- **Backend hooks:** Existing AI progress factories
- **Gaps:** None
- **Evidence:** `plan.md:793-801`, existing tests in `tests/e2e/parts/part-ai-creation.spec.ts`

**Behavior: Media Viewer Error Badge**
- **Scenarios:**
  - Given image load fails, When viewing media viewer, Then error badge displays with destructive variant and error icon (xl size)
- **Instrumentation:** Visual inspection (no specific test coverage for media viewer error states)
- **Backend hooks:** N/A (client-side error state)
- **Gaps:** Media viewer error state testing is out of scope for this refactor (intentional gap, documented)
- **Evidence:** `plan.md:803-810`

**Behavior: Camera Capture Error Badge**
- **Scenarios:**
  - Given camera access fails, When viewing camera capture error, Then error badge displays with destructive variant and X icon (xl size)
- **Instrumentation:** Visual inspection (no specific test coverage for camera error states)
- **Backend hooks:** N/A (client-side error state)
- **Gaps:** Camera error state testing is out of scope for this refactor (intentional gap, documented)
- **Evidence:** `plan.md:955-966`

**Overall Coverage Assessment:** PASS — All user-visible badge behaviors have test coverage via existing Playwright specs. Test IDs are preserved exactly to maintain compatibility. Visual-only scenarios (media/camera errors) are explicitly documented as out-of-scope gaps with justification. IconButton deferral is documented with clear recommendation.

---

## 5) Adversarial Sweep

I performed targeted checks on instrumentation gaps, state consistency, React patterns, API usage, and test coupling. The plan holds up well; no credible blockers remain after addressing first-review findings.

**Checks attempted:**
1. **Instrumentation drift** — Verified test IDs preserved exactly in refactoring pattern (lines 497-508 show wrapper div receives test ID when badge itself doesn't need one; lines 520, 522 preserve existing test IDs in IconBadge testId prop where badge is independently tested).
2. **Test coupling brittleness** — Checked that slicing strategy runs affected tests after each component refactor (Slices 2-7 explicitly document running specific test files before/after; Slice 9 runs full suite).
3. **Type safety holes** — TypeScript union types for size/variant prevent invalid values; optional testId matches actual usage patterns (not all badges need independent test IDs).
4. **Accessibility regressions** — Plan addresses `prefers-reduced-motion` for animations (line 463), semantic HTML (button vs div based on onClick, line 466), and keyboard accessibility (button element when onClick provided, line 1042).
5. **Visual regression severity** — Plan explicitly accepts minor visual differences as casualties (line 643), aligns with UI Component Refactoring Workflow principles documented in CLAUDE.md.
6. **IconButton coupling** — Deferred with clear rationale (different purpose, would add complexity); not a risk but a documented decision (lines 815-822, 976-981).
7. **Animation conflicts** — Plan addresses: badge animation (animate-pulse) is separate from icon animation (Loader2 spin applied to icon element, not badge container) (lines 1032-1036).
8. **Border color ambiguity** — Resolved in updated plan: primary variant border explicitly documented as `border-primary` (line 403).
9. **Missing file discovery** — Comprehensive grep strategies documented (lines 6-11); Slice 9 includes re-verification with additional search variations (lines 990-991).
10. **testId requirement mismatch** — Resolved: testId changed to optional (line 353), aligning with real usage where parent containers provide targeting (lines 538-541).

**Evidence:** Lines 463 (motion-reduce), 466 (semantic HTML), 497-508 (test ID preservation pattern), 643 (visual casualties), 862-997 (slice-by-slice testing), 990-991 (final verification grep), 1032-1036 (animation separation).

**Why the plan holds:** All previous Major findings have been addressed with concrete solutions. The refactoring is pure UI standardization with no business logic changes, TypeScript enforces correctness, existing Playwright tests provide regression safety, and the slicing strategy validates each step before proceeding. IconButton deferral removes a source of complexity. The checkmark overlay pattern is cleanly separated and preserves test compatibility.

---

## 6) Derived-Value & State Invariants (table)

**Derived value:** Badge variant selection
- **Source dataset:** Parent component's conditional logic (location occupancy status, activity type, milestone achievement state, loading/error states)
- **Write / cleanup triggered:** None (stateless rendering; variant drives CSS classes only)
- **Guards:** TypeScript union type restricts to valid variants; parent components own conditional logic
- **Invariant:** Parent component must map domain state to semantic variant before passing to IconBadge; badge never derives variant from domain data directly
- **Evidence:** `plan.md:367-410` (variant mappings), `plan.md:519` (parent component responsibility), `plan.md:576-579` (parent manages conditional logic)

**Derived value:** Test ID attribute presence
- **Source dataset:** Optional `testId` prop passed by parent
- **Write / cleanup triggered:** None (attribute rendered conditionally if testId provided)
- **Guards:** TypeScript allows optional testId; only applied to DOM when present
- **Invariant:** When testId is provided, it must match existing patterns exactly to preserve Playwright test compatibility. When omitted, parent container must provide sufficient test targeting.
- **Evidence:** `plan.md:353` (optional testId prop), `plan.md:538-541` (invariant statement), `plan.md:497-508` (wrapper pattern when badge omits testId)

**Derived value:** CSS class composition
- **Source dataset:** Size prop (defaults to 'sm'), variant prop, border prop (defaults false), animated prop (defaults false), onClick presence
- **Write / cleanup triggered:** None (classes computed during render, no side effects)
- **Guards:** TypeScript union types restrict size/variant; booleans for border/animated; cn() utility merges classes
- **Invariant:** NO custom className accepted; all styling derived exclusively from semantic props; layout adjustments handled by parent containers
- **Evidence:** `plan.md:364` (NO className prop comment), `plan.md:444-467` (render flow), `plan.md:610-615` (TypeScript enforcement)

**Proof for stateless component:** IconBadge is pure presentation with no internal state, effects, or subscriptions (`plan.md:676-684`). All values are derived from props synchronously during render. No cache writes, no navigation triggers, no persistent storage. Parents manage domain logic and state (`plan.md:573-579`).

---

## 7) Risks & Mitigations (top 3)

**Risk: Test ID preservation failures during refactoring**
- **Mitigation:** Slice-by-slice testing protocol explicitly runs affected Playwright specs after each component refactor (Slices 2-7 document specific test files to run before/after each change). Milestone badge pattern (lines 497-508) shows concrete before/after with test ID preserved on wrapper. Slice 9 final verification runs full suite.
- **Evidence:** `plan.md:862-997` (slicing strategy with explicit test commands), `plan.md:497-508` (concrete test ID preservation pattern), `plan.md:1003-1006` (risk acknowledged with mitigation)

**Risk: Visual regressions from color/size standardization**
- **Mitigation:** Plan explicitly documents acceptance of minor visual differences as casualties (line 643), aligning with UI Component Refactoring Workflow principles. Variant colors chosen to match existing patterns closely (lines 377-410). Slice testing includes visual inspection step (e.g., Slice 5 line 923, Slice 7 line 952). Icon size guidelines documented (lines 627-635).
- **Evidence:** `plan.md:643` (acceptable casualties), `plan.md:377-410` (variant mappings preserve existing colors), `plan.md:1009-1012` (risk acknowledged), `plan.md:922-924, 951-953` (visual inspection in slices)

**Risk: Incomplete discovery of circular badge patterns**
- **Mitigation:** Comprehensive discovery documented with multiple search strategies (lines 6-11: regex patterns, size patterns, manual inspection). 8 files identified with concrete line references. Slice 9 includes re-verification grep with additional search variations (lines 990-991: search for `rounded-full` alone to catch potential false negatives). If stragglers found, they can be addressed in follow-up without blocking initial refactoring.
- **Evidence:** `plan.md:6-11` (discovery strategies), `plan.md:79-89` (8 files with evidence), `plan.md:990-991` (final verification search), `plan.md:1015-1018` (risk acknowledged)

---

## 8) Confidence

**Confidence: High** — All Major findings from first review have been resolved with concrete solutions. Pattern discovery is thorough (8 variants, 8 files, multiple search strategies). TypeScript provides compile-time safety. Existing Playwright tests provide regression coverage with slice-by-slice verification. Checkmark overlay separation is cleanly documented. IconButton deferral removes complexity. No business logic impact, pure UI refactoring. Visual standardization is explicitly acceptable per workflow principles.
