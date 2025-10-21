import { expect } from '@playwright/test';
import { test } from '../../support/fixtures';
import { waitForListLoading, waitTestEvent } from '../../support/helpers';
import type { UiStateTestEvent } from '@/types/test-events';
import type {
  KitDetailResponseSchema_b98797e,
  PartKitReservationsResponseSchema_d12d9a5,
} from '@/lib/api/generated/hooks';

const numberFormatter = new Intl.NumberFormat();
type KitContentDetail = NonNullable<KitDetailResponseSchema_b98797e['contents']>[number];

test.describe('Kit detail workspace', () => {
  test('renders availability math and reservation breakdown', async ({ kits, page, apiClient, testData }) => {
    const reservationPartDescription = testData.parts.randomPartDescription('Detail Reservation Part');
    const { part } = await testData.parts.create({
      overrides: {
        description: reservationPartDescription,
      },
    });

    const partReservationMetadata = await apiClient.apiRequest<PartKitReservationsResponseSchema_d12d9a5>(() =>
      apiClient.GET('/api/parts/{part_key}/kit-reservations', {
        params: { path: { part_key: part.key } },
      })
    );
    const partId = partReservationMetadata.part_id;

    const box = await testData.boxes.create();
    const locationNumber = 1;
    const stockQuantity = 8;

    await apiClient.POST('/api/inventory/parts/{part_key}/stock', {
      params: { path: { part_key: part.key } },
      body: { box_no: box.box_no, loc_no: locationNumber, qty: stockQuantity },
    });

    const createCompetingKit = async (buildTarget: number, requiredPerUnit: number) => {
      const competingKit = await testData.kits.create({
        overrides: {
          name: testData.kits.randomKitName('Competing Kit'),
          build_target: buildTarget,
        },
      });

      await testData.kits.addContent(competingKit.id, {
        partId,
        requiredPerUnit,
      });
    };

    // Seed an initial competing kit before creating the target to ensure it retains reservation priority.
    await createCompetingKit(6, 6);

    const targetKitName = testData.kits.randomKitName('Detail Target Kit');
    const targetKitDescription = testData.kits.randomKitDescription();
    const targetKit = await testData.kits.create({
      overrides: {
        name: targetKitName,
        build_target: 4,
        description: targetKitDescription,
      },
    });

    const targetContent = await testData.kits.addContent(targetKit.id, {
      partId,
      requiredPerUnit: 3,
      note: 'Use matched pairs only',
    });

    const fetchTargetDetail = () =>
      apiClient.apiRequest<KitDetailResponseSchema_b98797e>(() =>
        apiClient.GET('/api/kits/{kit_id}', {
          params: { path: { kit_id: targetKit.id } },
        })
      );

    let kitDetail: KitDetailResponseSchema_b98797e | null = null;
    let reservationRow: KitContentDetail | undefined;

    const evaluateReservations = (detail: KitDetailResponseSchema_b98797e) =>
      detail.contents?.find((row) => (row.active_reservations?.length ?? 0) > 0);

    kitDetail = await fetchTargetDetail();
    reservationRow = evaluateReservations(kitDetail);

    if (!reservationRow) {
      const additionalCompetingConfigs = [
        { buildTarget: 8, requiredPerUnit: 7 },
        { buildTarget: 12, requiredPerUnit: 8 },
      ];

      for (const config of additionalCompetingConfigs) {
        await createCompetingKit(config.buildTarget, config.requiredPerUnit);
        const detail = await fetchTargetDetail();
        const candidate = evaluateReservations(detail);
        if (candidate) {
          kitDetail = detail;
          reservationRow = candidate;
          break;
        }
      }
    }

    if (!kitDetail || !reservationRow) {
      throw new Error('Failed to seed kit reservations for detail workspace test');
    }

    const contents = kitDetail.contents ?? [];
    const noteRow =
      contents.find((row) => row.id === targetContent.id) ??
      contents.find((row) => Boolean(row.note)) ??
      reservationRow;
    const totalRequired = contents.reduce((sum, row) => sum + row.total_required, 0);
    const totalAvailable = contents.reduce((sum, row) => sum + row.available, 0);
    const totalShortfall = contents.reduce((sum, row) => sum + row.shortfall, 0);
    const shortfallCount = contents.filter((row) => row.shortfall > 0).length;

    const detailReady = waitForListLoading(page, 'kits.detail', 'ready');
    const contentsReady = waitForListLoading(page, 'kits.detail.contents', 'ready');
    const linksReady = waitTestEvent<UiStateTestEvent>(
      page,
      'ui_state',
      event =>
        event.scope === 'kits.detail.links' &&
        event.phase === 'ready' &&
        event.metadata?.status !== 'aborted',
    );

    await kits.gotoOverview();
    const searchReady = waitForListLoading(page, 'kits.overview', 'ready');
    await kits.search(targetKit.name);
    await searchReady;
    await expect(kits.cardById(targetKit.id)).toBeVisible();
    await kits.openDetailFromCard(targetKit.id);

    const detailEvent = await detailReady;
    const contentsEvent = await contentsReady;
    const linksEvent = await linksReady;

    expect(detailEvent.metadata).toMatchObject({
      kitId: targetKit.id,
      status: kitDetail.status,
      contentCount: contents.length,
    });
    expect(contentsEvent.metadata).toMatchObject({
      kitId: targetKit.id,
      total: totalRequired,
      available: totalAvailable,
      contentCount: contents.length,
      shortfallCount,
    });

    expect(linksEvent.metadata).toMatchObject({
      kitId: targetKit.id,
      hasLinkedWork: false,
      shoppingLists: {
        count: 0,
        ids: [],
      },
      pickLists: {
        count: 0,
        ids: [],
      },
    });

    await expect(kits.detailTitle).toHaveText(targetKit.name);
    await expect(kits.detailStatusBadge).toHaveText(new RegExp(kitDetail.status, 'i'));
    await expect(kits.detailBuildTargetBadge).toHaveText(
      new RegExp(`Build target\\s+${kitDetail.build_target}`)
    );

    await expect(kits.detailHeader).toContainText(targetKitDescription);
    await expect(kits.detailLinksEmpty).toBeVisible();

    await expect(kits.detailEditButton).toBeDisabled();
    await kits.detailEditWrapper.hover();
    await expect(kits.detailEditTooltip).toBeVisible();
    await expect(kits.detailEditTooltip).toContainText('Editing kits will be available');

    await expect(kits.detailSummaryBadge('total')).toHaveText(
      new RegExp(numberFormatter.format(totalRequired))
    );
    await expect(kits.detailSummaryBadge('available')).toHaveText(
      new RegExp(numberFormatter.format(totalAvailable))
    );
    await expect(kits.detailSummaryBadge('shortfall')).toHaveText(
      new RegExp(numberFormatter.format(totalShortfall))
    );

    const noteRowLocator = kits.detailTableRow(noteRow.id);
    await expect(noteRowLocator).toContainText(noteRow.part.description);
    await expect(noteRowLocator).toContainText(noteRow.part.key);
    if (noteRow.note) {
      await expect(noteRowLocator).toContainText(noteRow.note);
    }
    await expect(noteRowLocator.locator('td').nth(1)).toHaveText(
      numberFormatter.format(noteRow.required_per_unit)
    );
    await expect(noteRowLocator.locator('td').nth(2)).toHaveText(
      numberFormatter.format(noteRow.total_required)
    );

    const reservationRowLocator = kits.detailTableRow(reservationRow.id);
    await expect(reservationRowLocator).toContainText(reservationRow.part.description);
    await expect(reservationRowLocator.locator('td').nth(4)).toContainText(
      numberFormatter.format(reservationRow.reserved)
    );
    await expect(reservationRowLocator.locator('td').nth(6)).toHaveText(
      numberFormatter.format(reservationRow.shortfall)
    );

    const reservations = reservationRow.active_reservations ?? [];
    expect(reservations.length).toBeGreaterThan(0);
    const reservation = reservations[0];

    const reservationTrigger = kits.detailReservationTrigger(reservationRow.id);
    await reservationTrigger.hover();
    const reservationTooltip = kits.detailReservationTooltip(reservationRow.id);
    await expect(reservationTooltip).toBeVisible();
    await expect(reservationTooltip).toContainText(reservation.kit_name);
    await expect(reservationTooltip).toContainText(numberFormatter.format(reservation.reserved_quantity));
    await expect(reservationTooltip).toContainText(
      numberFormatter.format(reservation.build_target)
    );

    await expect(kits.detailContent).toContainText(reservationRow.part.key);

    const partLink = kits
      .detailTableRow(reservationRow.id)
      .getByTestId(`kits.detail.table.row.${reservationRow.id}.part`);
    const partNavigation = page.waitForURL(new RegExp(`/parts/${reservationRow.part.key}`));
    await Promise.all([partNavigation, partLink.click()]);
    await expect(page.getByRole('heading', { level: 1, name: new RegExp(reservationRow.part.description, 'i') })).toBeVisible();

  });

  test('renders linked shopping and pick list chips with navigation', async ({
    kits,
    shoppingLists,
    testData,
    apiClient,
    page,
  }) => {
    const { part } = await testData.parts.create({
      overrides: { description: 'Linkage chip part' },
    });
    await testData.parts.getDetail(part.key);

    const box = await testData.boxes.create();
    await apiClient.POST('/api/inventory/parts/{part_key}/stock', {
      params: { path: { part_key: part.key } },
      body: { box_no: box.box_no, loc_no: 1, qty: 20 },
    });

    const partReservationMetadata = await apiClient.apiRequest<PartKitReservationsResponseSchema_d12d9a5>(() =>
      apiClient.GET('/api/parts/{part_key}/kit-reservations', {
        params: { path: { part_key: part.key } },
      })
    );
    const partId = partReservationMetadata.part_id;

    const kit = await testData.kits.create({
      overrides: {
        name: testData.kits.randomKitName('Linked Kit'),
        build_target: 5,
      },
    });

    await testData.kits.addContent(kit.id, {
      partId,
      requiredPerUnit: 2,
    });

    const conceptLinkResponse = await apiClient.apiRequest(() =>
      apiClient.POST('/api/kits/{kit_id}/shopping-lists', {
        params: { path: { kit_id: kit.id } },
        body: {
          new_list_name: testData.shoppingLists.randomName('Concept Link'),
          new_list_description: null,
          shopping_list_id: null,
          units: 1,
          honor_reserved: false,
          note_prefix: null,
        },
      })
    );
    const conceptLink = conceptLinkResponse.link ?? null;

    const pickList = await apiClient.apiRequest(() =>
      apiClient.POST('/api/kits/{kit_id}/pick-lists', {
        params: { path: { kit_id: kit.id } },
        body: { requested_units: 1 },
      })
    );

    const detailReady = waitForListLoading(page, 'kits.detail', 'ready');
    const contentsReady = waitForListLoading(page, 'kits.detail.contents', 'ready');
    const linksReady = waitTestEvent<UiStateTestEvent>(
      page,
      'ui_state',
      event =>
        event.scope === 'kits.detail.links' &&
        event.phase === 'ready' &&
        event.metadata?.status !== 'aborted',
    );

    await kits.gotoOverview();
    const searchReady = waitForListLoading(page, 'kits.overview', 'ready');
    await kits.search(kit.name);
    await searchReady;
    await expect(kits.cardById(kit.id)).toBeVisible();
    await kits.openDetailFromCard(kit.id);

    await detailReady;
    await contentsReady;
    const linksEvent = await linksReady;

    expect(linksEvent.metadata).toMatchObject({
      kitId: kit.id,
      hasLinkedWork: true,
      shoppingLists: {
        count: conceptLink ? 1 : 0,
      },
      pickLists: {
        count: 1,
        ids: expect.arrayContaining([pickList.id]),
        statusCounts: expect.objectContaining({ open: 1, completed: 0 }),
      },
    });
    if (conceptLink) {
      const shoppingMetadata = (linksEvent.metadata as Record<string, unknown> | undefined)
        ?.shoppingLists as { ids?: number[] } | undefined;
      expect(shoppingMetadata?.ids).toEqual(
        expect.arrayContaining([conceptLink.shopping_list_id])
      );
    }

    await expect(kits.detailLinksSection).toBeVisible();

    const kitDetailPath = `/kits/${kit.id}`;

    if (conceptLink) {
      const conceptChip = kits.shoppingLinkChip(conceptLink.shopping_list_id);
      await expect(conceptChip).toBeVisible();
      await expect(conceptChip).toContainText(conceptLink.shopping_list_name);
      await expect(conceptChip).toContainText(/Concept/i);

      const conceptNavigation = shoppingLists.playwrightPage.waitForURL(
        new RegExp(`/shopping-lists/${conceptLink.shopping_list_id}`)
      );
      const conceptReady = shoppingLists.waitForConceptReady();
      await Promise.all([conceptNavigation, conceptReady, conceptChip.click()]);

      const detailReload = waitForListLoading(page, 'kits.detail', 'ready');
      const contentsReload = waitForListLoading(page, 'kits.detail.contents', 'ready');
      const linksReload = waitTestEvent<UiStateTestEvent>(
        page,
        'ui_state',
        event =>
          event.scope === 'kits.detail.links' &&
          event.phase === 'ready' &&
          event.metadata?.status !== 'aborted',
      );
      await kits.goto(kitDetailPath);
      await detailReload;
      await contentsReload;
      await linksReload;
    }

    const pickChip = kits.pickListChip(pickList.id);
    await expect(pickChip).toBeVisible();
    await expect(pickChip).toContainText(`Pick list #${pickList.id}`);
    await expect(pickChip).toContainText(/Open/i);

    const pickNavigation = page.waitForURL(new RegExp(`/pick-lists/${pickList.id}`));
    await Promise.all([pickNavigation, pickChip.click()]);
    await expect(page).toHaveURL(new RegExp(`/pick-lists/${pickList.id}`));
  });

  test('shows empty state when kit has no contents', async ({ kits, testData, page }) => {
    const emptyKit = await testData.kits.create({
      overrides: {
        name: 'Empty Detail Kit',
        build_target: 2,
      },
    });

    const detailReady = waitForListLoading(page, 'kits.detail', 'ready');
    const contentsReady = waitForListLoading(page, 'kits.detail.contents', 'ready');

    await kits.gotoOverview();
    await expect(kits.cardById(emptyKit.id)).toBeVisible();
    await kits.openDetailFromCard(emptyKit.id);

    const detailEvent = await detailReady;
    const contentsEvent = await contentsReady;

    expect(detailEvent.metadata).toMatchObject({
      kitId: emptyKit.id,
      contentCount: 0,
    });
    expect(contentsEvent.metadata).toMatchObject({
      kitId: emptyKit.id,
      total: 0,
      available: 0,
      contentCount: 0,
      shortfallCount: 0,
    });

    await expect(kits.detailEmptyState).toBeVisible();
    await expect(kits.detailEmptyState).toContainText('No parts in this kit yet');
  });
});
