# Electronics Inventory Frontend - Claude Context

## Project Overview
Single-user hobby electronics parts inventory system with React frontend and Flask/PostgreSQL backend. No authentication required.

## Quick Reference

### Development Commands
```bash
pnpm dev                    # Start dev server (port 3000)
pnpm build                  # Full build with type checking
pnpm lint                   # ESLint
pnpm type-check            # TypeScript checking
pnpm generate:api          # Generate API types/hooks from OpenAPI
pnpm generate:routes       # Generate TanStack Router tree
```

### Architecture Stack
- **Frontend**: React 19.1 + TypeScript ~5.9 (strict mode)
- **Router**: TanStack Router v1 (file-based routing)
- **State**: TanStack Query v5 (server state) + local hooks (client state)
- **API**: openapi-fetch with generated types from backend OpenAPI
- **Styling**: Tailwind CSS + Radix UI primitives
- **Build**: Vite + pnpm

### Key Concepts
- **Parts**: Have 4-letter IDs (e.g., "BZQP"), can exist in multiple locations
- **Storage**: Numbered boxes with numbered locations (e.g., "7-3" = Box 7, Location 3)
- **Zero quantity rule**: When total quantity reaches zero, all location assignments are cleared
- **Real-time**: SSE connection for async job notifications (AI suggestions, reorg plans)

### File Structure
```
src/
├── components/             # UI components by domain
├── routes/                # TanStack Router pages
├── lib/
│   ├── api/generated/     # Generated API types/hooks (git ignored)
│   └── ...               # Utils, PDF viewer, SSE, etc.
├── contexts/              # SSE provider
└── hooks/                # Custom hooks
```

### Path Aliases
- `@/components` → `src/components`
- `@/routes` → `src/routes`
- `@/lib` → `src/lib`
- `@/hooks` → `src/hooks`
- `@/types` → `src/types`

### Key Patterns
- Functional components only (no classes)
- Generated API types and TanStack Query hooks from backend OpenAPI
- SSE for real-time updates with Query invalidation
- Virtualized lists for performance
- Upload/download through backend (no direct S3)

## Documentation References
- Full requirements: `docs/product_brief.md`
- Complete technical decisions: `docs/technical_design.md`

## Command Templates

The repository includes command templates for specific development workflows:

- When writing a product brief: @docs/commands/create_brief.md
- When planning a new feature: @docs/commands/plan_feature.md
- When doing code review: @docs/commands/code_review.md
- When planning or implementing a new feature, reference the product brief at @docs/product_brief.md

Use these files when the user asks you to perform the applicable action.