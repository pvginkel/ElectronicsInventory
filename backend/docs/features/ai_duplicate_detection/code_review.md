# AI Duplicate Detection - Code Review

## 1) Summary & Decision

**Readiness**

The implementation demonstrates solid understanding of the layered architecture and successfully integrates duplicate detection into the AI Part Analysis flow. The code properly restructures the response schema to support two-path responses (analysis_result OR duplicate_parts), implements the duplicate search service with LLM chaining, and updates all affected layers (schemas, services, API, tests). The implementation follows established patterns for dependency injection, error handling, and graceful degradation. However, there are critical issues with schema validation enforcement (no validation that exactly one field is populated), missing metrics integration (MetricsService not called), a bug in time measurement (using `time.time()` instead of `time.perf_counter()`), and the prompt directive approach lacks explicit validation which could lead to edge cases where both or neither field is populated.

**Decision**

`GO-WITH-CONDITIONS` — Core implementation is sound and follows project patterns, but must address: (1) missing metrics service calls for observability, (2) time measurement bug violating CLAUDE.md standards, (3) lack of validation for mutually exclusive schema fields, (4) prompt directive effectiveness needs monitoring in production. These are fixable issues that don't require redesign.

---

## 2) Conformance to Plan (with evidence)

**Plan alignment**

- Plan section 2 (File Map) ↔ `app/schemas/duplicate_search.py:1-61`, `app/services/duplicate_search_service.py:1-166`, `app/utils/ai/duplicate_search.py:1-70` — All new files created as specified with matching structure and purpose

- Plan section 3 (Data Model) ↔ `app/schemas/duplicate_search.py:8-61` — Schemas match planned structure: `DuplicateSearchRequest` (free-form search), `DuplicateMatchEntry` (confidence enum), `DuplicateSearchResponse` (matches array), `DuplicateMatchLLMResponse` (internal LLM response)

- Plan section 3 (Schema restructuring) ↔ `app/schemas/ai_part_analysis.py:136-153`, `app/services/ai_model.py:14-58` — Response schema restructured with two optional top-level fields (`analysis_result` and `duplicate_parts`) as planned; `PartAnalysisDetails` extracted from original `PartAnalysisSuggestion`

- Plan section 2 (PartService dump method) ↔ `app/services/part_service.py:151-186` — `get_all_parts_for_search()` implemented with search-optimized fields (excludes quantity, location, images, documents)

- Plan section 2 (DI wiring) ↔ `app/services/container.py:173-193` — New services wired: `ai_runner` singleton, `duplicate_search_service` factory, `duplicate_search_function` factory, injected into `ai_service`

- Plan section 2 (Prompt updates) ↔ `app/services/prompt.md:1-84` — Main prompt updated with duplicate detection instructions including when to check, what to provide, how to handle results, and examples

- Plan section 2 (AIService integration) ↔ `app/services/ai_service.py:39-228` — `duplicate_search_function` injected and added to function tools array; response handling split into two paths (duplicate_parts vs analysis_result)

- Plan section 2 (Bug fix) ↔ `app/utils/ai/ai_runner.py:47` — Fixed hardcoded function name in `AIFunction.get_function_tool()` to use `self.get_name()`

- Plan section 13 (Testing) ↔ `tests/test_duplicate_search_service.py:1-315` — Comprehensive service tests covering exact match, multiple matches, no matches, empty inventory, validation errors, network errors, prompt building, generic descriptions

- Plan section 2 (Test updates) ↔ `tests/test_ai_service.py:85-600`, `tests/test_ai_part_analysis_task.py:55-340` — All existing tests updated to handle new schema structure with `analysis_result` wrapper

**Gaps / deviations**

- Plan section 9 (Metrics) — `plan.md:409-445` specifies 5 metrics (`ai_duplicate_search_requests_total`, `ai_duplicate_search_matches_found`, `ai_duplicate_search_duration_seconds`, `ai_duplicate_search_parts_dump_size`, structured logs) but implementation emits ZERO metrics. `DuplicateSearchService` receives `metrics_service` parameter but never calls it (`duplicate_search_service.py:1-166`). This violates plan commitment to observability.

