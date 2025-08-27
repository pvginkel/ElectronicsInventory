# Type Management UI Plan

## Brief Description

Create a minimal type maintenance interface for managing part types. Simple CRUD operations with basic search and validation - focused on occasional maintenance tasks rather than power user features.

## Files and Functions to be Created or Modified

### Core Type Management Components
- `src/components/types/TypeList.tsx` - **NEW** - Simple list of all types with search
- `src/components/types/TypeForm.tsx` - **NEW** - Create/edit type form with validation
- `src/components/types/TypeCard.tsx` - **NEW** - Individual type display with basic actions
- `src/routes/types/index.tsx` - **NEW** - Types management page
- `src/hooks/use-types.ts` - **MODIFY** - Add CRUD operations

### Integration with Existing System
- `src/components/layout/sidebar.tsx` - **MODIFY** - Add types management link

## Step-by-Step Implementation

### Phase 1: Basic Type Management Interface
1. **Create TypeList component** - Simple type display following box management pattern:
   - Header with title and "Add Type" button
   - Grid layout for type cards (similar to box grid)
   - Basic search input for filtering types by name
   - Loading states with skeleton cards
   - Empty state with helpful message

2. **Create TypeCard component** - Individual type display following BoxCard pattern:
   - Card with type name as title
   - Usage count display (X parts using this type)
   - Simple action buttons: Edit, Delete
   - No usage indicators or trends
   - Confirmation dialog for deletion

3. **Create TypeForm component** - Basic type editing following BoxForm pattern:
   - Dialog-based form with name field only
   - Name validation (required, unique, length limits)
   - Standard form handling with cancel/submit buttons
   - Support for both create and edit modes

4. **Create types route** - Simple page layout:
   - Standard page wrapper consistent with boxes page
   - TypeList component as main content
   - No additional features or navigation

5. **Add sidebar navigation** - Link to types management:
   - Add "Types" link to sidebar following existing pattern
   - Place after "Storage" section

6. **Extend use-types hook** - Add CRUD operations:
   - Create, update, delete mutations
   - Proper error handling and loading states
   - Query invalidation for cache updates