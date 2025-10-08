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
    <div data-testid="shopping-lists.page" className="space-y-6">
      <div className="flex items-center space-x-2 text-sm text-muted-foreground">
        <span>Shopping Lists</span>
      </div>

      <ShoppingListsOverview searchTerm={searchTerm} />
    </div>
  );
}
