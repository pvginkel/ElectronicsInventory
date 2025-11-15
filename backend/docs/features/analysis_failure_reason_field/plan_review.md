# Plan Review: Add analysis_failure_reason Field (Re-review)

## 1) Summary & Decision

**Readiness**

The updated plan has successfully addressed all three major findings from the previous review. The validator now explicitly handles empty strings and whitespace (lines 232-233), the LLM prompt includes a structured decision tree with concrete examples (lines 128-155), and test coverage now explicitly includes all meaningful field combinations including duplicates + failure_reason (lines 294-301). The plan remains well-researched with comprehensive implementation guidance, proper layering through the conversion pipeline, and clear separation between LLM-level analysis failures and system-level errors.

**Decision**

`GO` — All previous blocking concerns have been resolved with concrete specifications. The plan is now implementation-ready with sufficient detail for deterministic testing and validator behavior.

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `CLAUDE.md` (Architecture) — Pass — `plan.md:69-94` — The plan correctly threads the new field through all layers (LLM model → Service conversion → API schema) without violating separation of concerns. Properly corrects the change brief's incorrect SQLAlchemy mention (lines 57-58).

- `CLAUDE.md` (Testing Requirements) — Pass — `plan.md:281-320` — Comprehensive test plan now covers all eight meaningful validator states (seven valid combinations plus all-null rejection), service conversion with all field combinations, task passthrough, and API serialization. All scenarios use Given/When/Then format with explicit test names.

- `CLAUDE.md` (Error Handling) — Pass — `plan.md:222-246` — Clear distinction maintained between LLM-level "cannot analyze" (populate `analysis_failure_reason`, task success=True) and system-level errors (populate `error_message`, task success=False). Aligns with fail-fast philosophy while enabling graceful LLM feedback.

- `docs/product_brief.md` (AI Helpers) — Pass — `plan.md:34-68` — Feature directly supports the AI helper workflows (photo intake, auto-tagging) described in product brief sections 9-10 by providing actionable feedback when queries lack sufficient information.

**Fit with codebase**

- `app/services/ai_model.py:48-58` — `plan.md:70-75` — Plan correctly identifies `PartAnalysisSuggestion` structure. Current code has two optional fields; adding a third follows the established pattern. The `extra="forbid"` config at line 55 means new field must be explicitly defined.

- `app/schemas/ai_part_analysis.py:156-176` — `plan.md:76-78, 232-233` — Validator currently enforces "at least one of {analysis_result, duplicate_parts}". Plan specifies updating to "at least one non-null AND non-empty from {analysis_result, duplicate_parts, analysis_failure_reason}" with explicit empty-string rejection (lines 232-233). This matches the validator pattern at lines 167-170 but adds stricter string validation.

- `app/services/ai_service.py:136-219` — `plan.md:79-82` — Conversion logic handles two optional fields currently. Adding a third requires simple string pass-through (no complex processing like document URLs or type matching). The conversion at line 136-219 can add one line: `analysis_failure_reason=llm_response.analysis_failure_reason`.

- `app/services/prompt.md:1-30` — `plan.md:122-157` — Plan adds structured section with decision tree and examples. Current prompt has clear duplicate detection section (lines 3-18) with explicit examples. New section integrates naturally after line 18, matching the existing example-driven style.

## 3) Open Questions & Ambiguities

None. All questions from the previous review have been resolved:

1. **Empty string handling** (previous Question 1) — Resolved at `plan.md:232-233` with explicit specification: "empty strings in `analysis_failure_reason` are treated as null (invalid) for validation purposes" and "validator must reject empty strings (`""`), whitespace-only strings."

2. **Generic parts vs. vague queries** (previous Question 2) — Resolved at `plan.md:128-148` with decision tree (line 128-131) and explicit examples showing both cases: "generic 10k resistor THT 1/4W" → proceed (line 146), "10k resistor" → failure_reason (line 135-136).

3. **Partial analysis + failure_reason usage** (previous Question 3) — Resolved at `plan.md:243-246` with explicit handling: "Allow this case (don't enforce mutual exclusivity); LLM can provide partial analysis plus guidance (e.g., 'Here's what I found, but please clarify X')." The use case is articulated in the validator test scenarios at lines 298-299.

## 4) Deterministic Backend Coverage (new/changed behavior only)

