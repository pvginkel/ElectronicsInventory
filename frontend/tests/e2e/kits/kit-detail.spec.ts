import { expect } from '@playwright/test';
import { test } from '../../support/fixtures';
import { waitForListLoading } from '../../support/helpers';
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

    await kits.gotoOverview();
    const searchReady = waitForListLoading(page, 'kits.overview', 'ready');
    await kits.search(targetKit.name);
    await searchReady;
    await expect(kits.cardById(targetKit.id)).toBeVisible();
    await kits.openDetailFromCard(targetKit.id);

    const detailEvent = await detailReady;
    const contentsEvent = await contentsReady;

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

    await expect(kits.detailTitle).toHaveText(targetKit.name);
    await expect(kits.detailStatusBadge).toHaveText(new RegExp(kitDetail.status, 'i'));
    await expect(kits.detailBuildTargetBadge).toHaveText(
      new RegExp(`Build target\\s+${kitDetail.build_target}`)
    );
    await expect(kits.detailShoppingBadge).toHaveText(
      new RegExp(`Shopping lists ${kitDetail.shopping_list_badge_count}`)
    );
    await expect(kits.detailPickBadge).toHaveText(
      new RegExp(`Pick lists ${kitDetail.pick_list_badge_count}`)
    );

    await expect(kits.detailHeader).toContainText(targetKitDescription);

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
