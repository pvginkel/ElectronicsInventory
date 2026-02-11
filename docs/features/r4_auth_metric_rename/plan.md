# Plan: Rename `EI_` Metric Prefix on Auth Services

## 0) Research Log & Findings

**Areas researched:**

- **Source metric definitions** in `app/services/auth_service.py` (lines 17-30) and `app/services/oidc_client_service.py` (lines 17-26). Found five module-level Prometheus constants with the `EI_` prefix, each defining both a Python constant name and a Prometheus metric string name.
- **Usage within services.** `auth_service.py` uses `EI_AUTH_VALIDATION_TOTAL` (lines 182, 201, 208, 215, 224, 232, 238), `EI_AUTH_VALIDATION_DURATION_SECONDS` (lines 183, 202, 209, 216, 225, 233, 239), and `EI_JWKS_REFRESH_TOTAL` (lines 92, 95). `oidc_client_service.py` uses `EI_OIDC_TOKEN_EXCHANGE_TOTAL` (lines 288, 302) and `EI_AUTH_TOKEN_REFRESH_TOTAL` (lines 359, 373).
- **Test references.** `tests/services/test_oidc_client_service.py` imports and asserts on `EI_OIDC_TOKEN_EXCHANGE_TOTAL` (lines 386, 394, 404, 446, 448, 456) and `EI_AUTH_TOKEN_REFRESH_TOTAL` (lines 564, 572, 582, 612, 614, 622). `tests/test_metrics_service.py` imports four of the five constants for existence checks: `EI_AUTH_VALIDATION_TOTAL` and `EI_AUTH_VALIDATION_DURATION_SECONDS` (lines 224-228), and `EI_OIDC_TOKEN_EXCHANGE_TOTAL` and `EI_AUTH_TOKEN_REFRESH_TOTAL` (lines 233-237). **`EI_JWKS_REFRESH_TOTAL` is not tested anywhere in the test suite** -- this is a pre-existing gap that should be fixed during this rename. `tests/services/test_auth_service.py` does not reference any metric constants.
- **Documentation references.** `CLAUDE.md` line 337-338, `AGENTS.md` lines 337-338 (identical content), `docs/copier_template_analysis.md` lines 448-463, `docs/features/oidc_authentication/plan.md` lines 562-598, `docs/features/oidc_authentication/plan_review.md` lines 63 and 76, `docs/features/oidc_authentication/requirements_verification.md` line 56.
- **Naming convention consistency.** All other infrastructure services already use generic names without the `EI_` prefix (e.g., `SSE_GATEWAY_EVENTS_SENT_TOTAL`, `AI_ANALYSIS_REQUESTS_TOTAL`, `MOUSER_API_*`, `INVENTORY_QUANTITY_CHANGES_TOTAL`). The auth services are the sole exception.

**Conflicts:** None. The change is a pure rename with no behavioral or structural impact.

---

## 1) Intent & Scope

**User intent**

Remove the `EI_` (Electronics Inventory) prefix from five Prometheus metric constants in the auth services to make them generic, consistent with all other infrastructure metrics, and ready for Copier template extraction.

**Prompt quotes**

"Rename the Electronics Inventory-specific `EI_` prefix from all Prometheus metric constants in the auth services (`auth_service.py` and `oidc_client_service.py`) to make them generic for Copier template extraction."

"Both the Python constant names and the Prometheus metric string names (the first argument to `Counter`/`Histogram`) must be updated. All references in tests and documentation must also be updated."

**In scope**

- Rename five Python constant names from `EI_*` to their non-prefixed equivalents
- Rename five Prometheus metric string names (the first argument to `Counter`/`Histogram`) from `ei_*` to their non-prefixed equivalents
- Update all import statements and usages in test files
- Add `JWKS_REFRESH_TOTAL` to the `test_auth_service_metrics` ownership test (fixes a pre-existing gap where the third auth metric was never tested)
- Update all documentation references in `CLAUDE.md`, `AGENTS.md`, and feature docs
- Add `JWKS_REFRESH_TOTAL` to the `CLAUDE.md` and `AGENTS.md` Key Metric Locations auth_service entry (currently missing)

**Out of scope**

- No behavioral changes to auth validation, token exchange, or token refresh
- No changes to metric labels, help text, or metric types
- No Grafana dashboard changes (external to this repository)
- No changes to non-auth metrics