- Plan section 6 (Invariant enforcement) — `plan.md:341-351` states "exactly one field should be populated" as an invariant enforced via prompt, but implementation has no validation in `AIService.analyze_part()` to catch edge cases where LLM returns both fields or neither field (`ai_service.py:122-228`). The edge case handler at lines 217-221 logs a warning but returns empty response, which may confuse frontend.

- Plan section 13 (Test coverage gaps) — Plan states tests should cover "LLM populates unexpected response structure (both fields or neither)" scenarios but `tests/test_ai_service.py` does not include these tests. Only happy paths tested.

- Plan section 2 (Test data verification) — `plan.md:160-164` requires verifying test data in `app/data/test_data/*.json` is compatible with schema changes. No evidence this verification was performed. Schema changes are additive (new optional fields) so likely compatible, but verification step was skipped.

---

## 3) Correctness — Findings (ranked)

### Blocker Issues

None identified. Core logic is sound and tests demonstrate correctness.

### Major Issues

- Title: **Major — Missing metrics integration violates plan and breaks observability**
- Evidence: `duplicate_search_service.py:63-139` — Service performs duplicate search but never calls `self.metrics_service` methods. Constructor at line 31-49 receives `metrics_service` parameter but it's never used. Plan section 9 (`plan.md:409-445`) explicitly specifies 5 metrics to emit.
- Impact: No operational visibility into duplicate search usage, latency, match quality, or inventory size. Cannot monitor for performance degradation or scaling limits. Violates plan commitment and defeats purpose of metrics infrastructure integration.
- Fix: Add metrics calls in `search_duplicates()`:
  - Counter increment: `self.metrics_service.increment_counter("ai_duplicate_search_requests_total", labels={"outcome": "success"|"error"|"empty"})` after determining outcome
  - Histogram for matches: `self.metrics_service.observe_histogram("ai_duplicate_search_matches_found", len(matches), labels={"confidence_level": "high"|"medium"})` for each match
  - Duration histogram: `self.metrics_service.observe_histogram("ai_duplicate_search_duration_seconds", duration)` after completion
  - Gauge for dump size: `self.metrics_service.set_gauge("ai_duplicate_search_parts_dump_size", len(parts_data))` after fetching parts
- Confidence: High

---

- Title: **Major — Time measurement violates CLAUDE.md standard (time.time() instead of time.perf_counter())**
- Evidence: `duplicate_search_service.py:63` and `duplicate_search_service.py:72, 119, 129, 136` — Uses `time.time()` for duration measurement: `start_time = time.time()` at line 63, then `duration = time.perf_counter() - start_time` at lines 72, 119, 129, 136.
- Impact: Mixing `time.time()` (wall clock) with `time.perf_counter()` (monotonic) is incorrect and can produce negative durations if system clock adjusts during execution. CLAUDE.md explicitly states: "NEVER use `time.time()` for measuring durations or relative time... Always use `time.perf_counter()` for duration measurements".
- Fix: Change line 63 from `start_time = time.time()` to `start_time = time.perf_counter()`. All duration calculations already use `time.perf_counter() - start_time` so only the initialization needs fixing.
- Confidence: High

**Proof of error**: Line 63 initializes with `time.time()` then lines 72, 119, 129, 136 compute `time.perf_counter() - start_time`. This mixes clock types: `perf_counter() - time()` is mathematically undefined and will produce incorrect results.

---

