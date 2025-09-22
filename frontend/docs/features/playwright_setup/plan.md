# Playwright Setup Phase - Technical Plan

## Brief Description

Install and configure Playwright testing framework for the Electronics Inventory frontend as the foundation for the comprehensive test suite described in the epics. This phase establishes the core Playwright infrastructure with Chromium-only support, headless execution by default, and the necessary configuration for testing against real frontend and backend instances.

## Files to Create or Modify

### New Files to Create

1. **`playwright.config.ts`**
   - Main Playwright configuration file
   - Configure Chromium-only browser
   - Set headless mode as default
   - Define base URLs from environment variables
   - Set global expect timeout to 10s
   - Disable retries
   - Configure test artifacts output directory

2. **`tests/support/fixtures.ts`**
   - Custom test fixtures extending Playwright's base test
   - Environment URL fixtures (frontend/backend)
   - SSE-aware timeout fixture (30-35s for specific operations)

3. **`tests/support/helpers.ts`**
   - Test utility functions
   - `generateRandomId()` for prefix-shortId pattern
   - `awaitEvent(kind, filter, timeout)` for console event monitoring
   - `emitTestEvt(kind, payload)` wrapper for test events

4. **`tests/support/selectors.ts`**
   - Centralized data-test selector patterns
   - Type-safe selector helper functions
   - Naming patterns: `types.page`, `types.list.table`, etc.

5. **`tests/e2e/.gitkeep`**
   - Placeholder for end-to-end test directory

6. **`tests/e2e/specific/.gitkeep`**
   - Placeholder for specific/near-unit test directory

7. **`.env.test.example`**
   - Example environment configuration for tests
   - FRONTEND_URL and BACKEND_URL variables

### Files to Modify

1. **`package.json`**
   - Add Playwright dependencies (@playwright/test)
   - Add test scripts:
     - `playwright` - Run Playwright tests
     - `playwright:headed` - Run tests with browser UI
     - `playwright:ui` - Open Playwright UI mode
     - `playwright:install` - Install browser binaries

2. **`.gitignore`**
   - Add Playwright artifacts directories
   - `/test-results/`
   - `/playwright-report/`
   - `/playwright/.cache/`
   - `.env.test`

3. **`tsconfig.json`**
   - Add reference to playwright TypeScript config

4. **New: `tsconfig.playwright.json`**
   - TypeScript configuration for Playwright tests
   - Extend base config with test-specific settings

## Implementation Steps

### Phase 1: Core Installation

1. **Install Playwright packages**
   - Add @playwright/test as dev dependency
   - Run playwright install chromium to get browser binary

2. **Create configuration structure**
   - Set up playwright.config.ts with base configuration
   - Configure reporters (list, html)
   - Set artifact retention policies

3. **Environment setup**
   - Create .env.test.example with required variables
   - Add environment variable loading in config

### Phase 2: Test Infrastructure

1. **Create fixture system**
   - Base test fixture with environment URLs
   - Readiness polling fixtures (health checks)

2. **Build helper utilities**
   - Console event monitoring helpers
   - Random ID generation for test data
   - Selector builder functions

3. **TypeScript configuration**
   - Create tsconfig.playwright.json
   - Configure path aliases for test imports
   - Ensure proper type checking for tests

### Phase 3: Verification

1. **Create smoke test**
   - Simple test to verify Playwright setup
   - Check frontend accessibility
   - Verify backend health endpoint

2. **Script integration**
   - Add npm scripts for common operations
   - Document environment setup requirements

## Algorithms and Logic

### Readiness Polling Algorithm
```
1. Poll for readiness (assumes frontend and backend are already running):
   - Backend: GET /api/health/readyz every 1s, max 30s
   - Frontend: GET / expecting HTTP 200 every 1s, max 30s
2. If either fails after timeout, abort test run
```

### Test Data Collision Avoidance
```
1. Generate random suffix: 6 alphanumeric characters
2. Format: prefix-suffix (e.g., "type-e48af0")
3. Use for all test-created entities
4. Never clean up (tests must tolerate dirty state)
```

### Environment Variable Resolution
```
1. Check process.env for required variables
2. If .env.test exists, load from file
3. Validate FRONTEND_URL and BACKEND_URL present
```

## Configuration Details

### Playwright Config Structure
- **use** object:
  - headless: true (default)
  - viewport: { width: 1280, height: 720 }
  - ignoreHTTPSErrors: true (for dev certificates)
  - video: 'retain-on-failure'
  - screenshot: 'only-on-failure'
  - trace: 'on-first-retry'

- **expect** object:
  - timeout: 10000 (10s global default)

- **projects** array:
  - Single project: "chromium"
  - No Firefox or WebKit support

- **webServer** config:
  - Not used (assumes services are already running)
  - Tests use readiness URLs for verification

## Dependencies Required

- @playwright/test: Latest stable version
- No additional testing libraries needed in this phase
- Playwright will download Chromium binary (~150MB)