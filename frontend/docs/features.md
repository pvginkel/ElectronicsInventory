# Frontend Features Checklist

## Part Management UI
- [x] Display 4-letter part IDs prominently in all views
- [ ] Create part entry form with photo capture (mobile camera)
- [x] Edit part details (manufacturer code, description, type, tags)
- [ ] Show part image gallery with main photo selection
- [x] Display seller information and product page links
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
- [x] Quick keypad for numeric quantity entry

## Search & Discovery
- [x] Single search box with real-time results
- [x] Display search results with quantities and locations
- [ ] Show part details in expandable cards or modal
- [ ] Navigate directly to part locations from search results

## Document Viewing
- [ ] PDF viewer using PDF.js for in-app datasheet viewing
- [ ] Image gallery for part photos and documentation
- [ ] Document upload interface with drag-and-drop
- [ ] Link input for external documentation URLs

## Box & Location Management
- [x] Create new boxes with configurable capacity
- [ ] Visual box layout editor (grid representation)
- [x] Location numbering display (left-to-right, top-to-bottom)
- [x] Box utilization charts and capacity indicators

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
- [x] Show suggested locations with reasoning (category grouping)
- [ ] Visual indicators for category clustering in boxes
- [ ] "Smart Fill" recommendations when adding stock
- [ ] Category dashboard showing box distribution

## Label Generation
- [ ] Print label interface with 4-letter ID text
- [ ] Optional 1D barcode generation if printer supports
- [ ] Label preview with customizable formatting
- [ ] Batch label printing for multiple parts

## Mobile Optimization
- [ ] Camera integration for part photos
- [x] Touch-friendly quantity input (large buttons)
- [x] Responsive layout for phone/tablet usage
- [ ] Offline-first capability for basic operations

## AI Assistant Integration
- [ ] Photo analysis interface with part number extraction
- [ ] Category suggestion acceptance/rejection
- [ ] Auto-tagging review and editing
- [ ] Datasheet discovery progress indicators

## Performance & UX
- [ ] Show thumbnails in search results and lists
- [ ] Lazy loading for large part collections
- [ ] Optimistic UI updates for stock operations
- [ ] Loading states for AI operations and background jobs
- [x] Error handling with user-friendly messages