**Assumptions / constraints**

- This is a BFF app with no external consumers of the Prometheus metric names, so renaming the string names is safe.
- `CLAUDE.md` and `AGENTS.md` have identical content for the Key Metric Locations section; both must be updated.
- Historical feature documentation (`docs/features/oidc_authentication/`) references the old names but these are archival records; updating them is included for completeness but is low priority.

---

## 1a) User Requirements Checklist

**User Requirements Checklist**

- [ ] Rename `EI_AUTH_VALIDATION_TOTAL` to `AUTH_VALIDATION_TOTAL` (both Python constant and Prometheus metric name string)
- [ ] Rename `EI_AUTH_VALIDATION_DURATION_SECONDS` to `AUTH_VALIDATION_DURATION_SECONDS` (both Python constant and Prometheus metric name string)
- [ ] Rename `EI_JWKS_REFRESH_TOTAL` to `JWKS_REFRESH_TOTAL` (both Python constant and Prometheus metric name string)
- [ ] Rename `EI_OIDC_TOKEN_EXCHANGE_TOTAL` to `OIDC_TOKEN_EXCHANGE_TOTAL` (both Python constant and Prometheus metric name string)
- [ ] Rename `EI_AUTH_TOKEN_REFRESH_TOTAL` to `AUTH_TOKEN_REFRESH_TOTAL` (both Python constant and Prometheus metric name string)
- [ ] Update all test references to use the new constant names
- [ ] Update all documentation references (CLAUDE.md, AGENTS.md) to use the new metric names

---

## 2) Affected Areas & File Map

- Area: `app/services/auth_service.py` -- metric definitions and all usages
- Why: Defines `EI_AUTH_VALIDATION_TOTAL`, `EI_AUTH_VALIDATION_DURATION_SECONDS`, and `EI_JWKS_REFRESH_TOTAL`; uses them throughout `validate_token()` and `__init__()`.
- Evidence: `app/services/auth_service.py:17-30` -- metric constant definitions; lines 92, 95, 182-183, 201-202, 208-209, 215-216, 224-225, 232-233, 238-239 -- usages.

- Area: `app/services/oidc_client_service.py` -- metric definitions and all usages
- Why: Defines `EI_OIDC_TOKEN_EXCHANGE_TOTAL` and `EI_AUTH_TOKEN_REFRESH_TOTAL`; uses them in `exchange_code_for_tokens()` and `refresh_access_token()`.
- Evidence: `app/services/oidc_client_service.py:17-26` -- metric constant definitions; lines 288, 302, 359, 373 -- usages.

- Area: `tests/services/test_oidc_client_service.py` -- test imports and metric assertions
- Why: Imports `EI_OIDC_TOKEN_EXCHANGE_TOTAL` and `EI_AUTH_TOKEN_REFRESH_TOTAL` by name; asserts on their label values.
- Evidence: `tests/services/test_oidc_client_service.py:386,394,404,446,448,456` -- token exchange metric tests; lines `564,572,582,612,614,622` -- token refresh metric tests.

- Area: `tests/test_metrics_service.py` -- metric existence tests
- Why: Imports all five `EI_*` constants to verify they exist (decentralized metrics ownership tests).
- Evidence: `tests/test_metrics_service.py:224-228` -- auth service metrics; lines `233-237` -- OIDC client metrics.

- Area: `CLAUDE.md` -- Key Metric Locations section
- Why: Documents metric constant names for developer reference. The auth_service line currently lists only `EI_AUTH_VALIDATION_TOTAL` and `EI_AUTH_VALIDATION_DURATION_SECONDS`; `EI_JWKS_REFRESH_TOTAL` is missing. The rename should both update existing names and add `JWKS_REFRESH_TOTAL` to complete the listing.
- Evidence: `CLAUDE.md:337` -- "(EI_AUTH_VALIDATION_TOTAL, EI_AUTH_VALIDATION_DURATION_SECONDS)" omits `EI_JWKS_REFRESH_TOTAL`. `CLAUDE.md:338` -- lists `EI_OIDC_TOKEN_EXCHANGE_TOTAL`, `EI_AUTH_TOKEN_REFRESH_TOTAL`.

