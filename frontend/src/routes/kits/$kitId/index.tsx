import { createFileRoute } from '@tanstack/react-router';
import { KitDetail } from '@/components/kits/kit-detail';
import type { KitStatus } from '@/types/kits';

interface KitDetailSearch {
  status: KitStatus;
  search?: string;
}

export const Route = createFileRoute('/kits/$kitId/')({
  validateSearch: (search: Record<string, unknown>): KitDetailSearch => {
    const rawStatus = typeof search.status === 'string' ? search.status : undefined;
    const status: KitStatus = rawStatus === 'archived' ? 'archived' : 'active';
    const rawSearch = typeof search.search === 'string' ? search.search : undefined;

    return rawSearch ? { status, search: rawSearch } : { status };
  },
  component: KitDetailRoute,
});

function KitDetailRoute() {
  const { kitId } = Route.useParams();
  const search = Route.useSearch();

  return (
    <KitDetail
      kitId={kitId}
      overviewStatus={search.status}
      overviewSearch={search.search}
    />
  );
}
