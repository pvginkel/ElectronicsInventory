import { expect } from '@playwright/test';
import { test } from '../../support/fixtures';

const MOBILE_VIEWPORT = { width: 414, height: 736 } as const;

test.describe('App shell - mobile menu', () => {
  test('opens, navigates, and closes the mobile sidebar', async ({
    appShell,
    dashboard,
    parts,
    page,
  }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await appShell.gotoHome();

    await expect(appShell.desktopContainer).toBeHidden();
    await expect(appShell.mobileToggleButton).toBeVisible();

    await appShell.openMobileMenu();
    await expect(appShell.mobileSidebar).toBeVisible();

    await appShell.sidebarLink('parts', { variant: 'mobile' }).click();
    await appShell.expectMobileMenuState('closed');
    await expect(page).toHaveURL(/\/parts(?:$|\?)/);
    await parts.waitForCards();

    await appShell.openMobileMenu();
    await appShell.closeMobileMenuViaBackdrop();
    await appShell.expectMobileMenuState('closed');

    await appShell.openMobileMenu();
    await appShell.sidebarLink('dashboard', { variant: 'mobile' }).click();
    await appShell.expectMobileMenuState('closed');
    await expect(page).toHaveURL(/\/?$/);
    await dashboard.waitForMetricsReady();
  });
});
