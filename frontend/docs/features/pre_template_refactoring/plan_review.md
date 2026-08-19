# Plan Review: Pre-Template Refactoring

## 1) Summary & Decision

**Readiness**

The plan is thorough, well-researched, and tightly scoped. The research log demonstrates genuine codebase discovery, all eight refactorings are behavior-preserving file moves with clear before/after semantics, and the implementation slices are correctly sequenced. The file map is nearly exhaustive and provides line-range evidence for every claim. A few factual inaccuracies (import count, provider reordering claim, `selectors.common` classification) need correction, but none block implementation.

**Decision**

`GO-WITH-CONDITIONS` -- Correct the import count for `test-events.ts`, clarify the `QuerySetup` reordering statement, and revisit the `selectors.common` classification. All conditions are documentation fixes, not design changes.

---

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `docs/commands/plan_feature.md` -- Pass -- The plan follows all 16 required headings, uses the prescribed templates, and includes the user requirements checklist verbatim.
- `docs/product_brief.md` -- Pass -- The refactoring is structural only and does not touch any product workflows. No product brief alignment concerns.
- `docs/contribute/architecture/application_overview.md` -- Pass -- `plan.md:10-18` -- The plan correctly identifies the directory layout (`src/lib/test/`, `src/types/`, `src/contexts/`) and the role of `test-events.ts` as documented in the architecture overview (`application_overview.md:46`).
- `docs/contribute/testing/playwright_developer_guide.md` -- Pass -- `plan.md:340-365` -- The plan correctly identifies the existing suite as a regression gate and does not introduce new test patterns. The fixture extension pattern (`base.extend`) matches the documented pattern in `playwright_developer_guide.md:50-66`.

**Fit with codebase**

- `tests/support/fixtures.ts` -- `plan.md:86-87,121-124` -- The plan proposes splitting at the `base.extend<TestFixtures, InternalFixtures>()` call (line 104). The actual fixture file uses a single `extend` call with both test and worker-scoped fixtures interleaved. The plan must ensure that `_serviceManager` (worker-scoped, line 417-658) stays in `fixtures-infrastructure.ts` with its `{ scope: 'worker' }` annotation, and that the domain file's `extend` call correctly inherits the worker scope. The plan acknowledges this at line 280 ("infrastructure fixtures export a typed `base.extend<InfrastructureFixtures, InternalFixtures>()`") which is correct.
- `src/routes/__root.tsx` -- `plan.md:148-149` -- The plan correctly identifies that `QuerySetup` moves from its current position (inside `DeploymentProvider`, innermost) to `CoreProviders` (after `ToastProvider`). This is a reordering, not a preservation. See Adversarial Sweep finding #1 for details.
- `src/index.css` -- `plan.md:106-108` -- The line ranges cited for EI-specific CSS are accurate: `--electronics-*` at lines 69-74, dark mode at 122-127, category utilities at 169-210, and glare-sweep at 259-267. Confirmed by reading the actual file.
- `tests/support/selectors.ts` -- `plan.md:87-88,127-128` -- Only two files import from `selectors.ts` (`tests/smoke.spec.ts` and `tests/support/page-objects/part-selector-harness.ts`). Confirmed by grep. The proposed approach of updating these two imports or re-exporting from `selectors.ts` is sound.

---

## 3) Open Questions & Ambiguities

