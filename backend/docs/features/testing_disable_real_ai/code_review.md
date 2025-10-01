# Code Review – Disable Real AI During Tests

## Findings
- No correctness issues found. The guard rails behave as planned and tests cover both the blocked and dummy-response paths.

## Plan Alignment
- `Settings` now enforces `DISABLE_REAL_AI_ANALYSIS` for testing and exposes `real_ai_allowed` as outlined.
- `AIService` only instantiates the runner when allowed and raises `InvalidOperationException` when a real call would be made while disabled.
- The `/api/ai-parts/analyze` endpoint short-circuits with the expected 400 response when real AI is unavailable and no dummy response exists.
- Background task and API tests now assert the new behaviours.

## Test Coverage
- Added unit coverage for service, task, and API layers to prove the new guard rails and dummy-response handling.
