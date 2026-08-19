/**
 * Shopping List Line Deletion Tests (Kanban Board)
 *
 * Tests card deletion on the Kanban board. The old ready-state confirmation
 * dialog has been replaced by immediate deletion with undo toast on the
 * Kanban board.
 *
 * Primary deletion and undo coverage lives in:
 * - kanban-board.spec.ts ("deletes a card and offers undo")
 * - line-deletion-undo.spec.ts (full undo flow, attribute preservation)
 *
 * This file covers supplementary deletion scenarios.
 */

import { test, expect } from '../../support/fixtures';
import { waitForListLoading, waitTestEvent } from '../../support/helpers';
import type { FormTestEvent } from '@/lib/test/test-events';
import type { components } from '../../../src/lib/api/generated/types';

type ShoppingListResponseSchema = components['schemas']['ShoppingListResponseSchema.46f0cf6'];
type ShoppingListLineResponseSchema = components['schemas']['ShoppingListLineResponseSchema.d9ccce0'];

test.describe('Shopping List Kanban Card Deletion', () => {
  test('hides delete button when list is completed', async ({ shoppingLists, testData }) => {
    const { part } = await testData.parts.create({
      overrides: { description: 'Done State Part' },
    });
    const list = await testData.shoppingLists.createWithLines({
      listOverrides: { name: 'Completed List Delete Guard' },
      lines: [{ partKey: part.key, needed: 30 }],
    });
    const lineId = list.lines[0].id;

    // Mark list as done
    await testData.shoppingLists.markDone(list.id);

    await shoppingLists.gotoKanban(list.id);

    // Verify card is visible on the Kanban board
    const card = shoppingLists.kanbanCard(lineId);
    await expect(card).toBeVisible();

    // Verify delete button is not visible (readOnly mode)
    const deleteButton = shoppingLists.playwrightPage.getByTestId(`shopping-lists.kanban.card.${lineId}.delete`);
    await expect(deleteButton).toHaveCount(0);
  });

  test('deletes multiple cards independently', async ({ shoppingLists, testData, apiClient }) => {
    const { part: part1 } = await testData.parts.create({
      overrides: { description: 'Multi Delete Part 1' },
    });
    const { part: part2 } = await testData.parts.create({
      overrides: { description: 'Multi Delete Part 2' },
    });
    const list = await testData.shoppingLists.createWithLines({
      listOverrides: { name: 'Multi Delete Kanban List' },
      lines: [
        { partKey: part1.key, needed: 40 },
        { partKey: part2.key, needed: 60 },
      ],
    });
    const line1Id = list.lines.find(l => l.part.key === part1.key)!.id;
    const line2Id = list.lines.find(l => l.part.key === part2.key)!.id;

    await shoppingLists.gotoKanban(list.id);

    // Verify both cards visible
    await expect(shoppingLists.kanbanCard(line1Id)).toBeVisible();
    await expect(shoppingLists.kanbanCard(line2Id)).toBeVisible();

    // Delete first card
    const deleteSuccess1 = waitTestEvent<FormTestEvent>(shoppingLists.playwrightPage, 'form', (event) =>
      event.formId === 'ShoppingListLine:delete' &&
      event.phase === 'success' &&
      event.metadata?.lineId === line1Id
    );

    await shoppingLists.kanbanDeleteCard(line1Id);
    await deleteSuccess1;
    await waitForListLoading(shoppingLists.playwrightPage, 'shoppingLists.kanban', 'ready');

    // Verify first card deleted, second still visible
    await expect(shoppingLists.kanbanCard(line1Id)).toHaveCount(0);
    await expect(shoppingLists.kanbanCard(line2Id)).toBeVisible();

    // Delete second card
    const deleteSuccess2 = waitTestEvent<FormTestEvent>(shoppingLists.playwrightPage, 'form', (event) =>
      event.formId === 'ShoppingListLine:delete' &&
      event.phase === 'success' &&
      event.metadata?.lineId === line2Id
    );

    await shoppingLists.kanbanDeleteCard(line2Id);
    await deleteSuccess2;
    await waitForListLoading(shoppingLists.playwrightPage, 'shoppingLists.kanban', 'ready');

    // Verify second card deleted
    await expect(shoppingLists.kanbanCard(line2Id)).toHaveCount(0);

    // Verify backend state
    const backendDetail = await apiClient.apiRequest<ShoppingListResponseSchema>(() =>
      apiClient.GET('/api/shopping-lists/{list_id}', {
        params: { path: { list_id: list.id } },
      })
    );
    expect(backendDetail.lines?.find((l: ShoppingListLineResponseSchema) => l.id === line1Id)).toBeUndefined();
    expect(backendDetail.lines?.find((l: ShoppingListLineResponseSchema) => l.id === line2Id)).toBeUndefined();
  });
});
