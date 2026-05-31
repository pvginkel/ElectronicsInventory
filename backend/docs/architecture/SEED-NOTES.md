# Architecture seed notes — Electronics Inventory backend

These notes capture every non-trivial decision made while authoring the
first architecture artifact for this repo. They are working notes, not a
permanent contract. The source of truth is the hand-authored
`docs/architecture/architecture.yaml`.

## Identity

- **Producer id**: `electronics-inventory`
- **Product**: `app:electronics-inventory` («SoftwareProduct» ApplicationComponent),
  the Flask BFF backend for the hobby electronics parts inventory.
- **Role**: backend (BFF) only. The SPA frontend is a *separate* producer and
  is intentionally not modelled here (no app→app edge — the frontend→backend
  edge belongs to the frontend producer).
- `sourceRepository: git:pvginkel/ElectronicsInventory`
- `stats.image: registry:5000/electronics-inventory`

## `introduced` date — DISCREPANCY (resolved to git)

- The seeding brief stated `introduced` = first commit = `2025-07-31`.
- **Git disagrees.** `git log --reverse --format=%ad --date=short | head -1`
  returns `2025-08-22` (first three commits are all `2025-08-22`).
- **Decision**: used `2025-08-22` on every element (git is authoritative for
  "first commit date"). If `2025-07-31` is the intended value for some other
  reason, flag it — it is a one-line global change.

## Minted UUIDs (id → uuid)

| element | uuid |
|---|---|
| app:electronics-inventory | 9a37e1d4-5b2c-4f6a-8e3d-1c0b9a8f7e6d |
| svc:electronics-inventory-api | 2f8b6c1e-4d3a-4b9c-8a7f-6e5d4c3b2a19 |
| if:electronics-inventory-api-http | 7c4e9a2b-1f6d-4e8a-9b3c-5a2d8f1e7b4c |
| svc:openai-api | 3d6f9b2e-8c1a-4f7d-b5e3-2a9c6d4f8b1e |
| svc:mouser-api | 5e8a1c4f-2d7b-4a9e-8c6f-3b1d9e7a5c2f |
| svc:google-favicon | 50f8a3d1-7c2e-4b6a-9e1f-8d3c5a2b4f7e |

Cross-producer references (NOT minted here):
- `svc:ssegateway,59a7d043-bb0c-4e44-a8b8-3e943338f807` — hand-provided
  in-house SSE gateway service UUID, used verbatim.
- `cap:iam`, `cap:relational-database`, `cap:object-storage` — referenced by
  bare kebab name only. Capabilities are a curated vocabulary declared solely
  in the Architecture repo's enum; producers never declare a `capabilities:`
  array (the manual is explicit). The collector materializes one shared node
  per referenced cap. These will be *reported* (not failed) as cross-producer
  refs at merge time, which is acceptable.

> Note: the seeding brief suggested declaring `cap:` elements with labels +
> `introduced`. The producer manual overrides this — caps are reference-only
> and a `capabilities:` array is rejected at review. Followed the manual.

## Exposed surface (BFF — single consumer class)

- One ApplicationService `svc:electronics-inventory-api`, realized by the
  product (`app —Realization→ svc`).
- One ApplicationInterface `if:electronics-inventory-api-http` for the SPA
  consumer class (`if —Assignment→ svc`).
- Not modelled per-route. Operational endpoints (`/metrics`, health, drain /
  preStop, SSE callback) are out — they are not a distinct consumer class.

## Consumption edges & boundBy decisions

All consumption edges have `source = app:electronics-inventory`, `type =
Association`. boundBy is required on `→ cap` edges, and on `→ svc` edges only
when an env var carries the endpoint.

| target | boundBy | evidence |
|---|---|---|
| `cap:relational-database` | `env:DATABASE_URL` | `app/config.py:87` (`DATABASE_URL`, postgresql+psycopg). Note the *env var* is `DATABASE_URL`; `SQLALCHEMY_DATABASE_URI` is only a derived Flask-config key (`config.py:334`), not an env var. |
| `cap:object-storage` | `env:S3_ENDPOINT_URL` | `app/config.py:185` (S3-compatible, default Ceph/Minio). |
| `cap:iam` | `env:OIDC_ISSUER_URL` | `app/config.py:136` `OIDC_ISSUER_URL` (issuer/discovery URL). Consumed by `app/services/auth_service.py` / `oidc_client_service.py`. This is the issuer var (not a separate jwks var); used per instruction to prefer the issuer/discovery URL. |
| `svc:openai-api` | **none** | `OpenAI(api_key=api_key)` with NO `base_url` (`app/utils/ai/openai/openai_runner.py:43`); there is **no `OPENAI_BASE_URL` env var** in `app/app_config.py`. Endpoint = SDK default, not env-carried → no boundBy. |
| `svc:mouser-api` | **none** | Base URL hardcoded `MOUSER_API_BASE_URL = "https://api.mouser.com/api/v1"` (`app/services/mouser_service.py:37`). Only `MOUSER_SEARCH_API_KEY` is env-driven (`app/app_config.py:113`). No `MOUSER_BASE_URL` var → no boundBy. |
| `svc:google-favicon` | **none** | URL hardcoded `https://www.google.com/s2/favicons` (`app/services/html_document_handler.py:149`, `app/utils/url_metadata.py:193`). No env var → no boundBy. |
| `svc:ssegateway,59a7d043-…` | `env:SSE_GATEWAY_URL` | `app/config.py:222`; consumed in `app/services/container.py:217` (`gateway_url=...`) and `app/__init__.py:160` (`/readyz` poll). |

