import { test, expect } from './support/fixtures';
import { selectors } from './support/selectors';
import type { TestEvent, UiStateTestEvent } from '../src/types/test-events';

function getWorkerServiceEvent(events: TestEvent[]): UiStateTestEvent | undefined {
  return events.find(event => {
    if (event.kind !== 'ui_state') {
      return false;
    }
    return event.scope === 'worker.services' && event.phase === 'ready';
  }) as UiStateTestEvent | undefined;
}

test.describe('Smoke Tests', () => {
  test('should access frontend and verify basic functionality', async ({ page, frontendUrl, backendUrl, testEvents }, testInfo) => {
    await page.goto(frontendUrl);
    await expect(page).toHaveTitle(/Electronics Inventory/i);

    const body = page.locator('body');
    await expect(body).toBeVisible();

    const events = await testEvents.getEvents();
    const workerEvent = getWorkerServiceEvent(events);
    expect(workerEvent?.metadata?.backendUrl).toBe(backendUrl);
    expect(workerEvent?.metadata?.frontendUrl).toBe(frontendUrl);

    const configuredBaseUrl = (testInfo.project.use as { baseURL?: string } | undefined)?.baseURL;
    expect(configuredBaseUrl).toBe(frontendUrl);

    console.log('✅ Frontend smoke test passed');
  });

  test('should verify backend health endpoint', async ({ page, backendUrl }) => {
    const response = await page.request.get(`${backendUrl}/health/readyz`);
    const status = response.status();
    const responseText = await response.text();

    let payload: unknown;
    try {
      payload = responseText ? JSON.parse(responseText) : undefined;
    } catch {
      payload = undefined;
    }

    type HealthPayload = {
      status?: string;
      migrations?: {
        pending?: number;
      };
    };

    const healthPayload: HealthPayload | undefined =
      payload && typeof payload === 'object' ? (payload as HealthPayload) : undefined;

    const pendingMigrations = typeof healthPayload?.migrations?.pending === 'number'
      ? healthPayload.migrations.pending
      : 0;
    const statusLabel = healthPayload?.status;

    const failureMessage = pendingMigrations > 0
      ? `Backend health check failed: ${pendingMigrations} pending migration(s) reported.`
      : `Backend health check failed: status=${status}${typeof statusLabel === 'string' ? ` (${statusLabel})` : ''}.`;

    expect(status, failureMessage).toBe(200);
    expect(responseText).toBeTruthy();

    console.log('✅ Backend health check passed');
  });

  test('should verify test infrastructure works', async ({ sseTimeout }) => {
    expect(sseTimeout).toBe(35000);
    expect(selectors.common.loading).toBe('[data-testid="loading"]');

    console.log('✅ Test infrastructure verification passed');
  });
});

test.afterEach(async () => {
  // No-op placeholder to keep smoke suite hook for future diagnostics.
});
