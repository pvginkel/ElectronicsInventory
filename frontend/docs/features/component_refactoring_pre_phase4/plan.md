# Component Refactoring for Playwright - Pre-Phase 4 Implementation Plan

## Brief Description

Refactor UI components to accept native props (including data-* attributes), forward refs, and improve accessibility. This prepares components for Playwright testing while improving overall code quality and user experience. All refactoring follows the patterns established in `@docs/epics/component_refactoring.md`.

## Technical Requirements

1. **Enable Playwright Testing**: Components must accept all native HTML attributes, especially `data-testid`
2. **Improve Accessibility**: Semantic HTML, proper ARIA attributes, keyboard support
3. **Full Native Prop Support**: Components accept all props of their underlying DOM element
4. **Ref Forwarding**: All components forward refs to their root DOM element
5. **Consistent Patterns**: Follow the established refactoring guide patterns

### Scope of Changes
Since the app is small, we will:
- Make breaking API changes where beneficial
- Update all component usages throughout the app
- Standardize prop patterns across all components

## Core Refactoring Pattern

Every component will follow this base pattern from the refactoring guide:

```typescript
import * as React from "react";
import { cn } from "@/lib/utils";

// 1) Choose the correct intrinsic element
type NativeDivProps = React.ComponentPropsWithoutRef<"div">;

// 2) Extend native props, keeping custom props in front
interface MyComponentProps extends NativeDivProps {
  // custom props here
}

// 3) Use forwardRef
export const MyComponent = React.forwardRef<HTMLDivElement, MyComponentProps>(
  ({ className, onClick, style, children, ...props }, ref) => {
    // 4) Compose handlers
    const handleClick: React.MouseEventHandler<HTMLDivElement> = (e) => {
      // internal logic...
      onClick?.(e);
    };

    return (
      <div
        ref={ref}
        {...props}                    // spread first
        className={cn("base-classes", className)}  // merge classes
        onClick={handleClick}         // composed handler
      >
        {children}
      </div>
    );
  }
);
MyComponent.displayName = "MyComponent";
```

## Prop Precedence Policy

As specified in the guide:
- **Critical props (a11y/behavior)** must win: Put `{...props}` **before** enforced props
- **Class merging**: Always use `cn("defaults", className)`
- **Style merging**: User style wins: `style={{ ...internal, ...style }}`
- **Handlers**: Compose rather than overwrite

## Components to Refactor

### Phase 1: Core UI Components (Required for Types workflow)

#### 1. Button Component (`src/components/ui/button.tsx`)
```typescript
type NativeButton = React.ComponentPropsWithoutRef<"button">;
interface ButtonProps extends Omit<NativeButton, "type"> {
  variant?: "primary" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
}

// Must enforce type="button" to prevent form submission
// Compose onClick handlers
// Forward ref to button element
```

#### 2. Input Component (`src/components/ui/input.tsx`)
```typescript
type NativeInput = React.ComponentPropsWithoutRef<"input">;
interface InputProps extends NativeInput {
  invalid?: boolean;
}

// Add aria-invalid when invalid
// Forward all native props including data-*
// Handle aria-describedby for error messages
```

#### 3. Dialog Components (`src/components/ui/dialog.tsx`)
Based on `component_refactoring_dialog.md`:
- Forward ref to DialogPrimitive.Content (the interactive root)
- Prop distribution:
  - `overlayProps`: Props for DialogPrimitive.Overlay (backdrop)
  - `contentProps`: Props for DialogPrimitive.Content (main dialog, receives data-testid)
  - `portalProps`: Props for DialogPrimitive.Portal (rendering container)
  - Root props go to DialogPrimitive.Root
- Use DialogPrimitive.Description for a11y

#### 4. Form Components (`src/components/ui/form.tsx`)
- FormField: Forward refs and data-* attributes
- FormControl: Ensure wrapped inputs receive props
- FormMessage: Add proper aria-live for errors
- FormLabel: Ensure htmlFor connections

#### 5. Card Components (`src/components/ui/card.tsx`)
```typescript
// Each part needs refactoring:
- Card (wrapper)
- CardHeader
- CardContent
- CardFooter
- CardTitle
- CardDescription

// All extend native div/heading props
// All forward refs
```

