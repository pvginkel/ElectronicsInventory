import { useState } from 'react';
import { Thumbnail } from '@/components/ui/thumbnail';
import { IconButton } from '@/components/ui/hover-actions';
import { ConfirmDialog } from '@/components/ui/dialog';
import { useConfirm } from '@/hooks/use-confirm';
import { useSetCoverAttachment } from '@/hooks/use-cover-image';
import { useDeleteDocument } from '@/hooks/use-part-documents';

interface DocumentCardProps {
  partId: string;
  document: {
    id: string;
    name: string;
    type: 'file' | 'url';
    url?: string | null;
    filename?: string | null;
    fileSize?: number | null;
    mimeType?: string | null;
    createdAt: string;
    previewImageUrl?: string | null; // For AI documents with preview images
    originalUrl?: string | null; // For AI documents - original URL for media viewer
    contentType?: string | null; // For AI documents - content type for media viewer
    isCoverImage?: boolean; // For AI documents - whether this should be the cover image
  };
  isCover?: boolean;
  onClick?: () => void;
  onCoverChange?: () => void;
  onDelete?: () => void; // Custom delete handler for AI documents
  readOnly?: boolean; // Disable delete/cover controls for AI preview
  hideCoverActions?: boolean; // Hide cover actions completely
}

export function DocumentCard({ 
  partId, 
  document, 
  isCover = false, 
  onClick,
  onCoverChange,
  onDelete,
  readOnly = false,
  hideCoverActions = false
}: DocumentCardProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  
  const { confirm, confirmProps } = useConfirm();
  const setCoverMutation = useSetCoverAttachment();
  const deleteDocumentMutation = useDeleteDocument();

  const handleSetCover = async () => {
    if (onDelete && document.isCoverImage !== undefined) {
      // For AI documents, use custom cover change handler
      onCoverChange?.();
    } else {
      // For regular documents, use the API mutation
      try {
        await setCoverMutation.mutateAsync({
          path: { part_key: partId },
          body: { attachment_id: parseInt(document.id) }
        });
        onCoverChange?.();
      } catch (error) {
        console.error('Failed to set cover:', error);
      }
    }
  };

  const handleDelete = async () => {
    if (onDelete) {
      // Use custom delete handler for AI documents
      onDelete();
      return;
    }

    // Default delete handler for regular documents
    const confirmed = await confirm({
      title: 'Delete Document',
      description: `Are you sure you want to delete "${document.name}"? This action cannot be undone.`,
      confirmText: 'Delete',
      destructive: true
    });

    if (!confirmed) {
      return;
    }

    setIsDeleting(true);
    try {
      await deleteDocumentMutation.mutateAsync({
        path: { 
          part_key: partId, 
          attachment_id: parseInt(document.id)
        }
      });
    } catch (error) {
      console.error('Failed to delete document:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCardClick = () => {
    if (document.type === 'url' && document.url) {
      // Open URL in new tab
      window.open(document.url, '_blank', 'noopener,noreferrer');
    } else if (document.type === 'file') {
      // For all file types (images and PDFs), use the onClick handler
      // The parent component will decide how to handle them
      onClick?.();
    }
  };

  const isPdf = document.type === 'file' && 
               (document.mimeType === 'application/pdf' || 
                document.filename?.toLowerCase().endsWith('.pdf'));

  const isUrl = document.type === 'url';

  const formatFileSize = (bytes?: number | null): string => {
    if (!bytes) return '';
    const mb = bytes / (1024 * 1024);
    return mb >= 1 ? `${mb.toFixed(1)}MB` : `${(bytes / 1024).toFixed(0)}KB`;
  };

  return (
    <div className={`relative bg-card border rounded-lg overflow-hidden transition-all ${
      isDeleting ? 'opacity-50 pointer-events-none' : 'hover:shadow-md'
    }`}>
      <div className="relative aspect-square">
        <div 
          className="w-full h-full cursor-pointer"
          onClick={handleCardClick}
        >
          {document.previewImageUrl ? (
            // AI document with preview image
            <img
              src={document.previewImageUrl}
              alt={document.name}
              className="w-full h-full object-cover"
            />
          ) : isUrl ? (
            // URL attachment display
            <div className="w-full h-full flex items-center justify-center bg-muted">
              <div className="text-center p-4">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mx-auto mb-2">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
                <div className="text-xs text-muted-foreground">URL</div>
              </div>
            </div>
          ) : (
            // File attachment display
            <Thumbnail
              partKey={partId}
              attachmentId={document.id}
              alt={document.name}
              size="large"
              isPdf={isPdf}
              className="w-full h-full"
            />
          )}
        </div>
        
        {/* Action buttons positioned at top-right */}
        {!readOnly && (
          <div className="absolute top-2 right-2 flex space-x-1">
            {!hideCoverActions && (
              <IconButton
                onClick={handleSetCover}
                icon={
                  <svg width="16" height="16" viewBox="0 0 24 24" fill={(isCover || document.isCoverImage) ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" className={(isCover || document.isCoverImage) ? "text-blue-500" : ""}>
                    <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
                  </svg>
                }
                tooltip={(isCover || document.isCoverImage) ? "Current cover" : "Set as cover"}
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
        )}
      </div>

      <div className="p-3">
        <h3 className="text-sm font-medium truncate mb-1" title={document.name}>
          {document.name}
        </h3>
        
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {isPdf ? 'PDF' : isUrl ? 'Link' : 'Image'}
          </span>
          {document.fileSize && (
            <span>{formatFileSize(document.fileSize)}</span>
          )}
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