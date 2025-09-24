# Contributor Documentation

Welcome! This section is the canonical reference for engineers, QA, and technical writers contributing to the Electronics Inventory frontend. It consolidates the previously scattered notes in `tests/`, `AGENTS.md`, and the Playwright epics into a single home for contributor workflows.

## Audience & Scope

- **Who**: Frontend engineers, automation developers, and documentation contributors.
- **What**: Local setup, environment configuration, testing strategy, instrumentation architecture, and hands-on guides for extending the UI test suite.
- **Why**: Provide a single source of truth so new work follows the implemented patterns without rediscovering tribal knowledge.

## Start Here

- [Getting Started](./getting_started.md) – clone, install, and run the app locally.
- [Environment Reference](./environment.md) – required environment variables and port conventions.
- [Testing Overview](./testing/) – how the Playwright suite is structured and how we keep reruns stable.
- [Add an E2E Test](./howto/add_e2e_test.md) – step-by-step workflow when expanding coverage for a feature.

## Testing Deep Dives

- [Playwright Developer Guide](./testing/playwright_developer_guide.md)
- [Selector Patterns](./testing/selector_patterns.md)
- [No-Sleep Patterns](./testing/no_sleep_patterns.md)
- [Error Handling & Validation](./testing/error_handling_and_validation.md)
- [Factories & Fixtures](./testing/factories_and_fixtures.md)
- [Page Objects](./testing/page_objects.md)
- [CI & Execution](./testing/ci_and_execution.md)
- [Troubleshooting](./testing/troubleshooting.md)

## Architecture Notes

- [Test Instrumentation](./architecture/test_instrumentation.md) – Test-event taxonomy and emitters.
- [Application Overview](./architecture/application_overview.md) – high-level frontend architecture in context of the inventory domain.

All docs assume familiarity with TypeScript, React 19, TanStack Router/Query, and Playwright. When in doubt, align with the patterns documented here and cross-link new material back to this hub.
