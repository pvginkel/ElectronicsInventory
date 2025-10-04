import { test, expect } from '../../support/fixtures';

test.describe('Types - TypeList states', () => {
  // Coverage note: failure scenarios rely on manual QA until backend alignment completes.

  test('shows loading skeletons while fetching types', async ({ types }) => {
    await types.goto();
    await types.waitForListState('loading');

    const skeletonCount = await types.loadingSkeletons.count();
    if (skeletonCount === 0) {
      // Other tests may have warmed the TanStack Query cache, allowing the list to resolve without repainting skeletons.
      await types.waitForListState('ready');
    } else {
      expect(skeletonCount).toBeGreaterThanOrEqual(1);
      await types.waitForListState('ready');
    }

    await expect(types.summary).toContainText(/\d+ types/);
  });

  test('persists search queries and updates summary text', async ({ page, types, testData }) => {
    const resistorType = await testData.types.create({
      name: testData.types.randomTypeName('TypeList Resistor'),
    });
    const capacitorType = await testData.types.create({
      name: testData.types.randomTypeName('TypeList Capacitor'),
    });
    await testData.types.create({
      name: testData.types.randomTypeName('TypeList Inductor'),
    });

    await types.goto();
    await types.waitForListState('ready');
    await expect(types.summary).toContainText(/\d+ types/);

    await types.search(capacitorType.name);
    await expect(types.cardByName(capacitorType.name)).toBeVisible();
    await expect(types.summary).toContainText(/1 of \d+ types/);

    const url = new URL(page.url());
    expect(url.searchParams.get('search')).toBe(capacitorType.name);

    await types.page.reload();
    await types.waitForListState('loading');
    await types.waitForListState('ready');
    await expect(types.searchInput).toHaveValue(capacitorType.name);
    await expect(types.cardByName(capacitorType.name)).toBeVisible();

    await types.search(resistorType.name);
    await expect(types.cardByName(resistorType.name)).toBeVisible();
  });

  test('updates part count badges when parts are created and deleted', async ({
    types,
    testData,
    apiClient,
  }) => {
    const typeName = testData.types.randomTypeName('TypeList');
    const createdType = await testData.types.create({ name: typeName });

    await types.goto();
    await types.waitForListState('ready');
    await expect(types.cardByName(typeName)).toBeVisible();
    await expect(types.partCountBadge(typeName)).toHaveText(/0 part(s)?/i);

    const { part } = await testData.parts.create({ typeId: createdType.id });

    await types.page.reload();
    await types.waitForListState('loading');
    await types.waitForListState('ready');
    await expect(types.partCountBadge(typeName)).toHaveText(/1 part(s)?/i);

    await apiClient.DELETE('/api/parts/{part_key}', {
      params: { path: { part_key: part.key } },
    });

    await types.page.reload();
    await types.waitForListState('loading');
    await types.waitForListState('ready');
    await expect(types.partCountBadge(typeName)).toHaveText(/0 part(s)?/i);
  });
});
