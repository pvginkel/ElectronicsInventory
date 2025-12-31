import { useQueryClient } from '@tanstack/react-query';
import { useSetAttachmentSetCover, useRemoveAttachmentSetCover } from './use-attachment-set-cover';

/**
 * Hook to set cover attachment for a part.
 * Uses the generic attachment-set cover hook internally.
 */
export function useSetCoverAttachment() {
  const queryClient = useQueryClient();
  const setCoverMutation = useSetAttachmentSetCover();

  return {
    ...setCoverMutation,
    mutateAsync: async (variables: { path: { part_key: string }; body: { attachment_id: number } }) => {
      // Fetch the part to get its attachment_set_id
      const partData = queryClient.getQueryData<{ attachment_set_id: number }>([
        'getPartsByPartKey',
        { path: { part_key: variables.path.part_key } }
      ]);

      if (!partData?.attachment_set_id) {
        throw new Error('Part attachment set ID not found');
      }

      // Set cover using attachment-set endpoint
      const result = await setCoverMutation.mutateAsync({
        attachmentSetId: partData.attachment_set_id,
        attachmentId: variables.body.attachment_id
      });

      // Invalidate part queries to refresh cover_url
      await queryClient.invalidateQueries({
        queryKey: ['getPartsByPartKey', { path: { part_key: variables.path.part_key } }]
      });

      return result;
    }
  };
}

/**
 * Hook to remove cover attachment from a part.
 * Uses the generic attachment-set cover hook internally.
 */
export function useRemoveCoverAttachment() {
  const queryClient = useQueryClient();
  const removeCoverMutation = useRemoveAttachmentSetCover();

  return {
    ...removeCoverMutation,
    mutateAsync: async (variables: { path: { part_key: string } }) => {
      // Fetch the part to get its attachment_set_id
      const partData = queryClient.getQueryData<{ attachment_set_id: number }>([
        'getPartsByPartKey',
        { path: { part_key: variables.path.part_key } }
      ]);

      if (!partData?.attachment_set_id) {
        throw new Error('Part attachment set ID not found');
      }

      // Remove cover using attachment-set endpoint
      const result = await removeCoverMutation.mutateAsync({
        attachmentSetId: partData.attachment_set_id
      });

      // Invalidate part queries to refresh cover_url
      await queryClient.invalidateQueries({
        queryKey: ['getPartsByPartKey', { path: { part_key: variables.path.part_key } }]
      });

      return result;
    }
  };
}
