export interface ThumbnailSizes {
  small: number;
  medium: number;
  large: number;
}

export const THUMBNAIL_SIZES: ThumbnailSizes = {
  small: 150,
  medium: 300,
  large: 500,
};

function getApiBaseUrl(): string {
  return import.meta.env.VITE_API_BASE_URL || (
    process.env.NODE_ENV === 'production' 
      ? ''  // Production: assume API is served from same origin
      : 'http://localhost:5000'  // Development: backend on different port
  );
}

export function getThumbnailUrl(
  partKey: string, 
  attachmentId: string, 
  size: keyof ThumbnailSizes = 'medium'
): string {
  const sizeValue = THUMBNAIL_SIZES[size];
  const baseUrl = getApiBaseUrl();
  return `${baseUrl}/api/parts/${encodeURIComponent(partKey)}/attachments/${encodeURIComponent(attachmentId)}/thumbnail?size=${sizeValue}`;
}

export function getCoverThumbnailUrl(
  partKey: string, 
  size: keyof ThumbnailSizes = 'medium',
  cacheBuster?: number
): string {
  const sizeValue = THUMBNAIL_SIZES[size];
  const baseUrl = getApiBaseUrl();
  const bust = cacheBuster ? `&__pb=${cacheBuster}` : '';
  return `${baseUrl}/api/parts/${encodeURIComponent(partKey)}/cover/thumbnail?size=${sizeValue}${bust}`;
}

export function getDownloadUrl(partKey: string, attachmentId: string): string {
  const baseUrl = getApiBaseUrl();
  return `${baseUrl}/api/parts/${encodeURIComponent(partKey)}/attachments/${encodeURIComponent(attachmentId)}/download`;
}

export function getViewUrl(partKey: string, attachmentId: string): string {
  const baseUrl = getApiBaseUrl();
  return `${baseUrl}/api/parts/${encodeURIComponent(partKey)}/attachments/${encodeURIComponent(attachmentId)}/download?inline=true`;
}

export function generateSrcSet(
  partKey: string, 
  attachmentId: string
): string {
  const baseUrl = getApiBaseUrl();
  const sizes = Object.entries(THUMBNAIL_SIZES);
  return sizes
    .map(([, size]) => 
      `${baseUrl}/api/parts/${encodeURIComponent(partKey)}/attachments/${encodeURIComponent(attachmentId)}/thumbnail?size=${size} ${size}w`
    )
    .join(', ');
}

export function generateCoverSrcSet(partKey: string, cacheBuster?: number): string {
  const baseUrl = getApiBaseUrl();
  const sizes = Object.entries(THUMBNAIL_SIZES);
  const bust = cacheBuster ? `&__pb=${cacheBuster}` : '';
  return sizes
    .map(([, size]) => 
      `${baseUrl}/api/parts/${encodeURIComponent(partKey)}/cover/thumbnail?size=${size}${bust} ${size}w`
    )
    .join(', ');
}

export function getSizesAttribute(maxWidth?: string): string {
  // Default responsive sizes - adjust based on your grid layout
  if (maxWidth) {
    return `(max-width: 768px) 100vw, ${maxWidth}`;
  }
  return '(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw';
}