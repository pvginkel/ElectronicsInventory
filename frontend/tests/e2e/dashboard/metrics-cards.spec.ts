import { expect } from '@playwright/test';
import { test } from '../../support/fixtures';

function parseNumber(text: string | null): number {
  return Number(text?.replace(/[^0-9-]/g, '') ?? 0);
}

test.describe('Dashboard metrics cards', () => {
  test('renders stats that match the dashboard API', async ({ dashboard, apiClient }) => {
    await dashboard.gotoDashboard();
    await dashboard.waitForMetricsReady();

    const [{ data: stats }, { data: lowStock }] = await Promise.all([
      apiClient.GET('/api/dashboard/stats', {}),
      apiClient.GET('/api/dashboard/low-stock', {}),
    ]);

    if (!stats) {
      throw new Error('Expected dashboard stats to be available');
    }

    const lowStockCount = Array.isArray(lowStock) ? lowStock.length : stats.low_stock_count;

    await expect(dashboard.metricsRoot).toHaveAttribute('data-state', 'ready');

    const totalPartsValue = parseNumber(await dashboard.metricsValue('totalParts').textContent());
    expect(totalPartsValue).toBe(stats.total_parts);

    const storageBoxValue = parseNumber(await dashboard.metricsValue('storageBoxes').textContent());
    expect(storageBoxValue).toBe(stats.total_boxes);

    const lowStockValue = parseNumber(await dashboard.metricsValue('lowStock').textContent());
    expect(lowStockValue).toBe(lowStockCount);

    const activityValue = parseNumber(await dashboard.metricsValue('activity').textContent());
    expect(activityValue).toBe(stats.changes_7d);
  });
});
