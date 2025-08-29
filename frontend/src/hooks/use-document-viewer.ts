import { useState, useCallback, useEffect } from 'react';

interface Document {
  id: string;
  name: string;
  type: 'file' | 'url';
  url?: string | null;
  filename?: string | null;
  mimeType?: string | null;
  createdAt: string;
}

export function useDocumentViewer(documents: Document[]) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  
  const currentDocument = documents[currentIndex] || null;
  
  const openViewer = useCallback((documentId: string) => {
    const index = documents.findIndex(doc => doc.id === documentId);
    if (index !== -1) {
      setCurrentIndex(index);
      setIsOpen(true);
    }
  }, [documents]);

  const closeViewer = useCallback(() => {
    setIsOpen(false);
  }, []);

  const goToNext = useCallback(() => {
    if (documents.length > 0) {
      setCurrentIndex((prev) => (prev + 1) % documents.length);
    }
  }, [documents.length]);

  const goToPrevious = useCallback(() => {
    if (documents.length > 0) {
      setCurrentIndex((prev) => (prev - 1 + documents.length) % documents.length);
    }
  }, [documents.length]);

  const goToIndex = useCallback((index: number) => {
    if (index >= 0 && index < documents.length) {
      setCurrentIndex(index);
    }
  }, [documents.length]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          closeViewer();
          break;
        case 'ArrowLeft':
          goToPrevious();
          break;
        case 'ArrowRight':
          goToNext();
          break;
        default:
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeViewer, goToPrevious, goToNext]);

  return {
    isOpen,
    currentDocument,
    currentIndex,
    totalDocuments: documents.length,
    openViewer,
    closeViewer,
    goToNext,
    goToPrevious,
    goToIndex,
    canGoNext: documents.length > 1,
    canGoPrevious: documents.length > 1,
  };
}