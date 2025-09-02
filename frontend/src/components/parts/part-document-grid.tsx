import { useState, useMemo } from 'react';
import { DocumentGridBase } from '@/components/documents/document-grid-base';
import { MediaViewerBase } from '@/components/documents/media-viewer-base';
import { useCoverAttachment, useSetCoverAttachment } from '@/hooks/use-cover-image';
import { usePartDocuments, useDeleteDocument } from '@/hooks/use-part-documents';
import { getThumbnailUrl, getViewUrl } from '@/lib/utils/thumbnail-urls';
import type { DocumentItem } from '@/types/documents';

interface PartDocumentGridProps {
  partId: string;
  onDocumentChange?: () => void;
}

export function PartDocumentGrid({ 
  partId, 
  onDocumentChange 
}: PartDocumentGridProps) {
  const [currentDocumentId, setCurrentDocumentId] = useState<string | null>(null);
  const [isViewerOpen, setIsViewerOpen] = useState(false);

  const { documents: apiDocuments } = usePartDocuments(partId);
  const { coverAttachment } = useCoverAttachment(partId);
  const setCoverMutation = useSetCoverAttachment();
  const deleteDocumentMutation = useDeleteDocument();

  // Transform API documents to DocumentItem format
  const documents: DocumentItem[] = useMemo(() => {
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

      return {
        id: doc.id,
        title: doc.name,
        type,
        previewImageUrl: type === 'image' ? getThumbnailUrl(partId, doc.id, 'medium') : null,
        assetUrl: type === 'website' && doc.url ? doc.url : getViewUrl(partId, doc.id),
        isCover
      };
    });
  }, [apiDocuments, coverAttachment, partId]);

  const handleTileClick = (document: DocumentItem) => {
    if (document.type === 'website') {
      // Open URL in new tab
      window.open(document.assetUrl, '_blank', 'noopener,noreferrer');
    } else {
      // Open in media viewer for images and PDFs
      setCurrentDocumentId(document.id);
      setIsViewerOpen(true);
    }
  };

  const handleToggleCover = async (documentId: string) => {
    try {
      await setCoverMutation.mutateAsync({
        path: { part_key: partId },
        body: { attachment_id: parseInt(documentId) }
      });
      onDocumentChange?.();
    } catch (error) {
      console.error('Failed to set cover:', error);
    }
  };

  const handleDelete = async (documentId: string): Promise<boolean> => {
    try {
      await deleteDocumentMutation.mutateAsync({
        path: { 
          part_key: partId, 
          attachment_id: parseInt(documentId)
        }
      });
      onDocumentChange?.();
      return true;
    } catch (error) {
      console.error('Failed to delete document:', error);
      return false;
    }
  };

  const handleCloseViewer = () => {
    setIsViewerOpen(false);
    setCurrentDocumentId(null);
  };

  const handleViewerNavigate = (documentId: string) => {
    setCurrentDocumentId(documentId);
  };

  return (
    <>
      <DocumentGridBase
        documents={documents}
        onTileClick={handleTileClick}
        onToggleCover={handleToggleCover}
        onDelete={handleDelete}
        showCoverToggle={true}
      />
      
      <MediaViewerBase
        documents={documents.filter(doc => doc.type !== 'website')} // Only show images and PDFs in viewer
        currentDocumentId={currentDocumentId}
        isOpen={isViewerOpen}
        onClose={handleCloseViewer}
        onNavigate={handleViewerNavigate}
      />
    </>
  );
}