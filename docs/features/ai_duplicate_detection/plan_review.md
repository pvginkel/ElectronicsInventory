# AI Duplicate Detection - Plan Review

## 1) Summary & Decision

**Readiness**

The plan is detailed and demonstrates solid research into the codebase, with clear understanding of the LLM function calling infrastructure and AI analysis flow. The technical approach of using LLM chaining for duplicate detection is sound, and the response schema restructuring is properly thought through. However, there are several critical gaps around schema validation enforcement, error handling consistency, test data requirements, and metrics integration that must be addressed before implementation. The plan also lacks clarity on prompt engineering approach and has ambiguities around the mutually exclusive field validation logic.

**Decision**

`GO-WITH-CONDITIONS` — Core architecture is sound but requires addressing schema validation enforcement, test coverage gaps, metrics integration details, and prompt engineering clarity before implementation can proceed safely.

---

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `@docs/product_brief.md` — Pass — `plan.md:55-77` — Plan correctly scopes duplicate detection to "AI Part Analysis flow" only, not manual part creation, which aligns with product brief's AI helper goal of "auto-tag, pull in documentation, and prefill details"

- `@CLAUDE.md` layering — Pass — `plan.md:110-161` — File map properly separates API layer (`ai_parts.py`), service layer (`ai_service.py`, `duplicate_search_service.py`), and schemas (`duplicate_search.py`, `ai_part_analysis.py`)

- `@CLAUDE.md` testing requirements — Fail — `plan.md:470-538` — Test plan lacks explicit coverage for test data updates. Plan states "tests create their own duplicate-prone parts as needed" (line 482) but doesn't address whether `app/data/test_data/` JSON files need updating, violating "Test Data Management" requirement that schema changes must update fixed test dataset

- `@CLAUDE.md` metrics infrastructure — Partial — `plan.md:409-445` — Metrics are defined but plan doesn't specify integration with `MetricsService` via dependency injection, and several metrics (e.g., `ai_duplicate_search_parts_dump_size`) are defined as Gauge but should be recorded per-request as part of duration tracking

- `@CLAUDE.md` error handling — Pass — `plan.md:369-406` — Plan follows "fail fast" philosophy with proper exception types and `handle_api_errors` integration

**Fit with codebase**

- `AIService` / `ai_service.py:58-177` — `plan.md:110-112` — Plan assumes function tools array modification at line 112 but doesn't specify how to handle existing `url_classifier_function` alongside new `DuplicateSearchFunction`. Need clarity on function array composition.

- `AIPartAnalysisResultSchema` breaking change — `plan.md:216-242` — Plan proposes restructuring schema with mutually exclusive fields but doesn't address frontend compatibility. Since plan states "UI changes out of scope" (line 91), this creates deployment coordination risk. Need migration strategy or versioning approach.

- `PartService` query patterns — `plan.md:130-133` — Plan proposes `get_all_parts_for_search()` method but existing `get_parts_list()` at `part_service.py:103-112` uses pagination. Unfiltered full dump breaks existing pagination pattern and could cause OOM for large inventories despite hobby use case assumption.

- `BaseService` session management — `plan.md:358-366` — Plan states "read-only transaction" but doesn't specify session lifecycle. `DuplicateSearchService` needs database access but isn't clear if it inherits from `BaseService` or uses singleton pattern with manual session management.

---

## 3) Open Questions & Ambiguities

- Question: How is the mutually exclusive field constraint enforced in `AIPartAnalysisResultSchema`?
- Why it matters: Plan states "exactly one field must be non-null" (plan.md:241, 343) but Pydantic doesn't natively enforce mutually exclusive optional fields. Validation logic location (schema-level validator, service-level check, or prompt guidance only) affects error handling and test scenarios.
- Needed answer: Specify whether this uses Pydantic `@model_validator`, explicit check in `AIService.analyze_part()`, or relies purely on LLM compliance with no enforcement.

- Question: What happens if the LLM returns `duplicate_parts` with confidence levels other than "high" or "medium" (e.g., empty array, or includes "low")?
- Why it matters: Plan states LLM is instructed to filter out low confidence (plan.md:256, 320) but doesn't specify backend validation. If LLM returns low confidence matches despite instructions, does backend accept or reject the response?
- Needed answer: Clarify validation rules for `duplicate_parts` array content and confidence enum enforcement beyond Pydantic schema.

