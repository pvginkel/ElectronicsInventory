# Plan Review: Implement Duplicate Search in Prompt Tester

## 1) Summary & Decision

**Readiness**

The plan provides a comprehensive and well-researched blueprint for implementing duplicate search testing in the prompt tester tool. The research phase identified the key integration patterns and correctly analyzed the AIRunner signature mismatch. However, several critical implementation details are underspecified, particularly around the AIRunner initialization strategy, mock inventory data structure validation, and error handling patterns. The plan correctly identifies the scope and constraints but needs clarification on how to handle the MetricsService dependency and whether to validate mock data structure at runtime.

**Decision**

`GO-WITH-CONDITIONS` — The plan is implementable but needs clarification on AIRunner initialization strategy (stub vs None) and should add explicit validation of mock inventory structure. The core approach is sound and well-aligned with existing patterns.

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `docs/commands/plan_feature.md` — Pass — `plan.md:0-379` — Plan uses all required sections including research log, intent, file map, data models, algorithms, derived state, consistency, errors, observability, test plan, risks, and confidence
- `docs/product_brief.md` — Pass — `plan.md:29-42` — Intent section correctly references duplicate detection functionality and inventory search context from product brief
- `CLAUDE.md` development guidelines — Partial — `plan.md:20-21, 145` — Correctly notes no metrics tracking needed and no API integration, but doesn't explicitly address time measurement requirements (should use `time.perf_counter()` not `time.time()` per CLAUDE.md guidelines)
- `CLAUDE.md` testing requirements — Fail — `plan.md:294-341` — Test plan describes manual verification only with no automated pytest tests, which violates the "Every piece of code must have comprehensive tests" requirement

**Fit with codebase**

- `AIRunner.__init__` signature — `plan.md:88-92, 120` — Plan identifies the signature mismatch (requires both `api_key` and `metrics_service`) but proposes two alternatives (stub or None) without selecting one. Evidence: `/work/backend/app/utils/ai/ai_runner.py:81` shows `def __init__(self, api_key: str, metrics_service: MetricsServiceProtocol)` with no default for metrics_service
- `DuplicateSearchService` pattern — `plan.md:169` — Plan correctly references production service at lines 60-180 and identifies the pattern to adapt, with metrics calls removed
- Mock inventory structure — `plan.md:98-117, 172-178` — Plan references `PartService.get_all_parts_for_search()` structure but doesn't specify how to ensure alignment remains correct over time (no runtime validation proposed)
- Template rendering — `plan.md:78-80` — Plan proposes copying prompt template but doesn't address potential drift between production and test templates

## 3) Open Questions & Ambiguities

- Question: Should AIRunner be initialized with a stub MetricsService or should AIRunner be modified to accept `metrics_service: MetricsServiceProtocol | None`?
- Why it matters: The current plan mentions both approaches (stub service or None handling) but doesn't commit to one, which will cause implementation ambiguity. The existing `# type: ignore` pattern at line 120 of prompttester.py suppresses the error but may not work if AIRunner tries to use metrics_service internally.
- Needed answer: Decide whether to create a minimal stub class implementing MetricsServiceProtocol with no-op methods, or modify AIRunner to accept None and guard all metrics_service usage with null checks.

---

- Question: How should mock inventory structure be validated against production structure?
- Why it matters: Plan section 8 (line 232-236) identifies "Mock inventory structure doesn't match production format" as a failure case but proposes only manual verification. If the structure diverges, tests become unrealistic.
- Needed answer: Should there be a runtime validation function that checks mock inventory against expected field names/types, or is periodic manual review sufficient?

---

- Question: What is the exact relationship between test queries and the mock inventory?
- Why it matters: Plan section 13 (lines 298-302) describes test scenarios like "Given an inventory with one part with MPN 'SN74HC595N'" but doesn't show the complete mock inventory dataset that will be hardcoded. The test data structure at lines 350-361 shows expected matches by part key, but the corresponding mock inventory isn't specified.
- Needed answer: The plan should include the complete mock inventory dataset or reference where it will be defined, so the test expectations can be validated against it.

## 4) Deterministic Backend Coverage (new/changed behavior only)

- Behavior: `run_duplicate_search_tests()` function - main orchestration
- Scenarios:
  - Given test queries with expected matches, When running tests with multiple models and runs, Then output files (JSON, TXT, LOG) are created for each run
  - Given output JSON file already exists, When running tests again, Then test is skipped (idempotency)
  - Given AI call fails, When exception is caught, Then ERR file is created with traceback
  - **Missing**: No pytest test scenarios defined for the new function
- Instrumentation: Console logging at INFO level during test execution; test metrics saved to TXT files
- Persistence hooks: No database operations; file system only (output directory creation)
- Gaps: **Major** - No pytest tests planned for `run_duplicate_search_tests()` function. Plan section 13 (lines 305-306) explicitly states "No automated assertion checking (outputs are saved to files for manual review)" which violates CLAUDE.md requirement that "Every piece of code must have comprehensive tests"
- Evidence: `plan.md:294-341` describes test plan but only for manual verification; no pytest test class or test methods specified

---

