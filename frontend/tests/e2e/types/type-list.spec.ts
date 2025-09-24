import type { Route } from '@playwright/test';
import { test, expect } from '../../support/fixtures';
import { expectConsoleError } from '../../support/helpers';

const typesEndpoint = '**/api/types?include_stats=true';

async function fulfillJson(route: Route, payload: unknown, status = 200) {
  await route.fulfill({
    status,
    body: JSON.stringify(payload),
    headers: { 'content-type': 'application/json' },
  });
}

test.describe('Types - TypeList states', () => {
  test('surface error state when query fails', async ({ page, types }) => {
    await page.route(typesEndpoint, route => route.abort('failed'));

    try {
      await expectConsoleError(types.page, /Failed to load resource/);
      await types.goto();
      await expect(types.errorState).toBeVisible({ timeout: 15000 });
      await expect(types.errorState).toContainText('Failed to load types');
    } finally {
      await page.unroute(typesEndpoint);
    }
  });

  test('shows loading skeletons while fetching types', async ({ page, types }) => {
    let capturedRoute: Route | null = null;

    await page.route(typesEndpoint, route => {
      capturedRoute = route;
    }, { times: 1 });

    try {
      await types.goto();
      await expect(types.createButton).toBeDisabled();
      await expect(types.loadingSkeletons).toHaveCount(6);
      if (!capturedRoute) {
        throw new Error('Types request was not captured');
      }
      await fulfillJson(capturedRoute, []);
    } finally {
      await page.unroute(typesEndpoint);
    }
  });

  test('renders empty state when no types exist', async ({ page, types }) => {
    await page.route(typesEndpoint, route => fulfillJson(route, []), { times: 1 });

    try {
      await types.goto();
      await expect(types.emptyState).toBeVisible();
      await expect(types.emptyState).toContainText('No types yet');
    } finally {
      await page.unroute(typesEndpoint);
    }
  });

  test('persists search queries and updates summary text', async ({ page, types }) => {
    const list = [
      { id: 1, name: 'Resistor Pack', part_count: 5 },
      { id: 2, name: 'Capacitor Kit', part_count: 3 },
      { id: 3, name: 'Inductor Set', part_count: 2 },
    ];

    await page.route(typesEndpoint, route => fulfillJson(route, list));

    try {
      await types.goto();
      await expect(types.summary).toContainText(`${list.length} types`);

      await types.search('Capacitor');
      await expect(types.cardByName('Capacitor Kit')).toBeVisible();
      await expect(types.summary).toContainText(`1 of ${list.length} types`);
      await expect(new URL(page.url()).searchParams.get('search')).toBe('Capacitor');

      await types.page.reload();
      await expect(types.searchInput).toHaveValue('Capacitor');
      await expect(types.cardByName('Capacitor Kit')).toBeVisible();
    } finally {
      await page.unroute(typesEndpoint);
    }
  });

  test('updates part count badges when parts are created and deleted', async ({
    types,
    testData,
    apiClient,
  }) => {
    const typeName = testData.types.randomTypeName('TypeList');
    const createdType = await testData.types.create({ name: typeName });

    await types.goto();
    await expect(types.cardByName(typeName)).toBeVisible();
    await expect(types.partCountBadge(typeName)).toHaveText(/0 part(s)?/i);

    const { part } = await testData.parts.create({ typeId: createdType.id });

    await types.page.reload();
    await expect(types.partCountBadge(typeName)).toHaveText(/1 part(s)?/i);

    await apiClient.DELETE('/api/parts/{part_key}', {
      params: { path: { part_key: part.key } },
    });

    await types.page.reload();
    await expect(types.partCountBadge(typeName)).toHaveText(/0 part(s)?/i);
  });
});
