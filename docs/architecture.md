# Architecture

The system-level shape, across both components. Each component's own layer-by-layer patterns are in
its `CLAUDE.md`.

## Runtime: three processes

The app is a BFF backend, an SPA, and an **SSE gateway** that is not code in this repo — it is the
`ssegateway` npm package, a git dependency of `frontend/package.json`. The backend pushes events to
it (`app/services/sse_connection_manager.py`, `app/api/sse.py`) and browsers subscribe through it;
the Vite dev server proxies `/api` to the backend and `/api/sse` to the gateway. Anything
long-running goes through `app/services/task_service.py`, which runs the work on a thread pool and
streams progress over SSE.

## The seam: a generated, role-annotated API client

The backend builds its OpenAPI spec from SpecTree + Pydantic schemas at app creation and serves it
at `/api/docs/openapi.json`, annotated with per-endpoint `x-required-role` / `x-auth-roles`.
`frontend/scripts/generate-api.js` turns that into `src/lib/api/generated/`: `types.ts`,
`client.ts`, TanStack Query `hooks.ts`, **and** `roles.ts` + `role-map.json`.

Two consequences worth internalising:

- **`src/lib/api/generated/` and `src/routeTree.gen.ts` are gitignored.** A fresh checkout, or any
  backend schema change, needs `pnpm generate:api` (or `scripts/regenerate-openapi.py`) before the
  frontend type-checks. A missing `role-map.json` makes the role-gating eslint rule error out,
  which reads confusingly if you don't know why. `kc project setup` generates both.
- **Authorisation is generated, then lint-enforced.** `role-import-enforcement` requires a mutation
  hook import to be paired with its role constant; `gate-usage-enforcement` requires that constant
  to actually reach a `<Gate requires={…}>` or `hasRole(…)`. The backend enforces the role
  regardless — the frontend gate is UX only. The gating checklist in `frontend/CLAUDE.md` is the
  authority on what must be gated.

## Backend layering

`app/api/` (HTTP only) → `app/services/` (all business logic, instance-based, injected) →
`app/models/` + `app/schemas/`, wired by a `dependency-injector` container
(`app/services/container.py`) that `app/__init__.py` wires into the API packages. `app/startup.py`
holds the app-specific hooks the factory calls. Services with threads register with
`app/utils/lifecycle_coordinator.py` for graceful K8s shutdown. Prometheus metrics are
decentralised — module-level metric objects in the owning service, no wrapper. Details and required
patterns: `backend/CLAUDE.md`.

## Frontend layering

File-based TanStack Router routes in `src/routes/`, domain folders under `src/components/`, custom
hooks in `src/hooks/` that wrap the generated clients and map snake_case payloads to camelCase
models before components see them. `src/lib/test/` holds the test instrumentation (`isTestMode()`,
`ListLoading`/`Form` events) that the Playwright suite waits on instead of sleeping;
`scripts/verify-production-build.cjs` fails the build if any of it leaks into `dist/`. Details:
`frontend/CLAUDE.md` and `frontend/docs/contribute/`.

## Tests boot real services

There are no service mocks in the E2E layer. Playwright's global setup seeds a SQLite DB via
`backend/scripts/initialize-sqlite-database.sh`, then each worker boots its own backend, SSE
gateway and frontend on `get-port`-allocated ports. `page.route`/response mocking is banned by the
`testing/no-route-mocks` eslint rule. The backend suite runs on in-memory SQLite (Alembic once per
session, then a per-test copy), so neither suite touches the `postgres` sidecar — that one is the
honcho dev stack's database. **S3 must be reachable**, though:
`pytest_configure` aborts the entire run if `S3_ENDPOINT_URL` is down. Locally that is the MinIO
sidecar at `localhost:9000` (`minioadmin`/`minioadmin`); in CI it is a RustFS sidecar inside the
validation pod.

## Deployment

One root `Jenkinsfile`, triggered by a push: a throwaway k8s Job runs `run-suite --output-mode
full`, then three kaniko image builds (`electronics-inventory`, `-ui`, `-docs`) and a Helm deploy.
There is **no DTAP** — a push to `main` goes to production. `docs/slice-test-plan.md` is what a
slice does about that.

A second job, `AaC/ElectronicsInventory`, runs `Jenkinsfile.architecture` off the same repository:
the architecture-as-code producer. `docs/architecture/architecture.yaml` exists in **both**
`backend/` and `frontend/`, but they are two files of **one** producer (`electronics-inventory`,
`sourceRepository: git:pvginkel/ElectronicsInventory`). Keep them consistent; element ids are
referenced by the wider federated model — do not rename one.
