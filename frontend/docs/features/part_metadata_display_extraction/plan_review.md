# Plan Review — Part Metadata Display Components Extraction

## 1) Summary & Decision

**Readiness**

This plan describes a straightforward component refactoring that moves QuantityBadge to `src/components/ui/` and removes className props from domain components to enforce style encapsulation. The research is thorough, documenting actual usage patterns, current API surfaces, and test coverage. The plan correctly identifies that QuantityBadge is reusable UI while LocationSummary and VendorInfo contain domain logic that should remain in the parts directory. The file map is complete, edge cases are covered, and the implementation slices are sensible. The plan demonstrates strong conformance to project patterns including the InformationBadge precedent for testId props and the UI component export conventions.

**Decision**

`GO` — The plan is implementation-ready with clear scope, complete file mapping, and appropriate handling of breaking changes. The refactoring properly separates UI concerns from domain logic, and all necessary verification steps are documented.

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `docs/commands/plan_feature.md` — Pass — `plan.md:1-504` — Complete plan structure with all required sections including research log, intent/scope, affected areas with evidence, data model contracts, API surface, algorithms, derived state, state consistency, errors, observability, lifecycle, UX impact, test plan, implementation slices, risks, and confidence. All sections properly populated with repository evidence.

- `docs/product_brief.md` — Pass — `plan.md:40-43` — Plan aligns with product context of part metadata display for inventory management. Components render quantity, location, and vendor information as described in product brief sections 5 (Parts) and 10.2 (Add a new part).

- `docs/contribute/architecture/application_overview.md` — Pass — `plan.md:84-92, 98-99` — Plan follows domain-driven folder structure (src/components/parts/, src/components/ui/) and reuses existing UI patterns. New QuantityBadge will follow established UI component conventions including testId props and no className customization, matching InformationBadge precedent.

- `docs/contribute/testing/playwright_developer_guide.md` — Pass — `plan.md:393-425` — Test plan correctly leverages existing test coverage via text content assertions and testId attributes. Plan acknowledges that tests use parts.list.card testId and verify metadata display through text presence checks, not component-specific selectors. No new instrumentation required since components are purely presentational.

**Fit with codebase**

- `src/components/ui/information-badge.tsx:10-21` — `plan.md:141-147` — QuantityBadge API correctly mirrors InformationBadge pattern with testId prop (not className). The plan properly follows the UI component precedent of mandatory testId for test reliability and no className prop for style encapsulation.

- `src/components/ui/index.ts:12-14` — `plan.md:88-92` — Export pattern documented correctly. Plan specifies adding QuantityBadge to the badge component exports section, following existing convention.

- `src/components/parts/part-card.tsx:6, 79` — `plan.md:114-120` — Import update is straightforward (local relative import to @/components/ui). Usage at line 79 shows no className prop passed, confirming breaking change is non-breaking in practice.

- `src/components/kits/kit-card.tsx:11, 75` — `plan.md:122-128` — Import update follows same pattern. Usage confirms no className override exists.

## 3) Open Questions & Ambiguities

No blocking open questions remain. The plan explicitly addresses potential questions about size variants and configurable truncation in section 15 (Risks & Open Questions) and correctly marks them as out of scope. The research phase resolved the key design decision about which components belong in UI versus domain directories.

## 4) Deterministic Playwright Coverage (new/changed behavior only)

- **Behavior:** Part list card metadata display (QuantityBadge standardization)
- **Scenarios:**
  - Given a part with quantity, When card renders, Then quantity badge displays with primary styling (`tests/e2e/parts/part-list.spec.ts:25-61`)
  - Given parts with different quantities, When cards render, Then all quantity badges have consistent styling (implicit in existing test)
- **Instrumentation:** `parts.list.card` testId for card targeting; text content assertion for quantity value ("12")
- **Backend hooks:** Factory method `testData.parts.create()` and `apiClient.POST('/api/inventory/parts/{part_key}/stock')` for quantity setup
- **Gaps:** None. Existing test coverage is sufficient for visual regression verification. Tests verify via text content which remains stable through the refactoring.
- **Evidence:** `plan.md:393-406, tests/e2e/parts/part-list.spec.ts:52-56`

