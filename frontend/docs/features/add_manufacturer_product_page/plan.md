# Add Manufacturer and Product Page Fields

## Brief Description

Add support for the new backend fields `manufacturer` and `product_page` that have been added to the Part model. These fields need to be integrated into the part form for data entry and the part details view for display. The fields should be positioned before the existing seller and seller_link fields to maintain a logical flow from manufacturer information to vendor information.

## Files to Modify

### 1. `/src/components/parts/part-form.tsx`
- **Update `PartFormData` interface**: Add `manufacturer: string` and `productPage: string` fields
- **Update initial state in `useState`**: Initialize new fields as empty strings
- **Update `useEffect` for existing parts**: Map `manufacturer` and `product_page` from API response
- **Add form fields**: Add input fields for manufacturer and product page in the Seller Information section, positioned before seller and seller_link
- **Update submit handlers**: Include new fields in both create (`usePostParts`) and update (`usePutPartsByPartKey`) mutations

### 2. `/src/components/parts/part-details.tsx`
- **Add display section**: Display manufacturer and product_page fields in the Part Information card
- **Position fields**: Place them in a new "Manufacturer Information" subsection, positioned before any seller information display (if seller display is added in the future)

### 3. `/src/lib/utils/parts.ts`
- **Update `PartData` interface**: Add `manufacturer?: string` and `productPage?: string` fields
- **Update `Part` interface**: Add `manufacturer?: string | null` and `product_page?: string | null` fields
- **Update `validatePartData` function**: Add validation for manufacturer (max 255 chars) and productPage (max 500 chars)
- **Update `formatPartForDisplay` function**: Add `displayManufacturer?: string` and `displayProductPage?: string` to return object

## Implementation Steps

1. **Update data models and validation**
   - Modify interfaces in `/src/lib/utils/parts.ts` to include new fields
   - Add validation rules for the new fields (character limits)

2. **Update part form component**
   - Add manufacturer and productPage to the form state interface
   - Initialize fields in component state
   - Map fields from existing part data when in edit mode
   - Add input fields to the form UI in the Seller Information section
   - Include fields in API mutation calls

3. **Update part details display**
   - Add manufacturer and product page display to the Part Information card
   - Format and position the fields appropriately
   - Make product page a clickable link if it contains a valid URL

## Field Specifications

### Manufacturer Field
- Type: `string | null`
- Max length: 255 characters
- Label: "Manufacturer"
- Placeholder: "e.g., Texas Instruments, Arduino"
- Position: Before seller field in forms and displays

### Product Page Field
- Type: `string | null` 
- Max length: 500 characters
- Label: "Product Page"
- Placeholder: "e.g., https://www.ti.com/product/SN74HC595"
- Position: After manufacturer field, before seller field
- Display: Should be rendered as a clickable link when displaying