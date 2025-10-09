# Shopping List Foundations Frontend – Code Review

## Findings

1. **[Medium] Overview cache not refreshed after line mutations**  
   - The plan calls out that the Concept route must invalidate the overview queries so list counts stay accurate immediately after add/edit/delete operations (`docs/features/shopping_list_foundations/plan.md:68`).  
   - The custom mutations for creating, updating, and deleting lines only invalidate the detail and lines queries (`src/hooks/use-shopping-lists.ts:466`, `src/hooks/use-shopping-lists.ts:533`, `src/hooks/use-shopping-lists.ts:584`). The overview query (`SHOPPING_LISTS_KEY`) is never touched, so any component that still has the overview mounted (or resumes focus quickly) will retain stale line counts/status until a background refetch happens.  
   - Please invalidate `SHOPPING_LISTS_KEY` alongside the detail/lines keys in those mutations so the overview reflects the latest backend state as soon as a line changes.

2. **[Medium] Mark Ready CTA remains visible after status changes**  
   - The plan specifies rendering the Mark “Ready” action only while a list is in the Concept state and making sure the CTA disappears after the transition (`docs/features/shopping_list_foundations/plan.md:88`, `docs/features/shopping_list_foundations/plan.md:102`).  
   - `MarkReadyFooter` keeps rendering the button for non-concept statuses and simply disables it (`src/components/shopping-lists/mark-ready-footer.tsx:37-56`). After marking a list ready the UI still shows a disabled CTA, which conflicts with the spec and leaves a misleading affordance.  
   - Hide the CTA when `list.status !== 'concept'` so the footer matches the documented behaviour and test expectations.

3. **[Low] Concept header missing breadcrumb**  
   - Phase 3 of the plan calls for a breadcrumb in the Concept header (`docs/features/shopping_list_foundations/plan.md:43`).  
   - The current `ConceptHeader` renders the title, status badge, and description but no breadcrumb (`src/components/shopping-lists/concept-header.tsx`).  
   - Consider adding the breadcrumb trail (e.g., “Shopping Lists › {List Name}”) to align the surface with the documented layout.

## Questions / Follow-ups

- The plan mentioned using the `usePostShoppingListsLinesByListId` mutation for creating concept lines, but the implementation relies on the part-membership endpoint instead. If that swap was intentional, updating the plan to note the alternative API would prevent future confusion.
