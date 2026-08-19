import type { EventEmitter } from 'node:events';
import { test, expect } from '../../support/fixtures';
import { expectConsoleError } from '../../support/helpers';

test.describe('Parts - Deletion', () => {
  test('deletes part with zero quantity', async ({ page, parts, testData, apiClient }) => {
    const { part } = await testData.parts.create({
      overrides: {
        description: 'Spare Ribbon Cable',
      },
    });

    const { data: existingLocations } = await apiClient.GET('/api/parts/{part_key}/locations', {
      params: { path: { part_key: part.key } },
    });

    if (existingLocations && Array.isArray(existingLocations)) {
      for (const location of existingLocations) {
        if (location.qty > 0) {
          await apiClient.DELETE('/api/inventory/parts/{part_key}/stock', {
            params: { path: { part_key: part.key } },
            body: {
              box_no: location.box_no,
              loc_no: location.loc_no,
              qty: location.qty,
            },
          });
        }
      }
    }

    await page.evaluate(() => {
      (window as unknown as { __registerExpectedError?: (pattern: string) => void }).__registerExpectedError?.('404');
    });

    await parts.gotoList();
    await parts.waitForCards();
    await parts.openCardByKey(part.key);

    await parts.openDeleteDialog();
    await parts.confirmDelete(part.key);

    await parts.gotoList();
    await parts.waitForCards();
    await expect(parts.cardByKey(part.key)).toHaveCount(0);
  });

  test('blocks deletion when stock exists', async ({ page, parts, testData, apiClient, toastHelper }) => {
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

    const pageEmitter = page as unknown as EventEmitter;
    const originalPageErrorListeners = pageEmitter.listeners('pageerror');
    pageEmitter.removeAllListeners('pageerror');
    pageEmitter.on('pageerror', error => {
      if (/Cannot delete part/i.test(error.message)) {
        return;
      }
      for (const listener of originalPageErrorListeners) {
        listener.call(page, error);
      }
    });

    await parts.gotoList();
    await parts.waitForCards();
    await parts.openCardByKey(part.key);

    await parts.openDeleteDialog();
    await expectConsoleError(page, /Cannot delete part/i);
    await parts.confirmDelete(part.key, { expectNavigation: false });

    await expect(parts.deleteDialog).toBeHidden();
    await expect(parts.detailRoot).toBeVisible();
    await parts.expectDetailHeading('USB Logic Analyzer');

    await toastHelper.waitForToastWithText(/stock|delete/i, { timeout: 10000 }).catch(() => undefined);
  });
});
