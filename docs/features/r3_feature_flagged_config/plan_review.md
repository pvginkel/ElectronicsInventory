# R3: Feature-Flagged Configuration -- Plan Review

## 1) Summary & Decision

**Readiness**

The plan is well-researched and clearly scoped. It targets a straightforward refactoring: removing confirmed dead Celery config and reorganizing existing fields under section comments that map to Copier feature flags. The research log demonstrates thorough grep-based auditing of Celery usage, the affected file list is exhaustive, and edge cases (stale `.env` files, Pydantic field ordering) are proactively addressed. The field-to-group mapping table provides a concrete, reviewable artifact. However, the mapping table contains one internal contradiction (`sqlalchemy_engine_options` listed in two groups) that must be resolved before implementation.

**Decision**

`GO-WITH-CONDITIONS` -- The plan is sound and implementation-ready after resolving the `sqlalchemy_engine_options` dual-group placement and adding a negative test for Celery field removal.

---

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `CLAUDE.md` (Deprecation / No Tombstones) -- Pass -- `plan.md:48-50` -- "Delete `CELERY_BROKER_URL` and `CELERY_RESULT_BACKEND` from `Environment`, `Settings`, and `Settings.load()`". Clean deletion, no stubs or re-exports.
- `CLAUDE.md` (BFF / No Backwards Compat) -- Pass -- `plan.md:115` -- "Straight deletion. No consumers exist. No backwards compatibility needed (BFF pattern per CLAUDE.md)."
- `CLAUDE.md` (Testing Requirements) -- Pass -- `plan.md:228-239` -- Test plan covers existing test suite pass-through, specific test file updates, and the `extra="ignore"` edge case.
- `docs/commands/plan_feature.md` (Section completeness) -- Pass -- All 16 sections are present and filled. Sections that are not applicable (Security, UX, Background Work) explicitly state why.
- `docs/copier_template_analysis.md` (R3 description) -- Pass -- `plan.md:19` references the Copier analysis. The plan's scope matches R3's description at `copier_template_analysis.md:387-438`.

**Fit with codebase**

- `app/config.py` -- `plan.md:86-96` -- Line references are accurate. `Environment` Celery fields at lines 116-124, `Settings` Celery fields at lines 351-353, `Settings.load()` assignments at lines 543-544 all confirmed by reading `app/config.py`.
- `tests/conftest.py` -- `plan.md:97-99` -- Celery fields confirmed at lines 107-109 of `tests/conftest.py`. The plan correctly identifies these as the only test fixture call site that explicitly passes Celery arguments.
- `tests/test_config.py` -- `plan.md:101-103` -- Celery fields confirmed at lines 107-108 of `tests/test_config.py:test_settings_direct_construction`.
- `.env.example` -- `plan.md:105-107` -- The plan references lines 25-27. Actual file shows the Celery comment at line 25, `CELERY_BROKER_URL` at line 26, `CELERY_RESULT_BACKEND` at line 27. Correct.

---

## 3) Open Questions & Ambiguities

- Question: Should `sqlalchemy_engine_options` be in the "Core" group or the "use_database" group?
- Why it matters: The field-to-group mapping table at `plan.md:272-273` lists `sqlalchemy_engine_options` in both the Core group ("empty dict default") and the `use_database` group ("populated via `load()`"). This contradiction will confuse the implementor about where to place the field and its section comment. The field is only meaningful when a database is present, so it logically belongs solely in `use_database`.
- Needed answer: Remove `sqlalchemy_engine_options` from the Core group in the mapping table and keep it only in `use_database`.

- Question: Should `diagnostics_*` fields also encompass request-level diagnostics, or only database diagnostics?
- Why it matters: The plan groups `diagnostics_*` under `use_database` (`plan.md:273`), and the research log at `plan.md:25` notes they "only function with a database present." The `DiagnosticsService` (`app/services/diagnostics_service.py:77-80`) does consume all four fields for both query profiling and request timing. If request timing were ever decoupled from database profiling, this grouping would be wrong. However, today they are tightly coupled in the same service.
- Needed answer: The current grouping is acceptable. No action needed unless the diagnostics service is later split. This is a Minor observation, not blocking.

---

## 4) Deterministic Backend Coverage (new/changed behavior only)

