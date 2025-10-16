import { createFileRoute } from '@tanstack/react-router';
import { SellerList } from '@/components/sellers/seller-list';

export const Route = createFileRoute('/sellers/')({
  validateSearch: (search: Record<string, unknown>) => {
    const searchTerm = search.search as string;
    return searchTerm ? { search: searchTerm } : {};
  },
  component: SellersRoute,
});

function SellersRoute() {
  const search = Route.useSearch();
  const searchTerm = typeof search.search === 'string' ? search.search : '';

  return <SellerList searchTerm={searchTerm} />;
}
