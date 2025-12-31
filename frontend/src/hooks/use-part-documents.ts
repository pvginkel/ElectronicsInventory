import { useQueryClient } from '@tanstack/react-query';
import { useGetPartsByPartKey, useDeleteAttachmentSetsAttachmentsBySetIdAndAttachmentId } from '@/lib/api/generated/hooks';
import { useAttachmentSetDocuments } from './use-attachment-set-documents';

/**
 * Hook to fetch documents for a part using the attachment-set abstraction.
 * The part's attachment_set_id is obtained from the part entity.
 */
export function usePartDocuments(partId: string | undefined) {
  // First, fetch the part to get its attachment_set_id
  const partQuery = useGetPartsByPartKey(
    { path: { part_key: partId ?? '__unset__' } },
    { enabled: !!partId }
  );

  const attachmentSetId = partQuery.data?.attachment_set_id;

  // Use the generic attachment-set documents hook
  const attachmentQuery = useAttachmentSetDocuments(attachmentSetId);

  return {
    ...attachmentQuery,
    // Keep the 'documents' property name for backward compatibility
    documents: attachmentQuery.documents,
  };
}

/**
 * Hook to delete a document using the attachment-set endpoint.
 * This requires the part's attachment_set_id.
 */
export function useDeleteDocument() {
  const queryClient = useQueryClient();
  const mutation = useDeleteAttachmentSetsAttachmentsBySetIdAndAttachmentId();

  return {
    ...mutation,
    mutateAsync: async (variables: { path: { part_key: string; attachment_id: number } }) => {
      // Fetch the part to get its attachment_set_id
      const partData = queryClient.getQueryData<{ attachment_set_id: number }>([
        'getPartsByPartKey',
        { path: { part_key: variables.path.part_key } }
      ]);

      if (!partData?.attachment_set_id) {
        throw new Error('Part attachment set ID not found');
      }

      // Delete using attachment-set endpoint
      const result = await mutation.mutateAsync({
        path: {
          set_id: partData.attachment_set_id,
          attachment_id: variables.path.attachment_id
        }
      });

      // Invalidate both attachment-set and part queries
      await queryClient.invalidateQueries({
        queryKey: ['getAttachmentSetsAttachmentsBySetId', { path: { set_id: partData.attachment_set_id } }]
      });
      await queryClient.invalidateQueries({
        queryKey: ['getPartsByPartKey', { path: { part_key: variables.path.part_key } }]
      });

      return result;
    }
  };
}
