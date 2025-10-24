### 1) Summary & Decision
**Readiness**
The plan assumes the backend already supplies on-hand snapshots for each line (`docs/features/pick_list_workspace_readonly/plan.md:24-40`), yet the generated schema exposes only `box_no`, `loc_no`, and `id` for locations (`src/lib/api/generated/types.ts:3475-3524`), so the core UI requirement cannot be met as written. Navigation also breaks because search params are renamed to `kitStatus`/`kitSearch` (`docs/features/pick_list_workspace_readonly/plan.md:109-178`) instead of the existing `status`/`search` contract (`src/routes/kits/$kitId/index.tsx:5-29`), and the proposed breadcrumb root targets a Pick Lists index that does not exist today (`docs/features/pick_list_workspace_readonly/plan.md:29-155`; `src/routes/pick-lists/$pickListId.tsx:4-11`).

**Decision**
`NO-GO` — Key data and routing assumptions are invalid, so implementation would ship broken UI and navigation.

### 2) Conformance & Fit (with evidence)
**Conformance to refs**
- `docs/epics/kits_feature_breakdown.md` — Fail — `docs/features/pick_list_workspace_readonly/plan.md:24-40` — “Display … on-hand snapshot…” / “Detail responses already include … on-hand snapshot,” but `src/lib/api/generated/types.ts:3475-3524` shows the location schema only exposes `box_no`, `loc_no`, and `id`, leaving the requirement unsatisfied.
- `docs/contribute/testing/playwright_developer_guide.md` — Pass — `docs/features/pick_list_workspace_readonly/plan.md:272-290` — scenarios rely on `waitForListLoading` / `waitForUiState` instrumentation, matching deterministic test expectations.

**Fit with codebase**
- `PickListRouteSearch` — `docs/features/pick_list_workspace_readonly/plan.md:109-178` — introduces `kitStatus` / `kitSearch`, but the existing kit detail route validates `status` / `search` (`src/routes/kits/$kitId/index.tsx:5-29`), so the proposed params would not round-trip.
- `Breadcrumb root` — `docs/features/pick_list_workspace_readonly/plan.md:29-155` — requires a Pick Lists index, yet only `/pick-lists/$pickListId` is defined (`src/routes/pick-lists/$pickListId.tsx:4-11`), so the crumb would point to a missing route.

### 3) Open Questions & Ambiguities
- Question: Where will the on-hand snapshot data come from? (`docs/features/pick_list_workspace_readonly/plan.md:24-105`)
  - Why it matters: The UI and tests promise to show on-hand values, but `PickListLineLocationSchema` only includes identifiers (`src/lib/api/generated/types.ts:3475-3524`).
  - Needed answer: Confirm a backend field or alternative source, or adjust scope/tests to drop on-hand display.
- Question: Are we introducing a Pick Lists index route as part of this slice? (`docs/features/pick_list_workspace_readonly/plan.md:29-155`)
  - Why it matters: Breadcrumbs linking to `/pick-lists` will 404 because only `/pick-lists/$pickListId` exists (`src/routes/pick-lists/$pickListId.tsx:4-11`).
  - Needed answer: Either scope a new index route or clarify the breadcrumb target.
- Question: Should the pick list detail search params stay aligned with `status`/`search`? (`docs/features/pick_list_workspace_readonly/plan.md:109-178`)
  - Why it matters: Renaming to `kitStatus`/`kitSearch` breaks kit-detail navigation and cached query keys that expect the existing names (`src/routes/kits/$kitId/index.tsx:5-29`).
  - Needed answer: Confirm we must keep the established param names and update the plan accordingly.

### 4) Deterministic Playwright Coverage (new/changed behavior only)
- Behavior: Pick list detail workspace (`docs/features/pick_list_workspace_readonly/plan.md:274-282`)
  - Scenarios:
    - Given a seeded pick list, When visiting `/pick-lists/<id>`, Then header metadata and `pickLists.detail.load` fire ready.
    - Given grouped lines, When detail loads, Then each group renders part summary, location, and quantity_to_pick without actions.
    - Given the API omits kit context, When deep linking, Then breadcrumbs show “Pick Lists → Pick list” and hide the kit chip.
  - Instrumentation: `waitForListLoading(page, 'pickLists.detail', 'ready')` / `waitForUiState(page, 'pickLists.detail.load', 'ready')` (`docs/features/pick_list_workspace_readonly/plan.md:280`).
  - Backend hooks: factories seeding pick lists via real APIs (`docs/features/pick_list_workspace_readonly/plan.md:76-78`).
  - Gaps: **Major** — The UI promises an on-hand snapshot but the schema lacks that field (`docs/features/pick_list_workspace_readonly/plan.md:24-105`; `src/lib/api/generated/types.ts:3475-3524`), so tests cannot assert it deterministically.
  - Evidence: `docs/features/pick_list_workspace_readonly/plan.md:274-282`.
