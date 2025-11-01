import { useState, useMemo } from 'react';
import { DocumentGridBase } from '@/components/documents/document-grid-base';
import { MediaViewerBase } from '@/components/documents/media-viewer-base';
import { transformApiDocumentsToDocumentItems } from '@/lib/utils/document-transformers';
import type { DocumentItem } from '@/types/documents';
import type { ApiDocument } from '@/lib/utils/document-transformers';

interface DuplicateDocumentGridProps {
  documents: ApiDocument[];
  coverDocumentId: number | null;
  partId: string;
  onDocumentsChange: (documents: ApiDocument[], coverDocumentId: number | null) => void;
}

export function DuplicateDocumentGrid({ 
  documents,
  coverDocumentId,
  partId,
  onDocumentsChange
}: DuplicateDocumentGridProps) {
  const [currentDocumentId, setCurrentDocumentId] = useState<string | null>(null);
  const [isViewerOpen, setIsViewerOpen] = useState(false);

  // Transform documents to DocumentItem format using shared utility
  const transformedDocuments: DocumentItem[] = useMemo(() => {
    // Create a mock cover attachment for the transformer
    const mockCoverAttachment = coverDocumentId ? { id: coverDocumentId } : null;
    return transformApiDocumentsToDocumentItems(documents, mockCoverAttachment, partId);
  }, [documents, coverDocumentId, partId]);

  const handleShowMedia = (document: DocumentItem) => {
    setCurrentDocumentId(document.id);
    setIsViewerOpen(true);
  };

  const handleToggleCover = (documentId: string) => {
    const docId = parseInt(documentId);
    const newCoverDocumentId = coverDocumentId === docId ? null : docId;
    onDocumentsChange(documents, newCoverDocumentId);
  };

  const handleDelete = async (documentId: string): Promise<boolean> => {
    const updatedDocuments = documents.filter(doc => doc.id !== documentId);
    const newCoverDocumentId = coverDocumentId === parseInt(documentId) ? null : coverDocumentId;
    onDocumentsChange(updatedDocuments, newCoverDocumentId);
    return true;
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
        documents={transformedDocuments}
        onShowMedia={handleShowMedia}
        onToggleCover={handleToggleCover}
        onDelete={handleDelete}
        showCoverToggle={true}
      />
      
      <MediaViewerBase
        documents={transformedDocuments.filter(doc => doc.type !== 'website')} // Only show images and PDFs in viewer
        currentDocumentId={currentDocumentId}
        isOpen={isViewerOpen}
        onClose={handleCloseViewer}
        onNavigate={handleViewerNavigate}
      />
    </>
  );
}