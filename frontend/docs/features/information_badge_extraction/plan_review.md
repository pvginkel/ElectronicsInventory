# Information Badge Component Extraction — Plan Review

## 1) Summary & Decision

**Readiness**

The updated plan successfully addresses all five concerns raised in the first review. The badge component conflict has been resolved by implementing InformationBadge as a standalone span element with explicit justification for the pattern divergence (lines 49-50, 179). The testId propagation gap has been closed by making testId a required prop (line 175) with specific implementation guidance for TagsInput (lines 233, 336, 403-404). VendorInfo link semantics have been properly scoped out with clear rationale (lines 52, 93, 130-133, 194-196). Remove button accessibility has been addressed with an aria-label requirement (lines 86, 170, 220, 404). Visual regression documentation for the metadata badge border-radius change has been added with explicit verification steps (lines 87, 318-322, 376-379, 415, 471).

The plan is comprehensive, well-researched (0. Research Log shows thorough investigation), and follows the UI component workflow principles of aggressive cleanup with breaking changes. The standalone span implementation is properly justified, testId is required throughout, and visual regressions are explicitly documented with verification steps. The scope exclusions (VendorInfo, dashboard badges) are well-reasoned. Implementation slices are sequential and dependency-aware.

**Decision**

`GO` — All previous review concerns have been adequately addressed. The plan is implementation-ready with clear scope, proper instrumentation requirements, justified design decisions, and explicit verification steps for visual changes.

---

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `docs/commands/plan_feature.md` — Pass — `plan.md:1-524` — Plan follows all required sections (0-16), uses structured templates, quotes evidence with file:line references, and maintains precision throughout. Research log (lines 3-54) provides thorough discovery evidence. Data model section (lines 157-197) properly documents component contracts. Test plan (lines 387-427) specifies scenarios with instrumentation hooks.

- `docs/ui_component_workflow.md` — Pass — `plan.md:67-68, 101` — Plan explicitly commits to aggressive cleanup ("NO className prop - all styling must be encapsulated", "REMOVE className props completely - Not deprecated, not no-op - completely removed"). Breaking changes are accepted (line 74). Minor visual differences are acceptable casualties (lines 71-72, 318-322).

- `docs/contribute/architecture/application_overview.md` — Pass — `plan.md:99-100, 112-113` — Plan assumes React 19 + TypeScript strict mode, Tailwind CSS styling, and follows the src/components/ui/ pattern for reusable components. Component will be exported via src/components/ui/index.ts (lines 143-146).

- `docs/contribute/testing/playwright_developer_guide.md` — Pass — `plan.md:329-338, 387-427` — Plan requires testId for Playwright selectors (line 175 makes it required, not optional). Verification relies on existing tests interacting with parent components (lines 389-391) following the principle that UI features are tested through their usage context. No route mocking or SSE stubbing planned. TagsInput testId propagation enables individual tag assertions (lines 233, 336, 403-404).

**Fit with codebase**

- `src/components/ui/status-badge.tsx` and `src/components/ui/key-value-badge.tsx` — `plan.md:180, 224` — Plan correctly identifies that both existing badge components make testId required (not optional), aligning InformationBadge with the established pattern. However, the plan diverges by using a standalone span implementation instead of wrapping the base Badge component. This divergence is justified (lines 49-50, 179, 217-218) because the base Badge hardcodes `rounded-full` (verified in badge.tsx:24), but InformationBadge requires `rounded-md` for tags. The justification is sound and explicitly documented.

- `src/components/parts/tags-input.tsx` — `plan.md:119-121, 228-239` — Evidence correctly references inline badge styling at lines 42-56. Refactor plan includes testId propagation for individual tags (lines 233, 336) to enable Playwright assertions on specific tag presence and removal. The pattern `parts.form.tag.${index}` or `parts.form.tag.${tag}` (sanitized) aligns with project testId conventions (feature.section.element).

- `src/components/parts/metadata-badge.tsx` — `plan.md:122-125, 240-254` — Plan correctly identifies deletion of this component (lines 80, 122-125, 252) with replacement by InformationBadge. Evidence at line 125 correctly cites className prop at line 6 of the file (verified). Only 2 files use MetadataBadge (part-list.tsx and metadata-badge.tsx itself), reducing refactor risk.

- `src/components/parts/location-summary.tsx` — `plan.md:126-129, 455-462` — Evidence correctly references inline span styling at line 18 and className prop at line 11 (verified). Plan specifies 'subtle' variant (line 459) matching current muted-foreground styling. Removal of className prop aligns with UI component workflow requirements.

