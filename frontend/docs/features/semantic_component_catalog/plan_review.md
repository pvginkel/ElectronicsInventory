# Plan Review — Semantic Component Catalog

## 1) Summary & Decision

**Readiness**

This plan proposes a research and cataloging effort to systematically identify high-level semantic UI component opportunities across the codebase. The plan is well-structured and aligns with the project's component extraction philosophy documented in `docs/ui_component_workflow.md`. The methodology is sound—searching for patterns, analyzing instances, documenting opportunities, and prioritizing by impact. However, the plan fundamentally misaligns with the project's architectural patterns because it is a **research-only deliverable** that produces static documentation without executable verification. The project's standards require Playwright coverage for all new/changed behavior, and while the plan correctly marks sections 9-13 as N/A, this creates a structural problem: the plan's deliverables (catalog.md and prioritized_backlog.md) cannot be verified for correctness through automated tests, and there is no mechanism to ensure the research findings are accurate or complete.

**Decision**

`GO-WITH-CONDITIONS` — The plan is conceptually sound but requires three critical additions before implementation: (1) define explicit verification criteria for catalog entries (how to validate that a pattern truly exists and is worth extracting), (2) add a "catalog validation" step that programmatically checks pattern counts and provides evidence, and (3) clarify the success criteria for what makes a catalog entry "complete and accurate" versus "needs more research."

---

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `docs/commands/plan_feature.md` — **Fail** — `plan.md:206-213` — Section 9 "Observability / Instrumentation" states "N/A - This is a planning and research deliverable with no instrumentation requirements." The plan template requires instrumentation for testability, but research documents have no runtime behavior to instrument. This is a template mismatch rather than a plan defect, but it signals that research plans may need a different template or explicit exemption criteria.

- `docs/ui_component_workflow.md` — **Pass** — `plan.md:1-22` — The research log (lines 5-27) demonstrates thorough pattern discovery and correctly identifies the preference for "higher-level abstractions" (line 21) over "low-level components" (line 20), which aligns with the workflow's Principle 2: "Prefer High-Level Abstractions" (`docs/ui_component_workflow.md:12`).

- `docs/ui_component_workflow.md` — **Pass** — `plan.md:57-62` — The assumptions section (lines 57-62) correctly states "Higher-level abstractions are preferred over many small composable pieces" and "Good abstractions have clear semantic names that describe what they are, not how they're styled," which directly quotes the workflow document's semantic meaning principle (`docs/ui_component_workflow.md:11`).

- `docs/product_brief.md` — **Pass** — `plan.md:1-313` — The plan does not introduce user-facing changes and therefore does not conflict with the product brief. The deliverable is internal developer documentation.

- `docs/contribute/architecture/application_overview.md` — **Pass** — `plan.md:68-87` — The affected areas correctly reference the domain-driven component structure (`src/components/sellers/`, `src/components/types/`, etc.) documented in the architecture overview (`docs/contribute/architecture/application_overview.md:17`).

**Fit with codebase**

- **Component structure** — `plan.md:68-86` — The plan correctly identifies card patterns across domain directories (sellers, types, boxes, kits, parts, shopping-lists), which matches the observed structure in the glob results (8 *-card.tsx files across different domains). The catalog will document opportunities to extract a semantic `GridTileCard` component, which aligns with the user's stated intent to create abstractions like "grid tile card with actions" rather than composing many small pieces.

- **Existing abstractions** — `plan.md:23-26` — The plan references "existing dialog and list view abstractions" as successful examples. The Dialog component (`src/components/ui/dialog.tsx`) demonstrates a working high-level abstraction that provides `ConfirmDialog` (lines 181-235) as a complete semantic concept. This validates the approach, but the plan should explicitly analyze these abstractions to extract reusable patterns for the catalog's API design recommendations.

- **ActionButtonGroup concern** — `plan.md:10` — The research log mentions "ActionButtonGroup and other small components to understand granularity concerns." This is a direct response to user feedback about low-level components creating overhead. The plan correctly interprets this as a signal to focus on higher-level patterns. However, the catalog should explicitly document why certain existing components (like ActionButtonGroup) fail the semantic meaning test, as this would clarify the inclusion criteria.

---

## 3) Open Questions & Ambiguities

