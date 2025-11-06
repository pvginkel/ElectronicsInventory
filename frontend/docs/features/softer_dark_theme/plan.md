# Soften Dark Theme — Frontend Technical Plan

## 0) Research Log & Findings

**Discovery Areas Searched:**
- `/work/frontend/src/index.css` — CSS custom properties defining light/dark color tokens
- `/work/frontend/src/components/ui/` — Reusable UI components with dark mode styling
- `/work/frontend/src/components/boxes/` — Domain components using explicit `dark:` classes
- `/work/frontend/src/hooks/use-box-locations.ts` — Hook generating dark mode styling classes
- `/work/frontend/docs/contribute/architecture/application_overview.md` — Architecture patterns
- `/work/frontend/docs/contribute/ui/tooltip_guidelines.md` — UI component conventions

**Key Findings:**

1. **Color System Architecture** (`src/index.css:37-127`)
   - Dark mode uses CSS custom properties defined in `@media (prefers-color-scheme: dark)` block
   - All colors use HSL format: `--background: 222.2 84% 4.9%` (hue, saturation, lightness)
   - System automatically switches based on OS preference; no manual toggle exists
   - TailwindCSS v4 maps these variables via `@theme` block to utility classes

2. **Current Dark Theme Characteristics** (`src/index.css:90-127`)
   - Background: `222.2 84% 4.9%` — very dark, highly saturated navy blue (harsh)
   - Foreground: `210 40% 98%` — near-white text creating high contrast
   - Accent colors use saturated -900 shades (emerald-900, amber-900, blue-900) with -300 text
   - Border/input colors: `217.2 32.6% 17.5%` — dark blue-grey with moderate saturation

3. **Hardcoded Dark Classes** (multiple files)
   - `src/components/ui/icon-badge.tsx:14-31` — Uses `dark:bg-emerald-900 dark:text-emerald-300` for success variant
   - `src/hooks/use-box-locations.ts:43` — Generates `dark:bg-emerald-950 dark:hover:bg-emerald-900` for occupied locations
   - `src/components/boxes/location-item.tsx:47,53` — Uses `dark:text-emerald-300` and `dark:text-blue-400`
   - These hardcoded values bypass the CSS variable system and create inconsistent harshness

4. **No Instrumentation for Theme Changes**
   - No test events emitted for theme-related state changes (system-driven, no UI toggle)
   - No Playwright specs testing dark mode appearance
   - Testing would require visual regression or accessibility contrast checks

**Conflicts Resolved:**
- Decided to maintain system preference detection rather than adding manual toggle
- Will update both CSS variables AND hardcoded `dark:` classes for consistency
- Will preserve semantic color relationships (success=green, error=amber) while softening intensity

---

## 1) Intent & Scope

**User intent**

Make the dark theme less harsh and more comfortable for extended use by reducing color saturation, lowering contrast, and softening borders. The current dark theme uses highly saturated navy backgrounds with intense accent colors, creating visual strain.

**Prompt quotes**

"I find the dark theme quite harsh. Can you write a plan for me to make this a bit softer?"

**In scope**

- Adjust HSL values in `src/index.css` dark mode block to reduce saturation and increase lightness
- Update background colors from highly saturated navy (`222.2 84% 4.9%`) to desaturated grey-blue
- Soften accent colors (success, warning, info, destructive) by reducing saturation and adjusting lightness
- Update hardcoded `dark:` classes in components to use softer palette values
- Ensure text remains readable (WCAG AA contrast minimum: 4.5:1 for body text, 3:1 for large text)
- Preserve semantic color meanings (green=success, amber=warning, red=destructive, blue=info)
- Update shadows to be less pronounced in dark mode
- Soften electronics category colors (`--electronics-*` tokens) to match the new palette for visual consistency

**Out of scope**

- Adding manual theme toggle or theme picker UI
- Creating new color tokens or semantic categories
- Changing light mode colors
- Altering component layout or spacing
- Adding Playwright visual regression tests (manual verification only)
- Changing the system preference detection mechanism

**Assumptions / constraints**

- Users continue to rely on OS-level dark mode preference
- HSL color format remains (hue, saturation %, lightness %)
- TailwindCSS v4 theme mapping stays unchanged
- No breaking changes to existing component APIs
- Color accessibility (WCAG AA contrast) must be maintained
- Softness comes from desaturation and reduced contrast, not color hue changes

---

## 2) Affected Areas & File Map

### Color Token Definitions

