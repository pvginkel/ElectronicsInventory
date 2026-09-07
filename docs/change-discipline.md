# Change discipline

The rules every code change in this repo obeys, in both components. This is the doc
`.aiworkflowrc` names as `design_philosophy`: it is handed to every `code-writer`, `code-reviewer`,
`plan-writer` and `plan-reviewer` the pipeline dispatches, and it is what a reviewer cites when
sending work back. It states the rules; the patterns they apply to live in `backend/AGENTS.md` and
`frontend/AGENTS.md`, which each component's `CLAUDE.md` symlinks to.

## Clean breaking changes

**This is a BFF: the backend serves only this frontend.** Nothing outside the repo consumes the
API — no second client, no public surface, no versioned contract. So when an endpoint, a schema or
a hook changes shape, **fix the other side in the same change**. No deprecation shims, no
re-exports at old import paths, no stub modules, no `v2` endpoint beside a `v1` that stays alive.

The corollary is a completeness rule, not a licence: a backend schema change is not done until
`pnpm generate:api` has been re-run and the frontend type-checks against it, and a UI flow change
is not done until its test instrumentation and Playwright specs ship with it. Half a breaking
change is worse than none.

## No tombstones

Delete replaced code completely. No "moved to X" comments, no forwarding stubs, no deprecated
aliases, no commented-out blocks, no dead re-exports, no compatibility fields left on a schema
"just until the frontend catches up" — the frontend catches up in the same commit. The same applies
to prose: when a convention is superseded, **rewrite the doc** rather than appending a note that
the old rule no longer holds. Git history records what things used to be; the working tree only
ever states what is true now.

## No defensive coding, no "just in case" infrastructure

No `try`/`except` that swallows an error, no skip-the-bad-row-and-keep-going path, no null guard
for a condition SQLAlchemy or Pydantic already prevents, no silent fallback for data the schema
guarantees. No retry, cache or scheduled reconciliation added without a real observed failure to
point at.

**Validation at the system's boundaries is the exception, and it is the point.** Request bodies are
validated by the SpecTree + Pydantic schemas in `backend/app/schemas/`; that is the feature, not
defensiveness. So is handling what a genuinely external system does — S3 being unreachable, an
OpenAI call failing, an SSE client disconnecting mid-stream. The distinction is where the value
came from: validate what crosses into the system, trust what the system already established.

Per-layer reading: `app/api/` is HTTP only and validates its input; `app/services/` holds the
business logic and may assume its arguments are already valid; the frontend's hooks map
snake_case payloads to camelCase models and may assume the generated types are accurate, because
they were generated from the schema that produced the payload.

## Testability is critical

Every change ships with a test. A feature without one is incomplete, and "I checked it by hand" is
not a substitute — the point of the test is that it runs again next time.

| Component | Suite | Runs as |
|---|---|---|
| `backend` | pytest, under `backend/tests/` | `kc project test --project backend` |
| `frontend` | Playwright E2E, under `frontend/tests/e2e/` | `kc project test --project frontend` |

Both boot real services: the backend suite runs on in-memory SQLite against a live MinIO, and the
Playwright suite boots its own backend, SSE gateway and frontend per worker. There are no service
mocks in the E2E layer and `page.route`/response mocking is banned by the `testing/no-route-mocks`
eslint rule — a test that needs a stub is a seam that needs fixing.

Playwright specs wait on the instrumentation events in `frontend/src/lib/test/`
(`ListLoading`, `Form`), never on a sleep. Adding a flow means adding its events in the same
change.

`frontend`'s vitest suite (`pnpm test:unit`) covers `src/**/__tests__` and `scripts/__tests__` and
is **not** in the pipeline — neither `run-suite` nor CI runs it, because both mirror the
pre-merge validation entrypoint exactly. Run it by hand when you touch what it covers.

A change that genuinely cannot be covered by either suite is a change whose testability problem is
the first thing to solve — say so and fix the seam, rather than shipping it uncovered.

## Never hand-edit generated artifacts

`frontend/src/lib/api/generated/` (`types.ts`, `client.ts`, `hooks.ts`, `roles.ts`,
`role-map.json`) and `frontend/src/routeTree.gen.ts` are build outputs, produced by
`pnpm generate:api` and `pnpm generate:routes` from the backend's OpenAPI spec and the route files.
Both trees are **gitignored**, which makes hand-edits vanish rather than persist — but the rule
matters before that, because an edit there is an edit to something the next `pnpm build`
overwrites. Change the source and regenerate: a route file, or a backend schema followed by
`scripts/regenerate-openapi.py` (which also refreshes the committed
`frontend/openapi-cache/openapi.json` the offline build consumes).

Authorisation is part of that generated surface. The `role-import-enforcement` and
`gate-usage-enforcement` eslint rules pair a mutation hook with its generated role constant and
require the constant to reach a `<Gate>` or `hasRole(…)`. The backend enforces the role regardless;
the frontend gate is UX. Do not silence either rule to ship — gate the element.

## This is a public repo

`github.com/pvginkel/ElectronicsInventory` is world-readable. No secrets, credentials, internal
hostnames or IP addresses, and no non-public names — in code, in tests, in fixtures, in commit
messages, or in the architecture artifacts under `docs/architecture/`. Assume every line is read by
someone outside the homelab, because it can be.

The spec repo (`ElectronicsInventorySpecs`) is **private**, which is where anything that must not
be public belongs. It is not a licence to be careless there, but it is the right home for a slice
whose statement names internal infrastructure.
