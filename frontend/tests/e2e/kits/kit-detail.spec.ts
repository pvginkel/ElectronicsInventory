import { expect } from '@playwright/test';
import { test } from '../../support/fixtures';
import { waitForFormValidationError, waitForListLoading, waitForUiState, waitTestEvent } from '../../support/helpers';
import type { UiStateTestEvent, FormTestEvent } from '@/types/test-events';
import type { KitContentDetailSchema_b98797e } from '@/lib/api/generated/hooks';
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

    await expect(kits.detailEditButton).toBeEnabled();
    await kits.detailEditButton.click();
    await expect(kits.detailMetadataDialog).toBeVisible();
    await kits.detailMetadataCancel.click();
    await expect(kits.detailMetadataDialog).not.toBeVisible();

    await expect(kits.detailSummaryBadge('total')).toHaveText(
      new RegExp(numberFormatter.format(totalRequired))
    );
    await expect(kits.detailSummaryBadge('shortfall')).toHaveText(
      new RegExp(numberFormatter.format(totalShortfall))
    );
    await expect(page.getByTestId('kits.detail.table.summary.available')).toHaveCount(0);

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

  test('updates kit metadata and refetches detail instrumentation', async ({
    kits,
    page,
    apiClient,
    testData,
  }) => {
    const kit = await testData.kits.create({
      overrides: {
        name: testData.kits.randomKitName('Metadata Kit'),
        description: 'Original metadata description',
        build_target: 3,
      },
    });

    const detailReady = waitForListLoading(page, 'kits.detail', 'ready');
    const contentsReady = waitForListLoading(page, 'kits.detail.contents', 'ready');

    await kits.gotoOverview();
    const searchReady = waitForListLoading(page, 'kits.overview', 'ready');
    await kits.search(kit.name);
    await searchReady;
    await kits.openDetailFromCard(kit.id);

    await detailReady;
    await contentsReady;

    const formOpen = waitTestEvent<FormTestEvent>(
      page,
      'form',
      (event) => event.formId === 'KitDetail:metadata' && event.phase === 'open'
    );
    await kits.detailEditButton.click();
    await formOpen;

    await expect(kits.detailMetadataDialog).toBeVisible();

    const updatedName = `${kit.name} Rev`;
    const updatedDescription = 'Updated metadata description for planners';
    const updatedBuildTarget = kit.build_target + 2;

    await kits.detailMetadataNameField.fill(updatedName);
    await kits.detailMetadataDescriptionField.fill(updatedDescription);
    await kits.detailMetadataBuildTargetField.fill(String(updatedBuildTarget));

    const submitEventPromise = waitTestEvent<FormTestEvent>(
      page,
      'form',
      (event) => event.formId === 'KitDetail:metadata' && event.phase === 'submit'
    );
    const successEventPromise = waitTestEvent<FormTestEvent>(
      page,
      'form',
      (event) => event.formId === 'KitDetail:metadata' && event.phase === 'success'
    );
    const detailReload = waitForListLoading(page, 'kits.detail', 'ready');
    const contentsReload = waitForListLoading(page, 'kits.detail.contents', 'ready');

    await kits.detailMetadataSubmit.click();

    const submitEvent = await submitEventPromise;
    expect(submitEvent.metadata?.kitId).toBe(kit.id);
    expect(submitEvent.metadata?.buildTarget).toBe(updatedBuildTarget);
    expect(submitEvent.metadata?.nameChanged).toBe(true);
    expect(submitEvent.metadata?.buildTargetChanged).toBe(true);

    const successEvent = await successEventPromise;
    expect(successEvent.metadata?.kitId).toBe(kit.id);
    expect(successEvent.metadata?.buildTarget).toBe(updatedBuildTarget);

    await detailReload;
    await contentsReload;

    await expect(kits.detailMetadataDialog).not.toBeVisible();
    await expect(kits.detailTitle).toHaveText(updatedName);
    await expect(kits.detailBuildTargetBadge).toContainText(
      new RegExp(String(updatedBuildTarget))
    );
    await expect(kits.detailDescription).toContainText(updatedDescription);

    const backendDetail = await apiClient.apiRequest<KitDetailResponseSchema_b98797e>(() =>
      apiClient.GET('/api/kits/{kit_id}', { params: { path: { kit_id: kit.id } } })
    );
    expect(backendDetail.name).toBe(updatedName);
    expect(backendDetail.description).toBe(updatedDescription);
    expect(backendDetail.build_target).toBe(updatedBuildTarget);
  });

  test('surfaces validation errors when metadata inputs are invalid', async ({
    kits,
    page,
    testData,
  }) => {
    const kit = await testData.kits.create({
      overrides: {
        name: testData.kits.randomKitName('Validation Kit'),
        build_target: 5,
      },
    });

    const detailReady = waitForListLoading(page, 'kits.detail', 'ready');
    const contentsReady = waitForListLoading(page, 'kits.detail.contents', 'ready');

    await kits.gotoOverview();
    const searchReady = waitForListLoading(page, 'kits.overview', 'ready');
    await kits.search(kit.name);
    await searchReady;
    await kits.openDetailFromCard(kit.id);

    await detailReady;
    await contentsReady;

    await kits.detailEditButton.click();
    await waitTestEvent<FormTestEvent>(
      page,
      'form',
      (event) => event.formId === 'KitDetail:metadata' && event.phase === 'open'
    );

    await kits.detailMetadataNameField.fill('   ');
    await kits.detailMetadataBuildTargetField.fill('-1');

    const nameValidation = waitForFormValidationError(page, 'KitDetail:metadata', 'name');
    const targetValidation = waitForFormValidationError(page, 'KitDetail:metadata', 'buildTarget');

    await kits.detailMetadataSubmit.click();
    await Promise.all([nameValidation, targetValidation]);

    const dialog = kits.detailMetadataDialog;
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Name is required')).toBeVisible();
    await expect(dialog.getByText('Build target must be 0 or greater')).toBeVisible();

    await kits.detailMetadataCancel.click();
    await expect(kits.detailMetadataDialog).not.toBeVisible();
  });

  test('disables metadata editing and BOM actions for archived kits', async ({
    kits,
    page,
    apiClient,
    testData,
  }) => {
    const { part } = await testData.parts.create({
      overrides: {
        description: 'Archived Part',
      },
    });
    const reservations = await apiClient.apiRequest<PartKitReservationsResponseSchema_d12d9a5>(() =>
      apiClient.GET('/api/parts/{part_key}/kit-reservations', {
        params: { path: { part_key: part.key } },
      })
    );
    const kit = await testData.kits.create({
      overrides: {
        name: testData.kits.randomKitName('Archived Kit'),
        build_target: 4,
      },
    });
    await testData.kits.addContent(kit.id, {
      partId: reservations.part_id,
      requiredPerUnit: 2,
    });
    await apiClient.POST('/api/kits/{kit_id}/archive', {
      params: { path: { kit_id: kit.id } },
    });

    await kits.gotoOverview();
    await kits.selectTab('archived');
    const searchReady = waitForListLoading(page, 'kits.overview', 'ready');
    await kits.search(kit.name);
    await searchReady;
    await kits.openDetailFromCard(kit.id, 'archived');

    await waitForListLoading(page, 'kits.detail', 'ready');
    await waitForListLoading(page, 'kits.detail.contents', 'ready');

    await expect(kits.detailEditButton).toBeDisabled();
    await kits.detailEditDisabledWrapper.hover();
    await expect(kits.detailEditTooltip).toBeVisible();
    await expect(kits.detailEditTooltip).toContainText('Archived kits are read-only');

    await expect(kits.detailAddPartButton).toBeDisabled();
    await expect(kits.detailAddPartButton).toHaveAttribute('title', /Archived kits cannot be edited/i);

    const archivedDetail = await testData.kits.getDetail(kit.id);
    const firstContentId = (archivedDetail.contents ?? [])[0]?.id;
    expect(firstContentId).toBeDefined();

    const row = kits.detailTableRow(firstContentId!);
    await expect(row).toBeVisible();

    const rowEditButton = kits.detailRowEditButton(firstContentId!);
    const rowDeleteButton = kits.detailRowDeleteButton(firstContentId!);
    await expect(rowEditButton).toBeDisabled();
    await expect(rowEditButton).toHaveAttribute('title', /Archived kits cannot be edited/i);
    await expect(rowDeleteButton).toBeDisabled();
    await expect(rowDeleteButton).toHaveAttribute('title', /Archived kits cannot be edited/i);
  });

  test('renders linked shopping and pick list chips with navigation', async ({
    kits,
    pickLists,
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
      requiredPerUnit: 1,
    });

    const initialStockBox = await testData.boxes.create();
    await apiClient.apiRequest(() =>
      apiClient.POST('/api/inventory/parts/{part_key}/stock', {
        params: { path: { part_key: part.key } },
        body: { box_no: initialStockBox.box_no, loc_no: 1, qty: 20 },
      })
    );

    const extraStockBox = await testData.boxes.create();
    await apiClient.apiRequest(() =>
      apiClient.POST('/api/inventory/parts/{part_key}/stock', {
        params: { path: { part_key: part.key } },
        body: { box_no: extraStockBox.box_no, loc_no: 2, qty: 10 },
      })
    );

    const pickListPreDetail = await testData.kits.getDetail(kit.id);
    const pickListContentBefore = pickListPreDetail.contents?.[0];
    const pickListAvailableBefore = pickListContentBefore?.available ?? 0;
    const pickListShortfallBefore = pickListContentBefore?.shortfall ?? 0;
    expect(pickListAvailableBefore).toBeGreaterThan(0);
    expect(pickListShortfallBefore).toBe(0);

    const pickListStockBox = await testData.boxes.create();
    const pickListStockLocation = await apiClient.apiRequest(() =>
      apiClient.POST('/api/inventory/parts/{part_key}/stock', {
        params: { path: { part_key: part.key } },
        body: { box_no: pickListStockBox.box_no, loc_no: 5, qty: 100 },
      })
    );
    expect(pickListStockLocation.qty).toBeGreaterThanOrEqual(100);


    const stockBox = await testData.boxes.create();
    await apiClient.apiRequest(() =>
      apiClient.POST('/api/inventory/parts/{part_key}/stock', {
        params: { path: { part_key: part.key } },
        body: { box_no: stockBox.box_no, loc_no: 1, qty: 10 },
      })
    );

    const preDetail = await testData.kits.getDetail(kit.id);
    const contentBefore = preDetail.contents?.[0];
    const availableBefore = contentBefore?.available ?? 0;
    const shortfallBefore = contentBefore?.shortfall ?? 0;
    expect(availableBefore).toBeGreaterThan(0);
    expect(shortfallBefore).toBe(0);

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
    const pickListLines = pickList.lines ?? [];
    const [pickListLine] = pickListLines;
    expect(pickListLine).toBeDefined();

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

    const pickDetailReady = waitForListLoading(page, 'pickLists.detail', 'ready');
    const pickLinesReady = waitForListLoading(page, 'pickLists.detail.lines', 'ready');
    const pickUiReady = waitForUiState(page, 'pickLists.detail.load', 'ready');
    const pickAvailabilityReady = waitForUiState(page, 'pickLists.detail.availability', 'ready');

    await pickChip.click();
    await Promise.all([pickDetailReady, pickLinesReady, pickUiReady, pickAvailabilityReady]);

    const executionLoading = waitForUiState(page, 'pickLists.detail.execution', 'loading');
    const executionReady = waitForUiState(page, 'pickLists.detail.execution', 'ready');
    const detailReload = waitForListLoading(page, 'pickLists.detail', 'ready');
    const linesReload = waitForListLoading(page, 'pickLists.detail.lines', 'ready');

    await pickLists.pickButton(pickListLine!.id).click();

    await executionLoading;
    const executionEvent = await executionReady;
    await Promise.all([detailReload, linesReload]);

    expect(executionEvent.metadata).toMatchObject({
      action: 'pick',
      pickListId: pickList.id,
      lineId: pickListLine!.id,
      kitId: kit.id,
      status: 'completed',
    });

    await expect(pickLists.statusBadge).toHaveText(/Completed/i);

    const returnDetail = waitForListLoading(page, 'kits.detail', 'ready');
    const returnContents = waitForListLoading(page, 'kits.detail.contents', 'ready');
    const returnLinks = waitForUiState(page, 'kits.detail.links', 'ready');

    await pickLists.kitChip.click();
    await Promise.all([returnDetail, returnContents, returnLinks]);

    const completedPickChip = kits.pickListChip(pickList.id);
    await expect(completedPickChip).toContainText(/Completed/i);

    const overviewReady = waitForListLoading(page, 'kits.overview', 'ready');
    const pickMembershipReady = waitForListLoading(page, 'kits.list.memberships.pick', 'ready');
    await kits.goto('/kits');
    await expect(kits.overviewRoot).toBeVisible();
    await Promise.all([overviewReady, pickMembershipReady]);

    const searchOverviewReady = waitForListLoading(page, 'kits.overview', 'ready');
    const searchMembershipReady = waitForListLoading(page, 'kits.list.memberships.pick', 'ready');
    await kits.search(kit.name);
    await Promise.all([searchOverviewReady, searchMembershipReady]);

    await expect(kits.cardById(kit.id)).toBeVisible();
    await expect(kits.pickIndicator(kit.id)).toBeHidden();
    await expect(kits.cardById(kit.id)).not.toContainText(/open pick list/i);
  });

  test('creates a pick list from the kit header action with instrumentation coverage', async ({
    kits,
    page,
    apiClient,
    testData,
    toastHelper,
  }) => {
    const { part } = await testData.parts.create({
      overrides: { description: 'Pick List Entry Part' },
    });
    await testData.parts.getDetail(part.key);
    const partReservationMetadata = await apiClient.apiRequest<PartKitReservationsResponseSchema_d12d9a5>(() =>
      apiClient.GET('/api/parts/{part_key}/kit-reservations', {
        params: { path: { part_key: part.key } },
      })
    );
    const partId = partReservationMetadata.part_id;

  const kit = await testData.kits.create({
    overrides: {
      name: testData.kits.randomKitName('Create Pick List Kit'),
      build_target: 5,
    },
  });

  await testData.kits.addContent(kit.id, {
    partId,
    requiredPerUnit: 2,
  });

  const pickListStockBox = await testData.boxes.create();
  await apiClient.apiRequest(() =>
    apiClient.POST('/api/inventory/parts/{part_key}/stock', {
      params: { path: { part_key: part.key } },
      body: { box_no: pickListStockBox.box_no, loc_no: 1, qty: 25 },
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
        event.metadata?.kitId === kit.id,
    );

    await kits.gotoOverview();
    const searchReady = waitForListLoading(page, 'kits.overview', 'ready');
    await kits.search(kit.name);
    await searchReady;
    await expect(kits.cardById(kit.id)).toBeVisible();
    await kits.openDetailFromCard(kit.id);

    await detailReady;
    await contentsReady;
    await linksReady;

    await expect(kits.detailCreatePickListButton).toBeEnabled();
    await kits.detailCreatePickListButton.click();
    const pickListDialog = page.getByRole('dialog', { name: 'Create Pick List' });
    await expect(pickListDialog).toBeVisible();

    const validationEvent = waitTestEvent<FormTestEvent>(
      page,
      'form',
      event => event.formId === 'KitPickList:create' && event.phase === 'validation_error',
    );
    await kits.detailCreatePickListSubmit.click();
    const validationPayload = await validationEvent;
    expect(validationPayload.metadata?.field).toBe('requestedUnits');
    await expect(kits.detailCreatePickListRequestedUnits).toHaveAttribute(
      'aria-invalid',
      'true',
    );

    await kits.detailCreatePickListRequestedUnits.fill('1');

    const submitEvent = waitTestEvent<FormTestEvent>(
      page,
      'form',
      event => event.formId === 'KitPickList:create' && event.phase === 'submit',
    );
    const successEvent = waitTestEvent<FormTestEvent>(
      page,
      'form',
      event => event.formId === 'KitPickList:create' && event.phase === 'success',
    );
    const loadingReady = waitForListLoading(page, 'kits.detail.pickLists.create', 'ready');
    const linksReload = waitTestEvent<UiStateTestEvent>(
      page,
      'ui_state',
      event =>
        event.scope === 'kits.detail.links' &&
        event.phase === 'ready' &&
        event.metadata?.kitId === kit.id,
    );

    await kits.detailCreatePickListSubmit.click();

    const submitPayload = await submitEvent;
    expect(submitPayload.fields).toMatchObject({
      kitId: kit.id,
      requestedUnits: 1,
    });

    const successPayload = await successEvent;
    expect(successPayload.fields).toMatchObject({
      kitId: kit.id,
      requestedUnits: 1,
      pickListId: expect.any(Number),
    });

    const loadingEvent = await loadingReady;
    expect(loadingEvent.metadata).toMatchObject({
      kitId: kit.id,
      requestedUnits: 1,
      pickListId: expect.any(Number),
    });

    await toastHelper.expectSuccessToast(/Created pick list/i);
    await expect(pickListDialog).not.toBeVisible();
    await linksReload;

    const refreshed = await apiClient.apiRequest<KitDetailResponseSchema_b98797e>(() =>
      apiClient.GET('/api/kits/{kit_id}', {
        params: { path: { kit_id: kit.id } },
      }),
    );

    const createdPickList = refreshed.pick_lists?.[0];
    expect(createdPickList).toBeDefined();
    expect(createdPickList?.requested_units).toBe(1);

    const createdPickListId = createdPickList?.id;
    expect(typeof createdPickListId).toBe('number');
    if (typeof createdPickListId !== 'number') {
      throw new Error('Failed to read created pick list id for assertions');
    }

    await expect(kits.pickListChip(createdPickListId)).toBeVisible();
    await expect(kits.pickListChip(createdPickListId)).toContainText(
      `Pick list #${createdPickListId}`,
    );
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

  test('allows planners to add kit contents inline with optimistic instrumentation', async ({
    kits,
    page,
    testData,
  }) => {
    const { part } = await testData.parts.create({
      overrides: { description: 'Inline Add Component' },
    });
    const kit = await testData.kits.create();

    await kits.gotoOverview();
    const searchReady = waitForListLoading(page, 'kits.overview', 'ready');
    await kits.search(kit.name);
    await searchReady;
    await kits.openDetailFromCard(kit.id);
    await waitForListLoading(page, 'kits.detail.contents', 'ready');

    await kits.detailAddPartButton.click();
    await waitForListLoading(page, 'parts.selector', 'ready');

    const partInput = page.getByTestId('parts.selector.input');
    await partInput.fill(part.key);
    await page.getByRole('option', { name: new RegExp(part.key, 'i') }).first().click();

    await kits.detailEditorQuantity('create').fill('3');
    await kits.detailEditorNote('create').fill('Install near regulator');

    const submitEvent = waitTestEvent(page, 'form', (event: any) => {
      return event.formId === 'KitContent:create' && event.phase === 'submit';
    });
    const successEventPromise = waitTestEvent(page, 'form', (event: any) => {
      return event.formId === 'KitContent:create' && event.phase === 'success';
    });

    await kits.detailEditorSubmit('create').click();
    await submitEvent;
    await waitForListLoading(page, 'kits.detail.contents', 'ready');

    const successEvent = await successEventPromise;
    expect(successEvent.fields?.kitId).toBe(kit.id);
    expect(successEvent.fields?.partKey).toBe(part.key);

    const newContentId = successEvent.fields?.contentId as number | undefined;
    expect(newContentId).toBeDefined();

    await expect(kits.detailTableRow(newContentId!)).toBeVisible();
    await expect(kits.detailTableRow(newContentId!).locator('td').nth(1)).toHaveText(
      numberFormatter.format(3)
    );
    await expect(kits.detailTableRow(newContentId!).locator('td').nth(7)).toContainText(
      'Install near regulator'
    );

    const backendDetail = await testData.kits.getDetail(kit.id);
    const backendContents = (backendDetail.contents ?? []) as KitContentDetailSchema_b98797e[];
    const createdRow = backendContents.find((row) => row.id === newContentId);
    expect(createdRow).toBeDefined();
    expect(createdRow?.required_per_unit).toBe(3);
    expect(createdRow?.note).toBe('Install near regulator');

    await expect(kits.detailSummaryBadge('total')).toHaveText(
      new RegExp(numberFormatter.format(createdRow?.total_required ?? 3))
    );
  });

  test('supports inline editing with optimistic updates and form instrumentation', async ({
    kits,
    page,
    testData,
    apiClient,
  }) => {
    const { part } = await testData.parts.create({
      overrides: { description: 'Inline Edit Part' },
    });
    const partMetadata = await apiClient.apiRequest<PartKitReservationsResponseSchema_d12d9a5>(() =>
      apiClient.GET('/api/parts/{part_key}/kit-reservations', {
        params: { path: { part_key: part.key } },
      })
    );
    const kit = await testData.kits.create({
      overrides: { build_target: 2 },
    });
    const existingContent = await testData.kits.addContent(kit.id, {
      partId: partMetadata.part_id,
      requiredPerUnit: 2,
      note: 'Initial note',
    });

    await kits.gotoOverview();
    const searchReady = waitForListLoading(page, 'kits.overview', 'ready');
    await kits.search(kit.name);
    await searchReady;
    await kits.openDetailFromCard(kit.id);
    await waitForListLoading(page, 'kits.detail.contents', 'ready');

    await kits.detailRowEditButton(existingContent.id).click();
    const editor = kits.detailEditor('edit', existingContent.id);
    await expect(editor).toBeVisible();

    await kits.detailEditorQuantity('edit', existingContent.id).fill('5');
    await kits.detailEditorNote('edit', existingContent.id).fill('Update per unit requirement');

    const submitEvent = waitTestEvent(page, 'form', (event: any) => {
      return event.formId === 'KitContent:update' && event.phase === 'submit';
    });
    const successEventPromise = waitTestEvent(page, 'form', (event: any) => {
      return event.formId === 'KitContent:update' && event.phase === 'success';
    });

    await kits.detailEditorSubmit('edit', existingContent.id).click();
    await submitEvent;
    await waitForListLoading(page, 'kits.detail.contents', 'ready');

    const successEvent = await successEventPromise;
    expect(successEvent.fields?.contentId).toBe(existingContent.id);
    expect(successEvent.fields?.partKey).toBe(part.key);

    const updatedRow = kits.detailTableRow(existingContent.id);
    await expect(updatedRow.locator('td').nth(1)).toHaveText(numberFormatter.format(5));
    await expect(updatedRow.locator('td').nth(7)).toContainText('Update per unit requirement');

    const backendDetail = await testData.kits.getDetail(kit.id);
    const backendContents = (backendDetail.contents ?? []) as KitContentDetailSchema_b98797e[];
    const updatedBackendRow = backendContents.find((row) => row.id === existingContent.id);
    expect(updatedBackendRow?.required_per_unit).toBe(5);
    expect(updatedBackendRow?.note).toBe('Update per unit requirement');
  });

  test('recovers from optimistic locking conflicts when editing kit contents', async ({
    kits,
    page,
    testData,
    apiClient,
    testEvents,
    toastHelper,
  }) => {
    await testEvents.startCapture({ bufferSize: 200 });
    const { part } = await testData.parts.create({
      overrides: { description: 'Conflict Part' },
    });
    const partMetadata = await apiClient.apiRequest<PartKitReservationsResponseSchema_d12d9a5>(() =>
      apiClient.GET('/api/parts/{part_key}/kit-reservations', {
        params: { path: { part_key: part.key } },
      })
    );
    const kit = await testData.kits.create();
    const seeded = await testData.kits.addContent(kit.id, {
      partId: partMetadata.part_id,
      requiredPerUnit: 4,
      note: null,
    });

    await kits.gotoOverview();
    const searchReady = waitForListLoading(page, 'kits.overview', 'ready');
    await kits.search(kit.name);
    await searchReady;
    await kits.openDetailFromCard(kit.id);
    await waitForListLoading(page, 'kits.detail.contents', 'ready');

    await kits.detailRowEditButton(seeded.id).click();
    await expect(kits.detailEditor('edit', seeded.id)).toBeVisible();

    await kits.detailEditorQuantity('edit', seeded.id).fill('6');
    await kits.detailEditorNote('edit', seeded.id).fill('Local draft');

    await testData.kits.updateContent(kit.id, seeded.id, {
      requiredPerUnit: 9,
      note: 'External update',
      version: seeded.version,
    });

    const preConflictFormEvents = await testEvents.getEventsByKind('form');
    await kits.detailEditorSubmit('edit', seeded.id).click();
    await expect(kits.detailEditor('edit', seeded.id)).toContainText('updated by another request');
    const postConflictFormEvents = await testEvents.getEventsByKind('form');
    const conflictEvent = postConflictFormEvents.find((event, index) => {
      if (event.kind !== 'form' || index < preConflictFormEvents.length) {
        return false;
      }
      const formEvent = event as FormTestEvent;
      if (formEvent.formId !== 'KitContent:update' || formEvent.phase !== 'error') {
        return false;
      }
      const metadataPhase = formEvent.metadata?.phase ?? (formEvent.fields as { phase?: string } | undefined)?.phase;
      return metadataPhase === 'conflict' || metadataPhase === 'error';
    });
    expect(conflictEvent).toBeDefined();
    await toastHelper.dismissToast({ all: true });

    const resolvedDetail = await testData.kits.getDetail(kit.id);
    const resolvedContents = (resolvedDetail.contents ?? []) as KitContentDetailSchema_b98797e[];
    const resolvedRow = resolvedContents.find((row) => row.id === seeded.id);
    expect(resolvedRow?.required_per_unit).toBe(9);
    expect(resolvedRow?.note).toBe('External update');

    await testEvents.stopCapture();
  });

  test('removes kit contents after confirmation', async ({ kits, page, testData, apiClient }) => {
    const { part } = await testData.parts.create({
      overrides: { description: 'Inline Delete Part' },
    });
    const partMetadata = await apiClient.apiRequest<PartKitReservationsResponseSchema_d12d9a5>(() =>
      apiClient.GET('/api/parts/{part_key}/kit-reservations', {
        params: { path: { part_key: part.key } },
      })
    );
    const kit = await testData.kits.create();
    const content = await testData.kits.addContent(kit.id, {
      partId: partMetadata.part_id,
      requiredPerUnit: 2,
    });

    await kits.gotoOverview();
    const searchReady = waitForListLoading(page, 'kits.overview', 'ready');
    await kits.search(kit.name);
    await searchReady;
    await kits.openDetailFromCard(kit.id);
    await waitForListLoading(page, 'kits.detail.contents', 'ready');

    await kits.detailRowDeleteButton(content.id).click();
    await expect(kits.detailDeleteDialog).toBeVisible();

    const submitEvent = waitTestEvent(page, 'form', (event: any) => {
      return event.formId === 'KitContent:delete' && event.phase === 'submit';
    });
    const successEventPromise = waitTestEvent(page, 'form', (event: any) => {
      return event.formId === 'KitContent:delete' && event.phase === 'success';
    });

    await kits.detailDeleteConfirm.click();
    await submitEvent;
    await waitForListLoading(page, 'kits.detail.contents', 'ready');
    await successEventPromise;

    await expect(kits.detailTableRow(content.id)).toHaveCount(0);

    const backendDetail = await testData.kits.getDetail(kit.id);
    const backendContents = (backendDetail.contents ?? []) as KitContentDetailSchema_b98797e[];
    const deleted = backendContents.find((row) => row.id === content.id);
    expect(deleted).toBeUndefined();
  });

  test('disables inline editing controls for archived kits', async ({ kits, page, testData, apiClient }) => {
    const { part } = await testData.parts.create({
      overrides: { description: 'Archived Part' },
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
    await testData.kits.archive(kit.id);

    await kits.gotoOverview();
    const searchReady = waitForListLoading(page, 'kits.overview', 'ready');
    await kits.search(kit.name);
    await searchReady;
    await kits.selectTab('archived');
    await kits.openDetailFromCard(kit.id, 'archived');
    await waitForListLoading(page, 'kits.detail.contents', 'ready');

    await expect(kits.detailAddPartButton).toBeDisabled();
    await expect(kits.detailRowEditButton(content.id)).toBeDisabled();
    await expect(kits.detailRowDeleteButton(content.id)).toBeDisabled();
  });

  test('orders stock into a Concept list and supports unlinking from kit detail', async ({ kits, testData, toastHelper, page, apiClient }) => {
    const { part } = await testData.parts.create({ overrides: { description: 'Shopping Flow Part' } });
    const partMetadata = await apiClient.apiRequest<PartKitReservationsResponseSchema_d12d9a5>(() =>
      apiClient.GET('/api/parts/{part_key}/kit-reservations', {
        params: { path: { part_key: part.key } },
      })
    );
    const partId = partMetadata.part_id;

    const { kit, contents } = await testData.kits.createWithContents({
      overrides: {
        name: testData.kits.randomKitName('Shopping Flow Kit'),
        build_target: 3,
        description: 'Kit used to verify shopping list linking flow',
      },
      contents: [
        { partId, requiredPerUnit: 4 },
      ],
    });

    const conceptList = await testData.shoppingLists.create({
      name: testData.shoppingLists.randomName('Concept Link Target'),
      description: null,
    });

    await kits.gotoOverview();
    const overviewReady = waitForListLoading(page, 'kits.overview', 'ready');
    await kits.search(kit.name);
    await overviewReady;
    await kits.cardById(kit.id).waitFor({ state: 'visible' });

    const detailReady = waitForListLoading(page, 'kits.detail', 'ready');
    const contentsReady = waitForListLoading(page, 'kits.detail.contents', 'ready');
    await kits.openDetailFromCard(kit.id);
    await Promise.all([detailReady, contentsReady]);

    const selectorReady = waitForListLoading(page, 'kits.detail.shoppingLists', 'ready');
    const flowOpen = waitForUiState(page, 'kits.detail.shoppingListFlow', 'open');
    await kits.detailOrderButton.click();
    await Promise.all([flowOpen, selectorReady]);
    await expect(kits.detailOrderDialog).toBeVisible();

    const requestedUnits = kit.build_target + 1;
    await kits.detailOrderUnitsField.fill(String(requestedUnits));
    await kits.selectShoppingListInDialog(conceptList.name);
    await expect(kits.detailOrderSelector.getByRole('combobox')).toHaveValue(conceptList.name);

    const submitEventPromise = waitForUiState(page, 'kits.detail.shoppingListFlow', 'submit');
    const successEventPromise = waitForUiState(page, 'kits.detail.shoppingListFlow', 'success');
    const linksEventPromise = waitTestEvent<UiStateTestEvent>(
      page,
      'ui_state',
      (event) => {
        if (event.scope !== 'kits.detail.links' || event.phase !== 'ready') {
          return false;
        }
        const metadata = event.metadata as { shoppingLists?: { ids?: number[] } } | undefined;
        return Array.isArray(metadata?.shoppingLists?.ids) && metadata!.shoppingLists!.ids!.includes(conceptList.id);
      }
    );

    await kits.detailOrderSubmit.click();

    const [submitEvent, successEvent, linksEvent] = await Promise.all([
      submitEventPromise,
      successEventPromise,
      linksEventPromise,
    ]);

    expect(submitEvent.metadata).toMatchObject({
      kitId: kit.id,
      action: 'order',
      targetListId: conceptList.id,
    });

    expect(successEvent.metadata).toMatchObject({
      kitId: kit.id,
      action: 'order',
      targetListId: conceptList.id,
      requestedUnits,
      honorReserved: true,
      noop: false,
    });

    const successMetadata = successEvent.metadata as { totalNeededQuantity?: number } | undefined;
    expect(successMetadata?.totalNeededQuantity).toBe(contents[0].required_per_unit * requestedUnits);

    const linksMetadata = linksEvent.metadata as { shoppingLists?: { ids?: number[] } } | undefined;
    expect(linksMetadata?.shoppingLists?.ids).toContain(conceptList.id);

    await expect(kits.detailOrderDialog).not.toBeVisible();
    await toastHelper.expectSuccessToast(/Queued/i);
    await toastHelper.dismissToast({ all: true });

    await expect(kits.shoppingLinkChip(conceptList.id)).toBeVisible();

    const unlinkOpen = waitForUiState(page, 'kits.detail.shoppingListFlow', 'open');
    await kits.shoppingLinkUnlinkButton(conceptList.id).click();
    await unlinkOpen;
    await expect(kits.unlinkConfirmDialog).toBeVisible();

    const unlinkSubmit = waitForUiState(page, 'kits.detail.shoppingListFlow', 'submit');
    const unlinkSuccess = waitForUiState(page, 'kits.detail.shoppingListFlow', 'success');
    const linksAfterUnlink = waitTestEvent<UiStateTestEvent>(
      page,
      'ui_state',
      (event) => {
        if (event.scope !== 'kits.detail.links' || event.phase !== 'ready') {
          return false;
        }
        const metadata = event.metadata as { shoppingLists?: { ids?: number[] } } | undefined;
        const ids = metadata?.shoppingLists?.ids ?? [];
        return Array.isArray(ids) && ids.every((id: number) => id !== conceptList.id);
      }
    );

    await kits.unlinkConfirmDialog.getByRole('button', { name: /unlink list/i }).click();

    await Promise.all([unlinkSubmit, unlinkSuccess, linksAfterUnlink]);
    await toastHelper.expectSuccessToast(/Unlinked/i);
    await toastHelper.dismissToast({ all: true });

    await expect(kits.shoppingLinkChip(conceptList.id)).toHaveCount(0);
    await expect(kits.detailLinksEmpty).toBeVisible();
  });
});