- Behavior: Kit detail → pick list navigation (`docs/features/pick_list_workspace_readonly/plan.md:284-289`)
  - Scenarios:
    - Given a kit pick list chip, When clicked, Then navigation to `/pick-lists/<id>` occurs with preserved filters.
    - Given the kit crumb renders, When clicked, Then kit detail reloads and instrumentation fires.
  - Instrumentation: `waitForListLoading(page, 'kits.detail', 'ready')` and `waitForListLoading(page, 'pickLists.detail', 'ready')` (`docs/features/pick_list_workspace_readonly/plan.md:288`).
  - Backend hooks: kit factories seeding pick lists and chips (`docs/features/pick_list_workspace_readonly/plan.md:76-88`).
  - Gaps: **Major** — Search params shift to `kitStatus`/`kitSearch`, so returning to kit detail would drop the expected `status`/`search` filters (`docs/features/pick_list_workspace_readonly/plan.md:109-178`; `src/routes/kits/$kitId/index.tsx:5-29`).
  - Evidence: `docs/features/pick_list_workspace_readonly/plan.md:284-289`.

### 5) Adversarial Sweep (must find ≥3 credible issues or declare why none exist)
**Blocker — On-hand snapshot missing from schema**
**Evidence:** `docs/features/pick_list_workspace_readonly/plan.md:24-105` — “Display … on-hand snapshot” / “Detail responses already include … on-hand snapshot via location metadata”; `src/lib/api/generated/types.ts:3475-3524` — `PickListLineLocationSchema` lists only `box_no`, `loc_no`, and `id`.
**Why it matters:** Core UI content cannot render; instrumentation/tests around on-hand values will fail.
**Fix suggestion:** Align with backend to expose on-hand data or adjust requirements/tests to drop it.
**Confidence:** High

**Major — Search params renamed, breaking kit navigation**
**Evidence:** `docs/features/pick_list_workspace_readonly/plan.md:109-178` — defines `kitStatus`/`kitSearch`; `src/routes/kits/$kitId/index.tsx:5-29` — validates `status`/`search`.
**Why it matters:** Returning to kit detail would lose filter context and invalidate cached query keys.
**Fix suggestion:** Keep the existing `status` / `search` names when wiring pick list search state.
**Confidence:** High

**Major — Breadcrumb root targets nonexistent route**
**Evidence:** `docs/features/pick_list_workspace_readonly/plan.md:29-155` — “breadcrumbs anchored on the Pick Lists index”; `src/routes/pick-lists/$pickListId.tsx:4-11` — only `/pick-lists/$pickListId` is defined.
**Why it matters:** The root breadcrumb would navigate to a 404 until an index route ships.
**Fix suggestion:** Either scope an index route in this plan or adjust breadcrumbs to a valid destination.
**Confidence:** High

### 6) Derived-Value & State Invariants (table)
- Derived value: isCompleted
  - Source dataset: `detail.status` plus `detail.openLineCount`
  - Write / cleanup triggered: Header badge styling and hiding execution controls
  - Guards: Ensure `detail.completedAt` truthy when status is `completed`
  - Invariant: Completed lists must have zero open lines
  - Evidence: `docs/features/pick_list_workspace_readonly/plan.md:163-168`
- Derived value: lineGroups
  - Source dataset: `detail.lines` grouped by `kitContentId`
  - Write / cleanup triggered: Controls group rendering and summary chips
  - Guards: Memoize by detail identity and fallback to `[]`
  - Invariant: Sum of group counts equals `detail.lineCount`
  - Evidence: `docs/features/pick_list_workspace_readonly/plan.md:170-175`
- Derived value: kitLinkChipProps
  - Source dataset: `detail.kitId`, `detail.kitName`, and validated search params
  - Write / cleanup triggered: Feeds `KitLinkChip` props and breadcrumb links
  - Guards: Provide defaults and hide chip if kitId missing
  - Invariant: Chip navigation must point at a valid kit route
  - Evidence: `docs/features/pick_list_workspace_readonly/plan.md:177-181`

### 7) Risks & Mitigations (top 3)
- Risk: Backend payload lacks on-hand data required by the UI.
  - Mitigation: Confirm schema updates before implementation or de-scope on-hand display.
  - Evidence: `docs/features/pick_list_workspace_readonly/plan.md:24-105`; `src/lib/api/generated/types.ts:3475-3524`
- Risk: Renamed search params break return navigation and cached queries.
  - Mitigation: Retain `status`/`search` names across pick list route search state.
  - Evidence: `docs/features/pick_list_workspace_readonly/plan.md:109-178`; `src/routes/kits/$kitId/index.tsx:5-29`
- Risk: Breadcrumb root links to missing Pick Lists index.
  - Mitigation: Add the index route or change the crumb target (e.g., kits overview) in the plan.
  - Evidence: `docs/features/pick_list_workspace_readonly/plan.md:29-155`; `src/routes/pick-lists/$pickListId.tsx:4-11`

### 8) Confidence
Confidence: Low — Multiple unresolved blockers (missing data, routing targets) make the current plan unsafe to implement.
