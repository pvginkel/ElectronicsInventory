import { useState, useMemo } from 'react';
import { DocumentGridBase } from '@/components/documents/document-grid-base';
import { MediaViewerBase } from '@/components/documents/media-viewer-base';
import { useSetCoverAttachment } from '@/hooks/use-cover-image';
import { usePartDocuments, useDeleteDocument } from '@/hooks/use-part-documents';
import { transformApiDocumentsToDocumentItems } from '@/lib/utils/document-transformers';
import { useToast } from '@/hooks/use-toast';
import type { DocumentItem } from '@/types/documents';

interface PartDocumentGridProps {
  partId: string;
  currentCoverAttachmentId?: number | null;
  onDocumentChange?: () => void;
}

export function PartDocumentGrid({
  partId,
  currentCoverAttachmentId,
  onDocumentChange
}: PartDocumentGridProps) {
  const [currentDocumentId, setCurrentDocumentId] = useState<string | null>(null);
  const [isViewerOpen, setIsViewerOpen] = useState(false);

  const { documents: apiDocuments } = usePartDocuments(partId);
  const setCoverMutation = useSetCoverAttachment();
  const deleteDocumentMutation = useDeleteDocument();
  const { showException } = useToast();

  // Transform API documents to DocumentItem format
  const documents: DocumentItem[] = useMemo(() => {
    const coverAttachment = currentCoverAttachmentId ? { id: currentCoverAttachmentId } : null;
    return transformApiDocumentsToDocumentItems(apiDocuments, coverAttachment);
  }, [apiDocuments, currentCoverAttachmentId]);

  const handleShowMedia = (document: DocumentItem) => {
    // Open in media viewer for images and PDFs
    setCurrentDocumentId(document.id);
    setIsViewerOpen(true);
  };

  const handleToggleCover = async (documentId: string) => {
    try {
      await setCoverMutation.mutateAsync({
        path: { part_key: partId },
        body: { attachment_id: parseInt(documentId) }
      });
      onDocumentChange?.();
    } catch (error) {
      showException('Failed to set cover', error);
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
      showException('Failed to delete document', error);
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
    <div data-testid="parts.documents.grid">
      <DocumentGridBase
        documents={documents}
        onShowMedia={handleShowMedia}
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
    </div>
  );
}
