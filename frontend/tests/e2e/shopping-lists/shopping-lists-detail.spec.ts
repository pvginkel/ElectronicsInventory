import { expect } from '@playwright/test';
import { test } from '../../support/fixtures';
import { waitForListLoading, waitForUiState } from '../../support/helpers';
import type { PartKitReservationsResponseSchema_d12d9a5 } from '@/lib/api/generated/hooks';

test.describe('Shopping List Detail', () => {
  test('detail header surfaces linked kit chips', async ({ shoppingLists, kits, testData, apiClient }) => {
    const { part } = await testData.parts.create({ overrides: { description: 'Attribution Flow Part' } });
    const partMetadata = await apiClient.apiRequest<PartKitReservationsResponseSchema_d12d9a5>(() =>
      apiClient.GET('/api/parts/{part_key}/kit-reservations', {
        params: { path: { part_key: part.key } },
      })
    );
    const partId = partMetadata.part_id;

    const { kit } = await testData.kits.createWithContents({
      overrides: {
        name: testData.kits.randomKitName('Attribution Kit'),
        build_target: 2,
      },
      contents: [
        { partId, requiredPerUnit: 5 },
      ],
    });

    const list = await testData.shoppingLists.create({
      name: testData.shoppingLists.randomName('Attribution List'),
      description: null,
    });

    await apiClient.POST('/api/kits/{kit_id}/shopping-lists', {
      params: { path: { kit_id: kit.id } },
      body: {
        shopping_list_id: list.id,
        units: kit.build_target,
        honor_reserved: true,
        note_prefix: null,
        new_list_name: null,
        new_list_description: null,
      },
    });

    const kitsReady = waitForListLoading(shoppingLists.playwrightPage, 'shoppingLists.detail.kits', 'ready');

    await shoppingLists.gotoKanban(list.id);
    const kitsEvent = await kitsReady;
    expect(kitsEvent.metadata).toMatchObject({
      renderLocation: 'body',
    });

    await expect(shoppingLists.detailKitChips).toBeVisible();
    const kitChip = shoppingLists.kitChip(kit.id);
    await expect(kitChip).toContainText(kit.name);
    await expect(kitChip).toContainText(/Active/i);

    await kitChip.click();
    await expect(kits.detailLayout).toBeVisible();
    await expect(kits.detailTitle).toHaveText(kit.name);
  });

  test('completed lists render read-only Kanban with completed instrumentation', async ({ shoppingLists, testData }) => {
    const seller = await testData.sellers.create({ overrides: { name: testData.sellers.randomSellerName() } });
    const { part } = await testData.parts.create({ overrides: { description: 'Completed View Part' } });

    const list = await testData.shoppingLists.createWithLines({
      listOverrides: { name: testData.shoppingLists.randomName('Completed Read Only') },
      lines: [{ partKey: part.key, needed: 2, sellerId: seller.id }],
    });

    await testData.shoppingLists.createSellerGroup(list.id, seller.id);
    await testData.shoppingLists.markDone(list.id);

    const event = await shoppingLists.gotoKanban(list.id);
    expect(event.metadata?.status).toBe('done');

    // Verify the Kanban board is visible
    await expect(shoppingLists.kanbanBoard).toBeVisible();
    await shoppingLists.expectStatus(/Completed/i);

    // Completed boards should not show the skeleton column (no adding sellers)
    await expect(shoppingLists.kanbanSkeletonColumn).toHaveCount(0);
  });
});

