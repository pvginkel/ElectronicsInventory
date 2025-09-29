import { useState, useMemo } from 'react';
import { DocumentGridBase } from '@/components/documents/document-grid-base';
import { MediaViewerBase } from '@/components/documents/media-viewer-base';
import type { DocumentItem } from '@/types/documents';
import type { components } from '@/lib/api/generated/types';

type DocumentSuggestionSchema = components['schemas']['AIPartCreateSchema.63ff6da.DocumentSuggestionSchema'];

interface AIDocumentGridWrapperProps {
  documents: DocumentSuggestionSchema[];
  onDocumentDelete: (index: number) => void;
  onCoverChange: (index: number) => void;
  readOnly?: boolean;
}


function getFilenameFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const filename = pathname.split('/').pop() || '';
    
    // If filename has extension, return it
    if (filename && filename.includes('.')) {
      return filename;
    }
    
    // If no filename or extension, try to construct one
    if (filename) {
      return filename;
    }
    
    // Fallback to domain name
    return urlObj.hostname;
  } catch {
    return url.split('/').pop() || 'Document';
  }
}

function getMimeTypeFromDocType(docType: string): string | null {
  const type = docType.toLowerCase();
  if (type.includes('pdf')) return 'application/pdf';
  if (type.includes('image')) return 'image/jpeg';
  if (type.includes('png')) return 'image/png';
  if (type.includes('jpg') || type.includes('jpeg')) return 'image/jpeg';
  if (type.includes('text')) return 'text/plain';
  if (type.includes('html')) return 'text/html';
  return null;
}

export function AIDocumentGridWrapper({ 
  documents, 
  onDocumentDelete,
  onCoverChange,
  readOnly = false 
}: AIDocumentGridWrapperProps) {
  const [currentDocumentId, setCurrentDocumentId] = useState<string | null>(null);
  const [isViewerOpen, setIsViewerOpen] = useState(false);

  // Transform AI documents to DocumentItem format
  const transformedDocuments: DocumentItem[] = useMemo(() => {
    const getFullUrl = (url: string | null | undefined): string | null => {
      if (!url) return null;
      if (url.startsWith('http')) {
        return url;
      }
      if (typeof window !== 'undefined') {
        try {
          return new URL(url, window.location.origin).toString();
        } catch {
          // Fall through to return the original value
        }
      }
      return url;
    };
    
    return documents.map((doc, index) => {
      const filename = getFilenameFromUrl(doc.url);
      const previewImageUrl = getFullUrl(doc.preview?.image_url);
      const originalUrl = getFullUrl(doc.preview?.original_url) || doc.url;
      const mimeType = doc.preview?.content_type || getMimeTypeFromDocType(doc.document_type);
      
      // Determine document type
      let type: 'image' | 'pdf' | 'website';
      if (mimeType?.includes('pdf') || doc.document_type.toLowerCase().includes('pdf')) {
        type = 'pdf';
      } else if (mimeType?.includes('image') || doc.document_type.toLowerCase().includes('image')) {
        type = 'image';
      } else {
        // Default to website for unknown types
        type = 'website';
      }
      
      return {
        id: `ai-doc-${index}`,
        title: doc.preview?.title || filename,
        type,
        previewImageUrl,
        assetUrl: originalUrl,
        isCover: doc.is_cover_image || false,
        hasImage: type === 'website' ? !!previewImageUrl : undefined,
      };
    });
  }, [documents]);

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
    if (readOnly) return;
    
    // Extract index from AI document ID
    const index = parseInt(documentId.replace('ai-doc-', ''));
    if (!isNaN(index)) {
      onCoverChange(index);
    }
  };

  const handleDelete = async (documentId: string): Promise<boolean> => {
    if (readOnly) return false;
    
    // Extract index from AI document ID
    const index = parseInt(documentId.replace('ai-doc-', ''));
    if (!isNaN(index)) {
      onDocumentDelete(index);
      return true;
    }
    return false;
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
        onTileClick={handleTileClick}
        onToggleCover={handleToggleCover}
        onDelete={handleDelete}
        showCoverToggle={!readOnly}
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