- **Question:** How should the catalog handle edge cases where patterns *look* similar but have subtle domain-specific differences that prevent true abstraction?
- **Why it matters:** The plan acknowledges this risk (`plan.md:187-190`: "Pattern appears semantically similar but has subtle domain-specific differences") but provides only a vague mitigation ("Document variations in implementationNotes; mark as 'needs design decision'"). Without clear decision criteria, the catalog may include false positives—patterns that seem extractable but will fail during implementation.
- **Needed answer:** Define explicit decision rules. For example: "If >30% of instances require domain-specific props, the pattern is NOT a candidate." Or: "Document at least 2 'excluded instances' per pattern to prove the abstraction boundaries are clear." This would make the catalog actionable rather than speculative.

- **Question:** What programmatic verification will confirm that instance counts and pattern descriptions are accurate?
- **Why it matters:** The plan relies on manual file reading and pattern analysis (`plan.md:131-142`), which is error-prone. Without verification, the catalog may contain outdated counts (files added/removed after research), incorrect pattern descriptions (researcher misunderstood the code), or missed opportunities (search strategy was too narrow).
- **Needed answer:** Add a verification step to Slice 5 (Prioritization) that runs automated checks. For example: (1) Use glob/grep to count files matching each pattern and compare to documented instanceCount. (2) Generate a "pattern fingerprint" (e.g., common JSX structure) and search for it codebase-wide to catch patterns with non-standard file names. (3) Include these verification commands in the catalog as "recheck commands" so future readers can validate freshness.

- **Question:** Should the catalog include quantitative metrics (lines of code that could be eliminated, estimated refactoring time) beyond the qualitative complexity assessment?
- **Why it matters:** The plan proposes complexity assessment (`plan.md:166-171`: "High = 50+ lines of boilerplate") but this is subjective. Quantitative metrics would strengthen prioritization and help stakeholders evaluate ROI. The open question acknowledges this (`plan.md:298-300`) but defers the decision ("add if time permits").
- **Needed answer:** Either commit to quantitative metrics and allocate time for LOC analysis (add a slice for this), or explicitly exclude them and document why (e.g., "manual LOC counting is too time-consuming; complexity bands are sufficient for prioritization"). The current "maybe" stance makes the deliverable's scope ambiguous.

---

## 4) Deterministic Playwright Coverage (new/changed behavior only)

**No new/changed user-visible behavior** — This plan produces static Markdown documentation (`catalog.md`, `prioritized_backlog.md`) with no UI, API interactions, or runtime behavior. Therefore, deterministic Playwright coverage is not applicable.

**Gaps:** The lack of automated verification is a **Major** gap, not because the plan needs Playwright tests, but because the catalog's correctness cannot be independently validated. A research document that claims "10 card components exist" must provide evidence that can be re-checked. The current plan structure does not include this.

**Recommendation:** Add a `catalog_verification.md` document (or section in the catalog itself) that lists:
- Glob/grep commands to regenerate instance counts
- File path evidence for each pattern (not just counts, but actual file lists)
- A "last verified" timestamp so future readers know if the catalog is stale

This would provide the "deterministic" aspect that Playwright would normally provide for UI features.

---

## 5) Adversarial Sweep (must find ≥3 credible issues or declare why none exist)

**Major — Instance count drift: No mechanism to detect when catalog becomes outdated**

**Evidence:** `plan.md:131-142` (Pattern Discovery Flow) + `plan.md:187-202` (Error handling) — The plan describes a manual search and analysis process: "Search codebase for files matching pattern categories (cards, dialogs, forms, lists, detail screens)" → "Count total instances of the pattern." However, there is no follow-up mechanism to detect when new files are added or existing files are refactored, which would invalidate the catalog.

**Why it matters:** A catalog that becomes stale within weeks of creation provides no value. Developers will discover the catalog, read "10 card components identified," start planning an extraction, and then find 15 card components (or 7, after some were already refactored). This erodes trust in documentation and wastes time. The plan's confidence statement (`plan.md:312`: "Confidence: High — The research methodology is straightforward") underestimates this risk.

**Fix suggestion:** Add two explicit deliverables:
1. In `catalog.md`, include a "Verification Commands" section for each entry with glob/grep commands that regenerate the instance list. Example:
   ```bash
   # Card patterns - last verified 2025-11-02
   find src/components -name '*-card.tsx' | wc -l
   # Expected: 10 files
   ```
2. In Slice 5 (Prioritization), add a step: "Run all verification commands and flag discrepancies. If counts differ by >20%, re-research that pattern before finalizing priority scores."

