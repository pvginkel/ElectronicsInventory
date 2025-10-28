import { expect } from '@playwright/test';
import { test } from '../../support/fixtures';
import { expectConsoleError, waitTestEvent, waitForListLoading, waitForUiState } from '../../support/helpers';
import type { FormTestEvent } from '@/types/test-events';
import type { PartKitReservationsResponseSchema_d12d9a5 } from '@/lib/api/generated/hooks';

test.describe('Shopping List Detail Phase 2', () => {
  test('concept header surfaces linked kit chips', async ({ shoppingLists, kits, testData, apiClient }) => {
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
      name: testData.shoppingLists.randomName('Attribution Concept List'),
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

    await shoppingLists.gotoConcept(list.id);
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

  test('concept header badges and toolbar surface Mark Ready instrumentation', async ({ shoppingLists, testData, toastHelper }) => {
    const seller = await testData.sellers.create({ overrides: { name: testData.sellers.randomSellerName() } });
    const { part: partA } = await testData.parts.create({ overrides: { description: 'Concept Header Part A' } });
    const { part: partB } = await testData.parts.create({ overrides: { description: 'Concept Header Part B' } });

    const list = await testData.shoppingLists.createWithLines({
      listOverrides: { name: testData.shoppingLists.randomName('Concept Header Regression') },
      lines: [
        { partKey: partA.key, needed: 3, sellerId: seller.id },
        { partKey: partB.key, needed: 5, sellerId: seller.id },
      ],
    });

    await shoppingLists.gotoConcept(list.id);
    await expectConsoleError(
      shoppingLists.playwrightPage,
      /Unable to preventDefault inside passive event listener invocation\./
    );

    await expect(shoppingLists.conceptToolbar).toBeVisible();
    await expect(shoppingLists.conceptBadge('total')).toHaveText(/Total: 2/i);
    await expect(shoppingLists.conceptBadge('new')).toHaveText(/New: 2/i);
    await expect(shoppingLists.conceptBadge('ordered')).toHaveText(/Ordered: 0/i);
    await expect(shoppingLists.conceptBadge('done')).toHaveText(/Completed: 0/i);
    await expect(shoppingLists.playwrightPage.getByTestId('shopping-lists.concept.header.edit')).toHaveText(/edit list/i);

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
    expect(submitEvent.metadata).toMatchObject({ lineCount: 2 });
    expect(successEvent.metadata).toMatchObject({ lineCount: 2 });

    await toastHelper.expectSuccessToast(/marked ready/i);
    await toastHelper.dismissToast({ all: true });
  });

  test('part selector sorts alphabetically, exposes description with key, and supports wheel scrolling', async ({ shoppingLists, testData }) => {
    const seller = await testData.sellers.create({ overrides: { name: testData.sellers.randomSellerName() } });
    const descriptions = [
      'Module Alpha',
      'Module Bravo',
      'Module Charlie',
      'Module Delta',
      'Module Echo',
      'Module Foxtrot',
      'Module Golf',
      'Module Hotel',
      'Module India',
      'Module Juliet',
      'Module Kilo',
      'Module Lima',
    ];

    const createdParts: Array<{ description: string; key: string }> = [];
    for (const description of descriptions) {
      const { part } = await testData.parts.create({ overrides: { description } });
      createdParts.push({ description, key: part.key });
    }
    const alphaPart = createdParts.find(part => part.description === 'Module Alpha');
    if (!alphaPart) {
      throw new Error('Failed to seed Module Alpha part');
    }

    const { part: seedPart } = await testData.parts.create({ overrides: { description: 'Seed Part' } });

    const list = await testData.shoppingLists.createWithLines({
      listOverrides: { name: testData.shoppingLists.randomName('Part Selector Ergonomics') },
      lines: [
        { partKey: seedPart.key, needed: 1, sellerId: seller.id },
      ],
    });

    await shoppingLists.gotoConcept(list.id);
    await shoppingLists.playwrightPage.getByTestId('shopping-lists.concept.table.add').click();

    const dialog = shoppingLists.playwrightPage.getByTestId('ShoppingListLineForm:add.dialog');
    await expect(dialog).toBeVisible();

    await waitForListLoading(shoppingLists.playwrightPage, 'parts.selector', 'ready');
    const partInput = dialog.getByTestId('parts.selector.input');
    await partInput.click();

    const listbox = shoppingLists.playwrightPage.getByRole('listbox');
    const optionLabels = (await listbox.locator('[role="option"]').allInnerTexts())
      .map(text => text.split('\n')[0].trim());
    const expectedModuleOrder = [...createdParts]
      .map(({ description, key }) => `${description} (${key})`)
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    const observedModuleOrder = optionLabels.filter(label =>
      createdParts.some(part => label.includes(`(${part.key})`))
    );
    expect(observedModuleOrder).toEqual(expectedModuleOrder);

    const initialScroll = await listbox.evaluate(node => node.parentElement ? node.parentElement.scrollTop : 0);
    await listbox.evaluate(node => {
      const container = node.parentElement as HTMLElement | null;
      if (!container) {
        return;
      }
      const event = new WheelEvent('wheel', { deltaY: 240, cancelable: true });
      container.dispatchEvent(event);
    });
    await expect.poll(async () => listbox.evaluate(node => node.parentElement ? node.parentElement.scrollTop : 0)).toBeGreaterThan(initialScroll);

    await partInput.fill('Module');
    const filteredLabels = (await listbox.locator('[role="option"]').allInnerTexts())
      .map(text => text.split('\n')[0].trim());
    const filteredObserved = filteredLabels.filter(label =>
      createdParts.some(part => label.includes(`(${part.key})`))
    );
    expect(filteredObserved).toEqual(expectedModuleOrder);

    await listbox.getByRole('option', { name: new RegExp(`^Module Alpha \\(${alphaPart.key}\\)`) }).first().click();
    await expect(dialog.getByTestId('parts.selector.selected')).toBeVisible();
    await expect(dialog.getByTestId('parts.selector.selected').locator('div').first()).toHaveText(`Module Alpha (${alphaPart.key})`);
  });

  test('concept detail header and toolbar stay pinned while lines scroll', async ({ shoppingLists, testData }) => {
    const seller = await testData.sellers.create({ overrides: { name: testData.sellers.randomSellerName() } });
    const parts = await Promise.all(
      Array.from({ length: 24 }, (_, index) => testData.parts.create({ overrides: { description: `Scrollable Concept Part ${index + 1}` } })),
    );

    const list = await testData.shoppingLists.createWithLines({
      listOverrides: { name: testData.shoppingLists.randomName('Concept Scroll Anchors') },
      lines: parts.map(({ part }) => ({ partKey: part.key, needed: 1, sellerId: seller.id })),
    });

    await shoppingLists.gotoConcept(list.id);
    await expect(shoppingLists.detailLayout).toBeVisible();

    const headerBefore = await shoppingLists.getDetailHeaderRect();
    const toolbarBefore = await shoppingLists.getToolbarRect('concept');

    await shoppingLists.scrollDetailContent('concept', 'bottom');
    await expect.poll(() => shoppingLists.detailContentScrollTop('concept')).toBeGreaterThan(0);

    const headerAfter = await shoppingLists.getDetailHeaderRect();
    const toolbarAfter = await shoppingLists.getToolbarRect('concept');

    expect(Math.abs(headerAfter.top - headerBefore.top)).toBeLessThan(1);
    expect(Math.abs(toolbarAfter.top - toolbarBefore.top)).toBeLessThan(1);
  });

  test('seller group edit dialog tracks instrumentation and hides note when cleared', async ({ shoppingLists, testData, testEvents, toastHelper }) => {
    const seller = await testData.sellers.create({ overrides: { name: testData.sellers.randomSellerName() } });
    const { part: partA } = await testData.parts.create({ overrides: { description: 'Seller Edit Part A' } });
    const { part: partB } = await testData.parts.create({ overrides: { description: 'Seller Edit Part B' } });

    const list = await testData.shoppingLists.createWithLines({
      listOverrides: { name: testData.shoppingLists.randomName('Seller Group Edit') },
      lines: [
        { partKey: partA.key, needed: 4, sellerId: seller.id },
        { partKey: partB.key, needed: 3, sellerId: seller.id },
      ],
    });

    await testData.shoppingLists.markReady(list.id);
    await shoppingLists.gotoReady(list.id);

    const openDialog = shoppingLists.readyGroupEditButton(seller.name);
    await expect(openDialog).toBeVisible();
    await openDialog.click();

    const dialog = shoppingLists.playwrightPage.getByTestId('shopping-lists.ready.group.note-dialog');
    await expect(dialog).toBeVisible();

    const submitEvent = testEvents.waitForEvent(event => event.kind === 'form' && (event as FormTestEvent).formId === `ShoppingListSellerOrderNote:${seller.id}` && (event as FormTestEvent).phase === 'submit');
    const successEvent = testEvents.waitForEvent(event => event.kind === 'form' && (event as FormTestEvent).formId === `ShoppingListSellerOrderNote:${seller.id}` && (event as FormTestEvent).phase === 'success');

    const textarea = dialog.getByTestId(`ShoppingListSellerOrderNote:${seller.id}.field.note`);
    await textarea.fill('Bundle with power supply order');
    await dialog.getByRole('button', { name: /save notes/i }).click();

    await Promise.all([submitEvent, successEvent]);
    await toastHelper.expectSuccessToast(/saved order note/i);
    await toastHelper.dismissToast({ all: true });

    const notePanel = shoppingLists.readyGroupBySeller(seller.name).getByTestId(/order-note$/);
    await expect(notePanel).toContainText('Bundle with power supply order');

    await shoppingLists.readyGroupEditButton(seller.name).click();
    const dialogAgain = shoppingLists.playwrightPage.getByTestId('shopping-lists.ready.group.note-dialog');
    await dialogAgain.getByTestId(`ShoppingListSellerOrderNote:${seller.id}.field.note`).fill('   ');
    await dialogAgain.getByRole('button', { name: /save notes/i }).click();

    await toastHelper.expectSuccessToast(/cleared order note/i);
    await toastHelper.dismissToast({ all: true });
    await expect(notePanel).toHaveCount(0);
  });

  test('ready detail header and toolbar stay pinned while seller groups scroll', async ({ shoppingLists, testData }) => {
    const seller = await testData.sellers.create({ overrides: { name: testData.sellers.randomSellerName() } });
    const parts = await Promise.all(
      Array.from({ length: 18 }, (_, index) => testData.parts.create({ overrides: { description: `Scrollable Ready Part ${index + 1}` } })),
    );

    const list = await testData.shoppingLists.createWithLines({
      listOverrides: { name: testData.shoppingLists.randomName('Ready Scroll Anchors') },
      lines: parts.map(({ part }) => ({ partKey: part.key, needed: 1, sellerId: seller.id })),
    });

    await testData.shoppingLists.markReady(list.id);
    await shoppingLists.gotoReady(list.id);

    const headerBefore = await shoppingLists.getDetailHeaderRect();
    const toolbarBefore = await shoppingLists.getToolbarRect('ready');

    await shoppingLists.scrollDetailContent('ready', 'bottom');
    await expect.poll(() => shoppingLists.detailContentScrollTop('ready')).toBeGreaterThan(0);

    const headerAfter = await shoppingLists.getDetailHeaderRect();
    const toolbarAfter = await shoppingLists.getToolbarRect('ready');

    expect(Math.abs(headerAfter.top - headerBefore.top)).toBeLessThan(1);
    expect(Math.abs(toolbarAfter.top - toolbarBefore.top)).toBeLessThan(1);
  });

  test('ready inline actions present explicit controls and irreversible messaging', async ({ shoppingLists, testData, toastHelper }) => {
    const seller = await testData.sellers.create({ overrides: { name: testData.sellers.randomSellerName() } });
    const { part } = await testData.parts.create({ overrides: { description: 'Inline Actions Part' } });

    const list = await testData.shoppingLists.createWithLines({
      listOverrides: { name: testData.shoppingLists.randomName('Ready Inline Actions') },
      lines: [{ partKey: part.key, needed: 6, sellerId: seller.id }],
    });

    await testData.shoppingLists.markReady(list.id);
    await shoppingLists.gotoReady(list.id);

    const markButton = shoppingLists.readyLineAction(part.description, 'mark-ordered');
    await expect(markButton).toBeVisible();
    await markButton.click();

    const orderDialog = shoppingLists.playwrightPage.getByTestId('shopping-lists.ready.order-line.dialog');
    await expect(orderDialog).toBeVisible();
    await orderDialog.getByTestId('shopping-lists.ready.order-line.field.orderedQuantity').fill('5');
    await orderDialog.getByTestId('shopping-lists.ready.order-line.submit').click();
    await toastHelper.expectSuccessToast(/marked .* ordered/i);
    await toastHelper.dismissToast({ all: true });

    await expect(shoppingLists.readyLineStatusCell(part.description)).toContainText(/ordered/i);

    const updateStockButton = shoppingLists.readyLineAction(part.description, 'update-stock');
    await expect(updateStockButton).toBeVisible();
    await expect(updateStockButton).toHaveClass(/whitespace-nowrap/);

    const revertButton = shoppingLists.readyLineAction(part.description, 'revert');
    await expect(revertButton).toBeVisible();
    await revertButton.click();
    await toastHelper.expectSuccessToast(/reverted/i);
    await toastHelper.dismissToast({ all: true });

    const editButton = shoppingLists.readyLineAction(part.description, 'edit');
    await expect(editButton).toBeVisible();
    await editButton.click();
    const editDialog = shoppingLists.playwrightPage.getByRole('dialog', { name: /edit line/i });
    await expect(editDialog).toBeVisible();
    await editDialog.getByRole('button', { name: /save/i }).click();

    await shoppingLists.readyMarkDoneButton.click();
    const confirmDialog = shoppingLists.playwrightPage.getByTestId('shopping-lists.ready.archive-dialog');
    await expect(confirmDialog).toBeVisible();
    await expect(confirmDialog).toContainText(/irreversible/i);
    await confirmDialog.getByRole('button', { name: /cancel/i }).click();
  });

  test('completed lists render read-only ready view with completed instrumentation', async ({ shoppingLists, testData }) => {
    const seller = await testData.sellers.create({ overrides: { name: testData.sellers.randomSellerName() } });
    const { part } = await testData.parts.create({ overrides: { description: 'Completed View Part' } });

    const list = await testData.shoppingLists.createWithLines({
      listOverrides: { name: testData.shoppingLists.randomName('Completed Read Only') },
      lines: [{ partKey: part.key, needed: 2, sellerId: seller.id }],
    });

    await testData.shoppingLists.markReady(list.id);
    await testData.shoppingLists.markDone(list.id);

    const event = await shoppingLists.gotoReady(list.id);
    expect(event.metadata?.view).toBe('completed');

    await expect(shoppingLists.readyToolbar.getByTestId('shopping-lists.ready.toolbar.completed')).toBeVisible();
    await expect(shoppingLists.readyMarkDoneButton).toHaveCount(0);
    await expect(shoppingLists.readyGroupEditButton(seller.name)).toHaveCount(0);
    await expect(shoppingLists.readyGroupBySeller(seller.name).getByTestId(/order-group$/)).toHaveCount(0);
    await expect(shoppingLists.readyLineAction(part.description, 'mark-ordered')).toHaveCount(0);
    await expect(shoppingLists.readyLineAction(part.description, 'update-stock')).toHaveCount(0);
    await expect(shoppingLists.readyLineAction(part.description, 'revert')).toHaveCount(0);
    await expect(shoppingLists.readyLineAction(part.description, 'edit')).toHaveCount(0);
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

    await shoppingLists.gotoConcept(list.id);
    await waitForListLoading(shoppingLists.playwrightPage, 'shoppingLists.detail.kits', 'ready');

    const kitChip = shoppingLists.kitChip(kit.id);
    await expect(kitChip).toBeVisible();
    await expect(kitChip).toContainText(kit.name);

    // Verify unlink button is hidden initially
    const unlinkButton = shoppingLists.playwrightPage.getByTestId(`shopping-lists.concept.body.kits.${kit.id}.unlink`);
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

    await shoppingLists.gotoConcept(list.id);
    await waitForListLoading(shoppingLists.playwrightPage, 'shoppingLists.detail.kits', 'ready');

    const kitChip = shoppingLists.kitChip(kit.id);
    await expect(kitChip).toBeVisible();

    const unlinkButton = shoppingLists.playwrightPage.getByTestId(`shopping-lists.concept.body.kits.${kit.id}.unlink`);
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

    await testData.shoppingLists.markReady(list.id);
    await testData.shoppingLists.markDone(list.id);

    await shoppingLists.gotoReady(list.id);
    await waitForListLoading(shoppingLists.playwrightPage, 'shoppingLists.detail.kits', 'ready');

    // Verify kit chip is visible but unlink button doesn't exist
    const kitChip = shoppingLists.kitChip(kit.id);
    await expect(kitChip).toBeVisible();
    await expect(kitChip).toContainText(kit.name);

    const unlinkButton = shoppingLists.playwrightPage.getByTestId(`shopping-lists.concept.body.kits.${kit.id}.unlink`);
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

    await shoppingLists.gotoConcept(list.id);
    await waitForListLoading(shoppingLists.playwrightPage, 'shoppingLists.detail.kits', 'ready');

    // Verify both chips are visible
    const kitChipA = shoppingLists.kitChip(kitA.id);
    const kitChipB = shoppingLists.kitChip(kitB.id);
    await expect(kitChipA).toBeVisible();
    await expect(kitChipB).toBeVisible();

    // Unlink first kit
    const unlinkButtonA = shoppingLists.playwrightPage.getByTestId(`shopping-lists.concept.body.kits.${kitA.id}.unlink`);
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
    const unlinkButtonB = shoppingLists.playwrightPage.getByTestId(`shopping-lists.concept.body.kits.${kitB.id}.unlink`);
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
