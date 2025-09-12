import { useState, useEffect, useCallback, useRef } from 'react';

interface VersionEvent {
  version: string;
}

interface UseVersionSSEReturn {
  connect: () => void;
  disconnect: () => void;
  isConnected: boolean;
  version: string | null;
  error: string | null;
}

export function useVersionSSE(): UseVersionSSEReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [version, setVersion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const eventSourceRef = useRef<EventSource | null>(null);
  const retryCountRef = useRef(0);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
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

  const createConnection = useCallback(() => {
    // Clean up existing connection
    disconnect();
    
    // Reset error state
    setError(null);
    
    const eventSource = new EventSource('/api/utils/version/stream');
    eventSourceRef.current = eventSource;

    const scheduleReconnect = () => {
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
      setError(null);
      retryCountRef.current = 0;
    };

    eventSource.addEventListener('version', (event) => {
      try {
        const versionData: VersionEvent = JSON.parse(event.data);
        setVersion(versionData.version);
      } catch (parseError) {
        console.error('Failed to parse version event:', parseError);
        setError('Invalid version response format');
        // Disconnect and reconnect on invalid event
        disconnect();
        scheduleReconnect();
      }
    });

    eventSource.addEventListener('keepalive', () => {
      // Ignore keepalive events - they're just for connection health
    });

    // Handle any other event type by disconnecting and reconnecting
    eventSource.onmessage = (event) => {
      // Check if this is an unhandled event type
      if (event.type !== 'version' && event.type !== 'keepalive') {
        console.warn('Received unexpected SSE event type:', event.type);
        disconnect();
        scheduleReconnect();
      }
    };

    eventSource.onerror = (event) => {
      console.error('EventSource error:', event);
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
    version,
    error
  };
}