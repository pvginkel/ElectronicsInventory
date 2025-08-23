# Basic App Setup Plan

## Brief Description
Set up the minimal foundation for the Electronics Inventory frontend application using React 19.1 + TypeScript with Vite, following the technical design specifications. This includes the build system, package management, basic routing structure, and core dependencies without any business logic or API integration.

## Files to Create/Modify

### Package Management & Build System
- `package.json` - Configure pnpm workspace, scripts, and core dependencies
- `vite.config.ts` - Vite configuration with React plugin, path aliases, and dev server setup
- `tsconfig.json` - TypeScript strict configuration with path mappings
- `tsconfig.node.json` - Node-specific TypeScript config for Vite

### Linting & Code Quality
- `eslint.config.js` - Flat ESLint configuration with TypeScript and React rules
- `.gitignore` - Ignore dist/, node_modules/, generated code

### Styling System
- `tailwind.config.js` - Tailwind CSS configuration with design tokens
- `postcss.config.js` - PostCSS configuration with Tailwind and autoprefixer
- `src/index.css` - Global styles and CSS variable definitions for theming

### Core Application Structure
- `src/main.tsx` - Application entry point with React.StrictMode
- `src/App.tsx` - Root app component with router and providers
- `index.html` - HTML template with viewport meta and title

### Routing Foundation
- `src/routes/__root.tsx` - Root route layout
- `src/routes/index.tsx` - Home page placeholder
- `src/routes/search.tsx` - Search page placeholder
- `src/routes/parts/index.tsx` - Parts list placeholder
- `src/routes/boxes/index.tsx` - Boxes list placeholder

### Library Setup
- `src/lib/utils.ts` - Utility functions for class merging (cn helper)
- `src/lib/ui/index.ts` - Re-export utility functions

### Environment Configuration
- `.env.example` - Example environment variables
- `src/vite-env.d.ts` - Vite environment type definitions

## Step-by-Step Implementation

### Phase 1: Initialize Project Structure
1. Run `npm create vite@latest my-app -- --template react-ts` to create base Vite project
2. Replace npm with pnpm in package.json and remove package-lock.json
3. Install core dependencies: React 19.1, TypeScript ~5.9, TanStack Router v1
4. Configure TypeScript with strict mode and path aliases

### Phase 2: Configure Build System
1. Set up Vite configuration with React plugin and path aliases
2. Configure ESLint with flat config using typescript-eslint and React rules
3. Add pnpm scripts for dev, build, lint, type-check
4. Set up module system as ES modules with "type": "module"

### Phase 3: Styling Infrastructure
1. Install and configure Tailwind CSS v3.4 with PostCSS
2. Install Radix UI utilities: class-variance-authority, tailwind-merge, clsx
3. Set up CSS variables for HSL color tokens and theming
4. Configure dark mode with class-based strategy

### Phase 4: Routing Foundation
1. Install TanStack Router v1 with CLI for code generation
2. Create file-based routing structure with placeholder components
3. Set up root route with basic layout
4. Add route generation script to package.json

### Phase 5: Basic Component Structure
1. Create minimal utility functions (cn helper for class merging)
2. Set up path aliases in both TypeScript and Vite configs
3. Create placeholder route components following the defined structure
4. Ensure all imports use absolute paths with @ aliases

### Phase 6: Development Environment
1. Configure Vite dev server on port 3000 with host: true
2. Set up environment variable structure with VITE_ prefix
3. Add .env.example with VITE_API_BASE_URL placeholder
4. Verify hot module replacement works correctly

## Key Technical Requirements Met
- **Package Manager**: pnpm as specified
- **Build Tool**: Vite with React plugin
- **Module System**: ES Modules with "type": "module"
- **TypeScript**: Strict mode with ES2022 target
- **Routing**: TanStack Router v1 with file-based routing
- **Styling**: Tailwind CSS v3.4 with PostCSS and Radix utilities
- **Path Aliases**: @/components, @/routes, @/lib, @/hooks, @/types
- **Development**: Port 3000 with proper environment variable structure

## Scripts Available After Setup
- `pnpm dev` - Start development server
- `pnpm build` - Build for production with type checking
- `pnpm lint` - Run ESLint
- `pnpm type-check` - Run TypeScript compiler
- `pnpm generate:routes` - Generate TanStack Router tree

This setup provides the minimal foundation required to start building the Electronics Inventory application while following all applicable technical design decisions.