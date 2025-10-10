import { expect } from '@playwright/test';
import { test } from '../../support/fixtures';
import { expectConsoleError, waitTestEvent, waitForListLoading } from '../../support/helpers';
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
    await expectConsoleError(shoppingLists.playwrightPage, /Outdated Optimize Dep/);

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
    await expectConsoleError(shoppingLists.playwrightPage, /Outdated Optimize Dep/);
    await shoppingLists.markReady();
    await toastHelper.expectSuccessToast(/marked ready/i);
    await shoppingLists.waitForReadyView();
    await shoppingLists.expectStatus(/ready/i);
    await expect(shoppingLists.playwrightPage.getByTestId('shopping-lists.concept.mark-ready.button')).toHaveCount(0);
  });

test('renders ready view groups and persists seller notes', async ({ shoppingLists, testData, toastHelper, testEvents }) => {
    const sellerA = await testData.sellers.create({ overrides: { name: testData.sellers.randomSellerName() } });
    const sellerB = await testData.sellers.create({ overrides: { name: testData.sellers.randomSellerName() } });
    const { part: partA } = await testData.parts.create({ overrides: { description: 'Ready view part A' } });
    const { part: partB } = await testData.parts.create({ overrides: { description: 'Ready view part B' } });

    const list = await testData.shoppingLists.createWithLines({
      listOverrides: { name: testData.shoppingLists.randomName('Ready View') },
      lines: [
        { partKey: partA.key, needed: 3, sellerId: sellerA.id },
        { partKey: partB.key, needed: 2, sellerId: sellerB.id },
      ],
    });

    await shoppingLists.gotoConcept(list.id);
    await expectConsoleError(shoppingLists.playwrightPage, /Outdated Optimize Dep/);
    await shoppingLists.markReady();
    await toastHelper.expectSuccessToast(/ready/i);
    await toastHelper.waitForToastsToDisappear();
    await shoppingLists.waitForReadyView();

    await expect(shoppingLists.readyGroupBySeller(sellerA.name)).toBeVisible();
    await expect(shoppingLists.readyGroupBySeller(sellerB.name)).toBeVisible();
    await expect(shoppingLists.playwrightPage.getByTestId('shopping-lists.ready.toolbar.back-to-concept')).toBeVisible();

    const sellerCard = shoppingLists.readyGroupBySeller(sellerA.name);
    const noteInput = sellerCard.getByLabel('Order Note');
    await noteInput.fill('Bundle with enclosure order');
    const saveButton = sellerCard.getByTestId(/order-note\.save$/);
    await expect(saveButton).toBeEnabled();

    const noteSubmit = testEvents.waitForEvent(event =>
      event.kind === 'form' &&
      (event as FormTestEvent).formId === `ShoppingListSellerOrderNote:${sellerA.id}` &&
      (event as FormTestEvent).phase === 'submit',
      { timeout: 15000 }
    );
    const noteSuccess = testEvents.waitForEvent(event =>
      event.kind === 'form' &&
      (event as FormTestEvent).formId === `ShoppingListSellerOrderNote:${sellerA.id}` &&
      (event as FormTestEvent).phase === 'success',
      { timeout: 15000 }
    );

    await saveButton.click();
    await Promise.all([noteSubmit, noteSuccess]).catch(async (error) => {
      const formEvents = await testEvents.getEventsByKind('form');
      console.error('Captured form events:', JSON.stringify(formEvents, null, 2));
      throw error;
    });
    await testEvents.waitForEvent(event =>
      event.kind === 'toast' &&
      'message' in event &&
      typeof event.message === 'string' &&
      event.message.includes('order note'),
      { timeout: 15000 }
    );
    await toastHelper.expectSuccessToast(/saved order note/i);

    await shoppingLists.gotoReady(list.id);
    const refreshedCard = shoppingLists.readyGroupBySeller(sellerA.name);
    await expect(refreshedCard.getByLabel('Order Note')).toHaveValue('Bundle with enclosure order');
  });

