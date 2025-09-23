# Contribute Docs Overhaul — Technical Plan

> **Planning note:** This plan is written for the contracted professional technical documentation writer. Assume a rewrite-first approach; the legacy documentation authored by developers must be replaced wholesale with higher-quality material.

## Brief Description

Create complete developer documentation on working with this solution, consolidating and restructuring existing materials into `docs/contribute`. The documents that were created are in `tests/`. I want you to restructure this. Really, I want you to create complete developer documentation on working with this solution. It needs to go into `docs/contribute`. This new contributor documentation must cover what's in the `tests/` folder, what's in the `AGENTS.md`, what may be spread over other documents (especially documents in the `docs/` folder) plus just blatently missing information that is important.

This plan enumerates the files to create/modify, the consolidation approach, and phased delivery to move all Playwright testing guidance and broader contributor docs into a coherent `docs/contribute` section that aligns with our implemented Playwright suite and test instrumentation.

## Files to Create or Modify

### New documentation structure under `docs/contribute/`

- `docs/contribute/index.md`
  - Hub page: audience, scope, navigation to sub-guides.
- `docs/contribute/getting_started.md`
  - Local setup, environment, scripts, ports, generating API client, quick run.
- `docs/contribute/environment.md`
  - Environment variables: `FRONTEND_URL`, `BACKEND_URL`, `VITE_TEST_MODE`, `PLAYWRIGHT_MANAGED_SERVICES`, `.env.test` usage.
- `docs/contribute/testing/index.md`
  - Overview of E2E strategy, dirty DB policy, API-first data setup, page objects, no fixed waits.
- `docs/contribute/testing/playwright_developer_guide.md`
  - Canonical developer guide (migrate and supersede `tests/README.md`).
- `docs/contribute/testing/selector_patterns.md`
  - Migrate/supersede `tests/selector-patterns.md`; reconcile page-object-first stance vs any legacy selector maps.
- `docs/contribute/testing/no_sleep_patterns.md`
  - Migrate/supersede `tests/no-sleep-patterns.md`.
- `docs/contribute/testing/error_handling_and_validation.md`
  - Migrate/supersede `tests/error_handling_and_validation_patterns.md`; include the TEST_EVT taxonomy used by instrumentation.
- `docs/contribute/testing/factories_and_fixtures.md`
  - Document `tests/api/*`, factories, test data bundle, and `tests/support/fixtures.ts`.
- `docs/contribute/testing/page_objects.md`
  - Page Object Model patterns; placement next to feature tests (e.g., `tests/e2e/types/TypesPage.ts`).
- `docs/contribute/testing/ci_and_execution.md`
  - Running locally vs CI; `webServer` management, health checks, artifacts, headless-only policy.
- `docs/contribute/testing/troubleshooting.md`
  - Common failures, TEST_EVT debugging, link-checklist.
- `docs/contribute/architecture/test_instrumentation.md`
  - Document frontend test-mode and event emitters: `src/lib/test/*`, event kinds from `src/types/test-events.ts`.
- `docs/contribute/architecture/application_overview.md`
  - Summarize architecture highlights (extract from `AGENTS.md`) with links to source.
- `docs/contribute/howto/add_e2e_test.md`
  - Procedural guide to add tests for a new feature (API-first data, page object, selectors, instrumentation expectations).

### Existing docs to migrate/supersede (content moves, add stubs with links)

- `tests/README.md` → incorporated into `docs/contribute/testing/playwright_developer_guide.md`.
- `tests/selector-patterns.md` → `docs/contribute/testing/selector_patterns.md`.
- `tests/no-sleep-patterns.md` → `docs/contribute/testing/no_sleep_patterns.md`.
- `tests/error_handling_and_validation_patterns.md` → `docs/contribute/testing/error_handling_and_validation.md`.

Add brief “Moved to docs/contribute” headers inside the original `tests/*.md` files to avoid breakage and point readers to canonical docs.

### Cross-references to update

- `AGENTS.md` → update “UI Testing (Playwright) — How Claude should work” references from `tests/README.md` to the new `docs/contribute/testing/playwright_developer_guide.md` and related pages.
- `docs/epics/playwright_outstanding_work.md` → link its “Documentation & Patterns” items to the new `docs/contribute` pages; mark coverage where appropriate.
- `docs/epics/playwright_test_suite_brief.md` → replace “to be embedded in AGENTS docs” with links into `docs/contribute`.
- Root `README.md` → Contributing section points to `docs/contribute/index.md`.

### Source files to reference (documentation targets; no code changes required)

- Test instrumentation modules: `src/lib/test/event-emitter.ts`, `src/lib/test/query-instrumentation.ts`, `src/lib/test/error-instrumentation.ts`, `src/lib/test/toast-instrumentation.ts`, `src/lib/test/router-instrumentation.ts`, `src/lib/test/api-instrumentation.ts` (note: API instrumentation exists but is optional/not fully integrated), `src/lib/config/test-mode.ts`, `src/types/test-events.ts`.
- Playwright config and fixtures: `playwright.config.ts`, `tests/support/global-setup.ts`, `tests/support/fixtures.ts`, `tests/support/helpers.ts`, `tests/e2e/types/TypesPage.ts`.
- Test data factories: `tests/api/*`.
- Legacy selector map to reconcile/document: `tests/support/selectors.ts`.

