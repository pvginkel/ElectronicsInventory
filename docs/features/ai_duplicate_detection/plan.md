# AI Duplicate Detection - Technical Plan

## 0) Research Log & Findings

### Discovery Areas

**AI Part Analysis Infrastructure**
- Examined `/work/backend/app/api/ai_parts.py:36-124` - POST `/ai-parts/analyze` endpoint accepts text/image and starts a background task
- Examined `/work/backend/app/services/ai_part_analysis_task.py` - background task orchestrates AI analysis via `AIService`
- Examined `/work/backend/app/services/ai_service.py:58-172` - `analyze_part()` method calls OpenAI, processes URLs, returns `AIPartAnalysisResultSchema`
- Current flow: user input → background task → AI analysis → return suggestions → user creates part

**LLM Function Calling Pattern**
- Examined `/work/backend/app/utils/ai/ai_runner.py:1-200` - `AIRunner` supports function calling with `AIFunction` interface
- Examined `/work/backend/app/utils/ai/url_classification.py` - existing function calling implementation (`URLClassifierFunction`)
- Pattern: main LLM can call functions, which are implemented via separate logic (could be another LLM call)
- Function interface: `get_name()`, `get_description()`, `get_model()`, `execute(request, progress_handle)`

**Part Model & Search Capabilities**
- Examined `/work/backend/app/models/part.py` - Part has: `key`, `manufacturer_code`, `type_id`, `description`, `tags`, `manufacturer`, `product_page`, `seller_id`, `seller_link`, plus technical fields (package, pin_count, voltage_rating, series, etc.)
- Examined `/work/backend/app/services/part_service.py:1-150` - PartService has `get_part()`, `get_parts_list()`, but NO search method currently
- No existing search/similarity API endpoint found - this is a gap

**Schema Definitions**
- Examined `/work/backend/app/schemas/ai_part_analysis.py` - response schemas for AI analysis results
- Current `AIPartAnalysisResultSchema` includes fields like `manufacturer_code`, `type`, `description`, `tags`, etc.
- No existing schema for duplicate detection results

**Testing Patterns**
- Examined `/work/backend/tests/test_ai_service.py:1-100` - mocking approach using dummy responses and `StubMetricsService`
- AI tests use `OPENAI_DUMMY_RESPONSE_PATH` config to avoid real API calls during testing

### Key Findings

1. **Function calling infrastructure exists**: `AIRunner` already supports chaining through `AIFunction` interface
2. **No search capability**: Part service has no search/similarity method - needs implementation
3. **Schema gaps**: Need schemas for duplicate search request/response
4. **Single LLM chain point**: The main AI analysis happens in `AIService.analyze_part()` - this is where we inject the duplicate check
5. **Background task integration**: Changes must flow through `AIPartAnalysisTask` to maintain progress reporting

### Conflicts & Resolutions

**Conflict**: User requirement mentions "dump of ALL parts in JSON format" but this won't scale for large inventories.

**Resolution**: Use full dump of ALL parts with ONLY pertinent fields (key identifiers and technical specs - no quantity, location, images, documents). This keeps context manageable while providing complete inventory coverage. Window sizes are increasing and for this project's scope (hobby use, ~500-1000 parts), a full dump is the simplest, most effective solution. Alternative approaches would introduce unnecessary complexity. Document scaling limits in risks.

**Conflict**: Who decides whether to return duplicates or continue with analysis?

**Resolution**: The main LLM follows directive prompt instructions. After calling the duplicate search function and receiving results, the LLM is instructed to return `duplicate_parts` only if any high-confidence match exists, otherwise proceed with full `analysis_result`. The behavior is enforced via clear, directive prompt engineering rather than code validation.

---

## 1) Intent & Scope

**User intent**

Enhance the AI Part Analysis feature to detect duplicate parts and let the LLM decide how to handle them. The system should search existing inventory when analyzing a new part, and the LLM decides whether to return duplicate parts only (stopping analysis) or continue with full analysis. The response schema must clearly distinguish between these two paths.

**Prompt quotes**

