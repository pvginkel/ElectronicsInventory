# Playwright No Route Mock Enforcement

## Brief Description
Introduce linting and workflow enforcement that bans `page.route`/`route.fulfill`/`mockSSE` usage in Playwright specs, except for explicitly approved AI SSE mocks, and wire the rule into CI and contributor docs.

## Files / Modules In Scope
- `eslint.config.js` (or project ESLint configuration)
- New custom rule under `scripts/eslint-rules/testing/no-route-mocks.ts` (or similar location)
- `package.json` (if lint scripts need updates)
- CI configuration (e.g., `.github/workflows/`, Jenkinsfile) to ensure lint runs on Playwright changes
- Documentation: `docs/contribute/testing/index.md`, `docs/contribute/testing/playwright_developer_guide.md`, `AGENTS.md`
- Existing Playwright specs that still use mocks (for adding suppressions during migration)

## Technical Steps
1. **Author custom ESLint rule**
   - Detect `page.route`, `browserContext.route`, `route.fulfill`, `route.abort`, and `mockSSE` invocations inside `tests/**`.
   - Allow exceptions only when a comment of the form `// eslint-disable-next-line testing/no-route-mocks -- <reason>` is present.
   - Unit-test the rule to cover positive/negative cases (e.g., AI analysis SSE vs prohibited mocks).

2. **Integrate rule into ESLint config**
   - Register the new rule (e.g., `testing/no-route-mocks`) and enable it for Playwright directories.
   - Update lint scripts to include the new rule package if needed.

3. **Update CI pipelines**
   - Ensure `pnpm lint` (or equivalent) runs on every PR and fails when the rule reports violations.
   - If lint is not already part of the pre-merge checks, add the necessary steps to GitHub Actions or Jenkins.

4. **Document the policy**
   - Update contributor testing docs and `AGENTS.md` to highlight the rule, the AI SSE exception, and the approval process for suppressions.
   - Provide a short example of the expected suppression comment for the AI analysis flow.

5. **Apply known suppressions**
   - Add the justified `eslint-disable-next-line testing/no-route-mocks -- AI analysis SSE is approved` comment in the AI specs so the suite stays green during rollout.

6. **Validation**
   - Run `pnpm lint` locally to confirm the rule catches existing mocks elsewhere.
   - Run a targeted Playwright spec (AI analysis) to ensure suppressions do not introduce runtime regressions.
