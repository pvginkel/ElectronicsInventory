# Seller Registry Frontend Implementation Plan

## Overview
Implement the frontend for Phase 0 of the Shopping List feature - the Seller Registry. This enables management of sellers as entities with Name (required) and Website (required), and updates the Part UI to reference sellers instead of using free-text fields.

**Design Principle**: The implementation must follow the existing Type management UI patterns exactly for consistency and user familiarity.

**Important Backend Implementation Status**:
The backend has been fully updated to support the seller registry:
- **Seller CRUD API**: Complete seller management endpoints are available at `/api/sellers`
- **Part Schema Changes**:
  - **CREATE** (`PartCreateSchema`): Uses `seller_id` field (optional number) to reference a seller
  - **UPDATE** (`PartUpdateSchema`): Uses `seller_id` field (optional number) to reference a seller
  - **READ** (`PartResponseSchema`): Returns `seller` object with seller details (id, name) plus separate `seller_link` field
- **Old Text Fields**: The old text-based seller fields have been removed from the database
- **No Migration Needed**: This is a greenfield implementation - there's no existing data to migrate

## Files to Create

### 1. Route: `/src/routes/sellers/index.tsx`
Main sellers management route following TanStack Router patterns.
- Export `Route` object with search validation for search term
- Render `SellerList` component with search prop
- Include breadcrumb navigation

### 2. Component: `/src/components/sellers/seller-list.tsx`
Main CRUD interface for sellers following the pattern from `TypeList.tsx`.
- Display sellers in a grid layout using `SellerCard` components
- Include search input that updates URL search params
- "Add Seller" button that opens `SellerForm` in create mode
- Handle empty states and loading states
- Use `useGetSellers` hook with search filtering

### 3. Component: `/src/components/sellers/seller-form.tsx`
Dialog-based form for creating and editing sellers following the pattern from `TypeForm.tsx`.
- Props: `sellerId?: number`, `onSuccess: (sellerId: number) => void`, `onCancel?: () => void`
- Fields:
  - Name (required text input)
  - Website (required URL input with validation)
- Use `useFormState` hook for form management
- Use `usePostSellers` for create, `usePutSellersBySellerId` for update
- Include loading states and automatic error handling via React Query

### 4. Component: `/src/components/sellers/seller-card.tsx`
Display component for individual sellers following the pattern from `TypeCard.tsx`.
- Props: `seller: SellerResponseSchema`, `onEdit: () => void`, `onDelete: () => void`
- Display seller name prominently
- Show website with link icon (open in new tab)
- Edit and Delete action buttons
- Delete confirmation dialog
- Use `useDeleteSellersBySellerId` for deletion

### 5. Hook: `/src/hooks/use-sellers.ts`
Custom hooks wrapping generated API hooks with business logic.
- `useSellers(searchTerm?: string)`: Wrap `useGetSellers` with search filtering
- `useSellersSearch(searchTerm?: string)`: For real-time search in selector (debounced)
- `useSellerById(sellerId: number)`: Wrap `useGetSellersBySellerId`
- `useCreateSeller()`: Wrap `usePostSellers` with cache invalidation
- `useUpdateSeller()`: Wrap `usePutSellersBySellerId` with cache invalidation
- `useDeleteSeller()`: Wrap `useDeleteSellersBySellerId` with cache invalidation
- Transform snake_case API responses to camelCase domain models

### 6. Component: `/src/components/ui/searchable-select.tsx`
Generic searchable select component built with Radix UI.
- Built using `@radix-ui/react-popover` and custom search input
- Support for async data loading with search
- Inline creation option when no exact match
- Customizable render props for option display
- Full keyboard navigation support
- Accessible ARIA attributes

### 7. Component: `/src/components/sellers/seller-selector.tsx`
Seller-specific wrapper around `SearchableSelect`.
- Use `SearchableSelect` with seller-specific configuration
- Pass `useSellersSearch` for data fetching
- Custom option rendering to show name and website
- Handle inline creation with seller-specific dialog
- Show selected seller's website below selector

