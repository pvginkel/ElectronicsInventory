import { expect, Locator, Page } from '@playwright/test';
import { BasePage } from './base-page';

export class AboutPage extends BasePage {
  readonly root: Locator;
  readonly hero: Locator;
  readonly heroAddPart: Locator;
  readonly heroDocs: Locator;
  readonly featuresGrid: Locator;
  readonly featureCards: Locator;
  readonly quickStartCard: Locator;
  readonly quickStartSteps: Locator;
  readonly overviewCard: Locator;
  readonly ctaCard: Locator;
  readonly ctaGetStarted: Locator;
  readonly ctaViewDashboard: Locator;

  constructor(page: Page) {
    super(page);
    this.root = page.getByTestId('about.page');
    this.hero = page.getByTestId('about.hero');
    this.heroAddPart = page.getByTestId('about.hero.cta.add-part');
    this.heroDocs = page.getByTestId('about.hero.cta.documentation');
    this.featuresGrid = page.getByTestId('about.features.grid');
    this.featureCards = page.getByTestId('about.features.item');
    this.quickStartCard = page.getByTestId('about.quickstart');
    this.quickStartSteps = page.getByTestId('about.quickstart.step');
    this.overviewCard = page.getByTestId('about.overview');
    this.ctaCard = page.getByTestId('about.cta');
    this.ctaGetStarted = page.getByTestId('about.cta.get-started');
    this.ctaViewDashboard = page.getByTestId('about.cta.view-dashboard');
  }

  async gotoAbout(): Promise<void> {
    await this.goto('/about');
    await expect(this.root).toBeVisible();
  }
}
