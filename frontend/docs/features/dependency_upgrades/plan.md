# Dependency Upgrades Plan: React 19 Ecosystem Update

## 0) Research Log & Findings

**Package Version Investigation**
- Current eslint-plugin-react-hooks: 5.2.0 (package.json:55)
- Current tailwind-merge: 2.6.0 (package.json:41)
- Current @types/node: 22.17.2 (package.json:48)
- Latest eslint-plugin-react-hooks: 7.0.1 (2 majors behind)
- Latest tailwind-merge: 3.3.1 (1 major behind)
- Latest @types/node: 24.10.0 (2 majors behind)

**Breaking Change Research**
- eslint-plugin-react-hooks 7.0.0: Configuration structure simplified to just 2 presets (`recommended` and `recommended-latest`), removed `recommended-latest-legacy` and `flat/recommended`
- eslint-plugin-react-hooks 7.0.1: Bug fixes for module exports and typing
- tailwind-merge 3.0.0: Requires Tailwind CSS v4, drops v3 support, changes theme keys, validator API changes, prefix configuration changes
- @types/node: No specific breaking changes documented; types follow Node.js API changes

**Usage Pattern Analysis**
- tailwind-merge: Used in `src/lib/utils.ts` as `cn()` utility function, imported extensively across 20+ components (button.tsx, card.tsx, toast.tsx, dropdown-menu.tsx, etc.)
- eslint-plugin-react-hooks: Used in eslint.config.js:18-22, currently using `reactHooks.configs.recommended.rules`
- @types/node: Type definitions only, used implicitly throughout build process

**Project Context**
- React 19.1.1 is in use (package.json:39)
- ESLint 9.33.0 with typescript-eslint 8.39.1 (flat config format)
- TailwindCSS v4.1.16 recently upgraded (docs/features/tailwindcss_upgrade/plan.md)
- Testing requirements: `pnpm check` and `pnpm playwright test` must pass before delivery (CLAUDE.md, docs/contribute/testing/index.md)
- Current eslint.config.js uses flat config format (eslint.config.js:8-59)

**Risk Assessment**
- tailwind-merge 3.0.0 upgrade is coupled to TailwindCSS v4, which was just completed — this is the right timing
- eslint-plugin-react-hooks 7.0.0 breaking change is configuration-only, not rule logic changes
- @types/node upgrade is low risk (types only)

**Conflicts Resolved**
- The project uses flat ESLint config (eslint.config.js:8), so the breaking change removing `flat/recommended` preset does not affect us — we're already using the base `recommended` rules via `reactHooks.configs.recommended.rules`

## 1) Intent & Scope

**User intent**

Upgrade three outdated dependencies in the React 19 + TypeScript + Vite + TailwindCSS v4 project to their latest major versions, ensuring compatibility with the recently completed TailwindCSS v4 upgrade, maintaining React 19 compatibility, verifying that the `cn()` utility continues to work correctly with tailwind-merge 3.x, confirming ESLint configuration remains valid with the new react-hooks plugin, and ensuring TypeScript compilation passes with updated @types/node definitions.

**Prompt quotes**

"eslint-plugin-react-hooks: 5.2.0 → 7.0.1 (2 majors behind)"
"React 19 compatibility and updated hooks linting rules"
"tailwind-merge: 2.6.0 → 3.3.1 (1 major behind)"
"Keep TailwindCSS ecosystem in sync (we just upgraded to TailwindCSS v4.1.16)"
"Used in: `src/lib/utils.ts` for the `cn()` utility function"
"@types/node: 22.17.2 → 24.10.0 (2 majors behind)"
"Test that the `cn()` utility still works after tailwind-merge upgrade"
"Verify ESLint configuration still works with new react-hooks plugin"
"Run full test suite to verify no regressions"

**In scope**

- Update eslint-plugin-react-hooks from 5.2.0 to 7.0.1
- Verify ESLint configuration compatibility with new plugin version
- Update tailwind-merge from 2.6.0 to 3.3.1
- Test `cn()` utility function with tailwind-merge 3.x and TailwindCSS v4
- Update @types/node from 22.17.2 to 24.10.0
- Run full lint, type-check, and build validation (`pnpm check`)
- Run full Playwright test suite to verify no regressions
- Document any configuration changes or migration notes
- Verify no console warnings or errors during development and build

**Out of scope**

- Changing ESLint rules or adding new lint rules beyond what the plugin update provides
- Refactoring components to use new features from updated dependencies
- Upgrading other unrelated dependencies (React Query, TanStack Router, Vite, etc.)
- Modifying test instrumentation or test selectors
- Changing the `cn()` utility implementation beyond compatibility fixes
- Adopting experimental React Compiler rules (available in `recommended-latest` preset)
- Updating Node.js runtime version or Dockerfile

**Assumptions / constraints**

- The project must remain on Node.js 18+ (compatible with all three upgrades)
- TailwindCSS v4.1.16 is already in use and stable (completed in separate feature)
- ESLint flat config format is already adopted (eslint.config.js uses flat config)
- The `cn()` utility function signature must remain unchanged for backward compatibility
- No visual regressions are acceptable; UI must render identically after upgrades
- Playwright tests must pass without modification to test selectors or instrumentation
- Build times and bundle sizes should not regress significantly
- All upgrades must complete in a single deliverable; no incremental rollout

## 2) Affected Areas & File Map

### Configuration Files

- **Area**: `/work/frontend/package.json`
- **Why**: Update dependency versions for eslint-plugin-react-hooks (5.2.0 → 7.0.1), tailwind-merge (2.6.0 → 3.3.1), @types/node (22.17.2 → 24.10.0)
- **Evidence**: package.json:41 (`"tailwind-merge": "^2.0.0"`), package.json:48 (`"@types/node": "^22.0.0"`), package.json:55 (`"eslint-plugin-react-hooks": "^5.2.0"`)

- **Area**: `/work/frontend/eslint.config.js`
- **Why**: Verify configuration compatibility with eslint-plugin-react-hooks 7.0.1; confirm `reactHooks.configs.recommended.rules` remains valid
- **Evidence**: eslint.config.js:3 (`import reactHooks from 'eslint-plugin-react-hooks'`), eslint.config.js:18 (`'react-hooks': reactHooks`), eslint.config.js:22 (`...reactHooks.configs.recommended.rules`)

### Utility Files

