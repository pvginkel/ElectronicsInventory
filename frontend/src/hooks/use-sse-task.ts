import { useState, useEffect, useCallback, useRef } from 'react';

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
  retryAttempts?: number;
  retryDelay?: number;
}

interface UseSSETaskReturn<T> {
  connect: (streamUrl: string) => void;
  disconnect: () => void;
  isConnected: boolean;
  error: string | null;
  result: T | null;
  progress: {
    message: string;
    percentage?: number;
  } | null;
}

export function useSSETask<T = unknown>(options: UseSSETaskOptions = {}): UseSSETaskReturn<T> {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<T | null>(null);
  const [progress, setProgress] = useState<{ message: string; percentage?: number } | null>(null);
  
  const eventSourceRef = useRef<EventSource | null>(null);
  const retryCountRef = useRef(0);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const {
    onProgress,
    onResult,
    onError,
    retryAttempts = 3,
    retryDelay = 1000
  } = options;

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

  const connect = useCallback((streamUrl: string) => {
    // Clean up existing connection
    disconnect();
    
    // Reset state
    setError(null);
    setResult(null);
    setProgress(null);
    
    const eventSource = new EventSource(streamUrl);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setIsConnected(true);
      setError(null);
      retryCountRef.current = 0;
    };

    eventSource.addEventListener('task_event', (event) => {
      try {
        const parsedEvent: SSEEvent<T> = JSON.parse(event.data);
        
        switch (parsedEvent.event_type) {
          case 'task_started': {
            // Don't need to do anything special for task_started
            break;
          }
            
          case 'progress_update': {
            const progressData = {
              message: parsedEvent.data.text,
              percentage: parsedEvent.data.value
            };
            setProgress(progressData);
            onProgress?.(progressData.message, progressData.percentage);
            break;
          }
            
          case 'task_completed': {
            if (parsedEvent.data.success && parsedEvent.data.analysis) {
              // Task completed successfully
              setResult(parsedEvent.data.analysis);
              onResult?.(parsedEvent.data.analysis);
            } else {
              // Task completed but with failure
              const errorMessage = parsedEvent.data.error_message || 'Analysis failed';
              setError(errorMessage);
              onError?.(errorMessage);
            }
            disconnect(); // Task completed (either success or failure)
            break;
          }
            
          case 'task_failed': {
            const errorMessage = parsedEvent.data.error;
            const errorCode = parsedEvent.data.code;
            setError(errorMessage);
            onError?.(errorMessage, errorCode);
            disconnect(); // Task failed
            break;
          }
        }
      } catch (parseError) {
        console.error('Failed to parse SSE event:', parseError);
        setError('Invalid server response format');
      }
    });

    // Also listen for generic messages in case they're not named events
    eventSource.onmessage = () => {
      // This is just a fallback - the real processing happens in task_event listener
      console.log('Received generic SSE message - this might indicate an issue with event naming');
    };

    eventSource.onerror = (event) => {
      console.error('EventSource error:', event);
      
      if (retryCountRef.current < retryAttempts) {
        retryCountRef.current++;
        const delay = retryDelay * Math.pow(2, retryCountRef.current - 1); // Exponential backoff
        
        retryTimeoutRef.current = setTimeout(() => {
          if (eventSourceRef.current?.readyState === EventSource.CLOSED) {
            connect(streamUrl); // Retry connection
          }
        }, delay);
      } else {
        setError('Connection failed after multiple attempts');
        disconnect();
      }
    };
  }, [disconnect, onProgress, onResult, onError, retryAttempts, retryDelay]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    connect,
    disconnect,
    isConnected,
    error,
    result,
    progress
  };
}