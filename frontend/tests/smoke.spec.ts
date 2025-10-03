import { test, expect } from './support/fixtures';
import { selectors } from './support/selectors';

test.describe('Smoke Tests', () => {
  test('should access frontend and verify basic functionality', async ({ page, frontendUrl }) => {
    // Navigate to the frontend
    await page.goto(frontendUrl);

    // Check that the page loaded successfully
    await expect(page).toHaveTitle(/Electronics Inventory/i);

    // Verify we can see some basic navigation or content
    // This is a basic check - actual selectors will depend on the app structure
    const body = page.locator('body');
    await expect(body).toBeVisible();

    console.log('✅ Frontend smoke test passed');
  });

  test('should verify backend health endpoint', async ({ page, backendUrl }) => {
    // Check backend health directly
    const response = await page.request.get(`${backendUrl}/api/health/readyz`);
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
    // Test that our custom fixtures work
    expect(sseTimeout).toBe(35000);

    // Test that selectors are available
    expect(selectors.common.loading).toBe('[data-testid="loading"]');
    expect(selectors.dashboard.page).toBe('[data-testid="dashboard.page"]');

    console.log('✅ Test infrastructure verification passed');
  });
});
