import { MediaViewer } from './media-viewer';
import { useDocumentViewer } from '@/hooks/use-document-viewer';

interface Document {
  id: string;
  name: string;
  type: 'file' | 'url';
  url?: string | null;
  filename?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
  createdAt: string;
}

interface DocumentViewerProps {
  partId: string;
  documents: Document[];
}

export function DocumentViewer({ partId, documents }: DocumentViewerProps) {
  const {
    isOpen,
    currentDocument,
    currentIndex,
    totalDocuments,
    closeViewer,
    goToNext,
    goToPrevious,
    canGoNext,
    canGoPrevious,
  } = useDocumentViewer(documents);

  return (
    <>
      <MediaViewer
        partId={partId}
        document={currentDocument}
        open={isOpen}
        onClose={closeViewer}
        onNext={goToNext}
        onPrevious={goToPrevious}
        canGoNext={canGoNext}
        canGoPrevious={canGoPrevious}
        currentIndex={currentIndex}
        totalCount={totalDocuments}
      />
    </>
  );
}

// Export the hook for direct use in other components
export { useDocumentViewer };