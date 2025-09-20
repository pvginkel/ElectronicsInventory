/**
 * API client instrumentation for test events
 * Adds request/response interceptors to emit TEST_EVT:api events
 */

import type { Client } from 'openapi-fetch';
import { ulid } from 'ulid';
import { emitTestEvent } from './event-emitter';
import { TestEventKind, type ApiTestEvent } from '@/types/test-events';

// Store request timing information
const requestTiming = new Map<string, number>();

/**
 * Generate a correlation ID for tracking requests
 */
function generateCorrelationId(): string {
  return ulid();
}

/**
 * Extract operation name from URL path and method
 */
function extractOperationName(url: string, method: string): string {
  try {
    const urlObj = new URL(url);
    const pathSegments = urlObj.pathname.split('/').filter(Boolean);
    const basePath = pathSegments.join('_');
    return `${method.toLowerCase()}_${basePath}`;
  } catch {
    return `${method.toLowerCase()}_unknown`;
  }
}

/**
 * Setup API instrumentation to emit TEST_EVT:api events
 */
export function setupApiInstrumentation(client: Client<any>): void {
  // Request interceptor
  client.use({
    onRequest({ request }) {
      const correlationId = generateCorrelationId();

      // Add correlation ID header
      request.headers.set('X-Request-Id', correlationId);

      // Store start time for duration calculation
      requestTiming.set(correlationId, performance.now());

      return request;
    },

    onResponse({ request, response }) {
      const correlationId = request.headers.get('X-Request-Id') || 'unknown';
      const startTime = requestTiming.get(correlationId);
      const durationMs = startTime ? Math.round(performance.now() - startTime) : 0;

      // Clean up timing data
      if (startTime) {
        requestTiming.delete(correlationId);
      }

      // Extract operation name from request
      const operation = extractOperationName(request.url, request.method);

      // Emit API test event
      const apiEvent: Omit<ApiTestEvent, 'timestamp'> = {
        kind: TestEventKind.API,
        operation,
        method: request.method,
        status: response.status,
        correlationId,
        durationMs,
      };

      emitTestEvent(apiEvent);

      return response;
    }
  });
}