### 1) Summary & Decision
The plan hits key surfaces for the kits overview but leaves critical data modelling gaps (pick-list columns, shopping-list link fields) and a broken search predicate, so execution would stall without fixes. Decision: GO-WITH-CONDITIONS — address the issues called out in §5 before build-out.

### 2) Conformance & Fit (with evidence)
- Product brief scope: PASS — the plan targets kits lifecycle controls consistent with “Support **projects/kits**: plan builds, see stock coverage, and add shortages to the shopping list” (docs/product_brief.md:70-75) and promises API endpoints to list/archive kits (`"Implement the backend for “Kits overview & archiving controls”… enabling the global kits index… and archive/unarchive lifecycle controls."` docs/features/kits_overview_archiving_controls/plan.md:3-3).
- Plan template compliance: PASS — it provides top-level context and a file list (`"- `app/api/kits.py` – Flask blueprint implementing `GET /kits`, `POST /kits`, …"` docs/features/kits_overview_archiving_controls/plan.md:10-10) plus phased steps (docs/features/kits_overview_archiving_controls/plan.md:17-82), matching the expectations in docs/commands/plan_feature.md:5-17.
- Agent responsibilities: PASS — responsibilities around layering are honoured (“Implement `KitService(BaseService)`…” docs/features/kits_overview_archiving_controls/plan.md:25-39) and align with the layered guidance in AGENTS.md:27-65.
- Backend layering rules: PASS — API-only HTTP logic (`"Implement `kits_bp = Blueprint("kits", …)`; decorate endpoints with `@api.validate` and `@handle_api_errors`."` docs/features/kits_overview_archiving_controls/plan.md:47-52) keeps business logic inside services per AGENTS.md:27-61.
- Fit with codebase: the plan references concrete modules already present (`app/models/__init__.py`, `app/services/container.py`, `app/services/test_data_service.py` in docs/features/kits_overview_archiving_controls/plan.md:7-12,56-57) ensuring new work integrates with existing patterns.

### 3) Open Questions & Ambiguities
- Kit pick-list schema scope: `"Create `kit_pick_lists` table with FK… lifecycle columns (`status`, timestamps) sufficient for badge computation"` (docs/features/kits_overview_archiving_controls/plan.md:20-20) omits fields the epic calls for, such as `requested_units` and deduction audit columns (docs/epics/kits_feature_breakdown.md:138-159). Clarify whether those are required now or a later revision.
- Shopping-list link snapshots: the plan stores `"a badge-oriented `status_snapshot`"` (docs/features/kits_overview_archiving_controls/plan.md:19-19), yet the epic expects `snapshot_kit_updated_at` and `is_stale` flags (docs/epics/kits_feature_breakdown.md:120-122). Need direction on which snapshot contract to honour.
- Kit name uniqueness question remains unanswered despite the epic flagging it as outstanding (docs/epics/kits_feature_breakdown.md:220-223); guidance is needed before schema finalisation.
- Test data load ordering: `"load kits JSON → kit shopping list links… → kit pick lists"` (docs/features/kits_overview_archiving_controls/plan.md:56-61) does not specify how it interleaves with existing shopping-list loaders in app/services/test_data_service.py:35-39, risking FK violations without an explicit ordering plan.

### 4) Deterministic Backend Coverage (new/changed behavior only)
**GET /kits** — **Scenarios:** Service/API tests cover status filtering, query search, and validation (`"Service tests … `list_kits` filters by status and `query`."` docs/features/kits_overview_archiving_controls/plan.md:64-72). **Instrumentation:** Major – no metrics additions are planned despite the requirement to add Prometheus hooks for new feature visibility (AGENTS.md:256-280). **Persistence hooks:** Covered via new tables and indexes (docs/features/kits_overview_archiving_controls/plan.md:17-22) plus dataset seeding (docs/features/kits_overview_archiving_controls/plan.md:55-61).
**POST /kits** — **Scenarios:** Create defaults and validation tests are listed (docs/features/kits_overview_archiving_controls/plan.md:64-72). **Instrumentation:** Major – same metrics gap (AGENTS.md:256-280). **Persistence hooks:** Uses `Kit` table and default handling in `KitService` (docs/features/kits_overview_archiving_controls/plan.md:34-35).
**PATCH /kits/<kit_id>** — **Scenarios:** Tests enforce archived guard and field updates (docs/features/kits_overview_archiving_controls/plan.md:64-72). **Instrumentation:** Major – metrics plan absent (AGENTS.md:256-280). **Persistence hooks:** Relies on `Kit` constraints and `func.now()` updates (docs/features/kits_overview_archiving_controls/plan.md:34-36).
**POST /kits/<kit_id>/archive** — **Scenarios:** Archive/unarchive transitions tested in both service and API layers (docs/features/kits_overview_archiving_controls/plan.md:64-72). **Instrumentation:** Major – no counter/gauge coverage (AGENTS.md:256-280). **Persistence hooks:** Sets `status`, `archived_at`, and `updated_at` per docs/features/kits_overview_archiving_controls/plan.md:35-37.
**POST /kits/<kit_id>/unarchive** — **Scenarios:** Same test coverage as archive (docs/features/kits_overview_archiving_controls/plan.md:64-72). **Instrumentation:** Major – missing metrics (AGENTS.md:256-280). **Persistence hooks:** Clears `archived_at` and flips status (docs/features/kits_overview_archiving_controls/plan.md:36-37).

