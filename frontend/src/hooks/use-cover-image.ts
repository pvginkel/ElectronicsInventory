import {
  useGetPartsCoverByPartKey,
  usePutPartsCoverByPartKey,
  useDeletePartsCoverByPartKey,
} from '@/lib/api/generated/hooks';

export function useCoverAttachment(partId: string | undefined, hasCoverAttachment?: boolean) {
  const shouldFetch = Boolean(partId) && hasCoverAttachment !== false;

  const query = useGetPartsCoverByPartKey(
    { path: { part_key: partId ?? '__unset__' } },
    {
      enabled: shouldFetch,
    }
  );

  return {
    ...query,
    coverAttachment: shouldFetch ? query.data?.attachment ?? null : null,
  };
}

export function useSetCoverAttachment() {
  return usePutPartsCoverByPartKey();
}

export function useRemoveCoverAttachment() {
  return useDeletePartsCoverByPartKey();
}
