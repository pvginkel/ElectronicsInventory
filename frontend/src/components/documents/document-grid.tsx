import { DocumentCard } from './document-card';
import { DocumentViewer, useDocumentViewer } from './document-viewer';
import { useCoverAttachment } from '@/hooks/use-cover-image';

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
          <svg 
            width="32" 
            height="32" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2"
            className="text-muted-foreground"
          >
            <path d="M14 2H6C4.9 2 4 2.9 4 4v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6z"/>
            <path d="M14 2v6h6"/>
            <path d="M16 13H8"/>
            <path d="M16 17H8"/>
            <path d="M10 9H8"/>
          </svg>
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
        {documents.map((document) => (
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