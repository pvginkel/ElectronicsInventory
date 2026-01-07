import { createContext } from 'react';

/**
 * Version event data received from SSE stream
 */
export interface VersionEventData {
  version: string;
  correlationId?: string;
  requestId?: string;
}

/**
 * Task event data received from SSE stream
 */
export interface TaskEventData {
  taskId: string;
  eventType: string;
  data: unknown;
}

/**
 * SSE context value exposed to consumers
 */
export interface SseContextValue {
  isConnected: boolean;
  requestId: string | null;
  registerVersionListener: (callback: (event: VersionEventData) => void) => () => void;
  registerTaskListener: (callback: (event: TaskEventData) => void) => () => void;
  /** Subscribe to a specific task's events, replaying any buffered events that arrived before subscription */
  subscribeToTask: (taskId: string, callback: (event: TaskEventData) => void) => () => void;
  reconnect: () => void;
}

/**
 * Default context value (throws when accessed outside provider)
 */
export const defaultSseContextValue: SseContextValue = {
  isConnected: false,
  requestId: null,
  registerVersionListener: () => {
    throw new Error('useSseContext must be used within SseContextProvider');
  },
  registerTaskListener: () => {
    throw new Error('useSseContext must be used within SseContextProvider');
  },
  subscribeToTask: () => {
    throw new Error('useSseContext must be used within SseContextProvider');
  },
  reconnect: () => {
    throw new Error('useSseContext must be used within SseContextProvider');
  },
};

/**
 * SSE context for unified stream management
 */
export const SseContext = createContext<SseContextValue>(defaultSseContextValue);
