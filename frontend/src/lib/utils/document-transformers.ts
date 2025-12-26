import type { DocumentItem } from '@/types/documents';

export interface ApiDocument {
  id: string;
  name: string;
  type: string;
  mimeType?: string | null;
  filename?: string | null;
  url?: string | null;
  previewUrl?: string | null;
  attachmentUrl?: string | null;
}

export interface CoverAttachment {
  id: number;
}

export function transformApiDocumentsToDocumentItems(
  apiDocuments: ApiDocument[],
  coverAttachment: CoverAttachment | null | undefined
): DocumentItem[] {
  return apiDocuments.map(doc => {
    const isCover = coverAttachment?.id === parseInt(doc.id);

    // Determine document type based on MIME type and attachment type
    let type: 'image' | 'pdf' | 'website';
    if (doc.type === 'url') {
      type = 'website';
    } else if (doc.mimeType?.startsWith('image/')) {
      type = 'image';
    } else if (doc.mimeType === 'application/pdf' || doc.filename?.toLowerCase().endsWith('.pdf')) {
      type = 'pdf';
    } else {
      // Default to image if we're not sure - most attachments are images
      type = 'image';
    }

    // Use preview_url from API (server decides what's previewable)
    const previewImageUrl = doc.previewUrl ?? null;

    // For websites, use the URL; for files, use attachment_url (optionally with disposition=inline)
    const assetUrl = type === 'website' && doc.url ? doc.url : (doc.attachmentUrl ?? '');

    return {
      id: doc.id,
      title: doc.name,
      type,
      previewImageUrl,
      assetUrl,
      isCover,
      hasImage: previewImageUrl !== null
    };
  });
}