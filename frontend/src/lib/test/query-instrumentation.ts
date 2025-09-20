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

      // Extract HTTP status from error object
      let status: number | undefined;
      const error = query.state.error;
      if (error && typeof error === 'object') {
        if ('status' in error && typeof error.status === 'number') {
          status = error.status;
        } else if ('response' in error && error.response && typeof error.response === 'object' && 'status' in error.response) {
          status = (error.response as { status: number }).status;
        }
      }

      // Create and emit query error event
      const queryErrorEvent: Omit<QueryErrorTestEvent, 'timestamp'> = {
        kind: TestEventKind.QUERY_ERROR,
        queryKey,
        status,
        message: error instanceof Error ? error.message : String(error),
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

      // Extract HTTP status from error object
      let status: number | undefined;
      const error = mutation.state.error;
      if (error && typeof error === 'object') {
        if ('status' in error && typeof error.status === 'number') {
          status = error.status;
        } else if ('response' in error && error.response && typeof error.response === 'object' && 'status' in error.response) {
          status = (error.response as { status: number }).status;
        }
      }

      // Create and emit query error event for mutations
      const queryErrorEvent: Omit<QueryErrorTestEvent, 'timestamp'> = {
        kind: TestEventKind.QUERY_ERROR,
        queryKey,
        status,
        message: error instanceof Error ? error.message : String(error),
      };

      emitTestEvent(queryErrorEvent);
    }
  });
}