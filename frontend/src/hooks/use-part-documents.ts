import { useMemo } from 'react';
import {
  useGetPartsAttachmentsByPartKey,
  usePostPartsAttachmentsByPartKey,
  useDeletePartsAttachmentsByPartKeyAndAttachmentId,
  usePutPartsAttachmentsByPartKeyAndAttachmentId,
} from '@/lib/api/generated/hooks';

export function usePartDocuments(partId: string | undefined) {
  const query = useGetPartsAttachmentsByPartKey(
    { path: { part_key: partId ?? '__unset__' } },
    { enabled: !!partId }
  );

  const documents = useMemo(() => {
    if (!query.data) return [];
    
    return query.data.map(attachment => ({
      id: attachment.id.toString(), // Convert number to string for consistency
      name: attachment.title,
      type: attachment.attachment_type === 'url' ? 'url' as const : 'file' as const,
      url: attachment.url || null,
      filename: attachment.filename || null,
      fileSize: attachment.file_size || null,
      mimeType: attachment.content_type || null,
      createdAt: attachment.created_at,
      has_image: attachment.has_preview,
    }));
  }, [query.data]);

  return {
    ...query,
    documents,
  };
}

export function useUploadDocument() {
  return usePostPartsAttachmentsByPartKey();
}

export function useUpdateDocumentMetadata() {
  return usePutPartsAttachmentsByPartKeyAndAttachmentId();
}

export function useDeleteDocument() {
  return useDeletePartsAttachmentsByPartKeyAndAttachmentId();
}
