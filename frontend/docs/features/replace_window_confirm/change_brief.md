# Replace window.confirm with ConfirmDialog

## Problem

1. The Delete Kit functionality uses `window.confirm()` (browser native confirmation dialog) instead of the app's standard `ConfirmDialog` component pattern used elsewhere (e.g., box deletion, shopping list operations).
2. The Delete Kit menu option in the dropdown menu shows `cursor-default` instead of `cursor-pointer`, making it less clear that it's clickable.

## Location

- **window.confirm usage**: `src/components/kits/kit-detail.tsx` line 315
- **Cursor styling**: `src/components/ui/dropdown-menu.tsx` line 91 - DropdownMenuItem has `cursor-default`

## Expected behavior

1. Replace `window.confirm()` with the `useConfirm` hook and `ConfirmDialog` component, matching the pattern used in `src/components/boxes/box-details.tsx` (lines 208-217) and `src/components/shopping-lists/list-delete-confirm.tsx`.
2. Change DropdownMenuItem cursor from `cursor-default` to `cursor-pointer` to indicate interactivity.

## Success criteria

1. Kit deletion shows a proper styled dialog instead of browser native confirm
2. All dropdown menu items show pointer cursor on hover
3. Functionality remains unchanged - delete still works the same way
4. Existing Playwright tests continue to pass
