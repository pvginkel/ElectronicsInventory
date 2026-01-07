import { useState, useEffect, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import { isTestMode } from '@/lib/config/test-mode';
import { emitTestEvent } from '@/lib/test/event-emitter';
import type { SseTestEvent } from '@/types/test-events';
import { SseContext } from './sse-context-base';
import type { SseContextValue, VersionEventData, TaskEventData } from './sse-context-base';
// Import to ensure test bridge registration (even though module is not used in production)
import '@/lib/config/sse-request-id';

interface SseContextProviderProps {
  children: ReactNode;
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
  | { type: 'task_event'; taskId: string; eventType: string; data: unknown; __testEvent?: TestEventMetadata }
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

/**
 * SSE context provider that manages unified SSE connection
 *
 * Provides version and task event streams to consumers via callback registration.
 * Uses SharedWorker in production for cross-tab connection sharing, falls back to
 * direct EventSource in dev/test/iOS environments.
 */
export function SseContextProvider({ children }: SseContextProviderProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const sharedWorkerRef = useRef<SharedWorker | null>(null);
  const useSharedWorker = useRef<boolean>(shouldUseSharedWorker());

  // Listener registries
  const versionListenersRef = useRef<Set<(event: VersionEventData) => void>>(new Set());
  const taskListenersRef = useRef<Set<(event: TaskEventData) => void>>(new Set());

  // Guidepost: Buffer recent task events to handle race conditions
  // When backend responds very quickly (e.g., cached results), events may arrive
  // before the client has finished subscribing. This buffer allows late subscribers
  // to receive events that arrived in the last few seconds.
  const taskEventBufferRef = useRef<Map<string, { events: TaskEventData[]; timestamp: number }>>(new Map());
  const TASK_BUFFER_TTL_MS = 10000; // Keep events for 10 seconds

  /**
   * Register a listener for version events
   * Returns cleanup function to remove the listener
   */
  const registerVersionListener = useCallback((callback: (event: VersionEventData) => void) => {
    versionListenersRef.current.add(callback);
    return () => {
      versionListenersRef.current.delete(callback);
    };
  }, []);

  /**
   * Register a listener for task events
   * Returns cleanup function to remove the listener
   */
  const registerTaskListener = useCallback((callback: (event: TaskEventData) => void) => {
    taskListenersRef.current.add(callback);
    return () => {
      taskListenersRef.current.delete(callback);
    };
  }, []);

  /**
   * Subscribe to a specific task's events with buffered event replay
   * This handles the race condition where events arrive before subscription
   */
  const subscribeToTask = useCallback((taskId: string, callback: (event: TaskEventData) => void) => {
    // First, replay any buffered events for this task
    const buffer = taskEventBufferRef.current.get(taskId);
    if (buffer) {
      for (const event of buffer.events) {
        try {
          callback(event);
        } catch (error) {
          console.error('Error replaying buffered event:', error);
        }
      }
    }

    // Create a filtered listener that only passes events for this task
    const filteredListener = (event: TaskEventData) => {
      if (event.taskId === taskId) {
        callback(event);
      }
    };

    // Register the filtered listener for future events
    taskListenersRef.current.add(filteredListener);

    return () => {
      taskListenersRef.current.delete(filteredListener);
    };
  }, []);

  /**
   * Dispatch version event to all registered listeners
   */
  const dispatchVersionEvent = useCallback((event: VersionEventData) => {
    versionListenersRef.current.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('Error in version event listener:', error);
      }
    });
  }, []);

  /**
   * Dispatch task event to all registered listeners
   */
  const dispatchTaskEvent = useCallback((event: TaskEventData) => {
    // Buffer the event for late subscribers
    const taskId = event.taskId;
    // eslint-disable-next-line no-restricted-properties -- Date.now() used for TTL timing, not ID generation
    const now = Date.now();
    const buffer = taskEventBufferRef.current;

    // Clean up old buffered events
    for (const [id, data] of buffer.entries()) {
      if (now - data.timestamp > TASK_BUFFER_TTL_MS) {
        buffer.delete(id);
      }
    }

    // Add event to buffer
    if (!buffer.has(taskId)) {
      buffer.set(taskId, { events: [], timestamp: now });
    }
    const taskBuffer = buffer.get(taskId)!;
    taskBuffer.events.push(event);
    taskBuffer.timestamp = now;

    // Dispatch to current listeners
    taskListenersRef.current.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('Error in task event listener:', error);
      }
    });
  }, []);

  /**
   * Handle worker messages and dispatch to appropriate streams
   */
  const handleWorkerMessage = useCallback((message: WorkerMessage) => {
    // Forward test events if present
    if (message.__testEvent && isTestMode()) {
      emitTestEvent(message.__testEvent);
    }

    switch (message.type) {
      case 'connected':
        setIsConnected(true);
        setRequestId(message.requestId);
        break;

      case 'version':
        dispatchVersionEvent({
          version: message.version,
          correlationId: message.correlationId,
          requestId: message.requestId,
        });
        break;

      case 'task_event':
        dispatchTaskEvent({
          taskId: message.taskId,
          eventType: message.eventType,
          data: message.data,
        });
        break;

      case 'error':
        console.error('SSE connection error:', message.error);
        setIsConnected(false);
        break;

      case 'disconnected':
        console.debug('SSE disconnected:', message.reason);
        setIsConnected(false);
        break;

      default:
        console.warn('Unknown worker message:', message);
    }
  }, [dispatchVersionEvent, dispatchTaskEvent]);

  /**
   * Create SharedWorker connection
   */
  const createSharedWorkerConnection = useCallback(() => {
    try {
      console.debug('SSE context: Using SharedWorker for unified SSE connection');

      // Create SharedWorker with Vite-compatible URL syntax
      const worker = new SharedWorker(
        new URL('../workers/sse-worker.ts', import.meta.url),
        { type: 'module' }
      );

      sharedWorkerRef.current = worker;

      // Handle messages from worker
      worker.port.onmessage = (event: MessageEvent<WorkerMessage>) => {
        handleWorkerMessage(event.data);
      };

      // Start the port and send connect command
      worker.port.start();
      worker.port.postMessage({
        type: 'connect',
        isTestMode: isTestMode(),
      });
    } catch (error) {
      console.error('Failed to create SharedWorker, falling back to direct connection:', error);
      // Fall back to direct EventSource connection
      useSharedWorker.current = false;
      // Trigger re-render to use direct connection
      setIsConnected(false);
    }
  }, [handleWorkerMessage]);

  /**
   * Create direct EventSource connection
   */
  const createDirectConnection = useCallback(() => {
    // Generate request ID for this tab
    const tabRequestId = Math.random().toString(36).substring(2, 15) +
                         Math.random().toString(36).substring(2, 15);

    const params = new URLSearchParams({ request_id: tabRequestId });

    // In test mode, connect directly to SSE Gateway if URL is provided (bypasses Vite proxy)
    const gatewayUrl = import.meta.env.VITE_SSE_GATEWAY_URL;
    const url = gatewayUrl && isTestMode()
      ? `${gatewayUrl}/api/sse/stream${params ? `?${params}` : ''}`
      : `/api/sse/stream?${params}`;

    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setIsConnected(true);
      setRequestId(tabRequestId);

      if (isTestMode()) {
        const payload: Omit<SseTestEvent, 'timestamp'> = {
          kind: 'sse',
          streamId: 'deployment.version',
          phase: 'open',
          event: 'connected',
          data: { requestId: tabRequestId, correlationId: tabRequestId },
        };
        emitTestEvent(payload);
      }
    };

    eventSource.addEventListener('version', (event) => {
      try {
        const versionData = JSON.parse(event.data);

        dispatchVersionEvent({
          version: versionData.version,
          correlationId: versionData.correlation_id ?? versionData.correlationId ?? tabRequestId,
          requestId: versionData.request_id ?? versionData.requestId ?? tabRequestId,
        });

        if (isTestMode()) {
          const payload: Omit<SseTestEvent, 'timestamp'> = {
            kind: 'sse',
            streamId: 'deployment.version',
            phase: 'message',
            event: 'version',
            data: {
              ...versionData,
              requestId: tabRequestId,
              correlationId: versionData.correlation_id ?? versionData.correlationId ?? tabRequestId,
            },
          };
          emitTestEvent(payload);
        }
      } catch (parseError) {
        console.error('Failed to parse version event:', parseError);
      }
    });

    eventSource.addEventListener('task_event', (event) => {
      try {
        const taskData = JSON.parse(event.data);

        dispatchTaskEvent({
          taskId: taskData.task_id,
          eventType: taskData.event_type,
          data: taskData.data,
        });

        if (isTestMode()) {
          const payload: Omit<SseTestEvent, 'timestamp'> = {
            kind: 'sse',
            streamId: 'task',
            phase: 'message',
            event: taskData.event_type,
            data: {
              taskId: taskData.task_id,
              eventType: taskData.event_type,
              data: taskData.data,
            },
          };
          emitTestEvent(payload);
        }
      } catch (parseError) {
        console.error('Failed to parse task_event:', parseError);
      }
    });

    eventSource.addEventListener('connection_close', (event) => {
      try {
        const data = JSON.parse(event.data);
        console.debug('Connection closed by backend:', data.reason);
      } catch {
        // Ignore parse errors
      }
      setIsConnected(false);
    });

    eventSource.onerror = (event) => {
      if (isTestMode()) {
        console.debug('EventSource error (test mode):', event);
      } else {
        console.error('EventSource error:', event);
      }
      setIsConnected(false);
    };
  }, [dispatchVersionEvent, dispatchTaskEvent]);

  /**
   * Disconnect from SSE
   */
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

    setIsConnected(false);
  }, []);

  /**
   * Reconnect SSE (for focus-based reconnection)
   *
   * For SharedWorker mode: The worker manages its own connection and retries.
   * We only need to ensure we have an active port. If already connected, no-op.
   *
   * For direct mode: Re-establish the EventSource if disconnected.
   */
  const reconnect = useCallback(() => {
    // If already connected, nothing to do
    if (isConnected) {
      return;
    }

    // For SharedWorker mode, just ensure we have a port connected
    // Don't disconnect first - that would reset the worker's request ID
    if (useSharedWorker.current) {
      if (!sharedWorkerRef.current) {
        createSharedWorkerConnection();
      }
      // If we have a worker ref but aren't connected, the worker is handling
      // reconnection internally - we don't need to do anything
      return;
    }

    // For direct mode, close existing and create new connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    createDirectConnection();
  }, [isConnected, createSharedWorkerConnection, createDirectConnection]);

  // Establish connection on mount
  useEffect(() => {
    // Auto-connect in production mode, or in test mode when SharedWorker is explicitly enabled
    // Dev mode without SharedWorker uses manual connection control
    const hasSharedWorkerParam = typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).has('__sharedWorker');
    const shouldAutoConnect = !isTestMode() || hasSharedWorkerParam;
    if (!shouldAutoConnect) {
      return;
    }

    if (useSharedWorker.current) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional SSE connection initiation
      createSharedWorkerConnection();
    } else {
      createDirectConnection();
    }

    return () => {
      disconnect();
    };
  }, [createSharedWorkerConnection, createDirectConnection, disconnect]);

  const contextValue: SseContextValue = {
    isConnected,
    requestId,
    registerVersionListener,
    registerTaskListener,
    subscribeToTask,
    reconnect,
  };

  return (
    <SseContext.Provider value={contextValue}>
      {children}
    </SseContext.Provider>
  );
}
