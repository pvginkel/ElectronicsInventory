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

  test('clear button click clears input field without programmatic fill', async ({ page, parts, testData }) => {
    // TDD test for clear button bug fix
    const searchTerm = testData.parts.randomPartDescription('Test Component');
    await testData.parts.create({ overrides: { description: searchTerm } });

    await parts.gotoList();
    await parts.waitForCards();

    // Enter search term
    await parts.searchInput.fill(searchTerm);
    await page.waitForURL(/[?&]search=/);
    await expect(parts.searchInput).toHaveValue(searchTerm);

    // Click clear button (without programmatic fill workaround)
    const clearButton = page.getByTestId('parts.list.search.clear');
    await expect(clearButton).toBeVisible();
    await clearButton.click();

    // Assert URL cleared
    await expect(page).toHaveURL(/^(?!.*search)/);

    // Assert input field is empty
    await expect(parts.searchInput).toHaveValue('');
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

  test('shows filter buttons and toggles stock filter', async ({ page, parts, testData, apiClient }) => {
    const uniqueTerm = makeUnique('StockFilter');

    // Create parts with and without stock
    const typeA = await testData.types.create();
    const { part: partWithStock } = await testData.parts.create({
      overrides: {
        description: `${uniqueTerm} Part with stock`,
        type_id: typeA.id,
      },
    });
    const { part: partWithoutStock } = await testData.parts.create({
      overrides: {
        description: `${uniqueTerm} Part without stock`,
        type_id: typeA.id,
      },
    });

    // Add stock to one part
    const box = await testData.boxes.create();
    await apiClient.POST('/api/inventory/parts/{part_key}/stock', {
      params: { path: { part_key: partWithStock.key } },
      body: { box_no: box.box_no, loc_no: 1, qty: 10 },
    });

    await parts.gotoList();
    await parts.waitForCards();

    // Search for our unique parts to isolate the test
    await parts.search(uniqueTerm);

    // Verify both parts are visible initially
    await expect(parts.cardByKey(partWithStock.key)).toBeVisible();
    await expect(parts.cardByKey(partWithoutStock.key)).toBeVisible();
    await parts.expectSummaryText(/2 of \d+ parts showing/i);

    // Activate stock filter
    await parts.activateStockFilter();
    await expect(page).toHaveURL(/hasStock=true/);

    // Verify only part with stock is visible
    await expect(parts.cardByKey(partWithStock.key)).toBeVisible();
    await expect(parts.cardByKey(partWithoutStock.key)).toBeHidden();
    await parts.expectSummaryText(/1 of \d+ parts showing/i);

    // Deactivate stock filter
    await parts.deactivateStockFilter();
    await expect(page).toHaveURL(/^(?!.*hasStock)/);

    // Verify both parts are visible again
    await expect(parts.cardByKey(partWithStock.key)).toBeVisible();
    await expect(parts.cardByKey(partWithoutStock.key)).toBeVisible();
    await parts.expectSummaryText(/2 of \d+ parts showing/i); // Still shows filtered count due to search
  });

  test('filters by shopping list membership', async ({ page, parts, testData }) => {
    const uniqueTerm = makeUnique('ShoppingListFilter');

    // Create parts with and without shopping list memberships
    const { part: partOnList } = await testData.parts.create({
      overrides: { description: `${uniqueTerm} Part on list` },
    });
    const { part: partNotOnList } = await testData.parts.create({
      overrides: { description: `${uniqueTerm} Part not on list` },
    });

    // Add one part to a shopping list
    const shoppingList = await testData.shoppingLists.create();
    await testData.shoppingLists.createLine(shoppingList.id, {
      partKey: partOnList.key,
      needed: 5,
    });

    await parts.gotoList();
    await parts.waitForCards();

    // Search for our unique parts to isolate the test
    await parts.search(uniqueTerm);

    // Wait for shopping list indicator to load for the part on the list
    await expect(parts.shoppingListIndicator(partOnList.key)).toBeVisible();

    // Verify both parts are visible initially
    await expect(parts.cardByKey(partOnList.key)).toBeVisible();
    await expect(parts.cardByKey(partNotOnList.key)).toBeVisible();
    await parts.expectSummaryText(/2 of \d+ parts showing/i);

    // Activate shopping list filter
    await parts.onShoppingListFilterButton.click();
    await expect(page).toHaveURL(/onShoppingList=true/);

    // Verify only part on shopping list is visible (filter applies after shopping list indicators load)
    await expect(parts.cardByKey(partNotOnList.key)).toBeHidden();
    await expect(parts.cardByKey(partOnList.key)).toBeVisible();
    await parts.expectSummaryText(/1 of \d+ parts showing/i);

    // Deactivate shopping list filter
    await parts.deactivateShoppingListFilter();
    await expect(page).toHaveURL(/^(?!.*onShoppingList)/);

    // Verify both parts are visible again
    await expect(parts.cardByKey(partOnList.key)).toBeVisible();
    await expect(parts.cardByKey(partNotOnList.key)).toBeVisible();
    await parts.expectSummaryText(/2 of \d+ parts showing/i); // Still shows filtered count due to search
  });

  test('combines both filters with AND logic', async ({ page, parts, testData, apiClient }) => {
    const uniqueTerm = makeUnique('BothFilters');

    // Create parts with different combinations of stock and shopping list membership
    const { part: partWithBoth } = await testData.parts.create({
      overrides: { description: `${uniqueTerm} Has stock and on list` },
    });
    const { part: partStockOnly } = await testData.parts.create({
      overrides: { description: `${uniqueTerm} Has stock only` },
    });
    const { part: partListOnly } = await testData.parts.create({
      overrides: { description: `${uniqueTerm} On list only` },
    });
    const { part: partNeither } = await testData.parts.create({
      overrides: { description: `${uniqueTerm} Neither stock nor list` },
    });

    // Add stock to relevant parts
    const box = await testData.boxes.create();
    await apiClient.POST('/api/inventory/parts/{part_key}/stock', {
      params: { path: { part_key: partWithBoth.key } },
      body: { box_no: box.box_no, loc_no: 1, qty: 10 },
    });
    await apiClient.POST('/api/inventory/parts/{part_key}/stock', {
      params: { path: { part_key: partStockOnly.key } },
      body: { box_no: box.box_no, loc_no: 2, qty: 5 },
    });

    // Add shopping list memberships
    const shoppingList = await testData.shoppingLists.create();
    await testData.shoppingLists.createLine(shoppingList.id, {
      partKey: partWithBoth.key,
      needed: 5,
    });
    await testData.shoppingLists.createLine(shoppingList.id, {
      partKey: partListOnly.key,
      needed: 3,
    });

    await parts.gotoList();
    await parts.waitForCards();

    // Search for our unique parts to isolate the test
    await parts.search(uniqueTerm);

    // Wait for shopping list indicators to load
    await expect(parts.shoppingListIndicator(partWithBoth.key)).toBeVisible();
    await expect(parts.shoppingListIndicator(partListOnly.key)).toBeVisible();

    // Activate both filters
    await parts.activateStockFilter();
    await parts.onShoppingListFilterButton.click();
    await expect(page).toHaveURL(/hasStock=true/);
    await expect(page).toHaveURL(/onShoppingList=true/);

    // Verify only part with both stock AND shopping list membership is visible
    await expect(parts.cardByKey(partStockOnly.key)).toBeHidden();
    await expect(parts.cardByKey(partListOnly.key)).toBeHidden();
    await expect(parts.cardByKey(partNeither.key)).toBeHidden();
    await expect(parts.cardByKey(partWithBoth.key)).toBeVisible();
    await parts.expectSummaryText(/1 of \d+ parts showing/i);
  });

  test('combines filters with search term', async ({ parts, testData, apiClient }) => {
    const uniqueTerm = makeUnique('FilterTest');

    // Create parts with different combinations
    const { part: matchesAll } = await testData.parts.create({
      overrides: { description: `${uniqueTerm} matches all criteria` },
    });
    const { part: matchesSearchAndStock } = await testData.parts.create({
      overrides: { description: `${uniqueTerm} has stock only` },
    });
    const { part: matchesSearchOnly } = await testData.parts.create({
      overrides: { description: `${uniqueTerm} no stock or list` },
    });
    const { part: noMatch } = await testData.parts.create({
      overrides: { description: 'Different part entirely' },
    });

    // Add stock
    const box = await testData.boxes.create();
    await apiClient.POST('/api/inventory/parts/{part_key}/stock', {
      params: { path: { part_key: matchesAll.key } },
      body: { box_no: box.box_no, loc_no: 1, qty: 10 },
    });
    await apiClient.POST('/api/inventory/parts/{part_key}/stock', {
      params: { path: { part_key: matchesSearchAndStock.key } },
      body: { box_no: box.box_no, loc_no: 2, qty: 5 },
    });

    // Add to shopping list
    const shoppingList = await testData.shoppingLists.create();
    await testData.shoppingLists.createLine(shoppingList.id, {
      partKey: matchesAll.key,
      needed: 5,
    });

    await parts.gotoList();
    await parts.waitForCards();

    // Wait for shopping list indicator to load
    await expect(parts.shoppingListIndicator(matchesAll.key)).toBeVisible();

    // Apply search term
    await parts.search(uniqueTerm);

    // Apply both filters
    await parts.activateStockFilter();
    await parts.activateShoppingListFilter();

    // Verify only part matching all criteria is visible
    await expect(parts.cardByKey(matchesAll.key)).toBeVisible();
    await expect(parts.cardByKey(matchesSearchAndStock.key)).toBeHidden();
    await expect(parts.cardByKey(matchesSearchOnly.key)).toBeHidden();
    await expect(parts.cardByKey(noMatch.key)).toBeHidden();
    await parts.expectSummaryText(/1 of \d+ parts showing/i);
  });

  test('shows no results state when filters yield zero matches', async ({ parts, testData }) => {
    const uniqueTerm = makeUnique('NoStock');

    // Create parts without stock or shopping list memberships
    const { part: part1 } = await testData.parts.create({
      overrides: { description: `${uniqueTerm} No stock part 1` },
    });
    const { part: part2 } = await testData.parts.create({
      overrides: { description: `${uniqueTerm} No stock part 2` },
    });

    await parts.gotoList();
    await parts.waitForCards();

    // First, search for our unique parts to isolate the test
    await parts.search(uniqueTerm);

    // Verify both parts are visible without filter
    await expect(parts.cardByKey(part1.key)).toBeVisible();
    await expect(parts.cardByKey(part2.key)).toBeVisible();

    // Activate stock filter - should show no results since these parts have no stock
    await parts.activateStockFilter();

    await parts.expectNoResults();
    await parts.expectSummaryText(/0 of \d+ parts showing/i);
  });

  test('preserves filter state across navigation to detail and back', async ({ page, parts, testData, apiClient }) => {
    const uniqueTerm = makeUnique('NavTest');

    // Create part with stock
    const { part } = await testData.parts.create({
      overrides: { description: `${uniqueTerm} Test part` },
    });
    const box = await testData.boxes.create();
    await apiClient.POST('/api/inventory/parts/{part_key}/stock', {
      params: { path: { part_key: part.key } },
      body: { box_no: box.box_no, loc_no: 1, qty: 10 },
    });

    await parts.gotoList();
    await parts.waitForCards();

    // Search for our unique part to isolate the test
    await parts.search(uniqueTerm);

    // Activate filter
    await parts.activateStockFilter();
    await expect(page).toHaveURL(/hasStock=true/);
    await expect(page).toHaveURL(/search=/);

    // Navigate to detail
    await parts.openCardByKey(part.key);
    await parts.waitForDetailReady();

    // Navigate back
    await page.goBack();
    await parts.waitForCards();

    // Verify filter and search are still active
    await expect(page).toHaveURL(/hasStock=true/);
    await expect(page).toHaveURL(/search=/);
    await expect(parts.cardByKey(part.key)).toBeVisible();
    await parts.expectSummaryText(/1 of \d+ parts showing/i);
  });
});
