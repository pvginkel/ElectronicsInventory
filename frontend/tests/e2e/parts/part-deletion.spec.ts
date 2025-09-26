import { test, expect } from '../../support/fixtures';

test.describe('Parts - Deletion', () => {
  test('deletes part with zero quantity', async ({ page, parts, testData }) => {
    const { part } = await testData.parts.create({
      overrides: {
        description: 'Spare Ribbon Cable',
      },
    });

    await parts.gotoList();
    await parts.waitForCards();
    await parts.openCardByKey(part.key);

    await parts.deletePartButton.click();
    const confirmDialog = page.getByRole('dialog', { name: /delete part/i });
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole('button', { name: 'Delete' }).click();

    await expect.poll(() => parts.getUrl()).toMatch(/\/parts$/);
    await parts.gotoList();
    await parts.waitForCards();
    await expect(parts.cardByKey(part.key)).toHaveCount(0);
  });

  test('blocks deletion when stock exists', async ({ page, parts, testData, apiClient }) => {
    const box = await testData.boxes.create();
    const { part } = await testData.parts.create({
      overrides: {
        description: 'USB Logic Analyzer',
      },
    });

    await apiClient.POST('/api/inventory/parts/{part_key}/stock', {
      params: { path: { part_key: part.key } },
      body: { box_no: box.box_no, loc_no: 1, qty: 2 },
    });

    await parts.gotoList();
    await parts.waitForCards();
    await parts.openCardByKey(part.key);

    await parts.deletePartButton.click();
    const confirmDialog = page.getByRole('dialog', { name: /delete part/i });
    await confirmDialog.getByRole('button', { name: 'Delete' }).click();

    await expect(parts.detailRoot).toBeVisible();
    await parts.expectDetailHeading('USB Logic Analyzer');
  });
});
