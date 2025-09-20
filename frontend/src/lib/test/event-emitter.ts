/**
 * Test event emission system
 * Provides structured event emission for test infrastructure
 */

import { isTestMode } from '@/lib/config/test-mode';
import type { TestEvent, TestEventPayload } from '@/types/test-events';

// Extend window to include test signals
declare global {
  interface Window {
    __TEST_SIGNALS__?: TestEvent[];
  }
}

/**
 * Initialize test signals array on window if in test mode
 */
function initializeTestSignals(): void {
  if (isTestMode() && typeof window !== 'undefined') {
    if (!window.__TEST_SIGNALS__) {
      window.__TEST_SIGNALS__ = [];
    }
  }
}

/**
 * Emit a test event
 * In test mode: logs to console with TEST_EVT prefix and pushes to window.__TEST_SIGNALS__
 * In production: no-op function
 */
export function emitTestEvent(payload: TestEventPayload): void {
  if (!isTestMode()) {
    return; // No-op in production
  }

  // Ensure test signals are initialized
  initializeTestSignals();

  // Create full event with timestamp
  const event = {
    ...payload,
    timestamp: new Date(),
  } as TestEvent;

  // Log to console with structured format
  console.log(`TEST_EVT:${event.kind}`, event);

  // Push to window signals array if available
  if (typeof window !== 'undefined' && window.__TEST_SIGNALS__) {
    window.__TEST_SIGNALS__.push(event);
  }
}

/**
 * Clear test signals array
 * Useful for test cleanup between tests
 */
export function clearTestSignals(): void {
  if (isTestMode() && typeof window !== 'undefined' && window.__TEST_SIGNALS__) {
    window.__TEST_SIGNALS__.length = 0;
  }
}

/**
 * Get current test signals
 * Returns copy of the signals array
 */
export function getTestSignals(): TestEvent[] {
  if (isTestMode() && typeof window !== 'undefined' && window.__TEST_SIGNALS__) {
    return [...window.__TEST_SIGNALS__];
  }
  return [];
}

// Initialize on module load if in test mode
if (isTestMode()) {
  initializeTestSignals();
}