import { expect } from '@playwright/test';
import { makeUnique } from '../../support/helpers';
import { test } from '../../support/fixtures';
import { SellerSelectorHarness } from '../../support/page-objects/seller-selector-harness';
import { expectConsoleError } from '../../support/helpers';

function extractPartKeyFromUrl(url: string): string {
  const segments = url.split('?')[0].split('/');
  return segments[segments.length - 1];
}

test.describe('Cross-domain workflow - type to dashboard', () => {
  test('creates type and part, assigns locations, updates dashboard, and protects box deletion', async ({
    page,
    appShell,
    types,
    parts,
    partsLocations,
    boxes,
    dashboard,
    toastHelper,
    testData,
    apiClient,
  }) => {
    test.setTimeout(120_000);

    const typeName = makeUnique('Cross Type');
    const partDescription = makeUnique('Cross Part');
    const manufacturerCodeSuffix = makeUnique('X').split('-').pop()?.toUpperCase() ?? 'XXXXXX';
    const manufacturerCode = `X-${manufacturerCodeSuffix.slice(0, 4)}`;
    const sellerName = makeUnique('Cross Seller');
    const sellerSlug = makeUnique('seller').replace(/\s+/g, '-').toLowerCase();
    const sellerWebsite = `https://example.com/${sellerSlug}`;
    const sourceBox = await testData.boxes.create({ overrides: { description: makeUnique('Source Box') } });
    const initialLocation = { boxNo: sourceBox.box_no, locNo: 7 };
    const targetBox = await testData.boxes.create({ overrides: { description: makeUnique('Target Box') } });
    const targetLocation = { boxNo: targetBox.box_no, locNo: 11 };

    const statsBefore = await apiClient.GET('/api/dashboard/stats', {});
    const baselineTotalParts = statsBefore.data?.total_parts ?? 0;

    await types.goto();
    await types.createType(typeName);
    await expect(types.cardByName(typeName)).toBeVisible();

    const seller = await testData.sellers.create({
      overrides: { name: sellerName, website: sellerWebsite },
    });

    await parts.gotoList();
    await parts.openNewPartForm();
    await parts.fillBasicForm({ description: partDescription, manufacturerCode });
    await parts.selectType(typeName);

    const sellerSelector = new SellerSelectorHarness(page);
    await sellerSelector.waitForReady();
    await sellerSelector.search(seller.name);
    await sellerSelector.selectOption(seller.name);
    await sellerSelector.expectSelected(seller.name);

    const createResponsePromise = page.waitForResponse(response => {
      if (response.request().method() !== 'POST') {
        return false;
      }
      try {
        return new URL(response.url()).pathname === '/api/parts';
      } catch {
        return false;
      }
    });

    await parts.formSubmit.click();
    await createResponsePromise;
    await expect(parts.detailRoot).toBeVisible({ timeout: 15000 });
    await parts.expectDetailHeading(partDescription);
    await expect(parts.detailRoot).toContainText(sellerName);

    const partUrl = await parts.getUrl();
    const partKey = extractPartKeyFromUrl(partUrl);

    await parts.detailRoot.getByRole('button', { name: /add stock/i }).click();
    await partsLocations.fillAddLocation({
      boxNo: initialLocation.boxNo,
      locNo: initialLocation.locNo,
      quantity: 5,
    });
    await partsLocations.saveNewLocation(partKey);
    await partsLocations.waitForTotal(5);
    await expect(partsLocations.row(initialLocation.boxNo, initialLocation.locNo)).toBeVisible();

    await partsLocations.fillAddLocation({
      boxNo: targetLocation.boxNo,
      locNo: targetLocation.locNo,
      quantity: 5,
    });
    await partsLocations.saveNewLocation(partKey);
    await partsLocations.waitForTotal(10);
    await partsLocations.remove(initialLocation.boxNo, initialLocation.locNo, partKey);
    await partsLocations.waitForTotal(5);
    await expect(partsLocations.row(targetLocation.boxNo, targetLocation.locNo)).toBeVisible();

    await appShell.clickDesktopNav('types');
    await expect(page).toHaveURL(/\/types/);
    await types.waitForListState('ready');
    await expect(types.partCountBadge(typeName)).toContainText(/1\s+part/i);

    await appShell.clickDesktopNav('dashboard');
    await expect(page).toHaveURL(/\/?$/);
    await dashboard.waitForMetricsReady();

    const statsAfter = await apiClient.GET('/api/dashboard/stats', {});
    const totalPartsAfter = statsAfter.data?.total_parts ?? baselineTotalParts;
    expect(totalPartsAfter).toBe(baselineTotalParts + 1);
    const totalPartsText = await dashboard.metricsValue('totalParts').textContent();
    expect(totalPartsText).toBeTruthy();
    const totalPartsMetric = Number((totalPartsText ?? '').replace(/[^0-9]/g, '') || '0');
    expect(totalPartsMetric).toBe(totalPartsAfter);

    await boxes.gotoList();
    await boxes.expectCardVisible(targetBox.box_no);
    await boxes.openDetail(targetBox.box_no);
    await boxes.expectLocationOccupied(targetBox.box_no, targetLocation.locNo, {
      partKey,
      quantity: 5,
    });

    await expectConsoleError(boxes.playwrightPage, /cannot delete box/i);
    await boxes.detailRoot.getByRole('button', { name: /delete box/i }).click();
    const confirmDialog = boxes.playwrightPage.getByRole('dialog', { name: /delete box/i });
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole('button', { name: /delete/i }).click();

    await toastHelper.waitForToastWithText(new RegExp(`Cannot delete box ${targetBox.box_no}`, 'i'));
    await boxes.expectLocationOccupied(targetBox.box_no, targetLocation.locNo, {
      partKey,
      quantity: 5,
    });
  });
});
