import { expect } from '@playwright/test';
import { test } from '../../support/fixtures';

async function ensureData<T>(response: { data?: T }): Promise<T> {
  if (!response.data) {
    throw new Error('Expected response data but received none');
  }
  return response.data;
}

test.describe('Dashboard documentation status', () => {
  test('reflects undocumented parts and milestone badges', async ({ dashboard, apiClient, testData }) => {
    await testData.parts.create();

    await dashboard.gotoDashboard();
    await dashboard.waitForDocumentationReady();

    const [statsResp, docsResp] = await Promise.all([
      apiClient.GET('/api/dashboard/stats', {}),
      apiClient.GET('/api/dashboard/parts-without-documents', {}),
    ]);

    const stats = await ensureData(statsResp);
    const documentation = await ensureData(docsResp);

    const expectedPercentageRaw = stats.total_parts === 0
      ? 0
      : Math.round(((stats.total_parts - documentation.count) / stats.total_parts) * 100);
    const expectedPercentage = Math.min(100, Math.max(0, expectedPercentageRaw));

    const displayedPercentage = Number(
      await dashboard.documentationProgress().textContent().then((text) => text?.replace(/[^0-9]/g, '') ?? '0'),
    );
    expect(displayedPercentage).toBeGreaterThanOrEqual(0);
    expect(displayedPercentage).toBeLessThanOrEqual(100);
    const percentageDelta = Math.abs(displayedPercentage - expectedPercentage);
    expect(percentageDelta).toBeLessThanOrEqual(5);

    const sampleParts = Array.isArray(documentation.sample_parts) ? documentation.sample_parts.slice(0, 3) : [];
    for (const sample of sampleParts) {
      const quickFixItem = dashboard.playwrightPage.locator(
        `[data-testid="dashboard.documentation.item"][data-part-key="${sample.part_key}"]`
      );
      await expect(quickFixItem).toBeVisible();
    }

    const milestones = dashboard.documentationCard.locator('[data-testid="dashboard.documentation.milestone"]');
    await expect(milestones).toHaveCount(4);
  });
});
