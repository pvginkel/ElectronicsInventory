### 1) Summary & Decision
**Readiness**
The plan covers data flow and instrumentation, but it conflicts on core CTA placement (“Existing `KitDetail` payloads... the header action stays.” `docs/features/kit_pick_list_panel/plan.md:40`) while also adding a second inline create button (“Render a `Card`-like container with a header (`Pick Lists`), inline `Create pick list` button...” `docs/features/kit_pick_list_panel/plan.md:112`). It also omits required header/page-object updates tied to chip removal (`docs/features/kit_pick_list_panel/plan.md:27-28`, `docs/features/kit_pick_list_panel/plan.md:44-58`).

**Decision**
`GO-WITH-CONDITIONS` — resolve the CTA conflict and specify the missing header and Playwright page-object changes before implementation.

### 2) Conformance & Fit (with evidence)
**Conformance to refs**
- `docs/product_brief.md:70-75` — Pass — `docs/features/kit_pick_list_panel/plan.md:17-29` — “Position pick lists as a kit-scoped workflow...” keeps the redesign anchored in the kit workflow the brief describes (“Projects (kits)... See stock coverage immediately.”).
- `docs/contribute/architecture/application_overview.md:1-28` — Pass — `docs/features/kit_pick_list_panel/plan.md:59-61` — “Area: `src/components/kits/kit-pick-list-panel.tsx` (new)” aligns with the domain-driven component layout the overview calls out.
- `docs/contribute/testing/playwright_developer_guide.md:17-18` — Fail — `docs/features/kit_pick_list_panel/plan.md:27-29`; `tests/support/page-objects/pick-lists-page.ts:18-34` — the guide mandates feature-owned page objects, yet the plan removes the kit chip without scheduling updates to the pick-lists page object that binds `data-testid="pick-lists.detail.kit-chip.link"`.

**Fit with codebase**
- `KitDetailHeader` — `docs/features/kit_pick_list_panel/plan.md:27-29`; `src/components/kits/kit-detail-header.tsx:157-222` — Removing pick list chips requires revisiting `hasLinkedWork` and the empty copy; the plan does not yet call this out, leaving a blank metadata row when only pick lists exist.
- `PickListsPage` page object — `docs/features/kit_pick_list_panel/plan.md:28`; `tests/support/page-objects/pick-lists-page.ts:18-34` — The plan’s omission means Playwright will still expect the deleted chip selector.

### 3) Open Questions & Ambiguities
- Question: Should “Create Pick List” move from the header into the new panel or exist in both places? (`docs/features/kit_pick_list_panel/plan.md:40`, `docs/features/kit_pick_list_panel/plan.md:112`)
  - Why it matters: Duplicate CTAs confuse users and risk inconsistent instrumentation coverage.
  - Needed answer: Clarify ownership of the creation CTA (header vs panel) and update the plan to reflect the single, canonical location.
- Question: Do archived kits still allow navigating to existing pick lists from this panel? (`docs/features/kit_pick_list_panel/plan.md:115`)
  - Why it matters: Current chips remain navigable even when archived; changing that would block operators from reviewing historical pick lists without a direct URL.
  - Needed answer: Confirm expected archived behavior and document how the panel preserves access (or justify the restriction).

### 4) Deterministic Playwright Coverage (new/changed behavior only)
- Behavior: Kit detail pick list panel
  - Scenarios:
    - Given a kit with no pick lists… (`docs/features/kit_pick_list_panel/plan.md:255-257`)
    - Given open pick lists… instrumentation fires (`docs/features/kit_pick_list_panel/plan.md:256-258`)
    - Given completed lists… toggle reflects expanded state (`docs/features/kit_pick_list_panel/plan.md:257-258`)
  - Instrumentation: `kits.detail.pickLists.panel`, `kits.detail.pickLists.toggle` (`docs/features/kit_pick_list_panel/plan.md:198-209`)
  - Backend hooks: Existing kit detail factory coverage (`docs/features/kit_pick_list_panel/plan.md:100-105`)
  - Gaps: Must specify how `kits.detail.links` waits adapt once pick lists leave the header; plan currently silent.
  - Evidence: `docs/features/kit_pick_list_panel/plan.md:253-259`
- Behavior: Pick list detail navigation sans chip
  - Scenarios:
    - Resume from kit detail keeps breadcrumb (`docs/features/kit_pick_list_panel/plan.md:262-265`)
    - Deep link preserves search params (`docs/features/kit_pick_list_panel/plan.md:263-266`)
  - Instrumentation: Reuse existing detail waits (`docs/features/kit_pick_list_panel/plan.md:266-267`)
  - Backend hooks: No new hooks; relies on existing detail factories (`docs/features/kit_pick_list_panel/plan.md:262-268`)
  - Gaps: Page object still targets `pick-lists.detail.kit-chip.link`; tests will break unless the plan adds that refactor.
  - Evidence: `docs/features/kit_pick_list_panel/plan.md:262-268`

