import { expect, Locator, Page } from '@playwright/test';
import { waitForListLoading, waitForUiState } from '../helpers';
import type { ListLoadingTestEvent } from '@/types/test-events';
import { BasePage } from './base-page';

export class DashboardPage extends BasePage {
  readonly root: Locator;
  readonly metricsRoot: Locator;
  readonly healthCard: Locator;
  readonly storageCard: Locator;
  readonly activityCard: Locator;
  readonly lowStockCard: Locator;
  readonly documentationCard: Locator;
  readonly categoriesCard: Locator;

  constructor(page: Page) {
    super(page);
    this.root = page.getByTestId('dashboard.page');
    this.metricsRoot = page.getByTestId('dashboard.metrics');
    this.healthCard = page.getByTestId('dashboard.health');
    this.storageCard = page.getByTestId('dashboard.storage');
    this.activityCard = page.getByTestId('dashboard.activity');
    this.lowStockCard = page.getByTestId('dashboard.low-stock');
    this.documentationCard = page.getByTestId('dashboard.documentation');
    this.categoriesCard = page.getByTestId('dashboard.categories');
  }

  async gotoDashboard(): Promise<void> {
    await this.goto('/');
    await expect(this.root).toBeVisible();
  }

  async waitForMetricsReady(): Promise<ListLoadingTestEvent> {
    const [readyEvent] = await Promise.all([
      waitForListLoading(this.page, 'dashboard.metrics', 'ready'),
      waitForUiState(this.page, 'dashboard.metrics', 'ready'),
    ]);

    await expect(this.metricsRoot).toHaveAttribute('data-state', 'ready');
    return readyEvent;
  }

  metricsCard(metricKey: string): Locator {
    return this.page.getByTestId(`dashboard.metrics.card.${metricKey}`);
  }

  metricsValue(metricKey: string): Locator {
    return this.page.getByTestId(`dashboard.metrics.card.${metricKey}.value`);
  }

  async waitForHealthReady(): Promise<void> {
    await waitForListLoading(this.page, 'dashboard.health', 'ready');
    await waitForUiState(this.page, 'dashboard.health', 'ready');
    await expect(this.healthCard).toHaveAttribute('data-state', 'ready');
  }

  healthValue(): Locator {
    return this.page.getByTestId('dashboard.health.progress.value');
  }

  async waitForStorageReady(): Promise<void> {
    await waitForListLoading(this.page, 'dashboard.storage', 'ready');
    await expect(this.storageCard).toHaveAttribute('data-state', 'ready');
  }

  storageGrid(): Locator {
    return this.page.getByTestId('dashboard.storage.grid');
  }

  storageBox(boxNo: number): Locator {
    return this.page.locator(`[data-testid="dashboard.storage.box"][data-box-no="${boxNo}"]`);
  }

  async waitForActivityReady(): Promise<void> {
    await waitForListLoading(this.page, 'dashboard.activity', 'ready');
    await expect(this.activityCard).toHaveAttribute('data-state', 'ready');
  }

  activityItems(): Locator {
    return this.page.locator('[data-testid="dashboard.activity.item"]');
  }

  async waitForLowStockReady(): Promise<void> {
    await waitForListLoading(this.page, 'dashboard.lowStock', 'ready');
    await expect(this.lowStockCard).toHaveAttribute('data-state', 'ready');
  }

  lowStockItems(): Locator {
    return this.page.locator('[data-testid="dashboard.low-stock.item"]');
  }

  async waitForDocumentationReady(): Promise<void> {
    await waitForListLoading(this.page, 'dashboard.documentation', 'ready');
    await expect(this.documentationCard).toHaveAttribute('data-state', 'ready');
  }

  documentationProgress(): Locator {
    return this.page.getByTestId('dashboard.documentation.progress.value');
  }

  documentationItems(): Locator {
    return this.page.locator('[data-testid="dashboard.documentation.item"]');
  }

  async waitForCategoriesReady(): Promise<void> {
    await waitForListLoading(this.page, 'dashboard.categories', 'ready');
    await expect(this.categoriesCard).toHaveAttribute('data-state', 'ready');
  }

  categoryBars(): Locator {
    return this.page.locator('[data-testid="dashboard.categories.bar"]');
  }

  async expandCategories(): Promise<void> {
    const showMore = this.page.getByTestId('dashboard.categories.show-more');
    if (await showMore.isVisible()) {
      await showMore.click();
    }
  }
}
