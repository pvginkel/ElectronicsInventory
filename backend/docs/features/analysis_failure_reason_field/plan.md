# Technical Plan: Add analysis_failure_reason Field

## 0) Research Log & Findings

### Areas Researched

1. **AI Model Layer (`app/services/ai_model.py`)**: This defines the Pydantic model `PartAnalysisSuggestion` that the LLM populates. Currently has two mutually exclusive paths: `analysis_result` (full analysis) or `duplicate_parts` (duplicates found). Both fields are optional.

2. **API Response Schema (`app/schemas/ai_part_analysis.py`)**: Contains `AIPartAnalysisResultSchema` which mirrors the LLM model structure but uses different internal schema types. Includes a validator that requires at least one of `analysis_result` or `duplicate_parts` to be populated.

3. **AI Service (`app/services/ai_service.py`)**: Orchestrates the LLM call via AIRunner, converts the LLM response (`PartAnalysisSuggestion`) to the API schema (`AIPartAnalysisResultSchema`), and handles document processing. The conversion happens at lines 136-219.

4. **AI Analysis Task (`app/services/ai_part_analysis_task.py`)**: Background task that wraps the AI service call and returns `AIPartAnalysisTaskResultSchema` containing success status, optional analysis, and optional error_message.

5. **API Endpoint (`app/api/ai_parts.py`)**: Three endpoints - `/analyze` (starts task), `/create` (creates part from analysis), and `/analyze/<task_id>/result` (retrieves completed result).

6. **LLM Prompt (`app/services/prompt.md`)**: Instructs the LLM on duplicate detection, field population, and when to populate which fields. Currently has no mechanism to communicate analysis failures back to the user.

### Key Findings

- **Current failure handling**: When analysis cannot identify a part, the LLM has no structured way to explain why. It must either populate `analysis_result` with nulls or return `duplicate_parts` as empty.
- **Validation constraint**: The `@model_validator` in `AIPartAnalysisResultSchema` requires at least one field to be populated, which forces the LLM to provide something even when it has no useful information.
- **No database persistence**: The `PartAnalysisSuggestion` is a pure Pydantic model for LLM responses, not a SQLAlchemy model. The analysis result is ephemeral (stored in task result only).
- **Conversion layer**: The AI service converts from LLM schema (`PartAnalysisSuggestion` with `PartAnalysisDetails`) to API schema (`AIPartAnalysisResultSchema` with `PartAnalysisDetailsSchema`). The new field must be threaded through this conversion.

### Conflicts & Resolutions

- **Conflict**: Should `analysis_failure_reason` be mutually exclusive with `analysis_result` or can they coexist?
  - **Resolution**: The field should only be present when the LLM explicitly cannot provide a useful analysis. It will typically accompany a null `analysis_result`, but the validator should not enforce this strictly (allow LLM flexibility).

- **Conflict**: Where in the schema hierarchy should the field live?
  - **Resolution**: Add to `PartAnalysisSuggestion` (LLM response) at the top level, parallel to `analysis_result` and `duplicate_parts`. Also add to `AIPartAnalysisResultSchema` (API response) at the same level. This makes failure reasons first-class information, not nested within analysis_result.

## 1) Intent & Scope

**User intent**

Enable the AI-powered part analysis feature to communicate helpful failure explanations when the user's query is too vague or ambiguous to identify a specific part. This improves the user experience by providing actionable guidance on what additional information is needed.

**Prompt quotes**

"When the AI-based part analysis receives a query that is too vague or ambiguous to identify a specific part, the LLM currently has no way to communicate the failure reason to the user."

"This field should: Be added to the SQLAlchemy model, Be included in the Pydantic response schema, Be returned in the REST API response, Be optional (nullable) since successful analyses won't have a failure reason."

**In scope**

- Add `analysis_failure_reason` field to `PartAnalysisSuggestion` (LLM response model)
- Add `analysis_failure_reason` field to `AIPartAnalysisResultSchema` (API response schema)
- Thread the field through the AI service conversion layer
- Update the LLM prompt to instruct when and how to populate this field
- Relax the schema validator to allow failure reason without requiring other fields
- Update existing tests to cover failure scenarios with reasons

**Out of scope**

