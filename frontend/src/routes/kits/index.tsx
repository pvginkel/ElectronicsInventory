import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useState } from 'react';
import { KitOverviewList } from '@/components/kits/kit-overview-list';
import { KitCreateDialog } from '@/components/kits/kit-create-dialog';
import type { KitResponseSchema_b98797e } from '@/lib/api/generated/hooks';
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
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  const status = searchState.status;
  const search = typeof searchState.search === 'string' ? searchState.search : '';

  const handleStatusChange = useCallback((nextStatus: KitStatus) => {
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
  }, [navigate]);

  const handleCreateKit = useCallback(() => {
    setIsCreateDialogOpen(true);
  }, []);

  const handleCreateSuccess = useCallback(
    (kit: KitResponseSchema_b98797e) => {
      setIsCreateDialogOpen(false);
      navigate({
        to: '/kits/$kitId',
        params: { kitId: kit.id.toString() },
        search: () => (search ? { status, search } : { status }),
      });
    },
    [navigate, search, status],
  );

  const handleCreateOpenChange = useCallback((open: boolean) => {
    setIsCreateDialogOpen(open);
  }, []);

  return (
    <>
      <KitOverviewList
        status={status}
        searchTerm={search}
        onStatusChange={handleStatusChange}
        onCreateKit={handleCreateKit}
      />
      <KitCreateDialog
        open={isCreateDialogOpen}
        onOpenChange={handleCreateOpenChange}
        onSuccess={handleCreateSuccess}
      />
    </>
  );
}
