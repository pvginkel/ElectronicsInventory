export function extractFilenameFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const filename = pathname.split('/').pop() || '';
    
    // Remove query parameters if they exist in the filename
    return filename.split('?')[0] || url;
  } catch {
    // If URL parsing fails, try to extract from the end of the string
    const parts = url.split('/');
    const lastPart = parts[parts.length - 1] || '';
    return lastPart.split('?')[0] || url;
  }
}

export function extractFilenameFromFile(file: File): string {
  return file.name;
}

export function generateTimestampFilename(extension?: string): string {
  const now = new Date();
  const timestamp = now.toISOString()
    .replace(/[:.]/g, '-')
    .replace('T', '_')
    .slice(0, 19); // Remove milliseconds
  
  return extension ? `capture_${timestamp}${extension}` : `capture_${timestamp}`;
}

export function getFileExtension(filename: string): string {
  const lastDotIndex = filename.lastIndexOf('.');
  return lastDotIndex > 0 ? filename.slice(lastDotIndex) : '';
}

export function removeExtension(filename: string): string {
  const lastDotIndex = filename.lastIndexOf('.');
  return lastDotIndex > 0 ? filename.slice(0, lastDotIndex) : filename;
}