- Behavior: `AIService.analyze_part` converts LLM response with failure_reason to API schema
- Scenarios:
  - Given LLM returns `failure_reason` only, When service converts, Then API schema has `failure_reason` populated with nulls elsewhere (`tests/test_ai_service.py::test_convert_failure_reason_only`)
  - Given LLM returns `failure_reason` + `analysis_result`, When service converts, Then both fields in output (`tests/test_ai_service.py::test_convert_failure_and_analysis`)
  - Given LLM returns `failure_reason` + `duplicate_parts`, When service converts, Then both fields in output (new test: `tests/test_ai_service.py::test_convert_failure_and_duplicates`)
- Instrumentation: Log message when failure_reason detected (lines 250-255)
- Persistence hooks: None (ephemeral data)
- Gaps: None; all conversion paths now explicitly tested
- Evidence: `plan.md:283-289`

- Behavior: `AIPartAnalysisResultSchema` validator accepts failure_reason as standalone valid response
- Scenarios:
  - All seven valid combinations tested: failure_only, analysis_only, duplicates_only, failure+analysis, failure+duplicates, analysis+duplicates, all_three (`plan.md:294-301`)
  - Invalid cases tested: all_null (line 295), empty_string (line 296), whitespace_only (line 297)
- Instrumentation: None (pure validation)
- Persistence hooks: None
- Gaps: None; comprehensive coverage of validator state space (8 meaningful states)
- Evidence: `plan.md:291-301`

- Behavior: `AIPartAnalysisTask.execute_session` passes failure_reason through task result
- Scenarios:
  - Given AI service returns failure_reason, When task executes, Then result has success=True with failure_reason (`tests/test_ai_part_analysis_task.py::test_task_with_failure_reason`)
  - Given AI service raises exception, When task executes, Then success=False with error_message, no failure_reason
- Instrumentation: Existing task logging
- Persistence hooks: None
- Gaps: None; task is thin wrapper
- Evidence: `plan.md:302-312`

- Behavior: GET `/api/ai-parts/analyze/<task_id>/result` serializes failure_reason to JSON
- Scenarios:
  - Given completed task with failure_reason, When fetching result, Then JSON includes `"analysis_failure_reason": "..."` (`tests/test_ai_parts_api.py::test_result_with_failure_reason`)
  - Given completed task without failure_reason, When fetching result, Then `"analysis_failure_reason": null`
- Instrumentation: None (Pydantic auto-serialization)
- Persistence hooks: None
- Gaps: None
- Evidence: `plan.md:314-320`

## 5) Adversarial Sweep (must find ≥3 credible issues or declare why none exist)

**Checks attempted:**
1. Validator logic with empty strings, whitespace, null combinations
2. LLM prompt reliability and specificity (concrete examples vs. vague guidance)
3. Test coverage for three-field validator state space (2^3 = 8 combinations)
4. Transaction safety (no database writes involved, ephemeral data only)
5. Service conversion layer handling of all field combinations
6. Distinction between task-level errors (success=False) and LLM-level incomplete analysis (success=True + failure_reason)
7. S3 storage consistency (not applicable; no attachment operations)
8. Metrics integration (uses existing AI metrics, no new counters needed)

**Evidence:**
- Empty string handling: `plan.md:232-233` explicitly rejects empty strings and whitespace
- LLM prompt: `plan.md:128-155` provides decision tree with four concrete examples distinguishing vague from generic
- Test coverage: `plan.md:294-301` explicitly tests all seven valid states plus two invalid states
- No transactions: `plan.md:215-220` confirms no database writes, ephemeral in-memory processing
- Service conversion: `plan.md:283-289` covers all three field combinations
- Error distinction: `plan.md:209-212` maintains invariant separating task errors from LLM guidance

**Why the plan holds:**

The previous review identified three **Major** issues, all of which have been resolved:

1. **Empty string validation** — Now explicitly specified at lines 232-233 with validator requirement to reject empty strings and whitespace-only strings. Test coverage added at line 296-297.

2. **Prompt reliability** — Now includes structured decision tree (lines 128-131) with three explicit "populate failure_reason" examples (lines 135-142) and three "proceed with analysis" examples (lines 146-148), matching the specificity of existing duplicate detection guidance (prompt.md:3-18).

3. **Three-field test coverage** — Now explicitly covers duplicates + failure_reason combination at line 299, plus all other meaningful combinations (lines 294-301). Covers 7 valid states + 2 invalid states = comprehensive validator coverage.

Additional checks confirm no new risks:
- No database transactions means no corruption/orphaning risks
- No S3 operations means no storage consistency concerns
- Existing metrics infrastructure handles this as normal LLM request
- Task/error distinction preserved (no conflation of success=False with failure_reason)

The plan is adversarially sound because it operates entirely in the ephemeral layer (no persistence), adds a simple optional string field following established patterns, and has comprehensive test coverage including edge cases. The LLM prompt risk is mitigated with concrete examples matching the existing duplicate detection style.