- Area: `AGENTS.md` -- Key Metric Locations section
- Why: Mirror of `CLAUDE.md` metric documentation. Same gap: `EI_JWKS_REFRESH_TOTAL` is missing and should be added during rename.
- Evidence: `AGENTS.md:337-338` -- identical content to `CLAUDE.md`.

- Area: `docs/copier_template_analysis.md` -- Copier analysis references
- Why: Lists current and proposed metric names; should be updated to reflect the completed rename.
- Evidence: `docs/copier_template_analysis.md:448-463` -- current and proposed metric name mapping.

- Area: `docs/features/oidc_authentication/plan.md` -- historical feature plan
- Why: References the old `ei_*` Prometheus string names in the telemetry section.
- Evidence: `docs/features/oidc_authentication/plan.md:562-598` -- metric signal names.

- Area: `docs/features/oidc_authentication/plan_review.md` -- historical plan review
- Why: References the old `ei_*` Prometheus string names in coverage section.
- Evidence: `docs/features/oidc_authentication/plan_review.md:63,76` -- instrumentation references.

- Area: `docs/features/oidc_authentication/requirements_verification.md` -- historical verification
- Why: References the old `ei_*` Prometheus string names.
- Evidence: `docs/features/oidc_authentication/requirements_verification.md:56` -- metric name list.

---

## 3) Data Model / Contracts

- Entity / contract: Prometheus metric names (exposed on `/metrics` endpoint)
- Shape: Five metric name strings change:

| Old Prometheus name | New Prometheus name |
|---|---|
| `ei_auth_validation_total` | `auth_validation_total` |
| `ei_auth_validation_duration_seconds` | `auth_validation_duration_seconds` |
| `ei_jwks_refresh_total` | `jwks_refresh_total` |
| `ei_oidc_token_exchange_total` | `oidc_token_exchange_total` |
| `ei_auth_token_refresh_total` | `auth_token_refresh_total` |

- Refactor strategy: Straight rename; no backwards compatibility needed. This is a BFF app with no external metric consumers. Any Grafana dashboards referencing the old names must be updated separately (out of scope for this repository).
- Evidence: `app/services/auth_service.py:18,23,27` and `app/services/oidc_client_service.py:18,23` -- the string arguments to `Counter()`/`Histogram()`.

---

## 4) API / Integration Surface

- Surface: `GET /metrics` (Prometheus scrape endpoint)
- Inputs: None (standard Prometheus scrape)
- Outputs: Metric names in the response body change from `ei_*` to their non-prefixed equivalents. Labels, types, and help text remain identical.
- Errors: No new error modes. The endpoint behavior is unchanged.
- Evidence: `app/api/metrics.py` -- calls `prometheus_client.generate_latest()` directly; no changes needed here, the output changes automatically when the metric definitions change.

---

## 5) Algorithms & State Machines

No algorithms or state machines are affected. This is a pure rename of constant identifiers and Prometheus registration strings. The metric increment/observe logic is unchanged.

---

## 6) Derived State & Invariants

None. Prometheus metrics are append-only counters and histograms with no derived state that influences storage, cleanup, or cross-context behavior.

Justification: The metrics are fire-and-forget observations. They do not drive persistence decisions, cleanup jobs, or feature flags. The `prometheus_client` library manages its own internal registry; renaming a metric simply changes the key under which it is registered.

---

## 7) Consistency, Transactions & Concurrency

- Transaction scope: Not applicable. Prometheus metric operations (`inc()`, `observe()`) are thread-safe atomic operations provided by the `prometheus_client` library.
- Atomic requirements: None. Each metric increment is independent.
- Retry / idempotency: Not applicable.
- Ordering / concurrency controls: Not applicable.
- Evidence: `prometheus_client` library guarantees thread-safe metric operations internally.

---

## 8) Errors & Edge Cases

- Failure: Prometheus metric name collision if a metric with the new name already exists in the registry.
- Surface: Application startup (module import time).
- Handling: The application would fail to start with a `ValueError` from `prometheus_client`. This is immediately visible.
- Guardrails: Grep the codebase for `auth_validation_total`, `auth_validation_duration_seconds`, `jwks_refresh_total`, `oidc_token_exchange_total`, `auth_token_refresh_total` to confirm no collisions exist. The search performed during research confirmed no conflicts.
- Evidence: Grep results show the `ei_*` string names only appear in the two auth service files and in documentation.

