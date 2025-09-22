# Electronics Inventory Frontend - Development Guidelines

This document serves as the technical guide for developing code in this React/TypeScript frontend application. This system implements the hobby electronics inventory management described in `@docs/product_brief.md`.

## Architecture Overview

This is a modern React application built with:
- **React 19** with TypeScript
- **TanStack Router** for routing and type-safe navigation  
- **TanStack Query** (React Query) for API state management
- **OpenAPI-generated client** for type-safe backend communication
- **Tailwind CSS** with custom components for styling
- **Vite** for build tooling and development

## Project Structure & File Organization

### Core Directory Structure

```
src/
├── components/          # Reusable UI components organized by domain
│   ├── boxes/          # Box and location management components
│   ├── dashboard/      # Dashboard-specific components  
│   ├── layout/         # App shell components (header, sidebar)
│   ├── parts/          # Parts management components
│   ├── types/          # Type/category management components
│   └── ui/             # Base UI components (button, input, card, etc.)
├── contexts/           # React contexts for global state
├── hooks/              # Custom hooks for business logic
├── lib/                # Utility libraries and configurations
│   ├── api/            # API client and generated types
│   ├── ui/             # UI utility functions
│   └── utils/          # Business logic utilities
├── routes/             # File-based routing (TanStack Router)
└── types/              # TypeScript type definitions
```

### File Placement Guidelines

**Components** (`src/components/`):
- Group by domain/feature (boxes, parts, types, etc.)
- Use PascalCase for component files: `PartForm.tsx`, `BoxCard.tsx`  
- Place domain-specific components in their respective folders
- Base UI components go in `ui/` folder

**Hooks** (`src/hooks/`):
- Use kebab-case: `use-parts.ts`, `use-form-state.ts`
- Group related API operations (CRUD) into single hook files
- Include both data fetching and mutation hooks

**Utilities** (`src/lib/utils/`):
- Use kebab-case: `locations.ts`, `error-parsing.ts`
- Pure functions for data transformation and business logic
- No React dependencies (hooks belong in `hooks/`)

**Routes** (`src/routes/`):
- File-based routing following TanStack Router conventions
- Use kebab-case for route files: `$boxNo.tsx`, `$partId.tsx`

## Code Architecture Patterns

### API Communication

#### Generated Client Usage
```typescript
// Always use generated hooks from lib/api/generated/hooks
import { useGetParts, usePostParts } from '@/lib/api/generated/hooks';

// For custom queries, use the generated client
import { api } from '@/lib/api/generated/client';
```

#### Service Layer Pattern
Custom hooks in `src/hooks/` serve as the service layer. They wrap generated API hooks and add business logic:

```typescript
// ✅ This pattern is used throughout the codebase
export function usePartLocations(partId: string) {
  const query = useGetPartsLocationsByPartKey(
    { path: { part_key: partId } },
    { enabled: !!partId }
  );

  // Add computed properties and data transformation
  const totalQuantity = useMemo(() => {
    if (!query.data) return 0;
    return calculateTotalQuantity(query.data.map(location => ({
      boxNo: location.box_no,     // Transform snake_case API
      locNo: location.loc_no,     // to camelCase domain model
      quantity: location.qty,
    })));
  }, [query.data]);

  return {
    ...query,
    totalQuantity, // Enhanced data
  };
}
```

#### Model Transformation
The codebase follows a pattern of transforming snake_case API responses to camelCase domain models:

```typescript
// ✅ Consistent transformation pattern used in custom hooks
const transformedData = apiData.map(item => ({
  boxNo: item.box_no,    // snake_case from API
  locNo: item.loc_no,    // to camelCase for frontend
  quantity: item.qty,
}));
```

### Component Architecture

#### Form Components
- Use controlled components with local state for form data
- Include validation logic within the component
- Separate create and edit logic clearly

```typescript
interface PartFormProps {
  partId?: string;        // undefined = create mode
  onSuccess: (partId: string) => void;
  onCancel?: () => void;
}
```

#### Data Display Components
- Accept data as props rather than fetching internally
- Use loading and error states from parent containers

```typescript
// ✅ Good - Pure component accepting data
interface PartListProps {
  parts: Part[];
  isLoading: boolean;
  error?: string;
}

// ❌ Avoid - Component doing its own data fetching
// const { data: parts } = useParts(); // Don't do this in display components
```

### State Management

#### Global State (Contexts)
- Use React Context sparingly for truly global state
- Current contexts: `ToastContext` for notifications

#### Component State
- Use `useState` for local component state
- Use `useFormState` custom hook for complex form logic