- **Area**: `/work/frontend/src/lib/utils.ts`
- **Why**: Core `cn()` utility uses tailwind-merge; must verify compatibility with tailwind-merge 3.x and TailwindCSS v4
- **Evidence**: utils.ts:2 (`import { twMerge } from 'tailwind-merge'`), utils.ts:4-6 (`export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)) }`)

### Component Files (cn() Usage)

- **Area**: `/work/frontend/src/components/ui/button.tsx`
- **Why**: Heavy user of `cn()` utility; test surface for tailwind-merge 3.x compatibility with v4 classes
- **Evidence**: button.tsx:3 (`import { cn } from '@/lib/utils'`), button.tsx:92-97 (cn() merging baseClasses, variantClasses, sizeClasses)

- **Area**: All components using `cn()` utility (20+ files)
- **Why**: Comprehensive testing surface for tailwind-merge 3.x class merging behavior with TailwindCSS v4 utilities
- **Evidence**: Grep results show cn() usage in external-link.tsx, card.tsx, toast.tsx, badge.tsx, dropdown-menu.tsx, segmented-tabs.tsx, input.tsx, link-chip.tsx, searchable-select.tsx, kit-bom-row-editor.tsx, kit-pick-list-panel.tsx, kit-create-dialog.tsx, kit-metadata-dialog.tsx, concept-line-form.tsx, detail-header-slots.tsx, list-create-dialog.tsx, add-to-shopping-list-dialog.tsx, seller-group-order-note-dialog.tsx, and 2+ more files

### Build and Type-Check System

- **Area**: TypeScript compilation pipeline
- **Why**: @types/node 24.10.0 provides updated Node.js type definitions; verify no type errors in build process
- **Evidence**: package.json:12 (`"check:type-check": "tsc -b --noEmit"`), tsconfig.json implicitly references @types/node

- **Area**: Vite build configuration
- **Why**: Verify build process handles updated type definitions without errors
- **Evidence**: package.json:9 (`"build": "pnpm generate:api:build && pnpm generate:routes && pnpm check && vite build && pnpm verify:build"`)

### Testing Infrastructure

