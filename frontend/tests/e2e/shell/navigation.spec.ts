import { expect } from '@playwright/test';
import { test } from '../../support/fixtures';

test.describe('App shell - desktop navigation', () => {
  test('collapses sidebar and navigates primary routes', async ({
    appShell,
    dashboard,
    parts,
    boxes,
    types,
    sellers,
    about,
    page,
  }) => {
    await appShell.gotoHome();
    await expect(appShell.desktopSidebar).toBeVisible();
    await appShell.expectSidebarState('expanded');
    await appShell.expectActiveNav('dashboard');

    await appShell.toggleDesktopSidebar();
    await appShell.expectSidebarState('collapsed');
    await appShell.toggleDesktopSidebar();
    await appShell.expectSidebarState('expanded');

    await appShell.clickDesktopNav('parts');
    await expect(page).toHaveURL(/\/parts(?:$|\?)/);
    await parts.waitForCards();
    await appShell.expectActiveNav('parts');

    await appShell.clickDesktopNav('boxes');
    await expect(page).toHaveURL(/\/boxes(?:$|\?)/);
    await boxes.waitForListState('ready');
    await appShell.expectActiveNav('boxes');

    await appShell.clickDesktopNav('types');
    await expect(page).toHaveURL(/\/types(?:$|\?)/);
    await types.waitForListState('ready');
    await appShell.expectActiveNav('types');

    await appShell.clickDesktopNav('sellers');
    await expect(page).toHaveURL(/\/sellers(?:$|\?)/);
    await sellers.waitForListState('ready');
    await appShell.expectActiveNav('sellers');

    await appShell.clickDesktopNav('about');
    await expect(page).toHaveURL(/\/about(?:$|\?)/);
    await expect(about.hero).toBeVisible();
    await expect(about.featureCards).toHaveCount(6);
    await expect(about.quickStartSteps).toHaveCount(4);
    await appShell.expectActiveNav('about');

    await appShell.clickDesktopNav('dashboard');
    await expect(page).toHaveURL(/\/?$/);
    await dashboard.waitForMetricsReady();
    await appShell.expectActiveNav('dashboard');
  });
});
