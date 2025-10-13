# Code Review — Guidance for LLM (single-pass, adversarial)

**Purpose.** Perform a one-shot, thorough code review that *proves* readiness (or finds real risks) without relying on multi-iteration follow-ups. Write the results to:
`docs/features/<FEATURE>/code_review.md`.

**Inputs**
- The feature branch or repo snapshot under review.
- The related plan (`plan.md`) at the same revision (if available).
- Optional: a diff/PR. If present, be diff-aware and prioritize changed code. The user will have told you where the changes are (staged, unstaged or committed). If not, refuse to do the review before this is clarified.

**Ignore (out of scope)**
Minor cosmetic nits that a competent developer would auto-fix: exact message wording, trivial import shuffles, minor formatting, variable naming bikeshedding.

---

## What to produce (section layout for `code_review.md`)
Use these headings. Inside each, free-form prose is fine, but **quote evidence** with `path:line-range` and a short snippet.

### 1) Summary & Decision
- One paragraph on overall readiness.
- **Decision:** `GO` | `GO-WITH-CONDITIONS` | `NO-GO` (brief reason).

### 2) Conformance to Plan (with evidence)
- Show where the code implements the plan’s key behaviors (quote both code and plan).
- Call out any plan items that are unimplemented or implemented differently (justify).

### 3) Correctness — Findings (ranked)
For each issue, provide:
- **[ID] Severity — Title**  
  **Evidence:** `file:lines` + short snippet.  
  **Why it matters:** concrete user/system impact.  
  **Fix suggestion:** minimal viable change (be specific).  
  **Confidence:** High/Medium/Low.

> **No-bluff rule:** For every **Blocker** or **Major** claim, include either (a) a small, runnable test sketch, or (b) logic that demonstrates the failure from the quoted code. If you can’t, downgrade or move to *Questions*.

Severity:
- **Blocker** = violates product intent, corrupts or loses data, breaks core flow, or is untestable → typically `NO-GO`.
- **Major** = correctness risk, API/contract mismatch, or ambiguity that affects scope → often `GO-WITH-CONDITIONS`.
- **Minor** = non-blocking clarity/ergonomics.

### 4) Over-Engineering & Refactoring Opportunities
- Identify hotspots (files/functions) with unnecessary abstraction, dead code, or excessive breadth.
- Suggest the smallest refactor that reduces complexity (name the functions/files you’d split or simplify) and why it pays off (testability, clarity).

### 5) Style & Consistency
- Note only substantive inconsistencies that hinder maintenance (e.g., mixed state patterns, diverging error strategies).
- Point to representative examples; avoid exhaustive style audits.

### 6) Tests & Deterministic Coverage (new/changed behavior only)
For each user-visible behavior introduced/changed:
- **Scenario(s)**: “Given/When/Then …”
- **Test hooks**: stable selectors (`data-testid`) or test IDs, contract fixtures, route stubs.
- **Gaps**: call out missing cases (edge conditions, error paths, cancellation, retries).

If any new behavior lacks scenarios **or** stable hooks, mark **Major** and propose the minimal test additions.

### 7) **Adversarial Sweep (must attempt ≥3 credible failures or justify none)**
Actively try to break the code on likely fault lines. Prefer issues that would survive to runtime. Typical seams:
- **Derived state ↔ persistence**: counts/toggles from filtered views driving writes or cleanup.
- **Concurrency/async**: race windows, missing cancellation, stale closures (frontend), unsafely shared state (backend).
- **Input/contracts**: missing validation, versioned schema drift, unguarded null/undefined.
- **Error handling**: swallowed exceptions, partial writes without compensation, missing retries/backoff/timeouts.
- **Performance traps**: N+1 queries, O(n²) loops on hot paths, excessive re-renders (frontend).

Report each as in section 3 (ID, severity, evidence, fix, confidence).  
If none found, write a short proof of what you tried and why the code held up.

### 8) Invariants Checklist (table)
Document the critical invariants the code must maintain. Fill at least 3 rows or justify “none”.

| Invariant | Where enforced | How it could fail | Current protection | Evidence (file:lines) |
|---|---|---|---|---|
| Persistent prefs are not cleared by filtered views | ... | Using filtered count to decide cleanup | Guard X / global count Y | `path:lines` |

> If a row shows filtered/derived state driving a persistent write/cleanup without a guard, that’s at least **Major**.

### 9) Questions / Needs-Info
- Q1 — why it matters and what answer would change.
- Q2 — …

### 10) Risks & Mitigations (top 3)
- R1 — risk → mitigation (link to issues).

### 11) Confidence
High/Medium/Low with one-sentence rationale.

---

## Method (how to think)
1) **Assume wrong until proven**: try to falsify before you endorse.  
2) **Quote evidence**: every claim includes `file:lines`.  
3) **Be diff-aware**: if a PR/diff exists, focus on changed code first.  
4) **Prefer minimal fixes**: propose the smallest change that closes the risk.  
5) **Don’t self-certify**: never claim “fixed”; suggest a patch or tests instead.

---

## Optional front-end specifics (if React)
- Effect deps and cleanup (no stale closures, no leaking listeners).
- Stable keys for lists; avoid state derived from filtered views for persistence.
- Avoid unnecessary re-renders; memoization where needed; proper controlled inputs.
- Abort in-flight requests on navigation/unmount; handle race between responses.

## Optional back-end specifics
- Input validation at boundaries; errors → typed responses.
- Transactionality/idempotency for write paths; retry/backoff with bounded attempts.
- Indexing and N+1 checks on hot queries; timeouts/cancellation.
- Concurrency controls for shared resources; logging/metrics for observability.

---

## Stop condition
If **Blocker/Major** is empty and tests/coverage are adequate, recommend **GO**; otherwise **GO-WITH-CONDITIONS** or **NO-GO** with the minimal changes to reach **GO**.