- **Area:** CSS custom properties — dark mode block
- **Why:** Define the base color palette that drives all UI theming; must adjust saturation/lightness values
- **Evidence:** `src/index.css:90-127` — `@media (prefers-color-scheme: dark) { :root { --background: 222.2 84% 4.9%; ... } }`

### Component-Level Dark Classes

- **Area:** IconBadge UI component
- **Why:** Uses hardcoded `dark:bg-emerald-900 dark:text-emerald-300` that create harsh contrast
- **Evidence:** `src/components/ui/icon-badge.tsx:14-31` — `VARIANT_CLASSES = { success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300', ... }`

- **Area:** Box locations hook
- **Why:** Generates inline dark mode classes for occupied/empty locations with `emerald-950` backgrounds
- **Evidence:** `src/hooks/use-box-locations.ts:42-44` — `const stylingClasses = isOccupied ? '... dark:border-emerald-800 dark:bg-emerald-950 dark:hover:bg-emerald-900' : '...'`

- **Area:** Location item component
- **Why:** Uses `dark:text-emerald-300` and `dark:text-blue-400` for text colors
- **Evidence:** `src/components/boxes/location-item.tsx:47,53` — `className="... dark:text-emerald-300"` and `className="... dark:text-blue-400"`

### Shadow Definitions

- **Area:** CSS custom properties — shadow tokens
- **Why:** Dark mode shadows use `rgb(0 0 0 / 0.3)` which may be too harsh; soften opacity
- **Evidence:** `src/index.css:123-125` — `--shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.3); ...`

---

## 3) Data Model / Contracts

No data model or API contract changes. This feature only adjusts CSS values and component styling classes.

- **Entity / contract:** N/A
- **Shape:** N/A
- **Mapping:** N/A
- **Evidence:** N/A

---

## 4) API / Integration Surface

No API calls or TanStack Query integration. Theme changes are CSS-only and detected via browser media query.

- **Surface:** N/A
- **Inputs:** N/A
- **Outputs:** N/A
- **Errors:** N/A
- **Evidence:** N/A

---

## 5) Algorithms & UI Flows

**Flow:** Dark mode detection and application

**Steps:**
1. Browser evaluates `@media (prefers-color-scheme: dark)` based on OS settings
2. If true, CSS applies dark mode custom properties from `src/index.css:90-127`
3. TailwindCSS utilities (e.g., `bg-background`, `text-foreground`) resolve to HSL values from `--background`, `--foreground` variables
4. Components with explicit `dark:` classes apply those overrides on top of base theme
5. User sees updated colors immediately without page reload (CSS cascade)

**States / transitions:**
- No React state involved; purely CSS-driven
- Transition happens automatically when OS theme changes
- No loading state or async behavior

**Hotspots:**
- Hardcoded `dark:` classes override CSS variables, requiring duplicate updates
- High coupling between CSS custom properties and hardcoded Tailwind classes
- No centralized way to audit all dark mode color usage

**Evidence:** `src/index.css:90` — `@media (prefers-color-scheme: dark) { ... }`

---

## 6) Derived State & Invariants

**Derived value:** Component dark mode class overrides

- **Source:** Hardcoded `dark:*` Tailwind utilities in component files (IconBadge variants, location styling hook)
- **Writes / cleanup:** N/A — static classes do not mutate state
- **Guards:** Browser applies classes only when `prefers-color-scheme: dark` matches
- **Invariant:** Hardcoded dark classes must maintain WCAG AA contrast ratios with their backgrounds; if CSS variables change, hardcoded classes must be updated to match
- **Evidence:** `src/components/ui/icon-badge.tsx:14-31`, `src/hooks/use-box-locations.ts:42-44`

**Derived value:** Effective text/background contrast ratio

- **Source:** Combination of `--foreground` / `--background` HSL values and component-specific color overrides
- **Writes / cleanup:** N/A — contrast is a visual property, not stored state
- **Guards:** Must maintain WCAG AA minimum (4.5:1 for normal text, 3:1 for large text)
- **Invariant:** Reducing saturation/increasing lightness must not drop contrast below accessibility thresholds
- **Evidence:** `src/index.css:92-93` — `--background: 222.2 84% 4.9%; --foreground: 210 40% 98%;`

**Derived value:** Shadow visibility in dark mode

- **Source:** `--shadow-sm`, `--shadow-md`, `--shadow-lg` tokens with black rgba opacity
- **Writes / cleanup:** N/A
- **Guards:** Shadows must remain visible against dark backgrounds while avoiding harsh edges
- **Invariant:** Reducing shadow opacity must not eliminate depth cues entirely
- **Evidence:** `src/index.css:123-125`

