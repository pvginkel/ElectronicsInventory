import { useState, useEffect } from 'react';
import { useSseContext } from '@/contexts/sse-context';

interface UseVersionSSEReturn {
  isConnected: boolean;
  version: string | null;
}

/**
 * Hook to consume version events from unified SSE stream
 *
 * Subscribes to version events from SseContextProvider and maintains
 * local version state. Connection lifecycle is managed by the provider.
 */
export function useVersionSSE(): UseVersionSSEReturn {
  const [version, setVersion] = useState<string | null>(null);
  const { isConnected, registerVersionListener } = useSseContext();

  useEffect(() => {
    // Register listener for version events
    const unsubscribe = registerVersionListener((event) => {
      setVersion(event.version);
    });

    return unsubscribe;
  }, [registerVersionListener]);

  return {
    isConnected,
    version,
  };
}
