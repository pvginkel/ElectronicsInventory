/**
 * Kanban Board E2E Tests
 *
 * Tests board rendering, inline editing, seller column lifecycle,
 * skeleton column creation, and column actions (assign remaining, remove seller).
 */

import { expect } from '@playwright/test';
import { test } from '../../support/fixtures';
import { waitForListLoading, waitForUiState, waitTestEvent } from '../../support/helpers';
import type { FormTestEvent } from '@/lib/test/test-events';

test.describe('Kanban Board Rendering', () => {
  test('renders unassigned column with cards and skeleton column', async ({ shoppingLists, testData }) => {
    const { part: partA } = await testData.parts.create({ overrides: { description: 'Kanban Render Part A' } });
    const { part: partB } = await testData.parts.create({ overrides: { description: 'Kanban Render Part B' } });
    const { part: partC } = await testData.parts.create({ overrides: { description: 'Kanban Render Part C' } });

    const list = await testData.shoppingLists.createWithLines({
      listOverrides: { name: testData.shoppingLists.randomName('Kanban Render') },
      lines: [
        { partKey: partA.key, needed: 2 },
        { partKey: partB.key, needed: 3 },
        { partKey: partC.key, needed: 1 },
      ],
    });

    await shoppingLists.gotoKanban(list.id);

    // Board should be visible
    await expect(shoppingLists.kanbanBoard).toBeVisible();

    // Unassigned column should have all 3 cards
    const unassignedCards = shoppingLists.kanbanColumnCards('ungrouped');
    await expect(unassignedCards).toHaveCount(3);

    // Skeleton column should be visible (not a completed list)
    await expect(shoppingLists.kanbanSkeletonColumn).toBeVisible();
  });

  test('renders seller columns alongside unassigned column', async ({ shoppingLists, testData }) => {
    const sellerA = await testData.sellers.create({ overrides: { name: testData.sellers.randomSellerName() } });
    const sellerB = await testData.sellers.create({ overrides: { name: testData.sellers.randomSellerName() } });
    const { part: partA } = await testData.parts.create({ overrides: { description: 'Multi Seller Part A' } });
    const { part: partB } = await testData.parts.create({ overrides: { description: 'Multi Seller Part B' } });
    const { part: partC } = await testData.parts.create({ overrides: { description: 'Multi Seller Part C' } });

    const list = await testData.shoppingLists.createWithLines({
      listOverrides: { name: testData.shoppingLists.randomName('Multi Seller Kanban') },
      lines: [
        { partKey: partA.key, needed: 2, sellerId: sellerA.id },
        { partKey: partB.key, needed: 3, sellerId: sellerB.id },
        { partKey: partC.key, needed: 1 },
      ],
    });

    // Create seller group columns explicitly
    await testData.shoppingLists.createSellerGroup(list.id, sellerA.id);
    await testData.shoppingLists.createSellerGroup(list.id, sellerB.id);

    await shoppingLists.gotoKanban(list.id);
    await expect(shoppingLists.kanbanBoard).toBeVisible();

    // Should have 3 columns (unassigned + 2 sellers) plus skeleton
    const keys = await shoppingLists.kanbanColumnKeys();
    expect(keys).toHaveLength(3);
    expect(keys).toContain('ungrouped');

    // Each seller column should have one card
    const sellerAColumn = shoppingLists.kanbanColumnBySeller(sellerA.name);
    await expect(sellerAColumn).toBeVisible();
    await expect(sellerAColumn).toContainText('Multi Seller Part A');

    const sellerBColumn = shoppingLists.kanbanColumnBySeller(sellerB.name);
    await expect(sellerBColumn).toBeVisible();
    await expect(sellerBColumn).toContainText('Multi Seller Part B');

    // Unassigned should have 1 card
    const unassignedCards = shoppingLists.kanbanColumnCards('ungrouped');
    await expect(unassignedCards).toHaveCount(1);
  });

  test('completed list shows read-only Kanban board without action buttons', async ({ shoppingLists, testData }) => {
    const seller = await testData.sellers.create({ overrides: { name: testData.sellers.randomSellerName() } });
    const { part } = await testData.parts.create({ overrides: { description: 'Completed Kanban Part' } });

    const list = await testData.shoppingLists.createWithLines({
      listOverrides: { name: testData.shoppingLists.randomName('Completed Kanban') },
      lines: [{ partKey: part.key, needed: 1, sellerId: seller.id }],
    });

    await testData.shoppingLists.createSellerGroup(list.id, seller.id);
    await testData.shoppingLists.markDone(list.id);

    await shoppingLists.gotoKanban(list.id);
    await expect(shoppingLists.kanbanBoard).toBeVisible();

    // Skeleton column should NOT be visible on completed lists
    await expect(shoppingLists.kanbanSkeletonColumn).toHaveCount(0);

    // Add-part button should not be visible
    const addPartButton = shoppingLists.playwrightPage.locator('[data-testid$=".add-part"]');
    await expect(addPartButton).toHaveCount(0);
  });
});

