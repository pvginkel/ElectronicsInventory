import { useState } from 'react';
import { IconButton } from '@/components/ui/hover-actions';
import { ConfirmDialog } from '@/components/ui/dialog';
import { useConfirm } from '@/hooks/use-confirm';
import { useToast } from '@/hooks/use-toast';
import type { DocumentItem } from '@/types/documents';
import pdfIconSvg from '@/assets/pdf-icon.svg';
import { LinkIcon } from '@/components/icons/LinkIcon';
import { ExternalLinkIcon } from '@/components/icons/ExternalLinkIcon';
import { Card } from '@/components/ui/card';

interface DocumentTileProps {
  document: DocumentItem;
  onShowMedia: (document: DocumentItem) => void;
  onToggleCover: (documentId: string) => void;
  onDelete: (documentId: string) => Promise<boolean>;
  showCoverToggle?: boolean;
}

export function DocumentTile({
  document,
  onShowMedia,
  onToggleCover,
  onDelete,
  showCoverToggle = true
}: DocumentTileProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const { confirm, confirmProps } = useConfirm();
  const { showError, showException } = useToast();

  const handleTileClick = () => {
    if (document.type === 'website') {
      window.open(document.assetUrl, '_blank', 'noopener,noreferrer');
    } else {
      onShowMedia(document);
    }
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
        showError('Failed to delete document');
      }
    } catch (error) {
      showException('Failed to delete document', error);
    } finally {
      setIsDeleting(false);
    }
  };

  const getTypeDisplay = () => {
    switch (document.type) {
      case 'image': return 'Image';
      case 'pdf': return 'PDF';
      case 'website': return (
        <span className="inline-flex items-center gap-1">
          Link
          <ExternalLinkIcon className="w-3 h-3" />
        </span>
      );
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
          <img src={pdfIconSvg} width="110" height="110" alt="PDF" />
        );
      case 'website':
        return (
          <LinkIcon className="w-24 h-24" />
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
    <Card
      variant={isDeleting ? "grid-tile-disabled" : "grid-tile"}
      onClick={handleTileClick}
      className="p-0"
      data-document-tile
      data-document-id={document.id}>
      <div className="relative aspect-square">
        <div className="w-full h-full">
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
    </Card>
  );
}
