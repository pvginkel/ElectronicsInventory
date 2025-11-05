# TailwindCSS v4 Upgrade Plan

## 0) Research Log & Findings

**Package Investigation**
- Current TailwindCSS: `3.4.17` (from package.json line 42)
- Current autoprefixer: `10.4.21` (from package.json line 33)
- Current PostCSS: `8.5.6` (from package.json line 38)
- Target TailwindCSS: `4.1.16` (latest stable as of 2025-11)
- Migration approach: `@tailwindcss/vite` plugin with CSS-based configuration

**Configuration Files**
- `/work/frontend/tailwind.config.js` — Uses CSS custom properties via HSL color scheme, custom `3xl` breakpoint, darkMode via media query, no plugins
- `/work/frontend/postcss.config.js` — Standard PostCSS config with `tailwindcss` and `autoprefixer` plugins
- `/work/frontend/src/index.css` — Uses `@tailwind` directives, extensive `@layer base` and `@layer components` customization, `@apply` directives
- `/work/frontend/vite.config.ts` — Standard Vite + React setup; no TailwindCSS-specific Vite plugin currently

**CSS Customization Audit**
The project makes heavy use of TailwindCSS layer system (src/index.css:5-216):
- `@layer base` (lines 5-100, 102-110) for CSS custom properties and global element styles
- `@layer components` (lines 93-98, 112-215) for custom utility classes (`.transition-smooth`, `.shadow-soft`, `.category-*`, `.ai-glare`)
- `@apply` directives (lines 104, 107) in base layer for universal border/background
- Custom keyframe animation (`@keyframes glare-sweep` at line 184)

**Utility Class Usage Patterns**
Found 15+ files using affected utilities:
- `shadow-*` classes across multiple components (button.tsx, card components)
- `rounded-*` for border radius
- `ring-*` for focus states
- `outline-none` for accessibility-aware outline removal
- No deprecated utilities like `bg-opacity-*` or `flex-shrink-*` detected

**Component Architecture**
- Domain-driven component structure (`src/components/{domain}/`)
- Shared UI components in `src/components/ui/` including Button, which uses Radix UI Slot and class-variance-authority
- CSS custom properties drive theming (HSL values in CSS variables)
- Dark mode via `@media (prefers-color-scheme: dark)` at line 57

**Testing Requirements**
Per CLAUDE.md and docs/contribute/testing/:
- Playwright suite runs against real backend with managed services
- UI changes must ship with matching instrumentation and test coverage
- Tests use `data-testid` attributes and test-event signals
- Visual regressions must be prevented; no arbitrary waits allowed
- `pnpm check` (lint + type-check) and `pnpm playwright test` must pass before delivery

**Breaking Changes Identified**
From TailwindCSS v4 upgrade guide:
1. Configuration migrates from `tailwind.config.js` to CSS-based config
2. `@tailwind` directives replaced with `@import "tailwindcss"`
3. `autoprefixer` no longer needed (built-in)
4. `@layer` syntax may need migration to `@utility` API for custom utilities
5. `@apply` directive still supported but usage patterns may need review
6. Shadow scale renames: `shadow-sm` → `shadow-xs`, `shadow` → `shadow-sm`
7. Ring default width changes from 3px to 1px
8. `outline-none` renamed to `outline-hidden`
9. Border color defaults to `currentColor` instead of `gray-200`
10. Arbitrary value syntax for CSS variables: `bg-[--brand-color]` → `bg-(--brand-color)`
11. Variant stacking order reverses: left-to-right instead of right-to-left
12. Browser requirement: Safari 16.4+, Chrome 111+, Firefox 128+

## 1) Intent & Scope

**User intent**

Upgrade the project's TailwindCSS dependency from v3.4.17 to the latest v4.x stable release (currently 4.1.16) while maintaining all existing visual styling, ensuring zero regressions in UI appearance, preserving the project's custom theming system, and keeping the Playwright test suite fully functional.

**Prompt quotes**

"upgrade TailwindCSS to the latest version"
"ensure the UI remains visually consistent"
"test suite and build process to verify nothing breaks"
"no visual regressions occur"

**In scope**

- Update `tailwindcss` package from 3.4.17 to 4.1.16
- Migrate configuration from `tailwind.config.js` to CSS-based config using `@theme` directive
- Replace `@tailwind` directives in `src/index.css` with v4-compatible imports
- Add `@tailwindcss/vite` plugin to Vite configuration
- Remove `autoprefixer` dependency (now built into TailwindCSS v4)
- Audit and update affected utility classes (`shadow-*`, `ring-*`, `outline-none`, arbitrary values)
- Migrate `@layer components` custom utilities to v4-compatible patterns
- Test all UI components for visual consistency
- Verify Playwright suite passes without modification to selectors or test logic
- Update build and development scripts if needed
- Document any new patterns or breaking changes for future contributors