"check whether a part already exists in the inventory before proceeding with full analysis"

"LLM uses a function call to search for existing parts"

"Function is implemented via a separate LLM call (chaining)"

"make it so that the LLM decides what to do with the results of the duplicate search"

"add instructions that it should check for duplicates, and how it should handle medium and high confidence results"

"I prefer that the response schema of the main chat has a clear option to only return parts"

"top level of the response schema should be something like { 'analysis_result': { ... }?, 'duplicate_parts': [ ... ]? }"

"regardless of whether there is one or multiple high confidence results, the duplicate part always needs to be a collection"

**In scope**

- Implement duplicate search function callable from main AI analysis LLM
- Create second LLM chain to perform similarity matching against full inventory
- Define JSON format for parts dump (all parts with pertinent fields: identifiers and technical specs)
- Define simple free-form request schema and structured response schema for duplicate search function
- Modify main LLM response schema to have two mutually exclusive paths: `analysis_result` OR `duplicate_parts` (array)
- Update prompt to instruct LLM on when to check duplicates and how to handle high/medium confidence results
- Modify AI analysis API response schema to clearly indicate duplicate-only vs analysis result paths
- Update background task to handle both response types
- Add service method to dump all parts in search-optimized format

**Out of scope**

- UI changes (separate story per user request)
- Search optimization (pagination, filtering, indexing) - deferred for performance monitoring
- Fuzzy matching algorithms beyond LLM-based similarity
- User feedback loop on duplicate accuracy
- Duplicate merge/consolidation workflows

**Assumptions / constraints**

- Inventory size remains under ~1000 parts (hobby use case) so full dump of all parts is acceptable
- LLM function calling (OpenAI function calling API) is already proven and working via existing `AIRunner` infrastructure
- **Duplicate detection runs ONLY during AI Part Analysis flow, NOT during manual part creation**
- Users will manually review and decide on "likely duplicates" in frontend (UI changes out of scope)
- Database session management follows existing `BaseService` pattern with proper transaction handling
- AI functionality already gated by existing mechanisms; no additional feature gate needed for this enhancement

---

## 2) Affected Areas & File Map

- Area: `/work/backend/app/services/ai_service.py` - `AIService.analyze_part()` method
- Why: Add duplicate search function to function tools array
- Evidence: `ai_service.py:58-172` shows main analysis flow; function tools passed to `AIRunner.run()` at line 112

- Area: `/work/backend/app/services/prompts/prompt.md` - Main AI analysis prompt
- Why: Add instructions for LLM on duplicate checking with clear, directive decision rules:
  - **Rule 1**: Once confident you know what part user is referring to, call `find_duplicates` function
  - **Rule 2**: If duplicate search returns results, populate `duplicate_parts` array with ALL results (high and medium confidence)
  - **Rule 3**: If ANY result has high confidence, do NOT proceed with full analysis - return duplicate_parts only
  - **Rule 4**: Only proceed with full analysis (populate `analysis_result`) if no high confidence matches exist
  - **Rule 5**: If no duplicates found or search not called, populate `analysis_result` normally
  - Must include examples: (a) high confidence match → return duplicate_parts ONLY, (b) only medium confidence → proceed with analysis_result, (c) no matches → analysis_result
- Evidence: Existing prompt template with Jinja2 structure

- Area: `/work/backend/app/utils/ai/duplicate_search.py` (NEW)
- Why: Implement `DuplicateSearchFunction` following `AIFunction` interface pattern
- Evidence: `url_classification.py:29-44` shows AIFunction implementation pattern

- Area: `/work/backend/app/services/duplicate_search_service.py` (NEW)
- Why: Orchestrate the second LLM call for similarity matching; emit metrics for duplicate search operations
- Evidence: Pattern mirrors `AIService` structure with prompt building and LLM invocation; requires `MetricsService` dependency injection

- Area: `/work/backend/app/services/part_service.py`
- Why: Add method to dump all parts in JSON-compatible format for duplicate search
- Evidence: `part_service.py:103-112` shows existing part listing; need search-optimized variant

