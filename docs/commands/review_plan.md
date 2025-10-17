# Plan Review — Guidance for LLM (single-pass, adversarial)

**Purpose.** Perform a one-shot, thorough plan review that surfaces real risks without relying on follow-up prompts. Write the results to:
`docs/features/<FEATURE>/plan_review.md`.

**References (normative).**

* `@docs/commands/plan_feature.md`
* `@docs/product_brief.md`
* `@AGENTS.md`
* Electronics Inventory Backend Development Guidelines (this doc set)
* (optional) other docs the user links

**Ignore**: minor implementation nits (imports, exact message text, small style, variable names). Assume a competent developer will handle those.

---

## What to produce (write to `plan_review.md`)

Use these headings (free-form prose inside each, but **quote evidence** with file + line ranges).

### 1) Summary & Decision

* One paragraph on readiness.
* **Decision:** `GO` | `GO-WITH-CONDITIONS` | `NO-GO` (brief reason).

### 2) Conformance & Fit (with evidence)

* **Conformance to refs**: pass/fail with 1–3 quoted snippets per ref (product brief scope, feature planning checklist, agent responsibilities, backend layering rules).
* **Fit with codebase**: name concrete modules/services/models/migrations; quote plan lines that assume them (e.g., `PartService`, service container wiring, Alembic revisions, metrics integration).

### 3) Open Questions & Ambiguities

* Bullet list; each item includes: why it matters + what answer would change (e.g., schema shape, transaction boundaries, shutdown behavior, metrics cardinality).

### 4) Deterministic Backend Coverage (new/changed behavior only)

For each new or changed user-visible backend behavior (API route, service operation, CLI command, background task):

* **Scenarios** (Given/When/Then) – point to `pytest` suites covering API/service/migration paths.
* **Instrumentation** – metrics/logging/alerts that prove observability (e.g., `MetricsService`, structured logs).
* **Persistence hooks** – migrations, seed data updates, S3/storage flows, shutdown coordination, dependency-injector wiring.

> If any behavior lacks one of the three, mark **Major** and reference the missing piece.

### 5) **Adversarial Sweep (must find ≥3 credible issues or declare why none exist)**

Deliberately try to break the plan. Prefer issues that would survive to runtime (schema drift, transaction misuse, DI misconfig, metrics regressions).
For each issue, provide:

* **[ID] Severity — Title**
  **Evidence:** file:lines quotes (plan + relevant ref).
  **Why it matters:** concrete user/system impact.
  **Fix suggestion:** minimal change to `plan.md`.
  **Confidence:** High/Medium/Low.

> If you claim “no credible issues,” write a short proof: which invariants you checked and the evidence that each holds.

### 6) **Derived-Value & Persistence Invariants (table)**

List every derived variable that influences **storage, cleanup, or cross-context state** (database rows, S3 artifacts, cached metrics, shutdown waiters). At least 3 rows or “none; proof”.

| Derived value | Source dataset (filtered/unfiltered) | Write/cleanup it triggers | Guard conditions | Invariant that must hold | Evidence (file:lines) |
| ------------- | ------------------------------------ | ------------------------- | ---------------- | ------------------------ | --------------------- |

*(Example rows: computed inventory counts driving deletes, filtered selections used for quantity history rewrites, metrics snapshots that purge data.)*

> If any row uses a **filtered** view to drive a **persistent** write/cleanup, flag **Major** unless justified.

### 7) Risks & Mitigations (top 3)

Short bullets linking to the above evidence (e.g., migration ordering risks, race conditions, metrics blow-up).

### 8) Confidence

High/Medium/Low + one sentence why (experience with similar changes, coverage gaps, etc.).

---

## Severity (keep it simple)

* **Blocker:** Misalignment with product brief, schema/test data drift, or untestable/undefined core behavior → tends to `NO-GO`.
* **Major:** Fit-with-codebase risks, missing coverage/migration/test data updates, ambiguous requirements affecting scope → often `GO-WITH-CONDITIONS`.
* **Minor:** Clarifications that don’t block implementation.

---

## Review method (how to think)

1. **Assume wrong until proven**: hunt for violations of layering (API vs. service), transaction safety, test coverage, data lifecycle, metrics, shutdown coordination.
2. **Quote evidence**: every claim or closure needs file:line quotes from the plan (and refs). Flag when refs contradict plan assumptions.
3. **Focus on invariants**: ensure filtering, batching, or async work doesn’t corrupt inventory state, leave hanging migrations, or orphan S3 blobs/test data.
4. **Coverage is explicit**: if behavior is new/changed, require pytest scenarios, metrics instrumentation, and persistence hooks; reject “we’ll test later”.
