import { useState, useMemo } from 'react';
import { DocumentGridBase } from '@/components/documents/document-grid-base';
import { MediaViewerBase } from '@/components/documents/media-viewer-base';
import { useCoverAttachment, useSetCoverAttachment } from '@/hooks/use-cover-image';
import { usePartDocuments, useDeleteDocument } from '@/hooks/use-part-documents';
import { transformApiDocumentsToDocumentItems } from '@/lib/utils/document-transformers';
import { useToast } from '@/hooks/use-toast';
import type { DocumentItem } from '@/types/documents';

interface PartDocumentGridProps {
  partId: string;
  hasCoverAttachment?: boolean;
  onDocumentChange?: () => void;
}

export function PartDocumentGrid({ 
  partId, 
  hasCoverAttachment,
  onDocumentChange 
}: PartDocumentGridProps) {
  const [currentDocumentId, setCurrentDocumentId] = useState<string | null>(null);
  const [isViewerOpen, setIsViewerOpen] = useState(false);

  const { documents: apiDocuments } = usePartDocuments(partId);
  const { coverAttachment } = useCoverAttachment(partId, hasCoverAttachment);
  const setCoverMutation = useSetCoverAttachment();
  const deleteDocumentMutation = useDeleteDocument();
  const { showException } = useToast();

  // Transform API documents to DocumentItem format
  const documents: DocumentItem[] = useMemo(() => {
    return transformApiDocumentsToDocumentItems(apiDocuments, coverAttachment, partId);
  }, [apiDocuments, coverAttachment, partId]);

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