- Area: `/work/backend/app/schemas/duplicate_search.py` (NEW)
- Why: Define Pydantic schemas for duplicate search request (free-form), response, and LLM output
- Evidence: Pattern follows `ai_part_analysis.py` and `url_classification.py` schema definitions

- Area: `/work/backend/app/schemas/ai_part_analysis.py`
- Why: Restructure `AIPartAnalysisResultSchema` to have two mutually exclusive top-level fields: `analysis_result` and `duplicate_parts`
- Evidence: `ai_part_analysis.py:135-152` defines current result schema

- Area: `/work/backend/app/services/ai_part_analysis_task.py`
- Why: Handle both response paths (analysis_result vs duplicate_parts); validate structure
- Evidence: `ai_part_analysis_task.py:23-108` shows task execution flow

- Area: `/work/backend/app/services/container.py`
- Why: Wire new `DuplicateSearchService` into DI container
- Evidence: `container.py:171-180` shows ai_service factory wiring pattern

- Area: `/work/backend/tests/test_duplicate_search_service.py` (NEW)
- Why: Service tests for duplicate search logic
- Evidence: Testing pattern follows `test_ai_service.py` with mocked LLM responses

- Area: `/work/backend/tests/test_ai_service_duplicate_integration.py` (NEW)
- Why: Integration test for end-to-end duplicate detection flow
- Evidence: Test pattern similar to `test_ai_service_real_integration.py`

- Area: `/work/backend/app/services/prompts/duplicate_search.md` (NEW)
- Why: LLM prompt template for duplicate matching logic
- Evidence: `prompt.md` shows existing prompt structure with Jinja2 templating

- Area: `/work/backend/app/data/test_data/*.json` (VERIFY)
- Why: Verify test data fixtures are compatible with schema changes; update if needed
- Evidence: Development guidelines require test data maintenance when schema changes (per `CLAUDE.md` Test Data Management section)

---

## 3) Data Model / Contracts

- Entity / contract: `PartSummaryForSearch` (internal Python dataclass/dict)
- Shape:
  ```json
  {
    "key": "ABCD",
    "manufacturer_code": "OMRON G5Q-1A4",
    "type_name": "Relay",
    "description": "5V SPST relay with coil suppression",
    "tags": ["5v", "spst", "relay"],
    "manufacturer": "OMRON",
    "package": "THT",
    "series": "G5Q",
    "voltage_rating": "5V",
    "pin_count": 5
  }
  ```
- Refactor strategy: New format specific to duplicate search; full dump of ALL parts but only pertinent fields for matching (key identifiers and technical specs). Excludes quantity, location, images, documents. No back-compat needed.
- Evidence: Based on Part model fields at `part.py:36-64`

- Entity / contract: `DuplicateSearchRequest` (Pydantic schema for function calling)
- Shape:
  ```json
  {
    "search": "OMRON G5Q-1A4 5V SPST relay, THT package, 5 pins"
  }
  ```
- Refactor strategy: New schema; free-form search string with component description and technical details (MPN, package, voltage rating, pin count, manufacturer, etc.) extracted from user input by main LLM. Intentionally simple to allow flexibility.
- Evidence: Pattern follows `ClassifyUrlsRequest` at `url_classification.py:10-14`

- Entity / contract: `DuplicateSearchResponse` (Pydantic schema for function result)
- Shape:
  ```json
  {
    "matches": [
      {
        "part_key": "ABCD",
        "confidence": "high",
        "reasoning": "Exact MPN match with same manufacturer"
      },
      {
        "part_key": "XYZW",
        "confidence": "medium",
        "reasoning": "Same type and voltage, but different series"
      }
    ]
  }
  ```
- Refactor strategy: New schema; confidence enum (high/medium only - low confidence matches not returned)
- Evidence: Pattern follows `ClassifyUrlsResponse` at `url_classification.py:23-27`

