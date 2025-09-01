import type { components } from '@/lib/api/generated/types';

function getApiBaseUrl(): string {
  return import.meta.env.VITE_API_BASE_URL || (
    process.env.NODE_ENV === 'production' 
      ? ''  // Production: assume API is served from same origin
      : 'http://localhost:5000'  // Development: backend on different port
  );
}

type DocumentSuggestionSchema = components['schemas']['AIPartCreateSchema.63ff6da.DocumentSuggestionSchema'];

// Extended document interface that includes preview image URL
export interface AIDocument {
  id: string;
  name: string;
  type: 'file' | 'url';
  url?: string | null;
  filename?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
  createdAt: string;
  previewImageUrl?: string | null; // AI-specific field for preview thumbnails
  originalUrl?: string | null; // For AI documents - original URL for media viewer
  contentType?: string | null; // For AI documents - content type for media viewer
  isCoverImage?: boolean; // For AI documents - whether this should be the cover image
}

/**
 * Get MIME type from AI document type
 */
function getMimeTypeFromDocType(docType: string): string | null {
  const type = docType.toLowerCase();
  if (type.includes('pdf')) return 'application/pdf';
  if (type.includes('image')) return 'image/jpeg';
  if (type.includes('png')) return 'image/png';
  if (type.includes('jpg') || type.includes('jpeg')) return 'image/jpeg';
  if (type.includes('text')) return 'text/plain';
  if (type.includes('html')) return 'text/html';
  return null;
}

/**
 * Extract a reasonable filename from URL
 */
function getFilenameFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const filename = pathname.split('/').pop() || '';
    
    // If filename has extension, return it
    if (filename && filename.includes('.')) {
      return filename;
    }
    
    // If no filename or extension, try to construct one
    if (filename) {
      return filename;
    }
    
    // Fallback to domain name
    return urlObj.hostname;
  } catch {
    return url.split('/').pop() || 'Document';
  }
}

/**
 * Transform AI DocumentSuggestionSchema to DocumentGrid format
 */
export function transformAIDocumentToGridFormat(
  doc: DocumentSuggestionSchema,
  index: number
): AIDocument {
  const filename = getFilenameFromUrl(doc.url);
  const baseUrl = getApiBaseUrl();
  
  // Prefix backend URLs with base URL if they start with /
  const getFullUrl = (url: string | null | undefined): string | null => {
    if (!url) return null;
    if (url.startsWith('/')) {
      return `${baseUrl}${url}`;
    }
    return url;
  };
  
  return {
    id: `ai-doc-${index}`,
    name: doc.preview?.title || filename,
    type: doc.url_type === 'link' ? 'url' : 'file',
    url: doc.url,
    filename: filename,
    fileSize: null, // Not available in AI response
    mimeType: doc.preview?.content_type || getMimeTypeFromDocType(doc.document_type),
    createdAt: new Date().toISOString(),
    previewImageUrl: getFullUrl(doc.preview?.image_url),
    originalUrl: getFullUrl(doc.preview?.original_url) || doc.url,
    contentType: doc.preview?.content_type || null,
    isCoverImage: doc.is_cover_image || false,
  };
}

/**
 * Transform array of AI documents to grid format
 */
export function transformAIDocumentsForGrid(docs: DocumentSuggestionSchema[]): AIDocument[] {
  return docs.map((doc, index) => transformAIDocumentToGridFormat(doc, index));
}

/**
 * Check if a document has a preview image available
 */
export function hasPreviewImage(doc: AIDocument): boolean {
  return Boolean(doc.previewImageUrl);
}

/**
 * Get document type display string
 */
export function getDocumentTypeDisplay(doc: AIDocument): string {
  if (!doc.mimeType) return 'Document';
  
  if (doc.mimeType.includes('pdf')) return 'PDF';
  if (doc.mimeType.includes('image')) return 'Image';
  if (doc.mimeType.includes('text')) return 'Text';
  if (doc.mimeType.includes('html')) return 'Web Page';
  
  return 'Document';
}