import { useState, useCallback } from 'react';
import { useDocumentUpload } from './use-document-upload';
import { useUrlPreview } from './use-url-preview';
import { extractFilenameFromFile, generateTimestampFilename, sanitizeFilename } from '@/lib/utils/filename-extraction';

export interface DocumentToAdd {
  type: 'file' | 'url' | 'camera';
  file?: File;
  url?: string;
  name: string;
  preview?: string; // For image previews
}

export function useAddDocumentModal(partId: string) {
  const [isOpen, setIsOpen] = useState(false);
  const [document, setDocument] = useState<DocumentToAdd | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  
  const { uploadDocument, isUploading } = useDocumentUpload();
  const { previewState, processUrl, clearPreview } = useUrlPreview();

  const openModal = useCallback(() => {
    setIsOpen(true);
    setDocument(null);
    setUploadProgress(0);
    clearPreview();
  }, [clearPreview]);

  const closeModal = useCallback(() => {
    setIsOpen(false);
    setDocument(null);
    setUploadProgress(0);
    clearPreview();
  }, [clearPreview]);


  const handleUrlChange = useCallback(async (url: string) => {
    if (!url.trim()) {
      setDocument(null);
      return;
    }

    const trimmedUrl = url.trim();
    
    // Process URL using backend preview
    await processUrl(trimmedUrl);
    
    // Backend will handle image detection automatically
    // Always treat as URL attachment - backend decides how to process it
    setDocument(prev => ({
      type: 'url',
      url: previewState.url || trimmedUrl,
      name: prev?.name || previewState.title || trimmedUrl,
    }));
  }, [processUrl, previewState]);

  const handleFileSelect = useCallback((files: File[]) => {
    const file = files[0];
    if (!file) return;

    const name = extractFilenameFromFile(file);
    let preview: string | undefined;

    // Generate preview for images
    if (file.type.startsWith('image/')) {
      preview = URL.createObjectURL(file);
    }

    setDocument({
      type: 'file',
      file,
      name: sanitizeFilename(name),
      preview,
    });
  }, []);

  const handleCameraCapture = useCallback((file: File) => {
    const timestampName = generateTimestampFilename('.jpg');
    const preview = URL.createObjectURL(file);

    setDocument({
      type: 'camera',
      file,
      name: timestampName,
      preview,
    });
  }, []);

  const handleNameChange = useCallback((name: string) => {
    setDocument(prev => prev ? { ...prev, name: sanitizeFilename(name) } : null);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!document || !document.name.trim()) return;

    try {
      await uploadDocument({
        partId,
        file: document.file,
        url: document.url,
        name: document.name.trim(),
        onProgress: setUploadProgress,
      });

      closeModal();
    } catch (error) {
      console.error('Upload failed:', error);
    }
  }, [document, partId, uploadDocument, closeModal]);

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