test.describe('Kit Chip Unlink Flow', () => {
  test('kit chip reveals unlink button on hover and supports unlink interaction', async ({ shoppingLists, kits, testData, apiClient, toastHelper }) => {
    // Create a part and kit with contents
    const { part } = await testData.parts.create({ overrides: { description: 'Unlink Flow Part' } });
    const partMetadata = await apiClient.apiRequest<PartKitReservationsResponseSchema_d12d9a5>(() =>
      apiClient.GET('/api/parts/{part_key}/kit-reservations', {
        params: { path: { part_key: part.key } },
      })
    );
    const partId = partMetadata.part_id;

    const { kit } = await testData.kits.createWithContents({
      overrides: {
        name: testData.kits.randomKitName('Unlink Test Kit'),
        build_target: 3,
      },
      contents: [{ partId, requiredPerUnit: 2 }],
    });

    // Create a shopping list and link the kit to it
    const list = await testData.shoppingLists.create({
      name: testData.shoppingLists.randomName('Unlink Test List'),
      description: null,
    });

    await apiClient.POST('/api/kits/{kit_id}/shopping-lists', {
      params: { path: { kit_id: kit.id } },
      body: {
        shopping_list_id: list.id,
        units: kit.build_target,
        honor_reserved: true,
        note_prefix: null,
        new_list_name: null,
        new_list_description: null,
      },
    });

    await shoppingLists.gotoKanban(list.id);
    await waitForListLoading(shoppingLists.playwrightPage, 'shoppingLists.detail.kits', 'ready');

    const kitChip = shoppingLists.kitChip(kit.id);
    await expect(kitChip).toBeVisible();
    await expect(kitChip).toContainText(kit.name);

    // Verify unlink button is hidden initially
    const unlinkButton = shoppingLists.playwrightPage.getByTestId(`shopping-lists.detail.body.kits.${kit.id}.unlink`);
    await expect(unlinkButton).toHaveCSS('opacity', '0');

    // Hover over chip to reveal unlink button
    await kitChip.hover();
    await expect(unlinkButton).toHaveCSS('opacity', '1');

    // Set up event listeners for unlink flow instrumentation
    const openEvent = waitForUiState(shoppingLists.playwrightPage, 'shoppingLists.detail.kitUnlinkFlow', 'open');
    const submitEvent = waitForUiState(shoppingLists.playwrightPage, 'shoppingLists.detail.kitUnlinkFlow', 'submit');
    const successEvent = waitForUiState(shoppingLists.playwrightPage, 'shoppingLists.detail.kitUnlinkFlow', 'success');

    // Click unlink button
    await unlinkButton.click();

    // Verify open event emitted
    const openEventData = await openEvent;
    expect(openEventData.metadata).toMatchObject({
      listId: list.id,
      action: 'unlink',
      targetKitId: kit.id,
    });

    // Verify confirmation dialog appears
    const confirmDialog = shoppingLists.playwrightPage.getByTestId('shopping-lists.detail.kit-unlink.dialog');
    await expect(confirmDialog).toBeVisible();
    await expect(confirmDialog).toContainText(kit.name);
    await expect(confirmDialog).toContainText(/unlink kit/i);
    await expect(confirmDialog).toContainText(/will not delete/i);

    // Confirm unlink
    await confirmDialog.getByRole('button', { name: /unlink kit/i }).click();

    // Verify submit and success events
    const [submitEventData, successEventData] = await Promise.all([submitEvent, successEvent]);
    expect(submitEventData.metadata).toMatchObject({
      listId: list.id,
      action: 'unlink',
      targetKitId: kit.id,
    });
    expect(successEventData.metadata).toMatchObject({
      listId: list.id,
      action: 'unlink',
      targetKitId: kit.id,
      noop: false,
    });

    // Verify success toast
    await toastHelper.expectSuccessToast(new RegExp(`unlinked.*${kit.name}`, 'i'));
    await toastHelper.dismissToast({ all: true });

    // Verify kit chip is removed from the page
    await expect(kitChip).toHaveCount(0);

    // Verify navigation to kit detail still shows the kit exists
    await kits.goto(`/kits/${kit.id}`);
    await expect(kits.detailLayout).toBeVisible();
    await expect(kits.detailTitle).toHaveText(kit.name);
  });

  test('kit chip unlink dialog can be cancelled without unlinking', async ({ shoppingLists, testData, apiClient }) => {
    const { part } = await testData.parts.create({ overrides: { description: 'Cancel Unlink Part' } });
    const partMetadata = await apiClient.apiRequest<PartKitReservationsResponseSchema_d12d9a5>(() =>
      apiClient.GET('/api/parts/{part_key}/kit-reservations', {
        params: { path: { part_key: part.key } },
      })
    );
    const partId = partMetadata.part_id;

    const { kit } = await testData.kits.createWithContents({
      overrides: {
        name: testData.kits.randomKitName('Cancel Unlink Kit'),
        build_target: 2,
      },
      contents: [{ partId, requiredPerUnit: 1 }],
    });

    const list = await testData.shoppingLists.create({
      name: testData.shoppingLists.randomName('Cancel Test List'),
      description: null,
    });

    await apiClient.POST('/api/kits/{kit_id}/shopping-lists', {
      params: { path: { kit_id: kit.id } },
      body: {
        shopping_list_id: list.id,
        units: kit.build_target,
        honor_reserved: true,
        note_prefix: null,
        new_list_name: null,
        new_list_description: null,
      },
    });

    await shoppingLists.gotoKanban(list.id);
    await waitForListLoading(shoppingLists.playwrightPage, 'shoppingLists.detail.kits', 'ready');

    const kitChip = shoppingLists.kitChip(kit.id);
    await expect(kitChip).toBeVisible();

    const unlinkButton = shoppingLists.playwrightPage.getByTestId(`shopping-lists.detail.body.kits.${kit.id}.unlink`);
    await kitChip.hover();
    await unlinkButton.click();

    const confirmDialog = shoppingLists.playwrightPage.getByTestId('shopping-lists.detail.kit-unlink.dialog');
    await expect(confirmDialog).toBeVisible();

    // Cancel the dialog
    await confirmDialog.getByRole('button', { name: /cancel/i }).click();
    await expect(confirmDialog).toHaveCount(0);

    // Verify kit chip still exists
    await expect(kitChip).toBeVisible();
    await expect(kitChip).toContainText(kit.name);
  });

  test('completed shopping lists hide unlink buttons on kit chips', async ({ shoppingLists, testData, apiClient }) => {
    const seller = await testData.sellers.create({ overrides: { name: testData.sellers.randomSellerName() } });
    const { part } = await testData.parts.create({ overrides: { description: 'Completed List Part' } });
    const partMetadata = await apiClient.apiRequest<PartKitReservationsResponseSchema_d12d9a5>(() =>
      apiClient.GET('/api/parts/{part_key}/kit-reservations', {
        params: { path: { part_key: part.key } },
      })
    );
    const partId = partMetadata.part_id;

    const { kit } = await testData.kits.createWithContents({
      overrides: {
        name: testData.kits.randomKitName('Completed List Kit'),
        build_target: 1,
      },
      contents: [{ partId, requiredPerUnit: 1 }],
    });

    const list = await testData.shoppingLists.createWithLines({
      listOverrides: { name: testData.shoppingLists.randomName('Completed List') },
      lines: [{ partKey: part.key, needed: 1, sellerId: seller.id }],
    });

    await apiClient.POST('/api/kits/{kit_id}/shopping-lists', {
      params: { path: { kit_id: kit.id } },
      body: {
        shopping_list_id: list.id,
        units: kit.build_target,
        honor_reserved: true,
        note_prefix: null,
        new_list_name: null,
        new_list_description: null,
      },
    });

    await testData.shoppingLists.markDone(list.id);

    await shoppingLists.gotoKanban(list.id);
    await waitForListLoading(shoppingLists.playwrightPage, 'shoppingLists.detail.kits', 'ready');

    // Verify kit chip is visible but unlink button doesn't exist
    const kitChip = shoppingLists.kitChip(kit.id);
    await expect(kitChip).toBeVisible();
    await expect(kitChip).toContainText(kit.name);

    const unlinkButton = shoppingLists.playwrightPage.getByTestId(`shopping-lists.detail.body.kits.${kit.id}.unlink`);
    await expect(unlinkButton).toHaveCount(0);
  });

  test('multiple kit chips can be unlinked sequentially', async ({ shoppingLists, testData, apiClient, toastHelper }) => {
    const { part } = await testData.parts.create({ overrides: { description: 'Multi Kit Part' } });
    const partMetadata = await apiClient.apiRequest<PartKitReservationsResponseSchema_d12d9a5>(() =>
      apiClient.GET('/api/parts/{part_key}/kit-reservations', {
        params: { path: { part_key: part.key } },
      })
    );
    const partId = partMetadata.part_id;

    const { kit: kitA } = await testData.kits.createWithContents({
      overrides: {
        name: testData.kits.randomKitName('Multi Kit A'),
        build_target: 1,
      },
      contents: [{ partId, requiredPerUnit: 1 }],
    });

    const { kit: kitB } = await testData.kits.createWithContents({
      overrides: {
        name: testData.kits.randomKitName('Multi Kit B'),
        build_target: 2,
      },
      contents: [{ partId, requiredPerUnit: 1 }],
    });

    const list = await testData.shoppingLists.create({
      name: testData.shoppingLists.randomName('Multi Kit List'),
      description: null,
    });

    // Link both kits to the list
    await apiClient.POST('/api/kits/{kit_id}/shopping-lists', {
      params: { path: { kit_id: kitA.id } },
      body: {
        shopping_list_id: list.id,
        units: kitA.build_target,
        honor_reserved: true,
        note_prefix: null,
        new_list_name: null,
        new_list_description: null,
      },
    });

    await apiClient.POST('/api/kits/{kit_id}/shopping-lists', {
      params: { path: { kit_id: kitB.id } },
      body: {
        shopping_list_id: list.id,
        units: kitB.build_target,
        honor_reserved: true,
        note_prefix: null,
        new_list_name: null,
        new_list_description: null,
      },
    });

    await shoppingLists.gotoKanban(list.id);
    await waitForListLoading(shoppingLists.playwrightPage, 'shoppingLists.detail.kits', 'ready');

    // Verify both chips are visible
    const kitChipA = shoppingLists.kitChip(kitA.id);
    const kitChipB = shoppingLists.kitChip(kitB.id);
    await expect(kitChipA).toBeVisible();
    await expect(kitChipB).toBeVisible();

    // Unlink first kit
    const unlinkButtonA = shoppingLists.playwrightPage.getByTestId(`shopping-lists.detail.body.kits.${kitA.id}.unlink`);
    await kitChipA.hover();
    await unlinkButtonA.click();
    const confirmDialogA = shoppingLists.playwrightPage.getByTestId('shopping-lists.detail.kit-unlink.dialog');
    await expect(confirmDialogA).toBeVisible();
    await confirmDialogA.getByRole('button', { name: /unlink kit/i }).click();
    await toastHelper.expectSuccessToast(new RegExp(`unlinked.*${kitA.name}`, 'i'));
    await toastHelper.dismissToast({ all: true });
    await expect(kitChipA).toHaveCount(0);

    // Verify second kit still visible
    await expect(kitChipB).toBeVisible();

    // Unlink second kit
    const unlinkButtonB = shoppingLists.playwrightPage.getByTestId(`shopping-lists.detail.body.kits.${kitB.id}.unlink`);
    await kitChipB.hover();
    await unlinkButtonB.click();
    const confirmDialogB = shoppingLists.playwrightPage.getByTestId('shopping-lists.detail.kit-unlink.dialog');
    await expect(confirmDialogB).toBeVisible();
    await confirmDialogB.getByRole('button', { name: /unlink kit/i }).click();
    await toastHelper.expectSuccessToast(new RegExp(`unlinked.*${kitB.name}`, 'i'));
    await toastHelper.dismissToast({ all: true });

    // Verify both chips removed
    await expect(kitChipA).toHaveCount(0);
    await expect(kitChipB).toHaveCount(0);
    await expect(shoppingLists.detailKitChips).toHaveCount(0);
  });
});
