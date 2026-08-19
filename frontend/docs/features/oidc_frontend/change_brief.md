# Change Brief: OIDC Frontend Integration

## Summary

Port the OIDC authentication frontend implementation from the IoTSupport app (`/work/IoTSupport/frontend`) to the ElectronicsInventory app. The backend has already been extended with OIDC endpoints; the generated API types and hooks already include the auth endpoints. The frontend needs UI and plumbing to complete the integration.

## What Needs to Change

### 1. Code Generator Update

The `scripts/generate-api.js` code generator must be updated to match the IoTSupport version. Key changes:

- **`generateClient()`**: The generated `client.ts` must include an `openapi-fetch` Middleware that intercepts all 401 responses and redirects to `/api/auth/login` via `buildLoginUrl()`. This is the single authoritative handler for 401 redirects across the entire app.
- **`toApiError()` call sites in generated hooks**: The generated hooks must pass `result.response.status` to `toApiError()` so that `ApiError` instances carry the HTTP status code. This is required for `isUnauthorizedError()` detection in the `useAuth` hook.
- **Mutation hooks with query parameters**: The IoTSupport generator also supports query parameters on mutation hooks (e.g., `hasQueryParams`), and handles dots in `transformOperationId`. These changes should be ported as well.

After updating the generator, re-run it to regenerate `client.ts`, `hooks.ts`, and `types.ts`.

### 2. API Error Handling Update

`src/lib/api/api-error.ts` must be updated so `toApiError(error, status?)` accepts an optional `status` parameter and attaches it to the error. This is needed because the generated hooks will now pass `result.response.status` and the `useAuth` hook's `isUnauthorizedError()` checks `error.status === 401`.

### 3. Auth Redirect Utility

Create `src/lib/auth-redirect.ts` with a `buildLoginUrl()` function that constructs `/api/auth/login?redirect=<encoded_current_path>`. This utility is used by both the API client middleware and the auth context. It preserves the current pathname and search params so the user returns to the same page after OIDC login.

### 4. Auth Hook

Create `src/hooks/use-auth.ts` wrapping the generated `useGetAuthSelf` hook. It:

- Calls `useGetAuthSelf` with `retry: false`, `staleTime: Infinity`, `refetchOnWindowFocus: false`
- Distinguishes between 401 (unauthenticated) and real errors using `isUnauthorizedError()`
- Transforms the API response into a frontend `UserInfo` model
- Exposes `{ user, isLoading, isAuthenticated, isUnauthenticated, error, refetch }`

### 5. Auth Context and Provider

Create `src/contexts/auth-context.tsx` with:

- `AuthContext` and `useAuthContext()` hook
- `AuthProvider` component that consumes `useAuth()` and provides `{ user, isLoading, isAuthenticated, error, logout, refetch }` to the tree
- `logout` navigates to `/api/auth/logout`
- Test instrumentation via `emitTestEvent` for `auth` scope with `loading`, `ready`, and `error` phases
- **No 401 redirect logic** in the provider (this is handled solely by the API client middleware to avoid duplication)

### 6. Auth Gate Component

Create `src/components/auth/auth-gate.tsx`:

- While loading: blank screen (`data-testid="auth.gate.loading"`)
- On non-401 error: error screen with retry button, with status-specific messaging (502, 503, 504, other 5xx, no status)
- When not authenticated (redirect in progress via middleware): blank screen
- When authenticated: renders children

### 7. Layout Restructuring: Top Bar

Create `src/components/layout/top-bar.tsx`:

- Full-width header bar spanning across the top of the app
- Contains: hamburger button | logo + "Electronics" title (linked to "/") | flex spacer | UserDropdown
- The hamburger dispatches to either sidebar toggle (desktop) or mobile menu toggle based on viewport

### 8. User Dropdown Component

Create `src/components/layout/user-dropdown.tsx`:

- Gets `user` and `logout` from `useAuthContext()`
- Shows user's display name (or "Unknown User" fallback) with a chevron
- Click toggles a dropdown with "Logout" option
- Outside click and Escape key close the dropdown
- Logout calls `logout()` from auth context (navigates to `/api/auth/logout`)

### 9. Sidebar Modification

Modify `src/components/layout/sidebar.tsx`:

- Remove the header section (logo, title, collapse toggle) — these move to the top bar
- The sidebar becomes navigation-only
- Keep all existing navigation items and their behavior

### 10. Root Route Restructuring

Modify `src/routes/__root.tsx`:

- Insert `AuthProvider` and `AuthGate` into the provider stack after `ToastProvider` and before `SseContextProvider` (so SSE and Deployment don't connect until auth is confirmed)
- Move the hamburger/mobile-toggle logic from the content area to the top bar
- The visual structure becomes:
  ```
  DeploymentNotificationBar (above top bar)
  TopBar (hamburger | logo | title | spacer | UserDropdown)
  Sidebar + Content (below)
  ```

### 11. Test Infrastructure (Minimal)

- Create `tests/api/factories/auth.ts` with `AuthFactory` class (createSession, clearSession, forceError)
- Add an `auth` fixture to `tests/support/fixtures.ts`
- Add 401/403/500 console error suppression to the page fixture (auth tests produce expected errors)
- Create a focused `tests/e2e/auth/auth.spec.ts` to verify the auth flow works (user display, dropdown, error screen, retry)
- Create `tests/e2e/auth/AuthPage.ts` page object
- Do NOT modify existing test fixtures to require auth sessions (OIDC is disabled in the test backend, so existing tests continue to work)

## Design Decisions

1. **Single 401 handler**: The `openapi-fetch` middleware in `client.ts` is the sole authority for 401-to-login redirects. The `AuthProvider` does NOT duplicate this. This eliminates the dual-redirect that exists in IoTSupport.
2. **Provider ordering**: `AuthProvider > AuthGate` sits between `ToastProvider` and `SseContextProvider`, ensuring SSE connections only start after auth is confirmed.
3. **Deployment bar placement**: Above the top bar (unchanged position).
4. **Existing tests unaffected**: OIDC is disabled in the test backend, so `/api/auth/self` returns a default local-user. Existing tests don't need auth sessions.
