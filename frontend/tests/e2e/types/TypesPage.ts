import { expect, type Locator, type Page } from '@playwright/test';
import { waitForListLoading } from '../../support/helpers';

export class TypesPage {
  readonly page: Page;
  readonly root: Locator;
  readonly createButton: Locator;
  readonly listContainer: Locator;
  readonly cards: Locator;
  readonly searchInput: Locator;
  readonly loadingSkeletons: Locator;
  readonly summary: Locator;
  readonly emptyState: Locator;
  readonly noResultsState: Locator;
  readonly errorState: Locator;

  constructor(page: Page) {
    this.page = page;
    this.root = page.getByTestId('types.page');

    // Main page elements
    this.createButton = this.root.getByRole('button', { name: /add type/i })
      .or(this.root.getByTestId('types.create.button'));
    this.searchInput = this.root.getByPlaceholder('Search...');

    // List elements (cards, not table)
    this.listContainer = this.root.getByTestId('types.list.container');
    this.cards = this.root.getByTestId('types.list.card');
    this.loadingSkeletons = this.root.getByTestId('types.list.loading').locator('[data-testid="types.list.loading.skeleton"]');
    this.summary = this.root.getByTestId('types.list.summary');
    this.emptyState = this.root.getByTestId('types.list.empty');
    this.noResultsState = this.root.getByTestId('types.list.no-results');
    this.errorState = this.root.getByTestId('types.list.error');
  }

  async goto() {
    await this.page.goto('/types');  // baseURL configured in playwright.config.ts
    await expect(this.root).toBeVisible();
  }

  async waitForListState(phase: 'loading' | 'ready' | 'error' | 'aborted') {
    await waitForListLoading(this.page, 'types.list', phase);
  }

  // Modal locators (dynamic since they're not always present)
  createModal(): Locator {
    return this.page.getByTestId('types.create.modal');
  }

  editModal(): Locator {
    return this.page.getByTestId('types.edit.modal');
  }

  modal(): Locator {
    return this.page.getByRole('dialog');
  }

  // Card-specific methods
  cardByName(name: string): Locator {
    return this.cards.filter({ hasText: name });
  }

  partCountBadge(name: string): Locator {
    return this.cardByName(name).getByText(/parts$/i);
  }

  editButtonForCard(name: string): Locator {
    return this.cardByName(name).getByRole('button', { name: /edit/i });
  }

  deleteButtonForCard(name: string): Locator {
    return this.cardByName(name).getByRole('button', { name: /delete/i });
  }

  // Form elements (work in both create and edit modals)
  nameInput(): Locator {
    return this.page.getByLabel('Name')
      .or(this.page.getByTestId('types.form.name'));
  }

  submitButton(): Locator {
    return this.modal().getByRole('button', { name: /add type|update type/i })
      .or(this.page.getByTestId('types.form.submit'));
  }

  cancelButton(): Locator {
    return this.modal().getByRole('button', { name: /cancel/i })
      .or(this.page.getByTestId('types.form.cancel'));
  }

  toast(text?: string | RegExp): Locator {
    const toast = this.page.getByTestId('app-shell.toast.item').first();
    return text ? toast.filter({ hasText: text }) : toast;
  }

  // High-level actions
  async createType(name: string) {
    await this.createButton.click();
    await expect(this.createModal()).toBeVisible();
    await this.nameInput().fill(name);
    const pendingResponses = this.waitForTypesMutation('POST');
    await Promise.all([
      this.submitButton().click(),
      ...pendingResponses,
    ]);
    await expect(this.createModal()).toBeHidden({ timeout: 20000 });
    await expect(this.cardByName(name)).toBeVisible();
  }

  async editType(oldName: string, newName: string) {
    await this.editButtonForCard(oldName).click();
    await expect(this.editModal()).toBeVisible();
    await this.nameInput().clear();
    await this.nameInput().fill(newName);
    const pendingResponses = this.waitForTypesMutation('PUT');
    await Promise.all([
      this.submitButton().click(),
      ...pendingResponses,
    ]);
    await expect(this.editModal()).toBeHidden({ timeout: 20000 });
    await expect(this.cardByName(newName)).toBeVisible();
  }

  async deleteType(name: string) {
    await this.deleteButtonForCard(name).click();

    // Confirm dialog appears
    const confirmDialog = this.page.getByRole('dialog', { name: /delete type/i });
    await expect(confirmDialog).toBeVisible();

    // Click the Delete button in the confirm dialog
    const pendingResponses = this.waitForTypesMutation('DELETE');
    await Promise.all([
      confirmDialog.getByRole('button', { name: 'Delete' }).click(),
      ...pendingResponses,
    ]);
    await expect(confirmDialog).toBeHidden({ timeout: 20000 });

    // Verify deletion - card should be gone
    await expect(this.cardByName(name)).toHaveCount(0);
  }

  async search(term: string) {
    await this.searchInput.fill(term);
    // Wait for filtered results (cards update immediately)
  }

  private waitForTypesMutation(method: 'POST' | 'PUT' | 'DELETE'): Array<Promise<unknown>> {
    const mutations: Array<Promise<unknown>> = [];

    mutations.push(
      this.page.waitForResponse(
        response => response.request().method() === method && this.isTypesMutationPath(response.url()),
        { timeout: 20000 }
      )
    );

    mutations.push(
      this.page.waitForResponse(
        response => response.request().method() === 'GET' && this.isTypesListPath(response.url()),
        { timeout: 20000 }
      )
    );

    return mutations;
  }

  private isTypesMutationPath(url: string): boolean {
    try {
      const { pathname } = new URL(url);
      return /\/api\/types(?:\/[0-9]+)?$/.test(pathname);
    } catch {
      return false;
    }
  }

  private isTypesListPath(url: string): boolean {
    try {
      const { pathname } = new URL(url);
      return pathname === '/api/types';
    } catch {
      return false;
    }
  }
}
