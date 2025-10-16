import { useEffect } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { ShoppingListsOverview } from '@/components/shopping-lists/overview-list';
import { useAppShellContentPadding } from '@/components/layout/app-shell-content-context';
import { DEFAULT_APP_SHELL_CONTENT_PADDING } from '@/constants/app-shell';

export const Route = createFileRoute('/shopping-lists/')({
  validateSearch: (search: Record<string, unknown>) => ({
    search: typeof search.search === 'string' ? search.search : '',
  }),
  component: ShoppingListsPage,
});

function ShoppingListsPage() {
  const search = Route.useSearch();
  const searchTerm = typeof search.search === 'string' ? search.search : '';
  const { setContentPaddingClass } = useAppShellContentPadding();

  useEffect(() => {
    setContentPaddingClass('p-0');
    return () => setContentPaddingClass(DEFAULT_APP_SHELL_CONTENT_PADDING);
  }, [setContentPaddingClass]);

  return (
    <div data-testid="shopping-lists.page" className="flex h-full min-h-0 flex-col">
      <ShoppingListsOverview searchTerm={searchTerm} />
    </div>
  );
}