- Title: **Major — No validation for mutually exclusive fields in AIPartAnalysisResultSchema**
- Evidence: `ai_service.py:122-228` — Response handling has three paths: `duplicate_parts` populated (lines 136-150), `analysis_result` populated (lines 153-208), or edge case where neither populated (lines 211-221). No validation that exactly one field is populated. Pydantic schema at `ai_part_analysis.py:136-153` has both fields optional with no validator.
- Impact: If LLM populates both fields or neither field (despite prompt guidance), backend accepts and returns ambiguous response. Frontend receives unexpected structure and may render incorrectly or crash. Plan section 6 acknowledges this risk (`plan.md:625-629`) but implementation has no mitigation beyond logging warning at line 218.
- Fix: Add Pydantic `@model_validator` to `AIPartAnalysisResultSchema` that enforces exactly one field is non-None:
  ```python
  @model_validator(mode='after')
  def validate_exactly_one_path(self) -> 'AIPartAnalysisResultSchema':
      has_analysis = self.analysis_result is not None
      has_duplicates = self.duplicate_parts is not None
      if not (has_analysis ^ has_duplicates):  # XOR check
          raise ValueError("Exactly one of analysis_result or duplicate_parts must be populated")
      return self
  ```
  This fails fast if LLM returns invalid structure, rather than silently passing bad data to frontend.
- Confidence: High

---

- Title: **Major — Prompt directive approach lacks validation for confidence levels**
- Evidence: `app/services/prompt.md:11` — Prompt instructs "If ANY match has HIGH confidence: Stop analysis immediately. Populate ONLY the `duplicate_parts` field with ALL returned matches (both high and medium confidence)". Implementation at `ai_service.py:136-150` accepts whatever the LLM returns without verifying at least one match has high confidence.
- Impact: If duplicate search returns only medium confidence matches but LLM mistakenly populates `duplicate_parts` (violating directive), user sees duplicate UI when they should see full analysis. Plan review flagged this risk (`plan_review.md:617-621`). No defensive validation exists.
- Fix: Add validation in `ai_service.py` around line 137 after receiving `duplicate_parts`:
  ```python
  if ai_response.duplicate_parts is not None:
      # Verify at least one high-confidence match (defensive check against LLM error)
      has_high_conf = any(m.confidence == "high" for m in ai_response.duplicate_parts)
      if not has_high_conf:
          logger.warning(f"LLM returned duplicate_parts with only medium confidence - proceeding with analysis anyway")
          # Fall through to analysis_result path
      else:
          logger.info(f"LLM returned {len(ai_response.duplicate_parts)} duplicate matches")
          # ... existing duplicate path logic
  ```
  This catches LLM directive violations and recovers by proceeding with analysis.
- Confidence: Medium (depends on LLM reliability in production; may be over-defensive)

---

### Minor Issues

- Title: **Minor — Unused import in duplicate_search_service.py**
- Evidence: `duplicate_search_service.py:6` — Imports `time` module but only uses `time.perf_counter()` which should be from the `time` module. No other time functions used. Not a bug but worth verifying correct import.
- Impact: None (import is correct and used)
- Fix: No fix needed; import is correct
- Confidence: High

---

