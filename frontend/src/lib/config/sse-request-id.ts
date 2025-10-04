import { isTestMode } from '@/lib/config/test-mode';
import { makeUniqueToken } from '@/lib/utils/random';

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

function createRequestId(): string {
  return makeUniqueToken(32);
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
