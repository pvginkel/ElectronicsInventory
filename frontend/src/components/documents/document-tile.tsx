import { useState } from 'react';
import { IconButton } from '@/components/ui/hover-actions';
import { ConfirmDialog } from '@/components/ui/dialog';
import { useConfirm } from '@/hooks/use-confirm';
import type { DocumentItem } from '@/types/documents';

interface DocumentTileProps {
  document: DocumentItem;
  onTileClick: (document: DocumentItem) => void;
  onToggleCover: (documentId: string) => void;
  onDelete: (documentId: string) => Promise<boolean>;
  showCoverToggle?: boolean;
}

export function DocumentTile({
  document,
  onTileClick,
  onToggleCover,
  onDelete,
  showCoverToggle = true
}: DocumentTileProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const { confirm, confirmProps } = useConfirm();

  const handleTileClick = () => {
    onTileClick(document);
  };

  const handleToggleCover = async () => {
    onToggleCover(document.id);
  };

  const handleDelete = async () => {
    
    const confirmed = await confirm({
      title: 'Delete Document',
      description: `Are you sure you want to delete "${document.title}"? This action cannot be undone.`,
      confirmText: 'Delete',
      destructive: true
    });

    if (!confirmed) {
      return;
    }

    setIsDeleting(true);
    try {
      const success = await onDelete(document.id);
      if (!success) {
        console.error('Failed to delete document');
      }
    } catch (error) {
      console.error('Error deleting document:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  const getTypeDisplay = () => {
    switch (document.type) {
      case 'image': return 'Image';
      case 'pdf': return 'PDF';
      case 'website': return 'Link';
      default: return 'Document';
    }
  };

  const getTypeIcon = () => {
    switch (document.type) {
      case 'image':
        return (
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21,15 16,10 5,21"/>
          </svg>
        );
      case 'pdf':
        return (
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2Z"/>
            <polyline points="14,2 14,8 20,8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
            <polyline points="10,9 9,9 8,9"/>
          </svg>
        );
      case 'website':
        return (
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
          </svg>
        );
      default:
        return (
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2Z"/>
            <polyline points="14,2 14,8 20,8"/>
          </svg>
        );
    }
  };

  return (
    <div className={`relative bg-card border rounded-lg overflow-hidden transition-all ${
      isDeleting ? 'opacity-50 pointer-events-none' : 'hover:shadow-md'
    }`}>
      <div className="relative aspect-square">
        <div 
          className="w-full h-full cursor-pointer"
          onClick={handleTileClick}
        >
          {document.previewImageUrl ? (
            <img
              src={document.previewImageUrl}
              alt={document.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-muted">
              <div className="text-center p-4">
                {getTypeIcon()}
                <div className="text-xs text-muted-foreground mt-2">{getTypeDisplay()}</div>
              </div>
            </div>
          )}
        </div>
        
        {/* Action buttons positioned at top-right */}
        <div className="absolute top-2 right-2 flex space-x-1">
          {showCoverToggle && (
            <IconButton
              onClick={handleToggleCover}
              icon={
                <svg width="16" height="16" viewBox="0 0 24 24" fill={document.isCover ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" className={document.isCover ? "text-blue-500" : ""}>
                  <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
                </svg>
              }
              tooltip={document.isCover ? "Current cover" : "Set as cover"}
              variant="default"
            />
          )}
          <IconButton
            onClick={handleDelete}
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
              </svg>
            }
            tooltip="Delete"
            variant="destructive"
          />
        </div>
      </div>

      <div className="p-3">
        <h3 className="text-sm font-medium truncate mb-1" title={document.title}>
          {document.title}
        </h3>
        
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{getTypeDisplay()}</span>
        </div>
      </div>

      {isDeleting && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent" />
        </div>
      )}

      <ConfirmDialog {...confirmProps} />
    </div>
  );
}