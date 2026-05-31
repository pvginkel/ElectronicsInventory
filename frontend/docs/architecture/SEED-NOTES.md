# Seed notes — electronics-inventory-ui

First architecture artifact for the Electronics Inventory **frontend** (SPA)
producer. Hand-authored mode (the YAML is the source of truth). Ran headless;
borderline elements defaulted to `out` per the inclusion rule.

## Identity (fixed by the operator, not re-derived)

- Producer id: `electronics-inventory-ui`
- Mode: hand-authored, mint-once uuid4.
- `introduced` = this repo's first commit date `2025-08-22`
  (`git log --reverse --format=%ad --date=short | head -1`), same on every element.

## Minted ids

| id | kind | uuid | label |
|---|---|---|---|
| `app:electronics-inventory-ui` | ApplicationComponent «SoftwareProduct» | `31069366-0e8b-4b4e-895b-77beb8023b47` | Electronics Inventory UI |
| `svc:electronics-inventory-ui-web` | ApplicationService | `36921b9b-7eef-400f-89f0-7771a9fb48e4` | Electronics Inventory Web UI |
| `if:electronics-inventory-ui-http` | ApplicationInterface | `64fb86af-ccca-4cd2-a890-df8f52409acb` | Electronics Inventory Web UI (HTTP) |

The product carries `sourceRepository: git:pvginkel/ElectronicsInventoryUI`
and `stats.image: registry:5000/electronics-inventory-ui`.

`environment`/`cluster` left UNSET on all three — these are logical, type-level
surfaces that span every deployed env; per-env placement is the helm-charts
producer's job.

## Exposed surface — modeling decision

A SPA does not offer a machine API; it delivers a **web UI over HTTP to
end-user browsers**. I modeled this as the producer's single exposed
`ApplicationService` (`svc:electronics-inventory-ui-web`) realized by the
product, with one `ApplicationInterface` (`if:...-http`) for the single
consumer class (the end-user browser). This mirrors the backend producer's
`app —Realization→ svc` / `if —Assignment→ svc` shape and gives the deployer
(HelmCharts) a service UUID to attach the public host to. The static assets
are served by an in-container nginx (`nginx.conf`).

- `rel:eiui-realizes-web`: `app —Realization→ svc`
- `rel:eiui-http-if-assignment`: `if —Assignment→ svc`

## Outbound consumption — frontend → backend

The SPA's sole architectural dependency is the backend API.

- `rel:eiui-consumes-backend-api`: `app:electronics-inventory-ui —Association→
  svc:electronics-inventory-api,2f8b6c1e-4d3a-4b9c-8a7f-6e5d4c3b2a19`
- **No `boundBy`.** The browser calls `/api/**` on its **own origin**; the
  generated client sets `baseUrl: ''` (`src/lib/api/client.ts:74-76`,
  `scripts/generate-api.js:74-76`) and nginx reverse-proxies `/api/` to the
  backend (`nginx.conf`). No env var carries the API base URL at browser
  runtime, so there is no `env:` recipe to record. (Dev-only Vite proxy targets
  `BACKEND_URL` / `SSE_GATEWAY_URL` in `vite.config.ts` are build-time proxy
  config, never exposed to the browser — not `boundBy` material.)
- **Cross-producer reference.** `svc:electronics-inventory-api` is owned by the
  `electronics-inventory` (backend) producer. Its uuid was resolved from that
  repo's local checkout
  (`../ElectronicsInventory/docs/architecture/architecture.yaml`), NOT from the
  published dataset — the backend producer is **not yet published**
  (confirmed: no `electronics-inventory` match in
  `https://architecture.webathome.org/data/v0.1/architecture.yaml`, which
  currently lists `ansible` and others). This reference therefore **dangles**
  until the backend's first build registers — reported by the merge-time
  cross-producer check, not a validation failure.

## Excluded (and why)

- **OIDC / `cap:iam`** — OUT. The SPA does **not** authenticate directly with
  an IdP. The backend owns the full OIDC authorization-code-with-PKCE flow
  (`/api/auth/login|logout|callback`); the browser only reads session state via
  `/api/auth/self` (`src/hooks/use-auth.ts:57-95`, `src/lib/auth-redirect.ts`,
  `src/contexts/auth-context.tsx`). No `oidc-client`/`msal`/`keycloak-js` in
  `package.json`; no `VITE_*` issuer URL. So no `app —Association→ cap:iam` edge
  belongs to the frontend.
- **SSE gateway** — no separate edge. The browser connects via the same-origin
  relative path `/api/sse/stream` (`src/workers/sse-worker.ts:150`,
  `src/contexts/sse-context-provider.tsx:196`); nginx routes `/api/sse/` to the
  gateway. From the SPA's view this is just part of consuming its own-origin
  backend API — it is not a distinct addressable dependency of the frontend.
  The backend producer already models the real `electronics-inventory →
  svc:ssegateway` edge. Modeling a second frontend→gateway edge would invent a
  dependency the SPA cannot see.
- **External SaaS direct from the browser** — none exist. A `://` sweep across
  `src/` plus an env scan found no direct browser calls to external services
  (no analytics, error tracking, CDN APIs, favicon service, maps). URL/preview
  features go through the backend (`/api/parts/attachment-preview`,
  `src/hooks/use-url-preview.ts`). All `fetch`/EventSource targets are
  same-origin `/api/**`.
- **`electronics-inventory-docs` image** (`Dockerfile.docs`) — OUT per operator
  instruction. It is a docs build artifact, not a deployed `app:*` product.
- **Operational/build surfaces** — OUT: nginx `/metrics`-style endpoints,
  Vite/Playwright/test-mode instrumentation, validation entrypoint. These are
  not named architectural surfaces reachable by another component.

## Open questions (would have asked a human)

- **Is the SPA's served web UI worth modeling as an `ApplicationService`, or
  should the frontend declare no exposed service and let HelmCharts mint the
  public-host interface?** I modeled one web-UI service for symmetry with the
  backend and to give the deployer a UUID to hang the public host on. If the
  convention is that a pure static SPA exposes nothing at the app layer, drop
  `svc:electronics-inventory-ui-web` + `if:...-http` and their two relations.
- **frontend→backend with no `boundBy`:** confirmed there is genuinely no
  runtime env var for the API base URL (same-origin nginx proxy). If a future
  deployment ever injects the backend host via env/runtime config, add the
  `boundBy: "env:<VAR>"` recipe then.
- The cross-producer backend `svc` reference will dangle until the
  `electronics-inventory` producer is registered and built. No action needed
  on this side once that lands.

## Validation

`./scripts/arch-validate.py docs/architecture/*.yaml` → exit 0 (clean).
