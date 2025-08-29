import {
  useGetPartsCoverByPartKey,
  usePutPartsCoverByPartKey,
  useDeletePartsCoverByPartKey,
} from '@/lib/api/generated/hooks';

export function useCoverAttachment(partId: string) {
  const query = useGetPartsCoverByPartKey(
    { path: { part_key: partId } },
    { enabled: !!partId }
  );

  return {
    ...query,
    coverAttachment: query.data?.attachment || null,
  };
}

export function useSetCoverAttachment() {
  return usePutPartsCoverByPartKey();
}

export function useRemoveCoverAttachment() {
  return useDeletePartsCoverByPartKey();
}