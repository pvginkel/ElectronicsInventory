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
  const { showError } = useToast();

  // Transform API documents to DocumentItem format
  const documents: DocumentItem[] = useMemo(() => {
    return transformApiDocumentsToDocumentItems(apiDocuments, coverAttachment, partId);
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
    } catch {
      showError('Failed to set cover');
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
    } catch {
      showError('Failed to delete document');
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
    </div>
  );
}
