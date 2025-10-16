import { createFileRoute } from '@tanstack/react-router';
import { BoxList } from '@/components/boxes/box-list';

export const Route = createFileRoute('/boxes/')({
  validateSearch: (search: Record<string, unknown>) => {
    const searchTerm = search.search as string;
    return searchTerm ? { search: searchTerm } : {};
  },
  component: BoxesRoute,
});

function BoxesRoute() {
  const search = Route.useSearch();
  const searchTerm = typeof search.search === 'string' ? search.search : '';

  return <BoxList searchTerm={searchTerm} />;
}