- Question: Should `selectors.common` remain in the domain file or the infrastructure file?
- Why it matters: The plan (`plan.md:24`) classifies `selectors.common` as domain because it uses "EI-specific test IDs (toast, loading, error, search, pagination)." However, these test IDs (`toast`, `loading`, `error`, `search`, `pagination`) are generic patterns that would exist in any application using the template infrastructure. Misclassifying them as domain means the template will lack commonly needed selectors, forcing every downstream app to recreate them.
- Needed answer: Review whether `selectors.common` patterns are referenced by infrastructure tests or infrastructure page objects. If they are (or would be in the mother project per refactoring #18), they belong in `selectors.ts` (infrastructure), not `selectors-domain.ts`. **Research result**: `selectors.common` contains `loading`, `error`, `toast`, `search`, and `pagination` -- all generic UI patterns. These should stay in the infrastructure file (`selectors.ts`).

- Question: What happens to `src/types/test-events.ts` barrel or re-export?
- Why it matters: The architecture overview (`application_overview.md:46`) documents `src/types/test-events.ts` as the canonical location for test event types. After the move, this documentation reference becomes stale.
- Needed answer: The plan should note that `docs/contribute/architecture/application_overview.md:27,46` needs a documentation update to reflect the new location at `src/lib/test/test-events.ts`. This is a minor follow-up but prevents stale docs.

---

## 4) Deterministic Playwright Coverage (new/changed behavior only)

- Behavior: No new user-visible behavior. This is a structural refactoring.
- Scenarios:
  - Given all eight refactorings are complete, When `pnpm playwright test` runs the full suite, Then all tests pass with zero test logic changes (only import paths change) (`tests/e2e/**/*.spec.ts`)
  - Given all eight refactorings are complete, When `pnpm check` runs, Then TypeScript strict mode and ESLint pass (`plan.md:90`)
- Instrumentation: All existing `data-testid` attributes, test events, and `waitTestEvent`/`waitForListLoading` helpers remain unchanged. No new instrumentation is needed.
- Backend hooks: No backend changes required. Existing API factories and test data bundles are unaffected.
- Gaps: None. The plan correctly identifies the existing suite as a sufficient regression gate for behavior-preserving refactoring.
- Evidence: `plan.md:335-365`

---

## 5) Adversarial Sweep (must find >=3 credible issues or declare why none exist)

**Major -- Import count for test-events.ts is understated**

**Evidence:** `plan.md:132` -- "Referenced by 36 files." and `plan.md:160` -- "36 files importing `@/types/test-events`"

**Why it matters:** A grep for `@/types/test-events|types/test-events` across `.ts` and `.tsx` files returns 39 matches, not 36. The plan's file map (lines 163-174) lists specific categories but the counts do not add up to 36 either. Missing files from the update list means `pnpm check` will fail with unresolved imports after the relocation. The three extra files appear to be: `tests/support/helpers.ts`, `tests/e2e/shopping-lists/shopping-lists-detail.spec.ts`, and `src/components/boxes/box-details.tsx` (or similar files added since the research was done). However, the plan's approach of using find-and-replace across the codebase (line 286) should catch all instances regardless of the count, so the risk is more about the documented file map being incomplete than about the implementation failing.

**Fix suggestion:** Update the count from 36 to 39 and reconcile the file map at lines 163-174 with the actual grep results. Run `grep -r "@/types/test-events\|types/test-events" --include="*.ts" --include="*.tsx" src/ tests/` to produce the authoritative list. Alternatively, state that the implementation should use a codebase-wide search rather than relying on the enumerated list.

**Confidence:** High

---

**Minor -- "Provider ordering is preserved exactly" is misleading**

**Evidence:** `plan.md:217` -- "States / transitions: No change to the state machine. Provider ordering is preserved exactly: Query before Toast before Auth before SSE."

**Why it matters:** `QuerySetup` currently lives inside `DeploymentProvider` (position 7 of 8 in the nesting chain, per `__root.tsx:57`). After the refactoring, it moves inside `CoreProviders` (position 3, after `ToastProvider`). While this reordering is safe -- `QuerySetup` only depends on `useToast()` which requires `ToastProvider` as an ancestor -- the claim that ordering is "preserved exactly" is factually incorrect. The high-level provider group ordering (Query > Toast > Auth > SSE) is preserved, but the internal position of `QuerySetup` within that chain changes. A developer reviewing this plan might incorrectly assume no reordering occurs and skip verifying the `QuerySetup` dependency chain.

**Fix suggestion:** Change line 217 to: "The high-level provider group ordering is preserved (Query > Toast > Auth > SSE). `QuerySetup` moves from inside `DeploymentProvider` to inside `CoreProviders` (after `ToastProvider`), which is safe because its only context dependency is `useToast()`. This reordering is intentional and matches the refactoring spec (#6)."

**Confidence:** High

---

**Minor -- selectors.common classified as domain but contains generic patterns**

**Evidence:** `plan.md:24` -- "Since `selectors.common` uses EI-specific test IDs (toast, loading, error, search, pagination), it belongs in the domain file."

**Why it matters:** The selectors in `selectors.common` (`tests/support/selectors.ts:191-202`) use test IDs like `loading`, `error`, `toast`, `search`, and `pagination.*`. These are generic UI infrastructure patterns, not EI-specific domain concepts. Placing them in `selectors-domain.ts` means the template infrastructure will lack commonly needed selector patterns. When a new downstream app is generated from the template, it would need to recreate these selectors from scratch. This contradicts the refactoring goal of creating clean infrastructure/domain seams.

**Fix suggestion:** Move `selectors.common` to remain in `selectors.ts` (infrastructure) alongside `testId()` and `buildSelector()`. Only the truly domain-specific selectors (`selectors.parts`, `selectors.types`, `selectors.boxes`, `selectors.sellers`) should move to `selectors-domain.ts`.

**Confidence:** High

---

**Minor -- SelectorPattern type handling is unnecessary**

**Evidence:** `plan.md:156-157` -- "keeping only `testId()`, `buildSelector()`, and the `SelectorPattern` type export (for backward compatibility)"

**Why it matters:** `SelectorPattern` is defined in `selectors.ts:5-32` but is not imported by any other file in the codebase (confirmed by grep -- only `selectors.ts` itself contains the identifier). Retaining it in `selectors.ts` "for backward compatibility" implies external consumers exist, which is not the case. This is a minor inaccuracy that could confuse an implementer into thinking they need to maintain backward compatibility for a type nobody uses.

**Fix suggestion:** Remove the "for backward compatibility" qualifier. Either move `SelectorPattern` to `selectors-domain.ts` alongside the domain selectors that conform to its shape, or delete it entirely since it serves no current purpose. Prefer deletion to reduce dead code.

**Confidence:** High

---

## 6) Derived-Value & State Invariants (table)

- Derived value: Provider nesting order
  - Source dataset: Three provider group components (`CoreProviders`, `AuthProviders`, `SseProviders`) composed in `__root.tsx`
  - Write / cleanup triggered: Each provider manages its own React context values; provider ordering determines context availability for child components
  - Guards: TypeScript will fail at compile time if a hook tries to consume a context not provided by an ancestor (e.g., `useToast()` outside `ToastProvider`). Runtime guard exists in `use-toast.ts:6-8`.
  - Invariant: `QueryClientProvider` must wrap `ToastProvider` must wrap `AuthProvider` must wrap `SseContextProvider`. `QuerySetup` must be inside `ToastProvider`. This ordering is enforced by the composition in `RootLayout`.
  - Evidence: `plan.md:236-241`, `src/routes/__root.tsx:49-67`, `src/hooks/use-toast.ts:6-8`

- Derived value: Navigation items array identity
  - Source dataset: `navigationItems` constant in `sidebar-nav.ts` (static array, not filtered)
  - Write / cleanup triggered: Read-only consumption by `Sidebar` render cycle; no cache writes or mutations
  - Guards: `SidebarItem[]` type enforced by TypeScript; `import type` for the circular dependency
  - Invariant: Array must contain objects with `to`, `label`, `icon`, and `testId` fields. Module-level constant ensures stable reference across renders.
  - Evidence: `plan.md:246-248`, `src/components/layout/sidebar.tsx:23-31`

- Derived value: CSS custom property cascade
  - Source dataset: `index.css` base design tokens + `app-theme.css` overrides
  - Write / cleanup triggered: Browser applies CSS in import order; overrides take effect based on specificity and source order
  - Guards: CSS `@import` ordering within `index.css` determines precedence. Both files use `:root` selectors with equal specificity, so source order is the deciding factor.
  - Invariant: `@import "./app-theme.css"` must appear after the base `:root` declarations in `index.css` for app-specific overrides to take precedence.
  - Evidence: `plan.md:250-255`, `src/index.css:1-88`

None of these derived values use a filtered view to drive a persistent write, so no Major flag is warranted.

---

## 7) Risks & Mitigations (top 3)

- Risk: CSS `@import` ordering causes app theme overrides to be silently ignored, producing a visually different application with no TypeScript error to flag the problem.
- Mitigation: Place `@import "./app-theme.css"` after the `@layer base` block containing `:root` in `index.css`. Visually verify brand colors render correctly. Existing Playwright tests that interact with styled components (e.g., category-colored list items) serve as partial regression.
- Evidence: `plan.md:271-275`, `src/index.css:1-135`

- Risk: Fixture extension chain produces obscure TypeScript errors when the two-layer pattern (`infrastructureFixtures.extend<AppFixtures>()`) interacts with Playwright's generic constraints, particularly around the worker-scoped `_serviceManager` fixture.
- Mitigation: Keep the `InternalFixtures` type (containing `_serviceManager`) in `fixtures-infrastructure.ts` and ensure the worker scope annotation `{ scope: 'worker' }` is preserved. Add a guidepost comment explaining the two-layer extension pattern. Run `pnpm check` after the split to catch type mismatches immediately.
- Evidence: `plan.md:277-281`, `tests/support/fixtures.ts:100-104,417-658`

- Risk: Three test files using relative paths to `test-events.ts` (`tests/smoke.spec.ts`, `tests/e2e/setup/reset.spec.ts`, `tests/e2e/parallel/worker-isolation.spec.ts`) are missed or updated to incorrect paths, since they do not follow the `@/` alias convention used by the other 36 files.
- Mitigation: Convert all three to the `@/lib/test/test-events` alias (the `tsconfig.playwright.json` supports it). Use codebase-wide search rather than relying solely on the enumerated file list in the plan.
- Evidence: `plan.md:283-287,424-426`

---

## 8) Confidence

Confidence: High -- The plan is well-researched, correctly scoped, and the conditions identified are all documentation corrections rather than design flaws. The mechanical nature of the refactoring and the comprehensive existing test suite provide strong regression safety.