---

## 7) State Consistency & Async Coordination

**Source of truth:** Browser's computed `prefers-color-scheme` media query + CSS cascade

**Coordination:**
- CSS variables update synchronously when media query matches
- Components inherit new values immediately via CSS custom property references
- Hardcoded `dark:` classes apply independently when dark mode is active

**Async safeguards:**
- N/A — no async operations; CSS changes are synchronous
- No race conditions possible; browser handles media query evaluation atomically

**Instrumentation:**
- No test events emitted (no React state changes or user interactions)
- No `useListLoadingInstrumentation` or `trackForm*` involvement
- Testing requires manual visual inspection or accessibility contrast tools

**Evidence:** `src/index.css:90` — CSS media query block

---

## 8) Errors & Edge Cases

**Failure:** Contrast ratio drops below WCAG AA threshold after softening

- **Surface:** All text/background combinations across UI
- **Handling:** Measure contrast ratios during implementation; adjust lightness values to maintain 4.5:1 minimum for body text, 3:1 for large text/icons
- **Guardrails:** Use browser DevTools contrast checker or online tools (e.g., WebAIM contrast checker) before finalizing values
- **Evidence:** `src/index.css:92-93` — foreground/background token definitions

**Failure:** Hardcoded dark classes not updated, creating inconsistent appearance

- **Surface:** IconBadge variants, box location items
- **Handling:** Audit all `dark:bg-*` and `dark:text-*` classes in components; update to match new softness level
- **Guardrails:** Search codebase for `dark:` pattern; visually verify each component in dark mode
- **Evidence:** `src/components/ui/icon-badge.tsx:14-31`, `src/hooks/use-box-locations.ts:42-44`

**Failure:** User's OS is set to light mode; changes not visible

- **Surface:** N/A — expected behavior
- **Handling:** Document that changes only affect dark mode; provide manual testing instructions with OS dark mode enabled
- **Guardrails:** Include screenshot comparisons in PR description showing before/after in dark mode
- **Evidence:** `src/index.css:90` — media query condition

**Failure:** Shadows become invisible after opacity reduction

- **Surface:** Card, popover, and dialog components using shadow tokens
- **Handling:** Test shadow visibility on dark backgrounds; adjust opacity incrementally
- **Guardrails:** Ensure depth cues remain perceptible; consider lightening shadow color instead of only reducing opacity
- **Evidence:** `src/index.css:123-125` — shadow token definitions

---

## 9) Observability / Instrumentation

**Signal:** N/A — No instrumentation events

- **Type:** N/A
- **Trigger:** N/A
- **Labels / fields:** N/A
- **Consumer:** N/A
- **Evidence:** No test events defined for theme changes; system preference detection is CSS-only

**Testing approach:**
- Manual visual inspection with OS dark mode enabled
- Accessibility contrast checking with browser DevTools or external tools
- Screenshot comparison (before/after) for PR review
- No Playwright specs needed (purely visual change with no user interaction)

---

## 10) Lifecycle & Background Work

**Hook / effect:** N/A — CSS media query

- **Trigger cadence:** Browser evaluates on OS theme change or page load
- **Responsibilities:** Apply dark mode CSS variables when `prefers-color-scheme: dark` is true
- **Cleanup:** Browser automatically removes dark mode styles when media query no longer matches
- **Evidence:** `src/index.css:90` — `@media (prefers-color-scheme: dark) { ... }`

No React effects, timers, or subscriptions involved. Theme detection is entirely CSS-driven.

---

## 11) Security & Permissions

Not applicable. Color theme changes have no security implications; no authentication, authorization, or data exposure concerns.

---

## 12) UX / UI Impact

**Entry point:** All pages and components when user has OS dark mode enabled

**Change:** Visual appearance of dark mode becomes less harsh:
- Background shifts from saturated navy to desaturated grey-blue (warmer, less intense)
- Text contrast reduces slightly while maintaining accessibility
- Accent colors (success, warning, info) become less saturated and more muted
- Borders and shadows soften, reducing visual "sharpness"
- Overall feel: calmer, easier on eyes during extended use

**User interaction:** No behavior changes; users experience updated colors passively when in dark mode

**Dependencies:**
- Browser support for `prefers-color-scheme` media query (universal in modern browsers)
- TailwindCSS v4 theme system (`src/index.css:3-34`)
- No backend dependency

**Evidence:** `src/index.css:90-127` — dark mode color definitions

---

## 13) Deterministic Test Plan

**Testing approach:** Manual visual verification + accessibility contrast checks

