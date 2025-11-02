# Plan Review: Grid Tile UI Component Standardization

## 1) Summary & Decision

**Readiness**

The plan is thorough, well-researched, and ready for implementation. It correctly identifies all five grid tile components requiring refactoring, provides comprehensive technical approach with clear evidence, includes proper test coverage planning, and acknowledges the single breaking Playwright test that must be updated. The plan demonstrates strong alignment with the project's architecture patterns, respects the Card component's existing structure, and includes appropriate risk assessment for edge cases (disabled states, dynamic styling, Tailwind class specificity). The implementation slices are well-sequenced with clear verification checkpoints.

**Decision**

`GO` — The plan is complete, technically sound, and includes all necessary elements for successful implementation. No blocking issues identified. Minor conditions noted in section 5 are advisory rather than blocking.

---

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `docs/commands/plan_feature.md` — **Pass** — `plan.md:3-21` — Research log explicitly lists all searched areas with file paths and line numbers, conforming to section 0 requirements
- `docs/commands/plan_feature.md` — **Pass** — `plan.md:24-68` — Intent & Scope section includes verbatim prompt quotes, in-scope/out-of-scope bullets, and assumptions/constraints per template
- `docs/commands/plan_feature.md` — **Pass** — `plan.md:72-131` — Affected Areas section provides file paths with line number evidence for each component touched
- `docs/contribute/architecture/application_overview.md` — **Pass** — `plan.md:178` — Correctly identifies Card as a UI primitive living in `src/components/ui/` with no API integration surface
- `docs/contribute/testing/playwright_developer_guide.md` — **Pass** — `plan.md:428-518` — Deterministic test plan section documents scenarios, instrumentation (data-testid preservation), and verification commands per Playwright testing standards
- `docs/product_brief.md` — **Pass** — This refactoring is neutral to product brief; it standardizes UI behavior without changing user workflows

**Fit with codebase**

- `src/components/ui/card.tsx` — `plan.md:139-161` — Plan correctly extends the existing variant pattern (`variantClasses` object and TypeScript union type) without breaking the Card API; aligns with current architecture
- `src/components/sellers/seller-card.tsx` — `plan.md:82-87` — Migration approach (change variant, remove className override) is minimal and preserves data-testid attributes
- `src/components/kits/kit-card.tsx` — `plan.md:96-101, 255-259` — Plan correctly identifies that layout classes (`flex h-full flex-col gap-4`) must be retained while animation classes move to Card variant; demonstrates understanding of class merging via `cn()` utility
- `src/components/documents/document-tile.tsx` — `plan.md:202-218` — Migration from raw div to Card component is well-analyzed; plan correctly identifies need to preserve `overflow-hidden`, disabled state logic, and data attributes
- `src/components/dashboard/storage-utilization-grid.tsx` — `plan.md:221-239, 269-275` — Plan acknowledges the complex interaction between inline styles (background opacity), dynamic border colors, and Card variant classes; correctly notes that StorageBox will change from `scale-105` to `scale-[1.02]` per standardization goal
- `tests/e2e/kits/kits-overview.spec.ts:264-281` — `plan.md:117-122, 468-476, 570-574` — Plan proactively identifies the breaking test and provides two resolution approaches with a clear recommendation (remove the test as animation is now an implementation detail)

---

## 3) Open Questions & Ambiguities

**Question 1: Grid-tile-disabled variant usage**

- **Question:** Should the `grid-tile-disabled` variant be used for archived kits or DocumentTile's deleting state?
- **Why it matters:** The plan introduces `grid-tile-disabled` variant but provides no concrete usage examples. Currently, DocumentTile applies `opacity-50 pointer-events-none` conditionally, and archived kits remain clickable.
- **Needed answer:** Explicit decision on when to use `grid-tile-disabled` vs. conditional className application.
- **Research findings:** Examining `plan.md:157-159` shows the variant defined as `'grid-tile-disabled': 'p-4'` with no hover effects. However:
  - `plan.md:262-267` states DocumentTile should continue using conditional className for deleting state
  - `plan.md:649-653` notes archived kits remain clickable, so they use `grid-tile` variant
  - **Answer:** The `grid-tile-disabled` variant is defined for future use but not applied in this refactoring. All five components continue using `grid-tile` variant with conditional overrides for disabled states. This is acceptable but should be documented in the implementation so developers understand when to use each variant.

