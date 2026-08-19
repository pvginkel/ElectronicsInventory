# Seller Link Management UI

## Summary

Add UI on the part detail screen for managing seller links (add and remove). The backend endpoints already exist (`POST /api/parts/{part_key}/seller-links` and `DELETE /api/parts/{part_key}/seller-links/{seller_link_id}`), and the generated TanStack Query hooks are available (`usePostPartsSellerLinksByPartKey`, `useDeletePartsSellerLinksByPartKeyAndSellerLinkId`). The part detail page currently displays seller links as a read-only list but has no way to add or remove them.

## Current State

- Part detail page (`src/components/parts/part-details.tsx`) shows seller links in a `DescriptionList` under a "Seller Links" heading, each row showing the seller name as label and the link URL as value.
- The part form (`src/components/parts/part-form.tsx`) contains a note: "Seller links are managed from the part detail screen."
- `VendorInfo` component renders seller link chips/logos on part cards in the list view.
- No add/remove UI exists anywhere.

## Desired Behavior

1. On the part detail screen, below or within the existing "Seller Links" section, add an "Add seller link" button that opens an inline form or dialog to create a new seller link (seller selector + link URL input).
2. Each existing seller link row should have a remove/delete button that removes the link after confirmation.
3. After adding or removing a seller link, the part detail should refresh to show the updated list.
4. The "Seller Links" section should always be visible (even when empty) so the user can add the first link.
