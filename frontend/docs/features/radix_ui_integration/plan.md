# Radix UI Integration Plan

## Brief Description

Integrate Radix UI primitives to replace custom UI components with battle-tested, accessible alternatives. This will improve accessibility, reduce maintenance burden, and provide better user experience through proven component behaviors while maintaining the existing Tailwind-based design system.

## Files and Functions to be Created or Modified

### New Dependencies Required
- Add to `package.json`:
  - `@radix-ui/react-dialog: ^1.1.2`
  - `@radix-ui/react-dropdown-menu: ^2.1.2`
  - `@radix-ui/react-toast: ^1.2.2`
  - `@radix-ui/react-slot: ^1.1.0`

### Core UI Components to Modify

#### `src/components/ui/dialog.tsx`
- **Current**: Uses HTML `<dialog>` element with custom backdrop/modal logic
- **Modification**: Complete rewrite using `@radix-ui/react-dialog` primitives
- **Functions to replace**:
  - `Dialog()` - Replace with Radix Dialog.Root wrapper
  - `DialogContent()` - Replace with Dialog.Content + Dialog.Overlay
  - `DialogHeader()` - Keep as composition helper
  - `DialogTitle()` - Replace with Dialog.Title
  - `DialogFooter()` - Keep as composition helper
  - `ConfirmDialog()` - Refactor to use new Radix-based Dialog components

#### `src/components/ui/dropdown-menu.tsx`
- **Current**: Incomplete implementation without proper state management
- **Modification**: Complete rewrite using `@radix-ui/react-dropdown-menu`
- **Functions to replace**:
  - `DropdownMenu()` - Replace with DropdownMenu.Root
  - `DropdownMenuTrigger()` - Replace with DropdownMenu.Trigger
  - `DropdownMenuContent()` - Replace with DropdownMenu.Content + DropdownMenu.Portal
  - `DropdownMenuItem()` - Replace with DropdownMenu.Item

#### `src/components/ui/split-button.tsx`
- **Current**: Uses custom dropdown logic with useState/useEffect (not used in application)
- **Modification**: Remove component entirely as it's not being used
- **Actions**:
  - Delete `src/components/ui/split-button.tsx` file
  - Remove any imports or references to SplitButton component

#### `src/components/ui/toast.tsx`
- **Current**: Custom implementation with manual timing and animations
- **Modification**: Replace with `@radix-ui/react-toast`
- **Functions to replace**:
  - `ToastComponent()` - Replace with Toast.Root + Toast.Title + Toast.Close
  - `ToastContainer()` - Replace with Toast.Provider + Toast.Viewport
- **Interface changes**:
  - Keep existing `Toast` and `ToastType` interfaces for compatibility

#### `src/components/ui/button.tsx`
- **Current**: Functional custom button implementation
- **Modification**: Minor updates to support `@radix-ui/react-slot` for composition
- **Functions to modify**:
  - `Button()` - Add optional `asChild` prop using Radix Slot
  - Keep all existing variants and functionality

### Context/Provider Files

#### `src/contexts/toast-context.tsx`
- **Modification**: Update toast context to work with Radix Toast provider
- **Functions to modify**:
  - Toast provider setup to wrap Radix Toast.Provider
  - Update toast triggering logic to work with Radix primitives

### Component Usage Files (Dialog Dependencies)
All files using Dialog/ConfirmDialog components require minor prop adjustments:
- `src/components/parts/ai-part-dialog.tsx`
- `src/components/types/type-create-dialog.tsx`
- `src/components/documents/add-document-modal.tsx`
- Plus 22+ other components that use dialog components

## Step-by-Step Implementation Algorithm

### Phase 1: Foundation Components
1. Install Radix UI dependencies via `pnpm add @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-toast @radix-ui/react-slot`
2. Refactor `src/components/ui/dialog.tsx`:
   - Replace HTML dialog with Radix Dialog.Root, Dialog.Trigger, Dialog.Portal, Dialog.Overlay, Dialog.Content
   - Maintain existing prop interfaces for backward compatibility
   - Update ConfirmDialog to use new Radix-based Dialog
3. Update all Dialog component usage across the application (25+ files)
4. Refactor `src/components/ui/dropdown-menu.tsx`:
   - Implement proper state management using Radix primitives
   - Add keyboard navigation and focus management
   - Maintain existing styling with Tailwind classes

### Phase 2: Interactive Components
1. Remove `src/components/ui/split-button.tsx`:
   - Delete unused SplitButton component file
   - Clean up any potential imports (none found in current codebase)
2. Refactor `src/components/ui/toast.tsx`:
   - Replace custom timing logic with Radix Toast provider
   - Update toast context to work with Radix Toast.Provider
   - Maintain existing toast types and styling

### Phase 3: Polish & Optimization
1. Update `src/components/ui/button.tsx`:
   - Add Radix Slot support for polymorphic `asChild` behavior
   - Maintain all existing variants and functionality
2. Test all interactive behaviors across the application
3. Update component usage patterns for better composition

## Implementation Phases

### Phase 1: Core Dialog System
- Replace Dialog component with Radix primitives
- Update all dialog usage across the application
- Essential for maintaining current functionality

### Phase 2: Component Cleanup & Toast System
- Replace DropdownMenu with proper state management
- Remove unused SplitButton component
- Replace Toast component with Radix primitives
- Improves keyboard navigation and accessibility

### Phase 3: Composition Improvements
- Add Slot-based composition to Button component
- Optimize component reusability patterns
- Provides better component composition abilities