**Question 2: Card variant `overflow-hidden` requirement**

- **Question:** Does the Card component's base classes include `overflow-hidden`, or must DocumentTile add it via className?
- **Why it matters:** DocumentTile requires `overflow-hidden` for rounded corners and absolute-positioned buttons (plan.md:216-217). If not in Card base classes, migration must explicitly add it.
- **Needed answer:** Verification of Card component's base class string.
- **Research findings:** Examining `src/components/ui/card.tsx:12` shows `baseClasses = 'rounded-lg border bg-card text-card-foreground shadow-sm'` — **no `overflow-hidden`**. Therefore, DocumentTile migration must add `className="overflow-hidden"` when switching to Card component. This is not explicitly called out in `plan.md:202-218` migration steps.
- **Fix required:** Section 14, Slice 4 should state: "Replace outer div with `<Card variant="grid-tile" className="overflow-hidden">`, preserve data attributes and disabled state logic."

---

## 4) Deterministic Playwright Coverage (new/changed behavior only)

**Behavior: SellerCard hover animation**

- **Scenarios:**
  - Given SellerCard renders, When user hovers, Then card scales to 1.02 and shows shadow (`tests/e2e/sellers/sellers-list.spec.ts` — no new test needed; existing tests verify card remains functional)
- **Instrumentation:** `data-testid="sellers.list.item.{sellerId}"` preserved (`plan.md:344`)
- **Backend hooks:** None required; purely visual change
- **Gaps:** None. Existing tests cover card click and navigation; visual animation is not functionally tested in Playwright (appropriate for CSS-only change)
- **Evidence:** `plan.md:444-453`

**Behavior: TypeCard hover animation**

- **Scenarios:**
  - Given TypeCard renders, When user hovers, Then card scales to 1.02 and shows shadow (`tests/e2e/types/type-list.spec.ts` — no new test needed)
- **Instrumentation:** `data-testid="types.list.card"` preserved (`plan.md:345`)
- **Backend hooks:** None required
- **Gaps:** None
- **Evidence:** `plan.md:455-465`

**Behavior: KitCard animation (no user-facing change)**

- **Scenarios:**
  - Given KitCard renders, When user hovers, Then card scales to 1.02 (same as before) — **existing animation test must be removed or updated** (`tests/e2e/kits/kits-overview.spec.ts:264-281`)
- **Instrumentation:** `data-testid="kits.overview.card.{kitId}"` preserved (`plan.md:346`)
- **Backend hooks:** None required
- **Gaps:** Test update approach documented in `plan.md:570-574` with recommendation to remove test entirely (animation is implementation detail, not functional contract)
- **Evidence:** `plan.md:467-478`

**Behavior: DocumentTile migration to Card**

- **Scenarios:**
  - Given DocumentTile renders, When user hovers, Then tile scales to 1.02 and shows shadow (same as before)
  - Given document is deleting, When rendered, Then hover effects suppressed via `opacity-50 pointer-events-none` (`tests/e2e/parts/part-documents.spec.ts:81` — existing test)
- **Instrumentation:** `data-document-tile`, `data-document-id` preserved (`plan.md:347-348`)
- **Backend hooks:** None required; existing document factories support delete scenarios
- **Gaps:** None
- **Evidence:** `plan.md:480-491`

**Behavior: StorageBox reduced hover scale**

- **Scenarios:**
  - Given StorageBox renders, When user hovers, Then box scales to 1.02 (reduced from 1.05) and shows shadow
  - Given storage grid loads, When boxes render, Then click navigation remains functional (`tests/e2e/dashboard/storage-utilization.spec.ts:63-84` — existing test)
- **Instrumentation:** `data-testid="dashboard.storage.box"`, `data-box-no` preserved (`plan.md:349`)
- **Backend hooks:** None required
- **Gaps:** Visual regression of reduced scale is noted as acceptable per requirements (`plan.md:501-502`)
- **Evidence:** `plan.md:493-504`

**Behavior: Full test suite execution**

- **Scenarios:**
  - Given all refactors complete, When `pnpm check` runs, Then TypeScript/lint/format pass
  - Given all refactors complete, When `pnpm playwright test` runs, Then all tests pass after kits-overview animation test update
