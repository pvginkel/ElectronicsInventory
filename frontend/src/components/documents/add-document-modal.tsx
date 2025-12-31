import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormLabel } from '@/components/ui/form';
import { DropZone } from '@/components/ui/drop-zone';
import { ProgressBar } from '@/components/ui/progress-bar';
import { CameraCapture } from './camera-capture';
import { useAddDocumentModal } from '@/hooks/use-add-document-modal';
import { useCameraDetection } from '@/hooks/use-camera-detection';
import { LinkIcon } from '@/components/icons/LinkIcon';
import pdfIconSvg from '@/assets/pdf-icon.svg';

interface AddDocumentModalProps {
  partId?: string;
  attachmentSetId?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDocumentAdded?: () => void;
}

export function AddDocumentModal({
  partId,
  attachmentSetId,
  open,
  onOpenChange,
  onDocumentAdded
}: AddDocumentModalProps) {
  // Don't render anything when closed - this ensures complete unmounting
  if (!open) {
    return null;
  }

  return (
    <AddDocumentModalContent
      partId={partId}
      attachmentSetId={attachmentSetId}
      open={open}
      onOpenChange={onOpenChange}
      onDocumentAdded={onDocumentAdded}
    />
  );
}

function AddDocumentModalContent({
  partId,
  attachmentSetId,
  open,
  onOpenChange,
  onDocumentAdded
}: AddDocumentModalProps) {
  const [showCamera, setShowCamera] = useState(false);
  const { hasCamera } = useCameraDetection();

  const {
    document,
    isUploading,
    uploadProgress,
    urlPreview,
    handlers: {
      handleUrlChange,
      handleFileSelect,
      handleCameraCapture,
      handleNameChange,
      handleSubmit,
    },
  } = useAddDocumentModal(partId ? { partId } : { attachmentSetId });

  // Reset camera state when modal closes
  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Turn off camera when modal closes externally (backdrop/escape)
      setShowCamera(false);
    }
  }, [open]);

  const handleClose = () => {
    onOpenChange(false);
    setShowCamera(false);
  };

  const handleSubmitWrapper = async () => {
    try {
      await handleSubmit();
      onDocumentAdded?.();
      handleClose();
    } catch {
      // Error is already handled in the hook
    }
  };

  const handleCameraSuccess = (file: File) => {
    handleCameraCapture(file);
    setShowCamera(false);
  };

  const isPreviewImage = document?.type === 'file' && 
                        document?.file?.type.startsWith('image/') && 
                        document?.preview;

  const canSubmit = document && 
                   document.name.trim() && 
                   !isUploading && 
                   (document.file || document.url);

  return (
    <>
      <Dialog open={open && !showCamera} onOpenChange={handleClose}>
        <DialogContent
          className="max-w-2xl max-h-[80vh] overflow-y-auto"
          data-testid="parts.documents.modal"
        >
          <DialogHeader>
            <DialogTitle>Add Document</DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* URL Input */}
            <div>
              <FormLabel className="block mb-2">
                URL
              </FormLabel>
              <Input
                placeholder="https://example.com/datasheet.pdf"
                value={document?.url || ''}
                onChange={(e) => handleUrlChange(e.target.value)}
                disabled={isUploading}
                data-testid="parts.documents.modal.url"
              />
              {urlPreview.isLoading && (
                <p className="text-xs text-muted-foreground mt-1">
                  Fetching page title...
                </p>
              )}
              {urlPreview.error && (
                <p className="text-xs text-red-500 mt-1">
                  {urlPreview.error}
                </p>
              )}
            </div>

            {/* Name Input */}
            <div>
              <FormLabel className="block mb-2" required>
                Document Name
              </FormLabel>
              <Input
                placeholder="Enter a descriptive name..."
                value={document?.name || ''}
                onChange={(e) => handleNameChange(e.target.value)}
                disabled={isUploading}
                data-testid="parts.documents.modal.name"
              />
            </div>

            {/* Preview Area / File Drop */}
            <div>
              <FormLabel className="block mb-2">
                Preview
              </FormLabel>

              {document && isPreviewImage ? (
                // Image Preview
                <div className="border-2 border-dashed border-muted rounded-lg p-4">
                  <div className="flex flex-col items-center">
                    <img
                      src={document.preview}
                      alt="Preview"
                      className="max-w-full max-h-64 object-contain rounded mb-4"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={() => {
                        if (document.preview) {
                          URL.revokeObjectURL(document.preview);
                        }
                        handleFileSelect([]);
                      }}
                      disabled={isUploading}
                    >
                      Remove File
                    </Button>
                  </div>
                </div>
              ) : document?.type === 'file' && document?.file ? (
                // Non-image file preview
                <div className="border-2 border-dashed border-muted rounded-lg p-4">
                  <div className="flex flex-col items-center">
                    <div className="w-16 h-16 bg-muted rounded-lg flex items-center justify-center mb-4">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6C4.9 2 4 2.9 4 4v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6z"/>
                        <path d="M14 2v6h6"/>
                      </svg>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={() => handleFileSelect([])}
                      disabled={isUploading}
                    >
                      Remove File
                    </Button>
                  </div>
                </div>
              ) : document?.type === 'url' && document?.url ? (
                // URL preview - show image if backend provided one
                <div className="border-2 border-dashed border-muted rounded-lg p-4">
                  <div className="flex flex-col items-center">
                    {urlPreview.imageUrl ? (
                      // Show image preview from backend
                      <img
                        src={urlPreview.imageUrl}
                        alt="URL Preview"
                        className="max-w-full max-h-64 object-contain rounded"
                      />
                    ) : (
                      // Show URL or PDF icon based on content type
                      <div className="w-24 h-24 bg-muted rounded-lg flex items-center justify-center mt-4 mb-4">
                        {urlPreview.contentType === 'pdf' ? (
                          <img src={pdfIconSvg} alt="PDF" />
                        ) : (
                          <LinkIcon className="" />
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                // Drop zone
                <div data-testid="parts.documents.modal.dropzone">
                  <DropZone
                    onFilesSelected={handleFileSelect}
                    disabled={isUploading}
                    className="min-h-32"
                  />
                  
                  {hasCamera && (
                    <div className="mt-4 text-center">
                      <Button
                        variant="outline"
                        onClick={() => setShowCamera(true)}
                        disabled={isUploading}
                        icon={
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                            <circle cx="12" cy="13" r="4"/>
                          </svg>
                        }
                      >
                        Capture Photo
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Upload Progress */}
            {isUploading && (
              <div>
                <ProgressBar
                  value={uploadProgress}
                  showLabel
                  className="mb-2"
                />
                <p className="text-sm text-center text-muted-foreground">
                  Uploading document...
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={isUploading}
              data-testid="parts.documents.modal.cancel"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSubmitWrapper}
              disabled={!canSubmit}
              loading={isUploading}
              data-testid="parts.documents.modal.submit"
            >
              Add Document
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showCamera && (
        <CameraCapture
          open={showCamera}
          onCapture={handleCameraSuccess}
          onClose={() => setShowCamera(false)}
        />
      )}
    </>
  );
}