- `src/components/parts/vendor-info.tsx` — `plan.md:130-133, 194-196` — Exclusion from refactor scope is well-justified. VendorInfo has unique link interaction semantics (href, onClick stopPropagation, external navigation, tooltips) verified at lines 16-27 of the file. While it shares layout patterns, the interaction model is distinct from a passive badge component. This is a sound architectural decision.

---

## 3) Open Questions & Ambiguities

The plan lists four open questions (lines 501-518). Let me assess each:

- Question: Should LocationSummary use 'default' or 'subtle' variant?
  - **Status**: Answered in plan — "Resolve during implementation by testing both; use 'subtle' for non-background appearance (matches current muted-foreground styling)" (lines 504-505). The current implementation uses `text-muted-foreground` without background (location-summary.tsx:18), so 'subtle' is the correct choice. This is appropriately deferred to implementation verification rather than being a blocking ambiguity.

- Question: Should InformationBadge support additional variants beyond 'default' and 'subtle'?
  - **Status**: Answered in plan — "Start with two variants; add more only if clear need emerges" (line 509). This follows YAGNI principles and is not a blocking concern.

- Question: Are there other components using similar badge patterns not discovered in initial search?
  - **Status**: Mitigation provided — "Comprehensive grep during implementation; visual inspection of common views" (line 513). The research log (lines 3-54) shows thorough discovery work. Dashboard badges (storage-utilization-grid.tsx, low-stock-alerts.tsx) are explicitly scoped out with justification (lines 30-34, 54, 91-92). This is appropriately handled.

- Question: What testId format should be used for tags in TagsInput?
  - **Status**: Answered in plan — "Use either `parts.form.tag.${index}` (stable for index-based assertions) or `parts.form.tag.${tag}` (sanitized, stable for content-based assertions); decide during implementation based on test requirements" (lines 516-518). Both options are documented in the refactor flow (line 233). This is appropriately deferred to implementation.

**Conclusion**: All questions have either been answered in the plan or appropriately deferred with clear resolution strategies. No blocking ambiguities remain.

---

## 4) Deterministic Playwright Coverage (new/changed behavior only)

- Behavior: Part creation/edit forms with tags (TagsInput component)
- Scenarios:
  - Given part form is open, When tags are added, Then tags display as InformationBadge components with testIds (`plan.md:397-398`)
  - Given part form with tags, When remove button is clicked (via testId or role selector), Then tag is removed (`plan.md:399-400`)
  - Given part form is submitted, When navigating to detail view, Then tags display correctly (`plan.md:401-402`)
  - Given individual tag, When Playwright targets by testId (e.g., `parts.form.tag.0`), Then specific tag is addressable for assertions (`plan.md:403-404`)
- Instrumentation:
  - Existing testIds on form elements and detail view elements (`plan.md:405`)
  - **New**: Individual tag testIds propagated from TagsInput to InformationBadge instances (`parts.form.tag.${index}`) (`plan.md:336, 406-407`)
  - **New**: Remove button aria-label enables role-based Playwright selectors (`plan.md:86, 170, 220, 408`)
- Backend hooks: None required (UI-only refactoring)
- Gaps: None after testId propagation is implemented (`plan.md:409`)
- Evidence: `plan.md:395-409`, references `tests/e2e/parts/part-crud.spec.ts:1-77`

---

- Behavior: Part detail view with metadata badges (visual change from rounded-full to rounded-md)
- Scenarios:
  - Given part has metadata, When viewing part details, Then metadata badges display as InformationBadge with rounded-md border (visual change from rounded-full) (`plan.md:410-412`)
  - Given part has vendor info, When viewing part details, Then vendor info displays with icon (VendorInfo component unchanged, not refactored) (`plan.md:413-414`)
  - Given part has location data, When viewing part details, Then location summary displays with InformationBadge (`plan.md:415-416`)
- Instrumentation: Existing testIds on detail view elements (`plan.md:417`)
- Backend hooks: None required
- Gaps: None; visual inspection sufficient (`plan.md:418`)
- Manual verification required: Before/after screenshots of part list cards to confirm metadata badge border-radius change (rounded-full → rounded-md) is acceptable (`plan.md:419-420`)
- Evidence: `plan.md:408-421`, references `src/components/parts/part-details.tsx:1-100`

---

