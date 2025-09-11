import { getThumbnailUrl, getViewUrl } from '@/lib/utils/thumbnail-urls';
import type { DocumentItem } from '@/types/documents';

export interface ApiDocument {
  id: string;
  name: string;
  type: string;
  mimeType?: string | null;
  filename?: string | null;
  url?: string | null;
  has_image: boolean;
}

export interface CoverAttachment {
  id: number;
}

export function transformApiDocumentsToDocumentItems(
  apiDocuments: ApiDocument[],
  coverAttachment: CoverAttachment | null | undefined,
  partId: string
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

    // Determine preview image URL based on type and has_image
    let previewImageUrl: string | null = null;
    if (type === 'image') {
      previewImageUrl = getThumbnailUrl(partId, doc.id, 'medium');
    } else if (type === 'website' && doc.has_image) {
      previewImageUrl = getThumbnailUrl(partId, doc.id, 'medium');
    }

    return {
      id: doc.id,
      title: doc.name,
      type,
      previewImageUrl,
      assetUrl: type === 'website' && doc.url ? doc.url : getViewUrl(partId, doc.id),
      isCover,
      hasImage: doc.has_image
    };
  });
}