**Brief Description**
Introduce an eslint-based guard against `Date.now()` so that Playwright and application code consistently use a renamed `makeUnique` helper (formerly `generateRandomId`) or other vetted randomness utilities. Update contributor guidance accordingly and replace existing timestamp-based identifiers with the approved helpers, adding explicit lint exemptions where a true timestamp is required.

**Relevant Files / Areas**
- `eslint.config.js` — add a lint rule (likely `no-restricted-properties`/`no-restricted-syntax`) that bans direct `Date.now()` usage and captures messaging about preferred helpers.
- `docs/contribute/testing/playwright_developer_guide.md` (or companion guidance doc) — document the requirement to call `makeUnique` instead of `Date.now()` when generating unique test data.
- `tests/support/helpers.ts` — rename `generateRandomId` to `makeUnique`, update exports, and touch if we need additional sync helpers for random identifiers.
- All contributor documentation that currently references `generateRandomId` (for example `docs/contribute/testing/playwright_developer_guide.md` and `docs/contribute/testing/factories_and_fixtures.md`) — align guidance with the new helper name.
- `src/lib/config/sse-request-id.ts` (and any shared correlation-id helpers) — replace the homemade timestamp/random generator with the `traceparent` package so request IDs align with the W3C Trace Context standard.
- All current `Date.now()` call sites (see `rg` output) spanning Playwright tests, test helpers, and a few app modules (for example `tests/e2e/workflows/end-to-end.spec.ts`, `tests/support/helpers/sse-mock.ts`, `src/hooks/use-document-upload.ts`). Each reference must be evaluated and either converted to `makeUnique`/`Math.random`-based logic or annotated with a lint override.

**Implementation Plan**
1. **Helper Rename**
   - Rename `generateRandomId` to `makeUnique` in `tests/support/helpers.ts`, update all imports/usages, and ensure the helper remains synchronous with consistent semantics.
   - Replace every occurrence of `generateRandomId` across factories, fixtures, and docs with `makeUnique` so code and guidance stay in sync.

2. **Lint Rule Definition**
   - Update `eslint.config.js` to prohibit `Date.now()` usage across the codebase. Configure a custom message that directs engineers to `makeUnique` (or another appropriate helper) so the intent is clear whenever the rule fires.
   - Ensure the rule covers both `.ts/.tsx` and test files, and add a path-specific override if any runtime code legitimately requires `Date.now()` (setting up the scopes where a disable comment will be necessary).

3. **Documentation Update**
   - Amend the Playwright contributor guidance in `docs/contribute/testing/playwright_developer_guide.md` with an explicit note: “Use `makeUnique` for randomized identifiers in tests; `Date.now()` is lint-blocked.” Highlight that this aligns with deterministic, fast tests.
   - Update all other docs that mention `generateRandomId` (e.g. `docs/contribute/testing/factories_and_fixtures.md`) to reference `makeUnique` and reiterate that runtime code should choose approved randomness helpers instead of timestamps.

4. **Traceparent Correlation IDs**
   - Add the `traceparent` npm package (or equivalent) and wire a utility that returns the `trace-id` component as our correlation/request identifier so we no longer rely on bespoke timestamp-based strings.
   - Update `src/lib/config/sse-request-id.ts` and any downstream consumers (deployment context, SSE hooks, Playwright bridges) to call the new helper instead of assembling IDs from `Date.now()` or random segments.
   - Ensure the request-id caching/reset logic still works with the new helper and that Playwright’s test bridges continue to expose the generated ID.

5. **Refactor Existing Usage**
   - Walk every `Date.now()` call site identified via `rg` and handle them explicitly:
     * **Proxy busters / cache keys** (e.g. `tests/support/helpers/file-upload.ts`, `tests/support/helpers/toast-helpers.ts`) — switch to non-time-based randomness such as `Math.random()`-derived tokens.
     * **Upload tracking keys** (`src/hooks/use-document-upload.ts`) — replace timestamp concatenation with a randomness-based key to avoid collisions introduced by fast retries.
     * **Correlation IDs** (`src/lib/config/sse-request-id.ts` and dependants) — replace with the new `traceparent` helper.
     * **All other call sites** — update to approved randomness; if a true timestamp is ever required, add a localized eslint-disable comment documenting the justification per project policy (none are expected today).
   - Confirm that replacements keep string formatting intact (for example, prefixes on test data) and that production code never imports the test-only `makeUnique` helper.

6. **Validation**
   - Run the eslint suite (`pnpm lint`) to verify the new rule flags no remaining instances except intentional exemptions.
   - Execute targeted Playwright or unit tests that relied on timestamp-based uniqueness to ensure the helper-based IDs do not introduce flaky behavior.

**Notes**
- No Playwright mocking changes are needed; test flows remain backend-driven.
- If new helper variants become necessary (e.g., different character sets), record them alongside `makeUnique` so developers have a single source of truth.
