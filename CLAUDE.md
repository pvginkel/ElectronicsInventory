# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository shape

A hobby electronics parts inventory system, merged from two repos into one monorepo on
2026-08-19 (history preserved, one merge commit with two parents):

- `backend/` — Flask + SQLAlchemy BFF API (Poetry, Python 3.13).
- `frontend/` — React 19 + Vite SPA (pnpm) with a Playwright E2E suite.
- root — the suite runner (`tools/suite_runner/`), the honcho dev stack, CI, and the
  KubeCoder manifest. The root Poetry project exists only for that tooling.

**Each component has its own agent instructions**: `backend/AGENTS.md` and
`frontend/AGENTS.md` (each component's `CLAUDE.md` is a symlink to its `AGENTS.md` — edit
`AGENTS.md`, never the symlink). Those files hold the layer-by-layer patterns, testing
requirements, and definitions of done. **Read the one for the component you are touching.**
This file covers only what spans both.

## Commands

Prefer the curated entry points over ad-hoc `poetry`/`pnpm` invocations:

```bash
kc project setup|build   [--project root|backend|frontend]   # default: all components
kc project test|lint     [--project backend|frontend]        # no root component for these
kc project info                                              # what is configured
```

`kc project` is pure-local and the dev container carries no language toolchain, so every
statement it runs — and every ad-hoc command you run yourself — goes through the
`modern-app` tool sidecar via `cexec modern-app …`. For compound commands use
`cexec modern-app sh -c '…'`.

Lint is `ruff` + `mypy` + `vulture` for the backend and `pnpm check` (eslint + `tsc -b` +
knip) for the frontend. Note `backend/scripts/check.py` (`poetry run check`) also runs
pytest, which duplicates the `test` verb — the `lint` verb deliberately does not use it.

### Tests

Both `test` verbs delegate to `run-suite` (`tools/suite_runner/`) so local runs and the
Jenkins validation job execute the same steps in the same order. Run it from the repo root:

```bash
cexec modern-app poetry run run-suite --suite backend
cexec modern-app poetry run run-suite --suite backend  --backend-args  "tests/test_parts.py -k create"
cexec modern-app poetry run run-suite --suite frontend --frontend-args "tests/e2e/parts/part-crud.spec.ts"
```

Other flags: `--max-failures`, `--retries`, `--workers`, `--output-mode {simple,full}`,
`--junitxml-dir`. `simple` (default) writes a summary plus the gitignored, multi-megabyte
`test_results.md` at the root — grep it, do not read it whole. There is no changed-file
detection and no way to list tests.

The `frontend` suite runs a full `pnpm install` + `pnpm build` (which itself runs
`pnpm check`) + `playwright install` before a single spec executes. For iteration, go
direct instead:

```bash
cexec modern-app sh -c 'cd backend  && poetry run pytest tests/test_part_service.py::TestPartService::test_create_part'
cexec modern-app sh -c 'cd frontend && pnpm playwright test tests/e2e/parts/part-crud.spec.ts -g "test name"'
cexec modern-app sh -c 'cd frontend && pnpm test:unit'      # vitest — see below
```

- Backend pytest excludes the `integration` marker by default (`addopts = -v -m 'not integration'`);
  pass `-m integration` to include it. Tests run serially — there is no xdist.
- Playwright defaults to 2 workers, no retries, headless, and skips `@slow` unless
  `INCLUDE_SLOW_TESTS=1`.
- **vitest is not in the pipeline.** `pnpm test:unit` covers `src/**/__tests__` and
  `scripts/__tests__`; neither `run-suite` nor CI runs it, because both mirror the
  pre-merge validation entrypoint exactly. Run it by hand when you touch what it covers.

### Dev stack

```bash
./scripts/dev.py                      # honcho: backend :3001, frontend :3000, SSE gateway :3002
./scripts/dev.py backend frontend     # subset (positional; honcho's -e is --env, not --except)
```

Per-service output is tee'd to `logs/<service>.log`. The same three ports are what
`.kubecoder/config.yaml` exposes.

### Regenerating the API client

```bash
scripts/regenerate-openapi.py
```

Boots the backend on a free port, polls `/api/docs/openapi.json`, then runs
`pnpm generate:api` in `frontend/` and refreshes the committed cache at
`frontend/openapi-cache/openapi.json` (which is what `pnpm build` consumes offline).

### Database

From `backend/`: `poetry run cli upgrade-db` applies migrations *and* syncs part types from
`app/data/setup/types.txt`; `poetry run cli load-test-data --yes-i-am-sure` recreates the
schema and loads the fixed dataset from `app/data/test_data/`. New migration:
`poetry run alembic revision --autogenerate -m "..."` into `backend/alembic/versions/`
(numbered `NNN_slug.py`).

### Architecture validation

`scripts/arch-validate.py docs/architecture/*.yaml` (run from `backend/` or `frontend/`)
POSTs the model to the federated architecture service; exit 0 valid, 1 invalid, 2 transport.

## Architecture

### Runtime: three processes

