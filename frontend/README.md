```
       _____ _                 _      
      / ____| |               | |     
     | |    | | __ _ _   _  __| | ___ 
     | |    | |/ _` | | | |/ _` |/ _ \
     | |____| | (_| | |_| | (_| |  __/
      \_____|_|\__,_|\__,_|\__,_|\___|
                                      
        _____ _     
       / ____| |    
      | |    | | ___
      | |    | |/ _ \
      | |____| |  __/
       \_____|_|\___|
                     
            _____          _      
           / ____|        | |     
          | |     ___   __| | ___ 
          | |    / _ \ / _` |/ _ \
          | |___| (_) | (_| |  __/
           \_____\___/ \__,_|\___|
                                  
```

# Electronics Inventory Management System - Frontend

**Keep track of hobby electronics parts so you always know what you have, where it is, and how to get more.**

[![Built with Claude Code](https://img.shields.io/badge/Built%20with-Claude%20Code-black?style=flat&logo=anthropic)](https://claude.ai/code)

> **🤖 Built with Claude Code** - This project was developed using [Claude Code](https://claude.ai/code), Anthropic's AI-powered development assistant.

## Overview

A modern React frontend for managing hobby electronics inventory. This application provides an intuitive interface for organizing, tracking, and finding electronic components with smart location suggestions and AI-powered assistance.

**Target Audience:** Individual hobby electronics enthusiasts who want to efficiently manage their component inventory without the complexity of enterprise solutions.

**Key Benefits:**
- **Simple Organization**: Numbered boxes with numbered locations for easy physical organization
- **Fast Search**: Single search box finds parts by ID, manufacturer code, type, description, or tags
- **Smart Suggestions**: AI-powered location recommendations and part categorization
- **Mobile-Friendly**: Touch-optimized interface with responsive design
- **Document Management**: Attach and view PDFs, images, and links directly in the app

## Features

This frontend implements Phase 1 of the [hobby electronics inventory system](docs/product_brief.md). For a complete feature overview, see [docs/features.md](docs/features.md).

### Core Features ✅
- **Part Management**: Add, edit, and organize electronic parts with comprehensive metadata
- **Inventory Tracking**: Track quantities across multiple storage locations
- **Box & Location System**: Manage numbered boxes with configurable numbered locations
- **Advanced Search**: Find parts instantly with real-time search across all fields
- **Type Management**: Create and manage part categories with full CRUD operations
- **Mobile Optimization**: Responsive design optimized for phone and tablet usage
- **AI Integration**: Smart part analysis and auto-tagging capabilities

### Advanced Features 🔄
- **Document Viewing**: PDF and image viewing with upload capabilities
- **Smart Suggestions**: Location recommendations and reorganization planning
- **Project Management**: Track project requirements and stock availability
- **Shopping Lists**: Manage parts to purchase with conversion to inventory

## Technology Stack

- **React 19** with TypeScript for modern component architecture
- **TanStack Router** for type-safe routing and navigation
- **TanStack Query** (React Query) for powerful API state management
- **OpenAPI Client** for type-safe backend communication
- **Tailwind CSS** with custom components for consistent styling
- **Vite** for fast development and optimized builds

## Getting Started

### Prerequisites

- **Node.js 18+** and **pnpm** package manager
- **Backend service** running (see [backend README](../backend/README.md))

### Installation & Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd ElectronicsInventory/frontend
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Configure backend connection**
   
   The app expects the backend API to be running on `http://localhost:8000` by default. If your backend runs on a different port, update the API configuration in the environment or configuration files.

4. **Generate API client**
   ```bash
   pnpm generate:api
   ```
   
   This fetches the OpenAPI specification from the backend and generates TypeScript types and client hooks.

5. **Start development server**
   ```bash
   pnpm dev
   ```
   
   The application will be available at `http://localhost:3000`

## Development

### Available Scripts

```bash
# Development
pnpm dev                 # Start development server with hot reload
pnpm type-check          # Run TypeScript type checking
pnpm lint                # Run ESLint for code quality

# API Client Management
pnpm generate:api        # Fetch OpenAPI spec and regenerate client
pnpm generate:routes     # Generate TanStack Router route types

# Build & Deploy
pnpm build               # Create production build
pnpm preview             # Preview production build locally
```

### Code Standards

This project follows the development guidelines outlined in [CLAUDE.md](CLAUDE.md). Key principles:

- **Type Safety First**: Use generated OpenAPI types exclusively
- **Domain-Driven Architecture**: Organize code by business domains (parts, boxes, types)
- **Automatic Error Handling**: Leverage centralized error management
- **React Query Patterns**: Use server state management consistently
- **Component Composition**: Prefer editing existing components over creating new ones

### API Integration

The application uses a generated API client based on the backend's OpenAPI specification. Always run `pnpm generate:api` after backend API changes to maintain type safety.

```typescript
// Example: Using generated API hooks
import { useGetParts, usePostParts } from '@/lib/api/generated/hooks';

const { data: parts, isLoading } = useGetParts();
const createPartMutation = usePostParts();
```

## Build & Deployment

### Production Build

```bash
pnpm build
```

The build process:
1. Generates API client from cached OpenAPI spec
2. Generates route types for TanStack Router
3. Runs TypeScript compilation
4. Creates optimized Vite build in `dist/`

### Preview Build

```bash
pnpm preview
```

Serves the production build locally for testing before deployment.

### Deployment Considerations

- **Static Hosting**: The built application is a static SPA suitable for CDN deployment
- **API Configuration**: Ensure the backend API URL is properly configured for your deployment environment
- **CORS Settings**: Backend must allow requests from your frontend domain

## Contributing

This is a research project exploring AI-assisted development workflows. Contributions should follow these guidelines:

1. **Fork and Pull Request**: Create feature branches and submit PRs for review
2. **Code Standards**: Follow patterns established in [CLAUDE.md](CLAUDE.md)
3. **Type Safety**: Maintain strict TypeScript compliance
4. **Testing**: Add appropriate tests when the testing framework is implemented

### Development Workflow

1. Run `pnpm generate:api` to ensure you have the latest API types
2. Make your changes following existing patterns
3. Run `pnpm type-check` and `pnpm lint` to verify code quality
4. Test your changes with `pnpm dev`
5. Submit a pull request with a clear description

## Research Project Notice

This project is part of ongoing research into AI-assisted software development. The codebase demonstrates patterns and practices for building modern React applications with AI development tools like Claude Code.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.

---

**Built with [Claude Code](https://claude.ai/code)** - Experience the future of AI-assisted development.