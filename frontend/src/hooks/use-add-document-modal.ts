import { useState, useCallback, useEffect } from 'react';
import { useDocumentUpload } from './use-document-upload';
import { useUrlPreview } from './use-url-preview';
import { extractFilenameFromFile, generateTimestampFilename } from '@/lib/utils/filename-extraction';

export interface DocumentToAdd {
  type?: 'file' | 'url' | 'camera';
  file?: File;
  url?: string;
  name: string;
  preview?: string; // For image previews
}

export function useAddDocumentModal(partId: string) {
  const [isOpen, setIsOpen] = useState(false);
  const [document, setDocument] = useState<DocumentToAdd>({ name: ''});
  const [uploadProgress, setUploadProgress] = useState(0);
  
  const { uploadDocument, isUploading } = useDocumentUpload();
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

    await uploadDocument({
      partId,
      file: document.file,
      url: document.url,
      name: document.name.trim(),
      onProgress: setUploadProgress,
    });

    closeModal();
  }, [document, partId, uploadDocument, closeModal]);

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
