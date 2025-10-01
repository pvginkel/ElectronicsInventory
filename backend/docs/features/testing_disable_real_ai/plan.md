Add configuration guards so the real OpenAI client can never be used when `FLASK_ENV=testing`, while still allowing dummy AI analysis responses during tests, and return an immediate API failure when no dummy response is configured.

Relevant files and functions:
- `app/config.py` (`Settings`, testing validator, `is_testing`) — introduce a `DISABLE_REAL_AI_ANALYSIS` flag and helper logic that denies real AI usage whenever the server runs in testing mode.
- `app/services/ai_service.py` (`AIService.__init__`, `analyze_part`) — honor the new flag, skip `AIRunner` creation when disabled, raise `InvalidOperationException` before contacting OpenAI, and keep the dummy-response branch functional.
- `app/api/ai_parts.py` (`analyze_part`) — short-circuit requests: if real AI is disabled and no dummy response is set, return an HTTP 400 with a clear message instead of starting the background task.
- `app/services/container.py` (`ServiceContainer.ai_service`) — ensure dependency wiring remains valid when the AI runner becomes optional/lazy.
- `tests/conftest.py` (`test_settings` fixture) — confirm testing fixtures set the new flag (or rely on auto-enforcement) so unit tests never reach the real client.
- `tests/test_ai_service.py` (existing test class) — update fixtures to set testing mode, add cases for the disabled guard and for the dummy-response workflow.
- `tests/test_ai_part_analysis_task.py` / `tests/test_ai_parts_api.py` — cover how the background task and API surface the configuration error when real AI is disabled, including the new immediate API rejection.

Implementation steps:
1. Settings guard
   - Add `DISABLE_REAL_AI_ANALYSIS: bool = Field(default=False, ...)` to `Settings`.
   - Extend the post-validation hook to force this flag to `True` whenever `FLASK_ENV == "testing"`, ensuring no opt-out in that mode, and expose a convenience property such as `real_ai_allowed` for downstream checks.
2. AI service updates
   - In `AIService.__init__`, record the flag and only instantiate `AIRunner` when `real_ai_allowed` is `True`; permit initialization without an API key when a dummy response path is provided and real AI is disabled.
   - In `analyze_part`, keep the dummy-response branch as the first check. If no dummy response is configured and `real_ai_allowed` is `False`, raise `InvalidOperationException("perform AI analysis", "real AI usage is disabled in testing mode")` before any OpenAI interaction; otherwise proceed with the current request-building/runner logic.
3. API guard
   - In `/api/ai-parts/analyze`, read the settings (or a service-level flag) and immediately return a 400 response when real AI is disabled and no dummy response is available, so test authors see an explicit error before starting a task.
   - Ensure the error payload uses the standard error-handling helper so the response is consistent with other API failures.
4. Background task integration
   - Ensure `AIPartAnalysisTask` propagates the new exception so TaskService marks the task as failed and the API surfaces the error message produced by `InvalidOperationException`.
   - Verify `ServiceContainer` still wires `AIService` correctly when the runner can be absent until a real call is allowed.
5. Testing adjustments
   - Update `tests/conftest.py::test_settings` and any AI-specific fixtures to set `FLASK_ENV="testing"` (or the new flag) so the guard is active during unit tests.
   - Add unit coverage in `tests/test_ai_service.py` for both the raised exception path and the dummy-response success path without invoking OpenAI.
   - For tests that intentionally exercise the real-call branch via mocks, explicitly set `FLASK_ENV="development"` or `DISABLE_REAL_AI_ANALYSIS=False` within the fixture to keep those scenarios reachable.
   - Add API-level assertions in `tests/test_ai_parts_api.py` confirming that the analyze endpoint returns 400 when the guard is active and no dummy response is configured, and task-level assertions in `tests/test_ai_part_analysis_task.py` confirming the error propagation when triggered mid-task.
