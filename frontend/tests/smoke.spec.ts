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
    const response = await page.goto(`${backendUrl}/api/health/readyz`);

    expect(response?.status()).toBe(200);

    const responseText = await response?.text();
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