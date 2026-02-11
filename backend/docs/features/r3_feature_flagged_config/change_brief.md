# R3: Feature-Flagged Configuration — Change Brief

## Summary

Refactor `app/config.py` to prepare for Copier template extraction by:

1. **Remove dead Celery config** — `CELERY_BROKER_URL` and `CELERY_RESULT_BACKEND` fields exist in both `Environment` and `Settings` but are never referenced anywhere in the application. They are dead code from a removed feature.

2. **Group config by feature** — Organize configuration fields with clear section comments that map each group to a Copier feature flag (`use_database`, `use_oidc`, `use_s3`, `use_sse`). This makes it obvious which settings belong to which feature, preparing for Jinja conditional blocks in the template.

3. **Ensure feature groups are well-defined** — Each config section maps cleanly to one of: always-present core, `use_database`, `use_oidc`, `use_s3`, `use_sse`, or app-specific. App-specific settings (AI, Mouser, download cache, document processing) remain but are clearly marked as app-specific rather than template infrastructure.

This is a pure refactoring of `app/config.py` — no behavior changes, no new features. The goal is a cleanly organized config file where template extraction can wrap each group in `{% if use_X %}` blocks.