#### 6. SearchableSelect (`src/components/ui/searchable-select.tsx`)
Complex component requiring careful refactoring:
- Forward ref to input element
- Proper combobox ARIA pattern
- role="combobox", aria-expanded, aria-haspopup
- aria-activedescendant for keyboard navigation
- Ensure dropdown items have proper roles

### Phase 2: Supporting Components

#### 7. Badge (`src/components/ui/badge.tsx`)
```typescript
type NativeSpan = React.ComponentPropsWithoutRef<"span">;
interface BadgeProps extends NativeSpan {
  variant?: "default" | "success" | "warning" | "error";
}
```

#### 8. ProgressBar (`src/components/ui/progress-bar.tsx`)
Based on `component_refactoring_progress_bar.md`:
```typescript
// Must include:
- role="progressbar"
- aria-valuemin={0}
- aria-valuemax={100}
- aria-valuenow={value}
- aria-busy for indeterminate state
- Omit ARIA props from native div to control them
```

#### 9. Toast (`src/components/ui/toast.tsx`)
Based on `component_refactoring_toast.md`:
- Prop distribution:
  - `viewportProps`: Props for ToastPrimitive.Viewport (container)
  - Individual toast items receive props via `getItemProps` pattern
  - Each toast item's root (ToastPrimitive.Root) receives data-testid
- role="alert" for error toasts (implicit in Radix)

#### 10. DropdownMenu (`src/components/ui/dropdown-menu.tsx`)
- Prop distribution:
  - `triggerProps`: Props for DropdownMenuPrimitive.Trigger (button that opens menu)
  - `contentProps`: Props for DropdownMenuPrimitive.Content (menu container)
  - Item components accept props directly
- Forward ref to trigger element (most common interaction point)

### Phase 3: Domain Components (Test ID Addition Only)

#### Important Clarification
Domain components (TypeForm, PartForm, etc.) **DO NOT** need structural refactoring:
- They are not reusable UI components
- They don't need to accept all native props or forward refs
- They only need data-testid attributes added for Playwright testing
- They will automatically benefit from refactored UI components

#### Example Approach for Domain Components:
```typescript
// In TypeForm.tsx - No need to extend native props or forward refs
// Just add data-testid directly:
<form onSubmit={handleSubmit}>
  <Input
    data-testid="types.form.name"  // Add directly
    value={name}
    onChange={setName}
  />
  <Button
    data-testid="types.form.submit"  // Add directly
    type="submit"
  >
    Save Type
  </Button>
</form>
```

#### 11. TypeForm (`src/components/types/TypeForm.tsx`)
- Add data-testid to form elements:
  - `types.form.name` on the Input component
  - `types.form.submit` on submit Button
  - `types.form.cancel` on cancel Button

#### 12. PartForm (`src/components/parts/part-form.tsx`)
- Add data-testid to form elements:
  - `parts.form.manufacturer` on manufacturer Input
  - `parts.form.description` on description field
  - `parts.form.submit` on submit Button

## Accessibility Checklist (Per Component)

From the refactoring guide section 3:

1. **Semantic Elements First**
   - Button → `<button type="button">`
   - Link → `<a href>`
   - Lists → `<ul><li>...</li></ul>`

2. **Progress Widgets**
   - Add `role="progressbar"` with aria-valuemin/max/now

3. **Inputs**
   - Connect labels with htmlFor/id
   - Use aria-invalid and aria-describedby for errors

4. **Dialogs**
   - Focus management via Radix
   - Label with aria-labelledby/aria-describedby

5. **Only Add ARIA When Needed**
   - Don't add redundant roles
   - Let semantic HTML do the work

## Testing Strategy

### After Each Component:
1. Run TypeScript check: `pnpm type-check`
2. Verify in browser that component still works
3. Check DevTools that data-test appears in DOM
4. Test ref forwarding: `ref.current?.focus()`
5. Check accessibility in DevTools Lighthouse

### Test File Pattern:
```typescript
// Simple test to verify refactoring
const ButtonTest = () => {
  const ref = React.useRef<HTMLButtonElement>(null);

  return (
    <Button
      ref={ref}
      data-testid="test.button"
      onClick={() => console.log('clicked')}
    >
      Test
    </Button>
  );
};

// Verify:
// - data-testid appears in DOM
// - onClick works
// - ref.current is the button element
```

## Definition of Done (Per Component)

From the refactoring guide section 13:

