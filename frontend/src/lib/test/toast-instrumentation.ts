/**
 * Toast instrumentation for test events
 * Wraps toast functions to emit TEST_EVT:toast events
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

/**
 * Instrument a toast function to emit test events
 */
export function instrumentToast<T extends any[]>(
  originalFunction: (...args: T) => void,
  level: ToastType,
  messageArgIndex: number = 0
): (...args: T) => void {
  return (...args: T) => {
    // Call the original function first
    originalFunction(...args);

    // Extract message and potential error code
    const message = args[messageArgIndex] as string;
    const code = extractErrorCode(args[messageArgIndex]);

    // Emit toast test event
    const toastEvent: Omit<ToastTestEvent, 'timestamp'> = {
      kind: TestEventKind.TOAST,
      level,
      message,
      ...(code && { code }),
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
  removeToast: (id: string) => void;
}) {
  return {
    ...originalToastValue,
    showToast: instrumentToast(originalToastValue.showToast, 'info', 0),
    showError: instrumentToast(originalToastValue.showError, 'error', 0),
    showSuccess: instrumentToast(originalToastValue.showSuccess, 'success', 0),
    showWarning: instrumentToast(originalToastValue.showWarning, 'warning', 0),
    showInfo: instrumentToast(originalToastValue.showInfo, 'info', 0),
  };
}