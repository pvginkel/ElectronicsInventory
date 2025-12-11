/**
 * Shopping List Ready State Line Deletion Tests
 *
 * Tests the deletion functionality for shopping list lines in Ready state,
 * including confirmation dialog and backend validation.
 */

import { test, expect } from '../../support/fixtures';
import { waitForListLoading, waitTestEvent } from '../../support/helpers';
import type { FormTestEvent } from '@/types/test-events';
import type { components } from '../../../src/lib/api/generated/types';

type ShoppingListResponseSchema = components['schemas']['ShoppingListResponseSchema.46f0cf6'];
type ShoppingListLineResponseSchema = components['schemas']['ShoppingListLineResponseSchema.d9ccce0'];

test.describe('Shopping List Ready State Line Deletion', () => {
  test('deletes line from Ready state with confirmation', async ({ page, testData, apiClient }) => {
    // Setup: Create part and shopping list in Ready state with a line
    const { part } = await testData.parts.create({
      overrides: { description: 'Ready Delete Test Resistor' },
    });
    const list = await testData.shoppingLists.create({
      name: 'Ready Delete List',
    });
    const line = await testData.shoppingLists.createLine(list.id, {
      partKey: part.key,
      needed: 100,
      note: 'Important line',
    });
    // Mark list as Ready
    await testData.shoppingLists.markReady(list.id);

    // Navigate to shopping list Ready view
    await page.goto(`/shopping-lists/${list.id}`);
    await waitForListLoading(page, 'shoppingLists.list', 'ready');

    // Verify line is visible before deletion
    const lineRow = page.getByTestId(`shopping-lists.ready.line.${line.id}`);
    await expect(lineRow).toBeVisible();

    // Verify delete button is visible
    const deleteButton = page.getByTestId(`shopping-lists.ready.line.${line.id}.actions.delete`);
    await expect(deleteButton).toBeVisible();

    // Click delete button
    await deleteButton.click();

    // Verify confirmation dialog appears
    const dialog = page.getByTestId('shopping-lists.ready.delete-line-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Delete shopping list line?');
    await expect(dialog).toContainText('This action cannot be undone');

    // Setup event listeners for deletion before confirming
    const deleteSubmit = waitTestEvent<FormTestEvent>(page, 'form', (event) =>
      event.formId === 'ShoppingListLine:delete' && event.phase === 'submit'
    );
    const deleteSuccess = waitTestEvent<FormTestEvent>(page, 'form', (event) =>
      event.formId === 'ShoppingListLine:delete' && event.phase === 'success'
    );

    // Confirm deletion
    const confirmButton = page.getByRole('button', { name: /delete/i });
    await confirmButton.click();

    // Wait for deletion to complete
    await deleteSubmit;
    await deleteSuccess;
    await waitForListLoading(page, 'shoppingLists.list', 'ready');

    // Verify line removed from UI
    await expect(lineRow).toHaveCount(0);

    // Verify backend deletion
    const backendDetail = await apiClient.apiRequest<ShoppingListResponseSchema>(() =>
      apiClient.GET('/api/shopping-lists/{list_id}', {
        params: { path: { list_id: list.id } },
      })
    );
    expect(backendDetail.lines?.find((l: ShoppingListLineResponseSchema) => l.id === line.id)).toBeUndefined();
  });

  test('cancels deletion when user clicks cancel', async ({ page, testData }) => {
    // Setup
    const { part } = await testData.parts.create({
      overrides: { description: 'Cancel Test Part' },
    });
    const list = await testData.shoppingLists.create({
      name: 'Cancel Delete List',
    });
    const line = await testData.shoppingLists.createLine(list.id, {
      partKey: part.key,
      needed: 50,
    });
    // Mark list as Ready
    await testData.shoppingLists.markReady(list.id);

    // Navigate to shopping list Ready view
    await page.goto(`/shopping-lists/${list.id}`);
    await waitForListLoading(page, 'shoppingLists.list', 'ready');

    // Click delete button
    const deleteButton = page.getByTestId(`shopping-lists.ready.line.${line.id}.actions.delete`);
    await deleteButton.click();

    // Verify confirmation dialog appears
    const dialog = page.getByTestId('shopping-lists.ready.delete-line-dialog');
    await expect(dialog).toBeVisible();

    // Click cancel
    const cancelButton = page.getByRole('button', { name: /cancel/i });
    await cancelButton.click();

    // Verify dialog is closed
    await expect(dialog).toHaveCount(0);

    // Verify line remains in UI
    const lineRow = page.getByTestId(`shopping-lists.ready.line.${line.id}`);
    await expect(lineRow).toBeVisible();
  });

  test('hides delete button when list is completed', async ({ page, testData }) => {
    // Setup: Create list in done state
    const { part } = await testData.parts.create({
      overrides: { description: 'Done State Part' },
    });
    const list = await testData.shoppingLists.create({
      name: 'Completed List',
    });
    const line = await testData.shoppingLists.createLine(list.id, {
      partKey: part.key,
      needed: 30,
    });
    // Mark list as Done
    await testData.shoppingLists.markReady(list.id);
    await testData.shoppingLists.markDone(list.id);

    // Navigate to shopping list
    await page.goto(`/shopping-lists/${list.id}`);
    await waitForListLoading(page, 'shoppingLists.list', 'ready');

    // Verify line is visible
    const lineRow = page.getByTestId(`shopping-lists.ready.line.${line.id}`);
    await expect(lineRow).toBeVisible();

    // Verify delete button is not visible (readOnly mode)
    const deleteButton = page.getByTestId(`shopping-lists.ready.line.${line.id}.actions.delete`);
    await expect(deleteButton).toHaveCount(0);
  });

  test('hides delete button for done lines', async ({ page, testData }) => {
    // Setup: Create list in ready state with a line
    const { part } = await testData.parts.create({
      overrides: { description: 'Done Line Part' },
    });
    const list = await testData.shoppingLists.create({
      name: 'Ready List with Done Line',
    });
    const line = await testData.shoppingLists.createLine(list.id, {
      partKey: part.key,
      needed: 20,
    });
    // Mark list as Ready
    await testData.shoppingLists.markReady(list.id);

    // Order, receive and complete the line
    await testData.shoppingLists.orderLine(list.id, line.id, 20);
    // Need to create a box and receive stock to complete the line
    const box = await testData.boxes.create({ overrides: { capacity: 25 } });
    await testData.shoppingLists.receiveLine(list.id, line.id, {
      receiveQuantity: 20,
      allocations: [{ boxNo: box.box_no, locNo: 1, quantity: 20 }],
    });
    await testData.shoppingLists.completeLine(list.id, line.id, null);

    // Navigate to shopping list
    await page.goto(`/shopping-lists/${list.id}`);
    await waitForListLoading(page, 'shoppingLists.list', 'ready');

    // Verify line is visible
    const lineRow = page.getByTestId(`shopping-lists.ready.line.${line.id}`);
    await expect(lineRow).toBeVisible();

    // Verify line status badge shows "Completed"
    const statusBadge = page.getByTestId(`shopping-lists.ready.line.${line.id}.status.badge`);
    await expect(statusBadge).toContainText('Completed');

    // Verify delete button is not visible for done line
    const deleteButton = page.getByTestId(`shopping-lists.ready.line.${line.id}.actions.delete`);
    await expect(deleteButton).toHaveCount(0);
  });

  test('handles deletion errors gracefully', async ({ page, testData, apiClient }) => {
    // Setup: Create list and line
    const { part } = await testData.parts.create({
      overrides: { description: 'Error Test Part' },
    });
    const list = await testData.shoppingLists.create({
      name: 'Error Test List',
    });
    const line = await testData.shoppingLists.createLine(list.id, {
      partKey: part.key,
      needed: 15,
    });
    // Mark list as Ready
    await testData.shoppingLists.markReady(list.id);

    // Navigate to shopping list
    await page.goto(`/shopping-lists/${list.id}`);
    await waitForListLoading(page, 'shoppingLists.list', 'ready');

    // Delete the line via API to simulate a race condition
    await apiClient.apiRequest(() =>
      apiClient.DELETE('/api/shopping-list-lines/{line_id}', {
        params: { path: { line_id: line.id } },
      })
    );

    // Reload to get updated state
    await page.reload();
    await waitForListLoading(page, 'shoppingLists.list', 'ready');

    // Verify line is already gone from UI (deleted via API)
    const deletedRow = page.getByTestId(`shopping-lists.ready.line.${line.id}`);
    await expect(deletedRow).toHaveCount(0);
  });

  test('deletes multiple lines independently', async ({ page, testData, apiClient }) => {
    // Setup: Create list with multiple lines
    const { part: part1 } = await testData.parts.create({
      overrides: { description: 'Multi Delete Part 1' },
    });
    const { part: part2 } = await testData.parts.create({
      overrides: { description: 'Multi Delete Part 2' },
    });
    const list = await testData.shoppingLists.create({
      name: 'Multi Delete List',
    });
    const line1 = await testData.shoppingLists.createLine(list.id, {
      partKey: part1.key,
      needed: 40,
    });
    const line2 = await testData.shoppingLists.createLine(list.id, {
      partKey: part2.key,
      needed: 60,
    });
    // Mark list as Ready
    await testData.shoppingLists.markReady(list.id);

    // Navigate to shopping list
    await page.goto(`/shopping-lists/${list.id}`);
    await waitForListLoading(page, 'shoppingLists.list', 'ready');

    // Verify both lines visible
    await expect(page.getByTestId(`shopping-lists.ready.line.${line1.id}`)).toBeVisible();
    await expect(page.getByTestId(`shopping-lists.ready.line.${line2.id}`)).toBeVisible();

    // Delete first line
    const deleteButton1 = page.getByTestId(`shopping-lists.ready.line.${line1.id}.actions.delete`);
    await deleteButton1.click();

    const dialog1 = page.getByTestId('shopping-lists.ready.delete-line-dialog');
    await expect(dialog1).toBeVisible();

    const deleteSuccess1 = waitTestEvent<FormTestEvent>(page, 'form', (event) =>
      event.formId === 'ShoppingListLine:delete' &&
      event.phase === 'success' &&
      event.metadata?.lineId === line1.id
    );

    const confirmButton1 = page.getByRole('button', { name: /delete/i });
    await confirmButton1.click();

    await deleteSuccess1;
    await waitForListLoading(page, 'shoppingLists.list', 'ready');

    // Verify first line deleted
    await expect(page.getByTestId(`shopping-lists.ready.line.${line1.id}`)).toHaveCount(0);

    // Verify second line still visible
    await expect(page.getByTestId(`shopping-lists.ready.line.${line2.id}`)).toBeVisible();

    // Delete second line
    const deleteButton2 = page.getByTestId(`shopping-lists.ready.line.${line2.id}.actions.delete`);
    await deleteButton2.click();

    const dialog2 = page.getByTestId('shopping-lists.ready.delete-line-dialog');
    await expect(dialog2).toBeVisible();

    const deleteSuccess2 = waitTestEvent<FormTestEvent>(page, 'form', (event) =>
      event.formId === 'ShoppingListLine:delete' &&
      event.phase === 'success' &&
      event.metadata?.lineId === line2.id
    );

    const confirmButton2 = page.getByRole('button', { name: /delete/i });
    await confirmButton2.click();

    await deleteSuccess2;
    await waitForListLoading(page, 'shoppingLists.list', 'ready');

    // Verify second line deleted
    await expect(page.getByTestId(`shopping-lists.ready.line.${line2.id}`)).toHaveCount(0);

    // Verify backend state
    const backendDetail = await apiClient.apiRequest<ShoppingListResponseSchema>(() =>
      apiClient.GET('/api/shopping-lists/{list_id}', {
        params: { path: { list_id: list.id } },
      })
    );
    expect(backendDetail.lines?.find((l: ShoppingListLineResponseSchema) => l.id === line1.id)).toBeUndefined();
    expect(backendDetail.lines?.find((l: ShoppingListLineResponseSchema) => l.id === line2.id)).toBeUndefined();
  });
});
