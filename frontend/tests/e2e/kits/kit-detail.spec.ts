import { expect } from '@playwright/test';
import { test } from '../../support/fixtures';
import { waitForListLoading } from '../../support/helpers';
import type {
  KitDetailResponseSchema_b98797e,
  KitSummarySchemaList_a9993e3,
} from '@/lib/api/generated/hooks';

const numberFormatter = new Intl.NumberFormat();

test.describe('Kit detail workspace', () => {
  test('renders availability math and reservation breakdown', async ({ kits, page, apiClient }) => {
    const activeSummaries = await apiClient.apiRequest<KitSummarySchemaList_a9993e3>(() =>
      apiClient.GET('/api/kits', {
        params: { query: { status: 'active' } },
      })
    );

    let kitSummary: KitSummarySchemaList_a9993e3[number] | null = null;
    let kitDetail: KitDetailResponseSchema_b98797e | null = null;

    for (const summary of activeSummaries) {
      const detail = await apiClient.apiRequest<KitDetailResponseSchema_b98797e>(() =>
        apiClient.GET('/api/kits/{kit_id}', {
          params: { path: { kit_id: summary.id } },
        })
      );
      const rows = detail.contents ?? [];
      if (rows.length === 0) {
        continue;
      }
      const hasReservation = rows.some((row) => (row.active_reservations?.length ?? 0) > 0);
      if (hasReservation) {
        kitSummary = summary;
        kitDetail = detail;
        break;
      }
    }

    if (!kitSummary || !kitDetail) {
      throw new Error('Expected seeded kit with reservation data to exist');
    }

    const contents = kitDetail.contents ?? [];
    const reservationRow = contents.find((row) => (row.active_reservations?.length ?? 0) > 0)!;
    const noteRow = contents.find((row) => Boolean(row.note)) ?? reservationRow;

    const totalRequired = contents.reduce((sum, row) => sum + row.total_required, 0);
    const totalAvailable = contents.reduce((sum, row) => sum + row.available, 0);
    const totalShortfall = contents.reduce((sum, row) => sum + row.shortfall, 0);
    const shortfallCount = contents.filter((row) => row.shortfall > 0).length;

    const detailReady = waitForListLoading(page, 'kits.detail', 'ready');
    const contentsReady = waitForListLoading(page, 'kits.detail.contents', 'ready');

    await kits.gotoOverview();
    await expect(kits.cardById(kitSummary.id)).toBeVisible();
    await kits.openDetailFromCard(kitSummary.id);

    const detailEvent = await detailReady;
    const contentsEvent = await contentsReady;

    expect(detailEvent.metadata).toMatchObject({
      kitId: kitSummary.id,
      status: kitDetail.status,
      contentCount: contents.length,
    });
    expect(contentsEvent.metadata).toMatchObject({
      kitId: kitSummary.id,
      total: totalRequired,
      available: totalAvailable,
      contentCount: contents.length,
      shortfallCount,
    });

    await expect(kits.detailTitle).toHaveText(kitSummary.name);
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

    if (kitDetail.description) {
      await expect(kits.detailHeader).toContainText(kitDetail.description);
    }

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