**Out of scope**

- Refactoring existing component structure or adding new features
- Changing the project's dark mode implementation (remains `media` query-based)
- Modifying the CSS custom property theming system beyond what's required for v4 compatibility
- Updating unrelated dependencies (React, Vite, Radix UI, etc.)
- Adding new TailwindCSS v4 features not present in v3 (unless needed for migration)
- Changing test instrumentation or test-event taxonomy (unless selector updates require it)

**Assumptions / constraints**

- The project must support modern browsers (Safari 16.4+, Chrome 111+, Firefox 128+) per TailwindCSS v4 requirements; no legacy browser support needed
- Visual design must remain pixel-perfect; any perceived changes must be investigated and corrected
- Existing CSS custom properties for theming are non-negotiable and must continue working
- Playwright tests depend on stable class names for `data-testid` attributes, not Tailwind utility classes, so test selectors should remain unaffected
- The upgrade must complete in a single deliverable; no incremental rollout with feature flags
- Build performance may improve with v4; any regressions are unacceptable
- The migration tool `npx @tailwindcss/upgrade@next` may automate most changes, but manual review is mandatory

## 2) Affected Areas & File Map

### Configuration Files

- **Area**: `/work/frontend/package.json`
- **Why**: Update `tailwindcss` from `^3.4.0` to `^4.1.16`, add `@tailwindcss/vite`, remove `autoprefixer` (built into v4)
- **Evidence**: package.json:42 (`"tailwindcss": "^3.4.0"`), package.json:33 (`"autoprefixer": "^10.4.0"`)

- **Area**: `/work/frontend/tailwind.config.js`
- **Why**: Delete this file and migrate configuration to CSS using `@theme` directive
- **Evidence**: tailwind.config.js:1-56 (entire configuration including theme extensions, custom breakpoint `3xl`, darkMode setting)

- **Area**: `/work/frontend/postcss.config.js`
- **Why**: Remove `tailwindcss` plugin entry (Vite plugin handles processing); remove `autoprefixer`
- **Evidence**: postcss.config.js:1-6 (current PostCSS config with `tailwindcss: {}` and `autoprefixer: {}`)

- **Area**: `/work/frontend/vite.config.ts`
- **Why**: Add `@tailwindcss/vite` plugin to `plugins` array for v4 processing
- **Evidence**: vite.config.ts:89 (current plugins array: `[react(), versionPlugin(), backendProxyStatusPlugin(backendProxyTarget)]`)

### CSS Files

- **Area**: `/work/frontend/src/index.css`
- **Why**: Replace `@tailwind` directives with `@import "tailwindcss"`, add `@theme` directive for CSS-based config (colors, custom breakpoint), migrate `@layer components` to v4-compatible syntax, verify `@apply` directives remain compatible
- **Evidence**: src/index.css:1-3 (`@tailwind` directives), src/index.css:5 (`@layer base`), src/index.css:93 and 112 (`@layer components`), src/index.css:104, 107 (`@apply border-border`, `@apply bg-background text-foreground`)

### Component Files (Utility Class Updates)

- **Area**: `/work/frontend/src/components/ui/button.tsx`
- **Why**: Update `ring-*` focus utilities if default ring width changed, verify `rounded-md` remains valid
- **Evidence**: button.tsx:36 (`rounded-md`, `focus-visible:ring-2 focus-visible:ring-ring`)

- **Area**: `/work/frontend/src/components/layout/list-screen-layout.tsx`
- **Why**: Audit for `shadow-*`, `rounded-*`, `ring-*` usage
- **Evidence**: Grep results show file contains affected utilities

- **Area**: `/work/frontend/src/components/boxes/location-container.tsx`
- **Why**: Audit for `shadow-*`, `rounded-*`, `ring-*` usage
- **Evidence**: Grep results show file contains affected utilities

- **Area**: `/work/frontend/src/components/boxes/part-location-card.tsx`
- **Why**: Audit for `shadow-*`, `rounded-*`, `ring-*` usage
- **Evidence**: Grep results show file contains affected utilities

- **Area**: `/work/frontend/src/components/parts/part-details.tsx`
- **Why**: Audit for `shadow-*`, `rounded-*`, `ring-*` usage
- **Evidence**: Grep results show file contains affected utilities

- **Area**: `/work/frontend/src/components/ui/debounced-search-input.tsx`
- **Why**: Replace `outline-none` with `outline-hidden`, audit for `shadow-*`, `rounded-*`, `ring-*` usage
- **Evidence**: Grep results show file contains affected utilities