- Question: Is `DuplicateSearchService` a factory (inherits `BaseService`) or singleton, and how does it access the database session?
- Why it matters: Service needs to call `PartService.get_all_parts_for_search()` which requires database access. DI wiring (plan.md:145-149) and transaction scope (plan.md:358-366) depend on service lifecycle.
- Needed answer: Specify service type (factory vs singleton), constructor parameters, and session management pattern.

- Question: Does the prompt template at `app/services/prompt.md` need modification or is this a new prompt file?
- Why it matters: Plan references "existing prompt template with Jinja2 structure" (plan.md:115-116) but also creates new `app/services/prompts/duplicate_search.md` (plan.md:159-160). Unclear if main prompt is modified or if duplicate search uses entirely separate prompt.
- Needed answer: Clarify prompt file structure - is `app/services/prompt.md` updated or do both prompts coexist independently?

- Question: What is the scaling limit for parts dump, and how is it monitored?
- Why it matters: Plan states "~500-1000 parts safe" (plan.md:99, 604) but doesn't specify token calculation method or monitoring threshold. Risk of silent truncation if limit exceeded.
- Needed answer: Define concrete token limit, calculation method (tokens per part × count), and alert threshold for `ai_duplicate_search_parts_dump_size` metric.

- Question: Does the frontend API contract change require coordination or versioning?
- Why it matters: Schema restructuring (plan.md:216-242) changes `AIPartAnalysisTaskResultSchema.analysis` field structure from flat object to wrapper with `analysis_result` or `duplicate_parts`. Frontend must handle both paths but plan states UI changes are out of scope.
- Needed answer: Specify deployment strategy (lock-step deployment, feature flag, or schema versioning) to avoid frontend breakage.

---

## 4) Deterministic Backend Coverage (new/changed behavior only)

- Behavior: `DuplicateSearchService.search_duplicates()`
- Scenarios:
  - Given 3 parts with exact MPN match, When searching with MPN, Then return 1 high-confidence match (`tests/test_duplicate_search_service.py::test_exact_mpn_match`)
  - Given empty inventory, When searching, Then return empty matches array (`tests/test_duplicate_search_service.py::test_empty_inventory`)
  - Given LLM returns malformed JSON, When parsing, Then return empty matches with logged error (`tests/test_duplicate_search_service.py::test_malformed_llm_response`)
  - Given 5 similar parts (same type, different MPN), When searching generic description, Then return multiple medium-confidence matches (`tests/test_duplicate_search_service.py::test_generic_search_multiple_matches`)
  - **MISSING**: Given part with null technical fields, When building parts dump, Then handle nulls gracefully without JSON serialization errors
- Instrumentation: `ai_duplicate_search_requests_total` counter, `ai_duplicate_search_duration_seconds` histogram, structured log on completion
- Persistence hooks: No database writes; read-only operation
- Gaps: Test coverage doesn't explicitly validate null handling in parts dump serialization. Metrics integration with `MetricsService` not specified (how are counters/histograms created and wired?).
- Evidence: `plan.md:472-485` defines service tests; `plan.md:409-445` defines metrics

- Behavior: `PartService.get_all_parts_for_search()`
- Scenarios:
  - Given 5 parts in database, When called, Then return all 5 with search fields populated (`tests/test_part_service.py::test_get_all_parts_for_search_basic`)
  - Given part with null optional fields, When serializing, Then return dict with null values (`tests/test_part_service.py::test_get_all_parts_for_search_null_fields`)
  - Given part with no type relationship, When serializing, Then type_name is None (`tests/test_part_service.py::test_get_all_parts_for_search_no_type`)
  - **MISSING**: Given 0 parts in database, When called, Then return empty list
  - **MISSING**: Given part with tags as None vs empty array, When serializing, Then both serialize correctly
