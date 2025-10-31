/**
 * Shopping List Line Deletion Undo Tests
 *
 * Tests the undo functionality for shopping list line deletion following the
 * kit archive undo pattern.
 */

import { test, expect } from '../../support/fixtures';
import { waitForListLoading, waitTestEvent } from '../../support/helpers';
import type { FormTestEvent, ToastTestEvent } from '@/types/test-events';
import type { components } from '../../../src/lib/api/generated/types';

type ShoppingListResponseSchema = components['schemas']['ShoppingListResponseSchema.46f0cf6'];
type ShoppingListLineResponseSchema = components['schemas']['ShoppingListLineResponseSchema.d9ccce0'];

test.describe('Shopping List Line Deletion Undo', () => {
  test('removes line and undoes deletion', async ({ page, testData, apiClient }) => {
    // Setup: Create part and shopping list with line
    const { part } = await testData.parts.create({
      overrides: { description: 'Undo Test Capacitor' },
    });
    const list = await testData.shoppingLists.create({
      name: 'Line Undo List',
    });
    const line = await testData.shoppingLists.createLine(list.id, {
      partKey: part.key,
      needed: 50,
      note: 'Urgent order',
    });

    // Navigate to shopping list concept view
    await page.goto(`/shopping-lists/${list.id}?tab=concept`);
    await waitForListLoading(page, 'shoppingLists.list', 'ready');

    // Verify line is visible before deletion
    const lineRow = page.getByTestId(`shopping-lists.concept.row.${line.id}`);
    await expect(lineRow).toBeVisible();

    // Setup event listeners for deletion
    const deleteSubmit = waitTestEvent<FormTestEvent>(page, 'form', (event) =>
      event.formId === 'ShoppingListLine:delete' && event.phase === 'submit'
    );
    const deleteSuccess = waitTestEvent<FormTestEvent>(page, 'form', (event) =>
      event.formId === 'ShoppingListLine:delete' && event.phase === 'success'
    );
    const deleteToast = waitTestEvent<ToastTestEvent>(page, 'toast', (event) =>
      event.message.includes('Removed part from Concept list') && event.action === 'undo'
    );

    // Perform deletion - should be immediate, no confirmation dialog
    const deleteButton = page.getByTestId(`shopping-lists.concept.row.${line.id}.delete`);
    await deleteButton.click();

    // Wait for deletion to complete
    await deleteSubmit;
    await deleteSuccess;
    await deleteToast;
    await waitForListLoading(page, 'shoppingLists.list', 'ready');

    // Verify line removed from UI
    await expect(lineRow).toHaveCount(0);

    // Verify backend deletion
    let backendDetail = await apiClient.apiRequest<ShoppingListResponseSchema>(() =>
      apiClient.GET('/api/shopping-lists/{list_id}', {
        params: { path: { list_id: list.id } },
      })
    );
    expect(backendDetail.lines?.find((l: ShoppingListLineResponseSchema) => l.id === line.id)).toBeUndefined();

    // Setup event listeners for undo BEFORE clicking undo
    const undoSubmit = waitTestEvent<FormTestEvent>(page, 'form', (event) =>
      event.formId === 'ShoppingListLine:restore' && event.phase === 'submit' && event.metadata?.undo === true
    );
    const undoSuccess = waitTestEvent<FormTestEvent>(page, 'form', (event) =>
      event.formId === 'ShoppingListLine:restore' && event.phase === 'success' && event.metadata?.undo === true
    );
    const undoToast = waitTestEvent<ToastTestEvent>(page, 'toast', (event) =>
      event.message.includes('Restored line') && !event.action
    );

    // Click undo button
    const undoButton = page.getByTestId(`shopping-lists.concept.toast.undo.${line.id}`);
    await expect(undoButton).toBeVisible();
    await undoButton.click();

    // Wait for undo to complete
    await undoSubmit;
    await undoSuccess;
    await undoToast;
    await waitForListLoading(page, 'shoppingLists.list', 'ready');

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

    // Verify restored line visible in UI (note: different ID after restoration)
    if (restoredLine) {
      const restoredRow = page.getByTestId(`shopping-lists.concept.row.${restoredLine.id}`);
      await expect(restoredRow).toBeVisible();
    }
  });

  test('undo toast dismisses after timeout without clicking', async ({ page, testData }) => {
    // Setup
    const { part } = await testData.parts.create({
      overrides: { description: 'Timeout Test Part' },
    });
    const list = await testData.shoppingLists.create();
    const line = await testData.shoppingLists.createLine(list.id, {
      partKey: part.key,
      needed: 10,
    });

    // Navigate to shopping list concept view
    await page.goto(`/shopping-lists/${list.id}?tab=concept`);
    await waitForListLoading(page, 'shoppingLists.list', 'ready');

    // Perform deletion
    const deleteSuccess = waitTestEvent<FormTestEvent>(page, 'form', (event) =>
      event.formId === 'ShoppingListLine:delete' && event.phase === 'success'
    );
    const deleteButton = page.getByTestId(`shopping-lists.concept.row.${line.id}.delete`);
    await deleteButton.click();
    await deleteSuccess;
    await waitForListLoading(page, 'shoppingLists.list', 'ready');

    // Verify undo button appears
    const undoButton = page.getByTestId(`shopping-lists.concept.toast.undo.${line.id}`);
    await expect(undoButton).toBeVisible();

    // Wait for toast to auto-dismiss (15 seconds + buffer)
    await expect(undoButton).toBeHidden({ timeout: 16000 });

    // Verify line remains deleted
    const lineRow = page.getByTestId(`shopping-lists.concept.row.${line.id}`);
    await expect(lineRow).toHaveCount(0);
  });

  test('handles concurrent deletions with separate undo buttons', async ({ page, testData, apiClient }) => {
    // Setup: Create list with multiple lines
    const { part: part1 } = await testData.parts.create({
      overrides: { description: 'Concurrent Part 1' },
    });
    const { part: part2 } = await testData.parts.create({
      overrides: { description: 'Concurrent Part 2' },
    });
    const list = await testData.shoppingLists.create({ name: 'Concurrent List' });
    const line1 = await testData.shoppingLists.createLine(list.id, {
      partKey: part1.key,
      needed: 5,
    });
    const line2 = await testData.shoppingLists.createLine(list.id, {
      partKey: part2.key,
      needed: 10,
    });

    // Navigate to shopping list concept view
    await page.goto(`/shopping-lists/${list.id}?tab=concept`);
    await waitForListLoading(page, 'shoppingLists.list', 'ready');

    // Delete first line
    const delete1Success = waitTestEvent<FormTestEvent>(page, 'form', (event) =>
      event.formId === 'ShoppingListLine:delete' && event.phase === 'success' && event.metadata?.lineId === line1.id
    );
    const deleteButton1 = page.getByTestId(`shopping-lists.concept.row.${line1.id}.delete`);
    await deleteButton1.click();
    await delete1Success;

    // Delete second line
    const delete2Success = waitTestEvent<FormTestEvent>(page, 'form', (event) =>
      event.formId === 'ShoppingListLine:delete' && event.phase === 'success' && event.metadata?.lineId === line2.id
    );
    const deleteButton2 = page.getByTestId(`shopping-lists.concept.row.${line2.id}.delete`);
    await deleteButton2.click();
    await delete2Success;
    await waitForListLoading(page, 'shoppingLists.list', 'ready');

    // Verify both undo buttons are visible
    const undo1 = page.getByTestId(`shopping-lists.concept.toast.undo.${line1.id}`);
    const undo2 = page.getByTestId(`shopping-lists.concept.toast.undo.${line2.id}`);
    await expect(undo1).toBeVisible();
    await expect(undo2).toBeVisible();

    // Undo only the second deletion
    const undo2Success = waitTestEvent<FormTestEvent>(page, 'form', (event) =>
      event.formId === 'ShoppingListLine:restore' && event.phase === 'success' && event.metadata?.undo === true
    );
    await undo2.click();
    await undo2Success;
    await waitForListLoading(page, 'shoppingLists.list', 'ready');

    // Verify: line2 restored, line1 still deleted
    // Note: We check by part key, not by line ID, because the backend may reuse deleted IDs
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

  test('preserves seller and note when undoing', async ({ page, testData, apiClient }) => {
    // Setup: Create seller and line with full attributes
    const seller = await testData.sellers.create({ overrides: { name: 'Attribute Test Seller' } });
    const { part } = await testData.parts.create({
      overrides: { description: 'Preserve Attributes Part' },
    });
    const list = await testData.shoppingLists.create();
    const line = await testData.shoppingLists.createLine(list.id, {
      partKey: part.key,
      needed: 25,
      sellerId: seller.id,
      note: 'Check stock before ordering',
    });

    // Navigate to shopping list concept view
    await page.goto(`/shopping-lists/${list.id}?tab=concept`);
    await waitForListLoading(page, 'shoppingLists.list', 'ready');

    // Delete line
    const deleteSuccess = waitTestEvent<FormTestEvent>(page, 'form', (event) =>
      event.formId === 'ShoppingListLine:delete' && event.phase === 'success'
    );
    const deleteButton = page.getByTestId(`shopping-lists.concept.row.${line.id}.delete`);
    await deleteButton.click();
    await deleteSuccess;
    await waitForListLoading(page, 'shoppingLists.list', 'ready');

    // Undo deletion
    const undoSuccess = waitTestEvent<FormTestEvent>(page, 'form', (event) =>
      event.formId === 'ShoppingListLine:restore' && event.phase === 'success' && event.metadata?.undo === true
    );
    const undoButton = page.getByTestId(`shopping-lists.concept.toast.undo.${line.id}`);
    await undoButton.click();
    await undoSuccess;
    await waitForListLoading(page, 'shoppingLists.list', 'ready');

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

  test('rapid successive deletions each get undo buttons', async ({ page, testData }) => {
    // Setup: Create list with three lines
    const { part: part1 } = await testData.parts.create({ overrides: { description: 'Rapid 1' } });
    const { part: part2 } = await testData.parts.create({ overrides: { description: 'Rapid 2' } });
    const { part: part3 } = await testData.parts.create({ overrides: { description: 'Rapid 3' } });
    const list = await testData.shoppingLists.create();
    const line1 = await testData.shoppingLists.createLine(list.id, { partKey: part1.key, needed: 1 });
    const line2 = await testData.shoppingLists.createLine(list.id, { partKey: part2.key, needed: 2 });
    const line3 = await testData.shoppingLists.createLine(list.id, { partKey: part3.key, needed: 3 });

    // Navigate to shopping list concept view
    await page.goto(`/shopping-lists/${list.id}?tab=concept`);
    await waitForListLoading(page, 'shoppingLists.list', 'ready');

    // Rapidly delete all three lines
    const delete1Success = waitTestEvent<FormTestEvent>(page, 'form', (event) =>
      event.formId === 'ShoppingListLine:delete' && event.phase === 'success' && event.metadata?.lineId === line1.id
    );
    await page.getByTestId(`shopping-lists.concept.row.${line1.id}.delete`).click();
    await delete1Success;

    const delete2Success = waitTestEvent<FormTestEvent>(page, 'form', (event) =>
      event.formId === 'ShoppingListLine:delete' && event.phase === 'success' && event.metadata?.lineId === line2.id
    );
    await page.getByTestId(`shopping-lists.concept.row.${line2.id}.delete`).click();
    await delete2Success;

    const delete3Success = waitTestEvent<FormTestEvent>(page, 'form', (event) =>
      event.formId === 'ShoppingListLine:delete' && event.phase === 'success' && event.metadata?.lineId === line3.id
    );
    await page.getByTestId(`shopping-lists.concept.row.${line3.id}.delete`).click();
    await delete3Success;
    await waitForListLoading(page, 'shoppingLists.list', 'ready');

    // Verify all three undo buttons are visible
    const undo1 = page.getByTestId(`shopping-lists.concept.toast.undo.${line1.id}`);
    const undo2 = page.getByTestId(`shopping-lists.concept.toast.undo.${line2.id}`);
    const undo3 = page.getByTestId(`shopping-lists.concept.toast.undo.${line3.id}`);
    await expect(undo1).toBeVisible();
    await expect(undo2).toBeVisible();
    await expect(undo3).toBeVisible();

    // Undo middle deletion
    const undo2Event = waitTestEvent<FormTestEvent>(page, 'form', (event) =>
      event.formId === 'ShoppingListLine:restore' && event.phase === 'success' && event.metadata?.undo === true
    );
    await undo2.click();
    await undo2Event;
    await waitForListLoading(page, 'shoppingLists.list', 'ready');

    // Verify: line2 restored, line1 and line3 still deleted
    const lineRow1 = page.getByTestId(`shopping-lists.concept.row.${line1.id}`);
    const lineRow3 = page.getByTestId(`shopping-lists.concept.row.${line3.id}`);
    await expect(lineRow1).toHaveCount(0);
    await expect(lineRow3).toHaveCount(0);

    // line2 should be restored with a new ID - check by part description in row
    const restoredRow = page.locator('tr[data-testid^="shopping-lists.concept.row."]').filter({ hasText: 'Rapid 2' });
    await expect(restoredRow).toBeVisible();
  });
});