- **Behavior:** Kit card quantity display (QuantityBadge in kit context)
- **Scenarios:**
  - Given a kit with build target quantity, When card renders, Then quantity badge displays with primary styling (existing kit overview test coverage)
- **Instrumentation:** `kits.overview.card.{kitId}` testId for card targeting
- **Backend hooks:** Factory method for kit creation with buildTarget
- **Gaps:** No explicit QuantityBadge-specific testing in kit specs, but this is acceptable as the component is presentational and visual consistency is the primary goal. The part list coverage provides sufficient verification.
- **Evidence:** `plan.md:407-414`

- **Behavior:** TypeScript compilation enforcement of breaking changes
- **Scenarios:**
  - Given className prop removed from interfaces, When TypeScript compiles, Then compilation succeeds (no call sites pass className)
  - Given invalid prop passed to QuantityBadge, When TypeScript compiles, Then compilation error surfaces invalid usage
- **Instrumentation:** `pnpm check` command output
- **Backend hooks:** N/A (compile-time verification)
- **Gaps:** None. TypeScript strict mode enforces prop contracts.
- **Evidence:** `plan.md:416-424`

## 5) Adversarial Sweep (must find ≥3 credible issues or declare why none exist)

**Checks attempted:**

- Stale cache risks — Not applicable; components are stateless and don't trigger cache writes
- React concurrency gotchas — Not applicable; synchronous rendering only, no suspense or transitions
- Generated API usage — Not applicable; no API calls in affected components
- Instrumentation gaps — Verified testId is required (plan addresses this correctly)
- Derived state filtering risks — Not applicable; no filtered views or persistent writes
- Cross-route state invariants — Not applicable; presentational components with no navigation side effects
- Interface contract completeness — VendorInfo cleanup reviewed (plan addresses this correctly)
- Test verification comprehensiveness — Kit test verification reviewed (plan addresses this correctly)

**Evidence:** `plan.md:141-147` (testId is required), `plan.md:100-105, 447-450` (VendorInfo cleanup is explicit), `plan.md:454-461` (kit test verification includes explicit criteria)

**Why the plan holds:**

All three issues identified in the previous review have been successfully addressed:

1. **testId requirement** — The QuantityBadge interface at `plan.md:141-147` now correctly shows `testId: string` (not optional), matching the InformationBadge pattern. This ensures consistent test instrumentation across all UI components.

2. **VendorInfo cleanup completeness** — The plan now explicitly documents at `plan.md:100-105` that className removal affects BOTH the interface prop AND the cn() usage on line 16. Slice 3 at `plan.md:447-453` specifies removing className from both locations: "remove `className?: string` from line 7" and "remove className parameter from cn() call on line 16". This addresses the dead code concern.

3. **Kit test verification criteria** — Slice 4 at `plan.md:454-461` now includes explicit verification expectations for kit tests: "Run `pnpm playwright test tests/e2e/kits/kits-overview.spec.ts` - verify kit cards render with quantity badges showing build target values correctly". This provides clear success criteria for the kit context.

This is a straightforward component extraction with well-scoped changes, clear boundaries, and minimal risk. The components are purely presentational (no state, no effects, no API calls), eliminating entire categories of failure modes. The breaking changes are intentional and TypeScript-enforced. The existing test coverage through text content assertions provides adequate regression detection. The previous documentation gaps have been fully resolved in this revision.

## 6) Derived-Value & State Invariants (table)

- **Derived value:** QuantityBadge display value
  - **Source dataset:** Numeric prop directly from domain models (part.total_quantity, kit.buildTarget); unfiltered
  - **Write / cleanup triggered:** None; purely presentational rendering
  - **Guards:** TypeScript number type enforcement; no runtime validation needed
  - **Invariant:** Quantity must be numeric and badge styling must remain consistent (primary background, bold text, rounded-full, px-3 py-1)
  - **Evidence:** `plan.md:236-244`

- **Derived value:** VendorInfo truncated seller name
  - **Source dataset:** seller.name string; unfiltered input, computed truncation (25 character threshold)
  - **Write / cleanup triggered:** None; computed on every render, no persistence
  - **Guards:** Null check on seller object (early return if absent at `vendor-info.tsx:11`)
  - **Invariant:** Truncation logic must not be customizable via props; display must remain muted foreground color; full name available via title attribute
  - **Evidence:** `plan.md:246-253`

