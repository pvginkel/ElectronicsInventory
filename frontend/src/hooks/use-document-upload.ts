import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { validateFile } from '@/lib/utils/file-validation';
import { useToast } from '@/hooks/use-toast';
import { parseApiError } from '@/lib/utils/error-parsing';
import { makeUniqueToken } from '@/lib/utils/random';

export interface UploadProgress {
  partId: string;
  progress: number;
  isUploading: boolean;
  error?: string;
}

export interface DocumentUploadOptions {
  partId: string;
  file?: File;
  url?: string;
  name: string;
  onProgress?: (progress: number) => void;
}

export interface DocumentUploadResult {
  id: number;
  title: string;
}

export function useDocumentUpload() {
  const [uploadProgress, setUploadProgress] = useState<Record<string, UploadProgress>>({});
  const queryClient = useQueryClient();
  const toast = useToast();
  
  function createUploadKey(partId: string): string {
    return `${partId}-${makeUniqueToken(12)}`;
  }

  const uploadDocument = useCallback(async (options: DocumentUploadOptions): Promise<DocumentUploadResult> => {
    const { partId, file, url, name, onProgress } = options;
    
    // Validate inputs
    if (!file && !url) {
      throw new Error('Either file or URL must be provided');
    }

    if (file && !url) {
      // File upload validation
      const validation = validateFile(file);
      if (!validation.isValid) {
        throw new Error(validation.error);
      }
    }

    if (url && !file) {
      // URL validation
      try {
        new URL(url);
      } catch {
        throw new Error('Invalid URL format');
      }
    }

    // Set initial upload state
    const uploadKey = createUploadKey(partId);
    setUploadProgress(prev => ({
      ...prev,
      [uploadKey]: {
        partId,
        progress: 0,
        isUploading: true,
      }
    }));

    try {
      let response: Response;

      if (file) {
        // File upload - use multipart/form-data
        const formData = new FormData();
        formData.append('title', name);
        formData.append('file', file);
        
        // Update progress
        onProgress?.(25);
        setUploadProgress(prev => ({
          ...prev,
          [uploadKey]: { ...prev[uploadKey], progress: 25 }
        }));

        onProgress?.(50);
        setUploadProgress(prev => ({
          ...prev,
          [uploadKey]: { ...prev[uploadKey], progress: 50 }
        }));

        response = await fetch(`/api/parts/${encodeURIComponent(partId)}/attachments`, {
          method: 'POST',
          body: formData,
        });
      } else if (url) {
        // URL attachment - use JSON
        onProgress?.(25);
        setUploadProgress(prev => ({
          ...prev,
          [uploadKey]: { ...prev[uploadKey], progress: 25 }
        }));

        onProgress?.(50);
        setUploadProgress(prev => ({
          ...prev,
          [uploadKey]: { ...prev[uploadKey], progress: 50 }
        }));

        response = await fetch(`/api/parts/${encodeURIComponent(partId)}/attachments`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            title: name,
            url: url,
          }),
        });
      } else {
        throw new Error('Either file or URL must be provided');
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Upload failed: ${response.status} ${errorText}`);
      }

      // Parse the response to get the document data
      const documentData = await response.json();
      
      // Complete progress
      onProgress?.(100);
      setUploadProgress(prev => ({
        ...prev,
        [uploadKey]: { ...prev[uploadKey], progress: 100, isUploading: false }
      }));

      // Invalidate queries to refresh the UI
      queryClient.invalidateQueries({ 
        queryKey: ['getPartsAttachmentsByPartKey', { path: { part_key: partId } }] 
      });
      queryClient.invalidateQueries({ 
        queryKey: ['getPartsCoverByPartKey', { path: { part_key: partId } }] 
      });

      // Clean up progress after a delay
      setTimeout(() => {
        setUploadProgress(prev => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { [uploadKey]: _removed, ...rest } = prev;
          return rest;
        });
      }, 2000);
      
      // Return the document data
      return {
        id: documentData.id,
        title: documentData.title
      };

    } catch (error) {
      const errorMessage = parseApiError(error);
      
      // Show error toast to user
      toast.showError(errorMessage);
      
      setUploadProgress(prev => ({
        ...prev,
        [uploadKey]: {
          ...prev[uploadKey],
          isUploading: false,
          error: errorMessage
        }
      }));

      // Clean up after error display
      setTimeout(() => {
        setUploadProgress(prev => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { [uploadKey]: _removed, ...rest } = prev;
          return rest;
        });
      }, 5000);

      throw error;
    }
  }, [queryClient, toast]);

  return {
    uploadDocument,
    uploadProgress,
    isUploading: Object.values(uploadProgress).some(p => p.isUploading),
  };
}