test.describe('Kanban Inline Editing', () => {
  test('edits needed field on an unassigned card', async ({ shoppingLists, testData }) => {
    const { part } = await testData.parts.create({ overrides: { description: 'Inline Edit Needed Part' } });

    const list = await testData.shoppingLists.createWithLines({
      listOverrides: { name: testData.shoppingLists.randomName('Inline Edit Needed') },
      lines: [{ partKey: part.key, needed: 3 }],
    });

    const lineId = list.lines[0].id;

    await shoppingLists.gotoKanban(list.id);

    // Click on the needed field to activate inline editing
    const neededField = shoppingLists.playwrightPage.getByTestId(`shopping-lists.kanban.card.${lineId}.field.needed`);
    await expect(neededField).toBeVisible();
    await neededField.click();

    // Type new value and confirm
    const input = neededField.locator('input');
    await expect(input).toBeVisible();
    await input.fill('7');

    // Set up form event listener before pressing Enter
    const formSuccess = waitTestEvent<FormTestEvent>(
      shoppingLists.playwrightPage,
      'form',
      event => event.formId === 'KanbanCard:needed' && event.phase === 'success',
    );

    await input.press('Enter');
    await formSuccess;

    // Wait for data to refresh
    await waitForListLoading(shoppingLists.playwrightPage, 'shoppingLists.kanban', 'ready');

    // Verify the value updated
    await expect(neededField).toContainText('7');

    // Verify backend state
    const detail = await testData.shoppingLists.getDetail(list.id);
    const updatedLine = detail.lines.find(l => l.id === lineId);
    expect(updatedLine?.needed).toBe(7);
  });

  test('edits ordered field on a seller column card', async ({ shoppingLists, testData }) => {
    const seller = await testData.sellers.create({ overrides: { name: testData.sellers.randomSellerName() } });
    const { part } = await testData.parts.create({ overrides: { description: 'Inline Edit Ordered Part' } });

    const list = await testData.shoppingLists.createWithLines({
      listOverrides: { name: testData.shoppingLists.randomName('Inline Edit Ordered') },
      lines: [{ partKey: part.key, needed: 5, sellerId: seller.id }],
    });

    await testData.shoppingLists.createSellerGroup(list.id, seller.id);
    const lineId = list.lines[0].id;

    await shoppingLists.gotoKanban(list.id);

    // Click on the ordered field (should show em dash for 0)
    const orderedField = shoppingLists.playwrightPage.getByTestId(`shopping-lists.kanban.card.${lineId}.field.ordered`);
    await expect(orderedField).toBeVisible();
    await orderedField.click();

    const input = orderedField.locator('input');
    await expect(input).toBeVisible();
    await input.fill('3');

    const formSuccess = waitTestEvent<FormTestEvent>(
      shoppingLists.playwrightPage,
      'form',
      event => event.formId === 'KanbanCard:ordered' && event.phase === 'success',
    );

    await input.press('Enter');
    await formSuccess;
    await waitForListLoading(shoppingLists.playwrightPage, 'shoppingLists.kanban', 'ready');

    // Verify backend state
    const detail = await testData.shoppingLists.getDetail(list.id);
    const updatedLine = detail.lines.find(l => l.id === lineId);
    expect(updatedLine?.ordered).toBe(3);
  });

  test('escape key reverts inline edit without saving', async ({ shoppingLists, testData }) => {
    const { part } = await testData.parts.create({ overrides: { description: 'Escape Revert Part' } });

    const list = await testData.shoppingLists.createWithLines({
      listOverrides: { name: testData.shoppingLists.randomName('Escape Revert') },
      lines: [{ partKey: part.key, needed: 4 }],
    });

    const lineId = list.lines[0].id;

    await shoppingLists.gotoKanban(list.id);

    const neededField = shoppingLists.playwrightPage.getByTestId(`shopping-lists.kanban.card.${lineId}.field.needed`);
    await neededField.click();

    const input = neededField.locator('input');
    await input.fill('99');
    await input.press('Escape');

    // Original value should still be displayed
    await expect(neededField).toContainText('4');

    // Verify backend unchanged
    const detail = await testData.shoppingLists.getDetail(list.id);
    const line = detail.lines.find(l => l.id === lineId);
    expect(line?.needed).toBe(4);
  });
});

