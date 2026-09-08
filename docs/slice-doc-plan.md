# Slice documentation plan

Which documentation surfaces a shipped slice brings up to date, and the rules for each. This is the
doc `.aiworkflowrc` names as `doc_phase.plan`: the run loop's doc phase is "read this and execute
it", working from the whole slice's merged diff.

## The surfaces

Work the diff, not a checklist. Each surface below is owed an update only when the slice's changes
actually reached it.

### 1. The root — `CLAUDE.md` and `docs/`

| Surface | Owns |
|---|---|
| `CLAUDE.md` | the orientation page every dev session loads: what the repo is, its components, where each thing lives |
| `docs/` | cross-cutting topic docs — the change discipline, this plan, the slice testing strategy, and anything that spans both components |

`CLAUDE.md` is held to **about one screen** and states every fact **once**. A slice rarely touches
it. When a new standing rule genuinely belongs there, something else moves out to a `docs/` topic
doc rather than the file growing — and a rule that already has a topic doc is referenced from
`CLAUDE.md`, never restated in it. Nothing the pipeline reads by machine goes there; that is
`.aiworkflowrc`'s job.

Anything that spans backend *and* frontend is root-level, whichever component's code moved. The
generated API client is the clearest case: it is one seam with two ends.

### 2. The component the change lives in

Each component carries a `CLAUDE.md` and its own `docs/`:

- **`backend/CLAUDE.md`** — the layer-by-layer patterns (`api/` → `services/` → `models/`+`schemas/`),
  the container wiring, the testing requirements, the definition of done.
- **`backend/docs/`** — `product_brief.md`, `features.md`, `task_system_usage.md`, and the
  architecture artifact.
- **`frontend/CLAUDE.md`** — routing and component layout, the hook/model mapping, the role-gating
  checklist, the instrumentation contract, the definition of done.
- **`frontend/docs/`** — a **published VitePress site** (see the gate below): `index.md`, the
  `contribute/` hub (getting started, environment, architecture, testing, UI patterns),
  `product_brief.md` and `features.md`.

The role-gating checklist in `frontend/CLAUDE.md` is the authority on what must be gated; a slice
that adds a gated surface updates it there, not in a new doc.

### 3. The two READMEs

`backend/README.md` and `frontend/README.md` are the reader-facing front doors, owed an update when
the component's shape, its stack, or how you run it changed. **Both are known stale on setup
topics** — they still describe standalone repositories and the pre-merge ports (5000 / 8000)
rather than the monorepo's 3000/3001/3002. Do not treat that as this slice's to fix, and do not
copy from them; if a slice's change lands in a paragraph that is already wrong, correct that
paragraph and say so.

### 4. The architecture artifacts, when the shape moved

`docs/architecture/architecture.yaml` exists in **both** components, but they are two files of
**one** producer (`electronics-inventory`) in the federated architecture-as-code model. Keep them
consistent; `Jenkinsfile.architecture` validates both, and `scripts/arch-validate.py` is the last
statement of both components' `kc project lint`. **Element ids are referenced by the wider
federated model — never rename one.** The `update-architecture` agent on the operator's filesystem
owns editing these; a slice that added a managed host, a daemon, a service or an external identity
should say so rather than hand-editing the model.

### 5. What is not a doc surface

`backend/docs/features/` and `frontend/docs/features/` are dated records of pre-plugin feature
runs — plans, plan reviews, execution reports. They are history. Do not update them, do not fix
their references, do not add to them; slices live in the spec repo now.

## What "up to date" means here

**State the design as it is**, as implemented, not as the slice authored it. Where the
implementation diverged from the plan, the doc describes what shipped. No changelog entries, no
"as of slice NNN", no tombstones for superseded conventions — rewrite the doc instead. This is the
same rule the code obeys ([`change-discipline.md`](change-discipline.md)).

**Ground every claim in the shipped source.** A doc sentence that cannot be checked against the
merged tree does not go in. Commands in particular: this container has no poetry, pnpm or node, so
a command a reader can actually run carries its `cexec modern-app` prefix or is a `kc project`
verb.

## Gates

```bash
kc project build                                   # unchanged and green
cexec modern-app sh -c 'cd frontend && pnpm docs:build'   # only if frontend/docs/ changed
```

`kc project build` must be green **and** must not have moved code — the doc phase writes prose, and
a diff that touches `src/` is a finding.

The second gate matters because `frontend/docs/` is published: CI builds it as the
`electronics-inventory-docs` image from `frontend/Dockerfile.docs`, and VitePress fails on a dead
link. Deleting or renaming a page under `frontend/docs/` without fixing what links to it breaks
that image build, and `kc project build` will not catch it. `docs/features/**` is `srcExclude`d and
is not part of the site.

Then check relative links resolve, and commit — this repo and the spec repo separately, since they
are separate git repos.

## When there is little to do

A slice that changed no design, no convention, and no reader-facing surface owes nothing here, and
saying so plainly is the correct outcome. Do not invent doc work to fill the phase; a paragraph
nobody needed is worse than no paragraph.
