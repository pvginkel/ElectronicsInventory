# Plan Review — Collection Display Primitives (v2)

## 1) Summary & Decision

**Readiness**

The updated plan successfully addresses all five critical issues from the previous review. The TypeScript interfaces are now explicit and compilable (section 3), the grid breakpoint inconsistency is resolved with a props-based API (breakpoint='lg'|'xl'), semantic validation has properly excluded update-stock-dialog.tsx, the CodeBadge variant prop has been removed, and layout grids have been correctly excluded from CollectionGrid scope. The plan demonstrates thorough research, clear scope boundaries, and a mechanical implementation path. The refactoring is low-risk due to its presentation-only nature, TypeScript safety, and preserved test infrastructure. No blocking concerns remain.

**Decision**

`GO` — All critical issues resolved; plan is implementation-ready with strong TypeScript contracts and clear migration path.

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `docs/commands/plan_feature.md` — Pass — `plan.md:138-183` — TypeScript interfaces provided with required/optional props clearly marked; follows template structure with research log, intent, scope, file map, and data contracts.
- `docs/product_brief.md` — Pass — Not directly applicable — This is internal technical debt work with no product brief requirements; correctly scoped as infrastructure improvement.
- `docs/contribute/architecture/application_overview.md` — Pass — `plan.md:13-14` — Follows established UI component patterns in `src/components/ui/` with domain-agnostic design and props-based APIs; aligns with "Tailwind CSS with a library of reusable UI components" architecture principle.
- `docs/contribute/testing/playwright_developer_guide.md` — Pass — `plan.md:357-389` — Plan correctly identifies that layout structure is not directly tested and preserves existing data-testid attributes; no test updates required per documented selector strategy.

**Fit with codebase**

- `src/components/ui/index.ts` — `plan.md:76-78` — Correct export barrel pattern; new components will be added alongside existing Badge, QuantityBadge, and other UI primitives.
- `src/components/parts/part-card.tsx` — `plan.md:82-84` — CodeBadge extraction correctly targets inline styled div at line 111; replacement preserves visual appearance while centralizing style.
- `src/components/shopping-lists/concept-table.tsx` — `plan.md:96-98` — ListSectionHeader extraction correctly targets flex header pattern at lines 62-76; semantic h2 heading preserved.
- `src/components/parts/part-list.tsx` — `plan.md:110-112` — CollectionGrid extraction correctly targets grid divs at lines 231, 287 with xl:grid-cols-3 breakpoint; testId preservation maintained.
- Breakpoint consistency — `plan.md:9, 180-182` — The breakpoint='lg'|'xl' prop design cleanly resolves the lg/xl split identified in research; parts/shopping-lists/kits default to xl (1280px), boxes/sellers/types explicitly pass lg (1024px).

## 3) Open Questions & Ambiguities

All open questions from the previous review have been resolved:

- Question: How should the grid breakpoint inconsistency be handled?
- Resolution: Resolved via breakpoint prop with 'lg'|'xl' union type; defaults to 'xl'; plan documents which files use each variant.
- Evidence: `plan.md:169-183`

- Question: Should ListSectionHeader support the update-stock-dialog pattern?
- Resolution: Resolved; update-stock-dialog.tsx excluded due to FormLabel semantics (not a heading); plan documents semantic coherence requirement.
- Evidence: `plan.md:11, 424`

- Question: Should CodeBadge support variant customization?
- Resolution: Resolved; variant prop removed as all usages standardize to single style (bg-muted + px-2 py-1 + rounded + font-mono); plan documents acceptance of visual standardization.
- Evidence: `plan.md:148`

- Question: Should box-details.tsx and box-form.tsx grids be included?
- Resolution: Resolved; correctly excluded as layout grids with asymmetric columns (lg:col-span-2), not uniform collection grids.
- Evidence: `plan.md:9, 448`

**New questions requiring research:**

None. The plan is self-contained and implementation-ready.

## 4) Deterministic Playwright Coverage (new/changed behavior only)

- Behavior: Parts list grid rendering with CollectionGrid component
- Scenarios:
  - Given parts overview page loaded, When parts displayed, Then grid container has data-testid="parts.list.container" (tests/support/page-objects/parts-page.ts)
  - Given loading state, When skeletons rendered, Then grid container has data-testid="parts.list.loading" (tests/support/page-objects/parts-page.ts)
