# Requirements Verification Report: Test Infrastructure Separation (R5)

**Report Generated:** 2026-02-11

**Overall Status: ALL REQUIREMENTS VERIFIED - PASS**

---

## Checklist Item 1: Replace hardcoded service shutdown calls in `app` fixture teardown

**Status: PASS**

- **Location:** `tests/conftest.py:218-235`
- Replaced three hardcoded calls (`metrics_service().shutdown()`, `temp_file_manager().stop_cleanup_thread()`, `task_service().shutdown()`) with `app.container.lifecycle_coordinator().shutdown()`
- All tests using the `app` fixture pass

---

## Checklist Item 2: Replace hardcoded service shutdown calls in `oidc_app` fixture teardown

**Status: PASS**

- **Location:** `tests/conftest.py:435-447`
- Same replacement pattern as `app` fixture
- OIDC auth tests pass correctly

---

## Checklist Item 3: Separate domain-specific fixtures from infrastructure fixtures

**Status: PASS**

- Old `tests/test_document_fixtures.py` deleted
- New `tests/domain_fixtures.py` created with all domain fixtures: `sample_part`, `make_attachment_set`, `make_attachment_set_flask`, `sample_image_file`, `sample_pdf_bytes`, `sample_pdf_file`, `large_image_file`, `mock_url_metadata`, `mock_html_content`, `temp_thumbnail_dir`

---

## Checklist Item 4: Infrastructure fixtures remain in conftest.py

**Status: PASS**

- Infrastructure fixtures remain: `clear_prometheus_registry`, `template_connection`, `app`, `session`, `client`, `container`, `runner`, `mock_oidc_discovery`, `mock_jwks`, `generate_test_jwt`, `oidc_app`, `oidc_client`, `sse_server`, `background_task_runner`, `sse_client_factory`, `sse_gateway_server`

---

## Checklist Item 5: Domain fixtures moved and imported properly

**Status: PASS**

- **New location:** `tests/domain_fixtures.py`
- **Import block in conftest.py** updated from `.test_document_fixtures` to `.domain_fixtures`, with `make_attachment_set` and `make_attachment_set_flask` added to imports
- All 10 fixtures properly re-exported

---

## Checklist Item 6: SSE server fixture cleanup reviewed and updated

**Status: PASS**

- **Location:** `tests/conftest.py:553-575`
- Lifecycle coordinator shutdown added BEFORE `version_mock.stop()` with clear ordering comment
- VersionService registers for lifecycle notifications, so shutdown must complete before mock removal

---

## Checklist Item 7: All existing tests continue to pass

**Status: PASS**

- Full test suite: **1350 passed, 4 skipped, 30 deselected, 3 warnings in 294.64s**
- No regressions introduced
