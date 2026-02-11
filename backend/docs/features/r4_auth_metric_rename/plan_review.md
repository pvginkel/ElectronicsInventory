# Plan Review: Rename `EI_` Metric Prefix on Auth Services

## 1) Summary & Decision

**Readiness**

The plan is thorough, well-researched, and correctly identifies all source files, test files, and documentation locations that reference the five `EI_`-prefixed Prometheus metric constants. The scope is appropriately narrow -- a mechanical rename with no behavioral changes. The file map is exhaustive, the test plan covers all existing test surfaces, and the risks are realistic. Two issues require attention before implementation: a factual inaccuracy in the research log about test coverage of `EI_JWKS_REFRESH_TOTAL`, and a missing note that `CLAUDE.md` line 337 omits `EI_JWKS_REFRESH_TOTAL` from its documentation (meaning the doc update should also add the renamed constant there).

**Decision**

`GO-WITH-CONDITIONS` -- Two minor inaccuracies in the plan's evidence claims and one gap in the CLAUDE.md documentation update scope need correction before implementation proceeds.

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `CLAUDE.md` (Prometheus Metrics Infrastructure) -- Pass -- `plan.md:6-12` -- The plan correctly follows the decentralized metrics pattern where each service defines and records its own metrics at module level.
- `CLAUDE.md` (Deprecation and Backwards Compatibility) -- Pass -- `plan.md:44-45` -- The plan correctly notes this is a BFF app with no external consumers, so renaming is safe without backwards compatibility.
- `CLAUDE.md` (No tombstones) -- Pass -- `plan.md:29-34` -- The plan replaces old names entirely; no re-exports or aliases.
- `docs/commands/plan_feature.md` (template conformance) -- Pass -- `plan.md:1-314` -- All 16 required sections are present and populated.
- `docs/product_brief.md` -- Pass -- Not directly applicable (metrics naming is infrastructure, not product behavior), but the plan correctly avoids scope creep.

**Fit with codebase**

- `app/services/auth_service.py` -- `plan.md:67-69` -- Correctly identifies all three metric definitions (lines 17-30) and all usage sites. Verified against `auth_service.py:17-30,92,95,182-183,201-202,208-209,215-216,224-225,232-233,238-239`.
- `app/services/oidc_client_service.py` -- `plan.md:71-73` -- Correctly identifies both metric definitions (lines 17-26) and all usage sites. Verified against `oidc_client_service.py:17-26,288,302,359,373`.
- `tests/test_metrics_service.py` -- `plan.md:79-81` -- Partially correct. The plan claims "imports all five constants" but the test at lines 221-228 only imports `EI_AUTH_VALIDATION_TOTAL` and `EI_AUTH_VALIDATION_DURATION_SECONDS`. `EI_JWKS_REFRESH_TOTAL` is not imported or tested anywhere in the test suite. See Adversarial Sweep finding #1.
- `tests/services/test_oidc_client_service.py` -- `plan.md:75-77` -- Correct. All import and assertion sites verified.
- `CLAUDE.md` / `AGENTS.md` -- `plan.md:83-89` -- Correct that both files have identical content at lines 337-338. However, `CLAUDE.md:337` only lists `EI_AUTH_VALIDATION_TOTAL` and `EI_AUTH_VALIDATION_DURATION_SECONDS` for auth_service.py -- it does not mention `EI_JWKS_REFRESH_TOTAL`. The plan should note this and include adding the renamed `JWKS_REFRESH_TOTAL` to the Key Metric Locations listing.

## 3) Open Questions & Ambiguities

- Question: Should the `CLAUDE.md` / `AGENTS.md` "Key Metric Locations" entry for auth_service.py be expanded to include `JWKS_REFRESH_TOTAL` alongside the other two auth metrics?
- Why it matters: Currently `CLAUDE.md:337` only lists two of three auth_service metrics. If the implementer only does a find-and-replace of existing text, the third metric remains undocumented. This is the right time to fix an existing documentation gap.
- Needed answer: Confirm that the documentation update should add `JWKS_REFRESH_TOTAL` to the auth_service entry in both `CLAUDE.md` and `AGENTS.md`.

