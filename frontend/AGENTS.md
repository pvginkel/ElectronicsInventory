# Electronics Inventory Frontend – Agent Notes

Keep this file light and point contributors to the canonical documentation.

## Core References

- `docs/product_brief.md` — product context and workflows the app must serve.
- `docs/contribute/index.md` — contributor hub with setup, environment, testing, and how-to guides.
- `docs/contribute/architecture/application_overview.md` — architecture snapshot of React 19 + TanStack Router/Query, generated API client, Tailwind, and Vite.
- `docs/contribute/testing/playwright_developer_guide.md` — Playwright usage, selector strategy, factories, and instrumentation checklist.

## Sandbox Environment

- Backend and frontend worktrees are bind-mounted into `/work` inside the container.
- Each repository’s `.git` directory is mapped read-only, so staging or committing must happen outside the sandbox.
- The container includes the standard project toolchain; request Dockerfile updates if more tooling is needed.
- With Git safeguarded externally, no additional safety guardrails are enforced beyond the project’s own guidelines.

### Playwright Test Requirements (Review Before Every Change)

- `docs/contribute/testing/index.md` — high-level testing principles, mandatory real-backend policy, and backend coordination steps.
- `docs/contribute/testing/playwright_developer_guide.md` — authoring patterns, backend extension expectations, and deterministic workflows.
- `docs/contribute/testing/factories_and_fixtures.md` — API factory usage and the prohibition on request interception.
- `docs/contribute/testing/ci_and_execution.md` — execution policies, managed services, and headless rules.

Designers drafting plans and developers implementing Playwright work must re-read these documents before touching the suite.

## Architecture Snapshot

- Modern React 19 + TypeScript app with TanStack Router/Query and generated OpenAPI hooks.
- Domain-driven folder layout (`src/components/<domain>`, `src/hooks`, `src/lib/{api,test,utils}`) — see the architecture overview doc for details.
- Custom hooks wrap generated API clients and map snake_case payloads to camelCase models before reaching components.

## Working Guidelines

1. Follow the patterns documented in the contributor guides; prefer extending existing abstractions over introducing new ones.
2. Use the generated API hooks and centralized error handling — avoid ad hoc `fetch` or manual toast logic.
3. Keep instrumentation behind `isTestMode()` and follow the documented test-event taxonomy when enhancing visibility.
4. When in doubt, defer to `docs/contribute/` rather than copying guidance back into this file.

## Development Workflow (Quick Links)

- Setup & scripts: `docs/contribute/getting_started.md`
- Environment variables & ports: `docs/contribute/environment.md`
- Commands reference: `pnpm dev`, `pnpm type-check`, `pnpm lint`, `pnpm check`, `pnpm generate:api`, `pnpm build`, `pnpm preview`
- Playwright execution: `pnpm playwright`, `pnpm playwright --debug` (headless by default). Detailed policies live in `docs/contribute/testing/ci_and_execution.md`.

## Readability Comments

- Add short “guidepost” comments in non-trivial functions to outline the flow or highlight invariants.
- Keep existing explanatory comments unless they are clearly wrong; prefer updating over deleting.
- Focus on intent-level commentary (why/what) rather than narrating obvious statements (how).

## Definition of Done

- TypeScript strict mode passes; no `any` without justification.
- Generated API types, TanStack Query, and automatic error handling are used consistently.
- UI state reflects camelCase domain models produced by custom hooks.
- Playwright coverage or updates follow the how-to guide and instrumentation expectations (no `page.route`/`mockSSE`; the `testing/no-route-mocks` lint rule must stay green).

## Command Templates

For structured tasks use the command templates under `docs/commands/`:
- Create product brief: `@docs/commands/create_brief.md`
- Plan feature: `@docs/commands/plan_feature.md`
- Review plan: `@docs/commands/review_plan.md`
- Perform code review: `@docs/commands/code_review.md`

Refer back to this file only as a launchpad; the authoritative content lives in the linked docs.
