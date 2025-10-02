import { expect } from '@playwright/test';
import { test } from '../../support/fixtures';

async function ensureData<T>(response: { data?: T }): Promise<T> {
  if (!response.data) {
    throw new Error('Expected response data but received none');
  }
  return response.data;
}

async function createBoxWithRetry(testData: any, label: string, attempts = 5) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await testData.boxes.create({ overrides: { description: `${label} ${Date.now()}-${attempt}` } });
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

test.describe('Dashboard storage utilization grid', () => {
  test('orders boxes by usage and links to box detail', async ({
    dashboard,
    apiClient,
    testData,
    page,
    testEvents,
  }) => {
    const occupiedBox = await createBoxWithRetry(testData, 'Dashboard Occupied Box');
    const emptyBox = await createBoxWithRetry(testData, 'Dashboard Empty Box');

    const firstLocation = occupiedBox.locations[0];
    const { part } = await testData.parts.create();

    await apiClient.POST('/api/inventory/parts/{part_key}/stock', {
      params: { path: { part_key: part.key } },
      body: {
        box_no: occupiedBox.box_no,
        loc_no: firstLocation.loc_no,
        qty: 5,
      },
    });

    const storageSummary = await ensureData(
      await apiClient.GET('/api/dashboard/storage-summary', {}),
    );
    const occupiedSummary = storageSummary.find((item) => item.box_no === occupiedBox.box_no);
    if (!occupiedSummary) {
      throw new Error('Expected occupied box to appear in storage summary');
    }

    await testEvents.clearEvents();
    await dashboard.gotoDashboard();
    await expect(dashboard.storageCard).toHaveAttribute('data-state', 'ready');

    const occupiedLocator = dashboard.storageBox(occupiedBox.box_no);
    await expect(occupiedLocator).toBeVisible();
    await expect(occupiedLocator.getByTestId('dashboard.storage.box.locations')).toHaveText(
      `${occupiedSummary.occupied_locations}/${occupiedSummary.total_locations}`,
    );
    await expect(occupiedLocator.getByTestId('dashboard.storage.box.utilization')).toHaveText(
      `${Math.round(occupiedSummary.usage_percentage)}%`,
    );

    const boxOrder = await dashboard.storageGrid()
      .locator('[data-testid="dashboard.storage.box"]')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-box-no')));

    const occupiedIndex = boxOrder.findIndex((value) => Number(value) === occupiedBox.box_no);
    const emptyIndex = boxOrder.findIndex((value) => Number(value) === emptyBox.box_no);

    expect(occupiedIndex).toBeGreaterThanOrEqual(0);
    expect(emptyIndex).toBeGreaterThanOrEqual(0);
    expect(occupiedIndex).toBeLessThan(emptyIndex);

    await occupiedLocator.click();
    await expect(page).toHaveURL(new RegExp(`/boxes/${occupiedBox.box_no}`));

    await page.goBack();
    await dashboard.waitForStorageReady();
    await expect(dashboard.storageBox(emptyBox.box_no)).toBeVisible();
  });
});
