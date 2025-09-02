import { DocumentCard } from './document-card';
import { DocumentViewer, useDocumentViewer } from './document-viewer';
import { useCoverAttachment } from '@/hooks/use-cover-image';
import { DocumentIcon } from '@/components/icons/DocumentIcon';

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

interface DocumentGridProps {
  partId: string;
  documents: Document[];
  onDocumentClick?: (document: Document) => void;
  onDocumentChange?: () => void;
  onDocumentDelete?: (documentId: string) => void;
  onCoverChange?: (documentId: string) => void; // For AI documents
  hideCoverActions?: boolean;
}

export function DocumentGrid({ 
  partId, 
  documents, 
  onDocumentClick,
  onDocumentChange,
  onDocumentDelete,
  onCoverChange,
  hideCoverActions = false
}: DocumentGridProps) {
  const { coverAttachment } = useCoverAttachment(partId);
  const documentViewerHook = useDocumentViewer(documents);
  const { openViewer } = documentViewerHook;

  const handleDocumentClick = (document: Document) => {
    if (document.type === 'file') {
      // Open all file types (images and PDFs) in the viewer
      openViewer(document.id);
    } else {
      // Use the provided click handler for URLs
      onDocumentClick?.(document);
    }
  };

  if (documents.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-24 h-24 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
          <DocumentIcon className="w-8 h-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium mb-2">No documents yet</h3>
        <p className="text-muted-foreground mb-4">
          Add images, PDFs, or website links to document this part.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
        {documents.sort((a, b) => a.id.localeCompare(b.id)).map((document) => (
          <DocumentCard
            key={document.id}
            partId={partId}
            document={document}
            isCover={coverAttachment?.id === parseInt(document.id)}
            onClick={() => handleDocumentClick(document)}
            onCoverChange={onCoverChange ? () => onCoverChange(document.id) : onDocumentChange}
            onDelete={onDocumentDelete ? () => onDocumentDelete(document.id) : undefined}
            hideCoverActions={hideCoverActions}
          />
        ))}
      </div>
      
      <DocumentViewer partId={partId} viewerHook={documentViewerHook} />
    </>
  );
}