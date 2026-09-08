# CLAUDE.md

Guidance for Claude Code and any other agent working in this repository.

## What this is

A hobby electronics parts inventory system: a Flask BFF backend and a React SPA, merged from two
repos into one monorepo on 2026-08-19 (history preserved, one merge commit with two parents). It
runs as three processes — the backend, the SPA, and an SSE gateway that is not code in this repo —
and deploys to one production instance. There is no DTAP: a push to `main` deploys.

## Repository shape

- `backend/` — Flask + SQLAlchemy BFF API (Poetry, Python 3.13).
- `frontend/` — React 19 + Vite SPA (pnpm) with a Playwright E2E suite and a published VitePress
  docs site under `frontend/docs/`.
- root — the suite runner (`tools/suite_runner/`), the honcho dev stack, CI, and the KubeCoder
  manifest. The root Poetry project exists only for that tooling.
- `../ElectronicsInventorySpecs` — the spec repo, where the pipeline's slices live. It is a
  **separate git repo** and a shared clone mounted into every environment of this project: commit
  there separately, early and often, staging by name.

**Each component has its own agent instructions**: `backend/CLAUDE.md` and
`frontend/CLAUDE.md`. Those files hold the layer-by-layer patterns, testing requirements, and
definitions of done. **Read the one for the component you are touching.**

## Commands

`kc project` is pure-local and the dev container has no language toolchain, so every toolchain
command goes through the `modern-app` sidecar as `cexec modern-app …`. Run `kc project` from the
repo root — the verbs are cwd-bound.

```bash
kc project setup|build   [--project root|backend|frontend]
kc project test|lint     [--project backend|frontend]
```

Everything else — the suite runner and its flags, running one test, the dev stack, regenerating the
API client, the database CLI, architecture validation, and where local config lives — is in
[`docs/commands.md`](docs/commands.md).

## Design philosophy

[`docs/change-discipline.md`](docs/change-discipline.md) is the authority, and it is what a
reviewer cites. The load-bearing one: **this is a BFF — the backend serves only this frontend.**
Make breaking changes freely, delete replaced code outright, and update both sides in the same
change. No deprecation shims, no re-exports at old import paths, no stub modules.

Two completeness rules follow from it: a backend schema change is not done until the client is
regenerated and the frontend compiles against it, and a UI flow change is not done until its
instrumentation and Playwright specs ship with it.

## Architecture

[`docs/architecture.md`](docs/architecture.md) covers the three processes, the generated
role-annotated API client that is the seam between the components, both layerings, how the suites
boot real services, and what CI deploys.

The one thing to know before touching the frontend: `src/lib/api/generated/` and
`src/routeTree.gen.ts` are **gitignored build outputs**. A fresh checkout does not type-check until
`kc project setup` (or `pnpm generate:api`) has produced them.

## Where to read next

- `backend/CLAUDE.md`, `frontend/CLAUDE.md` — the per-component patterns and definitions of done.
- `frontend/docs/contribute/` — the contributor handbook: setup, testing, UI patterns.
- `docs/` — the cross-cutting topic docs, including the pipeline's change discipline, slice testing
  strategy and slice doc plan.
- Both components' `README.md` still describe standalone repositories and pre-merge ports
  (5000 / 8000). `docs/commands.md` has the real ones; treat those READMEs as stale on setup
  topics.