- **Instrumentation:** Standard CI pipeline
- **Backend hooks:** None
- **Gaps:** None
- **Evidence:** `plan.md:506-518`

---

## 5) Adversarial Sweep (must find ≥3 credible issues or declare why none exist)

**Major — DocumentTile migration missing overflow-hidden className**

**Evidence:** `plan.md:202-218`, `src/components/ui/card.tsx:12`, `src/components/documents/document-tile.tsx:111`

The plan states DocumentTile requires `overflow-hidden` for rounded corners and absolute-positioned buttons (plan.md:216). However, examining `src/components/ui/card.tsx:12` shows the Card base classes are `'rounded-lg border bg-card text-card-foreground shadow-sm'` — **no `overflow-hidden`**. The current DocumentTile implementation at line 111 includes `overflow-hidden` in its className string. The migration steps in section 14, Slice 4 (`plan.md:576-589`) state "Replace outer div with `<Card variant="grid-tile">`" but do not explicitly call out adding `className="overflow-hidden"`.

**Why it matters:** Without `overflow-hidden`, DocumentTile's rounded corners will not clip the inner content correctly, and the absolute-positioned action buttons at the top-right may overflow the card boundary. This will cause a visual regression.

**Fix suggestion:** Update `plan.md` section 14, Slice 4 to explicitly state: "Replace outer `<div>` with `<Card variant="grid-tile" className="overflow-hidden">`, preserve all existing data attributes (`data-document-tile`, `data-document-id`), and maintain disabled state logic."

**Confidence:** High

---

**Minor — StorageBox border color specificity ambiguity**

**Evidence:** `plan.md:269-275`, `src/components/dashboard/storage-utilization-grid.tsx:40-42,51`

The plan correctly identifies that StorageBox uses dynamic border colors via `getBorderColor(usagePercentage)` returning values like `border-red-500/80` or `border-muted-foreground/40`. The Card `grid-tile` variant adds `hover:border-primary/50`. Section 6 (`plan.md:269-275`) states: "On hover, border should transition to `primary/50` regardless of static border color (Tailwind specificity rules apply)."

However, Tailwind's class specificity is resolved via CSS order, not JavaScript merge order. If `getBorderColor()` returns `border-red-500/80`, it will be applied via `className={getBorderColor(...)}` and merged with Card's `hover:border-primary/50`. Since both are border-color utilities with different pseudo-class prefixes (none vs. `hover:`), they should coexist correctly. But the plan does not verify this behavior.

**Why it matters:** If the dynamic border color somehow overrides the hover state (unlikely but worth verifying), StorageBox hover effects will be inconsistent with other grid tiles.

**Fix suggestion:** Add explicit verification step to Slice 5 (`plan.md:591-604`): "After migration, manually hover over storage boxes with different usage percentages (empty, low, high, critical) to verify that the hover border color transitions to `primary/50` regardless of the static border color. If the hover state is not visible, apply the border color via a custom CSS variable or inline style instead of Tailwind class."

