# Change Brief: Wire Gate into Existing UI

## Summary

Wire the `Gate` component and role constants into all existing files that import mutation hooks, satisfying the `role-gating/role-import-enforcement` ESLint rule. Once complete, promote the ESLint rule from `warn` to `error`.

## Affected files (26 total)

### Hook files (15) — import role constants alongside mutation hooks

These files define custom hooks that wrap generated mutation hooks. They need to import the corresponding role constant and re-export it so consuming components can pass it to `<Gate>`.

- `src/hooks/use-parts.ts`
- `src/hooks/use-sellers.ts`
- `src/hooks/use-types.ts`
- `src/hooks/use-shopping-lists.ts`
- `src/hooks/use-kit-contents.ts`
- `src/hooks/use-kit-create.ts`
- `src/hooks/use-kit-shopping-list-links.ts`
- `src/hooks/use-pick-list-execution.ts`
- `src/hooks/use-pick-list-line-quantity-update.ts`
- `src/hooks/use-seller-group-mutations.ts`
- `src/hooks/use-attachment-set-cover.ts`
- `src/hooks/use-part-documents.ts`
- `src/hooks/use-url-preview.ts`

### Component files (10) — wrap interactive elements in `<Gate>`

These files contain UI that triggers mutations. They need `<Gate requires={...}>` around buttons, forms, and other interactive elements that require editor access.

- `src/components/boxes/box-details.tsx`
- `src/components/boxes/box-list.tsx`
- `src/components/kits/kit-detail.tsx`
- `src/components/kits/kit-metadata-dialog.tsx`
- `src/components/kits/kit-attachment-section.tsx`
- `src/components/kits/kit-pick-list-create-dialog.tsx`
- `src/components/parts/part-details.tsx`
- `src/components/parts/part-form.tsx`
- `src/components/parts/ai-part-dialog.tsx`
- `src/components/parts/ai-part-cleanup-merge-step.tsx`
- `src/components/parts/seller-link-section.tsx`
- `src/components/pick-lists/pick-list-detail.tsx`

### Route files (1) — same treatment as component files

- `src/routes/shopping-lists/$listId.tsx`

## Approach

1. **Hook files**: Import the role constant from `@/lib/api/generated/roles` and re-export it. This satisfies the lint rule and makes the constant available to consuming components.

2. **Component files**: Import the role constant (either from the hook's re-export or directly from generated roles) and wrap the relevant interactive elements in `<Gate requires={...}>`. Use `fallback` for inline controls where hiding would shift layout.

3. **Promote ESLint rule**: Change `role-gating/role-import-enforcement` from `warn` to `error` in `eslint.config.js`.

## Out of scope

- Adding Playwright tests for role-gated rendering (separate follow-up).
- Changing the Gate component or usePermissions hook (already shipped).
