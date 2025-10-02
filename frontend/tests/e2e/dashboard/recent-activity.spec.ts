import { expect } from '@playwright/test';
import { test } from '../../support/fixtures';

async function ensureData<T>(response: { data?: T }): Promise<T> {
  if (!response.data) {
    throw new Error('Expected response data but received none');
  }
  return response.data;
}

test.describe('Dashboard recent activity timeline', () => {
  test('shows latest stock changes grouped by recency', async ({
    dashboard,
    apiClient,
    testData,
  }) => {
    const box = await testData.boxes.create({ overrides: { description: 'Dashboard Activity Box' } });
    const location = box.locations[0];
    const { part } = await testData.parts.create();

    await apiClient.POST('/api/inventory/parts/{part_key}/stock', {
      params: { path: { part_key: part.key } },
      body: {
        box_no: box.box_no,
        loc_no: location.loc_no,
        qty: 5,
      },
    });

    await apiClient.DELETE('/api/inventory/parts/{part_key}/stock', {
      params: { path: { part_key: part.key } },
      body: {
        box_no: box.box_no,
        loc_no: location.loc_no,
        qty: 2,
      },
    });

    const activityData = await ensureData(
      await apiClient.GET('/api/dashboard/recent-activity', {}),
    );

    const activityForPart = activityData.filter((entry) => entry.part_key === part.key);
    if (activityForPart.length === 0) {
      throw new Error('Expected activity entries for created part');
    }

    const addition = activityForPart.find((entry) => entry.delta_qty > 0);
    const removal = activityForPart.find((entry) => entry.delta_qty < 0);

    if (!addition || !removal) {
      throw new Error('Expected both addition and removal activity entries');
    }

    await dashboard.gotoDashboard();
    await dashboard.waitForActivityReady();

    const additionLocator = dashboard.playwrightPage.locator(
      `[data-testid="dashboard.activity.item"][data-part-key="${part.key}"][data-delta="${addition.delta_qty}"]`,
    );
    await expect(additionLocator).toBeVisible();

    const removalLocator = dashboard.playwrightPage.locator(
      `[data-testid="dashboard.activity.item"][data-part-key="${part.key}"][data-delta="${removal.delta_qty}"]`,
    );
    await expect(removalLocator).toBeVisible();
  });
});
