import { expect, Locator, Page } from '@playwright/test';
import { waitForListLoading } from '../helpers';
import { BasePage } from './base-page';
import { SellerSelectorHarness } from './seller-selector-harness';

export class PartsPage extends BasePage {
  readonly root: Locator;
  readonly header: Locator;
  readonly content: Locator;
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
    this.root = page.getByTestId('parts.overview');
    this.header = page.getByTestId('parts.overview.header');
    this.content = page.getByTestId('parts.overview.content');
    this.listRoot = page.getByTestId('parts.list');
    this.searchInput = page.getByTestId('parts.list.search');
    this.summary = page.getByTestId('parts.overview.summary');
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

  async waitForListState(phase: 'loading' | 'ready' | 'error' | 'aborted'): Promise<void> {
    await waitForListLoading(this.page, 'parts.list', phase);
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

  coverImage(partKey: string): Locator {
    return this.cardByKey(partKey).getByRole('img').first();
  }

  coverPlaceholder(partKey: string): Locator {
    return this.cardByKey(partKey).getByText('No cover image');
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

  async scrollContent(distance: number): Promise<void> {
    await this.content.evaluate((element, value) => {
      element.scrollTop = value;
    }, distance);
  }

  async scrollContentBy(delta: number): Promise<void> {
    await this.content.evaluate((element, value) => {
      element.scrollTop += value;
    }, delta);
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
    await this.waitForListState('loading');
    await expect(this.loadingSkeletons.first()).toBeVisible();
  }

  async waitForCards(): Promise<void> {
    await this.waitForListState('ready');
    await expect(this.page.getByTestId('parts.list.container')).toBeVisible();
  }

  // Detail page helpers
  get detailRoot(): Locator {
    return this.page.getByTestId('parts.detail');
  }

  get detailLayout(): Locator {
    return this.page.getByTestId('parts.detail.layout');
  }

  get detailHeader(): Locator {
    return this.page.getByTestId('parts.detail.header');
  }

  get detailContent(): Locator {
    return this.page.getByTestId('parts.detail.content');
  }

  get detailActions(): Locator {
    return this.page.getByTestId('parts.detail.actions');
  }

  async waitForDetailReady(): Promise<void> {
    await waitForListLoading(this.page, 'parts.detail', 'ready');
    await expect(this.detailLayout).toBeVisible();
  }

  get formLayout(): Locator {
    return this.page.getByTestId('parts.form.layout');
  }

  get formHeader(): Locator {
    return this.page.getByTestId('parts.form.header');
  }

  get formContent(): Locator {
    return this.page.getByTestId('parts.form.content');
  }

  get formFooter(): Locator {
    return this.page.getByTestId('parts.form.footer');
  }

  async getFormHeaderRect(): Promise<{ top: number; bottom: number; height: number }> {
    return this.formHeader.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, height: rect.height };
    });
  }

  async getFormFooterRect(): Promise<{ top: number; bottom: number; height: number }> {
    return this.formFooter.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, height: rect.height };
    });
  }

  async scrollFormContent(target: number | 'bottom' = 'bottom'): Promise<void> {
    await this.formContent.evaluate((element, value) => {
      if (value === 'bottom') {
        element.scrollTo({ top: element.scrollHeight });
        return;
      }
      element.scrollTo({ top: value });
    }, target);
  }

  async formContentScrollTop(): Promise<number> {
    return this.formContent.evaluate((element) => element.scrollTop);
  }

  get detailDocumentsCard(): Locator {
    return this.page.getByTestId('parts.detail.documents');
  }

  get detailAddDocumentButton(): Locator {
    return this.page.getByTestId('parts.detail.documents.add');
  }

  get detailActionsMenuTrigger(): Locator {
    return this.page.getByTestId('parts.detail.actions.menu');
  }

  get addToShoppingListMenuItem(): Locator {
    return this.page.getByTestId('parts.detail.actions.add-to-shopping-list');
  }

  get shoppingListBadgeContainer(): Locator {
    return this.page.getByTestId('parts.detail.shopping-list.badges');
  }

  shoppingListBadgeByName(name: string | RegExp): Locator {
    const pattern = typeof name === 'string' ? new RegExp(name, 'i') : name;
    return this.page
      .locator('[data-testid="parts.detail.shopping-list.badge"]')
      .filter({ hasText: pattern })
      .first();
  }

  get addToShoppingListDialog(): Locator {
    return this.page.getByTestId('ShoppingListMembership:addFromPart.dialog');
  }

  get addToShoppingListForm(): Locator {
    return this.page.getByTestId('parts.shopping-list.add.form');
  }

  get addToShoppingListToggle(): Locator {
    return this.page.getByTestId('parts.shopping-list.add.toggle.create');
  }

  get addToShoppingListConflictAlert(): Locator {
    return this.page.getByTestId('parts.shopping-list.add.conflict');
  }

  addToShoppingListField(field: 'list' | 'new-name' | 'new-description' | 'needed' | 'seller' | 'note'): Locator {
    return this.page.getByTestId(`parts.shopping-list.add.field.${field}`);
  }

  get addToShoppingListSubmit(): Locator {
    return this.page.getByTestId('parts.shopping-list.add.submit');
  }

  shoppingListIndicator(partKey: string): Locator {
    return this.cardByKey(partKey).getByTestId('parts.list.card.shopping-list-indicator');
  }

  shoppingListIndicatorLoading(partKey: string): Locator {
    return this.cardByKey(partKey).getByTestId('parts.list.card.shopping-list-indicator.loading');
  }

  shoppingListIndicatorTooltip(partKey: string): Locator {
    return this.cardByKey(partKey).getByTestId('parts.list.card.shopping-list-indicator.tooltip');
  }

  get editPartButton(): Locator {
    return this.page.getByTestId('parts.detail.actions.edit');
  }

  get deletePartButton(): Locator {
    return this.page.getByTestId('parts.detail.actions.delete');
  }

  get deleteDialog(): Locator {
    return this.page.getByRole('dialog', { name: /delete part/i });
  }

  get overflowMenuButton(): Locator {
    return this.page.getByTestId('parts.detail.actions.menu');
  }

  async duplicateCurrentPart(): Promise<void> {
    await this.overflowMenuButton.click();
    await this.page.getByRole('menuitem', { name: /duplicate part/i }).click();
  }

  async openDeleteDialog(): Promise<void> {
    await this.deletePartButton.click();
    await expect(this.deleteDialog).toBeVisible();
  }

  async confirmDelete(partKey: string, options?: { expectNavigation?: boolean }): Promise<void> {
    const pendingResponses: Array<Promise<unknown>> = [];

    pendingResponses.push(
      this.page.waitForResponse(response => {
        return response.request().method() === 'DELETE'
          && response.url().includes(`/api/parts/${partKey}`);
      })
    );

    await Promise.all([
      this.deleteDialog.getByRole('button', { name: 'Delete' }).click(),
      ...pendingResponses,
    ]);

    if (options?.expectNavigation !== false) {
      await expect.poll(async () => {
        const url = await this.getUrl();
        return url.includes('/parts') ? url : null;
      }).toBeTruthy();
    }
  }

  async expectDetailHeading(text: string | RegExp): Promise<void> {
    await expect(this.page.getByRole('heading', { level: 1, name: text })).toBeVisible();
  }

  async openAddToShoppingListDialog(): Promise<void> {
    await this.detailActionsMenuTrigger.click();
    await expect(this.addToShoppingListMenuItem).toBeVisible();
    await this.addToShoppingListMenuItem.click();
    await expect(this.addToShoppingListDialog).toBeVisible();
  }

  async closeAddToShoppingListDialog(): Promise<void> {
    await this.addToShoppingListDialog.getByRole('button', { name: /cancel/i }).click();
    await expect(this.addToShoppingListDialog).toBeHidden();
  }

  createSellerSelectorHarness(): SellerSelectorHarness {
    return new SellerSelectorHarness(this.page, this.addToShoppingListField('seller'));
  }


  async setCreateNewConceptList(value: boolean): Promise<void> {
    const toggle = this.addToShoppingListToggle;
    if ((await toggle.count()) === 0) {
      return;
    }
    const current = await toggle.isChecked();
    if (current !== value) {
      await toggle.click();
    }
  }

  async selectConceptListById(listId: number): Promise<void> {
    await this.addToShoppingListField('list').selectOption(String(listId));
  }

  async fillNewConceptList(details: { name: string; description?: string }): Promise<void> {
    await this.addToShoppingListField('new-name').fill(details.name);
    if (details.description !== undefined) {
      await this.addToShoppingListField('new-description').fill(details.description);
    }
  }

  async setNeededQuantity(quantity: number): Promise<void> {
    await this.addToShoppingListField('needed').fill(String(quantity));
  }

  async setMembershipNote(note: string): Promise<void> {
    await this.addToShoppingListField('note').fill(note);
  }

  async selectSellerInDialog(name: string): Promise<void> {
    const harness = this.createSellerSelectorHarness();
    await harness.waitForReady();
    await harness.search(name);
    await harness.selectOption(name);
  }

  async submitAddToShoppingList(): Promise<void> {
    await this.addToShoppingListSubmit.click();
  }

  get detailShoppingListBadges(): Locator {
    return this.shoppingListBadgeContainer.getByTestId('parts.detail.shopping-list.badge');
  }
  // Form helpers (create/edit)
  get formRoot(): Locator {
    return this.page.getByTestId('parts.form.form');
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