- Entity / contract: `AIPartAnalysisResultSchema` (existing, heavily modified)
- Shape:
  ```json
  {
    "analysis_result": {  // NEW: full analysis (optional, populated when LLM does full analysis)
      "manufacturer_code": "...",
      "type": "...",
      "description": "...",
      // ... all existing analysis fields
    },
    "duplicate_parts": [  // NEW: array of duplicates found (optional, populated when LLM finds duplicates)
      {
        "part_key": "ABCD",
        "confidence": "high",
        "reasoning": "Exact MPN match"
      },
      {
        "part_key": "XYZW",
        "confidence": "medium",
        "reasoning": "Similar specs but different manufacturer"
      }
    ]
  }
  ```
- Refactor strategy: Breaking change - restructure top level to have two optional fields. Both fields are optional in Pydantic schema. LLM prompt guidance ensures only one path is taken. Frontend checks which field is populated to determine rendering path.
- Evidence: Existing schema at `ai_part_analysis.py:32-132`

- Entity / contract: `DuplicateMatchLLMResponse` (internal Pydantic for LLM structured output)
- Shape:
  ```json
  {
    "matches": [
      {
        "part_key": "ABCD",
        "confidence": "high",
        "reasoning": "Exact manufacturer part number match"
      }
    ]
  }
  ```
- Refactor strategy: Internal to DuplicateSearchService; LLM returns confidence as "high" or "medium" directly. Only medium or high confidence matches should be included (low confidence filtered out by LLM). Response passed through to DuplicateSearchResponse.
- Evidence: Pattern follows `PartAnalysisSuggestion` at `ai_model.py:13-33`

---

## 4) API / Integration Surface

- Surface: POST `/ai-parts/analyze` (existing endpoint, modified behavior)
- Inputs: No change to request format (multipart text/image)
- Outputs:
  - If LLM returns duplicates: `{"success": true, "analysis": {"duplicate_parts": [{"part_key": "ABCD", "confidence": "high", "reasoning": "..."}, {"part_key": "XYZW", "confidence": "medium", "reasoning": "..."}], "analysis_result": null}}`
  - If LLM continues with analysis: `{"success": true, "analysis": {"analysis_result": {<all normal fields>}, "duplicate_parts": null}}`
  - Both fields are optional; LLM prompt guidance ensures appropriate population
- Errors: No new validation errors; existing validation/AI failures still apply
- Evidence: `ai_parts.py:36-124` - endpoint returns `AIPartAnalysisTaskResultSchema`

- Surface: Internal function call `find_duplicates` (exposed to main LLM)
- Inputs: JSON object with component info (MPN, description, tags, etc.)
- Outputs: JSON array of matches with confidence and reasoning
- Errors: Function catches exceptions and returns empty matches array
- Evidence: Function calling pattern at `ai_runner.py:143-175`

---

## 5) Algorithms & State Machines

- Flow: AI Part Analysis with Duplicate Detection
- Steps:
  1. User submits text/image to `/ai-parts/analyze` endpoint
  2. Background task starts, calls `AIService.analyze_part()`
  3. Main LLM receives user prompt + system instructions (with duplicate handling guidance) + `find_duplicates` function tool
  4. LLM understands the part from user input (vague or specific)
  5. LLM decides to call `find_duplicates` function with extracted component info
  6. `DuplicateSearchFunction.execute()` triggered:
     a. Calls `PartService.get_all_parts_for_search()` to get inventory dump
     b. Calls `DuplicateSearchService.search_duplicates()`
     c. Second LLM receives component info + parts dump + matching prompt
     d. Second LLM returns structured matches with confidence scores
     e. Convert to `DuplicateSearchResponse` and return to main LLM
  7. Main LLM receives function result with match candidates
  8. **LLM decides based on directive prompt rules**:
     - **Rule 1**: Once LLM is confident it knows what part user is referring to, call `find_duplicates` function
     - **Rule 2**: If duplicate search returns results, populate `duplicate_parts` array (includes both high and medium confidence matches)
     - **Rule 3**: If ANY result has high confidence, do NOT proceed with full analysis - return duplicate_parts only
     - **Rule 4**: Only proceed with full analysis (populate `analysis_result`) if no high confidence matches exist
     - **Rule 5**: If no duplicates found or search not called, populate `analysis_result` normally
     - Prompt provides directive instructions; behavior enforced via prompt engineering, not code
  9. `AIService.analyze_part()` receives LLM structured output (no validation)
  10. Background task receives result (checks which field is populated)
  11. Task completes and returns result to frontend via SSE