- Instrumentation: Existing parts.list.container and parts.list.card selectors preserved; CollectionGrid accepts testId prop and passes through to grid div
- Backend hooks: No backend changes; existing parts list API remains unchanged
- Gaps: None; visual styling changes not tested per project conventions (layout structure preservation sufficient)
- Evidence: `plan.md:360-366`

- Behavior: Shopping lists overview grid rendering with CollectionGrid component
- Scenarios:
  - Given shopping lists page loaded, When lists displayed, Then grid has data-testid="shopping-lists.overview.grid.concept" (existing spec)
- Instrumentation: Existing shopping-lists.overview.grid selectors preserved; testId prop passed through
- Backend hooks: No backend changes
- Gaps: None
- Evidence: `plan.md:368-373`

- Behavior: Kits overview grid rendering with CollectionGrid component
- Scenarios:
  - Given kits page loaded, When kits displayed, Then grid has data-testid="kits.overview.grid.active" (existing spec)
- Instrumentation: Existing kits.overview.grid selectors preserved; testId prop passed through
- Backend hooks: No backend changes
- Gaps: None
- Evidence: `plan.md:375-380`

- Behavior: Part card ID display with CodeBadge component
- Scenarios:
  - Given part card rendered, When ID displayed, Then CodeBadge shows monospace ID (visual inspection in development)
- Instrumentation: Existing parts.list.card selector; CodeBadge accepts optional testId prop
- Backend hooks: No backend changes
- Gaps: No automated test for CodeBadge styling; acceptable for presentation-only refactoring per project constraints
- Evidence: `plan.md:382-387`

**Coverage Assessment:** All existing Playwright coverage is preserved through testId pass-through. No new behaviors introduced; refactoring maintains DOM structure and data attributes. Visual changes (CodeBadge background addition to part-inline-summary) are intentional standardization, not regressions. Plan correctly identifies that existing specs will validate functionality without updates.

## 5) Adversarial Sweep (must find ≥3 credible issues or declare why none exist)

### Checks attempted:

1. TypeScript interface completeness and compilability
2. Props API surface for testId threading and breakpoint configuration
3. Component encapsulation boundaries (className exposure risks)
4. Migration completeness (exhaustive search validation)
5. Semantic HTML correctness (heading levels, label vs heading distinctions)
6. Visual regression risks from standardization
7. Test coverage preservation through DOM structure changes

### Evidence:

- TypeScript interfaces: `plan.md:138-183` — Explicit CodeBadgeProps, ListSectionHeaderProps, CollectionGridProps with required/optional props clearly marked
- Breakpoint prop design: `plan.md:169-183` — Breakpoint configuration encapsulated in component; caller specifies 'lg' or 'xl'
- Semantic validation: `plan.md:11, 424` — Update-stock-dialog excluded due to FormLabel (not heading element)
- Migration exhaustiveness: `plan.md:3-12` — Research log documents comprehensive grep/glob searches with line-by-line evidence
- Test preservation: `plan.md:357-389` — Plan explicitly preserves data-testid attributes and documents selector compatibility

### Why the plan holds:

**No credible blocking issues remain.** The plan successfully addresses all critical findings from the previous review:

- **Critical #1 (Grid breakpoint inconsistency):** Resolved via breakpoint='lg'|'xl' prop with clear defaults and explicit passing where needed. Implementation is type-safe and preserves existing visual behavior.
- **Critical #2 (TypeScript interfaces missing):** Resolved; section 3 now provides complete, compilable interfaces with React.ReactNode for slots and union types for enums.
- **Critical #3 (ListSectionHeader semantic validation):** Resolved; update-stock-dialog correctly excluded with justification (FormLabel vs h2/h3 semantic mismatch).
- **Critical #4 (CodeBadge variant prop unnecessary):** Resolved; variant prop removed after confirming all usages standardize to single style.
- **Critical #5 (Layout grids incorrectly included):** Resolved; box-details and box-form grids excluded with clear justification (asymmetric layout vs uniform collection).

**Minor observations (non-blocking):**

1. **ListSectionHeader heading level:** Plan documents h3 for title (`plan.md:164`) but concept-table.tsx currently uses h2 (`concept-table.tsx:64`). This is a minor inconsistency but acceptable — the component should choose a semantic default (h3 is appropriate for section headers within cards). Implementation should use h3 and let visual styling handle size.

2. **CodeBadge element choice:** Plan uses span (`plan.md:203`), which is correct for inline code identifiers. Confirmed appropriate for all usages (part IDs, part keys).

3. **CollectionGrid gap hardcoded:** Plan hardcodes gap-4 (`plan.md:182, 222`). All current usages use gap-4, so this is correct. Future flexibility could add gap prop if needed, but YAGNI principle applies here.

