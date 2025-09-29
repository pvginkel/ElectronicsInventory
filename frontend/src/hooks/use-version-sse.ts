import { useState, useEffect, useCallback, useRef } from 'react';

interface VersionEvent {
  version: string;
}

interface UseVersionSSEReturn {
  connect: () => void;
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
    
    const eventSource = new EventSource('/api/utils/version/stream');
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
    };

    eventSource.addEventListener('version', (event) => {
      try {
        const versionData: VersionEvent = JSON.parse(event.data);
        setVersion(versionData.version);
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
    version
  };
}