test.describe('Kanban Seller Column Lifecycle', () => {
  test('completes a seller group when all lines have ordered > 0', async ({ shoppingLists, testData, toastHelper }) => {
    const seller = await testData.sellers.create({ overrides: { name: testData.sellers.randomSellerName() } });
    const { part: partA } = await testData.parts.create({ overrides: { description: 'Complete Group Part A' } });
    const { part: partB } = await testData.parts.create({ overrides: { description: 'Complete Group Part B' } });

    const list = await testData.shoppingLists.createWithLines({
      listOverrides: { name: testData.shoppingLists.randomName('Complete Group') },
      lines: [
        { partKey: partA.key, needed: 3, sellerId: seller.id },
        { partKey: partB.key, needed: 2, sellerId: seller.id },
      ],
    });

    await testData.shoppingLists.createSellerGroup(list.id, seller.id);

    // Set ordered quantities via API so the complete button is enabled
    const lineA = list.lines.find(l => l.part.key === partA.key)!;
    const lineB = list.lines.find(l => l.part.key === partB.key)!;
    await testData.shoppingLists.updateLine(lineA.id, { needed: 3, ordered: 3, sellerId: seller.id });
    await testData.shoppingLists.updateLine(lineB.id, { needed: 2, ordered: 2, sellerId: seller.id });

    await shoppingLists.gotoKanban(list.id);

    // Set up instrumentation listener
    const completeSuccess = waitForUiState(
      shoppingLists.playwrightPage,
      'kanban.column.complete',
      'success',
    );

    // Click the complete button on the seller column
    await shoppingLists.kanbanCompleteGroup(String(seller.id));

    await completeSuccess;
    await toastHelper.expectSuccessToast(/ordered/i);
    await toastHelper.dismissToast({ all: true });

    // Wait for list to reload
    await waitForListLoading(shoppingLists.playwrightPage, 'shoppingLists.kanban', 'ready');

    // Verify backend: seller group status should be "ordered"
    const detail = await testData.shoppingLists.getDetail(list.id);
    const group = detail.seller_groups?.find(g => g.seller_id === seller.id);
    expect(group?.status).toBe('ordered');
  });

  test('reopens an ordered seller group with no received items', async ({ shoppingLists, testData, toastHelper }) => {
    const seller = await testData.sellers.create({ overrides: { name: testData.sellers.randomSellerName() } });
    const { part } = await testData.parts.create({ overrides: { description: 'Reopen Group Part' } });

    const list = await testData.shoppingLists.createWithLines({
      listOverrides: { name: testData.shoppingLists.randomName('Reopen Group') },
      lines: [{ partKey: part.key, needed: 5, sellerId: seller.id }],
    });

    await testData.shoppingLists.createSellerGroup(list.id, seller.id);

    // Set ordered and mark group as ordered via API
    const line = list.lines[0];
    await testData.shoppingLists.updateLine(line.id, { needed: 5, ordered: 5, sellerId: seller.id });
    await testData.shoppingLists.orderSellerGroup(list.id, seller.id);

    await shoppingLists.gotoKanban(list.id);

    // Open the overflow menu and click "Reopen"
    await shoppingLists.kanbanOpenColumnMenu(String(seller.id));

    const reopenSuccess = waitForUiState(
      shoppingLists.playwrightPage,
      'kanban.column.complete',
      'success',
    );

    await shoppingLists.playwrightPage.getByRole('menuitem', { name: /reopen/i }).click();
    await reopenSuccess;
    await toastHelper.expectSuccessToast(/reopened/i);
    await toastHelper.dismissToast({ all: true });

    await waitForListLoading(shoppingLists.playwrightPage, 'shoppingLists.kanban', 'ready');

    // Verify backend
    const detail = await testData.shoppingLists.getDetail(list.id);
    const group = detail.seller_groups?.find(g => g.seller_id === seller.id);
    expect(group?.status).toBe('active');
  });
});