#### Server State  
- **Always** use React Query (TanStack Query) for server state
- Never store server data in component state or contexts

### Error Handling

This codebase implements **centralized, automatic error handling**. Manual error handling should rarely be needed.

#### Global Error Handling
- **React Query** (`src/lib/query-client.ts`) automatically shows toast notifications for all mutation errors
- **Error parsing** (`src/lib/utils/error-parsing.ts`) transforms API errors into user-friendly messages
- **Toast system** (`src/contexts/toast-context.tsx`) displays errors consistently across the app

#### How It Works
```typescript
// ❌ DON'T manually handle errors in components
const createPartMutation = usePostParts({
  onError: (error) => {
    console.error('Failed to create part:', error); // Avoid this
  },
});

// ✅ DO rely on automatic error handling
const createPartMutation = usePostParts(); // Errors shown automatically
```

The system automatically:
1. Parses API errors using typed schema validation
2. Shows appropriate user messages via toast notifications  
3. Handles network errors, validation errors, and server errors
4. Provides retry logic for transient failures

#### When to Handle Errors Manually
Only handle errors manually for:
- **Custom error recovery logic** (e.g., redirect on auth failure)
- **Form validation** that requires field-specific error display
- **Silent errors** where toast notification isn't appropriate

## UI Testing (Playwright) — How Claude should work

The project uses **Playwright** for end-to-end testing with a focus on the Types feature as the pilot implementation. The testing strategy emphasizes stable selectors, observable events, and feature ownership patterns.

The document at `tests/README.md` has technical guidance on how to write tests for the Playwright test suite.

### Running Tests Locally

**Headless mode (CI/default):**
```bash
pnpm playwright test
```

Playwright tests cannot be run headed.

**Debug mode:**
```bash
pnpm playwright test --debug
```

**Run specific test file:**
```bash
pnpm playwright test tests/e2e/types/types-workflow.spec.ts
```

**Run specific test:**
```bash
pnpm playwright test -g "should create a new type successfully"
```

## Definition of Done

For any code to be considered complete, it must:

### ✅ Code Quality
- [ ] Follows TypeScript strict mode (no `any` types)
- [ ] Uses existing patterns and architecture  
- [ ] Relies on automatic error handling system (avoid manual onError handlers)
- [ ] Avoid console.log in production code (some debugging logs exist in current codebase)
- [ ] Follows naming conventions

### ✅ API Integration
- [ ] Uses generated API client hooks
- [ ] Transforms API data to domain models
- [ ] Handles loading and error states
- [ ] Implements optimistic updates where appropriate

### ✅ Testing
- [ ] Testing framework not implemented yet
- [ ] Consider adding tests for complex business logic when testing is set up

### ✅ Performance
- [ ] Proper React Query caching strategies
- [ ] Memoized expensive calculations
- [ ] Lazy loading for large datasets
- [ ] No unnecessary re-renders

### ✅ TypeScript
- [ ] All props and return types explicitly defined
- [ ] No TypeScript errors or warnings
- [ ] Uses generated API types exclusively
- [ ] Proper type guards for runtime validation

## Commands & Scripts

### Development
```bash
pnpm dev                 # Start development server
pnpm type-check          # Run TypeScript type checking
pnpm lint                # Run ESLint
pnpm generate:api        # Fetch and generate API client
```

### Build & Deploy
```bash
pnpm build               # Production build
pnpm preview             # Preview production build
```

### API Client Generation
```bash
pnpm generate:api        # Fetch OpenAPI spec and generate client
pnpm generate:routes     # Generate route types
```

**Important**: Always run `pnpm generate:api` after backend API changes to ensure type safety.

## Key Principles

1. **Type Safety First**: Use generated types; avoid `any`
2. **Test Everything**: No code without tests
3. **Follow Patterns**: Consistency over cleverness  
4. **Domain-Driven Structure**: Organize by business domains
5. **Performance Conscious**: Optimize for user experience
6. **Error Resilience**: Handle failure cases gracefully

This system manages physical electronics inventory as detailed in the product brief. Every component serves the core workflows of labeling, storing, finding, and organizing electronics parts efficiently.

## Command Templates

The repository includes command templates for specific development workflows:

- When writing a product brief: @docs/commands/create_brief.md
- When planning a new feature: @docs/commands/plan_feature.md
- When reviewing a plan: @docs/commands/review_plan.md
- When doing code review: @docs/commands/code_review.md
- When planning or implementing a new feature, reference the product brief at @docs/product_brief.md

Use these files when the user asks you to perform the applicable action.