# Playwright Test Infrastructure Phase 2 - Technical Plan

## Brief Description

Implement service orchestration and frontend test mode infrastructure to enable automated service lifecycle management and basic test instrumentation. This phase provides the foundation for LLM-observable testing by adding environment-based test mode configuration, service start/stop scripts support, and initial instrumentation hooks.

## Phase Overview

This is Phase 2 of the Playwright test suite implementation, building on the basic infrastructure from Phase 1. This phase focuses on:
1. Service orchestration for automated start/stop of frontend and backend services
2. Test mode configuration infrastructure
3. Basic console error policy setup
4. Foundation for structured test events (preparation only)

## Files to Create or Modify

### Service Orchestration

#### Create: `scripts/testing-server.sh`
- Foreground server script for Playwright integration
- Runs Vite directly without daemonization
- Sets `VITE_TEST_MODE=true` environment variable
- Similar pattern to backend's `testing-server.sh`
- Used by Playwright's webServer configuration

#### Modify: `playwright.config.ts`
- Add `webServer` configuration for automatic service management
- Configure both frontend and backend servers:
  ```typescript
  webServer: [
    {
      command: './scripts/testing-server.sh',
      port: 3100,
      timeout: 60 * 1000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: '../backend/scripts/testing-server.sh',
      port: 5100,
      timeout: 60 * 1000,
      reuseExistingServer: !process.env.CI,
    }
  ]
  ```
- Alternative: Support external service mode via environment variable

#### Modify: `.env.test.example`
- Add example entries for service management:
  ```
  # Service management mode
  # Let Playwright manage services (default)
  # Set to false if you want to manage services manually
  PLAYWRIGHT_MANAGED_SERVICES=true

  # Backend service URL (already exists, keep as-is)
  BACKEND_URL=http://localhost:5100
  ```

#### Modify: `tests/support/global-setup.ts`
- Keep existing health check logic for external service mode
- Check `PLAYWRIGHT_MANAGED_SERVICES` environment variable
- Skip health checks if Playwright manages services (webServer handles this)

### Frontend Test Mode Configuration

#### Create: `src/lib/config/test-mode.ts`
- Test mode detection logic
- Export: `isTestMode()` function checking `import.meta.env.VITE_TEST_MODE`
- Export: `TEST_MODE` constant

#### Modify: `vite.config.ts`
- Add logic to set `VITE_TEST_MODE` based on environment
- Ensure test mode is disabled in production builds

#### Environment Variable Strategy
- `VITE_TEST_MODE=true` will be set by the `testing-server.sh` script
- No need for `.env.test.local.example` file
- Playwright's webServer configuration handles the environment variable

### Console Error Policy Foundation

#### Create: `src/lib/test/console-policy.ts`
- Console error tracking setup (not suppression)
- Store reference to original console.error
- Wrap console.error to track errors while still logging them
- Track all console errors in an array for test assertions
- Export: `setupConsolePolicy()` function
- Export: `getConsoleErrors()` function to retrieve tracked errors
- Export: `clearConsoleErrors()` function for test cleanup

#### Modify: `src/main.tsx`
- Import and call `setupConsolePolicy()` at app initialization
- Only active when `isTestMode()` returns true

### Test Event System Preparation

#### Create: `src/lib/test/event-emitter.ts`
- Stub implementation for test event emission
- Export: `emitTestEvent(kind: string, payload: any)` function
- In test mode:
  - Log to console with `TEST_EVT:` prefix
  - Push to `window.__TEST_SIGNALS__` array
  - Initialize `window.__TEST_SIGNALS__ = []` if not exists
- In production: no-op function
- Export: `clearTestSignals()` function to reset the array for test cleanup

#### Create: `src/types/test-events.ts`
- TypeScript interfaces for test event types
- Define event kinds enum: `route`, `form`, `api`, `toast`, `error`, `query_error`, `sse`
- Define payload interfaces for each event type

## Step-by-Step Implementation

### 1. Service Orchestration Implementation

1.1. Create `scripts/testing-server.sh`:
   - Simple foreground script that runs Vite directly
   - Sets `VITE_TEST_MODE=true` environment variable
   - Outputs startup messages to stderr
   - Runs `pnpm dev --port 3100` in foreground
   - No PID management needed (Playwright handles this)

1.2. Configure Playwright's native `webServer`:
   - Use both `testing-server.sh` scripts for consistency
   - Both scripts run in foreground for proper process management
   - Set `reuseExistingServer: true` for local development
   - Set `reuseExistingServer: false` for CI environments

1.3. Support external service management (optional):
   - Check `PLAYWRIGHT_MANAGED_SERVICES` environment variable
   - If false, skip `webServer` configuration
   - Assume services are already running
   - Keep existing health check logic in global-setup.ts

### 2. Frontend Test Mode Setup

2.1. Environment-based configuration:
   - Check for `VITE_TEST_MODE` environment variable
   - Provide runtime detection function
   - Ensure no test code in production builds

2.2. Console policy implementation:
   - Wrap (not replace) console.error to track errors
   - Errors are both logged to original console AND tracked
   - Store errors in array for test assertion purposes
   - Provide functions to retrieve and clear tracked errors

### 3. Event System Foundation

3.1. Create emission infrastructure:
   - Central event emitter function
   - Console logging with structured format
   - Type-safe event definitions

3.2. Prepare for future integration:
   - Structure ready for router instrumentation
   - Structure ready for API client instrumentation
   - Structure ready for form/mutation tracking
   - Window.__TEST_SIGNALS__ initialized on app start in test mode
   - Cleanup functions available for test isolation

## Verification Steps

1. `testing-server.sh` scripts run both frontend and backend in foreground mode
2. Playwright's `webServer` configuration starts/stops both services automatically
3. Services terminate cleanly when Playwright sends SIGTERM
4. Test mode is properly detected via `VITE_TEST_MODE` environment variable
5. Console errors are tracked (not suppressed) in test mode
6. Test events can be emitted to console and `window.__TEST_SIGNALS__`
7. No test code appears in production build
8. Global setup correctly handles both Playwright-managed and external service modes
9. `window.__TEST_SIGNALS__` is properly initialized and can be cleared between tests

## Dependencies

- Phase 1 Playwright infrastructure (completed)
- No changes required to backend at this phase
- No changes to UI components yet (data-test attributes come in Phase 3)

## Next Phases Preview

- **Phase 3**: Frontend instrumentation (router, API, forms, TanStack Query)
- **Phase 4**: UI test attributes and Types feature tests
- **Phase 5**: Backend integration (reset endpoint, log streaming)