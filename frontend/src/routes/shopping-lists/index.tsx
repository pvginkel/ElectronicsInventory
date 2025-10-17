import { createFileRoute } from '@tanstack/react-router';
import { ShoppingListsOverview } from '@/components/shopping-lists/overview-list';

export const Route = createFileRoute('/shopping-lists/')({
  validateSearch: (search: Record<string, unknown>) => ({
    search: typeof search.search === 'string' ? search.search : '',
  }),
  component: ShoppingListsPage,
});

function ShoppingListsPage() {
  const search = Route.useSearch();
  const searchTerm = typeof search.search === 'string' ? search.search : '';

  return (
    <div data-testid="shopping-lists.page" className="flex h-full min-h-0 flex-col">
      <ShoppingListsOverview searchTerm={searchTerm} />
    </div>
  );
}