## 6) Derived-Value & State Invariants (table)

**Assessment:** None applicable — This is a presentation-only refactoring with no derived state, filtering, sorting, or cache manipulation. All components are stateless functional components that receive props and render deterministic output.

**Proof:**

- Derived value: None
  - Source dataset: Components receive display strings (code, title) and React elements (children, actions) directly from parent components
  - Write / cleanup triggered: No writes; no cache updates; no navigation triggers; no storage mutation
  - Guards: Not applicable
  - Invariant: Components are pure functions of props; no hidden state or derived calculations
  - Evidence: `plan.md:229-234, 305-309` — "No derived state. All components are stateless functional components that receive props and render deterministic output. The components do not filter, sort, or transform data."

**Justification for "none":**

The refactoring moves inline JSX/div structures into reusable components without introducing state management, data transformation, or async coordination. Section 6 of the plan explicitly documents "No derived state" and section 7 documents "No async coordination required." The components are pure presentation wrappers that apply Tailwind classes to their content. TypeScript strict mode enforces prop contracts at compile time, eliminating runtime state drift risks.

## 7) Risks & Mitigations (top 3)

- Risk: CodeBadge adds background to part-inline-summary usages where it was previously plain text (plan.md:458-460)
- Mitigation: Accept as intended standardization; verify in development that bg-muted provides acceptable contrast; visual improvement for consistency outweighs minor change
- Evidence: `plan.md:320-321, 332-336` — Plan explicitly documents this as "acceptable casualty for consistency" and notes it improves visual hierarchy

- Risk: CollectionGrid breakpoint prop misconfiguration breaks responsive layouts in 6 files (plan.md:466-468)
- Mitigation: Parts/shopping-lists/kits omit breakpoint prop (defaults to xl); boxes/sellers/types explicitly pass breakpoint='lg'; TypeScript union type enforces valid values; test all affected pages at 1024px and 1280px viewports; run existing Playwright specs to catch regressions
- Evidence: `plan.md:169-183, 436-448` — Plan documents explicit breakpoint assignments per file and slices refactoring into two groups (primary xl pages, secondary lg pages)

- Risk: Merge conflicts if multiple developers touch affected files during refactoring (plan.md:474-476)
- Mitigation: Communicate refactoring timeline; complete work in focused timeframe; use slice-based approach (7 slices) to minimize conflict surface; TypeScript compilation catches all call sites, eliminating partial migration risk
- Evidence: `plan.md:391-452` — Implementation slices separate component creation from usage refactoring and split CollectionGrid refactoring by domain (primary vs secondary pages)

## 8) Confidence

Confidence: High — The updated plan resolves all critical issues and provides explicit TypeScript contracts, clear migration paths, and strong safety guarantees. The refactoring is mechanical (TypeScript compiler guides all call sites), low-risk (presentation-only with no state or API changes), and well-scoped (exhaustive search completed, layout grids correctly excluded, semantic validation performed). Test infrastructure is preserved through testId pass-through. Visual changes are intentional standardization accepted as "casualties for consistency." Implementation is straightforward prop replacement with no algorithmic complexity or async coordination. The slice-based approach enables focused review and limits merge conflict surface. No blocking risks remain; minor observations documented above do not impact implementation readiness.

---

## Appendix: Previous Review Closure

All five critical issues from the previous review have been successfully resolved:

1. **Critical — Grid breakpoint inconsistency (lg vs xl)**: Resolved via breakpoint='lg'|'xl' prop with type-safe defaults. Parts/shopping-lists/kits use xl (default), boxes/sellers/types explicitly pass lg.

2. **Critical — TypeScript interfaces missing from section 3**: Resolved; section 3 now includes complete CodeBadgeProps, ListSectionHeaderProps, and CollectionGridProps interfaces with clear required/optional markers.

3. **Critical — ListSectionHeader semantic validation incomplete**: Resolved; update-stock-dialog.tsx correctly excluded with justification (FormLabel vs heading semantic mismatch).

4. **Critical — CodeBadge variant prop unjustified**: Resolved; variant prop removed after confirming all usages standardize to single style (bg-muted + px-2 py-1 + rounded + font-mono).

5. **Critical — Layout grids incorrectly included in CollectionGrid scope**: Resolved; box-details.tsx and box-form.tsx correctly excluded with justification (asymmetric layout grids with lg:col-span-2, not uniform collection grids).

The plan demonstrates strong iterative improvement and is now ready for implementation.
