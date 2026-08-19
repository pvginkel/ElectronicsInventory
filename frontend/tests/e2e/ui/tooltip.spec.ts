import { test, expect } from '../../support/fixtures';
import { waitForListLoading } from '../../support/helpers';

test.describe('Tooltip component', () => {
  test('shows tooltips on disabled elements', async ({ page, testData }) => {
    // Create an archived kit which will have a disabled Edit button with tooltip
    const kit = await testData.kits.create({
      overrides: {
        name: testData.kits.randomKitName('Archived Disabled Test'),
        build_target: 1,
      },
      archived: true,
    });

    await page.goto(`/kits/${kit.id}`);
    await expect(page.getByTestId('kits.detail.layout')).toBeVisible();

    // The Edit Kit button should be disabled
    const editButton = page.getByRole('button', { name: 'Edit Kit' });
    await expect(editButton).toBeDisabled();

    // The tooltip component wraps disabled elements in a div that intercepts hovers
    // So we need to find the wrapper (it has the title attribute)
    const wrapper = page.locator('[title*="Archived kits are read-only"]').first();
    await expect(wrapper).toBeVisible();

    // Verify the wrapper has the title attribute (native browser tooltip)
    await expect(wrapper).toHaveAttribute('title', /Archived kits are read-only/);
  });

  test('displays rich content tooltips on membership indicators', async ({ page, apiClient, testData, kits }) => {
    // Create a kit with shopping list membership
    const { part } = await testData.parts.create({
      overrides: { description: 'Membership Tooltip Test Part' },
    });

    const partReservations = await apiClient.apiRequest(() =>
      apiClient.GET('/api/parts/{part_key}/kit-reservations', {
        params: { path: { part_key: part.key } },
      })
    );
    const partId = partReservations.part_id;
    if (typeof partId !== 'number') {
      throw new Error('Failed to resolve part id');
    }

    const kit = await testData.kits.create({
      overrides: {
        name: testData.kits.randomKitName('Membership Tooltip Kit'),
        build_target: 1,
      },
    });

    await testData.kits.addContent(kit.id, {
      partId,
      requiredPerUnit: 1,
    });

    // Create shopping list
    const shoppingListName = testData.shoppingLists.randomName('Membership Test');
    await apiClient.apiRequest(() =>
      apiClient.POST('/api/kits/{kit_id}/shopping-lists', {
        params: { path: { kit_id: kit.id } },
        body: {
          shopping_list_id: null,
          new_list_name: shoppingListName,
          new_list_description: null,
          honor_reserved: false,
          note_prefix: null,
          units: 2,
        },
      })
    );

    await kits.gotoOverview();
    await waitForListLoading(page, 'kits.list.memberships.shopping', 'ready');
    await expect(kits.cardById(kit.id)).toBeVisible();

    // Hover over shopping indicator
    const shoppingIndicator = kits.shoppingIndicator(kit.id);
    await expect(shoppingIndicator).toBeVisible();
    await shoppingIndicator.hover();

    const tooltip = kits.shoppingIndicatorTooltip(kit.id);
    await expect(tooltip).toBeVisible({ timeout: 1000 });

    // Tooltip should contain rich content (shopping list details)
    await expect(tooltip).toContainText(shoppingListName);
  });
});
