import { expect } from '@playwright/test';
import { test } from '../../support/fixtures';

function parseNumber(text: string | null): number {
  return Number(text?.replace(/[^0-9-]/g, '') ?? 0);
}

function computeHealthScore(options: {
  stats: any;
  documentation: any;
  storage: any[];
  lowStock: any[];
  activity: any[];
}): number {
  const totalParts = options.stats?.total_parts ?? 0;
  if (totalParts === 0) {
    return 0;
  }

  const undocumentedCount = options.documentation?.count ?? 0;
  const documentedParts = totalParts - undocumentedCount;
  const documentationScore = (documentedParts / totalParts) * 100;

  const lowStockCount = options.lowStock?.length ?? options.stats?.low_stock_count ?? 0;
  const stockScore = Math.max(0, 100 - (lowStockCount / totalParts) * 100);

  const storage = Array.isArray(options.storage) ? options.storage : [];
  const totalBoxes = storage.length || 1;
  const usedBoxes = storage.filter((box: any) => (box.occupied_locations ?? 0) > 0).length;
  const avgUtilization =
    storage.reduce((sum: number, box: any) => sum + ((box.occupied_locations ?? 0) / (box.total_locations ?? 1)), 0) /
      totalBoxes || 0;
  const organizationScore = (usedBoxes / totalBoxes) * 50 + avgUtilization * 50;

  const recentActivityCount = options.activity?.length ?? 0;
  const activityScore = Math.min(100, recentActivityCount * 10);

  const finalScore =
    documentationScore * 0.4 +
    stockScore * 0.25 +
    organizationScore * 0.2 +
    activityScore * 0.15;

  return Math.round(finalScore);
}

test.describe('Dashboard health score', () => {
  test('matches computed score and exposes breakdown tooltip', async ({ dashboard, apiClient, page }) => {
    await dashboard.gotoDashboard();
    await dashboard.waitForHealthReady();

    const [statsResp, docsResp, storageResp, lowStockResp, activityResp] = await Promise.all([
      apiClient.GET('/api/dashboard/stats', {}),
      apiClient.GET('/api/dashboard/parts-without-documents', {}),
      apiClient.GET('/api/dashboard/storage-summary', {}),
      apiClient.GET('/api/dashboard/low-stock', {}),
      apiClient.GET('/api/dashboard/recent-activity', {}),
    ]);

    const stats = statsResp.data ?? {};
    const documentation = docsResp.data ?? {};
    const storage = storageResp.data ?? [];
    const lowStock = lowStockResp.data ?? [];
    const activity = activityResp.data ?? [];

    const expectedScore = computeHealthScore({
      stats,
      documentation,
      storage,
      lowStock,
      activity,
    });

    const displayedScore = parseNumber(await dashboard.healthValue().textContent());
    expect(displayedScore).toBe(expectedScore);

    await dashboard.healthCard.getByTestId('dashboard.health.gauge').hover();
    const tooltip = page.getByTestId('dashboard.health.tooltip');
    await expect(tooltip).toBeVisible();
  });
});
