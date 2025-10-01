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

export function useVersionSSE(): UseVersionSSEReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [version, setVersion] = useState<string | null>(null);
  
  const eventSourceRef = useRef<EventSource | null>(null);
  const retryCountRef = useRef(0);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const connectOptionsRef = useRef<UseVersionSSEConnectOptions | undefined>(undefined);
  const maxRetryDelay = 60000; // 60 seconds

  const disconnect = useCallback(() => {
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

  const createConnection = useCallback((options?: UseVersionSSEConnectOptions) => {
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
    const url = queryString
      ? `/api/utils/version/stream?${queryString}`
      : '/api/utils/version/stream';

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
          createConnection();
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

    eventSource.addEventListener('keepalive', () => {
      // Ignore keepalive events - they're just for connection health
    });

    // Note: We only handle 'version' and 'keepalive' events via addEventListener.
    // Any other event types would need to be explicitly added.
    // The generic onmessage handler is not used since we handle specific event types.

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
