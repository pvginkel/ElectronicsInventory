import { useState, useMemo } from 'react';
import { DocumentGridBase } from '@/components/documents/document-grid-base';
import { MediaViewerBase } from '@/components/documents/media-viewer-base';
import { useAttachmentSetDocuments } from '@/hooks/use-attachment-set-documents';
import { useAttachmentSetCoverInfo } from '@/hooks/use-attachment-set-cover-info';
import { useSetAttachmentSetCover } from '@/hooks/use-attachment-set-cover';
import { useDeleteAttachmentSetsAttachmentsBySetIdAndAttachmentId } from '@/lib/api/generated/hooks';
import { transformApiDocumentsToDocumentItems } from '@/lib/utils/document-transformers';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import type { DocumentItem } from '@/types/documents';

interface KitAttachmentSectionProps {
  kitId: number;
  attachmentSetId: number;
  isArchived: boolean;
  onDocumentChange?: () => void;
}

export function KitAttachmentSection({
  kitId,
  attachmentSetId,
  isArchived,
  onDocumentChange
}: KitAttachmentSectionProps) {
  const [currentDocumentId, setCurrentDocumentId] = useState<string | null>(null);
  const [isViewerOpen, setIsViewerOpen] = useState(false);

  const queryClient = useQueryClient();
  const { documents: apiDocuments } = useAttachmentSetDocuments(attachmentSetId);
  const { coverAttachmentId } = useAttachmentSetCoverInfo(attachmentSetId);
  const setCoverMutation = useSetAttachmentSetCover();
  const deleteDocumentMutation = useDeleteAttachmentSetsAttachmentsBySetIdAndAttachmentId();
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
    if (isArchived) {
      showException('Cannot modify attachments', new Error('Archived kits cannot be edited'));
      return;
    }

    try {
      await setCoverMutation.mutateAsync({
        attachmentSetId,
        attachmentId: parseInt(documentId)
      });

      // Invalidate kit queries to refresh cover_url
      await queryClient.invalidateQueries({
        queryKey: ['getKitsByKitId', { path: { kit_id: kitId } }]
      });
      await queryClient.invalidateQueries({
        queryKey: ['getKits']
      });

      onDocumentChange?.();
    } catch (error) {
      showException('Failed to set cover', error);
    }
  };

  const handleDelete = async (documentId: string): Promise<boolean> => {
    if (isArchived) {
      showException('Cannot modify attachments', new Error('Archived kits cannot be edited'));
      return false;
    }

    try {
      await deleteDocumentMutation.mutateAsync({
        path: {
          set_id: attachmentSetId,
          attachment_id: parseInt(documentId)
        }
      });

      // Invalidate kit queries
      await queryClient.invalidateQueries({
        queryKey: ['getAttachmentSetsAttachmentsBySetId', { path: { set_id: attachmentSetId } }]
      });
      await queryClient.invalidateQueries({
        queryKey: ['getKitsByKitId', { path: { kit_id: kitId } }]
      });
      await queryClient.invalidateQueries({
        queryKey: ['getKits']
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
    <div data-testid="kits.detail.documents.grid">
      <DocumentGridBase
        documents={documents}
        onShowMedia={handleShowMedia}
        onToggleCover={handleToggleCover}
        onDelete={handleDelete}
        showCoverToggle={!isArchived}
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
