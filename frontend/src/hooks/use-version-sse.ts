import { useState, useEffect, useCallback, useRef } from 'react';
import { isTestMode } from '@/lib/config/test-mode';
import { emitTestEvent } from '@/lib/test/event-emitter';
import type { SseTestEvent } from '@/types/test-events';

interface VersionEvent {
  version: string;
  correlation_id?: string;
  correlationId?: string;
  request_id?: string;
  requestId?: string;
  [key: string]: unknown;
}

interface UseVersionSSEConnectOptions {
  requestId?: string;
  extraParams?: Record<string, string | undefined> | URLSearchParams;
}

interface UseVersionSSEReturn {
  connect: (options?: UseVersionSSEConnectOptions) => void;
  disconnect: () => void;
  isConnected: boolean;
  version: string | null;
}

// Worker message types
interface TestEventMetadata {
  kind: 'sse';
  streamId: string;
  phase: 'open' | 'message' | 'error' | 'close';
  event: string;
  data?: unknown;
}

type WorkerMessage =
  | { type: 'connected'; requestId: string; __testEvent?: TestEventMetadata }
  | { type: 'version'; version: string; correlationId?: string; requestId?: string; __testEvent?: TestEventMetadata }
  | { type: 'disconnected'; reason?: string; __testEvent?: TestEventMetadata }
  | { type: 'error'; error: string; __testEvent?: TestEventMetadata };

/**
 * Determine if SharedWorker should be used based on environment
 */
function shouldUseSharedWorker(): boolean {
  // Always use direct connection in development mode
  if (import.meta.env.DEV) {
    return false;
  }

  // In test mode, only use SharedWorker if explicitly enabled via URL parameter
  if (isTestMode()) {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.has('__sharedWorker');
    }
    return false;
  }

  // Check if SharedWorker is supported (graceful fallback for iOS Safari)
  if (typeof SharedWorker === 'undefined') {
    return false;
  }

  // Production mode with SharedWorker support
  return true;
}

