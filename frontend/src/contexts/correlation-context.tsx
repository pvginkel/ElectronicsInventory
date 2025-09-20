/**
 * Correlation ID context for linking API requests with errors
 * Uses ref-based storage to avoid re-renders while maintaining correlation IDs
 */

import React, { createContext, useContext, useRef, useCallback, type ReactNode } from 'react';

interface CorrelationContextValue {
  setCorrelationId: (id: string) => void;
  getCorrelationId: () => string | undefined;
}

const CorrelationContext = createContext<CorrelationContextValue | null>(null);

// Global reference to the current context value for non-React usage
let globalCorrelationContext: CorrelationContextValue | null = null;

interface CorrelationProviderProps {
  children: ReactNode;
}

export function CorrelationProvider({ children }: CorrelationProviderProps) {
  // Use ref to store correlation ID without causing re-renders
  const correlationIdRef = useRef<string | undefined>(undefined);

  // Stable function references using useCallback
  const setCorrelationId = useCallback((id: string) => {
    correlationIdRef.current = id;
  }, []);

  const getCorrelationId = useCallback(() => {
    return correlationIdRef.current;
  }, []);

  // Context value contains only stable function references
  const contextValue: CorrelationContextValue = React.useMemo(() => ({
    setCorrelationId,
    getCorrelationId,
  }), [setCorrelationId, getCorrelationId]);

  // Store reference globally for non-React usage
  React.useEffect(() => {
    globalCorrelationContext = contextValue;
    return () => {
      globalCorrelationContext = null;
    };
  }, [contextValue]);

  return (
    <CorrelationContext.Provider value={contextValue}>
      {children}
    </CorrelationContext.Provider>
  );
}

export function useCorrelationId(): CorrelationContextValue {
  const context = useContext(CorrelationContext);
  if (!context) {
    throw new Error('useCorrelationId must be used within a CorrelationProvider');
  }
  return context;
}

/**
 * Get correlation ID functions outside of React context
 * Returns null if no provider is mounted
 */
export function getGlobalCorrelationContext(): CorrelationContextValue | null {
  return globalCorrelationContext;
}