import { expect, Locator, Page } from '@playwright/test';
import { BasePage } from './base-page';

export class PartsPage extends BasePage {
  readonly root: Locator;
  readonly listRoot: Locator;
  readonly searchInput: Locator;
  readonly summary: Locator;
  readonly loadingSkeletons: Locator;
  readonly emptyState: Locator;
  readonly noResultsState: Locator;
  readonly errorState: Locator;
  readonly addPartButton: Locator;
  readonly addWithAIButton: Locator;

  constructor(page: Page) {
    super(page);
    this.root = page.getByTestId('parts.page');
    this.listRoot = page.getByTestId('parts.list');
    this.searchInput = page.getByTestId('parts.list.search');
    this.summary = page.getByTestId('parts.list.summary');
    this.loadingSkeletons = page.getByTestId('parts.list.loading.skeleton');
    this.emptyState = page.getByTestId('parts.list.empty');
    this.noResultsState = page.getByTestId('parts.list.no-results');
    this.errorState = page.getByTestId('parts.list.error');
    this.addPartButton = page.getByRole('button', { name: /add part/i });
    this.addWithAIButton = page.getByRole('button', { name: /add with ai/i });
  }

  async gotoList(): Promise<void> {
    await this.goto('/parts');
    await expect(this.root).toBeVisible();
  }

  async openNewPartForm(): Promise<void> {
    await this.addPartButton.click();
  }

  async openAIDialog(): Promise<void> {
    await this.addWithAIButton.click();
  }

  cardByDescription(text: string | RegExp): Locator {
    return this.page.getByTestId('parts.list.card').filter({ hasText: text });
  }

  cardByKey(partKey: string): Locator {
    return this.page.locator(`[data-testid="parts.list.card"][data-part-key="${partKey}"]`);
  }

  async openCardByKey(partKey: string): Promise<void> {
    const card = this.cardByKey(partKey);
    await expect(card).toBeVisible();
    await card.click();
  }

  async search(term: string): Promise<void> {
    await this.searchInput.fill(term);
  }

  async clearSearch(): Promise<void> {
    await this.searchInput.fill('');
  }

  async expectSummaryText(expected: string | RegExp): Promise<void> {
    await expect(this.summary).toContainText(expected);
  }

  async expectNoResults(): Promise<void> {
    await expect(this.noResultsState).toBeVisible();
  }

  async expectEmptyState(): Promise<void> {
    await expect(this.emptyState).toBeVisible();
  }

  async expectErrorState(): Promise<void> {
    await expect(this.errorState).toBeVisible();
  }

  async waitForLoading(): Promise<void> {
    await expect(this.loadingSkeletons.first()).toBeVisible();
  }

  async waitForCards(): Promise<void> {
    await expect(this.page.getByTestId('parts.list.container')).toBeVisible();
  }

  // Detail page helpers
  get detailRoot(): Locator {
    return this.page.getByTestId('parts.detail');
  }

  get detailDocumentsCard(): Locator {
    return this.page.getByTestId('parts.detail.documents');
  }

  get detailAddDocumentButton(): Locator {
    return this.page.getByTestId('parts.detail.documents.add');
  }

  get editPartButton(): Locator {
    return this.page.getByRole('button', { name: /edit part/i });
  }

  get deletePartButton(): Locator {
    return this.page.getByRole('button', { name: /delete part/i });
  }

  get overflowMenuButton(): Locator {
    return this.page.getByRole('button', { name: /more/i });
  }

  async duplicateCurrentPart(): Promise<void> {
    await this.overflowMenuButton.click();
    await this.page.getByRole('menuitem', { name: /duplicate part/i }).click();
  }

  async expectDetailHeading(text: string | RegExp): Promise<void> {
    await expect(this.page.getByRole('heading', { level: 1, name: text })).toBeVisible();
  }

  // Form helpers (create/edit)
  get formRoot(): Locator {
    return this.page.locator('form').filter({ has: this.formDescription });
  }

  get formDescription(): Locator {
    return this.page.getByTestId('parts.form.description');
  }

  get formManufacturerCode(): Locator {
    return this.page.getByTestId('parts.form.manufacturer');
  }

  get formSubmit(): Locator {
    return this.page.getByTestId('parts.form.submit');
  }

  get formCancel(): Locator {
    return this.page.getByRole('button', { name: /^cancel$/i });
  }

  async fillBasicForm(fields: { description: string; manufacturerCode?: string }): Promise<void> {
    await this.formDescription.fill(fields.description);
    if (fields.manufacturerCode !== undefined) {
      await this.formManufacturerCode.fill(fields.manufacturerCode);
    }
  }

  async selectType(typeName: string): Promise<void> {
    const typeSearchInput = this.page.getByPlaceholder('Search or create type...');
    await typeSearchInput.click();
    await typeSearchInput.fill(typeName);
    const option = this.page.getByRole('option', { name: typeName });
    await expect(option).toBeVisible();
    await option.click();
  }

  async submitForm(): Promise<void> {
    await Promise.all([
      this.page.waitForLoadState('networkidle'),
      this.formSubmit.click(),
    ]);
  }
}
