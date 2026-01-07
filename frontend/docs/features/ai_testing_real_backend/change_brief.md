# Change Brief: Switch AI Testing from SSE Mocking to Real Backend

## Summary

Replace the current SSE mocking infrastructure for AI analysis and cleanup tests with real backend calls, using the new `/api/testing/sse/task-event` endpoint to send controlled SSE events.

## Background

The Playwright test suite currently uses extensive mocking for AI analysis and cleanup features:
- `SSEMocker` class replaces the global `EventSource` with a mock implementation
- `ai-analysis-mock.ts` and `ai-cleanup-mock.ts` intercept POST requests via `page.route()` and return fake responses
- Events are injected via `page.evaluate()` into the mocked EventSource

This approach has caused ongoing problems because mocks don't accurately represent real backend behavior.

The backend now supports a testing mode (`FLASK_ENV=testing`) where:
1. AI endpoints (`/api/ai-parts/analyze`, `/api/ai-parts/cleanup`) skip validation and return a random UUID as `task_id`
2. No real AI processing occurs
3. Tests can use `/api/testing/sse/task-event` to send controlled SSE events for that task ID

## Changes Required

1. **Delete SSE mocking infrastructure**: Remove `tests/support/helpers/sse-mock.ts` entirely

2. **Rewrite AI analysis mock helper**: Replace `tests/support/helpers/ai-analysis-mock.ts` to:
   - No longer intercept routes or mock SSE
   - Wait for real API responses and capture the `task_id`
   - Wait for `task_subscription` SSE event to confirm frontend subscribed
   - Provide `emitStarted()`, `emitProgress()`, `emitCompleted()`, `emitFailure()` methods that POST to `/api/testing/sse/task-event`

3. **Rewrite AI cleanup mock helper**: Apply same changes to `tests/support/helpers/ai-cleanup-mock.ts`

4. **Remove `sseMocker` fixture**: Remove from `tests/support/fixtures.ts`

5. **Update test fixtures**: Modify `aiAnalysisMock` and `aiCleanupMock` fixtures to use the new helpers

6. **Update tests**: Adjust tests to the new flow where the session is created after the UI action triggers the real API call

## Reference Documentation

- Backend instructions: `../backend/docs/features/ai_testing_mode/frontend_instructions.md`
- Existing SSE task-event test pattern: `tests/e2e/sse/task-events.spec.ts`
- Current SSE helper: `tests/support/helpers/deployment-sse.ts`