- Behavior: Mock inventory dataset construction
- Scenarios:
  - Given hardcoded Python dictionaries, When building mock inventory, Then structure must match `PartService.get_all_parts_for_search()` exactly
  - **Missing**: No validation scenario for structure alignment
- Instrumentation: None proposed
- Persistence hooks: None (in-memory only)
- Gaps: **Major** - No runtime or test-time validation that mock structure matches production. Plan acknowledges this at line 316 ("No automated validation that mock structure matches production")
- Evidence: `plan.md:310-317`

---

- Behavior: Prompt template rendering with inventory JSON
- Scenarios:
  - Given mock inventory, When rendering Jinja2 template, Then parts_json variable is substituted correctly
  - Given large inventory, When rendering, Then JSON is properly formatted
  - **Missing**: No test for template rendering in isolation
- Instrumentation: None
- Persistence hooks: Template file must exist at `tools/prompttester/prompt_duplicate_search.md`
- Gaps: Minor - Plan acknowledges no isolated template test (line 327) but this is acceptable given end-to-end coverage
- Evidence: `plan.md:320-328`

## 5) Adversarial Sweep

**Major — AIRunner initialization will fail at runtime**

**Evidence:** `plan.md:88-92, 120` references existing pattern `AIRunner(os.getenv("OPENAI_API_KEY")) # type: ignore`, but `/work/backend/app/utils/ai/ai_runner.py:81` shows `def __init__(self, api_key: str, metrics_service: MetricsServiceProtocol)` with no default for `metrics_service`. The `# type: ignore` suppresses the type error but doesn't prevent the runtime failure when AIRunner tries to instantiate with only one argument.

**Why it matters:** The implementation will crash immediately on the first test run with `TypeError: __init__() missing 1 required positional argument: 'metrics_service'`. This is a showstopper that blocks all testing.

**Fix suggestion:** Update plan section 2 to explicitly state one of: (1) Create a `StubMetricsService` class implementing `MetricsServiceProtocol` with no-op methods for all metrics operations, pass this to AIRunner; or (2) Modify `AIRunner.__init__` to accept `metrics_service: MetricsServiceProtocol | None = None` and guard all usage with null checks. Recommend option 1 (stub) as it requires no changes to production code.

**Confidence:** High

---

**Major — Mock inventory structure drift will produce invalid test results**

**Evidence:** `plan.md:232-236` acknowledges "Mock inventory structure doesn't match production format" as a failure with no runtime detection, and line 316 states "No automated validation that mock structure matches production. Manual verification required." The production structure is defined at `/work/backend/app/services/part_service.py:172-185` with specific field names: `key, manufacturer_code, type_name, description, tags, manufacturer, package, series, voltage_rating, pin_count, pin_pitch`.

**Why it matters:** If mock inventory omits a field (e.g., `pin_pitch`), misspells a field name (e.g., `mfr_code` instead of `manufacturer_code`), or uses wrong types (e.g., tags as string instead of list), the tests won't reflect production behavior. The AI prompt will receive malformed data, leading to unrealistic test results that don't validate the production prompt's effectiveness.

**Fix suggestion:** Add a helper function `validate_mock_inventory_structure(parts: list[dict]) -> None` that checks each part dictionary has exactly the expected keys and correct types (matching `PartService.get_all_parts_for_search()`). Call this during test initialization. Alternatively, define a Pydantic model matching the structure and use it to validate mock data. Add to section 5 (Algorithms) step 1.

**Confidence:** High

---

**Major — No pytest tests violates CLAUDE.md requirements**

**Evidence:** `plan.md:305-306` states "Gaps: No automated assertion checking (outputs are saved to files for manual review). This is acceptable for a prompt testing tool where human judgment is required to evaluate AI quality." This conflicts with `CLAUDE.md` requirement: "Every piece of code must have comprehensive tests. No feature is complete without tests."

**Why it matters:** While manual review is necessary for AI quality evaluation, the orchestration logic, file I/O, error handling, and idempotency checks should all have pytest coverage. Without tests, regressions can be introduced when modifying the test runner (e.g., broken file path construction, incorrect error handling, log interception failures).

**Fix suggestion:** Add section 13 test scenarios for the test infrastructure itself, separate from AI output quality: (1) Test that output files are created with correct naming, (2) Test that existing JSON causes skip, (3) Test that exceptions produce ERR files, (4) Test that log interceptor captures logs correctly, (5) Test that mock inventory validates successfully. These don't require AI calls - use mocks or skip AI in unit tests.

**Confidence:** High

---

**Minor — Prompt template drift will cause test/production divergence**

**Evidence:** `plan.md:78-80` proposes copying `/work/backend/app/services/prompts/duplicate_search.md` to `tools/prompttester/prompt_duplicate_search.md`, and lines 366-368 acknowledge "Prompt template changes in production but prompttester copy becomes stale" with mitigation "Add comment in prompttester template noting the source and last sync date; manual sync required".

**Why it matters:** Over time, the production prompt may be refined (e.g., improved matching instructions, different confidence criteria) but the test copy won't receive these updates automatically. Tests will validate against an outdated prompt, reducing their value.