- Instrumentation: None specified (read-only query)
- Persistence hooks: No writes; uses existing database session
- Gaps: Edge cases for empty inventory and tags field (which is nullable ARRAY type) not covered in test scenarios. No explicit test for relationship loading (type relationship must be loaded for type_name).
- Evidence: `plan.md:513-523` defines service tests

- Behavior: `AIService.analyze_part()` with mutually exclusive response fields
- Scenarios:
  - Given LLM returns `duplicate_parts` populated and `analysis_result` null, When validating, Then accept (`tests/test_ai_service.py::test_duplicate_response_valid`)
  - Given LLM returns `analysis_result` populated and `duplicate_parts` null, When validating, Then accept (`tests/test_ai_service.py::test_analysis_response_valid`)
  - Given LLM returns both fields populated, When validating, Then raise validation error (`tests/test_ai_service.py::test_both_fields_populated_invalid`)
  - Given LLM returns both fields null, When validating, Then raise validation error (`tests/test_ai_service.py::test_both_fields_null_invalid`)
  - Given LLM doesn't call duplicate search function, When analysis completes, Then result has `analysis_result` populated, `duplicate_parts` null (`tests/test_ai_service.py::test_no_duplicate_search_called`)
  - **MISSING**: Given LLM returns `duplicate_parts` with empty array, When validating, Then clarify if this is valid or invalid (empty array vs null semantic difference)
- Instrumentation: Existing AI service metrics plus new duplicate search metrics
- Persistence hooks: No schema changes; logic changes only
- Gaps: Validation enforcement mechanism not specified. Plan states validation happens but doesn't show implementation approach (Pydantic validator, explicit service check, or prompt-only guidance). Empty array vs null distinction not addressed.
- Evidence: `plan.md:498-511` defines AI service tests

- Behavior: `AIPartAnalysisTask.execute_session()` handling both response paths
- Scenarios:
  - Given analysis returns `duplicate_parts`, When task completes, Then return `AIPartAnalysisTaskResultSchema` with restructured schema (`tests/test_ai_part_analysis_task.py::test_task_duplicate_response`)
  - Given analysis returns `analysis_result`, When task completes, Then return normal result structure (`tests/test_ai_part_analysis_task.py::test_task_analysis_response`)
  - **MISSING**: Given analysis validation fails (both fields populated), When task executes, Then return error result with clear message
  - **MISSING**: Given duplicate search function times out, When task continues with analysis, Then log warning and proceed with `analysis_result` path
- Instrumentation: Existing task progress reporting
- Persistence hooks: No database writes in task
- Gaps: Error path when validation fails not covered in test scenarios (plan.md:503 mentions it but no test). Timeout/graceful degradation scenario (plan.md:529) not included in task test plan.
- Evidence: `plan.md:524-537` mentions integration tests but task-specific scenarios not detailed

- Behavior: End-to-end duplicate detection integration
- Scenarios:
  - Given user inputs exact MPN and match exists, When LLM returns `duplicate_parts`, Then task result has `duplicate_parts` array and null `analysis_result` (`tests/test_ai_service_duplicate_integration.py::test_exact_match_returns_duplicates`)
  - Given user inputs vague description and similar parts exist, When LLM returns `analysis_result`, Then task result has analysis object and null `duplicate_parts` (`tests/test_ai_service_duplicate_integration.py::test_vague_input_returns_analysis`)
  - Given 2 high-confidence duplicates found, When LLM returns duplicates, Then response has array with 2 entries (`tests/test_ai_service_duplicate_integration.py::test_multiple_high_confidence_matches`)
  - Given duplicate search times out, When analysis continues, Then result has `analysis_result` path (`tests/test_ai_service_duplicate_integration.py::test_duplicate_search_timeout_graceful`)
  - Given LLM returns invalid structure (both fields populated), When validation fails, Then task returns error result (`tests/test_ai_service_duplicate_integration.py::test_invalid_response_structure`)
  - **MISSING**: Given duplicate search returns medium confidence matches only, When LLM decides to return duplicates vs continue analysis, Then behavior is documented (prompt guidance says "high confidence" triggers duplicates, but what about medium-only?)
