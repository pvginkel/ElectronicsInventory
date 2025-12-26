import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Thumbnail } from '@/components/ui/thumbnail';
import { usePartDocuments } from '@/hooks/use-part-documents';
import { useSetCoverAttachment, useRemoveCoverAttachment } from '@/hooks/use-cover-image';
import pdfIconSvg from '@/assets/pdf-icon.svg';

interface CoverImageSelectorProps {
  partId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentCoverAttachmentId?: number | null;
}

export function CoverImageSelector({ partId, open, onOpenChange, currentCoverAttachmentId }: CoverImageSelectorProps) {
  const [selectedAttachmentId, setSelectedAttachmentId] = useState<number | null>(null);

  const { documents, isLoading: documentsLoading } = usePartDocuments(partId);
  const setCoverMutation = useSetCoverAttachment();
  const removeCoverMutation = useRemoveCoverAttachment();

  const handleSetCover = async () => {
    if (!selectedAttachmentId) return;

    try {
      await setCoverMutation.mutateAsync({
        path: { part_key: partId },
        body: { attachment_id: selectedAttachmentId }
      });
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to set cover attachment:', error);
    }
  };

  const handleRemoveCover = async () => {
    try {
      await removeCoverMutation.mutateAsync({
        path: { part_key: partId }
      });
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to remove cover attachment:', error);
    }
  };

  const currentCoverId = currentCoverAttachmentId;
  const availableAttachments = documents;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Select Cover Image</DialogTitle>
        </DialogHeader>

        {documentsLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
          </div>
        ) : availableAttachments.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground">No attachments available. Add some documents first.</p>
          </div>
        ) : (
          <div>
            <div className="mb-4">
              <p className="text-sm text-muted-foreground">
                Select any attachment to use as the cover image for this part:
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
              {availableAttachments.map((doc) => {
                const docIdNum = parseInt(doc.id);
                const isSelected = selectedAttachmentId === docIdNum;
                const isCurrent = currentCoverId === docIdNum;
                const isPdf = doc.type === 'file' &&
                           (doc.mimeType === 'application/pdf' ||
                            doc.filename?.toLowerCase().endsWith('.pdf'));

                const fallbackIcon = isPdf ? (
                  <img src={pdfIconSvg} alt="PDF" width="40%" height="40%" className="text-muted-foreground" />
                ) : null;

                return (
                  <div
                    key={doc.id}
                    className={`relative cursor-pointer rounded-lg border-2 transition-colors ${
                      isSelected
                        ? 'border-primary bg-primary/10'
                        : isCurrent
                          ? 'border-green-500 bg-green-50'
                          : 'border-muted hover:border-muted-foreground/50'
                    }`}
                    onClick={() => setSelectedAttachmentId(docIdNum)}
                  >
                    <div className="p-2">
                      <div className="flex flex-col items-center">
                        <Thumbnail
                          previewUrl={doc.previewUrl}
                          alt={doc.name}
                          size="medium"
                          fallbackIcon={fallbackIcon}
                          className="mb-2"
                        />
                        <p className="text-xs text-center font-medium truncate w-full">
                          {doc.name}
                        </p>
                        {isCurrent && (
                          <span className="text-xs text-green-600 font-medium mt-1">
                            Current Cover
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {currentCoverId && (
              <div className="mb-4 p-3 bg-muted rounded-lg">
                <p className="text-sm">
                  <span className="font-medium">Current cover:</span>{' '}
                  {documents.find(d => parseInt(d.id) === currentCoverId)?.name}
                </p>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <div className="flex justify-between w-full">
            <div>
              {currentCoverId && (
                <Button
                  variant="outline"
                  onClick={handleRemoveCover}
                  disabled={removeCoverMutation.isPending}
                >
                  Remove Cover
                </Button>
              )}
            </div>
            <div className="flex space-x-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSetCover}
                disabled={!selectedAttachmentId || setCoverMutation.isPending}
              >
                Set as Cover
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
