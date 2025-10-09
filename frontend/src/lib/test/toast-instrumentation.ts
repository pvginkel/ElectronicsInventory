/**
 * Toast instrumentation for test events
 * Wraps toast functions to emit toast test-event payloads
 */

import { emitTestEvent } from './event-emitter';
import { TestEventKind, type ToastTestEvent } from '@/types/test-events';
import type { ToastType } from '@/components/ui/toast';

/**
 * Extract error code from error message or object
 */
function extractErrorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null) {
    if ('code' in error && typeof error.code === 'string') {
      return error.code;
    }
    if ('name' in error && typeof error.name === 'string') {
      return error.name;
    }
  }

  if (typeof error === 'string') {
    // Try to extract error codes from common patterns
    const codeMatch = error.match(/\b[A-Z_]+_ERROR\b/);
    if (codeMatch) {
      return codeMatch[0];
    }
  }

  return undefined;
}

interface ToastInstrumentationOptions<T extends any[]> {
  originalFunction: (...args: T) => void;
  level: ToastType;
  messageArgIndex?: number;
  exceptionArgIndex?: number;
}

function normalizeException(error: unknown) {
  if (!error) {
    return undefined;
  }

  if (error instanceof Error) {
    const { name, message, stack } = error;
    return { name, message, stack };
  }

  if (typeof error === 'object') {
    const coalesced = error as Record<string, unknown>;
    const name = typeof coalesced.name === 'string' ? coalesced.name : undefined;
    const message = typeof coalesced.message === 'string' ? coalesced.message : JSON.stringify(error);
    const stack = typeof coalesced.stack === 'string' ? coalesced.stack : undefined;
    return { name, message, stack };
  }

  if (typeof error === 'string') {
    return { message: error };
  }

  return { message: String(error) };
}

/**
 * Instrument a toast function to emit test events
 */
export function instrumentToast<T extends any[]>({
  originalFunction,
  level,
  messageArgIndex = 0,
  exceptionArgIndex,
}: ToastInstrumentationOptions<T>): (...args: T) => void {
  return (...args: T) => {
    // Call the original function first
    originalFunction(...args);

    const message = args[messageArgIndex] as string;
    const exceptionValue = exceptionArgIndex != null ? args[exceptionArgIndex] : undefined;
    const exception = normalizeException(exceptionValue);
    const codeSource = exception ?? args[messageArgIndex];
    const code = extractErrorCode(codeSource);

    const toastEvent: Omit<ToastTestEvent, 'timestamp'> = {
      kind: TestEventKind.TOAST,
      level,
      message,
      ...(code && { code }),
      ...(exception && { exception }),
    };

    emitTestEvent(toastEvent);
  };
}

/**
 * Create instrumented toast wrapper functions
 */
export function createInstrumentedToastWrapper(originalToastValue: {
  showToast: (message: string, type: ToastType, duration?: number) => void;
  showError: (message: string, duration?: number) => void;
  showSuccess: (message: string, duration?: number) => void;
  showWarning: (message: string, duration?: number) => void;
  showInfo: (message: string, duration?: number) => void;
  showException: (message: string, error: unknown, duration?: number) => void;
  removeToast: (id: string) => void;
}) {
  return {
    ...originalToastValue,
    showToast: instrumentToast({ originalFunction: originalToastValue.showToast, level: 'info', messageArgIndex: 0 }),
    showError: instrumentToast({ originalFunction: originalToastValue.showError, level: 'error', messageArgIndex: 0 }),
    showSuccess: instrumentToast({ originalFunction: originalToastValue.showSuccess, level: 'success', messageArgIndex: 0 }),
    showWarning: instrumentToast({ originalFunction: originalToastValue.showWarning, level: 'warning', messageArgIndex: 0 }),
    showInfo: instrumentToast({ originalFunction: originalToastValue.showInfo, level: 'info', messageArgIndex: 0 }),
    showException: instrumentToast({
      originalFunction: originalToastValue.showException,
      level: 'error',
      messageArgIndex: 0,
      exceptionArgIndex: 1,
    }),
  };
}