- Instrumentation: Full metrics chain: AI service metrics, duplicate search metrics, task progress
- Persistence hooks: Test creates parts in database for each scenario
- Gaps: Medium-confidence-only scenario not explicitly covered. Plan states prompt guides on "high/medium confidence" (plan.md:69-70) but decision logic for medium-only matches is ambiguous.
- Evidence: `plan.md:524-537` defines integration test scenarios

---

## 5) Adversarial Sweep

**Major — Response schema validation enforcement is unspecified and risks silent failures**

**Evidence:** `plan.md:241-242` states "Breaking change - restructure top level to have two optional, mutually exclusive fields. Exactly one must be present. Backend validates this constraint." Plan also states at line 303: "Backend validates response structure (exactly one field must be non-null)" but doesn't show HOW this validation is implemented.

**Why it matters:** Pydantic doesn't natively enforce mutually exclusive optional fields. If validation relies purely on prompt guidance without backend enforcement, LLM can return invalid responses (both null, both populated, empty array edge cases) causing runtime errors in task execution or frontend. If validation is explicit but not tested, it won't catch edge cases.

**Fix suggestion:** Add to section 4 (API / Integration Surface) or section 7 (Consistency) explicit specification of validation mechanism. Options: (1) Pydantic `@model_validator(mode='after')` that checks field exclusivity and raises `ValidationError`, (2) explicit check in `AIService.analyze_part()` after parsing LLM response, or (3) validation in task with graceful error handling. Prefer option 1 for fail-fast. Add corresponding test scenarios for all edge cases (both null, both populated, empty array vs null).

**Confidence:** High

---

**Major — Metrics integration with MetricsService not specified, risks incomplete observability**

**Evidence:** `plan.md:409-445` defines five new metrics (`ai_duplicate_search_requests_total`, `ai_duplicate_search_matches_found`, `ai_duplicate_search_duration_seconds`, `ai_duplicate_search_parts_dump_size`, structured log) but doesn't specify how they integrate with `MetricsService`. Container wiring at `plan.md:145-149` doesn't mention `MetricsService` as dependency for `DuplicateSearchService`.

**Why it matters:** Per `@CLAUDE.md` "Prometheus Metrics Infrastructure" section, all metrics must be managed through `MetricsService` which is injected via DI container. Without explicit wiring, metrics won't be created, won't appear on `/metrics` endpoint, and observability goal fails. Also, `ai_duplicate_search_parts_dump_size` defined as Gauge (line 432-437) but should be recorded per-request during search, not as persistent gauge.

**Fix suggestion:** Add to section 2 (Affected Areas) specification that `DuplicateSearchService` constructor receives `metrics_service: MetricsService` parameter. Add to section 9 (Observability) explicit calls showing where metrics are recorded: `self.metrics_service.increment_counter('ai_duplicate_search_requests_total', labels={'outcome': 'success'})`. Change `ai_duplicate_search_parts_dump_size` from Gauge to Histogram or include in duration labels as metadata. Add to container.py file map entry showing metrics_service wiring.

**Confidence:** High

---

**Major — Test data maintenance requirement not addressed despite schema changes**

**Evidence:** `plan.md:482` states "tests create their own duplicate-prone parts as needed" but doesn't address `@CLAUDE.md` requirement: "Test Data Management" section mandates "When making schema changes: Update the JSON files in `app/data/test_data/` to reflect new fields or relationships."

**Why it matters:** The AI analysis response schema changes fundamentally (restructuring from flat `AIPartAnalysisResultSchema` to wrapper with `analysis_result` / `duplicate_parts`). While this doesn't change Part model schema directly, the response contract change affects downstream testing and integration. More critically, if developers run `load-test-data` after these changes, any test scripts or fixtures that parse AI analysis results will break. Per guidelines, "fixed test dataset should always reflect realistic scenarios" and "include edge cases."

**Fix suggestion:** Add explicit test data maintenance task to section 14 (Implementation Slices) or section 13 (Test Plan): "Verify test data fixtures don't rely on old response schema structure; update any test harness that parses AI analysis results." If `app/data/test_data/` includes any fixtures that serialize AI analysis responses (unlikely but possible), update them. Add to test plan section validation that `load-test-data` succeeds after schema changes.

