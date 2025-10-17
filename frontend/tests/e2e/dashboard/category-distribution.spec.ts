import { expect } from '@playwright/test';
import { test } from '../../support/fixtures';

async function ensureData<T>(response: { data?: T }): Promise<T> {
  if (!response.data) {
    throw new Error('Expected response data but received none');
  }
  return response.data;
}

test.describe('Dashboard category distribution', () => {
  test('ranks categories by part count and expands list', async ({
    dashboard,
    apiClient,
    testData,
  }) => {
    const typeA = await testData.types.create();
    await testData.parts.create({ typeId: typeA.id });
    await testData.parts.create({ typeId: typeA.id });

    const typeB = await testData.types.create();
    await testData.parts.create({ typeId: typeB.id });

    const categoriesData = await ensureData(
      await apiClient.GET('/api/dashboard/category-distribution', {}),
    );
    const sortedCategories = [...categoriesData].sort((a, b) => b.part_count - a.part_count);

    await dashboard.gotoDashboard();
    await dashboard.waitForCategoriesReady();

    if (sortedCategories.length === 0) {
      throw new Error('Expected at least one category in distribution data');
    }

    const uiCategories = await dashboard.categoryBars().evaluateAll((elements) =>
      elements.map((element) => element.getAttribute('data-category')),
    );
    const expectedOrder = sortedCategories.map((category) => category.type_name);
    expect(uiCategories).toEqual(expectedOrder.slice(0, uiCategories.length));

    if (sortedCategories.length > 10) {
      await dashboard.expandCategories();
      await expect(dashboard.playwrightPage.getByTestId('dashboard.categories.show-less')).toBeVisible();
    }
  });
});
