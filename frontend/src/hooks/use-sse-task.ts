import { useState, useEffect, useCallback, useRef } from 'react';
import { isTestMode } from '@/lib/config/test-mode';
import { emitTestEvent } from '@/lib/test/event-emitter';
import type { SseTestEvent } from '@/types/test-events';
import { useSseContext } from '@/contexts/sse-context';

interface SSEProgressEvent {
  event_type: 'progress_update';
  data: {
    text: string;
    value?: number;
  };
}

interface SSEResultEvent<T> {
  event_type: 'task_completed';
  data: {
    success: boolean;
    analysis: T | null;
    error_message: string | null;
  };
}

interface SSEErrorEvent {
  event_type: 'task_failed';
  data: {
    error: string;
    code?: string;
  };
}

interface SSEStartedEvent {
  event_type: 'task_started';
  task_id: string;
  timestamp: string;
  data: null;
}

type SSEEvent<T> = SSEProgressEvent | SSEResultEvent<T> | SSEErrorEvent | SSEStartedEvent;

interface UseSSETaskOptions {
  onProgress?: (message: string, percentage?: number) => void;
  onResult?: <T>(data: T) => void;
  onError?: (message: string, code?: string) => void;
}

interface UseSSETaskReturn<T> {
  subscribeToTask: (taskId: string) => void;
  unsubscribe: () => void;
  isSubscribed: boolean;
  error: string | null;
  result: T | null;
  progress: {
    message: string;
    percentage?: number;
  } | null;
}

export function useSSETask<T = unknown>(options: UseSSETaskOptions = {}): UseSSETaskReturn<T> {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<T | null>(null);
  const [progress, setProgress] = useState<{ message: string; percentage?: number } | null>(null);

  const currentTaskIdRef = useRef<string | null>(null);
  const unsubscribeListenerRef = useRef<(() => void) | null>(null);

  const {
    onProgress,
    onResult,
    onError,
  } = options;

  const { registerTaskListener } = useSseContext();

  const unsubscribe = useCallback(() => {
    if (unsubscribeListenerRef.current) {
      unsubscribeListenerRef.current();
      unsubscribeListenerRef.current = null;
    }
    currentTaskIdRef.current = null;
    setIsSubscribed(false);
  }, []);

  const subscribeToTask = useCallback((taskId: string) => {
    // Unsubscribe from any previous task
    unsubscribe();

    // Reset state for new subscription
    setError(null);
    setResult(null);
    setProgress(null);
    setIsSubscribed(true);
    currentTaskIdRef.current = taskId;

    // Emit test event for subscription start
    if (isTestMode()) {
      const payload: Omit<SseTestEvent, 'timestamp'> = {
        kind: 'sse',
        streamId: 'task',
        phase: 'open',
        event: 'task_subscription',
        data: { taskId },
      };
      emitTestEvent(payload);
    }

    // Register listener for task events
    const unsubscribeListener = registerTaskListener((event) => {
      // Filter events by task ID
      if (event.taskId !== currentTaskIdRef.current) {
        return;
      }

      try {
        // Parse event data as SSEEvent - keep data nested under data property
        const parsedEvent = {
          event_type: event.eventType,
          data: event.data,
        } as SSEEvent<T>;

        switch (parsedEvent.event_type) {
          case 'task_started': {
            // Emit test event
            if (isTestMode()) {
              const payload: Omit<SseTestEvent, 'timestamp'> = {
                kind: 'sse',
                streamId: 'task',
                phase: 'message',
                event: 'task_started',
                data: { taskId: event.taskId },
              };
              emitTestEvent(payload);
            }
            break;
          }

          case 'progress_update': {
            const progressData = {
              message: parsedEvent.data.text,
              percentage: parsedEvent.data.value
            };
            setProgress(progressData);
            onProgress?.(progressData.message, progressData.percentage);

            if (isTestMode()) {
              const payload: Omit<SseTestEvent, 'timestamp'> = {
                kind: 'sse',
                streamId: 'task',
                phase: 'message',
                event: 'progress_update',
                data: { taskId: event.taskId, ...progressData },
              };
              emitTestEvent(payload);
            }
            break;
          }

          case 'task_completed': {
            if (parsedEvent.data.success && parsedEvent.data.analysis) {
              // Task completed successfully
              setResult(parsedEvent.data.analysis);
              onResult?.(parsedEvent.data.analysis);

              if (isTestMode()) {
                const payload: Omit<SseTestEvent, 'timestamp'> = {
                  kind: 'sse',
                  streamId: 'task',
                  phase: 'message',
                  event: 'task_completed',
                  data: { taskId: event.taskId, success: true },
                };
                emitTestEvent(payload);
              }
            } else {
              // Task completed but with failure
              const errorMessage = parsedEvent.data.error_message || 'Analysis failed';
              setError(errorMessage);
              onError?.(errorMessage);

              if (isTestMode()) {
                const payload: Omit<SseTestEvent, 'timestamp'> = {
                  kind: 'sse',
                  streamId: 'task',
                  phase: 'error',
                  event: 'task_completed',
                  data: { taskId: event.taskId, success: false, error: errorMessage },
                };
                emitTestEvent(payload);
              }
            }
            // Auto-unsubscribe on completion
            unsubscribe();
            break;
          }

          case 'task_failed': {
            const errorMessage = parsedEvent.data.error;
            const errorCode = parsedEvent.data.code;
            setError(errorMessage);
            onError?.(errorMessage, errorCode);

            if (isTestMode()) {
              const payload: Omit<SseTestEvent, 'timestamp'> = {
                kind: 'sse',
                streamId: 'task',
                phase: 'error',
                event: 'task_failed',
                data: { taskId: event.taskId, error: errorMessage, code: errorCode },
              };
              emitTestEvent(payload);
            }

            // Auto-unsubscribe on failure
            unsubscribe();
            break;
          }
        }
      } catch (parseError) {
        console.error('Failed to parse SSE task event:', parseError);
        setError('Invalid server response format');
      }
    });

    unsubscribeListenerRef.current = unsubscribeListener;
  }, [registerTaskListener, onProgress, onResult, onError, unsubscribe]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      unsubscribe();
    };
  }, [unsubscribe]);

  return {
    subscribeToTask,
    unsubscribe,
    isSubscribed,
    error,
    result,
    progress
  };
}