- States / transitions: No state machine; linear flow with conditional branching
- Hotspots:
  - Parts dump size could grow with inventory (currently unfiltered)
  - Two sequential LLM calls add latency (main + duplicate search)
  - Second LLM call processes potentially 1000+ part records
- Evidence: Task flow at `ai_part_analysis_task.py:37-101`; AI runner chaining at `ai_runner.py:105-122`

- Flow: Duplicate Search LLM Chain (internal to function)
- Steps:
  1. Receive `DuplicateSearchRequest` with free-form search string
  2. Load ALL parts via `PartService.get_all_parts_for_search()` (full inventory dump with pertinent fields only)
  3. Build prompt: instructions + search string + JSON dump of all parts
  4. Call OpenAI with `DuplicateMatchLLMResponse` as structured output schema
  5. Parse response into list of matches with confidence levels (high/medium)
  6. LLM instructed via prompt to only return medium or high confidence matches (filter out low confidence)
  7. Return `DuplicateSearchResponse` with matches
- States / transitions: None
- Hotspots:
  - Prompt size grows with number of parts (could hit token limits at ~1000+ parts)
  - JSON parsing of LLM response (error handling needed)
  - Full inventory dump every request (no caching)
- Evidence: Similar prompt building at `ai_service.py:178-189`

---

## 6) Derived State & Invariants

- Derived value: Confidence level (high/medium)
  - Source: Unfiltered - LLM directly outputs qualitative confidence assessment ("high" or "medium")
  - Writes / cleanup: No persistence; passed through to main LLM for decision-making
  - Guards: LLM prompt instructions to only return medium or high confidence matches
  - Invariant: Only matches with confidence of "medium" or "high" appear in duplicate search response (no low confidence)
  - Evidence: N/A (new code)

- Derived value: Response path selection (analysis_result vs duplicate_parts)
  - Source: Unfiltered - Main LLM directly chooses which top-level field to populate based on duplicate search results and prompt guidance
  - Writes / cleanup: No database writes; controls frontend rendering path (analysis UI vs duplicate selection UI)
  - Guards: LLM prompt provides clear decision rules; both fields are optional in Pydantic; no backend validation enforced (trust LLM to follow instructions)
  - Invariant: Under normal operation, exactly one field should be populated (LLM-enforced via prompt, not code-enforced); frontend must handle edge cases where both or neither are populated
  - Evidence: Prompt instructions and response schema definition

- Derived value: Parts inventory dump (JSON snapshot)
  - Source: Unfiltered - live query of all parts at function execution time
  - Writes / cleanup: No writes; read-only snapshot passed to LLM
  - Guards: Database session transaction ensures consistent snapshot
  - Invariant: Dump reflects database state at call time; no caching across requests
  - Evidence: Similar query pattern at `part_service.py:103-112`

---

## 7) Consistency, Transactions & Concurrency

- Transaction scope: Duplicate search operates within read-only transaction provided by background task session
- Atomic requirements: None; no writes occur during duplicate detection
- Retry / idempotency: Function calling is idempotent (same inputs = same results); LLM may vary slightly but function can be retried safely
- Ordering / concurrency controls:
  - No locks needed; read-only operation
  - Parts dump query runs in task's transaction context
  - No cross-request state or caching
- Evidence: Session management at `ai_part_analysis_task.py:23` - task receives session from `BaseSessionTask`

---

## 8) Errors & Edge Cases

- Failure: LLM function call fails (network, API error, timeout)
- Surface: `DuplicateSearchFunction.execute()`
- Handling: Catch all exceptions, log error, return empty matches array (allows main analysis to continue)
- Guardrails: Wrap function execution in try/except; metrics tracking for failure rate
- Evidence: Similar error handling in `URLClassifierFunctionImpl` at `ai_service.py:306-307`