- **Area**: All components using `outline-none` (30+ files)
- **Why**: Replace `outline-none` with `outline-hidden` to preserve v3 accessibility behavior (invisible outline for forced colors mode)
- **Evidence**: TailwindCSS v4 breaking change (line 56), shell Grep shows 30 occurrences across components including box-selector.tsx, mounting-type-selector.tsx, and focus-visible patterns

- **Area**: `/work/frontend/src/components/parts/part-card.tsx`
- **Why**: Audit for `shadow-*`, `rounded-*`, `ring-*` usage
- **Evidence**: Grep results show file contains affected utilities

- **Area**: `/work/frontend/src/components/shopping-lists/ready/seller-group-card.tsx`
- **Why**: Audit for `shadow-*`, `rounded-*`, `ring-*` usage
- **Evidence**: Grep results show file contains affected utilities

- **Area**: `/work/frontend/src/components/types/type-list.tsx`
- **Why**: Audit for `shadow-*`, `rounded-*`, `ring-*` usage
- **Evidence**: Grep results show file contains affected utilities

- **Area**: `/work/frontend/src/components/ui/membership-indicator.tsx`
- **Why**: Audit for `shadow-*`, `rounded-*`, `ring-*` usage
- **Evidence**: Grep results show file contains affected utilities

- **Area**: `/work/frontend/src/components/ui/quantity-badge.tsx`
- **Why**: Audit for `shadow-*`, `rounded-*`, `ring-*` usage
- **Evidence**: Grep results show file contains affected utilities

- **Area**: `/work/frontend/src/components/parts/part-inline-summary.tsx`
- **Why**: Audit for `shadow-*`, `rounded-*`, `ring-*` usage
- **Evidence**: Grep results show file contains affected utilities

- **Area**: `/work/frontend/src/components/shopping-lists/concept-table.tsx`
- **Why**: Audit for `shadow-*`, `rounded-*`, `ring-*` usage
- **Evidence**: Grep results show file contains affected utilities

- **Area**: `/work/frontend/src/components/kits/kit-pick-list-panel.tsx`
- **Why**: Audit for `shadow-*`, `rounded-*`, `ring-*` usage
- **Evidence**: Grep results show file contains affected utilities

### Additional Components (Exhaustive Audit)

- **Area**: All `*.tsx` files in `src/components/` (full tree scan)
- **Why**: Comprehensive search for any remaining usage of affected utilities (`shadow-sm`, `shadow`, `blur-*`, `rounded-*`, `ring-*`, `outline-none`, arbitrary values with brackets, stacked variants)
- **Evidence**: Domain-driven component structure per docs/contribute/architecture/application_overview.md:16-28

## 3) Data Model / Contracts

**No data model changes**

This upgrade is purely a build tooling and styling framework change. No API contracts, TanStack Query cache keys, or component prop interfaces are affected. CSS custom properties remain the theming contract; their HSL values and variable names (e.g., `--background`, `--primary`, `--border`) are unchanged.

## 4) API / Integration Surface

**No API surface changes**

The TailwindCSS upgrade does not touch any backend endpoints, generated hooks, or event emitters. The frontend continues to use the same API client, TanStack Query hooks, and instrumentation helpers. This is a zero-impact change for the data layer.

## 5) Algorithms & UI Flows

**Build-time transformation flow**

1. Developer runs `pnpm dev` or `pnpm build`
2. Vite invokes `@tailwindcss/vite` plugin to process `src/index.css`
3. TailwindCSS v4 parses the new `@import "tailwindcss"` directive
4. TailwindCSS v4 scans `content` paths (unchanged: `"./index.html"`, `"./src/**/*.{js,ts,jsx,tsx}"`)
5. TailwindCSS v4 loads CSS-based configuration from `@theme` directive in `src/index.css`
6. TailwindCSS v4 generates utility classes based on detected usage in components
7. Custom `@layer` declarations and `@apply` directives are processed
8. Compiled CSS is injected into the bundle
9. Browser renders the UI with identical visual output

**No runtime flow changes**

Component render logic, React hooks, TanStack Router navigation, and TanStack Query data fetching remain unaffected. The only change is the generated CSS that styles the components.

## 6) Derived State & Invariants

**No derived state changes**

TailwindCSS is a build-time tool; it does not introduce runtime state. The project's existing derived state (e.g., filtered lists, computed form validation, optimistic updates) is unaffected.

**Invariant: Visual consistency**

- Source: Compiled CSS must produce pixel-identical rendering for all existing components
- Guards: Side-by-side visual comparison of development server before/after upgrade, Playwright screenshot tests (if available), manual QA of key screens
- Invariant: For any given component with the same HTML class attributes, the computed CSS rules must produce the same visual output in v4 as they did in v3

