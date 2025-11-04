import { test, expect } from '../../support/fixtures';
import { makeUnique } from '../../support/helpers';

test.describe('Parts - List View', () => {
  // Coverage note: failure scenarios are temporarily exercised via manual QA while backend updates land.

  test('shows loading skeleton before data resolves', async ({ parts, testData }) => {
    await Promise.all(Array.from({ length: 6 }).map(() => testData.parts.create()));

    await parts.gotoList();
    await parts.waitForLoading();
    await parts.waitForCards();
    await parts.expectSummaryText(/parts/i);

    const headerBefore = await parts.header.boundingBox();
    expect(headerBefore).toBeTruthy();
    await parts.scrollContentBy(1200);
    await expect(parts.header).toBeVisible();
    const headerAfter = await parts.header.boundingBox();
    if (headerBefore && headerAfter) {
      expect(Math.abs(headerAfter.y - headerBefore.y)).toBeLessThan(1);
    }
  });

  test('renders part card metadata and navigates to detail', async ({ parts, testData, apiClient }) => {
    const typeName = testData.types.randomTypeName('Relay Type');
    const type = await testData.types.create({ name: typeName });
    const seller = await testData.sellers.create();
    const { part } = await testData.parts.create({
      overrides: {
        description: makeUnique('Automation Relay'),
        manufacturer_code: 'OMRON G5Q-1A4',
        type_id: type.id,
        tags: ['relay', '5v'],
        seller_id: seller.id,
        seller_link: seller.website ?? null,
      },
    });

    const box = await testData.boxes.create();
    const locationNumber = 3;
    await apiClient.POST('/api/inventory/parts/{part_key}/stock', {
      params: { path: { part_key: part.key } },
      body: { box_no: box.box_no, loc_no: locationNumber, qty: 12 },
    });

    await parts.gotoList();
    await parts.waitForCards();
    await parts.search(part.description);

    const card = parts.cardByKey(part.key);
    await expect(card).toContainText(part.description);
    await expect(card).toContainText('OMRON G5Q-1A4');
    await expect(card).toContainText(type.name);
    await expect(card).toContainText('12');
    await expect(card).toContainText(`Box ${box.box_no}-${locationNumber}`);

    await card.click();
    await expect(parts.detailRoot).toBeVisible();
    await parts.expectDetailHeading(part.description);
  });

  test('filters by search term and clears search', async ({ parts, testData }) => {
    const resistorType = await testData.types.create({ name: testData.types.randomTypeName('Resistor') });
    const capacitorType = await testData.types.create({ name: testData.types.randomTypeName('Capacitor') });

    const resistorDescription = testData.parts.randomPartDescription('Precision resistor');
    const capacitorDescription = testData.parts.randomPartDescription('High voltage capacitor');

    await testData.parts.create({ overrides: { description: resistorDescription, type_id: resistorType.id, tags: ['precision', 'resistor'] } });
    await testData.parts.create({ overrides: { description: capacitorDescription, type_id: capacitorType.id, tags: ['capacitor', 'hv'] } });

    await parts.gotoList();
    await parts.waitForCards();

    await parts.search(capacitorDescription);
    await expect(parts.cardByDescription(capacitorDescription)).toBeVisible();
    await parts.expectSummaryText(/1 of \d+ parts showing/i);

    await parts.clearSearch();
    await parts.expectSummaryText(/\d+ parts/i);
    await expect(parts.searchInput).toHaveValue('');
  });

  test('debounced search updates URL and filters results', async ({ page, parts, testData }) => {
    const ledDescription = testData.parts.randomPartDescription('LED indicator');
    const resistorDescription = testData.parts.randomPartDescription('Resistor');

    await testData.parts.create({ overrides: { description: ledDescription } });
    await testData.parts.create({ overrides: { description: resistorDescription } });

    await parts.gotoList();
    await parts.waitForCards();

    // Search for the unique LED description to ensure only 1 match
    await parts.search(ledDescription);

    // Verify URL updated with search parameter
    await expect(page).toHaveURL(/search=/);

    // Verify filtered results
    await expect(parts.cardByDescription(ledDescription)).toBeVisible();
    await parts.expectSummaryText(/1 of \d+ parts showing/i);

    // Clear should update URL after debounce completes
    await parts.clearSearch();
    await expect(page).toHaveURL(/^(?!.*search)/); // URL should not contain search param
    await parts.expectSummaryText(/\d+ parts/i);
  });

  test('opens AI dialog from list page', async ({ parts, partsAI, testData }) => {
    await testData.parts.create();

    await parts.gotoList();
    await parts.waitForCards();

    await parts.openAIDialog();
    await partsAI.waitForOpen();
    await partsAI.close();
  });

  test('shows part shopping list and kit membership tooltips', async ({ page, parts, testData, apiClient }) => {
    // Create part with memberships
    const { part } = await testData.parts.create();

    // Get part_id for kit membership
    const partReservations = await apiClient.apiRequest(() =>
      apiClient.GET('/api/parts/{part_key}/kit-reservations', {
        params: { path: { part_key: part.key } },
      })
    );
    const partId = partReservations.part_id;
    if (typeof partId !== 'number') {
      throw new Error('Failed to resolve part id for tooltip test');
    }

    // Create shopping list membership
    const shoppingList = await testData.shoppingLists.create();
    await testData.shoppingLists.createLine(shoppingList.id, {
      partKey: part.key,
      needed: 10,
    });

    // Create kit membership
    const kit = await testData.kits.create();
    await testData.kits.addContent(kit.id, {
      partId,
      requiredPerUnit: 5,
    });

    await parts.gotoList();
    await parts.waitForCards();
    await parts.search(part.description);

    // Verify shopping list tooltip
    const shoppingIndicator = parts.shoppingListIndicator(part.key);
    await shoppingIndicator.hover();
    const shoppingTooltip = parts.shoppingListIndicatorTooltip();
    await shoppingTooltip.waitFor({ state: 'visible' });
    await expect(shoppingTooltip).toContainText(shoppingList.name);
    await expect(shoppingTooltip).toContainText(/ready|concept/i);

    // Move mouse away from shopping tooltip to avoid blocking the kit indicator hover
    await page.mouse.move(0, 0);
    await shoppingTooltip.waitFor({ state: 'hidden' });

    // Verify kit membership tooltip
    const kitIndicator = parts.kitIndicator(part.key);
    await kitIndicator.hover();
    const kitTooltip = parts.kitIndicatorTooltip();
    await kitTooltip.waitFor({ state: 'visible' });
    await expect(kitTooltip).toContainText(kit.name);
    await expect(kitTooltip).toContainText(/active/i);
    await expect(kitTooltip).toContainText('per kit');
    await expect(kitTooltip).toContainText('reserved');
  });
});