- Behavior: `app/config.py` -- Celery field removal from `Environment`, `Settings`, `Settings.load()`
- Scenarios:
  - Given the refactored `Environment` class, When `Environment()` is constructed, Then no `CELERY_BROKER_URL` or `CELERY_RESULT_BACKEND` attributes exist on the instance (`tests/test_config.py::test_environment_defaults`)
  - Given the refactored `Settings` class, When `Settings(celery_broker_url="...")` is attempted, Then a `ValidationError` is raised (new negative test needed -- see Adversarial Sweep)
  - Given `tests/test_config.py::test_settings_direct_construction`, When the Celery keyword arguments are removed, Then the test passes with all remaining field assertions intact
  - Given `tests/conftest.py::_build_test_settings`, When the Celery keyword arguments are removed, Then the returned `Settings` object is valid and the full test suite passes
  - Given a `.env` file containing `CELERY_BROKER_URL=...`, When `Environment()` is loaded, Then the variable is silently ignored due to `extra="ignore"` at `app/config.py:39`
- Instrumentation: None required. No runtime behavior changes.
- Persistence hooks: No migrations. No test data changes. `.env.example` updated to remove Celery lines.
- Gaps: The plan does not propose a negative test asserting that `Settings` rejects unknown Celery keyword arguments after field removal. While `model_config` does not set `extra="allow"`, an explicit test would document the intent and catch regression. This is Minor.
- Evidence: `plan.md:228-239`, `app/config.py:35-40`, `tests/test_config.py:86-137`, `tests/conftest.py:107-109`

- Behavior: `app/config.py` -- Field reordering and section comment reorganization
- Scenarios:
  - Given the reorganized `Environment` and `Settings` classes, When the full test suite is run, Then all tests pass identically (field order does not affect Pydantic behavior)
  - Given `Settings.load()` with reordered keyword arguments, When invoked with an `Environment` instance, Then the resulting `Settings` object has identical field values to the pre-refactoring version
- Instrumentation: None required. Comment-only changes do not affect runtime.
- Persistence hooks: None.
- Gaps: None. The existing test suite (`tests/test_config.py`) comprehensively covers `Settings.load()`, direct construction, `model_copy`, `to_flask_config()`, and production validation.
- Evidence: `plan.md:143`, `tests/test_config.py:36-84`

---

## 5) Adversarial Sweep

**Major -- `sqlalchemy_engine_options` dual-group placement in field mapping table**

**Evidence:** `plan.md:272-273` -- The "Core (always present)" group includes `sqlalchemy_engine_options` with note "(empty dict default)" and the "use_database" group also includes `sqlalchemy_engine_options` with note "(populated via `load()`)".

**Why it matters:** The mapping table is the primary implementation artifact. A developer following it literally would be confused about where to place the field's section comment. Since `sqlalchemy_engine_options` is consumed exclusively by `FlaskConfig.to_flask_config()` (`app/config.py:439`) which feeds `SQLALCHEMY_ENGINE_OPTIONS` to Flask-SQLAlchemy, it is meaningless without a database. Placing it in Core suggests it should always exist, but a Copier-generated app without `use_database` would have no database engine to configure. This could lead to an incorrect template where the field exists but has no consumer.

**Fix suggestion:** Remove `sqlalchemy_engine_options` from the "Core" row in the mapping table. Keep it solely in the `use_database` group. Add a note that when no database is configured, the field defaults to an empty dict via `Field(default_factory=dict)` and is harmless but unnecessary.

**Confidence:** High

---

**Minor -- No negative test for Celery field rejection**

**Evidence:** `plan.md:228-239` -- The test plan covers updating existing tests but does not propose a new test asserting that `Settings` rejects `celery_broker_url` as an unexpected keyword argument.

**Why it matters:** Without an explicit negative test, a future developer could accidentally re-add a `celery_broker_url` field to `Settings` without realizing it was intentionally removed. The current `Settings` class does not set `extra="allow"` (it uses the default `extra="ignore"` from `ConfigDict`), so Pydantic would silently accept and discard the argument rather than raising an error.

**Fix suggestion:** This is informational. The plan's existing approach (removing the field and updating callers) is sufficient for correctness. An explicit negative test would be a nice-to-have but is not blocking.

