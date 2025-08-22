# Technical Decisions Document — Electronics Inventory (Frontend)

This document captures all technical decisions for the Electronics Inventory frontend. It’s optimized for a **single-user**, **no-auth**, **internal** deployment, with **React + TanStack Router/Query**. The backend is Flask/PostgreSQL, file I/O is **through the backend** (no direct S3), and AI features are offloaded to OpenAI via backend jobs.

## Core Architecture

### Programming Paradigm

* **Functional only** (no classes). Composition-first via functions and hooks.
* **BFF-ish**: Use backend OpenAPI types directly in the UI. No extra mapping layer unless UX needs it.
* **Co-located logic**: UI logic lives near components; cross-cutting concerns live in `/src/lib`.

### Build System & Package Management

* **Package Manager**: **pnpm**
* **Build Tool**: **Vite** (React plugin)
* **Module System**: ES Modules (`"type": "module"`)
* **Node/Target**: ES2022

## Framework & Library Decisions

### Core React Stack

* **React 19.1.x** + **React DOM 19.1.x**
* **TypeScript \~5.9** in **strict** mode
* **React.StrictMode** enabled
* **JSX**: `react-jsx`

### Routing

* **Router**: **TanStack Router v1**
* **Strategy**: File-based routing with **generated route tree**
* **CLI**: TanStack Router CLI for automatic tree generation
* **Folder**: `/src/routes/`

### State Management

* **Server State**: **TanStack Query v5** for all async/server data
* **Client State**: Local hooks (`useState`, `useReducer`)
* **Persistence**: `localStorage` for user prefs (e.g., UI density, last used box)
* **Global Context**: SSE connection state + app-wide toasts
* **Query Defaults**: `staleTime: 5 * 60 * 1000`, `retry: 2`

  * Realtime invalidation (see SSE) keeps lists fresh without short polling

### API Integration

* **API Client**: `openapi-fetch`
* **Types**: `openapi-typescript` from the backend OpenAPI
* **Query Hooks**: Generated **TanStack Query hooks** per endpoint (custom codegen step)
* **Realtime**: **SSE** for async job signals (AI suggestions ready, reorg plan ready, thumbnails ready), with Query invalidation

## TypeScript Configuration

### Compiler Options

* **Target**: ES2022
* **Module**: ESNext (bundler resolution)
* **JSX**: `react-jsx`
* **Strict**: `true` (all strict checks)
* **Paths**: Aliases for `@/components`, `@/routes`, `@/lib`, `@/hooks`, `@/types`
* **Incremental**: Enabled

### Linting & Code Quality

* **ESLint**: `typescript-eslint` recommended + React hooks rules
* **Flat config**: `eslint.config.js`
* **Ignore**: `dist/`, generated code under `src/lib/api/generated/`

## Styling & UI

### CSS Framework

* **Tailwind CSS v3.4**
* **PostCSS** + `autoprefixer`
* Utility-first with a small component layer

### Design System

* **Radix UI** primitives
* **Variants**: `class-variance-authority`
* **Class utils**: `tailwind-merge` + `clsx`

### Themes

* **HSL tokens** via CSS vars
* **Dark mode**: class-based with system detection
* **Radius** via CSS vars

### Animation & Feedback

* Tailwind keyframes for “added/updated/removed”
* Short 250–1000ms transitions for state changes

### Icons

* **Lucide React**

### Lists & Grids

* **Virtualization**: `@tanstack/react-virtual` for long result sets (parts, docs)

## Data Layer Architecture

### API Code Generation

* **From OpenAPI**: generate **types**, **client**, and **Query hooks**
* **Scripts**: `pnpm generate:api` (dev), `pnpm generate:api:prod` (prod)
* **Cache**: Keep last known schema for offline dev

### Type Safety

* **End-to-end**: OpenAPI → TS → React components
* **Runtime validation**: **Zod** for critical runtime checks on risky payloads (uploads, SSE events)

### Real-time Data (SSE)

* **SSE Client**: Minimal wrapper with auto-reconnect and backoff
* **Context**: `SseProvider` stores connection status & exposes an event bus
* **Event Types** (from backend):

  * `ai.suggestion.ready` → invalidate `parts/:id` + `ai/suggestions/:id`
  * `reorg.plan.ready` → invalidate `reorg/plan`
  * `stock.changed` → invalidate `parts`, `parts/:id`, `projects/:id/coverage`
  * `thumbnail.ready` → bust specific image doc cache
* **Fallback**: Query refetch on focus + background at long intervals

