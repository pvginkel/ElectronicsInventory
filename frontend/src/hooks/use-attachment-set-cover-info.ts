import { useGetAttachmentSetsCoverBySetId } from '@/lib/api/generated/hooks';

/**
 * Hook to fetch cover information for an attachment set.
 * Returns the cover_attachment_id and cover_url.
 */
export function useAttachmentSetCoverInfo(attachmentSetId: number | undefined) {
  const query = useGetAttachmentSetsCoverBySetId(
    { path: { set_id: attachmentSetId ?? 0 } },
    { enabled: !!attachmentSetId }
  );

  return {
    ...query,
    coverAttachmentId: query.data?.cover_attachment_id ?? null,
    coverUrl: query.data?.cover_url ?? null,
  };
}
