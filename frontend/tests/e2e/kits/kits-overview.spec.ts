import { expect } from '@playwright/test';
import { test } from '../../support/fixtures';
import { waitForListLoading, waitTestEvent } from '../../support/helpers';
import type { FormTestEvent, ToastTestEvent } from '@/types/test-events';

test.describe('Kits overview', () => {
test('shows shopping and pick list indicators with tooltip details', async ({ kits, apiClient, page }) => {
  const kitsSummary = await apiClient.apiRequest(() =>
    apiClient.GET('/api/kits', {
      params: { query: { status: 'active' } },
    })
  );

  const fixtureKit = kitsSummary.find(
    (entry) => entry.shopping_list_badge_count > 0 && entry.pick_list_badge_count > 0
  );

  if (!fixtureKit) {
    throw new Error('Expected seeded kit with shopping and pick list memberships');
  }

  const shoppingQuery = await apiClient.apiRequest(() =>
    apiClient.POST('/api/kits/shopping-list-memberships/query', {
      body: {
        kit_ids: [fixtureKit.id],
        include_done: false,
      },
    })
  );

  const pickQuery = await apiClient.apiRequest(() =>
    apiClient.POST('/api/kits/pick-list-memberships/query', {
      body: {
        kit_ids: [fixtureKit.id],
        include_done: false,
      },
    })
  );

  const shoppingMemberships = shoppingQuery.memberships?.[0]?.memberships ?? [];
  const pickMemberships = pickQuery.memberships?.[0]?.pick_lists ?? [];

  if (shoppingMemberships.length === 0 || pickMemberships.length === 0) {
    throw new Error('Fixture kit missing membership data required for indicator assertions');
  }

  const expectedShoppingNames = shoppingMemberships.map((membership) => membership.shopping_list_name);
  const expectedShoppingStatuses = new Set(
    shoppingMemberships.map((membership) => membership.status)
  );

  const expectedPickLabels = pickMemberships.map((membership) => `Pick list #${membership.id}`);

  await kits.gotoOverview();
  await waitForListLoading(page, 'kits.list.memberships.shopping', 'ready');
  await waitForListLoading(page, 'kits.list.memberships.pick', 'ready');

  const shoppingIndicator = kits.shoppingIndicator(fixtureKit.id);
  await expect(shoppingIndicator).toBeVisible();
  await shoppingIndicator.hover();
  const shoppingTooltip = kits.shoppingIndicatorTooltip(fixtureKit.id);
  await expect(shoppingTooltip).toBeVisible();
  for (const name of expectedShoppingNames) {
    await expect(shoppingTooltip).toContainText(name);
  }
  for (const status of expectedShoppingStatuses) {
    await expect(shoppingTooltip).toContainText(status);
  }

  const pickIndicator = kits.pickIndicator(fixtureKit.id);
  await expect(pickIndicator).toBeVisible();
  await pickIndicator.hover();
  const pickTooltip = kits.pickIndicatorTooltip(fixtureKit.id);
  await expect(pickTooltip).toBeVisible();
  for (const label of expectedPickLabels) {
    await expect(pickTooltip).toContainText(label);
  }
  await expect(pickTooltip).toContainText('open');
  await expect(pickTooltip).toContainText('remaining');
});

  test('lists kits across tabs with search persistence', async ({ kits, testData }) => {
    const [alpha, beta, archived] = await Promise.all([
      testData.kits.create({ overrides: { name: 'Alpha Synth Kit', build_target: 2 } }),
      testData.kits.create({ overrides: { name: 'Beta Drum Kit', build_target: 3 } }),
      testData.kits.create({ overrides: { name: 'Synth Archive Kit' }, archived: true }),
    ]);

    await kits.gotoOverview();
    await expect(kits.cardById(alpha.id)).toBeVisible();
    await expect(kits.cardById(beta.id)).toBeVisible();
    await kits.expectTabActive('active');

    await kits.search('Synth');
    await expect(kits.cardById(alpha.id)).toBeVisible();
    await expect(kits.cardById(beta.id)).toHaveCount(0);

    await kits.selectTab('archived');
    await expect(kits.overviewSearchInput).toHaveValue('Synth');
    await expect(kits.cardById(archived.id, 'archived')).toBeVisible();
  });

  test('archives a kit with undo toast flow', async ({ kits, testData, toastHelper, page }) => {
    const kit = await testData.kits.create({ overrides: { name: 'Undo Flow Kit' } });
    await kits.gotoOverview();

    const submitEventPromise = waitTestEvent<FormTestEvent>(page, 'form', (event) =>
      event.formId === 'KitLifecycle:archive' && event.phase === 'submit' && Number(event.metadata?.kitId) === kit.id,
    );
    const successEventPromise = waitTestEvent<FormTestEvent>(page, 'form', (event) =>
      event.formId === 'KitLifecycle:archive' && event.phase === 'success' && Number(event.metadata?.kitId) === kit.id,
    );
    const toastEventPromise = waitTestEvent<ToastTestEvent>(page, 'toast', (event) =>
      event.message.includes(kit.name) && event.action === 'undo',
    );

    await kits.archiveButton(kit.id).click();
    await submitEventPromise;
    await successEventPromise;
    await toastEventPromise;

    const undoToast = await toastHelper.waitForToastWithText(new RegExp(`Archived "${kit.name}"`));
    await expect(kits.cardById(kit.id)).toHaveCount(0);
    const archivedReady = waitForListLoading(page, 'kits.overview', 'ready');
    await kits.selectTab('archived');
    await archivedReady;
    await expect(kits.cardById(kit.id, 'archived')).toBeVisible();

    const undoSubmit = waitTestEvent<FormTestEvent>(page, 'form', (event) =>
      event.formId === 'KitLifecycle:unarchive' && event.phase === 'submit' && Number(event.metadata?.kitId) === kit.id && event.metadata?.undo === true,
    );
    const undoSuccess = waitTestEvent<FormTestEvent>(page, 'form', (event) =>
      event.formId === 'KitLifecycle:unarchive' && event.phase === 'success' && Number(event.metadata?.kitId) === kit.id && event.metadata?.undo === true,
    );
    const undoToastEvent = waitTestEvent<ToastTestEvent>(page, 'toast', (event) =>
      event.message.includes('Restored') && !event.action,
    );

    await undoToast.getByTestId(`kits.overview.toast.undo.${kit.id}`).click();
    await Promise.all([undoSubmit, undoSuccess, undoToastEvent]);

    const returnReady = waitForListLoading(page, 'kits.overview', 'ready');
    await kits.selectTab('active');
    await returnReady;
    await expect(kits.cardById(kit.id)).toBeVisible();
  });

  test('new kit CTA navigates to creation route', async ({ kits, page }) => {
    await kits.gotoOverview();
    await kits.newKitButton.click();
    await expect(page).toHaveURL(/\/kits\/new$/);
  });
});
