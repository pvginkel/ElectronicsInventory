# Testing Overview

The Electronics Inventory frontend ships with a Playwright-based end-to-end suite that runs against the real backend. This overview introduces the architecture, philosophy, and folder layout before you dive into the detailed guides.

## Guiding Principles

1. **API-first data setup** – Tests create prerequisite data through API factories; never click UI to seed state.
2. **Dirty database friendly** – Tests randomize identifiers and never clean up, enabling fast reruns without resets.
3. **Page objects over selector maps** – Each feature owns a page object colocated with its tests for readable UI interactions.
4. **No arbitrary waits** – Assertions rely on observable UI state or deterministic events; `waitForTimeout` is banned.
5. **Test-mode instrumentation** – Frontend emits structured test events only when `VITE_TEST_MODE=true`, and Playwright captures them via a dedicated bridge for deterministic assertions.

## Folder Layout

```
tests/
├── api/                # Node-safe API client + factories
├── e2e/                # Feature-focused Playwright specs & page objects
├── support/            # Fixtures, helpers, console/error policies
├── README.md           # Legacy doc (now points here)
└── *.md                # Legacy pattern docs (now moved under docs/contribute)
```

- **Factories & Fixtures**: See [Factories & Fixtures](./factories_and_fixtures.md)
- **Page Objects**: See [Page Objects](./page_objects.md)
- **Selector Strategy**: See [Selector Patterns](./selector_patterns.md)
- **Wait Strategies**: See [No-Sleep Patterns](./no_sleep_patterns.md)

## Test Taxonomy

- `tests/e2e/types/*` – Types feature pilot coverage (CRUD, blocked delete)
- `tests/support/fixtures.ts` – Registers shared fixtures (`testData`, `types`, console guarding, test-event bridge)
- `tests/support/global-setup.ts` – Configures environment before the suite (sets `FRONTEND_URL`, etc.)

As additional features gain coverage, follow the same foldering: keep page objects next to their specs and reuse shared helpers from `tests/support`.

## Performance Guidelines

- Seed complex state through factories instead of long UI flows.
- Prefer specific assertions over broad waits to keep runs fast.
- Avoid duplicate coverage—exercise each backend path once per spec unless a regression requires more.
- Use parallel-safe random data (`prefix-shortId`) so reruns skip costly resets.

## Instrumentation & Signals

- The frontend emits structured test events through the Playwright bridge while in test mode.
- Tests use helpers such as `waitTestEvent` and `expectConsoleError` from `tests/support/helpers.ts`.
- Review [Test Instrumentation](../architecture/test_instrumentation.md) for the precise taxonomy (`route`, `form`, `api`, `toast`, `error`, `query_error`, `sse`).

## Next Steps

- Deep dive into the [Playwright Developer Guide](./playwright_developer_guide.md) for detailed workflows.
- When adding coverage, follow the [Add an E2E Test](../howto/add_e2e_test.md) checklist.
- For execution details (headless policy, managed services), see [CI & Execution](./ci_and_execution.md).