Since theme changes are CSS-only with no user interactions or state changes, Playwright specs are not needed. Testing involves:

**Surface:** Dark mode appearance across all pages

**Scenarios:**
- **Given** OS is set to dark mode, **When** user loads any page, **Then** background is desaturated grey-blue (not saturated navy), text has comfortable contrast, accent colors are muted
- **Given** IconBadge with success variant in dark mode, **When** rendered, **Then** background is softer emerald shade (not emerald-900), text contrast meets WCAG AA
- **Given** occupied box location in dark mode, **When** rendered, **Then** background is softer emerald, hover state is perceptible but not harsh
- **Given** shadow-bearing components (cards, popovers) in dark mode, **When** rendered, **Then** shadows are visible but subtle

**Instrumentation / hooks:**
- No test events or `data-testid` additions needed
- Manual verification with browser DevTools:
  - Color picker to inspect computed HSL values
  - Accessibility contrast checker for text/background pairs
  - Screenshot comparison tool (e.g., Percy, Chromatic) if available

**Gaps:**
- No automated visual regression testing (defer to manual QA)
- No Playwright spec for color values (CSS inspection not part of functional test suite)
- Contrast verification is manual; could add `axe-core` accessibility tests in future

**Evidence:** N/A — no existing visual regression test infrastructure

---

## 14) Implementation Slices

**Slice 0: Pre-Implementation HSL Value Calculation**

- **Goal:** Calculate and propose specific target HSL values that maintain accessibility before touching code
- **Touches:**
  - Use online HSL contrast calculator to derive specific values for each token
  - Create a table with current vs. proposed HSL values, contrast ratios, and WCAG results
  - Get user approval on proposed values before implementation
- **Dependencies:** None; this is the first step
- **Deliverable:** Table format showing:
  ```
  | Token | Current HSL | Proposed HSL | Contrast Ratio | WCAG Result |
  |-------|-------------|--------------|----------------|-------------|
  | --background | 222.2 84% 4.9% | 220 25% 10% | - | - |
  | --foreground | 210 40% 98% | 210 30% 95% | 12.5:1 (with bg) | AAA |
  ```

**Slice 1: CSS Variable Updates**

- **Goal:** Update core dark mode color tokens to softer palette using approved HSL values from Slice 0
- **Touches:**
  - `src/index.css:92-112` — primary color tokens (background, foreground, primary, secondary, border, input, etc.)
  - `src/index.css:115-120` — extended tokens (success, warning, info, destructive)
  - `src/index.css:62-87` — electronics category colors (resistor, capacitor, ic, mechanical, connector)
  - `src/index.css:123-125` — shadow tokens
- **Dependencies:** Slice 0 must be approved by user
- **Verification:** After updating, run `pnpm dev`, open DevTools, inspect element using `bg-background`, verify computed style shows new HSL values (not cached). If stale, restart Vite dev server.

**Slice 2: Component Dark Class Updates**

- **Goal:** Update hardcoded `dark:` classes to visually match the new CSS variable palette
- **Touches:**
  - `src/components/ui/icon-badge.tsx:14-31` — variant and border color classes
  - `src/hooks/use-box-locations.ts:42-44` — location styling classes
  - `src/components/boxes/location-item.tsx:47,53` — text color classes
- **Dependencies:** Slice 1 must be complete and user-approved
- **Method:** Render components using CSS variables (e.g., cards with `bg-background`) next to components with hardcoded classes (IconBadge, location items). Adjust hardcoded Tailwind shades (e.g., emerald-900 → emerald-700) until they visually match the softness level of CSS variable colors. Document final shade mappings for reference.

**Slice 3: Manual QA & Contrast Verification**

- **Goal:** Verify accessibility and visual comfort across all pages
- **Touches:** N/A — testing only
- **Dependencies:** Slices 1-2 complete; requires browser with dark mode enabled and DevTools contrast checker
- **Shadow-bearing components to verify:**
  - Card components in part/type lists
  - Dialogs/modals (`src/components/ui/dialog.tsx`)
  - Popovers (`src/components/ui/popover.tsx`)
  - Any dropdown menus
- **Screenshot template:** Capture before/after screenshots of:
  - Dashboard with part cards
  - IconBadge variants
  - Box locations page
  - Forms/dialogs
  - Toast notifications

---

## 15) Risks & Open Questions

**Risk:** Contrast ratios drop below WCAG AA after desaturating colors

- **Impact:** Text becomes unreadable for users with low vision; accessibility failure
- **Mitigation:** Use contrast checking tools during implementation; adjust lightness values to compensate for reduced saturation; prioritize readability over aesthetics