- Failure: Parts dump query returns 0 results (empty inventory)
- Surface: `PartService.get_all_parts_for_search()`
- Handling: Return empty list; duplicate search returns no matches (expected behavior)
- Guardrails: Handle empty list in prompt building; LLM prompt states "no existing parts" case
- Evidence: Query pattern at `part_service.py:112`

- Failure: Second LLM returns invalid JSON or wrong schema
- Surface: `DuplicateSearchService.search_duplicates()`
- Handling: Pydantic validation fails, catch ValidationError, log and return empty matches
- Guardrails: Strict schema validation with Pydantic; fallback to empty result on parse errors
- Evidence: Similar validation at `ai_service.py:174-176`

- Failure: LLM returns confidence value other than "high" or "medium"
- Surface: `DuplicateSearchService.search_duplicates()`
- Handling: Pydantic enum validation rejects invalid values; match filtered out; log warning
- Guardrails: Pydantic Literal type constrains to ["high", "medium"]
- Evidence: Enum validation pattern throughout Pydantic schemas

- Failure: Main LLM decides not to call duplicate search function
- Surface: `AIService.analyze_part()`
- Handling: Expected behavior; not all inputs warrant duplicate search (e.g., generic "5V relay")
- Guardrails: LLM prompt guidance on when to search; no enforcement needed
- Evidence: Function calling is optional per OpenAI API design

- Failure: High confidence match on deleted or invalid part key
- Surface: Frontend attempting to navigate to returned part_key
- Handling: Frontend validates part exists before navigation; backend includes key in response without validation
- Guardrails: Document that part_key is informational; frontend must verify before use
- Evidence: Part lookup at `part_service.py:80-86` - raises RecordNotFoundException

---

## 9) Observability / Telemetry

- Signal: `ai_duplicate_search_requests_total`
- Type: Counter
- Trigger: Each time duplicate search function is called
- Labels / fields: `outcome` (success/error/empty)
- Consumer: Metrics dashboard to track duplicate search usage
- Evidence: Existing metrics pattern at `metrics_service.py`

- Signal: `ai_duplicate_search_matches_found`
- Type: Histogram
- Trigger: After successful duplicate search
- Labels / fields: `confidence_level` (high/medium)
- Consumer: Monitor distribution of match confidence levels
- Evidence: Histogram usage for distributions in metrics service

- Signal: `ai_duplicate_search_duration_seconds`
- Type: Histogram
- Trigger: On completion of duplicate search (success or error)
- Labels / fields: None
- Consumer: Track latency of second LLM chain
- Evidence: Duration tracking pattern at `ai_service.py`

- Signal: `ai_duplicate_search_parts_dump_size`
- Type: Gauge
- Trigger: Each duplicate search execution
- Labels / fields: None
- Consumer: Monitor inventory growth impacting search performance
- Evidence: Gauge usage for current state values

- Signal: Structured log "Duplicate search found N matches"
- Type: Structured log (INFO level)
- Trigger: After duplicate search completes
- Labels / fields: `part_count`, `match_count`, `high_confidence_count`
- Consumer: Debugging and audit trail
- Evidence: Logging pattern at `ai_service.py:193-194`

---

## 10) Background Work & Shutdown

- Worker / job: No new background workers
- Trigger cadence: N/A - duplicate search runs synchronously within existing AI analysis task
- Responsibilities: N/A
- Shutdown handling: Existing task cancellation handled by `AIPartAnalysisTask.is_cancelled` checks
- Evidence: Cancellation at `ai_part_analysis_task.py:53-54`

---

## 11) Security & Permissions

Not applicable - no new authentication, authorization, or sensitive data handling beyond existing AI service patterns.

---

## 12) UX / UI Impact

Not applicable - UI changes explicitly out of scope per user requirements.

---

## 13) Deterministic Test Plan

- Surface: `DuplicateSearchService.search_duplicates()`
- Scenarios:
  - Given 3 parts in inventory with different MPNs, When searching for exact MPN match, Then return 1 high-confidence match
  - Given part with similar description but different MPN, When searching, Then return 1 medium-confidence match
  - Given empty inventory, When searching, Then return 0 matches
  - Given LLM returns malformed JSON, When parsing response, Then log error and return empty matches
  - Given search for generic component ("relay"), When multiple similar parts exist, Then return multiple medium-confidence matches
