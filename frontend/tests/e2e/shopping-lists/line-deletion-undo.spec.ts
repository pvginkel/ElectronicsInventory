/**
 * Shopping List Line Deletion Undo Tests (Kanban Board)
 *
 * Tests the undo functionality for shopping list line deletion on the
 * Kanban board. Deletion is immediate (no confirmation dialog) with an
 * undo toast following the kit archive undo pattern.
 */

import { test, expect } from '../../support/fixtures';
import { waitForListLoading, waitTestEvent } from '../../support/helpers';
import type { FormTestEvent, ToastTestEvent } from '@/lib/test/test-events';
import type { components } from '../../../src/lib/api/generated/types';

type ShoppingListResponseSchema = components['schemas']['ShoppingListResponseSchema.46f0cf6'];
type ShoppingListLineResponseSchema = components['schemas']['ShoppingListLineResponseSchema.d9ccce0'];

test.describe('Shopping List Line Deletion Undo', () => {
  test('removes card and undoes deletion', async ({ shoppingLists, testData, apiClient }) => {
    const { part } = await testData.parts.create({
      overrides: { description: 'Undo Test Capacitor' },
    });
    const list = await testData.shoppingLists.createWithLines({
      listOverrides: { name: 'Line Undo List' },
      lines: [{ partKey: part.key, needed: 50, note: 'Urgent order' }],
    });
    const lineId = list.lines[0].id;

    await shoppingLists.gotoKanban(list.id);

    // Verify card is visible before deletion
    const card = shoppingLists.kanbanCard(lineId);
    await expect(card).toBeVisible();

    // Setup event listeners for deletion
    const deleteSubmit = waitTestEvent<FormTestEvent>(shoppingLists.playwrightPage, 'form', (event) =>
      event.formId === 'ShoppingListLine:delete' && event.phase === 'submit'
    );
    const deleteSuccess = waitTestEvent<FormTestEvent>(shoppingLists.playwrightPage, 'form', (event) =>
      event.formId === 'ShoppingListLine:delete' && event.phase === 'success'
    );
    const deleteToast = waitTestEvent<ToastTestEvent>(shoppingLists.playwrightPage, 'toast', (event) =>
      event.message.includes('Removed part from shopping list') && event.action === 'undo'
    );

    // Delete via Kanban card trash button
    await shoppingLists.kanbanDeleteCard(lineId);

    // Wait for deletion to complete
    await deleteSubmit;
    await deleteSuccess;
    await deleteToast;
    await waitForListLoading(shoppingLists.playwrightPage, 'shoppingLists.kanban', 'ready');

    // Verify card removed from UI
    await expect(card).toHaveCount(0);

    // Verify backend deletion
    let backendDetail = await apiClient.apiRequest<ShoppingListResponseSchema>(() =>
      apiClient.GET('/api/shopping-lists/{list_id}', {
        params: { path: { list_id: list.id } },
      })
    );
    expect(backendDetail.lines?.find((l: ShoppingListLineResponseSchema) => l.id === lineId)).toBeUndefined();

    // Setup event listeners for undo BEFORE clicking undo
    const undoSubmit = waitTestEvent<FormTestEvent>(shoppingLists.playwrightPage, 'form', (event) =>
      event.formId === 'ShoppingListLine:restore' && event.phase === 'submit' && event.metadata?.undo === true
    );
    const undoSuccess = waitTestEvent<FormTestEvent>(shoppingLists.playwrightPage, 'form', (event) =>
      event.formId === 'ShoppingListLine:restore' && event.phase === 'success' && event.metadata?.undo === true
    );
    const undoToast = waitTestEvent<ToastTestEvent>(shoppingLists.playwrightPage, 'toast', (event) =>
      event.message.includes('Restored line') && !event.action
    );

    // Click undo button
    const undoButton = shoppingLists.playwrightPage.getByTestId(`shopping-lists.detail.toast.undo.${lineId}`);
    await expect(undoButton).toBeVisible();
    await undoButton.click();

    // Wait for undo to complete
    await undoSubmit;
    await undoSuccess;
    await undoToast;
    await waitForListLoading(shoppingLists.playwrightPage, 'shoppingLists.kanban', 'ready');

    // Verify line restored to backend (with new ID)
    backendDetail = await apiClient.apiRequest<ShoppingListResponseSchema>(() =>
      apiClient.GET('/api/shopping-lists/{list_id}', {
        params: { path: { list_id: list.id } },
      })
    );
    const restoredLine = backendDetail.lines?.find((l: ShoppingListLineResponseSchema) => l.part.key === part.key);
    expect(restoredLine).toBeDefined();
    expect(restoredLine?.needed).toBe(50);
    expect(restoredLine?.note).toBe('Urgent order');

    // Verify restored card visible in UI (new ID after restoration)
    if (restoredLine) {
      const restoredCard = shoppingLists.kanbanCard(restoredLine.id);
      await expect(restoredCard).toBeVisible();
    }
  });

  test('undo toast dismisses after timeout without clicking', async ({ shoppingLists, testData }) => {
    const { part } = await testData.parts.create({
      overrides: { description: 'Timeout Test Part' },
    });
    const list = await testData.shoppingLists.createWithLines({
      listOverrides: {},
      lines: [{ partKey: part.key, needed: 10 }],
    });
    const lineId = list.lines[0].id;

    await shoppingLists.gotoKanban(list.id);

    // Perform deletion
    const deleteSuccess = waitTestEvent<FormTestEvent>(shoppingLists.playwrightPage, 'form', (event) =>
      event.formId === 'ShoppingListLine:delete' && event.phase === 'success'
    );
    await shoppingLists.kanbanDeleteCard(lineId);
    await deleteSuccess;
    await waitForListLoading(shoppingLists.playwrightPage, 'shoppingLists.kanban', 'ready');

    // Verify undo button appears
    const undoButton = shoppingLists.playwrightPage.getByTestId(`shopping-lists.detail.toast.undo.${lineId}`);
    await expect(undoButton).toBeVisible();

    // Wait for toast to auto-dismiss (15 seconds + buffer)
    await expect(undoButton).toBeHidden({ timeout: 16000 });

    // Verify card remains deleted
    const card = shoppingLists.kanbanCard(lineId);
    await expect(card).toHaveCount(0);
  });

  test('handles concurrent deletions with separate undo buttons', async ({ shoppingLists, testData, apiClient }) => {
    const { part: part1 } = await testData.parts.create({
      overrides: { description: 'Concurrent Part 1' },
    });
    const { part: part2 } = await testData.parts.create({
      overrides: { description: 'Concurrent Part 2' },
    });
    const list = await testData.shoppingLists.createWithLines({
      listOverrides: { name: 'Concurrent List' },
      lines: [
        { partKey: part1.key, needed: 5 },
        { partKey: part2.key, needed: 10 },
      ],
    });
    const line1Id = list.lines.find(l => l.part.key === part1.key)!.id;
    const line2Id = list.lines.find(l => l.part.key === part2.key)!.id;

    await shoppingLists.gotoKanban(list.id);

    // Delete first card
    const delete1Success = waitTestEvent<FormTestEvent>(shoppingLists.playwrightPage, 'form', (event) =>
      event.formId === 'ShoppingListLine:delete' && event.phase === 'success' && event.metadata?.lineId === line1Id
    );
    await shoppingLists.kanbanDeleteCard(line1Id);
    await delete1Success;

    // Delete second card
    const delete2Success = waitTestEvent<FormTestEvent>(shoppingLists.playwrightPage, 'form', (event) =>
      event.formId === 'ShoppingListLine:delete' && event.phase === 'success' && event.metadata?.lineId === line2Id
    );
    await shoppingLists.kanbanDeleteCard(line2Id);
    await delete2Success;
    await waitForListLoading(shoppingLists.playwrightPage, 'shoppingLists.kanban', 'ready');

    // Verify both undo buttons are visible
    const undo1 = shoppingLists.playwrightPage.getByTestId(`shopping-lists.detail.toast.undo.${line1Id}`);
    const undo2 = shoppingLists.playwrightPage.getByTestId(`shopping-lists.detail.toast.undo.${line2Id}`);
    await expect(undo1).toBeVisible();
    await expect(undo2).toBeVisible();

    // Undo only the second deletion
    const undo2Success = waitTestEvent<FormTestEvent>(shoppingLists.playwrightPage, 'form', (event) =>
      event.formId === 'ShoppingListLine:restore' && event.phase === 'success' && event.metadata?.undo === true
    );
    await undo2.click();
    await undo2Success;
    await waitForListLoading(shoppingLists.playwrightPage, 'shoppingLists.kanban', 'ready');

    // Verify: line2 restored, line1 still deleted
    const backendDetail = await apiClient.apiRequest<ShoppingListResponseSchema>(() =>
      apiClient.GET('/api/shopping-lists/{list_id}', {
        params: { path: { list_id: list.id } },
      })
    );
    expect(backendDetail.lines?.find((l: ShoppingListLineResponseSchema) => l.part.key === part1.key)).toBeUndefined();
    const restored2 = backendDetail.lines?.find((l: ShoppingListLineResponseSchema) => l.part.key === part2.key);
    expect(restored2).toBeDefined();
    expect(restored2?.needed).toBe(10);
  });

  test('preserves seller and note when undoing', async ({ shoppingLists, testData, apiClient }) => {
    const seller = await testData.sellers.create({ overrides: { name: 'Attribute Test Seller' } });
    const { part } = await testData.parts.create({
      overrides: { description: 'Preserve Attributes Part' },
    });
    const list = await testData.shoppingLists.createWithLines({
      listOverrides: {},
      lines: [{ partKey: part.key, needed: 25, sellerId: seller.id, note: 'Check stock before ordering' }],
    });
    const lineId = list.lines[0].id;

    await testData.shoppingLists.createSellerGroup(list.id, seller.id);

    await shoppingLists.gotoKanban(list.id);

    // Delete card
    const deleteSuccess = waitTestEvent<FormTestEvent>(shoppingLists.playwrightPage, 'form', (event) =>
      event.formId === 'ShoppingListLine:delete' && event.phase === 'success'
    );
    await shoppingLists.kanbanDeleteCard(lineId);
    await deleteSuccess;
    await waitForListLoading(shoppingLists.playwrightPage, 'shoppingLists.kanban', 'ready');

    // Undo deletion
    const undoSuccess = waitTestEvent<FormTestEvent>(shoppingLists.playwrightPage, 'form', (event) =>
      event.formId === 'ShoppingListLine:restore' && event.phase === 'success' && event.metadata?.undo === true
    );
    const undoButton = shoppingLists.playwrightPage.getByTestId(`shopping-lists.detail.toast.undo.${lineId}`);
    await undoButton.click();
    await undoSuccess;
    await waitForListLoading(shoppingLists.playwrightPage, 'shoppingLists.kanban', 'ready');

    // Verify attributes preserved in backend
    const backendDetail = await apiClient.apiRequest<ShoppingListResponseSchema>(() =>
      apiClient.GET('/api/shopping-lists/{list_id}', {
        params: { path: { list_id: list.id } },
      })
    );
    const restoredLine = backendDetail.lines?.find((l: ShoppingListLineResponseSchema) => l.part.key === part.key);
    expect(restoredLine).toBeDefined();
    expect(restoredLine?.needed).toBe(25);
    expect(restoredLine?.seller?.id).toBe(seller.id);
    expect(restoredLine?.note).toBe('Check stock before ordering');
  });

  test('rapid successive deletions each get undo buttons', async ({ shoppingLists, testData }) => {
    const { part: part1 } = await testData.parts.create({ overrides: { description: 'Rapid 1' } });
    const { part: part2 } = await testData.parts.create({ overrides: { description: 'Rapid 2' } });
    const { part: part3 } = await testData.parts.create({ overrides: { description: 'Rapid 3' } });
    const list = await testData.shoppingLists.createWithLines({
      listOverrides: {},
      lines: [
        { partKey: part1.key, needed: 1 },
        { partKey: part2.key, needed: 2 },
        { partKey: part3.key, needed: 3 },
      ],
    });
    const line1Id = list.lines.find(l => l.part.key === part1.key)!.id;
    const line2Id = list.lines.find(l => l.part.key === part2.key)!.id;
    const line3Id = list.lines.find(l => l.part.key === part3.key)!.id;

    await shoppingLists.gotoKanban(list.id);

    // Rapidly delete all three cards
    const delete1Success = waitTestEvent<FormTestEvent>(shoppingLists.playwrightPage, 'form', (event) =>
      event.formId === 'ShoppingListLine:delete' && event.phase === 'success' && event.metadata?.lineId === line1Id
    );
    await shoppingLists.kanbanDeleteCard(line1Id);
    await delete1Success;

    const delete2Success = waitTestEvent<FormTestEvent>(shoppingLists.playwrightPage, 'form', (event) =>
      event.formId === 'ShoppingListLine:delete' && event.phase === 'success' && event.metadata?.lineId === line2Id
    );
    await shoppingLists.kanbanDeleteCard(line2Id);
    await delete2Success;

    const delete3Success = waitTestEvent<FormTestEvent>(shoppingLists.playwrightPage, 'form', (event) =>
      event.formId === 'ShoppingListLine:delete' && event.phase === 'success' && event.metadata?.lineId === line3Id
    );
    await shoppingLists.kanbanDeleteCard(line3Id);
    await delete3Success;
    await waitForListLoading(shoppingLists.playwrightPage, 'shoppingLists.kanban', 'ready');

    // Verify all three undo buttons are visible
    const undo1 = shoppingLists.playwrightPage.getByTestId(`shopping-lists.detail.toast.undo.${line1Id}`);
    const undo2 = shoppingLists.playwrightPage.getByTestId(`shopping-lists.detail.toast.undo.${line2Id}`);
    const undo3 = shoppingLists.playwrightPage.getByTestId(`shopping-lists.detail.toast.undo.${line3Id}`);
    await expect(undo1).toBeVisible();
    await expect(undo2).toBeVisible();
    await expect(undo3).toBeVisible();

    // Undo middle deletion
    const undo2Event = waitTestEvent<FormTestEvent>(shoppingLists.playwrightPage, 'form', (event) =>
      event.formId === 'ShoppingListLine:restore' && event.phase === 'success' && event.metadata?.undo === true
    );
    await undo2.click();
    await undo2Event;
    await waitForListLoading(shoppingLists.playwrightPage, 'shoppingLists.kanban', 'ready');

    // Verify by content: the undo re-creates the line with a new backend ID
    // (SQLite may reuse deleted IDs), so we check text content rather than
    // original line IDs to avoid flakiness.
    const allCards = shoppingLists.kanbanColumnCards('ungrouped');
    await expect(allCards).toHaveCount(1);

    const restoredCard = allCards.filter({ hasText: 'Rapid 2' });
    await expect(restoredCard).toBeVisible();

    // Verify the other two parts are not on the board
    await expect(shoppingLists.kanbanBoard.getByText('Rapid 1')).toHaveCount(0);
    await expect(shoppingLists.kanbanBoard.getByText('Rapid 3')).toHaveCount(0);
  });
});
