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
        body: { box_no: stockBoxB.box_no, loc_no: 1, qty: 4 },
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
    await expect(pickLists.kitChip).toBeVisible();
    await expect(pickLists.breadcrumbRoot()).toHaveText('Pick Lists');
    await expect(pickLists.breadcrumbKit()).toHaveText(kit.name);
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
    await expect(pickLists.lineAvailability(lineForPartB!.id)).toContainText('2');
    await expect(pickLists.lineShortfall(lineForPartB!.id)).toContainText('Shortfall');
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

    await kits.openDetailFromCard(kit.id);
    await Promise.all([detailReady, contentsReady, linksReady]);

    const pickListChip = kits.pickListChip(pickList.id);
    await expect(pickListChip).toBeVisible();

    await pickListChip.click();
    await expect(pickLists.layout).toBeVisible();

    await expect(pickLists.title).toHaveText(`Pick List ${pickList.id}`);
    await expect(pickLists.breadcrumbRoot()).toHaveText('Pick Lists');
    await expect(pickLists.breadcrumbKit()).toHaveText(kit.name);

    const crumbHref = await pickLists.breadcrumbKit().getAttribute('href');
    const crumbParams = new URLSearchParams(crumbHref?.split('?')[1] ?? '');
    expect(crumbParams.get('status')).toBe('active');
    expect(crumbParams.get('search')).toBe(kit.name);

    const chipHref = await pickLists.kitChip.getAttribute('href');
    const chipParams = new URLSearchParams(chipHref?.split('?')[1] ?? '');
    expect(chipParams.get('status')).toBe('active');
    expect(chipParams.get('search')).toBe(kit.name);

    await pickLists.kitChip.click();
    await expect(kits.detailLayout).toBeVisible();

    await expect(page).toHaveURL(new RegExp(`/kits/${kit.id}`));
    const returnUrl = new URL(page.url());
    expect(returnUrl.searchParams.get('status')).toBe('active');
    expect(returnUrl.searchParams.get('search')).toBe(kit.name);
  });
});