**Confidence:** Medium

---

**Minor -- `.env.example` line numbers slightly imprecise**

**Evidence:** `plan.md:107` -- ".env.example:25-27" while the actual file has the comment `# Celery configuration` at line 25, `CELERY_BROKER_URL=...` at line 26, and `CELERY_RESULT_BACKEND=...` at line 27. The plan text at `plan.md:107` says "`.env.example:25-27`" which is actually correct but the inline description says "Celery environment variable documentation lines" (plural) when there are three lines (one comment + two values).

**Why it matters:** Trivial. The implementor will find and remove the right lines regardless.

**Fix suggestion:** None needed. The line range is correct.

**Confidence:** High

---

## 6) Derived-Value & Persistence Invariants

This refactoring does not introduce, modify, or remove any derived values. The plan correctly documents the three existing derived values at `plan.md:153-174` (`sse_heartbeat_interval`, `ai_testing_mode`, `oidc_cookie_secure`) and confirms they are untouched.

Justification for "none new": The change is purely subtractive (field deletion) and structural (comment reorganization). No new fields, no new derivation logic, no persistence effects. The three documented derived values are read-only configuration that does not drive writes or cleanup.

- Derived value: `sse_heartbeat_interval`
  - Source dataset: `env.FLASK_ENV` (unfiltered) and `env.SSE_HEARTBEAT_INTERVAL` (unfiltered)
  - Write / cleanup triggered: None; consumed as read-only config by SSE service
  - Guards: Hardcoded to 30 for production; otherwise uses env value
  - Invariant: Must equal 30 when `flask_env == "production"`
  - Evidence: `plan.md:156-160`, `app/config.py:498-501`

- Derived value: `ai_testing_mode`
  - Source dataset: `env.FLASK_ENV` (unfiltered) and `env.AI_TESTING_MODE` (unfiltered)
  - Write / cleanup triggered: None; consumed as read-only config by AI service
  - Guards: Forced to `True` when `flask_env == "testing"`
  - Invariant: Must be `True` in testing environment regardless of explicit setting
  - Evidence: `plan.md:162-167`, `app/config.py:504`

- Derived value: `oidc_cookie_secure`
  - Source dataset: `env.OIDC_COOKIE_SECURE` (unfiltered) and `env.BASEURL` (unfiltered)
  - Write / cleanup triggered: None; consumed as read-only config by auth middleware
  - Guards: Explicit setting takes priority; otherwise inferred from HTTPS prefix
  - Invariant: Must be `True` when `BASEURL` starts with `https://` and no explicit override
  - Evidence: `plan.md:169-174`, `app/config.py:510-513`

---

## 7) Risks & Mitigations (top 3)

- Risk: The `sqlalchemy_engine_options` dual-group placement leads to incorrect field placement during implementation, resulting in a Copier template that includes database engine config in the core group.
- Mitigation: Resolve the mapping table contradiction before implementation by removing the field from the Core group.
- Evidence: `plan.md:272-273`

- Risk: A field is misassigned to the wrong feature-flag group (e.g., a field classified as `use_oidc` that is actually used outside OIDC), leading to broken generated apps when that flag is disabled.
- Mitigation: The plan's research log at `plan.md:26-28` documents the contentious decisions (`diagnostics_*` under `use_database`, `baseurl` under `use_oidc`, `cors_origins` as core). These are reasonable. The actual Copier template wrapping happens in a future phase (out of scope for R3), so a misassignment here only affects comments, not functionality.
- Evidence: `plan.md:256-266`

- Risk: Reordering fields in `Settings.load()` introduces a subtle bug if a keyword argument was accidentally renamed or mismatched during the reorganization.
- Mitigation: The existing test suite (`tests/test_config.py`) covers `Settings.load()` with default values, production heartbeat override, AI testing mode, and engine options. Any field mismatch would be caught by these tests or by Pydantic validation (unexpected keyword arguments would cause an error).
- Evidence: `plan.md:264-266`, `tests/test_config.py:36-84`

---

## 8) Confidence

Confidence: High -- This is a well-researched, tightly scoped refactoring with one concrete mapping table issue to fix. The codebase evidence confirms the plan's claims, the affected file list is complete, and the existing test suite provides adequate coverage.
