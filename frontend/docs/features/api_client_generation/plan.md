# OpenAPI Client Generation Plan

## Overview

Implement automatic API client code generation from the backend OpenAPI specification with offline caching capability. This allows building the frontend without requiring the backend to be running by caching the OpenAPI JSON locally.

## Files to Create/Modify

### New Files
- `scripts/generate-api.js` - Main generation script with offline caching logic
- `scripts/fetch-openapi.js` - Utility to fetch and cache OpenAPI spec
- `src/lib/api/generated/` - Directory for generated types and hooks (git ignored)
- `openapi-cache/` - Directory to cache OpenAPI JSON files
- `openapi-cache/.gitignore` - Ignore generated files but keep directory structure

### Modified Files
- `package.json` - Add new scripts and dependencies
- `.gitignore` - Ignore generated API files but keep cache directory structure
- `vite.config.ts` - Ensure build process includes generation step

## Dependencies to Add

### Production Dependencies
- `openapi-fetch` - Lightweight OpenAPI client
- `openapi-typescript` - TypeScript type generation from OpenAPI specs

### Development Dependencies
- `@tanstack/react-query` - Already present, used for generated hooks
- Node.js built-in `fs`, `path`, `https` modules for file operations and HTTP requests

## Algorithm Details

### OpenAPI Fetching and Caching
1. **Manual generation** (`pnpm generate:api`):
   - Always fetch from `http://wrkdev:5000/docs/openapi.json`
   - Fallback to `http://localhost:5000/docs/openapi.json` if wrkdev fails
   - Update cached version on successful fetch
   - Fail if both endpoints are unreachable
2. **Build-time generation** (during `pnpm build`):
   - Use cached `openapi-cache/openapi.json` only
   - No network requests during build
   - Fail build if cache doesn't exist
3. **Cache mechanism**:
   - Save fetched JSON to `openapi-cache/openapi.json` (checked into git)
   - Include timestamp in `openapi-cache/last-fetch.txt` (checked into git)
   - Include spec hash for change detection

### Code Generation Process
1. **Type Generation**: Use `openapi-typescript` to generate TypeScript types
   - Input: OpenAPI JSON spec
   - Output: `src/lib/api/generated/types.ts`
2. **Client Generation**: Create `openapi-fetch` client instance
   - Output: `src/lib/api/generated/client.ts`
3. **Query Hook Generation**: Generate TanStack Query hooks for each endpoint
   - Parse OpenAPI paths and methods
   - Generate hooks like `useGetParts()`, `useCreatePart()`, etc.
   - Output: `src/lib/api/generated/hooks.ts`

### Hook Generation Logic
- **Query hooks** for GET requests: `useGetParts()`, `useGetPart(id)`
- **Mutation hooks** for POST/PUT/PATCH/DELETE: `useCreatePart()`, `useUpdatePart()`, `useDeletePart()`
- **Infinite query hooks** for paginated endpoints (if applicable)
- **Type-safe parameters** extracted from OpenAPI path/query parameters
- **Response type inference** from OpenAPI response schemas

## Script Commands

### New package.json Scripts
```json
{
  "scripts": {
    "generate:api": "node scripts/generate-api.js --fetch",
    "generate:api:build": "node scripts/generate-api.js --cache-only",
    "build": "pnpm generate:api:build && tsc -b && vite build"
  }
}
```

### Script Behavior
- `generate:api` - Manual command: always fetch latest OpenAPI spec, update cache, generate code
- `generate:api:build` - Build-time command: use cached spec only, no network requests
- Modified `build` script runs `generate:api:build` before TypeScript compilation

## Directory Structure After Implementation

```
frontend/
├── scripts/
│   ├── generate-api.js
│   └── fetch-openapi.js
├── openapi-cache/
│   ├── openapi.json          # Cached OpenAPI spec (checked into git)
│   └── last-fetch.txt        # Timestamp of last successful fetch (checked into git)
├── src/lib/api/
│   ├── client.ts            # Custom client setup/config
│   └── generated/           # Generated code (git ignored)
│       ├── types.ts         # OpenAPI TypeScript types
│       ├── client.ts        # openapi-fetch client instance
│       └── hooks.ts         # TanStack Query hooks
└── package.json
```

## Build Integration

### Pre-build Step
- Modify build process to run `generate:api` before TypeScript compilation
- Ensure generated files exist before `tsc -b` runs
- Handle generation failures gracefully in CI/CD environments

### Development Workflow
1. Run `pnpm generate:api` when backend API changes (fetches latest spec and updates cache)
2. Generated hooks are immediately available for import in components
3. `pnpm build` works offline using the cached OpenAPI spec
4. Team members get updated cache through git when they pull changes

## Error Handling

### Network Failures
- **Manual generation**: Fail with clear error if backend is unreachable
- **Build-time generation**: Never attempt network requests, use cache only
- Provide helpful error messages pointing to `pnpm generate:api` when cache is missing

### Generation Failures
- Validate OpenAPI spec before generation
- Provide clear error messages for malformed specs
- Maintain previous generated files if new generation fails

## Cache Management

### Cache Updates
- Cache updated only during `pnpm generate:api` (manual command)
- Cache files checked into git for team synchronization
- Build process never modifies cache

### Cache Validation
- Include OpenAPI spec hash and timestamp in metadata
- Detect API changes when running manual generation
- Clear indication when cache was last updated

## Implementation Phases

### Phase 1: Basic Infrastructure
1. Create directory structure and basic scripts
2. Implement OpenAPI fetching and caching
3. Add package.json scripts and dependencies

### Phase 2: Code Generation
1. Implement TypeScript type generation
2. Create openapi-fetch client setup
3. Test with basic API endpoints

### Phase 3: Query Hook Generation  
1. Parse OpenAPI spec to extract endpoints
2. Generate TanStack Query hooks
3. Integrate with existing components

### Phase 4: Build Integration
1. Integrate with Vite build process  
2. Add CI/CD considerations
3. Documentation and developer workflow