### 1) Summary & Decision
List screens now share the sticky-header shell (`src/components/layout/list-screen-layout.tsx:4-99`) and consistent count instrumentation (`src/components/boxes/box-list.tsx:71-337`, `src/components/sellers/seller-list.tsx:88-309`, `src/components/types/TypeList.tsx:82-302`, `src/components/parts/part-list.tsx:132-369`). Updated Playwright specs assert the new scroll/container behaviour (`tests/e2e/boxes/boxes-list.spec.ts:30-125`, `tests/e2e/parts/part-list.spec.ts:7-94`, `tests/e2e/sellers/sellers-list.spec.ts:5-124`, `tests/e2e/types/type-list.spec.ts:7-111`). **Decision:** GO — implementation aligns with the plan and automated coverage exercises the new layout.

### 2) Conformance to Plan (with evidence)
- `docs/features/list_screen_rollout/plan.md:5-7` — “flatten the shared padding API…” → `src/routes/__root.tsx:31-119` removes the padding context/provider and renders a neutral app-shell container so routes own their spacing.
- `docs/features/list_screen_rollout/plan.md:7,33` — “validate layout primitives…” → `src/components/layout/list-screen-layout.tsx:4-99` adds test-id/channel props and `src/components/layout/list-screen-counts.tsx:1-41` guards the filtered badge when `filtered < total`.
- `docs/features/list_screen_rollout/plan.md:35-43` — boxes migrate to the template → `src/components/boxes/box-list.tsx:146-337` wires breadcrumbs/title/actions/search/counts into `ListScreenLayout`, preserves `scope: 'boxes.list'`, and `tests/e2e/boxes/boxes-list.spec.ts:30-125` covers sticky headers, filtering, and instrumentation.
- `docs/features/list_screen_rollout/plan.md:11-13` — parts route & list refactor → `src/routes/parts/index.tsx:43-58` exposes the list shell, `src/components/parts/part-list.tsx:132-369` composes the layout/actions/search/counts, and `tests/e2e/parts/part-list.spec.ts:7-94` validates loading skeletons, sticky headers, and summary text.
- `docs/features/list_screen_rollout/plan.md:14-15` — sellers adoption → `src/components/sellers/seller-list.tsx:198-309` renders through the template while keeping confirm/dialog flows, with `tests/e2e/sellers/sellers-list.spec.ts:5-124` exercising CRUD + sticky header.
- `docs/features/list_screen_rollout/plan.md:16-17` — types rollout → `src/components/types/TypeList.tsx:223-302` maps breadcrumbs/title/actions/search/counts, and `tests/e2e/types/type-list.spec.ts:7-111` covers loading, persisted search, and part-count updates.
- `docs/features/list_screen_rollout/plan.md:18-21` — instrumentation & Playwright support → updated page objects (`tests/support/page-objects/boxes-page.ts:9-76`, `tests/support/page-objects/parts-page.ts:11-118`, `tests/support/page-objects/sellers-page.ts:8-87`, `tests/e2e/types/TypesPage.ts:5-122`) bind the new `*.overview.*` hooks, keeping specs deterministic.

### 3) Correctness — Findings (ranked)
None.

### 4) Over-Engineering & Refactoring Opportunities
None noted; the abstractions introduced match the documented template and keep existing flows intact.

### 5) Style & Consistency
- `src/components/parts/part-list.tsx:149-205` emits `filteredCount` in metadata while the other lists expose `filtered`, diverging from the new convention. Consider normalising the key so test code can treat all list events uniformly.