- Title: **Minor — Inconsistent naming: PartAnalysisSuggestion vs PartAnalysisDetails**
- Evidence: `ai_model.py:14-43` defines `PartAnalysisDetails` (new nested schema), then `ai_model.py:48-58` redefines `PartAnalysisSuggestion` as wrapper. Original `PartAnalysisSuggestion` fields moved to `PartAnalysisDetails`. Name `PartAnalysisSuggestion` no longer describes content (it's now a union type, not suggestions).
- Impact: Confusing for future maintainers. Name implies analysis suggestions but schema is actually a union type with two paths.
- Fix: Rename `PartAnalysisSuggestion` to `PartAnalysisLLMResponse` or `AIPartAnalysisUnion` to better reflect its purpose as a discriminated union.
- Confidence: Low (cosmetic issue only)

---

- Title: **Minor — StubProgressHandle implementation duplicated**
- Evidence: `duplicate_search_service.py:95-101` — Defines inline `_StubProgressHandle` class. Similar stub exists in test utilities (`tests/testing_utils.py`).
- Impact: Code duplication. If progress handle interface changes, must update multiple locations.
- Fix: Extract `_StubProgressHandle` to `app/services/base_task.py` or `app/utils/` as a reusable utility class, or import from test utilities if appropriate for production code.
- Confidence: Low (minor maintenance burden)

---

## 4) Over-Engineering & Refactoring Opportunities

- Hotspot: `DuplicateSearchService._build_prompt()` method
- Evidence: `duplicate_search_service.py:141-165` — Loads prompt template from file system every request, creates new Jinja2 Environment every call
- Suggested refactor: Cache the compiled template at service initialization. Change constructor to load template once:
  ```python
  def __init__(self, ...):
      # ... existing init
      prompt_path = os.path.join(os.path.dirname(__file__), "prompts", "duplicate_search.md")
      with open(prompt_path) as f:
          env = Environment()
          self._template = env.from_string(f.read())

  def _build_prompt(self, parts_data: list[dict]) -> str:
      parts_json = json.dumps(parts_data, indent=2)
      return self._template.render(parts_json=parts_json)
  ```
- Payoff: Eliminates repeated file I/O and template compilation on every duplicate search request. Improves latency.

---

- Hotspot: `AIService.analyze_part()` response handling
- Evidence: `ai_service.py:122-228` — Three separate code paths with duplicated logic for handling None checks and logging
- Suggested refactor: Extract response conversion logic to helper methods:
  - `_convert_duplicate_response(matches: list) -> AIPartAnalysisResultSchema`
  - `_convert_analysis_response(details: PartAnalysisDetails, types: list) -> AIPartAnalysisResultSchema`
  This reduces nesting and improves testability of each path independently.
- Payoff: Cleaner separation of concerns, easier to test edge cases for each response type

---

## 5) Style & Consistency

- Pattern: Error handling in `DuplicateSearchService.search_duplicates()`
- Evidence: `duplicate_search_service.py:127-139` — Catches all exceptions and returns empty matches (graceful degradation). Similar pattern in `DuplicateSearchFunction.execute()` at `duplicate_search.py:66-69`.
- Impact: Consistent with plan's graceful degradation strategy (`plan.md:371-376`), but swallows errors silently. In production, a complete failure of duplicate search would be invisible except for logs.
- Recommendation: Current approach is acceptable per plan, but consider adding a metrics counter for error cases to track failure rate: `self.metrics_service.increment_counter("ai_duplicate_search_requests_total", labels={"outcome": "error"})` in exception handler.

---

- Pattern: Time measurement usage
- Evidence: `duplicate_search_service.py:63, 72, 119, 129, 136` — Consistently calculates duration and logs with 3 decimal precision
- Impact: Good pattern for observability, but mixing `time.time()` with `time.perf_counter()` is a bug (see Major issue above)
- Recommendation: Fix initialization to use `time.perf_counter()` consistently

---

## 6) Tests & Deterministic Coverage (new/changed behavior only)

- Surface: `DuplicateSearchService.search_duplicates()`
- Scenarios:
  - Given 3 parts with exact MPN match, When searching, Then return 1 high-confidence match (`tests/test_duplicate_search_service.py::test_search_duplicates_exact_match:96-129`)
  - Given search returns multiple matches with mixed confidence, When processing, Then return all matches (`tests/test_duplicate_search_service.py::test_search_duplicates_multiple_matches:131-168`)
  - Given no matches found, When searching, Then return empty array (`tests/test_duplicate_search_service.py::test_search_duplicates_no_matches:170-191`)
  - Given empty inventory, When searching, Then return empty immediately without LLM call (`tests/test_duplicate_search_service.py::test_search_duplicates_empty_inventory:193-210`)
  - Given LLM returns invalid schema, When parsing, Then catch ValidationError and return empty (`tests/test_duplicate_search_service.py::test_search_duplicates_llm_validation_error:212-235`)
  - Given network error, When calling LLM, Then catch Exception and return empty (`tests/test_duplicate_search_service.py::test_search_duplicates_llm_network_error:237-257`)
  - Given generic description, When searching, Then return medium confidence only (`tests/test_duplicate_search_service.py::test_search_duplicates_with_generic_description:283-314`)
- Hooks: Mock AIRunner with canned responses, mock PartService, StubMetricsService
- Gaps: No test verifies metrics are called (would fail because metrics not implemented). No test for parts with null technical fields (package=None, series=None, etc.) to verify JSON serialization. No test for very large inventory (100+ parts) to verify prompt size limits.
- Evidence: Comprehensive coverage of service logic, but missing observability validation

---

- Surface: `PartService.get_all_parts_for_search()`
- Scenarios:
  - **MISSING**: No dedicated tests for this new method exist in `tests/test_part_service.py`
  - Service tests in `test_duplicate_search_service.py` use real PartService with sample data (lines 43-90, 259-281) which exercises the method indirectly
- Hooks: Uses real database session with sample Part fixtures
- Gaps: No explicit unit tests for `get_all_parts_for_search()`. Missing scenarios: empty database, parts with null fields, parts without type relationship, ordering verification.
- Evidence: Method is tested indirectly via integration with DuplicateSearchService but lacks isolated unit tests

**Recommendation**: Add tests to `tests/test_part_service.py`:
```python
def test_get_all_parts_for_search_returns_all_parts(session, sample_parts):
    service = PartService(db=session)
    result = service.get_all_parts_for_search()
    assert len(result) == len(sample_parts)

def test_get_all_parts_for_search_handles_null_fields(session):
    part = Part(key="TEST", description="minimal")
    session.add(part)
    session.flush()
    service = PartService(db=session)
    result = service.get_all_parts_for_search()
    assert result[0]["package"] is None
    assert result[0]["type_name"] is None
```

---

- Surface: `AIService.analyze_part()` with duplicate detection
- Scenarios:
  - Given LLM returns analysis_result populated, When processing, Then return analysis path (`tests/test_ai_service.py::test_analyze_part_success:189-207` — updated to verify `result.analysis_result is not None` and `result.duplicate_parts is None`)
  - Given LLM with documents in analysis, When processing, Then return analysis with documents (`tests/test_ai_service.py::test_analyze_part_with_documents:269-283` — updated to access `result.analysis_result.documents`)
  - **MISSING**: Given LLM returns duplicate_parts populated, When processing, Then return duplicate path
  - **MISSING**: Given LLM returns both fields populated, When validating, Then handle appropriately (log warning and choose one path, or raise error)
  - **MISSING**: Given LLM returns neither field populated, When validating, Then handle edge case
  - All existing tests updated to handle new schema structure with `analysis_result` wrapper (lines 85-98, 144-161, 189-207, 227-241, 269-283, 309-346, 357-389, 584-594)
- Hooks: Mock AIRunner with `create_mock_ai_response()` helper updated to wrap `PartAnalysisDetails` in `PartAnalysisSuggestion` with `analysis_result` field and `duplicate_parts=None`
- Gaps: Zero test coverage for duplicate_parts path. No tests for edge cases (both fields, neither field). Plan review identified this gap (`plan_review.md:94-99`) but implementation didn't address it.
- Evidence: Tests updated for schema changes but new duplicate detection behavior not tested

**Recommendation**: Add tests:
```python
def test_analyze_part_returns_duplicates(ai_service, mock_run):
    # Mock LLM returning duplicate_parts path
    mock_response = PartAnalysisSuggestion(
        analysis_result=None,
        duplicate_parts=[
            DuplicatePartMatch(part_key="ABCD", confidence="high", reasoning="Exact match")
        ]
    )
    mock_run.return_value = Mock(response=mock_response)

    result = ai_service.analyze_part("OMRON G5Q-1A4", None, None, Mock())
    assert result.duplicate_parts is not None
    assert len(result.duplicate_parts) == 1
    assert result.analysis_result is None
```

---

- Surface: `AIPartAnalysisTask` with two-path response handling
- Scenarios:
  - Given analysis_result path, When task executes, Then log document count (`tests/test_ai_part_analysis_task.py::test_execute_success_text_only:54-84` — updated to access `result.analysis.analysis_result.manufacturer_code`)
  - Given analysis_result with documents, When task executes, Then log documents (`tests/test_ai_part_analysis_task.py::test_logging_documents_downloaded:299-340` — updated to access `result.analysis.analysis_result.documents`)
  - **MISSING**: Given duplicate_parts path, When task executes, Then log duplicate count appropriately (task has code for this at `ai_part_analysis_task.py:81-86` but no test)
  - **MISSING**: Given neither field populated (edge case), When task executes, Then log warning (task has code at line 91-93 but no test)
- Hooks: Mock AIService with `AIPartAnalysisResultSchema` instances wrapped in `PartAnalysisDetailsSchema`
- Gaps: Task handling code for duplicate_parts path exists but is untested. Edge case handling is untested.
- Evidence: Tests updated for analysis_result path but duplicate_parts path not covered

---

## 7) Adversarial Sweep

### Attack 1: Parts dump JSON serialization failure

**Target**: `PartService.get_all_parts_for_search()` combined with `DuplicateSearchService._build_prompt()`

**Attack vector**: Part with tags field as SQL NULL (not empty array) causes `json.dumps()` to serialize as JSON null. LLM prompt template expects array. Similarly, parts with very long description (>10000 chars) could break JSON structure or exceed token limits.

**Evidence**: `part_service.py:175` — `"tags": part.tags or []` handles NULL by converting to empty array. Safe. `duplicate_search_service.py:151` — `json.dumps(parts_data, indent=2)` safely handles None values in dict fields. Safe.

**Why code held up**: Implementation correctly handles NULL tags with fallback to empty array. JSON serialization handles None values naturally. No exploitable failure mode found.

---

### Attack 2: Duplicate search LLM returns confidence="low" despite prompt instruction

**Target**: `DuplicateSearchService.search_duplicates()` and `DuplicateMatchEntry` schema

**Attack vector**: LLM ignores prompt instruction to only return high/medium confidence and includes `confidence="low"` in response.

**Evidence**: `duplicate_search.py:28` — `confidence: Literal["high", "medium"]` constrains to two values. Pydantic will raise ValidationError if LLM returns "low". Error caught at `duplicate_search_service.py:127-132` and returns empty matches (graceful degradation). Safe.

**Why code held up**: Pydantic Literal type provides type-safe enum validation. Any invalid confidence value triggers ValidationError which is caught and handled.

---

### Attack 3: AIService receives duplicate_parts from LLM but all are medium confidence (violates directive)

**Target**: `AIService.analyze_part()` duplicate handling logic

**Attack vector**: Main LLM calls `find_duplicates`, receives only medium-confidence matches, but mistakenly populates `duplicate_parts` instead of proceeding with `analysis_result` (violates prompt directive at `prompt.md:11`).

**Evidence**: `ai_service.py:136-150` — No validation that `duplicate_parts` contains at least one high-confidence match. Code blindly accepts whatever LLM returns and passes to frontend. **FAILURE MODE FOUND** (flagged as Major issue above).

**Impact**: User sees duplicate selection UI when they should see full analysis UI. Breaks UX flow.

**Mitigation**: Add defensive check (see Major issue fix above).

---

### Attack 4: Session handling in DuplicateSearchService

**Target**: `DuplicateSearchService` database access via `PartService`

**Attack vector**: Service calls `self.part_service.get_all_parts_for_search()` which queries database. If called outside transaction context, could see inconsistent snapshot or fail.

**Evidence**: `duplicate_search.py:62-63` — Function called from `AIService.analyze_part()` which runs in `AIPartAnalysisTask` (inherits `BaseSessionTask`). Task provides database session to `AIService` constructor. `PartService` is factory-scoped with session from task. `DuplicateSearchService` is factory-scoped receiving `part_service` from same container. Session lifecycle is correct. Safe.

**Why code held up**: Dependency injection properly scopes services and session flows from task → AIService → PartService. Transaction context is maintained.

---

### Attack 5: Metrics service not wired correctly

**Target**: `DuplicateSearchService` metrics integration

**Attack vector**: Service receives `metrics_service` in constructor but never calls it. If metrics infrastructure changes or metrics are required for production health checks, feature will be blind.

**Evidence**: `duplicate_search_service.py:49` receives `metrics_service` parameter, stored at line 49, but never called in `search_duplicates()` method. **FAILURE MODE FOUND** (flagged as Major issue above).

**Impact**: Zero observability for duplicate search feature. Cannot detect performance degradation, scaling issues, or usage patterns.

---

## 8) Invariants Checklist

- Invariant: Exactly one of `analysis_result` or `duplicate_parts` must be populated in `AIPartAnalysisResultSchema`
  - Where enforced: Nowhere. Pydantic schema has both fields optional (`ai_part_analysis.py:143-150`). No `@model_validator`. Implementation relies solely on LLM prompt guidance (`ai_service.py:136-221`).
  - Failure mode: LLM populates both fields or neither field. Frontend receives ambiguous response structure and may crash or render incorrectly.
  - Protection: Edge case handler at `ai_service.py:217-221` logs warning and returns empty response (both fields None). This violates invariant. No exception raised.
  - Evidence: `ai_service.py:217-221` shows edge case handling but doesn't enforce invariant

**Status**: Invariant not enforced. Recommend adding Pydantic validator (see Major issue above).

---

- Invariant: Confidence levels in duplicate matches must be "high" or "medium" only (no "low")
  - Where enforced: Pydantic schema at `duplicate_search.py:28` uses `Literal["high", "medium"]` type. LLM prompt instructs filtering at `duplicate_search.md:26`.
  - Failure mode: LLM returns invalid confidence value. Pydantic raises ValidationError. Caught at `duplicate_search_service.py:127-132` and returns empty matches.
  - Protection: Type-safe enum validation with graceful error recovery. Strong.
  - Evidence: `duplicate_search.py:28` Literal type + `duplicate_search_service.py:127-132` error handling

**Status**: Invariant properly enforced with multiple layers of protection.

---

- Invariant: Parts dump must be complete snapshot of inventory at call time (no filtering, no pagination)
  - Where enforced: `part_service.py:165` uses `select(Part)` without filters or limit. Results converted to list at line 166.
  - Failure mode: Query could return partial results if session is misconfigured or transaction isolation is wrong. Could return stale data if called outside transaction.
  - Protection: Transaction context provided by task session. SQLAlchemy defaults to READ COMMITTED isolation. Query loads all parts eagerly into memory.
  - Evidence: `part_service.py:165-186` shows unfiltered query with eager loading

**Status**: Invariant maintained by database transaction guarantees. No pagination or filtering applied. Safe.

---

## 9) Questions / Needs-Info

- Question: What is the expected scaling limit for parts dump and how should it be monitored?
- Why it matters: Plan states "~500-1000 parts safe" but implementation has no safeguards. At 1000 parts × ~200 tokens/part = 200k tokens just for inventory, approaching context limits for some models. If inventory grows beyond assumption, duplicate search will silently fail or truncate.
- Desired answer: (1) Define hard limit for parts count before disabling duplicate search or implementing pagination. (2) Add warning log if `len(parts_data) > 1000`. (3) Implement `ai_duplicate_search_parts_dump_size` gauge metric (currently missing) to monitor in production.

---

- Question: Should mutually exclusive field validation be enforced in schema or relied on LLM prompt only?
- Why it matters: Current implementation trusts LLM to follow prompt directives with no validation. Edge case handler exists but doesn't fail. Frontend may receive invalid structure.
- Desired answer: Recommend adding Pydantic `@model_validator` to fail fast if invariant violated (see Major issue above). This provides defense-in-depth against LLM errors.

---

- Question: Are metrics intentionally deferred or was this an oversight?
- Why it matters: Plan explicitly commits to 5 metrics. Implementation has full MetricsService wiring but zero calls. Could be intentional deferral or accidental omission.
- Desired answer: If oversight, fix before merge. If intentional, document in plan or commit message why metrics are deferred.

---

## 10) Risks & Mitigations (top 3)

- Risk: Missing metrics integration leaves feature blind in production
- Mitigation: Implement all 5 metrics from plan before deployment: request counter, matches histogram, duration histogram, dump size gauge, structured logs. Critical for detecting scaling issues and LLM quality degradation.
- Evidence: Finding in Major issues section; `duplicate_search_service.py:1-166` receives metrics service but never calls it

---

- Risk: Prompt directive approach for mutually exclusive fields could fail in production
- Mitigation: Add Pydantic validator to enforce invariant and fail fast if LLM violates. Add monitoring for edge case handler invocations (currently just logs warning). Consider A/B testing prompt variations to optimize LLM compliance rate.
- Evidence: Finding in Major issues section; `ai_service.py:217-221` edge case handler; plan review warning at `plan_review.md:625-629`

---

- Risk: Time measurement bug could cause monitoring confusion
- Mitigation: Fix `time.time()` → `time.perf_counter()` initialization. Verify duration metrics are correct in logs. Run integration test to confirm no negative durations.
- Evidence: Finding in Major issues section; `duplicate_search_service.py:63`

---

## 11) Confidence

Confidence: Medium — Implementation is architecturally sound and follows established patterns correctly. The duplicate search logic is well-tested at the service layer and properly integrated into the DI container. Schema restructuring is clean. However, three major issues significantly reduce confidence: (1) zero metrics implementation despite plan commitment hurts production observability, (2) time measurement bug violates explicit coding standard, (3) lack of schema validation for mutually exclusive fields creates risk of bad data reaching frontend. Additionally, the duplicate_parts response path has zero test coverage in AIService and task layers, despite having implementation code. These gaps suggest incomplete implementation that would benefit from a follow-up review after fixes are applied. The core logic works, but production readiness is questionable without metrics and proper validation.

---

## Appendix: Files Reviewed

**New files** (untracked):
- `/work/backend/app/schemas/duplicate_search.py` — Duplicate search request/response schemas
- `/work/backend/app/services/duplicate_search_service.py` — Duplicate search service with LLM chain
- `/work/backend/app/utils/ai/duplicate_search.py` — AIFunction wrapper for duplicate search
- `/work/backend/app/services/prompts/duplicate_search.md` — LLM prompt for duplicate matching
- `/work/backend/tests/test_duplicate_search_service.py` — Service tests for duplicate search

**Modified files**:
- `/work/backend/app/schemas/ai_part_analysis.py` — Restructured response schema (lines 136-153)
- `/work/backend/app/services/ai_model.py` — Split PartAnalysisSuggestion into PartAnalysisDetails + wrapper (lines 14-58)
- `/work/backend/app/services/ai_part_analysis_task.py` — Two-path response handling (lines 81-112)
- `/work/backend/app/services/ai_service.py` — Integrated duplicate search function, split response paths (lines 39-228)
- `/work/backend/app/services/container.py` — DI wiring for new services (lines 173-193)
- `/work/backend/app/services/part_service.py` — Added get_all_parts_for_search() (lines 151-186)
- `/work/backend/app/services/prompt.md` — Added duplicate detection instructions (lines 1-84)
- `/work/backend/app/utils/ai/ai_runner.py` — Fixed hardcoded function name bug (line 47)
- `/work/backend/tests/test_ai_service.py` — Updated all tests for schema changes (lines 85-600)
- `/work/backend/tests/test_ai_part_analysis_task.py` — Updated tests for PartAnalysisDetailsSchema wrapper (lines 55-340)

**Test execution status**:
- Total: 1047 passed, 1 skipped
- Linting: Passed (ruff clean)
- Type checking: Passed (mypy clean except 2 pre-existing unrelated errors in app/api/kits.py)
