import { useMemo } from 'react';
import { useGetAttachmentSetsAttachmentsBySetId } from '@/lib/api/generated/hooks';

export interface AttachmentDocument {
  id: string;
  name: string;
  type: 'url' | 'file';
  url: string | null;
  filename: string | null;
  fileSize: number | null;
  mimeType: string | null;
  createdAt: string;
  previewUrl: string | null;
  attachmentUrl: string | null;
  has_image: boolean;
}

export function useAttachmentSetDocuments(attachmentSetId: number | undefined) {
  const query = useGetAttachmentSetsAttachmentsBySetId(
    { path: { set_id: attachmentSetId ?? 0 } },
    { enabled: !!attachmentSetId }
  );

  const documents = useMemo(() => {
    if (!query.data) return [];

    return query.data.map(attachment => ({
      id: attachment.id.toString(), // Convert number to string for consistency
      name: attachment.title,
      // Map attachment_type to our type format
      // The lightweight schema uses 'url', 'image', or 'pdf'
      // We normalize 'image' and 'pdf' to 'file' type
      type: attachment.attachment_type === 'url' ? 'url' as const : 'file' as const,
      url: null, // Not available in lightweight list schema
      filename: null, // Not available in lightweight list schema
      fileSize: null, // Not available in lightweight list schema
      mimeType: null, // Not available in lightweight list schema
      createdAt: '', // Not available in lightweight list schema
      previewUrl: attachment.preview_url || null,
      attachmentUrl: attachment.attachment_url || null,
      has_image: attachment.preview_url !== null,
    }));
  }, [query.data]);

  return {
    ...query,
    documents,
  };
}
