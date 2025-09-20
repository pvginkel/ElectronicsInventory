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
 * Waits for a console event matching the given criteria
 */
export async function awaitEvent(
  page: Page,
  kind: string,
  filter?: (payload: any) => boolean,
  timeout: number = 10000
): Promise<any> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Timeout waiting for event "${kind}" after ${timeout}ms`));
    }, timeout);

    const handler = (msg: any) => {
      try {
        const text = msg.text();
        if (text.startsWith(`[TEST-EVENT:${kind}]`)) {
          const payload = JSON.parse(text.substring(`[TEST-EVENT:${kind}]`.length));

          if (!filter || filter(payload)) {
            clearTimeout(timeoutId);
            page.off('console', handler);
            resolve(payload);
          }
        }
      } catch (e) {
        // Ignore non-test-event console messages
      }
    };

    page.on('console', handler);
  });
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

/**
 * Waits for page to be ready (no loading indicators)
 */
export async function waitForPageReady(page: Page, timeout: number = 10000) {
  // Wait for potential loading spinners to disappear
  await expect(page.locator('[data-testid="loading"]')).toBeHidden({ timeout }).catch(() => {
    // Ignore if no loading indicator exists
  });

  // Wait for network to be idle
  await page.waitForLoadState('networkidle', { timeout });
}