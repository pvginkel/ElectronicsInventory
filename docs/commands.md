# Commands

Everything you run in this repo, and the one rule that governs all of it.

**`kc project` is pure-local and the dev container carries no language toolchain.** Poetry and pnpm
live in the `modern-app` tool sidecar, so every statement `kc project` runs — and every ad-hoc
command you run yourself — goes through `cexec modern-app …`. For compound commands use
`cexec modern-app sh -c '…'`. Every `kc project` verb is cwd-bound: run them from the repo root.

## The curated entry points

Prefer these over ad-hoc `poetry`/`pnpm` invocations:

```bash
kc project setup|build   [--project root|backend|frontend]   # default: all components
kc project test|lint     [--project backend|frontend]        # no root component for these
kc project info                                              # what is configured
```

Lint is `ruff` + `mypy` + `vulture` for the backend and `pnpm check` (eslint + `tsc -b` + knip) for
the frontend; both end with `scripts/arch-validate.py`. Note `backend/scripts/check.py`
(`poetry run check`) also runs pytest, which duplicates the `test` verb — the `lint` verb
deliberately does not use it.

`kc project setup` seeds `backend/.env` (at the postgres and MinIO sidecars) and
`backend/.env.test` (MinIO) when they do not exist; it never overwrites an existing file. It then
creates the `electronics_inventory` database if the sidecar has not got one yet and applies the
migrations — both idempotent, so a re-run is a no-op.

## Tests

Both `test` verbs delegate to `run-suite` (`tools/suite_runner/`) so local runs and the Jenkins
validation job execute the same steps in the same order. Run it from the repo root:

```bash
cexec modern-app poetry run run-suite --suite backend
cexec modern-app poetry run run-suite --suite backend  --backend-args  "tests/test_parts.py -k create"
cexec modern-app poetry run run-suite --suite frontend --frontend-args "tests/e2e/parts/part-crud.spec.ts"
```

Other flags: `--max-failures`, `--retries`, `--workers`, `--output-mode {simple,full}`,
`--junitxml-dir`. `simple` (default) writes a summary plus the gitignored, multi-megabyte
`test_results.md` at the root — grep it, do not read it whole, and note it records only `PASS`/`FAIL`
per step, never a count. There is no changed-file detection and no way to list tests.

The `frontend` suite runs a full `pnpm install` + `pnpm build` (which itself runs `pnpm check`) +
`playwright install` before a single spec executes. For iteration, go direct instead:

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
  `scripts/__tests__`; neither `run-suite` nor CI runs it, because both mirror the pre-merge
  validation entrypoint exactly. Run it by hand when you touch what it covers.

`kc project lint` and `kc project test` leave `.mypy_cache`, `.pytest_cache` and `.ruff_cache`
behind; every image build context excludes them.

## Dev stack

```bash
cexec modern-app ./scripts/dev.py                    # honcho: backend :3001, frontend :3000, SSE gateway :3002
cexec modern-app ./scripts/dev.py backend frontend   # subset (positional; honcho's -e is --env, not --except)
```

`dev.py` runs honcho, and every Procfile line needs poetry, pnpm or node — none of which exist in
the dev container — so the `cexec` prefix is not optional. VS Code's _Dev Services_ task in
`ElectronicsInventory.code-workspace` runs exactly this. Per-service output is tee'd to
`logs/<service>.log`, and the same three ports are what `.kubecoder/config.yaml` exposes.

**The dev stack runs on the `postgres` sidecar.** `DATABASE_URL` defaults to
`postgresql+psycopg://postgres:postgres@localhost:5432/electronics_inventory`, which is where the
sidecar listens, and `kc project setup` creates that database and applies the migrations — see the
two commands below. So the SPA, `/health/healthz` and the data calls all answer, and
`/health/readyz` returns 200 with `database.connected: true`. Neither suite touches it: both
configure SQLite themselves.

## Regenerating the API client

```bash
cexec modern-app scripts/regenerate-openapi.py
```

Boots the backend on a free port, polls `/api/docs/openapi.json`, then runs `pnpm generate:api` in
`frontend/` and refreshes the committed cache at `frontend/openapi-cache/openapi.json` (which is
what `pnpm build` consumes offline).

## Database

All from `backend/`, so through the sidecar as `cexec modern-app sh -c 'cd backend && …'`:

- `poetry run cli upgrade-db` — applies migrations *and* syncs part types from
  `app/data/setup/types.txt`.
- `poetry run cli load-test-data --yes-i-am-sure` — recreates the schema and loads the fixed
  dataset from `app/data/test_data/`.
- `poetry run alembic revision --autogenerate -m "..."` — a new migration into
  `backend/alembic/versions/` (numbered `NNN_slug.py`).

## Architecture validation

`scripts/arch-validate.py docs/architecture/*.yaml` (run from `backend/` or `frontend/`) POSTs the
model to the federated architecture service; exit 0 valid, 1 invalid, 2 transport. It is
stdlib-only, so it runs in the dev container with no `cexec` prefix, and it is the last statement
of both components' `kc project lint`.

## Local config

Secrets and local config live in gitignored `backend/.env`, `backend/.env.test` and
`frontend/.env.test`; the committed templates are the `.env.example` files. `OIDC_ENABLED` is
`false` locally, and the Playwright harness forces it off for its own processes. `OPENAI_API_KEY`
is projected as an environment variable from the secret catalog, which beats the `.env` in
pydantic-settings, so it does not belong in either file.
