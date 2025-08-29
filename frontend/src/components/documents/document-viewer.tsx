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

interface DocumentViewerHook {
  isOpen: boolean;
  currentDocument: Document | null;
  currentIndex: number;
  totalDocuments: number;
  openViewer: (documentId: string) => void;
  closeViewer: () => void;
  goToNext: () => void;
  goToPrevious: () => void;
  goToIndex: (index: number) => void;
  canGoNext: boolean;
  canGoPrevious: boolean;
}

interface DocumentViewerProps {
  partId: string;
  viewerHook: DocumentViewerHook;
}

export function DocumentViewer({ partId, viewerHook }: DocumentViewerProps) {
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
  } = viewerHook;

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