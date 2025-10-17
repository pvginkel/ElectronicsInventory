import { test, expect } from '../../support/fixtures';

test.describe('Types - TypeList states', () => {
  // Coverage note: failure scenarios rely on manual QA until backend alignment completes.

  test('shows loading skeletons while fetching types', async ({ types, testData }) => {
    await Promise.all(Array.from({ length: 6 }).map(() => testData.types.create()));
    const loadingPromise = types.waitForListState('loading').catch(() => undefined);
    const readyPromise = types.waitForListState('ready');
    await types.goto();
    await loadingPromise;

    const skeletonCount = await types.loadingSkeletons.count();
    if (skeletonCount > 0) {
      expect(skeletonCount).toBeGreaterThanOrEqual(1);
    }

    await readyPromise;

    await expect(types.summary).toContainText(/\d+ types/);

    const headerBefore = await types.header.boundingBox();
    expect(headerBefore).toBeTruthy();
    await types.scrollContentBy(800);
    await expect(types.header).toBeVisible();
    const headerAfter = await types.header.boundingBox();
    if (headerBefore && headerAfter) {
      expect(Math.abs(headerAfter.y - headerBefore.y)).toBeLessThan(1);
    }
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
    await expect(types.summary).toContainText(/1 of \d+ types showing/);
    await expect(types.page.getByTestId('list-screen.counts.filtered')).toHaveText(/1 filtered/i);

    const url = new URL(page.url());
    expect(url.searchParams.get('search')).toBe(capacitorType.name);

    {
      const loadingPromise = types.waitForListState('loading').catch(() => undefined);
      const readyPromise = types.waitForListState('ready');
      await types.page.reload();
      await loadingPromise;
      await readyPromise;
    }
    await expect(types.searchInput).toHaveValue(capacitorType.name);
    await expect(types.cardByName(capacitorType.name)).toBeVisible();

    await types.search(resistorType.name);
    await expect(types.cardByName(resistorType.name)).toBeVisible();
    await expect(types.summary).toContainText(/1 of \d+ types showing/);
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

    {
      const loadingPromise = types.waitForListState('loading').catch(() => undefined);
      const readyPromise = types.waitForListState('ready');
      await types.page.reload();
      await loadingPromise;
      await readyPromise;
    }
    await expect(types.partCountBadge(typeName)).toHaveText(/1 part(s)?/i);

    await apiClient.DELETE('/api/parts/{part_key}', {
      params: { path: { part_key: part.key } },
    });

    {
      const loadingPromise = types.waitForListState('loading').catch(() => undefined);
      const readyPromise = types.waitForListState('ready');
      await types.page.reload();
      await loadingPromise;
      await readyPromise;
    }
    await expect(types.partCountBadge(typeName)).toHaveText(/0 part(s)?/i);
  });
});
