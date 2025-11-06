import { useState, useCallback, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { IconButton } from '@/components/ui/hover-actions';
import { IconBadge } from '@/components/ui';
import { X } from 'lucide-react';
import { ZoomInIcon } from '@/components/icons/ZoomInIcon';
import { ZoomOutIcon } from '@/components/icons/ZoomOutIcon';
import { ZoomResetIcon } from '@/components/icons/ZoomResetIcon';
import type { MediaViewerProps } from '@/types/documents';

export function MediaViewerBase({ 
  documents,
  currentDocumentId,
  isOpen,
  onClose,
  onNavigate
}: MediaViewerProps) {
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentDocument = documents.find(doc => doc.id === currentDocumentId) || null;
  const currentIndex = currentDocument ? documents.findIndex(doc => doc.id === currentDocumentId) : -1;

  // Reset viewer state when document changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Reset zoom/position/loading when viewing different document
    setZoom(1);
    setPosition({ x: 0, y: 0 });
    setIsLoading(true);
    setImageError(false);
  }, [currentDocumentId]);

  const handleImageLoad = useCallback(() => {
    setIsLoading(false);
    setImageError(false);
  }, []);

  const handleImageError = useCallback(() => {
    setIsLoading(false);
    setImageError(true);
  }, []);

  const zoomIn = useCallback(() => {
    setZoom(prev => Math.min(prev * 1.5, 5));
  }, []);

  const zoomOut = useCallback(() => {
    setZoom(prev => Math.max(prev / 1.5, 0.25));
  }, []);

  const resetZoom = useCallback(() => {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (zoom > 1) {
      setIsDragging(true);
      setDragStart({
        x: e.clientX - position.x,
        y: e.clientY - position.y
      });
    }
  }, [zoom, position]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging && zoom > 1) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  }, [isDragging, dragStart, zoom]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(prev => Math.min(Math.max(prev * delta, 0.25), 5));
  }, []);

  const handleDownload = useCallback(() => {
    if (currentDocument) {
      const a = globalThis.document.createElement('a');
      a.href = currentDocument.assetUrl;
      a.download = currentDocument.title;
      a.click();
    }
  }, [currentDocument]);

  const goToNext = useCallback(() => {
    if (documents.length > 1 && currentIndex < documents.length - 1) {
      const nextDocument = documents[currentIndex + 1];
      onNavigate?.(nextDocument.id);
    } else if (documents.length > 1) {
      // Wrap to first document
      const firstDocument = documents[0];
      onNavigate?.(firstDocument.id);
    }
  }, [documents, currentIndex, onNavigate]);

  const goToPrevious = useCallback(() => {
    if (documents.length > 1 && currentIndex > 0) {
      const prevDocument = documents[currentIndex - 1];
      onNavigate?.(prevDocument.id);
    } else if (documents.length > 1) {
      // Wrap to last document
      const lastDocument = documents[documents.length - 1];
      onNavigate?.(lastDocument.id);
    }
  }, [documents, currentIndex, onNavigate]);

  // Handle keyboard navigation
  const handleKeyDownRef = useRef<((e: KeyboardEvent) => void) | undefined>(undefined);
  
  useEffect(() => {
    handleKeyDownRef.current = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          e.stopPropagation();
          onClose();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          e.stopPropagation();
          goToPrevious();
          break;
        case 'ArrowRight':
          e.preventDefault();
          e.stopPropagation();
          goToNext();
          break;
        default:
          break;
      }
    };
  }, [onClose, goToPrevious, goToNext]);

  useEffect(() => {
    if (!isOpen) return;

    const eventListener = (e: KeyboardEvent) => {
      handleKeyDownRef.current?.(e);
    };

    document.addEventListener('keydown', eventListener);
    return () => document.removeEventListener('keydown', eventListener);
  }, [isOpen]);

  if (!currentDocument || !isOpen) return null;

  const isImage = currentDocument.type === 'image';
  const isPdf = currentDocument.type === 'pdf';
  const isWebsite = currentDocument.type === 'website';

  // For websites, just close the modal - they should open in browser
  if (isWebsite) {
    onClose();
    return null;
  }

  const canGoNext = documents.length > 1;
  const canGoPrevious = documents.length > 1;

  return (
    <Dialog open={isOpen} onOpenChange={onClose} className="w-[calc(100vw-60px)] h-[calc(100vh-60px)] max-w-none max-h-none">
      <DialogContent className="w-full h-full p-0 bg-black/95">
        {/* Header */}
        <div className="absolute top-0 left-0 right-0 z-10 bg-black/80 backdrop-blur-sm p-4">
          <div className="flex items-center justify-between text-white">
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-lg font-medium truncate">{currentDocument.title}</DialogTitle>
            </div>
            
            <div className="flex items-center space-x-2">
              {/* Only show zoom controls for images */}
              {isImage && (
                <>
                  <IconButton
                    onClick={zoomOut}
                    icon={<ZoomOutIcon />}
                    tooltip="Zoom out"
                  />
                  
                  <span className="text-sm px-2">{Math.round(zoom * 100)}%</span>
                  
                  <IconButton
                    onClick={zoomIn}
                    icon={<ZoomInIcon />}
                    tooltip="Zoom in"
                  />
                  
                  <IconButton
                    onClick={resetZoom}
                    icon={<ZoomResetIcon />}
                    tooltip="Reset zoom"
                  />
                </>
              )}

              {documents.length > 1 && (
                <span className="text-sm text-white/70 whitespace-nowrap">
                  {currentIndex + 1} of {documents.length}
                </span>
              )}

              <IconButton
                onClick={handleDownload}
                icon={
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7,10 12,15 17,10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                }
                tooltip="Download"
              />
              
              <IconButton
                onClick={onClose}
                icon={
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                }
                tooltip="Close"
              />
            </div>
          </div>
        </div>

        {/* Content Container */}
        <div 
          ref={containerRef}
          className={`absolute inset-0 pt-16 overflow-hidden ${
            isImage ? 'flex items-center justify-center' : ''
          }`}
          onMouseDown={isImage ? handleMouseDown : undefined}
          onMouseMove={isImage ? handleMouseMove : undefined}
          onMouseUp={isImage ? handleMouseUp : undefined}
          onMouseLeave={isImage ? handleMouseUp : undefined}
          onWheel={isImage ? handleWheel : undefined}
          style={{ cursor: isImage && zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
        >
          {isImage ? (
            <>
              {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-2 border-white border-t-transparent" />
                </div>
              )}
              
              {imageError ? (
                <div className="text-center text-white">
                  <div className="mx-auto mb-4">
                    <IconBadge size="xl" variant="destructive">
                      <X className="h-8 w-8" />
                    </IconBadge>
                  </div>
                  <p>Failed to load image</p>
                </div>
              ) : (
                <img
                  ref={imageRef}
                  src={currentDocument.assetUrl}
                  alt={currentDocument.title}
                  className="max-w-full max-h-full object-contain select-none"
                  style={{
                    transform: `scale(${zoom}) translate(${position.x / zoom}px, ${position.y / zoom}px)`,
                    transition: isDragging ? 'none' : 'transform 0.2s ease-out',
                    opacity: isLoading ? 0 : 1
                  }}
                  onLoad={handleImageLoad}
                  onError={handleImageError}
                  draggable={false}
                />
              )}
            </>
          ) : isPdf ? (
            <iframe
              src={currentDocument.assetUrl}
              className="w-full h-full border-0"
              title={currentDocument.title}
            />
          ) : null}
        </div>

        {/* Navigation */}
        {canGoPrevious && (
          <button
            onClick={goToPrevious}
            className="absolute left-4 top-1/2 transform -translate-y-1/2 w-12 h-12 rounded-full bg-black/60 hover:bg-black/80 cursor-pointer flex items-center justify-center text-white transition-colors"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15,18 9,12 15,6"/>
            </svg>
          </button>
        )}

        {canGoNext && (
          <button
            onClick={goToNext}
            className="absolute right-4 top-1/2 transform -translate-y-1/2 w-12 h-12 rounded-full bg-black/60 hover:bg-black/80 cursor-pointer flex items-center justify-center text-white transition-colors"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9,18 15,12 9,6"/>
            </svg>
          </button>
        )}
      </DialogContent>
    </Dialog>
  );
}