## Requirements Mapping (Frontend)

### Single Search Box

* **Route**: `/search?q=...`
* **UX**: Debounced (250ms), keyboard-first (⌘/Ctrl+K opens search)
* **Scope**: Matches ID, manufacturer code, description, tags, seller, filenames
* **Results**: Parts list with quantities + **locations** summary (multi-location aware)
* **Virtualized list** for speed

### Boxes & Locations

* **Box model**: Numbered boxes; **sequential locations** (1..N) **left→right, top→bottom**
* **Display**: Grid view per box (cells labeled `BOX-LOCATION`, e.g., `7-3`)
* **Actions**:

  * Create box (capacity N)
  * Quick move/split (drag from cell to cell; keyboard-friendly form as fallback)
  * Show free/occupied cells; suggest location(s) by category

### Parts (multi-location)

* **Create flow (fast)**:

  * Camera/file → send to backend → **AI suggestion** cards (category, tags, datasheet PDF)
  * Confirm/adjust → backend generates **4-letter ID**
  * Quantity & location suggestions → accept or edit → **print label**
* **Edit**: Description, type, tags, seller/link, primary image
* **Move/Split**: Choose source, destinations, quantities
* **Use**: Deduct from chosen locations (with smart defaults)
* **Zero quantity**: UI shows “Out of stock” and **no assigned locations** (backend clears links)

### Documents (PDF/Image/Link)

* **Upload**: `multipart/form-data` to backend (no presigned URLs)
* **Viewer**:

  * **PDF.js** viewer component
  * Image lightbox with zoom
* **List**: Thumbnails (images), filename + size/date (PDFs)
* **Actions**: Add, remove, rename (display name), open-in-viewer

### AI Helpers (MVP)

* **Auto-tag & category**: Appears as suggestions; user can accept field-by-field
* **Datasheet discovery**: Shows candidate PDFs; user approves which to attach
* **Progress**: SSE emits “ready” events; UI shows non-blocking toasts/inline badges

### Shopping List

* **Add** arbitrary items (may not map to a Part yet)
* **Convert** to inventory: pick/create part, quantity, locations (with suggestions)
* **Inline actions**: mark purchased, edit desired qty, jump to part if linked

### Projects / Kits

* **Define project** and add required parts/qty (may include not-in-inventory items)
* **Coverage view**: enough / partial / missing (with counts)
* **Actions**: Add shortages to shopping list; when building, choose locations to deduct

### Reorganization Run

* **Trigger** analysis; show a **move plan** list (minimal moves, category clustering)
* **Apply** individually or in bulk (with confirmations)
* **Visual**: preview overlay highlighting affected slots

### Label Printing

* **Print view**: simple **text-only** (4-letter ID), multiple labels per page
* **CSS print**: size presets for common label widths; user chooses profile
* **Shortcut**: “Print label” button from part detail

### Mobile Camera Support

* File input with `capture="environment"` for mobile
* Show AI suggestion spinner; results insert as editable suggestions

## Development Workflow

### Environment

* **Vite env** with `VITE_` prefix
* `VITE_API_BASE_URL` configurable
* Dev server: port 3000, `host: true`

### Build Process

* **Pre-build**: API generation + router generation
* **Build**: `pnpm build` → type-check → Vite bundle
* **Type Check**: `pnpm type-check`
* **Lint**: `pnpm lint`

### Scripts

* `pnpm dev` — Vite dev server
* `pnpm build` — full build
* `pnpm lint` — ESLint
* `pnpm type-check` — tsc
* `pnpm generate:api` / `:prod` — OpenAPI → client/hooks
* `pnpm generate:routes` — Router tree generation

## File Organization

```
src/
├── components/
│   ├── common/          # error boundaries, spinners, toasts
│   ├── layout/          # app shell, header, search box
│   ├── parts/           # part cards, forms, move/split, label print
│   ├── boxes/           # box grid, cell, occupancy legend
│   ├── docs/            # upload widget, pdf/image viewers
│   ├── ai/              # suggestion panels, accept controls
│   ├── shopping/        # shopping list views
│   └── projects/        # project editor, coverage
├── contexts/
│   └── sse.tsx          # SSE provider & hooks
├── hooks/
│   └── useHotkeys.ts    # cmd/ctrl+k search, etc.
├── lib/
│   ├── api/
│   │   ├── client.ts            # openapi-fetch setup
│   │   ├── generated/           # generated types/hooks
│   │   └── query-keys.ts        # centralized query keys
│   ├── pdf/                     # PDF.js loader + viewer helpers
│   ├── sse/                     # event parsing, backoff, typing
│   ├── storage/                 # localStorage helpers
│   ├── ui/                      # tailwind utils, cva variants
│   └── utils/                   # general utils (debounce, format)
├── routes/                      # TanStack Router pages
│   ├── index.tsx                # dashboard or search
│   ├── search.tsx
│   ├── parts/
│   │   ├── index.tsx            # list
│   │   ├── $id.tsx              # detail
│   │   └── new.tsx              # create
│   ├── boxes/
│   │   ├── index.tsx
│   │   └── $boxNo.tsx           # grid
│   ├── shopping/index.tsx
│   └── projects/
│       ├── index.tsx
│       └── $id.tsx
└── types/                       # app-specific TS types (non-API)
```

