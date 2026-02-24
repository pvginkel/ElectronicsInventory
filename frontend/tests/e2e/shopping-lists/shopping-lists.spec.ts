import { expect } from '@playwright/test';
import { test } from '../../support/fixtures';
import { waitTestEvent, waitForListLoading } from '../../support/helpers';
import type { FormTestEvent } from '@/lib/test/test-events';

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
  const totalText = total.toLocaleString();
  if (filtered) {
    return `${visible.toLocaleString()} of ${totalText} ${category} ${noun} showing`;
  }
  return `${totalText} ${category} ${noun}`;
};
test.describe('Shopping Lists', () => {
  test('creates, opens, and deletes a concept list from the overview', async ({ shoppingLists, testData, toastHelper }) => {
    await shoppingLists.gotoOverview();

    const listName = testData.shoppingLists.randomName('UI Concept List');
    const listDescription = 'Overview CRUD smoke description';

    await shoppingLists.createConceptList({ name: listName, description: listDescription });

    await waitTestEvent<FormTestEvent>(shoppingLists.playwrightPage, 'form', event => event.formId === 'ShoppingListCreate:concept' && event.phase === 'submit');
    await waitTestEvent<FormTestEvent>(shoppingLists.playwrightPage, 'form', event => event.formId === 'ShoppingListCreate:concept' && event.phase === 'success');

    await shoppingLists.waitForKanbanReady();
    await expect(shoppingLists.detailLayout).toBeVisible();

    // Return to overview and ensure the list is present.
    await shoppingLists.gotoOverview();
    await expect(shoppingLists.overviewCardByName(listName)).toBeVisible();

    await shoppingLists.deleteConceptListByName(listName);
    await toastHelper.expectSuccessToast(new RegExp(`Deleted shopping list "${listName}"`, 'i'));
    await toastHelper.dismissToast({ all: true });
    await expect(shoppingLists.overviewCardByName(listName)).toHaveCount(0);
  });

  test('keeps the overview header sticky while content scrolls', async ({ shoppingLists, testData }) => {
    const createCount = 15;
    for (let index = 0; index < createCount; index += 1) {
      await testData.shoppingLists.create({
        name: testData.shoppingLists.randomName(`Sticky Header ${index + 1}`),
      });
    }

    await shoppingLists.gotoOverview();
    await shoppingLists.waitForOverviewFiltersReady();

    const position = await shoppingLists.overviewHeader.evaluate((element) =>
      window.getComputedStyle(element).position,
    );
    expect(position).toBe('sticky');

    const headerBefore = await shoppingLists.getOverviewHeaderRect();
    await shoppingLists.scrollOverviewContent('bottom');

    await expect
      .poll(async () => shoppingLists.overviewContentScrollTop())
      .toBeGreaterThan(0);

    const headerAfter = await shoppingLists.getOverviewHeaderRect();
    expect(Math.abs(headerAfter.top - headerBefore.top)).toBeLessThan(2);
    expect(Math.abs(headerAfter.height - headerBefore.height)).toBeLessThan(2);

    await expect(shoppingLists.overviewCreateButton).toBeVisible();
    await expect(shoppingLists.overviewCreateButton).toBeEnabled();
  });

  test('completes a list via API and exposes it on the completed tab', async ({ shoppingLists, testData }) => {
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
    // Mark done via API -- the mark-done UI is not available on the Kanban board yet
    await testData.shoppingLists.markDone(listDetail.id);

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
    await testData.shoppingLists.markDone(listDetail.id);

    await shoppingLists.gotoOverview();
    const initialFilters = await shoppingLists.waitForOverviewFiltersReady();
    expect(Number(initialFilters.metadata?.completedCount ?? 0)).toBeGreaterThan(0);

    await shoppingLists.selectOverviewTab('completed');
    const completedCard = shoppingLists.overviewCardByName(listName, 'completed');
    await expect(completedCard).toBeVisible();

    await completedCard.click();
    await shoppingLists.waitForKanbanReady();
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

  test('debounced search updates URL and filters lists', async ({ page, shoppingLists, testData }) => {
    const searchTerm = 'Debounce Test';
    const matchingName = testData.shoppingLists.randomName(`${searchTerm} List`);
    const nonMatchingName = testData.shoppingLists.randomName('Other List');

    await testData.shoppingLists.create({ name: matchingName });
    await testData.shoppingLists.create({ name: nonMatchingName });

    await shoppingLists.gotoOverview();
    await shoppingLists.waitForOverviewFiltersReady();

    // Fill search input - the component will debounce and wait for completion via instrumentation
    await shoppingLists.overviewSearch.fill(searchTerm);
    await shoppingLists.waitForOverviewFiltersReady();

    // Verify URL updated with search parameter (accept both + and %20 encoding for spaces)
    await expect(page).toHaveURL(/search=.+/);

    // Verify filtered results
    await expect(shoppingLists.overviewCardByName(matchingName)).toBeVisible();
    await expect(shoppingLists.overviewCardByName(nonMatchingName)).toBeHidden();

    // Clear search - should update URL (search param removed or empty)
    await shoppingLists.overviewSearch.clear();
    await shoppingLists.waitForOverviewFiltersReady();
    await expect(page).toHaveURL(/^(?!.*search=.+)|search=$/);
    await expect(shoppingLists.overviewCardByName(nonMatchingName)).toBeVisible();
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
    await testData.shoppingLists.markDone(backgroundCompletedList.id);

    await testData.shoppingLists.create({ name: activeName });
    const { part: searchPart } = await testData.parts.create({ overrides: { description: 'Segmented search part' } });
    const completedDetail = await testData.shoppingLists.createWithLines({
      listOverrides: { name: completedName },
      lines: [{ partKey: searchPart.key, needed: 2 }],
    });
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
    expect(filteredEvent.metadata?.totalInView).toBe(totalActive);
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
    expect(filteredEvent.metadata?.filteredCount).toBe(filteredTotal);
    await expect(shoppingLists.overviewSummary).toContainText(`${filteredTotal} filtered`);
    await expect(shoppingLists.overviewCardByName(activeName)).toBeVisible();
    await shoppingLists.expectOverviewTabCounts({ active: totalActive, completed: totalCompleted });

    const headerBeforeToggle = await shoppingLists.getOverviewHeaderRect();
    const completedEvent = await shoppingLists.selectOverviewTab('completed');
    expect(completedEvent.metadata).toMatchObject({ activeTab: 'completed' });
    expect(completedEvent.metadata?.visibleCount).toBe(1);
    expect(completedEvent.metadata?.totalInView).toBe(totalCompleted);
    const headerAfterToggle = await shoppingLists.getOverviewHeaderRect();
    expect(Math.abs(headerAfterToggle.height - headerBeforeToggle.height)).toBeLessThan(2);
    expect(Math.abs(headerAfterToggle.top - headerBeforeToggle.top)).toBeLessThan(2);
    await expect(shoppingLists.overviewCardByName(completedName, 'completed')).toBeVisible();
    await expect(shoppingLists.overviewSummary).toContainText(
      overviewSummaryText({
        visible: 1,
        total: totalCompleted,
        tab: 'completed',
        filtered: true,
      }),
    );
    expect(completedEvent.metadata?.filteredCount).toBe(filteredTotal);
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

  test('receives partial quantity via Kanban card receive button', async ({ shoppingLists, testData, testEvents, toastHelper }) => {
    const seller = await testData.sellers.create({ overrides: { name: testData.sellers.randomSellerName() } });
    const { part } = await testData.parts.create({ overrides: { description: 'Receive flow part' } });
    const list = await testData.shoppingLists.createWithLines({
      listOverrides: { name: testData.shoppingLists.randomName('Receive Flow') },
      lines: [{ partKey: part.key, needed: 5, sellerId: seller.id }],
    });
    const lineId = list.lines[0].id;

    // Mark ordered via API so the card shows the receive button.
    // The seller group must be in "ordered" status for the column to enter receiving mode.
    await testData.shoppingLists.updateLine(lineId, { needed: 5, ordered: 5, sellerId: seller.id });
    await testData.shoppingLists.createSellerGroup(list.id, seller.id);
    await testData.shoppingLists.orderSellerGroup(list.id, seller.id);

    const existingBox = await testData.boxes.create({ overrides: { description: 'Existing allocation box' } });
    const newBox = await testData.boxes.create({ overrides: { description: 'New allocation box' } });

    await shoppingLists.gotoKanban(list.id);

    // Click the receive button on the Kanban card
    const boxesReady = waitForListLoading(
      shoppingLists.playwrightPage,
      'shoppingLists.receive.locations',
      'ready',
    );

    await shoppingLists.kanbanReceiveCard(lineId);
    await expect(shoppingLists.updateStockDialog).toBeVisible();
    await expect(shoppingLists.updateStockDialog.getByTestId('shopping-lists.ready.update-stock.field.receive')).toHaveCount(0);

    const boxesEvent = await boxesReady;
    expect(boxesEvent.metadata).toMatchObject({
      allocationCount: 0,
      receiveQuantity: 0,
    });

    await shoppingLists.setNewAllocationRow(0, { box: existingBox.box_no, location: 1, receive: 1 });
    await shoppingLists.addAllocationRow();
    await shoppingLists.setNewAllocationRow(1, { box: newBox.box_no, location: 2, receive: 2 });

    await expect(
      shoppingLists.updateStockDialog.locator('[data-testid^="shopping-lists.ready.update-stock.row."][data-allocation-type="new"]'),
    ).toHaveCount(2);

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

    await shoppingLists.submitReceiveForm();
    let receiveEvents: [FormTestEvent, FormTestEvent];
    try {
      receiveEvents = await Promise.all([receiveSubmit, receiveSuccess]) as [FormTestEvent, FormTestEvent];
    } catch (error) {
      const formEvents = await testEvents.getEventsByKind('form');
      console.error('Captured form events:', JSON.stringify(formEvents, null, 2));
      throw error;
    }

    const [receiveSubmitEvent, receiveSuccessEvent] = receiveEvents;
    expect(receiveSubmitEvent.metadata).toMatchObject({ receiveQuantity: 3, allocationCount: 2 });
    expect(receiveSuccessEvent.metadata).toMatchObject({ receiveQuantity: 3, allocationCount: 2 });

    await toastHelper.expectSuccessToast(new RegExp(`Received 3 for ${part.description}`, 'i'));
    await toastHelper.dismissToast({ all: true });
    await expect(shoppingLists.updateStockDialog).toBeHidden();

    const refreshedDetail = await testData.shoppingLists.getDetail(list.id);
    const updatedLine = refreshedDetail.lines.find(line => line.id === lineId);
    expect(updatedLine?.received).toBe(3);
    expect(updatedLine?.status).toBe('ordered');
  });

  test('marks ordered line done with mismatch confirmation via Kanban card', async ({ shoppingLists, testData, testEvents, toastHelper }) => {
    const seller = await testData.sellers.create({ overrides: { name: testData.sellers.randomSellerName() } });
    const { part } = await testData.parts.create({ overrides: { description: 'Mismatch flow part' } });
    const list = await testData.shoppingLists.createWithLines({
      listOverrides: { name: testData.shoppingLists.randomName('Mismatch Flow') },
      lines: [{ partKey: part.key, needed: 3, sellerId: seller.id }],
    });
    const lineId = list.lines[0].id;

    // Mark ordered via API. The seller group must be in "ordered" status for receiving mode.
    await testData.shoppingLists.updateLine(lineId, { needed: 3, ordered: 3, sellerId: seller.id });
    await testData.shoppingLists.createSellerGroup(list.id, seller.id);
    await testData.shoppingLists.orderSellerGroup(list.id, seller.id);

    const box = await testData.boxes.create({ overrides: { description: 'Mismatch box' } });

    await shoppingLists.gotoKanban(list.id);

    const mismatchBoxesReady = waitForListLoading(
      shoppingLists.playwrightPage,
      'shoppingLists.receive.locations',
      'ready',
    );
    await shoppingLists.kanbanReceiveCard(lineId);
    const primaryBoxesEvent = await mismatchBoxesReady;
    expect(primaryBoxesEvent.metadata).toMatchObject({ allocationCount: 0, receiveQuantity: 0 });

    const saveButton = shoppingLists.updateStockDialog.getByTestId('shopping-lists.ready.update-stock.submit');
    await expect(saveButton).toBeDisabled();

    // Fill allocation data - received quantity (1) is less than ordered quantity (3), so mismatch dialog should appear
    await shoppingLists.setNewAllocationRow(0, { box: box.box_no, location: 6, receive: 1 });
    await expect(saveButton).toBeEnabled();

    // Wait for both receive and complete form events since Complete Item does both operations
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

    // Click Complete Item which should save stock, then show mismatch dialog
    await shoppingLists.markUpdateStockDone();

    // Wait for receive submit event (this happens before mismatch dialog appears)
    const receiveSubmitEvent = await receiveSubmit as FormTestEvent;
    expect(receiveSubmitEvent.metadata).toMatchObject({ receiveQuantity: 1, allocationCount: 1 });

    // Now confirm the mismatch (dialog should be visible now)
    await shoppingLists.confirmMismatch('Supplier short shipped remaining quantity');

    // Wait for all success events after mismatch is confirmed
    let finalEvents: [FormTestEvent, FormTestEvent, FormTestEvent];
    try {
      finalEvents = await Promise.all([receiveSuccess, completeSubmit, completeSuccess]) as [FormTestEvent, FormTestEvent, FormTestEvent];
    } catch (error) {
      const formEvents = await testEvents.getEventsByKind('form');
      console.error('Captured form events:', JSON.stringify(formEvents, null, 2));
      throw error;
    }

    const [receiveSuccessEvent] = finalEvents;
    expect(receiveSuccessEvent.metadata).toMatchObject({ receiveQuantity: 1, allocationCount: 1 });

    await toastHelper.expectSuccessToast(new RegExp(`Marked ${part.description} done`, 'i'));
    await toastHelper.dismissToast({ all: true });
    await expect(shoppingLists.updateStockDialog).toBeHidden();

    const detail = await testData.shoppingLists.getDetail(list.id);
    const completedLine = detail.lines.find(line => line.id === lineId);
    expect(completedLine?.status).toBe('done');
    expect(completedLine?.completion_mismatch).toBe(true);
    expect(completedLine?.completion_note).toContain('Supplier short shipped');
  });

  test('shopping list cards include animation classes', async ({ shoppingLists, testData }) => {
    const list = await testData.shoppingLists.create({
      name: testData.shoppingLists.randomName('Animation Test List'),
    });

    await shoppingLists.gotoOverview();
    const card = shoppingLists.overviewCardByName(list.name);
    await expect(card).toBeVisible();

    // Verify that the card includes the animation classes
    const classList = await card.getAttribute('class');
    expect(classList).toContain('transition-all');
    expect(classList).toContain('duration-200');
    expect(classList).toMatch(/hover:shadow-md/);
    expect(classList).toMatch(/hover:scale-\[1\.02\]/);
    expect(classList).toMatch(/hover:border-primary\/50/);
    expect(classList).toMatch(/active:scale-\[0\.98\]/);
  });
});