- Behavior: TypeScript compilation enforcement of className prop removal
- Scenarios:
  - Given className props are removed, When TypeScript compiles, Then no errors occur (all usages fixed) (`plan.md:422-423`)
- Instrumentation: `pnpm check` command (`plan.md:424`)
- Backend hooks: None
- Gaps: None (`plan.md:425`)
- Evidence: `plan.md:418-426`, TypeScript strict mode configuration

---

**Assessment**: Test coverage is comprehensive and deterministic. The plan properly leverages existing test infrastructure (part-crud.spec.ts) and adds necessary instrumentation (testId propagation, aria-label) to maintain test reliability. The visual regression documentation requirement (before/after screenshots) is appropriate for the metadata badge border-radius change. No test-event emission is required (correctly identified at lines 339-342 as passive display elements). All coverage follows the documented Playwright patterns.

---

## 5) Adversarial Sweep (must find ≥3 credible issues or declare why none exist)

After thorough adversarial examination, I found no credible issues requiring plan changes. Here are the targeted checks and why the plan holds:

- Checks attempted:
  1. **Component implementation pattern conflict** — Verified whether standalone span vs. Badge wrapper creates maintenance burden or visual inconsistency
  2. **testId propagation completeness** — Checked if testId requirement covers all InformationBadge instances including edge cases (dynamic lists, conditional rendering)
  3. **Accessibility gaps beyond aria-label** — Examined keyboard navigation, focus management, and screen reader announcements for remove button
  4. **React concurrency and render pressure** — Assessed whether TagsInput refactor with InformationBadge instances creates re-render cascades or key stability issues
  5. **Incomplete className removal** — Verified whether plan accounts for all call sites, including indirect usage through props spreading or composition
  6. **Visual regression scope** — Checked if the rounded-full → rounded-md change affects other badge types or creates brand inconsistency
  7. **Stale cache or state coordination** — Examined whether TagsInput state mutations could orphan InformationBadge instances or create stale UI
  8. **TypeScript strict mode edge cases** — Investigated whether required testId and removed className props could cause type narrowing issues or breaking changes in generic component wrappers

- Evidence:
  - `plan.md:49-50, 179, 217-218` — Standalone span implementation is explicitly justified with reference to base Badge hardcoding `rounded-full` (verified in badge.tsx:24). This is a sound architectural decision documented with evidence.
  - `plan.md:175, 233, 336, 403-404` — testId is required (not optional) and propagation to TagsInput is explicitly documented. The pattern `parts.form.tag.${index}` or `parts.form.tag.${tag}` (sanitized) covers dynamic lists. Format decision is appropriately deferred (line 516-518).
  - `plan.md:86, 170, 220, 404, 408` — Remove button has aria-label requirement documented in multiple sections (component props, UI flows, instrumentation, test plan). The pattern `aria-label="Remove {children}"` provides screen reader context. Keyboard interaction is handled by the Button component (already accessible).
  - `plan.md:228-239, 259` — InformationBadge is a stateless presentational component (lines 222, 259, 265-266). TagsInput state management is unchanged (line 236); only the rendering layer is refactored. No re-render pressure from state coupling. Key stability is addressed by existing `key={index}` pattern in tags-input.tsx:41-56.
  - `plan.md:67-68, 101, 184-193, 308-315` — className removal is enforced by TypeScript (line 105) with intentional breaking changes (lines 67-68, 74, 313-315). All call sites are enumerated (LocationSummary, MetadataBadge replacements). Only 2 files use MetadataBadge (verified via grep). TypeScript compiler will catch all usages (lines 104-105, 251, 313-315, 422-426).
  - `plan.md:318-322, 376-379, 411, 419-420, 471, 484-487` — Visual regression is explicitly scoped to metadata badges only (rounded-full → rounded-md). StatusBadge and KeyValueBadge wrap the base Badge component (verified in status-badge.tsx:59-66, key-value-badge.tsx:39-46) and retain rounded-full. Tags already use rounded-md (tags-input.tsx:44). LocationSummary has no background/border. The change is isolated and documented with required verification (before/after screenshots).
  - `plan.md:259-267, 272-279` — No derived state, no async coordination (section 6, 7). InformationBadge is pure presentation. TagsInput manages its own state array; badge instances are rendered from props (line 276). No cache writes, no cleanup triggers.
  - `plan.md:175, 313-315` — Required testId and removed className props are straightforward interface changes. No generic wrappers or higher-order components are affected (InformationBadge is a leaf component in the tree). Breaking changes are caught by TypeScript strict mode (line 99, 105).