**Risk:** Hardcoded dark classes missed during audit, creating inconsistent appearance

- **Impact:** Some UI elements remain harsh while others are softened; confusing user experience
- **Mitigation:** Grep for all `dark:` patterns before finalizing; visually inspect all domain pages (boxes, parts, types, shopping lists, kits) in dark mode

**Risk:** "Softer" is subjective; user may want further adjustments after implementation

- **Impact:** Additional iteration required; potential scope creep
- **Mitigation:** Present specific HSL value changes in PR for user review before merging; allow for one round of tweaks based on feedback

**Risk:** Shadows become too subtle, losing depth perception

- **Impact:** Cards and popovers blend into background; users lose visual hierarchy cues
- **Mitigation:** Test shadow visibility on actual dark background colors; consider lightening shadow color (dark grey instead of black) rather than only reducing opacity; specifically test Card, Dialog, Popover, and dropdown components

**Risk:** Slice 0 HSL value proposals may require iteration to achieve desired softness

- **Impact:** Additional rounds of calculation and user approval before implementation begins
- **Mitigation:** Present 2-3 options for key tokens (conservative softening vs. moderate vs. aggressive) to give user choice; document contrast ratios for all options to demonstrate accessibility compliance

**Resolved Question:** Electronics category colors will be softened to match the new palette (user decision: "Soften them"). These will be included in Slice 1 with saturation reduced from 83-93% to ~40-60%.

---

## 16) Confidence

**Confidence:** High — CSS color adjustments are low-risk, reversible, and have no behavioral impact. HSL format makes saturation/lightness tweaks straightforward. Main challenge is maintaining accessibility while softening, which is solvable via contrast checking tools. Hardcoded dark class updates are tedious but mechanical (search-and-replace with verification).

---

## Implementation Checklist

### Pre-Implementation
- [x] Identify all dark mode color tokens in `src/index.css`
- [x] Audit all `dark:` classes in components
- [x] Get user decision on electronics category colors (decided: soften them)
- [ ] Enable OS dark mode and take "before" screenshots of key pages

### Slice 0: HSL Value Calculation
- [ ] Use online HSL contrast calculator (e.g., WebAIM, Coolors)
- [ ] Calculate specific target values for all tokens (background, foreground, primary, secondary, accent, muted, success, warning, info, destructive, border, input, ring)
- [ ] Calculate target values for electronics category colors (resistor, capacitor, ic, mechanical, connector)
- [ ] Verify all text/background pairs meet WCAG AA (4.5:1 for normal text, 3:1 for large text)
- [ ] Create HSL value table with current vs. proposed values and contrast ratios
- [ ] Present table to user for approval before proceeding

### Slice 1: CSS Variables
- [ ] Apply approved HSL values from Slice 0 to `--background`, `--foreground`
- [ ] Apply approved values to `--primary`, `--secondary`, `--accent`, `--muted`
- [ ] Apply approved values to `--border`, `--input`, `--ring`
- [ ] Apply approved values to `--success`, `--warning`, `--info`, `--destructive`
- [ ] Apply approved values to `--electronics-resistor`, `--electronics-capacitor`, `--electronics-ic`, `--electronics-mechanical`, `--electronics-connector`
- [ ] Update shadow opacity to approved value (typically 0.15-0.2)
- [ ] Run `pnpm dev`, inspect element using `bg-background` in DevTools, verify computed HSL shows new values
- [ ] If values are stale, restart Vite dev server

### Slice 2: Component Classes
- [ ] Render pages side-by-side comparing CSS variable-based components vs. hardcoded class components
- [ ] Update IconBadge variant classes to visually match CSS variable softness (document final mappings)
- [ ] Update IconBadge border classes to match
- [ ] Update box locations hook styling classes to match
- [ ] Update location item text colors to match
- [ ] Document all shade mappings (e.g., "emerald-900 → emerald-700") for PR reference

### Slice 3: QA
- [ ] Test shadow visibility on Card, Dialog, Popover, dropdown components
- [ ] Run contrast checks on all major text/background pairs with DevTools
- [ ] Visually inspect all pages: dashboard, boxes, parts, types, shopping lists, kits, forms
- [ ] Take "after" screenshots using template (dashboard, IconBadges, box locations, forms, toasts)
- [ ] Compare before/after screenshots
- [ ] Verify no regressions in light mode
- [ ] Run full accessibility audit with Axe DevTools or Lighthouse (optional but recommended)
- [ ] Document final HSL values and contrast ratios in PR

---

**End of Plan**