### 8. Component: `/src/components/sellers/seller-create-dialog.tsx`
Simplified creation dialog for use within the selector.
- Minimal form with name and website fields
- Quick creation flow optimized for inline use
- Auto-populate name from search term
- Return created seller ID to selector
- No auto-population of website field

## Files to Modify

### 1. `/src/components/layout/sidebar.tsx`
Add sellers to navigation.
- Insert new navigation item after Types: `{ to: '/sellers', label: 'Sellers', icon: '🏪' }`

### 2. `/src/components/parts/part-form.tsx`
Replace free-text seller fields with seller selector.
- Remove any existing text inputs for seller/vendor name (if they still exist in UI)
- Add `SellerSelector` component (similar to existing `TypeSelector`)
- Keep the seller link input field for the product-specific URL
- When creating/updating parts:
  - Send `seller_id` field (number) for the seller reference
  - Send `seller_link` field (string) for the product page URL at that seller
  - These are independent fields - seller_link is the deep link to this specific part on the seller's website
- Enable inline seller creation from the form
- When a seller is selected, optionally show the seller's homepage (from seller.website) as context

### 3. `/src/components/parts/vendor-info.tsx`
Update to display seller entity information.
- The part response includes:
  - `seller` object with `{id, name}` - the seller entity reference
  - `seller_link` field - the deep link to this specific part on the seller's website
- Use the embedded seller data from the part response (no need for separate fetch)
- Display seller name and make the `seller_link` (product page) a clickable link
- Handle cases where seller is null (parts without sellers)

### 4. `/src/hooks/use-parts.ts`
Update part hooks to handle seller references.
- Modify `useCreatePart` to send both:
  - `seller_id` field (number) - reference to the seller entity
  - `seller_link` field (string) - deep link to the product page
- Modify `useUpdatePart` to send both fields when updating seller info
- Remove any logic related to old text-based seller name fields (if any exist)
- The response will include the populated seller object when a seller_id is set

### 5. `/src/components/types/type-selector.tsx`
Refactor to use the new `SearchableSelect` component.
- Replace custom dropdown implementation with `SearchableSelect`
- Maintain all existing functionality
- Improve accessibility and mobile support
- Reduce code complexity

### 6. `/src/types/index.ts`
Add seller-related type definitions if needed.
- May need to extend Part type to include `sellerId?: number`
- Ensure compatibility with generated API types

## Implementation Phases

### Phase 1: Radix UI Migration (Prerequisite)
This phase MUST be completed before implementing seller support.

#### Step 1.1: Install Radix UI Dependencies
1. Install `@radix-ui/react-popover` package
2. Optionally install `@radix-ui/react-command` for command palette UX

#### Step 1.2: Create Generic SearchableSelect Component
1. Build `searchable-select.tsx` using Radix UI Popover
2. Implement search input with debouncing
3. Add support for async data loading
4. Include "Create new" option functionality
5. Ensure full keyboard navigation and accessibility

#### Step 1.3: Refactor TypeSelector with Radix UI
1. Update `type-selector.tsx` to use `SearchableSelect`
2. Maintain all existing functionality
3. Test thoroughly to ensure no regressions
4. Verify improved accessibility

### Phase 2: Seller Management Implementation
Only begin this phase after Phase 1 is complete and tested.

#### Step 2.1: Create Seller Management UI
1. Create the sellers route file with search validation
2. Implement `use-sellers.ts` hooks with all CRUD operations
3. Build `seller-form.tsx` with validation for name and website
4. Create `seller-card.tsx` for display
5. Implement `seller-list.tsx` (following TypeList pattern exactly)
6. Add sellers to sidebar navigation

#### Step 2.2: Implement Seller Selector
1. Create `seller-selector.tsx` using `SearchableSelect`
2. Create `seller-create-dialog.tsx` for inline creation
3. Add `useSellersSearch` hook for debounced search
4. Test selector with creation flow

