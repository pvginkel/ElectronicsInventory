import { expect } from '@playwright/test';
import { test } from '../../support/fixtures';
import { waitForListLoading, waitTestEvent } from '../../support/helpers';
import type { FormTestEvent, ToastTestEvent } from '@/types/test-events';

test.describe('Kits overview', () => {
  test('shows shopping and pick list indicators with tooltip details', async ({ kits, apiClient, page, testData }) => {
    const activeKits = await apiClient.apiRequest(() =>
      apiClient.GET('/api/kits', {
        params: { query: { status: 'active' } },
      })
    );

    if (activeKits.length === 0) {
      throw new Error('Expected at least one active kit to seed memberships');
    }

    let kitId: number | null = null;

    for (const summary of activeKits) {
      const detail = await apiClient.apiRequest(() =>
        apiClient.GET('/api/kits/{kit_id}', {
          params: { path: { kit_id: summary.id } },
        })
      );
      if ((detail.contents?.length ?? 0) > 0) {
        kitId = summary.id;
        break;
      }
    }

    if (kitId === null) {
      throw new Error('Expected at least one kit with contents to seed memberships');
    }

    const shoppingListName = testData.shoppingLists.randomName('Indicator Shopping');
    await apiClient.apiRequest(() =>
      apiClient.POST('/api/kits/{kit_id}/shopping-lists', {
        params: { path: { kit_id: kitId } },
        body: {
          shopping_list_id: null,
          new_list_name: shoppingListName,
          new_list_description: null,
          honor_reserved: false,
          note_prefix: null,
          units: 1,
        },
      })
    );

    await apiClient.apiRequest(() =>
      apiClient.POST('/api/kits/{kit_id}/pick-lists', {
        params: { path: { kit_id: kitId } },
        body: { requested_units: 1 },
      })
    );

    const shoppingQuery = await apiClient.apiRequest(() =>
      apiClient.POST('/api/kits/shopping-list-memberships/query', {
        body: {
          kit_ids: [kitId],
          include_done: false,
        },
      })
    );

    const pickQuery = await apiClient.apiRequest(() =>
      apiClient.POST('/api/kits/pick-list-memberships/query', {
        body: {
          kit_ids: [kitId],
          include_done: false,
        },
      })
    );

    const shoppingMemberships = shoppingQuery.memberships?.[0]?.memberships ?? [];
    const pickMemberships = pickQuery.memberships?.[0]?.pick_lists ?? [];

    expect(shoppingMemberships.length, 'shopping memberships seeded for indicator').toBeGreaterThan(0);
    expect(pickMemberships.length, 'pick list memberships seeded for indicator').toBeGreaterThan(0);

    const expectedShoppingNames = shoppingMemberships.map((membership) => membership.shopping_list_name);
    const expectedShoppingStatuses = new Set(shoppingMemberships.map((membership) => membership.status));
    const expectedPickLabels = pickMemberships.map((membership) => `Pick list #${membership.id}`);

    await kits.gotoOverview();
    await expect(kits.cardById(kitId)).toBeVisible();

    await waitForListLoading(page, 'kits.list.memberships.shopping', 'ready');
    await waitForListLoading(page, 'kits.list.memberships.pick', 'ready');

    const shoppingIndicator = kits.shoppingIndicator(kitId);
    await expect(shoppingIndicator).toBeVisible();
    await shoppingIndicator.hover();
    const shoppingTooltip = kits.shoppingIndicatorTooltip(kitId);
    await expect(shoppingTooltip).toBeVisible();
    for (const name of expectedShoppingNames) {
      await expect(shoppingTooltip).toContainText(name);
    }
    for (const status of expectedShoppingStatuses) {
      await expect(shoppingTooltip).toContainText(status);
    }

    const pickIndicator = kits.pickIndicator(kitId);
    await expect(pickIndicator).toBeVisible();
    await pickIndicator.hover();
    const pickTooltip = kits.pickIndicatorTooltip(kitId);
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