**Confidence:** Medium (Tailwind's specificity rules should handle this correctly, but manual verification is prudent)

---

**Minor — KitCard animation test removal not flagged as breaking change**

**Evidence:** `plan.md:117-122, 468-476, 570-574`, `tests/e2e/kits/kits-overview.spec.ts:264-281`

The plan correctly identifies that the kits-overview animation test at lines 264-281 explicitly asserts on animation classes and must be updated or removed. Section 14, Slice 3 (`plan.md:555-575`) provides two approaches and recommends removing the test entirely because "animation is an internal styling concern."

However, the plan does not flag this as a **breaking test change** that requires coordination with any CI/CD pipelines or other developers who may be relying on this test's existence. If the test is removed without updating documentation or notifying stakeholders, it could cause confusion.

**Why it matters:** Removing a test without documenting the rationale may lead to questions during code review or future developers re-adding similar tests.

**Fix suggestion:** Add a note to section 14, Slice 3 stating: "When removing the animation test, add a code comment in `kits-overview.spec.ts` explaining that animation classes are now an implementation detail of the Card component's `grid-tile` variant and are not part of KitCard's functional contract. Alternatively, if stakeholders require animation verification, update the test to verify the Card wrapper includes the grid-tile variant instead of asserting on specific Tailwind classes."

**Confidence:** Low (This is more of a process/documentation issue than a technical blocker)

---

**Adversarial proof (additional checks)**

- **Check attempted:** Risk of `cn()` utility not correctly merging layout classes (e.g., KitCard's `flex h-full flex-col gap-4`) with Card variant classes
- **Evidence:** `plan.md:255-259`, `src/components/ui/card.tsx:29`
- **Why the plan holds:** The `cn()` utility (from `@/lib/utils`, typically a wrapper around `clsx` or `tailwind-merge`) is designed to merge Tailwind classes correctly. Layout classes (`flex`, `h-full`, `flex-col`, `gap-4`) do not conflict with animation classes (`transition-all`, `hover:shadow-md`, `hover:scale-[1.02]`) because they target different CSS properties. The plan correctly identifies this in section 6 and states the invariant: "Layout classes (flex, height, gap) must merge cleanly with animation classes (transition, hover:scale, etc.) without specificity conflicts." This is a low-risk scenario that will be caught during manual testing in Slice 3 verification.

- **Check attempted:** Risk of disabled state (DocumentTile `isDeleting`) not suppressing hover effects when combined with Card variant
- **Evidence:** `plan.md:262-267, 308-312`, `src/components/documents/document-tile.tsx:111-113`
- **Why the plan holds:** The current DocumentTile implementation conditionally applies `pointer-events-none` when `isDeleting` is true, which disables all pointer events including hover. The plan states this logic will be preserved post-refactor (`plan.md:209`). Since `pointer-events-none` is a higher-level CSS property than hover pseudo-classes, it will correctly suppress the Card variant's hover effects. The existing Playwright test at `tests/e2e/parts/part-documents.spec.ts:81` verifies the delete flow, providing safety net.

- **Check attempted:** Risk of Tailwind JIT compiler not generating new `grid-tile` variant classes during build
- **Evidence:** `plan.md:197-199`
- **Why the plan holds:** Tailwind's JIT compiler scans all source files for class names and generates CSS on-demand. Adding the `grid-tile` variant to `src/components/ui/card.tsx` ensures the classes are discovered during compilation. The verification step `pnpm check` in Slice 1 (`plan.md:534-535`) includes a build check that will catch any Tailwind configuration issues. This is a non-issue for projects using standard Tailwind setup.

- **Check attempted:** Risk of data-testid attribute loss during migration breaking Playwright tests
- **Evidence:** `plan.md:331-357`, `plan.md:287-288`
- **Why the plan holds:** Section 9 explicitly documents that all five components will preserve their existing data-testid attributes. The plan states: "Existing data-testid attributes remain unchanged; Playwright tests continue to rely on these selectors" (`plan.md:287-288`). Each affected component's migration approach explicitly calls out preserving data attributes. The verification steps in section 14 include running the relevant Playwright specs after each slice, which will immediately catch any selector breakage.

---

## 6) Derived-Value & State Invariants (table)

**Derived value: Card className composition**

- **Source dataset:** Card component receives `variant` prop (one of fixed string literals) and optional `className` prop from parent components
- **Write / cleanup triggered:** `cn()` utility merges `baseClasses`, `variantClasses[variant]`, and `className` into final className string; applied to DOM element on every render
- **Guards:** TypeScript enforces variant must be one of `'default' | 'stats' | 'action' | 'content' | 'grid-tile' | 'grid-tile-disabled'`; invalid variants cause compilation error
- **Invariant:** The merge order (`cn(baseClasses, variantClasses[variant], className)`) must allow parent className to override variant classes when necessary; `cn()` utility (tailwind-merge) handles Tailwind class specificity correctly
- **Evidence:** `plan.md:245-251`, `src/components/ui/card.tsx:29`

**Derived value: KitCard layout vs. animation class separation**

- **Source dataset:** KitCard needs flex layout (`flex h-full flex-col gap-4`) but animation classes move to Card variant
- **Write / cleanup triggered:** After refactor, KitCard passes `variant="grid-tile"` and `className="flex h-full flex-col gap-4"` to Card; `cn()` merges both sets of classes
- **Guards:** No runtime guards; relies on `cn()` utility's class merging and Tailwind's non-conflicting property design
- **Invariant:** Layout classes (flex, height, gap) must merge cleanly with animation classes (transition, hover:scale, etc.) without specificity conflicts; these target different CSS properties and will not override each other
- **Evidence:** `plan.md:255-259`, `src/components/kits/kit-card.tsx:65`

**Derived value: DocumentTile disabled state suppression**

- **Source dataset:** `isDeleting` boolean state (derived from mutation hook)
- **Write / cleanup triggered:** When `isDeleting` is true, conditional className applies `opacity-50 pointer-events-none` to Card component; suppresses hover effects and click events
- **Guards:** Ternary expression at `src/components/documents/document-tile.tsx:111-113` conditionally applies classes based on `isDeleting` boolean
- **Invariant:** When deleting, Card must not show hover effects (scale, shadow, border change); `pointer-events-none` suppresses all pointer interactions including hover pseudo-classes
- **Evidence:** `plan.md:262-267`, `src/components/documents/document-tile.tsx:111-113`

**Derived value: StorageBox dynamic border color composition**

- **Source dataset:** `usagePercentage` (calculated from `occupiedLocations / totalLocations * 100`) filtered through `getBorderColor()` helper
- **Write / cleanup triggered:** Border color class (e.g., `border-red-500/80`) is merged with Card variant classes; Card variant adds `hover:border-primary/50`
- **Guards:** No guards; both static and hover border classes are applied simultaneously via `cn()` merge
- **Invariant:** On hover, border should transition to `primary/50` regardless of static border color; Tailwind's pseudo-class specificity (`:hover` vs. base) ensures hover state takes precedence
- **Evidence:** `plan.md:269-275`, `src/components/dashboard/storage-utilization-grid.tsx:36-42,51`

**Derived value: StorageBox dynamic background opacity composition**

- **Source dataset:** `usagePercentage` filtered through `getBackgroundOpacity()` helper returning numeric opacity value
- **Write / cleanup triggered:** Applied via inline `style` prop (`style={{ backgroundColor: rgba(var(--primary), ${opacity}) }}`); coexists with Card variant classes
- **Guards:** No guards; inline styles and className are independent DOM attributes
- **Invariant:** Inline style for background opacity must not conflict with Card variant classes; inline styles apply via `style` attribute, Tailwind classes apply via `class` attribute, no overlap
- **Evidence:** `plan.md:315-319`, `src/components/dashboard/storage-utilization-grid.tsx:54-56`

---

## 7) Risks & Mitigations (top 3)

**Risk: DocumentTile visual regression due to missing overflow-hidden**

- **Mitigation:** Explicitly add `className="overflow-hidden"` to Card component in DocumentTile migration (see Section 5, Major finding). Verify visually during Slice 4 that rounded corners clip content correctly and action buttons don't overflow.
- **Evidence:** `plan.md:202-218`, `src/components/ui/card.tsx:12`, `src/components/documents/document-tile.tsx:111`

**Risk: Tailwind class specificity conflicts in StorageBox dynamic border colors**

- **Mitigation:** Manually test StorageBox hover states with different usage percentages during Slice 5 verification. If hover border color is not visible, refactor to use CSS custom property or inline style for dynamic border instead of Tailwind class.
- **Evidence:** `plan.md:269-275`, `src/components/dashboard/storage-utilization-grid.tsx:40-42,51`

**Risk: User perception of StorageBox hover animation change (scale-105 → scale-[1.02])**

- **Mitigation:** Acceptable per requirements ("acceptable casualties for consistency"). If stakeholder feedback is negative post-implementation, the scale value can be adjusted in the Card variant's `grid-tile` classes to `scale-[1.03]` or `scale-[1.04]` as a compromise without breaking the standardization goal.
- **Evidence:** `plan.md:628-632`, `plan.md:420-425`

---

## 8) Confidence

**Confidence: High** — The plan is exceptionally thorough with comprehensive research, clear implementation slices, and proper test coverage strategy. The technical approach aligns with the Card component's existing architecture and follows project conventions. The only moderate risk is the DocumentTile `overflow-hidden` omission (easily fixed) and StorageBox border color specificity (low probability of actual conflict). The plan demonstrates deep understanding of Tailwind class merging, React component composition, and Playwright testing requirements. Implementation risk is low.