**Invariant: Build reproducibility**

- Source: TailwindCSS v4 must generate the same set of utility classes for the same `src/` content
- Guards: Build output size comparison, generated CSS diff review, cache busting on first build
- Invariant: Running `pnpm build` multiple times should produce identical CSS output (deterministic builds)

## 7) State Consistency & Async Coordination

**No async coordination changes**

TailwindCSS operates at build time and does not interact with TanStack Query caches, React state, or instrumentation hooks. The upgrade does not introduce new async behavior.

**Build-time coordination**

- Source of truth: TailwindCSS configuration from CSS `@theme` directive in `src/index.css`
- Coordination: Vite build pipeline invokes `@tailwindcss/vite` plugin before other CSS processing
- Async safeguards: None needed; build is synchronous
- Instrumentation: No test-event changes; Playwright selectors remain based on `data-testid` attributes, not Tailwind utility classes

## 8) Errors & Edge Cases

### Case: Migration tool fails or produces incorrect output

- **Failure**: Running `npx @tailwindcss/upgrade@next` errors or generates broken CSS
- **Surface**: Build process; developer console during `pnpm dev` or `pnpm build`
- **Handling**: Manual migration following official docs; review generated diff carefully; test incrementally
- **Guardrails**: Commit migration output as separate step; run `pnpm check` and `pnpm playwright test` before merging

### Case: CSS custom properties conflict with v4 defaults

- **Failure**: TailwindCSS v4 introduces new default CSS variables that collide with project's custom `--*` properties
- **Surface**: src/index.css:5-91 (root-level CSS variables)
- **Handling**: Prefix custom variables if collision detected; verify theme colors render correctly
- **Guardrails**: Visual inspection of all theme colors in both light and dark modes

### Case: Custom `@layer components` utilities require `@utility` migration (KNOWN BREAKING CHANGE)

- **Failure**: `.transition-smooth`, `.shadow-soft`, `.shadow-medium`, `.shadow-strong`, `.category-*`, `.ai-glare` classes will not compile or work with `@apply`/variants without `@utility` wrapper
- **Surface**: src/index.css:112-215 (custom component utilities)
- **Handling**: REQUIRED migration in Slice 2 - wrap all custom utilities in `@utility` directive to work with v4's native cascade layers. This is not optional; v4 no longer hijacks `@layer` at-rule.
- **Guardrails**: Manual testing of components using each custom utility class; verify animations, shadows, and borders render correctly

### Case: `@apply` in `@layer base` may not resolve utilities (KNOWN RISK)

- **Failure**: `@apply border-border` or `@apply bg-background text-foreground` produce build errors or styles don't apply because base layer cannot reference utilities layer
- **Surface**: src/index.css:104, 107
- **Handling**: Proactive verification in Slice 2 - check browser DevTools computed styles after initial migration. If broken, refactor to direct CSS: `border-color: hsl(var(--border))` instead of `@apply border-border`
- **Guardrails**: Ensure universal border and background styles still apply to all elements; verify in both light and dark modes

### Case: Dark mode styling broken after upgrade

- **Failure**: `@media (prefers-color-scheme: dark)` rules do not apply or CSS variables are incorrect
- **Surface**: src/index.css:57-98 (dark mode block)
- **Handling**: Verify v4 respects `darkMode: "media"` configuration; test in browser with dark mode preference toggled
- **Guardrails**: Manual dark mode toggle testing on all major screens

### Case: Playwright tests fail due to class name changes or console errors

- **Failure**: If utility class names are used in test selectors, they may break; or CSS warnings trigger console error policy failures
- **Surface**: tests/e2e/ (all Playwright specs)
- **Handling**: Verify tests use `data-testid` attributes, not Tailwind classes; update selectors if needed. For console errors, use `expectConsoleError(page, /tailwindcss/i)` helper to allow expected CSS warnings during upgrade.
- **Guardrails**: Run full Playwright suite in Slice 4; per docs/contribute/testing/selector_patterns.md, tests must rely on stable data attributes. Per project's console error policy, any console.error causes test failure unless explicitly expected.

### Case: Build performance regression in v4

- **Failure**: `pnpm build` takes longer than v3 or dev server startup slows down
- **Surface**: Vite build pipeline
- **Handling**: Profile build times before/after; switch to `@tailwindcss/vite` plugin if PostCSS plugin is slow
- **Guardrails**: Document build times in plan review; rollback if regression is severe

### Case: Production bundle size increases