#### Step 2.3: Update Part UI for Seller References
1. Replace text fields in `part-form.tsx` with `SellerSelector`
2. Update `vendor-info.tsx` to display seller entity data
3. Update `use-parts.ts` hooks to handle `seller_id`
4. Test the complete flow

## Important: Two Different URL Fields

To avoid confusion, there are two completely separate URL fields in this system:

1. **Seller.website** - The seller's homepage (e.g., https://www.digikey.com)
   - Stored on the Seller entity
   - Required when creating a seller
   - Represents the company's main website

2. **Part.seller_link** - The product-specific page URL (e.g., https://www.digikey.com/en/products/detail/arduino/A000066)
   - Stored on the Part entity
   - Optional field
   - Deep link to this specific part on the seller's website
   - Independent of the seller selection (you can have a seller_link without a seller_id and vice versa)

## Validation Rules
- Seller name: Required, non-empty string, must be unique (enforced by backend)
- Seller website: Required, valid URL format (https://example.com)
- Duplicate seller names: Backend returns error, display via automatic toast notification
- Part seller reference: Optional, must be valid seller ID from dropdown
- Part seller link: Optional, should be a valid URL but no cross-validation with seller needed

## Error Handling
- Rely on automatic React Query error handling with toast notifications
- Form validation errors displayed inline
- Network errors handled by global error handler
- Deletion conflicts (seller in use) shown via toast with clear message

## Cache Management
- Invalidate sellers query cache after create/update/delete
- Invalidate parts query cache when seller reference changes
- Use optimistic updates for better UX on seller operations

## Testing Considerations
- Verify seller CRUD operations
- Test part form with seller selector and inline creation
- Validate URL format for website field
- Test search functionality in seller list
- Verify proper error messages for validation failures (especially duplicate names)
- Test seller selector dropdown behavior and keyboard navigation
- Verify inline seller creation from part form
- Test Phase 1 TypeSelector refactor thoroughly before proceeding to Phase 2

## Design Consistency Requirements

### Follow Type Management Patterns
The seller management UI must be visually and functionally identical to the Type management UI:
- Same card layout with entity name and usage count
- Identical grid responsive breakpoints
- Same search input with clear button
- Matching empty states and loading skeletons
- Consistent dialog forms for create/edit
- Same confirmation dialogs for deletion

### Selector Component Consistency
The `seller-selector.tsx` must follow the exact same patterns as `type-selector.tsx`:
- Same dropdown behavior and positioning
- Identical search-as-you-type functionality
- Matching "Create" option appearance
- Same dialog flow for inline creation
- Consistent loading and error states

## Required Radix UI Migration

### Refactor Type and Seller Selectors with Radix UI
As part of this implementation, both the existing TypeSelector and new SellerSelector must be refactored to use Radix UI components.

**Current Issues with Custom Implementation:**
- Complex focus management and click-outside detection
- Manual dropdown positioning and overflow handling
- Custom keyboard navigation logic
- State synchronization complexity
- Inconsistent behavior across browsers

**Radix UI Implementation:**
1. **Install Required Packages:**
   - `@radix-ui/react-select` or `@radix-ui/react-popover`
   - Consider `@radix-ui/react-command` for command palette-style search

2. **Create Shared Components:**
   - `/src/components/ui/searchable-select.tsx` - Generic searchable select component using Radix UI
   - Support search, selection, and inline creation
   - Built-in accessibility (ARIA attributes, keyboard navigation)
   - Proper focus management and positioning

3. **Refactor Both Selectors:**
   - Update `TypeSelector` to use new `SearchableSelect` component
   - Implement `SellerSelector` using the same `SearchableSelect` component
   - Ensure consistent behavior and appearance

**Benefits:**
- Built-in accessibility features
- Automatic positioning with collision detection
- Portal rendering to avoid z-index issues
- Reduced code complexity and maintenance burden
- Better mobile support