- [ ] Accepts all relevant native props + `data-*`
- [ ] Forwards ref to root DOM element
- [ ] Uses semantic HTML; a11y attributes verified
- [ ] Props merged with correct precedence
- [ ] Handlers composed, not replaced
- [ ] Classes merged with cn()
- [ ] TypeScript: no errors, proper types
- [ ] displayName set for DevTools
- [ ] All usages throughout the app updated for any API changes
- [ ] Unit/story demonstrates data-testid working

## Implementation Order

1. **Simple components first** (establish patterns):
   - Button, Input, Badge

2. **Card system** (multiple related components):
   - Card, CardHeader, CardContent, CardFooter, CardTitle, CardDescription

3. **Form components**:
   - FormField, FormControl, FormMessage, FormLabel

4. **Radix-based components** (complex prop distribution):
   - Dialog (with ConfirmDialog)
   - DropdownMenu
   - Toast

5. **Complex custom components**:
   - SearchableSelect (most complex ARIA)
   - ProgressBar (custom ARIA)

6. **Domain components** (data-testid only):
   - TypeForm
   - PartForm (if it exists)

## Common Pitfalls to Avoid

1. **Update All Usages**
   - When changing a component's API, search for all usages
   - Update imports if component names change
   - Fix any TypeScript errors from API changes

2. **Don't Break Radix Components**
   - Pass props through Radix's prop structure
   - Don't wrap Radix components unnecessarily

3. **Prop Spreading Order Matters**
   ```typescript
   // ✅ Correct - our critical props win
   <button {...props} type="button" />

   // ❌ Wrong - user could override type
   <button type="button" {...props} />
   ```

4. **Event Handler Composition**
   ```typescript
   // ✅ Correct - both handlers run
   const handleClick = (e) => {
     internalLogic();
     props.onClick?.(e);
   };

   // ❌ Wrong - replaces user handler
   onClick={internalLogic}
   ```

5. **TypeScript Omit for Controlled Props**
   ```typescript
   // When we must control a prop:
   interface Props extends Omit<NativeDiv, "role" | "aria-valuemin"> {
     // We control these
   }
   ```

## Validation Script

Create a temporary validation page:

```typescript
// src/routes/test-refactoring.tsx
export function TestRefactoring() {
  return (
    <div className="p-4 space-y-4">
      <Button data-testid="validation.button">Test Button</Button>
      <Input data-testid="validation.input" placeholder="Test Input" />
      <Badge data-testid="validation.badge">Test Badge</Badge>
      {/* Add all refactored components */}
    </div>
  );
}
```

Then verify in browser DevTools that all data-testid attributes appear.

## Component Usage Scope

### Estimated Usage Counts (to be verified during implementation):
- **Button**: Used extensively (~50+ instances across all routes)
- **Input**: Common in forms (~30+ instances)
- **Dialog**: Used for confirmations and forms (~15 instances)
- **Card**: Dashboard and list views (~20 instances)
- **Badge**: Status displays (~10 instances)
- **Form components**: All form routes (~25 instances)
- **SearchableSelect**: Type/box selection (~5 instances)
- **DropdownMenu**: Actions menus (~8 instances)
- **Toast**: Global (1 provider instance)
- **ProgressBar**: Loading states (~3 instances)

### Routes requiring updates:
- `/types/*` - Type management pages
- `/parts/*` - Parts management pages
- `/boxes/*` - Box management pages
- `/dashboard` - Dashboard components
- Layout components (header, sidebar)

## Next Steps

After this phase:
1. Phase 4 can add data-testid attributes throughout the app
2. Playwright tests can reliably target elements
3. Accessibility improvements benefit all users
4. Codebase follows consistent React patterns

## Technical Notes

### Prop Forwarding Clarification
- **Simple components** (Button, Input, Badge): Forward all props to single root element
- **Composite components** (Card system): Each sub-component forwards to its own root
- **Radix components**: Use explicit prop objects for each Radix primitive
- Props are forwarded to the **root DOM element** of each component

### Testing During Implementation
- Run `pnpm type-check` after each component
- Test in browser that existing functionality works
- Verify data-testid appears in DevTools
- Test ref forwarding with `ref.current?.focus()`

### Reference Documentation
- Main guide: `@docs/epics/component_refactoring.md`
- Dialog example: `@docs/epics/component_refactoring_dialog.md`
- Toast example: `@docs/epics/component_refactoring_toast.md`
- Progress bar example: `@docs/epics/component_refactoring_progress_bar.md`