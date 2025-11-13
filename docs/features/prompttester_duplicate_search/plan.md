# Plan: Implement Duplicate Search in Prompt Tester

## 0) Research Log & Findings

**Research Areas:**
- Reviewed `/work/backend/tools/prompttester/prompttester.py` to understand the existing prompt tester architecture
- Analyzed `/work/backend/app/services/duplicate_search_service.py` to understand the production duplicate search implementation
- Examined `/work/backend/app/schemas/duplicate_search.py` for the request/response data contracts
- Reviewed `/work/backend/app/services/prompts/duplicate_search.md` for the prompt template
- Investigated `/work/backend/app/services/part_service.py` method `get_all_parts_for_search()` to understand inventory data format
- Checked `/work/backend/app/utils/ai/ai_runner.py` to understand AI runner patterns

**Key Findings:**
1. The prompt tester uses a thread-local log interceptor pattern for capturing logs per test run
2. Existing tests follow a clear pattern: system prompt + user prompt → AI call → save JSON/TXT/LOG outputs
3. The `run_full_tests()` function orchestrates multiple queries/models/runs and delegates to helper functions
4. The `DuplicateSearchService` provides a complete implementation that can be adapted for the prompt tester
5. The prompt tester creates `AIRunner` with just an API key (ignoring the metrics_service parameter with `# type: ignore`)
6. The duplicate search prompt is a Jinja2 template that embeds the full inventory JSON
7. No metrics tracking is needed in the prompt tester (confirmed by change brief)

**Conflicts & Resolutions:**
- **AIRunner signature mismatch:** The production `AIRunner.__init__` requires both `api_key` and `metrics_service`, but the prompt tester only passes `api_key`. The existing code uses `# type: ignore` to suppress the type error. We'll continue this pattern and pass `None` for metrics_service where needed, or create a stub metrics service for the prompt tester.
- **PartService dependency:** The duplicate search needs inventory data via `get_all_parts_for_search()`, but the prompt tester is standalone without database access. Resolution: Build a mock inventory dataset in the prompt tester itself.
- **No function calling in duplicate search:** Unlike the full schema tests that use `url_classifier`, duplicate search doesn't use function tools. The implementation must pass an empty array for `function_tools`.

## 1) Intent & Scope

**User intent**

Implement the missing `run_duplicate_search_tests()` function in the prompt tester to enable testing of AI-powered duplicate detection functionality. The function should test duplicate search queries against a mock inventory and save outputs to files for manual review.

**Prompt quotes**

"Implement the missing `run_duplicate_search_tests()` function in the prompt tester tool to enable testing of duplicate detection functionality."

"Do NOT include metrics tracking (this is a standalone testing tool)"

"Copy the duplicate search prompt from `app/services/prompts/duplicate_search.md` into the prompt tester"

"Follow the code pattern in `DuplicateSearchService::search_duplicates()` but without metrics"

**In scope**

- Implement `run_duplicate_search_tests()` function that accepts test queries with expected results
- Create a mock inventory dataset in the prompt tester for testing duplicate detection
- Copy and adapt the duplicate search prompt template from production code
- Call AI with the duplicate search prompt and parse structured `DuplicateMatchLLMResponse` responses
- Save test outputs to JSON, TXT, and LOG files following existing patterns
- Support testing multiple models and reasoning efforts (following `run_full_tests()` pattern)
- Create a stub metrics service or adapt AIRunner initialization for standalone use

**Out of scope**

