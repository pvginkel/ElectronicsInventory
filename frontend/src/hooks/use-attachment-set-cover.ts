import {
  usePutAttachmentSetsCoverBySetId,
  useDeleteAttachmentSetsCoverBySetId,
} from '@/lib/api/generated/hooks';
import { useQueryClient } from '@tanstack/react-query';

/**
 * Hook to set a cover attachment for an attachment set.
 * After setting the cover, invalidates both attachment-set and parent entity queries.
 */
export function useSetAttachmentSetCover() {
  const queryClient = useQueryClient();
  const mutation = usePutAttachmentSetsCoverBySetId();

  return {
    ...mutation,
    mutateAsync: async (variables: { attachmentSetId: number; attachmentId: number }) => {
      const result = await mutation.mutateAsync({
        path: { set_id: variables.attachmentSetId },
        body: { attachment_id: variables.attachmentId }
      });

      // Invalidate attachment-set queries
      await queryClient.invalidateQueries({
        queryKey: ['getAttachmentSetsAttachmentsBySetId', { path: { set_id: variables.attachmentSetId } }]
      });
      await queryClient.invalidateQueries({
        queryKey: ['getAttachmentSetsCoverBySetId', { path: { set_id: variables.attachmentSetId } }]
      });

      return result;
    }
  };
}

/**
 * Hook to remove the cover attachment from an attachment set.
 * After removing the cover, invalidates both attachment-set and parent entity queries.
 */
export function useRemoveAttachmentSetCover() {
  const queryClient = useQueryClient();
  const mutation = useDeleteAttachmentSetsCoverBySetId();

  return {
    ...mutation,
    mutateAsync: async (variables: { attachmentSetId: number }) => {
      const result = await mutation.mutateAsync({
        path: { set_id: variables.attachmentSetId }
      });

      // Invalidate attachment-set queries
      await queryClient.invalidateQueries({
        queryKey: ['getAttachmentSetsAttachmentsBySetId', { path: { set_id: variables.attachmentSetId } }]
      });
      await queryClient.invalidateQueries({
        queryKey: ['getAttachmentSetsCoverBySetId', { path: { set_id: variables.attachmentSetId } }]
      });

      return result;
    }
  };
}
