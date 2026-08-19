import { createFileRoute } from '@tanstack/react-router';
import { TypeList } from '@/components/types/type-list';

export const Route = createFileRoute('/types/')({
  validateSearch: (search: Record<string, unknown>) => {
    const searchTerm = search.search as string;
    return searchTerm ? { search: searchTerm } : {};
  },
  component: TypesRoute,
});

function TypesRoute() {
  const search = Route.useSearch();
  const searchTerm = typeof search.search === 'string' ? search.search : '';

  return <TypeList searchTerm={searchTerm} />;
}
