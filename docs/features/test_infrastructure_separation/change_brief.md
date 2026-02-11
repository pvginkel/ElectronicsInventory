# Change Brief: Test Infrastructure Separation (R5)

## Summary

Refactor the test infrastructure (`tests/conftest.py` and related files) to cleanly separate generic/template infrastructure fixtures from domain-specific fixtures, in preparation for Copier template extraction. This is R5 from `docs/copier_template_analysis.md`.

## Changes Required

### R5b: Generic Background Service Cleanup

The `app` and `oidc_app` fixtures currently hardcode specific service shutdown calls in their teardown blocks:

```python
app.container.metrics_service().shutdown()
app.container.temp_file_manager().stop_cleanup_thread()
app.container.task_service().shutdown()
```

Replace this with a single lifecycle coordinator `shutdown()` call, which will notify all registered services through the lifecycle event system. Services already register for shutdown notifications in their constructors, so this should work without changes to the services themselves.

### R5a: S3 Availability Check

The `pytest_configure()` hook unconditionally checks S3 availability and aborts the entire test suite if S3 is unreachable. For the Copier template, this will eventually be behind a `use_s3` Jinja conditional. For now in the EI backend, this is fine as-is since EI always uses S3. No code change needed here for the EI backend itself — just make sure the structure is clean enough that wrapping it in a Jinja conditional later is straightforward.

### R5c: Separate Domain Fixtures from Infrastructure Fixtures

The current `conftest.py` mixes infrastructure fixtures (app creation, session management, Prometheus cleanup, OIDC mocking) with domain-specific fixtures (sample_part, make_attachment_set, document test fixtures). The domain fixtures should be separated so that the infrastructure portion can be cleanly extracted into the template conftest.

Specifically:
- Infrastructure fixtures stay in `tests/conftest.py` (these become the template conftest)
- Domain-specific fixtures (`make_attachment_set`, `make_attachment_set_flask`, `sample_part`, document fixtures) move to a domain fixtures file
- The `test_document_fixtures.py` import at the bottom of conftest.py is already a partial separation — this pattern should be completed
- SSE fixtures are infrastructure (template behind `use_sse` flag) and can stay

### Additional Cleanup

- The `sse_server` fixture has its own hardcoded cleanup that should also use the lifecycle coordinator pattern where appropriate