### Corrections applied to the prior mid-draft

The earlier draft `architecture.yaml` carried `boundBy: env:OPENAI_BASE_URL`
and `boundBy: env:MOUSER_BASE_URL`. **Both env vars are fictitious** — neither
exists in the codebase. Removed both boundBy recipes. The draft also lacked
the external `svc:` catalog declarations (file ended mid-draft); those are now
present.

## External service decisions (include / exclude)

- **OpenAI API** — INCLUDED as `svc:openai-api` (homepage `https://openai.com`).
  Genuine external SaaS call via the OpenAI SDK (`openai_runner.py`).
- **Mouser API** — INCLUDED as `svc:mouser-api` (homepage `https://www.mouser.com`).
  Genuine external HTTP calls (`mouser_service.py:66,110`).
- **Google Favicon Service** — INCLUDED as `svc:google-favicon`
  (homepage `https://www.google.com/s2/favicons`). **Decision: include**, because
  the app performs a *server-side* HTTP GET of the favicon image bytes, not just
  URL-string building. Evidence: `app/services/html_document_handler.py:146-150`
  — as a last-resort thumbnail fallback it builds
  `google_favicon_url = f"https://www.google.com/s2/favicons?domain={domain}&sz=64"`
  and calls `self._download_and_validate_image(google_favicon_url, download_cache)`,
  which fetches and validates the image. The URL is hardcoded (also in
  `app/utils/url_metadata.py:193`), so no boundBy.
  - Caveat: `app/models/seller.py:40` *also* emits the favicon URL as a plain
    string in the API response (`logo_url`) for the browser to render — that
    path is URL-building only. The include decision rests on the
    `html_document_handler` server-side fetch, which is a genuine outbound call.
- **SSE Gateway** — INCLUDED, CONSUMED. The app consumes the external in-house
  gateway (posts events + polls `/readyz`); modelled via the hand-provided
  gateway service UUID, boundBy `env:SSE_GATEWAY_URL`. The app's own SSE
  callback endpoint (`app/api/sse.py`, `SSE_CALLBACK_SECRET`) is an
  implementation detail of consuming the gateway, not modelled as a separate
  surface.

## Excluded (with reasoning)

- **`FRONTEND_URL` / `CORS_ORIGINS` / `FRONTEND_VERSION_URL`** — CORS / version
  polling of the frontend, not a backend→service dependency. Out.
- **Generic `requests.get(url)` in `download_cache_service.py:73`** — downloads
  arbitrary user-supplied URLs (datasheets, thumbnails). No stable external
  identity → out (inclusion-rule: a thing is in only if reachable by a stable
  name; arbitrary user URLs are not).
- **The frontend product / app→app edge** — owned by the frontend producer.
- **Per-route interfaces, `/metrics`, health, drain/preStop** — not distinct
  consumer classes / not named surfaces with external identity.
- **Container image / repo / Helm chart** — not architecture elements (manual);
  repo identity lives on the envelope `producer:` and `sourceRepository`.

## Open questions for a human

- **`introduced` date**: brief said `2025-07-31`; git first commit is
  `2025-08-22`. Used `2025-08-22`. Confirm if a different date is intended.
- **OIDC var choice**: used `OIDC_ISSUER_URL`. There is no separate JWKS env
  var (jwks is derived from the issuer at runtime), so the issuer URL is the
  only candidate — confident this is correct.
- **SSE gateway service UUID**: assumed the hand-provided
  `59a7d043-bb0c-4e44-a8b8-3e943338f807` is the published gateway service id;
  verify it resolves in the merged dataset once both producers are registered.
- **cap UUIDs**: not minted (reference-only per manual). If the operator
  expected minted cap elements, that conflicts with the manual — flag.

## Validation

`./scripts/arch-validate.py docs/architecture/*.yaml` → **exit 0** (OK).
Cross-producer refs (`cap:*`, `svc:ssegateway`) are merge-time concerns and
are not flagged by the local/structural validator.
