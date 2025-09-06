# Mounting Type Dropdown Feature Plan

## Description

Replace the current free-text input field for mounting type in the part editor (PartForm) and AI result page (AIPartReviewStep) with a dropdown populated by the values from `MountingTypeEnum` in the backend.

## Backend MountingTypeEnum Values

The backend enum at `/home/pvginkel/source/ElectronicsInventory/backend/app/services/ai_model.py` contains:
- `THROUGH_HOLE = "Through-Hole"`
- `SURFACE_MOUNT = "Surface-Mount"`
- `PANEL_MOUNT = "Panel Mount"`
- `DIN_RAIL_MOUNT = "DIN Rail Mount"`

## Files to Create or Modify

### 1. Create New Component
- **`src/components/parts/mounting-type-selector.tsx`** - New dropdown component for selecting mounting types

### 2. Modify Existing Files
- **`src/components/parts/part-form.tsx`**:
  - Replace text input for mounting type (lines 322-333) with the new MountingTypeSelector component
  - Import the new component

- **`src/components/parts/ai-part-review-step.tsx`**:
  - Replace text input for mounting type (lines 354-364) with the new MountingTypeSelector component
  - Import the new component

## Implementation Details

### MountingTypeSelector Component
The new component should:
- Accept `value` and `onChange` props similar to other form components
- Support optional `error` prop for validation display
- Include an empty/unselected state option
- Use consistent styling with existing UI components (Input, Label)
- Follow the same pattern as TypeSelector for dropdown behavior
- Use a simple select dropdown rather than complex search functionality (since only 4 options exist)

### Component Interface
```typescript
interface MountingTypeSelectorProps {
  value?: string;
  onChange: (value: string | undefined) => void;
  error?: string;
  placeholder?: string;
}
```

### Dropdown Options
- Empty option: "Select mounting type..." or similar
- "Through-Hole" (maps to backend THROUGH_HOLE)
- "Surface-Mount" (maps to backend SURFACE_MOUNT) 
- "Panel Mount" (maps to backend PANEL_MOUNT)
- "DIN Rail Mount" (maps to backend DIN_RAIL_MOUNT)

### Form Integration
Both forms currently store mounting type as a string in their form state and send it to the backend as `mounting_type`. The exact same string values from the enum should be used to maintain compatibility.

### Styling and UX
- Use consistent form field styling with existing components
- Include proper accessibility attributes
- Show validation errors consistently with other form fields
- Maintain existing spacing and layout in the Physical Specifications sections

## Implementation Steps

1. Create the `MountingTypeSelector` component using standard HTML select element with Tailwind styling
2. Replace the Input component in `PartForm` at lines 322-333
3. Replace the Input component in `AIPartReviewStep` at lines 354-364
4. Test that form submission continues to work with the enum values
5. Verify that existing parts with mounting types display correctly when editing

## Notes

- This change maintains full backward compatibility since the same string values are used
- No backend changes are required
- The dropdown prevents typos and ensures data consistency
- Users can still leave the field empty if mounting type is unknown