- Fixtures / hooks:
  - Mock PartService with controllable parts list
  - Mock AIRunner with canned LLM responses
  - Test parts factory with varied attributes (tests create their own duplicate-prone parts as needed)
- Gaps: Real LLM behavior testing deferred to integration tests with `OPENAI_DUMMY_RESPONSE_PATH`
- Evidence: Test pattern at `test_ai_service.py:98-100` for mock responses

- Surface: `DuplicateSearchFunction.execute()`
- Scenarios:
  - Given valid component info, When function called, Then return structured response with matches
  - Given DuplicateSearchService raises exception, When function called, Then catch and return empty matches
  - Given PartService returns 100 parts, When building prompt, Then all parts included in JSON dump
- Fixtures / hooks:
  - Mock DuplicateSearchService
  - Mock PartService with test data
  - StubProgressHandle for progress reporting
- Gaps: None
- Evidence: Function testing pattern similar to URL classification tests

- Surface: `AIService.analyze_part()` with duplicate detection
- Scenarios:
  - Given LLM returns duplicate_parts populated with analysis_result null, When processing response, Then pass through to task
  - Given LLM returns analysis_result populated with duplicate_parts null, When processing response, Then pass through to task
  - Given duplicate_parts has multiple matches (mix of high and medium confidence), When processing response, Then return all matches in array
  - Given duplicate_parts has only medium confidence matches, When processing response, Then return all matches in array
  - Given duplicate search function not called by LLM, When analysis completes, Then result has analysis_result populated, duplicate_parts null
- Fixtures / hooks:
  - Mock AIRunner with various LLM response structures
  - Test data with known duplicate patterns
  - DI container with test services
- Gaps: None
- Evidence: AI service test structure at `test_ai_service.py:82-96`

- Surface: `PartService.get_all_parts_for_search()`
- Scenarios:
  - Given 5 parts in database, When called, Then return all 5 with search fields populated
  - Given part with null optional fields, When serializing, Then handle nulls gracefully
  - Given part with no type, When serializing, Then type_name is None
- Fixtures / hooks:
  - Database session with test parts
  - Part factory with varied field combinations
- Gaps: None
- Evidence: Service test pattern in project

- Surface: End-to-end AI analysis with duplicate detection
- Scenarios:
  - Given user inputs "OMRON G5Q-1A4" and exact match exists, When LLM finds high-confidence match, Then task returns response with duplicate_parts array containing 1 high-confidence entry and null analysis_result
  - Given duplicate search finds 2 matches (1 high, 1 medium confidence), When LLM follows directive to stop at high confidence, Then response has duplicate_parts array with 2 entries and null analysis_result
  - Given duplicate search finds only medium-confidence matches, When LLM proceeds with full analysis, Then task returns response with analysis_result object and null duplicate_parts
  - Given user inputs vague description and no duplicates found, When LLM completes analysis, Then task returns response with analysis_result object and null duplicate_parts
  - Given duplicate search times out, When analysis runs, Then analysis continues with analysis_result (graceful degradation)
- Fixtures / hooks:
  - Full container setup with test database
  - Real task execution with session
  - Test creates duplicate-prone parts in database for each scenario (e.g., exact MPN match, similar specs, no matches)
  - Dummy LLM responses pre-configured for each path
- Gaps: None
- Evidence: Integration test pattern at `test_ai_service_real_integration.py`

---

## 14) Implementation Slices

- Slice: Fix AIFunction base class bug
- Goal: Fix hardcoded function name in `AIFunction.get_function_tool()`
- Touches: `app/utils/ai/ai_runner.py` line 47
- Dependencies: None; must be fixed first

- Slice: Core schemas and models
- Goal: Define all Pydantic schemas and data contracts
- Touches: `app/schemas/duplicate_search.py`, updates to `app/schemas/ai_part_analysis.py`
- Dependencies: Base class bug fix

