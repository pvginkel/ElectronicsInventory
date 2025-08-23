# Box and Location Management UI - Technical Plan

## Brief Description

Implement a complete UI for creating, managing, and viewing storage boxes and their locations. The system supports numbered boxes with configurable capacity (1-50 locations), where locations are automatically generated sequentially and displayed as a simple list.

## API Coverage

Based on the OpenAPI specification, the following endpoints will be utilized:
- `GET /boxes` - List all boxes with summary info
- `POST /boxes` - Create new box with specified capacity
- `GET /boxes/{box_no}` - Get box details with all locations
- `PUT /boxes/{box_no}` - Update box description and capacity
- `DELETE /boxes/{box_no}` - Delete empty box
- `GET /boxes/{box_no}/locations` - Get all locations in a box
- `GET /locations/{box_no}/{loc_no}` - Get specific location details

## Files to Create or Modify

### New Component Files to Create

1. **`src/components/boxes/box-list.tsx`**
   - Grid display of all boxes with summary information
   - Actions: create, edit, delete, view details

2. **`src/components/boxes/box-card.tsx`**
   - Individual box card component showing box_no, description, capacity, and usage stats
   - Quick action buttons for edit/delete/view

3. **`src/components/boxes/box-form.tsx`**
   - Form for creating and editing boxes
   - Fields: description (required, 1-255 chars), capacity (required, 1-50)
   - Form validation and error handling

4. **`src/components/boxes/box-details.tsx`**
   - Detailed view of a single box with all locations
   - Simple list layout for locations
   - Navigation back to box list

5. **`src/components/boxes/location-list.tsx`**
   - List component displaying all locations in a box
   - Simple sequential list of numbered locations (max 50 locations)

6. **`src/components/boxes/location-item.tsx`**
   - Individual location list item component
   - Shows location number (loc_no) and current status
   - Placeholder for future part assignment functionality

7. **`src/components/ui/dialog.tsx`**
   - Reusable dialog component for confirmations and forms
   - Delete confirmation dialog
   - Form modals

8. **`src/components/ui/form.tsx`**
   - Form wrapper components with validation
   - Error display and field validation states

### Route Files to Modify

1. **`src/routes/boxes/index.tsx`**
   - Replace placeholder with BoxList component
   - Handle loading and error states
   - Page title and navigation

2. **`src/routes/boxes/$boxNo.tsx`** (new file)
   - Box details page showing individual box and all locations
   - URL parameter handling for box_no
   - Navigation breadcrumbs

### Hook Files to Create

1. **`src/hooks/use-confirm.ts`**
   - Custom hook for confirmation dialogs
   - Used for delete confirmations

2. **`src/hooks/use-form-state.ts`**
   - Custom hook for managing form state and validation
   - Error handling and submission states

## Step-by-Step Algorithm

### Box List View Algorithm
1. Fetch all boxes using `useGet__boxes()` hook
2. Display loading skeleton while fetching
3. Render boxes in responsive grid layout
4. For each box, calculate usage statistics (future: occupied/total locations)
5. Handle empty state with call-to-action to create first box
6. Implement search/filter functionality for large box collections

### Box Creation Flow
1. Open creation form in modal dialog
2. Validate description (1-255 characters, required)
3. Validate capacity (1-50, integer, required)
4. Submit using `usePost__boxes()` mutation
5. Handle success: invalidate queries, show success message, close modal
6. Handle errors: display validation errors inline

### Box Edit Flow
1. Pre-populate form with existing box data from `useGet__boxes_{box_no}()`
2. Allow editing description and capacity
3. Validate capacity changes (warn if reducing below current usage)
4. Submit using `usePut__boxes_{box_no}()` mutation
5. Handle success/error states similar to creation

### Box Delete Flow
1. Check if box is empty (no parts assigned to locations)
2. Show confirmation dialog with box details
3. Submit using `useDelete__boxes_{box_no}()` mutation
4. Handle success: remove from list, show confirmation message
5. Handle errors: display error message (e.g., box not empty)

### Location List Layout Algorithm
1. Fetch box details and locations using `useGet__boxes_{box_no}()`
2. Render locations as a simple sequential list (1, 2, 3, ..., capacity, max 50)
3. Apply visual states: empty, occupied (future), selected (future)
4. Simple list rendering - no virtualization needed for small counts

### Location Display Algorithm
1. Each location shows as a list item with clear numbering
2. Location identifier format: "BOX-LOCATION" (e.g., "7-3")
3. Simple row layout with location number and status information
4. Hover states and click handlers for future part assignment
5. Keyboard navigation support for accessibility

## Implementation Phases

### Phase 1: Basic Box Management
- Create BoxList component with grid layout
- Implement BoxCard component with summary information
- Add BoxForm for create/edit operations with validation
- Implement delete functionality with confirmation
- Update boxes route with new components
- Add loading, error, and empty states

### Phase 2: Box Details and Location List
- Create BoxDetails component with detailed view
- Implement LocationList with simple list layout
- Add LocationItem components for individual locations
- Create box details route with parameter handling
- Add navigation between list and detail views
- Implement breadcrumb navigation

### Phase 3: UI Polish and Enhancement
- Add search and filter functionality to box list
- Implement keyboard shortcuts and accessibility features
- Add animations and transitions for better UX
- Simple list rendering optimization for small location counts
- Add bulk operations (future: select multiple boxes)
- Implement comprehensive error boundaries

## Key Technical Considerations

### State Management
- Use existing TanStack Query hooks for server state
- Implement optimistic updates for better UX
- Handle cache invalidation properly after mutations
- Use React state for client-side UI state (modals, selections)

### Form Validation
- Client-side validation using custom validation logic
- Server-side error handling and display
- Real-time validation feedback during input
- Prevent invalid submissions

### Responsive Design
- Mobile-first approach using Tailwind CSS
- Adaptive list layouts for different screen sizes
- Touch-friendly interactions for mobile devices
- Ensure accessibility on all devices

### Performance Optimization
- Simple list rendering for small location counts (max 50)
- Debounce search inputs to prevent excessive API calls
- Use React.memo() for location items to prevent unnecessary re-renders
- Implement proper loading states to improve perceived performance

### Error Handling
- Network error recovery with retry mechanisms
- User-friendly error messages for API failures
- Form validation error display
- Global error boundary for unexpected errors

### Accessibility
- ARIA labels for list layouts and interactive elements
- Keyboard navigation support for all functionality
- Screen reader compatibility
- High contrast mode support
- Focus management for modals and forms