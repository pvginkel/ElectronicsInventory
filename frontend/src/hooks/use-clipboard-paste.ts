import { useEffect, useCallback } from 'react';
import { validateFile } from '@/lib/utils/file-validation';
import { useDocumentUpload } from '@/hooks/use-document-upload';
import { useToast } from '@/hooks/use-toast';

interface UseClipboardPasteOptions {
  partId: string;
  enabled?: boolean;
  onUploadSuccess?: (documentId: number) => void;
}

/**
 * Hook that enables clipboard image paste functionality for a part.
 * Listens for paste events and automatically uploads pasted images as part documents.
 * 
 * @param options.partId - The ID of the part to attach documents to
 * @param options.enabled - Whether clipboard paste is enabled (default: true)
 * @param options.onUploadSuccess - Callback fired after successful upload
 */
export function useClipboardPaste({
  partId,
  enabled = true,
  onUploadSuccess
}: UseClipboardPasteOptions) {
  const { uploadDocument } = useDocumentUpload();
  const { showInfo, showError } = useToast();

  const handlePaste = useCallback(async (event: ClipboardEvent) => {
    // Check if paste should be handled
    if (!enabled || !event.clipboardData) return;

    // Prevent paste handling when focus is in a text input field
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLInputElement || 
        activeElement instanceof HTMLTextAreaElement ||
        activeElement?.getAttribute('contenteditable') === 'true') {
      return;
    }

    // Check for images in clipboard
    const items = Array.from(event.clipboardData.items);
    const imageItem = items.find(item => item.type.startsWith('image/'));

    if (!imageItem) {
      return; // No image found, let default paste behavior continue
    }

    // Prevent default paste behavior for images
    event.preventDefault();

    // Convert DataTransferItem to File
    const file = imageItem.getAsFile();
    if (!file) {
      showError('Failed to extract image from clipboard');
      return;
    }

    // Validate the file
    const validation = validateFile(file);
    if (!validation.isValid) {
      showError(validation.error || 'Invalid file');
      return;
    }

    // Generate a descriptive filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileExtension = file.type.split('/')[1] || 'png';
    const fileName = `Clipboard Image - ${timestamp}.${fileExtension}`;
    const documentName = `Clipboard Image - ${timestamp}`;

    // Create a new File object with the generated name
    const namedFile = new File([file], fileName, { type: file.type });

    // Show upload notification
    showInfo('Uploading clipboard image...');

    // Upload the file using the existing hook
    const result = await uploadDocument({
      partId,
      file: namedFile,
      name: documentName,
    });

    // Call success callback with the document ID
    onUploadSuccess?.(result.id);
  }, [partId, enabled, uploadDocument, showInfo, showError, onUploadSuccess]);

  useEffect(() => {
    if (!enabled) return;

    // Add paste event listener to document
    document.addEventListener('paste', handlePaste);

    // Cleanup on unmount
    return () => {
      document.removeEventListener('paste', handlePaste);
    };
  }, [handlePaste, enabled]);

  return {
    // Currently no public API needed - hook works automatically via event listeners
    // Future enhancement: could expose manual paste trigger or paste state
  };
}