**Fix suggestion:** Consider symlinking the prompt file instead of copying, or add a TODO comment in the plan to establish a review cadence (e.g., sync prompt template quarterly). Not a blocker, but document the trade-off explicitly.

**Confidence:** Medium

---

**Checks attempted:**
- Transaction safety: Not applicable (no database operations)
- Service dependency injection: Not applicable (standalone tool, no DI container)
- Migration/test data drift: Not applicable (no schema changes)
- S3 storage consistency: Not applicable (no S3 operations)
- Shutdown coordination: Not applicable (synchronous, short-lived script)

**Evidence:** `plan.md:199-205, 282-284, 286-292`

**Why the plan holds:** The standalone nature of the prompt tester eliminates most backend invariants. The identified risks are limited to AIRunner initialization, data structure alignment, and test coverage.

## 6) Derived-Value & Persistence Invariants

- Derived value: System prompt with embedded inventory JSON
  - Source dataset: Hardcoded mock inventory (unfiltered, complete static test dataset)
  - Write / cleanup triggered: None (ephemeral, used only during AI request construction)
  - Guards: None needed - no persistence, no filtering, static data
  - Invariant: The rendered prompt must contain valid JSON that matches the structure the production prompt expects (field names and types from `PartService.get_all_parts_for_search()`)
  - Evidence: `plan.md:172-178` describes inventory JSON derivation; `/work/backend/app/services/duplicate_search_service.py:93-94` shows production prompt building

---

- Derived value: Test output filename prefix
  - Source dataset: Concatenation of query key, model name, reasoning effort, run number
  - Write / cleanup triggered: Creates multiple output files (`.json`, `.txt`, `.log`, `.err`) with shared prefix
  - Guards: No explicit path sanitization (assumes valid query keys); uniqueness ensured by including model/effort/run in prefix
  - Invariant: Each test run must produce a unique prefix to avoid overwriting previous test outputs
  - Evidence: `plan.md:182-188`; `/work/backend/tools/prompttester/prompttester.py:132-135` shows prefix construction pattern

---

- Derived value: Captured log lines (thread-local buffer)
  - Source dataset: All logging statements executed during `AIRunner.run()` call, intercepted by `LogInterceptor`
  - Write / cleanup triggered: Written to `{prefix}.log` file after AI call completes; buffer cleared before next test run
  - Guards: Thread-local storage isolates logs per test; explicit `log_interceptor.clear()` call before each run prevents cross-test contamination
  - Invariant: Log buffer must be cleared before each test run, otherwise logs from previous tests leak into subsequent test output files
  - Evidence: `plan.md:191-197`; `/work/backend/tools/prompttester/prompttester.py:279` shows `log_interceptor.clear()` pattern

---

- Derived value: AI response validation via Pydantic
  - Source dataset: Raw JSON string returned by OpenAI API
  - Write / cleanup triggered: Pydantic validation occurs in AIRunner; if invalid, ValidationError is raised and test run fails
  - Guards: Pydantic `DuplicateMatchLLMResponse` schema enforces structure; plan section 8 (lines 216-220) describes handling
  - Invariant: Only structurally valid responses (matching `DuplicateMatchLLMResponse` schema) are saved to output JSON files; invalid responses trigger ERR file creation
  - Evidence: `plan.md:216-220`; `/work/backend/app/schemas/duplicate_search.py:49-60` defines schema

## 7) Consistency, Transactions & Concurrency

- Risk: Thread-local log interceptor assumes single-threaded execution but plan doesn't explicitly document this constraint
- Mitigation: Add to section 1 (Assumptions/Constraints) or section 7 (Consistency) that tests are run sequentially in a single thread. If concurrent execution is desired later, this will need revisiting.
- Evidence: `plan.md:203-204` mentions thread-local pattern allows concurrent execution, but algorithm section (lines 148-168) describes sequential execution only

---

- Risk: File writes are independent and partial writes could leave inconsistent state (e.g., JSON exists but TXT doesn't)
- Mitigation: Plan section 7 (lines 201-202) states "Partial writes are acceptable (test can be re-run)" which is a reasonable trade-off for a testing tool. However, the idempotency check at line 275-277 only checks for JSON existence, so re-running won't regenerate missing TXT/LOG files.
- Evidence: `plan.md:199-205`; `/work/backend/tools/prompttester/prompttester.py:275-277` shows only JSON check

---

- Risk: Output directory creation race condition if multiple test runners execute simultaneously
- Mitigation: Not applicable - plan assumes single invocation as documented at line 68 ("Tests are run manually by developers"). If this assumption changes, directory creation pattern at line 244 needs revisiting.
- Evidence: `plan.md:68, 244`; `/work/backend/tools/prompttester/prompttester.py:118` shows `os.makedirs(tmp_path, exist_ok=True)`

## 8) Confidence

Confidence: Medium — The plan demonstrates thorough research and correctly identifies most integration patterns. The algorithm and data flow are sound. However, critical implementation details are underspecified (AIRunner initialization, mock data validation) and the lack of pytest test coverage violates project standards. With the conditions addressed (stub metrics service, structure validation, basic pytest tests), confidence would increase to High.