- **Failure**: Compiled CSS is larger in v4, increasing page load time
- **Surface**: dist/ output, network waterfall in browser DevTools
- **Handling**: Audit generated CSS for unused utilities; verify tree-shaking works; compare before/after bundle sizes
- **Guardrails**: vite.config.ts:140 (`chunkSizeWarningLimit: 2000`) will alert if bundle exceeds threshold

### Case: Browser compatibility issues

- **Failure**: Safari 16.3 or older browsers cannot render v4-generated CSS (due to `@property`, `color-mix()` usage)
- **Surface**: Browser console errors or broken styling in older browsers
- **Handling**: Document browser requirements; confirm project targets only modern browsers
- **Guardrails**: Test in Safari 16.4+, Chrome 111+, Firefox 128+; accept that older browsers are unsupported

## 9) Observability / Instrumentation

**No instrumentation changes needed**

TailwindCSS operates at build time and does not affect test-event emission. The project's existing instrumentation hooks (`useListLoadingInstrumentation`, `trackForm*`, test-event bridge in Playwright) remain untouched.

**Build-time signals**

- **Signal**: Vite build logs, PostCSS warnings
- **Type**: Console output during `pnpm dev` or `pnpm build`
- **Trigger**: TailwindCSS configuration errors, deprecated utility usage, build failures
- **Consumer**: Developer console; CI build logs
- **Evidence**: Vite build pipeline processes PostCSS per vite.config.ts

**Visual regression signals**

- **Signal**: Playwright test failures (if screenshot assertions exist), manual QA reports
- **Type**: Test failure or visual diff
- **Trigger**: CSS output changes causing UI to render differently
- **Consumer**: CI pipeline, QA reviewer
- **Evidence**: Playwright suite per docs/contribute/testing/playwright_developer_guide.md

## 10) Lifecycle & Background Work

**Build-time lifecycle only**

TailwindCSS has no runtime lifecycle hooks, effects, or subscriptions. The only lifecycle concern is the Vite build pipeline:

- **Hook / effect**: `@tailwindcss/vite` plugin
- **Trigger cadence**: On every dev server start, on every file change (HMR), on production build
- **Responsibilities**: Parse CSS, scan HTML/JSX for class usage, generate utility CSS, inject into bundle
- **Cleanup**: None needed; Vite manages plugin lifecycle
- **Evidence**: vite.config.ts:88-89 (Vite `defineConfig` with plugins array)

**No HMR concerns**

TailwindCSS v4 with Vite plugin should support HMR out of the box. If HMR breaks after upgrade, verify Vite plugin is correctly configured and positioned in the plugins array.

## 11) Security & Permissions

**No security impact**

TailwindCSS is a build-time dependency with no runtime code execution. The upgrade does not introduce new attack surfaces, does not process user input, and does not communicate with external services.

**Supply chain consideration**

- **Concern**: Ensure `tailwindcss@4.1.16` and `@tailwindcss/vite` are from official npm registry
- **Touchpoints**: package.json, pnpm-lock.yaml
- **Mitigation**: Verify package checksums, review pnpm audit output, confirm package publisher is `@tailwindlabs`
- **Residual risk**: Low; TailwindCSS is a widely-used, well-audited package

## 12) UX / UI Impact

**Zero intended UX changes**

The upgrade must be invisible to end users. All visual styling, interactions, and layouts remain identical.

**Potential unintended impacts**

- **Entry point**: All routes and components
- **Change**: If utility classes render differently (e.g., `shadow-sm` becomes lighter, `ring-*` width changes), users may perceive styling differences
- **User interaction**: No behavioral changes; only visual appearance could differ
- **Dependencies**: TailwindCSS v4 CSS generation, browser CSS rendering
- **Evidence**: Per CLAUDE.md and docs/contribute/testing/index.md, visual consistency is mandatory; any regression must be caught in testing phase

## 13) Deterministic Test Plan

### Surface: Development server startup

**Scenarios:**
- **Given** `tailwindcss@4.1.16` is installed, **When** running `pnpm dev`, **Then** Vite starts without errors and CSS compiles successfully
- **Given** CSS is compiled, **When** navigating to `http://localhost:3000`, **Then** the app renders with correct styling in both light and dark modes

**Instrumentation / hooks:** Vite console output, browser DevTools (Network tab, Computed styles)

**Gaps:** None

**Evidence:** Standard development workflow per docs/contribute/getting_started.md

### Surface: Production build

**Scenarios:**
- **Given** `tailwindcss@4.1.16` is installed, **When** running `pnpm build`, **Then** the build completes without errors
- **Given** build succeeds, **When** checking `dist/` output, **Then** generated CSS file exists and is reasonably sized
- **Given** production build, **When** running `pnpm preview`, **Then** the app renders identically to dev mode

**Instrumentation / hooks:** Vite build logs, `pnpm verify:build` script