**Confidence:** Medium

---

**Minor — AIFunction base class bug fix should be validated with test**

**Evidence:** `plan.md:122-125` identifies hardcoded function name bug in `ai_runner.py:47` where "classify_urls" is hardcoded instead of `self.get_name()`. Plan correctly identifies this as blocking bug requiring fix first (plan.md:543-546).

**Why it matters:** Bug fix without test coverage means it could regress. Existing `URLClassifierFunction` works despite bug because its `get_name()` returns "classify_urls", so bug was never triggered. New `DuplicateSearchFunction` with different name will trigger bug if not fixed.

**Fix suggestion:** Add to test plan (section 13) explicit test case: "Given `DuplicateSearchFunction`, When calling `get_function_tool()`, Then returned function name matches `get_name()` output (not hardcoded 'classify_urls')." Add to implementation slices that bug fix includes unit test for `AIFunction.get_function_tool()` generic behavior.

**Confidence:** High

---

**Minor — Prompt engineering approach not detailed despite being critical to success**

**Evidence:** Plan acknowledges prompt quality is critical (plan.md:612-621 lists three prompt-related risks) but doesn't specify prompt content, structure, or decision-making guidance. Section 1 quotes user requirement to "add instructions that it should check for duplicates, and how it should handle medium and high confidence results" but section 7 (plan.md:296-301) only says "LLM has full control; guidance is advisory, not enforced by code" without showing the guidance text.

**Why it matters:** LLM decision quality (choosing duplicate_parts vs analysis_result) is the core feature. Without seeing prompt text or decision criteria, can't evaluate if plan will achieve user intent. Plan states "Prompt instructs: 'If high confidence matches found, return duplicate_parts array'" (line 297-298) but this contradicts user requirement that LLM should handle BOTH high AND medium confidence results. Ambiguity on medium-confidence decision logic.

**Fix suggestion:** Add to section 2 (Affected Areas) example prompt snippet or pseudocode showing decision guidance. Example: "If duplicate search returns matches with confidence='high', populate duplicate_parts. If matches are confidence='medium' only, use judgment: if input was specific (exact MPN), treat as likely duplicate; if input was vague, continue with full analysis." Clarify in risks section that prompt iteration will be needed based on empirical testing.

**Confidence:** Medium

---

**Adversarial checks attempted:**
- Transaction safety: No database writes in duplicate detection path, read-only queries only - risk closed
- Session lifecycle: Ambiguity flagged in Open Questions section (service type unclear)
- Derived state corruption: No persistent state derived from filtered data; all filtering happens in LLM reasoning - risk closed
- Migrations/schema drift: No database schema changes, only response contract changes - low risk but test data concern flagged
- Feature flag coordination: Not applicable; enhancement to existing AI analysis flow, no flag needed
- S3/blob storage: Not applicable; no storage operations
- Background work/shutdown: No new background workers; operates within existing task framework - risk closed

**Evidence:** Checks covered sections 6 (Derived State), 7 (Consistency), 10 (Background Work)

**Why checks hold for closed risks:** Read-only duplicate search with no persistence means no data corruption risk; existing task cancellation handles shutdown; no migrations needed for response-only changes. Open risks captured in Major findings above.

---

## 6) Derived-Value & Persistence Invariants

- Derived value: Confidence level classification (high/medium)
  - Source dataset: Unfiltered - LLM directly compares search request to full parts inventory dump and outputs qualitative assessment
  - Write / cleanup triggered: No database writes; confidence values appear only in response to main LLM
  - Guards: Pydantic Literal type constrains to ["high", "medium"] enum (plan.md:391-393); LLM prompt instructs to filter out low confidence (plan.md:320)
  - Invariant: All matches returned by `DuplicateSearchService` have confidence in ["high", "medium"]; no "low" or invalid values appear in results
  - Evidence: `plan.md:334-338`, `plan.md:388-393`

