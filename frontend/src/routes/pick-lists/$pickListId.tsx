import { createFileRoute } from '@tanstack/react-router';
import { PickListDetail } from '@/components/pick-lists/pick-list-detail';
import type { PickListDetailSearchParams } from '@/types/pick-lists';
import type { KitStatus } from '@/types/kits';

type PickListDetailSearch = PickListDetailSearchParams;

export const Route = createFileRoute('/pick-lists/$pickListId')({
  validateSearch: (search: Record<string, unknown>): PickListDetailSearch => normalizeSearch(search),
  component: PickListDetailRoute,
});

function PickListDetailRoute() {
  const { pickListId } = Route.useParams();
  const search = Route.useSearch();

  return (
    <PickListDetail
      pickListId={pickListId}
      kitOverviewStatus={search.status}
      kitOverviewSearch={search.search}
    />
  );
}

function normalizeSearch(search: Record<string, unknown>): PickListDetailSearch {
  const result: PickListDetailSearch = {};

  const kitIdCandidate = search.kitId ?? search.kitID;
  const normalizedKitId = normalizeNumericParam(kitIdCandidate);
  if (normalizedKitId !== null) {
    result.kitId = normalizedKitId;
  }

  const statusCandidate = typeof search.status === 'string' ? search.status : undefined;
  if (statusCandidate && isValidKitStatus(statusCandidate)) {
    result.status = statusCandidate;
  }

  if (typeof search.search === 'string') {
    const trimmed = search.search.trim();
    if (trimmed.length > 0) {
      result.search = trimmed;
    }
  }

  return result;
}

function normalizeNumericParam(value: unknown): number | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return null;
    }
    const truncated = Math.trunc(value);
    return truncated > 0 ? truncated : null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      return null;
    }
    const truncated = Math.trunc(parsed);
    return truncated > 0 ? truncated : null;
  }

  return null;
}

function isValidKitStatus(status: string): status is KitStatus {
  return status === 'active' || status === 'archived';
}
