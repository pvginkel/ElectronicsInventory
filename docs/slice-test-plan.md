# Slice testing strategy

How a slice is proven once its phases are merged. This is the doc `.aiworkflowrc` names as
`test_phase.strategy`: the run loop's test phase is "read this and execute it", and nothing else
names it. Read it top to bottom and do what it says.

## What this phase proves, and what it does not

**Verification here is local.** There is exactly one deployment — production — and no dev instance
to roll, so this phase deploys nothing and verifies nothing against a deployed instance. It runs
the suites tree-wide and boots the dev stack in this environment, from the merged working tree.

**The push at step 4 deploys to production.** `Jenkinsfile` is one pipeline with no DTAP: it runs
the validation suites, builds all three images (`electronics-inventory`, `-ui`, `-docs`) tagged
`latest` plus the build number, and ends in `cicd.helmDeploy()`. That is the repo's standing
behaviour — every push to `main` has always done it — not something this phase controls. The
consequence for ordering is the whole point of this doc: **everything is verified before the push,
because after the push it is live.**

There is no `devlock`: with no dev instance, nothing contends.

## 0. Preconditions

The driver has ff-merged every code phase into the base branch. Confirm the tree is clean
(`git status --short`) before starting — a dirty tree here means an earlier phase left something
behind, and that is a finding, not something to tidy away.

Every `kc project` verb is cwd-bound: run them from the repository root.

## 1. The suites, tree-wide

```bash
kc project build      # frontend: pnpm install + pnpm build (which runs pnpm check)
kc project test       # backend pytest and the Playwright E2E suite, both via run-suite
kc project lint       # ruff, mypy, vulture, pnpm check, arch-validate on both components
```

All three must be green. `kc project build` is also what preflight demands, so a red build here
means the slice never should have reached this phase.

**No gate is known red.** All three were green tree-wide at onboarding (2026-09-07), matching CI
build #239 (`exit=0, 1382 passed, 0 failed, 6 skipped`). A failure here is therefore this slice's,
not inherited — treat it as a blocking finding rather than looking for a pre-existing card.

Two things that are *not* failures: `kc project test` writes a gitignored, multi-megabyte
`test_results.md` at the root (grep it, never read it whole), and `run-suite --output-mode simple`
reports only `PASS`/`FAIL` per step. If a count is wanted, run the underlying command once directly
(`cexec modern-app sh -c 'cd backend && poetry run pytest'`).

`frontend`'s vitest suite is deliberately outside the pipeline. Run `cexec modern-app sh -c 'cd
frontend && pnpm test:unit'` by hand when the slice touched `src/**/__tests__` or
`scripts/__tests__`, and say so.

## 2. The live check

Boot the dev stack the way this repo does — honcho, via `scripts/dev.py`, in the `modern-app`
sidecar (this container has no poetry, pnpm or node). It runs in the foreground and stops on
Ctrl-C, so drive it through a FIFO and keep the wrapper's pid:

```bash
mkfifo /tmp/devfifo
timeout 600 ./scripts/dev.py > /tmp/dev.out 2>&1 < /tmp/devfifo &
DEVPID=$!
exec 9> /tmp/devfifo                 # hold the write end open, or dev.py sees EOF
```

Then probe the three ports `.kubecoder/config.yaml` publishes — frontend `3000`, backend `3001`,
SSE gateway `3002` — plus whatever surface this slice actually changed:

```bash
curl -sS --retry 40 --retry-delay 3 --retry-connrefused -o /dev/null \
     -w 'frontend %{http_code}\n' http://localhost:3000/
curl -sS -w 'healthz %{http_code} ' http://localhost:3001/health/healthz
curl -sS -w 'readyz  %{http_code} ' http://localhost:3001/health/readyz
curl -sS -o /dev/null -w 'openapi %{http_code}\n' http://localhost:3001/api/docs/openapi.json
curl -sS -o /dev/null -w 'types   %{http_code}\n' http://localhost:3001/api/types
curl -sS -o /dev/null -w 'proxied %{http_code}\n' http://localhost:3000/api/types
```

Expected: `frontend 200`, `healthz 200`, `openapi 200`, `types 200`, `proxied 200`, and
`readyz 200` with `"database": {"connected": true}` and `"sse_gateway": {"reachable": true}`.
The dev stack has a database — the `postgres` sidecar, which `kc project setup` creates and
migrates — so `/api/types` is a real read against it, direct on 3001 and through the Vite dev
server's proxy on 3000. That makes this check prove a data path as well as that all three
processes boot, serve and wire to each other. Both suites remain unaffected either way: they
configure SQLite themselves.

Stop it by sending Ctrl-C down the FIFO and waiting on the pid you captured:

```bash
printf '\003' >&9
wait $DEVPID                          # exit 130 is the clean Ctrl-C path
exec 9>&-; rm -f /tmp/devfifo
```

Confirm all three ports are closed afterwards. Never `pkill -f dev.py` — the pattern matches the
killing shell's own command line. `scripts/dev.py` tees per-service output to `logs/<service>.log`;
read those when a probe surprises you, and check `git status` is clean before moving on.

## 3. Check off `verification.json`

Mark each acceptance criterion with the evidence that settled it — the command run and what it
returned, or the surface probed and what it answered. A criterion nothing in steps 1–2 exercised is
not "passed by inspection"; it is either an untested criterion (a finding) or one whose check
belongs in this doc and is missing from it.

## 4. Push, then follow the build

Pushing is this phase's job — the driver ff-merges locally and never pushes a code phase, then
checks before the doc phase that every repo in `state.json`'s `bases` reached `origin`. Push each
one, honouring any repo named in `plan.md`'s `## Push holds`. The spec repo is a separate git repo
and is pushed separately.

Then follow the build the push triggered, on the Jenkins job
**`ElectronicsInventory/ElectronicsInventory`**. Record `lastBuild.number` *before* pushing so you
can tell the new build from the old one, then poll:

```
mcp__jenkins__getJob   jobFullName=ElectronicsInventory/ElectronicsInventory
                       tree=lastBuild[number,building,result,description]
mcp__jenkins__getBuild jobFullName=ElectronicsInventory/ElectronicsInventory
                       buildNumber=<n>  tree=number,building,result,description
```

A full build takes **about 20 minutes** (validation Job, three kaniko image builds, helm deploy),
so poll every few minutes rather than continuously. `description` carries the suite totals
(`exit=0, 1382 passed, 0 failed, 6 skipped`) as soon as validation finishes, well before `result`
is set. If this session has no `mcp__jenkins__*` tools, fall back to the job's JSON API at
`https://jenkins.webathome.org/job/ElectronicsInventory/job/ElectronicsInventory/lastBuild/api/json?tree=number,building,result,description`
— which needs Jenkins credentials this pod does not carry, so the MCP tools are the working path
and the API is only a fallback for a session that has those credentials.

This is a **did-I-break-CI check, not a verification gate** — the slice was already proven in
steps 1–2. What it catches is the class of failure only CI can see: the three image builds, the
helm deploy, and the suites running under the validation Job's retry policy. A red build is a
blocking finding even though every local check passed.

## Findings

Blocking findings come back as appended phases. Sub-bar findings go in the close-out report for the
operator to triage. A check that cannot be run at all — the sidecar unavailable, Jenkins
unreachable — is reported as *not verified*, never as passed; the phase may end with a criterion
unproven and said so, and may not end with one assumed.

## The operator gate

The operator's gate is the close-out report, after the run. Production has by then already taken
the change, which is what makes steps 1–2 the real gate and why they precede the push.
