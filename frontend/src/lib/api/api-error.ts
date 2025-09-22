import { parseApiError } from '@/lib/utils/error-parsing';

/**
 * Wrap API error payloads in a proper Error subclass so unhandled rejections
 * surface meaningful messages and preserve structured details.
 */
export class ApiError extends Error {
  status?: number;
  details?: unknown;
  raw: unknown;

  constructor(raw: unknown) {
    super(parseApiError(raw));
    this.name = 'ApiError';
    this.raw = raw;

    if (typeof raw === 'object' && raw !== null) {
      const maybeObject = raw as Record<string, unknown>;

      if (typeof maybeObject.status === 'number') {
        this.status = maybeObject.status;
      }

      if ('details' in maybeObject) {
        this.details = maybeObject.details;
      }
    }

    // Preserve the original payload for debugging
    this.cause = raw;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ApiError);
    }
  }
}

export function toApiError(error: unknown): Error {
  return error instanceof Error ? error : new ApiError(error);
}
