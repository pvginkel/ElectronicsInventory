# Configuration System Refactor

## Overview

Refactor the configuration system to separate environment variable loading from application configuration. This creates a clean separation between raw environment input and resolved application settings, mirroring the refactoring done in the IoTSupport project.

## Current State

The current `Settings` class in `app/config.py` mixes concerns:
- Loads environment variables via pydantic-settings
- Uses UPPER_CASE field names matching environment variables
- Contains the `set_engine_options_override()` mechanism for test fixtures
- Uses `@lru_cache` on `get_settings()` for singleton behavior
- Has properties like `SQLALCHEMY_DATABASE_URI`, `SQLALCHEMY_ENGINE_OPTIONS`
- Contains a `model_validator` for environment-specific defaults (SSE_HEARTBEAT_INTERVAL, AI_TESTING_MODE)

## Target State

Two distinct classes:

1. **`Environment`** (pydantic-settings BaseSettings)
   - Loads raw environment variables
   - UPPER_CASE field names matching env vars
   - `str | None` for optional fields
   - No transformation logic

2. **`Settings`** (Pydantic BaseModel)
   - Clean application configuration with resolved values
   - lowercase field names (Python convention)
   - No `Optional` for fields that have defaults after transformation
   - `Settings.load() -> Settings` classmethod that:
     - Loads `Environment`
     - Applies environment-specific defaults
     - Builds `sqlalchemy_engine_options` dict
     - Returns `Settings` instance

3. **`FlaskConfig`** (simple DTO)
   - UPPER_CASE attributes for Flask's `app.config.from_object()`
   - Created via `Settings.to_flask_config()`

## Test Strategy

- Tests construct `Settings` directly with test values (bypassing `Settings.load()`)
- `sqlalchemy_engine_options` becomes a regular field tests can override
- Remove `set_engine_options_override` mechanism
- Use `model_copy(update={...})` pattern instead of direct attribute mutation
- No need for `get_settings()` with `@lru_cache` - DI container holds singleton

## Reference

This refactoring mirrors the pattern implemented in IoTSupport (commit 2e5e6e09dff61dc16b1959ea1718659e8bdcc8f5). See `/work/IoTSupport/backend/docs/features/config_refactor/` for the reference implementation.
