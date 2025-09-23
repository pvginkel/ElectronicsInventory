/**
 * Query error instrumentation for test events
 * Hooks into React Query to emit query error events
 */

import type { QueryClient } from '@tanstack/react-query';
import { emitTestEvent } from './event-emitter';
import { TestEventKind, type QueryErrorTestEvent } from '@/types/test-events';
import { isTestMode } from '@/lib/config/test-mode';

/**
 * Setup query error instrumentation to emit TEST_EVT:query_error events
 */
export function setupQueryInstrumentation(queryClient: QueryClient): void {
  // Only set up instrumentation in test mode
  if (!isTestMode()) {
    return;
  }

  // Set up query cache observer for queries
  const queryCache = queryClient.getQueryCache();
  queryCache.subscribe((event) => {
    if (event.type === 'updated' && event.query?.state.status === 'error') {
      const query = event.query;

      // Extract query information
      const queryKey = Array.isArray(query.queryKey)
        ? query.queryKey.join(':')
        : String(query.queryKey);

      // Extract HTTP status and correlation ID from error object
      let status: number | undefined;
      let correlationId: string | undefined;
      const error = query.state.error;

      if (error && typeof error === 'object') {
        // Check for status
        if ('status' in error && typeof error.status === 'number') {
          status = error.status;
        } else if ('response' in error && error.response && typeof error.response === 'object' && 'status' in error.response) {
          status = (error.response as { status: number }).status;
        }

        // Check for correlation ID
        if ('correlationId' in error && typeof error.correlationId === 'string') {
          correlationId = error.correlationId;
        } else if ('headers' in error && error.headers && typeof error.headers === 'object') {
          const headers = error.headers as Record<string, string>;
          correlationId = headers['x-correlation-id'] || headers['X-Correlation-Id'];
        }
      }

      // Prepare metadata for conflict errors
      const metadata: Record<string, unknown> = {};
      if (status === 409) {
        metadata.isConflict = true;
        if (error && typeof error === 'object' && 'data' in error) {
          metadata.conflictDetails = error.data;
        }
      }

      // Create and emit query error event
      const queryErrorEvent: Omit<QueryErrorTestEvent, 'timestamp'> = {
        kind: TestEventKind.QUERY_ERROR,
        queryKey,
        status,
        message: error instanceof Error ? error.message : String(error),
        correlationId,
        ...(Object.keys(metadata).length > 0 && { metadata }),
      };

      emitTestEvent(queryErrorEvent);
    }
  });

  // Set up mutation cache observer for mutations
  const mutationCache = queryClient.getMutationCache();
  mutationCache.subscribe((event) => {
    if (event.type === 'updated' && event.mutation?.state.status === 'error') {
      const mutation = event.mutation;

      // Extract mutation information
      const queryKey = `mutation:${mutation.options.mutationKey?.join(':') || 'unknown'}`;

      // Extract HTTP status and correlation ID from error object
      let status: number | undefined;
      let correlationId: string | undefined;
      const error = mutation.state.error;

      if (error && typeof error === 'object') {
        // Check for status
        if ('status' in error && typeof error.status === 'number') {
          status = error.status;
        } else if ('response' in error && error.response && typeof error.response === 'object' && 'status' in error.response) {
          status = (error.response as { status: number }).status;
        }

        // Check for correlation ID
        if ('correlationId' in error && typeof error.correlationId === 'string') {
          correlationId = error.correlationId;
        } else if ('headers' in error && error.headers && typeof error.headers === 'object') {
          const headers = error.headers as Record<string, string>;
          correlationId = headers['x-correlation-id'] || headers['X-Correlation-Id'];
        }
      }

      // Prepare metadata for conflict errors
      const metadata: Record<string, unknown> = {};
      if (status === 409) {
        metadata.isConflict = true;
        if (error && typeof error === 'object' && 'data' in error) {
          metadata.conflictDetails = error.data;
        }
      }

      // Create and emit query error event for mutations
      const queryErrorEvent: Omit<QueryErrorTestEvent, 'timestamp'> = {
        kind: TestEventKind.QUERY_ERROR,
        queryKey,
        status,
        message: error instanceof Error ? error.message : String(error),
        correlationId,
        ...(Object.keys(metadata).length > 0 && { metadata }),
      };

      emitTestEvent(queryErrorEvent);
    }
  });
}