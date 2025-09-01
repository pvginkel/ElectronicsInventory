import { useState, useCallback, useRef, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { IconButton } from '@/components/ui/hover-actions';
import { getDownloadUrl, getViewUrl } from '@/lib/utils/thumbnail-urls';

interface MediaViewerProps {
  partId: string;
  document: {
    id: string;
    name: string;
    type: 'file' | 'url';
    mimeType?: string | null;
    filename?: string | null;
    originalUrl?: string | null; // For AI documents
    contentType?: string | null; // For AI documents
  } | null;
  open: boolean;
  onClose: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
  canGoNext?: boolean;
  canGoPrevious?: boolean;
  currentIndex?: number;
  totalCount?: number;
}

export function MediaViewer({ 
  partId,
  document, 
  open, 
  onClose,
  onNext,
  onPrevious,
  canGoNext = false,
  canGoPrevious = false,
  currentIndex,
  totalCount
}: MediaViewerProps) {
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Reset viewer state when document changes
  useEffect(() => {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
    setIsLoading(true);
    setImageError(false);
  }, [document?.id]);

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
    if (document) {
      if (document.originalUrl) {
        // For AI documents, use the original URL
        const a = globalThis.document.createElement('a');
        a.href = document.originalUrl;
        a.download = document.filename || document.name;
        a.click();
      } else if (document.type === 'file') {
        // For regular documents, use the download URL
        const downloadUrl = getDownloadUrl(partId, document.id);
        const a = globalThis.document.createElement('a');
        a.href = downloadUrl;
        a.download = document.filename || document.name;
        a.click();
      }
    }
  }, [partId, document]);

  if (!document || !open) return null;

  // Handle AI documents that have originalUrl and contentType
  const effectiveMimeType = document.contentType || document.mimeType;
  
  const isImage = (document.type === 'file' && effectiveMimeType?.startsWith('image/')) ||
                  document.originalUrl?.match(/\.(jpg|jpeg|png|gif|webp)(\?|$)/i);
  
  const isPdf = (document.type === 'file' && effectiveMimeType === 'application/pdf') ||
                document.originalUrl?.match(/\.pdf(\?|$)/i);

  if (!isImage && !isPdf) {
    // For non-images and non-PDFs, just close the modal (they should open in browser)
    onClose();
    return null;
  }

  // Use originalUrl for AI documents, otherwise use view URL
  const fileUrl = document.originalUrl || getViewUrl(partId, document.id);

  return (
    <Dialog open={open} onOpenChange={onClose} className="w-[calc(100vw-60px)] h-[calc(100vh-60px)] max-w-none max-h-none m-[30px]">
      <DialogContent className="w-full h-full p-0 bg-black/95">
        {/* Header */}
        <div className="absolute top-0 left-0 right-0 z-10 bg-black/80 backdrop-blur-sm p-4">
          <div className="flex items-center justify-between text-white">
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-medium truncate">{document.name}</h2>
            </div>
            
            <div className="flex items-center space-x-2">
              {/* Only show zoom controls for images */}
              {isImage && (
                <>
                  <IconButton
                    onClick={zoomOut}
                    icon={
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8"/>
                        <path d="M21 21l-4.35-4.35"/>
                        <line x1="8" y1="11" x2="14" y2="11"/>
                      </svg>
                    }
                    tooltip="Zoom out"
                  />
                  
                  <span className="text-sm px-2">{Math.round(zoom * 100)}%</span>
                  
                  <IconButton
                    onClick={zoomIn}
                    icon={
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8"/>
                        <path d="M21 21l-4.35-4.35"/>
                        <line x1="11" y1="8" x2="11" y2="14"/>
                        <line x1="8" y1="11" x2="14" y2="11"/>
                      </svg>
                    }
                    tooltip="Zoom in"
                  />
                  
                  <IconButton
                    onClick={resetZoom}
                    icon={
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
                        <path d="M21 3v5h-5"/>
                        <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
                        <path d="M8 16H3v5"/>
                      </svg>
                    }
                    tooltip="Reset zoom"
                  />
                </>
              )}

              {totalCount && totalCount > 1 && (
                <span className="text-sm text-white/70 whitespace-nowrap">
                  {(currentIndex ?? 0) + 1} of {totalCount}
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
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="15" y1="9" x2="9" y2="15"/>
                      <line x1="9" y1="9" x2="15" y2="15"/>
                    </svg>
                  </div>
                  <p>Failed to load image</p>
                </div>
              ) : (
                <img
                  ref={imageRef}
                  src={fileUrl}
                  alt={document.name}
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
              src={fileUrl}
              className="w-full h-full border-0"
              title={document.name}
            />
          ) : null}
        </div>

        {/* Navigation */}
        {canGoPrevious && (
          <button
            onClick={onPrevious}
            className="absolute left-4 top-1/2 transform -translate-y-1/2 w-12 h-12 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center text-white transition-colors"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15,18 9,12 15,6"/>
            </svg>
          </button>
        )}
        
        {canGoNext && (
          <button
            onClick={onNext}
            className="absolute right-4 top-1/2 transform -translate-y-1/2 w-12 h-12 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center text-white transition-colors"
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