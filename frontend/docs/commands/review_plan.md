# Plan Review — Guidance for LLM (single-pass, adversarial)

**Purpose.** Perform a one-shot, thorough plan review that surfaces real risks without relying on follow-up prompts. Write the results to:
`docs/features/<FEATURE>/plan_review.md`.

**References (normative).**

* `@docs/commands/plan_feature.md`
* `@docs/product_brief.md`
* `@AGENTS.md`
* (optional) other docs the user links

**Ignore**: minor implementation nits (imports, exact message text, small style, variable names). Assume a competent developer will handle those.

---

## What to produce (write to `plan_review.md`)

Use these headings (free-form prose inside each, but **quote evidence** with file + line ranges).

### 1) Summary & Decision

* One paragraph on readiness.
* **Decision:** `GO` | `GO-WITH-CONDITIONS` | `NO-GO` (brief reason).

### 2) Conformance & Fit (with evidence)

* **Conformance to refs**: pass/fail with 1–3 quoted snippets per ref.
* **Fit with codebase**: name concrete APIs/modules; quote plan lines that assume them.

### 3) Open Questions & Ambiguities

* Bullet list; each item includes: why it matters + what answer would change.

### 4) Deterministic Playwright Coverage (new/changed behavior only)

For each user-visible behavior:

* **Scenarios** (Given/When/Then)
* **Instrumentation** (stable `data-testid` to target)
* **Backend hooks** (routes/fixtures/contracts)

> If any new behavior lacks one of the three, mark **Major** and reference the missing piece.

### 5) **Adversarial Sweep (must find ≥3 credible issues or declare why none exist)**

Deliberately try to break the plan. Prefer issues that would survive to runtime.
For each issue, provide:

* **[ID] Severity — Title**
  **Evidence:** file:lines quotes (plan + relevant ref).
  **Why it matters:** concrete user/system impact.
  **Fix suggestion:** minimal change to `plan.md`.
  **Confidence:** High/Medium/Low.

> If you claim “no credible issues,” write a short proof: which invariants you checked and the evidence that each holds.

### 6) **Derived-Value & Persistence Invariants (table)**

List every derived variable that influences **storage, cleanup, or cross-view state**. At least 3 rows or “none; proof”.

| Derived value | Source dataset (filtered/unfiltered) | Write/cleanup it triggers | Guard conditions | Invariant that must hold | Evidence (file:lines) |
| ------------- | ------------------------------------ | ------------------------- | ---------------- | ------------------------ | --------------------- |

*(Example rows: counts that gate clearing preferences; flags that flip storage keys; memoized lists used to compute persistence decisions.)*

> If any row uses a **filtered** view to drive a **persistent** write/cleanup, flag **Major** unless justified.

### 7) Risks & Mitigations (top 3)

Short bullets linking to the above evidence.

### 8) Confidence

High/Medium/Low + one sentence why.

---

## Severity (keep it simple)

* **Blocker:** Misalignment with product brief or untestable/undefined core behavior → tends to `NO-GO`.
* **Major:** Fit-with-codebase risks or ambiguous requirements affecting scope → often `GO-WITH-CONDITIONS`.
* **Minor:** Clarifications that don’t block implementation.

---

## Review method (how to think)

1. **Assume wrong until proven**: try to falsify the plan first, then support it.
2. **Quote evidence**: every claim or closure needs file:line quotes.
3. **Focus on invariants**: filtering, sorting, pagination, and toggles must not accidentally mutate or clear persisted state.
4. **Coverage is explicit**: if a behavior is new/changed, it must have scenarios + selectors + backend hooks.