- **Derived value:** LocationSummary formatted text
  - **Source dataset:** locations array processed by formatLocationSummary utility; unfiltered
  - **Write / cleanup triggered:** None; pure function rendering, no cache updates
  - **Guards:** Empty array handling in formatLocationSummary ("No locations" fallback)
  - **Invariant:** Summary format must remain consistent across all usages (no custom formatting via props); formatting logic encapsulated in utility function
  - **Evidence:** `plan.md:254-262`

No filtered views drive persistent writes. All derived values are ephemeral display computations with no side effects.

## 7) Risks & Mitigations (top 3)

- **Risk:** Visual regression in quantity badge padding standardization
  - **Mitigation:** The plan acknowledges at `plan.md:467-472` that minor visual differences are acceptable. Current usage review shows no className props passed to QuantityBadge, so standardization to px-3 py-1 creates consistent styling across all contexts without disrupting existing layouts.
  - **Evidence:** `plan.md:467-472, src/components/parts/part-card.tsx:79, src/components/kits/kit-card.tsx:75`

- **Risk:** Test failures due to visual changes in badge styling
  - **Mitigation:** Current Playwright tests use text content assertions rather than layout or styling checks (`plan.md:476-483`). Tests verify metadata presence ("12", location text, vendor name) which remains stable through the refactoring. Slice 4 includes explicit test execution and verification criteria to catch any regressions.
  - **Evidence:** `plan.md:476-483, tests/e2e/parts/part-list.spec.ts:52-56, tests/e2e/kits/kits-overview.spec.ts:146-149`

- **Risk:** Undiscovered className usages surfacing as TypeScript errors
  - **Mitigation:** Research documented at `plan.md:483-487` shows grep search confirms no className props passed in current usages. VendorInfo at `part-card.tsx:154-157` shows clean props without className. TypeScript compilation will catch any missed cases immediately. This is an intentional breaking change with minimal risk surface area.
  - **Evidence:** `plan.md:483-487, src/components/parts/part-card.tsx:154-157`

## 8) Confidence

**Confidence: High** — This is a well-researched, tightly-scoped refactoring with clear component boundaries, no async operations, and comprehensive TypeScript enforcement. The plan follows established UI component patterns (InformationBadge precedent), documents all affected files with evidence, and correctly separates reusable UI (QuantityBadge) from domain-specific logic (LocationSummary, VendorInfo).

The three documentation gaps identified in the previous review have been fully addressed:
1. testId is now explicitly required (not optional) in the QuantityBadge interface
2. VendorInfo className removal explicitly covers both the interface prop AND the cn() call
3. Kit test verification includes explicit success criteria for build target quantity display

The breaking changes are intentional, well-justified, and low-risk since no call sites currently pass className props. Test coverage through text content assertions provides adequate regression detection for this visual standardization work. The implementation slices are logical and properly sequenced with clear dependencies.

---

## Re-Review Summary (2025-11-03)

**Previous Issues Resolved:**

✅ **Issue 1: testId optional vs required** — RESOLVED at `plan.md:141-147`. Interface now shows `testId: string` (required), matching InformationBadge pattern and ensuring consistent test instrumentation.

✅ **Issue 2: VendorInfo cleanup completeness** — RESOLVED at `plan.md:100-105, 447-453`. Plan explicitly documents removal of className from BOTH the interface prop (line 7) AND the cn() usage (line 16), preventing dead code.

✅ **Issue 3: Kit test verification criteria** — RESOLVED at `plan.md:454-461`. Slice 4 now includes explicit verification expectations: "verify kit cards render with quantity badges showing build target values correctly".

**New Issues Found:**

None. The updated plan successfully addresses all previous concerns with sufficient specificity and clarity for implementation.

**Final Recommendation:**

`GO` — The plan is ready for implementation. All documentation gaps have been closed, and the approach remains sound. The implementer has clear guidance on API contracts (testId required), cleanup scope (both interface and cn() removal), and verification criteria (kit test expectations).
