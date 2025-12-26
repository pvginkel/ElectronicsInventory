import { expect } from '@playwright/test';
import { test } from '../../support/fixtures';
import { waitForListLoading, waitForUiState } from '../../support/helpers';
import type { PartKitReservationsResponseSchema_d12d9a5 } from '@/lib/api/generated/hooks';

test.describe('Pick list detail workspace', () => {
  test('shows live availability and highlights shortfalls', async ({ pickLists, testData, apiClient, page }) => {
    const { part: partA } = await testData.parts.create({
      overrides: { description: 'Control IC' },
    });
    const { part: partB } = await testData.parts.create({
      overrides: { description: 'Electrolytic Capacitor' },
    });

    const partAReservations = await apiClient.apiRequest<PartKitReservationsResponseSchema_d12d9a5>(() =>
      apiClient.GET('/api/parts/{part_key}/kit-reservations', {
        params: { path: { part_key: partA.key } },
      })
    );
    const partBReservations = await apiClient.apiRequest<PartKitReservationsResponseSchema_d12d9a5>(() =>
      apiClient.GET('/api/parts/{part_key}/kit-reservations', {
        params: { path: { part_key: partB.key } },
      })
    );
    const partAId = partAReservations.part_id;
    const partBId = partBReservations.part_id;

    const stockBoxA = await testData.boxes.create({
      overrides: { description: 'Pick List Box A' },
    });
    const stockBoxB = await testData.boxes.create({
      overrides: { description: 'Pick List Box B' },
    });

    await apiClient.apiRequest(() =>
      apiClient.POST('/api/inventory/parts/{part_key}/stock', {
        params: { path: { part_key: partA.key } },
        body: { box_no: stockBoxA.box_no, loc_no: 1, qty: 20 },
      })
    );
    await apiClient.apiRequest(() =>
      apiClient.POST('/api/inventory/parts/{part_key}/stock', {
        params: { path: { part_key: partB.key } },
        body: { box_no: stockBoxB.box_no, loc_no: 1, qty: 6 },
      })
    );

    const kit = await testData.kits.create({
      overrides: {
        name: testData.kits.randomKitName('Pick Detail Kit'),
        build_target: 5,
      },
    });

    await testData.kits.addContent(kit.id, {
      partId: partAId,
      requiredPerUnit: 2,
    });
    await testData.kits.addContent(kit.id, {
      partId: partBId,
      requiredPerUnit: 3,
    });

    const pickList = await testData.kits.createPickList(kit.id, {
      requestedUnits: 2,
    });

    await apiClient.apiRequest(() =>
      apiClient.DELETE('/api/inventory/parts/{part_key}/stock', {
        params: { path: { part_key: partB.key } },
        body: { box_no: stockBoxB.box_no, loc_no: 1, qty: 6 },
      })
    );

    const lines = pickList.lines ?? [];
    const lineForPartA = lines.find(line => line.kit_content?.part_key === partA.key);
    const lineForPartB = lines.find(line => line.kit_content?.part_key === partB.key);

    expect(lineForPartA).toBeDefined();
    expect(lineForPartB).toBeDefined();

    const partALocationLabel = `${lineForPartA!.location.box_no}-${lineForPartA!.location.loc_no}`;
    const partBLocationLabel = `${lineForPartB!.location.box_no}-${lineForPartB!.location.loc_no}`;

    const listReady = waitForListLoading(page, 'pickLists.detail', 'ready');
    const linesReady = waitForListLoading(page, 'pickLists.detail.lines', 'ready');
    const uiReady = waitForUiState(page, 'pickLists.detail.load', 'ready');
    const availabilityReady = waitForUiState(page, 'pickLists.detail.availability', 'ready');

    await pickLists.gotoDetail(pickList.id);

    await Promise.all([listReady, linesReady, uiReady, availabilityReady]);

    await expect(pickLists.layout).toBeVisible();
    await expect(pickLists.title).toHaveText(`Pick List ${pickList.id}`);
    await expect(pickLists.statusBadge).toContainText(/Open/i);
    await expect(pickLists.breadcrumbRoot()).toHaveText('Pick Lists');
    await expect(pickLists.breadcrumbKit()).toHaveText(kit.name);
    await expect(pickLists.breadcrumbCurrent()).toHaveText(`Pick List ${pickList.id}`);
    await expect(pickLists.metadata).toContainText('Requested units');
    await expect(pickLists.metadata).toContainText('Total lines');

    const groupForPartA = pickLists.group(lineForPartA!.kit_content.id);
    await expect(groupForPartA).toBeVisible();
    await expect(groupForPartA).toContainText(partA.description);

    const groupForPartB = pickLists.group(lineForPartB!.kit_content.id);
    await expect(groupForPartB).toBeVisible();
    await expect(groupForPartB).toContainText(partB.description);

    const lineALocator = pickLists.line(lineForPartA!.id);
    await expect(lineALocator).toBeVisible();
    await expect(lineALocator).toContainText(partALocationLabel);
    await expect(pickLists.lineAvailability(lineForPartA!.id)).toContainText('20');

    const lineBLocator = pickLists.line(lineForPartB!.id);
    await expect(lineBLocator).toBeVisible();
    await expect(lineBLocator).toContainText(partBLocationLabel);
    await expect(pickLists.lineAvailability(lineForPartB!.id)).toHaveText(/0\b/);
    await expect(pickLists.lineShortfall(lineForPartB!.id)).toContainText('Shortfall 6');
  });

  test('allows operators to pick and undo lines with instrumentation', async ({
    pickLists,
    testData,
    apiClient,
    page,
    toastHelper,
  }) => {
    const { part } = await testData.parts.create({
      overrides: { description: 'Execution Flow Part' },
    });
    const stockBox = await testData.boxes.create({
      overrides: { description: 'Execution Flow Box' },
    });

    await apiClient.apiRequest(() =>
      apiClient.POST('/api/inventory/parts/{part_key}/stock', {
        params: { path: { part_key: part.key } },
        body: { box_no: stockBox.box_no, loc_no: 1, qty: 10 },
      })
    );

    const kit = await testData.kits.create({
      overrides: {
        name: testData.kits.randomKitName('Execution Kit'),
        build_target: 3,
      },
    });

    const reservations = await apiClient.apiRequest<PartKitReservationsResponseSchema_d12d9a5>(() =>
      apiClient.GET('/api/parts/{part_key}/kit-reservations', {
        params: { path: { part_key: part.key } },
      })
    );

    await testData.kits.addContent(kit.id, {
      partId: reservations.part_id,
      requiredPerUnit: 2,
    });

    const pickList = await testData.kits.createPickList(kit.id, { requestedUnits: 1 });
    const [line] = pickList.lines ?? [];
    expect(line).toBeDefined();
    const lineId = line!.id;

    const listReady = waitForListLoading(page, 'pickLists.detail', 'ready');
    const linesReady = waitForListLoading(page, 'pickLists.detail.lines', 'ready');
    const uiReady = waitForUiState(page, 'pickLists.detail.load', 'ready');
    const availabilityReady = waitForUiState(page, 'pickLists.detail.availability', 'ready');

    await pickLists.gotoDetail(pickList.id);
    await Promise.all([listReady, linesReady, uiReady, availabilityReady]);

    await expect(pickLists.statusBadge).toContainText(/Open/i);
    await expect(pickLists.lineStatus(lineId)).toHaveText(/Open/i);
    await expect(pickLists.pickButton(lineId)).toBeVisible();
    await expect(pickLists.undoButton(lineId)).toBeHidden();

    const pickLoading = waitForUiState(page, 'pickLists.detail.execution', 'loading');
    const pickReady = waitForUiState(page, 'pickLists.detail.execution', 'ready');
    const pickListReload = waitForListLoading(page, 'pickLists.detail', 'ready');
    const pickLinesReload = waitForListLoading(page, 'pickLists.detail.lines', 'ready');

    await pickLists.pickButton(lineId).click();

    await pickLoading;
    const pickEvent = await pickReady;
    await Promise.all([pickListReload, pickLinesReload]);

    expect(pickEvent.metadata).toMatchObject({
      action: 'pick',
      pickListId: pickList.id,
      lineId,
      kitId: kit.id,
      status: 'completed',
    });

    await toastHelper.expectSuccessToast(/Pick list completed/i);

    await expect(pickLists.statusBadge).toHaveText(/Completed/i);
    await expect(pickLists.lineStatus(lineId)).toHaveText(/Completed/i);
    await expect(pickLists.lineShortfall(lineId)).toHaveText('—');
    await expect(pickLists.undoButton(lineId)).toBeVisible();

    const undoLoading = waitForUiState(page, 'pickLists.detail.execution', 'loading');
    const undoReady = waitForUiState(page, 'pickLists.detail.execution', 'ready');
    const undoListReload = waitForListLoading(page, 'pickLists.detail', 'ready');
    const undoLinesReload = waitForListLoading(page, 'pickLists.detail.lines', 'ready');

    await pickLists.undoButton(lineId).click();

    await undoLoading;
    const undoEvent = await undoReady;
    await Promise.all([undoListReload, undoLinesReload]);

    expect(undoEvent.metadata).toMatchObject({
      action: 'undo',
      pickListId: pickList.id,
      lineId,
      kitId: kit.id,
      status: 'open',
    });

    await expect(pickLists.statusBadge).toHaveText(/Open/i);
    await expect(pickLists.lineStatus(lineId)).toHaveText(/Open/i);
    await expect(pickLists.lineShortfall(lineId)).toHaveText('—');
    await expect(pickLists.pickButton(lineId)).toBeVisible();
  });

  test('preserves kit search context when navigating from kit detail', async ({
    kits,
    pickLists,
    testData,
    apiClient,
    page,
  }) => {
    const { part } = await testData.parts.create({
      overrides: { description: 'Navigation Test Part' },
    });
    const stockBox = await testData.boxes.create({
      overrides: { description: 'Navigation Box' },
    });

    await apiClient.apiRequest(() =>
      apiClient.POST('/api/inventory/parts/{part_key}/stock', {
        params: { path: { part_key: part.key } },
        body: { box_no: stockBox.box_no, loc_no: 1, qty: 10 },
      })
    );

    const kit = await testData.kits.create({
      overrides: { name: testData.kits.randomKitName('Pick Navigation Kit') },
    });

    const partReservations = await apiClient.apiRequest<PartKitReservationsResponseSchema_d12d9a5>(() =>
      apiClient.GET('/api/parts/{part_key}/kit-reservations', {
        params: { path: { part_key: part.key } },
      })
    );
    const partId = partReservations.part_id;

    await testData.kits.addContent(kit.id, {
      partId,
      requiredPerUnit: 1,
    });

    const pickList = await testData.kits.createPickList(kit.id, { requestedUnits: 1 });

    await kits.gotoOverview();
    await kits.search(kit.name);
    await kits.waitForOverviewReady();

    const detailReady = waitForListLoading(page, 'kits.detail', 'ready');
    const contentsReady = waitForListLoading(page, 'kits.detail.contents', 'ready');
    const linksReady = waitForUiState(page, 'kits.detail.links', 'ready');
    const panelReady = waitForUiState(page, 'kits.detail.pickLists.panel', 'ready');

    await kits.openDetailFromCard(kit.id);
    await Promise.all([detailReady, contentsReady, linksReady]);
    await panelReady;

    await expect(kits.pickListPanelOpenItem(pickList.id)).toBeVisible();

    const navigateEvent = waitForUiState(page, 'kits.detail.pickLists.navigate', 'ready');
    await kits.pickListPanelOpenItem(pickList.id).click();
    const navigatePayload = await navigateEvent;
    expect(navigatePayload.metadata).toMatchObject({
      kitId: kit.id,
      pickListId: pickList.id,
      origin: 'open',
    });
    await expect(pickLists.layout).toBeVisible();

    await expect(pickLists.title).toHaveText(`Pick List ${pickList.id}`);
    await expect(pickLists.breadcrumbRoot()).toHaveText('Pick Lists');
    const breadcrumbKit = pickLists.breadcrumbKit();
    await expect(breadcrumbKit).toHaveText(kit.name);
    const breadcrumbCurrent = pickLists.breadcrumbCurrent();
    await expect(breadcrumbCurrent).toHaveText(`Pick List ${pickList.id}`);
    expect(await breadcrumbCurrent.getAttribute('href')).toBeNull();

    const chipHref = await pickLists.breadcrumbKitLink.getAttribute('href');
    const chipParams = new URLSearchParams(chipHref?.split('?')[1] ?? '');
    expect(chipParams.get('status')).toBe('active');
    expect(chipParams.get('search')).toBe(kit.name);

    await pickLists.breadcrumbKitLink.click();
    await expect(kits.detailLayout).toBeVisible();

    await expect(page).toHaveURL(new RegExp(`/kits/${kit.id}`));
    const returnUrl = new URL(page.url());
    expect(returnUrl.searchParams.get('status')).toBe('active');
    expect(returnUrl.searchParams.get('search')).toBe(kit.name);
  });

  test('deep linking to archived pick list preserves archived kit context', async ({
    pickLists,
    kits,
    testData,
    apiClient,
    page,
  }) => {
    const { part } = await testData.parts.create({
      overrides: { description: 'Archived Kit Part' },
    });

    const stockBox = await testData.boxes.create({
      overrides: { description: 'Archived Stock Box' },
    });

    await apiClient.apiRequest(() =>
      apiClient.POST('/api/inventory/parts/{part_key}/stock', {
        params: { path: { part_key: part.key } },
        body: { box_no: stockBox.box_no, loc_no: 1, qty: 5 },
      })
    );

    const kit = await testData.kits.create();

    const partReservations = await apiClient.apiRequest<PartKitReservationsResponseSchema_d12d9a5>(() =>
      apiClient.GET('/api/parts/{part_key}/kit-reservations', {
        params: { path: { part_key: part.key } },
      })
    );

    await testData.kits.addContent(kit.id, {
      partId: partReservations.part_id,
      requiredPerUnit: 1,
    });

    const pickList = await testData.kits.createPickList(kit.id, { requestedUnits: 1 });

    await testData.kits.archive(kit.id);

    const listReady = waitForListLoading(page, 'pickLists.detail', 'ready');
    const linesReady = waitForListLoading(page, 'pickLists.detail.lines', 'ready');
    const uiReady = waitForUiState(page, 'pickLists.detail.load', 'ready');

    await pickLists.gotoDetail(pickList.id);
    await Promise.all([listReady, linesReady, uiReady]);

    await expect(pickLists.title).toHaveText(`Pick List ${pickList.id}`);
    await expect(pickLists.statusBadge).toContainText(/Open/i);

    await expect(pickLists.breadcrumbKitLink).toBeVisible();
    await expect.poll(async () => {
      const href = await pickLists.breadcrumbKitLink.getAttribute('href');
      return href ?? '';
    }).not.toBe('');

    const chipHref = await pickLists.breadcrumbKitLink.getAttribute('href');
    const params = new URLSearchParams(chipHref?.split('?')[1] ?? '');
    expect(params.get('status')).toBe('archived');

    await pickLists.breadcrumbKitLink.click();
    await expect(kits.detailLayout).toBeVisible();

    await expect(page).toHaveURL(new RegExp(`/kits/${kit.id}`));
    const detailUrl = new URL(page.url());
    expect(detailUrl.searchParams.get('status')).toBe('archived');
  });

  test('allows deletion of open pick list and navigates to kit detail', async ({
    pickLists,
    kits,
    testData,
    apiClient,
    page,
  }) => {
    const { part } = await testData.parts.create({
      overrides: { description: 'Deletion Test Part' },
    });

    const stockBox = await testData.boxes.create({
      overrides: { description: 'Deletion Box' },
    });

    await apiClient.apiRequest(() =>
      apiClient.POST('/api/inventory/parts/{part_key}/stock', {
        params: { path: { part_key: part.key } },
        body: { box_no: stockBox.box_no, loc_no: 1, qty: 10 },
      })
    );

    const kit = await testData.kits.create({
      overrides: { name: testData.kits.randomKitName('Deletion Kit') },
    });

    const partReservations = await apiClient.apiRequest<PartKitReservationsResponseSchema_d12d9a5>(() =>
      apiClient.GET('/api/parts/{part_key}/kit-reservations', {
        params: { path: { part_key: part.key } },
      })
    );

    await testData.kits.addContent(kit.id, {
      partId: partReservations.part_id,
      requiredPerUnit: 2,
    });

    const pickList = await testData.kits.createPickList(kit.id, { requestedUnits: 1 });

    const listReady = waitForListLoading(page, 'pickLists.detail', 'ready');
    const linesReady = waitForListLoading(page, 'pickLists.detail.lines', 'ready');
    const uiReady = waitForUiState(page, 'pickLists.detail.load', 'ready');

    await pickLists.gotoDetail(pickList.id);
    await Promise.all([listReady, linesReady, uiReady]);

    await expect(pickLists.title).toHaveText(`Pick List ${pickList.id}`);
    await expect(pickLists.statusBadge).toContainText(/Open/i);
    await expect(pickLists.deleteButton).toBeVisible();

    const deleteReady = waitForUiState(page, 'pickLists.detail.delete', 'ready');

    await pickLists.deleteButton.click();

    // Confirm deletion in dialog
    const confirmDialog = page.getByRole('dialog');
    await expect(confirmDialog).toBeVisible();
    await expect(confirmDialog).toContainText(/delete pick list/i);

    const confirmButton = confirmDialog.getByRole('button', { name: /delete/i });
    await confirmButton.click();

    const deleteEvent = await deleteReady;
    expect(deleteEvent.metadata).toMatchObject({
      pickListId: pickList.id,
      kitId: kit.id,
      status: 'deleted',
    });

    // Should navigate to kit detail page
    await expect(kits.detailLayout).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/kits/${kit.id}`));

    // Verify pick list no longer exists in backend
    const response = await apiClient.GET('/api/pick-lists/{pick_list_id}', {
      params: { path: { pick_list_id: pickList.id } },
    });
    expect(response.response.status).toBe(404);
  });

  test('allows deletion of completed pick list', async ({
    pickLists,
    kits,
    testData,
    apiClient,
    page,
  }) => {
    const { part } = await testData.parts.create({
      overrides: { description: 'Completed Pick Deletion Part' },
    });

    const stockBox = await testData.boxes.create({
      overrides: { description: 'Completed Deletion Box' },
    });

    await apiClient.apiRequest(() =>
      apiClient.POST('/api/inventory/parts/{part_key}/stock', {
        params: { path: { part_key: part.key } },
        body: { box_no: stockBox.box_no, loc_no: 1, qty: 10 },
      })
    );

    const kit = await testData.kits.create({
      overrides: { name: testData.kits.randomKitName('Completed Deletion Kit') },
    });

    const partReservations = await apiClient.apiRequest<PartKitReservationsResponseSchema_d12d9a5>(() =>
      apiClient.GET('/api/parts/{part_key}/kit-reservations', {
        params: { path: { part_key: part.key } },
      })
    );

    await testData.kits.addContent(kit.id, {
      partId: partReservations.part_id,
      requiredPerUnit: 1,
    });

    const pickList = await testData.kits.createPickList(kit.id, { requestedUnits: 1 });
    const [line] = pickList.lines ?? [];
    expect(line).toBeDefined();

    // Complete the pick list by picking the line
    await apiClient.apiRequest(() =>
      apiClient.POST('/api/pick-lists/{pick_list_id}/lines/{line_id}/pick', {
        params: { path: { pick_list_id: pickList.id, line_id: line!.id } },
      })
    );

    const listReady = waitForListLoading(page, 'pickLists.detail', 'ready');
    const linesReady = waitForListLoading(page, 'pickLists.detail.lines', 'ready');
    const uiReady = waitForUiState(page, 'pickLists.detail.load', 'ready');

    await pickLists.gotoDetail(pickList.id);
    await Promise.all([listReady, linesReady, uiReady]);

    await expect(pickLists.title).toHaveText(`Pick List ${pickList.id}`);
    await expect(pickLists.statusBadge).toContainText(/Completed/i);
    await expect(pickLists.deleteButton).toBeVisible();

    const deleteReady = waitForUiState(page, 'pickLists.detail.delete', 'ready');

    await pickLists.deleteButton.click();

    const confirmDialog = page.getByRole('dialog');
    await expect(confirmDialog).toBeVisible();

    const confirmButton = confirmDialog.getByRole('button', { name: /delete/i });
    await confirmButton.click();

    const deleteEvent = await deleteReady;
    expect(deleteEvent.metadata).toMatchObject({
      pickListId: pickList.id,
      kitId: kit.id,
      status: 'deleted',
    });

    await expect(kits.detailLayout).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/kits/${kit.id}`));

    // Verify pick list no longer exists
    const response = await apiClient.GET('/api/pick-lists/{pick_list_id}', {
      params: { path: { pick_list_id: pickList.id } },
    });
    expect(response.response.status).toBe(404);
  });

  test('preserves kit search params when deleting pick list', async ({
    pickLists,
    kits,
    testData,
    apiClient,
    page,
  }) => {
    const { part } = await testData.parts.create({
      overrides: { description: 'Search Param Deletion Part' },
    });

    const stockBox = await testData.boxes.create({
      overrides: { description: 'Search Param Box' },
    });

    await apiClient.apiRequest(() =>
      apiClient.POST('/api/inventory/parts/{part_key}/stock', {
        params: { path: { part_key: part.key } },
        body: { box_no: stockBox.box_no, loc_no: 1, qty: 10 },
      })
    );

    const kit = await testData.kits.create({
      overrides: { name: testData.kits.randomKitName('Search Param Kit') },
    });

    const partReservations = await apiClient.apiRequest<PartKitReservationsResponseSchema_d12d9a5>(() =>
      apiClient.GET('/api/parts/{part_key}/kit-reservations', {
        params: { path: { part_key: part.key } },
      })
    );

    await testData.kits.addContent(kit.id, {
      partId: partReservations.part_id,
      requiredPerUnit: 1,
    });

    const pickList = await testData.kits.createPickList(kit.id, { requestedUnits: 1 });

    // Navigate to kit detail with search params first
    await kits.gotoOverview();
    await kits.search(kit.name);
    await kits.waitForOverviewReady();

    const detailReady = waitForListLoading(page, 'kits.detail', 'ready');
    const contentsReady = waitForListLoading(page, 'kits.detail.contents', 'ready');

    await kits.openDetailFromCard(kit.id);
    await Promise.all([detailReady, contentsReady]);

    // Navigate to pick list detail (preserving search params)
    const listReady = waitForListLoading(page, 'pickLists.detail', 'ready');
    const linesReady = waitForListLoading(page, 'pickLists.detail.lines', 'ready');
    const uiReady = waitForUiState(page, 'pickLists.detail.load', 'ready');

    await pickLists.gotoDetail(pickList.id, { status: 'active', search: kit.name });
    await Promise.all([listReady, linesReady, uiReady]);

    const deleteReady = waitForUiState(page, 'pickLists.detail.delete', 'ready');

    await pickLists.deleteButton.click();

    const confirmDialog = page.getByRole('dialog');
    await expect(confirmDialog).toBeVisible();

    const confirmButton = confirmDialog.getByRole('button', { name: /delete/i });
    await confirmButton.click();

    await deleteReady;

    // Should navigate back with search params preserved
    await expect(kits.detailLayout).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/kits/${kit.id}`));

    const returnUrl = new URL(page.url());
    expect(returnUrl.searchParams.get('status')).toBe('active');
    expect(returnUrl.searchParams.get('search')).toBe(kit.name);
  });

  test('allows inline editing of pick list line quantities', async ({
    pickLists,
    testData,
    apiClient,
    page,
  }) => {
    // Create test data
    const { part } = await testData.parts.create({
      overrides: { description: 'Quantity Edit Test Part' },
    });

    const stockBox = await testData.boxes.create({
      overrides: { description: 'Quantity Edit Box' },
    });

    await apiClient.apiRequest(() =>
      apiClient.POST('/api/inventory/parts/{part_key}/stock', {
        params: { path: { part_key: part.key } },
        body: { box_no: stockBox.box_no, loc_no: 1, qty: 100 },
      })
    );

    const kit = await testData.kits.create({
      overrides: {
        name: testData.kits.randomKitName('Quantity Edit Kit'),
        build_target: 5,
      },
    });

    const partReservations = await apiClient.apiRequest<PartKitReservationsResponseSchema_d12d9a5>(() =>
      apiClient.GET('/api/parts/{part_key}/kit-reservations', {
        params: { path: { part_key: part.key } },
      })
    );

    await testData.kits.addContent(kit.id, {
      partId: partReservations.part_id,
      requiredPerUnit: 5,
    });

    const pickList = await testData.kits.createPickList(kit.id, {
      requestedUnits: 2,
    });

    const lines = pickList.lines ?? [];
    const line = lines[0];
    expect(line).toBeDefined();
    const originalQuantity = line.quantity_to_pick;
    const lineId = line.id;

    // Navigate to pick list detail
    const listReady = waitForListLoading(page, 'pickLists.detail', 'ready');
    const linesReady = waitForListLoading(page, 'pickLists.detail.lines', 'ready');
    const uiReady = waitForUiState(page, 'pickLists.detail.load', 'ready');

    await pickLists.gotoDetail(pickList.id);
    await Promise.all([listReady, linesReady, uiReady]);

    // Verify initial quantity display
    const quantityCell = page.getByTestId(`pick-lists.detail.line.${lineId}.quantity`);
    await expect(quantityCell).toBeVisible();
    await expect(quantityCell).toContainText(originalQuantity.toString());

    // Click on quantity to enter edit mode
    const editButton = page.getByTestId(`pick-lists.detail.line.${lineId}.quantity-edit`);
    await expect(editButton).toBeVisible();
    await editButton.click();

    // Verify edit mode UI appears
    const quantityInput = page.getByTestId(`pick-lists.detail.line.${lineId}.quantity-input`);
    const saveButton = page.getByTestId(`pick-lists.detail.line.${lineId}.quantity-save`);
    const cancelButton = page.getByTestId(`pick-lists.detail.line.${lineId}.quantity-cancel`);

    await expect(quantityInput).toBeVisible();
    await expect(saveButton).toBeVisible();
    await expect(cancelButton).toBeVisible();
    await expect(quantityInput).toHaveValue(originalQuantity.toString());

    // Change quantity
    const newQuantity = 15;
    await quantityInput.fill(newQuantity.toString());

    // Save the change
    const quantityUpdateReady = waitForUiState(page, 'pickLists.detail.quantityEdit', 'ready');
    await saveButton.click();
    await quantityUpdateReady;

    // Verify edit mode is closed
    await expect(quantityInput).not.toBeVisible();
    await expect(quantityCell).toBeVisible();
    await expect(quantityCell).toContainText(newQuantity.toString());

    // Verify backend state
    const updatedPickList = await apiClient.apiRequest(() =>
      apiClient.GET('/api/pick-lists/{pick_list_id}', {
        params: { path: { pick_list_id: pickList.id } },
      })
    );
    const updatedLine = updatedPickList.lines?.find((l) => l.id === lineId);
    expect(updatedLine?.quantity_to_pick).toBe(newQuantity);
    expect(updatedPickList.total_quantity_to_pick).toBe(newQuantity);
    expect(updatedPickList.remaining_quantity).toBe(newQuantity);
  });

  test('supports keyboard shortcuts for quantity editing', async ({
    pickLists,
    testData,
    apiClient,
    page,
  }) => {
    // Create test data
    const { part } = await testData.parts.create({
      overrides: { description: 'Keyboard Shortcut Test Part' },
    });

    const stockBox = await testData.boxes.create({
      overrides: { description: 'Keyboard Box' },
    });

    await apiClient.apiRequest(() =>
      apiClient.POST('/api/inventory/parts/{part_key}/stock', {
        params: { path: { part_key: part.key } },
        body: { box_no: stockBox.box_no, loc_no: 1, qty: 100 },
      })
    );

    const kit = await testData.kits.create({
      overrides: {
        name: testData.kits.randomKitName('Keyboard Kit'),
        build_target: 5,
      },
    });

    const partReservations = await apiClient.apiRequest<PartKitReservationsResponseSchema_d12d9a5>(() =>
      apiClient.GET('/api/parts/{part_key}/kit-reservations', {
        params: { path: { part_key: part.key } },
      })
    );

    await testData.kits.addContent(kit.id, {
      partId: partReservations.part_id,
      requiredPerUnit: 3,
    });

    const pickList = await testData.kits.createPickList(kit.id, {
      requestedUnits: 2,
    });

    const lines = pickList.lines ?? [];
    const line = lines[0];
    expect(line).toBeDefined();
    const lineId = line.id;
    const originalQuantity = line.quantity_to_pick;

    // Navigate to pick list detail
    const listReady = waitForListLoading(page, 'pickLists.detail', 'ready');
    const linesReady = waitForListLoading(page, 'pickLists.detail.lines', 'ready');
    const uiReady = waitForUiState(page, 'pickLists.detail.load', 'ready');

    await pickLists.gotoDetail(pickList.id);
    await Promise.all([listReady, linesReady, uiReady]);

    // Enter edit mode
    const editButton = page.getByTestId(`pick-lists.detail.line.${lineId}.quantity-edit`);
    await editButton.click();

    const quantityInput = page.getByTestId(`pick-lists.detail.line.${lineId}.quantity-input`);
    await expect(quantityInput).toBeVisible();

    // Test Escape key to cancel
    await quantityInput.fill('999');
    await quantityInput.press('Escape');

    // Verify edit mode is closed and quantity unchanged
    await expect(quantityInput).not.toBeVisible();
    const quantityCell = page.getByTestId(`pick-lists.detail.line.${lineId}.quantity`);
    await expect(quantityCell).toContainText(originalQuantity.toString());

    // Enter edit mode again
    await editButton.click();
    await expect(quantityInput).toBeVisible();

    // Test Enter key to save
    const newQuantity = 12;
    await quantityInput.fill(newQuantity.toString());

    const quantityUpdateReady = waitForUiState(page, 'pickLists.detail.quantityEdit', 'ready');
    await quantityInput.press('Enter');
    await quantityUpdateReady;

    // Verify quantity updated
    await expect(quantityInput).not.toBeVisible();
    await expect(quantityCell).toContainText(newQuantity.toString());

    // Verify backend state
    const updatedPickList = await apiClient.apiRequest(() =>
      apiClient.GET('/api/pick-lists/{pick_list_id}', {
        params: { path: { pick_list_id: pickList.id } },
      })
    );
    const updatedLine = updatedPickList.lines?.find((l) => l.id === lineId);
    expect(updatedLine?.quantity_to_pick).toBe(newQuantity);
  });

  test('does not allow editing completed pick list lines', async ({
    pickLists,
    testData,
    apiClient,
    page,
  }) => {
    // Create test data
    const { part } = await testData.parts.create({
      overrides: { description: 'Completed Line Test Part' },
    });

    const stockBox = await testData.boxes.create({
      overrides: { description: 'Completed Box' },
    });

    await apiClient.apiRequest(() =>
      apiClient.POST('/api/inventory/parts/{part_key}/stock', {
        params: { path: { part_key: part.key } },
        body: { box_no: stockBox.box_no, loc_no: 1, qty: 100 },
      })
    );

    const kit = await testData.kits.create({
      overrides: {
        name: testData.kits.randomKitName('Completed Line Kit'),
        build_target: 5,
      },
    });

    const partReservations = await apiClient.apiRequest<PartKitReservationsResponseSchema_d12d9a5>(() =>
      apiClient.GET('/api/parts/{part_key}/kit-reservations', {
        params: { path: { part_key: part.key } },
      })
    );

    await testData.kits.addContent(kit.id, {
      partId: partReservations.part_id,
      requiredPerUnit: 2,
    });

    const pickList = await testData.kits.createPickList(kit.id, {
      requestedUnits: 2,
    });

    const lines = pickList.lines ?? [];
    const line = lines[0];
    expect(line).toBeDefined();
    const lineId = line.id;

    // Complete the line
    await apiClient.apiRequest(() =>
      apiClient.POST('/api/pick-lists/{pick_list_id}/lines/{line_id}/pick', {
        params: { path: { pick_list_id: pickList.id, line_id: lineId } },
      })
    );

    // Navigate to pick list detail
    const listReady = waitForListLoading(page, 'pickLists.detail', 'ready');
    const linesReady = waitForListLoading(page, 'pickLists.detail.lines', 'ready');
    const uiReady = waitForUiState(page, 'pickLists.detail.load', 'ready');

    await pickLists.gotoDetail(pickList.id);
    await Promise.all([listReady, linesReady, uiReady]);

    // Verify edit button is not present for completed line
    const editButton = page.getByTestId(`pick-lists.detail.line.${lineId}.quantity-edit`);
    await expect(editButton).not.toBeVisible();

    // Verify quantity is not clickable
    const quantityCell = page.getByTestId(`pick-lists.detail.line.${lineId}.quantity`);
    await expect(quantityCell).toBeVisible();
    // Clicking should not enter edit mode
    await quantityCell.click();
    const quantityInput = page.getByTestId(`pick-lists.detail.line.${lineId}.quantity-input`);
    await expect(quantityInput).not.toBeVisible();
  });

  test('allows setting quantity to zero', async ({
    pickLists,
    testData,
    apiClient,
    page,
  }) => {
    // Create test data
    const { part } = await testData.parts.create({
      overrides: { description: 'Zero Quantity Test Part' },
    });

    const stockBox = await testData.boxes.create({
      overrides: { description: 'Zero Qty Box' },
    });

    await apiClient.apiRequest(() =>
      apiClient.POST('/api/inventory/parts/{part_key}/stock', {
        params: { path: { part_key: part.key } },
        body: { box_no: stockBox.box_no, loc_no: 1, qty: 100 },
      })
    );

    const kit = await testData.kits.create({
      overrides: {
        name: testData.kits.randomKitName('Zero Quantity Kit'),
        build_target: 5,
      },
    });

    const partReservations = await apiClient.apiRequest<PartKitReservationsResponseSchema_d12d9a5>(() =>
      apiClient.GET('/api/parts/{part_key}/kit-reservations', {
        params: { path: { part_key: part.key } },
      })
    );

    await testData.kits.addContent(kit.id, {
      partId: partReservations.part_id,
      requiredPerUnit: 5,
    });

    const pickList = await testData.kits.createPickList(kit.id, {
      requestedUnits: 1,
    });

    const lines = pickList.lines ?? [];
    const line = lines[0];
    expect(line).toBeDefined();
    const lineId = line.id;

    // Navigate to pick list detail
    const listReady = waitForListLoading(page, 'pickLists.detail', 'ready');
    const linesReady = waitForListLoading(page, 'pickLists.detail.lines', 'ready');
    const uiReady = waitForUiState(page, 'pickLists.detail.load', 'ready');

    await pickLists.gotoDetail(pickList.id);
    await Promise.all([listReady, linesReady, uiReady]);

    // Enter edit mode
    const editButton = page.getByTestId(`pick-lists.detail.line.${lineId}.quantity-edit`);
    await editButton.click();

    const quantityInput = page.getByTestId(`pick-lists.detail.line.${lineId}.quantity-input`);
    await expect(quantityInput).toBeVisible();

    // Set quantity to 0
    await quantityInput.fill('0');

    const saveButton = page.getByTestId(`pick-lists.detail.line.${lineId}.quantity-save`);
    const quantityUpdateReady = waitForUiState(page, 'pickLists.detail.quantityEdit', 'ready');
    await saveButton.click();
    await quantityUpdateReady;

    // Verify quantity is 0
    const quantityCell = page.getByTestId(`pick-lists.detail.line.${lineId}.quantity`);
    await expect(quantityCell).toContainText('0');

    // Verify backend state
    const updatedPickList = await apiClient.apiRequest(() =>
      apiClient.GET('/api/pick-lists/{pick_list_id}', {
        params: { path: { pick_list_id: pickList.id } },
      })
    );
    const updatedLine = updatedPickList.lines?.find((l) => l.id === lineId);
    expect(updatedLine?.quantity_to_pick).toBe(0);
    expect(updatedLine?.status).toBe('open'); // Line remains open with 0 quantity
  });
});