- Integrating duplicate search function calling into `run_full_tests()` (deferred; change brief mentions this but it's a separate enhancement)
- Modifying production duplicate search code or schemas
- Adding database connectivity to the prompt tester
- Creating UI or interactive test runners
- Implementing actual duplicate matching logic (we test the AI, not replace it)

**Assumptions / constraints**

- The prompt tester remains a standalone tool with no database dependencies
- Test inventory data is hardcoded in Python (not loaded from JSON files)
- Output files follow the existing naming pattern: `{filename_prefix}.json`, `{filename_prefix}.txt`, `{filename_prefix}.log`
- The duplicate search prompt template is copied verbatim from production (with only path adjustments)
- AIRunner initialization must be adapted to work without a full MetricsService instance
- Tests are run manually by developers (no automation framework integration)

## 2) Affected Areas & File Map

- Area: `/work/backend/tools/prompttester/prompttester.py`
- Why: Add `run_duplicate_search_tests()` function and helper functions for duplicate search testing
- Evidence: Line 349-363 shows stub function that calls unimplemented `run_duplicate_search_tests()`; line 116-159 shows pattern for `run_full_tests()` that needs to be replicated

---

- Area: `/work/backend/tools/prompttester/prompt_duplicate_search.md` (new file)
- Why: Copy of duplicate search prompt template for standalone use in prompt tester
- Evidence: `/work/backend/app/services/prompts/duplicate_search.md` lines 1-62 contain the production template that must be copied

---

- Area: `/work/backend/tools/prompttester/prompttester.py` - `RunParameters` dataclass
- Why: May need to extend with duplicate search specific context (or reuse as-is)
- Evidence: Lines 96-104 define `RunParameters` with `url_classifier`; duplicate search has no function calling so can reuse existing structure

---

- Area: `/work/backend/tools/prompttester/prompttester.py` - AIRunner initialization
- Why: Need to handle AIRunner's `metrics_service` parameter for standalone context
- Evidence: Line 120 shows `AIRunner(os.getenv("OPENAI_API_KEY"))` with `# type: ignore` - needs proper stub or None handling

## 3) Data Model / Contracts

- Entity / contract: Mock inventory parts list
- Shape:
```json
[
  {
    "key": "ABCD",
    "manufacturer_code": "SN74HC595N",
    "type_name": "Shift Register",
    "description": "8-bit shift register with output latches",
    "tags": ["TTL", "THT", "DIP"],
    "manufacturer": "Texas Instruments",
    "package": "DIP-16",
    "series": "74HC",
    "voltage_rating": "2-6V",
    "pin_count": 16,
    "pin_pitch": "2.54mm"
  }
]
```
- Refactor strategy: No back-compat concerns; this is new test data. Build the dataset inline in Python using dictionaries matching the structure from `PartService.get_all_parts_for_search()`.
- Evidence: `/work/backend/app/services/part_service.py:152-187` defines the exact structure returned by `get_all_parts_for_search()`

---

- Entity / contract: `DuplicateMatchLLMResponse` (from production schemas, used as-is)
- Shape:
```json
{
  "matches": [
    {
      "part_key": "ABCD",
      "confidence": "high",
      "reasoning": "Exact manufacturer part number match with same manufacturer"
    }
  ]
}
```
- Refactor strategy: Import directly from `app.schemas.duplicate_search` - no changes needed
- Evidence: `/work/backend/app/schemas/duplicate_search.py:49-60` defines `DuplicateMatchLLMResponse`

---

- Entity / contract: Test query definition tuple
- Shape: `list[tuple[str, list[tuple[str, str]]]]` where each tuple is `(query_string, [(part_key, expected_confidence), ...])`
- Refactor strategy: New format designed for duplicate search tests. First element is the search query, second element is list of expected matches with part keys and confidence levels.
- Evidence: `/work/backend/tools/prompttester/prompttester.py:350-361` shows example test data structure in `duplicate_search_tests()`

## 4) API / Integration Surface

Not applicable - this is a standalone testing tool with no API endpoints or external integration surfaces. All interactions are through direct Python function calls and file I/O.

## 5) Algorithms & State Machines

- Flow: Duplicate search test execution
- Steps:
  1. Load mock inventory data (hardcoded Python list)
  2. For each test query:
     - For each model configuration:
       - For each reasoning effort level:
         - For each run iteration:
           - Build system prompt by rendering template with inventory JSON
           - Set user prompt to the query string
           - Clear log interceptor buffer
           - Save prompt to `{prefix}_prompt.txt`
           - Call AIRunner with `DuplicateMatchLLMResponse` as response model
           - Parse response and extract matches
           - Save response JSON to `{prefix}.json`
           - Save metrics (tokens, cost, time) to `{prefix}.txt`
           - Save captured logs to `{prefix}.log`
           - Handle exceptions and save to `{prefix}.err`
  3. All test outputs written to `tools/prompttester/output/` directory
- States / transitions: No state machine; linear execution with exception handling
- Hotspots: Rendering large inventory JSON into prompt context (could exceed token limits with hundreds of parts); AI call latency; file I/O for saving outputs
- Evidence: `/work/backend/tools/prompttester/prompttester.py:116-159` shows the full test orchestration pattern; `/work/backend/app/services/duplicate_search_service.py:60-180` shows the production flow to adapt

## 6) Derived State & Invariants

- Derived value: Mock inventory JSON string
  - Source: Hardcoded Python list of part dictionaries (unfiltered, complete test dataset)
  - Writes / cleanup: Rendered into prompt template string; embedded in system prompt sent to AI
  - Guards: No guards needed - this is static test data, not filtered production data
  - Invariant: Mock inventory must match the exact structure returned by `PartService.get_all_parts_for_search()` so tests are realistic
  - Evidence: `/work/backend/app/services/duplicate_search_service.py:182-197` shows how inventory JSON is built and rendered

---

- Derived value: Test output filename prefix
  - Source: Constructed from query key, model name, reasoning effort, and run number
  - Writes / cleanup: Used to create multiple output files (JSON, TXT, LOG, ERR)
  - Guards: Filesystem path sanitization (none currently, assumes valid input)
  - Invariant: Prefix must be unique per test run to avoid overwriting outputs
  - Evidence: `/work/backend/tools/prompttester/prompttester.py:132-135` shows prefix construction pattern

---

- Derived value: Captured log lines (thread-local)
  - Source: All log statements during AI execution collected by `LogInterceptor`
  - Writes / cleanup: Written to `{prefix}.log` file after each test run; buffer cleared before next run
  - Guards: Thread-local storage ensures isolated log capture per test in concurrent scenarios
  - Invariant: Log buffer must be cleared (`log_interceptor.clear()`) before each test run to prevent log leakage between tests
  - Evidence: `/work/backend/tools/prompttester/prompttester.py:31-64` defines LogInterceptor; line 279 shows `log_interceptor.clear()` pattern

## 7) Consistency, Transactions & Concurrency

- Transaction scope: None - no database operations. File writes are independent per test run.
- Atomic requirements: None - each output file is written independently. Partial writes are acceptable (test can be re-run).
- Retry / idempotency: File existence check allows skipping already-completed tests (line 275-277 in prompttester.py shows this pattern for JSON files). Tests are idempotent - running twice produces identical outputs.
- Ordering / concurrency controls: Thread-local log interceptor allows concurrent test execution without log corruption. No explicit locking needed since each test writes to uniquely named files.
- Evidence: `/work/backend/tools/prompttester/prompttester.py:31-64` shows thread-local LogInterceptor pattern; lines 273-315 show file-write pattern with existence check for idempotency

## 8) Errors & Edge Cases

- Failure: AI call fails (network error, rate limit, API error)
- Surface: `run_duplicate_search_tests()` via `call_ai()` helper
- Handling: Exception caught in outer loop, traceback saved to `{prefix}.err` file, test continues to next query/model/run
- Guardrails: Timeout handled by AIRunner; retry logic not implemented (tests are meant to be re-run manually)
- Evidence: `/work/backend/tools/prompttester/prompttester.py:151-158` shows exception handling pattern with `.err` file output

---

- Failure: AI returns invalid JSON structure (doesn't match `DuplicateMatchLLMResponse` schema)
- Surface: `call_ai()` when parsing response
- Handling: Pydantic ValidationError raised, caught by outer exception handler, saved to `.err` file
- Guardrails: Pydantic validation ensures only valid responses are processed; invalid responses cause test failure (captured in `.err`)
- Evidence: `/work/backend/app/services/duplicate_search_service.py:158-168` shows ValidationError handling pattern from production code

---

- Failure: Empty inventory (no parts to search against)
- Surface: `run_duplicate_search_tests()` when rendering prompt
- Handling: Valid scenario - prompt includes empty array, AI should return zero matches
- Guardrails: Test should include this edge case explicitly to verify behavior
- Evidence: `/work/backend/app/services/duplicate_search_service.py:82-91` shows production handling of empty inventory

---

- Failure: Mock inventory structure doesn't match production format
- Surface: AI analysis may produce unrealistic results if data structure is wrong
- Handling: No runtime detection - manual verification needed by comparing test outputs
- Guardrails: Strict adherence to structure from `PartService.get_all_parts_for_search()` when building mock data
- Evidence: `/work/backend/app/services/part_service.py:152-187` defines authoritative structure

---

- Failure: File write permission error
- Surface: Any of the file write operations (`{prefix}.json`, `.txt`, `.log`, `.err`)
- Handling: Exception propagates, test run aborts (no explicit handling)
- Guardrails: Ensure output directory exists and is writable before running tests
- Evidence: `/work/backend/tools/prompttester/prompttester.py:118-123` shows directory creation with `os.makedirs(tmp_path, exist_ok=True)`

## 9) Observability / Telemetry

- Signal: Test execution logs
- Type: Structured logs captured by LogInterceptor
- Trigger: All log statements during AI execution; saved to `{prefix}.log` after each test completes
- Labels / fields: Timestamp, log level, logger name, message (standard Python logging format)
- Consumer: Manual review by developer running tests
- Evidence: `/work/backend/tools/prompttester/prompttester.py:26-29` shows logging configuration; lines 312-313 show log file writing

---

- Signal: AI call metrics (tokens, cost, elapsed time)
- Type: Structured text file with key-value pairs
- Trigger: After each AI call completes; saved to `{prefix}.txt`
- Labels / fields: elapsed_time, input_tokens, cached_input_tokens, output_tokens, reasoning_tokens, cost
- Consumer: Manual review for performance analysis and cost tracking
- Evidence: `/work/backend/tools/prompttester/prompttester.py:303-310` shows metrics file writing pattern

---

- Signal: Test run progress
- Type: Console log output (INFO level)
- Trigger: Start of each test run with query, model, reasoning effort details
- Labels / fields: query, query_key, model, reasoning_effort
- Consumer: Developer console during test execution
- Evidence: `/work/backend/tools/prompttester/prompttester.py:138` shows progress logging pattern

---

- Signal: Test failures
- Type: Error files (`{prefix}.err`) with exception type, message, and stack trace
- Trigger: When test run raises unhandled exception
- Labels / fields: Exception type, message, full stack trace
- Consumer: Manual review to debug test failures
- Evidence: `/work/backend/tools/prompttester/prompttester.py:154-158` shows error file writing pattern

## 10) Background Work & Shutdown

Not applicable - the prompt tester is a synchronous, short-lived command-line tool with no background workers, threads, or long-running processes. Test execution is sequential and completes when all tests finish.

## 11) Security & Permissions

Not applicable - this is a standalone development tool with no authentication, authorization, or sensitive data handling. The only security consideration is ensuring the OpenAI API key is loaded from environment variables (already implemented).

## 12) UX / UI Impact

Not applicable - this is a command-line tool with no user interface. The only user interaction is running the Python script directly and reviewing output files manually.

## 13) Deterministic Test Plan

- Surface: `run_duplicate_search_tests()` function
- Scenarios:
  - Given an inventory with one part with MPN "SN74HC595N", When searching for "Part number SN74HC595N", Then expect high confidence match on that part key
  - Given an inventory with multiple 10k resistors, When searching for "10k resistor", Then expect medium confidence matches on resistor parts
  - Given an inventory with SMD and THT 10k resistors, When searching for "10k SMD resistor", Then expect high confidence match on the SMD resistor and possibly medium confidence on THT
  - Given an empty inventory, When searching for any query, Then expect zero matches returned
  - Given an inventory with unrelated parts, When searching for a non-existent part, Then expect zero matches returned
  - Given multiple test queries, When running full test suite, Then each query produces separate output files with unique filenames
- Fixtures / hooks: Mock inventory dataset hardcoded in `run_duplicate_search_tests()`; stub metrics service or None handling for AIRunner initialization
- Gaps: No automated assertion checking (outputs are saved to files for manual review). This is acceptable for a prompt testing tool where human judgment is required to evaluate AI quality.
- Evidence: `/work/backend/tools/prompttester/prompttester.py:349-363` shows example test structure; production has comprehensive tests in `tests/services/test_duplicate_search_service.py` (not reviewed but assumed to exist)

---

- Surface: Mock inventory dataset
- Scenarios:
  - Given mock inventory is defined, When building inventory dataset, Then structure must exactly match `PartService.get_all_parts_for_search()` output
  - Given mock inventory includes nullable fields, When rendering JSON, Then null values are included (not omitted)
  - Given inventory has parts from different manufacturers, When testing, Then manufacturer matching works correctly
- Fixtures / hooks: Inline Python dictionaries in test file; validation by visual inspection against production structure
- Gaps: No automated validation that mock structure matches production. Manual verification required.
- Evidence: `/work/backend/app/services/part_service.py:167-185` shows exact field structure to replicate

---

- Surface: Prompt template rendering
- Scenarios:
  - Given mock inventory JSON, When rendering prompt template, Then parts_json variable is substituted correctly
  - Given large inventory (50+ parts), When rendering template, Then JSON is properly formatted with indentation
  - Given template file is missing, When initializing, Then error is raised early (not during test execution)
- Fixtures / hooks: Copy of `prompt_duplicate_search.md` in prompttester directory; Jinja2 Environment for rendering
- Gaps: No test for template rendering in isolation (only tested end-to-end through AI calls)
- Evidence: `/work/backend/tools/prompttester/prompttester.py:107-114` shows template rendering pattern

---

- Surface: File output writing
- Scenarios:
  - Given successful AI response, When test completes, Then JSON, TXT, and LOG files are all created
  - Given test fails with exception, When exception is caught, Then ERR file is created with stack trace
  - Given output file already exists, When test runs again, Then existing JSON file causes test to be skipped (idempotency)
  - Given invalid filesystem path, When writing output, Then error propagates and test suite aborts
- Fixtures / hooks: Filesystem access to `tools/prompttester/output/` directory; `os.makedirs` ensures directory exists
- Gaps: No cleanup of old output files (manual cleanup required between test runs if fresh outputs are desired)
- Evidence: `/work/backend/tools/prompttester/prompttester.py:273-315` shows complete file writing logic

## 14) Implementation Slices

Not needed - this is a small, focused change that can be implemented in a single pass. The function structure directly mirrors existing patterns in the prompt tester.

## 5) Risks & Open Questions

- Risk: AIRunner initialization requires `metrics_service` parameter but prompttester passes only `api_key`
- Impact: Type error and potential runtime error if metrics are accessed
- Mitigation: Create a minimal stub `MetricsServiceProtocol` implementation in prompttester that no-ops all metric methods, or modify AIRunner to accept optional metrics_service

---

- Risk: Mock inventory data structure diverges from production `get_all_parts_for_search()` format
- Impact: Tests produce unrealistic results that don't reflect production behavior
- Mitigation: Copy exact field names and types from `PartService.get_all_parts_for_search()`; add comment with source reference; periodic manual verification

---

- Risk: Large inventory JSON exceeds AI model context window limits
- Impact: AI call fails with context length error
- Mitigation: Keep mock inventory small (10-20 parts) for testing; document maximum practical inventory size; consider truncation strategy if needed

---

- Risk: Prompt template changes in production but prompttester copy becomes stale
- Impact: Tests don't reflect production prompt behavior
- Mitigation: Add comment in prompttester template noting the source and last sync date; manual sync required when production prompt changes

---

- Risk: Test outputs accumulate over time filling disk space
- Impact: Developer's disk fills up with old test outputs
- Mitigation: Document manual cleanup procedure; consider adding `.gitignore` for output directory (already exists)

## 16) Confidence

Confidence: High — The implementation follows well-established patterns already present in the prompttester tool, adapts production code that is known to work, and has minimal dependencies. The main uncertainty is the AIRunner initialization, which has a clear mitigation path (stub metrics service). All required components are present in the codebase and no external dependencies are needed.
