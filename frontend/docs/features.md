# Phase 1

## Part Management UI
- [x] Display 4-letter part IDs prominently in all views
- [x] Create part entry form with all core fields
- [x] Edit part details (manufacturer code, description, type, tags)
- [x] Type/category selector with full CRUD operations
- [x] Tags input with manual entry support
- [x] Display seller information and product page links
- [x] Delete parts with confirmation (only if zero quantity)
- [ ] Photo capture (mobile camera integration)
- [ ] Show part image gallery with main photo selection
- [ ] Auto-suggest tags from AI analysis results

## Inventory Visualization
- [x] Show numbered boxes with capacity indicators
- [x] Display box contents as grid of numbered locations
- [ ] Visualize location occupancy (filled/empty status)
- [x] Show quantities at each location for multi-location parts
- [ ] Color-code locations by part categories

## Stock Operations Interface
- [x] "Add Stock" dialog with quantity input and location suggestions
- [x] "Use Items" interface with location selection and quantity deduction
- [ ] "Move Items" flow with source/destination location picker
- [ ] Split quantity interface for distributing across locations
- [x] Inline quantity editing with save/cancel actions

## Search & Discovery
- [x] Single search box with real-time results
- [x] Display search results with quantities and locations
- [x] Show part details in dedicated part view pages
- [x] Navigate to individual part pages from search results

## Document Viewing
- [ ] PDF viewer using PDF.js for in-app datasheet viewing
- [ ] Image gallery for part photos and documentation
- [ ] Document upload interface with drag-and-drop
- [ ] Link input for external documentation URLs

## Box & Location Management
- [x] Create new boxes with configurable capacity
- [x] Edit box details (description, capacity)
- [x] Delete empty boxes with confirmation
- [x] Location numbering display (left-to-right, top-to-bottom)
- [x] Box utilization charts and capacity indicators
- [x] Visual location list with occupancy status

## Mobile Optimization
- [ ] Camera integration for part photos
- [x] Touch-friendly quantity input (large buttons)
- [x] Responsive layout for phone/tablet usage

## AI Assistant Integration
- [ ] Photo analysis interface with part number extraction
- [ ] Category suggestion acceptance/rejection
- [ ] Auto-tagging review and editing
- [ ] Datasheet discovery progress indicators

## Performance & UX
- [ ] Show thumbnails in search results and lists
- [ ] Lazy loading for large part collections
- [x] Optimistic UI updates for stock operations
- [x] Loading states and skeleton UI for async operations
- [x] Error handling with user-friendly messages
- [x] Toast notifications for all operations

## Type/Category Management (Implemented)
- [x] Create, edit, and delete part types/categories
- [x] Type selector component with search functionality
- [x] Display part count per type
- [x] Type-based location suggestions for organization
- [x] Full CRUD operations with confirmation dialogs

## Dashboard & Navigation (Implemented) 
- [x] Dashboard with metrics overview (mock data)
- [x] Quick action cards for common workflows
- [x] Recent activity feed display
- [x] Suggestions panel for maintenance tasks
- [x] Responsive sidebar navigation
- [x] Breadcrumb navigation

# Phase 2

## Shopping List Interface
- [ ] Add items to shopping list (existing or new parts)
- [ ] Edit shopping list entries with quantities and notes
- [ ] Convert shopping list items to inventory with location assignment
- [ ] Show shopping list alongside inventory views

## Project Management
- [ ] Create projects with required parts lists
- [ ] Show stock coverage indicators (green/yellow/red status)
- [ ] "Add Missing to Shopping List" batch operation
- [ ] Build project interface with location selection for deductions
- [ ] Project progress tracking and completion status

## Reorganization Interface
- [ ] Trigger reorganization analysis from UI
- [ ] Display proposed move list with visual previews
- [ ] Accept/reject individual move suggestions
- [ ] "Apply All Moves" batch operation with confirmation
- [ ] Before/after layout visualization

## Location Intelligence
- [ ] Show suggested locations with reasoning (category grouping)
- [ ] Location suggestions when adding stock to parts
- [ ] Type-based location recommendations
- [ ] Visual indicators for category clustering in boxes
- [ ] Category dashboard showing box distribution

## Label Generation
- [ ] Print label interface with 4-letter ID text
- [ ] Optional 1D barcode generation if printer supports
- [ ] Label preview with customizable formatting
- [ ] Batch label printing for multiple parts