test('marks individual lines ordered and enforces back to concept guard', async ({ shoppingLists, testData, toastHelper, testEvents }) => {
    const seller = await testData.sellers.create({ overrides: { name: testData.sellers.randomSellerName() } });
    const { part } = await testData.parts.create({ overrides: { description: 'Ordering flow part' } });

    const list = await testData.shoppingLists.createWithLines({
      listOverrides: { name: testData.shoppingLists.randomName('Ready Ordering') },
      lines: [
        { partKey: part.key, needed: 4, sellerId: seller.id },
      ],
    });

    const line = list.lines.find(item => item.part.key === part.key);
    if (!line) {
      throw new Error('Failed to resolve shopping list line for ordering test');
    }

    await shoppingLists.gotoConcept(list.id);
    await expectConsoleError(shoppingLists.playwrightPage, /Outdated Optimize Dep/);
    await shoppingLists.markReady();
    await toastHelper.expectSuccessToast(/ready/i);
    await toastHelper.waitForToastsToDisappear();
    await shoppingLists.waitForReadyView();

    const lineSubmit = testEvents.waitForEvent(event =>
      event.kind === 'form' &&
      (event as FormTestEvent).formId === `ShoppingListLineOrder:line:${line.id}` &&
      (event as FormTestEvent).phase === 'submit',
      { timeout: 15000 }
    );
    const lineSuccess = testEvents.waitForEvent(event =>
      event.kind === 'form' &&
      (event as FormTestEvent).formId === `ShoppingListLineOrder:line:${line.id}` &&
      (event as FormTestEvent).phase === 'success',
      { timeout: 15000 }
    );

    await shoppingLists.markLineOrdered(part.description, 5);
    await Promise.all([lineSubmit, lineSuccess]).catch(async (error) => {
      const formEvents = await testEvents.getEventsByKind('form');
      console.error('Captured form events:', JSON.stringify(formEvents, null, 2));
      throw error;
    });
    await toastHelper.expectSuccessToast(/marked .* ordered/i);
    await toastHelper.waitForToastsToDisappear();

    const row = shoppingLists.readyLineRow(part.description);
    await expect(row.getByTestId(/status$/)).toContainText(/ordered/i);
    await expect(row.getByTestId(/ordered$/)).toContainText('5');
    await expect(shoppingLists.playwrightPage.getByTestId('shopping-lists.ready.toolbar.back-to-concept')).toHaveCount(0);

    const revertLineSubmit = testEvents.waitForEvent(event =>
      event.kind === 'form' &&
      (event as FormTestEvent).formId === `ShoppingListLineOrder:line:${line.id}` &&
      (event as FormTestEvent).phase === 'submit',
      { timeout: 15000 }
    );
    const revertLineSuccess = testEvents.waitForEvent(event =>
      event.kind === 'form' &&
      (event as FormTestEvent).formId === `ShoppingListLineOrder:line:${line.id}` &&
      (event as FormTestEvent).phase === 'success',
      { timeout: 15000 }
    );

    await shoppingLists.markLineOrdered(part.description, 0);
    await Promise.all([revertLineSubmit, revertLineSuccess]).catch(async (error) => {
      const formEvents = await testEvents.getEventsByKind('form');
      console.error('Captured form events during revert:', JSON.stringify(formEvents, null, 2));
      throw error;
    });
    await testEvents.waitForEvent(event =>
      event.kind === 'toast' &&
      'message' in event &&
      typeof event.message === 'string' &&
      event.message.includes('ordered quantity'),
      { timeout: 15000 }
    );
    await toastHelper.expectSuccessToast(/cleared ordered quantity/i);
    await toastHelper.waitForToastsToDisappear();

    await expect(shoppingLists.readyRoot).toBeVisible();
    await shoppingLists.gotoReady(list.id);
    await expect(shoppingLists.readyLineRow(part.description).getByTestId(/status$/)).toContainText(/new/i);
    await expect(shoppingLists.playwrightPage.getByTestId('shopping-lists.ready.toolbar.back-to-concept')).toBeVisible();
  });

  test('orders seller groups, reassigns lines, and returns to concept', async ({ shoppingLists, testData, toastHelper }) => {
    const sellerPrimary = await testData.sellers.create({ overrides: { name: testData.sellers.randomSellerName() } });
    const sellerSecondary = await testData.sellers.create({ overrides: { name: testData.sellers.randomSellerName() } });
    const { part: partOne } = await testData.parts.create({ overrides: { description: 'Group order part 1' } });
    const { part: partTwo } = await testData.parts.create({ overrides: { description: 'Group order part 2' } });
    const { part: partThree } = await testData.parts.create({ overrides: { description: 'Group order part 3' } });

    const list = await testData.shoppingLists.createWithLines({
      listOverrides: { name: testData.shoppingLists.randomName('Ready Grouping') },
      lines: [
        { partKey: partOne.key, needed: 3, sellerId: sellerPrimary.id },
        { partKey: partTwo.key, needed: 2, sellerId: sellerPrimary.id },
        { partKey: partThree.key, needed: 1, sellerId: sellerSecondary.id },
      ],
    });


    await shoppingLists.gotoConcept(list.id);
    await expectConsoleError(shoppingLists.playwrightPage, /Outdated Optimize Dep/);
    await shoppingLists.markReady();
    await toastHelper.expectSuccessToast(/ready/i);
    await shoppingLists.waitForReadyView();

    // Reassign partTwo to the secondary seller while lines are still new
    await shoppingLists.editReadyLine(partTwo.description, { sellerName: sellerSecondary.name });
    await toastHelper.expectSuccessToast(/updated line/i);
    await toastHelper.waitForToastsToDisappear();
    await expect(shoppingLists.readyGroupBySeller(sellerSecondary.name)).toBeVisible();
    await expect(shoppingLists.readyLineRow(partTwo.description)).toBeVisible();

    const primaryCard = shoppingLists.readyGroupBySeller(sellerPrimary.name);
    const primaryTestId = await primaryCard.getAttribute('data-testid');
    const groupKey = primaryTestId?.split('.').pop();
    const refreshedDetail = await testData.shoppingLists.getDetail(list.id);
    const primaryLines = refreshedDetail.lines.filter(line => line.seller_id === sellerPrimary.id);
    const groupOverrides: Record<string, number> = {};
    for (const lineItem of primaryLines) {
      groupOverrides[lineItem.id] = (lineItem.needed ?? 0) + 1;
    }
    const groupSubmit = waitTestEvent<FormTestEvent>(shoppingLists.playwrightPage, 'form', event => event.formId === `ShoppingListGroupOrder:group:${groupKey}` && event.phase === 'submit');
    const groupSuccess = waitTestEvent<FormTestEvent>(shoppingLists.playwrightPage, 'form', event => event.formId === `ShoppingListGroupOrder:group:${groupKey}` && event.phase === 'success');
    await shoppingLists.markGroupOrdered(sellerPrimary.name, groupOverrides);
    if (!groupKey) {
      throw new Error('Missing seller group key for instrumentation assertion');
    }
    await groupSubmit;
    await groupSuccess;
    await toastHelper.expectSuccessToast(/marked \d+ lines ordered/i);
    await toastHelper.waitForToastsToDisappear();

    for (const lineItem of primaryLines) {
      const row = shoppingLists.readyLineRow(lineItem.part.description);
      await expect(row.getByTestId(/status$/)).toContainText(/ordered/i);
    }

    // Revert ordered lines to enable back to concept, then transition back using the real API for determinism.
    const orderedLineIds = (await testData.shoppingLists.getDetail(list.id)).lines
      .filter(line => line.status === 'ordered')
      .map(line => line.id);
    for (const lineId of orderedLineIds) {
      await testData.shoppingLists.revertLine(list.id, lineId);
    }
    const postRevertDetail = await testData.shoppingLists.getDetail(list.id);
    for (const lineItem of postRevertDetail.lines) {
      expect(lineItem.status).not.toBe('ordered');
    }
    await shoppingLists.gotoReady(list.id);
    await expect(shoppingLists.playwrightPage.getByTestId('shopping-lists.ready.toolbar.back-to-concept')).toBeVisible();

    await shoppingLists.backToConcept();
    await toastHelper.expectSuccessToast(/returned list to concept/i);
    await expect(shoppingLists.conceptRoot).toBeVisible();
    await expect(shoppingLists.playwrightPage.getByTestId('shopping-lists.concept.mark-ready.button')).toBeVisible();
  });
});
