import { QueryClient } from '@tanstack/react-query'
import { parseApiError, is404Error } from '@/lib/utils/error-parsing'
import { isTestMode } from '@/lib/config/test-mode'
import { emitTestEvent } from '@/lib/test/event-emitter'
import { TestEventKind, type QueryErrorTestEvent } from '@/types/test-events'

// Store the toast function reference to avoid circular dependencies
let toastFunction: ((message: string) => void) | null = null

export function setToastFunction(showError: (message: string) => void) {
  toastFunction = showError
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        // Don't retry on 404s
        if (is404Error(error)) {
          return false
        }

        // Don't retry on client errors (4xx)
        if (error instanceof Error && 'status' in error) {
          const status = (error as Error & { status: number }).status
          if (status >= 400 && status < 500) {
            return false
          }
        }

        // Retry up to 3 times for server errors and network issues
        return failureCount < 3
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
    mutations: {
      retry: false, // Don't retry mutations by default
      onError: (error: any) => {
        // Emit test event in test mode
        if (isTestMode()) {
          const queryErrorEvent: Omit<QueryErrorTestEvent, 'timestamp'> = {
            kind: TestEventKind.QUERY_ERROR,
            queryKey: 'mutation:unknown',
            status: (error as any)?.status || undefined,
            message: error instanceof Error ? error.message : String(error),
          };
          emitTestEvent(queryErrorEvent);
        }

        // Always show mutation errors to the user
        if (toastFunction) {
          const message = parseApiError(error)
          toastFunction(message)
        }
      }
    }
  }
})

// Note: Query error instrumentation is handled directly in the onError handler above