**Confidence:** High — This is a standard problem with static documentation. The fix is low-effort (scripting basic file counts) and high-value (prevents catalog rot).

---

**Major — Semantic meaning criteria are under-specified, risking false positives**

**Evidence:** `plan.md:57-62` (Assumptions) + `plan.md:103-119` (Component Opportunity Entry shape) — The plan states "Good abstractions have clear semantic names that describe what they are, not how they're styled" and proposes a `semanticMeaning` field, but provides no rubric for evaluating semantic clarity. The plan also lacks a negative test: "What patterns did we explicitly reject and why?"

**Why it matters:** Without clear inclusion/exclusion criteria, the catalog may recommend components that fail the semantic test. For example, the user criticized `ActionButtonGroup` as too simple (`plan.md:10`), but what makes a component "too simple"? Is `QuantityBadge` (seen in `kit-card.tsx:75`) semantic enough? Is `MembershipIndicator` (also in `kit-card.tsx`) extractable or too domain-specific? The plan will produce catalog entries but won't give implementers confidence that those entries are worth pursuing.

**Fix suggestion:** Add a "Pattern Rejection Log" as a subsection of the research log. For each pattern category (Card, Dialog, Form, List, Detail Screen), document at least 2-3 patterns that were considered but rejected, with explicit reasons. Examples:
- **Rejected: FlexRow** — "Describes layout (how), not meaning (what). Violates semantic principle."
- **Rejected: QuantityBadge** — "Only 3 instances found, all in parts/kits domains. Too domain-specific to be in `components/ui/`."
- **Rejected: ActionButtonGroup** — "User feedback: creates composition overhead without semantic value. Too low-level."

This provides a decision trail and helps future catalog users understand the boundaries.

**Confidence:** High — The plan already acknowledges the semantic meaning principle but doesn't operationalize it. Adding a rejection log is a standard research practice (documents negative findings to avoid revisiting the same questions).

---

**Major — Proposed API sketches lack validation against actual component usage patterns**

**Evidence:** `plan.md:111-112` (proposedAPI field in catalog entry) + `plan.md:136` (Step 6 of Pattern Discovery Flow: "Sketch proposed component API") — The plan treats API design as a single-step sketching exercise without validation. However, examining `type-card.tsx` (simple card with onEdit/onDelete callbacks) versus `kit-card.tsx` (complex card with membership indicators, status badges, navigation handling, keyboard support) reveals that cards have vastly different API surfaces. A "sketch" API that doesn't account for this variability will mislead implementers.

**Why it matters:** If the catalog proposes a `GridTileCard` API with `{ title, content, actions }` props, but 40% of card instances need custom header layouts or badge positioning, the proposed abstraction will fail during implementation. Developers will either abandon the component (wasting the catalog work) or force-fit it with escape hatches (creating a worse abstraction than not extracting at all). The plan's risk section acknowledges this (`plan.md:288-291`: "Proposed APIs may not match actual implementation needs") but the mitigation ("Keep APIs at sketch level; emphasize semantic concept") is too vague—it doesn't define what "sketch level" means or how much API validation is required.

**Fix suggestion:** Revise the Pattern Discovery Flow (Step 6) to require API validation:
- For each catalog entry, read at least 3 representative instances (ideally: 1 simple, 1 average, 1 complex).
- Extract the actual props each instance needs (from component interfaces and JSX usage).
- Document the "API span": which props are common (>80% of instances), optional (20-80%), and outlier (<20%).
- Propose an API that covers common + optional props, and explicitly document outliers as "not supported—use domain-specific wrapper."

Add this to the catalog entry structure:
```typescript
{
  // ... existing fields
  propsAnalysis: {
    common: string[];        // Props needed by >80% of instances
    optional: string[];      // Props needed by 20-80% of instances
    outliers: string[];      // Props needed by <20% (may need wrappers)
  }
}
```

This makes the API design evidence-based rather than speculative.

**Confidence:** High — The evidence is clear from comparing `type-card.tsx` (19 lines, minimal props) to `kit-card.tsx` (281 lines, 10+ props). A generic API that tries to unify these will either fail or become too complex. The fix ensures the catalog acknowledges this complexity upfront.

---

**Minor — Prioritization formula is simplistic and may not reflect actual developer value**