- **Area**: Playwright test suite (tests/e2e/*)
- **Why**: Comprehensive regression testing to verify no UI or functional changes from dependency updates
- **Evidence**: 38+ spec files under tests/e2e/ (types-crud.spec.ts, part-crud.spec.ts, shopping-lists-detail.spec.ts, etc.) per Glob results

## 3) Data Model / Contracts

**No data model changes**

This upgrade is purely a dependency update. No API contracts, TanStack Query cache keys, component prop interfaces, or data structures are affected. The `cn()` utility signature remains unchanged: it accepts an array of class values and returns a merged string.

**Type Definition Updates**

- **Entity / contract**: Node.js global types and module types
- **Shape**: @types/node 24.x may include new Node.js 24 APIs or modified type signatures for existing APIs
- **Mapping**: TypeScript compiler will use updated type definitions during type-checking; no runtime impact
- **Evidence**: package.json:48, tsconfig.json implicitly includes @types/node

## 4) API / Integration Surface

**No API surface changes**

The dependency upgrades do not touch any backend endpoints, generated hooks, or event emitters. The frontend continues to use the same API client, TanStack Query hooks, and instrumentation helpers. This is a zero-impact change for the data layer.

**Build-time tooling surface**

- **Surface**: ESLint linting process
- **Inputs**: Source files (*.ts, *.tsx), eslint.config.js configuration
- **Outputs**: Lint errors/warnings, exit code
- **Errors**: Potential new lint errors from updated react-hooks plugin rules; config errors if `recommended.rules` structure changed
- **Evidence**: eslint.config.js:22 (`...reactHooks.configs.recommended.rules`), package.json:11 (`"check:lint": "eslint ."`)

- **Surface**: TypeScript type-checking
- **Inputs**: Source files, tsconfig.json, @types/node definitions
- **Outputs**: Type errors, compiled declaration files
- **Errors**: Potential type errors if @types/node 24.x has breaking changes in used APIs
- **Evidence**: package.json:12 (`"check:type-check": "tsc -b --noEmit"`)

## 5) Algorithms & UI Flows

**Build-time linting flow**

1. Developer runs `pnpm check:lint` or `pnpm check`
2. ESLint loads eslint.config.js configuration
3. ESLint imports eslint-plugin-react-hooks 7.0.1
4. ESLint applies `reactHooks.configs.recommended.rules` to source files
5. Plugin analyzes React hooks usage (useEffect, useState, custom hooks, etc.)
6. Plugin reports violations of Rules of Hooks and exhaustive-deps rules
7. Exit with code 0 (success) or 1 (errors found)

**States / transitions**: N/A (synchronous CLI process)

**Hotspots**: If the `recommended.rules` export structure changed in 7.0.0, step 4 may fail with config error

**Evidence**: eslint.config.js:22, package.json:11

**Build-time type-checking flow**

1. Developer runs `pnpm check:type-check` or `pnpm build`
2. TypeScript compiler loads tsconfig.json and project files
3. TypeScript imports @types/node 24.10.0 for Node.js global types
4. TypeScript validates all type annotations and infers types
5. Report type errors or emit declaration files
6. Exit with code 0 (success) or 1 (errors found)

**States / transitions**: N/A (synchronous CLI process)

**Hotspots**: If @types/node 24.x changed type signatures for used Node APIs (e.g., `process`, `Buffer`, module resolution types), step 4 may produce type errors

**Evidence**: package.json:12, tsconfig.json

**Runtime class merging flow (cn() utility)**

1. Component renders and calls `cn(baseClasses, variantClasses, conditionalClasses, className)`
2. clsx library processes input array and produces space-separated string
3. twMerge (tailwind-merge 3.3.1) parses class string
4. tailwind-merge applies TailwindCSS v4 merging rules (later classes override earlier classes for same utility group)
5. tailwind-merge returns deduplicated, merged class string
6. React applies merged classes to DOM element

**States / transitions**: Pure function, no state transitions

**Hotspots**: Step 4 merging logic changed in tailwind-merge 3.x to support TailwindCSS v4 class syntax; if v4 class names are not recognized, merging may fail or produce incorrect results

**Evidence**: src/lib/utils.ts:4-6, src/components/ui/button.tsx:92-97

## 6) Derived State & Invariants

**No derived state**

These are build-time and runtime utility dependencies with no React state management. The project's existing derived state (filtered lists, computed form validation, optimistic updates) is unaffected.

**Invariant: ESLint configuration validity**

- **Source**: eslint.config.js, eslint-plugin-react-hooks 7.0.1
- **Writes / cleanup**: N/A (configuration only)
- **Guards**: Verify `reactHooks.configs.recommended` export exists and contains `rules` property
- **Invariant**: For the flat config format, `reactHooks.configs.recommended.rules` must remain a valid spread target containing rule definitions
- **Evidence**: eslint.config.js:22

**Invariant: cn() utility merging correctness**

- **Source**: tailwind-merge 3.3.1, clsx, component className props
- **Writes / cleanup**: N/A (pure function)
- **Guards**: Test suite verifies UI renders correctly, manual inspection of computed styles in DevTools
- **Invariant**: For any given set of TailwindCSS v4 class names, `cn()` must produce correct merging such that later classes override earlier classes in the same utility group (e.g., `cn('bg-red-500', 'bg-blue-500')` → `'bg-blue-500'`)
- **Evidence**: src/lib/utils.ts:4-6, Playwright suite verifies no visual regressions

**Invariant: Type-checking completeness**

- **Source**: @types/node 24.10.0, TypeScript compiler
- **Writes / cleanup**: N/A (compile-time only)
- **Guards**: `pnpm check:type-check` must exit with code 0
- **Invariant**: All Node.js API usage in the codebase must have valid type definitions in @types/node 24.x
- **Evidence**: package.json:12

## 7) State Consistency & Async Coordination

**No async coordination**

These dependencies operate at build time or as synchronous runtime utilities. No TanStack Query caches, React state, or instrumentation are affected.

**Build pipeline coordination**

- **Source of truth**: package.json dependency versions, pnpm lockfile
- **Coordination**: `pnpm check` runs lint and type-check in sequence; `pnpm build` gates on `pnpm check` success
- **Async safeguards**: None needed; all processes are synchronous CLI commands
- **Instrumentation**: No test-event changes; Playwright tests rely on existing instrumentation
- **Evidence**: package.json:9-10 (`"build": "... && pnpm check && vite build"`, `"check": "pnpm check:lint && pnpm check:type-check"`)

## 8) Errors & Edge Cases

### Case: ESLint configuration error after plugin upgrade

- **Failure**: `reactHooks.configs.recommended.rules` export no longer exists or has different structure in 7.0.0+
- **Surface**: eslint.config.js:22, CLI output during `pnpm check:lint`
- **Handling**: Inspect plugin exports with Node REPL or test script; update config to use correct preset name (e.g., `configs.recommended.rules` → `configs['flat/recommended'].rules` or similar); consult CHANGELOG for correct usage
- **Guardrails**: Run `pnpm check:lint` immediately after upgrade before proceeding to other validation; keep v5.2.0 available for quick rollback if config incompatibility is severe

### Case: New ESLint errors from stricter hook rules

- **Failure**: Updated plugin detects new violations of Rules of Hooks or exhaustive-deps that v5.2.0 did not catch
- **Surface**: Component files with hooks, CLI lint output
- **Handling**: Review each error; fix legitimate violations (missing deps, conditional hook calls); add eslint-disable comments for false positives with justification
- **Guardrails**: Treat new lint errors as improvements; prioritize fixing over disabling; document any disable comments

### Case: tailwind-merge 3.x does not recognize TailwindCSS v4 classes

- **Failure**: `cn()` fails to merge v4-specific classes (e.g., arbitrary CSS variables like `bg-(--brand-color)`, new utility names), resulting in duplicate classes or incorrect precedence
- **Surface**: src/lib/utils.ts, rendered DOM elements with merged classes
- **Handling**: Inspect computed styles in DevTools; verify tailwind-merge 3.3.1 changelog confirms v4 support; test with known v4 syntax (arbitrary variables, new modifiers); report issue to tailwind-merge if bug found
- **Guardrails**: Manual visual QA of components with complex class merging (Button variants, conditional styling); Playwright suite verifies no functional regressions

### Case: TailwindCSS v4 class name changes break merging logic

- **Failure**: If TailwindCSS v4 renamed utilities (e.g., `outline-none` → `outline-hidden`), tailwind-merge 3.x may not group them correctly, causing both old and new class to appear
- **Surface**: Components using renamed utilities, rendered DOM
- **Handling**: Audit codebase for any remaining v3 class names (should have been updated in TailwindCSS v4 upgrade); ensure all components use v4 syntax; verify tailwind-merge 3.x groups v4 classes correctly
- **Guardrails**: Cross-reference with docs/features/tailwindcss_upgrade/plan.md to confirm all v3→v4 renames were applied; manual inspection of Button, Input, and other UI components

### Case: @types/node 24.x breaking change in used API

- **Failure**: Type errors during `pnpm check:type-check` due to changed type signatures (e.g., `process.env` types, `Buffer` methods, module resolution types)
- **Surface**: TypeScript compiler output, affected source files
- **Handling**: Review type errors; update code to match new type signatures (add type assertions, adjust interfaces, handle new nullability); consult Node.js 24 changelog for API changes
- **Guardrails**: @types/node typically does not introduce breaking changes for stable Node.js APIs; most errors will be in edge cases or deprecated APIs; verify Node.js 18+ compatibility is maintained

### Case: Build performance regression

- **Failure**: `pnpm build` or `pnpm check:lint` takes significantly longer with updated dependencies
- **Surface**: CI build times, local development feedback loop
- **Handling**: Profile build times before/after; investigate if eslint-plugin-react-hooks 7.x has performance issues; check tailwind-merge 3.x changelog for known performance changes; consider caching strategies
- **Guardrails**: Measure baseline build times before upgrade; accept ±10% variance; rollback if >20% regression without mitigation

### Case: Playwright tests fail due to unexpected console warnings

- **Failure**: Updated dependencies log new warnings to console, triggering Playwright's console error policy
- **Surface**: Playwright test suite, console capture in tests/support/helpers.ts
- **Handling**: Inspect console output; verify warnings are benign (e.g., deprecation notices); use `expectConsoleError(page, /pattern/)` helper to allow expected warnings
- **Guardrails**: Per docs/contribute/testing/index.md, console.error causes test failure unless explicitly expected; add expected error patterns for legitimate warnings

### Case: Runtime error in cn() utility with edge case input

- **Failure**: tailwind-merge 3.x throws error or returns unexpected output for specific class combinations
- **Surface**: Browser console, component rendering
- **Handling**: Reproduce error with minimal test case; verify input is valid TailwindCSS v4 syntax; report bug to tailwind-merge if legitimate; add defensive error handling or input validation if edge case
- **Guardrails**: Playwright suite exercises diverse class combinations through UI interactions; manual testing of Button variants, conditional styling, and responsive classes

## 9) Observability / Instrumentation

**No instrumentation changes**

These dependency upgrades do not affect test-event emission, instrumentation hooks, or Playwright bridge. Existing instrumentation (`useListLoadingInstrumentation`, `trackForm*`, test-event taxonomy) remains unchanged.

**Build-time signals**

- **Signal**: ESLint output (errors, warnings, rule violations)
- **Type**: CLI output during `pnpm check:lint`
- **Trigger**: Linting source files with updated react-hooks plugin
- **Labels / fields**: File path, line number, rule name, error message
- **Consumer**: Developer console, CI logs, code review
- **Evidence**: package.json:11 (`"check:lint": "eslint ."`), eslint.config.js

- **Signal**: TypeScript compiler output (type errors, diagnostics)
- **Type**: CLI output during `pnpm check:type-check`
- **Trigger**: Type-checking source files with @types/node 24.x
- **Labels / fields**: File path, line number, error code (TS####), error message
- **Consumer**: Developer console, CI logs, IDE type-checking
- **Evidence**: package.json:12 (`"check:type-check": "tsc -b --noEmit"`)

- **Signal**: Playwright test results (pass/fail, console output, test-event logs)
- **Type**: Test runner output, JSON report
- **Trigger**: Running `pnpm playwright test` after upgrades
- **Labels / fields**: Spec file, test name, pass/fail status, console logs, screenshots
- **Consumer**: Developer console, CI logs, Playwright HTML reporter
- **Evidence**: docs/contribute/testing/playwright_developer_guide.md, CLAUDE.md

**Runtime signals**

- **Signal**: Browser console errors/warnings
- **Type**: JavaScript console output in dev/production
- **Trigger**: Runtime errors from tailwind-merge 3.x or unexpected behavior
- **Labels / fields**: Error message, stack trace, component source
- **Consumer**: Developer DevTools, Playwright console capture
- **Evidence**: Playwright's console guarding per docs/contribute/testing/index.md

## 10) Lifecycle & Background Work

**Build-time lifecycle only**

These dependencies have no runtime lifecycle hooks, effects, or subscriptions. The only lifecycle concerns are build pipeline processes:

- **Hook / effect**: ESLint linting pass
- **Trigger cadence**: On `pnpm check`, on `pnpm build`, on git pre-commit hooks (if configured)
- **Responsibilities**: Load eslint-plugin-react-hooks 7.0.1, apply recommended rules, analyze source files, report violations
- **Cleanup**: None needed; process exits after reporting
- **Evidence**: package.json:10-11, eslint.config.js

- **Hook / effect**: TypeScript type-checking
- **Trigger cadence**: On `pnpm check`, on `pnpm build`, on IDE save (background type-checking)
- **Responsibilities**: Load @types/node 24.x, validate all types, emit diagnostics
- **Cleanup**: None needed; process exits after checking
- **Evidence**: package.json:12

- **Hook / effect**: Vite build with tailwind-merge in bundle
- **Trigger cadence**: On `pnpm dev` (HMR), on `pnpm build` (production bundle)
- **Responsibilities**: Bundle src/lib/utils.ts with tailwind-merge 3.3.1, tree-shake unused code, optimize for production
- **Cleanup**: None needed; Vite manages bundle lifecycle
- **Evidence**: vite.config.ts, src/lib/utils.ts

**No runtime subscriptions**

The `cn()` utility is a pure function with no subscriptions, timers, or event listeners. It operates synchronously on every component render with no cleanup required.

## 11) Security & Permissions

**Supply chain security**

- **Concern**: Ensure updated packages are from official npm registry and have not been compromised
- **Touchpoints**: package.json, pnpm-lock.yaml
- **Mitigation**: Verify package publishers (facebook/react for eslint-plugin-react-hooks, dcastil for tailwind-merge, DefinitelyTyped for @types/node); review pnpm audit output after installation; inspect lockfile for unexpected changes
- **Residual risk**: Low; all three packages are widely-used, well-maintained, and have established security track records
- **Evidence**: package.json:48, 55, 41

**No runtime security impact**

These dependencies operate at build time or as runtime utilities with no network access, user input processing, or privilege escalation. The upgrade does not introduce new attack surfaces.

## 12) UX / UI Impact

**Zero intended UX changes**

The dependency upgrades must be invisible to end users. All visual styling, interactions, and layouts remain identical.

**Potential unintended impacts**

- **Entry point**: All routes and components using `cn()` utility (20+ files)
- **Change**: If tailwind-merge 3.x merges classes differently than 2.x, users may perceive styling differences (e.g., incorrect precedence, duplicate classes, missing styles)
- **User interaction**: No behavioral changes; only visual appearance could differ if merging logic regresses
- **Dependencies**: tailwind-merge 3.3.1, TailwindCSS v4.1.16, component className props
- **Evidence**: Grep results show cn() usage across ui/, kits/, shopping-lists/ components; Button component (button.tsx:92-97) is highest-risk surface due to complex variant merging

**ESLint upgrade impact**

- **Entry point**: Developer experience (CI, IDE linting)
- **Change**: Developers may see new lint errors or warnings if react-hooks plugin detects previously-missed violations
- **User interaction**: No end-user impact; only affects development workflow
- **Dependencies**: eslint-plugin-react-hooks 7.0.1, eslint.config.js
- **Evidence**: eslint.config.js:22, docs/contribute/getting_started.md

## 13) Deterministic Test Plan

### Surface: ESLint configuration and linting

**Scenarios:**
- **Given** eslint-plugin-react-hooks 7.0.1 is installed, **When** running `pnpm check:lint`, **Then** ESLint loads successfully without configuration errors
- **Given** eslint.config.js uses `reactHooks.configs.recommended.rules`, **When** linting runs, **Then** all source files are analyzed and existing lint rules apply correctly
- **Given** plugin detects new violations, **When** reviewing errors, **Then** errors are legitimate hook violations (not false positives) and can be fixed or justified

**Instrumentation / hooks:** CLI output, exit code, ESLint JSON reporter

**Gaps:** None

**Evidence:** eslint.config.js:22, package.json:11

### Surface: tailwind-merge 3.x class merging with TailwindCSS v4

**Scenarios:**
- **Given** tailwind-merge 3.3.1 is installed, **When** `cn('bg-red-500', 'bg-blue-500')` is called, **Then** returns `'bg-blue-500'` (later class wins)
- **Given** TailwindCSS v4 arbitrary variable syntax `bg-(--brand-color)`, **When** `cn('bg-gray-500', 'bg-(--brand-color)')` is called, **Then** returns `'bg-(--brand-color)'` (arbitrary value overrides utility)
- **Given** Button component with variant and size props, **When** rendering with custom className, **Then** merged classes produce correct visual appearance (no duplicate styles, correct precedence)
- **Given** complex class combinations in 20+ components, **When** running Playwright suite, **Then** all tests pass with no visual regressions

**Instrumentation / hooks:** Unit test for `cn()` function (if exists), manual DevTools inspection, Playwright suite

**Gaps:** No unit tests for `cn()` utility currently; relying on integration testing via Playwright and manual QA

**Evidence:** src/lib/utils.ts:4-6, src/components/ui/button.tsx:92-97, Playwright suite

### Surface: TypeScript type-checking with @types/node 24.x

**Scenarios:**
- **Given** @types/node 24.10.0 is installed, **When** running `pnpm check:type-check`, **Then** TypeScript compiles without errors
- **Given** codebase uses Node.js APIs (process, Buffer, module resolution), **When** type-checking, **Then** all usage has valid type definitions and no type errors
- **Given** build process runs, **When** executing `pnpm build`, **Then** type-check passes and build completes successfully

**Instrumentation / hooks:** TypeScript compiler output, tsc exit code

**Gaps:** None

**Evidence:** package.json:12, package.json:9

### Surface: Production build and bundle

**Scenarios:**
- **Given** all three dependencies are upgraded, **When** running `pnpm build`, **Then** build completes without errors
- **Given** build succeeds, **When** inspecting bundle size, **Then** tailwind-merge 3.x does not significantly increase bundle size (±5% acceptable)
- **Given** production bundle, **When** running `pnpm preview`, **Then** app renders correctly with no console errors

**Instrumentation / hooks:** Vite build logs, bundle size report, browser console

**Gaps:** None

**Evidence:** package.json:9, vite.config.ts

### Surface: Playwright test suite regression testing

**No new Playwright tests required** — This is a dependency upgrade with zero user-visible behavior changes. The existing Playwright suite (38+ spec files) provides comprehensive regression coverage by exercising components that use the `cn()` utility extensively. Any visual regressions from incorrect class merging will cause existing assertions to fail.

**Existing coverage rationale:**
- Button components tested across all CRUD flows (types, parts, kits, sellers, shopping lists) — exercises `cn()` with variant/size merging
- Form dialogs tested with focus states and validation — exercises `cn()` with conditional classes
- Card components tested in list views — exercises `cn()` with grid-tile variants
- Toast notifications tested with action buttons — exercises `cn()` with tone variants
- All tests use components that internally call `cn()` for className composition

**Scenarios:**
- **Given** all upgrades are complete, **When** running `pnpm playwright test`, **Then** all existing tests pass without modification (no new behaviors to test)
- **Given** tests interact with UI components using `cn()` utility, **When** assertions run, **Then** no visual regressions detected (classes merge correctly, styles apply as expected, components render identically)
- **Given** test suite runs, **When** inspecting console output, **Then** no unexpected warnings or errors from tailwind-merge or other dependencies
- **Given** tests use instrumentation hooks, **When** waiting for test-events, **Then** all events emit correctly (no dependency upgrade impact on instrumentation)

**Instrumentation / hooks:** Playwright test output, console capture, test-event bridge, data-testid selectors

**Gaps:** Custom utility rendering (`.ai-glare`, `.shadow-soft/medium/strong`, `.category-*`) not explicitly tested by Playwright; covered by unit tests (see below) and manual QA in Slice 3

**Evidence:** docs/contribute/testing/playwright_developer_guide.md, 38+ spec files in tests/e2e/

### Surface: cn() utility unit testing (NEW)

**New unit tests required** — To provide automated regression protection for custom utility merging (tailwind-merge 3.x known limitation with `@utility` directives), add lightweight unit tests for the `cn()` utility.

**Test file:** `src/lib/utils.test.ts` (new file)

**Scenarios:**
- **Given** custom shadow utility and standard shadow class, **When** `cn('shadow-md', 'shadow-soft')` is called, **Then** output contains `'shadow-soft'` (custom utility preserved)
- **Given** category utility and standard background class, **When** `cn('bg-blue-500', 'category-resistor')` is called, **Then** output contains `'category-resistor'` (custom utility preserved)
- **Given** ai-glare utility with positioning classes, **When** `cn('relative', 'ai-glare')` is called, **Then** output contains `'ai-glare'` (custom utility preserved)
- **Given** custom breakpoint class and standard text size, **When** `cn('text-sm', '3xl:text-lg')` is called, **Then** output contains `'3xl:text-lg'` (custom breakpoint works)
- **Given** overlapping standard utilities, **When** `cn('bg-red-500', 'bg-blue-500')` is called, **Then** output equals `'bg-blue-500'` (later class wins - baseline behavior)

**Instrumentation / hooks:** Jest/Vitest test runner output, test coverage reports

**Gaps:** None — unit tests complement manual DevTools testing and Playwright regression coverage

**Evidence:** plan.md:732-738 (custom utility known limitation), code review recommendation for automated testing

### Surface: Development server and HMR

**Scenarios:**
- **Given** all upgrades are complete, **When** running `pnpm dev`, **Then** Vite starts without errors and app loads correctly
- **Given** dev server is running, **When** editing component with `cn()` usage, **Then** HMR updates work correctly with no console errors
- **Given** ESLint is configured, **When** saving file with hook violation, **Then** IDE shows lint error from react-hooks plugin 7.0.1

**Instrumentation / hooks:** Vite dev server logs, browser console, IDE lint output

**Gaps:** None

**Evidence:** package.json:8 (`"dev": "vite --host --port 3000"`), docs/contribute/getting_started.md

### Surface: Manual visual QA of cn() utility

**Scenarios:**
- **Given** tailwind-merge 3.x is in use, **When** inspecting Button component in DevTools, **Then** computed styles match expected values (variant classes apply correctly, no duplicate background or color properties)
- **Given** components with conditional styling, **When** toggling states (hover, focus, disabled), **Then** merged classes produce correct visual appearance
- **Given** responsive classes (sm:, md:, lg:), **When** resizing viewport, **Then** breakpoint-specific classes apply correctly

**Instrumentation / hooks:** Browser DevTools (Elements → Computed styles), manual inspection

**Gaps:** Manual QA required; no automated visual regression tests currently

**Evidence:** src/components/ui/button.tsx, Grep results showing cn() usage across components

## 14) Implementation Slices

This upgrade includes baseline recording followed by four implementation slices with incremental validation:

### Slice 0: Record baselines for comparison

**Goal:** Capture current build metrics and test duration before any dependency changes

**Touches:**
- No code changes; measurement only
- Temporary baseline notes (can be in PR description or local file)

**Concrete steps:**
1. Run production build: `pnpm build`
2. Record Vite build output — note bundle sizes for main, vendor, and chunk files:
   - Example: `dist/assets/index-abc123.js: 884.90 kB / gzip: 255.81 kB`
   - Example: `dist/assets/index-def456.css: 65.48 kB / gzip: 11.92 kB`
3. Record total build time from Vite output
4. Optionally run Playwright suite and note duration: `pnpm playwright test | tail -1`
   - Example: "38 passed (2.9m)"
5. Save metrics to temporary file or PR description for comparison in Slice 4

**Dependencies:** None; this is the pre-upgrade baseline

### Slice 1: Update dependencies and verify configuration

**Goal:** Install updated packages, verify ESLint and TypeScript configurations remain valid, confirm dev server starts

**Touches:**
- package.json (update three dependency versions)
- pnpm-lock.yaml (updated by pnpm install)
- eslint.config.js (verify compatibility, no code changes expected)

**Concrete steps:**
1. Update package.json dependencies:
   ```json
   {
     "dependencies": {
       "tailwind-merge": "^3.3.1"  // was ^2.6.0
     },
     "devDependencies": {
       "@types/node": "^24.10.0",  // was ^22.17.2
       "eslint-plugin-react-hooks": "^7.0.1"  // was ^5.2.0
     }
   }
   ```

2. Install dependencies: `pnpm install`

3. Verify ESLint configuration loads correctly:
   - Run `pnpm check:lint` and confirm it completes (errors are okay at this stage, but config must load)
   - If config error occurs, inspect `reactHooks.configs.recommended` structure with Node REPL:
     ```javascript
     import reactHooks from 'eslint-plugin-react-hooks'
     console.log(Object.keys(reactHooks.configs))
     console.log(reactHooks.configs.recommended)
     ```
   - Update eslint.config.js if export structure changed (unlikely based on research)

4. Verify TypeScript type-checking works:
   - Run `pnpm check:type-check` and review any new type errors
   - Document errors for fixing in Slice 2

5. Start dev server: `pnpm dev`
   - Verify Vite starts without errors
   - Navigate to http://localhost:3000 and confirm app loads
   - Open DevTools console and verify no tailwind-merge errors

**Dependencies:** None; this is the first step

### Slice 2: Fix any ESLint or TypeScript errors

**Goal:** Resolve new lint errors from react-hooks plugin 7.0.1 and type errors from @types/node 24.x

**Touches:**
- Component files with hook violations (if any detected by stricter rules)
- Source files with Node.js API type errors (if any)

**Concrete steps:**
1. Review ESLint output from Slice 1:
   - Run `pnpm check:lint` and capture full error list
   - For each error, determine if it's a legitimate violation or false positive:
     - Legitimate: Fix the code (add missing deps to useEffect, remove conditional hook calls, etc.)
     - False positive: Add `// eslint-disable-next-line react-hooks/exhaustive-deps` with justification comment
   - Document any significant rule behavior changes for future reference

2. Review TypeScript output from Slice 1:
   - Run `pnpm check:type-check` and capture full error list
   - For each error, determine fix strategy:
     - Type signature changed: Update code to match new types (add null checks, adjust interfaces)
     - New nullability: Add type guards or assertions
     - Deprecated API: Replace with recommended alternative
   - Verify Node.js 18+ compatibility is maintained (no Node.js 24-specific APIs used)

3. Verify fixes: `pnpm check` (must exit with code 0)

**Dependencies:** Slice 1 must be complete; dependencies installed and basic validation passed

### Slice 3: Test tailwind-merge 3.x compatibility and create unit tests

**Goal:** Create unit tests for `cn()` utility, verify custom utility merging with TailwindCSS v4 classes, test complex merging scenarios, inspect UI components

**Touches:**
- src/lib/utils.test.ts (new file) — unit tests for cn() utility
- No other code changes unless merging bug found
- Manual testing in browser DevTools
- Component inspection (Button, Input, Card, etc.)

**Concrete steps:**
1. Create unit test file `src/lib/utils.test.ts` with tests for custom utility merging:
   ```typescript
   import { describe, it, expect } from 'vitest';
   import { cn } from './utils';

   describe('cn() utility', () => {
     describe('baseline TailwindCSS merging', () => {
       it('later class wins for same utility group', () => {
         expect(cn('bg-red-500', 'bg-blue-500')).toBe('bg-blue-500');
       });

       it('merges different utility groups', () => {
         const result = cn('px-4 py-2', 'px-6');
         expect(result).toContain('px-6');
         expect(result).toContain('py-2');
       });

       it('handles conditional classes', () => {
         const result = cn('text-sm', false && 'text-lg', 'font-bold');
         expect(result).toContain('text-sm');
         expect(result).toContain('font-bold');
         expect(result).not.toContain('text-lg');
       });

       it('handles undefined values', () => {
         expect(cn('flex', undefined, 'gap-4')).toContain('flex');
         expect(cn('flex', undefined, 'gap-4')).toContain('gap-4');
       });
     });

     describe('custom utility merging (TailwindCSS v4 @utility directive)', () => {
       it('preserves custom shadow utilities when merged with standard classes', () => {
         const result = cn('shadow-md', 'shadow-soft');
         expect(result).toContain('shadow-soft');
       });

       it('preserves category utilities when merged with standard classes', () => {
         const result = cn('bg-blue-500', 'category-resistor');
         expect(result).toContain('category-resistor');
       });

       it('preserves ai-glare utility with positioning classes', () => {
         const result = cn('relative', 'ai-glare');
         expect(result).toContain('ai-glare');
       });

       it('preserves transition-smooth utility', () => {
         const result = cn('transition', 'transition-smooth');
         expect(result).toContain('transition-smooth');
       });
     });

     describe('custom breakpoint support', () => {
       it('preserves custom 3xl: breakpoint classes', () => {
         const result = cn('text-sm', '3xl:text-lg');
         expect(result).toContain('3xl:text-lg');
       });
     });
   });
   ```

2. Run unit tests to verify baseline behavior and custom utility handling:
   ```bash
   pnpm test src/lib/utils.test.ts
   ```
   - If tests fail, investigate tailwind-merge 3.x behavior with custom utilities
   - Document whether custom utilities merge correctly or require `extendTailwindMerge()` configuration
   - If configuration needed, update `src/lib/utils.ts` to use `extendTailwindMerge()` with custom class groups

3. Create manual test script to verify cn() merging behavior (temporary file or browser console):
   ```javascript
   import { cn } from './src/lib/utils.ts'

   console.log('Basic merging:', cn('bg-red-500', 'bg-blue-500'))  // expect: 'bg-blue-500'
   console.log('Variant merging:', cn('px-4 py-2', 'px-6'))  // expect: 'px-6 py-2'
   console.log('Conditional:', cn('text-sm', false && 'text-lg', 'font-bold'))  // expect: 'text-sm font-bold'
   console.log('With undefined:', cn('flex', undefined, 'gap-4'))  // expect: 'flex gap-4'
   ```
   Run with Node.js or in browser console to verify merging logic

2. Manual DevTools inspection of Button component:
   - Navigate to any page with Button components (e.g., Types list, Part detail)
   - Open DevTools → Elements → Inspect a button element
   - Verify computed styles match expected values for variant (primary, secondary, outline, etc.)
   - Verify no duplicate background-color, color, or padding properties in computed styles
   - Test hover and focus states to confirm variant classes merge correctly

3. Inspect high-risk components (20+ files using cn()):
   - Card component (card.tsx) — shadow and border merging
   - Toast component (toast.tsx) — variant and animation classes
   - Dropdown Menu (dropdown-menu.tsx) — position and z-index classes
   - Input (input.tsx) — focus ring and border classes
   - Badge (badge.tsx) — size and variant classes
   - For each: verify visual appearance matches pre-upgrade baseline, inspect computed styles for duplicates

4. Test TailwindCSS v4-specific syntax (if used in codebase):
   - Arbitrary CSS variables: `bg-(--brand-color)` syntax (verify merging precedence)
   - New modifier positions: `!important` at end of class (verify parsing)
   - Custom utilities from index.css (`.ai-glare`, `.shadow-soft`, etc.) — verify merge with standard utilities

5. Test responsive and state variants:
   - Verify `sm:`, `md:`, `lg:`, `3xl:` breakpoint classes merge correctly
   - Verify `hover:`, `focus:`, `disabled:`, `aria-pressed:` state variants merge correctly
   - Test Button with `focus-visible:outline-hidden focus-visible:ring-2` pattern

**Dependencies:** Slice 2 must be complete; `pnpm check` must pass

### Slice 4: Run full test suite and build validation

**Goal:** Execute Playwright suite, verify production build, compare bundle sizes, document results

**Touches:**
- No code changes; validation only
- CI pipeline (run `pnpm check`)
- Playwright suite (run `pnpm playwright test`)
- Production build (run `pnpm build`)

**Concrete steps:**
1. Run full Playwright test suite (headless):
   ```bash
   pnpm playwright test
   ```
   - All tests must pass; no modifications to selectors or instrumentation expected
   - If tests fail, inspect failures to determine if they are dependency-related or pre-existing issues:
     - Console error failures: Check if new dependency logs unexpected warnings; use `expectConsoleError()` helper to allow benign warnings
     - Visual failures: Inspect if cn() merging produced different styles; compare computed styles before/after
     - Functional failures: Unlikely to be related to dependency upgrades; investigate separately

2. Run production build:
   ```bash
   pnpm build
   ```
   - Verify build completes successfully
   - Inspect Vite build output for warnings or errors
   - Compare bundle size to baseline (recorded in Slice 0):
     - Acceptable: ±5% variance
     - Investigate: 5-10% increase
     - Reject: >10% increase without justification
   - Compare build time to baseline: ±10% variance acceptable

3. Preview production build:
   ```bash
   pnpm preview
   ```
   - Navigate to all major routes (Types, Parts, Boxes, Shopping Lists, Kits)
   - Verify no console errors or warnings
   - Verify UI renders identically to dev server

4. Manual cross-browser testing (if possible):
   - Test in Chrome, Firefox, Safari (16.4+) if available
   - Verify no browser-specific console errors from tailwind-merge 3.x

5. Run unit tests to verify cn() utility still works after Playwright suite:
   ```bash
   pnpm test src/lib/utils.test.ts
   ```
   - All unit tests must pass (custom utility merging validated)

6. Document results:
   - Capture Playwright test summary (pass/fail counts, duration vs. Slice 0 baseline)
   - Record build size comparison (before/after from Slice 0, percent change)
   - Record unit test results (pass/fail, any custom utility merging issues)
   - Note any console warnings or errors observed and whether they are expected
   - List any code changes made in Slice 2 (lint/type fixes) and Slice 3 (extendTailwindMerge config if needed)

**Dependencies:** Slices 1-3 must be complete; all code changes finalized

### Recommended approach

Complete all slices sequentially in a single git branch:
1. Slice 0: Record baselines (commit optional, can be in PR description)
2. Slice 1: Update dependencies and verify configuration (commit after completion)
3. Slice 2: Fix any lint/type errors (commit after completion)
4. Slice 3: Create unit tests and test tailwind-merge compatibility (commit after completion)
5. Slice 4: Run full test suite and validate (commit after completion)

Combine all commits into a single pull request to avoid intermediate states. If Slice 0 baseline was not committed, include it in PR description for reviewers.

## 15) Risks & Open Questions

### Risks

**Risk: ESLint configuration incompatibility**

- **Impact**: Linting fails to run, blocking development and CI; may require emergency rollback or config refactoring
- **Mitigation**: Research shows the plugin's `recommended` preset remains compatible with flat config in 7.0.0+; verify config structure immediately after upgrade in Slice 1; keep v5.2.0 lockfile for quick rollback
- **Likelihood**: Low (breaking change was removal of `flat/recommended` preset, which we don't use)

**Risk: New strict ESLint rules require extensive code changes**

- **Impact**: Dozens of components fail lint due to newly-detected hook violations; significant refactoring time required
- **Mitigation**: Review each error individually; prioritize fixing legitimate violations; use eslint-disable with justification for false positives; defer non-critical fixes to follow-up PR if necessary
- **Likelihood**: Low (we're using React 19 correctly per recent upgrade; 5.2.0 already enforced Rules of Hooks strictly)

**Risk: tailwind-merge 3.x breaks class merging with TailwindCSS v4**

- **Impact**: UI components render with incorrect styles (duplicate classes, wrong precedence); visual regressions across the app
- **Mitigation**: Comprehensive manual testing in Slice 3; Playwright suite provides regression coverage; tailwind-merge 3.0.0 was specifically designed for TailwindCSS v4 compatibility
- **Likelihood**: Low (tailwind-merge 3.x explicitly supports v4; recent TailwindCSS v4 upgrade already updated class syntax)

**Risk: @types/node 24.x introduces breaking type changes**

- **Impact**: Type errors block build; requires code refactoring to satisfy new type signatures
- **Mitigation**: Review type errors in Slice 2; Node.js 18+ LTS is stable and type changes are rare; most breaking changes affect Node.js 24-specific APIs which we don't use
- **Likelihood**: Low (project uses standard Node.js APIs; @types/node typically maintains backward compatibility)

**Risk: Bundle size regression from updated dependencies**

- **Impact**: Larger JavaScript bundle increases page load time; hurts performance metrics
- **Mitigation**: Compare bundle sizes in Slice 4; tailwind-merge 3.x may be smaller than 2.x due to v4 optimizations; investigate and optimize if size increases >5%
- **Likelihood**: Low (modern build tools tree-shake effectively; tailwind-merge 3.x is designed for efficiency)

### Resolved Research Questions

**Question: Does tailwind-merge 3.x support all custom utilities defined in src/index.css?**

- **Research findings**: tailwind-merge 3.0+ supports TailwindCSS v4 (v4.0 to v4.1). However, **there is a known issue**: tailwind-merge can sometimes remove or not recognize custom utility classes generated with TailwindCSS v4's `@utility` directive. This is a documented limitation.
- **Impact on this project**: The project has migrated custom utilities to `@utility` directive (`.ai-glare`, `.shadow-soft`, `.shadow-medium`, `.shadow-strong`, `.category-*` in src/index.css). These utilities may not merge correctly with standard TailwindCSS utilities.
- **Resolution**: MANDATORY testing in Slice 3 to verify custom utility merging behavior. If merging fails, may need to use `extendTailwindMerge()` to define custom class groups, or accept the limitation and document expected behavior.
- **Testing priority**: HIGH - Must verify `.ai-glare`, `.shadow-soft/medium/strong`, and `.category-*` utilities merge correctly with standard utilities in Button and other components

**Question: Are there any React 19-specific hook patterns that react-hooks 7.0.1 handles differently?**

- **Research findings**: eslint-plugin-react-hooks 7.0 includes updated rules for React 19 patterns:
  - New rule for `useEffectEvent` hook (React 19.2) - Effect Events should not be declared in dependency arrays; the plugin now detects this correctly
  - `dispatch` from `useActionState` is now recognized as stable and won't trigger exhaustive-deps warnings
  - Stricter rules to catch bugs and anti-patterns (e.g., updating state in useEffect hooks)
  - No breaking changes for existing React 19 patterns
- **Impact on this project**: Low - The project is already using React 19.1.1 correctly. The plugin update provides better detection of edge cases but shouldn't flag existing code unless there are latent bugs (which would be good to catch).
- **Resolution**: Review any new lint errors in Slice 2; treat them as improvements rather than regressions. The project doesn't use `useEffectEvent` yet, so no impact from that rule.

**Decision: Use `recommended` preset, not `recommended-latest`**

- **Rationale**: The `recommended-latest` preset includes experimental React Compiler rules that are bleeding-edge and may have false positives. For a stable dependency upgrade, staying with `recommended` preset provides proven rules without introducing experimental linting behavior.
- **React Compiler status**: React Compiler is still experimental and not in widespread production use. Adopting compiler-specific rules is premature until the compiler itself is stable.
- **Out of scope**: Evaluating React Compiler adoption should be a separate feature plan with dedicated research and testing. This upgrade focuses on maintaining current functionality with updated dependencies.

**Question: Does tailwind-merge 3.x configuration need updates for TailwindCSS v4 CSS-based config?**

- **Research findings**: tailwind-merge 3.0+ is designed for TailwindCSS v4 and automatically supports the `@theme` directive approach. Custom breakpoints defined via `--breakpoint-*` CSS variables (like the project's `3xl: 1760px`) should work without configuration because tailwind-merge 3.x reads the same theme variables that TailwindCSS v4 uses.
- **Configuration requirement**: Generally not needed for standard theme extensions. However, if custom theme *namespaces* were added (non-standard variable prefixes), `extendTailwindMerge()` would be required.
- **Impact on this project**: The project uses a standard custom breakpoint (`--breakpoint-3xl: 1760px` in src/index.css via `@theme`). This follows TailwindCSS v4 conventions and should be automatically recognized by tailwind-merge 3.x.
- **Resolution**: Test `3xl:` breakpoint classes in Slice 3 (e.g., `cn('text-sm', '3xl:text-lg')`). If merging fails, configuration may be needed, but this is unlikely given standard usage.
- **Testing priority**: MEDIUM - Custom breakpoint is used but follows standard conventions

## 16) Confidence

**Confidence: High with Known Limitation** — All three dependency upgrades are well-researched with clear breaking changes documented. The eslint-plugin-react-hooks 7.0.0 breaking change (config structure simplification) does not affect our flat config usage of `configs.recommended.rules`. The plugin's React 19 improvements (useEffectEvent, useActionState dispatch) are beneficial additions. The @types/node upgrade is low-risk (types only) and the project uses standard Node.js APIs. The tailwind-merge 3.0.0 upgrade is well-timed after the TailwindCSS v4 migration and explicitly supports v4 syntax; however, **research revealed a known limitation**: tailwind-merge 3.x may not properly recognize custom utilities defined with TailwindCSS v4's `@utility` directive. This affects the project's custom utilities (`.ai-glare`, `.shadow-soft/medium/strong`, `.category-*`). Mitigation: Slice 3 includes mandatory testing of custom utility merging with fallback options (use `extendTailwindMerge()` for configuration, or accept limitation and document behavior). The plan includes comprehensive validation: immediate config verification (Slice 1), error fixing (Slice 2), focused custom utility testing with DevTools inspection (Slice 3), and full Playwright suite regression testing (Slice 4). The existing Playwright suite provides excellent coverage (38+ specs) and will catch any merging regressions or functional issues. The incremental slice approach allows for early detection of the custom utility limitation and quick mitigation or rollback if necessary. Bundle size and build performance risks are low given the modern toolchain. Overall, this is a well-structured upgrade with explicit handling of the primary risk factor (custom utility merging).
