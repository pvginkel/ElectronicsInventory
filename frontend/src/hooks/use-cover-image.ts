import {
  usePutPartsCoverByPartKey,
  useDeletePartsCoverByPartKey,
} from '@/lib/api/generated/hooks';

// Mutation hooks for setting and removing cover attachments
// Cover state is now derived from part.cover_url and part.cover_attachment_id

export function useSetCoverAttachment() {
  return usePutPartsCoverByPartKey();
}

export function useRemoveCoverAttachment() {
  return useDeletePartsCoverByPartKey();
}
