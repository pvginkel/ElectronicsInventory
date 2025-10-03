import TraceParent from 'traceparent';
import { isTestMode } from '@/lib/config/test-mode';

const STORAGE_KEY = 'deploymentSseRequestId';

let cachedRequestId: string | undefined;

function readStoredRequestId(): string | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  try {
    return window.sessionStorage?.getItem(STORAGE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

function persistRequestId(id: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.sessionStorage?.setItem(STORAGE_KEY, id);
  } catch {
    // Ignore storage failures; callers will regenerate ids when needed.
  }
}

function removeStoredRequestId(): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.sessionStorage?.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage cleanup failures to keep reset idempotent.
  }
}

function fallbackTraceId(): string {
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    const buffer = new Uint8Array(16);
    crypto.getRandomValues(buffer);
    return Array.from(buffer, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  let result = '';
  for (let i = 0; i < 32; i += 1) {
    result += Math.floor(Math.random() * 16).toString(16);
  }
  return result;
}

function createRequestId(): string {
  try {
    const traceParent = TraceParent.startOrResume(undefined, { transactionSampleRate: 1 });
    if (traceParent && typeof traceParent.traceId === 'string') {
      return traceParent.traceId;
    }
  } catch {
    // Fall through to fallback generator below.
  }

  return fallbackTraceId();
}

export function getDeploymentRequestId(): string {
  if (cachedRequestId) {
    return cachedRequestId;
  }

  const storedValue = readStoredRequestId();
  if (storedValue) {
    cachedRequestId = storedValue;
    return cachedRequestId;
  }

  const newId = createRequestId();
  cachedRequestId = newId;
  persistRequestId(newId);
  return newId;
}

export function resetDeploymentRequestId(): void {
  if (!isTestMode()) {
    return;
  }

  cachedRequestId = undefined;
  removeStoredRequestId();
}

function registerTestBridge(): void {
  if (!isTestMode()) {
    return;
  }

  if (typeof window === 'undefined') {
    return;
  }

  const globalWindow = window as typeof window & {
    __resetDeploymentRequestId?: () => void;
  };

  if (!globalWindow.__resetDeploymentRequestId) {
    globalWindow.__resetDeploymentRequestId = () => {
      resetDeploymentRequestId();
    };
  }
}

registerTestBridge();
