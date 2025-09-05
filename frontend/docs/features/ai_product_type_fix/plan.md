# AI Product Type Processing Fix

## Brief Description

The AI part creation workflow needs to be enhanced to properly handle both existing and new product types. When the AI suggests a new type, the user must explicitly create it before saving the part, ensuring all parts have valid type IDs. When the AI identifies an existing type, it should be pre-selected in the type selector.

## Current Issues

1. **Missing Field Extraction**: The `existing_type_id` from the AI analysis response is not being extracted and passed to the form.
2. **New Type Workflow**: When AI suggests a new type, users cannot save the part without first creating the type.
3. **User Confirmation**: Users need explicit control over type creation to avoid accidental new types.

## Files and Functions to Modify

### 1. `src/lib/utils/ai-parts.ts`

- **Function**: `transformAIPartAnalysisResult()`
  - Add extraction of `existing_type_id` field from API response
  - Map it to `existingTypeId` property in the returned object

- **Function**: `transformToCreateSchema()`  
  - Ensure `type_id` is always set (never send new type name here)
  - Add validation to prevent saving without a type_id

### 2. `src/components/parts/ai-part-review-step.tsx`

- **State Management**:
  - Add `suggestedTypeName` state for storing AI-suggested new type name
  - Add `isTypeCreated` state to track if suggested type was created
  - Initialize `typeId` with `existingTypeId` when `typeIsExisting` is true

- **UI Components**:
  - Conditionally render TypeSelector vs suggested type display
  - Add "Create Type" button for new type suggestions
  - Add clear button to remove suggestion and show TypeSelector

- **Type Creation Flow**:
  - Reuse `TypeCreateDialog` component from TypeSelector
  - Update form state after successful type creation
  - Show TypeSelector with newly created type selected

- **Form Validation**:
  - Prevent form submission if suggested type hasn't been created or removed
  - Show appropriate error message

### 3. Extract `TypeCreateDialog` to Shared Component (Optional)

- **New File**: `src/components/types/type-create-dialog.tsx`
  - Extract TypeCreateDialog from TypeSelector for reusability
  - Both TypeSelector and AIPartReviewStep will use this component

## Step-by-step Algorithm

### Step 1: Fix API Response Transformation

In `transformAIPartAnalysisResult()`:
1. Extract `existing_type_id` from the API response
2. Add `existingTypeId: result.existing_type_id` to the returned object

### Step 2: Enhanced Form State Management

In `AIPartReviewStep` component initialization:
1. If `typeIsExisting` is true:
   - Set `typeId: analysisResult.existingTypeId`
   - Set `suggestedTypeName: null`
2. If `typeIsExisting` is false:
   - Set `typeId: undefined`
   - Set `suggestedTypeName: analysisResult.type`

### Step 3: Conditional UI Rendering

1. If `suggestedTypeName` is set (new type):
   - Show read-only field: "Suggested type: [type name]"
   - Show "Create" button to open type creation dialog
   - Show clear (X) button to remove suggestion
2. If `suggestedTypeName` is null (existing type or cleared):
   - Show standard TypeSelector component
   - Pre-select `typeId` if available

### Step 4: Type Creation Flow

1. User clicks "Create" button:
   - Open TypeCreateDialog with `suggestedTypeName`
   - On successful creation:
     - Set `typeId` to new type's ID
     - Clear `suggestedTypeName`
     - Set `typeIsExisting: true`
   - On cancel: dialog closes, no changes

2. User clicks clear (X) button:
   - Clear `suggestedTypeName`
   - Clear `typeId` if it was for the suggested type
   - Show TypeSelector for manual selection

### Step 5: Form Validation Enhancement

In `validateForm()` and `handleCreatePart()`:
1. Check if `suggestedTypeName` is set but `typeId` is not
2. If true, add error: "Please create the suggested type or select an existing one"
3. Prevent form submission until resolved

## Implementation Requirements

- Maintain backward compatibility with existing type selections
- Reuse existing TypeCreateDialog component and useCreateType hook
- Ensure smooth UX transitions between states
- Clear error messaging for validation failures
- Preserve all other form data during type creation flow

## Expected Behavior After Fix

**Existing Type Scenario**:
- TypeSelector is shown with the type pre-selected
- User can change selection if needed
- Form submission includes the selected `type_id`

**New Type Scenario**:
- Suggested type name shown in read-only field
- User must click "Create" to create the type
- After creation, TypeSelector shows with new type selected
- Form submission includes the created `type_id`
- If user clears suggestion, TypeSelector appears for manual selection