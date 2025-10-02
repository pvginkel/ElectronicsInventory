import { expect } from '@playwright/test';
import { test } from '../../support/fixtures';

async function ensureData<T>(response: { data?: T }): Promise<T> {
  if (!response.data) {
    throw new Error('Expected response data but received none');
  }
  return response.data;
}

async function createBoxWithRetry(testData: any, attempts = 5) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await testData.boxes.create({ overrides: { description: `Dashboard Low Stock Box ${Date.now()}-${attempt}` } });
    } catch (error) {
      if (error instanceof Error && error.message.includes('409 CONFLICT')) {
        await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
        continue;
      }
      throw error;
    }
  }
  throw new Error('Failed to create dashboard test box after retries');
}

test.describe('Dashboard low stock alerts', () => {
  test('shows severity styling for critical items', async ({
    dashboard,
    apiClient,
    testData,
  }) => {
    const box = await createBoxWithRetry(testData);
    const location = box.locations[0];

    const { part: criticalPart } = await testData.parts.create();
    await apiClient.POST('/api/inventory/parts/{part_key}/stock', {
      params: { path: { part_key: criticalPart.key } },
      body: {
        box_no: box.box_no,
        loc_no: location.loc_no,
        qty: 1,
      },
    });

    const { part: lowPart } = await testData.parts.create();
    await apiClient.POST('/api/inventory/parts/{part_key}/stock', {
      params: { path: { part_key: lowPart.key } },
      body: {
        box_no: box.box_no,
        loc_no: location.loc_no,
        qty: 4,
      },
    });

    const lowStockData = await ensureData(
      await apiClient.GET('/api/dashboard/low-stock', {}),
    );

    const targets = lowStockData.filter((item) => [criticalPart.key, lowPart.key].includes(item.part_key));
    if (targets.length < 2) {
      throw new Error('Expected both created parts to appear in low stock data');
    }

    await dashboard.gotoDashboard();
    await dashboard.waitForLowStockReady();

    const showMoreButton = dashboard.playwrightPage.getByTestId('dashboard.low-stock.show-more');
    if (await showMoreButton.isVisible()) {
      await showMoreButton.click();
    }

    for (const target of targets) {
      const expectedCriticality = target.current_quantity <= 2
        ? 'critical'
        : target.current_quantity <= 5
        ? 'low'
        : target.current_quantity <= 10
        ? 'warning'
        : 'normal';

      const itemLocator = dashboard.playwrightPage.locator(
        `[data-testid="dashboard.low-stock.item"][data-part-key="${target.part_key}"]`
      );
      await expect(itemLocator).toBeVisible();
      await expect(itemLocator).toHaveAttribute('data-criticality', expectedCriticality);
    }

    const criticalLocator = dashboard.playwrightPage.locator(
      `[data-testid="dashboard.low-stock.item"][data-part-key="${criticalPart.key}"]`
    );
    await criticalLocator.getByTestId('dashboard.low-stock.item.quick-add.toggle').click();
    await expect(criticalLocator.getByPlaceholder('Qty')).toBeVisible();
  });
});
