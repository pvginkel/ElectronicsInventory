import { expect } from '@playwright/test';
import { test } from '../../support/fixtures';
import { expectConsoleError, waitTestEvent, waitForListLoading } from '../../support/helpers';
import type { FormTestEvent } from '@/types/test-events';

const overviewSummaryText = ({
  visible,
  total,
  tab,
  filtered = false,
}: {
  visible: number;
  total: number;
  tab: 'active' | 'completed';
  filtered?: boolean;
}) => {
  const noun = total === 1 ? 'list' : 'lists';
  const category = tab === 'active' ? 'active' : 'completed';
  if (filtered) {
    return `${visible} of ${total} ${category} ${noun} showing`;
  }
  return `${total} ${category} ${noun}`;
};
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
    await toastHelper.dismissToast({ all: true });
    await expect(shoppingLists.overviewCardByName(listName)).toHaveCount(0);
  });

  test('marks a ready list without ordered lines as done from the detail view', async ({ shoppingLists, testData, toastHelper }) => {
    const seller = await testData.sellers.create({ overrides: { name: testData.sellers.randomSellerName() } });
    const { part } = await testData.parts.create({ overrides: { description: 'Ready mark-done part' } });
    const listDetail = await testData.shoppingLists.createWithLines({
      listOverrides: { name: testData.shoppingLists.randomName('Ready Done Flow') },
      lines: [{ partKey: part.key, needed: 4, sellerId: seller.id }],
    });

    await testData.shoppingLists.markReady(listDetail.id);

    await shoppingLists.gotoReady(listDetail.id);

    const markDoneSubmit = waitTestEvent<FormTestEvent>(
      shoppingLists.playwrightPage,
      'form',
      event => event.formId === 'ShoppingListStatus:markDone' && event.phase === 'submit',
    );
    const markDoneSuccess = waitTestEvent<FormTestEvent>(
      shoppingLists.playwrightPage,
      'form',
      event => event.formId === 'ShoppingListStatus:markDone' && event.phase === 'success',
    );
    const listReadyAfterMark = waitForListLoading(
      shoppingLists.playwrightPage,
      'shoppingLists.list',
      'ready',
    );

    await shoppingLists.markListDoneFromReady();

    const [submitEvent, successEvent, readyEvent] = await Promise.all([
      markDoneSubmit,
      markDoneSuccess,
      listReadyAfterMark,
    ]);

    expect(submitEvent.metadata).toMatchObject({ status: 'done' });
    expect(successEvent.metadata).toMatchObject({ status: 'done' });
    expect(readyEvent.metadata).toMatchObject({ status: 'done', view: 'ready', filteredDiff: 0 });
    if (!Array.isArray(readyEvent.metadata?.groupTotals)) {
      throw new Error('Expected groupTotals metadata after marking list done');
    }
    for (const group of readyEvent.metadata.groupTotals) {
      expect(group.visibleTotals).toEqual(group.totals);
    }

    await toastHelper.expectSuccessToast(new RegExp(`Marked shopping list "${listDetail.name}" as Done`, 'i'));
    await toastHelper.dismissToast({ all: true });
    await expect(shoppingLists.readyRoot).toBeVisible();
    await expect(shoppingLists.readyMarkDoneButton).toHaveCount(0);
    await shoppingLists.expectStatus(/Completed/i);

    await shoppingLists.gotoOverview();
    const overviewFilters = await shoppingLists.waitForOverviewFiltersReady();
    const completedCount = Number(overviewFilters.metadata?.completedCount ?? 0);
    expect(completedCount).toBeGreaterThan(0);
  });

  test('marks a ready list with ordered lines as done and keeps rows visible', async ({ shoppingLists, testData, toastHelper }) => {
    const sellerPrimary = await testData.sellers.create({ overrides: { name: testData.sellers.randomSellerName() } });
    const sellerSecondary = await testData.sellers.create({ overrides: { name: testData.sellers.randomSellerName() } });
    const { part: orderedPart } = await testData.parts.create({ overrides: { description: 'Ordered retention part' } });
    const { part: freshPart } = await testData.parts.create({ overrides: { description: 'Fresh concept part' } });

    const listDetail = await testData.shoppingLists.createWithLines({
      listOverrides: { name: testData.shoppingLists.randomName('Ready Ordered Flow') },
      lines: [
        { partKey: orderedPart.key, needed: 3, sellerId: sellerPrimary.id },
        { partKey: freshPart.key, needed: 2, sellerId: sellerSecondary.id },
      ],
    });

    const orderedLine = listDetail.lines.find(line => line.part.key === orderedPart.key);
    if (!orderedLine) {
      throw new Error('Failed to resolve ordered line for mark-done test');
    }

    await testData.shoppingLists.markReady(listDetail.id);
    await testData.shoppingLists.orderLine(listDetail.id, orderedLine.id, 2);

    await shoppingLists.gotoReady(listDetail.id);
    await expect(shoppingLists.readyMarkDoneButton).toBeVisible();
    const primaryTotals = shoppingLists.readyGroupTotals(sellerPrimary.name);
    await expect(primaryTotals.needed).toHaveText('3');
    await expect(primaryTotals.ordered).toHaveText('2');
    await expect(primaryTotals.received).toHaveText('0');
    const secondaryTotals = shoppingLists.readyGroupTotals(sellerSecondary.name);
    await expect(secondaryTotals.needed).toHaveText('2');
    await expect(secondaryTotals.ordered).toHaveText('0');
    await expect(secondaryTotals.received).toHaveText('0');
    await expect(shoppingLists.readyGroupFilterNote(sellerPrimary.name)).toHaveCount(0);
    await expect(shoppingLists.readyGroupFilterNote(sellerSecondary.name)).toHaveCount(0);

    const markDoneSubmit = waitTestEvent<FormTestEvent>(
      shoppingLists.playwrightPage,
      'form',
      event => event.formId === 'ShoppingListStatus:markDone' && event.phase === 'submit',
    );
    const markDoneSuccess = waitTestEvent<FormTestEvent>(
      shoppingLists.playwrightPage,
      'form',
      event => event.formId === 'ShoppingListStatus:markDone' && event.phase === 'success',
    );
    const listReadyAfterMark = waitForListLoading(
      shoppingLists.playwrightPage,
      'shoppingLists.list',
      'ready',
    );

    await shoppingLists.markListDoneFromReady();

    const [submitEvent, successEvent, readyEvent] = await Promise.all([
      markDoneSubmit,
      markDoneSuccess,
      listReadyAfterMark,
    ]);

    expect(submitEvent.metadata).toMatchObject({ status: 'done' });
    expect(successEvent.metadata).toMatchObject({ status: 'done' });
    expect(readyEvent.metadata).toMatchObject({ status: 'done', view: 'ready', filteredDiff: 0 });
    if (!Array.isArray(readyEvent.metadata?.groupTotals)) {
      throw new Error('Expected groupTotals metadata after marking list done with ordered lines');
    }
    for (const group of readyEvent.metadata.groupTotals) {
      expect(group.visibleTotals).toEqual(group.totals);
    }

    await toastHelper.expectSuccessToast(new RegExp(`Marked shopping list "${listDetail.name}" as Done`, 'i'));
    await toastHelper.dismissToast({ all: true });

    await expect(shoppingLists.readyRoot).toBeVisible();
    await expect(shoppingLists.readyMarkDoneButton).toHaveCount(0);
    await expect(shoppingLists.readyLineRow(orderedPart.description)).toBeVisible();
    await expect(shoppingLists.readyLineStatusCell(orderedPart.description)).toContainText(/ordered/i);
    await expect(shoppingLists.readyLineRow(freshPart.description)).toBeVisible();
    await expect(shoppingLists.readyGroupFilterNote(sellerPrimary.name)).toHaveCount(0);
    await expect(shoppingLists.readyGroupFilterNote(sellerSecondary.name)).toHaveCount(0);
  });

  test('completes a ready list via detail and exposes it on the completed tab', async ({ shoppingLists, testData, toastHelper }) => {
    await shoppingLists.gotoOverview();
    const baselineFilters = await shoppingLists.waitForOverviewFiltersReady();
    const baselineActiveCount = Number(baselineFilters.metadata?.activeCount ?? 0);
    const baselineCompletedCount = Number(baselineFilters.metadata?.completedCount ?? 0);

    const { part } = await testData.parts.create({ overrides: { description: 'Overview Archive Part' } });
    const listName = testData.shoppingLists.randomName('Overview Archive');
    const listDetail = await testData.shoppingLists.createWithLines({
      listOverrides: { name: listName },
      lines: [{ partKey: part.key, needed: 1 }],
    });
    await testData.shoppingLists.markReady(listDetail.id);

    await shoppingLists.gotoOverview();
    const initialFilters = await shoppingLists.waitForOverviewFiltersReady();
    expect(initialFilters.metadata).toMatchObject({
      activeCount: baselineActiveCount + 1,
      completedCount: baselineCompletedCount,
      activeTab: 'active',
    });
    expect(initialFilters.metadata?.visibleCount).toBe(baselineActiveCount + 1);
    await shoppingLists.expectOverviewSummary(
      overviewSummaryText({
        visible: baselineActiveCount + 1,
        total: baselineActiveCount + 1,
        tab: 'active',
      }),
    );
    await shoppingLists.expectOverviewTabCounts({
      active: baselineActiveCount + 1,
      completed: baselineCompletedCount,
    });

    await shoppingLists.overviewCardByName(listName).click();
    await shoppingLists.waitForReadyView();

    const markDoneSubmit = waitTestEvent<FormTestEvent>(
      shoppingLists.playwrightPage,
      'form',
      event => event.formId === 'ShoppingListStatus:markDone' && event.phase === 'submit',
    );
    const markDoneSuccess = waitTestEvent<FormTestEvent>(
      shoppingLists.playwrightPage,
      'form',
      event => event.formId === 'ShoppingListStatus:markDone' && event.phase === 'success',
    );
    const listReadyAfterMark = waitForListLoading(
      shoppingLists.playwrightPage,
      'shoppingLists.list',
      'ready',
    );

    await shoppingLists.markListDoneFromReady();
    const [submitEvent, successEvent, readyEvent] = await Promise.all([
      markDoneSubmit,
      markDoneSuccess,
      listReadyAfterMark,
    ]);

    expect(submitEvent.metadata).toMatchObject({ status: 'done' });
    expect(successEvent.metadata).toMatchObject({ status: 'done' });
    expect(readyEvent.metadata).toMatchObject({ status: 'done', view: 'ready' });

    await toastHelper.expectSuccessToast(new RegExp(`Marked shopping list "${listName}" as Done`, 'i'));
    await toastHelper.dismissToast({ all: true });

    await shoppingLists.gotoOverview();
    const afterCompletionFilters = await shoppingLists.waitForOverviewFiltersReady();
    expect(afterCompletionFilters.metadata).toMatchObject({
      activeCount: baselineActiveCount,
      completedCount: baselineCompletedCount + 1,
      activeTab: 'active',
    });
    expect(afterCompletionFilters.metadata?.visibleCount).toBe(baselineActiveCount);
    await shoppingLists.expectOverviewTabCounts({
      active: baselineActiveCount,
      completed: baselineCompletedCount + 1,
    });

    const completedTabEvent = await shoppingLists.selectOverviewTab('completed');
    expect(completedTabEvent.metadata).toMatchObject({
      activeCount: baselineActiveCount,
      completedCount: baselineCompletedCount + 1,
      activeTab: 'completed',
    });
    expect(completedTabEvent.metadata?.visibleCount).toBe(baselineCompletedCount + 1);
    await shoppingLists.expectOverviewSummary(
      overviewSummaryText({
        visible: baselineCompletedCount + 1,
        total: baselineCompletedCount + 1,
        tab: 'completed',
      }),
    );

    const completedCard = shoppingLists.overviewCardByName(listName, 'completed');
    await expect(completedCard).toBeVisible();
  });


  test('keeps the completed tab active after breadcrumb navigation', async ({ shoppingLists, testData }) => {
    const { part } = await testData.parts.create({ overrides: { description: 'Completed breadcrumb part' } });
    const listName = testData.shoppingLists.randomName('Completed Breadcrumb');
    const listDetail = await testData.shoppingLists.createWithLines({
      listOverrides: { name: listName },
      lines: [{ partKey: part.key, needed: 2 }],
    });
    await testData.shoppingLists.markReady(listDetail.id);
    await testData.shoppingLists.markDone(listDetail.id);

    await shoppingLists.gotoOverview();
    const initialFilters = await shoppingLists.waitForOverviewFiltersReady();
    expect(Number(initialFilters.metadata?.completedCount ?? 0)).toBeGreaterThan(0);

    await shoppingLists.selectOverviewTab('completed');
    const completedCard = shoppingLists.overviewCardByName(listName, 'completed');
    await expect(completedCard).toBeVisible();

    await completedCard.click();
    await shoppingLists.waitForReadyView();
    await shoppingLists.expectStatus(/Completed/i);

    const breadcrumbLink = shoppingLists.playwrightPage
      .getByTestId('shopping-lists.concept.header.breadcrumb')
      .getByRole('link', { name: /shopping lists/i });
    await breadcrumbLink.click();

    const filtersAfterReturn = await shoppingLists.waitForOverviewFiltersReady();
    expect(filtersAfterReturn.metadata).toMatchObject({ activeTab: 'completed' });
    expect(filtersAfterReturn.metadata?.visibleCount).toBeGreaterThan(0);
    await shoppingLists.expectOverviewTab('completed');
    const completedVisible = Number(filtersAfterReturn.metadata?.visibleCount ?? 0);
    const completedTotal = await shoppingLists.overviewTabCount('completed');
    await shoppingLists.expectOverviewSummary(
      overviewSummaryText({
        visible: completedVisible,
        total: completedTotal,
        tab: 'completed',
      }),
    );
    await expect(shoppingLists.overviewCardByName(listName, 'completed')).toBeVisible();
  });

  test('filters segmented tabs by search without losing totals', async ({ shoppingLists, testData }) => {
    const searchTerm = 'Segmented Search';
    const activeName = testData.shoppingLists.randomName(`${searchTerm} Active`);
    const completedName = testData.shoppingLists.randomName(`${searchTerm} Completed`);
    const backgroundActive = testData.shoppingLists.randomName('Segmented Background Active');
    const backgroundCompleted = testData.shoppingLists.randomName('Segmented Background Completed');

    await testData.shoppingLists.create({ name: backgroundActive });
    const { part: backgroundPart } = await testData.parts.create({ overrides: { description: 'Segmented background part' } });
    const backgroundCompletedList = await testData.shoppingLists.createWithLines({
      listOverrides: { name: backgroundCompleted },
      lines: [{ partKey: backgroundPart.key, needed: 1 }],
    });
    await testData.shoppingLists.markReady(backgroundCompletedList.id);
    await testData.shoppingLists.markDone(backgroundCompletedList.id);

    await testData.shoppingLists.create({ name: activeName });
    const { part: searchPart } = await testData.parts.create({ overrides: { description: 'Segmented search part' } });
    const completedDetail = await testData.shoppingLists.createWithLines({
      listOverrides: { name: completedName },
      lines: [{ partKey: searchPart.key, needed: 2 }],
    });
    await testData.shoppingLists.markReady(completedDetail.id);
    await testData.shoppingLists.markDone(completedDetail.id);

    await shoppingLists.gotoOverview();
    await shoppingLists.waitForOverviewFiltersReady();
    const totalActive = await shoppingLists.overviewTabCount('active');
    const totalCompleted = await shoppingLists.overviewTabCount('completed');

    const filteredEventPromise = shoppingLists.waitForOverviewFiltersReady();
    await shoppingLists.overviewSearch.fill(searchTerm);
    const filteredEvent = await filteredEventPromise;
    expect(filteredEvent.metadata).toMatchObject({ activeTab: 'active' });
    expect(filteredEvent.metadata?.visibleCount).toBe(1);
    await expect(shoppingLists.overviewSummary).toContainText(
      overviewSummaryText({
        visible: 1,
        total: totalActive,
        tab: 'active',
        filtered: true,
      }),
    );
    const filteredTotal =
      Number(filteredEvent.metadata?.activeCount ?? 0) +
      Number(filteredEvent.metadata?.completedCount ?? 0);
    await expect(shoppingLists.overviewSummary).toContainText(`${filteredTotal} filtered`);
    await expect(shoppingLists.overviewCardByName(activeName)).toBeVisible();
    await shoppingLists.expectOverviewTabCounts({ active: totalActive, completed: totalCompleted });

    const completedEvent = await shoppingLists.selectOverviewTab('completed');
    expect(completedEvent.metadata).toMatchObject({ activeTab: 'completed' });
    expect(completedEvent.metadata?.visibleCount).toBe(1);
    await expect(shoppingLists.overviewCardByName(completedName, 'completed')).toBeVisible();
    await expect(shoppingLists.overviewSummary).toContainText(
      overviewSummaryText({
        visible: 1,
        total: totalCompleted,
        tab: 'completed',
        filtered: true,
      }),
    );
    await expect(shoppingLists.overviewSummary).toContainText(`${filteredTotal} filtered`);
    await expect(shoppingLists.overviewSearch).toHaveValue(searchTerm);
    await shoppingLists.expectOverviewTabCounts({ active: totalActive, completed: totalCompleted });
  });

  test('supports keyboard navigation on segmented tabs', async ({ shoppingLists, testData }) => {
    const activeName = testData.shoppingLists.randomName('Keyboard Active');
    const completedName = testData.shoppingLists.randomName('Keyboard Completed');
    await testData.shoppingLists.create({ name: activeName });

    const { part } = await testData.parts.create({ overrides: { description: 'Keyboard Completed Part' } });
    const completedDetail = await testData.shoppingLists.createWithLines({
      listOverrides: { name: completedName },
      lines: [{ partKey: part.key, needed: 1 }],
    });
    await testData.shoppingLists.markReady(completedDetail.id);
    await testData.shoppingLists.markDone(completedDetail.id);

    await shoppingLists.gotoOverview();
    await shoppingLists.waitForOverviewFiltersReady();

    await shoppingLists.overviewTab('active').focus();
    await expect(shoppingLists.overviewTab('active')).toBeFocused();
    await expect(shoppingLists.overviewTab('active')).toHaveAttribute('aria-selected', 'true');

    await shoppingLists.playwrightPage.keyboard.press('ArrowRight');
    await expect(shoppingLists.overviewTab('completed')).toBeFocused();
    await expect(shoppingLists.overviewTab('completed')).toHaveAttribute('aria-selected', 'false');

    const completedEventPromise = shoppingLists.waitForOverviewFiltersReady();
    await shoppingLists.playwrightPage.keyboard.press('Space');
    const completedEvent = await completedEventPromise;
    expect(completedEvent.metadata).toMatchObject({ activeTab: 'completed' });
    expect(completedEvent.metadata?.visibleCount).toBeGreaterThan(0);
    await expect(shoppingLists.overviewTab('completed')).toHaveAttribute('aria-selected', 'true');
    const completedTotal = await shoppingLists.overviewTabCount('completed');
    await shoppingLists.expectOverviewSummary(
      overviewSummaryText({
        visible: Number(completedEvent.metadata?.visibleCount ?? 0),
        total: completedTotal,
        tab: 'completed',
      }),
    );

    await shoppingLists.playwrightPage.keyboard.press('ArrowLeft');
    await expect(shoppingLists.overviewTab('active')).toBeFocused();
    await expect(shoppingLists.overviewTab('active')).toHaveAttribute('aria-selected', 'false');

    const activeEventPromise = shoppingLists.waitForOverviewFiltersReady();
    await shoppingLists.playwrightPage.keyboard.press('Enter');
    const activeEvent = await activeEventPromise;
    expect(activeEvent.metadata).toMatchObject({ activeTab: 'active' });
    expect(activeEvent.metadata?.visibleCount).toBeGreaterThan(0);
    await expect(shoppingLists.overviewTab('active')).toHaveAttribute('aria-selected', 'true');
    const activeTotal = await shoppingLists.overviewTabCount('active');
    await shoppingLists.expectOverviewSummary(
      overviewSummaryText({
        visible: Number(activeEvent.metadata?.visibleCount ?? 0),
        total: activeTotal,
        tab: 'active',
      }),
    );
  });

  test('keeps overflowed segmented tabs visible during keyboard navigation', async ({ shoppingLists, testData }) => {
    const activeName = testData.shoppingLists.randomName('Overflow Active');
    const completedName = testData.shoppingLists.randomName('Overflow Completed');
    await testData.shoppingLists.create({ name: activeName });

    const { part } = await testData.parts.create({ overrides: { description: 'Overflow Completed Part' } });
    const completedDetail = await testData.shoppingLists.createWithLines({
      listOverrides: { name: completedName },
      lines: [{ partKey: part.key, needed: 1 }],
    });
    await testData.shoppingLists.markReady(completedDetail.id);
    await testData.shoppingLists.markDone(completedDetail.id);

    await shoppingLists.gotoOverview();
    await shoppingLists.waitForOverviewFiltersReady();

    await shoppingLists.setOverviewTabsWidth(160);
    await shoppingLists.resetOverviewTabsScroll();

    await shoppingLists.overviewTab('active').focus();
    await expect(shoppingLists.overviewTab('active')).toBeFocused();
    const initialScroll = await shoppingLists.getOverviewTabsScroll();

    await shoppingLists.playwrightPage.keyboard.press('ArrowRight');
    await expect(shoppingLists.overviewTab('completed')).toBeFocused();

    await expect
      .poll(async () => shoppingLists.getOverviewTabsScroll())
      .toBeGreaterThan(initialScroll);
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
    await toastHelper.dismissToast({ all: true });
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

    const orderedCells = shoppingLists.conceptTable.locator('[data-testid$=".ordered"]');
    const receivedCells = shoppingLists.conceptTable.locator('[data-testid$=".received"]');
    await expect(orderedCells).toHaveText(['0', '0']);
    await expect(receivedCells).toHaveText(['0', '0']);
  });

  test('keeps sorting deterministic across casing and surfaces chip affordances', async ({ shoppingLists, testData }) => {
    const sellerA = await testData.sellers.create({ overrides: { name: 'Duplicate Seller A' } });
    const sellerB = await testData.sellers.create({ overrides: { name: 'Duplicate Seller B' } });
    const { part: alphaPart } = await testData.parts.create({ overrides: { description: 'Alpha Sort Component' } });
    const { part: bravoUpper } = await testData.parts.create({ overrides: { description: 'Bravo Module' } });
    const { part: bravoLower } = await testData.parts.create({ overrides: { description: 'bravo module' } });

    const listDetail = await testData.shoppingLists.createWithLines({
      listOverrides: { name: testData.shoppingLists.randomName('Sorting Polish') },
      lines: [
        { partKey: alphaPart.key, needed: 1, sellerId: sellerA.id },
        { partKey: bravoUpper.key, needed: 2, sellerId: sellerB.id },
        { partKey: bravoLower.key, needed: 3 },
      ],
    });

    const alphaLine = listDetail.lines.find(line => line.part.key === alphaPart.key);
    const bravoUpperLine = listDetail.lines.find(line => line.part.key === bravoUpper.key);
    if (!alphaLine || !bravoUpperLine) {
      throw new Error('Failed to resolve line ids for sorting polish test');
    }

    const conceptEvent = await shoppingLists.gotoConcept(listDetail.id);
    expect(conceptEvent.metadata?.sortKey).toBe('description');

    const conceptRows = shoppingLists.conceptTable.locator('tbody tr');
    await expect(conceptRows.nth(0).getByTestId(/\.part$/)).toHaveText(alphaPart.description);
    await expect(conceptRows.nth(1).getByTestId(/\.part$/)).toHaveText(bravoUpper.description);
    await expect(conceptRows.nth(2).getByTestId(/\.part$/)).toHaveText(bravoLower.description);

    await expect(shoppingLists.conceptSellerBadge(alphaPart.description)).toHaveText('Duplicate Seller A');
    await expect(shoppingLists.conceptStatusBadge(alphaPart.description)).toHaveText(/New/i);

    await shoppingLists.playwrightPage.getByTestId('shopping-lists.concept.sort.button').click();
    await shoppingLists.playwrightPage.getByTestId('shopping-lists.concept.sort.mpn').click();
    await shoppingLists.playwrightPage.getByTestId('shopping-lists.concept.sort.button').click();
    await shoppingLists.playwrightPage.getByTestId('shopping-lists.concept.sort.description').click();

    await expect(conceptRows.nth(0).getByTestId(/\.part$/)).toHaveText(alphaPart.description);
    await expect(conceptRows.nth(1).getByTestId(/\.part$/)).toHaveText(bravoUpper.description);
    await expect(conceptRows.nth(2).getByTestId(/\.part$/)).toHaveText(bravoLower.description);

    await testData.shoppingLists.markReady(listDetail.id);
    await testData.shoppingLists.orderLine(listDetail.id, alphaLine.id, 1);
    await testData.shoppingLists.orderLine(listDetail.id, bravoUpperLine.id, 1);
    await testData.shoppingLists.completeLine(listDetail.id, bravoUpperLine.id, 'Quantity mismatch for regression coverage');

    const readyEvent = await shoppingLists.gotoReady(listDetail.id);
    expect(readyEvent.metadata?.sortKey).toBe('description');

    const groupTotals = Array.isArray(readyEvent.metadata?.groupTotals) ? readyEvent.metadata?.groupTotals : [];
    const eventGroupKeys = groupTotals.map(group => group.groupKey);
    const uiGroupKeys = await shoppingLists.readyGroupKeys();
    expect(uiGroupKeys).toEqual(eventGroupKeys);
    expect(eventGroupKeys).toEqual([...eventGroupKeys].sort((a, b) => a.localeCompare(b)));

    await expect(shoppingLists.readyGroupBySeller(sellerA.name)).toBeVisible();
    await expect(shoppingLists.readyGroupBySeller(sellerB.name)).toBeVisible();
    await expect(shoppingLists.readyLineStatusBadge(alphaPart.description)).toHaveText(/Ordered/i);
    await expect(shoppingLists.readyLineStatusBadge(bravoUpper.description)).toHaveText(/Received/i);

    const mismatchTooltip = await shoppingLists.readyReceivedTooltip(bravoUpper.description);
    expect(mismatchTooltip).toMatch(/ordered/i);
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
    const markReadySubmit = waitTestEvent<FormTestEvent>(
      shoppingLists.playwrightPage,
      'form',
      event => event.formId === 'ShoppingListStatus:markReady' && event.phase === 'submit',
    );
    const markReadySuccess = waitTestEvent<FormTestEvent>(
      shoppingLists.playwrightPage,
      'form',
      event => event.formId === 'ShoppingListStatus:markReady' && event.phase === 'success',
    );
    await shoppingLists.markReady();
    const [submitEvent, successEvent] = await Promise.all([markReadySubmit, markReadySuccess]);
    expect(submitEvent.metadata).toMatchObject({ status: 'concept', lineCount: 1 });
    expect(successEvent.metadata).toMatchObject({ status: 'concept', lineCount: 1 });
    await toastHelper.expectSuccessToast(/marked ready/i);
    await toastHelper.dismissToast({ all: true });
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
    await toastHelper.dismissToast({ all: true });
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
    await toastHelper.dismissToast({ all: true });

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
    await toastHelper.dismissToast({ all: true });
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
    await toastHelper.dismissToast({ all: true });

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
    await toastHelper.dismissToast({ all: true });

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
    await toastHelper.dismissToast({ all: true });
    await shoppingLists.waitForReadyView();

    // Reassign partTwo to the secondary seller while lines are still new
    await shoppingLists.editReadyLine(partTwo.description, { sellerName: sellerSecondary.name });
    await toastHelper.expectSuccessToast(/updated line/i);
    await toastHelper.dismissToast({ all: true });
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
    await toastHelper.dismissToast({ all: true });

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
    await toastHelper.dismissToast({ all: true });
    await expect(shoppingLists.conceptRoot).toBeVisible();
    await expect(shoppingLists.playwrightPage.getByTestId('shopping-lists.concept.mark-ready.button')).toBeVisible();
  });

  test('receives partial quantity with location allocations', async ({ shoppingLists, testData, testEvents, toastHelper }) => {
    const seller = await testData.sellers.create({ overrides: { name: testData.sellers.randomSellerName() } });
    const { part } = await testData.parts.create({ overrides: { description: 'Receive flow part' } });
    const list = await testData.shoppingLists.createWithLines({
      listOverrides: { name: testData.shoppingLists.randomName('Receive Flow') },
      lines: [{ partKey: part.key, needed: 5, sellerId: seller.id }],
    });
    const lineId = list.lines[0].id;

    const existingBox = await testData.boxes.create({ overrides: { description: 'Existing allocation box' } });
    const newBox = await testData.boxes.create({ overrides: { description: 'New allocation box' } });

    await shoppingLists.gotoConcept(list.id);
    await expectConsoleError(shoppingLists.playwrightPage, /Outdated Optimize Dep/);
    await shoppingLists.markReady();
    await toastHelper.expectSuccessToast(/marked ready/i);
    await toastHelper.dismissToast({ all: true });
    await shoppingLists.waitForReadyView();

    await shoppingLists.markLineOrdered(part.description, 5);

    await shoppingLists.openUpdateStock(part.description);
    await shoppingLists.setReceiveQuantity(3);
    await shoppingLists.setAllocationRow(0, { box: existingBox.box_no, location: 1, quantity: 1 });
    await shoppingLists.addAllocationRow();
    await shoppingLists.setAllocationRow(1, { box: newBox.box_no, location: 2, quantity: 2 });

    await testEvents.clearEvents();
    const receiveSubmit = testEvents.waitForEvent(event =>
      event.kind === 'form' &&
      (event as FormTestEvent).formId === `ShoppingListLineReceive:line:${lineId}` &&
      (event as FormTestEvent).phase === 'submit'
    );
    const receiveSuccess = testEvents.waitForEvent(event =>
      event.kind === 'form' &&
      (event as FormTestEvent).formId === `ShoppingListLineReceive:line:${lineId}` &&
      (event as FormTestEvent).phase === 'success'
    );

    await shoppingLists.submitReceiveForm('save');
    await Promise.all([receiveSubmit, receiveSuccess]).catch(async (error) => {
      const formEvents = await testEvents.getEventsByKind('form');
      console.error('Captured form events:', JSON.stringify(formEvents, null, 2));
      throw error;
    });

    await toastHelper.expectSuccessToast(new RegExp(`Received 3 for ${part.description}`, 'i'));
    await toastHelper.dismissToast({ all: true });
    await expect(shoppingLists.updateStockDialog).toBeHidden();

    await expect(shoppingLists.readyLineReceivedCell(part.description)).toContainText('3');

    const refreshedDetail = await testData.shoppingLists.getDetail(list.id);
    const updatedLine = refreshedDetail.lines.find(line => line.id === lineId);
    expect(updatedLine?.received).toBe(3);
    expect(updatedLine?.status).toBe('ordered');
  });

  test('processes Save & next flow across ordered lines', async ({ shoppingLists, testData, testEvents, toastHelper }) => {
    const seller = await testData.sellers.create({ overrides: { name: testData.sellers.randomSellerName() } });
    const { part: firstPart } = await testData.parts.create({ overrides: { description: 'Save Next Part A' } });
    const { part: secondPart } = await testData.parts.create({ overrides: { description: 'Save Next Part B' } });
    const list = await testData.shoppingLists.createWithLines({
      listOverrides: { name: testData.shoppingLists.randomName('Save Next Flow') },
      lines: [
        { partKey: firstPart.key, needed: 4, sellerId: seller.id },
        { partKey: secondPart.key, needed: 2, sellerId: seller.id },
      ],
    });
    const firstLineId = list.lines[0].id;
    const secondLineId = list.lines[1].id;

    const boxA = await testData.boxes.create({ overrides: { description: 'Save next box A' } });
    const boxB = await testData.boxes.create({ overrides: { description: 'Save next box B' } });

    await shoppingLists.gotoConcept(list.id);
    await expectConsoleError(shoppingLists.playwrightPage, /Outdated Optimize Dep/);
    await shoppingLists.markReady();
    await toastHelper.expectSuccessToast(/marked ready/i);
    await toastHelper.dismissToast({ all: true });
    await shoppingLists.waitForReadyView();

    await shoppingLists.markLineOrdered(firstPart.description, 4);
    await shoppingLists.markLineOrdered(secondPart.description, 2);

    await testEvents.clearEvents();
    await shoppingLists.openUpdateStock(firstPart.description);
    await testEvents.waitForEvent(event =>
      event.kind === 'form' &&
      (event as FormTestEvent).formId === `ShoppingListLineReceive:line:${firstLineId}` &&
      (event as FormTestEvent).phase === 'open'
    );

    await shoppingLists.setReceiveQuantity(2);
    await shoppingLists.setAllocationRow(0, { box: boxA.box_no, location: 3, quantity: 1 });
    await shoppingLists.addAllocationRow();
    await shoppingLists.setAllocationRow(1, { box: boxB.box_no, location: 4, quantity: 1 });

    await testEvents.clearEvents();
    const firstSubmit = testEvents.waitForEvent(event =>
      event.kind === 'form' &&
      (event as FormTestEvent).formId === `ShoppingListLineReceive:line:${firstLineId}` &&
      (event as FormTestEvent).phase === 'submit'
    );
    const firstSuccess = testEvents.waitForEvent(event =>
      event.kind === 'form' &&
      (event as FormTestEvent).formId === `ShoppingListLineReceive:line:${firstLineId}` &&
      (event as FormTestEvent).phase === 'success'
    );

    await shoppingLists.submitReceiveForm('saveAndNext');
    await Promise.all([firstSubmit, firstSuccess]).catch(async (error) => {
      const formEvents = await testEvents.getEventsByKind('form');
      console.error('Captured form events:', JSON.stringify(formEvents, null, 2));
      throw error;
    });

    await toastHelper.expectSuccessToast(new RegExp(`Received 2 for ${firstPart.description}`, 'i'));
    await toastHelper.dismissToast({ all: true });

    await testEvents.waitForEvent(event =>
      event.kind === 'form' &&
      (event as FormTestEvent).formId === `ShoppingListLineReceive:line:${secondLineId}` &&
      (event as FormTestEvent).phase === 'open'
    );

    await shoppingLists.setReceiveQuantity(2);
    await shoppingLists.setAllocationRow(0, { box: boxA.box_no, location: 5, quantity: 2 });

    await testEvents.clearEvents();
    const secondSubmit = testEvents.waitForEvent(event =>
      event.kind === 'form' &&
      (event as FormTestEvent).formId === `ShoppingListLineReceive:line:${secondLineId}` &&
      (event as FormTestEvent).phase === 'submit'
    );
    const secondSuccess = testEvents.waitForEvent(event =>
      event.kind === 'form' &&
      (event as FormTestEvent).formId === `ShoppingListLineReceive:line:${secondLineId}` &&
      (event as FormTestEvent).phase === 'success'
    );

    await shoppingLists.submitReceiveForm('save');
    await Promise.all([secondSubmit, secondSuccess]).catch(async (error) => {
      const formEvents = await testEvents.getEventsByKind('form');
      console.error('Captured form events:', JSON.stringify(formEvents, null, 2));
      throw error;
    });

    await toastHelper.expectSuccessToast(new RegExp(`Received 2 for ${secondPart.description}`, 'i'));
    await toastHelper.dismissToast({ all: true });
    await expect(shoppingLists.updateStockDialog).toBeHidden();

    await expect(shoppingLists.readyLineReceivedCell(firstPart.description)).toContainText('2');
    await expect(shoppingLists.readyLineReceivedCell(secondPart.description)).toContainText('2');

    const finalDetail = await testData.shoppingLists.getDetail(list.id);
    const firstLine = finalDetail.lines.find(line => line.id === firstLineId);
    const secondLine = finalDetail.lines.find(line => line.id === secondLineId);
    expect(firstLine?.received).toBe(2);
    expect(secondLine?.received).toBe(2);
  });

  test('marks ordered line done with mismatch confirmation', async ({ shoppingLists, testData, testEvents, toastHelper }) => {
    const seller = await testData.sellers.create({ overrides: { name: testData.sellers.randomSellerName() } });
    const { part } = await testData.parts.create({ overrides: { description: 'Mismatch flow part' } });
    const list = await testData.shoppingLists.createWithLines({
      listOverrides: { name: testData.shoppingLists.randomName('Mismatch Flow') },
      lines: [{ partKey: part.key, needed: 3, sellerId: seller.id }],
    });
    const lineId = list.lines[0].id;

    const box = await testData.boxes.create({ overrides: { description: 'Mismatch box' } });

    await shoppingLists.gotoConcept(list.id);
    await expectConsoleError(shoppingLists.playwrightPage, /Outdated Optimize Dep/);
    await shoppingLists.markReady();
    await toastHelper.expectSuccessToast(/marked ready/i);
    await toastHelper.dismissToast({ all: true });
    await shoppingLists.waitForReadyView();

    await shoppingLists.markLineOrdered(part.description, 3);

    await shoppingLists.openUpdateStock(part.description);
    await shoppingLists.setReceiveQuantity(1);
    await shoppingLists.setAllocationRow(0, { box: box.box_no, location: 6, quantity: 1 });

    await testEvents.clearEvents();
    const receiveSubmit = testEvents.waitForEvent(event =>
      event.kind === 'form' &&
      (event as FormTestEvent).formId === `ShoppingListLineReceive:line:${lineId}` &&
      (event as FormTestEvent).phase === 'submit'
    );
    const receiveSuccess = testEvents.waitForEvent(event =>
      event.kind === 'form' &&
      (event as FormTestEvent).formId === `ShoppingListLineReceive:line:${lineId}` &&
      (event as FormTestEvent).phase === 'success'
    );
    await shoppingLists.submitReceiveForm('save');
    await Promise.all([receiveSubmit, receiveSuccess]).catch(async (error) => {
      const formEvents = await testEvents.getEventsByKind('form');
      console.error('Captured form events:', JSON.stringify(formEvents, null, 2));
      throw error;
    });
    await toastHelper.expectSuccessToast(new RegExp(`Received 1 for ${part.description}`, 'i'));
    await toastHelper.dismissToast({ all: true });

    await shoppingLists.openUpdateStock(part.description);

    await testEvents.clearEvents();
    const completeSubmit = testEvents.waitForEvent(event =>
      event.kind === 'form' &&
      (event as FormTestEvent).formId === `ShoppingListLineComplete:line:${lineId}` &&
      (event as FormTestEvent).phase === 'submit'
    );
    const completeSuccess = testEvents.waitForEvent(event =>
      event.kind === 'form' &&
      (event as FormTestEvent).formId === `ShoppingListLineComplete:line:${lineId}` &&
      (event as FormTestEvent).phase === 'success'
    );

    await shoppingLists.markUpdateStockDone();
    await shoppingLists.confirmMismatch('Supplier short shipped remaining quantity');

    await Promise.all([completeSubmit, completeSuccess]).catch(async (error) => {
      const formEvents = await testEvents.getEventsByKind('form');
      console.error('Captured form events:', JSON.stringify(formEvents, null, 2));
      throw error;
    });

    await toastHelper.expectSuccessToast(new RegExp(`Marked ${part.description} done`, 'i'));
    await toastHelper.dismissToast({ all: true });
    await expect(shoppingLists.updateStockDialog).toBeHidden();

    await expect(shoppingLists.readyLineStatusCell(part.description)).toContainText(/received/i);
    await expect(shoppingLists.readyLineRow(part.description).getByTestId(/update-stock$/)).toHaveCount(0);
    await expect(shoppingLists.readyLineRow(part.description).getByTestId(/completion-note$/)).toBeVisible();

    const detail = await testData.shoppingLists.getDetail(list.id);
    const completedLine = detail.lines.find(line => line.id === lineId);
    expect(completedLine?.status).toBe('done');
    expect(completedLine?.completion_mismatch).toBe(true);
    expect(completedLine?.completion_note).toContain('Supplier short shipped');
  });
});
