import { expect } from '@playwright/test';
import { test } from '../../support/fixtures';
import { waitTestEvent, waitForListLoading } from '../../support/helpers';
import type { FormTestEvent } from '@/types/test-events';

test.describe('Shopping Lists', () => {
  test('creates, opens, and deletes a concept list from the overview', async ({ shoppingLists, testData, toastHelper }) => {
    await shoppingLists.gotoOverview();

    const listName = testData.shoppingLists.randomName('UI Concept List');
    const listDescription = 'Overview CRUD smoke description';

    await shoppingLists.createConceptList({ name: listName, description: listDescription });

    await waitTestEvent<FormTestEvent>(shoppingLists.playwrightPage, 'form', event => event.formId === 'ShoppingListCreate:concept' && event.phase === 'submit');
    await waitTestEvent<FormTestEvent>(shoppingLists.playwrightPage, 'form', event => event.formId === 'ShoppingListCreate:concept' && event.phase === 'success');

    await shoppingLists.waitForConceptReady();
    await expect(shoppingLists.conceptRoot).toBeVisible();

    // Return to overview and ensure the list is present.
    await shoppingLists.gotoOverview();
    await expect(shoppingLists.overviewCardByName(listName)).toBeVisible();

    await shoppingLists.deleteConceptListByName(listName);
    await toastHelper.expectSuccessToast(new RegExp(`Deleted shopping list "${listName}"`, 'i'));
    await expect(shoppingLists.overviewCardByName(listName)).toHaveCount(0);
  });

  test('manages concept lines end-to-end', async ({ shoppingLists, testData, toastHelper }) => {
    const { part } = await testData.parts.create({ overrides: { description: 'Line management part' } });
    const seller = await testData.sellers.create({ overrides: { name: testData.sellers.randomSellerName(), website: 'https://example.com' } });
    const list = await testData.shoppingLists.create({ name: testData.shoppingLists.randomName('Concept Line EU') });

    await shoppingLists.gotoConcept(list.id);

    await shoppingLists.addConceptLine({
      partSearch: part.key,
      needed: 3,
      sellerName: seller.name,
      note: 'Initial note',
    });

    const lineRow = shoppingLists.conceptRowByPart(part.description);
    await expect(lineRow).toBeVisible();
    await expect(lineRow.getByTestId(/needed$/)).toHaveText('3');

    await shoppingLists.editConceptLine(part.description, {
      needed: 5,
      note: 'Updated note',
    });

    await expect(lineRow.getByTestId(/needed$/)).toHaveText('5');
    await expect(lineRow.getByTestId(/note$/)).toContainText('Updated note');

    await shoppingLists.deleteConceptLine(part.description);
    await toastHelper.expectSuccessToast(/removed part from concept list/i);
    await expect(lineRow).toHaveCount(0);
  });

  test('prevents duplicate line creation and surfaces guidance', async ({ shoppingLists, testData }) => {
    const { part } = await testData.parts.create({ overrides: { description: 'Duplicate prevention part' } });
    const list = await testData.shoppingLists.create({ name: testData.shoppingLists.randomName('Duplicate Concept') });

    await shoppingLists.gotoConcept(list.id);

    await shoppingLists.addConceptLine({
      partSearch: part.key,
      needed: 2,
      note: 'Baseline entry',
    });

    await shoppingLists.playwrightPage.getByTestId('shopping-lists.concept.table.add').click();
    const dialog = shoppingLists.playwrightPage.getByTestId('ShoppingListLineForm:add.dialog');
    await expect(dialog).toBeVisible();
    await waitForListLoading(shoppingLists.playwrightPage, 'parts.selector', 'ready');
    await dialog.getByTestId('parts.selector.input').fill(part.key);
    await shoppingLists.playwrightPage.getByRole('option', { name: new RegExp(part.key) }).first().click();
    await dialog.getByTestId('ShoppingListLineForm:add.submit').click();

    const duplicateBanner = shoppingLists.playwrightPage.getByTestId('shopping-lists.concept.duplicate-banner');
    await expect(duplicateBanner).toBeVisible();
    await expect(duplicateBanner).toContainText(part.key);

    await duplicateBanner.getByTestId('shopping-lists.concept.duplicate-banner.dismiss').click();
    await expect(duplicateBanner).toBeHidden();

    await dialog.getByRole('button', { name: /cancel/i }).click();
    await expect(dialog).toBeHidden();
  });

  test('sorts concept lines and keeps ordered/received read-only', async ({ shoppingLists, testData }) => {
    const seller = await testData.sellers.create({ overrides: { name: testData.sellers.randomSellerName(), website: 'https://example.com/store' } });
    const { part: partA } = await testData.parts.create({ overrides: { description: 'Alpha capacitor', manufacturer_code: 'MFR-A' } });
    const { part: partB } = await testData.parts.create({ overrides: { description: 'Beta resistor', manufacturer_code: 'MFR-B' } });

    const list = await testData.shoppingLists.createWithLines({
      listOverrides: { name: testData.shoppingLists.randomName('Sorting Concept') },
      lines: [
        { partKey: partB.key, needed: 4, note: 'Second entry', sellerId: seller.id },
        { partKey: partA.key, needed: 2, note: 'First entry' },
      ],
    });

    await shoppingLists.gotoConcept(list.id);

    const firstRow = () => shoppingLists.conceptTable.locator('tbody tr').first();
    const lastRow = () => shoppingLists.conceptTable.locator('tbody tr').last();

    await expect(firstRow()).toContainText('Alpha capacitor');
    await expect(lastRow()).toContainText('Beta resistor');

    await shoppingLists.playwrightPage.getByTestId('shopping-lists.concept.sort.button').click();
    await shoppingLists.playwrightPage.getByTestId('shopping-lists.concept.sort.mpn').click();
    await expect(firstRow()).toContainText('Alpha capacitor');
    await expect(lastRow()).toContainText('Beta resistor');

    await shoppingLists.playwrightPage.getByTestId('shopping-lists.concept.sort.button').click();
    await shoppingLists.playwrightPage.getByTestId('shopping-lists.concept.sort.createdAt').click();
    await expect(firstRow()).toContainText('Beta resistor');

    const orderedCells = shoppingLists.conceptTable.locator('tbody tr td:nth-child(4)');
    const receivedCells = shoppingLists.conceptTable.locator('tbody tr td:nth-child(5)');
    await expect(orderedCells).toHaveText(['0', '0']);
    await expect(receivedCells).toHaveText(['0', '0']);
  });

  test('marks a concept list ready and removes the CTA', async ({ shoppingLists, testData, toastHelper }) => {
    const { part } = await testData.parts.create({ overrides: { description: 'Ready test part' } });
    const list = await testData.shoppingLists.createWithLines({
      listOverrides: { name: testData.shoppingLists.randomName('Ready Concept') },
      lines: [
        { partKey: part.key, needed: 1 },
      ],
    });

    await shoppingLists.gotoConcept(list.id);
    await shoppingLists.markReady();
    await toastHelper.expectSuccessToast(/marked ready/i);
    await shoppingLists.expectStatus(/ready/i);
    await expect(shoppingLists.playwrightPage.getByTestId('shopping-lists.concept.mark-ready.button')).toHaveCount(0);
  });
});