The app is a BFF backend, an SPA, and an **SSE gateway** that is not code in this repo — it
is the `ssegateway` npm package (a git dependency of `frontend/package.json`). The backend
pushes events to it (`app/services/sse_connection_manager.py`, `app/api/sse.py`) and
browsers subscribe through it; the Vite dev server proxies `/api` to the backend and
`/api/sse` to the gateway. Anything long-running goes through `app/services/task_service.py`,
which runs the work on a thread pool and streams progress over SSE.

### The seam: a generated, role-annotated API client

The backend builds its OpenAPI spec from SpecTree + Pydantic schemas at app creation and
serves it at `/api/docs/openapi.json`, annotated with per-endpoint `x-required-role` /
`x-auth-roles`. `frontend/scripts/generate-api.js` turns that into `src/lib/api/generated/`:
`types.ts`, `client.ts`, TanStack Query `hooks.ts`, **and** `roles.ts` + `role-map.json`.

Two consequences worth internalising:

- **`src/lib/api/generated/` and `src/routeTree.gen.ts` are gitignored.** A fresh checkout,
  or any backend schema change, needs `pnpm generate:api` (or `regenerate-openapi.py`)
  before the frontend type-checks. A missing `role-map.json` makes the role-gating eslint
  rule error out, which reads confusingly if you don't know why.
- **Authorisation is generated, then lint-enforced.** `role-import-enforcement` requires a
  mutation hook import to be paired with its role constant; `gate-usage-enforcement`
  requires that constant to actually reach a `<Gate requires={…}>` or `hasRole(…)`. The
  backend enforces the role regardless — the frontend gate is UX only. The gating
  checklist in `frontend/AGENTS.md` is the authority on what must be gated.

### Backend layering

`app/api/` (HTTP only) → `app/services/` (all business logic, instance-based, injected) →
`app/models/` + `app/schemas/`, wired by a `dependency-injector` container
(`app/services/container.py`) that `app/__init__.py` wires into the API packages.
`app/startup.py` holds the app-specific hooks the factory calls. Services with threads
register with `app/utils/lifecycle_coordinator.py` for graceful K8s shutdown. Prometheus
metrics are decentralised — module-level metric objects in the owning service, no wrapper.
Details and required patterns: `backend/AGENTS.md`.

### Frontend layering

File-based TanStack Router routes in `src/routes/`, domain folders under `src/components/`,
custom hooks in `src/hooks/` that wrap the generated clients and map snake_case payloads to
camelCase models before components see them. `src/lib/test/` holds the test instrumentation
(`isTestMode()`, `ListLoading`/`Form` events) that the Playwright suite waits on instead of
sleeping; `scripts/verify-production-build.cjs` fails the build if any of it leaks into
`dist/`. Details: `frontend/AGENTS.md` and `frontend/docs/contribute/`.

### Tests boot real services

There are no service mocks in the E2E layer. Playwright's global setup seeds a SQLite DB via
`backend/scripts/initialize-sqlite-database.sh`, then each worker boots its own backend, SSE
gateway and frontend on `get-port`-allocated ports. `page.route`/response mocking is banned
by the `testing/no-route-mocks` eslint rule. The backend suite runs on in-memory SQLite
(Alembic once per session, then a per-test copy), so no database sidecar exists — but
**S3 must be reachable**: `pytest_configure` aborts the entire run if `S3_ENDPOINT_URL` is
down. Locally that is the MinIO sidecar at `localhost:9000` (`minioadmin`/`minioadmin`);
in CI it is a MinIO sidecar inside the validation pod.

## Cross-cutting conventions

- **This is a BFF: the backend serves only this frontend.** Make breaking changes freely,
  delete replaced code outright, and update both sides in the same change. No deprecation
  shims, no re-exports at old import paths, no stub modules. Both `AGENTS.md` files say
  this at length; it is the single most load-bearing convention in the repo.
- A backend schema change is not done until the client is regenerated and the frontend
  compiles against it.
- A UI flow change is not done until its instrumentation and Playwright specs ship with it.
- `docs/architecture/architecture.yaml` exists in **both** `backend/` and `frontend/`, but
  they are two files of **one** producer (`electronics-inventory`, `sourceRepository:
  git:pvginkel/ElectronicsInventory`). Keep them consistent; `Jenkinsfile.architecture`
  validates both. Element ids are referenced by the wider federated model — do not rename.

## Environment notes

- Secrets and local config live in gitignored `backend/.env`, `backend/.env.test`, and
  `frontend/.env.test`; the committed templates are the `.env.example` files. `OIDC_ENABLED`
  is `false` locally, and the Playwright harness forces it off for its own processes.
- CI is one root `Jenkinsfile`: a throwaway k8s Job runs `run-suite --output-mode full`, then
  three kaniko image builds (`electronics-inventory`, `-ui`, `-docs`) and a Helm deploy.
- Filenames containing `$` (TanStack route params, e.g. `src/routes/parts/$partId.tsx`) must
  be escaped in shell commands — `\$partId` — or the shell expands them to nothing.
- `backend/.claude/agents/` and `frontend/.claude/agents/` are pre-merge copies of the old
  workflow agents. They are superseded by the `dev` plugin; `/dev:onboard` owns retiring
  them. Do not extend them.
- Both components' `README.md` still describe standalone repositories and pre-merge ports
  (5000 / 8000). The ports above are correct; treat those READMEs as stale on setup topics.
