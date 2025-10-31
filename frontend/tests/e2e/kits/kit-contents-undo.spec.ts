/**
 * Kit Contents Undo Tests
 *
 * Tests the undo functionality for kit content deletion following the pattern
 * established in kits-overview.spec.ts for kit archive undo.
 */

import { test, expect } from '../../support/fixtures';
import { waitForListLoading, waitTestEvent } from '../../support/helpers';
import type { FormTestEvent, ToastTestEvent } from '@/types/test-events';
import type { PartKitReservationsResponseSchema_d12d9a5, KitContentDetailSchema_b98797e } from '@/lib/api/generated/hooks';

test.describe('Kit Contents Undo', () => {
  test('removes content and undoes deletion', async ({ kits, page, testData, apiClient }) => {
    // Setup: Create part, kit, and content
    const { part } = await testData.parts.create({
      overrides: { description: 'Undo Test Resistor' },
    });
    const partMetadata = await apiClient.apiRequest<PartKitReservationsResponseSchema_d12d9a5>(() =>
      apiClient.GET('/api/parts/{part_key}/kit-reservations', {
        params: { path: { part_key: part.key } },
      })
    );
    const kit = await testData.kits.create({ overrides: { name: 'Content Undo Kit' } });
    const content = await testData.kits.addContent(kit.id, {
      partId: partMetadata.part_id,
      requiredPerUnit: 3,
    });

    // Navigate to kit detail
    await kits.gotoOverview();
    const searchReady = waitForListLoading(page, 'kits.overview', 'ready');
    await kits.search(kit.name);
    await searchReady;
    await kits.openDetailFromCard(kit.id);
    await waitForListLoading(page, 'kits.detail.contents', 'ready');

    // Verify content is visible before deletion
    await expect(kits.detailTableRow(content.id)).toBeVisible();

    // Setup event listeners for deletion
    const deleteSubmit = waitTestEvent<FormTestEvent>(page, 'form', (event) =>
      event.formId === 'KitContent:delete' && event.phase === 'submit'
    );
    const deleteSuccess = waitTestEvent<FormTestEvent>(page, 'form', (event) =>
      event.formId === 'KitContent:delete' && event.phase === 'success'
    );
    const deleteToast = waitTestEvent<ToastTestEvent>(page, 'toast', (event) =>
      event.message.includes('Removed part from kit') && event.action === 'undo'
    );

    // Perform deletion - should be immediate, no confirmation dialog
    await kits.detailRowDeleteButton(content.id).click();

    // Wait for deletion to complete
    await deleteSubmit;
    await deleteSuccess;
    await deleteToast;
    await waitForListLoading(page, 'kits.detail.contents', 'ready');

    // Verify content removed from UI
    await expect(kits.detailTableRow(content.id)).toHaveCount(0);

    // Verify backend deletion
    let backendDetail = await testData.kits.getDetail(kit.id);
    let backendContents = (backendDetail.contents ?? []) as KitContentDetailSchema_b98797e[];
    expect(backendContents.find((c) => c.id === content.id)).toBeUndefined();

    // Setup event listeners for undo BEFORE clicking undo
    const undoSubmit = waitTestEvent<FormTestEvent>(page, 'form', (event) =>
      event.formId === 'KitContent:restore' && event.phase === 'submit' && event.metadata?.undo === true
    );
    const undoSuccess = waitTestEvent<FormTestEvent>(page, 'form', (event) =>
      event.formId === 'KitContent:restore' && event.phase === 'success' && event.metadata?.undo === true
    );
    const undoToast = waitTestEvent<ToastTestEvent>(page, 'toast', (event) =>
      event.message.includes('Restored part to kit') && !event.action
    );

    // Click undo button
    const undoButton = page.getByTestId(`kits.detail.toast.undo.${content.id}`);
    await expect(undoButton).toBeVisible();
    await undoButton.click();

    // Wait for undo to complete
    await undoSubmit;
    await undoSuccess;
    await undoToast;
    await waitForListLoading(page, 'kits.detail.contents', 'ready');

    // Verify content restored to UI (with new ID)
    backendDetail = await testData.kits.getDetail(kit.id);
    backendContents = (backendDetail.contents ?? []) as KitContentDetailSchema_b98797e[];
    const restoredContent = backendContents.find((c) => c.part.key === part.key);
    expect(restoredContent).toBeDefined();
    expect(restoredContent?.required_per_unit).toBe(3);

    // Verify restored content visible in UI (note: different ID after restoration)
    if (restoredContent) {
      await expect(kits.detailTableRow(restoredContent.id)).toBeVisible();
    }
  });

  test('undo toast dismisses after timeout without clicking', async ({ kits, page, testData, apiClient }) => {
    // Setup
    const { part } = await testData.parts.create({
      overrides: { description: 'Timeout Test Part' },
    });
    const partMetadata = await apiClient.apiRequest<PartKitReservationsResponseSchema_d12d9a5>(() =>
      apiClient.GET('/api/parts/{part_key}/kit-reservations', {
        params: { path: { part_key: part.key } },
      })
    );
    const kit = await testData.kits.create();
    const content = await testData.kits.addContent(kit.id, {
      partId: partMetadata.part_id,
      requiredPerUnit: 1,
    });

    // Navigate to kit detail
    await kits.gotoOverview();
    const searchReady = waitForListLoading(page, 'kits.overview', 'ready');
    await kits.search(kit.name);
    await searchReady;
    await kits.openDetailFromCard(kit.id);
    await waitForListLoading(page, 'kits.detail.contents', 'ready');

    // Perform deletion
    const deleteSuccess = waitTestEvent<FormTestEvent>(page, 'form', (event) =>
      event.formId === 'KitContent:delete' && event.phase === 'success'
    );
    await kits.detailRowDeleteButton(content.id).click();
    await deleteSuccess;
    await waitForListLoading(page, 'kits.detail.contents', 'ready');

    // Verify undo button appears
    const undoButton = page.getByTestId(`kits.detail.toast.undo.${content.id}`);
    await expect(undoButton).toBeVisible();

    // Wait for toast to auto-dismiss (15 seconds + buffer)
    await expect(undoButton).toBeHidden({ timeout: 16000 });

    // Verify content remains deleted
    const backendDetail = await testData.kits.getDetail(kit.id);
    const backendContents = (backendDetail.contents ?? []) as KitContentDetailSchema_b98797e[];
    expect(backendContents.find((c) => c.id === content.id)).toBeUndefined();
  });

  test('cannot undo deletion from archived kit', async ({ kits, page, testData, apiClient }) => {
    // Setup
    const { part } = await testData.parts.create({
      overrides: { description: 'Archived Kit Part' },
    });
    const partMetadata = await apiClient.apiRequest<PartKitReservationsResponseSchema_d12d9a5>(() =>
      apiClient.GET('/api/parts/{part_key}/kit-reservations', {
        params: { path: { part_key: part.key } },
      })
    );
    const kit = await testData.kits.create();
    const content = await testData.kits.addContent(kit.id, {
      partId: partMetadata.part_id,
      requiredPerUnit: 1,
    });

    // Navigate and delete content while kit is active
    await kits.gotoOverview();
    const searchReady = waitForListLoading(page, 'kits.overview', 'ready');
    await kits.search(kit.name);
    await searchReady;
    await kits.openDetailFromCard(kit.id);
    await waitForListLoading(page, 'kits.detail.contents', 'ready');

    // Archive the kit via API
    await testData.kits.archive(kit.id);
    await page.reload();
    await waitForListLoading(page, 'kits.detail', 'ready');

    // Verify delete button is disabled for archived kit
    const deleteButton = kits.detailRowDeleteButton(content.id);
    await expect(deleteButton).toBeDisabled();
  });

  test('handles concurrent deletions with separate undo buttons', async ({ kits, page, testData, apiClient }) => {
    // Setup: Create kit with multiple contents
    const { part: part1 } = await testData.parts.create({
      overrides: { description: 'Concurrent Test Part 1' },
    });
    const { part: part2 } = await testData.parts.create({
      overrides: { description: 'Concurrent Test Part 2' },
    });
    const partMetadata1 = await apiClient.apiRequest<PartKitReservationsResponseSchema_d12d9a5>(() =>
      apiClient.GET('/api/parts/{part_key}/kit-reservations', {
        params: { path: { part_key: part1.key } },
      })
    );
    const partMetadata2 = await apiClient.apiRequest<PartKitReservationsResponseSchema_d12d9a5>(() =>
      apiClient.GET('/api/parts/{part_key}/kit-reservations', {
        params: { path: { part_key: part2.key } },
      })
    );

    const kit = await testData.kits.create({ overrides: { name: 'Concurrent Kit' } });
    const content1 = await testData.kits.addContent(kit.id, {
      partId: partMetadata1.part_id,
      requiredPerUnit: 1,
    });
    const content2 = await testData.kits.addContent(kit.id, {
      partId: partMetadata2.part_id,
      requiredPerUnit: 2,
    });

    // Navigate to kit detail
    await kits.gotoOverview();
    const searchReady = waitForListLoading(page, 'kits.overview', 'ready');
    await kits.search(kit.name);
    await searchReady;
    await kits.openDetailFromCard(kit.id);
    await waitForListLoading(page, 'kits.detail.contents', 'ready');

    // Delete first content
    const delete1Success = waitTestEvent<FormTestEvent>(page, 'form', (event) =>
      event.formId === 'KitContent:delete' && event.phase === 'success' && event.metadata?.contentId === content1.id
    );
    await kits.detailRowDeleteButton(content1.id).click();
    await delete1Success;

    // Delete second content
    const delete2Success = waitTestEvent<FormTestEvent>(page, 'form', (event) =>
      event.formId === 'KitContent:delete' && event.phase === 'success' && event.metadata?.contentId === content2.id
    );
    await kits.detailRowDeleteButton(content2.id).click();
    await delete2Success;
    await waitForListLoading(page, 'kits.detail.contents', 'ready');

    // Verify both undo buttons are visible
    const undo1 = page.getByTestId(`kits.detail.toast.undo.${content1.id}`);
    const undo2 = page.getByTestId(`kits.detail.toast.undo.${content2.id}`);
    await expect(undo1).toBeVisible();
    await expect(undo2).toBeVisible();

    // Undo only the second deletion
    const undo2Success = waitTestEvent<FormTestEvent>(page, 'form', (event) =>
      event.formId === 'KitContent:restore' && event.phase === 'success' && event.metadata?.undo === true
    );
    await undo2.click();
    await undo2Success;
    await waitForListLoading(page, 'kits.detail.contents', 'ready');

    // Verify: content2 restored, content1 still deleted
    // Note: We check by part key, not by content ID, because the backend may reuse deleted IDs
    const backendDetail = await testData.kits.getDetail(kit.id);
    const backendContents = (backendDetail.contents ?? []) as KitContentDetailSchema_b98797e[];
    expect(backendContents.find((c) => c.part.key === part1.key)).toBeUndefined();
    const restored2 = backendContents.find((c) => c.part.key === part2.key);
    expect(restored2).toBeDefined();
    expect(restored2?.required_per_unit).toBe(2);
  });

  test('preserves note and required_per_unit when undoing', async ({ kits, page, testData, apiClient }) => {
    // Setup
    const { part } = await testData.parts.create({
      overrides: { description: 'Preserve Attributes Part' },
    });
    const partMetadata = await apiClient.apiRequest<PartKitReservationsResponseSchema_d12d9a5>(() =>
      apiClient.GET('/api/parts/{part_key}/kit-reservations', {
        params: { path: { part_key: part.key } },
      })
    );
    const kit = await testData.kits.create();
    const content = await testData.kits.addContent(kit.id, {
      partId: partMetadata.part_id,
      requiredPerUnit: 7,
      note: 'Important assembly note',
    });

    // Navigate to kit detail
    await kits.gotoOverview();
    const searchReady = waitForListLoading(page, 'kits.overview', 'ready');
    await kits.search(kit.name);
    await searchReady;
    await kits.openDetailFromCard(kit.id);
    await waitForListLoading(page, 'kits.detail.contents', 'ready');

    // Delete content
    const deleteSuccess = waitTestEvent<FormTestEvent>(page, 'form', (event) =>
      event.formId === 'KitContent:delete' && event.phase === 'success'
    );
    await kits.detailRowDeleteButton(content.id).click();
    await deleteSuccess;
    await waitForListLoading(page, 'kits.detail.contents', 'ready');

    // Undo deletion
    const undoSuccess = waitTestEvent<FormTestEvent>(page, 'form', (event) =>
      event.formId === 'KitContent:restore' && event.phase === 'success' && event.metadata?.undo === true
    );
    const undoButton = page.getByTestId(`kits.detail.toast.undo.${content.id}`);
    await undoButton.click();
    await undoSuccess;
    await waitForListLoading(page, 'kits.detail.contents', 'ready');

    // Verify attributes preserved in backend
    const backendDetail = await testData.kits.getDetail(kit.id);
    const backendContents = (backendDetail.contents ?? []) as KitContentDetailSchema_b98797e[];
    const restoredContent = backendContents.find((c) => c.part.key === part.key);
    expect(restoredContent).toBeDefined();
    expect(restoredContent?.required_per_unit).toBe(7);
    expect(restoredContent?.note).toBe('Important assembly note');
  });
});
