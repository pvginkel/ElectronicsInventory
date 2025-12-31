import { useState, useCallback, useEffect } from 'react';
import { useDocumentUpload } from './use-document-upload';
import { useAttachmentSetUpload } from './use-attachment-set-upload';
import { useUrlPreview } from './use-url-preview';
import { extractFilenameFromFile, generateTimestampFilename } from '@/lib/utils/filename-extraction';

export interface DocumentToAdd {
  type?: 'file' | 'url' | 'camera';
  file?: File;
  url?: string;
  name: string;
  preview?: string; // For image previews
}

interface UseAddDocumentModalOptions {
  partId?: string;
  attachmentSetId?: number;
}

export function useAddDocumentModal(options: UseAddDocumentModalOptions | string) {
  // Support both legacy string partId and new options object
  const { partId, attachmentSetId } = typeof options === 'string'
    ? { partId: options, attachmentSetId: undefined }
    : options;

  // Validate that exactly one ID is provided
  if (!partId && !attachmentSetId) {
    throw new Error('Either partId or attachmentSetId must be provided');
  }
  if (partId && attachmentSetId) {
    throw new Error('Only one of partId or attachmentSetId should be provided');
  }

  const [isOpen, setIsOpen] = useState(false);
  const [document, setDocument] = useState<DocumentToAdd>({ name: ''});
  const [uploadProgress, setUploadProgress] = useState(0);

  // Use the appropriate upload hook based on which ID is provided
  const partUploadHook = useDocumentUpload();
  const attachmentSetUploadHook = useAttachmentSetUpload();
  const isUploading = partId ? partUploadHook.isUploading : attachmentSetUploadHook.isUploading;

  const { previewState, processUrl, clearPreview } = useUrlPreview();

  const clearDocument = useCallback(() => {
    setDocument({ name: '' });
  }, []);

  const openModal = useCallback(() => {
    setIsOpen(true);
    clearDocument();
    setUploadProgress(0);
    clearPreview();
  }, [clearDocument, clearPreview]);

  const closeModal = useCallback(() => {
    setIsOpen(false);
    clearDocument();
    setUploadProgress(0);
    clearPreview();
  }, [clearDocument, clearPreview]);

  const handleUrlChange = useCallback(async (url: string) => {
    const trimmedUrl = url.trim();

    if (!trimmedUrl) {
      setDocument(prev => ({ ...prev, url: '', type: undefined }));
      return;
    }

    setDocument(prev => ({
      ...prev,
      url: trimmedUrl,
      type: 'url'
    }));
    
    // Process URL using backend preview
    await processUrl(trimmedUrl);
  }, [processUrl]);

  const handleFileSelect = useCallback((files: File[]) => {
    const file = files[0];
    if (!file) {
      // Clear file when no files are provided (Remove File functionality)
      setDocument(prev => {
        // Clean up any existing preview URL
        if (prev?.preview) {
          URL.revokeObjectURL(prev.preview);
        }
        return { name: prev?.name || '' };
      });
      return;
    }

    const name = extractFilenameFromFile(file);
    let preview: string | undefined;

    // Generate preview for images
    if (file.type.startsWith('image/')) {
      preview = URL.createObjectURL(file);
    }

    setDocument(prev => ({
      type: 'file',
      file,
      name: prev?.name || name,
      preview,
    }));
  }, []);

  const handleCameraCapture = useCallback((file: File) => {
    const timestampName = generateTimestampFilename('.jpg');
    const preview = URL.createObjectURL(file);

    setDocument(prev => ({
      type: 'camera',
      file,
      name: prev?.name || timestampName,
      preview,
    }));
  }, []);

  const handleNameChange = useCallback((name: string) => {
    setDocument(prev => ({ ...prev, name }));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!document || !document.name.trim()) return;

    if (partId) {
      await partUploadHook.uploadDocument({
        partId,
        file: document.file,
        url: document.url,
        name: document.name.trim(),
        onProgress: setUploadProgress,
      });
    } else if (attachmentSetId) {
      await attachmentSetUploadHook.uploadAttachment({
        attachmentSetId,
        file: document.file,
        url: document.url,
        name: document.name.trim(),
        onProgress: setUploadProgress,
      });
    }

    closeModal();
  }, [document, partId, attachmentSetId, partUploadHook, attachmentSetUploadHook, closeModal]);

  // Sync previewState with document when URL preview data becomes available
  useEffect(() => {
    if (document?.type === 'url' && previewState.title) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Update document with fetched URL preview metadata when available
      setDocument(prev => ({
        ...prev,
        url: previewState.url || prev?.url || '',
        name: prev?.name || previewState.title,
      }));
    }
  }, [previewState.title, previewState.url, document?.type]);

  // Clean up object URLs when document changes
  const previousPreview = document?.preview;
  if (previousPreview && document?.preview !== previousPreview) {
    URL.revokeObjectURL(previousPreview);
  }

  return {
    isOpen,
    openModal,
    closeModal,
    document,
    isUploading,
    uploadProgress,
    urlPreview: previewState,
    handlers: {
      handleUrlChange,
      handleFileSelect,
      handleCameraCapture,
      handleNameChange,
      handleSubmit,
    },
  };
}