## 6) Derived-Value & Persistence Invariants (stacked entries)

- Derived value: Analysis completeness signal (implicit)
  - Source dataset: Unfiltered presence/absence of `analysis_failure_reason` in `AIPartAnalysisResultSchema`
  - Write / cleanup triggered: None (ephemeral; used only for frontend display, then discarded)
  - Guards: Schema validator ensures at least one of {analysis_result, duplicate_parts, analysis_failure_reason} is non-null AND non-empty (lines 232-233); prevents entirely empty responses and empty-string failure reasons
  - Invariant: Response with non-null, non-empty `analysis_failure_reason` indicates LLM elected not to provide complete analysis; frontend must not attempt part creation from failure-only responses
  - Evidence: `plan.md:193-198`, `app/schemas/ai_part_analysis.py:156-176`

- Derived value: Task success vs. analysis completeness distinction
  - Source dataset: Unfiltered task execution result from `AIPartAnalysisTask.execute_session`
  - Write / cleanup triggered: Task result stored temporarily in `TaskService` in-memory state; cleaned up on task expiry (no database writes)
  - Guards: Exception handling in task layer separates system errors (populate `error_message`, `success=False`) from LLM-level incomplete analysis (populate `analysis_failure_reason`, `success=True`); lines 236-240 explicitly define this separation
  - Invariant: `success=False` means infrastructure failure (API timeout, network error); `success=True` with `analysis_failure_reason` means LLM completed successfully but couldn't provide useful analysis. These states must never be conflated (no response with both `success=False` AND `analysis_failure_reason`).
  - Evidence: `plan.md:209-212`, `app/services/ai_part_analysis_task.py:68-73, 118-121`

- Derived value: User guidance text quality
  - Source dataset: Raw unfiltered string from LLM's `analysis_failure_reason` field
  - Write / cleanup triggered: Ephemeral; displayed to user via API, then discarded when user retries
  - Guards: LLM prompt provides decision tree (lines 128-131) and phrasing guidance (lines 150-154) instructing on actionable messages; server-side validator rejects empty/whitespace strings (lines 232-233) but cannot validate semantic quality (hallucinations, relevance); lines 305-308 acknowledge this limitation
  - Invariant: When non-null, the failure reason must be human-readable and actionable (line 204). Enforcement relies on LLM prompt adherence for semantic quality; code-level guard only prevents empty strings. If LLM produces verbose, confusing, or irrelevant text despite prompt guidance, it propagates directly to user (accepted risk documented in Section 15, lines 305-308).
  - Evidence: `plan.md:200-205`, `app/services/prompt.md:1-84` (updated)

> No filtered views driving persistent writes/cleanup. All derived values are ephemeral (task results, user messages). No risk of orphaning database records or S3 objects.

## 7) Risks & Mitigations (top 3)

- Risk: LLM may still fail to reliably populate failure_reason despite improved prompt guidance
- Mitigation: Plan now includes decision tree (lines 128-131) and four concrete examples (lines 135-148) matching existing duplicate detection specificity; recommends testing with diverse vague queries during implementation (line 330); accepts iteration as necessary (lines 297-300)
- Evidence: `plan.md:328-331` (Risk 1), previous review Adversarial Finding 2 now resolved

- Risk: Failure reason text could contain LLM hallucinations or unhelpful content despite phrasing guidance
- Mitigation: Validator rejects empty/whitespace strings (lines 232-233); prompt emphasizes specific, concise guidance (lines 150-154); acknowledges human-in-loop for prompt refinement as necessary (line 338); accepted risk with documented mitigation strategy
- Evidence: `plan.md:334-339` (Risk 3)

- Risk: Frontend may not properly handle new field or fail to display guidance to users
- Mitigation: Backend contract clearly defined in API schema (lines 109-119); plan includes UX impact section (lines 247-253) specifying frontend must check for and render failure_reason; backend implementation is not blocked by frontend readiness
- Evidence: `plan.md:247-253` (Section 12)

## 8) Confidence

Confidence: High — All major findings from previous review have been resolved with concrete specifications. The plan provides explicit validator behavior including empty-string rejection, structured LLM prompt with decision tree and examples, and comprehensive test coverage for all meaningful field combinations. The change is narrowly scoped to ephemeral Pydantic models (no database migrations), follows established patterns for optional fields, and has deterministic test coverage. The main implementation uncertainty (LLM prompt effectiveness) is addressed with concrete examples matching existing duplicate detection style, and the plan acknowledges iteration may be needed.
