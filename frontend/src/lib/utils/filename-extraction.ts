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