- Derived value: Duplicate detection path selection (analysis_result vs duplicate_parts population)
  - Source dataset: Unfiltered - Main LLM receives duplicate search results and directly decides which top-level field to populate based on match confidence and user input specificity
  - Write / cleanup triggered: No database writes; decision controls response structure only, affecting frontend rendering path
  - Guards: (1) Pydantic validation enforces exactly one field non-null (plan.md:343-345), (2) LLM prompt guidance on decision criteria (plan.md:296-301), (3) Backend validation in AIService (plan.md:303)
  - Invariant: Every successful AI analysis response has EXACTLY ONE of `analysis_result` or `duplicate_parts` populated; never both, never neither
  - Evidence: `plan.md:238-242`, `plan.md:340-345`, `plan.md:500-505`

- Derived value: Parts inventory snapshot for duplicate search
  - Source dataset: Unfiltered - live query of ALL parts with pertinent fields (key, MPN, type, technical specs) at function execution time
  - Write / cleanup triggered: No writes; read-only snapshot serialized to JSON and passed to second LLM
  - Guards: (1) Database transaction ensures consistent snapshot (plan.md:358-366), (2) No caching across requests prevents stale data (plan.md:351-352), (3) Selective field projection excludes quantity/location/images to bound size (plan.md:182)
  - Invariant: Parts dump reflects exact database state at call time; modifications between duplicate search and analysis completion don't affect already-loaded snapshot
  - Evidence: `plan.md:346-353`, `plan.md:166-183`, `plan.md:315-317`

- Derived value: Empty matches array on function failure
  - Source dataset: N/A - Error condition (network failure, LLM timeout, JSON parse error)
  - Write / cleanup triggered: No writes; empty array allows main analysis to continue gracefully
  - Guards: Try/except wrapper in `DuplicateSearchFunction.execute()` catches all exceptions and returns `DuplicateSearchResponse(matches=[])` (plan.md:374-376)
  - Invariant: Duplicate search function NEVER raises exceptions to main LLM; failures degrade gracefully to "no duplicates found" state
  - Evidence: `plan.md:369-376`, `plan.md:488-489`

**Proof of sufficiency:** Four entries provided covering all derived state in duplicate detection flow. No filtered views drive persistent writes (read-only operation), satisfying review requirement.

---

## 7) Risks & Mitigations (top 3)

- Risk: LLM response schema non-compliance (both fields null/populated, invalid confidence values, empty array edge cases)
- Mitigation: Implement explicit Pydantic `@model_validator` enforcing mutually exclusive fields; add comprehensive test coverage for all edge cases; validate confidence enum strictly; define empty array semantics
- Evidence: `plan.md:238-242` (schema change), `plan.md:388-393` (confidence validation), `plan.md:500-505` (test scenarios incomplete), Open Questions section (validation mechanism unspecified)

- Risk: Metrics integration incomplete leading to observability gaps
- Mitigation: Specify `MetricsService` dependency injection in `DuplicateSearchService` constructor; wire through container; add explicit metric recording calls in service methods; review metric type choices (Gauge vs Histogram)
- Evidence: `plan.md:409-445` (metrics defined but integration missing), `plan.md:145-149` (container wiring lacks metrics_service), `@CLAUDE.md` Prometheus Metrics Infrastructure requirements

- Risk: Prompt engineering quality determines feature success but approach not detailed
- Mitigation: Document prompt decision guidance with examples; clarify medium-confidence handling; plan iterative prompt testing; add metrics to track decision outcome distribution (duplicate_parts selection rate)
- Evidence: `plan.md:296-301` (LLM decision guidance vague), `plan.md:612-621` (prompt risks acknowledged but not mitigated), `plan.md:69-70` (user requirement on medium confidence handling)

---

## 8) Confidence

Confidence: Medium — Plan demonstrates thorough codebase research and sound technical architecture, but critical implementation details (response validation enforcement, metrics integration, prompt engineering) are underspecified. The dual-LLM chain approach is well-reasoned and the function calling infrastructure is proven. However, success depends heavily on prompt quality (acknowledged but not detailed), LLM compliance with response schema (validation mechanism unclear), and observability integration (metrics wiring missing). The mutually exclusive field constraint is architecturally correct but implementation approach must be clarified to avoid runtime failures. With the specified conditions addressed (explicit validation mechanism, metrics wiring, prompt guidance examples, test data verification), confidence would increase to High.
