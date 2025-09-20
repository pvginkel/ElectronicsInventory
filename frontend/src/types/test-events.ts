/**
 * TypeScript interfaces for test event types
 * Used by the test event emission system
 */

/**
 * Test event kinds
 */
export const TestEventKind = {
  ROUTE: 'route',
  FORM: 'form',
  API: 'api',
  TOAST: 'toast',
  ERROR: 'error',
  QUERY_ERROR: 'query_error',
  SSE: 'sse',
} as const;

export type TestEventKind = typeof TestEventKind[keyof typeof TestEventKind];

/**
 * Base interface for all test events
 */
export interface BaseTestEvent {
  kind: TestEventKind;
  timestamp: Date;
}

/**
 * Route navigation event
 */
export interface RouteTestEvent extends BaseTestEvent {
  kind: 'route';
  route: string;
  params?: Record<string, string>;
}

/**
 * Form interaction event
 */
export interface FormTestEvent extends BaseTestEvent {
  kind: 'form';
  action: 'submit' | 'reset' | 'validate';
  formId?: string;
  fields?: Record<string, unknown>;
}

/**
 * API request event
 */
export interface ApiTestEvent extends BaseTestEvent {
  kind: 'api';
  method: string;
  url: string;
  status?: number;
  duration?: number;
}

/**
 * Toast notification event
 */
export interface ToastTestEvent extends BaseTestEvent {
  kind: 'toast';
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
}

/**
 * General error event
 */
export interface ErrorTestEvent extends BaseTestEvent {
  kind: 'error';
  error: string;
  source?: string;
}

/**
 * Query error event (React Query specific)
 */
export interface QueryErrorTestEvent extends BaseTestEvent {
  kind: 'query_error';
  queryKey: string;
  error: string;
}

/**
 * Server-sent event
 */
export interface SseTestEvent extends BaseTestEvent {
  kind: 'sse';
  event: string;
  data?: unknown;
}

/**
 * Union type for all test events
 */
export type TestEvent =
  | RouteTestEvent
  | FormTestEvent
  | ApiTestEvent
  | ToastTestEvent
  | ErrorTestEvent
  | QueryErrorTestEvent
  | SseTestEvent;

/**
 * Test event payload - the actual data passed to emitTestEvent
 */
export type TestEventPayload = Omit<TestEvent, 'timestamp'>;