/**
 * Centralized API configuration utility
 */
export function getApiBaseUrl(): string {
  return import.meta.env.VITE_API_BASE_URL || (
    process.env.NODE_ENV === 'production' 
      ? ''  // Production: assume API is served from same origin
      : 'http://localhost:5000'  // Development: backend on different port
  );
}