export function useVersionSSE(): UseVersionSSEReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [version, setVersion] = useState<string | null>(null);
  
  const eventSourceRef = useRef<EventSource | null>(null);
  const sharedWorkerRef = useRef<SharedWorker | null>(null);
  const retryCountRef = useRef(0);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const connectOptionsRef = useRef<UseVersionSSEConnectOptions | undefined>(undefined);
  const useSharedWorker = useRef<boolean>(shouldUseSharedWorker());
  const maxRetryDelay = 60000; // 60 seconds

  const disconnect = useCallback(() => {
    // Disconnect SharedWorker if active
    if (sharedWorkerRef.current) {
      try {
        sharedWorkerRef.current.port.postMessage({ type: 'disconnect' });
        sharedWorkerRef.current.port.close();
      } catch (error) {
        console.error('Failed to disconnect SharedWorker:', error);
      }
      sharedWorkerRef.current = null;
    }

    // Disconnect EventSource if active
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    setIsConnected(false);
    retryCountRef.current = 0;
  }, []);

  const createConnectionRef = useRef<((options?: UseVersionSSEConnectOptions) => void) | null>(null);
  const createDirectConnectionRef = useRef<((options?: UseVersionSSEConnectOptions) => void) | null>(null);

  // Direct EventSource connection path (existing logic)
  const createDirectConnection = useCallback((options?: UseVersionSSEConnectOptions) => {
    const nextOptions = options ?? connectOptionsRef.current ?? {};

    if (!import.meta.env.DEV && !nextOptions.requestId) {
      console.error('Deployment SSE connection requires a request id outside of development builds.');
      return;
    }

    connectOptionsRef.current = nextOptions;

    // Clean up existing connection
    disconnect();

    const params = new URLSearchParams();

    if (nextOptions.extraParams instanceof URLSearchParams) {
      nextOptions.extraParams.forEach((value, key) => {
        if (value !== undefined && value !== null) {
          params.set(key, value);
        }
      });
    } else if (nextOptions.extraParams) {
      Object.entries(nextOptions.extraParams).forEach(([key, value]) => {
        if (value !== undefined) {
          params.set(key, value);
        }
      });
    }

    const requestId = nextOptions.requestId;

    if (requestId) {
      params.set('request_id', requestId);
    }

    const queryString = params.toString();

    // In test mode, connect directly to SSE Gateway if URL is provided (bypasses Vite proxy)
    // This avoids a Vite proxy issue where SSE reconnection after page reload fails
    const gatewayUrl = import.meta.env.VITE_SSE_GATEWAY_URL;
    const url = gatewayUrl && isTestMode()
      ? `${gatewayUrl}/api/sse/utils/version${queryString ? `?${queryString}` : ''}`
      : queryString
        ? `/api/sse/utils/version?${queryString}`
        : '/api/sse/utils/version';

    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    const scheduleReconnect = () => {
      // Clear any existing retry timeout before scheduling a new one
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }

      retryCountRef.current++;
      const delay = Math.min(1000 * Math.pow(2, retryCountRef.current - 1), maxRetryDelay);

      retryTimeoutRef.current = setTimeout(() => {
        if (eventSourceRef.current?.readyState === EventSource.CLOSED || !eventSourceRef.current) {
          createConnectionRef.current?.();
        }
      }, delay);
    };

    eventSource.onopen = () => {
      setIsConnected(true);
      retryCountRef.current = 0;

      if (isTestMode()) {
        const payload: Omit<SseTestEvent, 'timestamp'> = {
          kind: 'sse',
          streamId: 'deployment.version',
          phase: 'open',
          event: 'connected',
          data: requestId
            ? { requestId, correlationId: requestId }
            : { requestId: null, correlationId: null },
        };

        emitTestEvent(payload);
      }
    };

    eventSource.addEventListener('version', (event) => {
      try {
        const versionData: VersionEvent = JSON.parse(event.data);
        setVersion(versionData.version);

        if (isTestMode()) {
          const correlation = versionData.correlationId ?? versionData.correlation_id ?? requestId ?? null;
          const payload: Omit<SseTestEvent, 'timestamp'> = {
            kind: 'sse',
            streamId: 'deployment.version',
            phase: 'message',
            event: 'version',
            data: {
              ...versionData,
              requestId: requestId ?? versionData.requestId ?? versionData.request_id ?? null,
              correlationId: correlation,
            },
          };

          emitTestEvent(payload);
        }
      } catch (parseError) {
        console.error('Failed to parse version event:', parseError);
        // Disconnect and reconnect on invalid event
        disconnect();
        scheduleReconnect();
      }
    });

    eventSource.addEventListener('connection_close', (event) => {
      // Backend is closing the connection (e.g., idle timeout, shutdown)
      try {
        const data = JSON.parse(event.data);
        console.debug('Connection closed by backend:', data.reason);
      } catch {
        // Ignore parse errors for connection_close
      }
      disconnect();
    });

    // Note: We handle specific named events via addEventListener:
    // - version: Version update notifications
    // - connection_close: Backend-initiated disconnection
    // The SSE Gateway sends comments (not named events) for connection health checks.
    // The generic onmessage handler is not used since we handle all events explicitly.

    eventSource.onerror = (event) => {
      if (isTestMode()) {
        console.debug('EventSource error (test mode):', event);
      } else {
        console.error('EventSource error:', event);
      }
      setIsConnected(false);

      // Schedule reconnection with exponential backoff
      scheduleReconnect();
    };
  }, [disconnect]);

  // Update ref when createDirectConnection changes
  useEffect(() => {
    createDirectConnectionRef.current = createDirectConnection;
  }, [createDirectConnection]);

  // SharedWorker connection path
  const createSharedWorkerConnection = useCallback((requestId: string) => {
    // Clean up existing connections
    disconnect();

    try {
      console.debug('Using SharedWorker for version SSE connection');

      // Create SharedWorker with Vite-compatible URL syntax
      const worker = new SharedWorker(
        new URL('../workers/version-sse-worker.ts', import.meta.url),
        { type: 'module' }
      );

      sharedWorkerRef.current = worker;

      // Handle messages from worker
      worker.port.onmessage = (event: MessageEvent<WorkerMessage>) => {
        const message = event.data;

        // Forward test events if present
        if (message.__testEvent && isTestMode()) {
          emitTestEvent(message.__testEvent);
        }

        switch (message.type) {
          case 'connected':
            setIsConnected(true);
            break;

          case 'version':
            setVersion(message.version);
            break;

          case 'error':
            console.error('SharedWorker SSE error:', message.error);
            setIsConnected(false);
            break;

          case 'disconnected':
            console.debug('SharedWorker SSE disconnected:', message.reason);
            setIsConnected(false);
            break;

          default:
            console.warn('Unknown worker message:', message);
        }
      };

      // Start the port and send connect command
      worker.port.start();
      worker.port.postMessage({
        type: 'connect',
        requestId,
        isTestMode: isTestMode(),
      });
    } catch (error) {
      console.error('Failed to create SharedWorker, falling back to direct connection:', error);
      // Fall back to direct EventSource connection
      useSharedWorker.current = false;
      // Retry with direct connection using full stored options (preserves extraParams)
      createDirectConnectionRef.current?.(connectOptionsRef.current);
    }
  }, [disconnect]);

  // Main connection function that routes to appropriate path
  const createConnection = useCallback((options?: UseVersionSSEConnectOptions) => {
    const nextOptions = options ?? connectOptionsRef.current ?? {};

    if (!import.meta.env.DEV && !nextOptions.requestId) {
      console.error('Deployment SSE connection requires a request id outside of development builds.');
      return;
    }

    connectOptionsRef.current = nextOptions;

    // Route to SharedWorker or direct EventSource based on environment
    if (useSharedWorker.current && nextOptions.requestId) {
      createSharedWorkerConnection(nextOptions.requestId);
    } else {
      createDirectConnection(nextOptions);
    }
  }, [createSharedWorkerConnection, createDirectConnection]);

  // Update ref when createConnection function changes
  useEffect(() => {
    createConnectionRef.current = createConnection;
  }, [createConnection]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    connect: createConnection,
    disconnect,
    isConnected,
    version
  };
}
