# Change Brief: AI Analysis Seller Support

## Summary

Add support for the new `seller` and `seller_link` fields returned by AI part analysis, handling them the same way `type` is currently handled.

## Background

The AI analysis endpoint now returns seller information:
- `seller`: AI-suggested seller name (e.g., "Mouser")
- `seller_is_existing`: Whether the suggested seller matches an existing seller in the system
- `existing_seller_id`: ID of the existing seller if `seller_is_existing` is true
- `seller_link`: AI-suggested seller product page URL (simple string field)

## Required Changes

1. **Type definitions** (`src/types/ai-parts.ts`): Update `TransformedAIPartAnalysisResult` to include:
   - `seller?: string`
   - `sellerIsExisting?: boolean`
   - `existingSellerId?: number`
   - Change `sellerLink` from `null` to `string | undefined`

2. **Transformation layer** (`src/lib/utils/ai-parts.ts`): Update `transformAIPartAnalysisResult` to map the new seller fields from the API response (snake_case to camelCase).

3. **Form state** (`src/components/parts/ai-part-review-step.tsx`):
   - Add `sellerIsExisting` and `suggestedSellerName` to `PartFormData` interface
   - Initialize form state with seller fields following the same pattern as type:
     - If `sellerIsExisting=true`: Set `sellerId` to existing ID
     - If `sellerIsExisting=false`: Set `suggestedSellerName`, leave `sellerId` undefined
   - Initialize `sellerLink` from the AI analysis result

4. **UI updates** (`src/components/parts/ai-part-review-step.tsx`):
   - When `suggestedSellerName` is set: Show a suggestion box with "Suggested seller: {name}" plus "Create Seller" and clear buttons (same pattern as type)
   - When `suggestedSellerName` is not set: Show the normal `SellerSelector` dropdown
   - Add handlers for creating and clearing the seller suggestion
   - Use the existing `SellerCreateDialog` component for seller creation

## Notes

- The `seller_link` field is a simple string pass-through with no "is_existing" logic
- Unlike `TypeCreateDialog` which only needs a name, `SellerCreateDialog` requires both name and website URL - the suggested seller name should be pre-filled but the user will need to provide a website