test.describe('Kanban Skeleton Column', () => {
  test('creates a new seller column from skeleton', async ({ shoppingLists, testData, toastHelper }) => {
    const seller = await testData.sellers.create({ overrides: { name: testData.sellers.randomSellerName() } });
    const { part } = await testData.parts.create({ overrides: { description: 'Skeleton Column Part' } });

    const list = await testData.shoppingLists.createWithLines({
      listOverrides: { name: testData.shoppingLists.randomName('Skeleton Column') },
      lines: [{ partKey: part.key, needed: 1 }],
    });

    await shoppingLists.gotoKanban(list.id);

    // Skeleton column should be visible
    await expect(shoppingLists.kanbanSkeletonColumn).toBeVisible();

    // Click the skeleton column button to open seller selector
    const addButton = shoppingLists.kanbanSkeletonColumn.getByRole('button');
    await addButton.click();

    // Set up instrumentation listener
    const createSuccess = waitForUiState(
      shoppingLists.playwrightPage,
      'kanban.column.create',
      'success',
    );

    // Select a seller from the dropdown
    const sellerInput = shoppingLists.kanbanSkeletonColumn.locator('input');
    await sellerInput.fill(seller.name);
    await shoppingLists.playwrightPage.getByRole('option', { name: new RegExp(seller.name, 'i') }).first().click();

    await createSuccess;
    await toastHelper.expectSuccessToast(/seller column added/i);
    await toastHelper.dismissToast({ all: true });

    await waitForListLoading(shoppingLists.playwrightPage, 'shoppingLists.kanban', 'ready');

    // Verify new column appears
    const sellerColumn = shoppingLists.kanbanColumnBySeller(seller.name);
    await expect(sellerColumn).toBeVisible();

    // Verify backend
    const detail = await testData.shoppingLists.getDetail(list.id);
    const group = detail.seller_groups?.find(g => g.seller_id === seller.id);
    expect(group).toBeDefined();
  });
});

