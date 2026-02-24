/**
 * Kanban Drag and Drop E2E Tests
 *
 * Tests card movement between columns via drag-and-drop, including
 * the confirmation dialog for cards with ordered > 0.
 *
 * Uses a custom manual pointer event sequence (kanbanDragCard) to reliably
 * trigger @dnd-kit's PointerSensor which has an 8px activation constraint.
 */

import { expect } from '@playwright/test';
import { test } from '../../support/fixtures';
import { waitForListLoading, waitForUiState } from '../../support/helpers';

test.describe('Kanban Drag and Drop', () => {
  test('moves an unassigned card to a seller column via drag', async ({ shoppingLists, testData }) => {
    const seller = await testData.sellers.create({ overrides: { name: testData.sellers.randomSellerName() } });
    const { part } = await testData.parts.create({ overrides: { description: 'DnD Move Part' } });

    const list = await testData.shoppingLists.createWithLines({
      listOverrides: { name: testData.shoppingLists.randomName('DnD Move') },
      lines: [{ partKey: part.key, needed: 2 }],
    });

    // Create a seller group column so there is a drop target
    await testData.shoppingLists.createSellerGroup(list.id, seller.id);

    const lineId = list.lines[0].id;

    await shoppingLists.gotoKanban(list.id);

    // Card should be in the unassigned column
    const card = shoppingLists.kanbanCard(lineId);
    await expect(card).toBeVisible();
    await expect(shoppingLists.kanbanColumnCards('ungrouped')).toHaveCount(1);

    // Set up instrumentation listener
    const moveSuccess = waitForUiState(
      shoppingLists.playwrightPage,
      'kanban.card.move',
      'success',
    );

    // Perform drag: from the card to the seller column
    const sellerColumn = shoppingLists.kanbanColumn(String(seller.id));
    await shoppingLists.kanbanDragCard(card, sellerColumn);

    await moveSuccess;
    await waitForListLoading(shoppingLists.playwrightPage, 'shoppingLists.kanban', 'ready');

    // Verify backend: line should now have the seller
    const detail = await testData.shoppingLists.getDetail(list.id);
    const updatedLine = detail.lines.find(l => l.id === lineId);
    expect(updatedLine?.seller_id).toBe(seller.id);
  });

  test('moves a seller card to a different seller column via drag', async ({ shoppingLists, testData }) => {
    const sellerA = await testData.sellers.create({ overrides: { name: testData.sellers.randomSellerName() } });
    const sellerB = await testData.sellers.create({ overrides: { name: testData.sellers.randomSellerName() } });
    const { part } = await testData.parts.create({ overrides: { description: 'DnD Cross-Seller Part' } });

    const list = await testData.shoppingLists.createWithLines({
      listOverrides: { name: testData.shoppingLists.randomName('DnD Cross') },
      lines: [{ partKey: part.key, needed: 3, sellerId: sellerA.id }],
    });

    // Create both seller group columns
    await testData.shoppingLists.createSellerGroup(list.id, sellerA.id);
    await testData.shoppingLists.createSellerGroup(list.id, sellerB.id);

    const lineId = list.lines[0].id;

    await shoppingLists.gotoKanban(list.id);

    // Card should be in seller A's column
    const card = shoppingLists.kanbanCard(lineId);
    await expect(card).toBeVisible();

    // Set up instrumentation listener
    const moveSuccess = waitForUiState(
      shoppingLists.playwrightPage,
      'kanban.card.move',
      'success',
    );

    // Drag from seller A column to seller B column
    const sellerBColumn = shoppingLists.kanbanColumn(String(sellerB.id));
    await shoppingLists.kanbanDragCard(card, sellerBColumn);

    await moveSuccess;
    await waitForListLoading(shoppingLists.playwrightPage, 'shoppingLists.kanban', 'ready');

    // Verify backend: line should now belong to seller B
    const detail = await testData.shoppingLists.getDetail(list.id);
    const updatedLine = detail.lines.find(l => l.id === lineId);
    expect(updatedLine?.seller_id).toBe(sellerB.id);
  });

  /**
   * The DnD confirmation dialog is designed for moving cards with ordered > 0
   * off a seller column. However, lines with ordered > 0 have status 'ordered'
   * which disables dragging (aria-disabled on the wrapper). This confirmation
   * path is currently unreachable through the UI because the backend marks
   * lines as status='ordered' when ordered > 0, and the DnD hook guards
   * against dragging ordered lines before the confirmation check.
   *
   * These tests are skipped until the backend supports a scenario where
   * ordered > 0 does not set line status to 'ordered' (e.g. partial receive
   * states or draft ordering).
   */
  test.fixme('shows confirmation when moving card with ordered > 0 off a seller', async () => {
    // Blocked: see comment above
  });

  test.fixme('cancels move confirmation and card stays in place', async () => {
    // Blocked: see comment above
  });
});