### 5) Adversarial Sweep (must find ≥3 credible issues or declare why none exist)
**Major — Duplicate create CTA**
**Evidence:** `docs/features/kit_pick_list_panel/plan.md:40` (“...the header action stays.”) and `docs/features/kit_pick_list_panel/plan.md:112` (“...inline `Create pick list` button...”).
**Why it matters:** Shipping two primary CTAs splits instrumentation, confuses operators, and contradicts the single-entry-point expectation in prior kit work.
**Fix suggestion:** Decide whether the create CTA lives in the header or the panel and document the removal of the other surface (including instrumentation/test updates).
**Confidence:** High

**Major — Header metadata row breaks when only pick lists exist**
**Evidence:** `docs/features/kit_pick_list_panel/plan.md:27-29` (remove pick list chips) plus `src/components/kits/kit-detail-header.tsx:157-222` (`hasLinkedWork` still counts pick lists).
**Why it matters:** Kits with zero shopping lists but existing pick lists would render an empty badge strip and misreport `hasLinkedWork`, harming UX and instrumentation (`kits.detail.links`).
**Fix suggestion:** Update the plan to adjust `hasLinkedWork`/empty copy and clarify revised instrumentation metadata for shopping lists only.
**Confidence:** High

**Major — Pick-lists page object left stale**
**Evidence:** `docs/features/kit_pick_list_panel/plan.md:28` (drop the kit chip) contrasted with `tests/support/page-objects/pick-lists-page.ts:18-34` (hard-codes `pick-lists.detail.kit-chip.link`).
**Why it matters:** Playwright specs will fail at compile/runtime because the page object targets a removed selector.
**Fix suggestion:** Extend the plan to cover the pick-lists page object (replace chip locator with breadcrumb helper and update dependent specs).
**Confidence:** High

**Major — Archived kits lose pick list access**
**Evidence:** `docs/features/kit_pick_list_panel/plan.md:115` (“disable resume... when kit is archived”) versus current chip behavior (`src/components/kits/pick-list-link-chip.tsx:22-61`, always renders a `Link`).
**Why it matters:** Operators tonight rely on archived kits’ chips to inspect historical pick lists; disabling navigation is a regression unless product explicitly green-lights it.
**Fix suggestion:** Document the intended archived behavior (keep link active but visually gated, or provide alternate entry) and align panel interactions accordingly.
**Confidence:** Medium

### 6) Derived-Value & State Invariants (table)
- Derived value: openPickLists
  - Source dataset: `detail.pickLists` filtered to status `open` (`docs/features/kit_pick_list_panel/plan.md:111-114`, `docs/features/kit_pick_list_panel/plan.md:140-145`)
  - Write / cleanup triggered: Drives tile rendering; no cache writes.
  - Guards: Requires `detail`; defaults to empty array.
  - Invariant: Must only surface pick lists with actionable work so the resume CTA stays legit.
  - Evidence: `docs/features/kit_pick_list_panel/plan.md:140-145`
- Derived value: completedPickLists
  - Source dataset: `detail.pickLists` filtered to `completed` (`docs/features/kit_pick_list_panel/plan.md:129-133`, `docs/features/kit_pick_list_panel/plan.md:147-151`)
  - Write / cleanup triggered: Feeds the collapse body; no external mutations.
  - Guards: Render toggle only when list non-empty.
  - Invariant: Entries should expose `completedAt` or degrade gracefully so timestamps stay accurate.
  - Evidence: `docs/features/kit_pick_list_panel/plan.md:147-151`
- Derived value: pickListPanelMetadata
  - Source dataset: Kit detail id + filtered lengths (`docs/features/kit_pick_list_panel/plan.md:161-165`)
  - Write / cleanup triggered: Emits `kits.detail.pickLists.panel` instrumentation.
  - Guards: Emit only when detail is ready.
  - Invariant: Metadata counts must match rendered tiles to keep Playwright waits deterministic.
  - Evidence: `docs/features/kit_pick_list_panel/plan.md:161-166`

### 7) Risks & Mitigations (top 3)
- Risk: Collapsed completed section becomes unwieldy with many entries — Mitigation: Apply documented max-height/show-more pattern; capture telemetry first (`docs/features/kit_pick_list_panel/plan.md:289-292`).
- Risk: CTA duplication erodes usability and instrumentation clarity — Mitigation: Decide on a single “Create Pick List” location and update instrumentation/tests (`docs/features/kit_pick_list_panel/plan.md:40`, `docs/features/kit_pick_list_panel/plan.md:112`).
- Risk: `kits.detail.links` instrumentation drifts once pick lists leave the header — Mitigation: Explicitly document the new metadata shape and test updates (`docs/features/kit_pick_list_panel/plan.md:173-174`).

### 8) Confidence
<confidence_template>Confidence: Medium — Coverage is solid once the CTA conflict and header/page-object gaps are addressed, but until then the implementation path remains unclear.</confidence_template>
