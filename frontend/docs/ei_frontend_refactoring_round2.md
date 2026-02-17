# ElectronicsInventory Frontend — Refactoring Round 2

This document lists the second round of refactorings to apply to `/work/ElectronicsInventory/frontend` before re-extracting the frontend Copier template. These build on the [18 refactorings from Round 1](./ei_frontend_refactoring.md), all of which have been completed.

These changes address issues found during the first template extraction: domain-specific code that leaked into template files, a component architecture that couples logic and styling in ways that prevent app customization, and infrastructure improvements identified from cross-app comparison.

## Table of Contents

1. [Remove domain-specific UI components from template scope](#1-remove-domain-specific-ui-components-from-template-scope)
2. [Move brand colors from index.css to app-theme.css](#2-move-brand-colors-from-indexcss-to-app-themecss)
3. [Split UI components into primitives, styled components, and variant configs](#3-split-ui-components-into-primitives-styled-components-and-variant-configs)
4. [Adopt IoT's nginx.conf pattern with proxy snippet](#4-adopt-iots-nginxconf-pattern-with-proxy-snippet)
5. [Adopt SSE Gateway as npm devDependency](#5-adopt-sse-gateway-as-npm-devdependency)
6. [Parameterize backend-url.ts default port](#6-parameterize-backend-urlts-default-port)

---

## 1. Remove domain-specific UI components from template scope

**Why:** Two components in `src/components/ui/` are EI-specific concepts that don't belong in the template:

- `membership-indicator.tsx` — A generic-ish "query status icon with tooltip" component, but the name "membership" is EI domain language, and the `hasMembership` prop encodes a domain concept. It's used for showing which kits/shopping-lists a part belongs to.
- `membership-tooltip-content.tsx` — Renders a list of membership items with status badges and links. The `MembershipTooltipContentItem` interface with `statusBadge`, `link`, and `metadata` is modeled around EI's specific data relationships.

**Action:**

1. Move both files from `src/components/ui/` to `src/components/domain/` (or another EI-specific location like `src/components/parts/`).
2. Update all import paths in EI.
3. Remove them from the template's `src/components/ui/` directory listing.

These components are perfectly fine for EI — they just aren't template infrastructure.

**Template impact:** Two fewer template-owned components. If a generic "query status indicator" pattern emerges across apps, it can be added back with a generic name and interface.

---

## 2. Move brand colors from index.css to app-theme.css

**Why:** The `:root` CSS custom properties in `index.css` currently contain EI's teal brand palette (hue 165). These are app-specific colors masquerading as template defaults. The `@theme` block and base layer styling are genuinely template infrastructure, but the color values should be in `app-theme.css` where each app owns them.

**Current state:** `src/index.css` `:root` block has hue-165 teal values for every token:
```css
--primary: 165 68% 46%;
--foreground: 170 41% 10%;
--card: 160 33% 97%;
/* ... all teal */
```

**Action:**

1. **In `index.css`** — Replace the `:root` color values with neutral slate/gray defaults:
   ```css
   :root {
     --background: 0 0% 100%;
     --foreground: 224 71% 4%;
     --card: 0 0% 100%;
     --card-foreground: 224 71% 4%;
     --popover: 0 0% 100%;
     --popover-foreground: 224 71% 4%;
     --primary: 220 90% 56%;
     --primary-foreground: 210 40% 98%;
     --secondary: 220 15% 96%;
     --secondary-foreground: 220 9% 46%;
     --muted: 220 15% 96%;
     --muted-foreground: 220 9% 46%;
     --accent: 220 15% 96%;
     --accent-foreground: 220 9% 46%;
     --destructive: 0 84% 60%;
     --destructive-foreground: 0 0% 98%;
     --border: 220 13% 91%;
     --input: 220 13% 91%;
     --ring: 220 90% 56%;
     --radius: 0.5rem;
     --link: 220 90% 56%;
     --link-hover: 220 90% 48%;

     --success: 142 72% 43%;
     --success-foreground: 142 72% 8%;
     --warning: 48 79% 42%;
     --warning-foreground: 48 64% 10%;
     --info: 200 90% 47%;
     --info-foreground: 200 69% 10%;

     /* Spacing, shadows — keep unchanged */
   }
   ```
   Same for the dark mode block — use neutral dark values.

2. **In EI's `app-theme.css`** — Add the current teal overrides:
   ```css
   @layer base {
     :root {
       --foreground: 170 41% 10%;
       --card: 160 33% 97%;
       --card-foreground: 170 41% 10%;
       --popover-foreground: 170 41% 10%;
       --primary: 165 68% 46%;
       --primary-foreground: 170 59% 11%;
       --secondary: 165 24% 94%;
       --secondary-foreground: 170 41% 10%;
       --muted: 165 24% 94%;
       --muted-foreground: 165 14% 54%;
       --accent: 165 56% 91%;
       --accent-foreground: 170 59% 11%;
       --border: 165 22% 87%;
       --input: 165 22% 87%;
       --ring: 165 68% 46%;
       --link: 165 68% 46%;
       --link-hover: 165 71% 41%;
     }

     @media (prefers-color-scheme: dark) {
       :root {
         /* ... current dark mode teal values ... */
       }
     }
   }
   ```

3. **Keep in `index.css`** (template-owned, not moving):
   - `@import "tailwindcss"` and `@theme` block
   - The `@import "./app-theme.css"` (or move to `@import "./styles/app-theme.css"` per refactoring #3)
   - Base layer: border color, body background/foreground, html/body height
   - Custom utilities: `transition-smooth`, `shadow-soft`, `shadow-medium`, `shadow-strong`, `text-link`
   - Scrollbar styling
   - Dark mode `text-destructive` override

**Template impact:** `index.css` has neutral defaults that work out of the box. Apps override colors in their `app-theme.css`. No more EI teal leaking into other projects.

---

## 3. Split UI components into primitives, styled components, and variant configs

**Why:** The current `src/components/ui/` directory mixes logic components (Radix wrappers, keyboard handling, state management) with pure styling components (color variant maps, layout). Template updates via `copier update` overwrite everything in template-owned files, meaning apps can't customize component styles without losing those customizations on the next update.

The solution: split components by ownership concern.

**New directory structure:**

```
src/
  styles/                          # app-owned (_skip_if_exists)
    app-theme.css                  # brand colors, CSS custom properties
    button.ts                      # button variant + size class maps
    alert.ts                       # alert variant classes
    card.ts                        # card variant classes
    toast.ts                       # toast tone classes
    input.ts                       # input state classes
    progress-bar.ts                # progress-bar color + size classes
    notification.ts                # inline-notification variant classes
    index.ts                       # barrel export

  components/
    primitives/                    # template-owned — logic, Radix, state, keyboard, a11y
      button.tsx
      dialog.tsx
      dropdown-menu.tsx
      toast.tsx
      tooltip.tsx
      use-tooltip.ts
      searchable-select.tsx
      segmented-tabs.tsx
      alert.tsx
      input.tsx
      card.tsx
      form.tsx
      drop-zone.tsx
      progress-bar.tsx
      inline-notification.tsx
      debounced-search-input.tsx
      deployment-notification-bar.tsx
      external-link.tsx
      link-chip.tsx
      hover-actions.tsx
      description-list.tsx
      list-section-header.tsx
      index.ts

    ui/                            # app-owned (_skip_if_exists) — styled components
      badge.tsx
      code-badge.tsx
      collection-grid.tsx
      empty-state.tsx
      icon-badge.tsx
      information-badge.tsx
      key-value-badge.tsx
      label.tsx
      metric-display.tsx
      quantity-badge.tsx
      section-heading.tsx
      skeleton.tsx
      status-badge.tsx
      capacity-bar.tsx
      thumbnail.tsx
      index.ts

    icons/                         # template-owned — SVG icon components
      clear-button-icon.tsx
      UploadIcon.tsx
      ExternalLinkIcon.tsx
      ImagePlaceholderIcon.tsx
```

**How the split works for mixed components:**

Each mixed component gets its styling extracted into a `src/styles/` config file. The primitive imports from the config.

Example — **button.tsx** split:

```typescript
// src/styles/button.ts (app-owned)
export const buttonVariants = {
  default: 'bg-primary text-primary-foreground shadow-xs hover:bg-primary/90',
  outline: 'border border-input bg-background shadow-xs hover:bg-accent hover:text-accent-foreground',
  secondary: 'bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80',
  ghost: 'hover:bg-accent hover:text-accent-foreground',
  filter: 'border border-input bg-background text-foreground shadow-xs hover:bg-accent',
  ai_assisted: 'relative overflow-hidden border border-primary/30 bg-gradient-to-r from-primary/5 to-primary/10',
} as const;

export const buttonSizes = {
  sm: 'h-8 gap-1.5 rounded-md px-3 text-xs',
  md: 'h-9 gap-2 px-4 py-2',
  lg: 'h-10 gap-2 rounded-md px-6',
} as const;
```

```typescript
// src/components/primitives/button.tsx (template-owned)
import { buttonVariants, buttonSizes } from '@/styles/button';
// ... loading spinner logic, Slot support, preventValidation — unchanged
```

**Components that need this split:**

| Primitive (template) | Variant config (app-owned in `styles/`) |
|---|---|
| `primitives/button.tsx` | `styles/button.ts` — variant + size classes |
| `primitives/alert.tsx` | `styles/alert.ts` — variant color classes, border classes |
| `primitives/card.tsx` | `styles/card.ts` — variant classes |
| `primitives/toast.tsx` | `styles/toast.ts` — tone classes, action button colors |
| `primitives/input.tsx` | `styles/input.ts` — border, focus, error classes |
| `primitives/progress-bar.tsx` | `styles/progress-bar.ts` — color + size variants |
| `primitives/inline-notification.tsx` | `styles/notification.ts` — variant color classes |

**Action (in EI):**

1. Create the `src/styles/` directory and move `app-theme.css` into it.
2. For each mixed component, extract the variant/size/color class maps into `src/styles/<component>.ts`.
3. Create `src/components/primitives/` and move all logic components there, updating imports to read from `@/styles/`.
4. Move pure styling components to `src/components/ui/` (they may already be there).
5. Update all import paths throughout the app.
6. Update `index.css` to `@import "./styles/app-theme.css"`.

**Template impact:** Clean three-way ownership:
- `primitives/` — template-owned, updated by `copier update` (logic improvements, bug fixes, new Radix features)
- `ui/` — app-owned, generated once with sensible defaults
- `styles/` — app-owned, generated once; apps customize visual appearance here

---

## 4. Adopt IoT's nginx.conf pattern with proxy snippet

**Why:** The current EI nginx.conf inlines proxy headers in each location block, leading to duplication. IoT's pattern extracts shared proxy configuration into `snippets/proxy.conf` with proper `map` directives for `X-Forwarded-Proto` and `X-Real-IP` (important when behind a reverse proxy / load balancer).

Additionally, nginx.conf should be **template-owned** (not `_skip_if_exists`). There's no reason for per-app variance — it's standard SPA serving + API proxying. Ports come from template variables.

**Action:**

1. Create `snippets/proxy.conf`:
   ```nginx
   proxy_http_version 1.1;
   proxy_set_header Upgrade $http_upgrade;
   proxy_set_header Connection 'upgrade';
   proxy_set_header Host $host;
   proxy_set_header X-Real-IP $proxy_x_real_ip;
   proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
   proxy_set_header X-Forwarded-Proto $proxy_x_forwarded_proto;
   proxy_cache_bypass $http_upgrade;
   proxy_buffering off;
   ```

2. Update `nginx.conf` to include the `map` directives and use `include`:
   ```nginx
   http {
       map $http_x_forwarded_proto $proxy_x_forwarded_proto {
           default $http_x_forwarded_proto;
           ''      $scheme;
       }
       map $http_x_real_ip $proxy_x_real_ip {
           default $http_x_real_ip;
           ''      $remote_addr;
       }

       # ... standard config ...

       server {
           listen 3000;
           # ...

           location /api/sse/ {
               client_max_body_size 10M;
               proxy_pass http://127.0.0.1:3001;
               include /etc/nginx/snippets/proxy.conf;
           }

           location /api/ {
               client_max_body_size 10M;
               proxy_pass http://127.0.0.1:5000;
               include /etc/nginx/snippets/proxy.conf;
           }
       }
   }
   ```

3. Update the Dockerfile to copy `snippets/proxy.conf` to `/etc/nginx/snippets/`.

**Template impact:** Both `nginx.conf` and `snippets/proxy.conf` become template-owned `.jinja` files (for port substitution). Removed from `_skip_if_exists`. Ports use `{{ frontend_port }}`, `{{ backend_port }}`, `{{ sse_gateway_port }}`. The SSE location block is conditional on `{% if use_sse %}`.

---

## 5. Adopt SSE Gateway as npm devDependency

**Why:** The SSE Gateway is currently a separate checkout that the Playwright test infrastructure locates via `SSE_GATEWAY_ROOT` env var or a `../ssegateway` relative path. Making it an npm devDependency simplifies the development setup — no separate checkout needed, version is pinned in package.json, and `servers.ts` finds it via standard Node.js module resolution.

See [SSE Gateway npm Package Spec](./sse_gateway_npm_package.md) for the full specification. This refactoring covers the EI-side adoption.

**Prerequisites:** The SSE Gateway developer must complete the package changes first (bin entry, dist/ committed, version tagged).

**Action:**

1. Add to `devDependencies` in `package.json`:
   ```json
   "ssegateway": "git+https://<git-server>/SSEGateway.git#v1.0.0"
   ```

2. Run `pnpm install` to verify it installs correctly.

3. Update `tests/support/process/servers.ts`:
   - Replace `getSSEGatewayRepoRoot()` / `run-gateway.sh` invocation with `require.resolve('ssegateway/dist/index.js')` and env var config (see the spec doc for exact code).
   - Remove the `getSSEGatewayRepoRoot()` function and `sseGatewayRepoRootCache`.
   - Remove `SSE_GATEWAY_ROOT` env var handling.

4. Remove the SSE Gateway checkout from EI's development environment (once verified).

5. Run the Playwright test suite to confirm the gateway starts correctly from `node_modules/`.

**Template impact:** `servers.ts` becomes cleaner. The `package.json.jinja` template conditionally includes the `ssegateway` devDependency when `use_sse` is true.

---

## 6. Parameterize backend-url.ts default port

**Why:** `tests/support/backend-url.ts` has a hardcoded default port of `5100` (EI-specific). The template should use a neutral default matching the `backend_port` template variable.

**Current state:**
```typescript
const DEFAULT_BACKEND_URL = 'http://localhost:5100';
```

**Action:** Change to match EI's actual port or the template default:
```typescript
const DEFAULT_BACKEND_URL = 'http://localhost:5000';
```

Or import from consts:
```typescript
import { DEFAULT_BACKEND_PORT } from '@/lib/consts';
const DEFAULT_BACKEND_URL = `http://localhost:${DEFAULT_BACKEND_PORT}`;
```

The first option is simpler. The port value doesn't matter much since the Playwright infrastructure overrides it via the `BACKEND_URL` environment variable — this default is only used as a fallback.

**Template impact:** `backend-url.ts` becomes a `.jinja` file with `http://localhost:{{ backend_port }}`, or uses a neutral default like `5000`.

---

## Priority Order

1. **#2 Move brand colors** — Foundation; affects every component's visual appearance
2. **#3 Split UI components** — Biggest structural change; depends on #2 for `styles/` directory
3. **#1 Remove domain components** — Quick cleanup
4. **#4 Adopt nginx pattern** — Independent, can be done in parallel
5. **#5 SSE Gateway npm package** — Depends on gateway dev completing their work
6. **#6 Parameterize backend-url.ts** — Trivial

---

## Verification

After all refactorings, verify in EI:
```bash
cd /work/ElectronicsInventory/frontend
pnpm run check        # lint + typecheck
pnpm run build        # production build
pnpm run test         # Playwright suite (should pass at same level as before)
```

All import paths should resolve. No EI-specific colors should remain in `index.css`. The `src/styles/` directory should contain `app-theme.css` and all variant config files. The `src/components/primitives/` directory should contain all logic components. The `src/components/ui/` directory should contain only pure styling components.