**Gaps:** None

**Evidence:** Build process per package.json:9 (`"build": "pnpm generate:api:build && pnpm generate:routes && pnpm check && vite build && pnpm verify:build"`)

### Surface: Type checking and linting

**Scenarios:**
- **Given** upgrade is complete, **When** running `pnpm check`, **Then** no TypeScript errors and no ESLint errors
- **Given** `pnpm check` passes, **When** inspecting type definitions, **Then** no missing or broken types related to Tailwind

**Instrumentation / hooks:** TypeScript compiler output, ESLint output

**Gaps:** None

**Evidence:** Pre-merge validation per CLAUDE.md, package.json:10-12

### Surface: Playwright test suite

**Scenarios:**
- **Given** upgrade is complete, **When** running `pnpm playwright test`, **Then** all existing tests pass without modification
- **Given** tests are running, **When** Playwright captures screenshots (if enabled), **Then** no visual regressions detected
- **Given** test suite passes, **When** inspecting test-event logs, **Then** instrumentation remains unchanged

**Instrumentation / hooks:** Playwright test output, `data-testid` selectors, test-event bridge

**Gaps:** None (existing tests must pass; no new tests required for this upgrade)

**Evidence:** docs/contribute/testing/playwright_developer_guide.md:1-100, docs/contribute/testing/index.md:6 ("Mandatory coupling: Every UI slice ships with matching instrumentation and Playwright coverage")

### Surface: Manual visual QA

**Scenarios:**
- **Given** upgrade is deployed to dev environment, **When** QA reviews Types screen, Parts screen, Boxes screen, Shopping Lists screen, Kits screen, **Then** all UI elements render identically to pre-upgrade baseline
- **Given** dark mode is toggled, **When** reviewing same screens, **Then** dark mode colors and shadows remain consistent
- **Given** custom components are inspected (AI-assisted button, category badges, custom shadows), **When** comparing to screenshots, **Then** no visual regressions

**Instrumentation / hooks:** Manual inspection, side-by-side screenshot comparison

**Gaps:** No automated visual regression tests in current suite; manual QA is required

**Evidence:** Project's definition of done per CLAUDE.md

## 14) Implementation Slices

This upgrade is small enough to complete in a single slice, but can be broken down for incremental validation:

### Slice 1: Dependency updates and configuration migration

**Goal:** Install TailwindCSS v4, update configuration files, verify dev server starts

**Touches:**
- package.json (update `tailwindcss` to `^4.1.16`, add `@tailwindcss/vite`, remove `autoprefixer`)
- postcss.config.js (remove `tailwindcss` plugin entry, remove `autoprefixer`)
- vite.config.ts (add `@tailwindcss/vite` to plugins array with correct ordering)
- tailwind.config.js (delete this file)
- src/index.css (replace `@tailwind` directives with `@import "tailwindcss"`, add `@theme` directive with colors and custom breakpoint)

**Concrete steps:**
1. Update package.json dependencies
2. Update postcss.config.js (remove tailwindcss and autoprefixer plugins)
3. Update vite.config.ts with correct plugin ordering:
   ```typescript
   import tailwindcss from '@tailwindcss/vite'

   export default defineConfig({
     plugins: [
       tailwindcss(), // FIRST - process CSS before React JSX transformation
       react(),
       versionPlugin(),
       backendProxyStatusPlugin(backendProxyTarget)
     ],
     // ...
   })
   ```
   Rationale: TailwindCSS plugin must run first to ensure CSS processing happens before React JSX transformation, supporting optimal HMR for CSS changes

4. Migrate tailwind.config.js to CSS-based config:
   - Delete tailwind.config.js
   - In src/index.css, replace `@tailwind` directives with `@import "tailwindcss"`
   - Add `@theme` directive for custom breakpoint and theme extensions
   - Note: v4 auto-detects content paths; current paths (`./index.html`, `./src/**/*.{js,ts,jsx,tsx}`) should be covered

5. Verify content path auto-detection:
   - Run `pnpm dev` and inspect browser DevTools → Network → CSS file
   - Search compiled CSS for known utility classes: `shadow-sm`, `rounded-md`, `ring-2`, `bg-background`
   - Verify TanStack Router generated files (`src/routeTree.gen.ts`) are scanned
   - If classes are missing, investigate which files are not scanned and document override approach

6. Verify dev server starts successfully

**Dependencies:** None; this is the first step

### Slice 2: CSS layer and utility migration

**Goal:** Update custom `@layer components` utilities and `@apply` directives to v4-compatible syntax

