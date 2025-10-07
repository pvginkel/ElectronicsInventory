import { expect } from '@playwright/test';
import { test } from '../../support/fixtures';

interface DashboardMetricsMetadata {
  totals: {
    parts: number;
    boxes: number;
  };
  lowStockCount: number;
  recentActivityCount: number;
}

function parseNumber(text: string | null): number {
  return Number(text?.replace(/[^0-9-]/g, '') ?? 0);
}

test.describe('Dashboard metrics cards', () => {
  test('renders stats that match the dashboard API', async ({ dashboard }) => {
    await dashboard.gotoDashboard();

    // Rely on instrumentation metadata so we assert against the exact snapshot the UI rendered.
    const metricsReadyEvent = await dashboard.waitForMetricsReady();
    expect(metricsReadyEvent.phase).toBe('ready');
    expect(metricsReadyEvent.metadata).toBeDefined();

    const metadata = metricsReadyEvent.metadata as DashboardMetricsMetadata | undefined;
    if (!metadata) {
      throw new Error('Expected dashboard metrics metadata to be emitted');
    }

    const totalPartsValue = parseNumber(await dashboard.metricsValue('totalParts').textContent());
    expect(totalPartsValue).toBe(metadata.totals.parts);

    const storageBoxValue = parseNumber(await dashboard.metricsValue('storageBoxes').textContent());
    expect(storageBoxValue).toBe(metadata.totals.boxes);

    const lowStockValue = parseNumber(await dashboard.metricsValue('lowStock').textContent());
    expect(lowStockValue).toBe(metadata.lowStockCount);

    const activityValue = parseNumber(await dashboard.metricsValue('activity').textContent());
    expect(activityValue).toBe(metadata.recentActivityCount);
  });
});
