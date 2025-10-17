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

export function getThumbnailUrl(
  partKey: string, 
  attachmentId: string, 
  size: keyof ThumbnailSizes = 'medium'
): string {
  const sizeValue = THUMBNAIL_SIZES[size];
  return `/api/parts/${encodeURIComponent(partKey)}/attachments/${encodeURIComponent(attachmentId)}/thumbnail?size=${sizeValue}`;
}

export function getCoverThumbnailUrl(
  partKey: string, 
  size: keyof ThumbnailSizes = 'medium'
): string {
  const sizeValue = THUMBNAIL_SIZES[size];
  return `/api/parts/${encodeURIComponent(partKey)}/cover/thumbnail?size=${sizeValue}`;
}

export function getDownloadUrl(partKey: string, attachmentId: string): string {
  return `/api/parts/${encodeURIComponent(partKey)}/attachments/${encodeURIComponent(attachmentId)}/download`;
}

export function getViewUrl(partKey: string, attachmentId: string): string {
  return `/api/parts/${encodeURIComponent(partKey)}/attachments/${encodeURIComponent(attachmentId)}/download?inline=true`;
}

export function generateSrcSet(
  partKey: string, 
  attachmentId: string
): string {
  const sizes = Object.entries(THUMBNAIL_SIZES);
  return sizes
    .map(([, size]) => 
      `/api/parts/${encodeURIComponent(partKey)}/attachments/${encodeURIComponent(attachmentId)}/thumbnail?size=${size} ${size}w`
    )
    .join(', ');
}

export function generateCoverSrcSet(partKey: string): string {
  const sizes = Object.entries(THUMBNAIL_SIZES);
  return sizes
    .map(([, size]) => 
      `/api/parts/${encodeURIComponent(partKey)}/cover/thumbnail?size=${size} ${size}w`
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
