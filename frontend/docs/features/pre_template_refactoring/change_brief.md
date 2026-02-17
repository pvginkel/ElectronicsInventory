# Change Brief: Pre-Template Refactoring

## Goal

Refactor the Electronics Inventory frontend to cleanly separate infrastructure code from domain code, preparing for extraction into a Copier-based frontend template. This mirrors the successful backend template extraction process.

## Refactorings

The following refactorings from `docs/ei_frontend_refactoring.md` require actual code changes in EI (items that are template-time-only or no-action are excluded):

### 1. Create `src/lib/consts.ts` (Refactoring #1)
Create a centralized constants file with project name, title, description, and default ports. This mirrors the backend's `consts.py` pattern.

### 2. Extract sidebar navigation items (Refactoring #2)
Move the hardcoded navigation items array from `sidebar.tsx` to a new app-owned file `sidebar-nav.ts`. Export the `SidebarItem` interface from `sidebar.tsx`.

### 3. Make TopBar read from consts (Refactoring #3)
Replace hardcoded "Electronics Inventory" and "Electronics" strings in `top-bar.tsx` with imports from `consts.ts`.

### 4. Split `index.css` into base + app theme (Refactoring #5)
Split the monolithic `index.css` into a generic base theme (template-owned) and an app-specific theme file `app-theme.css` (app-owned). The base theme keeps the generic design token system; the app theme contains EI's brand colors, category colors, and custom utilities.

### 5. Extract `__root.tsx` provider groups (Refactoring #6)
Break the deeply nested provider chain in `__root.tsx` into composable provider group components under `src/providers/`: `CoreProviders` (Query + Toast + QuerySetup), `AuthProviders` (Auth + AuthGate), and `SseProviders` (SSE + Deployment).

### 6. Split Playwright fixtures (Refactoring #14)
Split `tests/support/fixtures.ts` into `fixtures-infrastructure.ts` (template-owned: service management, page enhancement, test event bridge) and `fixtures.ts` (app-owned: extends infrastructure with domain page objects).

### 7. Make test selectors generic (Refactoring #15)
Move domain-specific selectors from `selectors.ts` to a new `selectors-domain.ts`. Keep only the generic `testId()` and `buildSelector()` helpers in the template-owned file.

### 8. Move test-events types (Refactoring #16)
Move `src/types/test-events.ts` to `src/lib/test/test-events.ts` and update all imports. This places the test event type system with the rest of the test instrumentation.