### Import Strategy

* Path aliases using `@/*`
* Generated files ignored in git; regenerated via scripts

## Component Architecture

### Patterns

* **Functional components** with `forwardRef` where needed
* **Radix Slot** for polymorphism
* **Hooks-first**: business logic in hooks, views stay thin
* **Explicit Props**: all components have typed props interfaces

### UI Conventions

* **Forms**: lightweight, native form elements + small helpers (no heavy form library unless needed)
* **Tables/Lists**: virtualized where counts are large
* **Dialogs/Sheets**: Radix Dialog/Sheet with focus management

## Error Handling & Loading

* **Error Boundaries** at route and widget levels
* **TanStack Query**: loading & error UI baked into components
* **SSE**: show connection status pill; auto-reconnect with exponential backoff
* **Uploads**: busy states; toast success/failure

## Performance

* **Tree shaking** via ESM
* **Code splitting** by route (TanStack Router)
* **Virtualization** for big lists (parts/boxes)
* **Stable keys** for lists; memoize heavy rows/cards
* **Image thumbnails** (served by backend) to keep lists snappy

## Caching Strategy

* **Query cache** with 5-minute stale time
* **SSE invalidation** for freshness on changes
* **HTTP cache-control** respected for static assets

## Security & Best Practices

* **No auth** (internal network)
* **No direct S3** exposure; all documents go through backend endpoints
* **Input validation**: Zod where runtime safety matters (file uploads, SSE payloads)
* **Content-Security-Policy** tuned for PDF.js

## Real-time Features

* **SSE** + event-to-query invalidation map (see above)
* **Visual feedback**: flash animations when data updates
* **Optimistic UX**: where safe (e.g., move within a box), with server reconciliation

## Configuration Management

* **Dev**: `VITE_API_BASE_URL` points to backend (through NGINX in prod)
* **Prod**: relative `/api` URLs (Ingress routes frontend + API)
* **.env.local** for local overrides

## Deployment Considerations

* **Build**: Vite outputs static assets served by the **NGINX** that also reverse-proxies `/api` to Flask
* **Asset hashing** for long-term caching
* **PDF.js worker** loaded via dynamic import to keep main bundle lean

## Dependencies

* **Core**: `react`, `react-dom`, `typescript`, `vite`, `@tanstack/react-router`, `@tanstack/react-query`
* **API/Types**: `openapi-fetch`, `openapi-typescript`, (generated hooks)
* **Styling**: `tailwindcss`, `postcss`, `autoprefixer`, `class-variance-authority`, `tailwind-merge`, `clsx`, `@radix-ui/*`, `lucide-react`
* **Utils**: `zod`, `@tanstack/react-virtual`
* **PDF**: `pdfjs-dist` (wrapped in a small viewer component)
* **Dev**: `eslint`, `@typescript-eslint/*`

## Testing Strategy (Future)

* **Vitest** + **@testing-library/react**
* **what-to-test**: search flow, part create flow (incl. AI suggestions), document upload and view, move/split, reorg apply
* **Co-located tests** with components

## Key Architectural Principles

1. **Functional + typed** throughout
2. **OpenAPI-first**: generated types & hooks
3. **Single search box** with great defaults
4. **SSE-first** realtime with graceful fallbacks
5. **No direct S3**: uploads/downloads always via backend
6. **Minimal deps**: use primitives, avoid heavy frameworks
7. **Maintainable structure**: clear routes, domains, and libs
8. **Performance-aware**: virtualize, split, and cache wisely

### Optional UX Nice-tos (non-blocking)

* **Keyboard palette** (⌘/Ctrl+K) for “Add Part”, “New Project”, “Search”
* **Printable move sheets** for reorg runs
* **Inline quick actions** on search results (use, move, print label)
