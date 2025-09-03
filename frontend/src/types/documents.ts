/**
 * Unified type definitions for document grid and media viewer components.
 * These are context-agnostic and can be used with both part and AI documents.
 */

export interface DocumentItem {
  id: string;
  title: string;
  type: 'image' | 'pdf' | 'website';
  previewImageUrl: string | null;
  assetUrl: string;
  isCover: boolean;
  hasImage?: boolean; // For website attachments, indicates if they have a thumbnail
}

export interface DocumentGridProps {
  documents: DocumentItem[];
  onTileClick: (document: DocumentItem) => void;
  onToggleCover: (documentId: string) => void;
  onDelete: (documentId: string) => Promise<boolean>;
  showCoverToggle?: boolean;
}

export interface MediaViewerProps {
  documents: DocumentItem[];
  currentDocumentId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onNavigate?: (documentId: string) => void;
}

// Event handler types
export type DocumentClickHandler = (document: DocumentItem) => void;
export type DocumentToggleHandler = (documentId: string) => void;
export type DocumentDeleteHandler = (documentId: string) => Promise<boolean>;
export type DocumentNavigateHandler = (documentId: string) => void;