**Evidence:** `plan.md:148-150` (Prioritization Flow: "impact score: instanceCount × complexityWeight") — The formula treats all instances as equally valuable (10 simple instances = same priority as 10 complex instances, given same complexity band). However, the *location* of instances matters. Refactoring 10 cards in rarely-touched features provides less value than refactoring 3 cards in frequently-changed features.

**Why it matters:** Prioritization should account for developer velocity impact, not just instance count. A component used in 15 places but never modified has lower ROI than a component used in 5 places but touched weekly. The catalog's backlog may recommend extracting low-value patterns first, delaying high-value work.

**Fix suggestion:** Add a "changeFrequency" factor to the prioritization formula. For each pattern, count git commits touching those files in the last 3 months:
```bash
git log --since="3 months ago" --oneline -- src/components/types/type-card.tsx | wc -l
```
Normalize this to a 0-1 scale and include in the priority score:
```
priority = instanceCount × complexityWeight × (1 + changeFrequency)
```

Document this in the catalog so users understand why certain patterns rank higher despite fewer instances.

**Confidence:** Medium — This adds complexity to the research process (git log analysis) and may not be worth the effort if the catalog is for one-time consumption. However, if the backlog will guide multi-month refactoring work, change frequency is a strong signal. The plan should explicitly decide whether to include this or document why it's excluded.

---

## 6) Derived-Value & State Invariants (table)

**None applicable; proof provided below.**

This plan produces static documentation with no runtime state, derived values, or persistent writes. The catalog entries are computed once during research and written to Markdown files. There is no:
- Filtered dataset driving cache updates (no React Query, no API calls)
- Derived UI state triggering navigation or form resets (no interactive UI)
- Cross-route state or cleanup logic (no routes affected)

The "priority score" is a derived value (`plan.md:159-164`) but it is:
- **Source dataset:** Unfiltered (all catalog entries are included in prioritization)
- **Write/cleanup:** Static write to `prioritized_backlog.md`, no runtime persistence
- **Guards:** complexityReduction validation (must be Low/Medium/High)
- **Invariant:** Priority score formula is deterministic: `instanceCount × complexityWeight`

This does not meet the "filtered view driving persistent write" criterion that would require Major flagging, as the prioritization is a one-time static calculation with no risk of stale state or orphaned cache entries.

---

## 7) Risks & Mitigations (top 3)

- **Risk:** Catalog becomes outdated as codebase evolves (new components added, existing ones refactored), making it unreliable within weeks of creation.
- **Mitigation:** Add verification commands to each catalog entry (glob/grep to regenerate instance counts) and include a "last verified" timestamp. Add a verification step to Slice 5 that re-runs these commands and flags discrepancies before finalizing priorities.
- **Evidence:** `plan.md:131-142` (Pattern Discovery Flow relies on manual search with no refresh mechanism)

- **Risk:** Proposed APIs are too speculative and fail during actual implementation, wasting the effort spent cataloging those patterns.
- **Mitigation:** Require API validation in the Pattern Discovery Flow: analyze at least 3 instances per pattern (1 simple, 1 average, 1 complex), extract actual props needed, and document the "API span" (common/optional/outlier props). Mark patterns with high API variance as "needs design spike before extraction."
- **Evidence:** `plan.md:288-291` (Plan acknowledges risk but mitigation is vague: "Keep APIs at sketch level")

- **Risk:** Semantic meaning criteria are under-specified, leading to false positives (patterns that look extractable but shouldn't be) and false negatives (valuable patterns missed because search was too narrow).
- **Mitigation:** Add a "Pattern Rejection Log" documenting 2-3 explicitly rejected patterns per category with reasons. This clarifies the inclusion boundaries and prevents re-debating the same questions. Also supplement file-name search with structural code search (grep for JSX patterns like `<Card variant="grid-tile">`) to catch patterns with non-standard naming.
- **Evidence:** `plan.md:198-202` (Plan mentions "Miss legitimate opportunities by focusing only on file-name patterns" but mitigation is incomplete)

---

## 8) Confidence

**Confidence: Medium** — The research methodology is sound (systematic search, multi-strategy verification, prioritization framework), but the plan lacks mechanisms to ensure the catalog remains accurate and actionable. Three critical gaps lower confidence: (1) no verification commands to detect when catalog becomes stale, (2) no API validation to ensure proposed abstractions are implementable, (3) semantic meaning criteria are under-specified, risking false positives. Addressing the Major findings would raise confidence to High, as the core approach (catalog opportunities, prioritize by impact) aligns well with the project's component extraction philosophy.