**Touches:**
- src/index.css (migrate `@layer components` utilities to `@utility` API at lines 112-215; verify `@apply` directives at lines 104, 107 work in v4's native cascade layers)

**Concrete steps:**
1. Migrate custom utilities to `@utility` directive (REQUIRED in v4):
   - Wrap `.transition-smooth` in `@utility` directive:
     ```css
     @utility transition-smooth {
       @layer components {
         transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
       }
     }
     ```
   - Wrap `.shadow-soft`, `.shadow-medium`, `.shadow-strong` in `@utility` directives
   - Wrap `.category-*` utilities (resistor, capacitor, ic, etc.) in `@utility` directives
   - Wrap `.ai-glare` utility in `@utility` directive
   - Note: These utilities must use `@utility` wrapper to work with `@apply` and variants in v4's native cascade layer system

2. Verify `@apply` directives in `@layer base` (lines 104, 107):
   - After migrating `@tailwind` directives and `@theme`, start dev server
   - Open browser DevTools → Elements → Inspect `*` selector
   - Verify computed `border-color` matches `--border` CSS variable value
   - Inspect `body` selector
   - Verify computed `background-color` matches `--background` and `color` matches `--foreground`
   - If styles are missing, `@apply` in `@layer base` cannot reference utilities layer; refactor to direct CSS:
     ```css
     @layer base {
       * {
         border-color: hsl(var(--border));
       }
       body {
         background-color: hsl(var(--background));
         color: hsl(var(--foreground));
         font-feature-settings: "rlig" 1, "calt" 1;
       }
     }
     ```

**Dependencies:** Slice 1 must be complete and dev server must start

### Slice 3: Component utility class audit

**Goal:** Scan all components for affected utilities (`shadow-*`, `ring-*`, `outline-none`, arbitrary values) and update as needed

**Touches:**
- All components using `outline-none` (30+ files including debounced-search-input.tsx, box-selector.tsx, mounting-type-selector.tsx, button.tsx, etc.)
- src/components/ui/button.tsx (ring utilities at line 36)
- All 14+ components identified in Grep results (list-screen-layout, location-container, part-location-card, part-details, debounced-search-input, part-card, seller-group-card, type-list, membership-indicator, quantity-badge, part-inline-summary, concept-table, kit-pick-list-panel)
- Full scan of remaining `src/components/` tree for any additional usage

**Concrete steps:**
1. Replace `outline-none` with `outline-hidden` (CRITICAL for accessibility):
   - Use Grep to find all occurrences: `grep -r "outline-none" src/components --include="*.tsx"`
   - For each file (30+ total), replace `outline-none` with `outline-hidden` to preserve v3 behavior
   - Focus on focus-visible patterns: `focus-visible:outline-hidden focus-visible:ring-2`
   - Rationale: In v4, `outline-none` sets `outline-style: none` (true CSS none), while `outline-hidden` maintains v3 behavior (invisible for forced colors mode)
   - After replacement, test in browser with Windows High Contrast mode or forced colors emulation to verify accessibility

2. Audit shadow utilities for scale renames:
   - Search for `shadow-sm` → may need update to `shadow-xs` (verify in v4 docs)
   - Search for `shadow ` (base shadow class) → may need update to `shadow-sm`
   - Test custom `.shadow-soft`, `.shadow-medium`, `.shadow-strong` utilities render correctly

3. Audit ring utilities for default width changes:
   - Ring default width changed from 3px to 1px in v4
   - Verify `ring-2` and other ring utilities maintain expected appearance
   - Update if visual differences detected

**Dependencies:** Slice 2 must be complete; CSS must compile without errors

### Slice 4: Testing and validation

**Goal:** Run full test suite, perform manual QA, compare build output, document results

**Touches:**
- No code changes; validation only
- CI pipeline (run `pnpm check`)
- Playwright suite (run `pnpm playwright test`)
- Manual QA (visual comparison of key screens in light/dark modes)
- Build output comparison (bundle size, CSS file size)

**Concrete steps:**
1. Run full Playwright test suite: `pnpm playwright test`
   - If tests fail due to console errors (not functional failures), inspect error messages for TailwindCSS-related warnings
   - If errors are expected CSS deprecation warnings, update affected tests to use `expectConsoleError(page, /tailwindcss/i)` helper per project's console error policy
   - Document any expected console errors for future contributors

2. Run type checking and linting: `pnpm check`
   - Verify no TypeScript errors or ESLint errors

3. Run production build: `pnpm build`
   - Verify build completes successfully
   - Compare bundle size and CSS file size to v3 baseline (±20% tolerance)

4. Manual visual QA (comprehensive, both light and dark modes):
   - Capture before/after screenshots of all major screens: Types, Parts, Boxes, Shopping Lists, Kits
   - Perform side-by-side pixel comparison (use image diff tools if available)
   - Focus on high-risk areas: custom shadow utilities (`.shadow-soft/medium/strong`), focus rings (`ring-2`), category borders (`.category-*`), AI glare animation
   - Test in Windows High Contrast mode or forced colors emulation to verify `outline-hidden` accessibility
   - Document all detected visual differences and evaluate acceptability

**Dependencies:** Slices 1-3 must be complete; all code changes finalized

### Recommended approach

Complete all slices in a single pull request to avoid intermediate states where the app is partially migrated. Each slice should be validated locally before proceeding to the next.

## 15) Risks & Open Questions

### Risks

**Risk: Migration tool produces incorrect output**

- **Impact**: Manual review and fixes required, increasing implementation time
- **Mitigation**: Run migration tool in isolated branch, carefully review diff, test incrementally, consult official docs for ambiguous changes

**Risk: Custom CSS layers break in v4**

- **Impact**: Custom utilities (`.transition-smooth`, `.shadow-*`, `.category-*`, `.ai-glare`) may not compile or apply correctly
- **Mitigation**: Test custom utilities in isolation, migrate to `@utility` API if `@layer components` is deprecated, verify animations and shadows render correctly

**Risk: Visual regressions go undetected**

- **Impact**: Users see broken or inconsistent UI after deploy
- **Mitigation**: Side-by-side screenshot comparison, manual QA of all major screens in both light and dark modes, consider adding Playwright visual regression tests post-upgrade

**Risk: Build performance degrades**

- **Impact**: Slower development feedback loop, longer CI builds
- **Mitigation**: Profile build times before/after; Vite plugin should provide optimal performance, but may need Vite configuration tuning if issues arise

**Risk: Browser compatibility issues**

- **Impact**: Older browsers (Safari <16.4, Chrome <111, Firefox <128) may not render CSS correctly
- **Mitigation**: Document browser requirements, confirm project targets only modern browsers, test in supported browser versions

### Open Questions

**Decision: Use `@tailwindcss/vite` plugin**

- **Rationale**: Better build performance and HMR integration with Vite; cleaner configuration; recommended approach for Vite projects
- **Implementation**: Add `@tailwindcss/vite` to dependencies, add to Vite plugins array, remove PostCSS plugin configuration entirely

**Decision: Migrate to CSS-based configuration**

- **Rationale**: V4-native approach, simpler maintenance, no need for `@config` directive; aligns with modern TailwindCSS patterns
- **Implementation**: Delete `tailwind.config.js`, migrate theme extensions (colors via CSS variables) and custom breakpoint `3xl` to CSS `@theme` directive in `src/index.css`

**Decision: Radix UI and class-variance-authority compatibility**

- **Assessment**: Both libraries are framework-agnostic and work with any CSS framework; they do not depend on TailwindCSS internals
- **Verification plan**: Test all Radix-based components (Button, Dialog, Dropdown, Popover, Toast) during manual QA; these components use utility classes but don't rely on TailwindCSS version-specific features
- **Risk**: Low; Radix UI uses headless architecture and class-variance-authority only manages class composition

**Decision: Visual regression testing**

- **Approach**: Defer automated visual regression tests to separate feature plan; rely on comprehensive manual QA for this upgrade
- **Rationale**: Adding visual regression infrastructure would expand scope significantly; user will perform full manual review and decide if visual changes are acceptable
- **Manual QA plan**: User will perform full manual review of all screens in light and dark modes; any visual changes will be evaluated for acceptability

## 16) Confidence

**Confidence: High** — The TailwindCSS v4 migration is well-documented and the project's relatively clean usage of Tailwind (no deprecated utilities) reduces risk. All critical breaking changes are now explicitly addressed in implementation slices: (1) `@layer components` to `@utility` migration with concrete syntax examples (Slice 2), (2) `outline-none` to `outline-hidden` replacement across 30+ files (Slice 3), (3) `@apply` in `@layer base` proactive verification with fallback refactoring (Slice 2). Configuration decisions are finalized: Vite plugin with explicit ordering, CSS-based config via `@theme` directive, content path auto-detection with verification steps. The plan includes comprehensive testing: Playwright suite with console error policy handling, type checking, production build verification, and manual visual QA with accessibility testing. While the lack of automated visual regression tests increases reliance on manual QA, the detailed QA protocol in Slice 4 (side-by-side comparison, high-risk area focus, forced colors mode testing) provides adequate coverage. The migration tool may automate some changes, but all critical areas have explicit manual migration instructions. Browser compatibility and build performance are low-risk given the project's modern tech stack (Vite, React 19). Clear rollback options exist if issues arise. Overall, this is a well-structured upgrade plan with explicit handling of all known breaking changes.