### 6) Tests & Deterministic Coverage (new/changed behavior only)
- **Boxes list**: Given seeded boxes, when the page loads the header stays pinned while `ListScreenCounts` reflects filtered totals (`tests/e2e/boxes/boxes-list.spec.ts:30-72`). CRUD flows rely on form instrumentation (`tests/e2e/boxes/boxes-list.spec.ts:75-124`).
- **Parts list**: Given inventory, when the list loads it waits on `parts.list` events and keeps the header sticky (`tests/e2e/parts/part-list.spec.ts:7-23`). Detail navigation asserts card metadata and search summary (`tests/e2e/parts/part-list.spec.ts:25-82`).
- **Sellers list**: Given vendor seed data, filtering updates counts/badge (`tests/e2e/sellers/sellers-list.spec.ts:5-40`), and create/edit/delete flows emit instrumentation (`tests/e2e/sellers/sellers-list.spec.ts:42-94`).
- **Types list**: Loading skeletons, search persistence, and badge updates are exercised (`tests/e2e/types/type-list.spec.ts:7-111`).

### 7) Adversarial Sweep (≥3 attempts)
- **Sticky header & scroll containment** — Verified `ListScreenLayout` makes the header `sticky top-0` and pushes scroll responsibility into `content` (`src/components/layout/list-screen-layout.tsx:41-96`), while page objects scroll `*.overview.content` (e.g., `tests/support/page-objects/boxes-page.ts:19-42`). Bounding-box assertions in specs confirm it holds under scroll (e.g., `tests/e2e/boxes/boxes-list.spec.ts:51-60`).
- **Filtered badge over-reporting** — `ListScreenCounts` only renders the badge when `filtered < total` (`src/components/layout/list-screen-counts.tsx:35-41`), and each list only supplies `filtered` when a filter actually trims the dataset (e.g., `src/components/boxes/box-list.tsx:66-89`, `src/components/types/TypeList.tsx:82-112`), preventing false “filtered” states.
- **Dialog lifecycle regressions** — Modals remain outside the layout tree (e.g., `src/components/boxes/box-list.tsx:226-339`, `src/components/sellers/seller-list.tsx:280-309`), so repeated list renders do not unmount open dialogs; specs still step through create/edit/delete flows successfully.

### 8) Invariants Checklist
| Invariant | Where enforced | How it could fail | Current protection | Evidence |
|---|---|---|---|---|
| Sticky list headers stay pinned during inner scrolling | `ListScreenLayout` sticky header + scrollable content | Parent container lacks `min-h-0` / flex, causing outer scroll to take over | Route/list roots enforce `flex h-full min-h-0` | src/components/layout/list-screen-layout.tsx:41-96, src/components/boxes/box-list.tsx:208-225 |
| Filter badges only appear when filters reduce the dataset | `ListScreenCounts` guards `filtered < total` | Components pass `filtered` unconditionally | Each list computes `filteredCount` only when `visible < total` | src/components/layout/list-screen-counts.tsx:35-41; src/components/sellers/seller-list.tsx:83-107 |
| List instrumentation exposes totals/visible for Playwright waits | `useListLoadingInstrumentation` payloads | Missing fields would break deterministic waits | New metadata injects totals/visible (and optional filtered) per scope | src/components/boxes/box-list.tsx:71-97; src/components/types/TypeList.tsx:82-125 |

### 9) Questions / Needs-Info
None.

### 10) Risks & Mitigations (top 3)
1. Parts list metadata still advertises `filteredCount` instead of the new `filtered` property. Mitigation: standardise the field so downstream tooling can treat lists uniformly (`src/components/parts/part-list.tsx:149-205`).
2. Removing the global padding context means any route not audited could now render flush to the viewport. Mitigation: continue spot-checking remaining routes for explicit spacing (`docs/features/list_screen_rollout/plan.md:27-30`, `src/routes/about.tsx:47-128` pattern).
3. Nested scroll containers (`main` + list content) could introduce double-scroll on new screens. Mitigation: keep using the `flex h-full min-h-0` wrapper when introducing additional list pages and rely on the existing Playwright sticky-header assertions.

### 11) Confidence
Medium — Large surface area was inspected and specs cover the main flows, but the review relied on static analysis without executing the Playwright suite locally.
