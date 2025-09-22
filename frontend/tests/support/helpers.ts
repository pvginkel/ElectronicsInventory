import { Page, expect } from '@playwright/test';

/**
 * Generates a random ID with prefix-shortId pattern for test data
 */
export function generateRandomId(prefix: string = 'test'): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let suffix = '';
  for (let i = 0; i < 6; i++) {
    suffix += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${prefix}-${suffix}`;
}

/**
 * Waits for a TEST_EVT console event to be emitted
 * @param page The Playwright page instance
 * @param kind The event kind to wait for
 * @param filter Optional filter function to match specific event payloads
 * @param timeout Maximum time to wait for the event
 * @returns The event data payload
 */
export async function waitTestEvent<T = any>(
  page: Page,
  kind: string,
  filter?: (payload: T) => boolean,
  timeout = 10_000
): Promise<T> {
  const msg = await page.waitForEvent('console', {
    timeout,
    predicate: (m) => {
      const text = m.text();
      if (!text.startsWith('TEST_EVT: ')) return false;
      try {
        const data = JSON.parse(text.slice('TEST_EVT: '.length));
        return data?.kind === kind && (!filter || filter(data));
      } catch {
        return false;
      }
    },
  });
  return JSON.parse(msg.text().slice('TEST_EVT: '.length)) as T;
}

/**
 * Emits a test event via console.log for monitoring
 */
export async function emitTestEvt(page: Page, kind: string, payload: any): Promise<void> {
  await page.evaluate(([kind, payload]) => {
    console.log(`[TEST-EVENT:${kind}]${JSON.stringify(payload)}`);
  }, [kind, payload]);
}

/**
 * Waits for an element to be visible and returns it
 */
export async function waitForElement(page: Page, selector: string, timeout: number = 10000) {
  await expect(page.locator(selector)).toBeVisible({ timeout });
  return page.locator(selector);
}

