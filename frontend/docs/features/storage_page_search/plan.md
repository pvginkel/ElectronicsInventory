# Storage Page Search Implementation Plan

## Brief Description

Add search functionality to the storage (boxes) page with query string persistence. Users can search for boxes by typing in a search input, with the search term reflected in the URL (`?search=abc`) and restored when navigating back from box details.

## Files to Create or Modify

### Files to Modify:

1. **`src/routes/boxes/index.tsx`**
   - Add `validateSearch` to route definition to handle `search` query parameter
   - Update `Boxes` component to receive search state from route
   - Pass search state to BoxList component

2. **`src/components/boxes/box-list.tsx`** 
   - Add search input component (following pattern from `part-list.tsx`)
   - Add search functionality to filter boxes by description and box number
   - Accept search props from parent route component
   - Implement controlled search input that updates URL via navigation

## Algorithm Details

### Query Parameter Handling

**Route Definition Pattern:**
```typescript
// In src/routes/boxes/index.tsx
export const Route = createFileRoute('/boxes/')({
  validateSearch: (search: Record<string, unknown>) => {
    return {
      search: (search.search as string) || ''
    }
  },
  component: Boxes,
})
```

**Component Integration Pattern:**
```typescript
// Access search from route and pass to BoxList
function Boxes() {
  const { search } = Route.useSearch()
  return <BoxList searchTerm={search} />
}
```

### Search Implementation

**Search Input Component:**
- Use controlled input with `value` from route search parameter
- On change, navigate to update URL query string using TanStack Router's `useNavigate`
- Debounce navigation updates to avoid excessive URL changes

**Filtering Logic:**
- Filter boxes by:
  - Box number (convert to string for matching)  
  - Box description (case-insensitive)
- Return filtered results in same sort order as current implementation

**Search State Management:**
- URL serves as single source of truth for search state
- Navigation updates URL immediately 
- Back/forward browser navigation restores search state automatically
- No local component state needed for search term

### Navigation Pattern

```typescript
// In BoxList component  
const navigate = useNavigate()
const handleSearchChange = (value: string) => {
  navigate({
    to: '/boxes',
    search: { search: value },
    replace: true // Use replace to avoid flooding browser history
  })
}
```

## Implementation Phases

### Phase 1: Route Configuration
- Update route definition with `validateSearch`
- Modify route component to extract and pass search parameter

### Phase 2: Search UI 
- Add search input to BoxList component header
- Implement controlled input with navigation-based state management

### Phase 3: Search Logic
- Implement filtering function for boxes
- Update display logic to show filtered results
- Add results summary (similar to parts page)

## Integration Notes

- Follow existing patterns from `src/components/parts/part-list.tsx` for search UI consistency
- Use TanStack Router's built-in search parameter validation and type safety
- Maintain existing BoxList component API for other consumers
- Preserve all existing functionality (create, edit, delete, view box operations)