import type { Page, Route } from '@playwright/test';
import { test, expect } from '../../support/fixtures';

const partsEndpoint = '**/api/parts/with-locations';

async function withRoute(page: Page, handler: (route: Route) => Promise<void> | void) {
  await page.route(partsEndpoint, handler, { times: 1 });
}

test.describe('Parts - List View', () => {
  test('shows loading skeleton before data resolves', async ({ page, parts }) => {
    let captured = false;
    await withRoute(page, async route => {
      captured = true;
      await page.waitForTimeout(250);
      await route.continue();
    });

    await parts.gotoList();
    await parts.waitForLoading();
    expect(captured).toBe(true);
    await parts.waitForCards();
    await parts.expectSummaryText(/parts/i);

    await page.unroute(partsEndpoint);
  });

  test('surfaces error state when request fails', async ({ page, parts }) => {
    await withRoute(page, route => route.fulfill({
      status: 500,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'Internal Server Error' }),
    }));

    await parts.gotoList();
    await expect(parts.errorState).toBeVisible({ timeout: 15000 });

    await page.unroute(partsEndpoint);
  });

  test('renders part card metadata and navigates to detail', async ({ parts, testData, apiClient }) => {
    const typeName = testData.types.randomTypeName('Relay Type');
    const type = await testData.types.create({ name: typeName });
    const seller = await testData.sellers.create();
    const { part } = await testData.parts.create({
      overrides: {
        description: `Automation Relay ${Date.now()}`,
        manufacturer_code: 'OMRON G5Q-1A4',
        type_id: type.id,
        tags: ['relay', '5v'],
        seller_id: seller.id,
        seller_link: seller.website ?? null,
      },
    });

    const box = await testData.boxes.create();
    await apiClient.POST('/api/inventory/parts/{part_key}/stock', {
      params: { path: { part_key: part.key } },
      body: { box_no: box.box_no, loc_no: 3, qty: 12 },
    });

    await parts.gotoList();
    await parts.waitForCards();
    await parts.search(part.description);

    const card = parts.cardByKey(part.key);
    await expect(card).toContainText(part.description);
    await expect(card).toContainText('OMRON G5Q-1A4');
    await expect(card).toContainText(type.name);
    await expect(card).toContainText('12');
    await expect(card).toContainText(`#${box.box_no}`);

    await card.click();
    await expect(parts.detailRoot).toBeVisible();
    await parts.expectDetailHeading(part.description);
  });

  test('filters by search term and clears search', async ({ parts, testData }) => {
    const resistorType = await testData.types.create({ name: testData.types.randomTypeName('Resistor') });
    const capacitorType = await testData.types.create({ name: testData.types.randomTypeName('Capacitor') });

    const resistorDescription = testData.parts.randomPartDescription('Precision resistor');
    const capacitorDescription = testData.parts.randomPartDescription('High voltage capacitor');

    await testData.parts.create({ overrides: { description: resistorDescription, type_id: resistorType.id, tags: ['precision', 'resistor'] } });
    await testData.parts.create({ overrides: { description: capacitorDescription, type_id: capacitorType.id, tags: ['capacitor', 'hv'] } });

    await parts.gotoList();
    await parts.waitForCards();

    await parts.search(capacitorDescription);
    await expect(parts.cardByDescription(capacitorDescription)).toBeVisible();

    await parts.clearSearch();
    await expect(parts.summary).toContainText(/parts/i);
    await expect(parts.searchInput).toHaveValue('');
  });

  test('opens AI dialog from list page', async ({ parts, partsAI }) => {
    await parts.gotoList();
    await parts.waitForCards();

    await parts.openAIDialog();
    await partsAI.waitForOpen();
    await partsAI.close();
  });
});
