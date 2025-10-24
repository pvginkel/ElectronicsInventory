import { expect } from '@playwright/test';
import { test } from '../../support/fixtures';
import { waitForListLoading } from '../../support/helpers';
import { ShoppingListSelectorHarness } from '../../support/page-objects/shopping-list-selector-harness';
import type { PartKitReservationsResponseSchema_d12d9a5 } from '@/lib/api/generated/hooks';

test.describe('Kit shopping list dialog', () => {
  test('selecting an existing concept list does not raise validation error', async ({
    kits,
    apiClient,
    testData,
  }) => {
    const { part } = await testData.parts.create({
      overrides: { description: 'Order dialog validation target' },
    });
    const reservations = await apiClient.apiRequest<PartKitReservationsResponseSchema_d12d9a5>(() =>
      apiClient.GET('/api/parts/{part_key}/kit-reservations', {
        params: { path: { part_key: part.key } },
      })
    );
    const box = await testData.boxes.create();
    await apiClient.POST('/api/inventory/parts/{part_key}/stock', {
      params: { path: { part_key: part.key } },
      body: { box_no: box.box_no, loc_no: 1, qty: 1 },
    });

    const kit = await testData.kits.create({
      overrides: {
        name: testData.kits.randomKitName('Shopping list dialog kit'),
        build_target: 1,
      },
    });

    await testData.kits.addContent(kit.id, {
      partId: reservations.part_id,
      requiredPerUnit: 1,
    });

    const listName = testData.shoppingLists.randomName('Dialog Concept');
    const conceptList = await testData.shoppingLists.create({
      name: listName,
    });

    await kits.gotoOverview();
    const searchReady = waitForListLoading(kits.playwrightPage, 'kits.overview', 'ready');
    await kits.search(kit.name);
    await searchReady;
    const detailReady = waitForListLoading(kits.playwrightPage, 'kits.detail', 'ready');
    const contentsReady = waitForListLoading(kits.playwrightPage, 'kits.detail.contents', 'ready');
    await kits.openDetailFromCard(kit.id);
    await detailReady;
    await contentsReady;

    await kits.detailOrderButton.click();
    await expect(kits.detailOrderDialog).toBeVisible();

    const selector = new ShoppingListSelectorHarness(kits.playwrightPage, {
      scope: 'kits.detail.shoppingLists',
    });
    await selector.waitForReady();
    await selector.input.focus();
    await selector.selectOption(conceptList.name);
    await selector.expectSelected(conceptList.name);

    await expect(selector.input).not.toHaveAttribute('aria-invalid', 'true');
    await expect(
      kits.detailOrderForm.getByText('Select a Concept list', { exact: true })
    ).toHaveCount(0);
    await expect(kits.detailOrderSubmit).toBeEnabled();
  });
});