## Algorithms / Procedures

### 1) Content Inventory and Mapping

1. Collect all existing documentation sources: `tests/*.md`, `AGENTS.md` (“UI Testing (Playwright) — How Claude should work”), `docs/epics/playwright_outstanding_work.md`, `docs/epics/playwright_test_suite_brief.md`, `docs/features/*` plans that mention TEST_EVT or testing.
2. Map each topic to a canonical destination in `docs/contribute` (files listed above). Avoid duplication by making one page authoritative per topic.
3. Identify gaps and “blatently missing information that is important” (e.g., `VITE_TEST_MODE` gating, `PLAYWRIGHT_MANAGED_SERVICES`, ports 3100/5100, artifact locations, headless-only policy, dirty DB strategy, correlation IDs) and schedule them into the new pages.

### 2) Migration and Consolidation

1. Create the `docs/contribute` folder and subfolders.
2. Move content from the four `tests/*.md` documents into their new locations, editing for consistency (voice, headings, link paths). Keep the technical substance intact.
3. Where the existing docs conflict (e.g., anti-pattern “centralized selector maps” vs `tests/support/selectors.ts` present), document the preferred pattern (feature page objects) and explicitly note the legacy/transition status of selector maps.
4. Extract and normalize the TEST_EVT taxonomy from `src/types/test-events.ts` into `docs/contribute/architecture/test_instrumentation.md` to ensure documentation matches implemented kinds and fields.
5. Add a clear “dirty database policy” and “API-first data setup” statements in the testing overview, preserving the original principle wording.

### 3) Cross-Reference Update and Redirects

1. Update internal links in `AGENTS.md`, epics, and README to point to `docs/contribute` pages.
2. At the top of each original `tests/*.md` file, add a short deprecation notice with a link to the new canonical doc.
3. Search for references to `tests/README.md` and other moved files and update links to the new paths.

### 4) Verification and Quality Pass

1. Manual link-check sweep across `docs/` to ensure no broken paths.
2. Confirm all TEST_EVT examples and semantics in docs match `src/types/test-events.ts` and instrumentation implementations.
3. Validate that the Playwright execution instructions reflect `playwright.config.ts` (ports, headless-only, expect timeout, webServer behavior and `PLAYWRIGHT_MANAGED_SERVICES`).
4. Ensure all environment settings for test-mode are documented: `VITE_TEST_MODE=true` (as set by `scripts/testing-server.sh`), `.env.test` handling, and URL env vars.

## Phases

### Phase 1 — Skeleton + Migration

- Create `docs/contribute` structure and placeholder pages.
- Migrate content from:
  - `tests/README.md` → Playwright developer guide
  - `tests/selector-patterns.md` → Selector patterns
  - `tests/no-sleep-patterns.md` → No-sleep patterns
  - `tests/error_handling_and_validation_patterns.md` → Error handling & validation
- Add deprecation headers into the original `tests/*.md` files.
- Update `AGENTS.md` link(s) to the new guide.

### Phase 2 — Instrumentation + Architecture

- Author `docs/contribute/architecture/test_instrumentation.md` summarizing:
  - TEST_EVT kinds and fields from `src/types/test-events.ts`.
  - What is automatic (router, query errors, toasts, global errors) vs manual (forms).
  - Correlation ID context and API instrumentation status.
- Author `docs/contribute/environment.md` with test-mode gating and ports.

### Phase 3 — How-To Guides + CI

- Author `howto/add_e2e_test.md` and `testing/ci_and_execution.md`.
- Add `factories_and_fixtures.md` and `page_objects.md` with clear ownership patterns and foldering.
- Add `troubleshooting.md` (API failures, conflicts, selector drift, console error policy, dirty DB tips).

### Phase 4 — Finalize and Polish

- Cross-link epics/briefs to the canonical pages.
- Final pass for consistency (terminology, headings, anchors).
- Optional: add a brief “What’s where” index to `docs/contribute/index.md`.

## Notes and Reconciliation Items

- Selector strategy: “Page objects, not selector maps” is the preferred pattern. Document `tests/support/selectors.ts` as legacy/limited-use and steer new work to feature-specific page objects (e.g., `tests/e2e/types/TypesPage.ts`).
- TEST_EVT taxonomy must be documented exactly as implemented: `route`, `form` (open|submit|success|error|validation_error), `api`, `toast`, `error`, `query_error`, `sse`.
- Environment and ports: Playwright-managed services run frontend on 3100 and backend on 5100; the testing server sets `VITE_TEST_MODE=true`. Tests are headless-only.
- Dirty DB policy and API-first data setup should be stated prominently and repeated in the how-to guide.
