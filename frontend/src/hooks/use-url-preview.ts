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
  contentType: string | null;
}

export function useUrlPreview() {
  const [previewState, setPreviewState] = useState<UrlPreviewState>({
    url: '',
    title: '',
    isLoading: false,
    error: null,
    isValidUrl: false,
    imageUrl: null,
    contentType: null,
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
        contentType: null,
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
      contentType: null,
    }));

    if (!urlIsValid) {
      return;
    }

    try {
      // Use the generated API client for URL preview
      const previewData = await attachmentPreviewMutation.mutateAsync({
        body: { url: normalizedUrl }
      });
      
      const toAbsoluteUrl = (url: string) => {
        if (url.startsWith('http')) {
          return url;
        }
        if (typeof window !== 'undefined') {
          try {
            return new URL(url, window.location.origin).toString();
          } catch {
            // Fall through to returning the original URL if parsing fails
          }
        }
        return url;
      };

      const absoluteImageUrl = previewData.image_url
        ? toAbsoluteUrl(previewData.image_url)
        : null;

      setPreviewState(prev => ({
        ...prev,
        url: previewData.original_url,
        title: previewData.title || '',
        isLoading: false,
        error: null,
        imageUrl: absoluteImageUrl,
        contentType: previewData.content_type,
      }));
    } catch {
      setPreviewState(prev => ({
        ...prev,
        title: '',
        isLoading: false,
        error: 'Could not fetch page preview',
        imageUrl: null,
        contentType: null,
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
      contentType: null,
    });
  }, []);

  return {
    previewState,
    processUrl,
    clearPreview,
  };
}
