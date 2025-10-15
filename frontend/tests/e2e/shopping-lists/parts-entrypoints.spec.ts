import { expect } from '@playwright/test';
import { test } from '../../support/fixtures';
import { expectConsoleError, waitForListLoading, waitTestEvent } from '../../support/helpers';
import type { FormTestEvent } from '@/types/test-events';

const ADD_FORM_ID = 'ShoppingListMembership:addFromPart';

test.describe('Shopping List Phase 3 entry points', () => {
  test('adds a part to a new concept list from the detail dialog', async ({ parts, shoppingLists, testData, toastHelper }) => {
    const seller = await testData.sellers.create({
      overrides: { name: testData.sellers.randomSellerName(), website: 'https://example-seller.com' },
    });
    const { part } = await testData.parts.create({
      overrides: { description: 'Phase 3 dialog part' },
    });

    await parts.gotoList();
    await parts.openCardByKey(part.key);
    await parts.expectDetailHeading(part.description);

    await parts.openAddToShoppingListDialog();
    const listName = testData.shoppingLists.randomName('Detail Concept');
    const listDescription = 'Concept list created from part detail dialog';

    await parts.setCreateNewConceptList(true);
    await parts.fillNewConceptList({ name: listName, description: listDescription });
    await parts.setNeededQuantity(3);
    await parts.selectSellerInDialog(seller.name);
    await parts.setMembershipNote('Ensure we stock extras for QA runs');

    const submitEvent = waitTestEvent<FormTestEvent>(parts.playwrightPage, 'form', event => event.formId === ADD_FORM_ID && event.phase === 'submit');
    const successEvent = waitTestEvent<FormTestEvent>(parts.playwrightPage, 'form', event => event.formId === ADD_FORM_ID && event.phase === 'success');

    await parts.submitAddToShoppingList();
    await submitEvent;
    await successEvent;

    await toastHelper.expectSuccessToast(/added part to concept list/i);
    await waitForListLoading(parts.playwrightPage, 'parts.detail.shoppingLists', 'ready');
    await expect(parts.addToShoppingListDialog).toBeHidden();

    const badge = parts.shoppingListBadgeByName(listName);
    await expect(badge).toBeVisible();
    await expect(badge.getByTestId('parts.detail.shopping-list.badge.icon')).toBeVisible();
    const badgeHref = await badge.getAttribute('href');
    expect(badgeHref).toBeTruthy();
    const listIdMatch = badgeHref?.match(/shopping-lists\/(\d+)/);
    expect(listIdMatch?.[1]).toBeDefined();
    const createdListId = Number(listIdMatch?.[1]);

    await Promise.all([
      shoppingLists.playwrightPage.waitForURL(new RegExp(`/shopping-lists/${createdListId}`)),
      badge.click(),
    ]);

    await shoppingLists.waitForConceptReady();
    const conceptRow = shoppingLists.conceptRowByPart(part.description);
    await expect(conceptRow).toBeVisible();
    await expect(conceptRow.getByTestId(/needed$/)).toHaveText('3');
    await expect(conceptRow.getByTestId(/note$/)).toContainText('Ensure we stock extras');
  });

  test('surfaces duplicate guard when adding to an existing concept list', async ({ parts, testData, toastHelper }) => {
    const { part } = await testData.parts.create({
      overrides: { description: 'Duplicate guard target' },
    });
    const list = await testData.shoppingLists.createWithLines({
      listOverrides: { name: testData.shoppingLists.randomName('Existing Concept') },
      lines: [{ partKey: part.key, needed: 2 }],
    });

    await parts.gotoList();
    await parts.openCardByKey(part.key);
    await parts.expectDetailHeading(part.description);

    await parts.openAddToShoppingListDialog();
    await parts.setCreateNewConceptList(false);
    await parts.selectConceptListById(list.id);

    await expectConsoleError(parts.playwrightPage, /Toast exception ApiError/i);

    await parts.submitAddToShoppingList();
    await toastHelper.waitForToastWithText(/failed to add part to shopping list/i);

    await expect(parts.detailShoppingListBadges).toHaveCount(1);
    await parts.closeAddToShoppingListDialog();
  });

  test('renders badges for concept and ready memberships on the detail page', async ({ parts, shoppingLists, testData, apiClient }) => {
    const { part } = await testData.parts.create({
      overrides: { description: 'Badge rendering part' },
    });

    const conceptList = await testData.shoppingLists.createWithLines({
      listOverrides: { name: testData.shoppingLists.randomName('Concept Badge') },
      lines: [{ partKey: part.key, needed: 4 }],
    });

    const readyList = await testData.shoppingLists.createWithLines({
      listOverrides: { name: testData.shoppingLists.randomName('Ready Badge') },
      lines: [{ partKey: part.key, needed: 1 }],
    });

    await apiClient.PUT('/api/shopping-lists/{list_id}/status', {
      params: { path: { list_id: readyList.id } },
      body: { status: 'ready' },
    });

    await parts.gotoList();
    await parts.openCardByKey(part.key);
    await parts.expectDetailHeading(part.description);
    await waitForListLoading(parts.playwrightPage, 'parts.detail.shoppingLists', 'ready');

    await expect(parts.detailShoppingListBadges).toHaveCount(2);
    await expect(parts.shoppingListBadgeByName(conceptList.name)).toContainText('Concept');
    await expect(parts.shoppingListBadgeByName(readyList.name)).toContainText('Ready');

    await Promise.all([
      shoppingLists.playwrightPage.waitForURL(new RegExp(`/shopping-lists/${conceptList.id}`)),
      parts.shoppingListBadgeByName(conceptList.name).click(),
    ]);
    await shoppingLists.waitForConceptReady();

    await parts.goto(`/parts/${part.key}`);
    await parts.expectDetailHeading(part.description);
    await waitForListLoading(parts.playwrightPage, 'parts.detail.shoppingLists', 'ready');
    await Promise.all([
      shoppingLists.playwrightPage.waitForURL(new RegExp(`/shopping-lists/${readyList.id}`)),
      parts.shoppingListBadgeByName(readyList.name).click(),
    ]);
    await shoppingLists.waitForReadyView();
  });

  test('shows list indicators on the parts list and hides done-only memberships', async ({ parts, testData, apiClient }) => {
    const { part: activePart } = await testData.parts.create({
      overrides: { description: 'Indicator active part' },
    });
    const { part: donePart } = await testData.parts.create({
      overrides: { description: 'Indicator done part' },
    });

    await testData.shoppingLists.createWithLines({
      listOverrides: { name: testData.shoppingLists.randomName('Indicator Concept') },
      lines: [{ partKey: activePart.key, needed: 2 }],
    });

    const doneList = await testData.shoppingLists.createWithLines({
      listOverrides: { name: testData.shoppingLists.randomName('Indicator Done') },
      lines: [{ partKey: donePart.key, needed: 1 }],
    });
    await apiClient.PUT('/api/shopping-lists/{list_id}/status', {
      params: { path: { list_id: doneList.id } },
      body: { status: 'ready' },
    });
    await apiClient.PUT('/api/shopping-lists/{list_id}/status', {
      params: { path: { list_id: doneList.id } },
      body: { status: 'done' },
    });

    await parts.gotoList();
    await parts.waitForCards();
    await waitForListLoading(parts.playwrightPage, 'parts.list.shoppingListIndicators', 'ready');

    const activeIndicator = parts.shoppingListIndicator(activePart.key);
    await expect(activeIndicator).toBeVisible();
    await activeIndicator.hover();
    const activeTooltip = parts.shoppingListIndicatorTooltip(activePart.key);
    await expect(activeTooltip).toBeVisible();
    await expect(activeTooltip).toContainText('Indicator Concept');

    await expect(parts.shoppingListIndicator(donePart.key)).toHaveCount(0);
  });
});