## 4) Deterministic Backend Coverage (new/changed behavior only)

- Behavior: Metric ownership test for auth_service metrics (`tests/test_metrics_service.py::TestMetricOwnership::test_auth_service_metrics`)
- Scenarios:
  - Given the auth service module is imported, When `AUTH_VALIDATION_TOTAL`, `AUTH_VALIDATION_DURATION_SECONDS`, and `JWKS_REFRESH_TOTAL` are accessed, Then they are not None.
- Instrumentation: The metrics themselves ARE the instrumentation; no additional signals needed.
- Persistence hooks: None required (no DB, no migrations, no DI changes).
- Gaps: The plan's test scenario at `plan.md:232-237` does not mention `JWKS_REFRESH_TOTAL` in the ownership test. The existing test at `tests/test_metrics_service.py:221-228` also omits it. This is a pre-existing gap, but the rename is the right time to fix it.
- Evidence: `plan.md:232-237`, `tests/test_metrics_service.py:221-228`

- Behavior: Metric ownership test for OIDC client metrics (`tests/test_metrics_service.py::TestMetricOwnership::test_oidc_client_service_metrics`)
- Scenarios:
  - Given the OIDC client service module is imported, When `OIDC_TOKEN_EXCHANGE_TOTAL` and `AUTH_TOKEN_REFRESH_TOTAL` are accessed, Then they are not None.
- Instrumentation: Self-verifying.
- Persistence hooks: None.
- Gaps: None.
- Evidence: `plan.md:239-244`, `tests/test_metrics_service.py:230-237`

- Behavior: Token exchange metric recording (`tests/services/test_oidc_client_service.py` -- exchange tests)
- Scenarios:
  - Given a successful token exchange, When the metric is checked, Then `OIDC_TOKEN_EXCHANGE_TOTAL` with label `status="success"` incremented by 1.
  - Given a failed token exchange, When the metric is checked, Then `OIDC_TOKEN_EXCHANGE_TOTAL` with label `status="failed"` incremented by 1.
- Instrumentation: Self-verifying.
- Persistence hooks: None.
- Gaps: None.
- Evidence: `plan.md:246-258`, `tests/services/test_oidc_client_service.py:384-457`

- Behavior: Token refresh metric recording (`tests/services/test_oidc_client_service.py` -- refresh tests)
- Scenarios:
  - Given a successful token refresh, When the metric is checked, Then `AUTH_TOKEN_REFRESH_TOTAL` with label `status="success"` incremented by 1.
  - Given a failed token refresh, When the metric is checked, Then `AUTH_TOKEN_REFRESH_TOTAL` with label `status="failed"` incremented by 1.
- Instrumentation: Self-verifying.
- Persistence hooks: None.
- Gaps: None.
- Evidence: `plan.md:260-272`, `tests/services/test_oidc_client_service.py:562-623`

## 5) Adversarial Sweep

**Minor -- Plan claims "all five constants" tested in test_metrics_service.py but only four are tested**

**Evidence:** `plan.md:9` -- "tests/test_metrics_service.py imports all five constants for existence checks (lines 224-237)". Actual file `tests/test_metrics_service.py:221-228` only imports `EI_AUTH_VALIDATION_TOTAL` and `EI_AUTH_VALIDATION_DURATION_SECONDS`; `EI_JWKS_REFRESH_TOTAL` is absent.
**Why it matters:** The plan's claim that all five are already covered creates a false sense of completeness. An implementer doing a pure rename would miss that `JWKS_REFRESH_TOTAL` has no ownership test. While this is a pre-existing gap (not introduced by this plan), the plan's research log should be accurate.
**Fix suggestion:** Correct `plan.md:9` to state that only four of five constants are tested in `test_metrics_service.py`, and add a scenario in section 13 to include `JWKS_REFRESH_TOTAL` in the `test_auth_service_metrics` test.
**Confidence:** High

