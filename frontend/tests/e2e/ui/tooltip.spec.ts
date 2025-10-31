import { test, expect } from '../../support/fixtures';
import { waitForListLoading } from '../../support/helpers';

test.describe('Tooltip component', () => {
  test('shows tooltip on hover with open delay', async ({ page, dashboard }) => {
    await dashboard.gotoDashboard();
    await dashboard.waitForHealthReady();

    const trigger = page.getByTestId('dashboard.health.gauge');
    await expect(trigger).toBeVisible();

    // Hover and wait for tooltip to appear
    await trigger.hover();
    const tooltip = page.getByTestId('dashboard.health.tooltip');

    // Tooltip should appear after delay
    await expect(tooltip).toBeVisible({ timeout: 1000 });
    await expect(tooltip).toContainText('Health Score Breakdown');
  });

  test('hides tooltip when mouse leaves trigger', async ({ page, dashboard }) => {
    await dashboard.gotoDashboard();
    await dashboard.waitForHealthReady();

    const trigger = page.getByTestId('dashboard.health.gauge');
    await trigger.hover();

    const tooltip = page.getByTestId('dashboard.health.tooltip');
    await expect(tooltip).toBeVisible();

    // Move mouse away
    await page.mouse.move(0, 0);

    // Tooltip should disappear (with close delay)
    await expect(tooltip).not.toBeVisible({ timeout: 1000 });
  });

  test('handles quick mouse movement without getting stuck open', async ({ page, dashboard }) => {
    await dashboard.gotoDashboard();
    await dashboard.waitForHealthReady();

    const trigger = page.getByTestId('dashboard.health.gauge');
    await expect(trigger).toBeVisible();

    // Rapidly move mouse over and away multiple times (simulating quick movement)
    for (let i = 0; i < 5; i++) {
      await trigger.hover();
      await page.waitForTimeout(50); // Less than open delay
      await page.mouse.move(0, 0);
      await page.waitForTimeout(50);
    }

    // After quick movements, tooltip should not be stuck open
    const tooltip = page.getByTestId('dashboard.health.tooltip');
    await expect(tooltip).not.toBeVisible();
  });

  test('displays tooltip with center placement for health gauge', async ({ page, dashboard }) => {
    await dashboard.gotoDashboard();
    await dashboard.waitForHealthReady();

    const trigger = page.getByTestId('dashboard.health.gauge');
    await trigger.hover();

    const tooltip = page.getByTestId('dashboard.health.tooltip');
    await expect(tooltip).toBeVisible();

    // Verify tooltip content structure for center-placed tooltip
    await expect(tooltip).toContainText('Health Score Breakdown');
    await expect(tooltip).toContainText('Documentation');
    await expect(tooltip).toContainText('Stock Levels');
    await expect(tooltip).toContainText('Organization');
    await expect(tooltip).toContainText('Recent Activity');

    // Verify all breakdown items are present
    await expect(tooltip.getByTestId('dashboard.health.tooltip.documentation')).toBeVisible();
    await expect(tooltip.getByTestId('dashboard.health.tooltip.stock levels')).toBeVisible();
    await expect(tooltip.getByTestId('dashboard.health.tooltip.organization')).toBeVisible();
    await expect(tooltip.getByTestId('dashboard.health.tooltip.recent activity')).toBeVisible();
  });

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

  test('keeps tooltip open when hovering over tooltip content', async ({ page, dashboard }) => {
    await dashboard.gotoDashboard();
    await dashboard.waitForHealthReady();

    const trigger = page.getByTestId('dashboard.health.gauge');
    await trigger.hover();

    const tooltip = page.getByTestId('dashboard.health.tooltip');
    await expect(tooltip).toBeVisible();

    // Move mouse to tooltip content
    await tooltip.hover();

    // Tooltip should remain visible
    await page.waitForTimeout(300); // Wait longer than close delay
    await expect(tooltip).toBeVisible();

    // Now move mouse completely away
    await page.mouse.move(0, 0);
    await expect(tooltip).not.toBeVisible({ timeout: 1000 });
  });
});