### 5) Adversarial Sweep (≥3 credible issues)
**[KIT-1] Major — Active kit search becomes case-sensitive**  
Evidence: `"If `query` present, apply `func.lower(Kit.name).like` and `Kit.description.ilike` with `%{query}%`; sanitize via `query.strip()`."` (docs/features/kits_overview_archiving_controls/plan.md:30-31)  
Why it matters: Passing the original-case query into `lower(name) LIKE` fails whenever the user types uppercase/lowercase differently, undermining the product brief’s fast-find promise (docs/product_brief.md:85-88).  
Fix suggestion: Lower-case the query before comparison or rely on `Kit.name.ilike(...)` for consistent case-insensitive matching.  
Confidence: High.

**[KIT-2] Major — `kit_pick_lists` schema omits required audit fields**  
Evidence: `"Create `kit_pick_lists` table with FK to `kits.id`, lifecycle columns (`status`, timestamps) sufficient for badge computation (`status != completed`)."` (docs/features/kits_overview_archiving_controls/plan.md:20-20) vs. `"Add `KitPickList` model… columns: … `requested_units`… `first_deduction_at`… `decreased_build_target_by`…" (docs/epics/kits_feature_breakdown.md:138-159).  
Why it matters: Leaving out mandated columns breaks future pick-list workflows and forces a breaking migration later.  
Fix suggestion: Expand the migration/model scope now to match the epic’s full column set, even if some are unused initially.  
Confidence: High.

**[KIT-3] Major — Shopping-list links lack stale tracking contract**  
Evidence: `"Create `kit_shopping_list_links`… storing … a badge-oriented `status_snapshot`, and any required fields from the epic"` (docs/features/kits_overview_archiving_controls/plan.md:19-19) while the epic specifies `snapshot_kit_updated_at` and `is_stale` outputs (docs/epics/kits_feature_breakdown.md:120-122).  
Why it matters: Without the snapshot timestamp and stale flag, the UI cannot detect when badges drift from the kit’s current state, undermining trust in the overview.  
Fix suggestion: Add the explicit timestamp/flag fields to the schema and describe how they are maintained.  
Confidence: Medium.

### 6) Derived-Value & Persistence Invariants
| Derived value | Source dataset (filtered/unfiltered) | Write/cleanup it triggers | Guard conditions | Invariant that must hold | Evidence (file:lines) |
| ------------- | ------------------------------------ | ------------------------- | ---------------- | ------------------------ | --------------------- |
| `Kit.archived_at` timestamp | `Kit` row (unfiltered) | `archive_kit` updates status/timestamps | Must not already be archived | Whenever `status='archived'`, `archived_at` is non-null | docs/features/kits_overview_archiving_controls/plan.md:35-37 |
| `status_snapshot` on `kit_shopping_list_links` | `ShoppingList.status` (filtered to concept/ready per badges) | Persisted on link creation for badge counts | Link only to valid shopping lists; snapshot must mirror source status at write time | Snapshot matches the shopping list status captured at linking | docs/features/kits_overview_archiving_controls/plan.md:19-19 |
| `Kit.updated_at` refresh via service | `Kit` row (unfiltered) | `update_kit`/archive/unarchive call `func.now()` | Prevent updates when kit archived (except lifecycle flips) | `updated_at` monotonicity preserves ordering for overview cards | docs/features/kits_overview_archiving_controls/plan.md:35-37 |

### 7) Risks & Mitigations (top 3)
- Search predicate bug will make kit discovery unreliable (docs/features/kits_overview_archiving_controls/plan.md:30-31); mitigate by switching to `ilike` or normalised parameters before implementation.
- Missing pick-list columns would force follow-up migrations and block future workflow features (docs/features/kits_overview_archiving_controls/plan.md:20-20; docs/epics/kits_feature_breakdown.md:138-159); expand the initial migration/model now.
- Absent snapshot fields on kit-shopping-list links prevents stale badge detection (docs/features/kits_overview_archiving_controls/plan.md:19-19; docs/epics/kits_feature_breakdown.md:120-122); define the required columns and maintenance strategy during planning.

### 8) Confidence
Medium — the issues are clear and fixable, but unanswered questions about schema scope and data loading leave some residual uncertainty until the plan is amended.