- No database persistence (no SQLAlchemy model changes; the change brief incorrectly mentioned this)
- No changes to the `/create` endpoint (failure cases don't reach part creation)
- No frontend changes (backend-only contract extension)
- No changes to task error handling (`error_message` in task result remains separate)

**Assumptions / constraints**

- The LLM prompt update is sufficient to teach the model when to populate `analysis_failure_reason`
- The existing `@model_validator` in `AIPartAnalysisResultSchema` needs adjustment to allow failure reasons as valid responses
- No migration is required since this is ephemeral data (task results, not database records)
- The failure reason is human-readable prose, not a structured error code

## 2) Affected Areas & File Map

- Area: `app/services/ai_model.py` - `PartAnalysisSuggestion` class
- Why: Add the new `analysis_failure_reason` field to the LLM response model
- Evidence: `app/services/ai_model.py:48-58` - "LLM response with two mutually exclusive paths. The LLM populates either analysis_result (full analysis) OR duplicate_parts (duplicates found). Both fields are optional"

- Area: `app/schemas/ai_part_analysis.py` - `AIPartAnalysisResultSchema` class
- Why: Add the new field to the API response schema and update the validator
- Evidence: `app/schemas/ai_part_analysis.py:136-178` - Schema with validator requiring at least one of the two existing fields

- Area: `app/services/ai_service.py` - `analyze_part` method
- Why: Thread the failure reason from LLM response to API schema in the conversion logic
- Evidence: `app/services/ai_service.py:136-219` - Conversion from `PartAnalysisSuggestion` to `AIPartAnalysisResultSchema`

- Area: `app/services/prompt.md` - LLM system prompt
- Why: Instruct the LLM when and how to populate `analysis_failure_reason`
- Evidence: `app/services/prompt.md:1-84` - Current prompt with duplicate detection instructions but no failure reason guidance

- Area: `tests/test_ai_service.py` - AI service tests
- Why: Add test cases for failure scenarios with populated failure reasons
- Evidence: `tests/test_ai_service.py:1-100` - Existing test fixtures and setup for AI service testing

- Area: `tests/test_ai_part_analysis_task.py` - AI analysis task tests
- Why: Verify that failure reasons flow through the task layer correctly
- Evidence: Referenced by imports in `app/services/ai_part_analysis_task.py:1-15`

## 3) Data Model / Contracts

- Entity / contract: `PartAnalysisSuggestion` (LLM response model)
- Shape:
  ```json
  {
    "analysis_result": {...} | null,
    "duplicate_parts": [...] | null,
    "analysis_failure_reason": "Please be more specific - do you need an SMD or through-hole resistor?" | null
  }
  ```
- Refactor strategy: Add new optional field at the top level; no back-compat concerns since this is a Pydantic model for parsing LLM responses
- Evidence: `app/services/ai_model.py:48-58`

- Entity / contract: `AIPartAnalysisResultSchema` (API response)
- Shape:
  ```json
  {
    "analysis_result": {...} | null,
    "duplicate_parts": [...] | null,
    "analysis_failure_reason": "Unable to identify the part. Please provide a part number or more specific description." | null
  }
  ```
- Refactor strategy: Add new optional field; update `@model_validator` to accept failure_reason as a valid standalone response (refactoring validator logic to allow three paths instead of two)
- Evidence: `app/schemas/ai_part_analysis.py:136-178`

- Entity / contract: LLM prompt guidance (Markdown template)
- Shape: New section in prompt.md instructing when to populate `analysis_failure_reason`:
  ```markdown
  ## Analysis Failure Guidance

  When the user's query lacks sufficient information to identify a specific part, populate `analysis_failure_reason` with actionable guidance instead of attempting to provide a generic or incomplete analysis.

  **Decision tree for failure_reason:**
  1. Does the query contain a manufacturer part number (MPN) or specific product code? → Proceed with analysis
  2. Does the query specify both category AND key specifications? → Proceed with analysis
  3. Otherwise → Populate `analysis_failure_reason` with specific guidance

  **Examples of when to populate failure_reason:**

  - Query: "10k resistor"
    - Failure reason: "Please be more specific - do you need an SMD or through-hole resistor? If SMD, what package size (e.g., 0603, 0805, 1206)?"

  - Query: "blue thing from the kit"
    - Failure reason: "Unable to identify the part. Please provide a part number, manufacturer code, or more specific description of the component type and markings."

  - Query: "relay"
    - Failure reason: "Please specify the relay type and key specifications such as coil voltage, contact configuration, and current rating."

  **Examples of when to proceed with analysis:**

  - Query: "generic 10k resistor THT 1/4W" → Proceed (category + key specs present)
  - Query: "OMRON G5Q-1A4" → Proceed (specific MPN provided)
  - Query: "5V reed relay SPST" → Proceed (category + specifications sufficient)

  **Phrasing guidance:**
  - Be specific about what information is missing
  - Provide examples of the required details
  - Keep the message concise (1-2 sentences max)
  - Focus on the most critical missing information first
  ```
- Refactor strategy: Add new section to the existing prompt template without disrupting current structure; integrate after duplicate detection section to maintain logical flow
- Evidence: `app/services/prompt.md:1-84` (current duplicate handling at lines 3-18 provides model for explicit examples)

## 4) API / Integration Surface

- Surface: GET `/api/ai-parts/analyze/<task_id>/result`
- Inputs: `task_id` (path parameter)
- Outputs: `AIPartAnalysisTaskResultSchema` containing `AIPartAnalysisResultSchema` with the new `analysis_failure_reason` field
- Errors: No new error modes; existing 404 for task not found remains unchanged
- Evidence: `app/api/ai_parts.py:196-252`

- Surface: SSE stream from `/api/tasks/<task_id>/stream`
- Inputs: `task_id` (path parameter), SSE connection
- Outputs: SSE events including final result event with `analysis_failure_reason` in the data payload
- Errors: No new error modes
- Evidence: Implied by `app/services/ai_part_analysis_task.py:118-121` which returns the schema that gets streamed

## 5) Algorithms & State Machines

- Flow: AI part analysis with failure reason population
- Steps:
  1. User submits analysis request (text or image)
  2. Task service starts `AIPartAnalysisTask` in background
  3. Task calls `AIService.analyze_part` with user prompt
  4. AI service builds system prompt from template (including new failure reason instructions)
  5. AI runner makes LLM call with `PartAnalysisSuggestion` as response model
  6. LLM evaluates query clarity and completeness
  7. If query is insufficient: LLM populates `analysis_failure_reason` with helpful guidance, leaves `analysis_result` and `duplicate_parts` as null
  8. If query is sufficient: LLM proceeds with existing logic (duplicate check → analysis)
  9. AI service converts `PartAnalysisSuggestion` to `AIPartAnalysisResultSchema`, copying failure_reason
  10. Task returns result with failure_reason to frontend via SSE
- States / transitions: No state machine; single-pass analysis flow
- Hotspots: LLM prompt clarity is critical - must clearly distinguish between "analysis failed" (populate failure_reason) and "no duplicates found" (proceed with normal analysis)
- Evidence: `app/services/ai_service.py:71-219`, `app/services/ai_part_analysis_task.py:23-128`

## 6) Derived State & Invariants

- Derived value: Analysis completeness signal (implicit)
  - Source: Presence/absence of `analysis_failure_reason` in response
  - Writes / cleanup: No persistence; used only for frontend display and user feedback
  - Guards: Schema validator ensures at least one of {analysis_result, duplicate_parts, analysis_failure_reason} is populated
  - Invariant: A response with `analysis_failure_reason` indicates the LLM could not proceed with useful analysis; frontend should prompt user for more info
  - Evidence: `app/schemas/ai_part_analysis.py:156-176`

- Derived value: User guidance text
  - Source: LLM-generated `analysis_failure_reason` string
  - Writes / cleanup: Ephemeral; displayed to user then discarded when they refine query
  - Guards: LLM prompt instructs on actionable phrasing; no server-side validation of content quality
  - Invariant: When present, the failure reason must be human-readable and actionable (not empty string or generic "failed")
  - Evidence: `app/services/prompt.md:1-84` (updated with new instructions)

- Derived value: Task success status
  - Source: `AIPartAnalysisTaskResultSchema.success` boolean
  - Writes / cleanup: Task result stored temporarily in task service
  - Guards: Task-level exceptions populate `error_message` (separate from `analysis_failure_reason`); LLM-level "cannot analyze" uses failure_reason but task still succeeds (success=True)
  - Invariant: `success=False` means system error (API failure, timeout); `success=True` with `analysis_failure_reason` means LLM completed successfully but couldn't provide useful analysis
  - Evidence: `app/services/ai_part_analysis_task.py:118-121`, `app/schemas/ai_part_analysis.py:181-198`

## 7) Consistency, Transactions & Concurrency

- Transaction scope: No database transactions involved; this is ephemeral analysis data
- Atomic requirements: None; the analysis result (including failure reason) is computed and returned as a single in-memory object
- Retry / idempotency: Task layer handles retries; analysis is idempotent (same inputs → same LLM response, modulo non-determinism)
- Ordering / concurrency controls: Multiple analysis tasks can run concurrently; each operates independently
- Evidence: `app/services/ai_part_analysis_task.py:23-128` (no session commits, no database writes)

## 8) Errors & Edge Cases

- Failure: LLM query is too vague to identify a part
- Surface: `AIPartAnalysisResultSchema` returned in task result
- Handling: LLM populates `analysis_failure_reason` with actionable guidance; task returns `success=True` with null `analysis_result`; frontend displays failure_reason to user
- Guardrails: Updated schema validator allows failure_reason as standalone valid response; LLM prompt instructs on helpful phrasing
- Evidence: `app/schemas/ai_part_analysis.py:156-176` (validator update needed)

- Failure: LLM returns empty strings or all null fields
- Surface: Schema validation in `AIPartAnalysisResultSchema`
- Handling: Validator raises `ValueError` if all three fields (analysis_result, duplicate_parts, analysis_failure_reason) are null/empty; empty strings in `analysis_failure_reason` are treated as null (invalid) for validation purposes
- Guardrails: Updated validator checks for at least one non-null AND non-empty field from the three available; specifically for `analysis_failure_reason`, the validator must reject empty strings (`""`), whitespace-only strings, or any string that would not provide actionable user guidance
- Evidence: `app/schemas/ai_part_analysis.py:156-176`

- Failure: System-level error (OpenAI API timeout, network failure)
- Surface: `AIPartAnalysisTaskResultSchema.error_message`
- Handling: Task catches exception, sets `success=False`, populates `error_message` (not `analysis_failure_reason`); this is distinct from LLM-level "cannot analyze"
- Guardrails: Existing exception handling in task layer; no changes needed
- Evidence: `app/services/ai_part_analysis_task.py:68-73`, `app/services/ai_part_analysis_task.py:123-128`

- Failure: LLM populates both `analysis_result` and `analysis_failure_reason`
- Surface: Schema validation and LLM behavior
- Handling: Allow this case (don't enforce mutual exclusivity); LLM can provide partial analysis plus guidance (e.g., "Here's what I found, but please clarify X")
- Guardrails: Validator updated to permit any combination of fields; LLM prompt instructs on typical usage patterns
- Evidence: Design decision based on `app/services/prompt.md:72-77` pattern of medium-confidence duplicates + full analysis

## 9) Observability / Telemetry

- Signal: Log message when failure reason is populated
- Type: Structured log (info level)
- Trigger: When `AIService.analyze_part` converts LLM response and detects `analysis_failure_reason` is not null
- Labels / fields: `failure_reason` (truncated to first 100 chars), presence of other fields (has_analysis, has_duplicates)
- Consumer: Application logs for debugging LLM behavior and understanding common failure patterns
- Evidence: `app/services/ai_service.py:144-158` (similar logging for duplicates)

- Signal: Existing AI analysis metrics (requests, tokens, costs)
- Type: Prometheus counters/histograms via `MetricsService`
- Trigger: Already instrumented in `AIRunner`; no changes needed
- Labels / fields: No new labels; failure reasons are still successful LLM calls (not errors)
- Consumer: Metrics dashboard
- Evidence: `app/services/ai_service.py:62-69` (metrics_service initialization)

## 10) Background Work & Shutdown

No background workers or shutdown hooks involved. The analysis runs in the context of `AIPartAnalysisTask` which already integrates with the task service lifecycle.

## 11) Security & Permissions

Not applicable. This is a single-user hobby app with no authentication. The failure reason is user-facing text, not sensitive data.

## 12) UX / UI Impact

- Entry point: Frontend analysis flow (e.g., part creation form with AI assist)
- Change: Frontend will receive `analysis_failure_reason` in API response and can display it to the user as a helpful message
- User interaction: When analysis fails, user sees actionable guidance (e.g., "Please specify SMD or through-hole") instead of silent failure or generic error
- Dependencies: Frontend must check for `analysis_failure_reason` in `AIPartAnalysisResultSchema` and render it appropriately
- Evidence: Backend contract defined in `app/schemas/ai_part_analysis.py:136-178`

## 13) Deterministic Test Plan

- Surface: `AIService.analyze_part` method
- Scenarios:
  - Given LLM returns failure_reason with null analysis_result and null duplicate_parts, When service converts response, Then `AIPartAnalysisResultSchema` has failure_reason and null other fields (failure only)
  - Given LLM returns null failure_reason with analysis_result, When service converts response, Then failure_reason is null in output (existing behavior)
  - Given LLM returns failure_reason AND analysis_result (partial analysis), When service converts response, Then both fields are populated in output (analysis + failure)
  - Given LLM returns failure_reason AND duplicate_parts (without analysis_result), When service converts response, Then both failure_reason and duplicate_parts are populated in output (duplicates + failure)
- Fixtures / hooks: Use existing `ai_service` fixture with mocked `OPENAI_DUMMY_RESPONSE_PATH` to control LLM responses
- Gaps: None; all new code paths are testable with deterministic LLM responses; covers key combinations of fields
- Evidence: `tests/test_ai_service.py:29-100` (fixture setup)

- Surface: `AIPartAnalysisResultSchema` validator
- Scenarios:
  - Given analysis_result=null, duplicate_parts=null, failure_reason="Too vague", When validating schema, Then validation passes (failure_reason only)
  - Given all three fields null, When validating schema, Then raises `ValueError` (no valid data)
  - Given failure_reason="" (empty string), analysis_result=null, duplicate_parts=null, When validating schema, Then raises `ValueError` (empty string treated as null)
  - Given failure_reason="  " (whitespace only), analysis_result=null, duplicate_parts=null, When validating schema, Then raises `ValueError` (whitespace treated as null)
  - Given analysis_result={...}, duplicate_parts=null, failure_reason="Partial info", When validating schema, Then validation passes (analysis + failure)
  - Given analysis_result=null, duplicate_parts=[{...}], failure_reason="Matches found but may not be exact", When validating schema, Then validation passes (duplicates + failure)
  - Given analysis_result={...}, duplicate_parts=[{...}], failure_reason=null, When validating schema, Then validation passes (analysis + duplicates, existing behavior)
  - Given analysis_result={...}, duplicate_parts=[{...}], failure_reason="Check these", When validating schema, Then validation passes (all three fields populated)
- Fixtures / hooks: Direct schema instantiation in unit tests; no fixtures needed
- Gaps: None; comprehensive coverage of all meaningful field combinations (7 valid states + 2 invalid states)
- Evidence: `app/schemas/ai_part_analysis.py:156-176`

- Surface: `AIPartAnalysisTask.execute_session` method
- Scenarios:
  - Given AI service returns failure_reason, When task executes, Then `AIPartAnalysisTaskResultSchema` has success=True with failure_reason in nested analysis
  - Given AI service raises exception, When task executes, Then task result has success=False with error_message (not failure_reason)
- Fixtures / hooks: Use existing task test fixtures; mock `ai_service.analyze_part` to return different response shapes
- Gaps: None; task layer is thin wrapper around service
- Evidence: `tests/test_ai_part_analysis_task.py` (file exists per grep results)

- Surface: GET `/api/ai-parts/analyze/<task_id>/result` endpoint
- Scenarios:
  - Given completed task with failure_reason, When fetching result, Then response includes failure_reason field in JSON
  - Given completed task without failure_reason, When fetching result, Then response has failure_reason=null
- Fixtures / hooks: Use existing API test fixtures (`client`, `container`); seed task service with completed tasks
- Gaps: None; API layer serialization is automatic via Pydantic
- Evidence: `app/api/ai_parts.py:196-252`

## 14) Implementation Slices

Not needed; this is a small, cohesive change that should be implemented atomically.

## 15) Risks & Open Questions

- Risk: LLM may not reliably populate failure_reason even when instructed
- Impact: Users see silent failures (null analysis, no guidance) when query is vague
- Mitigation: Thorough prompt engineering with clear examples; test with diverse vague queries during implementation; iterate on prompt wording if necessary

- Risk: Validator changes could inadvertently allow malformed responses
- Impact: Frontend receives unexpected response shapes, breaking error handling
- Mitigation: Comprehensive test coverage of validator with all field combinations; manual testing of API responses

- Risk: Failure reason text could contain LLM hallucinations or unhelpful content
- Impact: Users receive confusing or incorrect guidance
- Mitigation: LLM prompt emphasizes actionable, specific guidance; initial testing to validate quality; no automated mitigation possible (human-in-loop for prompt refinement)

## 16) Confidence

Confidence: High — The change is narrowly scoped, touches well-defined Pydantic models and validation logic, requires no database migrations, and follows existing patterns for optional fields in the LLM response schema. The main uncertainty is LLM prompt effectiveness, which is addressable through iteration.