- Slice: Part service search dump
- Goal: Add method to export all parts in search format
- Touches: `app/services/part_service.py`
- Dependencies: Schema definitions completed

- Slice: Duplicate search service
- Goal: Implement service with mocked LLM responses for testing; wire MetricsService dependency
- Touches: `app/services/duplicate_search_service.py`, `app/services/prompts/duplicate_search.md`, `app/services/container.py`
- Dependencies: Part service search method, schemas

- Slice: Duplicate search function integration
- Goal: Implement AIFunction wrapper and wire into container
- Touches: `app/utils/ai/duplicate_search.py`, `app/services/container.py`
- Dependencies: Duplicate search service

- Slice: Main AI service integration
- Goal: Add duplicate search function to analyze_part() function tools array
- Touches: `app/services/ai_service.py`
- Dependencies: Function implementation and wiring

- Slice: Response schema updates
- Goal: Update LLM response schema with analysis_result/duplicate_parts structure (both optional)
- Touches: `app/schemas/ai_part_analysis.py`
- Dependencies: All prior slices

- Slice: Prompt updates for LLM decision-making
- Goal: Add duplicate handling guidance to main LLM prompt
- Touches: `app/services/prompts/prompt.md`
- Dependencies: Schema updates complete

- Slice: Task handling for both response paths
- Goal: Update task to handle both duplicate_parts and analysis_result responses
- Touches: `app/services/ai_part_analysis_task.py`
- Dependencies: Schema and prompt updates

- Slice: Testing
- Goal: Comprehensive service and integration tests
- Touches: `tests/test_duplicate_search_service.py`, `tests/test_ai_service_duplicate_integration.py`
- Dependencies: All implementation complete

- Slice: Observability
- Goal: Add metrics and logging for duplicate search
- Touches: Metrics calls in services
- Dependencies: Core implementation working

- Slice: Test data verification
- Goal: Verify test data fixtures in `app/data/test_data/` are compatible with schema changes
- Touches: `app/data/test_data/*.json` (if updates needed)
- Dependencies: Schema changes complete

---

## 15) Risks & Open Questions

- Risk: Parts dump size exceeds LLM context window (>128k tokens)
- Impact: Duplicate search fails or truncates part list
- Mitigation: Document limit (~500-1000 parts safe); add metrics to track dump size; implement pagination if limit hit

- Risk: Second LLM call adds significant latency (2-5 seconds)
- Impact: User perceives slower AI analysis
- Mitigation: Acceptable for MVP; optimize prompt size; consider caching or parallel execution in future

- Risk: LLM match quality varies (false positives/negatives in duplicate search)
- Impact: Users see wrong duplicates or miss real ones
- Mitigation: Prompt engineering for clear matching criteria; monitor match accuracy metrics; collect user feedback for tuning

- Risk: LLM chooses duplicate_parts path incorrectly (false positive)
- Impact: User sees duplicate UI when they wanted to create a new part
- Mitigation: Ensure frontend allows override/ignore; clear UX to proceed with creation anyway; monitor metrics for duplicate_parts selection rate

- Risk: LLM decision-making quality varies with prompt changes
- Impact: Inconsistent behavior deciding when to return duplicates vs full analysis
- Mitigation: Careful prompt engineering with clear guidance; A/B testing of prompt variations; user feedback collection

- Risk: LLM populates unexpected response structure (both fields or neither)
- Impact: Frontend receives ambiguous response; may not render correctly
- Mitigation: Frontend must handle all edge cases (both populated, neither populated, null checks); LLM prompt engineering to prevent; monitor response structure patterns via metrics

---

## 16) Confidence

Confidence: Medium — The LLM function calling infrastructure is proven and the implementation path is clear, but LLM decision-making quality (choosing duplicate_parts vs analysis_result) and match quality at scale are unknowns requiring empirical validation. The dual-LLM chain adds complexity and latency risk. Response structure validation adds a new failure mode if LLM doesn't follow schema correctly. Prompt engineering will be critical for consistent behavior.
