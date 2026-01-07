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

interface SSEResultEvent {
  event_type: 'task_completed';
  data: {
    success: boolean;
    error_message: string | null;
    // Result data varies by task type (e.g., 'analysis' for AI analysis, 'cleaned_part' for cleanup)
    [key: string]: unknown;
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

type SSEEvent = SSEProgressEvent | SSEResultEvent | SSEErrorEvent | SSEStartedEvent;

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

  const { subscribeToTask: subscribeToTaskContext } = useSseContext();

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

    // Subscribe to task events via context (handles buffered event replay)
    const unsubscribeListener = subscribeToTaskContext(taskId, (event) => {
      try {
        // Parse event data as SSEEvent - keep data nested under data property
        const parsedEvent = {
          event_type: event.eventType,
          data: event.data,
        } as SSEEvent;

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
            // Guidepost: Check for success based on the success flag and absence of error
            // Different task types may use different field names for results (e.g., 'analysis', 'cleaned_part')
            // so we pass the entire data object to let consumers extract what they need
            if (parsedEvent.data.success && !parsedEvent.data.error_message) {
              // Task completed successfully - pass entire data object to consumer
              setResult(parsedEvent.data as T);
              onResult?.(parsedEvent.data as T);

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
              const errorMessage = parsedEvent.data.error_message || 'Task failed';
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
  }, [subscribeToTaskContext, onProgress, onResult, onError, unsubscribe]);

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
