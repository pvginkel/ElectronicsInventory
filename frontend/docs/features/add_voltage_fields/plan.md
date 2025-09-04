# Add pin_pitch, input_voltage, and output_voltage fields to frontend

## Technical Plan

### Brief Description
Add three new fields (pin_pitch, input_voltage, output_voltage) to the parts system in the frontend. These fields were already added to the backend API and need to be integrated into all relevant frontend components. The pin_pitch field will be placed next to pin_count, and input_voltage/output_voltage will be placed next to voltage_rating.

### Files to Modify

#### 1. `/src/lib/utils/parts.ts`
- Add `pinPitch?: string`, `inputVoltage?: string`, `outputVoltage?: string` to the `PartData` interface
- Add `pin_pitch?: string | null`, `input_voltage?: string | null`, `output_voltage?: string | null` to the `Part` interface  
- Add validation rules for the three new fields in `validatePartData()` function (max 100 characters each, matching voltage_rating pattern)

#### 2. `/src/lib/utils/ai-parts.ts`
- Add `pinPitch: result.pin_pitch`, `inputVoltage: result.input_voltage`, `outputVoltage: result.output_voltage` to `transformAIPartAnalysisResult()` function
- Add the three fields to the parameter interface of `transformToCreateSchema()` function
- Add `pin_pitch: data.pinPitch ?? null`, `input_voltage: data.inputVoltage ?? null`, `output_voltage: data.outputVoltage ?? null` to the return object of `transformToCreateSchema()`

#### 3. `/src/components/parts/part-form.tsx`
- Add `pinPitch: string`, `inputVoltage: string`, `outputVoltage: string` to the `PartFormData` interface
- Initialize the three fields as empty strings in the initial state
- Add the fields to the `useEffect` that populates form data from existing part (lines 64-83)
- Add the fields to validation in `handleSubmit` (lines 89-102)
- Add the fields to both create and update mutation bodies (lines 111-154)
- Add form field for Pin Pitch right after Pin Count field in Physical Specifications section (after line 287)
- Add form fields for Input Voltage and Output Voltage after Voltage Rating field in Technical Specifications section (after line 325)

#### 4. `/src/components/parts/ai-part-review-step.tsx`
- Add `pinPitch: string`, `inputVoltage: string`, `outputVoltage: string` to the `PartFormData` interface
- Initialize the fields from `analysisResult` in the initial state (lines 51-69)
- Add form field for Pin Pitch after Pin Count field (after line 291)
- Add form fields for Input Voltage and Output Voltage after Voltage Rating field (after line 254)

#### 5. `/src/components/parts/part-details.tsx`
- Add display for `pin_pitch` next to pin_count in Physical specifications section (after line 243)
- Add display for `input_voltage` and `output_voltage` in Electrical/Technical specifications section (after line 265)

#### 6. `/src/components/parts/part-list.tsx`
- Replace the existing voltage_rating badge with a combined voltage badge that includes all voltage fields
- Display format: combine voltage_rating, input_voltage, and output_voltage in a single badge
- Use monospace font for "I:" and "O:" prefixes
- Example displays: "⚡ 5V | I: 12V | O: 3.3V" or "⚡ I: 12V" depending on which fields have values

### Implementation Steps

1. **Update Type Definitions**
   - Add the three fields to both `PartData` and `Part` interfaces in camelCase and snake_case respectively
   - Follow the existing pattern where frontend uses camelCase and API uses snake_case

2. **Add Validation**
   - Add validation rules matching voltage_rating (string, max 100 characters, optional)
   - Clear errors when fields are modified

3. **Update Transformation Functions**
   - Map the snake_case API fields to camelCase frontend fields in `transformAIPartAnalysisResult()`
   - Map camelCase back to snake_case in `transformToCreateSchema()`

4. **Add Form Fields**
   - Pin Pitch: Add next to Pin Count with placeholder "e.g., 0.1mm, 2.54mm"
   - Input Voltage: Add after Voltage Rating with placeholder "e.g., 5V, 12-24V"
   - Output Voltage: Add after Input Voltage with placeholder "e.g., 3.3V, 5V"
   - All fields should be optional text inputs with max length 100

5. **Update Display Components**
   - Add conditional display blocks that only show when fields have values
   - Group pin_pitch with pin_count in Physical section
   - Group input_voltage and output_voltage with voltage_rating in Electrical section

6. **Add List View Badges**
   - Replace the existing voltage_rating MetadataBadge with a combined voltage display
   - Combine voltage_rating, input_voltage, and output_voltage in a single badge with "⚡" icon
   - Use monospace font (`font-mono` class) for "I:" and "O:" labels
   - Add pin_pitch as a separate MetadataBadge when it has a value (use appropriate icon)

### Notes
- All three fields are optional (nullable) string fields
- Maximum length is 100 characters each
- Fields already exist in the backend API schemas
- Follow existing snake_case to camelCase transformation pattern
- Maintain consistency with existing form layout and validation patterns