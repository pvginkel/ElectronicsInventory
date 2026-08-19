import { useState, useMemo } from 'react';
import { useGetPartsByPartKey } from '@/lib/api/generated/hooks';
import { DocumentGridBase } from '@/components/documents/document-grid-base';
import { MediaViewerBase } from '@/components/documents/media-viewer-base';
import { useSetCoverAttachment } from '@/hooks/use-cover-image';
import { usePartDocuments, useDeleteDocument } from '@/hooks/use-part-documents';
import { useAttachmentSetCoverInfo } from '@/hooks/use-attachment-set-cover-info';
import { transformApiDocumentsToDocumentItems } from '@/lib/utils/document-transformers';
import { useToast } from '@/hooks/use-toast';
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

  // Get the part to obtain its attachment_set_id
  const partQuery = useGetPartsByPartKey(
    { path: { part_key: partId } },
    { enabled: !!partId }
  );
  const attachmentSetId = partQuery.data?.attachment_set_id;

  // Fetch documents and cover info from the attachment set
  const { documents: apiDocuments } = usePartDocuments(partId);
  const { coverAttachmentId } = useAttachmentSetCoverInfo(attachmentSetId);
  const setCoverMutation = useSetCoverAttachment();
  const deleteDocumentMutation = useDeleteDocument();
  const { showException } = useToast();

  // Transform API documents to DocumentItem format
  const documents: DocumentItem[] = useMemo(() => {
    const coverAttachment = coverAttachmentId ? { id: coverAttachmentId } : null;
    return transformApiDocumentsToDocumentItems(apiDocuments, coverAttachment);
  }, [apiDocuments, coverAttachmentId]);

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
