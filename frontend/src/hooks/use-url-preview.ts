import { useState, useCallback } from 'react';
import { isValidUrl, normalizeUrl } from '@/lib/utils/url-metadata';
import { usePostPartsAttachmentPreview } from '@/lib/api/generated/hooks';

export interface UrlPreviewState {
  url: string;
  title: string;
  isLoading: boolean;
  error: string | null;
  isValidUrl: boolean;
  imageUrl: string | null;
}

export function useUrlPreview() {
  const [previewState, setPreviewState] = useState<UrlPreviewState>({
    url: '',
    title: '',
    isLoading: false,
    error: null,
    isValidUrl: false,
    imageUrl: null,
  });

  const attachmentPreviewMutation = usePostPartsAttachmentPreview();

  const processUrl = useCallback(async (inputUrl: string) => {
    const trimmedUrl = inputUrl.trim();
    
    if (!trimmedUrl) {
      setPreviewState({
        url: '',
        title: '',
        isLoading: false,
        error: null,
        isValidUrl: false,
        imageUrl: null,
      });
      return;
    }

    const normalizedUrl = normalizeUrl(trimmedUrl);
    const urlIsValid = isValidUrl(normalizedUrl);

    setPreviewState(prev => ({
      ...prev,
      url: normalizedUrl,
      isValidUrl: urlIsValid,
      isLoading: urlIsValid,
      error: urlIsValid ? null : 'Invalid URL format',
      imageUrl: null,
    }));

    if (!urlIsValid) {
      return;
    }

    try {
      // Use the generated API client for URL preview
      const previewData = await attachmentPreviewMutation.mutateAsync({
        body: { url: normalizedUrl }
      });
      
      // Convert relative image_url to absolute URL pointing to backend
      const baseUrl = import.meta.env.VITE_API_BASE_URL || 
        (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5000');
      
      const absoluteImageUrl = previewData.image_url 
        ? (previewData.image_url.startsWith('http') 
            ? previewData.image_url 
            : `${baseUrl}${previewData.image_url}`)
        : null;

      setPreviewState(prev => ({
        ...prev,
        url: previewData.original_url,
        title: previewData.title || '',
        isLoading: false,
        error: null,
        imageUrl: absoluteImageUrl,
      }));
    } catch {
      setPreviewState(prev => ({
        ...prev,
        title: '',
        isLoading: false,
        error: 'Could not fetch page preview',
        imageUrl: null,
      }));
    }
  }, [attachmentPreviewMutation]);

  const clearPreview = useCallback(() => {
    setPreviewState({
      url: '',
      title: '',
      isLoading: false,
      error: null,
      isValidUrl: false,
      imageUrl: null,
    });
  }, []);

  return {
    previewState,
    processUrl,
    clearPreview,
  };
}