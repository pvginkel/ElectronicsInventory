import { createFileRoute } from '@tanstack/react-router';
import { KitOverviewList } from '@/components/kits/kit-overview-list';
import type { KitStatus } from '@/types/kits';

interface KitsSearchState {
  status: KitStatus;
  search?: string;
}

export const Route = createFileRoute('/kits/')({
  validateSearch: (search: Record<string, unknown>): KitsSearchState => {
    const rawStatus = typeof search.status === 'string' ? search.status : undefined;
    const normalizedStatus: KitStatus = rawStatus === 'archived' ? 'archived' : 'active';
    const rawSearch = typeof search.search === 'string' ? search.search : undefined;

    return {
      status: normalizedStatus,
      ...(rawSearch ? { search: rawSearch } : {}),
    };
  },
  component: KitsOverviewRoute,
});

function KitsOverviewRoute() {
  const navigate = Route.useNavigate();
  const searchState = Route.useSearch();

  const status = searchState.status;
  const search = typeof searchState.search === 'string' ? searchState.search : '';

  const handleStatusChange = (nextStatus: KitStatus) => {
    navigate({
      to: '/kits',
      search: (prev) => {
        const next: KitsSearchState = { status: nextStatus };
        if (prev.search) {
          next.search = prev.search;
        }
        return next;
      },
      replace: true,
    });
  };

  const handleSearchChange = (nextSearch: string) => {
    if (nextSearch) {
      navigate({
        to: '/kits',
        search: (prev) => ({
          ...prev,
          search: nextSearch,
        }),
        replace: true,
      });
      return;
    }

    navigate({
      to: '/kits',
      search: () => ({ status }),
      replace: true,
    });
  };

  const handleCreateKit = () => {
    navigate({ to: '/kits/new' });
  };

  return (
    <KitOverviewList
      status={status}
      searchTerm={search}
      onStatusChange={handleStatusChange}
      onSearchChange={handleSearchChange}
      onCreateKit={handleCreateKit}
    />
  );
}