test.describe('Kanban Column Actions', () => {
  test('assigns remaining unassigned lines to a seller column', async ({ shoppingLists, testData, toastHelper }) => {
    const seller = await testData.sellers.create({ overrides: { name: testData.sellers.randomSellerName() } });
    const { part: partA } = await testData.parts.create({ overrides: { description: 'Assign Remaining Part A' } });
    const { part: partB } = await testData.parts.create({ overrides: { description: 'Assign Remaining Part B' } });
    const { part: partC } = await testData.parts.create({ overrides: { description: 'Assign Remaining Part C' } });

    const list = await testData.shoppingLists.createWithLines({
      listOverrides: { name: testData.shoppingLists.randomName('Assign Remaining') },
      lines: [
        { partKey: partA.key, needed: 1 },
        { partKey: partB.key, needed: 2 },
        { partKey: partC.key, needed: 3 },
      ],
    });

    // Create a seller group column
    await testData.shoppingLists.createSellerGroup(list.id, seller.id);

    await shoppingLists.gotoKanban(list.id);

    // Unassigned column should have 3 cards
    const unassignedCards = shoppingLists.kanbanColumnCards('ungrouped');
    await expect(unassignedCards).toHaveCount(3);

    // Open the seller column overflow menu
    await shoppingLists.kanbanOpenColumnMenu(String(seller.id));

    const assignSuccess = waitForUiState(
      shoppingLists.playwrightPage,
      'kanban.assignRemaining',
      'success',
    );

    // Click "Assign remaining"
    await shoppingLists.playwrightPage.getByRole('menuitem', { name: /assign remaining/i }).click();

    await assignSuccess;
    await toastHelper.expectSuccessToast(/assigned.*line/i);
    await toastHelper.dismissToast({ all: true });

    await waitForListLoading(shoppingLists.playwrightPage, 'shoppingLists.kanban', 'ready');

    // Unassigned column should now be empty
    await expect(shoppingLists.kanbanColumnCards('ungrouped')).toHaveCount(0);

    // Verify backend
    const detail = await testData.shoppingLists.getDetail(list.id);
    const unassigned = detail.lines.filter(l => l.seller_id === null);
    expect(unassigned).toHaveLength(0);
    const assigned = detail.lines.filter(l => l.seller_id === seller.id);
    expect(assigned).toHaveLength(3);
  });

  test('removes an active seller column and moves cards to unassigned', async ({ shoppingLists, testData, toastHelper }) => {
    const seller = await testData.sellers.create({ overrides: { name: testData.sellers.randomSellerName() } });
    const { part: partA } = await testData.parts.create({ overrides: { description: 'Remove Column Part A' } });
    const { part: partB } = await testData.parts.create({ overrides: { description: 'Remove Column Part B' } });

    const list = await testData.shoppingLists.createWithLines({
      listOverrides: { name: testData.shoppingLists.randomName('Remove Column') },
      lines: [
        { partKey: partA.key, needed: 1, sellerId: seller.id },
        { partKey: partB.key, needed: 2, sellerId: seller.id },
      ],
    });

    await testData.shoppingLists.createSellerGroup(list.id, seller.id);

    await shoppingLists.gotoKanban(list.id);

    // Seller column should be visible
    const sellerColumn = shoppingLists.kanbanColumnBySeller(seller.name);
    await expect(sellerColumn).toBeVisible();

    // Open overflow menu and click "Remove seller"
    await shoppingLists.kanbanOpenColumnMenu(String(seller.id));
    await shoppingLists.playwrightPage.getByRole('menuitem', { name: /remove seller/i }).click();

    // Confirm the dialog
    await expect(shoppingLists.kanbanDeleteGroupDialog).toBeVisible();
    await shoppingLists.kanbanDeleteGroupDialog.getByRole('button', { name: /remove seller/i }).click();

    await toastHelper.expectSuccessToast(/removed/i);
    await toastHelper.dismissToast({ all: true });

    await waitForListLoading(shoppingLists.playwrightPage, 'shoppingLists.kanban', 'ready');

    // Seller column should be gone
    await expect(sellerColumn).toHaveCount(0);

    // Cards should now be in the unassigned column
    await expect(shoppingLists.kanbanColumnCards('ungrouped')).toHaveCount(2);

    // Verify backend
    const detail = await testData.shoppingLists.getDetail(list.id);
    const unassigned = detail.lines.filter(l => l.seller_id === null);
    expect(unassigned).toHaveLength(2);
  });
});

test.describe('Kanban Card Actions', () => {
  test('deletes a card from unassigned column with undo', async ({ shoppingLists, testData }) => {
    const { part } = await testData.parts.create({ overrides: { description: 'Delete Card Part' } });

    const list = await testData.shoppingLists.createWithLines({
      listOverrides: { name: testData.shoppingLists.randomName('Delete Card') },
      lines: [{ partKey: part.key, needed: 2 }],
    });

    const lineId = list.lines[0].id;

    await shoppingLists.gotoKanban(list.id);

    // Card should be visible
    const card = shoppingLists.kanbanCard(lineId);
    await expect(card).toBeVisible();

    // Set up deletion event listeners
    const deleteSuccess = waitTestEvent<FormTestEvent>(
      shoppingLists.playwrightPage,
      'form',
      event => event.formId === 'ShoppingListLine:delete' && event.phase === 'success',
    );

    // Click delete
    await shoppingLists.kanbanDeleteCard(lineId);
    await deleteSuccess;

    await waitForListLoading(shoppingLists.playwrightPage, 'shoppingLists.kanban', 'ready');

    // Card should be removed
    await expect(card).toHaveCount(0);

    // Verify undo button appears
    const undoButton = shoppingLists.playwrightPage.getByTestId(`shopping-lists.detail.toast.undo.${lineId}`);
    await expect(undoButton).toBeVisible();
  });
});