**Minor -- CLAUDE.md Key Metric Locations omits JWKS_REFRESH_TOTAL**

**Evidence:** `plan.md:85` -- "lists EI_AUTH_VALIDATION_TOTAL, EI_AUTH_VALIDATION_DURATION_SECONDS, EI_OIDC_TOKEN_EXCHANGE_TOTAL, EI_AUTH_TOKEN_REFRESH_TOTAL". Actual `CLAUDE.md:337` shows "(EI_AUTH_VALIDATION_TOTAL, EI_AUTH_VALIDATION_DURATION_SECONDS)" -- only two constants, not four for that line. The plan's evidence text itself lists four constants across two lines (337-338) without distinguishing which are on which line, and `EI_JWKS_REFRESH_TOTAL` is not listed at all in CLAUDE.md.
**Why it matters:** The documentation update should not just rename existing entries but also add the missing `JWKS_REFRESH_TOTAL` to complete the auth_service metric listing. Without this, the rename perpetuates an existing documentation gap.
**Fix suggestion:** Add to section 2 file map entry for `CLAUDE.md` and `AGENTS.md`: "Also add `JWKS_REFRESH_TOTAL` to the auth_service line, since it was previously undocumented."
**Confidence:** High

**Minor -- Requirements verification doc references stale file locations**

**Evidence:** `docs/features/oidc_authentication/requirements_verification.md:56` -- references `app/services/metrics_service.py:555-582` which no longer contains these metrics (they were decentralized). `plan.md:103-105` includes this file for updating metric names.
**Why it matters:** The plan correctly identifies this file needs updating but does not note the stale path reference. However, since this is an archival document and the plan only commits to updating the metric name strings (not fixing stale line references), this is cosmetic. A competent developer would handle it during implementation.
**Fix suggestion:** No plan change required; this is a minor cosmetic issue in an archival document.
**Confidence:** Low

## 6) Derived-Value & Persistence Invariants

None; proof:

This change involves Prometheus metric constants only. These are fire-and-forget counters and histograms that do not derive state, drive persistence decisions, trigger cleanup jobs, or influence cross-context behavior. The `prometheus_client` library manages its own in-memory registry, and the rename simply changes the key under which each metric is registered. No database tables, S3 objects, session state, or feature flags are affected.

Evidence: `plan.md:143-148` -- correctly justifies "none" with the same reasoning. Verified by codebase grep: the five metric constants are only referenced in `inc()` and `observe()` calls, never used in conditionals, persistence logic, or cleanup flows.

## 7) Risks & Mitigations (top 3)

- Risk: Incomplete rename leaves a mix of old and new names, causing `ImportError` at startup or in tests.
- Mitigation: Run full test suite and grep for any remaining `EI_AUTH`, `EI_OIDC`, `EI_JWKS` references after implementation. The plan already prescribes this at `plan.md:305`.
- Evidence: `plan.md:303-305`

- Risk: External Grafana dashboards referencing `ei_*` metric names break silently after deployment.
- Mitigation: Coordinate dashboard updates with deployment. The plan correctly marks this as out-of-scope for the repository but warns about it.
- Evidence: `plan.md:299-301`

- Risk: The new metric names collide with existing Prometheus registrations, causing a `ValueError` at module import time.
- Mitigation: Codebase grep confirms no existing metrics use the target names (`auth_validation_total`, `auth_validation_duration_seconds`, `jwks_refresh_total`, `oidc_token_exchange_total`, `auth_token_refresh_total`). Verified during this review.
- Evidence: `plan.md:163-167`, codebase grep returning zero matches for target names in `app/`

## 8) Confidence

Confidence: High -- The plan is well-structured for a straightforward mechanical rename. The two findings are minor accuracy corrections that do not affect the overall approach or feasibility.
