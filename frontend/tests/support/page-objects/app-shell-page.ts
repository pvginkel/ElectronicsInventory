import { expect, Locator, Page } from '@playwright/test';
import { BasePage } from './base-page';

export class AppShellPage extends BasePage {
  readonly root: Locator;
  readonly layout: Locator;
  readonly desktopContainer: Locator;
  readonly desktopSidebar: Locator;
  readonly desktopToggle: Locator;
  readonly mobileToggleContainer: Locator;
  readonly mobileToggleButton: Locator;
  readonly mobileOverlay: Locator;
  readonly mobileSidebar: Locator;
  readonly toastViewport: Locator;
  readonly toastItems: Locator;
  readonly deploymentBanner: Locator;
  readonly deploymentReloadButton: Locator;

  constructor(page: Page) {
    super(page);
    this.root = page.getByTestId('app-shell.root');
    this.layout = page.getByTestId('app-shell.layout');
    this.desktopContainer = page.getByTestId('app-shell.sidebar.desktop');
    this.desktopSidebar = this.desktopContainer.getByTestId('app-shell.sidebar');
    this.desktopToggle = this.desktopSidebar.getByTestId('app-shell.sidebar.toggle');
    this.mobileToggleContainer = page.getByTestId('app-shell.mobile-toggle');
    this.mobileToggleButton = page.getByTestId('app-shell.mobile-toggle.button');
    this.mobileOverlay = page.getByTestId('app-shell.mobile-overlay');
    this.mobileSidebar = page.getByTestId('app-shell.sidebar.mobile');
    this.toastViewport = page.getByTestId('app-shell.toast.viewport');
    this.toastItems = page.getByTestId('app-shell.toast.item');
    this.deploymentBanner = page.getByTestId('deployment.banner');
    this.deploymentReloadButton = page.getByTestId('deployment.banner.reload');
  }

  sidebarLink(slug: string, options?: { variant?: 'desktop' | 'mobile' }): Locator {
    const selector = `app-shell.sidebar.link.${slug}`;
    if (options?.variant === 'mobile') {
      return this.mobileSidebar.getByTestId(selector);
    }
    return this.desktopSidebar.getByTestId(selector);
  }

  async gotoHome(): Promise<void> {
    await this.goto('/');
    await expect(this.root).toBeVisible();
  }

  async expectSidebarState(state: 'collapsed' | 'expanded'): Promise<void> {
    await expect(this.desktopSidebar).toHaveAttribute('data-state', state);
  }

  async expectMobileMenuState(state: 'open' | 'closed'): Promise<void> {
    await expect(this.root).toHaveAttribute('data-mobile-menu-state', state);
  }

  async toggleDesktopSidebar(): Promise<void> {
    await this.desktopToggle.click();
  }

  async expectActiveNav(slug: string): Promise<void> {
    const link = this.sidebarLink(slug);
    await expect(link).toHaveAttribute('data-active', 'true');
  }

  async expectInactiveNav(slug: string): Promise<void> {
    const link = this.sidebarLink(slug);
    await expect(link).toHaveAttribute('data-active', 'false');
  }

  async clickDesktopNav(slug: string): Promise<void> {
    await this.sidebarLink(slug).click();
  }

  async openMobileMenu(): Promise<void> {
    await this.mobileToggleButton.click();
    await this.expectMobileMenuState('open');
    await expect(this.mobileSidebar).toBeVisible();
  }

  async closeMobileMenuViaBackdrop(): Promise<void> {
    const overlay = this.page.getByTestId('app-shell.mobile-overlay.dismiss');
    const box = await overlay.boundingBox();
    if (box) {
      const x = box.x + Math.max(0, box.width - 5);
      const y = box.y + box.height / 2;
      await this.playwrightPage.mouse.click(x, y);
    } else {
      await overlay.click();
    }
    await this.expectMobileMenuState('closed');
  }
}
