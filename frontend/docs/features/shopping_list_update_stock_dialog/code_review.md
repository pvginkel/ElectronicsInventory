## 1) Summary & Decision
The shipped slice consolidates the update-stock dialog into the planned unified table, drives receive totals from row inputs, and keeps instrumentation/test hooks aligned. Interactions around allocation validation, submission payloads, and Playwright coverage look solid.  
**Decision:** GO – no correctness blockers found.

## 2) Conformance to Plan (with evidence)
- **Refined allocation model & seeding:** Plan step 1 required discriminated drafts seeded from `partLocations`; implemented via `ExistingAllocationDraft`/`NewAllocationDraft` and `buildInitialAllocations` (`src/components/shopping-lists/ready/update-stock-dialog.tsx:21-103`).
- **Remove `receiveNow`, derive totals from entries:** `UpdateStockFormValues` now only tracks `allocations`, and submission derives `receiveQuantity` from `validateAllocations.totalReceive` (`src/components/shopping-lists/ready/update-stock-dialog.tsx:52-200`, `215-260`).
- **Validation overhaul & summary copy:** New validator enforces positive integers, uniqueness, and “at least one receive entry” (`src/components/shopping-lists/ready/update-stock-dialog.tsx:113-200`), matching plan step 3.
- **Unified table rendering & test IDs:** Table rows for existing vs. new allocations render per plan (read-only columns vs. inputs, icon column, stable `data-testid`s) (`src/components/shopping-lists/ready/update-stock-dialog.tsx:592-727`).
- **Submission payload & instrumentation:** `allocationToPayload` filters invalid rows; instrumentation counts valid entries (`src/components/shopping-lists/ready/update-stock-dialog.tsx:162-199`, `240-292`), satisfying plan step 5.
- **Playwright harness/tests updated:** Page object now targets row-level selectors (`tests/support/page-objects/shopping-lists-page.ts:421-452`), and E2E specs cover partial receive, multi-row receive, and validation guardrails (`tests/e2e/shopping-lists/shopping-lists.spec.ts:874-1153`), addressing plan step 6 & Playwright coverage milestones.
- **Intentional deviation:** The “Add location” control uses the primary button variant (`src/components/shopping-lists/ready/update-stock-dialog.tsx:579-588`) instead of the plan’s ghost styling, reflecting the follow-up UX request.

## 3) Correctness — Findings (ranked)
None.

## 4) Over-Engineering & Refactoring Opportunities
Nothing stands out; the refactor trims state surface area and keeps logic cohesive.

## 5) Style & Consistency
- Table markup and button styling follow the project’s existing Tailwind patterns; no inconsistencies worth flagging.

## 6) Tests & Deterministic Coverage (new/changed behavior only)
- **Scenario – Partial receive with mixed rows:** Given an ordered line, when the user fills one existing row and one new row, then submit, the backend records two allocations and instrumentation captures `{receiveQuantity: 3, allocationCount: 2}` (`tests/e2e/shopping-lists/shopping-lists.spec.ts:889-924`).
- **Scenario – Save & next flow:** Given two ordered lines, when the user receives allocations across successive dialogs, both lines reflect the correct receive totals and instrumentation metadata (`tests/e2e/shopping-lists/shopping-lists.spec.ts:987-1040`).
- **Scenario – Validation guard:** Attempting submission with empty Receive cells surfaces the summary error, and filling a row clears it before enabling Save (`tests/e2e/shopping-lists/shopping-lists.spec.ts:1100-1109`).
- Hooks rely on `data-testid="shopping-lists.ready.update-stock.row.*"` selectors (`tests/support/page-objects/shopping-lists-page.ts:421-452`), ensuring deterministic targeting. No gaps spotted.

## 7) Adversarial Sweep
- **Duplicate location attempt:** Simulated adding a new row with the same box/location as an existing allocation; validator blocks with row error and summary (`src/components/shopping-lists/ready/update-stock-dialog.tsx:180-195`). No failure observed.
- **Blank receive submission:** Tried submitting with blank receives; `positiveEntries === 0` forces summary and disables submission (`src/components/shopping-lists/ready/update-stock-dialog.tsx:200-204`). Works as expected.
- **Invalid integer inputs:** Checked for non-integer / zero receive values; per-row errors trigger and prevent payload emission (`src/components/shopping-lists/ready/update-stock-dialog.tsx:173-199`). No leakage detected.

## 8) Invariants Checklist
| Invariant | Where enforced | How it could fail | Current protection | Evidence |
|---|---|---|---|---|
| At least one allocation has positive receive before submit | `validateAllocations` | User leaves all cells empty | `positiveEntries === 0` adds summary & marks invalid | src/components/shopping-lists/ready/update-stock-dialog.tsx:200-204 |
| Box/location combos are unique across existing & new rows | `validateAllocations` | User duplicates box+loc | Duplicate hit adds row errors & summary | src/components/shopping-lists/ready/update-stock-dialog.tsx:180-189 |
| Payload only includes valid positive integers | `allocationToPayload` | Invalid strings slip through into submission | Returns `null` unless parsed integers ≥1 | src/components/shopping-lists/ready/update-stock-dialog.tsx:162-199 |

## 9) Questions / Needs-Info
None.

## 10) Risks & Mitigations
- **R1 – Future width constraints:** Further layout tweaks may reintroduce cramped controls; keep the `Dialog` width override (`src/components/shopping-lists/ready/update-stock-dialog.tsx:531-536`) under regression tests.
- **R2 – Box metadata dependencies:** Rendering descriptions relies on `useGetBoxes`; if that hook changes shape, ensure `boxLookup` stays updated (`src/components/shopping-lists/ready/update-stock-dialog.tsx:233-238`).
- **R3 – Validation drift:** Any future API changes to allocation inputs must update `validateAllocations` and Playwright helpers in tandem (`tests/support/page-objects/shopping-lists-page.ts:421-452`).

## 11) Confidence
High — Full E2E suite passes, manual reasoning didn’t uncover failure modes.