---

## 9) Observability / Telemetry

This change IS the telemetry change. The five metrics continue to function identically; only their registration names change.

- Signal: `auth_validation_total` (was `ei_auth_validation_total`)
- Type: Counter
- Trigger: On every `validate_token()` call in `AuthService`, labeled by outcome status.
- Labels / fields: `status` (success, expired, invalid_signature, invalid_claims, invalid_token, error)
- Consumer: Prometheus scrape, Grafana dashboards (must update queries externally)
- Evidence: `app/services/auth_service.py:17-19`

- Signal: `auth_validation_duration_seconds` (was `ei_auth_validation_duration_seconds`)
- Type: Histogram
- Trigger: On every `validate_token()` call, observing elapsed duration.
- Labels / fields: None (default histogram buckets)
- Consumer: Prometheus scrape, Grafana dashboards
- Evidence: `app/services/auth_service.py:22-25`

- Signal: `jwks_refresh_total` (was `ei_jwks_refresh_total`)
- Type: Counter
- Trigger: On JWKS client initialization during `AuthService.__init__()`.
- Labels / fields: `trigger` (startup), `status` (success, failed)
- Consumer: Prometheus scrape, Grafana dashboards
- Evidence: `app/services/auth_service.py:26-30`

- Signal: `oidc_token_exchange_total` (was `ei_oidc_token_exchange_total`)
- Type: Counter
- Trigger: On `exchange_code_for_tokens()` completion.
- Labels / fields: `status` (success, failed)
- Consumer: Prometheus scrape, Grafana dashboards
- Evidence: `app/services/oidc_client_service.py:17-21`

- Signal: `auth_token_refresh_total` (was `ei_auth_token_refresh_total`)
- Type: Counter
- Trigger: On `refresh_access_token()` completion.
- Labels / fields: `status` (success, failed)
- Consumer: Prometheus scrape, Grafana dashboards
- Evidence: `app/services/oidc_client_service.py:22-26`

---

## 10) Background Work & Shutdown

No background workers or shutdown hooks are affected. The auth metrics are recorded inline during request processing, not by background threads.

---

## 11) Security & Permissions

Not applicable. This change does not alter authentication, authorization, or any security-sensitive behavior. Only metric observation names change.

---

## 12) UX / UI Impact

Not applicable. This is a backend-only metrics rename with no user-facing impact.

---

## 13) Deterministic Test Plan

- Surface: `tests/test_metrics_service.py::TestMetricOwnership::test_auth_service_metrics`
- Scenarios:
  - Given the auth service module is imported, When `AUTH_VALIDATION_TOTAL`, `AUTH_VALIDATION_DURATION_SECONDS`, and `JWKS_REFRESH_TOTAL` are accessed, Then they are not None (verifies the renamed constants exist and are importable).
- Fixtures / hooks: None needed beyond existing test infrastructure.
- Gaps: The existing test only checks two of three auth_service metrics; `EI_JWKS_REFRESH_TOTAL` was never included. The rename should fix this pre-existing gap by adding `JWKS_REFRESH_TOTAL` to the ownership test.
- Evidence: `tests/test_metrics_service.py:221-228` -- existing test imports `EI_AUTH_VALIDATION_TOTAL` and `EI_AUTH_VALIDATION_DURATION_SECONDS` only; must update to `AUTH_VALIDATION_TOTAL`, `AUTH_VALIDATION_DURATION_SECONDS`, and add `JWKS_REFRESH_TOTAL`.

- Surface: `tests/test_metrics_service.py::TestMetricOwnership::test_oidc_client_service_metrics`
- Scenarios:
  - Given the OIDC client service module is imported, When `OIDC_TOKEN_EXCHANGE_TOTAL` and `AUTH_TOKEN_REFRESH_TOTAL` are accessed, Then they are not None.
- Fixtures / hooks: None needed.
- Gaps: None.
- Evidence: `tests/test_metrics_service.py:230-237` -- existing test imports `EI_OIDC_TOKEN_EXCHANGE_TOTAL` and `EI_AUTH_TOKEN_REFRESH_TOTAL`; must update to `OIDC_TOKEN_EXCHANGE_TOTAL` and `AUTH_TOKEN_REFRESH_TOTAL`.

