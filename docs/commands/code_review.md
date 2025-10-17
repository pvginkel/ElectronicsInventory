# Code Review — Backend Guidance for LLM (single-pass, adversarial)

**Purpose.** Perform a one-shot, thorough backend code review that *proves* readiness (or surfaces real risks) without relying on multi-iteration follow-ups. Write the results to:
`docs/features/<FEATURE>/code_review.md`.

**Inputs**
- The feature branch or repo snapshot under review.
- The related plan (`plan.md`) at the same revision (if available).
- The exact code changes (commit range or diff). Refuse to review if this information is missing.

**Ignore (out of scope)**
Minor cosmetic nits a competent developer would auto-fix: exact log wording, trivial import shuffles, minor formatting, variable naming bikeshedding.

---

## What to produce (section layout for `code_review.md`)
Use these headings. Inside each, free-form prose is fine, but **quote evidence** with `path:line-range` and a short snippet.

### 1) Summary & Decision
- One paragraph on overall readiness.
- **Decision:** `GO` | `GO-WITH-CONDITIONS` | `NO-GO` (brief reason).

### 2) Conformance to Plan (with evidence)
- Show where the code implements the plan’s key behaviors (quote both code and plan).
- Call out plan items that are unimplemented, implemented differently, or missing critical pieces (migrations, service wiring, test data updates).

### 3) Correctness — Findings (ranked)
For each issue, provide:
- **[ID] Severity — Title**  
  **Evidence:** `file:lines` + short snippet.  
  **Why it matters:** concrete user/system impact (data loss, transaction breakage, DI miswire, metrics regression).  
  **Fix suggestion:** minimal viable change (be specific).  
  **Confidence:** High/Medium/Low.

> **No-bluff rule:** For every **Blocker** or **Major**, include either (a) a runnable test sketch (pytest/service/API) or (b) step-by-step logic showing the failure (e.g., missing flush before S3 upload, `scalar_one_or_none()` returning `None`). Otherwise downgrade or move to *Questions*.

Severity:
- **Blocker** = violates product intent, corrupts or loses data, breaks migrations or DI wiring, untestable core flow → typically `NO-GO`.
- **Major** = correctness risk, API/contract mismatch, ambiguous behavior affecting scope, migration/test data drift → often `GO-WITH-CONDITIONS`.
- **Minor** = non-blocking clarity/ergonomics.

### 4) Over-Engineering & Refactoring Opportunities
- Flag hotspots with unnecessary abstraction, copy-paste logic, or services growing beyond single responsibility.
- Suggest the smallest refactor (split service method, share helper, collapse schema duplication) and why it pays off (testability, smaller diffs).

### 5) Style & Consistency
- Note only substantive inconsistencies that hinder maintenance (mixed transaction patterns, diverging error handling, metrics usage).
- Point to representative examples; avoid exhaustive style audits.

### 6) Tests & Deterministic Coverage (new/changed behavior only)
For each new or changed backend behavior (API route, service method, migration, CLI command, background task):
- **Scenario(s)**: “Given/When/Then …” tied to specific `pytest` tests.
- **Test hooks**: fixtures, dependency-injector providers, stable dataset references (`app/data/test_data/`), or helper utilities.
- **Gaps**: highlight missing cases (edge constraints, rollback paths, negative tests, metrics assertions, shutdown behavior).

If behavior lacks scenarios **or** stable hooks, mark **Major** and propose the minimal tests.

### 7) **Adversarial Sweep (must attempt ≥3 credible failures or justify none)**
Attack likely backend fault lines:
- Derived state ↔ persistence: filtered queries driving deletes, quantity recomputations, S3 cleanups.
- Transactions/session usage: missing `flush()`, partial commits, lack of rollback on exception.
- Dependency injection: providers not wired, services missing metrics/shutdown dependencies.
- Migrations/test data: schema drift, missing Alembic revision, dataset not updated.
- Observability: counters never incremented, timers using `time.time()`, missing shutdown hooks.

Report each issue in the Section 3 format (ID, severity, evidence, fix, confidence).  
If none found, write a short proof of what you tested and why the code held up.

### 8) Invariants Checklist (table)
Document critical invariants the code must maintain. Fill at least 3 rows or justify “none”.

| Invariant | Where enforced | How it could fail | Current protection | Evidence (file:lines) |
|---|---|---|---|---|
| Inventory quantity history remains consistent after updates | ... | Transaction commits without history row | Service ensures atomic insert | `path:lines` |

> If a row shows filtered/derived state driving a persistent write/cleanup without a guard, that’s at least **Major**.

### 9) Questions / Needs-Info
- Q1 — why it matters and what answer would change.
- Q2 — …

### 10) Risks & Mitigations (top 3)
- R1 — risk → mitigation (link to issues/findings).

### 11) Confidence
High/Medium/Low with one-sentence rationale.

---

## Method (how to think)
1) **Assume wrong until proven**: stress transactions, DI wiring, migrations, and test data updates.  
2) **Quote evidence**: every claim includes `file:lines` (and plan refs when applicable).  
3) **Be diff-aware**: focus on changed code first, but validate touchpoints (models, schemas, services, API, tests, metrics).  
4) **Prefer minimal fixes**: propose the smallest change that closes the risk (e.g., add `selectinload`, add negative test, wire provider).  
5) **Don’t self-certify**: never claim “fixed”; suggest patches or tests.

---

## Backend specifics to keep in mind
- Layering: API endpoints stay thin, services own business logic, models stay declarative.
- SQLAlchemy sessions: proper `flush`, transaction scope, rollback on error, avoid leaking sessions.
- Migrations & seed data: every schema change needs Alembic revision and updated `app/data/test_data/` where relevant.
- Metrics & shutdown: integrate with `MetricsService` and `ShutdownCoordinator` when background work/logging is added.
- Storage integrations: S3 operations after DB flush, cleanup best-effort on delete paths.
- Observability: typed exceptions, `handle_api_errors`, ruff/mypy compliance, deterministic tests.

---

## Stop condition
If **Blocker/Major** is empty and tests/coverage are adequate, recommend **GO**; otherwise **GO-WITH-CONDITIONS** or **NO-GO** with the minimal changes needed for **GO**.