- Why the plan holds:
  1. The standalone span implementation is necessary (not gratuitous) because base Badge hardcodes `rounded-full`, and InformationBadge requires `rounded-md` for tags. The divergence is justified, documented, and localized.
  2. testId is required throughout, propagated to TagsInput instances, and follows project conventions. No gaps in coverage.
  3. Accessibility is properly addressed via aria-label on the remove button, leveraging the already-accessible Button component for keyboard interaction.
  4. The refactoring is purely presentational; no state management or lifecycle changes. No re-render pressure, no stale cache risks.
  5. className removal is enforced by TypeScript with comprehensive search-and-replace documented (lines 244-254). Only 2 MetadataBadge usages exist (verified). LocationSummary className removal is explicit (lines 126-129, 184-193, 455-462).
  6. Visual regression is scoped, documented, and requires explicit verification. Other badge types are unaffected. The change aligns with existing tag styling (rounded-md in TagsInput).
  7. InformationBadge is stateless and pure; no coordination or caching concerns.
  8. TypeScript strict mode will catch all breaking changes; this is the intended mechanism per the UI component workflow (lines 67-68, 104-105).

The plan is adversarially sound. The first review identified 5 valid concerns, all of which have been addressed. No new credible issues surface under adversarial examination.

---

## 6) Derived-Value & State Invariants (table)

- Derived value: None
  - Source dataset: N/A
  - Write / cleanup triggered: N/A
  - Guards: N/A
  - Invariant: Component must remain stateless
  - Evidence: `plan.md:259-267` (Section 6: "No derived state. InformationBadge is a pure presentational component.")

**Justification for "none"**: InformationBadge is a stateless presentational component (lines 222, 259, 265-266). It receives props (icon, children, onRemove, variant, testId) and renders markup. No filtering, sorting, computed values, or state writes occur. The component does not trigger cache updates, navigation, or cleanup. TagsInput manages its own state array (`value: string[]`) but this is not derived state within InformationBadge—it's parent-owned data passed as props. The invariant is that InformationBadge must remain a pure function of its props (line 266: "Invariant: Component must remain stateless"). No derived-value risks exist because no derivation occurs.

---

## 7) Risks & Mitigations (top 3)

- Risk: Call sites passing className to MetadataBadge or LocationSummary will break (breaking change)
- Mitigation: TypeScript compiler will catch all occurrences; systematic search and fix during implementation
- Evidence: `plan.md:479-483` (Risk 1), `plan.md:67-68, 101, 104-105, 313-315, 422-426` (TypeScript enforcement)

---

- Risk: Visual differences from standardization may be unexpected, particularly metadata badge border-radius change (rounded-full → rounded-md)
- Mitigation: Accept as casualties per UI component workflow; capture before/after screenshots for explicit design review before merging
- Evidence: `plan.md:484-487` (Risk 2), `plan.md:71-72, 318-322, 376-379, 419-420, 471` (visual regression documentation and verification)

---

- Risk: testId propagation in TagsInput may be incomplete or incorrect format
- Mitigation: Make testId required (not optional) in InformationBadge props; document testId pattern in TagsInput refactor flow; verify tag-level assertions work
- Evidence: `plan.md:492-495` (Risk 4), `plan.md:175, 233, 336, 403-404, 406-407` (testId requirement and propagation)

---

**Assessment**: All three top risks are well-identified and have appropriate mitigations. The TypeScript enforcement mechanism aligns with the UI component workflow's aggressive cleanup principles. Visual regression documentation is explicit and includes verification steps. testId is now required (addressed from first review), closing the propagation gap. The risks are implementation-level concerns (not design flaws) with clear resolution paths.

---

## 8) Confidence

Confidence: High — The plan is comprehensive, well-researched, and implementation-ready. All five concerns from the first review have been adequately addressed: (1) standalone span implementation is justified with evidence, (2) testId is required throughout with propagation documented, (3) VendorInfo is properly scoped out with rationale, (4) remove button accessibility includes aria-label requirement, and (5) visual regression verification is explicit. The plan follows the UI component workflow's aggressive cleanup principles, accepts breaking changes as the enforcement mechanism, and documents all scope decisions with evidence. The standalone span divergence from StatusBadge/KeyValueBadge wrapping patterns is necessary (base Badge hardcodes rounded-full) and localized. Implementation slices are sequential and dependency-aware. Test coverage is deterministic and leverages existing infrastructure. No credible adversarial issues remain. The only remaining work is execution.