- Surface: `tests/services/test_oidc_client_service.py::TestExchangeCodeForTokens::test_exchange_records_success_metric`
- Scenarios:
  - Given a successful token exchange, When the metric is checked, Then `OIDC_TOKEN_EXCHANGE_TOTAL` with label `status="success"` incremented by 1.
- Fixtures / hooks: Existing `service` fixture with mocked httpx.
- Gaps: None.
- Evidence: `tests/services/test_oidc_client_service.py:384-405` -- must update import from `EI_OIDC_TOKEN_EXCHANGE_TOTAL` to `OIDC_TOKEN_EXCHANGE_TOTAL`.

- Surface: `tests/services/test_oidc_client_service.py::TestExchangeCodeForTokens::test_exchange_http_error_records_failure_metric`
- Scenarios:
  - Given a failed token exchange, When the metric is checked, Then `OIDC_TOKEN_EXCHANGE_TOTAL` with label `status="failed"` incremented by 1.
- Fixtures / hooks: Existing `service` fixture with mocked httpx.
- Gaps: None.
- Evidence: `tests/services/test_oidc_client_service.py:444-457` -- must update import.

- Surface: `tests/services/test_oidc_client_service.py::TestRefreshAccessToken::test_refresh_records_success_metric`
- Scenarios:
  - Given a successful token refresh, When the metric is checked, Then `AUTH_TOKEN_REFRESH_TOTAL` with label `status="success"` incremented by 1.
- Fixtures / hooks: Existing `service` fixture with mocked httpx.
- Gaps: None.
- Evidence: `tests/services/test_oidc_client_service.py:562-583` -- must update import from `EI_AUTH_TOKEN_REFRESH_TOTAL` to `AUTH_TOKEN_REFRESH_TOTAL`.

- Surface: `tests/services/test_oidc_client_service.py::TestRefreshAccessToken::test_refresh_http_error_records_failure_metric`
- Scenarios:
  - Given a failed token refresh, When the metric is checked, Then `AUTH_TOKEN_REFRESH_TOTAL` with label `status="failed"` incremented by 1.
- Fixtures / hooks: Existing `service` fixture with mocked httpx.
- Gaps: None.
- Evidence: `tests/services/test_oidc_client_service.py:610-623` -- must update import.

---

## 14) Implementation Slices

This change is small enough to be a single slice, but for clarity:

- Slice: Rename metric constants and strings in source files
- Goal: All five metrics use generic names in production code.
- Touches: `app/services/auth_service.py`, `app/services/oidc_client_service.py`
- Dependencies: None; this slice is independent.

- Slice: Update test references
- Goal: All tests import and assert on the new constant names; test suite passes.
- Touches: `tests/services/test_oidc_client_service.py`, `tests/test_metrics_service.py`
- Dependencies: Depends on slice 1 (source constants must be renamed first).

- Slice: Update documentation
- Goal: All documentation references use the new names.
- Touches: `CLAUDE.md`, `AGENTS.md`, `docs/copier_template_analysis.md`, `docs/features/oidc_authentication/plan.md`, `docs/features/oidc_authentication/plan_review.md`, `docs/features/oidc_authentication/requirements_verification.md`
- Dependencies: None; can be done in parallel with slices 1-2.

---

## 15) Risks & Open Questions

- Risk: External Grafana dashboards reference the old `ei_*` metric names and will break after deployment.
- Impact: Monitoring gaps until dashboards are updated.
- Mitigation: Update Grafana dashboard queries to use the new metric names immediately after deploying this change. This is out of scope for this repository but should be coordinated.

- Risk: Incomplete rename leaves a mix of old and new names, causing import errors or duplicate metric registration.
- Impact: Application fails to start or tests fail.
- Mitigation: Run the full test suite after the rename; grep for any remaining `EI_AUTH` or `EI_OIDC` or `EI_JWKS` references to confirm completeness.

No open questions remain. The change brief is unambiguous and the codebase research identified all affected locations.

---

## 16) Confidence

Confidence: High -- This is a mechanical find-and-replace across a well-defined set of files with no behavioral changes, comprehensive test coverage already in place, and no ambiguity in the requirements.
